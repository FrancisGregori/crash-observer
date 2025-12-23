/**
 * Sequence Indicator Module
 * Analisa sequências de crashes para identificar momentos favoráveis
 *
 * Baseado na análise estatística:
 * - Após 3-4 rodadas consecutivas < 2x, probabilidade de >= 5x dobra (20% -> 41%)
 * - Após 4 rodadas < 2x, probabilidade de >= 10x dobra (10% -> 21%)
 */

// Configuração dos indicadores
const INDICATORS = {
  // Indicador principal: sequência de baixos
  lowSequence: {
    threshold: 2.0,      // Considera "baixo" se < 2x
    minSequence: 3,      // Mínimo de rodadas baixas para sinal
    strongSignal: 4,     // Rodadas para sinal forte
  },

  // Alvos de multiplicador
  targets: {
    conservative: 2.0,   // Alvo conservador
    moderate: 3.0,       // Alvo moderado
    aggressive: 5.0,     // Alvo agressivo
    veryAggressive: 10.0 // Alvo muito agressivo
  }
};

// Estado do indicador
let recentCrashes = [];
let currentSignal = null;
let signalHistory = [];
let stats = {
  signalsEmitted: 0,
  signalsHit: {
    conservative: 0,
    moderate: 0,
    aggressive: 0,
    veryAggressive: 0
  },
  signalsMissed: 0
};

// Callbacks
let onSignalCallback = null;

/**
 * Adiciona um novo crash ao histórico e analisa
 */
function addCrash(multiplier) {
  recentCrashes.push(multiplier);

  // Manter apenas últimas 50 rodadas
  if (recentCrashes.length > 50) {
    recentCrashes.shift();
  }

  // Se havia um sinal ativo, verificar resultado
  if (currentSignal) {
    evaluateSignal(multiplier);
  }

  // Analisar nova sequência
  analyzeSequence();

  return getState();
}

/**
 * Avalia o resultado de um sinal ativo
 */
function evaluateSignal(multiplier) {
  if (!currentSignal) return;

  const { targets } = INDICATORS;

  // Verificar quais alvos foram atingidos
  if (multiplier >= targets.veryAggressive) {
    stats.signalsHit.veryAggressive++;
    stats.signalsHit.aggressive++;
    stats.signalsHit.moderate++;
    stats.signalsHit.conservative++;
  } else if (multiplier >= targets.aggressive) {
    stats.signalsHit.aggressive++;
    stats.signalsHit.moderate++;
    stats.signalsHit.conservative++;
  } else if (multiplier >= targets.moderate) {
    stats.signalsHit.moderate++;
    stats.signalsHit.conservative++;
  } else if (multiplier >= targets.conservative) {
    stats.signalsHit.conservative++;
  } else {
    stats.signalsMissed++;
  }

  // Registrar resultado
  signalHistory.push({
    ...currentSignal,
    result: multiplier,
    hitConservative: multiplier >= targets.conservative,
    hitModerate: multiplier >= targets.moderate,
    hitAggressive: multiplier >= targets.aggressive,
    hitVeryAggressive: multiplier >= targets.veryAggressive,
    timestamp: Date.now()
  });

  // Limpar sinal
  currentSignal = null;
}

/**
 * Analisa a sequência atual de crashes
 */
function analyzeSequence() {
  const { lowSequence } = INDICATORS;

  // Contar sequência de baixos recentes
  let consecutiveLows = 0;
  for (let i = recentCrashes.length - 1; i >= 0; i--) {
    if (recentCrashes[i] < lowSequence.threshold) {
      consecutiveLows++;
    } else {
      break;
    }
  }

  // Verificar se devemos emitir sinal
  if (consecutiveLows >= lowSequence.minSequence) {
    const signalStrength = consecutiveLows >= lowSequence.strongSignal ? 'STRONG' : 'MODERATE';

    // Calcular probabilidades baseadas na análise histórica
    const probabilities = calculateProbabilities(consecutiveLows);

    currentSignal = {
      type: 'LOW_SEQUENCE',
      strength: signalStrength,
      consecutiveLows,
      recentCrashes: recentCrashes.slice(-10),
      probabilities,
      recommendedTarget: signalStrength === 'STRONG' ?
        INDICATORS.targets.aggressive : INDICATORS.targets.moderate,
      emittedAt: Date.now()
    };

    stats.signalsEmitted++;

    // Callback
    if (onSignalCallback) {
      onSignalCallback(currentSignal);
    }

    return currentSignal;
  }

  return null;
}

/**
 * Calcula probabilidades baseadas na análise histórica
 */
function calculateProbabilities(consecutiveLows) {
  // Baseado na análise de dados históricos
  // Probabilidades normais vs após sequência de baixos

  const baseProbs = {
    gte2x: 0.50,   // 50% chance de >= 2x normalmente
    gte3x: 0.33,   // 33% chance de >= 3x normalmente
    gte5x: 0.20,   // 20% chance de >= 5x normalmente
    gte10x: 0.10   // 10% chance de >= 10x normalmente
  };

  // Fator de multiplicação baseado em consecutiveLows
  // 3 baixos: 1.5x, 4 baixos: 2x, 5+ baixos: 2.2x
  let factor = 1.0;
  if (consecutiveLows >= 5) {
    factor = 2.2;
  } else if (consecutiveLows >= 4) {
    factor = 2.0;
  } else if (consecutiveLows >= 3) {
    factor = 1.5;
  }

  return {
    gte2x: Math.min(baseProbs.gte2x * factor, 0.85),
    gte3x: Math.min(baseProbs.gte3x * factor, 0.70),
    gte5x: Math.min(baseProbs.gte5x * factor, 0.45),
    gte10x: Math.min(baseProbs.gte10x * factor, 0.25),
    factor,
    consecutiveLows
  };
}

/**
 * Retorna o estado atual do indicador
 */
function getState() {
  const { lowSequence } = INDICATORS;

  // Contar sequência atual
  let consecutiveLows = 0;
  for (let i = recentCrashes.length - 1; i >= 0; i--) {
    if (recentCrashes[i] < lowSequence.threshold) {
      consecutiveLows++;
    } else {
      break;
    }
  }

  // Calcular estatísticas de acerto
  const hitRates = {};
  if (stats.signalsEmitted > 0) {
    hitRates.conservative = (stats.signalsHit.conservative / stats.signalsEmitted * 100).toFixed(1);
    hitRates.moderate = (stats.signalsHit.moderate / stats.signalsEmitted * 100).toFixed(1);
    hitRates.aggressive = (stats.signalsHit.aggressive / stats.signalsEmitted * 100).toFixed(1);
    hitRates.veryAggressive = (stats.signalsHit.veryAggressive / stats.signalsEmitted * 100).toFixed(1);
  }

  return {
    recentCrashes: recentCrashes.slice(-10),
    consecutiveLows,
    hasSignal: currentSignal !== null,
    currentSignal,
    stats: {
      ...stats,
      hitRates
    },
    thresholds: INDICATORS
  };
}

/**
 * Retorna análise detalhada
 */
function getAnalysis() {
  const state = getState();

  let recommendation = 'AGUARDAR';
  let confidence = 'LOW';
  let targetMultiplier = null;

  if (state.consecutiveLows >= 4) {
    recommendation = 'APOSTAR';
    confidence = 'HIGH';
    targetMultiplier = INDICATORS.targets.aggressive;
  } else if (state.consecutiveLows >= 3) {
    recommendation = 'CONSIDERAR';
    confidence = 'MEDIUM';
    targetMultiplier = INDICATORS.targets.moderate;
  } else if (state.consecutiveLows >= 2) {
    recommendation = 'PREPARAR';
    confidence = 'LOW';
    targetMultiplier = INDICATORS.targets.conservative;
  }

  return {
    ...state,
    recommendation,
    confidence,
    targetMultiplier,
    message: generateMessage(state, recommendation, confidence)
  };
}

/**
 * Gera mensagem legível
 */
function generateMessage(state, recommendation, confidence) {
  const { consecutiveLows, recentCrashes } = state;

  if (consecutiveLows === 0) {
    return `Última rodada: ${recentCrashes[recentCrashes.length - 1]?.toFixed(2)}x. Aguardando sequência de baixos.`;
  }

  if (consecutiveLows < 3) {
    return `${consecutiveLows} rodada(s) baixa(s) consecutiva(s). Aguardando mais ${3 - consecutiveLows} para sinal.`;
  }

  if (consecutiveLows >= 4) {
    return `🔥 SINAL FORTE: ${consecutiveLows} rodadas baixas! Probabilidade de >=5x aumentada para ~40%`;
  }

  return `⚡ SINAL: ${consecutiveLows} rodadas baixas. Probabilidade de >=3x aumentada.`;
}

/**
 * Configura callback para sinais
 */
function onSignal(callback) {
  onSignalCallback = callback;
}

/**
 * Inicializa com histórico existente
 */
function initWithHistory(crashes) {
  recentCrashes = crashes.slice(-50);
  analyzeSequence();
  return getState();
}

/**
 * Reseta o indicador
 */
function reset() {
  recentCrashes = [];
  currentSignal = null;
  signalHistory = [];
  stats = {
    signalsEmitted: 0,
    signalsHit: {
      conservative: 0,
      moderate: 0,
      aggressive: 0,
      veryAggressive: 0
    },
    signalsMissed: 0
  };
}

/**
 * Retorna histórico de sinais
 */
function getSignalHistory() {
  return signalHistory;
}

export {
  addCrash,
  getState,
  getAnalysis,
  onSignal,
  initWithHistory,
  reset,
  getSignalHistory,
  INDICATORS
};

export default {
  addCrash,
  getState,
  getAnalysis,
  onSignal,
  initWithHistory,
  reset,
  getSignalHistory,
  INDICATORS
};
