import { WebSocketServer } from 'ws';
import { WS_MESSAGE_TYPES } from '../shared/protocol.js';
import { insertRound, syncHistoryMultipliers } from '../database.js';
import * as sequenceIndicator from './sequenceIndicator.js';

let wss = null;
const clients = new Set();
let lastExtensionMultiplier = 0;
let lastExtensionSaveTime = 0;

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

    // Handler para mensagens recebidas (extensao Firefox)
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleIncomingMessage(message, ws);
      } catch (err) {
        console.error('[WS] Erro ao processar mensagem:', err.message);
      }
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
 * Broadcast de sinal de sequência
 */
export function broadcastSignal(signalData) {
  broadcast(WS_MESSAGE_TYPES.SEQUENCE_SIGNAL, signalData);
  console.log(`[WS] Sequence signal broadcast to ${clients.size} clients`);
}

/**
 * Retorna o número de clientes conectados
 */
export function getClientCount() {
  return clients.size;
}

/**
 * Processa mensagens recebidas de clientes (ex: extensao Firefox)
 */
function handleIncomingMessage(message, ws) {
  const { type, multiplier, betCount, totalWin, history } = message;

  // Sincronização de histórico completo
  if (type === 'bet365_history_sync' && history && history.length > 0) {
    console.log(`[Extension] Sincronizando histórico: ${history.length} multiplicadores`);

    const result = syncHistoryMultipliers(history, 'bet365');

    // Responde ao cliente com o resultado
    ws.send(JSON.stringify({
      type: 'sync_result',
      data: result,
      timestamp: new Date().toISOString()
    }));

    if (result.added > 0) {
      console.log(`[Extension] Sincronização concluída: +${result.added} rodadas`);
    }

    return;
  }

  if (type === 'bet365_round' && message.isNewRound) {
    const now = Date.now();

    // Evita duplicatas
    if (Math.abs(multiplier - lastExtensionMultiplier) < 0.01 &&
        (now - lastExtensionSaveTime) < 2000) {
      return;
    }

    const round = {
      createdAt: new Date().toISOString(),
      betCount: betCount || 0,
      totalBet: 0,
      totalWin: totalWin || 0,
      multiplier
    };

    try {
      const id = insertRound(round, 'bet365');
      round.id = id;
      round.platform = 'bet365';

      // Log colorido para crashes 1x
      if (multiplier <= 1.05) {
        console.log('');
        console.log('\x1b[41m\x1b[37m\x1b[1m  [Extension] Bet365 CRASH 1x!  \x1b[0m');
        console.log(`\x1b[33m  Rodada #${id} | ${multiplier.toFixed(2)}x\x1b[0m`);
        console.log('');
      } else {
        console.log(`[Extension] Bet365 Rodada #${id}: ${multiplier.toFixed(2)}x (${betCount || 0} jogadores)`);
      }

      lastExtensionMultiplier = multiplier;
      lastExtensionSaveTime = now;

      // Broadcast para todos os clientes
      broadcastRound(round);

      // Sequence indicator
      const state = sequenceIndicator.addCrash(multiplier);
      if (state.hasSignal) {
        broadcastSignal(state);
      }

    } catch (err) {
      console.error('[Extension] Erro ao salvar rodada:', err.message);
    }
  }
}

export default {
  initWebSocket,
  broadcast,
  broadcastRound,
  broadcastLiveBetEvent,
  broadcastBettingPhase,
  broadcastMLPrediction,
  broadcastSignal,
  getClientCount
};
