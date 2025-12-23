#!/usr/bin/env node
/**
 * WebSocket Interceptor para Crash Game
 * Usa Playwright para interceptar WebSocket diretamente do navegador
 * Compara dados do WS com dados do DOM para validação
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuração
const GAME_URL = 'https://spinbetter2z.com/br/games/crash';
const LOG_DIR = path.join(__dirname, '../../data/ws_intercept');

// Criar diretório de logs
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFile = path.join(LOG_DIR, `intercept_${Date.now()}.jsonl`);
const analysisFile = path.join(LOG_DIR, `analysis_${Date.now()}.json`);

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
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  white: '\x1b[37m',
};

function log(color, prefix, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`${colors[color]}[${timestamp}] ${prefix}${colors.reset} ${message}`);
}

function logToFile(data) {
  const entry = {
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
    ...data
  };
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

// Estatísticas
const stats = {
  wsConnections: 0,
  wsMessages: 0,
  crashMessages: [],
  multipliersSeen: [],
  gameStates: [],
  messageTypes: {},
  protocolAnalysis: {
    messageFormats: new Set(),
    fieldNames: new Set(),
    possibleMultiplierFields: [],
  }
};

// Análise de padrões
function analyzeMessage(data, source) {
  let parsed = null;
  let type = 'unknown';

  // Tentar parsear JSON
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
      type = 'json';
    } catch (e) {
      type = 'text';
    }
  } else if (typeof data === 'object') {
    parsed = data;
    type = 'json';
  }

  if (type === 'json' && parsed) {
    // Analisar estrutura
    analyzeJsonStructure(parsed, '');

    // Buscar campos interessantes
    const multiplierInfo = findMultiplierFields(parsed, '');
    const stateInfo = findStateFields(parsed, '');

    return {
      type,
      parsed,
      multiplierInfo,
      stateInfo,
      keys: Object.keys(parsed),
    };
  }

  return { type, raw: String(data).substring(0, 500) };
}

function analyzeJsonStructure(obj, path) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      analyzeJsonStructure(item, `${path}[${i}]`);
    });
    return;
  }

  for (const key of Object.keys(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    stats.protocolAnalysis.fieldNames.add(fullPath);

    if (typeof obj[key] === 'object') {
      analyzeJsonStructure(obj[key], fullPath);
    }
  }
}

function findMultiplierFields(obj, path) {
  const results = [];
  const multiplierKeywords = [
    'multiplier', 'mult', 'coef', 'coefficient', 'odds', 'odd',
    'crashPoint', 'crash_point', 'bustPoint', 'bust_point',
    'result', 'value', 'x', 'rate', 'current', 'point'
  ];

  function search(o, p) {
    if (!o || typeof o !== 'object') return;

    if (Array.isArray(o)) {
      o.forEach((item, i) => search(item, `${p}[${i}]`));
      return;
    }

    for (const key of Object.keys(o)) {
      const fullPath = p ? `${p}.${key}` : key;
      const lowerKey = key.toLowerCase();
      const value = o[key];

      // Verificar se a chave parece ser um multiplicador
      for (const kw of multiplierKeywords) {
        if (lowerKey.includes(kw.toLowerCase())) {
          if (typeof value === 'number' && value >= 1 && value < 10000) {
            results.push({ path: fullPath, value, keyword: kw });
          }
        }
      }

      // Verificar valores numéricos que parecem multiplicadores
      if (typeof value === 'number' && value >= 1.00 && value <= 1000) {
        // Pode ser um multiplicador se está em range típico
        if (value >= 1.00 && value <= 100) {
          // Provável multiplicador
          if (!results.find(r => r.path === fullPath)) {
            results.push({ path: fullPath, value, keyword: 'numeric_range' });
          }
        }
      }

      if (typeof value === 'object') {
        search(value, fullPath);
      }
    }
  }

  search(obj, path);
  return results;
}

function findStateFields(obj, path) {
  const results = [];
  const stateKeywords = ['state', 'status', 'phase', 'stage', 'type', 'action', 'event', 'mode'];

  function search(o, p) {
    if (!o || typeof o !== 'object') return;

    if (Array.isArray(o)) {
      o.forEach((item, i) => search(item, `${p}[${i}]`));
      return;
    }

    for (const key of Object.keys(o)) {
      const fullPath = p ? `${p}.${key}` : key;
      const lowerKey = key.toLowerCase();
      const value = o[key];

      for (const kw of stateKeywords) {
        if (lowerKey === kw.toLowerCase()) {
          results.push({ path: fullPath, value, keyword: kw });
        }
      }

      if (typeof value === 'object') {
        search(value, fullPath);
      }
    }
  }

  search(obj, path);
  return results;
}

async function startInterceptor() {
  console.log('\n' + '='.repeat(80));
  console.log('  🔍 CRASH GAME WEBSOCKET INTERCEPTOR');
  console.log('='.repeat(80) + '\n');

  log('cyan', '🚀', 'Iniciando browser...');

  const userDataDir = path.join(__dirname, '../../data/browser-session-intercept');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ]
  });

  const page = await context.newPage();

  // ========== INTERCEPTAR WEBSOCKETS ==========
  log('yellow', '🔌', 'Configurando interceptação de WebSocket...');

  // Usar CDP para interceptar WebSockets
  const client = await page.context().newCDPSession(page);

  // Habilitar Network domain
  await client.send('Network.enable');

  // Mapear WebSocket IDs para URLs
  const wsConnections = new Map();

  // Interceptar criação de WebSocket
  client.on('Network.webSocketCreated', (params) => {
    const { requestId, url } = params;
    wsConnections.set(requestId, { url, messages: [] });

    if (url.includes('crash') || url.includes('game')) {
      stats.wsConnections++;
      log('green', '🔌 WS CREATED', `${url.substring(0, 100)}...`);
      logToFile({ event: 'ws_created', url, requestId });
    }
  });

  // Interceptar frames recebidos
  client.on('Network.webSocketFrameReceived', (params) => {
    const { requestId, timestamp, response } = params;
    const conn = wsConnections.get(requestId);

    if (!conn) return;

    // Filtrar apenas conexões do crash game
    if (!conn.url.includes('crash') && !conn.url.includes('game')) return;

    stats.wsMessages++;
    const payloadData = response.payloadData;

    // Analisar mensagem
    const analysis = analyzeMessage(payloadData, 'received');

    // Mostrar mensagens interessantes
    if (analysis.type === 'json') {
      const { multiplierInfo, stateInfo } = analysis;

      if (multiplierInfo && multiplierInfo.length > 0) {
        const mult = multiplierInfo[0];
        log('green', '💰 MULTIPLIER', `${mult.value}x (${mult.path})`);
        stats.multipliersSeen.push({
          time: Date.now(),
          value: mult.value,
          path: mult.path,
          raw: analysis.parsed
        });
      }

      if (stateInfo && stateInfo.length > 0) {
        const state = stateInfo[0];
        const stateStr = typeof state.value === 'string' ? state.value : JSON.stringify(state.value);

        if (stateStr.toLowerCase().includes('crash') || stateStr.toLowerCase().includes('bust')) {
          log('red', '💥 CRASH', `${stateStr} (${state.path})`);
        } else if (stateStr.toLowerCase().includes('start') || stateStr.toLowerCase().includes('run')) {
          log('yellow', '🚀 START', `${stateStr} (${state.path})`);
        } else {
          log('cyan', '🎮 STATE', `${stateStr} (${state.path})`);
        }

        stats.gameStates.push({
          time: Date.now(),
          state: state.value,
          path: state.path
        });
      }

      // Mostrar preview da mensagem
      const preview = JSON.stringify(analysis.parsed).substring(0, 200);
      log('blue', `📨 #${stats.wsMessages}`, preview);
    } else {
      log('magenta', `📦 #${stats.wsMessages}`, `${analysis.type}: ${(analysis.raw || '').substring(0, 100)}`);
    }

    // Salvar no log
    logToFile({
      event: 'ws_message',
      messageNum: stats.wsMessages,
      wsUrl: conn.url,
      analysis: {
        ...analysis,
        parsed: analysis.parsed ? JSON.stringify(analysis.parsed) : undefined
      }
    });
  });

  // Interceptar frames enviados
  client.on('Network.webSocketFrameSent', (params) => {
    const { requestId, response } = params;
    const conn = wsConnections.get(requestId);

    if (!conn || (!conn.url.includes('crash') && !conn.url.includes('game'))) return;

    log('yellow', '📤 SENT', response.payloadData.substring(0, 100));
    logToFile({
      event: 'ws_sent',
      wsUrl: conn.url,
      data: response.payloadData
    });
  });

  // WebSocket fechado
  client.on('Network.webSocketClosed', (params) => {
    const { requestId } = params;
    const conn = wsConnections.get(requestId);

    if (conn && (conn.url.includes('crash') || conn.url.includes('game'))) {
      log('red', '🔌 WS CLOSED', conn.url.substring(0, 80));
      logToFile({ event: 'ws_closed', url: conn.url });
    }
  });

  // ========== NAVEGAR PARA O JOGO ==========
  log('cyan', '🌐', `Navegando para: ${GAME_URL}`);

  try {
    await page.goto(GAME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  } catch (err) {
    log('yellow', '⚠️', 'Timeout no carregamento, continuando...');
  }

  log('green', '✅', 'Página carregada. Observando WebSockets...');
  log('blue', '📁', `Logs salvos em: ${logFile}`);

  console.log('\n' + '='.repeat(80));
  console.log('  MONITORANDO WEBSOCKETS - Pressione Ctrl+C para parar');
  console.log('  Se precisar fazer login, faça agora no navegador');
  console.log('='.repeat(80) + '\n');

  // Status periódico
  const statusInterval = setInterval(() => {
    log('cyan', '📊 STATUS', `Conexões WS: ${stats.wsConnections} | Mensagens: ${stats.wsMessages} | Multiplicadores: ${stats.multipliersSeen.length}`);
  }, 30000);

  // Cleanup
  process.on('SIGINT', async () => {
    console.log('\n');
    log('yellow', '⏹️', 'Encerrando...');

    clearInterval(statusInterval);

    // Salvar análise final
    const finalAnalysis = {
      duration: Date.now() - stats.startTime,
      wsConnections: stats.wsConnections,
      totalMessages: stats.wsMessages,
      multipliersSeen: stats.multipliersSeen,
      gameStates: stats.gameStates,
      fieldNames: [...stats.protocolAnalysis.fieldNames],
      possibleMultiplierFields: stats.protocolAnalysis.possibleMultiplierFields,
    };

    fs.writeFileSync(analysisFile, JSON.stringify(finalAnalysis, null, 2));

    printFinalStats();

    await context.close();
    process.exit(0);
  });

  stats.startTime = Date.now();
}

function printFinalStats() {
  console.log('\n' + '='.repeat(80));
  console.log('  ANÁLISE FINAL');
  console.log('='.repeat(80));

  const duration = Math.floor((Date.now() - stats.startTime) / 1000);
  console.log(`\n📊 Resumo:`);
  console.log(`   - Duração: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`   - Conexões WebSocket: ${stats.wsConnections}`);
  console.log(`   - Mensagens capturadas: ${stats.wsMessages}`);
  console.log(`   - Multiplicadores encontrados: ${stats.multipliersSeen.length}`);
  console.log(`   - Estados de jogo: ${stats.gameStates.length}`);

  if (stats.multipliersSeen.length > 0) {
    console.log(`\n💰 Multiplicadores capturados:`);
    stats.multipliersSeen.slice(-10).forEach(m => {
      console.log(`   - ${m.value}x via ${m.path}`);
    });
  }

  if (stats.gameStates.length > 0) {
    console.log(`\n🎮 Estados únicos encontrados:`);
    const uniqueStates = [...new Set(stats.gameStates.map(s =>
      typeof s.state === 'string' ? s.state : JSON.stringify(s.state)
    ))];
    uniqueStates.slice(0, 10).forEach(s => {
      console.log(`   - ${s}`);
    });
  }

  console.log(`\n📁 Arquivos de log:`);
  console.log(`   - Mensagens: ${logFile}`);
  console.log(`   - Análise: ${analysisFile}`);

  // Campos encontrados
  if (stats.protocolAnalysis.fieldNames.size > 0) {
    console.log(`\n🔑 Campos encontrados no protocolo:`);
    const fields = [...stats.protocolAnalysis.fieldNames].slice(0, 30);
    console.log(`   ${fields.join(', ')}`);
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

// Iniciar
startInterceptor().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
