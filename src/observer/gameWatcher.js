import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { insertRound } from '../database.js';
import * as liveBetting from '../liveBetting.js';
import { broadcastRound, broadcastBettingPhase } from './websocket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(__dirname, '..', '..', 'data', 'browser-session');
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
  console.log('[GameWatcher] Diretório de sessão:', USER_DATA_DIR);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ]
  });

  const page = await context.newPage();

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
  const AUTH_CHECK_THROTTLE = 10000; // Throttle mínimo de 10 segundos entre verificações no polling

  /**
   * Verifica e trata erro de autorização
   * @param {string} source - Origem da chamada (para log)
   * @returns {boolean} - true se houve erro e foi tratado
   */
  async function checkAndHandleAuthError(source = 'interval') {
    if (isHandlingAuthError) return false;

    try {
      const hasAuthError = await page.evaluate(() => {
        const errorPopup = document.querySelector('.ui-popup--status-error');
        if (errorPopup) {
          const text = errorPopup.textContent || '';
          return text.includes('Ocorreu um erro de autorização');
        }
        return false;
      });

      if (hasAuthError) {
        isHandlingAuthError = true;
        console.log(`[GameWatcher] ⚠️ Erro de autorização detectado (${source})! Recarregando página...`);

        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('[GameWatcher] ✅ Página recarregada com sucesso');

        // Aguarda um pouco para a página estabilizar
        await page.waitForTimeout(5000);

        // Procura o iframe novamente
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
    } catch (err) {
      isHandlingAuthError = false;
      if (!err.message.includes('Target closed')) {
        console.error(`[GameWatcher] Erro ao verificar popup de autorização (${source}):`, err.message);
      }
    }

    return false;
  }

  // Verificação periódica de erro de autorização (a cada 30 segundos)
  const AUTH_ERROR_CHECK_INTERVAL = 30 * 1000; // 30 segundos
  const authErrorCheckInterval = setInterval(() => {
    checkAndHandleAuthError('interval-30s');
  }, AUTH_ERROR_CHECK_INTERVAL);

  console.log('[GameWatcher] Verificação de erro de autorização ativa (a cada 30s + cada rodada)');

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

      // MÉTODO 2: Detectar via transição de estado
      if (wasRunning && !isRunning) {
        const multiplier = data.multiplier;

        console.log(`[GameWatcher] Transição detectada: rodando -> parado (mult: ${multiplier}x)`);

        if (multiplier >= 1.0) {
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

        // Verifica erro de autorização no início de cada rodada (throttled)
        const now = Date.now();
        if (now - lastAuthCheck > AUTH_CHECK_THROTTLE) {
          lastAuthCheck = now;
          checkAndHandleAuthError('round-start');
        }
        currentGameState.isBettingPhase = false;
      }

      // FALLBACK VIA COUNTDOWN
      if (!wasCountdownVisible && isCountdownVisible) {
        console.log('[GameWatcher] ⏱️ Countdown apareceu');

        if (pendingRoundData) {
          const now = Date.now();
          const timeSincePending = now - pendingRoundData.timestamp;

          if (timeSincePending < 1000 && pendingRoundData.multiplier >= 1.0) {
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
      }

      // DEBUG
      if (Math.random() < 0.005) {
        console.log(`[Debug] Estado: running=${isRunning} | countdown=${isCountdownVisible} | hist[0]=${currentHistoryFirst} | lastSaved=${lastSavedHistoryFirst} | pending=${!!pendingRoundData}`);
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
      await watcherResult.context.close();
    }
    console.log('[GameWatcher] Fechado');
  }
}

export default {
  startGameWatcher,
  stopGameWatcher,
  getGameState
};
