import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { insertRound } from '../database.js';
import * as liveBetting from '../liveBetting.js';
import { broadcastRound, broadcastBettingPhase } from './websocket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuração do Browser via variáveis de ambiente
// BROWSER_ISOLATED=true        - Usa diretório de sessão isolado com timestamp
// BROWSER_CHANNEL=chrome-beta  - Usa canal específico (chrome, chrome-beta, msedge, etc.)
// BROWSER_USER_DATA_DIR=/path  - Diretório customizado para dados do browser
// BROWSER_EXECUTABLE=/path     - Executável customizado do browser
// BROWSER_HEADLESS=true        - Modo headless
// BROWSER_NON_PERSISTENT=true  - Usa contexto não persistente (não salva sessão)

const BROWSER_ISOLATED = process.env.BROWSER_ISOLATED === 'true';
const BROWSER_CHANNEL = process.env.BROWSER_CHANNEL || null;
const BROWSER_EXECUTABLE = process.env.BROWSER_EXECUTABLE || null;
const BROWSER_HEADLESS = process.env.BROWSER_HEADLESS === 'true';
const BROWSER_NON_PERSISTENT = process.env.BROWSER_NON_PERSISTENT === 'true';

// Define o diretório de sessão
function getUserDataDir() {
  // Se especificado via variável de ambiente
  if (process.env.BROWSER_USER_DATA_DIR) {
    return process.env.BROWSER_USER_DATA_DIR;
  }

  // Se modo isolado, cria diretório único com timestamp
  if (BROWSER_ISOLATED) {
    const timestamp = Date.now();
    return path.join(__dirname, '..', '..', 'data', `browser-session-${timestamp}`);
  }

  // Padrão: diretório fixo
  return path.join(__dirname, '..', '..', 'data', 'browser-session');
}

const GAME_URL = 'https://spinbetter2z.com/br/games/crash';

// Estado atual do jogo
let currentGameState = {
  isRunning: false,
  isBettingPhase: false,
  lastMultiplier: 0
};

/**
 * Retorna o estado atual do jogo
 */
export function getGameState() {
  return { ...currentGameState };
}

// Funções de live betting exportadas
export { liveBetting };

/**
 * Faz parsing robusto de números com diferentes formatos
 */
function parseNumber(str) {
  if (!str) return 0;
  let cleaned = str.replace(/[^\d.,\-]/g, '').trim();
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Faz parsing do multiplicador (ex: "1.97x", "10,25x")
 */
function parseMultiplier(str) {
  if (!str) return 0;
  const cleaned = str.replace(/x/gi, '').trim();
  return parseNumber(cleaned);
}

/**
 * Encontra o iframe do jogo Crash
 */
async function findGameFrame(page) {
  const frames = page.frames();

  for (const frame of frames) {
    const url = frame.url();
    if (url.includes('games-frame') || url.includes('/games/371')) {
      const hasGame = await frame.locator('.crash-game__mountains').count();
      if (hasGame > 0) {
        return frame;
      }
    }
  }

  return null;
}

/**
 * Coleta dados da rodada do iframe
 */
async function collectRoundData(frame) {
  return await frame.evaluate(() => {
    function parseNumber(str) {
      if (!str) return 0;
      let cleaned = str.replace(/[^\d.,\-]/g, '').trim();
      if (!cleaned) return 0;

      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');

      if (lastComma > lastDot) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else if (lastDot > lastComma) {
        cleaned = cleaned.replace(/,/g, '');
      } else if (lastComma !== -1 && lastDot === -1) {
        const parts = cleaned.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
          cleaned = cleaned.replace(',', '.');
        } else {
          cleaned = cleaned.replace(/,/g, '');
        }
      }

      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }

    function parseMultiplier(str) {
      if (!str) return 0;
      const cleaned = str.replace(/x/gi, '').trim();
      return parseNumber(cleaned);
    }

    const counterEl = document.querySelector('.crash-game__counter');
    const multiplierText = counterEl ? counterEl.textContent : '0';
    const multiplier = parseMultiplier(multiplierText);

    const playersEl = document.querySelector('.crash-total__value--players');
    const betCount = playersEl ? parseNumber(playersEl.textContent) : 0;

    const betsEl = document.querySelector('.crash-total__value--bets');
    const totalBet = betsEl ? parseNumber(betsEl.textContent) : 0;

    const prizeEl = document.querySelector('.crash-total__value--prize');
    const totalWin = prizeEl ? parseNumber(prizeEl.textContent) : 0;

    const mountains = document.querySelector('.crash-game__mountains');
    const isRunning = mountains ? mountains.classList.contains('crash-game__mountains--game') : false;

    let historyItems = document.querySelectorAll('.crash-previous__item');
    if (historyItems.length === 0) {
      historyItems = document.querySelectorAll('.crash-history__item');
    }
    if (historyItems.length === 0) {
      historyItems = document.querySelectorAll('[class*="crash"][class*="history"] [class*="item"]');
    }
    if (historyItems.length === 0) {
      historyItems = document.querySelectorAll('[class*="previous"] [class*="item"]');
    }
    if (historyItems.length === 0) {
      historyItems = document.querySelectorAll('.crash-game__history-item, .game-history__item, [class*="result"][class*="badge"]');
    }

    const history = [];
    historyItems.forEach((item, index) => {
      if (index < 10) {
        const text = item.textContent;
        const mult = parseMultiplier(text);
        if (mult > 0) {
          history.push(mult);
        }
      }
    });

    const countdownEl = document.querySelector('.crash-timer--countdown');
    const isCountdownVisible = countdownEl
      ? (countdownEl.style.display !== 'none' && window.getComputedStyle(countdownEl).display !== 'none')
      : false;

    return {
      multiplier,
      betCount: Math.round(betCount),
      totalBet,
      totalWin,
      isRunning,
      history,
      isCountdownVisible
    };
  });
}

/**
 * Inicia o game watcher
 */
export async function startGameWatcher() {
  console.log('[GameWatcher] Iniciando...');

  // Configurações do browser
  const userDataDir = getUserDataDir();
  const launchOptions = {
    headless: BROWSER_HEADLESS,
    viewport: { width: 1400, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ]
  };

  // Adiciona canal do browser se especificado (chrome, chrome-beta, msedge, etc.)
  if (BROWSER_CHANNEL) {
    launchOptions.channel = BROWSER_CHANNEL;
    console.log('[GameWatcher] Canal do browser:', BROWSER_CHANNEL);
  }

  // Adiciona executável customizado se especificado
  if (BROWSER_EXECUTABLE) {
    launchOptions.executablePath = BROWSER_EXECUTABLE;
    console.log('[GameWatcher] Executável do browser:', BROWSER_EXECUTABLE);
  }

  let context;
  let page;

  if (BROWSER_NON_PERSISTENT) {
    // Modo não persistente - não salva sessão, não bloqueia diretório
    console.log('[GameWatcher] Modo: NÃO PERSISTENTE (sessão não será salva)');
    console.log('[GameWatcher] ⚠️ Você precisará fazer login a cada início');

    const browser = await chromium.launch(launchOptions);
    context = await browser.newContext({
      viewport: { width: 1400, height: 900 }
    });
    page = await context.newPage();

    // Guarda referência do browser para cleanup
    context._browser = browser;
  } else {
    // Modo persistente - salva sessão
    console.log('[GameWatcher] Modo: PERSISTENTE');
    console.log('[GameWatcher] Diretório de sessão:', userDataDir);

    if (BROWSER_ISOLATED) {
      console.log('[GameWatcher] ⚠️ Modo ISOLADO ativo - novo diretório criado');
    }

    context = await chromium.launchPersistentContext(userDataDir, launchOptions);
    page = await context.newPage();
  }

  console.log('[GameWatcher] Navegando para:', GAME_URL);

  try {
    await page.goto(GAME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  } catch (err) {
    console.log('[GameWatcher] Timeout no carregamento inicial, continuando...');
  }

  console.log('[GameWatcher] Aguardando página carregar...');
  await page.waitForTimeout(5000);

  console.log('[GameWatcher] Procurando iframe do jogo...');
  console.log('[GameWatcher] Se precisar fazer login, faça agora no navegador.');

  let gameFrame = null;
  const maxAttempts = 60;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    gameFrame = await findGameFrame(page);

    if (gameFrame) {
      console.log('[GameWatcher] Iframe do jogo encontrado!');
      break;
    }

    if (attempt % 12 === 0) {
      console.log(`[GameWatcher] Aguardando iframe do jogo... (${Math.floor(attempt * 5 / 60)} min)`);
    }

    await page.waitForTimeout(5000);
  }

  if (!gameFrame) {
    console.error('[GameWatcher] Iframe do jogo não encontrado após 5 minutos.');
    throw new Error('Iframe do jogo não encontrado');
  }

  liveBetting.setGameFrame(gameFrame);
  liveBetting.setMainPage(page);
  console.log('[GameWatcher] Módulo de apostas reais configurado');

  console.log('[GameWatcher] Aguardando elemento .crash-game__mountains no iframe...');

  try {
    await gameFrame.waitForSelector('.crash-game__mountains', { timeout: 30000, state: 'attached' });
    console.log('[GameWatcher] Elemento do jogo encontrado no iframe!');
  } catch (err) {
    console.error('[GameWatcher] Elemento .crash-game__mountains não encontrado no iframe.');
    throw err;
  }

  console.log('[GameWatcher] Iniciando monitoramento por polling...');
  console.log('[GameWatcher] Monitorando rodadas... (Ctrl+C para parar)');

  // Estado para controle de verificação de erro de autorização
  let lastAuthCheck = 0;
  let isHandlingAuthError = false;
  const AUTH_CHECK_THROTTLE = 5000; // Throttle mínimo de 5 segundos entre verificações no polling

  /**
   * Verifica e trata erro de autorização
   * @param {string} source - Origem da chamada (para log)
   * @returns {boolean} - true se houve erro e foi tratado
   */
  async function checkAndHandleAuthError(source = 'interval') {
    if (isHandlingAuthError) return false;

    try {
      // Verifica na página principal usando múltiplos seletores
      const mainPageResult = await page.evaluate(() => {
        // Tenta múltiplos seletores para encontrar popups de erro
        const selectors = [
          '.ui-popup--status-error',
          '.popup--status-error',
          '.error-popup',
          '[class*="popup"][class*="error"]',
          '[class*="modal"][class*="error"]',
          '.ui-popup',
          '.modal',
          '[role="dialog"]',
          '[role="alert"]'
        ];

        // Primeiro tenta nos seletores de popup
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = (el.textContent || '').toLowerCase();
            if (text.includes('erro de autorização') ||
                text.includes('authorization error') ||
                text.includes('autorização') ||
                text.includes('atualize a página')) {
              return {
                found: true,
                selector,
                text: el.textContent?.substring(0, 200),
                location: 'main-page'
              };
            }
          }
        }

        // Fallback: busca no body inteiro por elementos que contenham o texto de erro
        const bodyText = document.body?.innerText || '';
        const hasErrorText = bodyText.toLowerCase().includes('erro de autorização') ||
                            bodyText.toLowerCase().includes('atualize a página ou tente entrar novamente');

        if (hasErrorText) {
          // Tenta encontrar o elemento específico que contém o texto
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
          );

          let node;
          while (node = walker.nextNode()) {
            const nodeText = (node.textContent || '').toLowerCase();
            if ((nodeText.includes('erro de autorização') ||
                 nodeText.includes('atualize a página ou tente entrar novamente')) &&
                node.offsetParent !== null) { // Elemento visível
              // Verifica se é um elemento de UI (não um container grande)
              if (nodeText.length < 500) {
                return {
                  found: true,
                  selector: 'body-scan',
                  text: node.textContent?.substring(0, 200),
                  location: 'main-page',
                  element: node.tagName + '.' + node.className
                };
              }
            }
          }
        }

        // Log de todos os popups visíveis para debug
        const allPopups = document.querySelectorAll('[class*="popup"], [class*="modal"], [role="dialog"], [role="alert"]');
        const popupInfo = [];
        allPopups.forEach(p => {
          if (p.offsetParent !== null) { // Verifica se está visível
            popupInfo.push({
              class: p.className,
              text: (p.textContent || '').substring(0, 100)
            });
          }
        });

        // Também verifica se há overlays visíveis
        const overlays = document.querySelectorAll('[class*="overlay"], [class*="backdrop"]');
        overlays.forEach(o => {
          if (o.offsetParent !== null) {
            popupInfo.push({
              class: 'OVERLAY: ' + o.className,
              text: ''
            });
          }
        });

        return { found: false, visiblePopups: popupInfo, bodyHasError: hasErrorText };
      });

      // Se encontrou na página principal
      if (mainPageResult.found) {
        isHandlingAuthError = true;
        console.log(`[GameWatcher] ⚠️ Erro de autorização detectado na página principal (${source})!`);
        console.log(`[GameWatcher] Seletor: ${mainPageResult.selector}`);
        console.log(`[GameWatcher] Texto: ${mainPageResult.text}`);
        console.log('[GameWatcher] Recarregando página...');

        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('[GameWatcher] ✅ Página recarregada com sucesso');

        await page.waitForTimeout(5000);

        gameFrame = await findGameFrame(page);
        if (gameFrame) {
          liveBetting.setGameFrame(gameFrame);
          console.log('[GameWatcher] ✅ Iframe do jogo reencontrado após reload');
        } else {
          console.log('[GameWatcher] ⚠️ Iframe não encontrado após reload, aguardando próximo ciclo...');
        }

        isHandlingAuthError = false;
        return true;
      }

      // Se bodyHasError é true mas found é false, significa que encontrou o texto mas não um elemento específico
      // Neste caso, ainda devemos fazer reload
      if (mainPageResult.bodyHasError && !mainPageResult.found) {
        isHandlingAuthError = true;
        console.log(`[GameWatcher] ⚠️ Texto de erro encontrado no body da página (${source})!`);
        console.log('[GameWatcher] Recarregando página...');

        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('[GameWatcher] ✅ Página recarregada com sucesso');

        await page.waitForTimeout(5000);

        gameFrame = await findGameFrame(page);
        if (gameFrame) {
          liveBetting.setGameFrame(gameFrame);
          console.log('[GameWatcher] ✅ Iframe do jogo reencontrado após reload');
        } else {
          console.log('[GameWatcher] ⚠️ Iframe não encontrado após reload, aguardando próximo ciclo...');
        }

        isHandlingAuthError = false;
        return true;
      }

      // Verifica também no iframe se existir
      if (gameFrame) {
        try {
          const iframeResult = await gameFrame.evaluate(() => {
            const selectors = [
              '.ui-popup--status-error',
              '.popup--status-error',
              '.error-popup',
              '[class*="popup"][class*="error"]',
              '[class*="modal"][class*="error"]'
            ];

            for (const selector of selectors) {
              const elements = document.querySelectorAll(selector);
              for (const el of elements) {
                const text = (el.textContent || '').toLowerCase();
                if (text.includes('erro de autorização') ||
                    text.includes('authorization error') ||
                    text.includes('autorização')) {
                  return {
                    found: true,
                    selector,
                    text: el.textContent?.substring(0, 200),
                    location: 'iframe'
                  };
                }
              }
            }

            return { found: false };
          });

          if (iframeResult.found) {
            isHandlingAuthError = true;
            console.log(`[GameWatcher] ⚠️ Erro de autorização detectado no iframe (${source})!`);
            console.log(`[GameWatcher] Seletor: ${iframeResult.selector}`);
            console.log(`[GameWatcher] Texto: ${iframeResult.text}`);
            console.log('[GameWatcher] Recarregando página...');

            await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log('[GameWatcher] ✅ Página recarregada com sucesso');

            await page.waitForTimeout(5000);

            gameFrame = await findGameFrame(page);
            if (gameFrame) {
              liveBetting.setGameFrame(gameFrame);
              console.log('[GameWatcher] ✅ Iframe do jogo reencontrado após reload');
            } else {
              console.log('[GameWatcher] ⚠️ Iframe não encontrado após reload, aguardando próximo ciclo...');
            }

            isHandlingAuthError = false;
            return true;
          }
        } catch (iframeErr) {
          // Iframe pode estar em estado inválido
          if (!iframeErr.message.includes('Target closed') && !iframeErr.message.includes('Execution context')) {
            console.log(`[GameWatcher] Aviso ao verificar iframe: ${iframeErr.message}`);
          }
        }
      }
    } catch (err) {
      isHandlingAuthError = false;
      if (!err.message.includes('Target closed')) {
        console.error(`[GameWatcher] Erro ao verificar popup de autorização (${source}):`, err.message);
      }
    }

    return false;
  }

  // Verificação periódica de erro de autorização (a cada 10 segundos para detecção mais rápida)
  const AUTH_ERROR_CHECK_INTERVAL = 10 * 1000; // 10 segundos
  const authErrorCheckInterval = setInterval(() => {
    checkAndHandleAuthError('interval-10s');
  }, AUTH_ERROR_CHECK_INTERVAL);

  console.log('[GameWatcher] Verificação de erro de autorização ativa (a cada 10s + cada rodada + quando iframe perdido)');

  let wasRunning = false;
  let lastMultiplier = 0;
  let lastHistory = [];
  let lastSavedMultiplier = 0;
  let lastSaveTime = 0;
  let lastBetCount = 0;
  let lastTotalBet = 0;
  let wasCountdownVisible = false;
  let lastSavedHistoryFirst = null;
  let pendingRoundData = null;

  // Track the multiplier while game is running (for 1x crash detection)
  let runningMultiplier = 0;
  let maxRunningMultiplier = 0;

  // Track countdown state for 1x crash detection
  // Logic: if countdown hides (game starts) and reappears quickly without us seeing a multiplier,
  // it means the game crashed at 1x instantly
  let countdownHiddenTime = 0;        // When countdown became hidden (game started)
  let sawMultiplierDuringRound = false; // Did we see any multiplier > 1.0 during this round?
  let roundStartBetCount = 0;
  let roundStartTotalBet = 0;

  const SAVE_COOLDOWN = 3000;

  function saveRound(multiplier, betCount, totalBet, totalWin, source = 'normal') {
    const now = Date.now();

    if (Math.abs(multiplier - lastSavedMultiplier) < 0.01 && (now - lastSaveTime) < SAVE_COOLDOWN) {
      console.log(`[GameWatcher] Ignorando duplicata: ${multiplier}x (já salvo há ${now - lastSaveTime}ms)`);
      return false;
    }

    const round = {
      createdAt: new Date().toISOString(),
      betCount: betCount,
      totalBet: totalBet,
      totalWin: totalWin,
      multiplier: multiplier
    };

    try {
      const id = insertRound(round);
      round.id = id;
      console.log(`[DB] Rodada #${id} salva com sucesso! (${source})`);

      lastSavedMultiplier = multiplier;
      lastSaveTime = now;
      pendingRoundData = null;

      // Broadcast via WebSocket
      broadcastRound(round);

      return true;
    } catch (err) {
      console.error('[GameWatcher] Erro ao salvar rodada:', err);
      return false;
    }
  }

  const pollInterval = setInterval(async () => {
    // Skip se estiver tratando erro de autorização
    if (isHandlingAuthError) return;

    try {
      gameFrame = await findGameFrame(page);
      if (!gameFrame) {
        console.log('[GameWatcher] Iframe perdido, procurando novamente...');

        // Quando iframe é perdido, verifica se há erro de autorização (pode ser a causa)
        const now = Date.now();
        if (now - lastAuthCheck > AUTH_CHECK_THROTTLE) {
          lastAuthCheck = now;
          await checkAndHandleAuthError('iframe-lost');
        }
        return;
      }

      liveBetting.setGameFrame(gameFrame);

      const data = await collectRoundData(gameFrame);
      const isRunning = data.isRunning;
      const currentHistory = data.history || [];
      const currentBetCount = data.betCount;
      const isCountdownVisible = data.isCountdownVisible;
      const currentHistoryFirst = currentHistory.length > 0 ? currentHistory[0] : null;

      // MÉTODO 1: Detectar via mudança no histórico
      if (currentHistoryFirst !== null) {
        if (lastSavedHistoryFirst === null) {
          console.log(`[GameWatcher] Inicializando histórico com: ${currentHistoryFirst}x`);
          lastSavedHistoryFirst = currentHistoryFirst;
        } else if (currentHistoryFirst !== lastSavedHistoryFirst) {
          const multiplier = currentHistoryFirst;
          const betCount = pendingRoundData?.betCount || lastBetCount || data.betCount;
          const totalBet = pendingRoundData?.totalBet || lastTotalBet || data.totalBet;
          const totalWin = multiplier <= 1.05 ? 0 : data.totalWin;

          console.log(`[GameWatcher] 📊 Rodada detectada via histórico: ${multiplier}x`);

          const saved = saveRound(multiplier, betCount, totalBet, totalWin, 'histórico');
          if (saved) {
            lastSavedHistoryFirst = currentHistoryFirst;
            pendingRoundData = null;
            lastBetCount = 0;
            lastTotalBet = 0;
          }
        }
      }

      // CAPTURA DE DADOS
      if (data.betCount > 0) {
        if (data.betCount > lastBetCount) {
          lastBetCount = data.betCount;
          lastTotalBet = data.totalBet;
        }
      }

      // Track multiplier while game is running (for 1x crash detection)
      if (isRunning && data.multiplier > 0) {
        runningMultiplier = data.multiplier;
        if (data.multiplier > maxRunningMultiplier) {
          maxRunningMultiplier = data.multiplier;
        }
        // Mark that we saw a valid multiplier during this round
        if (data.multiplier >= 1.0) {
          sawMultiplierDuringRound = true;
        }
      }

      // MÉTODO 0: Detect when countdown becomes hidden (game starts)
      // This is critical for detecting 1x crashes
      if (wasCountdownVisible && !isCountdownVisible) {
        countdownHiddenTime = Date.now();
        // Reset ALL multiplier tracking for the new round
        sawMultiplierDuringRound = false;
        runningMultiplier = 0;
        maxRunningMultiplier = 0;
        // Capture bet data at round start
        roundStartBetCount = lastBetCount > 0 ? lastBetCount : data.betCount;
        roundStartTotalBet = lastTotalBet > 0 ? lastTotalBet : data.totalBet;
        console.log(`[GameWatcher] ⏱️ Countdown escondido (rodada iniciando) | Apostadores: ${roundStartBetCount} | Apostado: ${roundStartTotalBet}`);
      }

      // MÉTODO 2: Detectar via transição de estado
      if (wasRunning && !isRunning) {
        // Use the current counter value, or fallback to tracked running multiplier
        // This handles instant 1x crashes where the counter resets before we can read it
        let multiplier = data.multiplier;

        // If counter already reset (shows 0), use the last running multiplier we captured
        if (multiplier < 0.99 && runningMultiplier >= 0.99) {
          console.log(`[GameWatcher] ⚠️ Counter já resetou (${multiplier}x), usando último running: ${runningMultiplier}x`);
          multiplier = runningMultiplier;
        }

        // Additional fallback: if we tracked a max multiplier during the round
        if (multiplier < 0.99 && maxRunningMultiplier >= 0.99) {
          console.log(`[GameWatcher] ⚠️ Usando max running multiplier: ${maxRunningMultiplier}x`);
          multiplier = maxRunningMultiplier;
        }

        // For instant crashes, assume 1.00x if we detected running but got no multiplier
        if (multiplier < 0.99) {
          console.log(`[GameWatcher] ⚠️ Crash instantâneo detectado! Assumindo 1.00x (counter: ${data.multiplier}x, running: ${runningMultiplier}x, max: ${maxRunningMultiplier}x)`);
          multiplier = 1.00;
        }

        console.log(`[GameWatcher] Transição detectada: rodando -> parado (mult: ${multiplier}x)`);

        if (multiplier >= 0.99) {
          const betCount = lastBetCount > 0 ? lastBetCount : data.betCount;
          const totalBet = lastTotalBet > 0 ? lastTotalBet : data.totalBet;
          const totalWin = multiplier <= 1.05 ? 0 : data.totalWin;

          console.log(`[GameWatcher] 📊 Rodada detectada via transição: ${multiplier}x`);
          console.log(`[GameWatcher] Dados: Apostadores=${betCount} | Apostado=${totalBet} | Ganho=${totalWin}`);

          saveRound(multiplier, betCount, totalBet, totalWin, 'transição');

          lastBetCount = 0;
          lastTotalBet = 0;
        } else {
          pendingRoundData = {
            betCount: lastBetCount,
            totalBet: lastTotalBet,
            multiplier: multiplier,
            timestamp: Date.now()
          };
        }

        // Reset running multiplier tracking for next round
        runningMultiplier = 0;
        maxRunningMultiplier = 0;

        currentGameState.isRunning = false;
        currentGameState.isBettingPhase = true;
        currentGameState.lastMultiplier = multiplier;

        // Broadcast fase de apostas via WebSocket
        broadcastBettingPhase({
          lastMultiplier: multiplier,
          timestamp: new Date().toISOString()
        });
      }

      // DETECÇÃO DE INÍCIO
      if (!wasRunning && isRunning) {
        console.log('[GameWatcher] 🚀 Nova rodada iniciada!');
        currentGameState.isRunning = true;

        // Reset running multiplier tracking for new round
        runningMultiplier = 0;
        maxRunningMultiplier = 0;

        // Verifica erro de autorização no início de cada rodada (throttled)
        const now = Date.now();
        if (now - lastAuthCheck > AUTH_CHECK_THROTTLE) {
          lastAuthCheck = now;
          checkAndHandleAuthError('round-start');
        }
        currentGameState.isBettingPhase = false;
      }

      // MÉTODO 3: DETECÇÃO VIA COUNTDOWN (mais confiável para 1x)
      // Se countdown reaparece rapidamente sem termos visto um multiplicador válido = crash 1x
      if (!wasCountdownVisible && isCountdownVisible) {
        const now = Date.now();
        const roundDuration = countdownHiddenTime > 0 ? (now - countdownHiddenTime) : 0;

        console.log(`[GameWatcher] ⏱️ Countdown reapareceu | Duração da rodada: ${roundDuration}ms | Viu multiplicador: ${sawMultiplierDuringRound} | Max mult: ${maxRunningMultiplier}x`);

        // DETECÇÃO DE CRASH 1X:
        // Se não vimos nenhum multiplicador válido durante a rodada, significa que foi um crash 1x.
        // A rodada aconteceu (countdown escondeu e voltou) mas nunca capturamos um multiplicador >= 1.0
        // Limite de 30s para evitar falsos positivos se algo deu errado.
        const isValidRoundDuration = roundDuration > 0 && roundDuration < 30000;
        const noMultiplierSeen = !sawMultiplierDuringRound && maxRunningMultiplier < 1.0;

        if (countdownHiddenTime > 0 && isValidRoundDuration && noMultiplierSeen) {
          console.log(`[GameWatcher] 🎯 CRASH 1x DETECTADO via countdown! Duração: ${roundDuration}ms | maxMult: ${maxRunningMultiplier}x`);

          const betCount = roundStartBetCount || lastBetCount || data.betCount;
          const totalBet = roundStartTotalBet || lastTotalBet || data.totalBet;

          saveRound(1.00, betCount, totalBet, 0, 'countdown-1x');
        }
        // Fallback para dados pendentes (lógica original)
        else if (pendingRoundData) {
          const timeSincePending = now - pendingRoundData.timestamp;

          // Use >= 0.99 to handle float precision and allow 1.00x rounds
          if (timeSincePending < 1000 && pendingRoundData.multiplier >= 0.99) {
            console.log(`[GameWatcher] 📊 Rodada salva via countdown (dados pendentes): ${pendingRoundData.multiplier}x`);
            saveRound(
              pendingRoundData.multiplier,
              pendingRoundData.betCount,
              pendingRoundData.totalBet,
              pendingRoundData.multiplier <= 1.05 ? 0 : 0,
              'countdown-pending'
            );
            pendingRoundData = null;
          }
        }

        // Reset ALL tracking variables for next round
        countdownHiddenTime = 0;
        sawMultiplierDuringRound = false;
        roundStartBetCount = 0;
        roundStartTotalBet = 0;
        runningMultiplier = 0;
        maxRunningMultiplier = 0;
      }

      // DEBUG
      if (Math.random() < 0.005) {
        console.log(`[Debug] countdown=${isCountdownVisible} | running=${isRunning} | mult=${data.multiplier}x | maxMult=${maxRunningMultiplier}x | sawMult=${sawMultiplierDuringRound} | hist[0]=${currentHistoryFirst}`);
      }

      wasRunning = isRunning;
      wasCountdownVisible = isCountdownVisible;
      lastMultiplier = data.multiplier;
      lastHistory = currentHistory;

    } catch (err) {
      if (!err.message.includes('Target closed') && !err.message.includes('Execution context')) {
        console.error('[GameWatcher] Erro no polling:', err.message);
      }
    }
  }, 100);

  return {
    context,
    page,
    cleanup: () => {
      clearInterval(pollInterval);
      clearInterval(authErrorCheckInterval);
    }
  };
}

/**
 * Para o game watcher
 */
export async function stopGameWatcher(watcherResult) {
  if (watcherResult) {
    if (watcherResult.cleanup) {
      watcherResult.cleanup();
    }
    if (watcherResult.context) {
      // Se tiver browser separado (modo não persistente), fecha ele
      if (watcherResult.context._browser) {
        await watcherResult.context._browser.close();
      } else {
        await watcherResult.context.close();
      }
    }
    console.log('[GameWatcher] Fechado');
  }
}

export default {
  startGameWatcher,
  stopGameWatcher,
  getGameState
};
