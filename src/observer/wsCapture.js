/**
 * WebSocket Capture Module
 * Captura dados do WebSocket do crash game para análise de padrões
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Diretório para salvar dados
const DATA_DIR = path.join(__dirname, '../../data/ws_data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Arquivo de dados (append mode)
const dataFile = path.join(DATA_DIR, 'crash_ws_data.jsonl');

// Estado atual da rodada
let currentRound = null;
let wsStats = {
  connected: false,
  messagesReceived: 0,
  roundsCapturados: 0,
  lastMessage: null,
};

// Callbacks para eventos
let onCrashCallback = null;
let onRoundDataCallback = null;

/**
 * Parseia mensagem do WebSocket (formato SignalR)
 */
function parseMessage(raw) {
  try {
    const cleaned = typeof raw === 'string' ? raw.replace(/\x1e$/, '') : raw;
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Salva dados de uma rodada completa
 */
function saveRoundData(roundData) {
  const entry = {
    timestamp: Date.now(),
    ...roundData
  };

  fs.appendFileSync(dataFile, JSON.stringify(entry) + '\n');
  wsStats.roundsCapturados++;

  // Callback se configurado
  if (onRoundDataCallback) {
    onRoundDataCallback(roundData);
  }
}

/**
 * Processa mensagem recebida do WebSocket
 */
function processMessage(msg, recvTimestamp) {
  if (!msg || msg.type !== 1) return;

  const target = msg.target;
  const args = msg.arguments?.[0] || {};

  wsStats.messagesReceived++;
  wsStats.lastMessage = Date.now();

  switch (target) {
    case 'OnStage':
      // Nova rodada começando
      if (currentRound && currentRound.crashMult) {
        // Salvar rodada anterior se completa
        saveRoundData(currentRound);
      }

      currentRound = {
        roundId: args.l,
        nextRoundId: args.ln,
        stageTs: args.ts,
        stageRecv: recvTimestamp,
        bettingTs: null,
        startTs: null,
        startRecv: null,
        crashTs: null,
        crashRecv: null,
        crashMult: null,
        totalBets: 0,
        totalBid: 0,
        cashoutSnapshots: [],
        profitSnapshots: [],
      };
      break;

    case 'OnBetting':
      if (currentRound && args.l === currentRound.roundId) {
        currentRound.bettingTs = args.ts;
        currentRound.bettingDuration = args.a; // Tempo de apostas em ms
      }
      break;

    case 'OnBets':
      if (currentRound && args.l === currentRound.roundId) {
        currentRound.totalBets = args.n || 0;
        currentRound.totalBid = args.bid || 0;
      }
      break;

    case 'OnStart':
      if (currentRound && args.l === currentRound.roundId) {
        currentRound.startTs = args.ts;
        currentRound.startRecv = recvTimestamp;
      }
      break;

    case 'OnCashouts':
      if (currentRound && args.l === currentRound.roundId) {
        // Snapshot de cashouts
        const snapshot = {
          recvTs: recvTimestamp,
          elapsedMs: currentRound.startRecv ? recvTimestamp - currentRound.startRecv : 0,
          remaining: args.d,      // Apostas restantes
          totalBets: args.n,      // Total de apostas
          totalWon: args.won,     // Total ganho
          cashouts: (args.q || []).map(c => ({
            id: c.id,
            win: c.win,
            mult: c.k  // Multiplicador do cashout
          }))
        };

        currentRound.cashoutSnapshots.push(snapshot);

        // Calcular % restante
        if (args.n > 0) {
          snapshot.pctRemaining = (args.d / args.n) * 100;
        }
      }
      break;

    case 'OnProfits':
      if (currentRound && args.l === currentRound.roundId) {
        const profits = (args.q || []).map(p => ({
          oddsDigits: p.u,  // Últimos dígitos do usuário
          value: p.v
        }));

        currentRound.profitSnapshots.push({
          recvTs: recvTimestamp,
          elapsedMs: currentRound.startRecv ? recvTimestamp - currentRound.startRecv : 0,
          profits
        });
      }
      break;

    case 'OnCrash':
      if (currentRound && args.l === currentRound.roundId) {
        currentRound.crashTs = args.ts;
        currentRound.crashRecv = recvTimestamp;
        currentRound.crashMult = args.f;

        // Calcular métricas finais
        if (currentRound.startTs) {
          currentRound.duration = currentRound.crashTs - currentRound.startTs;
        }

        // Latência
        currentRound.latency = recvTimestamp - args.ts;

        // Última snapshot de cashout
        const lastCashout = currentRound.cashoutSnapshots[currentRound.cashoutSnapshots.length - 1];
        if (lastCashout) {
          currentRound.finalRemaining = lastCashout.remaining;
          currentRound.finalPctRemaining = lastCashout.pctRemaining;
        }

        // Log
        const pctStr = currentRound.finalPctRemaining?.toFixed(1) || '?';
        console.log(`[WS] 💥 Crash ${currentRound.crashMult}x | Duração: ${currentRound.duration}ms | ${pctStr}% restantes | Latência: ${currentRound.latency}ms`);

        // Callback
        if (onCrashCallback) {
          onCrashCallback(currentRound);
        }

        // Salvar imediatamente
        saveRoundData(currentRound);
        currentRound = null;
      }
      break;

    case 'OnRegistration':
      // Dados iniciais - contém histórico
      if (args.fs) {
        console.log(`[WS] 📊 Histórico recebido: ${args.fs.length} rodadas anteriores`);
        // args.fs contém [{l: roundId, f: crashMult}, ...]
      }
      break;
  }
}

/**
 * Configura interceptação de WebSocket via CDP
 */
export async function setupWSCapture(page) {
  console.log('[WS] 🔌 Configurando captura de WebSocket...');

  try {
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');

    const wsConnections = new Map();

    // WebSocket criado
    client.on('Network.webSocketCreated', ({ requestId, url }) => {
      if (url.includes('crash') || url.includes('game')) {
        wsConnections.set(requestId, { url, connected: true });
        wsStats.connected = true;
        console.log(`[WS] ✅ Conectado: ${url.substring(0, 80)}...`);
      }
    });

    // Mensagem recebida
    client.on('Network.webSocketFrameReceived', ({ requestId, response }) => {
      const conn = wsConnections.get(requestId);
      if (!conn || !conn.url.includes('crash')) return;

      const msg = parseMessage(response.payloadData);
      if (msg) {
        processMessage(msg, Date.now());
      }
    });

    // WebSocket fechado
    client.on('Network.webSocketClosed', ({ requestId }) => {
      const conn = wsConnections.get(requestId);
      if (conn && conn.url.includes('crash')) {
        wsStats.connected = false;
        console.log('[WS] ❌ Desconectado');
      }
    });

    console.log('[WS] ✅ Captura de WebSocket configurada');
    return true;

  } catch (err) {
    console.error('[WS] ❌ Erro ao configurar captura:', err.message);
    return false;
  }
}

/**
 * Retorna estatísticas atuais
 */
export function getWSStats() {
  return { ...wsStats };
}

/**
 * Configura callback para quando crash acontece
 */
export function onCrash(callback) {
  onCrashCallback = callback;
}

/**
 * Configura callback para quando rodada é salva
 */
export function onRoundData(callback) {
  onRoundDataCallback = callback;
}

/**
 * Retorna caminho do arquivo de dados
 */
export function getDataFilePath() {
  return dataFile;
}

/**
 * Carrega dados salvos
 */
export function loadSavedData() {
  if (!fs.existsSync(dataFile)) {
    return [];
  }

  const lines = fs.readFileSync(dataFile, 'utf8').split('\n').filter(l => l.trim());
  const data = [];

  for (const line of lines) {
    try {
      data.push(JSON.parse(line));
    } catch {
      // Ignorar linhas inválidas
    }
  }

  return data;
}

/**
 * Análise rápida dos dados
 */
export function analyzeData() {
  const data = loadSavedData();

  if (data.length === 0) {
    return { message: 'Sem dados ainda' };
  }

  const mults = data.filter(d => d.crashMult).map(d => d.crashMult);
  const durations = data.filter(d => d.duration).map(d => d.duration);
  const pctRemaining = data.filter(d => d.finalPctRemaining).map(d => d.finalPctRemaining);

  return {
    totalRounds: data.length,
    avgMultiplier: mults.reduce((a, b) => a + b, 0) / mults.length,
    avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    avgPctRemaining: pctRemaining.reduce((a, b) => a + b, 0) / pctRemaining.length,
    highCrashes: mults.filter(m => m >= 10).length,
    lowCrashes: mults.filter(m => m < 2).length,
  };
}

export default {
  setupWSCapture,
  getWSStats,
  onCrash,
  onRoundData,
  getDataFilePath,
  loadSavedData,
  analyzeData,
};
