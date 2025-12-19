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
} from '../lib/api';

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
      losses: 0,
      totalWagered: 0,
      totalProfit: 0,
    });
  }

  // If deactivating and was active
  if (!active && botState.active) {
    // Save session record
    if (botState.sessionStartTime) {
      saveSessionRecord(botId);
    }

    // If was in live mode, disable live betting in backend
    if (botState.liveMode) {
      console.log(`[Bot ${botId}] Disabling live betting in backend...`);
      await enableLiveBetting(false);
    }
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

      // Update stats
      const won = won1 || won2;
      updateBotStats(botId, won, bet.amount * 2, profit);

      // Add to history
      addBotHistoryItem(botId, historyItem);

      // Update risk state
      updateRiskStateAfterBet(botId, won, profit);

      // Clear active bet
      setBotActiveBet(botId, null);

      console.log(`[Bot ${botId}] Resultado: ${resultText}, Lucro: ${profit.toFixed(2)}`);
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
        // In LIVE mode, place real bet via API
        if (botState.liveMode) {
          // Randomize cashouts slightly (like original dashboard)
          const randomCashout1 = randomizeCashout(newBet.cashout1, 0.01, 0.05);
          const randomCashout2 = randomizeCashout(newBet.cashout2, 0.01, 0.05);

          console.log(
            `[Bot ${botId}] Placing REAL bet: R$${newBet.amount.toFixed(2)} x2 | Targets: ${randomCashout1}x and ${randomCashout2}x`
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
          `[Bot ${botId}] Bet created: R$${newBet.amount.toFixed(2)} @ ${newBet.cashout1}x / ${newBet.cashout2}x${botState.liveMode ? ' (LIVE)' : ' (SIM)'}`
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
function saveSessionRecord(botId: BotId) {
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
