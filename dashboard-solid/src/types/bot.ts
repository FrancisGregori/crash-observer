import { MLConfig, createDefaultMLConfig } from './ml';
import { StrategyConfig, createDefaultStrategyConfig } from './strategy';

export type BotId = 'bot1' | 'bot2';

// Bot active bet
export interface BotActiveBet {
  amount: number;
  cashout1: number;
  cashout2: number;
  baseCashout1: number;
  baseCashout2: number;
  timestamp: number;
  isHighOpportunity: boolean;
  isLive: boolean;
  isReducedBet: boolean;
}

// Bot bet history item
export interface BotHistoryItem {
  id: number;
  amount: number;
  cashout1: number;
  cashout2: number;
  roundMultiplier: number;
  won1: boolean;
  won2: boolean;
  profit: number;
  balance: number;
  timestamp: number;
  resultText: string;
  isHighOpportunity: boolean;
}

// Bot statistics
export interface BotStats {
  totalBets: number;
  wins: number;        // Both bets won
  partials: number;    // Only first bet won (partial win)
  losses: number;      // Both bets lost
  totalWagered: number;
  totalProfit: number;
}

// Adaptive cycle state
export interface AdaptiveCycle {
  active: boolean;
  currentTarget: number;
  attemptsAtCurrentTarget: number;
  maxAttempts: number;
  totalCycleAttempts: number;
  lastHitTarget: number | null;
}

// Bot state
export interface BotState {
  botId: BotId;
  active: boolean;
  balance: number;
  initialBalance: number;
  minBalance: number;
  maxBalance: number;
  activeBet: BotActiveBet | null;
  history: BotHistoryItem[];
  stats: BotStats;
  lastDecision: BotDecision | null;
  liveMode: boolean;
  isProcessing: boolean;
  lastRoundTime: number;
  adaptiveCycle: AdaptiveCycle;
  sessionStartTime: number | null; // When bot was started
}

// Safety First configuration - general parameter for all strategies
// First bet always exits at ~2x to recover investment, second bet is for profit
export interface SafetyFirstConfig {
  enabled: boolean;
  // Cashout range for first bet (safety bet)
  minCashout: number;  // e.g., 1.96
  maxCashout: number;  // e.g., 2.10
}

// Bot configuration
export interface BotConfig {
  botId: BotId;
  betAmount: number;
  minBetAmount: number;
  maxBetAmount: number;
  bankrollManagement: {
    enabled: boolean;
    maxBetPercent: number;
  };
  stopLoss: {
    enabled: boolean;
    percent: number;
  };
  takeProfit: {
    enabled: boolean;
    percent: number;
  };
  dynamicCashout: {
    enabled: boolean;
    conservative: number;
    normal: number;
    aggressive: number;
  };
  // Safety First: first bet at ~2x to recover, second bet for profit
  safetyFirst: SafetyFirstConfig;
  mlConfig: MLConfig;
  strategy: StrategyConfig;
}

// Session history record - saved when bot is reset or stopped
export interface BotSessionRecord {
  id: string;
  botId: BotId;
  startTime: number;
  endTime: number;
  durationMs: number;
  initialBalance: number;
  finalBalance: number;
  minBalance: number;
  maxBalance: number;
  totalRounds: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  totalProfit: number;
  config: BotConfig;
}

// Saved configuration preset
export interface SavedBotConfig {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  config: BotConfig;
}

// Risk state for bot
export interface BotRiskState {
  botId: BotId;
  sessionStartBalance: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  isPaused: boolean;
  pauseRoundsRemaining: number;
  sessionProfit: number;
  lastResults: boolean[];
  totalSessionBets: number;
  sessionWins: number;
  stopLossTriggered: boolean;
  takeProfitTriggered: boolean;
  insufficientBalanceTriggered: boolean; // Bot stopped due to low balance
}

// Bot decision
export interface BotDecision {
  shouldBet: boolean;
  reasons: string[];
  targetCashout2: number;
  betSizeInfo: {
    amount: number;
    multiplier: number;
    reasons: string[];
    isReduced: boolean;
  } | null;
  cashout1Info: {
    cashout: number;
    base: number;
    reasons: string[];
  } | null;
  isHighOpportunity: boolean;
  mlDecision?: {
    canBet: boolean;
    shouldBet: boolean;
    mlAvailable: boolean;
    reasons: string[];
    adjustments: {
      betMultiplier: number;
      suggestedCashout: number | null;
      riskReduction: number;
    };
  };
}

// Create default bot state
export function createDefaultBotState(botId: BotId): BotState {
  return {
    botId,
    active: false,
    balance: 200,
    initialBalance: 200,
    minBalance: 200,
    maxBalance: 200,
    activeBet: null,
    history: [],
    stats: {
      totalBets: 0,
      wins: 0,
      partials: 0,
      losses: 0,
      totalWagered: 0,
      totalProfit: 0,
    },
    lastDecision: null,
    liveMode: false,
    isProcessing: false,
    lastRoundTime: 0,
    adaptiveCycle: {
      active: false,
      currentTarget: 15,
      attemptsAtCurrentTarget: 0,
      maxAttempts: 3,
      totalCycleAttempts: 0,
      lastHitTarget: null,
    },
    sessionStartTime: null,
  };
}

// Create default safety first config
export function createDefaultSafetyFirstConfig(): SafetyFirstConfig {
  return {
    enabled: false,
    minCashout: 1.96,
    maxCashout: 2.10,
  };
}

// Create default bot config
export function createDefaultBotConfig(botId: BotId): BotConfig {
  return {
    botId,
    betAmount: 2,
    minBetAmount: 0.5,
    maxBetAmount: 50,
    bankrollManagement: {
      enabled: true,
      maxBetPercent: 5,
    },
    stopLoss: {
      enabled: true,
      percent: 30,
    },
    takeProfit: {
      enabled: true,
      percent: 50,
    },
    dynamicCashout: {
      enabled: true,
      conservative: 2.0,
      normal: 3.0,
      aggressive: 5.0,
    },
    safetyFirst: createDefaultSafetyFirstConfig(),
    mlConfig: createDefaultMLConfig(),
    strategy: createDefaultStrategyConfig(),
  };
}

// Create default risk state
export function createDefaultBotRiskState(botId: BotId, sessionStartBalance: number = 200): BotRiskState {
  return {
    botId,
    sessionStartBalance,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    isPaused: false,
    pauseRoundsRemaining: 0,
    sessionProfit: 0,
    lastResults: [],
    totalSessionBets: 0,
    sessionWins: 0,
    stopLossTriggered: false,
    takeProfitTriggered: false,
    insufficientBalanceTriggered: false,
  };
}
