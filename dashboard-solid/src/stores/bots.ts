import { createStore } from 'solid-js/store';
import type {
  BotId,
  BotState,
  BotConfig,
  BotRiskState,
  BotDecision,
  BotActiveBet,
  BotHistoryItem,
  RoundData,
  MLPrediction,
  BotSessionRecord,
  SavedBotConfig,
} from '../types';
import {
  createDefaultBotState,
  createDefaultBotConfig,
  createDefaultBotRiskState,
} from '../types';
import {
  makeBotDecision,
  createBetFromDecision,
  resolveBet,
  createHistoryItem,
} from '../lib/botLogic';
import {
  placeLiveBet,
  fetchPlatformHistory,
  fetchPlatformBalance,
  enableLiveBetting,
  randomizeCashout,
  saveBotBet,
  startBotSession,
  endBotSession,
  type BotBetRecord,
} from '../lib/api';
import { getCurrentSignal, type SequenceSignal } from './sequence';

// Storage keys
const STORAGE_KEYS = {
  bot1: {
    state: 'crash_bot1_state',
    config: 'crash_bot1_config',
    riskState: 'crash_bot1_risk_state',
  },
  bot2: {
    state: 'crash_bot2_state',
    config: 'crash_bot2_config',
    riskState: 'crash_bot2_risk_state',
  },
  sessionHistory: 'crash_bot_session_history',
  savedConfigs: 'crash_bot_saved_configs',
};

interface BotsStoreState {
  bot1: {
    state: BotState;
    config: BotConfig;
    riskState: BotRiskState;
  };
  bot2: {
    state: BotState;
    config: BotConfig;
    riskState: BotRiskState;
  };
  activeBotTab: BotId;
  sessionHistory: BotSessionRecord[];
  savedConfigs: SavedBotConfig[];
}

// Load bot data from localStorage
function loadBotState(botId: BotId): BotState {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS[botId].state);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...createDefaultBotState(botId), ...parsed, active: false, liveMode: false };
    }
  } catch (e) {
    console.error(`Error loading ${botId} state:`, e);
  }
  return createDefaultBotState(botId);
}

function loadBotConfig(botId: BotId): BotConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS[botId].config);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...createDefaultBotConfig(botId), ...parsed };
    }
  } catch (e) {
    console.error(`Error loading ${botId} config:`, e);
  }
  return createDefaultBotConfig(botId);
}

function loadBotRiskState(botId: BotId): BotRiskState {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS[botId].riskState);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...createDefaultBotRiskState(botId), ...parsed };
    }
  } catch (e) {
    console.error(`Error loading ${botId} risk state:`, e);
  }
  return createDefaultBotRiskState(botId);
}

// Save functions
function saveBotState(botId: BotId, state: BotState) {
  try {
    localStorage.setItem(STORAGE_KEYS[botId].state, JSON.stringify(state));
  } catch (e) {
    console.error(`Error saving ${botId} state:`, e);
  }
}

function saveBotConfig(botId: BotId, config: BotConfig) {
  try {
    localStorage.setItem(STORAGE_KEYS[botId].config, JSON.stringify(config));
  } catch (e) {
    console.error(`Error saving ${botId} config:`, e);
  }
}

function saveBotRiskState(botId: BotId, riskState: BotRiskState) {
  try {
    localStorage.setItem(STORAGE_KEYS[botId].riskState, JSON.stringify(riskState));
  } catch (e) {
    console.error(`Error saving ${botId} risk state:`, e);
  }
}

// Load/Save session history
function loadSessionHistory(): BotSessionRecord[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.sessionHistory);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading session history:', e);
  }
  return [];
}

function saveSessionHistory(history: BotSessionRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.sessionHistory, JSON.stringify(history));
  } catch (e) {
    console.error('Error saving session history:', e);
  }
}

// Load/Save saved configs
function loadSavedConfigs(): SavedBotConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.savedConfigs);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading saved configs:', e);
  }
  return [];
}

function saveSavedConfigs(configs: SavedBotConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.savedConfigs, JSON.stringify(configs));
  } catch (e) {
    console.error('Error saving configs:', e);
  }
}

// Initialize store
const initialState: BotsStoreState = {
  bot1: {
    state: loadBotState('bot1'),
    config: loadBotConfig('bot1'),
    riskState: loadBotRiskState('bot1'),
  },
  bot2: {
    state: loadBotState('bot2'),
    config: loadBotConfig('bot2'),
    riskState: loadBotRiskState('bot2'),
  },
  activeBotTab: 'bot1',
  sessionHistory: loadSessionHistory(),
  savedConfigs: loadSavedConfigs(),
};

const [state, setState] = createStore<BotsStoreState>(initialState);

export const botsStore = state;

// Tab actions
export function setActiveBotTab(botId: BotId) {
  setState('activeBotTab', botId);
}

// State actions
export function setBotState(botId: BotId, newState: Partial<BotState>) {
  setState(botId, 'state', (prev) => ({ ...prev, ...newState }));
  saveBotState(botId, state[botId].state);
}

export function setBotBalance(botId: BotId, balance: number) {
  setState(botId, 'state', 'balance', balance);
  // Update min/max balance
  if (balance < state[botId].state.minBalance) {
    setState(botId, 'state', 'minBalance', balance);
  }
  if (balance > state[botId].state.maxBalance) {
    setState(botId, 'state', 'maxBalance', balance);
  }
  saveBotState(botId, state[botId].state);
}

export async function setBotActive(botId: BotId, active: boolean): Promise<boolean | string> {
  const botState = state[botId].state;
  const botConfig = state[botId].config;

  // If activating
  if (active && !botState.active) {
    // If live mode is on, enable live betting in backend first
    if (botState.liveMode) {
      console.log(`[Bot ${botId}] Enabling live betting in backend...`);
      const result = await enableLiveBetting(true);
      if (!result.success) {
        const errorMsg = result.error || 'Erro desconhecido';
        console.error(`[Bot ${botId}] Failed to enable live betting:`, errorMsg);
        return `Falha ao ativar live betting: ${errorMsg}`;
      }

      // Sync balance from platform
      await syncPlatformBalance(botId);
    }

    setState(botId, 'state', 'sessionStartTime', Date.now());
    // Reset min/max balance to current balance at session start
    setState(botId, 'state', 'minBalance', state[botId].state.balance);
    setState(botId, 'state', 'maxBalance', state[botId].state.balance);
    setState(botId, 'state', 'initialBalance', state[botId].state.balance);
    // Reset stats for new session
    setState(botId, 'state', 'stats', {
      totalBets: 0,
      wins: 0,
      partials: 0,
      losses: 0,
      totalWagered: 0,
      totalProfit: 0,
    });
    // Clear history for new session (old history is preserved in DB)
    setState(botId, 'state', 'history', []);

    // Start new session in database
    try {
      const sessionResult = await startBotSession({
        botId,
        initialBalance: state[botId].state.balance,
        strategyMode: botConfig.strategy?.mode || 'unknown',
      });
      if (sessionResult.success && sessionResult.sessionId) {
        setState(botId, 'state', 'dbSessionId', sessionResult.sessionId);
        console.log(`[Bot ${botId}] Sessão iniciada no banco: ID ${sessionResult.sessionId}`);
      }
    } catch (err) {
      console.error(`[Bot ${botId}] Erro ao iniciar sessão no banco:`, err);
    }
  }

  // If deactivating and was active
  if (!active && botState.active) {
    // Save session record (local + database)
    if (botState.sessionStartTime) {
      await saveSessionRecord(botId);
    }

    // If was in live mode, disable live betting in backend
    if (botState.liveMode) {
      console.log(`[Bot ${botId}] Disabling live betting in backend...`);
      await enableLiveBetting(false);
    }

    // Clear dbSessionId
    setState(botId, 'state', 'dbSessionId', null);
  }

  setState(botId, 'state', 'active', active);
  saveBotState(botId, state[botId].state);
  return true;
}

export function setBotLiveMode(botId: BotId, liveMode: boolean) {
  setState(botId, 'state', 'liveMode', liveMode);
  saveBotState(botId, state[botId].state);
}

export function setBotDecision(botId: BotId, decision: BotDecision | null) {
  setState(botId, 'state', 'lastDecision', decision);
}

export function setBotActiveBet(botId: BotId, bet: BotActiveBet | null) {
  setState(botId, 'state', 'activeBet', bet);
  saveBotState(botId, state[botId].state);
}

export function addBotHistoryItem(botId: BotId, item: BotHistoryItem) {
  setState(botId, 'state', 'history', (prev) => [item, ...prev].slice(0, 100));
  saveBotState(botId, state[botId].state);
}

export function updateBotStats(
  botId: BotId,
  won1: boolean,
  won2: boolean,
  wagered: number,
  profit: number
) {
  // Win = both bets won, Partial = only first won, Loss = neither won
  const isWin = won1 && won2;
  const isPartial = won1 && !won2;
  const isLoss = !won1 && !won2;

  setState(botId, 'state', 'stats', (prev) => ({
    ...prev,
    totalBets: prev.totalBets + 1,
    wins: prev.wins + (isWin ? 1 : 0),
    partials: prev.partials + (isPartial ? 1 : 0),
    losses: prev.losses + (isLoss ? 1 : 0),
    totalWagered: prev.totalWagered + wagered,
    totalProfit: prev.totalProfit + profit,
  }));
  saveBotState(botId, state[botId].state);
}

// Config actions
export function setBotConfig(botId: BotId, config: Partial<BotConfig>) {
  setState(botId, 'config', (prev) => ({ ...prev, ...config }));
  saveBotConfig(botId, state[botId].config);
}

export function setBotBetAmount(botId: BotId, amount: number) {
  setState(botId, 'config', 'betAmount', amount);
  saveBotConfig(botId, state[botId].config);
}

// Risk state actions
export function setBotRiskState(botId: BotId, riskState: Partial<BotRiskState>) {
  setState(botId, 'riskState', (prev) => ({ ...prev, ...riskState }));
  saveBotRiskState(botId, state[botId].riskState);
}

export function resetBotRiskState(botId: BotId) {
  const newRiskState = createDefaultBotRiskState(botId, state[botId].state.balance);
  setState(botId, 'riskState', newRiskState);
  saveBotRiskState(botId, newRiskState);
}

// Reset bot
export function resetBot(botId: BotId, saveSession: boolean = true) {
  // Save session record if bot had an active session
  if (saveSession && state[botId].state.sessionStartTime && state[botId].state.stats.totalBets > 0) {
    saveSessionRecord(botId);
  }

  const defaultState = createDefaultBotState(botId);
  setState(botId, 'state', defaultState);
  saveBotState(botId, defaultState);
  resetBotRiskState(botId);
}

// Get combined stats
export function getCombinedStats() {
  const bot1 = state.bot1.state;
  const bot2 = state.bot2.state;

  return {
    totalBalance: bot1.balance + bot2.balance,
    totalProfit: bot1.stats.totalProfit + bot2.stats.totalProfit,
    totalBets: bot1.stats.totalBets + bot2.stats.totalBets,
    totalWins: bot1.stats.wins + bot2.stats.wins,
  };
}

// Sync balance from platform (for live mode)
export async function syncPlatformBalance(botId: BotId, forceSync: boolean = false): Promise<boolean> {
  const botState = state[botId].state;

  // Only sync in live mode (or if forced)
  if (!botState.liveMode && !forceSync) {
    return false;
  }

  console.log(`[Bot ${botId}] Fetching platform balance...`);

  const result = await fetchPlatformBalance();

  if (result.success && typeof result.balance === 'number') {
    const oldBalance = botState.balance;
    setBotBalance(botId, result.balance);
    console.log(`[Bot ${botId}] Balance synced: ${oldBalance.toFixed(2)} -> ${result.balance.toFixed(2)}`);
    return true;
  } else {
    console.error(`[Bot ${botId}] Failed to sync balance:`, result.error);
    return false;
  }
}

// Process a new round for all active bots
export async function processBotRound(
  round: RoundData,
  rounds: RoundData[],
  mlPrediction?: MLPrediction | null
) {
  const botIds: BotId[] = ['bot1', 'bot2'];

  for (const botId of botIds) {
    const botState = state[botId].state;
    const botConfig = state[botId].config;
    const riskState = state[botId].riskState;

    // Skip if bot is not active
    if (!botState.active) continue;

    console.log(`[Bot ${botId}] Processando rodada #${round.id}`);

    // 1. Resolve active bet if exists
    if (botState.activeBet) {
      const bet = botState.activeBet;
      let won1 = false;
      let won2 = false;
      let profit = 0;
      let resultText = '';
      let winnings = 0;

      // In LIVE mode, fetch real results from platform
      if (bet.isLive) {
        console.log(`[Bot ${botId}] LIVE MODE: Fetching real results from platform...`);

        // Wait a bit for platform to update
        await new Promise((r) => setTimeout(r, 1000));

        const historyResult = await fetchPlatformHistory();

        if (historyResult.success && historyResult.history && historyResult.history.length >= 2) {
          const bet1Data = historyResult.history[0];
          const bet2Data = historyResult.history[1];

          console.log(`[Bot ${botId}] Platform data:`, { bet1: bet1Data, bet2: bet2Data });

          won1 = bet1Data.isWin;
          won2 = bet2Data.isWin;
          winnings = bet1Data.winAmount + bet2Data.winAmount;
          profit = winnings - bet.amount * 2;

          if (won1 && won2) {
            resultText = `Ganhou ${bet1Data.cashoutMultiplier.toFixed(2)}x + ${bet2Data.cashoutMultiplier.toFixed(2)}x`;
          } else if (won1) {
            resultText = `Parcial: ${bet1Data.cashoutMultiplier.toFixed(2)}x (${bet.cashout2.toFixed(2)}x perdeu)`;
          } else {
            resultText = `Perdeu (Crash: ${round.multiplier.toFixed(2)}x)`;
          }

          console.log(
            `[Bot ${botId}] REAL RESULTS: Bet1=${won1 ? 'WON' : 'LOST'}, Bet2=${won2 ? 'WON' : 'LOST'}, Total=R$${winnings.toFixed(2)}`
          );
        } else {
          // Fallback to simulation if can't get real data
          console.warn(`[Bot ${botId}] Could not get real data, using simulation calculation`);
          const result = resolveBet(bet, round.multiplier);
          won1 = result.won1;
          won2 = result.won2;
          profit = result.profit;
          resultText = result.resultText;
        }

        // Sync balance from platform after bet resolves
        await syncPlatformBalance(botId);
      } else {
        // Simulation mode - use calculated results
        const result = resolveBet(bet, round.multiplier);
        won1 = result.won1;
        won2 = result.won2;
        profit = result.profit;
        resultText = result.resultText;

        // Update balance locally for simulation
        const newBalance = botState.balance + profit;
        setBotBalance(botId, newBalance);
      }

      // Create history item
      const historyItem = createHistoryItem(
        bet,
        round.multiplier,
        profit,
        won1,
        won2,
        resultText,
        botState.balance
      );

      // Update stats (passing both won1 and won2 for V/P/D tracking)
      updateBotStats(botId, won1, won2, bet.amount * 2, profit);

      // Add to history
      addBotHistoryItem(botId, historyItem);

      // Save bet to database for ML training
      const betRecord: BotBetRecord = {
        bot_id: botId,
        session_id: botState.dbSessionId || undefined,
        round_id: round.id,
        timestamp: bet.timestamp,
        bet_amount: bet.amount,
        cashout1: bet.cashout1,
        cashout2: bet.cashout2,
        round_multiplier: round.multiplier,
        won1,
        won2,
        profit,
        balance_after: botState.balance,
        is_high_opportunity: bet.isHighOpportunity,
        strategy_mode: botConfig.strategy?.mode || 'unknown',
        ml_confidence: mlPrediction?.prob_gt_2x || undefined,
      };

      // Fire and forget - don't wait for response
      saveBotBet(betRecord).catch((err) => {
        console.error(`[Bot ${botId}] Failed to save bet to DB:`, err);
      });

      // Update risk state (won = at least one bet won for streak tracking)
      const won = won1 || won2;
      updateRiskStateAfterBet(botId, won, profit);

      // Clear active bet
      setBotActiveBet(botId, null);

      console.log(`[Bot ${botId}] Resultado: ${resultText}, Lucro: ${profit.toFixed(2)}`);
    }

    // 2. Check risk conditions (stop loss, take profit, insufficient balance, pause)
    if (riskState.stopLossTriggered || riskState.takeProfitTriggered || riskState.insufficientBalanceTriggered) {
      console.log(`[Bot ${botId}] Stop loss, take profit ou saldo insuficiente atingido`);
      continue;
    }

    // Check for insufficient balance (need 2x minBetAmount for double bet)
    const minRequiredBalance = botConfig.minBetAmount * 2;
    if (botState.balance < minRequiredBalance) {
      console.log(`[Bot ${botId}] ⚠️ SALDO INSUFICIENTE: R$${botState.balance.toFixed(2)} < R$${minRequiredBalance.toFixed(2)} mínimo`);
      setBotRiskState(botId, { insufficientBalanceTriggered: true });
      continue;
    }

    // Handle pause countdown
    if (riskState.isPaused && riskState.pauseRoundsRemaining > 0) {
      setBotRiskState(botId, {
        pauseRoundsRemaining: riskState.pauseRoundsRemaining - 1,
        isPaused: riskState.pauseRoundsRemaining - 1 > 0,
      });
      if (riskState.pauseRoundsRemaining - 1 > 0) {
        console.log(`[Bot ${botId}] Pausado, ${riskState.pauseRoundsRemaining - 1} rodadas restantes`);
        continue;
      }
    }

    // 3. Make decision for next round
    // Get current sequence signal for decision making
    const sequenceSignal = getCurrentSignal();

    const decision = makeBotDecision(
      rounds,
      botState,
      botConfig,
      riskState,
      mlPrediction,
      sequenceSignal
    );

    // Update decision in state
    setBotDecision(botId, decision);

    console.log(`[Bot ${botId}] Decisão: ${decision.shouldBet ? 'APOSTAR' : 'PULAR'}`, decision.reasons);

    // 4. Create bet if decision says to bet
    if (decision.shouldBet) {
      const newBet = createBetFromDecision(decision, botState.liveMode);
      if (newBet) {
        // Apply Safety First if enabled
        // Safety First: first bet always exits at ~2x to recover investment
        const safetyFirst = botConfig.safetyFirst;
        if (safetyFirst?.enabled) {
          // Calculate random cashout between min and max
          const safetyCashout = safetyFirst.minCashout +
            Math.random() * (safetyFirst.maxCashout - safetyFirst.minCashout);
          const roundedSafetyCashout = Math.round(safetyCashout * 100) / 100;

          console.log(
            `[Bot ${botId}] Safety First: Cashout1 ${newBet.cashout1.toFixed(2)}x -> ${roundedSafetyCashout}x (hedge)`
          );

          newBet.cashout1 = roundedSafetyCashout;
          newBet.baseCashout1 = roundedSafetyCashout;
        }

        // In LIVE mode, place real bet via API
        if (botState.liveMode) {
          // Randomize cashouts slightly (like original dashboard)
          // For Safety First, keep cashout1 in the safe range
          const randomCashout1 = safetyFirst?.enabled
            ? randomizeCashout(newBet.cashout1, 0.01, 0.03) // Smaller variance for safety
            : randomizeCashout(newBet.cashout1, 0.01, 0.05);
          const randomCashout2 = randomizeCashout(newBet.cashout2, 0.01, 0.05);

          console.log(
            `[Bot ${botId}] Placing REAL bet: R$${newBet.amount.toFixed(2)} x2 | Targets: ${randomCashout1}x and ${randomCashout2}x${safetyFirst?.enabled ? ' (SAFETY FIRST)' : ''}`
          );

          const result = await placeLiveBet(
            newBet.amount,
            randomCashout1,
            newBet.amount,
            randomCashout2
          );

          if (!result.success) {
            console.error(`[Bot ${botId}] Failed to place real bet:`, result.error);
            continue; // Skip this bet, don't store it
          }

          // Update bet with randomized cashouts
          newBet.cashout1 = randomCashout1;
          newBet.cashout2 = randomCashout2;
        }

        setBotActiveBet(botId, newBet);
        console.log(
          `[Bot ${botId}] Bet created: R$${newBet.amount.toFixed(2)} @ ${newBet.cashout1}x / ${newBet.cashout2}x${botState.liveMode ? ' (LIVE)' : ' (SIM)'}${safetyFirst?.enabled ? ' [HEDGE]' : ''}`
        );
      }
    }
  }
}

// Update risk state after bet resolution
function updateRiskStateAfterBet(botId: BotId, won: boolean, profit: number) {
  const riskState = state[botId].riskState;
  const botConfig = state[botId].config;
  const botState = state[botId].state;

  const newConsecutiveLosses = won ? 0 : riskState.consecutiveLosses + 1;
  const newConsecutiveWins = won ? riskState.consecutiveWins + 1 : 0;
  const newSessionProfit = riskState.sessionProfit + profit;

  // Check stop loss
  let stopLossTriggered = riskState.stopLossTriggered;
  if (botConfig.stopLoss.enabled) {
    const lossPercent = ((riskState.sessionStartBalance - botState.balance) / riskState.sessionStartBalance) * 100;
    if (lossPercent >= botConfig.stopLoss.percent) {
      stopLossTriggered = true;
      console.log(`[Bot ${botId}] Stop Loss atingido: ${lossPercent.toFixed(1)}%`);
    }
  }

  // Check take profit
  let takeProfitTriggered = riskState.takeProfitTriggered;
  if (botConfig.takeProfit.enabled) {
    const profitPercent = ((botState.balance - riskState.sessionStartBalance) / riskState.sessionStartBalance) * 100;
    if (profitPercent >= botConfig.takeProfit.percent) {
      takeProfitTriggered = true;
      console.log(`[Bot ${botId}] Take Profit atingido: ${profitPercent.toFixed(1)}%`);
    }
  }

  // Check pause on consecutive losses
  let isPaused = false;
  let pauseRoundsRemaining = 0;
  const rulesConfig = botConfig.strategy?.rulesStrategy?.rules?.consecutiveLosses;
  if (rulesConfig?.enabled && newConsecutiveLosses >= rulesConfig.maxConsecutive) {
    isPaused = true;
    pauseRoundsRemaining = rulesConfig.pauseRounds || 2;
    console.log(`[Bot ${botId}] Pausado por ${pauseRoundsRemaining} rodadas após ${newConsecutiveLosses} perdas`);
  }

  setBotRiskState(botId, {
    consecutiveLosses: newConsecutiveLosses,
    consecutiveWins: newConsecutiveWins,
    sessionProfit: newSessionProfit,
    totalSessionBets: riskState.totalSessionBets + 1,
    sessionWins: riskState.sessionWins + (won ? 1 : 0),
    lastResults: [...riskState.lastResults.slice(-9), won],
    stopLossTriggered,
    takeProfitTriggered,
    isPaused,
    pauseRoundsRemaining,
  });
}

// ====== Session Record Functions ======

// Create and save a session record
async function saveSessionRecord(botId: BotId) {
  const botState = state[botId].state;
  const botConfig = state[botId].config;

  if (!botState.sessionStartTime) return;

  const endTime = Date.now();
  const durationMs = endTime - botState.sessionStartTime;
  const totalRounds = botState.stats.totalBets;
  const totalWins = botState.stats.wins;
  const totalLosses = botState.stats.losses;
  const winRate = totalRounds > 0 ? (totalWins / totalRounds) * 100 : 0;

  const sessionRecord: BotSessionRecord = {
    id: `${botId}_${botState.sessionStartTime}`,
    botId,
    startTime: botState.sessionStartTime,
    endTime,
    durationMs,
    initialBalance: botState.initialBalance,
    finalBalance: botState.balance,
    minBalance: botState.minBalance,
    maxBalance: botState.maxBalance,
    totalRounds,
    totalWins,
    totalLosses,
    winRate,
    totalProfit: botState.stats.totalProfit,
    config: { ...botConfig },
  };

  // Add to session history (keep last 50 sessions)
  setState('sessionHistory', (prev) => [sessionRecord, ...prev].slice(0, 50));
  saveSessionHistory(state.sessionHistory);

  // End session in database
  if (botState.dbSessionId) {
    try {
      await endBotSession({
        sessionId: botState.dbSessionId,
        finalBalance: botState.balance,
        stats: {
          min_balance: botState.minBalance,
          max_balance: botState.maxBalance,
          total_bets: botState.stats.totalBets,
          wins: botState.stats.wins,
          partials: botState.stats.partials,
          losses: botState.stats.losses,
          total_profit: botState.stats.totalProfit,
        },
      });
      console.log(`[Bot ${botId}] Sessão ${botState.dbSessionId} finalizada no banco`);
    } catch (err) {
      console.error(`[Bot ${botId}] Erro ao finalizar sessão no banco:`, err);
    }
  }

  console.log(`[Bot ${botId}] Sessão salva:`, {
    duration: formatDuration(durationMs),
    rounds: totalRounds,
    profit: sessionRecord.totalProfit.toFixed(2),
    winRate: winRate.toFixed(1) + '%',
  });
}

// Format duration for display
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// Get session history
export function getSessionHistory(): BotSessionRecord[] {
  return state.sessionHistory;
}

// Clear session history
export function clearSessionHistory() {
  setState('sessionHistory', []);
  saveSessionHistory([]);
}

// Delete specific session
export function deleteSession(sessionId: string) {
  setState('sessionHistory', (prev) => prev.filter((s) => s.id !== sessionId));
  saveSessionHistory(state.sessionHistory);
}

// ====== Saved Config Functions ======

// Save current config with a name
export function saveCurrentConfig(botId: BotId, name: string, description?: string) {
  const config = state[botId].config;

  const savedConfig: SavedBotConfig = {
    id: `config_${Date.now()}`,
    name,
    description,
    createdAt: Date.now(),
    config: { ...config },
  };

  setState('savedConfigs', (prev) => [savedConfig, ...prev]);
  saveSavedConfigs(state.savedConfigs);

  console.log(`[Bot ${botId}] Configuração salva: ${name}`);
  return savedConfig.id;
}

// Load a saved config into a bot
export function loadSavedConfig(configId: string, botId: BotId) {
  const savedConfig = state.savedConfigs.find((c) => c.id === configId);
  if (!savedConfig) {
    console.error(`Config ${configId} not found`);
    return false;
  }

  // Update the config, but preserve botId
  setBotConfig(botId, { ...savedConfig.config, botId });
  console.log(`[Bot ${botId}] Configuração carregada: ${savedConfig.name}`);
  return true;
}

// Delete a saved config
export function deleteSavedConfig(configId: string) {
  setState('savedConfigs', (prev) => prev.filter((c) => c.id !== configId));
  saveSavedConfigs(state.savedConfigs);
}

// Get all saved configs
export function getSavedConfigs(): SavedBotConfig[] {
  return state.savedConfigs;
}

// Duplicate/copy a config
export function duplicateConfig(configId: string, newName: string) {
  const original = state.savedConfigs.find((c) => c.id === configId);
  if (!original) return null;

  const duplicated: SavedBotConfig = {
    id: `config_${Date.now()}`,
    name: newName,
    description: original.description ? `Cópia de: ${original.description}` : undefined,
    createdAt: Date.now(),
    config: { ...original.config },
  };

  setState('savedConfigs', (prev) => [duplicated, ...prev]);
  saveSavedConfigs(state.savedConfigs);

  return duplicated.id;
}

// ====== ML Training Data Export Functions ======

// Export bet history for ML training
// Returns data that can help ML learn from bot decisions and outcomes
export interface BotBetExport {
  roundId: number;
  timestamp: number;
  betAmount: number;
  cashout1: number;
  cashout2: number;
  roundMultiplier: number;
  won1: boolean;
  won2: boolean;
  profit: number;
  balanceAfter: number;
  isHighOpportunity: boolean;
}

export interface BotTrainingExport {
  botId: BotId;
  exportTime: number;
  totalBets: number;
  wins: number;
  partials: number;
  losses: number;
  winRate: number;
  partialRate: number;
  avgProfit: number;
  maxDrawdown: number;
  maxProfit: number;
  volatility: number;
  bets: BotBetExport[];
  sessions: BotSessionRecord[];
}

// Calculate volatility (standard deviation of profits)
function calculateVolatility(bets: BotHistoryItem[]): number {
  if (bets.length < 2) return 0;
  const profits = bets.map(b => b.profit);
  const mean = profits.reduce((a, b) => a + b, 0) / profits.length;
  const squaredDiffs = profits.map(p => Math.pow(p - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / profits.length);
}

// Calculate max drawdown from bet history
function calculateMaxDrawdown(bets: BotHistoryItem[]): number {
  if (bets.length === 0) return 0;

  let maxDrawdown = 0;
  let peak = bets[bets.length - 1]?.balance || 0;

  // Iterate from oldest to newest (bets are stored newest first)
  for (let i = bets.length - 1; i >= 0; i--) {
    const balance = bets[i].balance;
    if (balance > peak) {
      peak = balance;
    }
    const drawdown = (peak - balance) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown * 100; // Return as percentage
}

// Export bot data for ML training
export function exportBotDataForML(botId: BotId): BotTrainingExport {
  const botState = state[botId].state;
  const stats = botState.stats;

  // Calculate rates
  const totalBets = stats.totalBets || 1;
  const winRate = (stats.wins / totalBets) * 100;
  const partialRate = (stats.partials / totalBets) * 100;
  const avgProfit = stats.totalProfit / totalBets;

  // Calculate volatility and drawdown
  const volatility = calculateVolatility(botState.history);
  const maxDrawdown = calculateMaxDrawdown(botState.history);

  // Find max profit in session
  let maxProfit = 0;
  let runningBalance = botState.initialBalance;
  for (let i = botState.history.length - 1; i >= 0; i--) {
    runningBalance += botState.history[i].profit;
    const profit = runningBalance - botState.initialBalance;
    if (profit > maxProfit) maxProfit = profit;
  }

  // Convert history to export format
  const bets: BotBetExport[] = botState.history.map((h, idx) => ({
    roundId: h.id,
    timestamp: h.timestamp,
    betAmount: h.amount,
    cashout1: h.cashout1,
    cashout2: h.cashout2,
    roundMultiplier: h.roundMultiplier,
    won1: h.won1,
    won2: h.won2,
    profit: h.profit,
    balanceAfter: h.balance,
    isHighOpportunity: h.isHighOpportunity,
  }));

  return {
    botId,
    exportTime: Date.now(),
    totalBets: stats.totalBets,
    wins: stats.wins,
    partials: stats.partials,
    losses: stats.losses,
    winRate,
    partialRate,
    avgProfit,
    maxDrawdown,
    maxProfit,
    volatility,
    bets,
    sessions: state.sessionHistory.filter(s => s.botId === botId),
  };
}

// Export all bot data to JSON file for ML training
export function downloadBotDataForML(botId: BotId) {
  const data = exportBotDataForML(botId);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `bot_${botId}_training_data_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`[${botId}] Training data exported: ${data.totalBets} bets`);
}

// Get current bot performance metrics (for real-time decisions)
export function getBotPerformanceMetrics(botId: BotId) {
  const botState = state[botId].state;
  const stats = botState.stats;
  const history = botState.history;

  // Recent performance (last 20 bets)
  const recentBets = history.slice(0, 20);
  const recentWins = recentBets.filter(b => b.won1 && b.won2).length;
  const recentPartials = recentBets.filter(b => b.won1 && !b.won2).length;
  const recentLosses = recentBets.filter(b => !b.won1).length;
  const recentProfit = recentBets.reduce((sum, b) => sum + b.profit, 0);

  // Calculate streaks
  let currentLossStreak = 0;
  let currentWinStreak = 0;
  for (const bet of history) {
    if (!bet.won1) {
      if (currentWinStreak > 0) break;
      currentLossStreak++;
    } else {
      if (currentLossStreak > 0) break;
      currentWinStreak++;
    }
  }

  // Current drawdown
  const currentDrawdown = botState.maxBalance > 0
    ? ((botState.maxBalance - botState.balance) / botState.maxBalance) * 100
    : 0;

  return {
    totalBets: stats.totalBets,
    winRate: stats.totalBets > 0 ? (stats.wins / stats.totalBets) * 100 : 0,
    recentWinRate: recentBets.length > 0 ? (recentWins / recentBets.length) * 100 : 0,
    recentProfit,
    currentLossStreak,
    currentWinStreak,
    currentDrawdown,
    volatility: calculateVolatility(history),
    isInDrawdown: currentDrawdown > 15, // More than 15% drawdown
    isHotStreak: currentWinStreak >= 3,
    isColdStreak: currentLossStreak >= 3,
  };
}
