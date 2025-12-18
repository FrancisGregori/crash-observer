import type { RoundData } from '../types';

// Local stats calculation result (simplified, different from API StatsData)
export interface LocalStatsData {
  totalRounds: number;
  avgMultiplier: number;
  maxMultiplier: number;
  minMultiplier: number;
  avgPlayers: number;
  distribution: LocalDistributionItem[];
}

export interface LocalDistributionItem {
  range: string;
  count: number;
  percentage: number;
  min: number;
  max: number;
}

// Calculate basic statistics from rounds (for local calculations)
export function calculateStats(rounds: RoundData[]): LocalStatsData {
  if (rounds.length === 0) {
    return {
      totalRounds: 0,
      avgMultiplier: 0,
      maxMultiplier: 0,
      minMultiplier: 0,
      avgPlayers: 0,
      distribution: [],
    };
  }

  const multipliers = rounds.map((r) => r.multiplier);
  const players = rounds.map((r) => r.betCount);

  return {
    totalRounds: rounds.length,
    avgMultiplier: average(multipliers),
    maxMultiplier: Math.max(...multipliers),
    minMultiplier: Math.min(...multipliers),
    avgPlayers: average(players),
    distribution: calculateDistribution(multipliers),
  };
}

// Calculate distribution buckets
export function calculateDistribution(multipliers: number[]): LocalDistributionItem[] {
  const buckets = [
    { min: 0, max: 1.5, range: '1-1.5x' },
    { min: 1.5, max: 2, range: '1.5-2x' },
    { min: 2, max: 3, range: '2-3x' },
    { min: 3, max: 5, range: '3-5x' },
    { min: 5, max: 10, range: '5-10x' },
    { min: 10, max: 20, range: '10-20x' },
    { min: 20, max: Infinity, range: '20x+' },
  ];

  const total = multipliers.length;

  return buckets.map((bucket) => {
    const count = multipliers.filter(
      (m) => m >= bucket.min && m < bucket.max
    ).length;
    return {
      ...bucket,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    };
  });
}

// Calculate success rates for different thresholds
export function calculateSuccessRates(rounds: RoundData[]): {
  rate2x: number;
  rate3x: number;
  rate5x: number;
  rate10x: number;
} {
  if (rounds.length === 0) {
    return { rate2x: 0, rate3x: 0, rate5x: 0, rate10x: 0 };
  }

  const total = rounds.length;
  return {
    rate2x: (rounds.filter((r) => r.multiplier >= 2).length / total) * 100,
    rate3x: (rounds.filter((r) => r.multiplier >= 3).length / total) * 100,
    rate5x: (rounds.filter((r) => r.multiplier >= 5).length / total) * 100,
    rate10x: (rounds.filter((r) => r.multiplier >= 10).length / total) * 100,
  };
}

// Calculate house profit for a period
export function calculateHouseProfit(rounds: RoundData[]): {
  profit: number;
  rounds: number;
} {
  const profit = rounds.reduce(
    (sum, r) => sum + (r.totalBet - r.totalWin),
    0
  );
  return {
    profit,
    rounds: rounds.length,
  };
}

// Filter rounds by time period
export function filterByPeriod(
  rounds: RoundData[],
  hours: number
): RoundData[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return rounds.filter((r) => new Date(r.createdAt).getTime() > cutoff);
}

// Calculate hourly analysis
export interface HourlyStats {
  hour: number;
  total: number;
  above2x: number;
  rate: number;
}

export function calculateHourlyStats(rounds: RoundData[]): HourlyStats[] {
  const hourlyData: Map<number, { total: number; above2x: number }> = new Map();

  // Initialize all hours
  for (let i = 0; i < 24; i++) {
    hourlyData.set(i, { total: 0, above2x: 0 });
  }

  rounds.forEach((round) => {
    const hour = new Date(round.createdAt).getHours();
    const data = hourlyData.get(hour)!;
    data.total++;
    if (round.multiplier >= 2) data.above2x++;
  });

  return Array.from(hourlyData.entries())
    .map(([hour, data]) => ({
      hour,
      total: data.total,
      above2x: data.above2x,
      rate: data.total > 0 ? (data.above2x / data.total) * 100 : 0,
    }))
    .sort((a, b) => a.hour - b.hour);
}

// Get best and worst hours
export function getBestWorstHours(
  hourlyStats: HourlyStats[],
  count: number = 3
): {
  best: HourlyStats[];
  worst: HourlyStats[];
} {
  const withData = hourlyStats.filter((h) => h.total >= 5);
  const sorted = [...withData].sort((a, b) => b.rate - a.rate);

  return {
    best: sorted.slice(0, count),
    worst: sorted.slice(-count).reverse(),
  };
}

// Standard deviation
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

// Average
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Median
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Percentile
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

// Moving average
export function movingAverage(values: number[], window: number): number[] {
  if (values.length < window) return values;
  const result: number[] = [];
  for (let i = window - 1; i < values.length; i++) {
    const windowValues = values.slice(i - window + 1, i + 1);
    result.push(average(windowValues));
  }
  return result;
}

// Calculate variance
export function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(values);
  return average(values.map((v) => Math.pow(v - avg, 2)));
}

// Calculate theoretical house edge
export function calculateTheoreticalEdge(): number {
  // Crash game typically has ~4% house edge
  return 4;
}

// Calculate actual house edge from rounds
export function calculateActualEdge(rounds: RoundData[]): number {
  if (rounds.length === 0) return 0;

  const totalBet = rounds.reduce((sum, r) => sum + r.totalBet, 0);
  const totalWin = rounds.reduce((sum, r) => sum + r.totalWin, 0);

  if (totalBet === 0) return 0;
  return ((totalBet - totalWin) / totalBet) * 100;
}

// Calculate expected value for a bet
export function calculateExpectedValue(
  targetMultiplier: number,
  betAmount: number,
  successRate: number
): number {
  const successProbability = successRate / 100;
  const winAmount = betAmount * targetMultiplier - betAmount;
  const lossAmount = betAmount;

  return (
    successProbability * winAmount - (1 - successProbability) * lossAmount
  );
}

// Calculate Kelly criterion bet size
export function kellyCriterion(
  probability: number,
  odds: number,
  bankroll: number
): number {
  // Kelly formula: f* = (bp - q) / b
  // where b = odds - 1, p = probability of win, q = 1 - p
  const p = probability / 100;
  const q = 1 - p;
  const b = odds - 1;

  const kelly = (b * p - q) / b;

  // Use fractional Kelly (25%) for safety
  const fractionalKelly = kelly * 0.25;

  return Math.max(0, bankroll * fractionalKelly);
}
