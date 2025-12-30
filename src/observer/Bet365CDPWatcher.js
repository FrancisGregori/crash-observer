/**
 * Bet365RemoteWatcher - Conecta ao Firefox via Remote Debugging
 *
 * Permite observar o Bet365 em um Firefox real onde o usuário já fez login
 * e a geolocalização já foi verificada.
 *
 * Uso:
 * 1. Instale o Firefox se não tiver
 * 2. Inicie o Firefox com: /Applications/Firefox.app/Contents/MacOS/firefox --remote-debugging-port=9222
 * 3. Faça login no Bet365 e navegue até o Aviator
 * 4. Execute o observer
 */

import { firefox } from 'playwright';
import { insertRound } from '../database.js';
import { broadcastRound, broadcastSignal } from './websocket.js';
import * as sequenceIndicator from './sequenceIndicator.js';
import { getPlatformConfig } from './platforms.js';

const REMOTE_DEBUGGING_PORT = 9222;

export class Bet365CDPWatcher {
  constructor() {
    this.config = getPlatformConfig('bet365');
    this.browser = null;
    this.page = null;
    this.pollInterval = null;
    this.isRunning = false;

    // Round detection state
    this.lastSavedHistoryFirst = null;
    this.lastSavedMultiplier = 0;
    this.lastSaveTime = 0;
    this.lastBetCount = 0;
  }

  /**
   * Conecta ao Firefox via Remote Debugging
   */
  async connect() {
    console.log('[Bet365 Firefox] Conectando ao Firefox...');
    console.log('[Bet365 Firefox] Porta:', REMOTE_DEBUGGING_PORT);

    try {
      this.browser = await firefox.connect({
        wsEndpoint: `ws://localhost:${REMOTE_DEBUGGING_PORT}`
      });
      console.log('[Bet365 Firefox] ✅ Conectado ao Firefox!');

      // Pega os contextos existentes
      const contexts = this.browser.contexts();
      console.log(`[Bet365 Firefox] Contextos encontrados: ${contexts.length}`);

      if (contexts.length === 0) {
        throw new Error('Nenhum contexto encontrado. Abra uma aba no Firefox.');
      }

      // Procura por uma página do Bet365
      for (const context of contexts) {
        const pages = context.pages();
        for (const page of pages) {
          const url = page.url();
          console.log(`[Bet365 Firefox] Página: ${url}`);

          if (url.includes('bet365') || url.includes('aviator')) {
            this.page = page;
            console.log(`[Bet365 Firefox] ✅ Página do Bet365 encontrada!`);
            break;
          }
        }
        if (this.page) break;
      }

      if (!this.page) {
        // Se não encontrou, usa a primeira página
        this.page = contexts[0].pages()[0];
        console.log('[Bet365 Firefox] ⚠️ Página do Bet365 não encontrada, usando primeira página');
        console.log('[Bet365 Firefox] Navegue até o Aviator no Firefox');
      }

      return true;
    } catch (err) {
      console.error('[Bet365 Firefox] ❌ Erro ao conectar:', err.message);
      console.log('');
      console.log('========================================');
      console.log('  INSTRUÇÕES PARA USAR O FIREFOX');
      console.log('========================================');
      console.log('');
      console.log('1. Instale o Firefox se não tiver:');
      console.log('   brew install --cask firefox');
      console.log('');
      console.log('2. Inicie o Firefox com debugging:');
      console.log('   /Applications/Firefox.app/Contents/MacOS/firefox --remote-debugging-port=9222');
      console.log('');
      console.log('3. Faça login no Bet365 e navegue até o Aviator');
      console.log('');
      console.log('4. Execute o observer novamente:');
      console.log('   npm run observer:bet365');
      console.log('');
      return false;
    }
  }

  /**
   * Aguarda o jogo estar visível na página
   */
  async waitForGame() {
    console.log('[Bet365 Firefox] Aguardando jogo Aviator...');

    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Verifica se estamos na página correta
        const url = this.page.url();
        if (!url.includes('bet365') && !url.includes('aviator')) {
          console.log(`[Bet365 Firefox] Página atual: ${url}`);
          console.log('[Bet365 Firefox] Navegue até o Aviator no Chrome...');
        }

        // Tenta encontrar elementos do jogo
        const hasPayouts = await this.page.locator('.payouts-block').count();
        if (hasPayouts > 0) {
          console.log('[Bet365 Firefox] ✅ Jogo Aviator detectado!');
          return true;
        }

        // Tenta outros seletores
        const hasBets = await this.page.locator('.bets').count();
        if (hasBets > 0) {
          console.log('[Bet365 Firefox] ✅ Elementos do jogo detectados!');
          return true;
        }

      } catch (err) {
        // Página pode estar carregando
      }

      if (i % 10 === 0) {
        console.log(`[Bet365 Firefox] Aguardando jogo... (${i * 2}s)`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('[Bet365 Firefox] ⚠️ Jogo não detectado, iniciando polling mesmo assim...');
    return false;
  }

  /**
   * Coleta dados da rodada
   */
  async collectRoundData() {
    try {
      return await this.page.evaluate(() => {
        // Função de parse
        function parseMultiplier(str) {
          if (!str) return 0;
          const cleaned = String(str).replace(/x/gi, '').replace(',', '.').trim();
          const match = cleaned.match(/[\d.]+/);
          return match ? parseFloat(match[0]) : 0;
        }

        function parseNumber(str) {
          if (!str) return 0;
          const cleaned = String(str).replace(/[^\d.,]/g, '').replace(',', '.');
          return parseFloat(cleaned) || 0;
        }

        // Coleta histórico de payouts
        const history = [];
        const payoutsBlock = document.querySelector('.payouts-block');
        if (payoutsBlock) {
          // Tenta diferentes seletores para os itens
          let items = payoutsBlock.querySelectorAll('.payout, [class*="payout"], > div, > span');
          if (items.length === 0) {
            items = payoutsBlock.children;
          }

          for (let i = 0; i < Math.min(items.length, 20); i++) {
            const text = items[i].textContent;
            const mult = parseMultiplier(text);
            if (mult >= 1.0) {
              history.push(mult);
            }
          }
        }

        // Coleta número de apostadores
        let betCount = 0;
        const betsEl = document.querySelector('.bets');
        if (betsEl) {
          betCount = parseNumber(betsEl.textContent);
        }

        // Coleta cashout value
        let totalWin = 0;
        const cashoutEl = document.querySelector('.cashout-value');
        if (cashoutEl) {
          totalWin = parseNumber(cashoutEl.textContent);
        }

        return {
          history,
          betCount: Math.round(betCount),
          totalBet: 0, // Bet365 não mostra isso diretamente
          totalWin
        };
      });
    } catch (err) {
      console.error('[Bet365 Firefox] Erro ao coletar dados:', err.message);
      return { history: [], betCount: 0, totalBet: 0, totalWin: 0 };
    }
  }

  /**
   * Salva uma rodada no banco
   */
  saveRound(multiplier, betCount, totalBet, totalWin, source = 'cdp') {
    const now = Date.now();

    // Evita duplicatas
    if (Math.abs(multiplier - this.lastSavedMultiplier) < 0.01 &&
        (now - this.lastSaveTime) < 2000) {
      return false;
    }

    const round = {
      createdAt: new Date().toISOString(),
      betCount,
      totalBet,
      totalWin,
      multiplier
    };

    try {
      const id = insertRound(round, 'bet365');
      round.id = id;
      round.platform = 'bet365';

      // Log colorido para crashes 1x
      if (multiplier <= 1.05) {
        console.log('');
        console.log('\x1b[41m\x1b[37m\x1b[1m  [Bet365] ⚠️  CRASH 1x!  \x1b[0m');
        console.log(`\x1b[33m  Rodada #${id} | ${multiplier.toFixed(2)}x\x1b[0m`);
        console.log('');
      } else {
        console.log(`[Bet365 Firefox] Rodada #${id}: ${multiplier.toFixed(2)}x (${betCount} jogadores)`);
      }

      this.lastSavedMultiplier = multiplier;
      this.lastSaveTime = now;

      // Broadcast
      broadcastRound(round);

      // Sequence indicator
      const state = sequenceIndicator.addCrash(multiplier);
      if (state.hasSignal) {
        broadcastSignal(state);
      }

      return true;
    } catch (err) {
      console.error('[Bet365 Firefox] Erro ao salvar:', err);
      return false;
    }
  }

  /**
   * Inicia o polling
   */
  startPolling() {
    console.log('[Bet365 Firefox] Iniciando polling (50ms)...');
    this.isRunning = true;

    this.pollInterval = setInterval(async () => {
      try {
        const data = await this.collectRoundData();

        // Detecta nova rodada via mudança no histórico
        if (data.history.length > 0) {
          const firstHist = data.history[0];

          if (this.lastSavedHistoryFirst === null) {
            this.lastSavedHistoryFirst = firstHist;
            console.log(`[Bet365 Firefox] Histórico inicial: ${firstHist}x`);
          } else if (Math.abs(firstHist - this.lastSavedHistoryFirst) > 0.01) {
            // Novo multiplicador no histórico = nova rodada terminou
            console.log(`[Bet365 Firefox] 📊 Nova rodada detectada: ${firstHist}x`);

            const saved = this.saveRound(
              firstHist,
              data.betCount || this.lastBetCount,
              data.totalBet,
              data.totalWin,
              'history'
            );

            if (saved) {
              this.lastSavedHistoryFirst = firstHist;
            }
          }
        }

        // Atualiza último betCount
        if (data.betCount > 0) {
          this.lastBetCount = data.betCount;
        }

      } catch (err) {
        if (!err.message.includes('Target closed')) {
          console.error('[Bet365 Firefox] Erro no polling:', err.message);
        }
      }
    }, 50); // Polling rápido de 50ms
  }

  /**
   * Inicia o watcher
   */
  async start() {
    const connected = await this.connect();
    if (!connected) {
      return false;
    }

    await this.waitForGame();
    this.startPolling();

    console.log('[Bet365 Firefox] ✅ Watcher iniciado!');
    console.log('[Bet365 Firefox] Monitorando rodadas... (Ctrl+C para parar)');

    return true;
  }

  /**
   * Para o watcher
   */
  async stop() {
    console.log('[Bet365 Firefox] Parando watcher...');

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Não fecha o browser pois é do usuário
    // Apenas desconecta
    if (this.browser) {
      this.browser.close();
    }

    this.isRunning = false;
    console.log('[Bet365 Firefox] ✅ Watcher parado');
  }
}

/**
 * Função auxiliar para iniciar o watcher CDP
 */
export async function startBet365CDPWatcher() {
  const watcher = new Bet365CDPWatcher();
  const success = await watcher.start();
  return success ? watcher : null;
}

export default Bet365CDPWatcher;
