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

export function setBotActive(botId: BotId, active: boolean) {
  setState(botId, 'state', 'active', active);
  saveBotState(botId, state[botId].state);
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
  won: boolean,
  wagered: number,
  profit: number
) {
  setState(botId, 'state', 'stats', (prev) => ({
    ...prev,
    totalBets: prev.totalBets + 1,
    wins: prev.wins + (won ? 1 : 0),
    losses: prev.losses + (won ? 0 : 1),
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
export function resetBot(botId: BotId) {
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

// Process a new round for all active bots
export function processBotRound(
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
      const result = resolveBet(botState.activeBet, round.multiplier);
      const newBalance = botState.balance + result.profit;

      // Create history item
      const historyItem = createHistoryItem(
        botState.activeBet,
        round.multiplier,
        result.profit,
        result.won1,
        result.won2,
        result.resultText,
        newBalance
      );

      // Update stats
      const won = result.won1 || result.won2;
      updateBotStats(botId, won, botState.activeBet.amount * 2, result.profit);

      // Update balance
      setBotBalance(botId, newBalance);

      // Add to history
      addBotHistoryItem(botId, historyItem);

      // Update risk state
      updateRiskStateAfterBet(botId, won, result.profit);

      // Clear active bet
      setBotActiveBet(botId, null);

      console.log(`[Bot ${botId}] Resultado: ${result.resultText}, Lucro: ${result.profit.toFixed(2)}`);
    }

    // 2. Check risk conditions (stop loss, take profit, pause)
    if (riskState.stopLossTriggered || riskState.takeProfitTriggered) {
      console.log(`[Bot ${botId}] Stop loss ou take profit atingido`);
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
    const decision = makeBotDecision(
      rounds,
      botState,
      botConfig,
      riskState,
      mlPrediction
    );

    // Update decision in state
    setBotDecision(botId, decision);

    console.log(`[Bot ${botId}] Decisão: ${decision.shouldBet ? 'APOSTAR' : 'PULAR'}`, decision.reasons);

    // 4. Create bet if decision says to bet
    if (decision.shouldBet) {
      const newBet = createBetFromDecision(decision, botState.liveMode);
      if (newBet) {
        setBotActiveBet(botId, newBet);
        console.log(`[Bot ${botId}] Aposta criada: R$${newBet.amount.toFixed(2)} @ ${newBet.cashout1}x / ${newBet.cashout2}x`);
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
