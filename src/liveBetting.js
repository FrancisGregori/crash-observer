/**
 * Módulo de Apostas Reais
 * Controla a interação com a plataforma de apostas
 *
 * IMPORTANTE: Este módulo faz apostas REAIS com dinheiro REAL.
 * Use com extrema cautela.
 *
 * Fluxo:
 * 1. Coloca apostas durante a fase de apostas
 * 2. Durante o jogo, monitora o multiplicador
 * 3. Quando atinge o alvo, clica no botão de cashout
 */

// Estado do módulo
let gameFrame = null;
let mainPage = null; // Página principal (para ler saldo, etc)
let isEnabled = false;
let lastBetTime = 0;
const BET_COOLDOWN = 3000; // 3 segundos entre apostas

// Estado das apostas ativas
let activeBets = {
  bet1: { active: false, amount: 0, targetCashout: 0, cashedOut: false },
  bet2: { active: false, amount: 0, targetCashout: 0, cashedOut: false }
};

// Intervalo de monitoramento para cashout
let cashoutMonitorInterval = null;
const CASHOUT_MONITOR_INTERVAL = 50; // 50ms para reação rápida

// Callbacks
let onBetPlaced = null;
let onCashout = null;
let onRoundEnd = null;
let onError = null;
let onLog = null;

// Seletores da interface
const SELECTORS = {
  betContainer: '.crash-bet.crash__bet',
  betPanels: '.crash-bet__item',
  betInput: '.crash-bet-control__input',
  betButton: '.crash-bet-btn--play',
  clearButton: '.crash-bet-control__clear',
  multiplierDisplay: '.crash-game__counter',
  gameRunning: '.crash-game__mountains--game'
};

/**
 * Log com timestamp
 */
function log(message, type = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = `[LiveBet ${timestamp}]`;

  if (type === 'error') {
    console.error(prefix, message);
  } else if (type === 'warn') {
    console.warn(prefix, message);
  } else {
    console.log(prefix, message);
  }

  if (onLog) {
    onLog({ timestamp, message, type });
  }
}

/**
 * Configura o frame do jogo
 */
export function setGameFrame(frame) {
  gameFrame = frame;
}

/**
 * Configura a página principal (para ler saldo, etc)
 */
export function setMainPage(page) {
  mainPage = page;
}

/**
 * Ativa/desativa apostas reais
 */
export function setEnabled(enabled) {
  isEnabled = enabled;
  log(`Apostas reais ${enabled ? 'ATIVADAS' : 'DESATIVADAS'}`, enabled ? 'warn' : 'info');

  if (!enabled) {
    stopCashoutMonitor();
    resetActiveBets();
  }
}

/**
 * Verifica se apostas estão ativadas
 */
export function isLiveBettingEnabled() {
  return isEnabled;
}

/**
 * Define callbacks
 */
export function setCallbacks({ onPlaced, onCashoutDone, onEnd, onErr, onLogMsg }) {
  if (onPlaced) onBetPlaced = onPlaced;
  if (onCashoutDone) onCashout = onCashoutDone;
  if (onEnd) onRoundEnd = onEnd;
  if (onErr) onError = onErr;
  if (onLogMsg) onLog = onLogMsg;
}

/**
 * Reseta o estado das apostas ativas
 */
function resetActiveBets() {
  activeBets = {
    bet1: { active: false, amount: 0, targetCashout: 0, cashedOut: false },
    bet2: { active: false, amount: 0, targetCashout: 0, cashedOut: false }
  };
}

/**
 * Retorna o estado das apostas ativas
 */
export function getActiveBets() {
  return { ...activeBets };
}

/**
 * Verifica se está na fase de apostas (jogo não rodando)
 */
export async function isBettingPhase() {
  if (!gameFrame) return false;

  try {
    const isRunning = await gameFrame.evaluate(() => {
      const mountains = document.querySelector('.crash-game__mountains');
      return mountains?.classList.contains('crash-game__mountains--game') || false;
    });

    return !isRunning;
  } catch (err) {
    log(`Erro ao verificar fase: ${err.message}`, 'error');
    return false;
  }
}

/**
 * Obtém o multiplicador atual durante o jogo
 */
async function getCurrentMultiplier() {
  if (!gameFrame) return 0;

  try {
    const multiplier = await gameFrame.evaluate(() => {
      const counter = document.querySelector('.crash-game__counter');
      if (!counter) return 0;

      const text = counter.textContent?.trim() || '0';
      // Remove 'x' e converte para número
      const cleaned = text.replace(/x/gi, '').replace(',', '.').trim();
      return parseFloat(cleaned) || 0;
    });

    return multiplier;
  } catch (err) {
    return 0;
  }
}

/**
 * Verifica o estado do botão de um painel (pode apostar, pode fazer cashout, etc)
 */
async function getPanelButtonState(panelIndex) {
  if (!gameFrame) return { canBet: false, canCashout: false };

  try {
    return await gameFrame.evaluate((idx) => {
      const panels = document.querySelectorAll('.crash-bet__item');
      if (idx >= panels.length) {
        return { canBet: false, canCashout: false, error: 'Painel não encontrado' };
      }

      const panel = panels[idx];
      const button = panel.querySelector('.crash-bet-btn--play');

      if (!button) {
        return { canBet: false, canCashout: false, error: 'Botão não encontrado' };
      }

      const classList = button.className;
      const buttonText = button.textContent?.trim().toLowerCase() || '';

      // Estados possíveis do botão:
      // - crash-bet-btn--is-make: pode fazer aposta
      // - crash-bet-btn--is-cancel: pode cancelar aposta pendente
      // - crash-bet-btn--is-cashout ou texto "retirar": pode fazer cashout

      const canBet = classList.includes('crash-bet-btn--is-make');
      const canCancel = classList.includes('crash-bet-btn--is-cancel') ||
                       buttonText.includes('cancelar');
      const canCashout = classList.includes('crash-bet-btn--is-cashout') ||
                        buttonText.includes('retirar') ||
                        buttonText.includes('cashout') ||
                        buttonText.includes('cash out');

      // Tenta extrair valor atual do cashout se disponível
      let cashoutValue = null;
      const valueMatch = buttonText.match(/[\d.,]+/);
      if (valueMatch && canCashout) {
        cashoutValue = parseFloat(valueMatch[0].replace(',', '.'));
      }

      return {
        canBet,
        canCancel,
        canCashout,
        buttonText: buttonText.substring(0, 100),
        cashoutValue,
        classList
      };
    }, panelIndex);
  } catch (err) {
    return { canBet: false, canCashout: false, error: err.message };
  }
}

/**
 * Define o valor da aposta em um painel
 */
async function setBetAmount(panelIndex, amount) {
  if (!gameFrame) throw new Error('Frame não disponível');

  try {
    await gameFrame.evaluate(({ idx, amt }) => {
      const panels = document.querySelectorAll('.crash-bet__item');
      if (idx >= panels.length) throw new Error('Painel não encontrado');

      const panel = panels[idx];
      const input = panel.querySelector('.crash-bet-control__input');

      if (!input) throw new Error('Input não encontrado');

      // Foca no input
      input.focus();

      // Limpa o input
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Define o novo valor
      input.value = amt.toString();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Desfoca
      input.blur();

    }, { idx: panelIndex, amt: amount });

    log(`Painel ${panelIndex + 1}: Valor definido para R$${amount}`);
    return true;
  } catch (err) {
    log(`Erro ao definir valor no painel ${panelIndex + 1}: ${err.message}`, 'error');
    throw err;
  }
}

/**
 * Clica no botão de aposta/cashout de um painel
 */
async function clickPanelButton(panelIndex) {
  if (!gameFrame) throw new Error('Frame não disponível');

  try {
    await gameFrame.evaluate((idx) => {
      const panels = document.querySelectorAll('.crash-bet__item');
      if (idx >= panels.length) throw new Error('Painel não encontrado');

      const panel = panels[idx];
      const button = panel.querySelector('.crash-bet-btn--play');

      if (!button) throw new Error('Botão não encontrado');

      button.click();
    }, panelIndex);

    return true;
  } catch (err) {
    log(`Erro ao clicar botão no painel ${panelIndex + 1}: ${err.message}`, 'error');
    throw err;
  }
}

/**
 * Faz cashout em um painel específico
 */
async function doCashout(panelIndex, currentMultiplier) {
  const betKey = panelIndex === 0 ? 'bet1' : 'bet2';

  if (!activeBets[betKey].active || activeBets[betKey].cashedOut) {
    return false;
  }

  const state = await getPanelButtonState(panelIndex);

  if (!state.canCashout) {
    log(`Painel ${panelIndex + 1}: Cashout não disponível`, 'warn');
    return false;
  }

  try {
    await clickPanelButton(panelIndex);

    activeBets[betKey].cashedOut = true;
    const profit = activeBets[betKey].amount * currentMultiplier;

    log(`✅ CASHOUT Painel ${panelIndex + 1}: ${currentMultiplier}x (R$${profit.toFixed(2)})`);

    if (onCashout) {
      onCashout({
        panel: panelIndex + 1,
        multiplier: currentMultiplier,
        amount: activeBets[betKey].amount,
        profit: profit
      });
    }

    return true;
  } catch (err) {
    log(`Erro no cashout painel ${panelIndex + 1}: ${err.message}`, 'error');
    return false;
  }
}

/**
 * Monitora o jogo para fazer cashout nos momentos certos
 */
function startCashoutMonitor() {
  if (cashoutMonitorInterval) {
    clearInterval(cashoutMonitorInterval);
  }

  log('Iniciando monitoramento de cashout...');

  cashoutMonitorInterval = setInterval(async () => {
    if (!isEnabled) {
      stopCashoutMonitor();
      return;
    }

    // Verifica se o jogo ainda está rodando
    const betting = await isBettingPhase();
    if (betting) {
      // Jogo terminou (fase de apostas voltou)
      stopCashoutMonitor();
      handleRoundEnd();
      return;
    }

    // Obtém multiplicador atual
    const multiplier = await getCurrentMultiplier();

    if (multiplier <= 0) return;

    // Verifica cashout da aposta 1
    if (activeBets.bet1.active && !activeBets.bet1.cashedOut) {
      if (multiplier >= activeBets.bet1.targetCashout) {
        await doCashout(0, multiplier);
      }
    }

    // Verifica cashout da aposta 2
    if (activeBets.bet2.active && !activeBets.bet2.cashedOut) {
      if (multiplier >= activeBets.bet2.targetCashout) {
        await doCashout(1, multiplier);
      }
    }

    // Se ambas já fizeram cashout, para o monitor
    if (activeBets.bet1.cashedOut && activeBets.bet2.cashedOut) {
      log('Ambos cashouts realizados!');
      stopCashoutMonitor();
    }

  }, CASHOUT_MONITOR_INTERVAL);
}

/**
 * Para o monitoramento de cashout
 */
function stopCashoutMonitor() {
  if (cashoutMonitorInterval) {
    clearInterval(cashoutMonitorInterval);
    cashoutMonitorInterval = null;
    log('Monitoramento de cashout parado');
  }
}

/**
 * Trata o fim da rodada
 */
function handleRoundEnd() {
  log('Rodada finalizada');

  // Calcula resultado
  let totalBet = 0;
  let totalWin = 0;

  if (activeBets.bet1.active) {
    totalBet += activeBets.bet1.amount;
    if (activeBets.bet1.cashedOut) {
      totalWin += activeBets.bet1.amount * activeBets.bet1.targetCashout;
    }
  }

  if (activeBets.bet2.active) {
    totalBet += activeBets.bet2.amount;
    if (activeBets.bet2.cashedOut) {
      totalWin += activeBets.bet2.amount * activeBets.bet2.targetCashout;
    }
  }

  const profit = totalWin - totalBet;

  if (onRoundEnd) {
    onRoundEnd({
      bet1: { ...activeBets.bet1 },
      bet2: { ...activeBets.bet2 },
      totalBet,
      totalWin,
      profit
    });
  }

  // Reseta para próxima rodada
  resetActiveBets();
}

/**
 * Coloca uma aposta em um painel
 */
async function placeSingleBet(panelIndex, amount, targetCashout) {
  const betKey = panelIndex === 0 ? 'bet1' : 'bet2';

  // Verifica se pode apostar
  const state = await getPanelButtonState(panelIndex);

  if (!state.canBet) {
    throw new Error(`Painel ${panelIndex + 1}: ${state.error || 'Não pode apostar agora'}`);
  }

  // Define o valor
  await setBetAmount(panelIndex, amount);

  // Pequena pausa para processamento
  await new Promise(r => setTimeout(r, 150));

  // Clica no botão de aposta
  await clickPanelButton(panelIndex);

  // Atualiza estado
  activeBets[betKey] = {
    active: true,
    amount: amount,
    targetCashout: targetCashout,
    cashedOut: false
  };

  log(`🎰 Aposta ${panelIndex + 1}: R$${amount} -> alvo ${targetCashout}x`);

  return true;
}

/**
 * Coloca aposta dupla (nos dois painéis)
 */
export async function placeDoubleBet(amount1, cashout1, amount2, cashout2) {
  if (!isEnabled) {
    throw new Error('Apostas reais desativadas! Ative primeiro.');
  }

  if (!gameFrame) {
    throw new Error('Frame do jogo não disponível');
  }

  // Verifica se está na fase de apostas
  const betting = await isBettingPhase();
  if (!betting) {
    throw new Error('Jogo em andamento! Aguarde a fase de apostas.');
  }

  // Verifica cooldown
  const now = Date.now();
  if (now - lastBetTime < BET_COOLDOWN) {
    const wait = Math.ceil((BET_COOLDOWN - (now - lastBetTime)) / 1000);
    throw new Error(`Aguarde ${wait}s entre apostas`);
  }

  log('═'.repeat(50));
  log('INICIANDO APOSTA DUPLA');
  log(`Aposta 1: R$${amount1} -> cashout em ${cashout1}x`);
  log(`Aposta 2: R$${amount2} -> cashout em ${cashout2}x`);
  log('═'.repeat(50));

  try {
    // Primeira aposta
    await placeSingleBet(0, amount1, cashout1);

    // Pausa entre apostas
    await new Promise(r => setTimeout(r, 300));

    // Segunda aposta
    await placeSingleBet(1, amount2, cashout2);

    lastBetTime = now;

    // Notifica
    if (onBetPlaced) {
      onBetPlaced({
        bet1: { amount: amount1, targetCashout: cashout1 },
        bet2: { amount: amount2, targetCashout: cashout2 },
        totalAmount: amount1 + amount2
      });
    }

    // Inicia monitoramento de cashout (vai começar quando o jogo iniciar)
    log('Apostas colocadas! Aguardando início do jogo...');

    // Aguarda o jogo começar e inicia monitor
    waitForGameStart();

    return {
      success: true,
      bet1: { amount: amount1, targetCashout: cashout1 },
      bet2: { amount: amount2, targetCashout: cashout2 }
    };

  } catch (err) {
    log(`Erro na aposta dupla: ${err.message}`, 'error');

    if (onError) {
      onError({ message: err.message, activeBets: { ...activeBets } });
    }

    throw err;
  }
}

/**
 * Aguarda o jogo começar e inicia o monitor de cashout
 */
async function waitForGameStart() {
  log('Aguardando jogo iniciar...');

  const checkInterval = setInterval(async () => {
    if (!isEnabled) {
      clearInterval(checkInterval);
      return;
    }

    const betting = await isBettingPhase();

    if (!betting) {
      // Jogo começou!
      clearInterval(checkInterval);
      log('Jogo iniciado! Monitorando cashouts...');
      startCashoutMonitor();
    }
  }, 100);

  // Timeout de segurança (30 segundos)
  setTimeout(() => {
    clearInterval(checkInterval);
  }, 30000);
}

/**
 * Obtém informações de debug
 */
export async function getDebugInfo() {
  if (!gameFrame) return { error: 'Frame não disponível' };

  try {
    const info = await gameFrame.evaluate(() => {
      const panels = document.querySelectorAll('.crash-bet__item');
      const result = {
        panelCount: panels.length,
        panels: [],
        gameRunning: false,
        currentMultiplier: '0'
      };

      panels.forEach((panel, idx) => {
        const input = panel.querySelector('.crash-bet-control__input');
        const button = panel.querySelector('.crash-bet-btn--play');

        result.panels.push({
          index: idx,
          inputValue: input?.value || '',
          buttonText: button?.textContent?.trim().substring(0, 80) || '',
          buttonClasses: button?.className || ''
        });
      });

      const mountains = document.querySelector('.crash-game__mountains');
      result.gameRunning = mountains?.classList.contains('crash-game__mountains--game') || false;

      const counter = document.querySelector('.crash-game__counter');
      result.currentMultiplier = counter?.textContent?.trim() || '0';

      return result;
    });

    return {
      ...info,
      isEnabled,
      activeBets: { ...activeBets }
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Cancela apostas pendentes
 */
export async function cancelPendingBets() {
  log('Tentando cancelar apostas pendentes...');

  for (let i = 0; i < 2; i++) {
    const state = await getPanelButtonState(i);
    if (state.canCancel) {
      try {
        await clickPanelButton(i);
        log(`Aposta ${i + 1} cancelada`);
      } catch (err) {
        log(`Erro ao cancelar aposta ${i + 1}: ${err.message}`, 'error');
      }
    }
  }

  stopCashoutMonitor();
  resetActiveBets();
}

/**
 * Lê o histórico de apostas da tabela da plataforma
 * Retorna as apostas mais recentes com os valores reais de ganho/perda
 */
export async function getBettingHistory(limit = 30) {
  if (!gameFrame) {
    log('Frame não disponível para ler histórico', 'warn');
    return { success: false, error: 'Frame não disponível', history: [] };
  }

  try {
    const history = await gameFrame.evaluate((maxRows) => {
      const table = document.querySelector('.crash-history-table.crash-history__table');
      if (!table) {
        return { error: 'Tabela de histórico não encontrada' };
      }

      const rows = table.querySelectorAll('.crash-history-table__row:not(.crash-history-table__row--header)');
      const results = [];

      for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('.crash-history-table__cell');

        if (cells.length >= 7) {
          const isWin = row.classList.contains('crash-history-table__row--win');
          const isLose = row.classList.contains('crash-history-table__row--lose');

          // Extrai os valores das células
          const date = cells[0].textContent.trim();
          const time = cells[1].textContent.trim();
          const roundId = cells[2].textContent.trim();
          const betText = cells[3].textContent.trim(); // "2 BRL"
          const cashoutText = cells[4].textContent.trim(); // "x2.18" ou "x0"
          const winText = cells[5].textContent.trim(); // "4.36 BRL" ou "0 BRL"
          const crashText = cells[6].textContent.trim(); // "x2.03"

          // Parse dos valores numéricos
          const betAmount = parseFloat(betText.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
          const cashoutMultiplier = parseFloat(cashoutText.replace(/[x,]/gi, '.').replace('..', '.')) || 0;
          const winAmount = parseFloat(winText.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
          const crashMultiplier = parseFloat(crashText.replace(/[x,]/gi, '.').replace('..', '.')) || 0;

          results.push({
            date,
            time,
            roundId,
            betAmount,
            cashoutMultiplier,
            winAmount,
            crashMultiplier,
            isWin,
            isLose,
            profit: winAmount - betAmount
          });
        }
      }

      return { history: results };
    }, limit);

    if (history.error) {
      return { success: false, error: history.error, history: [] };
    }

    log(`Histórico lido: ${history.history.length} entradas`);
    return { success: true, history: history.history };

  } catch (err) {
    log(`Erro ao ler histórico: ${err.message}`, 'error');
    return { success: false, error: err.message, history: [] };
  }
}

/**
 * Calcula o resumo das apostas recentes
 * Agrupa por rodada (mesmo roundId) e calcula totais
 */
export async function getBettingSummary(limit = 30) {
  const result = await getBettingHistory(limit);

  if (!result.success) {
    return result;
  }

  // Agrupa por roundId
  const roundsMap = new Map();

  for (const bet of result.history) {
    if (!roundsMap.has(bet.roundId)) {
      roundsMap.set(bet.roundId, {
        roundId: bet.roundId,
        date: bet.date,
        time: bet.time,
        crashMultiplier: bet.crashMultiplier,
        bets: [],
        totalBet: 0,
        totalWin: 0,
        profit: 0
      });
    }

    const round = roundsMap.get(bet.roundId);
    round.bets.push(bet);
    round.totalBet += bet.betAmount;
    round.totalWin += bet.winAmount;
    round.profit = round.totalWin - round.totalBet;
  }

  // Converte para array e ordena por tempo (mais recente primeiro)
  const rounds = Array.from(roundsMap.values());

  // Calcula totais gerais
  const summary = {
    totalRounds: rounds.length,
    totalBets: result.history.length,
    totalWagered: rounds.reduce((sum, r) => sum + r.totalBet, 0),
    totalWon: rounds.reduce((sum, r) => sum + r.totalWin, 0),
    totalProfit: rounds.reduce((sum, r) => sum + r.profit, 0),
    winningRounds: rounds.filter(r => r.profit > 0).length,
    losingRounds: rounds.filter(r => r.profit < 0).length,
    rounds
  };

  return { success: true, summary };
}

/**
 * Lê o saldo atual da plataforma
 * O saldo está na página principal, não no iframe do jogo
 * @returns {Promise<{success: boolean, balance?: number, currency?: string, error?: string}>}
 */
export async function getPlatformBalance() {
  if (!mainPage) {
    return { success: false, error: 'Página principal não disponível' };
  }

  try {
    const result = await mainPage.evaluate(() => {
      // Seletor para o container de saldo (está na página principal, não no iframe)
      const balanceContainer = document.querySelector('.double-row-header-balance-info__currency');

      if (!balanceContainer) {
        return { success: false, error: 'Container de saldo não encontrado' };
      }

      const spans = balanceContainer.querySelectorAll('span.ui-caption');

      if (spans.length < 2) {
        return { success: false, error: 'Elementos de saldo não encontrados' };
      }

      const currency = spans[0].textContent.trim();
      const balanceText = spans[1].textContent.trim();
      const balance = parseFloat(balanceText.replace(',', '.'));

      if (isNaN(balance)) {
        return { success: false, error: `Saldo inválido: ${balanceText}` };
      }

      return { success: true, balance, currency };
    });

    if (result.success) {
      log(`Saldo da plataforma: ${result.currency} ${result.balance.toFixed(2)}`);
    }

    return result;
  } catch (err) {
    log(`Erro ao ler saldo: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

export default {
  setGameFrame,
  setMainPage,
  setEnabled,
  isLiveBettingEnabled,
  setCallbacks,
  getActiveBets,
  isBettingPhase,
  placeDoubleBet,
  cancelPendingBets,
  getDebugInfo,
  getBettingHistory,
  getBettingSummary,
  getPlatformBalance
};
