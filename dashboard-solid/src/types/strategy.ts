// Bot Strategy Types
// This file defines the configurable strategy system for bots

export type StrategyMode = 'ml_only' | 'rules_only' | 'hybrid';

// Bet sizing methods
export type BetSizingMethod = 'fixed' | 'confidence_based' | 'proportional';

// Target selection methods
export type TargetSelectionMethod = 'fixed' | 'probability_based' | 'dynamic';

// ====== ML Strategy Configuration ======
export interface MLStrategyConfig {
  enabled: boolean;

  // Minimum confidence (prob_gt_2x) to place a bet
  minConfidenceToBet: number; // 0-1, e.g., 0.50 = 50%

  // Bet sizing based on ML
  betSizing: {
    method: BetSizingMethod;
    // For confidence_based: multiply bet by confidence level
    confidenceMultiplier: {
      lowConfidence: number;   // prob < 0.45: multiplier (e.g., 0.5)
      midConfidence: number;   // 0.45 <= prob < 0.55: multiplier (e.g., 1.0)
      highConfidence: number;  // 0.55 <= prob < 0.65: multiplier (e.g., 1.5)
      veryHighConfidence: number; // prob >= 0.65: multiplier (e.g., 2.0)
    };
  };

  // Target (cashout) selection based on probabilities
  targetSelection: {
    method: TargetSelectionMethod;
    fixedTarget: number; // For fixed method
    // For probability_based: select target based on probability thresholds
    probabilityThresholds: {
      target2x: number;  // If prob_gt_2x > this, target 2x
      target3x: number;  // If prob_gt_3x > this, target 3x
      target5x: number;  // If prob_gt_5x > this, target 5x
      target10x: number; // If prob_gt_10x > this, target 10x
    };
  };

  // Block conditions - don't bet if these conditions are met
  blockConditions: {
    earlyCrash: {
      enabled: boolean;
      maxProb: number; // Don't bet if prob_early_crash > this
    };
    highLossStreak: {
      enabled: boolean;
      maxProb: number; // Don't bet if prob_high_loss_streak > this
    };
  };
}

// ====== Rules Strategy Configuration ======
export interface RulesStrategyConfig {
  enabled: boolean;

  rules: {
    // Streak 2x rule: bet when many rounds without 2x
    streak2x: {
      enabled: boolean;
      // Bet when current streak >= avgStreak * multiplierThreshold
      multiplierThreshold: number; // e.g., 1.5 = 150% of average
      isHighOpportunity: boolean; // Mark as high opportunity when triggered
    };

    // Streak 10x rule: adjust target based on 10x streak
    streak10x: {
      enabled: boolean;
      multiplierThreshold: number;
      elevatedTarget: number; // Target to use when triggered (e.g., 15x)
    };

    // Favorability rule: check market favorability
    favorability: {
      enabled: boolean;
      minScore: number; // Minimum score to allow betting (e.g., 35)
      blockOnUnfavorable: boolean;
    };

    // Momentum rule: check market momentum
    momentum: {
      enabled: boolean;
      blockOnCold: boolean; // Block betting when momentum is cold
      adjustTargetOnHot: boolean; // Increase target on hot momentum
      hotMomentumTarget: number; // Target when hot (e.g., 12x)
    };

    // Consecutive losses: pause after X losses
    consecutiveLosses: {
      enabled: boolean;
      maxConsecutive: number; // Pause after this many losses
      pauseRounds: number; // How many rounds to pause
      reduceBetMultiplier: number; // Reduce bet by this (e.g., 0.5 = 50%)
    };

    // Adaptive cycle: progressively lower targets
    adaptiveCycle: {
      enabled: boolean;
      startTarget: number; // Initial target (e.g., 15x)
      minTarget: number; // Minimum target (e.g., 5x)
      targetDecrement: number; // How much to reduce (e.g., 5)
      maxAttemptsPerTarget: number; // Attempts before lowering
    };
  };
}

// ====== Hybrid Mode Configuration ======
export interface HybridConfig {
  // ML weight in final decision (0-1)
  // 1.0 = ML only, 0.0 = Rules only, 0.5 = equal weight
  mlWeight: number;

  // Require both ML and Rules to agree before betting
  requireBothAgree: boolean;

  // ML can override rules decision
  mlCanOverrideRules: boolean;

  // Rules can override ML decision (high opportunity)
  rulesCanOverrideML: boolean;

  // Only allow rules override on high opportunity
  rulesOverrideOnlyHighOpp: boolean;
}

// ====== Full Strategy Configuration ======
export interface StrategyConfig {
  mode: StrategyMode;
  mlStrategy: MLStrategyConfig;
  rulesStrategy: RulesStrategyConfig;
  hybrid: HybridConfig;
}

// ====== Default Configurations ======

export function createDefaultMLStrategyConfig(): MLStrategyConfig {
  return {
    enabled: true,
    minConfidenceToBet: 0.50,
    betSizing: {
      method: 'confidence_based',
      confidenceMultiplier: {
        lowConfidence: 0.5,
        midConfidence: 1.0,
        highConfidence: 1.5,
        veryHighConfidence: 2.0,
      },
    },
    targetSelection: {
      method: 'probability_based',
      fixedTarget: 2.0,
      probabilityThresholds: {
        target2x: 0.55,
        target3x: 0.45,
        target5x: 0.35,
        target10x: 0.25,
      },
    },
    blockConditions: {
      earlyCrash: {
        enabled: true,
        maxProb: 0.35,
      },
      highLossStreak: {
        enabled: true,
        maxProb: 0.50,
      },
    },
  };
}

export function createDefaultRulesStrategyConfig(): RulesStrategyConfig {
  return {
    enabled: true,
    rules: {
      streak2x: {
        enabled: true,
        multiplierThreshold: 1.5,
        isHighOpportunity: true,
      },
      streak10x: {
        enabled: true,
        multiplierThreshold: 0.8,
        elevatedTarget: 15,
      },
      favorability: {
        enabled: true,
        minScore: 35,
        blockOnUnfavorable: true,
      },
      momentum: {
        enabled: true,
        blockOnCold: true,
        adjustTargetOnHot: true,
        hotMomentumTarget: 12,
      },
      consecutiveLosses: {
        enabled: true,
        maxConsecutive: 3,
        pauseRounds: 2,
        reduceBetMultiplier: 0.5,
      },
      adaptiveCycle: {
        enabled: false,
        startTarget: 15,
        minTarget: 5,
        targetDecrement: 5,
        maxAttemptsPerTarget: 3,
      },
    },
  };
}

export function createDefaultHybridConfig(): HybridConfig {
  return {
    mlWeight: 0.6,
    requireBothAgree: false,
    mlCanOverrideRules: true,
    rulesCanOverrideML: true,
    rulesOverrideOnlyHighOpp: true,
  };
}

export function createDefaultStrategyConfig(): StrategyConfig {
  return {
    mode: 'rules_only', // Start with rules only as default
    mlStrategy: createDefaultMLStrategyConfig(),
    rulesStrategy: createDefaultRulesStrategyConfig(),
    hybrid: createDefaultHybridConfig(),
  };
}

// ====== Strategy Decision Result ======
export interface StrategyDecisionResult {
  shouldBet: boolean;
  confidence: number; // 0-1
  betMultiplier: number; // Multiplier for base bet
  targetCashout: number;
  reasons: string[];
  source: StrategyMode;

  // Detailed breakdown
  mlDecision?: {
    shouldBet: boolean;
    confidence: number;
    suggestedTarget: number;
    reasons: string[];
  };

  rulesDecision?: {
    shouldBet: boolean;
    isHighOpportunity: boolean;
    suggestedTarget: number;
    reasons: string[];
  };
}
