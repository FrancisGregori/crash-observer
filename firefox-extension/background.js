/**
 * Bet365 Observer - Background Script
 *
 * Este script roda independentemente das abas e usa a Alarms API
 * para periodicamente verificar e acordar o content script.
 * Isso garante que a extensão continue funcionando mesmo quando
 * a aba não tem foco.
 */

const ALARM_NAME = 'bet365-keepalive';
const CHECK_INTERVAL = 0.5; // 30 segundos em minutos
const AVIATOR_URL = 'https://casino.bet365.bet.br/play/AviatorNYX';

// Cria alarme para verificação periódica
browser.alarms.create(ALARM_NAME, {
  periodInMinutes: CHECK_INTERVAL
});

console.log('[Bet365 Background] Iniciado - verificação a cada 30s');

// Handler do alarme
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  console.log('[Bet365 Background] Verificando tabs do Bet365...');

  try {
    // Busca tabs do Bet365
    const tabs = await browser.tabs.query({
      url: ['*://*.bet365.bet.br/*', '*://*.bet365.com/*']
    });

    for (const tab of tabs) {
      if (!tab.id) continue;

      try {
        // Envia mensagem para o content script para acordá-lo e verificar logout
        // Timeout de 5 segundos
        const response = await Promise.race([
          browser.tabs.sendMessage(tab.id, { type: 'keepalive_check' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);

        console.log(`[Bet365 Background] Tab ${tab.id}: ${response?.status || 'no response'}`);

        // Se detectou logout, redireciona para o jogo
        if (response?.logout) {
          console.log(`[Bet365 Background] Logout detectado na tab ${tab.id}, redirecionando...`);
          await browser.tabs.update(tab.id, { url: AVIATOR_URL });
        }
      } catch (e) {
        // Content script não está respondendo - pode estar suspenso ou com erro
        console.log(`[Bet365 Background] Tab ${tab.id} não respondeu (${e.message})`);

        // Tenta injetar script para verificar logout diretamente
        try {
          const results = await browser.tabs.executeScript(tab.id, {
            code: `
              (function() {
                // Verifica modais de logout/timeout
                const modals = document.querySelectorAll('.modal, .modal-dialog, [role="dialog"], ngb-modal-window');
                for (const modal of modals) {
                  const text = modal.textContent || '';
                  if (text.includes('logged out') ||
                      text.includes('desconectado') ||
                      text.includes('sessão expirada') ||
                      text.includes('session expired') ||
                      text.includes('Tempo limite da rede') ||
                      text.includes('Network timeout') ||
                      text.includes('Verifique sua conexão')) {
                    return { logout: true, reason: 'modal detected' };
                  }
                }
                return { logout: false };
              })();
            `,
            allFrames: false // Só no frame principal
          });

          // Verifica o resultado
          if (results && results[0] && results[0].logout) {
            console.log(`[Bet365 Background] Logout detectado via inject na tab ${tab.id}`);
            await browser.tabs.update(tab.id, { url: AVIATOR_URL });
          }
        } catch (injectError) {
          // Se não conseguiu injetar, a tab pode estar em um estado ruim
          console.log(`[Bet365 Background] Tab ${tab.id} não acessível: ${injectError.message}`);

          // Se a URL indica que deveria estar no jogo mas não conseguimos acessar,
          // recarrega a tab como última medida
          if (tab.url && tab.url.includes('casino.bet365')) {
            console.log(`[Bet365 Background] Recarregando tab ${tab.id} como precaução`);
            await browser.tabs.reload(tab.id);
          }
        }
      }
    }
  } catch (e) {
    console.error('[Bet365 Background] Erro:', e);
  }
});

// Também verifica quando uma tab é atualizada
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('bet365')) {
      console.log(`[Bet365 Background] Tab ${tabId} carregada: ${tab.url.substring(0, 50)}`);
    }
  }
});

// Listener para mensagens do content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'logout_detected') {
    console.log('[Bet365 Background] Logout reportado pelo content script');
    // Redireciona para o jogo
    if (sender.tab?.id) {
      browser.tabs.update(sender.tab.id, { url: AVIATOR_URL });
    }
  }

  if (message.type === 'content_alive') {
    console.log('[Bet365 Background] Content script ativo na tab', sender.tab?.id);
  }

  return true;
});

console.log('[Bet365 Background] Background script pronto');
