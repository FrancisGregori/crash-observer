import { initWebSocket } from './websocket.js';
import { startApiServer } from './api.js';
import { startGameWatcher, stopGameWatcher } from './gameWatcher.js';
import { PORTS } from '../shared/protocol.js';
import { initDatabase } from '../database.js';

let watcherResult = null;

async function main() {
  console.log('========================================');
  console.log('     CRASH GAME OBSERVER v2.0');
  console.log('========================================');
  console.log('');

  // Inicializa o banco de dados
  initDatabase();

  // Inicia servidor WebSocket
  initWebSocket(PORTS.OBSERVER_WS);
  console.log(`[Observer] WebSocket na porta ${PORTS.OBSERVER_WS}`);

  // Inicia servidor REST API
  await startApiServer(PORTS.OBSERVER_API);
  console.log(`[Observer] API REST na porta ${PORTS.OBSERVER_API}`);

  console.log('');
  console.log('[Observer] Servidores iniciados. Iniciando monitoramento...');
  console.log('');

  // Inicia o game watcher
  try {
    watcherResult = await startGameWatcher();
  } catch (err) {
    console.error('[Observer] Erro ao iniciar game watcher:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Observer] Encerrando...');
  if (watcherResult) {
    await stopGameWatcher(watcherResult);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Observer] Encerrando...');
  if (watcherResult) {
    await stopGameWatcher(watcherResult);
  }
  process.exit(0);
});

main().catch(err => {
  console.error('[Observer] Erro fatal:', err);
  process.exit(1);
});
