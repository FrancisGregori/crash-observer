import { initDatabase, closeDatabase } from './database.js';
import { startServer, broadcastRound } from './server.js';
import { startObserver, stopObserver, onNewRound } from './observer.js';

// Processa argumentos de linha de comando
const args = process.argv.slice(2);
const observerOnly = args.includes('--observer-only');
const dashboardOnly = args.includes('--dashboard-only');

let observerResult = null;

/**
 * Função principal
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('           CRASH GAME OBSERVER - SpinBetter');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Inicializa o banco de dados
  console.log('[Init] Inicializando banco de dados...');
  initDatabase();

  // Modo dashboard apenas
  if (dashboardOnly) {
    console.log('[Init] Modo: Dashboard apenas (sem observer)');
    await startServer();
    console.log('');
    console.log('[Init] Dashboard iniciado! Observer não está rodando.');
    console.log('[Init] Para rodar o observer, execute: npm start');
    return;
  }

  // Inicia o servidor (a menos que seja observer-only)
  if (!observerOnly) {
    console.log('[Init] Iniciando servidor web...');
    await startServer();
  }

  // Configura callback para novas rodadas
  onNewRound((round) => {
    // Envia para clientes SSE
    broadcastRound(round);
  });

  // Inicia o observer
  console.log('[Init] Iniciando observer do jogo...');
  console.log('');

  try {
    observerResult = await startObserver();
  } catch (err) {
    console.error('[Init] Erro ao iniciar observer:', err.message);
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    SISTEMA ATIVO');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Observer: Monitorando rodadas do jogo Crash');
  if (!observerOnly) {
    console.log('  Dashboard: http://localhost:3000');
  }
  console.log('');
  console.log('  Pressione Ctrl+C para encerrar');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
}

/**
 * Tratamento de encerramento gracioso
 */
async function shutdown() {
  console.log('');
  console.log('[Shutdown] Encerrando...');

  if (observerResult) {
    await stopObserver(observerResult);
  }

  closeDatabase();

  console.log('[Shutdown] Encerrado com sucesso!');
  process.exit(0);
}

// Captura sinais de encerramento
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Captura erros não tratados
process.on('uncaughtException', (err) => {
  console.error('[Error] Erro não tratado:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[Error] Promise rejeitada:', err);
});

// Executa
main().catch((err) => {
  console.error('[Fatal] Erro fatal:', err);
  process.exit(1);
});
