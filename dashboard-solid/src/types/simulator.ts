// Bet modes for manual simulator
export type BetMode = 'single' | 'double';

// Active bet in simulator
export interface SimulatorBet {
  mode: BetMode;
  amount: number;
  cashout: number;       // For single mode
  cashout2?: number;     // For double mode (2nd bet)
  timestamp: number;
}

// Bet history item
export interface SimulatorHistoryItem {
  id: number;
  mode: BetMode;
  amount: number;
  cashout1: number;
  cashout2?: number;
  roundMultiplier: number;
  won: boolean;
  profit: number;
  balance: number;
  timestamp: number;
  resultText: string;
}

// Simulator statistics
export interface SimulatorStats {
  totalBets: number;
  wins: number;
  losses: number;
  totalWagered: number;
  totalProfit: number;
}

// Simulator configuration (persisted)
export interface SimulatorConfig {
  betAmount: number;
  betAmountDouble: number;
  cashout: number;
  cashout2: number;
  mode: BetMode;
}

// Full simulator state
export interface SimulatorState {
  balance: number;
  initialBalance: number;
  activeBet: SimulatorBet | null;
  history: SimulatorHistoryItem[];
  stats: SimulatorStats;
  config: SimulatorConfig;
}

// Create default simulator state
export function createDefaultSimulatorState(): SimulatorState {
  return {
    balance: 100,
    initialBalance: 100,
    activeBet: null,
    history: [],
    stats: {
      totalBets: 0,
      wins: 0,
      losses: 0,
      totalWagered: 0,
      totalProfit: 0,
    },
    config: {
      betAmount: 2,
      betAmountDouble: 2,
      cashout: 2.0,
      cashout2: 10.0,
      mode: 'double',
    },
  };
}
