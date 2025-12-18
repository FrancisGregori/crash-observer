import type { RoundData, StreakData } from '../types';

// Local streak calculation result (different from API StreaksData)
export interface LocalStreaksData {
  below2x: StreakData;
  below5x: StreakData;
  below10x: StreakData;
  below15x: StreakData;
  below20x: StreakData;
}

// Calculate streak for a given threshold
export function calculateStreak(
  rounds: RoundData[],
  threshold: number
): StreakData {
  let current = 0;
  let max = 0;
  let totalStreaks = 0;
  let streakCount = 0;

  for (let i = 0; i < rounds.length; i++) {
    if (rounds[i].multiplier < threshold) {
      current++;
      if (current > max) max = current;
    } else {
      if (current > 0) {
        totalStreaks += current;
        streakCount++;
      }
      current = 0;
    }
  }

  // Count current streak if ongoing
  if (current > 0) {
    // Don't add to average calculation, it's still ongoing
  }

  const avg = streakCount > 0 ? totalStreaks / streakCount : 0;

  return {
    current,
    max,
    avg,
    label: `< ${threshold}x`,
    threshold,
  };
}

// Calculate all streaks locally
export function calculateStreaks(rounds: RoundData[]): LocalStreaksData {
  return {
    below2x: calculateStreak(rounds, 2),
    below5x: calculateStreak(rounds, 5),
    below10x: calculateStreak(rounds, 10),
    below15x: calculateStreak(rounds, 15),
    below20x: calculateStreak(rounds, 20),
  };
}

// Analyze sequence patterns
export function analyzeSequence(
  rounds: RoundData[],
  threshold: number,
  windowSize: number = 50
): {
  probability: number;
  trend: 'up' | 'down' | 'stable';
  recentRate: number;
  historicalRate: number;
} {
  if (rounds.length < windowSize) {
    return {
      probability: 0,
      trend: 'stable',
      recentRate: 0,
      historicalRate: 0,
    };
  }

  const recentWindow = rounds.slice(0, Math.floor(windowSize / 2));
  const historicalWindow = rounds.slice(0, windowSize);

  const recentHits = recentWindow.filter((r) => r.multiplier >= threshold).length;
  const historicalHits = historicalWindow.filter((r) => r.multiplier >= threshold).length;

  const recentRate = (recentHits / recentWindow.length) * 100;
  const historicalRate = (historicalHits / historicalWindow.length) * 100;

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (recentRate > historicalRate + 5) trend = 'up';
  if (recentRate < historicalRate - 5) trend = 'down';

  // Calculate probability based on streak
  const currentStreak = calculateStreak(rounds, threshold);
  const probability = calculateNextHitProbability(currentStreak, threshold);

  return {
    probability,
    trend,
    recentRate,
    historicalRate,
  };
}

// Calculate probability of next hit based on streak
export function calculateNextHitProbability(
  streak: StreakData,
  threshold: number
): number {
  // Base probability (rough approximation)
  const baseProbability = (1 / threshold) * 100;

  // Increase probability based on current streak vs average
  const streakFactor = streak.current > streak.avg ? 1.2 : 1;

  // Decrease probability slightly if near max
  const maxFactor = streak.current > streak.max * 0.8 ? 0.9 : 1;

  return Math.min(99, baseProbability * streakFactor * maxFactor);
}

// Detect patterns in recent rounds
export interface PatternResult {
  name: string;
  detected: boolean;
  confidence: number;
  description: string;
}

export function detectPatterns(rounds: RoundData[]): PatternResult[] {
  const patterns: PatternResult[] = [];

  // Hot streak pattern
  const recentHigh = rounds.slice(0, 5).filter((r) => r.multiplier >= 3).length;
  if (recentHigh >= 3) {
    patterns.push({
      name: 'Hot Streak',
      detected: true,
      confidence: recentHigh * 20,
      description: `${recentHigh}/5 rodadas recentes ≥3x`,
    });
  }

  // Cold streak pattern
  const recentLow = rounds.slice(0, 5).filter((r) => r.multiplier < 1.5).length;
  if (recentLow >= 4) {
    patterns.push({
      name: 'Cold Streak',
      detected: true,
      confidence: recentLow * 20,
      description: `${recentLow}/5 rodadas recentes <1.5x`,
    });
  }

  // Alternating pattern
  let alternating = 0;
  for (let i = 0; i < Math.min(6, rounds.length - 1); i++) {
    const isHigh = rounds[i].multiplier >= 2;
    const wasHigh = rounds[i + 1].multiplier >= 2;
    if (isHigh !== wasHigh) alternating++;
  }
  if (alternating >= 4) {
    patterns.push({
      name: 'Alternating',
      detected: true,
      confidence: (alternating / 5) * 100,
      description: 'Padrão alternado detectado',
    });
  }

  // Recovery pattern (after cold streak)
  const streak = calculateStreak(rounds, 2);
  if (streak.current >= streak.avg * 1.5 && streak.current > 3) {
    patterns.push({
      name: 'Recovery Due',
      detected: true,
      confidence: Math.min(90, (streak.current / streak.max) * 100),
      description: `${streak.current} rodadas sem 2x (média: ${streak.avg.toFixed(1)})`,
    });
  }

  return patterns;
}

// Calculate correlations between different metrics
export function calculateCorrelations(rounds: RoundData[]): {
  betCountVsMultiplier: number;
  timeOfDayVsMultiplier: number;
  houseProfitVsNextMultiplier: number;
} {
  if (rounds.length < 20) {
    return {
      betCountVsMultiplier: 0,
      timeOfDayVsMultiplier: 0,
      houseProfitVsNextMultiplier: 0,
    };
  }

  // Simplified correlation calculation
  const betCounts = rounds.map((r) => r.betCount);
  const multipliers = rounds.map((r) => r.multiplier);

  return {
    betCountVsMultiplier: calculatePearsonCorrelation(betCounts, multipliers),
    timeOfDayVsMultiplier: 0, // Would need time extraction
    houseProfitVsNextMultiplier: calculatePearsonCorrelation(
      rounds.slice(1).map((r) => r.totalBet - r.totalWin),
      multipliers.slice(0, -1)
    ),
  };
}

// Pearson correlation coefficient
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  if (den === 0) return 0;
  return num / den;
}

// Check if conditions are favorable for betting
export function checkFavorability(rounds: RoundData[]): {
  score: number;
  status: 'favorable' | 'unfavorable' | 'neutral';
  details: string[];
} {
  const details: string[] = [];
  let score = 50; // Start at neutral

  if (rounds.length < 10) {
    return {
      score: 50,
      status: 'neutral',
      details: ['Dados insuficientes'],
    };
  }

  // Check recent success rate
  const recent10 = rounds.slice(0, 10);
  const successRate = (recent10.filter((r) => r.multiplier >= 2).length / 10) * 100;

  if (successRate >= 50) {
    score += 15;
    details.push(`Taxa ≥2x alta: ${successRate.toFixed(0)}%`);
  } else if (successRate <= 30) {
    score -= 10;
    details.push(`Taxa ≥2x baixa: ${successRate.toFixed(0)}%`);
  }

  // Check streak status
  const streak2x = calculateStreak(rounds, 2);
  if (streak2x.current >= streak2x.avg) {
    score += 10;
    details.push(`Sequência sem 2x acima da média`);
  }

  // Check for recovery patterns
  const patterns = detectPatterns(rounds);
  const recoveryPattern = patterns.find((p) => p.name === 'Recovery Due');
  if (recoveryPattern?.detected) {
    score += 15;
    details.push('Padrão de recuperação detectado');
  }

  // Check for cold streak
  const coldPattern = patterns.find((p) => p.name === 'Cold Streak');
  if (coldPattern?.detected) {
    score -= 15;
    details.push('Sequência fria detectada');
  }

  // Normalize score
  score = Math.max(0, Math.min(100, score));

  let status: 'favorable' | 'unfavorable' | 'neutral' = 'neutral';
  if (score >= 60) status = 'favorable';
  if (score <= 40) status = 'unfavorable';

  return { score, status, details };
}

// Calculate momentum
export function calculateMomentum(rounds: RoundData[]): {
  status: 'hot' | 'cold' | 'stable';
  value: number;
  comparison: string;
} {
  if (rounds.length < 20) {
    return {
      status: 'stable',
      value: 0,
      comparison: 'Dados insuficientes',
    };
  }

  const recent5 = rounds.slice(0, 5);
  const historical20 = rounds.slice(0, 20);

  const recentAvg =
    recent5.reduce((sum, r) => sum + r.multiplier, 0) / recent5.length;
  const historicalAvg =
    historical20.reduce((sum, r) => sum + r.multiplier, 0) / historical20.length;

  const diff = ((recentAvg - historicalAvg) / historicalAvg) * 100;
  const value = Math.max(-100, Math.min(100, diff * 2));

  let status: 'hot' | 'cold' | 'stable' = 'stable';
  if (value > 20) status = 'hot';
  if (value < -20) status = 'cold';

  const comparison = `${recentAvg.toFixed(2)}x vs ${historicalAvg.toFixed(2)}x (média histórica)`;

  return { status, value, comparison };
}
