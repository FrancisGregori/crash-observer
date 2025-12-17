import { WebSocketServer } from 'ws';
import { WS_MESSAGE_TYPES } from '../shared/protocol.js';

let wss = null;
const clients = new Set();

/**
 * Inicializa o servidor WebSocket
 */
export function initWebSocket(port) {
  wss = new WebSocketServer({ port });

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    console.log(`[WS] Cliente conectado. Total: ${clients.size}`);

    // Envia mensagem de conexão
    ws.send(JSON.stringify({
      type: WS_MESSAGE_TYPES.CONNECTED,
      data: { message: 'Conectado ao Observer' },
      timestamp: new Date().toISOString()
    }));

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Cliente desconectado. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Erro:', err.message);
      clients.delete(ws);
    });

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  });

  // Ping interval para manter conexões vivas
  const pingInterval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) {
        clients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  console.log(`[WS] Servidor WebSocket iniciado na porta ${port}`);
  return wss;
}

/**
 * Envia mensagem para todos os clientes conectados
 */
export function broadcast(type, data) {
  const message = JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString()
  });

  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

/**
 * Broadcast de nova rodada
 */
export function broadcastRound(round) {
  broadcast(WS_MESSAGE_TYPES.ROUND, round);
  console.log(`[WS] Rodada enviada para ${clients.size} clientes`);
}

/**
 * Broadcast de evento de live betting
 */
export function broadcastLiveBetEvent(eventType, data) {
  broadcast(WS_MESSAGE_TYPES.LIVE_BET, { type: eventType, data });
}

/**
 * Broadcast de fase de apostas
 */
export function broadcastBettingPhase(data) {
  broadcast(WS_MESSAGE_TYPES.BETTING_PHASE, data);
}

/**
 * Broadcast de previsão ML
 */
export function broadcastMLPrediction(prediction) {
  broadcast(WS_MESSAGE_TYPES.ML_PREDICTION, prediction);
  console.log(`[WS] ML prediction broadcast to ${clients.size} clients`);
}

/**
 * Retorna o número de clientes conectados
 */
export function getClientCount() {
  return clients.size;
}

export default {
  initWebSocket,
  broadcast,
  broadcastRound,
  broadcastLiveBetEvent,
  broadcastBettingPhase,
  broadcastMLPrediction,
  getClientCount
};
