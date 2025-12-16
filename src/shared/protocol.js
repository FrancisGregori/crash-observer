// Tipos de mensagem WebSocket
export const WS_MESSAGE_TYPES = {
  CONNECTED: 'connected',
  ROUND: 'round',
  GAME_STATE: 'game_state',
  BETTING_PHASE: 'betting_phase',
  LIVE_BET: 'liveBet',
  ERROR: 'error'
};

// Portas dos serviços
export const PORTS = {
  DASHBOARD: 3000,
  OBSERVER_WS: 3001,
  OBSERVER_API: 3002
};
