import express from 'express';
import cors from 'cors';
import { getLastRounds, getStats, getAllRounds, getLastRound, getHourlyAnalysis, getHouseProfitByPeriod, getAdvancedStats, archiveDatabase, listArchives, restoreArchive, resetDatabase, deleteArchive, mergeArchive } from '../database.js';
import * as liveBetting from '../liveBetting.js';
import { broadcastLiveBetEvent } from './websocket.js';

const app = express();

// Log de eventos de live betting
const liveBettingLogs = [];

// Middleware
app.use(cors());
app.use(express.json());

// ========== API REST ==========

/**
 * GET /api/rounds
 * Retorna as últimas rodadas
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

// ========== Database Management API ==========

/**
 * POST /api/database/archive
 * Arquiva o banco de dados atual
 */
app.post('/api/database/archive', (req, res) => {
  try {
    const { name } = req.body;
    const result = archiveDatabase(name || null);
    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao arquivar banco:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/database/archives
 * Lista todos os arquivos disponíveis
 */
app.get('/api/database/archives', (req, res) => {
  try {
    const archives = listArchives();
    res.json({ success: true, archives });
  } catch (err) {
    console.error('[API] Erro ao listar arquivos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/database/restore
 * Restaura um arquivo
 */
app.post('/api/database/restore', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nome do arquivo é obrigatório' });
    }
    const result = restoreArchive(name);
    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao restaurar arquivo:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/database/reset
 * Reseta o banco de dados (opcionalmente arquiva antes)
 */
app.post('/api/database/reset', (req, res) => {
  try {
    const { archive = true } = req.body;
    const result = resetDatabase(archive);
    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao resetar banco:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/database/archives/:name
 * Deleta um arquivo
 */
app.delete('/api/database/archives/:name', (req, res) => {
  try {
    const { name } = req.params;
    const result = deleteArchive(name);
    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao deletar arquivo:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/database/merge
 * Mescla dados de um arquivo com o banco atual (sem duplicar)
 */
app.post('/api/database/merge', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nome do arquivo é obrigatório' });
    }
    const result = mergeArchive(name);
    res.json(result);
  } catch (err) {
    console.error('[API] Erro ao mesclar arquivo:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Inicia o servidor da API
 */
export function startApiServer(port) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`[API] Servidor REST iniciado na porta ${port}`);
      resolve(server);
    });
  });
}

export default {
  startApiServer,
  app
};
