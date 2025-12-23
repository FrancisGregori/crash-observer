#!/usr/bin/env node
/**
 * WebSocket Observer para Crash Game
 * Captura e analisa mensagens do WebSocket para entender o protocolo
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração
const WS_URL = process.env.WS_URL || process.argv[2];

if (!WS_URL) {
  console.error('❌ Uso: node wsObserver.js <websocket_url>');
  console.error('   ou defina WS_URL no ambiente');
  process.exit(1);
}

// Log file
const logDir = path.join(__dirname, '../../data/ws_logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, `ws_${Date.now()}.jsonl`);

// Estatísticas
const stats = {
  connected: false,
  messagesReceived: 0,
  messageTypes: {},
  startTime: null,
  lastMessage: null,
  multipliers: [],
  gameStates: [],
  rawMessages: [],
};

// Cores para terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(color, prefix, message) {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${prefix}${colors.reset} ${message}`);
}

function logToFile(data) {
  const entry = {
    timestamp: new Date().toISOString(),
    ...data
  };
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

function analyzeMessage(data) {
  // Tentar parsear como JSON
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return { type: 'json', data: parsed };
  } catch (e) {
    // Não é JSON, verificar outros formatos
  }

  // Verificar se é binário
  if (Buffer.isBuffer(data)) {
    // Tentar decodificar como texto
    const text = data.toString('utf8');

    // Verificar se parece ser texto válido
    if (/^[\x20-\x7E\s]+$/.test(text)) {
      try {
        const parsed = JSON.parse(text);
        return { type: 'json', data: parsed };
      } catch (e) {
        return { type: 'text', data: text };
      }
    }

    return {
      type: 'binary',
      hex: data.toString('hex').substring(0, 200),
      length: data.length,
      raw: data
    };
  }

  // Verificar se é MessagePack ou outro formato
  if (typeof data === 'string') {
    return { type: 'text', data: data.substring(0, 500) };
  }

  return { type: 'unknown', data: String(data).substring(0, 500) };
}

function extractMultiplier(parsed) {
  // Buscar campos comuns que podem conter multiplicador
  const multiplierFields = [
    'multiplier', 'mult', 'crashPoint', 'crash_point', 'bustPoint',
    'bust_point', 'result', 'outcome', 'value', 'coefficient',
    'odd', 'odds', 'x', 'point', 'rate', 'current', 'coef'
  ];

  function searchObject(obj, depth = 0, path = '') {
    if (depth > 10 || !obj || typeof obj !== 'object') return null;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const found = searchObject(obj[i], depth + 1, `${path}[${i}]`);
        if (found) return found;
      }
      return null;
    }

    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      const currentPath = path ? `${path}.${key}` : key;

      // Verificar se a chave parece ser um multiplicador
      for (const field of multiplierFields) {
        if (lowerKey.includes(field)) {
          const value = obj[key];
          if (typeof value === 'number' && value >= 1 && value < 10000) {
            return { field: currentPath, value };
          }
        }
      }

      // Buscar recursivamente
      if (typeof obj[key] === 'object') {
        const found = searchObject(obj[key], depth + 1, currentPath);
        if (found) return found;
      }
    }
    return null;
  }

  return searchObject(parsed);
}

function extractGameState(parsed) {
  // Buscar estados do jogo
  const stateFields = ['state', 'status', 'phase', 'stage', 'gameState', 'game_state', 'type', 'action', 'event'];

  function searchObject(obj, depth = 0, path = '') {
    if (depth > 10 || !obj || typeof obj !== 'object') return null;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const found = searchObject(obj[i], depth + 1, `${path}[${i}]`);
        if (found) return found;
      }
      return null;
    }

    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      const currentPath = path ? `${path}.${key}` : key;

      for (const field of stateFields) {
        if (lowerKey === field.toLowerCase()) {
          return { field: currentPath, value: obj[key] };
        }
      }

      if (typeof obj[key] === 'object') {
        const found = searchObject(obj[key], depth + 1, currentPath);
        if (found) return found;
      }
    }
    return null;
  }

  return searchObject(parsed);
}

function connect() {
  log('cyan', '🔌', `Conectando a: ${WS_URL.substring(0, 80)}...`);

  // Extrair host da URL
  const urlObj = new URL(WS_URL);
  const host = urlObj.host;
  const origin = `https://${host}`;

  const ws = new WebSocket(WS_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': origin,
      'Host': host,
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
    perMessageDeflate: false,
  });

  ws.on('open', () => {
    stats.connected = true;
    stats.startTime = Date.now();
    log('green', '✅', 'Conectado ao WebSocket!');
    log('blue', '📁', `Salvando logs em: ${logFile}`);
    console.log('\n' + '='.repeat(80));
    console.log('  OBSERVANDO MENSAGENS - Pressione Ctrl+C para parar');
    console.log('='.repeat(80) + '\n');
  });

  ws.on('message', (data, isBinary) => {
    stats.messagesReceived++;
    stats.lastMessage = Date.now();

    const analysis = analyzeMessage(data);

    // Contar tipos de mensagem
    stats.messageTypes[analysis.type] = (stats.messageTypes[analysis.type] || 0) + 1;

    // Guardar mensagem raw
    stats.rawMessages.push({
      num: stats.messagesReceived,
      time: Date.now(),
      analysis
    });

    // Manter apenas últimas 100
    if (stats.rawMessages.length > 100) {
      stats.rawMessages.shift();
    }

    // Log básico
    const msgNum = stats.messagesReceived.toString().padStart(5, '0');

    if (analysis.type === 'json') {
      const parsed = analysis.data;

      // Extrair informações importantes
      const multiplier = extractMultiplier(parsed);
      const gameState = extractGameState(parsed);

      // Determinar cor baseado no conteúdo
      let color = 'blue';
      let prefix = '📨';
      let summary = '';

      if (multiplier) {
        color = 'green';
        prefix = '💰';
        summary = `MULTIPLIER: ${multiplier.value}x (${multiplier.field})`;
        stats.multipliers.push({
          time: Date.now(),
          value: multiplier.value,
          field: multiplier.field,
          raw: parsed
        });
      }

      if (gameState) {
        const stateStr = typeof gameState.value === 'string'
          ? gameState.value
          : JSON.stringify(gameState.value);

        if (stateStr.toLowerCase().includes('crash') ||
            stateStr.toLowerCase().includes('bust') ||
            stateStr.toLowerCase().includes('end')) {
          color = 'red';
          prefix = '💥';
        } else if (stateStr.toLowerCase().includes('start') ||
                   stateStr.toLowerCase().includes('running') ||
                   stateStr.toLowerCase().includes('fly')) {
          color = 'yellow';
          prefix = '🚀';
        } else {
          color = 'cyan';
          prefix = '🎮';
        }

        summary = `STATE: ${stateStr} (${gameState.field})`;
        stats.gameStates.push({
          time: Date.now(),
          state: gameState.value,
          field: gameState.field
        });
      }

      // Mostrar resumo ou estrutura da mensagem
      if (summary) {
        log(color, `${prefix} #${msgNum}`, summary);
        console.log(`    ${colors.cyan}${JSON.stringify(parsed, null, 2).substring(0, 500)}${colors.reset}\n`);
      } else {
        // Mostrar chaves principais do objeto
        const keys = Object.keys(parsed);
        const preview = JSON.stringify(parsed).substring(0, 150);
        log(color, `${prefix} #${msgNum}`, `${preview}...`);
      }
    } else if (analysis.type === 'binary') {
      log('magenta', `📦 #${msgNum}`, `Binary (${analysis.length} bytes): ${analysis.hex.substring(0, 60)}...`);

      // Tentar interpretar binário de diferentes formas
      console.log(`    Tentando decodificar...`);

      // Verificar se pode ser msgpack ou protobuf
      const firstByte = analysis.raw[0];
      if (firstByte >= 0x80 && firstByte <= 0x8f) {
        console.log(`    Possível MessagePack fixmap`);
      } else if (firstByte >= 0x90 && firstByte <= 0x9f) {
        console.log(`    Possível MessagePack fixarray`);
      }
    } else {
      log('yellow', `📝 #${msgNum}`, `${analysis.type}: ${analysis.data.substring(0, 150)}`);
    }

    // Salvar no arquivo de log
    logToFile({
      messageNum: stats.messagesReceived,
      isBinary,
      analysis: {
        ...analysis,
        raw: undefined // Não salvar raw binary no JSON
      }
    });
  });

  ws.on('error', (error) => {
    log('red', '❌', `Erro: ${error.message}`);
    logToFile({ error: error.message });
  });

  ws.on('close', (code, reason) => {
    stats.connected = false;
    log('red', '🔌', `Desconectado (código: ${code}, razão: ${reason?.toString() || 'N/A'})`);

    // Mostrar estatísticas
    printStats();

    // Não reconectar automaticamente por enquanto
    process.exit(0);
  });

  // Ping periódico para manter conexão
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  return ws;
}

function printStats() {
  console.log('\n' + '='.repeat(80));
  console.log('  ESTATÍSTICAS DA SESSÃO');
  console.log('='.repeat(80));

  const duration = stats.startTime ? Math.floor((Date.now() - stats.startTime) / 1000) : 0;

  console.log(`\n📊 Resumo:`);
  console.log(`   - Duração: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`   - Mensagens recebidas: ${stats.messagesReceived}`);
  console.log(`   - Tipos de mensagem: ${JSON.stringify(stats.messageTypes)}`);
  console.log(`   - Multiplicadores encontrados: ${stats.multipliers.length}`);

  if (stats.multipliers.length > 0) {
    console.log(`\n💰 Multiplicadores encontrados:`);
    stats.multipliers.slice(-10).forEach(m => {
      console.log(`   - ${m.value}x (${m.field})`);
    });
  }

  if (stats.gameStates.length > 0) {
    console.log(`\n🎮 Estados encontrados:`);
    const uniqueStates = [...new Set(stats.gameStates.map(s => JSON.stringify(s.state)))];
    uniqueStates.forEach(s => {
      console.log(`   - ${s}`);
    });
  }

  console.log(`\n📁 Log completo salvo em: ${logFile}`);
  console.log('='.repeat(80) + '\n');
}

// Tratamento de encerramento
process.on('SIGINT', () => {
  console.log('\n');
  log('yellow', '⏹️', 'Encerrando observer...');
  printStats();
  process.exit(0);
});

// Auto-terminar após 60 segundos
setTimeout(() => {
  log('yellow', '⏰', 'Tempo limite atingido (60s)');
  printStats();
  process.exit(0);
}, 60000);

// Iniciar
console.log('\n' + '='.repeat(80));
console.log('  🎰 CRASH GAME WEBSOCKET OBSERVER');
console.log('='.repeat(80) + '\n');

connect();
