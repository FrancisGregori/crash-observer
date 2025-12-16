import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORTS } from '../shared/protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Endpoint de configuração para o frontend saber onde conectar
app.get('/api/config', (req, res) => {
  res.json({
    observerWsUrl: `ws://localhost:${PORTS.OBSERVER_WS}`,
    observerApiUrl: `http://localhost:${PORTS.OBSERVER_API}`
  });
});

// Inicia o servidor
app.listen(PORTS.DASHBOARD, () => {
  console.log('========================================');
  console.log('     CRASH GAME DASHBOARD v2.0');
  console.log('========================================');
  console.log('');
  console.log(`[Dashboard] Servidor iniciado em http://localhost:${PORTS.DASHBOARD}`);
  console.log(`[Dashboard] Conectando ao Observer em:`);
  console.log(`            - WebSocket: ws://localhost:${PORTS.OBSERVER_WS}`);
  console.log(`            - API REST:  http://localhost:${PORTS.OBSERVER_API}`);
  console.log('');
});

export default app;
