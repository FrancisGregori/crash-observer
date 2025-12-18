import type { BotRiskState, BotState, BotConfig } from '../types';

// Check if stop loss is triggered
export function checkStopLoss(
  riskState: BotRiskState,
  config: BotConfig,
  currentBalance: number
): boolean {
  if (!config.stopLoss.enabled) return false;

  const lossPercent =
    ((riskState.sessionStartBalance - currentBalance) /
      riskState.sessionStartBalance) *
    100;

  return lossPercent >= config.stopLoss.percent;
}

// Check if take profit is triggered
export function checkTakeProfit(
  riskState: BotRiskState,
  config: BotConfig,
  currentBalance: number
): boolean {
  if (!config.takeProfit.enabled) return false;

  const profitPercent =
    ((currentBalance - riskState.sessionStartBalance) /
      riskState.sessionStartBalance) *
    100;

  return profitPercent >= config.takeProfit.percent;
}

// Calculate position size based on Kelly criterion
export function calculateKellyPosition(
  probability: number,
  odds: number,
  bankroll: number,
  fraction: number = 0.25
): number {
  // Kelly formula: f* = (bp - q) / b
  const p = probability / 100;
  const q = 1 - p;
  const b = odds - 1;

  if (b <= 0) return 0;

  const kelly = (b * p - q) / b;

  // Use fractional Kelly for safety
  const adjustedKelly = Math.max(0, kelly * fraction);

  return bankroll * adjustedKelly;
}

// Update risk state after a bet result
export function updateRiskStateAfterBet(
  riskState: BotRiskState,
  won: boolean,
  profit: number
): BotRiskState {
  const newState = { ...riskState };

  newState.totalSessionBets++;
  newState.sessionProfit += profit;

  if (won) {
    newState.sessionWins++;
    newState.consecutiveWins++;
    newState.consecutiveLosses = 0;
  } else {
    newState.consecutiveLosses++;
    newState.consecutiveWins = 0;
  }

  // Track last results (keep last 10)
  newState.lastResults = [won, ...newState.lastResults.slice(0, 9)];

  return newState;
}

// Check if bot should pause based on consecutive losses
export function checkPauseCondition(
  riskState: BotRiskState,
  maxConsecutiveLosses: number = 5
): {
  shouldPause: boolean;
  pauseRounds: number;
} {
  if (riskState.consecutiveLosses >= maxConsecutiveLosses) {
    return {
      shouldPause: true,
      pauseRounds: Math.min(riskState.consecutiveLosses, 10),
    };
  }

  return { shouldPause: false, pauseRounds: 0 };
}

// Calculate risk score (0-100)
export function calculateRiskScore(
  riskState: BotRiskState,
  balance: number
): number {
  let score = 50; // Start at medium risk

  // Consecutive losses increase risk
  score += riskState.consecutiveLosses * 10;

  // Session profit decreases risk
  if (riskState.sessionProfit > 0) {
    score -= Math.min(20, riskState.sessionProfit / riskState.sessionStartBalance * 100);
  } else {
    score += Math.min(30, Math.abs(riskState.sessionProfit) / riskState.sessionStartBalance * 100);
  }

  // Balance below initial increases risk
  if (balance < riskState.sessionStartBalance) {
    const lossPercent = ((riskState.sessionStartBalance - balance) / riskState.sessionStartBalance) * 100;
    score += lossPercent * 0.5;
  }

  return Math.max(0, Math.min(100, score));
}

// Get recommended bet multiplier based on risk
export function getRecommendedBetMultiplier(riskScore: number): number {
  if (riskScore >= 80) return 0.25; // High risk, reduce bet significantly
  if (riskScore >= 60) return 0.5;  // Medium-high risk
  if (riskScore >= 40) return 1.0;  // Normal
  if (riskScore >= 20) return 1.25; // Low risk, can increase slightly
  return 1.5; // Very low risk
}

// Calculate drawdown
export function calculateDrawdown(
  currentBalance: number,
  peakBalance: number
): {
  drawdown: number;
  drawdownPercent: number;
} {
  if (peakBalance <= 0) {
    return { drawdown: 0, drawdownPercent: 0 };
  }

  const drawdown = Math.max(0, peakBalance - currentBalance);
  const drawdownPercent = (drawdown / peakBalance) * 100;

  return { drawdown, drawdownPercent };
}

// Check recovery mode conditions
export function checkRecoveryMode(
  riskState: BotRiskState,
  currentBalance: number,
  threshold: number = 20
): boolean {
  const lossPercent =
    ((riskState.sessionStartBalance - currentBalance) /
      riskState.sessionStartBalance) *
    100;

  return lossPercent >= threshold;
}

// Get recovery strategy recommendation
export function getRecoveryStrategy(
  riskState: BotRiskState,
  currentBalance: number
): {
  strategy: 'aggressive' | 'conservative' | 'normal';
  reason: string;
} {
  const lossPercent =
    ((riskState.sessionStartBalance - currentBalance) /
      riskState.sessionStartBalance) *
    100;

  if (lossPercent >= 30) {
    return {
      strategy: 'conservative',
      reason: 'Perdas significativas - reduzir exposição',
    };
  }

  if (riskState.consecutiveLosses >= 4) {
    return {
      strategy: 'conservative',
      reason: 'Muitas perdas consecutivas - aguardar',
    };
  }

  if (riskState.consecutiveWins >= 3 && lossPercent < 10) {
    return {
      strategy: 'aggressive',
      reason: 'Sequência positiva - aproveitar momentum',
    };
  }

  return {
    strategy: 'normal',
    reason: 'Condições normais',
  };
}

// Calculate expected time to recover
export function calculateRecoveryTime(
  currentBalance: number,
  targetBalance: number,
  avgProfitPerBet: number,
  betsPerHour: number
): {
  estimatedBets: number;
  estimatedHours: number;
} {
  if (avgProfitPerBet <= 0 || currentBalance >= targetBalance) {
    return { estimatedBets: 0, estimatedHours: 0 };
  }

  const neededProfit = targetBalance - currentBalance;
  const estimatedBets = Math.ceil(neededProfit / avgProfitPerBet);
  const estimatedHours = estimatedBets / betsPerHour;

  return { estimatedBets, estimatedHours };
}

// Validate bet amount against risk limits
export function validateBetAmount(
  amount: number,
  balance: number,
  config: BotConfig,
  riskState: BotRiskState
): {
  valid: boolean;
  adjustedAmount: number;
  reason?: string;
} {
  // Check minimum
  if (amount <= 0) {
    return {
      valid: false,
      adjustedAmount: 0,
      reason: 'Valor inválido',
    };
  }

  // Check balance
  const totalRequired = amount * 2; // Double bet strategy
  if (totalRequired > balance) {
    return {
      valid: false,
      adjustedAmount: Math.floor((balance / 2) * 100) / 100,
      reason: 'Saldo insuficiente',
    };
  }

  // Check bankroll management
  if (config.bankrollManagement.enabled) {
    const maxBet = (balance * config.bankrollManagement.maxBetPercent) / 100;
    if (amount > maxBet) {
      return {
        valid: true,
        adjustedAmount: Math.floor(maxBet * 100) / 100,
        reason: `Ajustado para ${config.bankrollManagement.maxBetPercent}% da banca`,
      };
    }
  }

  return { valid: true, adjustedAmount: amount };
}

// Calculate session statistics
export function calculateSessionStats(riskState: BotRiskState): {
  winRate: number;
  avgProfitPerBet: number;
  totalBets: number;
  profitPercent: number;
} {
  const winRate =
    riskState.totalSessionBets > 0
      ? (riskState.sessionWins / riskState.totalSessionBets) * 100
      : 0;

  const avgProfitPerBet =
    riskState.totalSessionBets > 0
      ? riskState.sessionProfit / riskState.totalSessionBets
      : 0;

  const profitPercent =
    riskState.sessionStartBalance > 0
      ? (riskState.sessionProfit / riskState.sessionStartBalance) * 100
      : 0;

  return {
    winRate,
    avgProfitPerBet,
    totalBets: riskState.totalSessionBets,
    profitPercent,
  };
}
