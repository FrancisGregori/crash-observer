import { onCleanup } from 'solid-js';
import {
  setConnectionStatus,
  setConnectionError,
  incrementReconnectAttempts,
  resetReconnectAttempts,
} from '../stores/connection';
import { processNewRound, fetchStats, fetchHourlyAnalysis, fetchHouseProfit, fetchAdvancedStats } from '../stores/rounds';
import { setMLPrediction, setMLConnected } from '../stores/ml';
import { resolveBet as resolveSimulatorBet } from '../stores/simulator';
import type { RoundData, MLPrediction } from '../types';

// WebSocket URL - connects directly to observer WS port
const WS_URL = `ws://${window.location.hostname}:3001`;

let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

// Periodic refresh intervals
let statsInterval: number | null = null;
let hourlyInterval: number | null = null;
let advancedInterval: number | null = null;

// Message handlers - the server sends { type, data, timestamp }
function handleMessage(event: MessageEvent) {
  try {
    const message = JSON.parse(event.data);
    const { type, data, timestamp } = message;

    console.log(`[WS] Mensagem recebida: ${type}`, data);

    switch (type) {
      case 'connected':
        console.log('[WS] Conectado ao servidor');
        setConnectionStatus('connected');
        resetReconnectAttempts();
        break;

      case 'round': {
        // Server sends round data directly in 'data' or at root level
        const round = (data as RoundData) || message;
        if (round.id && round.multiplier !== undefined) {
          console.log(`[WS] Nova rodada: #${round.id} - ${round.multiplier}x`);
          processNewRound(round);
          // Resolve simulator bet if active
          resolveSimulatorBet(round.multiplier);
        }
        break;
      }

      case 'ml_prediction': {
        const prediction = data as MLPrediction;
        if (prediction && prediction.round_id !== undefined) {
          console.log(`[WS] ML Prediction para rodada ${prediction.round_id}`);
          setMLPrediction(prediction);
          setMLConnected(true);
        }
        break;
      }

      case 'betting_phase':
        console.log('[WS] Fase de apostas:', data);
        // Trigger bot decisions in the future
        break;

      case 'liveBet':
        console.log('[WS] Live bet event:', data);
        // Handle live betting events
        break;

      case 'game_state':
        console.log('[WS] Game state:', data);
        break;

      default:
        console.log(`[WS] Mensagem não tratada: ${type}`, data);
    }
  } catch (err) {
    console.error('[WS] Erro ao processar mensagem:', err);
  }
}

function connect() {
  if (ws?.readyState === WebSocket.OPEN) {
    return;
  }

  setConnectionStatus('connecting');

  try {
    console.log(`[WS] Conectando a ${WS_URL}...`);
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[WS] Conexão estabelecida');
      setConnectionStatus('connected');
      setConnectionError(null);
      resetReconnectAttempts();

      // Start periodic refresh intervals
      startPeriodicRefresh();
    };

    ws.onmessage = handleMessage;

    ws.onclose = (event) => {
      console.log(`[WS] Conexão fechada (code: ${event.code})`);
      setConnectionStatus('disconnected');
      setMLConnected(false);
      ws = null;
      stopPeriodicRefresh();
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('[WS] Erro de conexão:', error);
      setConnectionError('Erro de conexão WebSocket');
    };
  } catch (err) {
    console.error('[WS] Erro ao conectar:', err);
    setConnectionError('Falha ao conectar');
    scheduleReconnect();
  }
}

function disconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  stopPeriodicRefresh();

  if (ws) {
    ws.close();
    ws = null;
  }

  setConnectionStatus('disconnected');
  setMLConnected(false);
}

function scheduleReconnect() {
  if (reconnectTimeout) return;

  incrementReconnectAttempts();
  console.log(`[WS] Reconectando em ${RECONNECT_DELAY / 1000}s...`);

  reconnectTimeout = window.setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, RECONNECT_DELAY);
}

function startPeriodicRefresh() {
  // Refresh stats every 30 seconds
  if (!statsInterval) {
    statsInterval = window.setInterval(() => {
      fetchStats();
      fetchHouseProfit();
    }, 30000);
  }

  // Refresh hourly analysis every 60 seconds
  if (!hourlyInterval) {
    hourlyInterval = window.setInterval(() => {
      fetchHourlyAnalysis();
    }, 60000);
  }

  // Refresh advanced stats every 30 seconds
  if (!advancedInterval) {
    advancedInterval = window.setInterval(() => {
      fetchAdvancedStats();
    }, 30000);
  }

  console.log('[WS] Refresh periódico iniciado');
}

function stopPeriodicRefresh() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
  if (hourlyInterval) {
    clearInterval(hourlyInterval);
    hourlyInterval = null;
  }
  if (advancedInterval) {
    clearInterval(advancedInterval);
    advancedInterval = null;
  }
}

function send(type: string, data?: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...data }));
  } else {
    console.warn('[WS] Não conectado, não foi possível enviar:', type);
  }
}

function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

export function useWebSocket() {
  onCleanup(() => {
    disconnect();
  });

  return {
    connect,
    disconnect,
    send,
    isConnected,
  };
}
