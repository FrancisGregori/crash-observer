/**
 * Popup script - Mostra status da conexao com o Observer
 */

(function() {
  'use strict';

  const WS_URL = 'ws://localhost:3010';

  function updateStatus(connected, message) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');

    if (connected) {
      dot.classList.add('connected');
      text.textContent = message || 'Conectado ao Observer';
    } else {
      dot.classList.remove('connected');
      text.textContent = message || 'Desconectado';
    }
  }

  function checkConnection() {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      updateStatus(true, 'Observer online');
      ws.close();
    };

    ws.onerror = () => {
      updateStatus(false, 'Observer offline');
    };

    ws.onclose = () => {
      // Already handled by onopen or onerror
    };
  }

  // Tenta obter stats do storage local
  function loadStats() {
    if (typeof browser !== 'undefined' && browser.storage) {
      browser.storage.local.get(['roundCount', 'lastRound']).then((data) => {
        if (data.roundCount !== undefined) {
          document.getElementById('roundCount').textContent = data.roundCount;
        }
        if (data.lastRound !== undefined) {
          document.getElementById('lastRound').textContent = data.lastRound + 'x';
        }
      });
    }
  }

  // Inicializa
  checkConnection();
  loadStats();

  // Atualiza a cada 2 segundos
  setInterval(() => {
    checkConnection();
    loadStats();
  }, 2000);

})();
