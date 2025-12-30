/**
 * PlatformWatcher - Platform-agnostic game watcher
 *
 * Uses platform configuration to extract data from different crash game sites
 */

import { chromium, webkit, firefox } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { insertRound } from '../database.js';
import { broadcastRound, broadcastSignal } from './websocket.js';
import * as sequenceIndicator from './sequenceIndicator.js';
import { getPlatformConfig } from './platforms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * PlatformWatcher class - watches a single platform
 */
export class PlatformWatcher {
  constructor(platformId, options = {}) {
    this.platformId = platformId;
    this.config = getPlatformConfig(platformId);
    this.options = {
      headless: false,
      isolated: false,
      nonPersistent: false,
      ...options
    };

    // Browser/page references
    this.context = null;
    this.page = null;
    this.gameFrame = null;

    // Polling state
    this.pollInterval = null;
    this.isRunning = false;

    // Round detection state
    this.wasRunning = false;
    this.wasCountdownVisible = false;
    this.lastMultiplier = 0;
    this.lastSavedMultiplier = 0;
    this.lastSaveTime = 0;
    this.lastBetCount = 0;
    this.lastTotalBet = 0;
    this.lastSavedHistoryFirst = null;
    this.pendingRoundData = null;

    // 1x crash detection
    this.runningMultiplier = 0;
    this.maxRunningMultiplier = 0;
    this.countdownHiddenTime = 0;
    this.sawMultiplierDuringRound = false;
    this.roundStartBetCount = 0;
    this.roundStartTotalBet = 0;

    // Auth error handling
    this.lastAuthCheck = 0;
    this.isHandlingAuthError = false;
    this.authCheckInterval = null;
  }

  /**
   * Get user data directory for this platform
   */
  getUserDataDir() {
    if (this.options.userDataDir) {
      return this.options.userDataDir;
    }

    // Usa perfil real do Chrome se configurado
    if (this.config.useRealProfile) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      const chromePath = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
      return chromePath;
    }

    if (this.options.isolated) {
      const timestamp = Date.now();
      return path.join(__dirname, '..', '..', 'data', `browser-session-${this.platformId}-${timestamp}`);
    }

    return path.join(__dirname, '..', '..', 'data', `browser-session-${this.platformId}`);
  }

  /**
   * Start the platform watcher
   */
  async start() {
    console.log(`[${this.config.name}] Iniciando watcher...`);

    const userDataDir = this.getUserDataDir();

    // Args base para anti-detecção
    const baseArgs = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--disable-browser-side-navigation',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-popup-blocking'
    ];

    // Adiciona args extras da plataforma se existirem
    const platformArgs = this.config.extraBrowserArgs || [];
    const allArgs = [...baseArgs, ...platformArgs];

    const launchOptions = {
      headless: this.options.headless,
      viewport: { width: 1400, height: 900 },
      args: allArgs
    };

    // Configurações de contexto (geolocation, permissions, etc.)
    const contextOptions = {
      viewport: { width: 1400, height: 900 },
      // User agent de um Chrome real para evitar detecção
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Locale brasileiro
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo'
    };

    // Adiciona geolocalização se a plataforma requer (e não estiver usando geolocalização real)
    if (this.config.geolocation && !this.config.useRealGeolocation) {
      contextOptions.geolocation = this.config.geolocation;
      console.log(`[${this.config.name}] Geolocalização mockada: ${this.config.geolocation.latitude}, ${this.config.geolocation.longitude}`);
    } else if (this.config.useRealGeolocation) {
      console.log(`[${this.config.name}] Usando geolocalização REAL do sistema`);
    }

    // Adiciona permissões se a plataforma requer
    if (this.config.permissions) {
      contextOptions.permissions = this.config.permissions;
      console.log(`[${this.config.name}] Permissões: ${this.config.permissions.join(', ')}`);
    }

    // Seleciona o tipo de browser
    let browserType = chromium;
    let browserName = 'Chromium';

    if (this.config.browserType === 'webkit') {
      browserType = webkit;
      browserName = 'WebKit (Safari)';
    } else if (this.config.browserType === 'firefox') {
      browserType = firefox;
      browserName = 'Firefox';
    } else if (this.config.useRealChrome) {
      launchOptions.channel = 'chrome';
      browserName = 'Chrome';
    } else if (this.options.channel) {
      launchOptions.channel = this.options.channel;
    }

    console.log(`[${this.config.name}] Browser: ${browserName}`);

    if (this.options.nonPersistent) {
      console.log(`[${this.config.name}] Modo: NÃO PERSISTENTE`);
      const browser = await browserType.launch(launchOptions);
      this.context = await browser.newContext(contextOptions);
      this.page = await this.context.newPage();
      this.context._browser = browser;
    } else {
      console.log(`[${this.config.name}] Modo: PERSISTENTE`);

      // Se usando perfil real do Chrome, avisa o usuário
      if (this.config.useRealProfile) {
        console.log(`[${this.config.name}] ⚠️  USANDO PERFIL REAL DO CHROME`);
        console.log(`[${this.config.name}] ⚠️  FECHE O CHROME ANTES DE CONTINUAR!`);
        console.log(`[${this.config.name}] Diretório: ${userDataDir}`);
      } else {
        console.log(`[${this.config.name}] Diretório: ${userDataDir}`);
      }

      // Para contexto persistente, as opções são passadas junto com as de launch
      const persistentOptions = { ...launchOptions, ...contextOptions };
      this.context = await browserType.launchPersistentContext(userDataDir, persistentOptions);

      // Usa a primeira página existente ou cria uma nova
      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
    }

    // Se NÃO estamos usando perfil real, aplica anti-detecção e mocks
    if (!this.config.useRealProfile) {
      // Concede permissões para a origem do site (necessário para geolocation funcionar)
      if (this.config.permissions && this.config.permissions.length > 0) {
        try {
          const url = new URL(this.config.url);
          await this.context.grantPermissions(this.config.permissions, { origin: url.origin });
          console.log(`[${this.config.name}] Permissões concedidas para: ${url.origin}`);
        } catch (err) {
          console.log(`[${this.config.name}] Aviso ao conceder permissões:`, err.message);
        }
      }

      // Anti-detecção: remove propriedades que identificam automação
      // Passa null para geo se estamos usando geolocalização real
      const geoConfig = this.config.useRealGeolocation ? null : this.config.geolocation;
      await this.page.addInitScript((geo) => {
        // Remove webdriver flag
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });

        // NÃO mockamos plugins, languages, etc. para parecer mais natural
        // Apenas removemos o webdriver flag

        // Se temos configuração de geolocalização mockada, sobrescreve a API
        // Se geo é null, deixa a geolocalização real do sistema funcionar
        if (geo) {
          const mockGeolocation = {
            getCurrentPosition: (success, error, options) => {
              setTimeout(() => {
                success({
                  coords: {
                    latitude: geo.latitude,
                    longitude: geo.longitude,
                    accuracy: geo.accuracy || 10,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null
                  },
                  timestamp: Date.now()
                });
              }, 100);
            },
            watchPosition: (success, error, options) => {
              const id = setTimeout(() => {
                success({
                  coords: {
                    latitude: geo.latitude,
                    longitude: geo.longitude,
                    accuracy: geo.accuracy || 10,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null
                  },
                  timestamp: Date.now()
                });
              }, 100);
              return id;
            },
            clearWatch: (id) => {
              clearTimeout(id);
            }
          };

          Object.defineProperty(navigator, 'geolocation', {
            get: () => mockGeolocation
          });
        }
        // Se geo é null, NÃO faz nada com geolocalização - deixa o sistema real funcionar

      }, geoConfig);

      console.log(`[${this.config.name}] Anti-detecção configurada`);
    } else {
      console.log(`[${this.config.name}] Usando perfil real - sem mocks`);
    }

    console.log(`[${this.config.name}] Navegando para:`, this.config.url);

    try {
      await this.page.goto(this.config.url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } catch (err) {
      console.log(`[${this.config.name}] Timeout no carregamento inicial, continuando...`);
    }

    await this.page.waitForTimeout(5000);

    if (this.config.requiresLogin) {
      console.log(`[${this.config.name}] ⚠️ Esta plataforma requer login manual.`);
      console.log(`[${this.config.name}] Faça login no navegador e aguarde...`);
    }

    // Find game frame (or use page directly if no iframe)
    await this.waitForGameReady();

    // Start polling
    this.startPolling();

    // Start auth error check interval
    this.startAuthErrorCheck();

    console.log(`[${this.config.name}] ✅ Watcher iniciado com sucesso!`);

    return this;
  }

  /**
   * Wait for game to be ready (find iframe or game elements)
   */
  async waitForGameReady() {
    const maxAttempts = 60;

    if (this.config.gameFrame.selectors === null) {
      // No iframe - game is directly on page
      console.log(`[${this.config.name}] Aguardando elementos do jogo na página...`);

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          // Try to find history container (indicates game is loaded)
          const historySelector = this.config.selectors.historyContainer || this.config.selectors.history?.[0];
          if (historySelector) {
            const count = await this.page.locator(historySelector).count();
            if (count > 0) {
              console.log(`[${this.config.name}] ✅ Elementos do jogo encontrados!`);
              this.gameFrame = this.page; // Use page directly
              return;
            }
          }
        } catch (err) {
          // Ignore
        }

        if (attempt % 12 === 0) {
          console.log(`[${this.config.name}] Aguardando jogo carregar... (${Math.floor(attempt * 5 / 60)} min)`);
        }
        await this.page.waitForTimeout(5000);
      }
    } else {
      // Look for iframe
      console.log(`[${this.config.name}] Procurando iframe do jogo...`);

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        this.gameFrame = await this.findGameFrame();

        if (this.gameFrame) {
          console.log(`[${this.config.name}] ✅ Iframe do jogo encontrado!`);
          return;
        }

        if (attempt % 12 === 0) {
          console.log(`[${this.config.name}] Aguardando iframe... (${Math.floor(attempt * 5 / 60)} min)`);
        }
        await this.page.waitForTimeout(5000);
      }
    }

    throw new Error(`[${this.config.name}] Jogo não encontrado após 5 minutos`);
  }

  /**
   * Find game iframe based on platform config
   */
  async findGameFrame() {
    const frames = this.page.frames();
    const selectors = this.config.gameFrame.selectors;

    for (const frame of frames) {
      const url = frame.url();

      for (const selector of selectors) {
        // Extract the pattern from selector (e.g., 'iframe[src*="games-frame"]' -> 'games-frame')
        const match = selector.match(/src\*="([^"]+)"/);
        if (match && url.includes(match[1])) {
          return frame;
        }
      }
    }

    return null;
  }

  /**
   * Collect round data from the game
   */
  async collectRoundData() {
    const frame = this.gameFrame;
    const selectors = this.config.selectors;
    const parseMultiplier = this.config.parseMultiplier;
    const parseNumber = this.config.parseNumber;

    return await frame.evaluate(({ selectors, parseMultiplierStr, parseNumberStr }) => {
      // Reconstruct functions from strings
      const parseMultiplier = new Function('str', `return (${parseMultiplierStr})(str)`);
      const parseNumber = new Function('str', `return (${parseNumberStr})(str)`);

      // Get multiplier
      let multiplier = 0;
      if (selectors.multiplier) {
        const el = document.querySelector(selectors.multiplier);
        if (el) {
          multiplier = parseMultiplier(el.textContent);
        }
      }

      // Get bet count
      let betCount = 0;
      if (selectors.betCount) {
        const el = document.querySelector(selectors.betCount);
        if (el) {
          betCount = parseNumber(el.textContent);
        }
      }

      // Get total bet
      let totalBet = 0;
      if (selectors.totalBet) {
        const el = document.querySelector(selectors.totalBet);
        if (el) {
          totalBet = parseNumber(el.textContent);
        }
      }

      // Get total win
      let totalWin = 0;
      if (selectors.totalWin) {
        const el = document.querySelector(selectors.totalWin);
        if (el) {
          totalWin = parseNumber(el.textContent);
        }
      }

      // Check if game is running
      let isRunning = false;
      if (selectors.gameRunning) {
        const el = document.querySelector(selectors.gameRunning);
        isRunning = el !== null;
      }

      // Get history
      const history = [];
      const historySelectors = Array.isArray(selectors.history)
        ? selectors.history
        : selectors.historyContainer
          ? [selectors.historyContainer + ' > *']
          : [];

      for (const histSel of historySelectors) {
        const items = document.querySelectorAll(histSel);
        if (items.length > 0) {
          items.forEach((item, index) => {
            if (index < 10) {
              const mult = parseMultiplier(item.textContent);
              if (mult > 0) {
                history.push(mult);
              }
            }
          });
          break;
        }
      }

      // Check countdown visibility
      let isCountdownVisible = false;
      if (selectors.countdown) {
        const el = document.querySelector(selectors.countdown);
        if (el) {
          isCountdownVisible = el.style.display !== 'none' &&
                              window.getComputedStyle(el).display !== 'none';
        }
      }

      return {
        multiplier,
        betCount: Math.round(betCount),
        totalBet,
        totalWin,
        isRunning,
        history,
        isCountdownVisible
      };
    }, {
      selectors,
      parseMultiplierStr: parseMultiplier.toString(),
      parseNumberStr: parseNumber.toString()
    });
  }

  /**
   * Save a round to database
   */
  saveRound(multiplier, betCount, totalBet, totalWin, source = 'normal') {
    const now = Date.now();

    // Avoid duplicates
    if (Math.abs(multiplier - this.lastSavedMultiplier) < 0.01 &&
        (now - this.lastSaveTime) < this.config.saveCooldown) {
      console.log(`[${this.config.name}] Ignorando duplicata: ${multiplier}x`);
      return false;
    }

    const round = {
      createdAt: new Date().toISOString(),
      betCount: betCount,
      totalBet: totalBet,
      totalWin: totalWin,
      multiplier: multiplier
    };

    try {
      const id = insertRound(round, this.platformId);
      round.id = id;
      round.platform = this.platformId;

      // Special highlighting for 1x crashes
      if (multiplier <= 1.05) {
        const RED_BG = '\x1b[41m';
        const WHITE = '\x1b[37m';
        const BOLD = '\x1b[1m';
        const RESET = '\x1b[0m';
        const YELLOW = '\x1b[33m';

        console.log('');
        console.log(`${RED_BG}${WHITE}${BOLD}  [${this.config.name}] ⚠️  CRASH 1x DETECTADO!  ⚠️  ${RESET}`);
        console.log(`${RED_BG}${WHITE}${BOLD}  Rodada #${id} | Multiplicador: ${multiplier.toFixed(2)}x  ${RESET}`);
        console.log(`${YELLOW}  Apostadores: ${betCount} | Apostado: ${totalBet.toFixed(2)} | Fonte: ${source}${RESET}`);
        console.log('');
      } else {
        console.log(`[${this.config.name}][DB] Rodada #${id} salva! (${source}) - ${multiplier.toFixed(2)}x`);
      }

      this.lastSavedMultiplier = multiplier;
      this.lastSaveTime = now;
      this.pendingRoundData = null;

      // Broadcast via WebSocket
      broadcastRound(round);

      // Update sequence indicator
      const indicatorState = sequenceIndicator.addCrash(multiplier);
      if (indicatorState.hasSignal) {
        broadcastSignal(indicatorState);
      }

      return true;
    } catch (err) {
      console.error(`[${this.config.name}] Erro ao salvar rodada:`, err);
      return false;
    }
  }

  /**
   * Start the polling loop
   */
  startPolling() {
    this.isRunning = true;

    this.pollInterval = setInterval(async () => {
      if (this.isHandlingAuthError) return;

      try {
        // Re-find frame if using iframe
        if (this.config.gameFrame.selectors !== null) {
          const newFrame = await this.findGameFrame();
          if (!newFrame) {
            console.log(`[${this.config.name}] Iframe perdido, procurando...`);
            return;
          }
          this.gameFrame = newFrame;
        }

        const data = await this.collectRoundData();
        this.processRoundData(data);

      } catch (err) {
        if (!err.message.includes('Target closed') &&
            !err.message.includes('Execution context')) {
          console.error(`[${this.config.name}] Erro no polling:`, err.message);
        }
      }
    }, this.config.pollingInterval);
  }

  /**
   * Process round data and detect round endings
   */
  processRoundData(data) {
    const isRunning = data.isRunning;
    const currentHistory = data.history || [];
    const currentBetCount = data.betCount;
    const isCountdownVisible = data.isCountdownVisible;
    const currentHistoryFirst = currentHistory.length > 0 ? currentHistory[0] : null;

    // METHOD 1: Detect via history change
    if (currentHistoryFirst !== null) {
      if (this.lastSavedHistoryFirst === null) {
        console.log(`[${this.config.name}] Inicializando histórico com: ${currentHistoryFirst}x`);
        this.lastSavedHistoryFirst = currentHistoryFirst;
      } else if (currentHistoryFirst !== this.lastSavedHistoryFirst) {
        const multiplier = currentHistoryFirst;
        const betCount = this.pendingRoundData?.betCount || this.lastBetCount || data.betCount;
        const totalBet = this.pendingRoundData?.totalBet || this.lastTotalBet || data.totalBet;
        const totalWin = multiplier <= 1.05 ? 0 : data.totalWin;

        console.log(`[${this.config.name}] 📊 Rodada detectada via histórico: ${multiplier}x`);

        const saved = this.saveRound(multiplier, betCount, totalBet, totalWin, 'histórico');
        if (saved) {
          this.lastSavedHistoryFirst = currentHistoryFirst;
          this.pendingRoundData = null;
          this.lastBetCount = 0;
          this.lastTotalBet = 0;
        }
      }
    }

    // Capture bet data
    if (data.betCount > 0 && data.betCount > this.lastBetCount) {
      this.lastBetCount = data.betCount;
      this.lastTotalBet = data.totalBet;
    }

    // Track multiplier while game is running
    if (isRunning && data.multiplier > 0) {
      this.runningMultiplier = data.multiplier;
      if (data.multiplier > this.maxRunningMultiplier) {
        this.maxRunningMultiplier = data.multiplier;
      }
      if (data.multiplier >= 1.0) {
        this.sawMultiplierDuringRound = true;
      }
    }

    // Countdown hidden detection (game starts)
    if (this.wasCountdownVisible && !isCountdownVisible) {
      this.countdownHiddenTime = Date.now();
      this.sawMultiplierDuringRound = false;
      this.runningMultiplier = 0;
      this.maxRunningMultiplier = 0;
      this.roundStartBetCount = this.lastBetCount > 0 ? this.lastBetCount : data.betCount;
      this.roundStartTotalBet = this.lastTotalBet > 0 ? this.lastTotalBet : data.totalBet;
    }

    // METHOD 2: Detect via state transition
    if (this.wasRunning && !isRunning) {
      let multiplier = data.multiplier;

      if (multiplier < 0.99 && this.runningMultiplier >= 0.99) {
        multiplier = this.runningMultiplier;
      }
      if (multiplier < 0.99 && this.maxRunningMultiplier >= 0.99) {
        multiplier = this.maxRunningMultiplier;
      }
      if (multiplier < 0.99) {
        multiplier = 1.00;
      }

      console.log(`[${this.config.name}] Transição: rodando -> parado (mult: ${multiplier}x)`);

      if (multiplier >= 0.99) {
        const betCount = this.lastBetCount > 0 ? this.lastBetCount : data.betCount;
        const totalBet = this.lastTotalBet > 0 ? this.lastTotalBet : data.totalBet;
        const totalWin = multiplier <= 1.05 ? 0 : data.totalWin;

        this.saveRound(multiplier, betCount, totalBet, totalWin, 'transição');
        this.lastBetCount = 0;
        this.lastTotalBet = 0;
      }

      this.runningMultiplier = 0;
      this.maxRunningMultiplier = 0;
    }

    // Game start
    if (!this.wasRunning && isRunning) {
      console.log(`[${this.config.name}] 🚀 Nova rodada iniciada!`);
      this.runningMultiplier = 0;
      this.maxRunningMultiplier = 0;
    }

    // METHOD 3: Countdown reappears (1x crash detection)
    if (!this.wasCountdownVisible && isCountdownVisible) {
      const now = Date.now();
      const roundDuration = this.countdownHiddenTime > 0 ? (now - this.countdownHiddenTime) : 0;

      const isValidRoundDuration = roundDuration > 0 && roundDuration < 30000;
      const noMultiplierSeen = !this.sawMultiplierDuringRound && this.maxRunningMultiplier < 1.0;

      if (this.countdownHiddenTime > 0 && isValidRoundDuration && noMultiplierSeen) {
        console.log(`[${this.config.name}] 🎯 CRASH 1x DETECTADO via countdown!`);

        const betCount = this.roundStartBetCount || this.lastBetCount || data.betCount;
        const totalBet = this.roundStartTotalBet || this.lastTotalBet || data.totalBet;

        this.saveRound(1.00, betCount, totalBet, 0, 'countdown-1x');
      }

      // Reset tracking
      this.countdownHiddenTime = 0;
      this.sawMultiplierDuringRound = false;
      this.roundStartBetCount = 0;
      this.roundStartTotalBet = 0;
      this.runningMultiplier = 0;
      this.maxRunningMultiplier = 0;
    }

    // Update state
    this.wasRunning = isRunning;
    this.wasCountdownVisible = isCountdownVisible;
    this.lastMultiplier = data.multiplier;
  }

  /**
   * Start auth error check interval
   */
  startAuthErrorCheck() {
    // Only for platforms that may need auth refresh
    if (!this.config.requiresLogin) {
      this.authCheckInterval = setInterval(() => {
        this.checkAndHandleAuthError();
      }, 10000);
    }
  }

  /**
   * Check for auth errors and handle them
   */
  async checkAndHandleAuthError() {
    if (this.isHandlingAuthError) return false;

    try {
      const hasError = await this.page.evaluate(() => {
        const text = document.body?.innerText?.toLowerCase() || '';
        return text.includes('erro de autorização') ||
               text.includes('authorization error') ||
               text.includes('atualize a página');
      });

      if (hasError) {
        this.isHandlingAuthError = true;
        console.log(`[${this.config.name}] ⚠️ Erro de autorização detectado! Recarregando...`);

        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page.waitForTimeout(5000);
        await this.waitForGameReady();

        this.isHandlingAuthError = false;
        return true;
      }
    } catch (err) {
      this.isHandlingAuthError = false;
    }

    return false;
  }

  /**
   * Stop the watcher
   */
  async stop() {
    console.log(`[${this.config.name}] Parando watcher...`);

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.authCheckInterval) {
      clearInterval(this.authCheckInterval);
    }

    if (this.context) {
      if (this.context._browser) {
        await this.context._browser.close();
      } else {
        await this.context.close();
      }
    }

    this.isRunning = false;
    console.log(`[${this.config.name}] ✅ Watcher parado`);
  }
}

export default PlatformWatcher;
