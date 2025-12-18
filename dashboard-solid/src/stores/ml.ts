import { createStore } from 'solid-js/store';
import type { MLPrediction } from '../types';

export interface MLState {
  prediction: MLPrediction | null;
  lastUpdated: Date | null;
  isAvailable: boolean;
  isConnected: boolean;
}

const initialState: MLState = {
  prediction: null,
  lastUpdated: null,
  isAvailable: false,
  isConnected: false,
};

const [state, setState] = createStore<MLState>(initialState);

export const mlStore = state;

export function setMLPrediction(prediction: MLPrediction) {
  setState({
    prediction,
    lastUpdated: new Date(),
    isAvailable: true,
    isConnected: true,
  });
}

export function setMLConnected(connected: boolean) {
  setState('isConnected', connected);
}

export function clearMLPrediction() {
  setState({
    prediction: null,
    lastUpdated: null,
    isAvailable: false,
  });
}

export function isMLAvailable(): boolean {
  return state.isAvailable && state.prediction !== null;
}

// Get confidence level based on prob_gt_2x
export function getMLConfidence(): 'high' | 'medium' | 'low' | 'very_low' | null {
  if (!state.prediction) return null;

  const prob2x = state.prediction.prob_gt_2x;
  if (prob2x >= 0.6) return 'high';
  if (prob2x >= 0.5) return 'medium';
  if (prob2x >= 0.4) return 'low';
  return 'very_low';
}
