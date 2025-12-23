/**
 * Strategy Logic - Flexible decision making system for bots
 * Supports ML-only, Rules-only, and Hybrid modes
 * Now also supports Sequence Signal integration
 */

import type {
  RoundData,
  BotState,
  BotConfig,
  BotRiskState,
  MLPrediction,
  StrategyConfig,
  MLStrategyConfig,
  RulesStrategyConfig,
  HybridConfig,
  BreakevenProfitConfig,
  WaitPatternConfig,
  ConservativeConfig,
  StrategyDecisionResult,
} from '../types';
import type { SequenceSignal } from '../stores/sequence';
import { calculateStreak, checkFavorability, calculateMomentum } from './analysis';

// ====== ML Strategy Decision ======
export function makeMLDecision(
  mlPrediction: MLPrediction | null | undefined,
  config: MLStrategyConfig,
  baseBetAmount: number
): {
  shouldBet: boolean;
  confidence: number;
  betMultiplier: number;
  suggestedTarget: number;
  reasons: string[];
} {
  const reasons: string[] = [];

  // No ML prediction available
  if (!mlPrediction) {
    return {
      shouldBet: false,
      confidence: 0,
      betMultiplier: 1,
      suggestedTarget: 2,
      reasons: ['ML: Sem predição disponível'],
    };
  }

  const confidence = mlPrediction.prob_gt_2x;
  let shouldBet = true;
  let betMultiplier = 1;
  let suggestedTarget = 2;

  // Check minimum confidence
  if (confidence < config.minConfidenceToBet) {
    shouldBet = false;
    reasons.push(`ML: Confiança baixa (${(confidence * 100).toFixed(0)}% < ${(config.minConfidenceToBet * 100).toFixed(0)}%)`);
  } else {
    reasons.push(`ML: Confiança ${(confidence * 100).toFixed(0)}%`);
  }

  // Check block conditions
  if (config.blockConditions.earlyCrash.enabled) {
    if (mlPrediction.prob_early_crash > config.blockConditions.earlyCrash.maxProb) {
      shouldBet = false;
      reasons.push(`ML: Risco de crash precoce alto (${(mlPrediction.prob_early_crash * 100).toFixed(0)}%)`);
    }
  }

  if (config.blockConditions.highLossStreak.enabled) {
    if (mlPrediction.prob_high_loss_streak > config.blockConditions.highLossStreak.maxProb) {
      shouldBet = false;
      reasons.push(`ML: Risco de sequência de perdas (${(mlPrediction.prob_high_loss_streak * 100).toFixed(0)}%)`);
    }
  }

  // Calculate bet multiplier based on confidence
  if (config.betSizing.method === 'confidence_based') {
    const mult = config.betSizing.confidenceMultiplier;
    if (confidence >= 0.65) {
      betMultiplier = mult.veryHighConfidence;
      reasons.push(`ML: Aposta aumentada ${mult.veryHighConfidence}x (confiança muito alta)`);
    } else if (confidence >= 0.55) {
      betMultiplier = mult.highConfidence;
      reasons.push(`ML: Aposta aumentada ${mult.highConfidence}x (confiança alta)`);
    } else if (confidence >= 0.45) {
      betMultiplier = mult.midConfidence;
    } else {
      betMultiplier = mult.lowConfidence;
      reasons.push(`ML: Aposta reduzida ${mult.lowConfidence}x (confiança baixa)`);
    }
  }

  // Determine target based on probabilities
  if (config.targetSelection.method === 'probability_based') {
    const thresholds = config.targetSelection.probabilityThresholds;

    // Check from highest to lowest target
    if (mlPrediction.prob_gt_10x >= thresholds.target10x) {
      suggestedTarget = 10;
      reasons.push(`ML: Target 10x (prob ${(mlPrediction.prob_gt_10x * 100).toFixed(0)}%)`);
    } else if (mlPrediction.prob_gt_5x >= thresholds.target5x) {
      suggestedTarget = 5;
      reasons.push(`ML: Target 5x (prob ${(mlPrediction.prob_gt_5x * 100).toFixed(0)}%)`);
    } else if (mlPrediction.prob_gt_3x >= thresholds.target3x) {
      suggestedTarget = 3;
      reasons.push(`ML: Target 3x (prob ${(mlPrediction.prob_gt_3x * 100).toFixed(0)}%)`);
    } else if (mlPrediction.prob_gt_2x >= thresholds.target2x) {
      suggestedTarget = 2;
      reasons.push(`ML: Target 2x (prob ${(mlPrediction.prob_gt_2x * 100).toFixed(0)}%)`);
    } else {
      suggestedTarget = 2;
      reasons.push('ML: Target conservador 2x');
    }
  } else if (config.targetSelection.method === 'fixed') {
    suggestedTarget = config.targetSelection.fixedTarget;
    reasons.push(`ML: Target fixo ${suggestedTarget}x`);
  }

  return {
    shouldBet,
    confidence,
    betMultiplier,
    suggestedTarget,
    reasons,
  };
}

// ====== Rules Strategy Decision ======
export function makeRulesDecision(
  rounds: RoundData[],
  config: RulesStrategyConfig,
  riskState: BotRiskState,
  adaptiveCycle: BotState['adaptiveCycle']
): {
  shouldBet: boolean;
  isHighOpportunity: boolean;
  betMultiplier: number;
  suggestedTarget: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let shouldBet = true;
  let isHighOpportunity = false;
  let betMultiplier = 1;
  let suggestedTarget = 10; // Default target

  // Not enough data
  if (rounds.length < 10) {
    return {
      shouldBet: false,
      isHighOpportunity: false,
      betMultiplier: 1,
      suggestedTarget: 10,
      reasons: ['Regras: Dados insuficientes (mínimo 10 rodadas)'],
    };
  }

  const rules = config.rules;

  // Calculate analysis metrics
  const streak2x = calculateStreak(rounds, 2);
  const streak10x = calculateStreak(rounds, 10);
  const favorability = checkFavorability(rounds);
  const momentum = calculateMomentum(rounds);

  // ====== Streak 2x Rule ======
  if (rules.streak2x.enabled) {
    if (streak2x.current >= streak2x.avg * rules.streak2x.multiplierThreshold) {
      shouldBet = true;
      if (rules.streak2x.isHighOpportunity) {
        isHighOpportunity = true;
      }
      reasons.push(`Regras: Sequência alta sem 2x: ${streak2x.current} (avg: ${streak2x.avg.toFixed(1)})`);
    }
  }

  // ====== Streak 10x Rule ======
  if (rules.streak10x.enabled) {
    if (streak10x.current >= streak10x.avg * rules.streak10x.multiplierThreshold) {
      suggestedTarget = rules.streak10x.elevatedTarget;
      reasons.push(`Regras: Target elevado ${suggestedTarget}x (sequência sem 10x: ${streak10x.current})`);
    }
  }

  // ====== Favorability Rule ======
  if (rules.favorability.enabled) {
    if (favorability.status === 'unfavorable' && favorability.score < rules.favorability.minScore) {
      if (rules.favorability.blockOnUnfavorable) {
        shouldBet = false;
        reasons.push(`Regras: Condições desfavoráveis (score: ${favorability.score})`);
      } else {
        reasons.push(`Regras: Favorabilidade baixa (${favorability.score})`);
      }
    } else {
      reasons.push(`Regras: Favorabilidade OK (${favorability.score})`);
    }
  }

  // ====== Momentum Rule ======
  if (rules.momentum.enabled) {
    if (momentum.status === 'cold') {
      if (rules.momentum.blockOnCold && !isHighOpportunity) {
        shouldBet = false;
        reasons.push('Regras: Momentum frio - apostas bloqueadas');
      } else {
        reasons.push('Regras: Momentum frio (permitido por alta oportunidade)');
      }
    } else if (momentum.status === 'hot' && rules.momentum.adjustTargetOnHot) {
      suggestedTarget = Math.max(suggestedTarget, rules.momentum.hotMomentumTarget);
      reasons.push(`Regras: Momentum quente - target ${rules.momentum.hotMomentumTarget}x`);
    }
  }

  // ====== Consecutive Losses Rule ======
  if (rules.consecutiveLosses.enabled) {
    if (riskState.consecutiveLosses >= rules.consecutiveLosses.maxConsecutive) {
      betMultiplier *= rules.consecutiveLosses.reduceBetMultiplier;
      reasons.push(`Regras: Aposta reduzida (${riskState.consecutiveLosses} perdas consecutivas)`);
    }
  }

  // ====== Adaptive Cycle Rule ======
  if (rules.adaptiveCycle.enabled && adaptiveCycle.active) {
    suggestedTarget = adaptiveCycle.currentTarget;
    reasons.push(`Regras: Ciclo adaptativo - target ${suggestedTarget}x`);
  }

  return {
    shouldBet,
    isHighOpportunity,
    betMultiplier,
    suggestedTarget,
    reasons,
  };
}

// ====== Hybrid Decision Combiner ======
export function combineDecisions(
  mlResult: ReturnType<typeof makeMLDecision>,
  rulesResult: ReturnType<typeof makeRulesDecision>,
  config: HybridConfig
): {
  shouldBet: boolean;
  confidence: number;
  betMultiplier: number;
  targetCashout: number;
  reasons: string[];
} {
  const reasons: string[] = [];

  // If both must agree
  if (config.requireBothAgree) {
    const shouldBet = mlResult.shouldBet && rulesResult.shouldBet;
    if (!shouldBet) {
      reasons.push('Híbrido: ML e Regras não concordam');
    } else {
      reasons.push('Híbrido: ML e Regras concordam em apostar');
    }

    // Average the targets weighted by mlWeight
    const targetCashout =
      mlResult.suggestedTarget * config.mlWeight +
      rulesResult.suggestedTarget * (1 - config.mlWeight);

    // Combine bet multipliers
    const betMultiplier =
      mlResult.betMultiplier * config.mlWeight +
      rulesResult.betMultiplier * (1 - config.mlWeight);

    return {
      shouldBet,
      confidence: mlResult.confidence,
      betMultiplier,
      targetCashout: Math.round(targetCashout * 10) / 10,
      reasons: [...reasons, ...mlResult.reasons.slice(0, 2), ...rulesResult.reasons.slice(0, 2)],
    };
  }

  // ML can override rules
  if (config.mlCanOverrideRules && mlResult.shouldBet && !rulesResult.shouldBet) {
    reasons.push('Híbrido: ML sobrescreve regras');
    return {
      shouldBet: true,
      confidence: mlResult.confidence,
      betMultiplier: mlResult.betMultiplier,
      targetCashout: mlResult.suggestedTarget,
      reasons: [...reasons, ...mlResult.reasons],
    };
  }

  // Rules can override ML (on high opportunity)
  if (config.rulesCanOverrideML && rulesResult.shouldBet && !mlResult.shouldBet) {
    if (!config.rulesOverrideOnlyHighOpp || rulesResult.isHighOpportunity) {
      reasons.push('Híbrido: Regras sobrescrevem ML (alta oportunidade)');
      return {
        shouldBet: true,
        confidence: mlResult.confidence,
        betMultiplier: rulesResult.betMultiplier * 0.7, // Reduce bet when overriding
        targetCashout: rulesResult.suggestedTarget,
        reasons: [...reasons, ...rulesResult.reasons],
      };
    }
  }

  // Weighted decision
  const mlScore = mlResult.shouldBet ? config.mlWeight : 0;
  const rulesScore = rulesResult.shouldBet ? (1 - config.mlWeight) : 0;
  const combinedScore = mlScore + rulesScore;

  const shouldBet = combinedScore >= 0.5;

  // Weighted target
  const targetCashout = shouldBet
    ? mlResult.suggestedTarget * config.mlWeight + rulesResult.suggestedTarget * (1 - config.mlWeight)
    : 2;

  // Weighted multiplier
  const betMultiplier = shouldBet
    ? mlResult.betMultiplier * config.mlWeight + rulesResult.betMultiplier * (1 - config.mlWeight)
    : 1;

  reasons.push(`Híbrido: Score combinado ${(combinedScore * 100).toFixed(0)}%`);

  return {
    shouldBet,
    confidence: mlResult.confidence,
    betMultiplier,
    targetCashout: Math.round(targetCashout * 10) / 10,
    reasons: [...reasons, ...mlResult.reasons.slice(0, 2), ...rulesResult.reasons.slice(0, 2)],
  };
}

// ====== Break-even + Profit Strategy Decision ======
// First bet at ~2x to cover both bets (break even)
// Second bet aims for higher ML target (3x, 5x, 7x, 10x, 15x, etc.)
export function makeBreakevenProfitDecision(
  mlPrediction: MLPrediction | null | undefined,
  config: BreakevenProfitConfig,
  baseBetAmount: number
): {
  shouldBet: boolean;
  confidence: number;
  betMultiplier: number;
  breakevenCashout: number; // Cashout for first bet (break-even)
  profitCashout: number;    // Cashout for second bet (profit)
  reasons: string[];
} {
  const reasons: string[] = [];

  // No ML prediction available
  if (!mlPrediction) {
    return {
      shouldBet: false,
      confidence: 0,
      betMultiplier: 1,
      breakevenCashout: config.breakeven.targetMultiplier,
      profitCashout: config.profit.defaultTarget,
      reasons: ['Break-even+Profit: Sem predição ML disponível'],
    };
  }

  const confidence = mlPrediction.prob_gt_2x;
  let shouldBet = true;
  let betMultiplier = 1;
  let profitCashout = config.profit.defaultTarget;
  const breakevenCashout = config.breakeven.targetMultiplier;

  // Check minimum confidence
  if (confidence < config.profit.minMLConfidence) {
    shouldBet = false;
    reasons.push(`BE+P: Confiança baixa (${(confidence * 100).toFixed(0)}% < ${(config.profit.minMLConfidence * 100).toFixed(0)}%)`);
  } else {
    reasons.push(`BE+P: Confiança ${(confidence * 100).toFixed(0)}%`);
  }

  // Check skip conditions
  if (mlPrediction.prob_early_crash > config.skipConditions.maxEarlyCrashProb) {
    shouldBet = false;
    reasons.push(`BE+P: Risco de crash precoce (${(mlPrediction.prob_early_crash * 100).toFixed(0)}%)`);
  }

  if (mlPrediction.prob_high_loss_streak > config.skipConditions.maxLossStreakProb) {
    shouldBet = false;
    reasons.push(`BE+P: Risco de sequência de perdas (${(mlPrediction.prob_high_loss_streak * 100).toFixed(0)}%)`);
  }

  // Determine profit target based on ML probabilities
  if (config.profit.useMLTarget) {
    const thresholds = config.profit.targetThresholds;

    // Check from highest to lowest target
    // We need to estimate probabilities for 7x, 15x, 20x based on available data
    // prob_gt_10x can be used as a proxy - if high, higher targets are more likely
    const estimatedProb15x = mlPrediction.prob_gt_10x * 0.6; // Approximate
    const estimatedProb20x = mlPrediction.prob_gt_10x * 0.4; // Approximate
    const estimatedProb7x = (mlPrediction.prob_gt_5x + mlPrediction.prob_gt_10x) / 2;

    if (estimatedProb20x >= thresholds.target20x) {
      profitCashout = 20;
      reasons.push(`BE+P: Target lucro 20x (prob estimada ${(estimatedProb20x * 100).toFixed(0)}%)`);
    } else if (estimatedProb15x >= thresholds.target15x) {
      profitCashout = 15;
      reasons.push(`BE+P: Target lucro 15x (prob estimada ${(estimatedProb15x * 100).toFixed(0)}%)`);
    } else if (mlPrediction.prob_gt_10x >= thresholds.target10x) {
      profitCashout = 10;
      reasons.push(`BE+P: Target lucro 10x (prob ${(mlPrediction.prob_gt_10x * 100).toFixed(0)}%)`);
    } else if (estimatedProb7x >= thresholds.target7x) {
      profitCashout = 7;
      reasons.push(`BE+P: Target lucro 7x (prob estimada ${(estimatedProb7x * 100).toFixed(0)}%)`);
    } else if (mlPrediction.prob_gt_5x >= thresholds.target5x) {
      profitCashout = 5;
      reasons.push(`BE+P: Target lucro 5x (prob ${(mlPrediction.prob_gt_5x * 100).toFixed(0)}%)`);
    } else if (mlPrediction.prob_gt_3x >= thresholds.target3x) {
      profitCashout = 3;
      reasons.push(`BE+P: Target lucro 3x (prob ${(mlPrediction.prob_gt_3x * 100).toFixed(0)}%)`);
    } else {
      profitCashout = config.profit.defaultTarget;
      reasons.push(`BE+P: Target lucro padrão ${profitCashout}x`);
    }
  }

  // Adjust bet multiplier based on confidence
  if (confidence >= 0.60) {
    betMultiplier = 1.3;
    reasons.push('BE+P: Aposta aumentada (alta confiança)');
  } else if (confidence >= 0.50) {
    betMultiplier = 1.0;
  } else {
    betMultiplier = 0.7;
    reasons.push('BE+P: Aposta reduzida (confiança moderada)');
  }

  // Add strategy explanation
  if (shouldBet) {
    reasons.push(`BE+P: Aposta 1 sai em ${breakevenCashout}x (break-even), Aposta 2 mira ${profitCashout}x`);
  }

  return {
    shouldBet,
    confidence,
    betMultiplier,
    breakevenCashout,
    profitCashout,
    reasons,
  };
}

// ====== Wait Pattern Strategy Decision ======
// Waits for X consecutive rounds below threshold before betting
export function makeWaitPatternDecision(
  rounds: RoundData[],
  config: WaitPatternConfig,
  riskState: BotRiskState,
  consecutiveWins: number,
  consecutiveLosses: number
): {
  shouldBet: boolean;
  betAmount: number;
  targetCashout: number;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Not enough data
  if (rounds.length < config.pattern.minStreakLength) {
    return {
      shouldBet: false,
      betAmount: config.betting.baseBetAmount,
      targetCashout: config.betting.targetMultiplier,
      reasons: ['WaitPattern: Dados insuficientes'],
    };
  }

  // Check risk conditions
  if (riskState.stopLossTriggered) {
    return {
      shouldBet: false,
      betAmount: config.betting.baseBetAmount,
      targetCashout: config.betting.targetMultiplier,
      reasons: ['WaitPattern: Stop loss atingido'],
    };
  }

  // Check consecutive losses pause
  if (consecutiveLosses >= config.risk.maxConsecutiveLosses) {
    return {
      shouldBet: false,
      betAmount: config.betting.baseBetAmount,
      targetCashout: config.betting.targetMultiplier,
      reasons: [`WaitPattern: Pausado após ${consecutiveLosses} perdas consecutivas`],
    };
  }

  // Count consecutive rounds below threshold
  let streak = 0;
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (rounds[i].multiplier < config.pattern.streakThreshold) {
      streak++;
    } else {
      break;
    }
  }

  // Check if pattern detected
  if (streak >= config.pattern.minStreakLength) {
    let betAmount = config.betting.baseBetAmount;

    // Double bet on pattern if configured
    if (config.betting.doubleBetOnPattern) {
      betAmount = Math.min(
        config.betting.baseBetAmount * 2,
        config.betting.baseBetAmount * config.betting.maxBetMultiplier
      );
      reasons.push(`WaitPattern: Aposta dobrada (padrão detectado)`);
    }

    reasons.push(`WaitPattern: Padrão detectado! ${streak} rodadas abaixo de ${config.pattern.streakThreshold}x`);

    return {
      shouldBet: true,
      betAmount,
      targetCashout: config.betting.targetMultiplier,
      reasons,
    };
  }

  reasons.push(`WaitPattern: Aguardando padrão (${streak}/${config.pattern.minStreakLength} rodadas)`);

  return {
    shouldBet: false,
    betAmount: config.betting.baseBetAmount,
    targetCashout: config.betting.targetMultiplier,
    reasons,
  };
}

// ====== Conservative Strategy Decision ======
// Simple low-target strategy with optional progression
export function makeConservativeDecision(
  rounds: RoundData[],
  config: ConservativeConfig,
  riskState: BotRiskState,
  consecutiveWins: number,
  consecutiveLosses: number,
  skipRoundsRemaining: number
): {
  shouldBet: boolean;
  betAmount: number;
  targetCashout: number;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check risk conditions
  if (riskState.stopLossTriggered) {
    return {
      shouldBet: false,
      betAmount: config.betting.baseBetAmount,
      targetCashout: config.betting.targetMultiplier,
      reasons: ['Conservative: Stop loss atingido'],
    };
  }

  if (riskState.takeProfitTriggered) {
    return {
      shouldBet: false,
      betAmount: config.betting.baseBetAmount,
      targetCashout: config.betting.targetMultiplier,
      reasons: ['Conservative: Take profit atingido'],
    };
  }

  // Skip rounds after loss if configured
  if (skipRoundsRemaining > 0) {
    return {
      shouldBet: false,
      betAmount: config.betting.baseBetAmount,
      targetCashout: config.betting.targetMultiplier,
      reasons: [`Conservative: Pulando ${skipRoundsRemaining} rodada(s)`],
    };
  }

  // If not betting every round, check pattern
  if (!config.betting.betEveryRound && config.pattern.enabled) {
    let streak = 0;
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i].multiplier < config.pattern.streakThreshold) {
        streak++;
      } else {
        break;
      }
    }

    if (streak < config.pattern.minStreakLength) {
      return {
        shouldBet: false,
        betAmount: config.betting.baseBetAmount,
        targetCashout: config.betting.targetMultiplier,
        reasons: [`Conservative: Aguardando padrão (${streak}/${config.pattern.minStreakLength})`],
      };
    }
    reasons.push(`Conservative: Padrão detectado (${streak} rodadas)`);
  }

  // Calculate bet amount with progression
  let betAmount = config.betting.baseBetAmount;

  if (config.progression.enabled) {
    if (consecutiveWins >= config.progression.increaseAfterWins) {
      // Calculate progression multiplier
      const progressionSteps = Math.floor(consecutiveWins / config.progression.increaseAfterWins);
      const progressionMultiplier = Math.min(
        Math.pow(config.progression.progressionFactor, progressionSteps),
        config.progression.maxBetMultiplier
      );
      betAmount = config.betting.baseBetAmount * progressionMultiplier;
      reasons.push(`Conservative: Progressão ${progressionMultiplier.toFixed(1)}x (${consecutiveWins} wins)`);
    }
  }

  reasons.push(`Conservative: Apostando R$${betAmount.toFixed(2)} em ${config.betting.targetMultiplier}x`);

  return {
    shouldBet: true,
    betAmount,
    targetCashout: config.betting.targetMultiplier,
    reasons,
  };
}

// ====== Sequence Signal Decision Enhancement ======
export function applySequenceSignal(
  baseResult: StrategyDecisionResult,
  sequenceSignal: SequenceSignal | null | undefined
): StrategyDecisionResult {
  if (!sequenceSignal) {
    return baseResult;
  }

  const result = { ...baseResult, reasons: [...baseResult.reasons] };

  // Add sequence signal info to reasons
  result.reasons.push(`📊 Sinal de sequência: ${sequenceSignal.strength} (${sequenceSignal.consecutiveLows} baixas)`);

  // If base decision was not to bet, sequence signal can override
  if (!result.shouldBet && sequenceSignal.strength === 'STRONG') {
    result.shouldBet = true;
    result.reasons.push('📈 Sinal FORTE ativou aposta');
  }

  // Boost confidence based on signal strength
  if (sequenceSignal.strength === 'STRONG') {
    result.confidence = Math.min(result.confidence + 0.15, 0.85);
    result.betMultiplier = Math.min(result.betMultiplier * 1.3, 2.0);
    result.reasons.push('💪 Multiplicador aumentado por sinal forte');
  } else if (sequenceSignal.strength === 'MODERATE') {
    result.confidence = Math.min(result.confidence + 0.10, 0.75);
    result.betMultiplier = Math.min(result.betMultiplier * 1.15, 1.5);
  }

  // Suggest target based on sequence probabilities
  if (sequenceSignal.probabilities) {
    if (sequenceSignal.probabilities.gte5x >= 0.35) {
      result.targetCashout = Math.max(result.targetCashout, 5);
      result.reasons.push(`🎯 Target 5x (prob ${(sequenceSignal.probabilities.gte5x * 100).toFixed(0)}%)`);
    } else if (sequenceSignal.probabilities.gte3x >= 0.50) {
      result.targetCashout = Math.max(result.targetCashout, 3);
      result.reasons.push(`🎯 Target 3x (prob ${(sequenceSignal.probabilities.gte3x * 100).toFixed(0)}%)`);
    }
  }

  return result;
}

// ====== Main Strategy Decision Function ======
export function makeStrategyDecision(
  rounds: RoundData[],
  botState: BotState,
  config: BotConfig,
  riskState: BotRiskState,
  mlPrediction?: MLPrediction | null,
  sequenceSignal?: SequenceSignal | null
): StrategyDecisionResult {
  const strategyConfig = config.strategy;
  const mode = strategyConfig.mode;

  // Common risk checks first
  if (riskState.stopLossTriggered) {
    return {
      shouldBet: false,
      confidence: 0,
      betMultiplier: 1,
      targetCashout: 2,
      reasons: ['Stop loss atingido'],
      source: mode,
    };
  }

  if (riskState.takeProfitTriggered) {
    return {
      shouldBet: false,
      confidence: 0,
      betMultiplier: 1,
      targetCashout: 2,
      reasons: ['Take profit atingido'],
      source: mode,
    };
  }

  if (riskState.isPaused) {
    return {
      shouldBet: false,
      confidence: 0,
      betMultiplier: 1,
      targetCashout: 2,
      reasons: [`Pausado (${riskState.pauseRoundsRemaining} rodadas restantes)`],
      source: mode,
    };
  }

  // ====== ML Only Mode ======
  if (mode === 'ml_only') {
    const mlResult = makeMLDecision(
      mlPrediction,
      strategyConfig.mlStrategy,
      config.betAmount
    );

    const baseResult: StrategyDecisionResult = {
      shouldBet: mlResult.shouldBet,
      confidence: mlResult.confidence,
      betMultiplier: mlResult.betMultiplier,
      targetCashout: mlResult.suggestedTarget,
      reasons: mlResult.reasons,
      source: 'ml_only',
      mlDecision: {
        shouldBet: mlResult.shouldBet,
        confidence: mlResult.confidence,
        suggestedTarget: mlResult.suggestedTarget,
        reasons: mlResult.reasons,
      },
    };

    return applySequenceSignal(baseResult, sequenceSignal);
  }

  // ====== Rules Only Mode ======
  if (mode === 'rules_only') {
    const rulesResult = makeRulesDecision(
      rounds,
      strategyConfig.rulesStrategy,
      riskState,
      botState.adaptiveCycle
    );

    const baseResult: StrategyDecisionResult = {
      shouldBet: rulesResult.shouldBet,
      confidence: rulesResult.isHighOpportunity ? 0.7 : 0.5,
      betMultiplier: rulesResult.betMultiplier,
      targetCashout: rulesResult.suggestedTarget,
      reasons: rulesResult.reasons,
      source: 'rules_only',
      rulesDecision: {
        shouldBet: rulesResult.shouldBet,
        isHighOpportunity: rulesResult.isHighOpportunity,
        suggestedTarget: rulesResult.suggestedTarget,
        reasons: rulesResult.reasons,
      },
    };

    return applySequenceSignal(baseResult, sequenceSignal);
  }

  // ====== Break-even + Profit Mode ======
  if (mode === 'breakeven_profit') {
    const bepResult = makeBreakevenProfitDecision(
      mlPrediction,
      strategyConfig.breakevenProfit,
      config.betAmount
    );

    const baseResult: StrategyDecisionResult = {
      shouldBet: bepResult.shouldBet,
      confidence: bepResult.confidence,
      betMultiplier: bepResult.betMultiplier,
      targetCashout: bepResult.profitCashout, // Second bet target
      breakevenCashout: bepResult.breakevenCashout, // First bet target
      reasons: bepResult.reasons,
      source: 'breakeven_profit',
      mlDecision: {
        shouldBet: bepResult.shouldBet,
        confidence: bepResult.confidence,
        suggestedTarget: bepResult.profitCashout,
        reasons: bepResult.reasons,
      },
    };

    return applySequenceSignal(baseResult, sequenceSignal);
  }

  // ====== Wait Pattern Mode ======
  if (mode === 'wait_pattern') {
    const wpResult = makeWaitPatternDecision(
      rounds,
      strategyConfig.waitPattern,
      riskState,
      riskState.consecutiveWins || 0,
      riskState.consecutiveLosses || 0
    );

    const baseResult: StrategyDecisionResult = {
      shouldBet: wpResult.shouldBet,
      confidence: wpResult.shouldBet ? 0.6 : 0.3,
      betMultiplier: wpResult.betAmount / config.betAmount,
      targetCashout: wpResult.targetCashout,
      reasons: wpResult.reasons,
      source: 'wait_pattern',
    };

    return applySequenceSignal(baseResult, sequenceSignal);
  }

  // ====== Conservative Mode ======
  if (mode === 'conservative') {
    const consResult = makeConservativeDecision(
      rounds,
      strategyConfig.conservative,
      riskState,
      riskState.consecutiveWins || 0,
      riskState.consecutiveLosses || 0,
      riskState.pauseRoundsRemaining || 0
    );

    const baseResult: StrategyDecisionResult = {
      shouldBet: consResult.shouldBet,
      confidence: consResult.shouldBet ? 0.65 : 0.3,
      betMultiplier: consResult.betAmount / config.betAmount,
      targetCashout: consResult.targetCashout,
      reasons: consResult.reasons,
      source: 'conservative',
    };

    return applySequenceSignal(baseResult, sequenceSignal);
  }

  // ====== Hybrid Mode ======
  const mlResult = makeMLDecision(
    mlPrediction,
    strategyConfig.mlStrategy,
    config.betAmount
  );

  const rulesResult = makeRulesDecision(
    rounds,
    strategyConfig.rulesStrategy,
    riskState,
    botState.adaptiveCycle
  );

  const combined = combineDecisions(
    mlResult,
    rulesResult,
    strategyConfig.hybrid
  );

  const baseResult: StrategyDecisionResult = {
    shouldBet: combined.shouldBet,
    confidence: combined.confidence,
    betMultiplier: combined.betMultiplier,
    targetCashout: combined.targetCashout,
    reasons: combined.reasons,
    source: 'hybrid',
    mlDecision: {
      shouldBet: mlResult.shouldBet,
      confidence: mlResult.confidence,
      suggestedTarget: mlResult.suggestedTarget,
      reasons: mlResult.reasons,
    },
    rulesDecision: {
      shouldBet: rulesResult.shouldBet,
      isHighOpportunity: rulesResult.isHighOpportunity,
      suggestedTarget: rulesResult.suggestedTarget,
      reasons: rulesResult.reasons,
    },
  };

  return applySequenceSignal(baseResult, sequenceSignal);
}
