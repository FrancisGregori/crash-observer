import { createSignal } from 'solid-js';

// Tipos para o sinal de sequência
export interface SequenceSignal {
  type: 'LOW_SEQUENCE';
  strength: 'MODERATE' | 'STRONG';
  consecutiveLows: number;
  recentCrashes: number[];
  probabilities: {
    gte2x: number;
    gte3x: number;
    gte5x: number;
    gte10x: number;
    factor: number;
    consecutiveLows: number;
  };
  recommendedTarget: number;
  emittedAt: number;
}

export interface SequenceIndicatorState {
  recentCrashes: number[];
  consecutiveLows: number;
  hasSignal: boolean;
  currentSignal: SequenceSignal | null;
  stats: {
    signalsEmitted: number;
    signalsHit: {
      conservative: number;
      moderate: number;
      aggressive: number;
      veryAggressive: number;
    };
    signalsMissed: number;
    hitRates: {
      conservative?: string;
      moderate?: string;
      aggressive?: string;
      veryAggressive?: string;
    };
  };
}

// Estado do indicador de sequência
const [sequenceState, setSequenceState] = createSignal<SequenceIndicatorState | null>(null);
const [hasActiveSignal, setHasActiveSignal] = createSignal(false);

// Atualiza o estado do indicador
export function setSequenceIndicatorState(state: SequenceIndicatorState) {
  setSequenceState(state);
  setHasActiveSignal(state.hasSignal);

  if (state.hasSignal && state.currentSignal) {
    console.log(`[Sequence] Sinal ${state.currentSignal.strength}: ${state.currentSignal.consecutiveLows} baixas consecutivas`);
  }
}

// Retorna o estado atual
export function getSequenceState() {
  return sequenceState();
}

// Retorna se há um sinal ativo
export function getHasActiveSignal() {
  return hasActiveSignal();
}

// Retorna o sinal atual
export function getCurrentSignal(): SequenceSignal | null {
  const state = sequenceState();
  return state?.currentSignal || null;
}

// Limpa o sinal (quando uma rodada completa)
export function clearSignal() {
  const state = sequenceState();
  if (state) {
    setSequenceState({
      ...state,
      hasSignal: false,
      currentSignal: null
    });
    setHasActiveSignal(false);
  }
}

// Verifica se deve apostar baseado no sinal
export function shouldBetOnSignal(minStrength: 'MODERATE' | 'STRONG' = 'MODERATE'): boolean {
  const signal = getCurrentSignal();
  if (!signal) return false;

  if (minStrength === 'STRONG') {
    return signal.strength === 'STRONG';
  }

  return true; // MODERATE ou STRONG
}

// Retorna o alvo recomendado pelo sinal
export function getSignalRecommendedTarget(): number | null {
  const signal = getCurrentSignal();
  return signal?.recommendedTarget || null;
}

// Retorna a probabilidade de atingir um multiplicador
export function getSignalProbability(target: '2x' | '3x' | '5x' | '10x'): number | null {
  const signal = getCurrentSignal();
  if (!signal) return null;

  switch (target) {
    case '2x': return signal.probabilities.gte2x;
    case '3x': return signal.probabilities.gte3x;
    case '5x': return signal.probabilities.gte5x;
    case '10x': return signal.probabilities.gte10x;
    default: return null;
  }
}

export { sequenceState, hasActiveSignal };
