import { createStore } from 'solid-js/store';
import type {
  RoundData,
  StatsData,
  StreaksData,
  HouseProfitData,
  HourlyAnalysisData,
  AdvancedStatsData,
} from '../types';
import { onNewRoundArrived } from './ml';

// API base URL
const API_BASE = '/api';

// Platform filter type
export type PlatformFilter = 'all' | 'spinbetter' | 'bet365';

// Rounds store state
interface RoundsStoreState {
  rounds: RoundData[];
  stats: StatsData | null;
  streaks: StreaksData | null;
  houseProfit: HouseProfitData | null;
  hourlyAnalysis: HourlyAnalysisData | null;
  advancedStats: AdvancedStatsData | null;
  currentLimit: number;
  selectedPlatform: PlatformFilter;
  isLoading: boolean;
  error: string | null;
}

const initialState: RoundsStoreState = {
  rounds: [],
  stats: null,
  streaks: null,
  houseProfit: null,
  hourlyAnalysis: null,
  advancedStats: null,
  currentLimit: 50,
  selectedPlatform: 'all',
  isLoading: false,
  error: null,
};

// Create the store
const [state, setState] = createStore<RoundsStoreState>(initialState);

// Export the store for reading
export const roundsStore = state;

// Platform-specific helpers (for components that need unfiltered platform data)
export function getSpinbetterRounds(): RoundData[] {
  return state.rounds.filter(r => !r.platform || r.platform === 'spinbetter');
}

export function getBet365Rounds(): RoundData[] {
  return state.rounds.filter(r => r.platform === 'bet365');
}

export function getLastSpinbetterRound(): RoundData | undefined {
  return state.rounds.find(r => !r.platform || r.platform === 'spinbetter');
}

export function getLastBet365Round(): RoundData | undefined {
  return state.rounds.find(r => r.platform === 'bet365');
}

// Actions
export function setRounds(rounds: RoundData[]) {
  setState('rounds', rounds);
}

export function addRound(round: RoundData) {
  setState('rounds', (prev) => [round, ...prev].slice(0, 500));
}

export function setStats(stats: StatsData) {
  setState('stats', stats);
}

export function setStreaks(streaks: StreaksData) {
  setState('streaks', streaks);
}

export function setHouseProfit(data: HouseProfitData) {
  setState('houseProfit', data);
}

export function setHourlyAnalysis(data: HourlyAnalysisData) {
  setState('hourlyAnalysis', data);
}

export function setAdvancedStats(data: AdvancedStatsData) {
  setState('advancedStats', data);
}

export function setCurrentLimit(limit: number) {
  setState('currentLimit', limit);
}

export function setSelectedPlatform(platform: PlatformFilter) {
  setState('selectedPlatform', platform);
}

export function setLoading(loading: boolean) {
  setState('isLoading', loading);
}

export function setError(error: string | null) {
  setState('error', error);
}

// Helper to build URL with platform filter
function buildUrl(endpoint: string, params: Record<string, string | number> = {}): string {
  const platform = state.selectedPlatform;
  if (platform !== 'all') {
    params.platform = platform;
  }
  const queryString = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return queryString ? `${API_BASE}/${endpoint}?${queryString}` : `${API_BASE}/${endpoint}`;
}

// API fetch functions
export async function fetchRounds(limit: number = 50) {
  try {
    setLoading(true);
    const url = buildUrl('rounds', { limit });
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch rounds');
    const data = await response.json();
    setRounds(data);
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
  } finally {
    setLoading(false);
  }
}

export async function fetchStats() {
  try {
    const url = buildUrl('stats');
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch stats');
    const data = await response.json();
    setStats(data);
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

export async function fetchHourlyAnalysis() {
  try {
    const response = await fetch(`${API_BASE}/hourly`);
    if (!response.ok) throw new Error('Failed to fetch hourly analysis');
    const data = await response.json();
    setHourlyAnalysis(data);
  } catch (err) {
    console.error('Error fetching hourly analysis:', err);
  }
}

export async function fetchHouseProfit() {
  try {
    const response = await fetch(`${API_BASE}/house-profit`);
    if (!response.ok) throw new Error('Failed to fetch house profit');
    const data = await response.json();
    setHouseProfit(data);
  } catch (err) {
    console.error('Error fetching house profit:', err);
  }
}

export async function fetchAdvancedStats() {
  try {
    const response = await fetch(`${API_BASE}/advanced`);
    if (!response.ok) throw new Error('Failed to fetch advanced stats');
    const data = await response.json();
    setAdvancedStats(data);
  } catch (err) {
    console.error('Error fetching advanced stats:', err);
  }
}

// Fetch all initial data
export async function fetchInitialData() {
  setLoading(true);
  await Promise.all([
    fetchRounds(state.currentLimit),
    fetchStats(),
    fetchHourlyAnalysis(),
    fetchHouseProfit(),
    fetchAdvancedStats(),
  ]);
  setLoading(false);
}

// Process a new round from WebSocket
export function processNewRound(round: RoundData) {
  addRound(round);

  // Get all rounds including the new one
  const allRounds = [round, ...state.rounds.slice(0, 499)];

  // Use the ML sync system to wait for the correct prediction before processing bot
  // This ensures the bot uses the prediction for the NEXT round, not the current one
  onNewRoundArrived(round, allRounds);

  // Refresh stats when new round arrives
  fetchStats();
  fetchHourlyAnalysis();
  fetchHouseProfit();
  fetchAdvancedStats();
}
