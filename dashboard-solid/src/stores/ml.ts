import { createStore } from 'solid-js/store';
import type { MLPrediction, RoundData } from '../types';
import { processBotRound } from './bots';

export interface MLState {
  prediction: MLPrediction | null;
  lastUpdated: Date | null;
  isAvailable: boolean;
  isConnected: boolean;
  // Pending round waiting for ML prediction
  pendingRound: RoundData | null;
  pendingRounds: RoundData[] | null;
  pendingTimeout: number | null;
}

const initialState: MLState = {
  prediction: null,
  lastUpdated: null,
  isAvailable: false,
  isConnected: false,
  pendingRound: null,
  pendingRounds: null,
  pendingTimeout: null,
};

const [state, setState] = createStore<MLState>(initialState);

export const mlStore = state;

// Timeout for waiting for ML prediction (ms)
const ML_PREDICTION_TIMEOUT = 3000;

/**
 * Called when a new round arrives from WebSocket.
 * Stores the round as pending and waits for the correct ML prediction.
 */
export function onNewRoundArrived(round: RoundData, allRounds: RoundData[]) {
  console.log(`[ML Sync] New round arrived: #${round.id}, waiting for ML prediction for round #${round.id + 1}`);

  // Clear any existing timeout
  if (state.pendingTimeout) {
    clearTimeout(state.pendingTimeout);
  }

  // Store the pending round
  setState('pendingRound', round);
  setState('pendingRounds', allRounds);

  // Check if we already have the correct prediction
  // (This can happen if ML prediction arrived before the round)
  if (state.prediction && state.prediction.round_id === round.id + 1) {
    console.log(`[ML Sync] Already have correct prediction for round #${round.id + 1}, processing immediately`);
    processPendingRound();
    return;
  }

  // Set timeout to process without ML if prediction doesn't arrive
  const timeout = window.setTimeout(() => {
    if (state.pendingRound) {
      console.log(`[ML Sync] Timeout waiting for ML prediction, processing without correct ML`);
      processPendingRound();
    }
  }, ML_PREDICTION_TIMEOUT);

  setState('pendingTimeout', timeout);
}

/**
 * Called when a new ML prediction arrives from WebSocket.
 * Checks if it matches the pending round and processes if so.
 */
export function setMLPrediction(prediction: MLPrediction) {
  console.log(`[ML Sync] ML prediction received for round #${prediction.round_id}`);

  setState({
    prediction,
    lastUpdated: new Date(),
    isAvailable: true,
    isConnected: true,
  });

  // Check if we have a pending round waiting for this prediction
  if (state.pendingRound) {
    const expectedRoundId = state.pendingRound.id + 1;

    if (prediction.round_id === expectedRoundId) {
      console.log(`[ML Sync] Prediction matches expected round #${expectedRoundId}, processing bot`);
      processPendingRound();
    } else {
      console.log(`[ML Sync] Prediction round_id ${prediction.round_id} doesn't match expected ${expectedRoundId}`);
    }
  }
}

/**
 * Process the pending round with the current ML prediction.
 */
function processPendingRound() {
  const round = state.pendingRound;
  const allRounds = state.pendingRounds;

  if (!round || !allRounds) {
    console.log(`[ML Sync] No pending round to process`);
    return;
  }

  // Clear timeout
  if (state.pendingTimeout) {
    clearTimeout(state.pendingTimeout);
  }

  // Clear pending state
  setState('pendingRound', null);
  setState('pendingRounds', null);
  setState('pendingTimeout', null);

  // Check if the prediction is for the correct round
  const expectedRoundId = round.id + 1;
  const mlPrediction = state.prediction;

  if (mlPrediction && mlPrediction.round_id === expectedRoundId) {
    console.log(`[ML Sync] Processing bot with correct ML prediction for round #${expectedRoundId}`);
    processBotRound(round, allRounds, mlPrediction);
  } else {
    // Process without ML or with outdated ML
    console.log(`[ML Sync] Processing bot WITHOUT correct ML prediction (have: ${mlPrediction?.round_id}, need: ${expectedRoundId})`);
    processBotRound(round, allRounds, null);
  }
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

/**
 * Check if the current ML prediction is valid for the given round.
 * The prediction should be for round.id + 1 (the NEXT round).
 */
export function isMLPredictionValidForRound(round: RoundData): boolean {
  if (!state.prediction) return false;
  return state.prediction.round_id === round.id + 1;
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
