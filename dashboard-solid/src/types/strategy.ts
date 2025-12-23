// Bot Strategy Types
// This file defines the configurable strategy system for bots

export type StrategyMode = 'ml_only' | 'rules_only' | 'hybrid' | 'breakeven_profit' | 'wait_pattern' | 'conservative';

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

// ====== Break-even + Profit Strategy Configuration ======
// Strategy: First bet at ~2x to break even, second bet aims for ML target
export interface BreakevenProfitConfig {
  enabled: boolean;

  // Breakeven bet configuration (first bet)
  breakeven: {
    // Target multiplier for breakeven (usually 2.0-2.1x to cover both bets)
    targetMultiplier: number;
    // Minimum multiplier (safety floor)
    minMultiplier: number;
  };

  // Profit bet configuration (second bet) - follows ML targets
  profit: {
    // Use ML to determine profit target
    useMLTarget: boolean;
    // Minimum ML confidence to place bet
    minMLConfidence: number;
    // Default profit target when ML not available
    defaultTarget: number;
    // Available targets (ML will choose best one based on probabilities)
    availableTargets: number[]; // e.g., [3, 5, 7, 10, 15, 20]
    // Probability thresholds for each target
    targetThresholds: {
      target3x: number;   // Min probability to aim for 3x
      target5x: number;   // Min probability to aim for 5x
      target7x: number;   // Min probability to aim for 7x
      target10x: number;  // Min probability to aim for 10x
      target15x: number;  // Min probability to aim for 15x
      target20x: number;  // Min probability to aim for 20x
    };
  };

  // Risk conditions - when to skip
  skipConditions: {
    maxEarlyCrashProb: number; // Skip if early crash prob > this
    maxLossStreakProb: number; // Skip if loss streak prob > this
  };
}

// ====== Wait Pattern Strategy Configuration ======
// Waits for X consecutive rounds below threshold before betting
export interface WaitPatternConfig {
  enabled: boolean;

  // Pattern detection
  pattern: {
    // Minimum consecutive rounds below threshold to trigger bet
    minStreakLength: number; // e.g., 3 = wait for 3 rounds below threshold
    // Threshold for streak detection (rounds below this count)
    streakThreshold: number; // e.g., 2.0 = count rounds where multiplier < 2.0
  };

  // Betting configuration
  betting: {
    // Target multiplier for cashout
    targetMultiplier: number; // e.g., 2.0
    // Base bet amount (in currency)
    baseBetAmount: number; // e.g., 2.0
    // Double bet after pattern detected?
    doubleBetOnPattern: boolean;
    // Maximum bet multiplier when doubling
    maxBetMultiplier: number; // e.g., 2.0
  };

  // Risk management
  risk: {
    stopLossPercent: number; // Stop if lost X% of initial
    takeProfitPercent: number; // Stop if gained X% of initial
    skipAfterLoss: number; // Skip X rounds after a loss
    maxConsecutiveLosses: number; // Pause after X consecutive losses
    pauseRoundsAfterMaxLoss: number; // How many rounds to pause
  };
}

// ====== Conservative 1.5x Strategy Configuration ======
// Simple strategy betting at low target (1.3x-1.5x) with consistent bet sizing
export interface ConservativeConfig {
  enabled: boolean;

  // Target and betting
  betting: {
    targetMultiplier: number; // e.g., 1.5
    baseBetAmount: number; // e.g., 2.0
    betEveryRound: boolean; // If false, uses pattern detection
  };

  // Optional pattern detection (if betEveryRound is false)
  pattern: {
    enabled: boolean;
    minStreakLength: number;
    streakThreshold: number;
  };

  // Progressive betting (optional)
  progression: {
    enabled: boolean;
    // Increase bet after consecutive wins
    increaseAfterWins: number; // e.g., 2 = increase after 2 wins
    progressionFactor: number; // e.g., 1.5 = multiply bet by 1.5
    maxBetMultiplier: number; // e.g., 3.0 = max 3x base bet
    resetAfterLoss: boolean;
  };

  // Risk management
  risk: {
    stopLossPercent: number;
    takeProfitPercent: number;
    skipAfterLoss: number;
  };
}

// ====== Full Strategy Configuration ======
export interface StrategyConfig {
  mode: StrategyMode;
  mlStrategy: MLStrategyConfig;
  rulesStrategy: RulesStrategyConfig;
  hybrid: HybridConfig;
  breakevenProfit: BreakevenProfitConfig;
  waitPattern: WaitPatternConfig;
  conservative: ConservativeConfig;
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

export function createDefaultBreakevenProfitConfig(): BreakevenProfitConfig {
  return {
    enabled: true,
    breakeven: {
      targetMultiplier: 2.0, // Exit first bet at 2x to cover both bets
      minMultiplier: 1.5,
    },
    profit: {
      useMLTarget: true,
      minMLConfidence: 0.45, // 45% minimum confidence
      defaultTarget: 3.0, // Default when ML not available
      availableTargets: [3, 5, 7, 10, 15, 20],
      targetThresholds: {
        target3x: 0.50,  // 50% prob to aim for 3x
        target5x: 0.40,  // 40% prob to aim for 5x
        target7x: 0.30,  // 30% prob to aim for 7x
        target10x: 0.25, // 25% prob to aim for 10x
        target15x: 0.18, // 18% prob to aim for 15x
        target20x: 0.12, // 12% prob to aim for 20x
      },
    },
    skipConditions: {
      maxEarlyCrashProb: 0.40, // Skip if early crash > 40%
      maxLossStreakProb: 0.55, // Skip if loss streak > 55%
    },
  };
}

export function createDefaultWaitPatternConfig(): WaitPatternConfig {
  return {
    enabled: true,
    pattern: {
      minStreakLength: 3, // Wait for 3 rounds below threshold
      streakThreshold: 2.0, // Count rounds where multiplier < 2.0
    },
    betting: {
      targetMultiplier: 2.0,
      baseBetAmount: 2.0,
      doubleBetOnPattern: false,
      maxBetMultiplier: 2.0,
    },
    risk: {
      stopLossPercent: 50,
      takeProfitPercent: 100,
      skipAfterLoss: 0,
      maxConsecutiveLosses: 5,
      pauseRoundsAfterMaxLoss: 3,
    },
  };
}

export function createDefaultConservativeConfig(): ConservativeConfig {
  return {
    enabled: true,
    betting: {
      targetMultiplier: 1.5,
      baseBetAmount: 2.0,
      betEveryRound: true, // Simple: bet every round
    },
    pattern: {
      enabled: false,
      minStreakLength: 3,
      streakThreshold: 1.5,
    },
    progression: {
      enabled: false,
      increaseAfterWins: 2,
      progressionFactor: 1.5,
      maxBetMultiplier: 3.0,
      resetAfterLoss: true,
    },
    risk: {
      stopLossPercent: 50,
      takeProfitPercent: 100,
      skipAfterLoss: 0,
    },
  };
}

export function createDefaultStrategyConfig(): StrategyConfig {
  return {
    mode: 'conservative', // Changed default to conservative 1.5x strategy
    mlStrategy: createDefaultMLStrategyConfig(),
    rulesStrategy: createDefaultRulesStrategyConfig(),
    hybrid: createDefaultHybridConfig(),
    breakevenProfit: createDefaultBreakevenProfitConfig(),
    waitPattern: createDefaultWaitPatternConfig(),
    conservative: createDefaultConservativeConfig(),
  };
}

// ====== Strategy Presets ======
// Pre-configured strategies based on backtest results

export const STRATEGY_PRESETS = {
  // Best overall ROI from backtests
  conservative_1_5x: {
    name: 'Conservador 1.5x',
    description: 'Aposta R$2 em todas rodadas, sai em 1.5x. Win rate ~67%',
    config: {
      mode: 'conservative' as StrategyMode,
      conservative: {
        enabled: true,
        betting: {
          targetMultiplier: 1.5,
          baseBetAmount: 2.0,
          betEveryRound: true,
        },
        pattern: { enabled: false, minStreakLength: 3, streakThreshold: 1.5 },
        progression: { enabled: false, increaseAfterWins: 2, progressionFactor: 1.5, maxBetMultiplier: 3.0, resetAfterLoss: true },
        risk: { stopLossPercent: 50, takeProfitPercent: 100, skipAfterLoss: 0 },
      },
    },
  },

  // Best risk-adjusted (lowest drawdown)
  wait_pattern_2x: {
    name: 'Esperar Padrão 2x',
    description: 'Espera 3 rodadas <2x, depois aposta em 2x. Menos apostas, menor risco.',
    config: {
      mode: 'wait_pattern' as StrategyMode,
      waitPattern: {
        enabled: true,
        pattern: {
          minStreakLength: 3,
          streakThreshold: 2.0,
        },
        betting: {
          targetMultiplier: 2.0,
          baseBetAmount: 2.0,
          doubleBetOnPattern: false,
          maxBetMultiplier: 2.0,
        },
        risk: {
          stopLossPercent: 50,
          takeProfitPercent: 100,
          skipAfterLoss: 0,
          maxConsecutiveLosses: 5,
          pauseRoundsAfterMaxLoss: 3,
        },
      },
    },
  },

  // Aggressive pattern with double bet
  wait_pattern_aggressive: {
    name: 'Padrão Agressivo',
    description: 'Espera 4 rodadas <2x, dobra aposta. Mais risco, mais potencial.',
    config: {
      mode: 'wait_pattern' as StrategyMode,
      waitPattern: {
        enabled: true,
        pattern: {
          minStreakLength: 4,
          streakThreshold: 2.0,
        },
        betting: {
          targetMultiplier: 2.0,
          baseBetAmount: 2.0,
          doubleBetOnPattern: true,
          maxBetMultiplier: 2.0,
        },
        risk: {
          stopLossPercent: 50,
          takeProfitPercent: 100,
          skipAfterLoss: 1,
          maxConsecutiveLosses: 4,
          pauseRoundsAfterMaxLoss: 5,
        },
      },
    },
  },

  // Conservative with progression
  progressive_1_5x: {
    name: 'Progressivo 1.5x',
    description: 'Aposta em 1.5x com progressão após wins. Equilibrado.',
    config: {
      mode: 'conservative' as StrategyMode,
      conservative: {
        enabled: true,
        betting: {
          targetMultiplier: 1.5,
          baseBetAmount: 2.0,
          betEveryRound: true,
        },
        pattern: { enabled: false, minStreakLength: 3, streakThreshold: 1.5 },
        progression: {
          enabled: true,
          increaseAfterWins: 2,
          progressionFactor: 1.5,
          maxBetMultiplier: 2.0,
          resetAfterLoss: true,
        },
        risk: { stopLossPercent: 50, takeProfitPercent: 100, skipAfterLoss: 0 },
      },
    },
  },
} as const;

// ====== Strategy Decision Result ======
export interface StrategyDecisionResult {
  shouldBet: boolean;
  confidence: number; // 0-1
  betMultiplier: number; // Multiplier for base bet
  targetCashout: number;
  breakevenCashout?: number; // For breakeven_profit mode
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
