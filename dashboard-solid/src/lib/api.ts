// API functions for live betting integration

// In development, Vite proxy handles /api -> localhost:3001
// In production, configure your server to route /api appropriately
const API_BASE_URL = '';

// Response types
export interface LiveBetResponse {
  success: boolean;
  error?: string;
}

export interface PlatformBalanceResponse {
  success: boolean;
  balance?: number;
  error?: string;
}

export interface PlatformHistoryItem {
  isWin: boolean;
  cashoutMultiplier: number;
  winAmount: number;
  betAmount: number;
  timestamp: number;
}

export interface PlatformHistoryResponse {
  success: boolean;
  history?: PlatformHistoryItem[];
  error?: string;
}

// Enable/disable live betting mode in the backend
export async function enableLiveBetting(enabled: boolean): Promise<LiveBetResponse> {
  const url = `${API_BASE_URL}/api/live-betting/enable`;
  console.log(`[API] Calling ${url} with enabled=${enabled}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });

    console.log(`[API] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`[API] Response error body:`, text);
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }

    const result = await response.json();
    console.log(`[API] Response:`, result);
    return result;
  } catch (err) {
    console.error('[API] Error enabling live betting:', err);
    return { success: false, error: String(err) };
  }
}

// Place a real bet on the platform
export async function placeLiveBet(
  amount1: number,
  cashout1: number,
  amount2: number,
  cashout2: number
): Promise<LiveBetResponse> {
  try {
    console.log(`[API] Placing live bet: R$${amount1} @ ${cashout1}x + R$${amount2} @ ${cashout2}x`);

    const response = await fetch(`${API_BASE_URL}/api/live-betting/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount1,
        cashout1,
        amount2,
        cashout2,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      console.error('[API] Live bet failed:', result.error);
    }

    return result;
  } catch (err) {
    console.error('[API] Error placing live bet:', err);
    return { success: false, error: String(err) };
  }
}

// Fetch platform balance
export async function fetchPlatformBalance(): Promise<PlatformBalanceResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/live-betting/balance`);
    return await response.json();
  } catch (err) {
    console.error('[API] Error fetching platform balance:', err);
    return { success: false, error: String(err) };
  }
}

// Fetch betting history from platform
export async function fetchPlatformHistory(limit: number = 10): Promise<PlatformHistoryResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/live-betting/history?limit=${limit}`);
    return await response.json();
  } catch (err) {
    console.error('[API] Error fetching platform history:', err);
    return { success: false, error: String(err) };
  }
}

// Utility: Add small randomization to cashout values (like original dashboard)
export function randomizeCashout(base: number, minOffset: number = 0.01, maxOffset: number = 0.05): number {
  const offset = minOffset + Math.random() * (maxOffset - minOffset);
  const sign = Math.random() > 0.5 ? 1 : -1;
  const result = base + sign * offset;
  return Math.max(1.01, Math.round(result * 100) / 100);
}

// ========== Bot History API ==========

export interface BotBetRecord {
  bot_id: string;
  session_id?: number;
  round_id?: number;
  timestamp: number;
  bet_amount: number;
  cashout1: number;
  cashout2: number;
  round_multiplier: number;
  won1: boolean;
  won2: boolean;
  profit: number;
  balance_after: number;
  is_high_opportunity: boolean;
  strategy_mode?: string;
  ml_confidence?: number;
}

export interface BotSessionStart {
  botId: string;
  initialBalance: number;
  strategyMode?: string;
}

export interface BotSessionEnd {
  sessionId: number;
  finalBalance: number;
  stats: {
    min_balance: number;
    max_balance: number;
    total_bets: number;
    wins: number;
    partials: number;
    losses: number;
    total_profit: number;
  };
}

// Save bot bet to database
export async function saveBotBet(bet: BotBetRecord): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bot/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bet),
    });
    return await response.json();
  } catch (err) {
    console.error('[API] Error saving bot bet:', err);
    return { success: false, error: String(err) };
  }
}

// Get bot betting history
export async function getBotBets(botId?: string, limit: number = 100): Promise<{ success: boolean; bets?: BotBetRecord[]; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (botId) params.append('botId', botId);
    params.append('limit', limit.toString());

    const response = await fetch(`${API_BASE_URL}/api/bot/bets?${params}`);
    return await response.json();
  } catch (err) {
    console.error('[API] Error fetching bot bets:', err);
    return { success: false, error: String(err) };
  }
}

// Get bot stats
export async function getBotStats(botId?: string): Promise<{ success: boolean; stats?: any; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (botId) params.append('botId', botId);

    const response = await fetch(`${API_BASE_URL}/api/bot/stats?${params}`);
    return await response.json();
  } catch (err) {
    console.error('[API] Error fetching bot stats:', err);
    return { success: false, error: String(err) };
  }
}

// Start bot session
export async function startBotSession(data: BotSessionStart): Promise<{ success: boolean; sessionId?: number; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bot/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (err) {
    console.error('[API] Error starting bot session:', err);
    return { success: false, error: String(err) };
  }
}

// End bot session
export async function endBotSession(data: BotSessionEnd): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bot/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (err) {
    console.error('[API] Error ending bot session:', err);
    return { success: false, error: String(err) };
  }
}

// Get bot performance analysis
export async function getBotPerformance(botId?: string, hours: number = 24): Promise<{ success: boolean; performance?: any[]; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (botId) params.append('botId', botId);
    params.append('hours', hours.toString());

    const response = await fetch(`${API_BASE_URL}/api/bot/performance?${params}`);
    return await response.json();
  } catch (err) {
    console.error('[API] Error fetching bot performance:', err);
    return { success: false, error: String(err) };
  }
}
