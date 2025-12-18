// ML Prediction data from the inference service
export interface MLPrediction {
  round_id: number;
  generated_at: string;
  features_window_start_round: number;
  features_window_end_round: number;
  prob_gt_2x: number;
  prob_gt_3x: number;
  prob_gt_4x: number;
  prob_gt_5x: number;
  prob_gt_7x: number;
  prob_gt_10x: number;
  prob_early_crash: number;
  prob_high_loss_streak: number;
  model_version: string;
}

// ML Configuration for bots
export interface MLConfig {
  enabled: boolean;
  requireML: boolean;
  mode: 'enhance' | 'override';

  blockRules: {
    earlyCrash: {
      enabled: boolean;
      threshold: number;
      priority: number;
    };
    highLossStreak: {
      enabled: boolean;
      threshold: number;
      priority: number;
    };
    lowProb2x: {
      enabled: boolean;
      threshold: number;
      priority: number;
    };
  };

  requireRules: {
    minProb2x: {
      enabled: boolean;
      threshold: number;
    };
    minConfidence: {
      enabled: boolean;
      threshold: number;
    };
  };

  adjustRules: {
    betSizeByConfidence: {
      enabled: boolean;
      highConfidence: { minProb: number; multiplier: number };
      mediumConfidence: { minProb: number; multiplier: number };
      lowConfidence: { minProb: number; multiplier: number };
      veryLowConfidence: { minProb: number; multiplier: number };
    };
    cashoutByProb: {
      enabled: boolean;
      aggressive: { probField: string; threshold: number; cashout: number };
      moderate: { probField: string; threshold: number; cashout: number };
      conservative: { probField: string; threshold: number; cashout: number };
    };
    reduceOnRisk: {
      enabled: boolean;
      factors: { field: string; threshold: number; reduction: number }[];
    };
  };

  overrideSequences: {
    enabled: boolean;
    minProbToOverride: number;
  };
}

// ML Decision result
export interface MLDecision {
  canBet: boolean;
  shouldBet: boolean;
  mlAvailable: boolean;
  reasons: string[];
  adjustments: {
    betMultiplier: number;
    suggestedCashout: number | null;
    riskReduction: number;
  };
}

// Default ML config
export function createDefaultMLConfig(): MLConfig {
  return {
    enabled: false,
    requireML: false,
    mode: 'enhance',

    blockRules: {
      earlyCrash: { enabled: true, threshold: 0.35, priority: 1 },
      highLossStreak: { enabled: true, threshold: 0.50, priority: 1 },
      lowProb2x: { enabled: true, threshold: 0.40, priority: 2 },
    },

    requireRules: {
      minProb2x: { enabled: false, threshold: 0.45 },
      minConfidence: { enabled: false, threshold: 0.50 },
    },

    adjustRules: {
      betSizeByConfidence: {
        enabled: true,
        highConfidence: { minProb: 0.60, multiplier: 1.2 },
        mediumConfidence: { minProb: 0.50, multiplier: 1.0 },
        lowConfidence: { minProb: 0.40, multiplier: 0.7 },
        veryLowConfidence: { minProb: 0.0, multiplier: 0.5 },
      },
      cashoutByProb: {
        enabled: true,
        aggressive: { probField: 'prob_gt_5x', threshold: 0.35, cashout: 5.0 },
        moderate: { probField: 'prob_gt_3x', threshold: 0.45, cashout: 3.0 },
        conservative: { probField: 'prob_gt_2x', threshold: 0.55, cashout: 2.0 },
      },
      reduceOnRisk: {
        enabled: true,
        factors: [
          { field: 'prob_early_crash', threshold: 0.30, reduction: 0.3 },
          { field: 'prob_high_loss_streak', threshold: 0.40, reduction: 0.2 },
        ],
      },
    },

    overrideSequences: {
      enabled: false,
      minProbToOverride: 0.65,
    },
  };
}
