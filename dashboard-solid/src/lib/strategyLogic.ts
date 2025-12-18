/**
 * Strategy Logic - Flexible decision making system for bots
 * Supports ML-only, Rules-only, and Hybrid modes
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
  StrategyDecisionResult,
} from '../types';
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

// ====== Main Strategy Decision Function ======
export function makeStrategyDecision(
  rounds: RoundData[],
  botState: BotState,
  config: BotConfig,
  riskState: BotRiskState,
  mlPrediction?: MLPrediction | null
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

    return {
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
  }

  // ====== Rules Only Mode ======
  if (mode === 'rules_only') {
    const rulesResult = makeRulesDecision(
      rounds,
      strategyConfig.rulesStrategy,
      riskState,
      botState.adaptiveCycle
    );

    return {
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

  return {
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
}
