/**
 * Redis Subscriber for ML Predictions
 *
 * This module connects to Redis and subscribes to the ml_predictions channel.
 * When predictions are received, they are broadcast to all WebSocket clients.
 */

import { createClient } from 'redis';
import { broadcast } from './websocket.js';
import { WS_MESSAGE_TYPES } from '../shared/protocol.js';

// Redis configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0'),
};

const REDIS_CHANNEL = 'ml_predictions';

let subscriber = null;
let isConnected = false;
let lastPrediction = null;

/**
 * Initialize Redis subscriber
 */
export async function initRedisSubscriber() {
  console.log('[Redis] Initializing subscriber...');

  try {
    // Create Redis client
    subscriber = createClient({
      socket: {
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
      },
      database: REDIS_CONFIG.db,
    });

    // Error handling
    subscriber.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
      isConnected = false;
    });

    subscriber.on('connect', () => {
      console.log('[Redis] Connected successfully');
      isConnected = true;
    });

    subscriber.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
      isConnected = false;
    });

    // Connect to Redis
    await subscriber.connect();

    // Subscribe to predictions channel
    await subscriber.subscribe(REDIS_CHANNEL, (message) => {
      handlePrediction(message);
    });

    console.log(`[Redis] Subscribed to channel: ${REDIS_CHANNEL}`);
    return true;

  } catch (error) {
    console.error('[Redis] Failed to initialize:', error.message);
    console.log('[Redis] ML predictions will not be available');
    return false;
  }
}

/**
 * Handle incoming prediction from Redis
 */
function handlePrediction(message) {
  try {
    const prediction = JSON.parse(message);

    console.log(`[Redis] Received prediction for round ${prediction.round_id}`);

    // Store last prediction
    lastPrediction = prediction;

    // Broadcast to all WebSocket clients
    broadcast(WS_MESSAGE_TYPES.ML_PREDICTION, prediction);

    console.log('[Redis] Prediction broadcast to WebSocket clients');

  } catch (error) {
    console.error('[Redis] Error parsing prediction:', error.message);
  }
}

/**
 * Get the last prediction received
 */
export function getLastPrediction() {
  return lastPrediction;
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected() {
  return isConnected;
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedisSubscriber() {
  if (subscriber) {
    console.log('[Redis] Closing connection...');
    await subscriber.unsubscribe(REDIS_CHANNEL);
    await subscriber.quit();
    subscriber = null;
    isConnected = false;
    console.log('[Redis] Connection closed');
  }
}

export default {
  initRedisSubscriber,
  getLastPrediction,
  isRedisConnected,
  closeRedisSubscriber,
};
