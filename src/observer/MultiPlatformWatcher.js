/**
 * MultiPlatformWatcher - Manages multiple platform watchers simultaneously
 *
 * Allows observing Spinbetter and Bet365 at the same time
 */

import { PlatformWatcher } from './PlatformWatcher.js';
import { Bet365CDPWatcher } from './Bet365CDPWatcher.js';
import { listPlatforms, isPlatformValid, getPlatformConfig } from './platforms.js';

/**
 * MultiPlatformWatcher class
 */
export class MultiPlatformWatcher {
  constructor() {
    this.watchers = new Map(); // platformId -> PlatformWatcher
    this.isRunning = false;
  }

  /**
   * List available platforms
   */
  static listPlatforms() {
    return listPlatforms();
  }

  /**
   * Add and start a platform watcher
   * @param {string} platformId - Platform ID (e.g., 'spinbetter', 'bet365')
   * @param {object} options - Watcher options
   */
  async addPlatform(platformId, options = {}) {
    if (!isPlatformValid(platformId)) {
      throw new Error(`Plataforma inválida: ${platformId}`);
    }

    if (this.watchers.has(platformId)) {
      console.log(`[MultiPlatform] Plataforma ${platformId} já está ativa`);
      return this.watchers.get(platformId);
    }

    console.log(`[MultiPlatform] Adicionando plataforma: ${platformId}`);

    // Verifica o modo de captura da plataforma
    const config = getPlatformConfig(platformId);
    let watcher;

    if (config.useExtension) {
      // Plataforma usa extensão do navegador - não precisa de watcher
      console.log(`[MultiPlatform] ${platformId} usa extensão do navegador`);
      console.log(`[MultiPlatform] Certifique-se de que a extensão Firefox está instalada`);
      console.log(`[MultiPlatform] A extensão enviará dados via WebSocket porta ${config.extensionPort || 3010}`);

      // Cria um watcher "dummy" para manter compatibilidade
      watcher = {
        isRunning: true,
        lastSavedMultiplier: 0,
        lastSaveTime: 0,
        stop: async () => { console.log(`[MultiPlatform] ${platformId} extension mode stopped`); }
      };
    } else if (config.useCDP) {
      console.log(`[MultiPlatform] Usando modo CDP para ${platformId}`);
      watcher = new Bet365CDPWatcher();
      const success = await watcher.start();
      if (!success) {
        throw new Error('Falha ao conectar via CDP. Veja as instruções acima.');
      }
    } else {
      watcher = new PlatformWatcher(platformId, options);
      await watcher.start();
    }

    this.watchers.set(platformId, watcher);
    this.isRunning = true;

    console.log(`[MultiPlatform] ✅ Plataforma ${platformId} adicionada com sucesso`);
    console.log(`[MultiPlatform] Total de plataformas ativas: ${this.watchers.size}`);

    return watcher;
  }

  /**
   * Remove and stop a platform watcher
   * @param {string} platformId - Platform ID
   */
  async removePlatform(platformId) {
    if (!this.watchers.has(platformId)) {
      console.log(`[MultiPlatform] Plataforma ${platformId} não está ativa`);
      return false;
    }

    console.log(`[MultiPlatform] Removendo plataforma: ${platformId}`);

    const watcher = this.watchers.get(platformId);
    await watcher.stop();

    this.watchers.delete(platformId);

    if (this.watchers.size === 0) {
      this.isRunning = false;
    }

    console.log(`[MultiPlatform] ✅ Plataforma ${platformId} removida`);
    console.log(`[MultiPlatform] Plataformas ativas restantes: ${this.watchers.size}`);

    return true;
  }

  /**
   * Start multiple platforms at once
   * @param {string[]} platformIds - Array of platform IDs
   * @param {object} options - Shared options for all watchers
   */
  async startPlatforms(platformIds, options = {}) {
    console.log(`[MultiPlatform] Iniciando ${platformIds.length} plataforma(s)...`);

    const results = [];

    for (const platformId of platformIds) {
      try {
        const watcher = await this.addPlatform(platformId, options);
        results.push({ platformId, success: true, watcher });
      } catch (err) {
        console.error(`[MultiPlatform] Erro ao iniciar ${platformId}:`, err.message);
        results.push({ platformId, success: false, error: err.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    console.log(`[MultiPlatform] ${successful}/${platformIds.length} plataformas iniciadas com sucesso`);

    return results;
  }

  /**
   * Get active platform IDs
   */
  getActivePlatforms() {
    return Array.from(this.watchers.keys());
  }

  /**
   * Get watcher for a specific platform
   */
  getWatcher(platformId) {
    return this.watchers.get(platformId);
  }

  /**
   * Get status of all watchers
   */
  getStatus() {
    const status = {
      isRunning: this.isRunning,
      activePlatforms: this.getActivePlatforms(),
      watchers: {}
    };

    for (const [platformId, watcher] of this.watchers) {
      status.watchers[platformId] = {
        isRunning: watcher.isRunning,
        lastSavedMultiplier: watcher.lastSavedMultiplier,
        lastSaveTime: watcher.lastSaveTime
      };
    }

    return status;
  }

  /**
   * Stop all platform watchers
   */
  async stopAll() {
    console.log(`[MultiPlatform] Parando todas as plataformas (${this.watchers.size})...`);

    const platformIds = this.getActivePlatforms();

    for (const platformId of platformIds) {
      await this.removePlatform(platformId);
    }

    this.isRunning = false;
    console.log('[MultiPlatform] ✅ Todas as plataformas paradas');
  }
}

// Singleton instance for global access
let instance = null;

/**
 * Get or create the singleton instance
 */
export function getMultiPlatformWatcher() {
  if (!instance) {
    instance = new MultiPlatformWatcher();
  }
  return instance;
}

/**
 * Convenience function to start watching platforms
 * @param {string|string[]} platforms - Platform ID(s) to watch
 * @param {object} options - Watcher options
 */
export async function startWatching(platforms, options = {}) {
  const watcher = getMultiPlatformWatcher();

  const platformIds = Array.isArray(platforms) ? platforms : [platforms];

  return watcher.startPlatforms(platformIds, options);
}

/**
 * Convenience function to stop all watching
 */
export async function stopWatching() {
  const watcher = getMultiPlatformWatcher();
  return watcher.stopAll();
}

export default MultiPlatformWatcher;
