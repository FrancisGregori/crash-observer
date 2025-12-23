#!/usr/bin/env node
/**
 * Crash Game Protocol Analyzer
 * Analisa o protocolo para entender timing e possíveis brechas
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GAME_URL = 'https://spinbetter2z.com/br/games/crash';
const LOG_DIR = path.join(__dirname, '../../data/crash_analysis');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const colors = {
  reset: '\x1b[0m',
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
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`${colors[color]}[${ts}] ${prefix}${colors.reset} ${message}`);
}

// Estatísticas de análise
const analysis = {
  rounds: [],
  latencies: [],
  crashAfterCashout: 0,
  cashoutAfterCrash: 0,
  commands: {
    bet: [],
    cashout: [],
  }
};

let currentRound = null;

function parseMessage(raw) {
  try {
    // Remove SignalR terminator
    const cleaned = raw.replace(/\x1e$/, '');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function startAnalyzer() {
  console.log('\n' + '='.repeat(80));
  console.log('  🔬 CRASH GAME PROTOCOL ANALYZER');
  console.log('  Analisando timing e protocolo para encontrar brechas');
  console.log('='.repeat(80) + '\n');

  const userDataDir = path.join(__dirname, '../../data/browser-session');

  log('cyan', '🚀', 'Iniciando browser...');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await context.newPage();
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');

  const wsConnections = new Map();

  // Interceptar WebSocket
  client.on('Network.webSocketCreated', ({ requestId, url }) => {
    if (url.includes('crash')) {
      wsConnections.set(requestId, { url });
      log('green', '🔌', 'WebSocket conectado');
    }
  });

  client.on('Network.webSocketFrameReceived', ({ requestId, response }) => {
    const conn = wsConnections.get(requestId);
    if (!conn || !conn.url.includes('crash')) return;

    const msg = parseMessage(response.payloadData);
    if (!msg || msg.type !== 1) return;

    const target = msg.target;
    const args = msg.arguments?.[0] || {};
    const now = Date.now();

    switch (target) {
      case 'OnStage':
        // Nova rodada
        if (currentRound) {
          analysis.rounds.push(currentRound);
        }
        currentRound = {
          id: args.l,
          nextId: args.ln,
          stageTs: args.ts,
          stageRecv: now,
          bettingTs: null,
          startTs: null,
          crashTs: null,
          crashRecv: null,
          crashMult: null,
          lastCashoutTs: null,
          cashoutAfterCrash: false,
        };
        log('cyan', '📍', `Nova rodada: ${args.l}`);
        break;

      case 'OnBetting':
        if (currentRound) {
          currentRound.bettingTs = args.ts;
          log('yellow', '💰', `Apostas abertas (${args.a}ms)`);
        }
        break;

      case 'OnStart':
        if (currentRound) {
          currentRound.startTs = args.ts;
          currentRound.startRecv = now;
          log('green', '🚀', 'Jogo iniciado!');
        }
        break;

      case 'OnCrash':
        if (currentRound) {
          currentRound.crashTs = args.ts;
          currentRound.crashRecv = now;
          currentRound.crashMult = args.f;

          const latency = now - args.ts;
          analysis.latencies.push(latency);

          // Verificar se já houve cashout após o crash
          if (currentRound.lastCashoutTs && currentRound.lastCashoutTs > now) {
            analysis.cashoutAfterCrash++;
            currentRound.cashoutAfterCrash = true;
          }

          const avgLatency = analysis.latencies.reduce((a, b) => a + b, 0) / analysis.latencies.length;

          log('red', '💥', `CRASH ${args.f}x | Latência: ${latency}ms | Média: ${avgLatency.toFixed(0)}ms`);

          // Análise da janela
          if (currentRound.lastCashoutRecv) {
            const cashoutToCrash = now - currentRound.lastCashoutRecv;
            log('magenta', '⏱️', `Último cashout → Crash: ${cashoutToCrash}ms`);
          }
        }
        break;

      case 'OnCashouts':
        if (currentRound) {
          currentRound.lastCashoutTs = args.ts || now;
          currentRound.lastCashoutRecv = now;

          // Se crash já aconteceu e ainda chegam cashouts
          if (currentRound.crashRecv && now > currentRound.crashRecv) {
            const afterCrash = now - currentRound.crashRecv;
            log('yellow', '⚠️', `Cashout +${afterCrash}ms APÓS crash! (${args.d} restantes)`);
          }
        }
        break;
    }
  });

  // Capturar comandos enviados (bet, cashout)
  client.on('Network.webSocketFrameSent', ({ requestId, response }) => {
    const conn = wsConnections.get(requestId);
    if (!conn || !conn.url.includes('crash')) return;

    const msg = parseMessage(response.payloadData);
    if (!msg) return;

    // Ignorar pings
    if (msg.type === 6) return;

    const target = msg.target;
    const args = msg.arguments?.[0] || {};

    log('blue', '📤', `ENVIADO: ${target || 'type:' + msg.type} ${JSON.stringify(args).substring(0, 100)}`);

    // Salvar comandos importantes
    if (target === 'Bet' || target === 'PlaceBet' || target === 'MakeBet') {
      analysis.commands.bet.push({ ts: Date.now(), msg });
    }
    if (target === 'Cashout' || target === 'CashOut' || target === 'Sell' || target === 'Close') {
      analysis.commands.cashout.push({ ts: Date.now(), msg });
    }
  });

  // Navegar
  log('cyan', '🌐', `Navegando para: ${GAME_URL}`);

  try {
    await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    log('yellow', '⚠️', 'Timeout, continuando...');
  }

  log('green', '✅', 'Analisando protocolo...');
  log('blue', '💡', 'Faça uma aposta para capturar o protocolo de bet/cashout!');

  console.log('\n' + '='.repeat(80));
  console.log('  MONITORANDO - Pressione Ctrl+C para ver análise final');
  console.log('='.repeat(80) + '\n');

  // Status periódico
  setInterval(() => {
    const avgLat = analysis.latencies.length > 0
      ? (analysis.latencies.reduce((a, b) => a + b, 0) / analysis.latencies.length).toFixed(0)
      : 'N/A';
    log('cyan', '📊', `Rounds: ${analysis.rounds.length} | Latência média: ${avgLat}ms | Bets capturados: ${analysis.commands.bet.length} | Cashouts: ${analysis.commands.cashout.length}`);
  }, 30000);

  // Cleanup
  process.on('SIGINT', async () => {
    console.log('\n');
    printAnalysis();

    // Salvar dados
    const outputFile = path.join(LOG_DIR, `analysis_${Date.now()}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(analysis, null, 2));
    log('blue', '📁', `Dados salvos em: ${outputFile}`);

    await context.close();
    process.exit(0);
  });
}

function printAnalysis() {
  console.log('\n' + '='.repeat(80));
  console.log('  📊 ANÁLISE FINAL DO PROTOCOLO');
  console.log('='.repeat(80));

  // Latências
  if (analysis.latencies.length > 0) {
    const sorted = [...analysis.latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    console.log('\n⏱️ LATÊNCIAS (servidor → cliente):');
    console.log(`   Mínima: ${min}ms`);
    console.log(`   Média:  ${avg.toFixed(0)}ms`);
    console.log(`   P50:    ${p50}ms`);
    console.log(`   P95:    ${p95}ms`);
    console.log(`   Máxima: ${max}ms`);
  }

  // Comandos capturados
  console.log('\n📤 COMANDOS CAPTURADOS:');
  console.log(`   Bets: ${analysis.commands.bet.length}`);
  console.log(`   Cashouts: ${analysis.commands.cashout.length}`);

  if (analysis.commands.bet.length > 0) {
    console.log('\n   Exemplo de BET:');
    console.log(`   ${JSON.stringify(analysis.commands.bet[0].msg, null, 2)}`);
  }

  if (analysis.commands.cashout.length > 0) {
    console.log('\n   Exemplo de CASHOUT:');
    console.log(`   ${JSON.stringify(analysis.commands.cashout[0].msg, null, 2)}`);
  }

  // Análise de viabilidade
  console.log('\n' + '='.repeat(80));
  console.log('  🎯 ANÁLISE DE VIABILIDADE');
  console.log('='.repeat(80));

  const avgLatency = analysis.latencies.length > 0
    ? analysis.latencies.reduce((a, b) => a + b, 0) / analysis.latencies.length
    : 100;

  console.log(`
  📌 SITUAÇÃO ATUAL:
     - Latência média: ${avgLatency.toFixed(0)}ms
     - Quando você recebe OnCrash, o crash já aconteceu há ~${avgLatency.toFixed(0)}ms
     - O servidor valida cashouts pelo timestamp do SERVIDOR

  🔴 POR QUE NÃO FUNCIONA:
     1. O crash point é decidido ANTES do jogo começar (provably fair)
     2. O servidor marca o crash com timestamp preciso
     3. Qualquer cashout após o ts do crash é rejeitado
     4. Você está sempre ~${avgLatency.toFixed(0)}ms ATRASADO em relação ao servidor

  🟡 ÚNICA POSSIBILIDADE TEÓRICA:
     Se o servidor tiver um bug onde:
     - Aceita cashouts por alguns ms após o crash
     - Ou não valida timestamps corretamente

     Isso exigiria:
     - Conexão muito rápida (<20ms latência)
     - Enviar cashout instantaneamente ao receber OnCrash
     - E o servidor ter essa vulnerabilidade
  `);

  console.log('='.repeat(80) + '\n');
}

startAnalyzer().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
