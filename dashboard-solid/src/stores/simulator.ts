import { createStore } from 'solid-js/store';
import type {
  SimulatorState,
  SimulatorBet,
  SimulatorHistoryItem,
  SimulatorConfig,
  BetMode,
} from '../types';
import { createDefaultSimulatorState } from '../types';

const STORAGE_KEY = 'crash_simulator_state';

// Load from localStorage
function loadFromStorage(): SimulatorState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...createDefaultSimulatorState(), ...parsed, activeBet: null };
    }
  } catch (e) {
    console.error('Error loading simulator state:', e);
  }
  return createDefaultSimulatorState();
}

// Save to localStorage
function saveToStorage(state: SimulatorState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Error saving simulator state:', e);
  }
}

const [state, setState] = createStore<SimulatorState>(loadFromStorage());

export const simulatorStore = state;

// Actions
export function setBalance(balance: number) {
  setState('balance', balance);
  saveToStorage(state);
}

export function resetSimulator() {
  const defaultState = createDefaultSimulatorState();
  setState({
    ...defaultState,
    config: state.config, // Keep config
  });
  saveToStorage(state);
}

export function setConfig(config: Partial<SimulatorConfig>) {
  setState('config', (prev) => ({ ...prev, ...config }));
  saveToStorage(state);
}

export function setBetMode(mode: BetMode) {
  setState('config', 'mode', mode);
  saveToStorage(state);
}

export function placeBet(bet: SimulatorBet) {
  const totalAmount = bet.mode === 'single' ? bet.amount : bet.amount * 2;

  if (state.balance < totalAmount) {
    console.error('Insufficient balance');
    return false;
  }

  setState('balance', (prev) => prev - totalAmount);
  setState('activeBet', bet);
  saveToStorage(state);
  return true;
}

export function cancelBet() {
  if (!state.activeBet) return;

  const refund = state.activeBet.mode === 'single'
    ? state.activeBet.amount
    : state.activeBet.amount * 2;

  setState('balance', (prev) => prev + refund);
  setState('activeBet', null);
  saveToStorage(state);
}

export function resolveBet(roundMultiplier: number) {
  const bet = state.activeBet;
  if (!bet) return;

  let winnings = 0;
  let profit = 0;
  let won = false;
  let resultText = '';

  if (bet.mode === 'single') {
    const totalBet = bet.amount;
    if (roundMultiplier >= bet.cashout) {
      winnings = bet.amount * bet.cashout;
      profit = winnings - totalBet;
      won = true;
      resultText = `Ganhou ${bet.cashout}x`;
    } else {
      profit = -totalBet;
      resultText = `Perdeu (Crash: ${roundMultiplier.toFixed(2)}x)`;
    }
  } else {
    // Double mode (2x strategy)
    const totalBet = bet.amount * 2;
    const cashout1 = 2.0;
    const cashout2 = bet.cashout2 || 10.0;

    const won1 = roundMultiplier >= cashout1;
    const won2 = roundMultiplier >= cashout2;

    if (won1) winnings += bet.amount * cashout1;
    if (won2) winnings += bet.amount * cashout2;

    profit = winnings - totalBet;
    won = profit > 0;

    if (won1 && won2) {
      resultText = `Ganhou ${cashout1}x + ${cashout2}x`;
    } else if (won1) {
      resultText = `Parcial: ${cashout1}x (${cashout2}x perdeu)`;
    } else {
      resultText = `Perdeu (Crash: ${roundMultiplier.toFixed(2)}x)`;
    }
  }

  // Update balance
  setState('balance', (prev) => prev + winnings);

  // Update stats
  setState('stats', (prev) => ({
    ...prev,
    totalBets: prev.totalBets + 1,
    wins: prev.wins + (won ? 1 : 0),
    losses: prev.losses + (won ? 0 : 1),
    totalWagered: prev.totalWagered + (bet.mode === 'single' ? bet.amount : bet.amount * 2),
    totalProfit: prev.totalProfit + profit,
  }));

  // Add to history
  const historyItem: SimulatorHistoryItem = {
    id: Date.now(),
    mode: bet.mode,
    amount: bet.amount,
    cashout1: bet.cashout,
    cashout2: bet.cashout2,
    roundMultiplier,
    won,
    profit,
    balance: state.balance,
    timestamp: Date.now(),
    resultText,
  };

  setState('history', (prev) => [historyItem, ...prev].slice(0, 100));
  setState('activeBet', null);
  saveToStorage(state);
}
