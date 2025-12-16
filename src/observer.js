import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { insertRound } from './database.js';
import * as liveBetting from './liveBetting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = path.join(__dirname, '..', 'data', 'browser-session');
const GAME_URL = 'https://spinbetter2z.com/br/games/crash';

// Callback para notificar o servidor de novas rodadas
let onRoundCallback = null;

// Callback para notificar quando é hora de apostar (fase de apostas iniciada)
let onBettingPhaseCallback = null;

// Estado atual do jogo
let currentGameState = {
  isRunning: false,
  isBettingPhase: false,
  lastMultiplier: 0
};

/**
 * Define callback para quando uma nova rodada é registrada
 */
export function onNewRound(callback) {
  onRoundCallback = callback;
}

/**
 * Define callback para fase de apostas
 */
export function onBettingPhase(callback) {
  onBettingPhaseCallback = callback;
}

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
 * Trata: "1.234,56", "1,234.56", "1234.56", símbolos de moeda, etc.
 */
function parseNumber(str) {
  if (!str) return 0;

  // Remove espaços, símbolos de moeda e caracteres não numéricos (exceto separadores)
  let cleaned = str.replace(/[^\d.,\-]/g, '').trim();

  if (!cleaned) return 0;

  // Detecta o formato baseado na posição dos separadores
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Formato brasileiro: 1.234,56 -> vírgula é decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Formato americano: 1,234.56 -> ponto é decimal
    cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Só tem vírgula: pode ser decimal ou milhares
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Provavelmente decimal: 1234,56
      cleaned = cleaned.replace(',', '.');
    } else {
      // Provavelmente milhares: 1,234
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
  // Remove 'x' e espaços, depois faz parsing normal
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
    // O iframe do jogo contém "games-frame" na URL
    if (url.includes('games-frame') || url.includes('/games/371')) {
      // Verifica se tem o elemento do jogo
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

    // Multiplicador
    const counterEl = document.querySelector('.crash-game__counter');
    const multiplierText = counterEl ? counterEl.textContent : '0';
    const multiplier = parseMultiplier(multiplierText);

    // Total de apostadores (players)
    const playersEl = document.querySelector('.crash-total__value--players');
    const betCount = playersEl ? parseNumber(playersEl.textContent) : 0;

    // Total de apostas (bets)
    const betsEl = document.querySelector('.crash-total__value--bets');
    const totalBet = betsEl ? parseNumber(betsEl.textContent) : 0;

    // Total de ganhos (prize)
    const prizeEl = document.querySelector('.crash-total__value--prize');
    const totalWin = prizeEl ? parseNumber(prizeEl.textContent) : 0;

    // Estado do jogo
    const mountains = document.querySelector('.crash-game__mountains');
    const isRunning = mountains ? mountains.classList.contains('crash-game__mountains--game') : false;

    // Histórico de resultados (badges com multiplicadores anteriores)
    // Isso nos ajuda a detectar rodadas que perdemos
    const historyItems = document.querySelectorAll('.crash-previous__item');
    const history = [];
    historyItems.forEach((item, index) => {
      if (index < 10) { // Pega os últimos 10
        const text = item.textContent;
        const mult = parseMultiplier(text);
        if (mult > 0) {
          history.push(mult);
        }
      }
    });

    return {
      multiplier,
      betCount: Math.round(betCount),
      totalBet,
      totalWin,
      isRunning,
      history
    };
  });
}

/**
 * Inicia o observer do jogo Crash
 */
export async function startObserver() {
  console.log('[Observer] Iniciando...');
  console.log('[Observer] Diretório de sessão:', USER_DATA_DIR);

  // Inicia o browser com sessão persistente
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false, // Precisa ser visível para login manual
    viewport: { width: 1400, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ]
  });

  const page = await context.newPage();

  console.log('[Observer] Navegando para:', GAME_URL);

  try {
    await page.goto(GAME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  } catch (err) {
    console.log('[Observer] Timeout no carregamento inicial, continuando...');
  }

  // Aguarda um pouco para iframes carregarem
  console.log('[Observer] Aguardando página carregar...');
  await page.waitForTimeout(5000);

  // Procura o iframe do jogo
  console.log('[Observer] Procurando iframe do jogo...');
  console.log('[Observer] Se precisar fazer login, faça agora no navegador.');

  let gameFrame = null;
  const maxAttempts = 60; // 5 minutos (60 * 5 segundos)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    gameFrame = await findGameFrame(page);

    if (gameFrame) {
      console.log('[Observer] Iframe do jogo encontrado!');
      break;
    }

    if (attempt % 12 === 0) { // A cada minuto
      console.log(`[Observer] Aguardando iframe do jogo... (${Math.floor(attempt * 5 / 60)} min)`);
    }

    await page.waitForTimeout(5000);
  }

  if (!gameFrame) {
    console.error('[Observer] Iframe do jogo não encontrado após 5 minutos.');
    console.error('[Observer] Verifique se você está logado e na página correta.');
    throw new Error('Iframe do jogo não encontrado');
  }

  // Configura o módulo de apostas reais com o frame do jogo
  liveBetting.setGameFrame(gameFrame);
  console.log('[Observer] Módulo de apostas reais configurado');

  // Aguarda o elemento mountains no iframe (não precisa estar visível)
  console.log('[Observer] Aguardando elemento .crash-game__mountains no iframe...');

  try {
    await gameFrame.waitForSelector('.crash-game__mountains', { timeout: 30000, state: 'attached' });
    console.log('[Observer] Elemento do jogo encontrado no iframe!');
  } catch (err) {
    console.error('[Observer] Elemento .crash-game__mountains não encontrado no iframe.');
    throw err;
  }

  console.log('[Observer] Iniciando monitoramento por polling...');
  console.log('[Observer] Monitorando rodadas... (Ctrl+C para parar)');

  // Estado do jogo
  let wasRunning = false;
  let lastMultiplier = 0;
  let lastHistory = []; // Histórico de multiplicadores anteriores
  let lastSavedMultiplier = 0; // Último multiplicador salvo (para evitar duplicatas)
  let lastSaveTime = 0; // Timestamp do último save
  let lastBetCount = 0;
  let lastTotalBet = 0;

  const SAVE_COOLDOWN = 3000; // 3 segundos de cooldown entre saves

  /**
   * Salva uma rodada no banco de dados (com proteção contra duplicatas)
   */
  function saveRound(multiplier, betCount, totalBet, totalWin, source = 'normal') {
    const now = Date.now();

    // Evita salvar a mesma rodada duas vezes
    // Considera duplicata se: mesmo multiplicador E menos de 3 segundos desde o último save
    if (Math.abs(multiplier - lastSavedMultiplier) < 0.01 && (now - lastSaveTime) < SAVE_COOLDOWN) {
      console.log(`[Observer] Ignorando duplicata: ${multiplier}x (já salvo há ${now - lastSaveTime}ms)`);
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

      // Atualiza controle de duplicatas
      lastSavedMultiplier = multiplier;
      lastSaveTime = now;

      // Notifica o servidor (para SSE)
      if (onRoundCallback) {
        onRoundCallback(round);
      }
      return true;
    } catch (err) {
      console.error('[Observer] Erro ao salvar rodada:', err);
      return false;
    }
  }

  // Função de polling - mais rápido para capturar rodadas rápidas
  const pollInterval = setInterval(async () => {
    try {
      // Verifica se o iframe ainda existe
      gameFrame = await findGameFrame(page);
      if (!gameFrame) {
        console.log('[Observer] Iframe perdido, procurando novamente...');
        return;
      }

      // Atualiza o frame no módulo de apostas reais (caso tenha mudado)
      liveBetting.setGameFrame(gameFrame);

      const data = await collectRoundData(gameFrame);
      const isRunning = data.isRunning;
      const currentHistory = data.history || [];
      const currentBetCount = data.betCount;

      // MÉTODO 1: Detectar via histórico (mais confiável para rodadas rápidas e 1.00x)
      // Se um novo multiplicador apareceu no histórico que não estava antes
      if (currentHistory.length > 0 && lastHistory.length > 0) {
        const newFirst = currentHistory[0];
        const oldFirst = lastHistory[0];

        // Se o primeiro item do histórico mudou, uma rodada terminou
        if (newFirst !== oldFirst && newFirst > 0) {
          console.log(`[Observer] Rodada detectada via histórico: ${newFirst}x`);

          // Usa os dados de aposta que tínhamos antes da rodada terminar
          const betCount = lastBetCount > 0 ? lastBetCount : data.betCount;
          const totalBet = lastTotalBet > 0 ? lastTotalBet : data.totalBet;

          console.log(`[Observer] Apostadores: ${betCount} | Apostado: ${totalBet} | Ganho: ${data.totalWin}`);

          saveRound(newFirst, betCount, totalBet, data.totalWin, 'histórico');
        }
      }

      // MÉTODO 2: Detectar via queda brusca de apostadores (para crashes 1.00x instantâneos)
      // Se tínhamos apostadores e agora temos zero, a rodada pode ter acabado
      const significantDrop = lastBetCount > 10 && currentBetCount === 0;

      // Também detecta se o histórico tem um 1.00x novo
      if (significantDrop && currentHistory.length > 0) {
        const latestMult = currentHistory[0];

        // Se o multiplicador é 1.00x ou próximo (até 1.10x), pode ser um crash instantâneo
        if (latestMult >= 1.0 && latestMult <= 1.10) {
          // Verifica se esse multiplicador já não foi salvo (comparando com o histórico anterior)
          const isNewInHistory = lastHistory.length === 0 || lastHistory[0] !== latestMult;

          if (isNewInHistory) {
            console.log(`[Observer] Crash instantâneo detectado via queda de apostadores: ${latestMult}x`);
            console.log(`[Observer] Apostadores: ${lastBetCount} -> ${currentBetCount}`);
            console.log(`[Observer] Dados: Apostadores=${lastBetCount} | Apostado=${lastTotalBet} | Ganho=0`);

            saveRound(latestMult, lastBetCount, lastTotalBet, 0, 'queda-apostadores');
          }
        }
      }

      // MÉTODO 3: Detectar via transição de estado (backup)
      // Detecta transição: rodando -> parado (fim da rodada)
      if (wasRunning && !isRunning) {
        // Aguarda um pouco para garantir que os valores finais estão renderizados
        await page.waitForTimeout(50);

        // Coleta dados novamente após o delay
        const finalData = await collectRoundData(gameFrame);

        // Só registra se o multiplicador faz sentido (>= 1.0)
        if (finalData.multiplier >= 1.0) {
          // Para crashes 1.00x, usa os dados anteriores (antes do crash)
          const isCrash1x = finalData.multiplier <= 1.05;
          const betCount = isCrash1x ? lastBetCount : finalData.betCount;
          const totalBet = isCrash1x ? lastTotalBet : finalData.totalBet;
          const totalWin = isCrash1x ? 0 : finalData.totalWin;
          const source = isCrash1x ? 'crash-1x' : 'transição';

          console.log(`[Observer] Rodada detectada via ${source}: ${finalData.multiplier}x`);
          console.log(`[Observer] Apostadores: ${betCount} | Apostado: ${totalBet} | Ganho: ${totalWin}`);

          saveRound(finalData.multiplier, betCount, totalBet, totalWin, source);
        }
      }

      // Detecta início de nova rodada
      if (!wasRunning && isRunning) {
        console.log('[Observer] Nova rodada iniciada!');
        // Reseta contadores para a nova rodada
        lastBetCount = 0;
        lastTotalBet = 0;
        currentGameState.isRunning = true;
        currentGameState.isBettingPhase = false;
      }

      // Detecta início da fase de apostas (fim da rodada)
      if (wasRunning && !isRunning) {
        currentGameState.isRunning = false;
        currentGameState.isBettingPhase = true;
        currentGameState.lastMultiplier = data.multiplier;

        // Notifica que a fase de apostas começou
        if (onBettingPhaseCallback) {
          onBettingPhaseCallback({
            lastMultiplier: data.multiplier,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Guarda dados de aposta enquanto a rodada está ativa OU durante fase de apostas
      if (data.betCount > 0 && data.betCount > lastBetCount) {
        lastBetCount = data.betCount;
        lastTotalBet = data.totalBet;
      }

      // Debug: mostra histórico periodicamente (a cada 100 polls = ~10 segundos)
      if (Math.random() < 0.01 && currentHistory.length > 0) {
        console.log(`[Debug] Histórico atual: [${currentHistory.slice(0, 5).join(', ')}...] | Apostadores: ${currentBetCount}`);
      }

      wasRunning = isRunning;
      lastMultiplier = data.multiplier;
      lastHistory = currentHistory;

    } catch (err) {
      // Ignora erros de polling (pode acontecer durante navegação)
      if (!err.message.includes('Target closed') && !err.message.includes('Execution context')) {
        console.error('[Observer] Erro no polling:', err.message);
      }
    }
  }, 100); // Polling a cada 100ms (mais rápido para capturar crashes instantâneos)

  // Retorna contexto e função de limpeza
  return {
    context,
    page,
    cleanup: () => {
      clearInterval(pollInterval);
    }
  };
}

/**
 * Para o observer
 */
export async function stopObserver(observerResult) {
  if (observerResult) {
    if (observerResult.cleanup) {
      observerResult.cleanup();
    }
    if (observerResult.context) {
      await observerResult.context.close();
    }
    console.log('[Observer] Fechado');
  }
}

export default {
  startObserver,
  stopObserver,
  onNewRound
};
