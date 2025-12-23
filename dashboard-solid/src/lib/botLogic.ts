import type {
  RoundData,
  BotState,
  BotConfig,
  BotRiskState,
  BotDecision,
  BotActiveBet,
  BotHistoryItem,
  MLPrediction,
} from '../types';
import type { SequenceSignal } from '../stores/sequence';
import { calculateStreak, checkFavorability, calculateMomentum } from './analysis';
import { calculateSuccessRates } from './statistics';
import { makeStrategyDecision } from './strategyLogic';

// Main decision function for bot - Now uses the Strategy System
export function makeBotDecision(
  rounds: RoundData[],
  botState: BotState,
  config: BotConfig,
  riskState: BotRiskState,
  mlPrediction?: MLPrediction | null,
  sequenceSignal?: SequenceSignal | null
): BotDecision {
  // Use the new strategy system
  const strategyResult = makeStrategyDecision(
    rounds,
    botState,
    config,
    riskState,
    mlPrediction,
    sequenceSignal
  );

  // If strategy says don't bet, return early
  if (!strategyResult.shouldBet) {
    return {
      shouldBet: false,
      reasons: strategyResult.reasons,
      targetCashout2: strategyResult.targetCashout,
      betSizeInfo: null,
      cashout1Info: null,
      isHighOpportunity: false,
      mlDecision: strategyResult.mlDecision ? {
        canBet: strategyResult.mlDecision.shouldBet,
        shouldBet: strategyResult.mlDecision.shouldBet,
        mlAvailable: true,
        reasons: strategyResult.mlDecision.reasons,
        adjustments: {
          betMultiplier: strategyResult.betMultiplier,
          suggestedCashout: strategyResult.mlDecision.suggestedTarget,
          riskReduction: 0,
        },
      } : undefined,
    };
  }

  const isHighOpportunity = strategyResult.rulesDecision?.isHighOpportunity || false;

  // Calculate bet size (apply strategy multiplier)
  const betSizeInfo = calculateBetSize(
    botState.balance,
    config,
    riskState,
    isHighOpportunity,
    strategyResult.betMultiplier
  );

  if (!betSizeInfo || betSizeInfo.amount <= 0) {
    return {
      shouldBet: false,
      reasons: [...strategyResult.reasons, 'Valor de aposta inválido'],
      targetCashout2: strategyResult.targetCashout,
      betSizeInfo: null,
      cashout1Info: null,
      isHighOpportunity: false,
    };
  }

  // Determine cashout1 based on strategy mode
  let cashout1Info: { cashout: number; base: number; reasons: string[] };

  if (strategyResult.source === 'breakeven_profit' && strategyResult.breakevenCashout) {
    // For breakeven_profit mode, use the breakeven cashout directly
    cashout1Info = {
      cashout: strategyResult.breakevenCashout,
      base: strategyResult.breakevenCashout,
      reasons: [`Break-even: ${strategyResult.breakevenCashout}x`],
    };
  } else {
    // Calculate cashout 1 based on momentum for other modes
    const momentum = calculateMomentum(rounds);
    cashout1Info = calculateCashout1(
      config,
      riskState,
      momentum.status
    );
  }

  // Final balance check
  const totalBetAmount = betSizeInfo.amount * 2;
  if (totalBetAmount > botState.balance) {
    return {
      shouldBet: false,
      reasons: [...strategyResult.reasons, 'Saldo insuficiente'],
      targetCashout2: strategyResult.targetCashout,
      betSizeInfo: null,
      cashout1Info: null,
      isHighOpportunity: false,
    };
  }

  return {
    shouldBet: true,
    reasons: strategyResult.reasons,
    targetCashout2: strategyResult.targetCashout,
    betSizeInfo,
    cashout1Info,
    isHighOpportunity,
    mlDecision: strategyResult.mlDecision ? {
      canBet: strategyResult.mlDecision.shouldBet,
      shouldBet: strategyResult.mlDecision.shouldBet,
      mlAvailable: true,
      reasons: strategyResult.mlDecision.reasons,
      adjustments: {
        betMultiplier: strategyResult.betMultiplier,
        suggestedCashout: strategyResult.mlDecision.suggestedTarget,
        riskReduction: 0,
      },
    } : undefined,
  };
}

// Calculate bet size based on configuration
export function calculateBetSize(
  balance: number,
  config: BotConfig,
  riskState: BotRiskState,
  isHighOpportunity: boolean,
  strategyMultiplier: number = 1
): {
  amount: number;
  multiplier: number;
  reasons: string[];
  isReduced: boolean;
} {
  let amount = config.betAmount;
  let multiplier = strategyMultiplier;
  let isReduced = false;
  const reasons: string[] = [];

  // Apply strategy multiplier first
  if (strategyMultiplier !== 1) {
    amount *= strategyMultiplier;
    reasons.push(`Estratégia: multiplicador ${strategyMultiplier.toFixed(1)}x`);
  }

  // Apply bankroll management
  if (config.bankrollManagement.enabled) {
    const maxBet = (balance * config.bankrollManagement.maxBetPercent) / 100;
    if (amount > maxBet) {
      amount = maxBet;
      isReduced = true;
      reasons.push(`Limitado a ${config.bankrollManagement.maxBetPercent}% da banca`);
    }
  }

  // Reduce bet on consecutive losses (only if rules strategy enabled)
  const rulesEnabled = config.strategy?.rulesStrategy?.enabled ?? true;
  const consecutiveLossesRule = config.strategy?.rulesStrategy?.rules?.consecutiveLosses;

  if (rulesEnabled && consecutiveLossesRule?.enabled) {
    if (riskState.consecutiveLosses >= consecutiveLossesRule.maxConsecutive) {
      amount *= consecutiveLossesRule.reduceBetMultiplier;
      isReduced = true;
      reasons.push(`Reduzido: ${riskState.consecutiveLosses} perdas consecutivas`);
    }
  } else if (riskState.consecutiveLosses >= 3) {
    // Fallback to default behavior
    amount *= 0.5;
    isReduced = true;
    reasons.push(`Reduzido: ${riskState.consecutiveLosses} perdas consecutivas`);
  }

  // Increase slightly on high opportunity (only if not already adjusted by strategy)
  if (isHighOpportunity && !isReduced && strategyMultiplier === 1) {
    multiplier = 1.5;
    amount *= 1.5;
    reasons.push('Aumentado: alta oportunidade');
  }

  // Apply min/max bet limits from config
  const minBet = config.minBetAmount || 0.1;
  const maxBet = config.maxBetAmount || 1000;

  if (amount < minBet) {
    amount = minBet;
    reasons.push(`Ajustado para aposta mínima (${minBet})`);
  }

  if (amount > maxBet) {
    amount = maxBet;
    isReduced = true;
    reasons.push(`Limitado ao máximo (${maxBet})`);
  }

  // Round to 2 decimals
  amount = Math.round(amount * 100) / 100;

  return { amount, multiplier, reasons, isReduced };
}

// Calculate cashout 1 value
export function calculateCashout1(
  config: BotConfig,
  riskState: BotRiskState,
  momentumStatus: 'hot' | 'cold' | 'stable'
): {
  cashout: number;
  base: number;
  reasons: string[];
} {
  let cashout = 2.0; // Base cashout for first bet
  const base = 2.0;
  const reasons: string[] = [];

  if (config.dynamicCashout.enabled) {
    // Adjust based on risk state
    if (riskState.consecutiveLosses >= 2) {
      cashout = config.dynamicCashout.conservative;
      reasons.push('Cashout conservador: perdas recentes');
    } else if (riskState.consecutiveWins >= 3 && momentumStatus === 'hot') {
      cashout = config.dynamicCashout.aggressive;
      reasons.push('Cashout agressivo: sequência de vitórias');
    } else {
      cashout = config.dynamicCashout.normal;
      reasons.push('Cashout normal');
    }
  }

  return { cashout, base, reasons };
}

// Process ML prediction
export function processMLDecision(
  prediction: MLPrediction,
  config: BotConfig
): {
  canBet: boolean;
  shouldBet: boolean;
  mlAvailable: boolean;
  reasons: string[];
  adjustments: {
    betMultiplier: number;
    suggestedCashout: number | null;
    riskReduction: number;
  };
} {
  const reasons: string[] = [];
  let canBet = true;
  let betMultiplier = 1;
  let suggestedCashout: number | null = null;
  let riskReduction = 0;

  // Use prob_gt_2x as confidence metric
  const confidence = prediction.prob_gt_2x * 100;
  const minConfidenceThreshold = config.mlConfig.requireRules.minConfidence.enabled
    ? config.mlConfig.requireRules.minConfidence.threshold * 100
    : 40;

  // Check confidence threshold
  if (confidence < minConfidenceThreshold) {
    canBet = false;
    reasons.push(`Confiança ML baixa: ${confidence.toFixed(0)}%`);
  }

  // Check block rules
  if (config.mlConfig.blockRules.earlyCrash.enabled &&
      prediction.prob_early_crash > config.mlConfig.blockRules.earlyCrash.threshold) {
    canBet = false;
    reasons.push(`Alto risco de crash precoce: ${(prediction.prob_early_crash * 100).toFixed(0)}%`);
  }

  if (config.mlConfig.blockRules.highLossStreak.enabled &&
      prediction.prob_high_loss_streak > config.mlConfig.blockRules.highLossStreak.threshold) {
    canBet = false;
    reasons.push(`Alto risco de sequência perdas: ${(prediction.prob_high_loss_streak * 100).toFixed(0)}%`);
  }

  // Determine suggested cashout based on probabilities
  if (config.mlConfig.adjustRules.cashoutByProb.enabled) {
    if (prediction.prob_gt_5x > 0.35) {
      suggestedCashout = 5.0;
      reasons.push(`ML sugeriu cashout: ${suggestedCashout.toFixed(2)}x (prob_gt_5x alta)`);
    } else if (prediction.prob_gt_3x > 0.45) {
      suggestedCashout = 3.0;
      reasons.push(`ML sugeriu cashout: ${suggestedCashout.toFixed(2)}x (prob_gt_3x moderada)`);
    }
  }

  // Adjust bet size based on confidence
  if (confidence >= 60) {
    betMultiplier = 1.2;
  } else if (confidence < 45) {
    betMultiplier = 0.5;
    riskReduction = 50;
  }

  // Determine if should bet based on probabilities
  let shouldBet = canBet && prediction.prob_gt_2x >= 0.5;

  if (prediction.prob_early_crash > 0.35 || prediction.prob_high_loss_streak > 0.5) {
    reasons.push('ML recomendou pular');
    shouldBet = false;
  }

  return {
    canBet,
    shouldBet,
    mlAvailable: true,
    reasons,
    adjustments: {
      betMultiplier,
      suggestedCashout,
      riskReduction,
    },
  };
}

// Create active bet from decision
export function createBetFromDecision(
  decision: BotDecision,
  isLive: boolean
): BotActiveBet | null {
  if (!decision.shouldBet || !decision.betSizeInfo || !decision.cashout1Info) {
    return null;
  }

  return {
    amount: decision.betSizeInfo.amount,
    cashout1: decision.cashout1Info.cashout,
    cashout2: decision.targetCashout2,
    baseCashout1: decision.cashout1Info.base,
    baseCashout2: decision.targetCashout2,
    timestamp: Date.now(),
    isHighOpportunity: decision.isHighOpportunity,
    isLive,
    isReducedBet: decision.betSizeInfo.isReduced,
  };
}

// Resolve bet and calculate result
export function resolveBet(
  bet: BotActiveBet,
  roundMultiplier: number
): {
  won1: boolean;
  won2: boolean;
  profit: number;
  resultText: string;
} {
  const won1 = roundMultiplier >= bet.cashout1;
  const won2 = roundMultiplier >= bet.cashout2;

  let winnings = 0;
  if (won1) winnings += bet.amount * bet.cashout1;
  if (won2) winnings += bet.amount * bet.cashout2;

  const totalBet = bet.amount * 2;
  const profit = winnings - totalBet;

  let resultText = '';
  if (won1 && won2) {
    resultText = `Ganhou ${bet.cashout1.toFixed(2)}x + ${bet.cashout2.toFixed(2)}x`;
  } else if (won1) {
    resultText = `Parcial: ${bet.cashout1.toFixed(2)}x (${bet.cashout2.toFixed(2)}x perdeu)`;
  } else {
    resultText = `Perdeu (Crash: ${roundMultiplier.toFixed(2)}x)`;
  }

  return { won1, won2, profit, resultText };
}

// Create history item from bet result
export function createHistoryItem(
  bet: BotActiveBet,
  roundMultiplier: number,
  profit: number,
  won1: boolean,
  won2: boolean,
  resultText: string,
  balance: number
): BotHistoryItem {
  return {
    id: Date.now(),
    amount: bet.amount,
    cashout1: bet.cashout1,
    cashout2: bet.cashout2,
    roundMultiplier,
    won1,
    won2,
    profit,
    balance,
    timestamp: Date.now(),
    resultText,
    isHighOpportunity: bet.isHighOpportunity,
  };
}

// Update adaptive cycle
export function updateAdaptiveCycle(
  cycle: BotState['adaptiveCycle'],
  hitTarget: boolean,
  targetHit?: number
): BotState['adaptiveCycle'] {
  if (!cycle.active) return cycle;

  const newCycle = { ...cycle };
  newCycle.totalCycleAttempts++;

  if (hitTarget && targetHit) {
    newCycle.lastHitTarget = targetHit;
    // Reset or adjust based on which target was hit
    if (targetHit >= newCycle.currentTarget) {
      newCycle.attemptsAtCurrentTarget = 0;
    }
  } else {
    newCycle.attemptsAtCurrentTarget++;

    // If max attempts at current target, lower the target
    if (newCycle.attemptsAtCurrentTarget >= newCycle.maxAttempts) {
      newCycle.currentTarget = Math.max(5, newCycle.currentTarget - 5);
      newCycle.attemptsAtCurrentTarget = 0;
    }
  }

  return newCycle;
}
