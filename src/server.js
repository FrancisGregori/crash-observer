import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLastRounds, getStats, getAllRounds, getLastRound, getHourlyAnalysis, getHouseProfitByPeriod, getAdvancedStats } from './database.js';
import * as liveBetting from './liveBetting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

// Clientes SSE conectados
const sseClients = new Set();

// Log de eventos de live betting para SSE
const liveBettingLogs = [];

// Middleware para JSON
app.use(express.json());

// Servir arquivos estáticos do dashboard
app.use(express.static(path.join(__dirname, 'public')));

// ========== API REST ==========

/**
 * GET /api/rounds
 * Retorna as últimas rodadas
 * Query params: limit (default: 100)
 */
app.get('/api/rounds', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const rounds = getLastRounds(limit);
    res.json(rounds);
  } catch (err) {
    console.error('[API] Erro ao buscar rodadas:', err);
    res.status(500).json({ error: 'Erro ao buscar rodadas' });
  }
});

/**
 * GET /api/rounds/all
 * Retorna todas as rodadas
 */
app.get('/api/rounds/all', (req, res) => {
  try {
    const rounds = getAllRounds();
    res.json(rounds);
  } catch (err) {
    console.error('[API] Erro ao buscar todas rodadas:', err);
    res.status(500).json({ error: 'Erro ao buscar rodadas' });
  }
});

/**
 * GET /api/stats
 * Retorna estatísticas gerais
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (err) {
    console.error('[API] Erro ao buscar estatísticas:', err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

/**
 * GET /api/last
 * Retorna a última rodada
 */
app.get('/api/last', (req, res) => {
  try {
    const round = getLastRound();
    res.json(round || null);
  } catch (err) {
    console.error('[API] Erro ao buscar última rodada:', err);
    res.status(500).json({ error: 'Erro ao buscar última rodada' });
  }
});

/**
 * GET /api/hourly
 * Retorna análise de horários mais lucrativos
 */
app.get('/api/hourly', (req, res) => {
  try {
    const analysis = getHourlyAnalysis();
    res.json(analysis);
  } catch (err) {
    console.error('[API] Erro ao buscar análise de horários:', err);
    res.status(500).json({ error: 'Erro ao buscar análise de horários' });
  }
});

/**
 * GET /api/house-profit
 * Retorna ganho da casa por período
 */
app.get('/api/house-profit', (req, res) => {
  try {
    const profit = getHouseProfitByPeriod();
    res.json(profit);
  } catch (err) {
    console.error('[API] Erro ao buscar ganho da casa:', err);
    res.status(500).json({ error: 'Erro ao buscar ganho da casa' });
  }
});

/**
 * GET /api/advanced
 * Retorna análise estatística avançada
 */
app.get('/api/advanced', (req, res) => {
  try {
    const advanced = getAdvancedStats();
    res.json(advanced);
  } catch (err) {
    console.error('[API] Erro ao buscar análise avançada:', err);
    res.status(500).json({ error: 'Erro ao buscar análise avançada' });
  }
});

// ========== Live Betting API ==========

/**
 * POST /api/live-betting/enable
 * Ativa ou desativa apostas reais
 */
app.post('/api/live-betting/enable', (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Parâmetro "enabled" deve ser boolean' });
    }

    liveBetting.setEnabled(enabled);

    // Configura callbacks para logging
    if (enabled) {
      liveBetting.setCallbacks({
        onPlaced: (data) => {
          broadcastLiveBetEvent('bet_placed', data);
        },
        onCashoutDone: (data) => {
          broadcastLiveBetEvent('cashout', data);
        },
        onEnd: (data) => {
          broadcastLiveBetEvent('round_end', data);
        },
        onErr: (data) => {
          broadcastLiveBetEvent('error', data);
        },
        onLogMsg: (data) => {
          liveBettingLogs.push(data);
          if (liveBettingLogs.length > 100) liveBettingLogs.shift();
        }
      });
    }

    res.json({
      success: true,
      enabled: liveBetting.isLiveBettingEnabled(),
      message: enabled ? 'Apostas reais ATIVADAS' : 'Apostas reais DESATIVADAS'
    });
  } catch (err) {
    console.error('[API] Erro ao configurar live betting:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/live-betting/status
 * Retorna status atual do live betting
 */
app.get('/api/live-betting/status', async (req, res) => {
  try {
    const debugInfo = await liveBetting.getDebugInfo();
    const activeBets = liveBetting.getActiveBets();
    const isBetting = await liveBetting.isBettingPhase();

    res.json({
      enabled: liveBetting.isLiveBettingEnabled(),
      isBettingPhase: isBetting,
      activeBets,
      debug: debugInfo,
      recentLogs: liveBettingLogs.slice(-20)
    });
  } catch (err) {
    console.error('[API] Erro ao buscar status:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/live-betting/bet
 * Coloca uma aposta dupla
 */
app.post('/api/live-betting/bet', async (req, res) => {
  try {
    const { amount1, cashout1, amount2, cashout2 } = req.body;

    // Validação
    if (!amount1 || !cashout1 || !amount2 || !cashout2) {
      return res.status(400).json({
        error: 'Parâmetros obrigatórios: amount1, cashout1, amount2, cashout2'
      });
    }

    if (amount1 <= 0 || amount2 <= 0) {
      return res.status(400).json({ error: 'Valores de aposta devem ser positivos' });
    }

    if (cashout1 < 1.01 || cashout2 < 1.01) {
      return res.status(400).json({ error: 'Cashout mínimo é 1.01x' });
    }

    const result = await liveBetting.placeDoubleBet(
      parseFloat(amount1),
      parseFloat(cashout1),
      parseFloat(amount2),
      parseFloat(cashout2)
    );

    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao colocar aposta:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/live-betting/cancel
 * Cancela apostas pendentes
 */
app.post('/api/live-betting/cancel', async (req, res) => {
  try {
    await liveBetting.cancelPendingBets();
    res.json({ success: true, message: 'Apostas canceladas' });
  } catch (err) {
    console.error('[API] Erro ao cancelar apostas:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/live-betting/history
 * Lê o histórico de apostas da tabela da plataforma
 */
app.get('/api/live-betting/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const result = await liveBetting.getBettingHistory(limit);
    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao ler histórico:', err);
    res.status(500).json({ success: false, error: err.message, history: [] });
  }
});

/**
 * GET /api/live-betting/summary
 * Retorna resumo das apostas agrupadas por rodada
 */
app.get('/api/live-betting/summary', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const result = await liveBetting.getBettingSummary(limit);
    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao gerar resumo:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/live-betting/balance
 * Retorna o saldo atual da plataforma
 */
app.get('/api/live-betting/balance', async (req, res) => {
  try {
    const result = await liveBetting.getPlatformBalance();
    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao ler saldo:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Broadcast evento de live betting para clientes SSE
 */
function broadcastLiveBetEvent(eventType, data) {
  const event = { type: eventType, data, timestamp: new Date().toISOString() };
  sseClients.forEach(client => {
    client.write(`event: liveBet\ndata: ${JSON.stringify(event)}\n\n`);
  });
}

// ========== Server-Sent Events (SSE) ==========

/**
 * GET /api/events
 * Endpoint SSE para atualizações em tempo real
 */
app.get('/api/events', (req, res) => {
  // Configura headers para SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Envia evento inicial de conexão
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Conectado ao stream de eventos' })}\n\n`);

  // Adiciona cliente à lista
  sseClients.add(res);
  console.log(`[SSE] Cliente conectado. Total: ${sseClients.size}`);

  // Remove cliente quando desconectar
  req.on('close', () => {
    sseClients.delete(res);
    console.log(`[SSE] Cliente desconectado. Total: ${sseClients.size}`);
  });
});

/**
 * Envia nova rodada para todos os clientes SSE
 */
export function broadcastRound(round) {
  const data = JSON.stringify(round);
  sseClients.forEach(client => {
    client.write(`event: round\ndata: ${data}\n\n`);
  });
  console.log(`[SSE] Rodada enviada para ${sseClients.size} clientes`);
}

/**
 * Inicia o servidor Express
 */
export function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`[Server] Dashboard disponível em: http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

export default {
  startServer,
  broadcastRound
};
