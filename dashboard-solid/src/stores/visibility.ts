import { createStore } from 'solid-js/store';

const STORAGE_KEY = 'crash_dashboard_visibility';

export interface VisibilityConfig {
  lastRound: boolean;
  statistics: boolean;
  sequences: boolean;
  houseProfit: boolean;
  distribution: boolean;
  hourlyAnalysis: boolean;
  roundsTable: boolean;
  favorability: boolean;
  momentum: boolean;
  successRates: boolean;
  recommendations: boolean;
  mlPredictions: boolean;
  simulator: boolean;
  bots: boolean;
}

const defaultConfig: VisibilityConfig = {
  lastRound: true,
  statistics: true,
  sequences: true,
  houseProfit: true,
  distribution: true,
  hourlyAnalysis: true,
  roundsTable: true,
  favorability: true,
  momentum: true,
  successRates: true,
  recommendations: true,
  mlPredictions: true,
  simulator: true,
  bots: true,
};

function loadConfig(): VisibilityConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...defaultConfig, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error loading visibility config:', e);
  }
  return defaultConfig;
}

function saveConfig(config: VisibilityConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving visibility config:', e);
  }
}

const [state, setState] = createStore<VisibilityConfig>(loadConfig());

export const visibilityStore = state;

export function setVisibility(key: keyof VisibilityConfig, visible: boolean) {
  setState(key, visible);
  saveConfig(state);
}

export function toggleVisibility(key: keyof VisibilityConfig) {
  setState(key, !state[key]);
  saveConfig(state);
}

export function resetVisibility() {
  setState(defaultConfig);
  saveConfig(defaultConfig);
}

export const visibilityLabels: Record<keyof VisibilityConfig, string> = {
  lastRound: 'Última Rodada',
  statistics: 'Estatísticas',
  sequences: 'Sequências',
  houseProfit: 'Lucro da Casa',
  distribution: 'Distribuição',
  hourlyAnalysis: 'Análise por Hora',
  roundsTable: 'Tabela de Rodadas',
  favorability: 'Score Favorabilidade',
  momentum: 'Momentum',
  successRates: 'Taxas de Sucesso',
  recommendations: 'Recomendações',
  mlPredictions: 'Predições ML',
  simulator: 'Simulador Manual',
  bots: 'Bots Automatizados',
};
