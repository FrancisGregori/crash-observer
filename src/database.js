import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'crash_stats.db');

let db = null;

/**
 * Inicializa o banco de dados e cria as tabelas se não existirem
 */
export function initDatabase() {
  db = new Database(DB_PATH);

  // Habilita WAL mode para melhor performance
  db.pragma('journal_mode = WAL');

  // Cria a tabela de rodadas
  db.exec(`
    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      createdAt TEXT NOT NULL,
      betCount INTEGER NOT NULL,
      totalBet REAL NOT NULL,
      totalWin REAL NOT NULL,
      multiplier REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rounds_createdAt ON rounds(createdAt);
    CREATE INDEX IF NOT EXISTS idx_rounds_multiplier ON rounds(multiplier);
  `);

  console.log('[DB] Banco de dados inicializado:', DB_PATH);
  return db;
}

/**
 * Insere uma nova rodada no banco de dados
 */
export function insertRound(round) {
  const stmt = db.prepare(`
    INSERT INTO rounds (createdAt, betCount, totalBet, totalWin, multiplier)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    round.createdAt,
    round.betCount,
    round.totalBet,
    round.totalWin,
    round.multiplier
  );

  console.log(`[DB] Rodada #${result.lastInsertRowid} salva: ${round.multiplier}x`);
  return result.lastInsertRowid;
}

/**
 * Retorna as últimas N rodadas
 */
export function getLastRounds(limit = 100) {
  const stmt = db.prepare(`
    SELECT * FROM rounds
    ORDER BY id DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

/**
 * Retorna todas as rodadas (para análise)
 */
export function getAllRounds() {
  const stmt = db.prepare(`SELECT * FROM rounds ORDER BY id DESC`);
  return stmt.all();
}

/**
 * Retorna estatísticas gerais
 */
export function getStats() {
  const totalRounds = db.prepare(`SELECT COUNT(*) as count FROM rounds`).get();
  const avgMultiplier = db.prepare(`SELECT AVG(multiplier) as avg FROM rounds`).get();
  const maxMultiplier = db.prepare(`SELECT MAX(multiplier) as max FROM rounds`).get();
  const minMultiplier = db.prepare(`SELECT MIN(multiplier) as min FROM rounds`).get();

  // Distribuição de multiplicadores
  const distribution = db.prepare(`
    SELECT
      CASE
        WHEN multiplier < 2.0 THEN '< 2x'
        WHEN multiplier < 3.0 THEN '2x - 3x'
        WHEN multiplier < 5.0 THEN '3x - 5x'
        WHEN multiplier < 10.0 THEN '5x - 10x'
        ELSE '10x+'
      END as range,
      COUNT(*) as count
    FROM rounds
    GROUP BY range
    ORDER BY
      CASE range
        WHEN '< 2x' THEN 1
        WHEN '2x - 3x' THEN 2
        WHEN '3x - 5x' THEN 3
        WHEN '5x - 10x' THEN 4
        ELSE 5
      END
  `).all();

  // Estatísticas de apostas
  const bettingStats = db.prepare(`
    SELECT
      AVG(betCount) as avgPlayers,
      AVG(totalBet) as avgTotalBet,
      AVG(totalWin) as avgTotalWin,
      SUM(totalBet) as sumTotalBet,
      SUM(totalWin) as sumTotalWin
    FROM rounds
  `).get();

  // Últimas 24 horas
  const last24h = db.prepare(`
    SELECT COUNT(*) as count, AVG(multiplier) as avg
    FROM rounds
    WHERE createdAt >= datetime('now', '-24 hours')
  `).get();

  // Função para calcular sequência abaixo de um limiar
  function getStreakBelow(threshold) {
    const result = db.prepare(`
      WITH ranked AS (
        SELECT multiplier,
               ROW_NUMBER() OVER (ORDER BY id DESC) as rn
        FROM rounds
      )
      SELECT COUNT(*) as streak
      FROM ranked
      WHERE rn <= COALESCE(
        (SELECT MIN(rn) - 1 FROM ranked WHERE multiplier >= ?),
        (SELECT MAX(rn) FROM ranked)
      ) AND multiplier < ?
    `).get(threshold, threshold);
    return result?.streak || 0;
  }

  // Sequências atuais abaixo de diferentes limiares
  const streaks = {
    below2x: getStreakBelow(2.0),
    below5x: getStreakBelow(5.0),
    below10x: getStreakBelow(10.0),
    below15x: getStreakBelow(15.0),
    below20x: getStreakBelow(20.0)
  };

  return {
    totalRounds: totalRounds.count,
    avgMultiplier: avgMultiplier.avg ? Number(avgMultiplier.avg.toFixed(2)) : 0,
    maxMultiplier: maxMultiplier.max || 0,
    minMultiplier: minMultiplier.min || 0,
    distribution,
    bettingStats: {
      avgPlayers: bettingStats.avgPlayers ? Math.round(bettingStats.avgPlayers) : 0,
      avgTotalBet: bettingStats.avgTotalBet ? Number(bettingStats.avgTotalBet.toFixed(2)) : 0,
      avgTotalWin: bettingStats.avgTotalWin ? Number(bettingStats.avgTotalWin.toFixed(2)) : 0,
      sumTotalBet: bettingStats.sumTotalBet || 0,
      sumTotalWin: bettingStats.sumTotalWin || 0
    },
    last24h: {
      count: last24h.count,
      avgMultiplier: last24h.avg ? Number(last24h.avg.toFixed(2)) : 0
    },
    streaks
  };
}

/**
 * Retorna a última rodada inserida
 */
export function getLastRound() {
  const stmt = db.prepare(`SELECT * FROM rounds ORDER BY id DESC LIMIT 1`);
  return stmt.get();
}

/**
 * Retorna análise de horários otimizada para estratégia de saída em 2x
 *
 * Estratégia do jogador:
 * - Aposta dupla: ao atingir 2x, sai com uma aposta (recupera risco)
 * - Mantém segunda aposta para lucro real
 *
 * Métricas importantes:
 * - Taxa de sucesso em 2x (% de rodadas que atingem 2x ou mais)
 * - Sequências de falhas abaixo de 2x (risco de perda consecutiva)
 */
export function getHourlyAnalysis() {
  // Offset de fuso horário: Brasil (UTC-3)
  // SQLite armazena em UTC, precisamos converter para horário local
  const timezoneOffset = '-3 hours';

  // Análise por hora do dia (0-23) com foco em taxa de sucesso para 2x
  const hourlyStats = db.prepare(`
    SELECT
      CAST(strftime('%H', datetime(createdAt, ?)) AS INTEGER) as hour,
      COUNT(*) as rounds,
      SUM(CASE WHEN multiplier >= 2.0 THEN 1 ELSE 0 END) as roundsAbove2x,
      SUM(CASE WHEN multiplier >= 1.5 THEN 1 ELSE 0 END) as roundsAbove1_5x,
      SUM(CASE WHEN multiplier < 1.5 THEN 1 ELSE 0 END) as roundsBelow1_5x,
      AVG(multiplier) as avgMultiplier,
      AVG(CASE WHEN multiplier >= 2.0 THEN multiplier ELSE NULL END) as avgWhenAbove2x,
      MIN(multiplier) as minMultiplier,
      MAX(multiplier) as maxMultiplier
    FROM rounds
    GROUP BY hour
    ORDER BY hour
  `).all(timezoneOffset);

  // Calcula métricas derivadas
  const formatted = hourlyStats.map(h => {
    const successRate2x = h.rounds > 0 ? (h.roundsAbove2x / h.rounds) * 100 : 0;
    const successRate1_5x = h.rounds > 0 ? (h.roundsAbove1_5x / h.rounds) * 100 : 0;
    const failRate = h.rounds > 0 ? (h.roundsBelow1_5x / h.rounds) * 100 : 0;

    // Score de favorabilidade para estratégia 2x (0-100)
    // Baseado em: taxa de sucesso 2x (peso 70%) + taxa de sucesso 1.5x (peso 30%)
    const strategyScore = (successRate2x * 0.7) + (successRate1_5x * 0.3);

    return {
      hour: h.hour,
      hourLabel: `${h.hour.toString().padStart(2, '0')}:00`,
      rounds: h.rounds,
      // Métricas principais para estratégia 2x
      successRate2x: Number(successRate2x.toFixed(1)),
      roundsAbove2x: h.roundsAbove2x,
      // Métricas de segurança (1.5x como fallback)
      successRate1_5x: Number(successRate1_5x.toFixed(1)),
      failRate: Number(failRate.toFixed(1)),
      // Médias
      avgMultiplier: h.avgMultiplier ? Number(h.avgMultiplier.toFixed(2)) : 0,
      avgWhenAbove2x: h.avgWhenAbove2x ? Number(h.avgWhenAbove2x.toFixed(2)) : 0,
      // Score combinado
      strategyScore: Number(strategyScore.toFixed(1)),
      // Extras
      minMultiplier: h.minMultiplier || 0,
      maxMultiplier: h.maxMultiplier || 0
    };
  });

  // Taxa global de sucesso em 2x (para comparação)
  const globalStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN multiplier >= 2.0 THEN 1 ELSE 0 END) as above2x,
      AVG(multiplier) as avgMult
    FROM rounds
  `).get();

  const globalSuccessRate2x = globalStats.total > 0
    ? Number(((globalStats.above2x / globalStats.total) * 100).toFixed(1))
    : 0;

  // Melhores horários: maior taxa de sucesso em 2x (mínimo 5 rodadas para relevância)
  const validHours = formatted.filter(h => h.rounds >= 5);
  const sortedBySuccessRate = [...validHours].sort((a, b) => b.successRate2x - a.successRate2x);

  const bestHoursForPlayer = sortedBySuccessRate.slice(0, 5).map(h => ({
    ...h,
    // Quanto melhor que a média global
    vsGlobal: Number((h.successRate2x - globalSuccessRate2x).toFixed(1))
  }));

  // Piores horários: menor taxa de sucesso em 2x
  const worstHoursForPlayer = sortedBySuccessRate.slice(-5).reverse().map(h => ({
    ...h,
    vsGlobal: Number((h.successRate2x - globalSuccessRate2x).toFixed(1))
  }));

  // Análise do horário atual
  const currentHour = new Date().getHours();
  const currentHourData = formatted.find(h => h.hour === currentHour);

  const currentHourAnalysis = currentHourData ? {
    ...currentHourData,
    vsGlobal: Number((currentHourData.successRate2x - globalSuccessRate2x).toFixed(1)),
    recommendation: currentHourData.successRate2x >= globalSuccessRate2x + 5
      ? 'Horário favorável para sua estratégia'
      : currentHourData.successRate2x <= globalSuccessRate2x - 5
        ? 'Horário desfavorável - considere pausar'
        : 'Horário neutro'
  } : null;

  return {
    hourly: formatted,
    bestHoursForPlayer,
    worstHoursForPlayer,
    globalSuccessRate2x,
    globalAvgMultiplier: globalStats.avgMult ? Number(globalStats.avgMult.toFixed(2)) : 0,
    currentHourAnalysis,
    currentHour,
    // Legenda explicativa
    explanation: {
      successRate2x: 'Porcentagem de rodadas que atingem 2x ou mais',
      strategyScore: 'Score combinado para estratégia de saída em 2x (0-100)',
      vsGlobal: 'Diferença em relação à taxa global (positivo = melhor que média)'
    }
  };
}

/**
 * Retorna ganho da casa por diferentes períodos de tempo
 */
export function getHouseProfitByPeriod() {
  // Hora atual (últimos 60 minutos)
  const currentHour = db.prepare(`
    SELECT
      COUNT(*) as rounds,
      SUM(totalBet) as totalBet,
      SUM(totalWin) as totalWin,
      SUM(totalBet - totalWin) as houseProfit
    FROM rounds
    WHERE createdAt >= datetime('now', '-1 hour')
  `).get();

  // Últimas 3 horas
  const last3Hours = db.prepare(`
    SELECT
      COUNT(*) as rounds,
      SUM(totalBet) as totalBet,
      SUM(totalWin) as totalWin,
      SUM(totalBet - totalWin) as houseProfit
    FROM rounds
    WHERE createdAt >= datetime('now', '-3 hours')
  `).get();

  // Últimas 6 horas
  const last6Hours = db.prepare(`
    SELECT
      COUNT(*) as rounds,
      SUM(totalBet) as totalBet,
      SUM(totalWin) as totalWin,
      SUM(totalBet - totalWin) as houseProfit
    FROM rounds
    WHERE createdAt >= datetime('now', '-6 hours')
  `).get();

  // Últimas 24 horas
  const last24Hours = db.prepare(`
    SELECT
      COUNT(*) as rounds,
      SUM(totalBet) as totalBet,
      SUM(totalWin) as totalWin,
      SUM(totalBet - totalWin) as houseProfit
    FROM rounds
    WHERE createdAt >= datetime('now', '-24 hours')
  `).get();

  // Total geral
  const allTime = db.prepare(`
    SELECT
      COUNT(*) as rounds,
      SUM(totalBet) as totalBet,
      SUM(totalWin) as totalWin,
      SUM(totalBet - totalWin) as houseProfit
    FROM rounds
  `).get();

  const formatPeriod = (data) => ({
    rounds: data.rounds || 0,
    totalBet: data.totalBet ? Number(data.totalBet.toFixed(2)) : 0,
    totalWin: data.totalWin ? Number(data.totalWin.toFixed(2)) : 0,
    houseProfit: data.houseProfit ? Number(data.houseProfit.toFixed(2)) : 0
  });

  return {
    currentHour: formatPeriod(currentHour),
    last3Hours: formatPeriod(last3Hours),
    last6Hours: formatPeriod(last6Hours),
    last24Hours: formatPeriod(last24Hours),
    allTime: formatPeriod(allTime)
  };
}

/**
 * Análise estatística avançada
 * Calcula probabilidades, médias, padrões e indicadores
 */
export function getAdvancedStats() {
  const totalRounds = db.prepare(`SELECT COUNT(*) as count FROM rounds`).get().count;

  if (totalRounds < 10) {
    return { error: 'Dados insuficientes', minRequired: 10, current: totalRounds };
  }

  // ========== 1. PROBABILIDADES DE MULTIPLICADORES ==========
  // Calcula a probabilidade de atingir cada faixa de multiplicador
  const thresholds = [1.5, 2, 3, 5, 10, 15, 20, 50, 100];
  const probabilities = {};

  for (const threshold of thresholds) {
    const count = db.prepare(`
      SELECT COUNT(*) as count FROM rounds WHERE multiplier >= ?
    `).get(threshold).count;

    const probability = count / totalRounds;
    const avgRoundsToHit = probability > 0 ? 1 / probability : null;

    probabilities[`x${threshold}`] = {
      threshold,
      timesHit: count,
      probability: Number((probability * 100).toFixed(2)),
      avgRoundsToHit: avgRoundsToHit ? Number(avgRoundsToHit.toFixed(1)) : null,
      oddsOneIn: avgRoundsToHit ? Math.round(avgRoundsToHit) : null
    };
  }

  // ========== 2. SEQUÊNCIAS ATUAIS VS MÉDIA ==========
  // Para cada limiar, calcula a sequência atual e compara com a média
  function getCurrentStreak(threshold) {
    const result = db.prepare(`
      WITH ranked AS (
        SELECT multiplier, ROW_NUMBER() OVER (ORDER BY id DESC) as rn
        FROM rounds
      )
      SELECT COUNT(*) as streak
      FROM ranked
      WHERE rn <= COALESCE(
        (SELECT MIN(rn) - 1 FROM ranked WHERE multiplier >= ?),
        (SELECT MAX(rn) FROM ranked)
      ) AND multiplier < ?
    `).get(threshold, threshold);
    return result?.streak || 0;
  }

  const sequenceAnalysis = {};
  // Configuração de thresholds: key é o label (2x, 5x...), actual é o valor real usado
  // Para 2x, usamos 2.2 como threshold real pois o cashout é ~2.10x
  const thresholdConfigs = [
    { key: 2, actual: 2.2 },
    { key: 5, actual: 5 },
    { key: 10, actual: 10 },
    { key: 15, actual: 15 },
    { key: 20, actual: 20 }
  ];

  for (const { key, actual } of thresholdConfigs) {
    const currentStreak = getCurrentStreak(actual);
    const avgRounds = probabilities[`x${key}`]?.avgRoundsToHit || 0;
    const probability = probabilities[`x${key}`]?.probability || 0;

    // Quanto "atrasado" ou "adiantado" está (razão entre atual e média)
    const deviationFromAvg = avgRounds > 0 ? (currentStreak / avgRounds) : 0;

    // Probabilidade acumulada de já ter saído (1 - (1-p)^n)
    const probShouldHaveHit = probability > 0
      ? (1 - Math.pow(1 - probability / 100, currentStreak)) * 100
      : 0;

    sequenceAnalysis[`below${key}x`] = {
      threshold: key,
      actualThreshold: actual,
      currentStreak,
      avgRoundsToHit: Number(avgRounds.toFixed(1)),
      deviationRatio: Number(deviationFromAvg.toFixed(2)),
      status: deviationFromAvg > 1.5 ? 'overdue' : deviationFromAvg > 1 ? 'due' : 'normal',
      probShouldHaveHit: Number(probShouldHaveHit.toFixed(1))
    };
  }

  // ========== 3. ANÁLISE DE PADRÕES PÓS-SEQUÊNCIA ==========
  // Após X rodadas sem atingir Y, qual a taxa de sucesso na próxima?
  const patternAnalysis = db.prepare(`
    WITH sequences AS (
      SELECT
        id,
        multiplier,
        LAG(multiplier, 1) OVER (ORDER BY id) as prev1,
        LAG(multiplier, 2) OVER (ORDER BY id) as prev2,
        LAG(multiplier, 3) OVER (ORDER BY id) as prev3,
        LAG(multiplier, 4) OVER (ORDER BY id) as prev4,
        LAG(multiplier, 5) OVER (ORDER BY id) as prev5
      FROM rounds
    )
    SELECT
      -- Após 3+ rodadas abaixo de 2x
      SUM(CASE WHEN prev1 < 2 AND prev2 < 2 AND prev3 < 2 AND multiplier >= 2 THEN 1 ELSE 0 END) as hit2x_after3below,
      SUM(CASE WHEN prev1 < 2 AND prev2 < 2 AND prev3 < 2 THEN 1 ELSE 0 END) as total_3below2x,
      -- Após 5+ rodadas abaixo de 2x
      SUM(CASE WHEN prev1 < 2 AND prev2 < 2 AND prev3 < 2 AND prev4 < 2 AND prev5 < 2 AND multiplier >= 2 THEN 1 ELSE 0 END) as hit2x_after5below,
      SUM(CASE WHEN prev1 < 2 AND prev2 < 2 AND prev3 < 2 AND prev4 < 2 AND prev5 < 2 THEN 1 ELSE 0 END) as total_5below2x,
      -- Após rodada com multiplicador alto (>10x)
      SUM(CASE WHEN prev1 >= 10 AND multiplier >= 2 THEN 1 ELSE 0 END) as hit2x_afterHigh,
      SUM(CASE WHEN prev1 >= 10 THEN 1 ELSE 0 END) as total_afterHigh,
      -- Após rodada muito baixa (<1.5x)
      SUM(CASE WHEN prev1 < 1.5 AND multiplier >= 2 THEN 1 ELSE 0 END) as hit2x_afterLow,
      SUM(CASE WHEN prev1 < 1.5 THEN 1 ELSE 0 END) as total_afterLow
    FROM sequences
    WHERE prev1 IS NOT NULL
  `).get();

  const patterns = {
    after3Below2x: {
      description: 'Taxa de 2x+ após 3 rodadas abaixo de 2x',
      successRate: patternAnalysis.total_3below2x > 0
        ? Number(((patternAnalysis.hit2x_after3below / patternAnalysis.total_3below2x) * 100).toFixed(1))
        : null,
      sample: patternAnalysis.total_3below2x
    },
    after5Below2x: {
      description: 'Taxa de 2x+ após 5 rodadas abaixo de 2x',
      successRate: patternAnalysis.total_5below2x > 0
        ? Number(((patternAnalysis.hit2x_after5below / patternAnalysis.total_5below2x) * 100).toFixed(1))
        : null,
      sample: patternAnalysis.total_5below2x
    },
    afterHighMultiplier: {
      description: 'Taxa de 2x+ após multiplicador 10x+',
      successRate: patternAnalysis.total_afterHigh > 0
        ? Number(((patternAnalysis.hit2x_afterHigh / patternAnalysis.total_afterHigh) * 100).toFixed(1))
        : null,
      sample: patternAnalysis.total_afterHigh
    },
    afterLowMultiplier: {
      description: 'Taxa de 2x+ após multiplicador <1.5x',
      successRate: patternAnalysis.total_afterLow > 0
        ? Number(((patternAnalysis.hit2x_afterLow / patternAnalysis.total_afterLow) * 100).toFixed(1))
        : null,
      sample: patternAnalysis.total_afterLow
    }
  };

  // ========== 4. MOMENTUM E TENDÊNCIA ==========
  // Compara as últimas N rodadas com a média geral
  const avgMultiplier = db.prepare(`SELECT AVG(multiplier) as avg FROM rounds`).get().avg;

  const last10Avg = db.prepare(`
    SELECT AVG(multiplier) as avg FROM (SELECT multiplier FROM rounds ORDER BY id DESC LIMIT 10)
  `).get().avg;

  const last20Avg = db.prepare(`
    SELECT AVG(multiplier) as avg FROM (SELECT multiplier FROM rounds ORDER BY id DESC LIMIT 20)
  `).get().avg;

  const last50Avg = db.prepare(`
    SELECT AVG(multiplier) as avg FROM (SELECT multiplier FROM rounds ORDER BY id DESC LIMIT 50)
  `).get().avg;

  // Volatilidade (desvio padrão)
  const volatilityData = db.prepare(`
    SELECT
      (SELECT AVG((multiplier - avg) * (multiplier - avg)) FROM rounds, (SELECT AVG(multiplier) as avg FROM rounds)) as variance_all,
      (SELECT AVG((multiplier - avg) * (multiplier - avg)) FROM (SELECT multiplier FROM rounds ORDER BY id DESC LIMIT 20), (SELECT AVG(multiplier) as avg FROM (SELECT multiplier FROM rounds ORDER BY id DESC LIMIT 20))) as variance_20
  `).get();

  const momentum = {
    avgMultiplierAll: Number(avgMultiplier.toFixed(2)),
    avgLast10: Number(last10Avg.toFixed(2)),
    avgLast20: Number(last20Avg.toFixed(2)),
    avgLast50: Number(last50Avg.toFixed(2)),
    trend10vs50: last50Avg > 0 ? Number(((last10Avg / last50Avg - 1) * 100).toFixed(1)) : 0,
    volatilityAll: volatilityData.variance_all ? Number(Math.sqrt(volatilityData.variance_all).toFixed(2)) : 0,
    volatilityRecent: volatilityData.variance_20 ? Number(Math.sqrt(volatilityData.variance_20).toFixed(2)) : 0,
    momentumStatus: last10Avg > avgMultiplier * 1.1 ? 'hot' : last10Avg < avgMultiplier * 0.9 ? 'cold' : 'neutral'
  };

  // ========== 5. CORRELAÇÕES ==========
  // Analisa correlação entre variáveis
  const correlationData = db.prepare(`
    SELECT
      -- Correlação jogadores vs multiplicador
      AVG(CASE WHEN betCount > (SELECT AVG(betCount) FROM rounds) THEN multiplier ELSE NULL END) as avgMultWhenHighPlayers,
      AVG(CASE WHEN betCount <= (SELECT AVG(betCount) FROM rounds) THEN multiplier ELSE NULL END) as avgMultWhenLowPlayers,
      -- Correlação total apostado vs multiplicador
      AVG(CASE WHEN totalBet > (SELECT AVG(totalBet) FROM rounds) THEN multiplier ELSE NULL END) as avgMultWhenHighBets,
      AVG(CASE WHEN totalBet <= (SELECT AVG(totalBet) FROM rounds) THEN multiplier ELSE NULL END) as avgMultWhenLowBets,
      -- Média de jogadores
      AVG(betCount) as avgPlayers
    FROM rounds
  `).get();

  const correlations = {
    playersVsMultiplier: {
      avgMultHighPlayers: correlationData.avgMultWhenHighPlayers ? Number(correlationData.avgMultWhenHighPlayers.toFixed(2)) : 0,
      avgMultLowPlayers: correlationData.avgMultWhenLowPlayers ? Number(correlationData.avgMultWhenLowPlayers.toFixed(2)) : 0,
      insight: correlationData.avgMultWhenHighPlayers > correlationData.avgMultWhenLowPlayers
        ? 'Multiplicadores tendem a ser maiores com mais jogadores'
        : 'Multiplicadores tendem a ser menores com mais jogadores'
    },
    betsVsMultiplier: {
      avgMultHighBets: correlationData.avgMultWhenHighBets ? Number(correlationData.avgMultWhenHighBets.toFixed(2)) : 0,
      avgMultLowBets: correlationData.avgMultWhenLowBets ? Number(correlationData.avgMultWhenLowBets.toFixed(2)) : 0,
      insight: correlationData.avgMultWhenHighBets > correlationData.avgMultWhenLowBets
        ? 'Multiplicadores tendem a ser maiores com mais apostas'
        : 'Multiplicadores tendem a ser menores com mais apostas'
    }
  };

  // ========== 6. SCORE DE FAVORABILIDADE ==========
  // Calcula um score de 0-100 baseado em múltiplos fatores
  let favorabilityScore = 50; // Base

  // Fator 1: Sequência atual (se está "atrasado")
  const seq2x = sequenceAnalysis.below2x;
  if (seq2x.deviationRatio > 2) favorabilityScore += 15;
  else if (seq2x.deviationRatio > 1.5) favorabilityScore += 10;
  else if (seq2x.deviationRatio > 1) favorabilityScore += 5;

  // Fator 2: Momentum (se está "frio", pode esquentar)
  if (momentum.momentumStatus === 'cold') favorabilityScore += 10;
  else if (momentum.momentumStatus === 'hot') favorabilityScore -= 5;

  // Fator 3: Tendência recente
  if (momentum.trend10vs50 < -10) favorabilityScore += 10;
  else if (momentum.trend10vs50 > 10) favorabilityScore -= 5;

  // Fator 4: Horário (se temos dados suficientes)
  const currentHour = new Date().getHours();
  const hourlyData = db.prepare(`
    SELECT AVG(multiplier) as avg
    FROM rounds
    WHERE CAST(strftime('%H', createdAt) AS INTEGER) = ?
  `).get(currentHour);

  if (hourlyData.avg && avgMultiplier) {
    if (hourlyData.avg > avgMultiplier * 1.1) favorabilityScore += 10;
    else if (hourlyData.avg < avgMultiplier * 0.9) favorabilityScore -= 10;
  }

  // Limita entre 0 e 100
  favorabilityScore = Math.max(0, Math.min(100, favorabilityScore));

  // ========== 7. TAXAS DE SUCESSO PARA ESTRATÉGIA ==========
  // Taxas rápidas para os principais pontos de cashout
  const successRates = {
    '1.5x': {
      rate: probabilities['x1.5'].probability,
      avgRounds: probabilities['x1.5'].avgRoundsToHit,
      description: 'Cashout seguro'
    },
    '2x': {
      rate: probabilities.x2.probability,
      avgRounds: probabilities.x2.avgRoundsToHit,
      description: 'Estratégia padrão'
    },
    '3x': {
      rate: probabilities.x3.probability,
      avgRounds: probabilities.x3.avgRoundsToHit,
      description: 'Risco moderado'
    },
    '5x': {
      rate: probabilities.x5.probability,
      avgRounds: probabilities.x5.avgRoundsToHit,
      description: 'Risco alto'
    },
    '10x': {
      rate: probabilities.x10.probability,
      avgRounds: probabilities.x10.avgRoundsToHit,
      description: 'Risco muito alto'
    }
  };

  // ========== 8. RECOMENDAÇÕES ==========
  const recommendations = [];

  // Recomendação baseada em sequência para 2x
  if (seq2x.currentStreak >= seq2x.avgRoundsToHit * 1.5) {
    recommendations.push({
      type: 'sequence',
      priority: 'high',
      message: `Sequência de ${seq2x.currentStreak} rodadas sem 2x (média: ${seq2x.avgRoundsToHit}). Probabilidade de já ter saído: ${seq2x.probShouldHaveHit}%`,
      action: 'Momento favorável para apostar em 2x'
    });
  }

  // Verifica sequências atrasadas para outros multiplicadores
  const seq5x = sequenceAnalysis.below5x;
  const seq10x = sequenceAnalysis.below10x;

  if (seq5x.deviationRatio >= 1.5) {
    recommendations.push({
      type: 'sequence',
      priority: 'medium',
      message: `${seq5x.currentStreak} rodadas sem 5x (média: ${seq5x.avgRoundsToHit}). Pode ser bom manter segunda aposta até 5x.`,
      action: 'Considere segurar a segunda aposta para 5x'
    });
  }

  if (seq10x.deviationRatio >= 2) {
    recommendations.push({
      type: 'sequence',
      priority: 'medium',
      message: `${seq10x.currentStreak} rodadas sem 10x (média: ${seq10x.avgRoundsToHit}). Estatisticamente atrasado.`,
      action: 'Possível oportunidade para 10x em breve'
    });
  }

  // Recomendação baseada em momentum
  if (momentum.momentumStatus === 'cold') {
    recommendations.push({
      type: 'momentum',
      priority: 'info',
      message: `Momento frio: últimas 10 rodadas com média ${momentum.avgLast10}x (geral: ${momentum.avgMultiplierAll}x)`,
      action: 'Pode indicar reversão à média em breve'
    });
  } else if (momentum.momentumStatus === 'hot') {
    recommendations.push({
      type: 'momentum',
      priority: 'warning',
      message: `Momento quente: últimas 10 rodadas com média ${momentum.avgLast10}x (geral: ${momentum.avgMultiplierAll}x)`,
      action: 'Cuidado - pode voltar à média a qualquer momento'
    });
  }

  // Recomendação baseada em horário
  if (hourlyData.avg) {
    const hourVsAvg = ((hourlyData.avg / avgMultiplier) - 1) * 100;
    if (hourVsAvg > 15) {
      recommendations.push({
        type: 'timing',
        priority: 'info',
        message: `Horário ${currentHour}h historicamente bom: média ${Number(hourlyData.avg.toFixed(2))}x (+${hourVsAvg.toFixed(0)}% vs geral)`,
        action: 'Horário favorável para jogar'
      });
    } else if (hourVsAvg < -15) {
      recommendations.push({
        type: 'timing',
        priority: 'warning',
        message: `Horário ${currentHour}h historicamente fraco: média ${Number(hourlyData.avg.toFixed(2))}x (${hourVsAvg.toFixed(0)}% vs geral)`,
        action: 'Considere esperar horário melhor'
      });
    }
  }

  // Análise de risco/retorno para estratégia dupla
  const riskAnalysis = {
    conservative: {
      cashout: 1.5,
      winRate: successRates['1.5x'].rate,
      expectedRounds: successRates['1.5x'].avgRounds
    },
    standard: {
      cashout: 2,
      winRate: successRates['2x'].rate,
      expectedRounds: successRates['2x'].avgRounds
    },
    aggressive: {
      cashout: 3,
      winRate: successRates['3x'].rate,
      expectedRounds: successRates['3x'].avgRounds
    }
  };

  return {
    totalRounds,
    probabilities,
    sequenceAnalysis,
    patterns,
    momentum,
    correlations,
    favorabilityScore,
    favorabilityLevel: favorabilityScore >= 70 ? 'high' : favorabilityScore >= 50 ? 'medium' : 'low',
    successRates,
    riskAnalysis,
    recommendations,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Fecha a conexão com o banco
 */
export function closeDatabase() {
  if (db) {
    db.close();
    console.log('[DB] Conexão fechada');
  }
}

export default {
  initDatabase,
  insertRound,
  getLastRounds,
  getAllRounds,
  getStats,
  getLastRound,
  getHourlyAnalysis,
  getHouseProfitByPeriod,
  getAdvancedStats,
  closeDatabase
};
