import { initWebSocket } from './websocket.js';
import { startApiServer } from './api.js';
import { startGameWatcher, stopGameWatcher } from './gameWatcher.js';
import { getMultiPlatformWatcher, startWatching, stopWatching } from './MultiPlatformWatcher.js';
import { listPlatforms } from './platforms.js';
import { initRedisSubscriber, closeRedisSubscriber } from './redisSubscriber.js';
import { PORTS } from '../shared/protocol.js';
import { initDatabase } from '../database.js';

let watcherResult = null;
let useMultiPlatform = false;

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    platforms: [],
    legacy: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--legacy' || arg === '-l') {
      result.legacy = true;
    } else if (arg === '--platforms' || arg === '-p') {
      // Next arg(s) are platform IDs
      const platforms = args[i + 1];
      if (platforms) {
        result.platforms = platforms.split(',').map(p => p.trim());
        i++;
      }
    } else if (!arg.startsWith('-')) {
      // Assume it's a platform ID
      result.platforms.push(arg);
    }
  }

  // Default to spinbetter if no platforms specified
  if (result.platforms.length === 0 && !result.legacy) {
    result.platforms = ['spinbetter'];
  }

  return result;
}

function showHelp() {
  console.log('');
  console.log('Uso: node src/observer/index.js [opções] [plataformas]');
  console.log('');
  console.log('Opções:');
  console.log('  -h, --help       Mostra esta mensagem de ajuda');
  console.log('  -l, --legacy     Usa o watcher antigo (apenas Spinbetter)');
  console.log('  -p, --platforms  Lista de plataformas separadas por vírgula');
  console.log('');
  console.log('Plataformas disponíveis:');
  listPlatforms().forEach(p => {
    const loginNote = p.requiresLogin ? ' (requer login manual)' : '';
    console.log(`  ${p.id.padEnd(12)} - ${p.name}${loginNote}`);
  });
  console.log('');
  console.log('Exemplos:');
  console.log('  node src/observer/index.js                     # Apenas Spinbetter (padrão)');
  console.log('  node src/observer/index.js spinbetter bet365   # Ambas plataformas');
  console.log('  node src/observer/index.js -p spinbetter,bet365 # Mesmo que acima');
  console.log('  node src/observer/index.js --legacy            # Modo legado Spinbetter');
  console.log('');
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log('========================================');
  console.log('     CRASH GAME OBSERVER v2.1');
  console.log('     Multi-Platform + ML Predictions');
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

  // Inicia subscriber Redis para ML predictions
  const redisConnected = await initRedisSubscriber();
  if (redisConnected) {
    console.log('[Observer] Redis subscriber ativo para ML predictions');
  } else {
    console.log('[Observer] Redis nao disponivel - ML predictions desabilitadas');
  }

  console.log('');
  console.log('[Observer] Servidores iniciados. Iniciando monitoramento...');
  console.log('');

  // Decide qual modo usar
  if (args.legacy) {
    // Modo legado: usa gameWatcher original (apenas Spinbetter)
    console.log('[Observer] Modo: LEGADO (apenas Spinbetter)');
    useMultiPlatform = false;

    try {
      watcherResult = await startGameWatcher();
    } catch (err) {
      console.error('[Observer] Erro ao iniciar game watcher:', err);
      process.exit(1);
    }
  } else {
    // Modo multi-plataforma
    console.log(`[Observer] Modo: MULTI-PLATAFORMA`);
    console.log(`[Observer] Plataformas: ${args.platforms.join(', ')}`);
    useMultiPlatform = true;

    try {
      const results = await startWatching(args.platforms);
      const failed = results.filter(r => !r.success);

      if (failed.length === results.length) {
        console.error('[Observer] Nenhuma plataforma iniciada com sucesso');
        process.exit(1);
      }

      if (failed.length > 0) {
        console.warn(`[Observer] ⚠️ ${failed.length} plataforma(s) falharam:`);
        failed.forEach(f => console.warn(`  - ${f.platformId}: ${f.error}`));
      }
    } catch (err) {
      console.error('[Observer] Erro ao iniciar plataformas:', err);
      process.exit(1);
    }
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('\n[Observer] Encerrando...');
  await closeRedisSubscriber();

  if (useMultiPlatform) {
    await stopWatching();
  } else if (watcherResult) {
    await stopGameWatcher(watcherResult);
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(err => {
  console.error('[Observer] Erro fatal:', err);
  process.exit(1);
});
