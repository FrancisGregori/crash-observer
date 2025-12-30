/**
 * Platform Configuration for Multi-Platform Observer
 *
 * Suporta observação simultânea de múltiplas plataformas de Crash
 */

export const PLATFORMS = {
  spinbetter: {
    id: 'spinbetter',
    name: 'Spinbetter',
    url: 'https://spinbetter2z.com/br/games/crash',
    requiresLogin: false, // Auto-login or no login needed

    // Configuração do iframe do jogo
    gameFrame: {
      selectors: [
        'iframe[src*="games-frame"]',
        'iframe[src*="/games/371"]',
        'iframe[src*="crash"]'
      ],
      waitTimeout: 30000
    },

    // Seletores para extração de dados
    selectors: {
      // Multiplicador atual durante o jogo
      multiplier: '.crash-game__counter',

      // Indicador de jogo rodando
      gameRunning: '.crash-game__mountains.crash-game__mountains--game',

      // Dados de apostas
      betCount: '.crash-total__value--players',
      totalBet: '.crash-total__value--bets',
      totalWin: '.crash-total__value--prize',

      // Histórico de multiplicadores
      history: ['.crash-previous__item', '.crash-history__item'],

      // Countdown entre rodadas
      countdown: '.crash-timer--countdown',

      // Para live betting
      betInput: '.crash-stake__input-area input',
      autoCashoutInput: '.crash-autocashout__input input',
      betButton: '.crash-bet__action-btn'
    },

    // Intervalo de polling em ms
    pollingInterval: 100,

    // Tempo de cooldown para evitar duplicatas
    saveCooldown: 3000,

    // Funções de parsing específicas da plataforma
    parseMultiplier: (str) => {
      if (!str) return null;
      const cleaned = String(str).replace('x', '').replace(',', '.').trim();
      const value = parseFloat(cleaned);
      return isNaN(value) ? null : value;
    },

    parseNumber: (str) => {
      if (!str) return 0;
      let cleaned = String(str).trim();
      // Handle both "1,234.56" and "1.234,56" formats
      if (cleaned.includes(',') && cleaned.includes('.')) {
        if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
          cleaned = cleaned.replace(/,/g, '');
        }
      } else if (cleaned.includes(',') && !cleaned.includes('.')) {
        const parts = cleaned.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
          cleaned = cleaned.replace(',', '.');
        } else {
          cleaned = cleaned.replace(/,/g, '');
        }
      }
      return parseFloat(cleaned) || 0;
    }
  },

  bet365: {
    id: 'bet365',
    name: 'Bet365 Aviator',
    url: 'https://casino.bet365.bet.br/play/AviatorNYX',
    requiresLogin: true,

    // Bet365 usa a extensão Firefox para captura de dados
    // A extensão envia dados via WebSocket para o observer
    // NÃO usar automação Playwright pois Bet365 detecta
    useExtension: true,
    extensionPort: 3010,

    // Bet365 não usa iframe, o jogo está direto na página
    gameFrame: {
      selectors: null, // null = usar page diretamente, sem iframe
      waitTimeout: 30000
    },

    // Seletores para extração de dados do Aviator Bet365
    // Baseado nas informações fornecidas pelo usuário:
    // - .payouts-block: contém histórico de multiplicadores
    // - .bets: número de apostadores
    // - .cashout-value: valor de cashout
    // Nota: Este é o jogo Aviator (similar ao Crash), não o Crash tradicional
    selectors: {
      // Bloco de payouts contém os multiplicadores históricos
      // Novos multiplicadores são adicionados quando a rodada termina
      historyContainer: '.payouts-block',

      // Histórico - tenta múltiplos seletores para os itens
      history: [
        '.payouts-block .payout',
        '.payouts-block > div',
        '.payouts-block > span',
        '.payouts-block > *'
      ],

      // Total de apostadores (mostrado como número)
      betCount: '.bets',

      // Não tem totalBet - precisaria somar apostas individuais
      totalBet: null,

      // Valor total de cashout/ganhos
      totalWin: '.cashout-value',

      // Multiplicador atual do Aviator
      // Aviator mostra o multiplicador em tempo real durante o voo
      multiplier: '.payouts-block .payout:first-child, .coefficient, .multiplier-value, [class*="multiplier"]',

      // Estado do jogo - Aviator tem estados diferentes
      // O avião está "voando" quando o jogo está ativo
      gameRunning: '.plane-flying, .game-active, [class*="flying"], [class*="running"]',

      // Countdown/loading entre rodadas
      countdown: '.loading, .countdown, .waiting, [class*="loading"]'
    },

    // Intervalo de polling mais rápido para Bet365 (rodadas mais curtas ~4s)
    pollingInterval: 50,

    // Cooldown menor para rodadas mais rápidas
    saveCooldown: 2000,

    // Funções de parsing
    parseMultiplier: (str) => {
      if (!str) return null;
      // Aviator pode mostrar "1.00x" ou "1,00x" ou só "1.00"
      const cleaned = String(str)
        .replace(/x/gi, '')
        .replace(/,/g, '.')
        .replace(/[^\d.]/g, '')
        .trim();
      const value = parseFloat(cleaned);
      return isNaN(value) ? null : value;
    },

    parseNumber: (str) => {
      if (!str) return 0;
      let cleaned = String(str).replace(/[^\d.,]/g, '').trim();
      if (cleaned.includes(',') && cleaned.includes('.')) {
        if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
          cleaned = cleaned.replace(/,/g, '');
        }
      } else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(',', '.');
      }
      return parseFloat(cleaned) || 0;
    }
  }
};

/**
 * Retorna configuração de uma plataforma
 */
export function getPlatformConfig(platformId) {
  const config = PLATFORMS[platformId];
  if (!config) {
    throw new Error(`Plataforma desconhecida: ${platformId}`);
  }
  return config;
}

/**
 * Lista todas as plataformas disponíveis
 */
export function listPlatforms() {
  return Object.values(PLATFORMS).map(p => ({
    id: p.id,
    name: p.name,
    url: p.url,
    requiresLogin: p.requiresLogin
  }));
}

/**
 * Valida se uma plataforma existe
 */
export function isPlatformValid(platformId) {
  return platformId in PLATFORMS;
}

export default PLATFORMS;
