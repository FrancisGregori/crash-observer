// Round data from the observer
export interface RoundData {
  id: number;
  createdAt: string;
  betCount: number;
  totalBet: number;
  totalWin: number;
  multiplier: number;
}

// Statistics calculated from rounds
export interface StatsData {
  totalRounds: number;
  avgMultiplier: number;
  maxMultiplier: number;
  minMultiplier: number;
  distribution: DistributionItem[];
  bettingStats: {
    avgPlayers: number;
    avgTotalBet: number;
    avgTotalWin: number;
    sumTotalBet: number;
    sumTotalWin: number;
  };
  last24h: {
    count: number;
    avgMultiplier: number;
  };
  streaks: {
    below2x: number;
    below5x: number;
    below10x: number;
    below15x: number;
    below20x: number;
  };
}

export interface DistributionItem {
  range: string;
  count: number;
}

// Streak data for sequences (from stats API)
export interface StreaksData {
  below2x: number;
  below5x: number;
  below10x: number;
  below15x: number;
  below20x: number;
}

// Streak data for local calculations
export interface StreakData {
  current: number;
  max: number;
  avg: number;
  label: string;
  threshold: number;
}

// House profit data by period
export interface HouseProfitPeriod {
  rounds: number;
  totalBet: number;
  totalWin: number;
  houseProfit: number;
}

export interface HouseProfitData {
  currentHour: HouseProfitPeriod;
  last3Hours: HouseProfitPeriod;
  last6Hours: HouseProfitPeriod;
  last24Hours: HouseProfitPeriod;
  allTime: HouseProfitPeriod;
}

// Hourly analysis data
export interface HourlyHour {
  hour: number;
  hourLabel: string;
  rounds: number;
  successRate2x: number;
  roundsAbove2x: number;
  successRate1_5x: number;
  failRate: number;
  avgMultiplier: number;
  avgWhenAbove2x: number;
  strategyScore: number;
  minMultiplier: number;
  maxMultiplier: number;
}

export interface HourlyAnalysisData {
  hourly: HourlyHour[];
  summary?: {
    totalRounds: number;
    globalSuccessRate2x: number;
    bestHour: number;
    worstHour: number;
  };
}

// Advanced statistics - matches actual API response
export interface AdvancedStatsData {
  totalRounds: number;
  favorabilityScore: number;
  favorabilityLevel: 'high' | 'medium' | 'low';
  momentum: {
    avgMultiplierAll: number;
    avgLast10: number;
    avgLast20: number;
    avgLast50: number;
    trend10vs50: number;
    volatilityAll: number;
    volatilityRecent: number;
    momentumStatus: 'hot' | 'cold' | 'neutral';
  };
  successRates: {
    [key: string]: {
      rate: number;
      avgRounds: number;
      description: string;
    };
  };
  probabilities: {
    [key: string]: {
      threshold: number;
      timesHit: number;
      probability: number;
      avgRoundsToHit: number | null;
      oddsOneIn: number | null;
    };
  };
  sequenceAnalysis: {
    [key: string]: {
      threshold: number;
      actualThreshold: number;
      currentStreak: number;
      avgRoundsToHit: number;
      deviationRatio: number;
      status: 'normal' | 'due' | 'overdue';
      probShouldHaveHit: number;
    };
  };
  patterns: {
    [key: string]: {
      description: string;
      successRate: number;
      sample: number;
    };
  };
  correlations: {
    playersVsMultiplier: {
      avgMultHighPlayers: number;
      avgMultLowPlayers: number;
      insight: string;
    };
    betsVsMultiplier: {
      avgMultHighBets: number;
      avgMultLowBets: number;
      insight: string;
    };
  };
  riskAnalysis?: {
    conservative: { cashout: number; expectedValue: number; };
    moderate: { cashout: number; expectedValue: number; };
    aggressive: { cashout: number; expectedValue: number; };
  };
}

export interface Recommendation {
  type: 'high_priority' | 'timing' | 'strategy' | 'momentum';
  icon: string;
  text: string;
}

export interface SequenceAnalysis {
  name: string;
  current: number;
  max: number;
  completionRate: number;
  trend: 'up' | 'down' | 'stable';
}

export interface ProbabilityItem {
  threshold: string;
  probability: number;
}

export interface PatternItem {
  name: string;
  description: string;
  confidence: number;
}

export interface CorrelationItem {
  name: string;
  value: number;
  description: string;
}

// Multiplier color category
export type MultiplierColor =
  | 'low'      // < 1.5x - red
  | 'medium'   // 1.5-2x - orange
  | 'good'     // 2-3x - yellow
  | 'great'    // 3-5x - green
  | 'excellent' // 5-10x - cyan
  | 'epic'     // 10-20x - pink
  | 'legendary'; // > 20x - purple

export function getMultiplierColor(multiplier: number): MultiplierColor {
  if (multiplier < 1.5) return 'low';
  if (multiplier < 2) return 'medium';
  if (multiplier < 3) return 'good';
  if (multiplier < 5) return 'great';
  if (multiplier < 10) return 'excellent';
  if (multiplier < 20) return 'epic';
  return 'legendary';
}

export function getMultiplierColorClass(multiplier: number): string {
  const color = getMultiplierColor(multiplier);
  return `mult-${color}`;
}
