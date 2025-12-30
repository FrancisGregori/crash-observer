/**
 * Bet365 Observer - Content Script
 *
 * Este script roda na página do Bet365 e dentro do iframe do Spribe (Aviator)
 * para capturar dados e enviar para o observer via WebSocket.
 */

(function() {
  'use strict';

  const WS_URL = 'ws://localhost:3010';
  const POLL_INTERVAL = 50; // 50ms para capturar rodadas rápidas
  const ACTIVITY_MIN_INTERVAL = 8000;  // 8 segundos
  const ACTIVITY_MAX_INTERVAL = 25000; // 25 segundos
  // Redirect só acontece após logout detectado
  const AVIATOR_URL = 'https://casino.bet365.bet.br/play/AviatorNYX';

  let ws = null;
  let isConnected = false;
  let lastHistoryFirst = null;
  let pollTimer = null;
  let clickTimer = null;
  let roundCount = 0;
  let sessionCheckInterval = null;
  let hasSyncedOnConnect = false; // Flag para evitar sincronização repetida
  let lastHeartbeatTime = Date.now(); // Para detectar standby
  let standbyCheckInterval = null;

  // Chaves para persistência
  const STORAGE_KEYS = {
    ROUND_COUNT: 'bet365_observer_round_count',
    LAST_HISTORY: 'bet365_observer_last_history',
    SESSION_START: 'bet365_observer_session_start',
    REFRESH_COUNT: 'bet365_observer_refresh_count'
  };

  // Carrega dados persistidos
  function loadPersistedData() {
    try {
      const savedCount = localStorage.getItem(STORAGE_KEYS.ROUND_COUNT);
      const savedHistory = localStorage.getItem(STORAGE_KEYS.LAST_HISTORY);
      const refreshCount = localStorage.getItem(STORAGE_KEYS.REFRESH_COUNT) || '0';

      if (savedCount) {
        roundCount = parseInt(savedCount, 10) || 0;
        console.log(`[Bet365 Extension] Rodadas carregadas do storage: ${roundCount}`);
      }

      if (savedHistory) {
        lastHistoryFirst = parseFloat(savedHistory) || null;
        console.log(`[Bet365 Extension] Último histórico carregado: ${lastHistoryFirst}x`);
      }

      console.log(`[Bet365 Extension] Refreshes desde início da sessão: ${refreshCount}`);
    } catch (e) {
      console.error('[Bet365 Extension] Erro ao carregar dados:', e);
    }
  }

  // Salva dados para persistência
  function savePersistedData() {
    try {
      localStorage.setItem(STORAGE_KEYS.ROUND_COUNT, roundCount.toString());
      if (lastHistoryFirst !== null) {
        localStorage.setItem(STORAGE_KEYS.LAST_HISTORY, lastHistoryFirst.toString());
      }
    } catch (e) {
      console.error('[Bet365 Extension] Erro ao salvar dados:', e);
    }
  }

  // Incrementa contador de refreshes
  function incrementRefreshCount() {
    try {
      const current = parseInt(localStorage.getItem(STORAGE_KEYS.REFRESH_COUNT) || '0', 10);
      localStorage.setItem(STORAGE_KEYS.REFRESH_COUNT, (current + 1).toString());
    } catch (e) {
      console.error('[Bet365 Extension] Erro ao incrementar refresh:', e);
    }
  }

  // Reseta sessão (para começar nova contagem)
  function resetSession() {
    try {
      localStorage.removeItem(STORAGE_KEYS.ROUND_COUNT);
      localStorage.removeItem(STORAGE_KEYS.LAST_HISTORY);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_COUNT);
      localStorage.setItem(STORAGE_KEYS.SESSION_START, Date.now().toString());
      roundCount = 0;
      lastHistoryFirst = null;
      console.log('[Bet365 Extension] Sessão resetada');
    } catch (e) {
      console.error('[Bet365 Extension] Erro ao resetar sessão:', e);
    }
  }

  // ========== KEEP-ALIVE COM ÁUDIO SILENCIOSO ==========

  let keepAliveAudioContext = null;
  let keepAliveOscillator = null;

  /**
   * Inicia áudio silencioso para evitar throttling do browser
   * Isso mantém a aba "ativa" mesmo com monitores desligados
   */
  function startAudioKeepAlive() {
    if (keepAliveAudioContext) return; // Já está rodando

    try {
      // Usa o AudioContext original (antes de qualquer patch)
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      keepAliveAudioContext = new AudioContextClass();

      // Cria um oscilador silencioso
      keepAliveOscillator = keepAliveAudioContext.createOscillator();
      const gainNode = keepAliveAudioContext.createGain();

      // Gain em 0 = completamente silencioso
      gainNode.gain.value = 0;

      // Frequência muito baixa (inaudível)
      keepAliveOscillator.frequency.value = 1;
      keepAliveOscillator.type = 'sine';

      keepAliveOscillator.connect(gainNode);
      gainNode.connect(keepAliveAudioContext.destination);

      keepAliveOscillator.start();

      console.log('[Bet365 Extension] ✓ Audio keep-alive iniciado (anti-throttling)');

      // Tenta resumir o AudioContext se estiver suspenso
      if (keepAliveAudioContext.state === 'suspended') {
        keepAliveAudioContext.resume().then(() => {
          console.log('[Bet365 Extension] AudioContext resumido');
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[Bet365 Extension] Erro ao iniciar audio keep-alive:', e);
    }
  }

  /**
   * Tenta resumir o AudioContext (chamar após interação do usuário)
   */
  function resumeAudioKeepAlive() {
    if (keepAliveAudioContext && keepAliveAudioContext.state === 'suspended') {
      keepAliveAudioContext.resume().then(() => {
        console.log('[Bet365 Extension] ✓ AudioContext ativo (anti-throttling funcionando)');
      }).catch(() => {});
    }
  }

  // Tenta resumir o AudioContext em qualquer interação do usuário
  ['click', 'touchstart', 'keydown', 'mousedown'].forEach(event => {
    document.addEventListener(event, resumeAudioKeepAlive, { once: false, passive: true });
  });

  // Também tenta resumir periodicamente (caso a interação já tenha ocorrido)
  setInterval(() => {
    resumeAudioKeepAlive();
  }, 5000);

  /**
   * Para o áudio keep-alive
   */
  function stopAudioKeepAlive() {
    try {
      if (keepAliveOscillator) {
        keepAliveOscillator.stop();
        keepAliveOscillator = null;
      }
      if (keepAliveAudioContext) {
        keepAliveAudioContext.close();
        keepAliveAudioContext = null;
      }
    } catch (e) {}
  }

  // ========== FECHAR MODAIS E SILENCIAR ÁUDIO ==========

  function closeRulesModal() {
    // Fecha modal de regras do jogo que aparece após reload
    const rulesModal = document.querySelector('ngb-modal-window');
    if (rulesModal) {
      const closeButton = rulesModal.querySelector('.close, button[aria-label="Close"]');
      if (closeButton) {
        console.log('[Bet365 Extension] Fechando modal de regras...');
        closeButton.click();
        return true;
      }
    }
    return false;
  }

  function muteGameAudio() {
    // Silencia todos os elementos de áudio e vídeo
    const mediaElements = document.querySelectorAll('audio, video');
    mediaElements.forEach(el => {
      if (!el.muted) {
        el.muted = true;
        el.volume = 0;
        console.log('[Bet365 Extension] Elemento de mídia silenciado');
      }
    });

    // Também tenta encontrar e silenciar via AudioContext
    // Sobrescreve AudioContext para sempre iniciar silenciado
    if (!window._audioContextPatched) {
      window._audioContextPatched = true;

      const originalAudioContext = window.AudioContext || window.webkitAudioContext;
      if (originalAudioContext) {
        window.AudioContext = window.webkitAudioContext = function(...args) {
          const ctx = new originalAudioContext(...args);
          // Cria um gain node que silencia o áudio
          const gainNode = ctx.createGain();
          gainNode.gain.value = 0;

          // Sobrescreve o destination para passar pelo gain node
          const originalDestination = ctx.destination;
          const originalConnect = AudioNode.prototype.connect;

          AudioNode.prototype.connect = function(dest, ...rest) {
            if (dest === originalDestination) {
              originalConnect.call(this, gainNode, ...rest);
              originalConnect.call(gainNode, originalDestination);
              return gainNode;
            }
            return originalConnect.call(this, dest, ...rest);
          };

          console.log('[Bet365 Extension] AudioContext silenciado');
          return ctx;
        };
      }
    }
  }

  function startModalAndAudioCheck() {
    // Verifica modal e áudio a cada 2 segundos nos primeiros 30 segundos
    let checkCount = 0;
    const maxChecks = 15; // 15 * 2s = 30s

    const interval = setInterval(() => {
      checkCount++;

      // Tenta fechar modal
      closeRulesModal();

      // Silencia áudio
      muteGameAudio();

      if (checkCount >= maxChecks) {
        clearInterval(interval);
      }
    }, 2000);

    // Também executa imediatamente
    setTimeout(() => {
      closeRulesModal();
      muteGameAudio();
    }, 1000);
  }

  // ========== DETECÇÃO DE LOGOUT E AUTO-RECOVERY ==========

  let logoutHandled = false; // Evita múltiplos refreshes por logout

  function checkForLogoutModal() {
    // Evita processar logout múltiplas vezes
    if (logoutHandled) return false;

    // Verifica modal de logout por inatividade - busca modal específico
    const logoutModal = document.querySelector('[data-modal-name="LoggedOutModal"]');

    // Verifica texto específico dentro de modais (não no body inteiro)
    let logoutText = false;
    let networkTimeout = false;
    const modals = document.querySelectorAll('.modal, .modal-dialog, [role="dialog"], ngb-modal-window');
    for (const modal of modals) {
      const text = modal.textContent || '';
      // Verifica logout
      if (text.includes('logged out due to inactivity') ||
          text.includes('desconectado por inatividade') ||
          text.includes('sessão expirada') ||
          text.includes('session expired')) {
        logoutText = true;
        break;
      }
      // Verifica timeout de rede (aparece antes do logout)
      if (text.includes('Tempo limite da rede') ||
          text.includes('Network timeout') ||
          text.includes('Verifique sua conexão') ||
          text.includes('Check your connection') ||
          text.includes('tente novamente após o jogo recarregar') ||
          text.includes('try again after the game reloads')) {
        networkTimeout = true;
        break;
      }
    }

    if (logoutModal || logoutText || networkTimeout) {
      const reason = networkTimeout ? 'Timeout de rede' : 'Logout por inatividade';
      logoutHandled = true; // Marca como já processado
      console.log(`[Bet365 Extension] ⚠️ DETECTADO: ${reason}!`);
      console.log(`[Bet365 Extension] Sincronizando histórico antes do redirect...`);

      // Tenta sincronizar histórico antes de redirect (força)
      syncFullHistory(true);

      // Salva dados antes de redirect
      savePersistedData();
      incrementRefreshCount();

      // Mostra notificação
      showNotification(`${reason} - Redirecionando para o jogo...`, 'warning');

      // Aguarda um pouco para sincronização completar e redireciona
      setTimeout(() => {
        console.log('[Bet365 Extension] Redirecionando para Aviator...');
        // Redireciona para o jogo
        if (window.self === window.top) {
          window.location.href = AVIATOR_URL;
        } else {
          try {
            window.top.location.href = AVIATOR_URL;
          } catch (e) {
            window.location.reload();
          }
        }
      }, 2500);

      return true;
    }

    return false;
  }

  function checkForLoginForm() {
    // Verifica se apareceu o formulário de login
    const loginForm = document.querySelector('.login-modal-component__form');
    const loginButton = document.querySelector('.login-modal-component__login-button');

    if (loginForm && loginButton) {
      console.log('[Bet365 Extension] ⚠️ DETECTADO: Formulário de login!');

      // Verifica se já tem credenciais preenchidas (auto-complete do navegador)
      const usernameField = document.querySelector('#txtUsername');
      const passwordField = document.querySelector('#txtPassword');

      // Marca "Mantenha-me conectado" se existir
      const keepLoggedCheckbox = document.querySelector('#kml-checkbox');
      if (keepLoggedCheckbox && !keepLoggedCheckbox.checked) {
        keepLoggedCheckbox.click();
        console.log('[Bet365 Extension] Marcado "Mantenha-me conectado"');
      }

      // Se os campos já estiverem preenchidos, clica em login
      if (usernameField && passwordField) {
        // Aguarda um pouco para autocomplete do navegador
        setTimeout(() => {
          if (usernameField.value && passwordField.value) {
            console.log('[Bet365 Extension] Credenciais detectadas, clicando em Login...');
            showNotification('Fazendo login automático...', 'info');
            loginButton.click();
          } else {
            console.log('[Bet365 Extension] Aguardando preenchimento de credenciais...');
            showNotification('Preencha suas credenciais', 'warning');
          }
        }, 1000);
      }

      return true;
    }

    return false;
  }

  function startSessionCheck() {
    if (sessionCheckInterval) return;

    console.log('[Bet365 Extension] Iniciando verificação de sessão (10s)...');

    sessionCheckInterval = setInterval(() => {
      // Primeiro verifica logout
      if (checkForLogoutModal()) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
        return;
      }

      // Depois verifica login
      checkForLoginForm();
    }, 10000); // A cada 10 segundos
  }

  function stopSessionCheck() {
    if (sessionCheckInterval) {
      clearInterval(sessionCheckInterval);
      sessionCheckInterval = null;
    }
  }

  // ========== DETECÇÃO DE STANDBY E RECUPERAÇÃO ==========

  const STANDBY_THRESHOLD = 30000; // 30 segundos de gap = standby detectado
  const STANDBY_LONG_THRESHOLD = 300000; // 5 minutos = standby longo, recarrega página

  /**
   * Verifica se o computador voltou do standby
   * Detecta gaps de tempo entre heartbeats
   */
  function checkStandby() {
    const now = Date.now();
    const elapsed = now - lastHeartbeatTime;

    if (elapsed > STANDBY_THRESHOLD) {
      console.log(`[Bet365 Extension] ⚠️ STANDBY DETECTADO (${Math.round(elapsed / 1000)}s de pausa)`);
      handleWakeFromStandby(elapsed);
    }

    lastHeartbeatTime = now;
  }

  /**
   * Recupera após o computador voltar do standby
   */
  function handleWakeFromStandby(elapsedTime) {
    console.log('[Bet365 Extension] Recuperando do standby...');
    showNotification('Recuperando do standby...', 'info');

    // Reset da flag de logout para poder detectar novamente
    logoutHandled = false;

    // Verifica logout modal imediatamente
    if (checkForLogoutModal()) {
      console.log('[Bet365 Extension] Logout detectado após standby');
      return; // Vai redirecionar
    }

    // Verifica formulário de login
    if (checkForLoginForm()) {
      console.log('[Bet365 Extension] Login form detectado após standby');
      return;
    }

    // Se ficou muito tempo em standby, recarrega a página para garantir estado fresco
    if (elapsedTime > STANDBY_LONG_THRESHOLD) {
      console.log('[Bet365 Extension] Standby muito longo, recarregando página...');
      showNotification('Recarregando após standby longo...', 'warning');

      // Sincroniza antes de recarregar
      syncFullHistory(true);
      savePersistedData();

      setTimeout(() => {
        window.location.reload();
      }, 2000);
      return;
    }

    // Reconecta WebSocket se necessário
    if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[Bet365 Extension] Reconectando WebSocket após standby...');
      connect();
    }

    // Sincroniza histórico para recuperar rodadas perdidas
    hasSyncedOnConnect = false; // Reset para permitir nova sincronização
    setTimeout(() => {
      syncFullHistory(true);
    }, 1000);

    console.log('[Bet365 Extension] Recuperação do standby concluída');
    showNotification('Recuperado do standby!', 'success');
  }

  /**
   * Inicia verificação de standby
   */
  function startStandbyCheck() {
    if (standbyCheckInterval) return;

    lastHeartbeatTime = Date.now();
    console.log('[Bet365 Extension] Iniciando detecção de standby...');

    // Verifica a cada 5 segundos
    standbyCheckInterval = setInterval(checkStandby, 5000);
  }

  /**
   * Para verificação de standby
   */
  function stopStandbyCheck() {
    if (standbyCheckInterval) {
      clearInterval(standbyCheckInterval);
      standbyCheckInterval = null;
    }
  }

  // Também detecta quando a aba volta a ficar visível (sem log para evitar spam)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      const elapsed = now - lastHeartbeatTime;
      if (elapsed > STANDBY_THRESHOLD) {
        console.log('[Bet365 Extension] Aba visível após pausa longa');
        handleWakeFromStandby(elapsed);
      }
      lastHeartbeatTime = now;
    }
  });

  // Detecta quando a janela recupera o foco (sem log para evitar spam)
  window.addEventListener('focus', () => {
    const now = Date.now();
    const elapsed = now - lastHeartbeatTime;
    if (elapsed > STANDBY_THRESHOLD) {
      console.log('[Bet365 Extension] Janela recuperou foco após pausa longa');
      handleWakeFromStandby(elapsed);
    }
    lastHeartbeatTime = now;
  });

  // Detecta se estamos dentro do iframe do jogo
  function isInsideGameIframe() {
    // Verifica se estamos em um iframe
    const isIframe = window.self !== window.top;

    // Verifica se a URL é do Spribe ou se temos elementos do jogo
    const isSpribe = window.location.href.includes('spribe') ||
                     window.location.href.includes('aviator');

    // Verifica se temos os elementos do jogo
    const hasGameElements = document.querySelector('.payouts-block') ||
                            document.querySelector('.bet-controls') ||
                            document.querySelector('.game-play');

    console.log('[Bet365 Extension] Checando ambiente:', {
      isIframe,
      isSpribe,
      hasGameElements: !!hasGameElements,
      url: window.location.href.substring(0, 100)
    });

    return hasGameElements || isSpribe;
  }

  // Funções de parse
  function parseMultiplier(str) {
    if (!str) return 0;
    const cleaned = String(str).replace(/x/gi, '').replace(',', '.').trim();
    const match = cleaned.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }

  function parseNumber(str) {
    if (!str) return 0;
    const cleaned = String(str).replace(/[^\d.,]/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  }

  // Conecta ao WebSocket do observer
  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    console.log('[Bet365 Extension] Conectando ao observer...');

    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        isConnected = true;
        console.log('[Bet365 Extension] Conectado ao observer!');
        showNotification('Conectado ao Observer', 'success');
        startPolling();
        startActivitySimulation();

        // Sincroniza histórico completo após conectar (aguarda dados carregarem)
        setTimeout(() => {
          syncFullHistory();
        }, 3000);
      };

      ws.onclose = () => {
        isConnected = false;
        hasSyncedOnConnect = false; // Reset para sincronizar novamente ao reconectar
        console.log('[Bet365 Extension] Desconectado do observer');
        showNotification('Desconectado do Observer', 'warning');
        stopPolling();
        stopActivitySimulation();
        // Reconecta após 5 segundos
        setTimeout(connect, 5000);
      };

      ws.onerror = (err) => {
        console.error('[Bet365 Extension] Erro WebSocket:', err);
      };

      ws.onmessage = (event) => {
        console.log('[Bet365 Extension] Mensagem:', event.data);
      };

    } catch (err) {
      console.error('[Bet365 Extension] Erro ao conectar:', err);
      setTimeout(connect, 5000);
    }
  }

  // Coleta dados do jogo
  function collectData() {
    const data = {
      type: 'bet365_round',
      platform: 'bet365',
      timestamp: new Date().toISOString(),
      history: [],
      betCount: 0,
      totalWin: 0
    };

    // Coleta histórico de payouts - tenta vários seletores
    const payoutsSelectors = [
      '.payouts-block',
      '.payouts',
      '[class*="payouts"]',
      '[class*="history"]',
      '.bubble-multiplier',
      '[class*="multiplier"]'
    ];

    let payoutsBlock = null;
    for (const selector of payoutsSelectors) {
      payoutsBlock = document.querySelector(selector);
      if (payoutsBlock) {
        break;
      }
    }

    if (payoutsBlock) {
      // Tenta diferentes seletores para os itens
      let items = payoutsBlock.querySelectorAll('.payout, [class*="payout"], [class*="bubble"]');
      if (items.length === 0) {
        // Usa children direto se não encontrou por classe
        items = payoutsBlock.children;
      }

      for (let i = 0; i < Math.min(items.length, 20); i++) {
        const text = items[i].textContent;
        const mult = parseMultiplier(text);
        if (mult >= 1.0) {
          data.history.push(mult);
        }
      }

      // Se ainda não encontrou, tenta extrair do texto completo do bloco
      if (data.history.length === 0) {
        const fullText = payoutsBlock.textContent;
        const matches = fullText.match(/[\d.,]+x/gi);
        if (matches) {
          for (let i = 0; i < Math.min(matches.length, 20); i++) {
            const mult = parseMultiplier(matches[i]);
            if (mult >= 1.0) {
              data.history.push(mult);
            }
          }
        }
      }
    }

    // Se não encontrou pelo bloco, tenta buscar elementos individuais
    if (data.history.length === 0) {
      const bubbles = document.querySelectorAll('[class*="bubble"], [class*="payout-item"]');
      bubbles.forEach((el, i) => {
        if (i < 20) {
          const mult = parseMultiplier(el.textContent);
          if (mult >= 1.0) {
            data.history.push(mult);
          }
        }
      });
    }

    // Coleta número de apostadores - tenta múltiplos seletores
    // Aviator mostra formato "X/Y" onde X = cashouts e Y = total bets
    const betsCountEl = document.querySelector('.bets-count');
    if (betsCountEl) {
      const text = betsCountEl.textContent.trim();
      // Formato esperado: "2525/3699" - queremos o segundo número (total de apostas)
      if (text.includes('/')) {
        const parts = text.split('/');
        if (parts.length === 2) {
          const totalBets = parseNumber(parts[1]);
          if (totalBets > 0) {
            data.betCount = Math.round(totalBets);
          }
        }
      } else {
        // Fallback: número simples
        const num = parseNumber(text);
        if (num > 0) {
          data.betCount = Math.round(num);
        }
      }
    }

    // Fallback: tenta outros seletores se .bets-count não funcionou
    if (data.betCount === 0) {
      const betsSelectors = [
        '.bets',
        '[class*="bets"]',
        '[class*="players-count"]',
        '.all-bets-count',
        '.bet-count',
        '.total-bets span',
        '[class*="all-bets"] span'
      ];

      for (const selector of betsSelectors) {
        try {
          const betsEl = document.querySelector(selector);
          if (betsEl) {
            const text = betsEl.textContent.trim();
            const num = parseNumber(text);
            if (num > 0) {
              data.betCount = Math.round(num);
              break;
            }
          }
        } catch (e) {}
      }
    }

    // Alternativa: conta as linhas de apostas ativas
    if (data.betCount === 0) {
      const betRows = document.querySelectorAll('.bet-row, [class*="bet-item"], .bets-table tr, [class*="bets-list"] > *');
      if (betRows.length > 0) {
        data.betCount = betRows.length;
      }
    }

    // Coleta total de ganhos/cashout - prioriza .cashout-value
    const cashoutValueEl = document.querySelector('.cashout-value');
    if (cashoutValueEl) {
      const num = parseNumber(cashoutValueEl.textContent);
      if (num > 0) {
        data.totalWin = num;
      }
    }

    // Fallback: tenta outros seletores se .cashout-value não funcionou
    if (data.totalWin === 0) {
      const winSelectors = [
        '.total-wins',
        '.wins-value',
        '[class*="cashout"]',
        '[class*="total-win"]',
        '[class*="wins"]',
        '.payout-total'
      ];

      for (const selector of winSelectors) {
        try {
          const cashoutEl = document.querySelector(selector);
          if (cashoutEl) {
            const num = parseNumber(cashoutEl.textContent);
            if (num > 0) {
              data.totalWin = num;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // Alternativa: soma os valores de cashout individuais
    if (data.totalWin === 0) {
      const cashoutItems = document.querySelectorAll('.win-amount, [class*="won"] .amount, [class*="cashed-out"] .amount');
      let total = 0;
      cashoutItems.forEach(el => {
        total += parseNumber(el.textContent);
      });
      if (total > 0) {
        data.totalWin = total;
      }
    }

    return data;
  }

  // Envia dados para o observer
  function sendData(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // ========== SINCRONIZAÇÃO DE HISTÓRICO COMPLETO ==========

  /**
   * Coleta TODOS os multiplicadores visíveis no histórico
   * (não limitado a 20 como na coleta normal)
   */
  function collectFullHistory() {
    const history = [];

    // Tenta vários seletores para encontrar o bloco de payouts
    const payoutsSelectors = [
      '.payouts-block',
      '.payouts',
      '[class*="payouts"]'
    ];

    let payoutsBlock = null;
    for (const selector of payoutsSelectors) {
      payoutsBlock = document.querySelector(selector);
      if (payoutsBlock) break;
    }

    if (payoutsBlock) {
      // Coleta todos os itens (sem limite)
      let items = payoutsBlock.querySelectorAll('.payout, [class*="payout"], [class*="bubble"]');
      if (items.length === 0) {
        items = payoutsBlock.children;
      }

      for (let i = 0; i < items.length; i++) {
        const text = items[i].textContent;
        const mult = parseMultiplier(text);
        if (mult >= 1.0) {
          history.push(mult);
        }
      }

      // Se não encontrou, tenta extrair do texto
      if (history.length === 0) {
        const fullText = payoutsBlock.textContent;
        const matches = fullText.match(/[\d.,]+x/gi);
        if (matches) {
          for (const match of matches) {
            const mult = parseMultiplier(match);
            if (mult >= 1.0) {
              history.push(mult);
            }
          }
        }
      }
    }

    return history;
  }

  /**
   * Envia histórico completo para sincronização
   * @param {boolean} force - Força sincronização mesmo se já sincronizou
   */
  function syncFullHistory(force = false) {
    // Evita sincronização repetida (apenas na conexão inicial)
    if (!force && hasSyncedOnConnect) {
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[Bet365 Extension] Não conectado, sincronização adiada');
      return;
    }

    const history = collectFullHistory();

    if (history.length === 0) {
      console.log('[Bet365 Extension] Nenhum histórico para sincronizar');
      return;
    }

    console.log(`[Bet365 Extension] Enviando ${history.length} multiplicadores para sincronização`);

    ws.send(JSON.stringify({
      type: 'bet365_history_sync',
      platform: 'bet365',
      history: history,
      timestamp: new Date().toISOString()
    }));

    hasSyncedOnConnect = true;
    showNotification(`Sincronizando ${history.length} rodadas...`, 'info');
  }

  // Polling para detectar novas rodadas
  let pollCount = 0;
  function poll() {
    const data = collectData();
    pollCount++;

    // Log a cada 100 polls (~5s) para debug
    if (pollCount % 100 === 0) {
      console.log(`[Bet365 Extension] Poll #${pollCount}, histórico: ${data.history.length} items`,
        data.history.length > 0 ? data.history.slice(0, 5) : 'vazio');
    }

    if (data.history.length > 0) {
      const firstHist = data.history[0];

      if (lastHistoryFirst === null) {
        lastHistoryFirst = firstHist;
        console.log('[Bet365 Extension] Histórico inicial:', firstHist + 'x', '| Total:', data.history.length);
      } else if (Math.abs(firstHist - lastHistoryFirst) > 0.01) {
        // Nova rodada detectada!
        console.log('[Bet365 Extension] Nova rodada:', firstHist + 'x');

        data.multiplier = firstHist;
        data.isNewRound = true;
        sendData(data);

        lastHistoryFirst = firstHist;
        roundCount++;

        // Salva dados persistidos (localStorage)
        savePersistedData();

        // Salva stats no storage para o popup
        if (typeof browser !== 'undefined' && browser.storage) {
          browser.storage.local.set({
            roundCount: roundCount,
            lastRound: firstHist
          });
        }

        // Mostra notificação
        if (firstHist <= 1.05) {
          showNotification(`CRASH 1x! (${firstHist.toFixed(2)}x)`, 'danger');
        } else if (firstHist >= 10) {
          showNotification(`${firstHist.toFixed(2)}x`, 'success');
        }
      }
    }
  }

  function startPolling() {
    if (pollTimer) return;
    console.log('[Bet365 Extension] Iniciando polling (50ms)...');
    pollTimer = setInterval(poll, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ========== SIMULAÇÃO DE ATIVIDADE PARA MANTER SESSÃO ATIVA ==========

  let lastMouseX = 0;
  let lastMouseY = 0;
  let activityCount = 0;

  // Tipos de atividade para simular comportamento humano
  // Scroll aparece mais vezes para interagir com a lista de apostas
  const ACTIVITY_TYPES = ['mouse_move', 'scroll', 'mouse_move', 'scroll', 'click', 'scroll'];

  function getRandomTarget() {
    const safeTargets = [
      '.game-play',
      '.game-container',
      '.game-area',
      '[class*="game-wrapper"]',
      'canvas',
      '.payouts-block',
      '.app',
      'body'
    ];

    for (const selector of safeTargets) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return document.body;
  }

  function getRandomPosition(element) {
    const rect = element.getBoundingClientRect();
    // Posição aleatória dentro de 60% central do elemento
    const marginX = rect.width * 0.2;
    const marginY = rect.height * 0.2;
    return {
      x: rect.left + marginX + Math.random() * (rect.width - 2 * marginX),
      y: rect.top + marginY + Math.random() * (rect.height - 2 * marginY)
    };
  }

  function simulateMouseMove(target) {
    const pos = getRandomPosition(target);

    // Movimento gradual (mais realista)
    const steps = 3 + Math.floor(Math.random() * 3);
    const dx = (pos.x - lastMouseX) / steps;
    const dy = (pos.y - lastMouseY) / steps;

    for (let i = 0; i <= steps; i++) {
      const currentX = lastMouseX + dx * i;
      const currentY = lastMouseY + dy * i;

      setTimeout(() => {
        const moveEvent = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: currentX,
          clientY: currentY
        });
        target.dispatchEvent(moveEvent);
      }, i * 30);
    }

    lastMouseX = pos.x;
    lastMouseY = pos.y;
  }

  function simulateScroll() {
    // Primeiro tenta scroll no elemento virtual scroll (lista de apostas)
    const virtualScroll = document.querySelector('.cdk-virtual-scroll-content-wrapper');
    if (virtualScroll) {
      const parent = virtualScroll.parentElement;
      if (parent) {
        const currentScroll = parent.scrollTop;
        const maxScroll = parent.scrollHeight - parent.clientHeight;

        // Scroll aleatório: às vezes sobe, às vezes desce
        let scrollAmount;
        if (currentScroll <= 10) {
          // Está no topo, desce
          scrollAmount = 30 + Math.random() * 70;
        } else if (currentScroll >= maxScroll - 10) {
          // Está no fim, sobe
          scrollAmount = -(30 + Math.random() * 70);
        } else {
          // No meio, direção aleatória
          scrollAmount = (Math.random() - 0.5) * 100;
        }

        parent.scrollBy({
          top: scrollAmount,
          behavior: 'smooth'
        });

        // Dispara evento de scroll no elemento
        const scrollEvent = new Event('scroll', { bubbles: true });
        parent.dispatchEvent(scrollEvent);
        return;
      }
    }

    // Fallback: scroll na janela
    const scrollAmount = (Math.random() - 0.5) * 50;
    window.scrollBy({
      top: scrollAmount,
      behavior: 'smooth'
    });

    const scrollEvent = new Event('scroll', { bubbles: true });
    document.dispatchEvent(scrollEvent);
  }

  function simulateClick(target) {
    const pos = getRandomPosition(target);

    // Sequência: mousedown -> mouseup -> click (mais realista)
    const mousedownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: pos.x,
      clientY: pos.y,
      button: 0
    });

    const mouseupEvent = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: pos.x,
      clientY: pos.y,
      button: 0
    });

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: pos.x,
      clientY: pos.y,
      button: 0
    });

    target.dispatchEvent(mousedownEvent);
    setTimeout(() => {
      target.dispatchEvent(mouseupEvent);
      target.dispatchEvent(clickEvent);
    }, 50 + Math.random() * 100);

    lastMouseX = pos.x;
    lastMouseY = pos.y;
  }

  function simulateKeyPress() {
    // Simula tecla que não faz nada (Shift sozinho)
    const keydownEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Shift',
      code: 'ShiftLeft',
      keyCode: 16,
      which: 16
    });

    const keyupEvent = new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'Shift',
      code: 'ShiftLeft',
      keyCode: 16,
      which: 16
    });

    document.dispatchEvent(keydownEvent);
    setTimeout(() => document.dispatchEvent(keyupEvent), 50 + Math.random() * 50);
  }

  function simulateFocus() {
    // Tenta focar na janela/documento
    window.focus();

    // Dispara eventos de foco
    const focusEvent = new FocusEvent('focus', { bubbles: false });
    window.dispatchEvent(focusEvent);

    // Também tenta no documento
    if (document.hasFocus && !document.hasFocus()) {
      const docFocusEvent = new FocusEvent('focusin', { bubbles: true });
      document.dispatchEvent(docFocusEvent);
    }
  }

  function performActivity() {
    activityCount++;
    const target = getRandomTarget();

    // Escolhe tipo de atividade (variado para parecer humano)
    const activityIndex = activityCount % ACTIVITY_TYPES.length;
    const activityType = ACTIVITY_TYPES[activityIndex];

    // Adiciona variação extra
    const extraAction = Math.random();

    switch (activityType) {
      case 'mouse_move':
        simulateMouseMove(target);
        if (extraAction < 0.3) simulateKeyPress();
        break;

      case 'scroll':
        simulateScroll();
        if (extraAction < 0.5) simulateMouseMove(target);
        break;

      case 'click':
        simulateMouseMove(target);
        setTimeout(() => simulateClick(target), 100 + Math.random() * 200);
        break;

      default:
        simulateMouseMove(target);
    }

    // Sempre faz focus check
    if (activityCount % 3 === 0) {
      simulateFocus();
    }

    // Log a cada 20 atividades (reduzido para menos spam)
    if (activityCount % 20 === 0) {
      console.log(`[Bet365 Extension] Atividade #${activityCount} - sessão ativa`);
    }

    // Agenda próxima atividade
    scheduleNextActivity();
  }

  function scheduleNextActivity() {
    const interval = ACTIVITY_MIN_INTERVAL + Math.random() * (ACTIVITY_MAX_INTERVAL - ACTIVITY_MIN_INTERVAL);
    clickTimer = setTimeout(performActivity, interval);
  }

  function startActivitySimulation() {
    if (clickTimer) return;
    console.log('[Bet365 Extension] Iniciando simulação de atividade (8-25s)...');

    // Inicializa posição do mouse
    lastMouseX = window.innerWidth / 2;
    lastMouseY = window.innerHeight / 2;

    // Primeira atividade após delay inicial
    clickTimer = setTimeout(performActivity, 3000);
  }

  function stopActivitySimulation() {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
  }

  // ========== PROTEÇÃO CONTRA DETECÇÃO DE ABA INATIVA ==========

  // Sobrescreve a API de visibilidade para sempre parecer ativo
  function setupVisibilityProtection() {
    // Previne detecção de aba oculta
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true
    });

    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true
    });

    // Intercepta eventos de visibilidade
    const originalAddEventListener = document.addEventListener.bind(document);
    document.addEventListener = function(type, listener, options) {
      if (type === 'visibilitychange') {
        console.log('[Bet365 Extension] Bloqueando listener de visibilitychange');
        return; // Não adiciona o listener
      }
      return originalAddEventListener(type, listener, options);
    };

    // Também para o window (com try-catch para evitar erros cross-origin)
    const originalWindowAddEventListener = window.addEventListener.bind(window);
    window.addEventListener = function(type, listener, options) {
      try {
        if (type === 'blur' || type === 'focus') {
          // Permite mas não propaga eventos reais de blur
          const wrappedListener = function(event) {
            try {
              if (type === 'blur') {
                // Dispara focus logo depois para "cancelar" o blur
                setTimeout(() => {
                  window.dispatchEvent(new FocusEvent('focus'));
                }, 100);
              }
              return listener.call(this, event);
            } catch (e) {
              // Ignora erros cross-origin
            }
          };
          return originalWindowAddEventListener(type, wrappedListener, options);
        }
        return originalWindowAddEventListener(type, listener, options);
      } catch (e) {
        // Fallback: usa o original
        return originalWindowAddEventListener(type, listener, options);
      }
    };

    console.log('[Bet365 Extension] Proteção de visibilidade ativada');
  }

  // Heartbeat mais agressivo quando a aba está em segundo plano
  let heartbeatInterval = null;

  let heartbeatCount = 0;

  function startHeartbeat() {
    if (heartbeatInterval) return;

    heartbeatInterval = setInterval(() => {
      heartbeatCount++;

      // Força eventos de atividade periodicamente
      simulateFocus();

      // Dispara um pequeno movimento de mouse
      const target = getRandomTarget();
      if (target) {
        const rect = target.getBoundingClientRect();
        const moveEvent = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.left + rect.width / 2 + (Math.random() - 0.5) * 10,
          clientY: rect.top + rect.height / 2 + (Math.random() - 0.5) * 10
        });
        target.dispatchEvent(moveEvent);
      }

      // A cada 3 heartbeats (15 segundos), faz scroll na lista de apostas
      if (heartbeatCount % 3 === 0) {
        const virtualScroll = document.querySelector('.cdk-virtual-scroll-content-wrapper');
        if (virtualScroll && virtualScroll.parentElement) {
          const parent = virtualScroll.parentElement;
          const scrollAmount = (Math.random() - 0.5) * 80;
          parent.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        }
      }
    }, 5000); // A cada 5 segundos

    console.log('[Bet365 Extension] Heartbeat iniciado (5s) + scroll lista (15s)');
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  // Mostra notificação na página
  function showNotification(message, type = 'info') {
    // Remove notificação anterior
    const existing = document.getElementById('bet365-observer-notification');
    if (existing) existing.remove();

    const colors = {
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#3b82f6'
    };

    const div = document.createElement('div');
    div.id = 'bet365-observer-notification';
    div.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${colors[type] || colors.info};
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
    `;
    div.textContent = message;

    // Adiciona animação
    if (!document.getElementById('bet365-observer-style')) {
      const style = document.createElement('style');
      style.id = 'bet365-observer-style';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(div);

    // Remove após 3 segundos
    setTimeout(() => div.remove(), 3000);
  }

  // Indicador de status
  function createStatusIndicator() {
    // Evita duplicar
    if (document.getElementById('bet365-observer-status')) return;

    const div = document.createElement('div');
    div.id = 'bet365-observer-status';
    div.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: system-ui, sans-serif;
      font-size: 12px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const dot = document.createElement('span');
    dot.id = 'bet365-observer-dot';
    dot.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
    `;

    const text = document.createElement('span');
    text.id = 'bet365-observer-text';
    text.textContent = 'Observer: Desconectado';

    div.appendChild(dot);
    div.appendChild(text);
    document.body.appendChild(div);

    // Atualiza status periodicamente
    setInterval(() => {
      const dot = document.getElementById('bet365-observer-dot');
      const text = document.getElementById('bet365-observer-text');
      if (dot && text) {
        const refreshCount = localStorage.getItem(STORAGE_KEYS.REFRESH_COUNT) || '0';
        if (isConnected) {
          dot.style.background = '#22c55e';
          const refreshInfo = parseInt(refreshCount) > 0 ? ` (${refreshCount} reconexões)` : '';
          text.textContent = `Observer: ${roundCount} rodadas${refreshInfo}`;
        } else {
          dot.style.background = '#ef4444';
          text.textContent = 'Observer: Desconectado';
        }
      }
    }, 1000);
  }

  // Debug: mostra elementos encontrados
  function debugElements() {
    console.log('[Bet365 Extension] === DEBUG ELEMENTOS ===');
    console.log('URL:', window.location.href);
    console.log('Is iframe:', window.self !== window.top);

    const selectors = [
      '.payouts-block',
      '.payouts',
      '[class*="payouts"]',
      '[class*="history"]',
      '.bubble-multiplier',
      '[class*="multiplier"]',
      '[class*="bubble"]',
      '.bets',
      '.bets-count',
      '[class*="bets"]',
      '[class*="players"]',
      '.all-bets',
      '.cashout-value',
      '[class*="cashout"]',
      '[class*="wins"]',
      '.game-play',
      'canvas'
    ];

    selectors.forEach(sel => {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        console.log(`  ${sel}: ${els.length} elementos`);
        els.forEach((el, i) => {
          if (i < 3) {
            console.log(`    [${i}] classes: ${el.className}, text: ${el.textContent?.substring(0, 80)}`);
          }
        });
      }
    });
    console.log('[Bet365 Extension] === FIM DEBUG ===');
  }

  // Debug detalhado - pode ser chamado do console: window.debugBet365Data()
  function debugBet365Data() {
    console.log('[Bet365 Extension] === DEBUG COMPLETO ===');

    // Coleta dados atuais
    const data = collectData();
    console.log('Dados coletados:', data);

    // Histórico completo
    const fullHistory = collectFullHistory();
    console.log('Histórico completo:', fullHistory.length, 'items');
    console.log('Primeiros 10:', fullHistory.slice(0, 10));

    // Debug específico dos seletores principais
    console.log('\n--- Seletores principais ---');

    const betsCountEl = document.querySelector('.bets-count');
    console.log('.bets-count:', betsCountEl ? `"${betsCountEl.textContent.trim()}"` : 'NÃO ENCONTRADO');

    const cashoutValueEl = document.querySelector('.cashout-value');
    console.log('.cashout-value:', cashoutValueEl ? `"${cashoutValueEl.textContent.trim()}"` : 'NÃO ENCONTRADO');

    // Mostra todos elementos que podem conter número de apostadores
    console.log('\n--- Possíveis elementos de contagem de apostas ---');
    const betsElements = document.querySelectorAll('[class*="bet"], [class*="player"], [class*="count"]');
    betsElements.forEach((el, i) => {
      if (i < 10) {
        const text = el.textContent?.trim().substring(0, 60);
        console.log(`[${i}] ${el.className}: "${text}"`);
      }
    });

    // Mostra todos elementos que podem conter valores de ganhos
    console.log('\n--- Possíveis elementos de ganhos/cashout ---');
    const winElements = document.querySelectorAll('[class*="win"], [class*="cashout"], [class*="payout"], [class*="amount"]');
    winElements.forEach((el, i) => {
      if (i < 10) {
        const text = el.textContent?.trim().substring(0, 60);
        console.log(`[${i}] ${el.className}: "${text}"`);
      }
    });

    // Status das flags
    console.log('\n--- Flags de estado ---');
    console.log('isConnected:', isConnected);
    console.log('hasSyncedOnConnect:', hasSyncedOnConnect);
    console.log('logoutHandled:', logoutHandled);
    console.log('roundCount:', roundCount);
    console.log('lastHeartbeatTime:', new Date(lastHeartbeatTime).toISOString());
    console.log('timeSinceLastHeartbeat:', Math.round((Date.now() - lastHeartbeatTime) / 1000) + 's');
    console.log('audioKeepAlive:', keepAliveAudioContext ? 'ATIVO' : 'inativo');
    console.log('audioContextState:', keepAliveAudioContext?.state || 'N/A');

    console.log('[Bet365 Extension] === FIM DEBUG COMPLETO ===');
    return data;
  }

  // Escuta evento customizado para rodar debug (pode ser disparado do console)
  // No console, use: document.dispatchEvent(new CustomEvent('bet365-debug'))
  document.addEventListener('bet365-debug', () => {
    debugBet365Data();
  });

  // Também escuta tecla de atalho: Ctrl+Shift+D
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      debugBet365Data();
    }
  });

  // ========== COMUNICAÇÃO COM BACKGROUND SCRIPT ==========

  // Escuta mensagens do background script
  if (typeof browser !== 'undefined' && browser.runtime) {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'keepalive_check') {
        console.log('[Bet365 Extension] Keepalive check do background script');

        // Atualiza heartbeat
        lastHeartbeatTime = Date.now();

        // Verifica logout
        const hasLogout = checkForLogoutModalSilent();

        if (hasLogout) {
          console.log('[Bet365 Extension] Logout detectado via keepalive!');
          // Notifica o background script
          browser.runtime.sendMessage({ type: 'logout_detected' });
          sendResponse({ status: 'logout', logout: true });
        } else {
          sendResponse({ status: 'ok', logout: false, roundCount: roundCount });
        }

        return true;
      }
    });

    // Notifica o background que estamos ativos
    setInterval(() => {
      try {
        browser.runtime.sendMessage({ type: 'content_alive', roundCount: roundCount });
      } catch (e) {}
    }, 60000); // A cada minuto
  }

  /**
   * Verifica logout sem disparar ação (para o keepalive check)
   */
  function checkForLogoutModalSilent() {
    const logoutModal = document.querySelector('[data-modal-name="LoggedOutModal"]');

    const modals = document.querySelectorAll('.modal, .modal-dialog, [role="dialog"], ngb-modal-window');
    for (const modal of modals) {
      const text = modal.textContent || '';
      if (text.includes('logged out due to inactivity') ||
          text.includes('desconectado por inatividade') ||
          text.includes('sessão expirada') ||
          text.includes('session expired') ||
          text.includes('Tempo limite da rede') ||
          text.includes('Network timeout') ||
          text.includes('Verifique sua conexão') ||
          text.includes('tente novamente após o jogo recarregar')) {
        return true;
      }
    }

    return !!logoutModal;
  }

  console.log('[Bet365 Extension] Debug: Ctrl+Shift+D ou document.dispatchEvent(new CustomEvent("bet365-debug"))');

  // Inicializa
  function init() {
    const url = window.location.href;
    console.log('[Bet365 Extension] Iniciando no contexto:', url.substring(0, 80));

    // Para TODAS as páginas do Bet365, verifica logout/login
    // (mesmo que não seja o jogo)
    if (url.includes('bet365')) {
      // Inicia áudio keep-alive para evitar throttling (ANTES de qualquer patch de áudio)
      startAudioKeepAlive();

      // Inicia verificação de sessão em todas as páginas bet365
      startSessionCheck();
      startStandbyCheck(); // Detecta quando computador volta do standby

      // Verifica imediatamente se já tem modal de logout ou login
      setTimeout(() => {
        checkForLogoutModal();
        checkForLoginForm();
      }, 2000);
    }

    // Ignora iframes que claramente não são do jogo
    if (url.includes('firebase') ||
        url.includes('analytics') ||
        url.includes('google') ||
        (url.includes('bet365.bet.br') && !url.includes('casino'))) {
      console.log('[Bet365 Extension] Ignorando iframe não-jogo (mas verificando sessão)');
      return;
    }

    // Verifica se estamos no contexto certo (iframe do jogo)
    if (!isInsideGameIframe()) {
      console.log('[Bet365 Extension] Não é o iframe do jogo, aguardando...');

      // Só continua verificando se for um iframe potencial do Spribe
      if (!url.includes('spribe') && !url.includes('aviator')) {
        console.log('[Bet365 Extension] Não é Spribe, parando verificação');
        return;
      }

      // Continua verificando periodicamente
      let checkCount = 0;
      const checkInterval = setInterval(() => {
        checkCount++;
        if (checkCount > 30) { // Para após 60 segundos
          clearInterval(checkInterval);
          console.log('[Bet365 Extension] Timeout aguardando jogo');
          return;
        }
        if (isInsideGameIframe()) {
          clearInterval(checkInterval);
          console.log('[Bet365 Extension] Jogo detectado!');
          loadPersistedData();
          debugElements();
          setupVisibilityProtection();
          startHeartbeat();
          startSessionCheck();
          startStandbyCheck();
          startModalAndAudioCheck();
          createStatusIndicator();
          connect();
        }
      }, 2000);

      return;
    }

    console.log('[Bet365 Extension] Contexto do jogo detectado!');
    loadPersistedData();
    debugElements();
    setupVisibilityProtection();
    startHeartbeat();
    startSessionCheck();
    startStandbyCheck();
    startModalAndAudioCheck();
    createStatusIndicator();
    connect();
  }

  // Aguarda a página carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Pequeno delay para garantir que elementos dinâmicos carreguem
    setTimeout(init, 1000);
  }

})();
