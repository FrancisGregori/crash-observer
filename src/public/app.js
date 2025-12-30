// ========== Estado Global ==========
let rounds = [];
let stats = {};
let hourlyData = {};
let houseProfitData = {};
let advancedStats = {};
let mlPrediction = null; // ML prediction state
let currentLimit = 50;
let currentPlatform = null; // null = all platforms, 'spinbetter', 'bet365'

// ========== Conexão com Observer ==========
let observerApiUrl = '';
let ws = null;

// ========== Estado do Simulador ==========
const SIMULATOR_STORAGE_KEY = 'crash_simulator_state';

let simulator = {
  balance: 100,
  initialBalance: 100,
  activeBet: null, // { mode: 'single'|'double', amount: number, cashout: number, cashout2?: number }
  history: [], // { id, timestamp, mode, amount, cashout, result, profit, balance }
  stats: {
    totalBets: 0,
    wins: 0,
    losses: 0,
    totalWagered: 0,
    totalProfit: 0
  },
  // Configurações de aposta (persistidas)
  config: {
    betMode: 'single', // 'single' ou 'double'
    betAmount: 10,
    betCashout: 2.00,
    betAmountDouble: 5,
    betCashout2: 5.00
  }
};

// Carrega estado do localStorage
function loadSimulatorState() {
  try {
    const saved = localStorage.getItem(SIMULATOR_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      simulator = { ...simulator, ...parsed };
      console.log('[Simulator] Estado carregado:', simulator);
    }
  } catch (e) {
    console.error('[Simulator] Erro ao carregar estado:', e);
  }
}

// Salva estado no localStorage
function saveSimulatorState() {
  try {
    localStorage.setItem(SIMULATOR_STORAGE_KEY, JSON.stringify(simulator));
  } catch (e) {
    console.error('[Simulator] Erro ao salvar estado:', e);
  }
}

// Atualiza UI do simulador com configurações salvas
function updateSimulatorConfigUI() {
  const config = simulator.config;
  if (!config) return;

  // Atualiza valores dos inputs
  if (elements.betAmount) elements.betAmount.value = config.betAmount;
  if (elements.betCashout) elements.betCashout.value = config.betCashout;
  if (elements.betAmountDouble) elements.betAmountDouble.value = config.betAmountDouble;
  if (elements.betCashout2) elements.betCashout2.value = config.betCashout2;

  // Atualiza modo de aposta (single/double)
  if (config.betMode === 'double') {
    const doubleBtn = document.querySelector('[data-mode="double"]');
    if (doubleBtn) doubleBtn.click();
  }
}

// Salva configuração do simulador quando valores mudam
function saveSimulatorConfig() {
  simulator.config = {
    betMode: currentBetMode || 'single',
    betAmount: parseFloat(elements.betAmount?.value) || 10,
    betCashout: parseFloat(elements.betCashout?.value) || 2.00,
    betAmountDouble: parseFloat(elements.betAmountDouble?.value) || 5,
    betCashout2: parseFloat(elements.betCashout2?.value) || 5.00
  };
  saveSimulatorState();
}

// ========== Elementos DOM ==========
const elements = {
  status: document.getElementById('status'),
  lastMultiplier: document.getElementById('lastMultiplier'),
  lastPlayers: document.getElementById('lastPlayers'),
  lastTotalBet: document.getElementById('lastTotalBet'),
  lastTotalWin: document.getElementById('lastTotalWin'),
  lastHouseProfit: document.getElementById('lastHouseProfit'),
  lastTime: document.getElementById('lastTime'),
  totalRounds: document.getElementById('totalRounds'),
  avgMultiplier: document.getElementById('avgMultiplier'),
  maxMultiplier: document.getElementById('maxMultiplier'),
  minMultiplier: document.getElementById('minMultiplier'),
  avgPlayers: document.getElementById('avgPlayers'),
  streakBelow2x: document.getElementById('streakBelow2x'),
  streakBelow5x: document.getElementById('streakBelow5x'),
  streakBelow10x: document.getElementById('streakBelow10x'),
  streakBelow15x: document.getElementById('streakBelow15x'),
  streakBelow20x: document.getElementById('streakBelow20x'),
  distributionChart: document.getElementById('distributionChart'),
  roundsGrid: document.getElementById('roundsGrid'),
  roundsTableBody: document.getElementById('roundsTableBody'),
  bestHours: document.getElementById('bestHours'),
  worstHours: document.getElementById('worstHours'),
  hourlyChart: document.getElementById('hourlyChart'),
  // Análise de horário atual
  currentHourBox: document.getElementById('currentHourBox'),
  currentHourValue: document.getElementById('currentHourValue'),
  currentHourRate: document.getElementById('currentHourRate'),
  currentHourVsGlobal: document.getElementById('currentHourVsGlobal'),
  currentHourRounds: document.getElementById('currentHourRounds'),
  currentHourRecommendation: document.getElementById('currentHourRecommendation'),
  globalSuccessRate: document.getElementById('globalSuccessRate'),
  // Ganho da casa por período
  profitCurrentHour: document.getElementById('profitCurrentHour'),
  profitLast3Hours: document.getElementById('profitLast3Hours'),
  profitLast6Hours: document.getElementById('profitLast6Hours'),
  profitLast24Hours: document.getElementById('profitLast24Hours'),
  profitAllTime: document.getElementById('profitAllTime'),
  roundsCurrentHour: document.getElementById('roundsCurrentHour'),
  roundsLast3Hours: document.getElementById('roundsLast3Hours'),
  roundsLast6Hours: document.getElementById('roundsLast6Hours'),
  roundsLast24Hours: document.getElementById('roundsLast24Hours'),
  roundsAllTime: document.getElementById('roundsAllTime'),
  // Análise avançada
  favorabilityCircle: document.getElementById('favorabilityCircle'),
  favorabilityScore: document.getElementById('favorabilityScore'),
  favorabilityStatus: document.getElementById('favorabilityStatus'),
  momentumStatus: document.getElementById('momentumStatus'),
  successRatesGrid: document.getElementById('successRatesGrid'),
  recommendationsList: document.getElementById('recommendationsList'),
  sequencesAnalysisGrid: document.getElementById('sequencesAnalysisGrid'),
  probabilitiesGrid: document.getElementById('probabilitiesGrid'),
  patternsGrid: document.getElementById('patternsGrid'),
  correlationsGrid: document.getElementById('correlationsGrid'),
  // Médias das sequências
  streakAvg2x: document.getElementById('streakAvg2x'),
  streakAvg5x: document.getElementById('streakAvg5x'),
  streakAvg10x: document.getElementById('streakAvg10x'),
  streakAvg15x: document.getElementById('streakAvg15x'),
  streakAvg20x: document.getElementById('streakAvg20x'),
  // Simulador de Apostas
  simBalance: document.getElementById('simBalance'),
  simReset: document.getElementById('simReset'),
  betForm: document.getElementById('betForm'),
  singleBetInputs: document.getElementById('singleBetInputs'),
  doubleBetInputs: document.getElementById('doubleBetInputs'),
  betAmount: document.getElementById('betAmount'),
  betCashout: document.getElementById('betCashout'),
  betAmountDouble: document.getElementById('betAmountDouble'),
  betCashout2: document.getElementById('betCashout2'),
  doubleBetTotal: document.getElementById('doubleBetTotal'),
  placeBetBtn: document.getElementById('placeBetBtn'),
  activeBet: document.getElementById('activeBet'),
  activeBetStatus: document.getElementById('activeBetStatus'),
  activeBetDetails: document.getElementById('activeBetDetails'),
  cancelBetBtn: document.getElementById('cancelBetBtn'),
  simTotalBets: document.getElementById('simTotalBets'),
  simWins: document.getElementById('simWins'),
  simProfit: document.getElementById('simProfit'),
  simROI: document.getElementById('simROI'),
  simHistoryList: document.getElementById('simHistoryList')
};

// ========== Utilitários ==========

/**
 * Formata número para moeda (R$)
 */
function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

/**
 * Formata número inteiro
 */
function formatNumber(value) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('pt-BR').format(value);
}

/**
 * Formata data/hora
 */
function formatTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Formata data completa
 */
function formatDateTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('pt-BR');
}

/**
 * Retorna classe CSS baseada no multiplicador
 */
function getMultiplierClass(multiplier) {
  if (multiplier < 1.5) return 'low';
  if (multiplier < 2.0) return 'medium';
  if (multiplier < 10) return 'high';
  return 'very-high';
}

/**
 * Calcula o ganho da casa (totalBet - totalWin)
 */
function calculateHouseProfit(round) {
  return round.totalBet - round.totalWin;
}

// ========== Renderização ==========

/**
 * Atualiza a última rodada
 */
function renderLastRound(round) {
  if (!round) return;

  const multiplierClass = getMultiplierClass(round.multiplier);
  elements.lastMultiplier.textContent = `${round.multiplier.toFixed(2)}x`;
  elements.lastMultiplier.className = `multiplier-display ${multiplierClass}`;

  elements.lastPlayers.textContent = formatNumber(round.betCount);
  elements.lastTotalBet.textContent = formatCurrency(round.totalBet);
  elements.lastTotalWin.textContent = formatCurrency(round.totalWin);
  elements.lastTime.textContent = formatTime(round.createdAt);

  // Ganho da casa
  const houseProfit = calculateHouseProfit(round);
  const profitClass = houseProfit >= 0 ? 'profit-positive' : 'profit-negative';
  elements.lastHouseProfit.textContent = formatCurrency(houseProfit);
  elements.lastHouseProfit.className = `value ${profitClass}`;
}

/**
 * Atualiza estatísticas
 */
function renderStats() {
  elements.totalRounds.textContent = formatNumber(stats.totalRounds);
  elements.avgMultiplier.textContent = `${stats.avgMultiplier?.toFixed(2) || '-'}x`;
  elements.maxMultiplier.textContent = `${stats.maxMultiplier?.toFixed(2) || '-'}x`;
  elements.minMultiplier.textContent = `${stats.minMultiplier?.toFixed(2) || '-'}x`;
  elements.avgPlayers.textContent = formatNumber(stats.bettingStats?.avgPlayers);

  // Sequências
  if (stats.streaks) {
    elements.streakBelow2x.textContent = stats.streaks.below2x || '0';
    elements.streakBelow5x.textContent = stats.streaks.below5x || '0';
    elements.streakBelow10x.textContent = stats.streaks.below10x || '0';
    elements.streakBelow15x.textContent = stats.streaks.below15x || '0';
    elements.streakBelow20x.textContent = stats.streaks.below20x || '0';
  }
}

/**
 * Renderiza gráfico de distribuição
 */
function renderDistribution() {
  if (!stats.distribution || !stats.distribution.length) {
    elements.distributionChart.innerHTML = '<p style="color: var(--text-secondary);">Sem dados suficientes</p>';
    return;
  }

  const total = stats.distribution.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(...stats.distribution.map(d => d.count));

  elements.distributionChart.innerHTML = stats.distribution.map(d => {
    const percent = total > 0 ? ((d.count / total) * 100).toFixed(1) : 0;
    const barHeight = maxCount > 0 ? (d.count / maxCount) * 100 : 0;

    return `
      <div class="dist-bar">
        <div class="range">${d.range}</div>
        <div class="bar-container">
          <div class="bar" style="height: ${barHeight}%"></div>
        </div>
        <div class="count">${formatNumber(d.count)}</div>
        <div class="percent">${percent}%</div>
      </div>
    `;
  }).join('');
}

/**
 * Renderiza análise de horários (focada na estratégia 2x)
 */
function renderHourlyAnalysis() {
  if (!hourlyData.hourly || !hourlyData.hourly.length) {
    elements.bestHours.innerHTML = '<p style="color: var(--text-secondary);">Coletando dados...</p>';
    elements.worstHours.innerHTML = '<p style="color: var(--text-secondary);">Coletando dados...</p>';
    elements.hourlyChart.innerHTML = '<p style="color: var(--text-secondary);">Coletando dados...</p>';
    return;
  }

  // Taxa global de sucesso
  if (hourlyData.globalSuccessRate2x !== undefined) {
    elements.globalSuccessRate.textContent = `${hourlyData.globalSuccessRate2x}%`;
  }

  // Análise do horário atual
  if (hourlyData.currentHourAnalysis) {
    const current = hourlyData.currentHourAnalysis;

    elements.currentHourValue.textContent = current.hourLabel;
    elements.currentHourRate.textContent = `${current.successRate2x}%`;
    elements.currentHourRounds.textContent = current.rounds;

    // vs Global com cor
    const vsGlobalEl = elements.currentHourVsGlobal;
    vsGlobalEl.textContent = `${current.vsGlobal > 0 ? '+' : ''}${current.vsGlobal}%`;
    vsGlobalEl.className = `stat-value ${current.vsGlobal >= 0 ? 'positive' : 'negative'}`;

    // Recomendação
    elements.currentHourRecommendation.textContent = current.recommendation;

    // Estilo do box baseado na recomendação
    const boxClass = current.vsGlobal >= 5 ? 'favorable' : current.vsGlobal <= -5 ? 'unfavorable' : '';
    elements.currentHourBox.className = `current-hour-box ${boxClass}`;
    elements.currentHourRecommendation.className = `current-hour-recommendation ${boxClass}`;
  } else {
    // Horário atual sem dados ainda
    const currentHour = new Date().getHours();
    elements.currentHourValue.textContent = `${currentHour.toString().padStart(2, '0')}:00`;
    elements.currentHourRate.textContent = '--';
    elements.currentHourRounds.textContent = '0';
    elements.currentHourVsGlobal.textContent = '--';
    elements.currentHourRecommendation.textContent = 'Coletando dados para este horário...';
  }

  // Melhores horários (maior taxa de sucesso em 2x)
  if (hourlyData.bestHoursForPlayer && hourlyData.bestHoursForPlayer.length) {
    elements.bestHours.innerHTML = hourlyData.bestHoursForPlayer.map(h => `
      <div class="hourly-item">
        <span class="hour">${h.hourLabel}</span>
        <span class="multiplier" style="color: var(--green);">${h.successRate2x}%</span>
        <span class="vs-global" style="color: ${h.vsGlobal >= 0 ? 'var(--green)' : 'var(--red)'}; font-size: 0.75rem;">
          (${h.vsGlobal > 0 ? '+' : ''}${h.vsGlobal}%)
        </span>
        <span class="rounds">${h.rounds} rodadas</span>
      </div>
    `).join('');
  }

  // Piores horários (menor taxa de sucesso em 2x)
  if (hourlyData.worstHoursForPlayer && hourlyData.worstHoursForPlayer.length) {
    elements.worstHours.innerHTML = hourlyData.worstHoursForPlayer.map(h => `
      <div class="hourly-item">
        <span class="hour">${h.hourLabel}</span>
        <span class="multiplier" style="color: var(--red);">${h.successRate2x}%</span>
        <span class="vs-global" style="color: ${h.vsGlobal >= 0 ? 'var(--green)' : 'var(--red)'}; font-size: 0.75rem;">
          (${h.vsGlobal > 0 ? '+' : ''}${h.vsGlobal}%)
        </span>
        <span class="rounds">${h.rounds} rodadas</span>
      </div>
    `).join('');
  }

  // Gráfico de barras por hora (baseado em taxa de sucesso 2x)
  if (hourlyData.hourly && hourlyData.hourly.length) {
    const maxRate = Math.max(...hourlyData.hourly.map(h => h.successRate2x || 0));
    const globalRate = hourlyData.globalSuccessRate2x || 0;

    // Cria array de 24 horas (preenchendo gaps com zero)
    const hours24 = Array.from({ length: 24 }, (_, i) => {
      const found = hourlyData.hourly.find(h => h.hour === i);
      return found || {
        hour: i,
        hourLabel: `${i.toString().padStart(2, '0')}:00`,
        successRate2x: 0,
        rounds: 0
      };
    });

    elements.hourlyChart.innerHTML = hours24.map(h => {
      const barHeight = maxRate > 0 ? ((h.successRate2x || 0) / maxRate) * 100 : 0;
      const barClass = (h.successRate2x || 0) >= globalRate ? 'good' : ((h.successRate2x || 0) > 0 ? 'bad' : '');
      const isCurrentHour = h.hour === hourlyData.currentHour;

      return `
        <div class="hour-bar ${isCurrentHour ? 'current' : ''}" title="${h.hourLabel}: ${h.successRate2x || 0}% de sucesso em 2x (${h.rounds} rodadas)">
          <div class="bar ${barClass}" style="height: ${barHeight}%"></div>
          <span class="hour-label">${h.hour}</span>
        </div>
      `;
    }).join('');
  }
}

/**
 * Renderiza ganho da casa por período
 */
function renderHouseProfit() {
  if (!houseProfitData || !houseProfitData.currentHour) {
    return;
  }

  const renderPeriod = (valueEl, roundsEl, data) => {
    const profitClass = data.houseProfit >= 0 ? 'positive' : 'negative';
    valueEl.textContent = formatCurrency(data.houseProfit);
    valueEl.className = `period-value ${profitClass}`;
    roundsEl.textContent = `${data.rounds} rodadas`;
  };

  renderPeriod(elements.profitCurrentHour, elements.roundsCurrentHour, houseProfitData.currentHour);
  renderPeriod(elements.profitLast3Hours, elements.roundsLast3Hours, houseProfitData.last3Hours);
  renderPeriod(elements.profitLast6Hours, elements.roundsLast6Hours, houseProfitData.last6Hours);
  renderPeriod(elements.profitLast24Hours, elements.roundsLast24Hours, houseProfitData.last24Hours);
  renderPeriod(elements.profitAllTime, elements.roundsAllTime, houseProfitData.allTime);
}

/**
 * Renderiza grid de rodadas (chips)
 */
function renderRoundsGrid(isNewRound = false) {
  const displayRounds = rounds.slice(0, currentLimit);

  elements.roundsGrid.innerHTML = displayRounds.map((round, index) => {
    const multiplierClass = getMultiplierClass(round.multiplier);
    const isNew = isNewRound && index === 0;

    return `
      <div class="round-chip ${multiplierClass} ${isNew ? 'new' : ''}"
           title="${formatDateTime(round.createdAt)}">
        ${round.multiplier.toFixed(2)}x
      </div>
    `;
  }).join('');
}

/**
 * Renderiza tabela detalhada
 */
function renderTable() {
  const displayRounds = rounds.slice(0, currentLimit);

  elements.roundsTableBody.innerHTML = displayRounds.map(round => {
    const multiplierClass = getMultiplierClass(round.multiplier);
    const houseProfit = calculateHouseProfit(round);
    const profitClass = houseProfit >= 0 ? 'positive' : 'negative';

    return `
      <tr>
        <td>#${round.id}</td>
        <td>${formatDateTime(round.createdAt)}</td>
        <td class="multiplier-cell ${multiplierClass}">${round.multiplier.toFixed(2)}x</td>
        <td>${formatNumber(round.betCount)}</td>
        <td>${formatCurrency(round.totalBet)}</td>
        <td>${formatCurrency(round.totalWin)}</td>
        <td class="house-profit ${profitClass}">${formatCurrency(houseProfit)}</td>
      </tr>
    `;
  }).join('');
}

// ========== API ==========

/**
 * Busca rodadas da API
 */
async function fetchRounds() {
  try {
    let url = `${observerApiUrl}/api/rounds?limit=${currentLimit}`;
    if (currentPlatform) {
      url += `&platform=${currentPlatform}`;
    }
    const response = await fetch(url);
    rounds = await response.json();
    renderRoundsGrid();
    renderTable();
    if (rounds.length > 0) {
      renderLastRound(rounds[0]);
    }
  } catch (err) {
    console.error('Erro ao buscar rodadas:', err);
  }
}

/**
 * Busca estatísticas da API
 */
async function fetchStats() {
  try {
    let url = `${observerApiUrl}/api/stats`;
    if (currentPlatform) {
      url += `?platform=${currentPlatform}`;
    }
    const response = await fetch(url);
    stats = await response.json();
    renderStats();
    renderDistribution();
  } catch (err) {
    console.error('Erro ao buscar estatísticas:', err);
  }
}

/**
 * Busca análise de horários da API
 */
async function fetchHourlyAnalysis() {
  try {
    const response = await fetch(`${observerApiUrl}/api/hourly`);
    hourlyData = await response.json();
    renderHourlyAnalysis();
  } catch (err) {
    console.error('Erro ao buscar análise de horários:', err);
  }
}

/**
 * Busca ganho da casa por período da API
 */
async function fetchHouseProfit() {
  try {
    const response = await fetch(`${observerApiUrl}/api/house-profit`);
    houseProfitData = await response.json();
    renderHouseProfit();
  } catch (err) {
    console.error('Erro ao buscar ganho da casa:', err);
  }
}

/**
 * Busca análise avançada da API
 */
async function fetchAdvancedStats() {
  try {
    const response = await fetch(`${observerApiUrl}/api/advanced`);
    advancedStats = await response.json();
    console.log('[DEBUG] advancedStats:', advancedStats);
    renderAdvancedStats();

    // Atualiza análise dos bots quando novos dados chegam
    updateBotDecision('bot1');
    updateBotDecision('bot2');
  } catch (err) {
    console.error('Erro ao buscar análise avançada:', err);
  }
}

/**
 * Renderiza análise avançada
 */
function renderAdvancedStats() {
  // Verifica se há erro ou dados insuficientes
  if (!advancedStats || advancedStats.error) {
    const minRequired = advancedStats?.minRequired || 10;
    const current = advancedStats?.current || 0;
    elements.favorabilityScore.textContent = '-';
    elements.favorabilityStatus.textContent = `Necessário: ${minRequired} rodadas (atual: ${current})`;
    elements.recommendationsList.innerHTML = `<p class="no-data">Coletando dados... (${current}/${minRequired} rodadas)</p>`;
    return;
  }

  // Score de Favorabilidade
  const score = advancedStats.favorabilityScore || 50;
  elements.favorabilityScore.textContent = score;

  const level = advancedStats.favorabilityLevel || 'medium';
  const statusText = level === 'high' ? 'Favorável' : level === 'low' ? 'Desfavorável' : 'Neutro';
  elements.favorabilityStatus.textContent = statusText;

  // Cor do círculo baseada no score
  let circleClass = 'neutral';
  if (score >= 70) circleClass = 'favorable';
  else if (score <= 30) circleClass = 'unfavorable';
  elements.favorabilityCircle.className = `score-circle ${circleClass}`;

  // Momentum
  if (advancedStats.momentum) {
    const momentum = advancedStats.momentum;
    let momentumClass = 'neutral';
    let trendText = 'ESTÁVEL';

    if (momentum.momentumStatus === 'hot') {
      momentumClass = 'positive';
      trendText = 'ALTA';
    } else if (momentum.momentumStatus === 'cold') {
      momentumClass = 'negative';
      trendText = 'BAIXA';
    }

    elements.momentumStatus.textContent = `${trendText} (${momentum.avgLast10}x vs ${momentum.avgMultiplierAll}x)`;
    elements.momentumStatus.className = `momentum-value ${momentumClass}`;
  }

  // Taxas de Sucesso por Cashout
  if (advancedStats.successRates) {
    const rates = advancedStats.successRates;
    const order = ['2x', '3x', '5x', '10x'];

    elements.successRatesGrid.innerHTML = order.map(key => {
      const data = rates[key];
      if (!data) return '';

      const rate = data.rate;
      let rateClass = 'high';
      if (rate < 15) rateClass = 'very-low';
      else if (rate < 30) rateClass = 'low';
      else if (rate < 50) rateClass = 'medium';

      // Destaca 2x como a estratégia principal
      const isHighlight = key === '2x';

      return `
        <div class="success-rate-card ${isHighlight ? 'highlight' : ''}">
          <span class="rate-multiplier">${key}</span>
          <span class="rate-value ${rateClass}">${rate}%</span>
          <span class="rate-rounds">~${data.avgRounds || '-'} rodadas</span>
          <span class="rate-desc">${data.description}</span>
        </div>
      `;
    }).join('');
  }

  // Recomendações
  if (advancedStats.recommendations && advancedStats.recommendations.length) {
    elements.recommendationsList.innerHTML = advancedStats.recommendations.map(rec => {
      let icon = '💡';
      let typeClass = 'info';
      if (rec.priority === 'high') { icon = '🎯'; typeClass = 'success'; }
      else if (rec.type === 'momentum') { icon = '📊'; typeClass = 'warning'; }
      else if (rec.type === 'timing') { icon = '⏰'; typeClass = 'info'; }
      else if (rec.type === 'strategy') { icon = '🎲'; typeClass = 'info'; }

      return `
        <div class="recommendation-item ${typeClass}">
          <span class="rec-icon">${icon}</span>
          <span class="rec-text">${rec.message}</span>
        </div>
      `;
    }).join('');
  } else {
    elements.recommendationsList.innerHTML = '<p class="no-data">Coletando dados para gerar recomendações...</p>';
  }

  // Análise de Sequências (converte objeto para array)
  if (advancedStats.sequenceAnalysis) {
    const sequences = Object.values(advancedStats.sequenceAnalysis);

    elements.sequencesAnalysisGrid.innerHTML = sequences.map(seq => {
      let statusClass = 'normal';
      if (seq.status === 'overdue') statusClass = 'overdue';
      else if (seq.status === 'due') statusClass = 'due';

      const ratio = seq.deviationRatio;
      const ratioText = ratio > 1 ? `${ratio.toFixed(1)}x acima` : ratio < 1 ? `${(1/ratio).toFixed(1)}x abaixo` : 'na média';

      return `
        <div class="sequence-card ${statusClass}">
          <div class="seq-header">
            <span class="seq-threshold">${seq.threshold}x</span>
            <span class="seq-status">${seq.status === 'overdue' ? 'ATRASADO' : seq.status === 'due' ? 'PRÓXIMO' : 'NORMAL'}</span>
          </div>
          <div class="seq-body">
            <div class="seq-current">
              <span class="seq-label">Atual</span>
              <span class="seq-value">${seq.currentStreak}</span>
            </div>
            <div class="seq-avg">
              <span class="seq-label">Média</span>
              <span class="seq-value">${seq.avgRoundsToHit}</span>
            </div>
          </div>
          <div class="seq-ratio">${ratioText}</div>
        </div>
      `;
    }).join('');

    // Atualiza as médias nos cards de sequência simples
    sequences.forEach(seq => {
      const thresholdMap = {
        2: 'streakAvg2x',
        5: 'streakAvg5x',
        10: 'streakAvg10x',
        15: 'streakAvg15x',
        20: 'streakAvg20x'
      };
      const el = elements[thresholdMap[seq.threshold]];
      if (el) {
        el.textContent = `média: ${seq.avgRoundsToHit}`;
      }
    });
  }

  // Probabilidades (converte objeto para array)
  if (advancedStats.probabilities) {
    const probs = Object.values(advancedStats.probabilities);

    elements.probabilitiesGrid.innerHTML = probs.map(prob => {
      const percent = prob.probability;
      let colorClass = 'high';
      if (percent < 10) colorClass = 'very-low';
      else if (percent < 30) colorClass = 'low';
      else if (percent < 50) colorClass = 'medium';

      return `
        <div class="probability-card">
          <span class="prob-threshold">≥ ${prob.threshold}x</span>
          <span class="prob-value ${colorClass}">${percent}%</span>
          <span class="prob-hits">${prob.timesHit}/${advancedStats.totalRounds}</span>
        </div>
      `;
    }).join('');
  }

  // Padrões (converte objeto para array)
  if (advancedStats.patterns) {
    const patterns = Object.entries(advancedStats.patterns).map(([key, pattern]) => ({
      key,
      ...pattern
    })).filter(p => p.successRate !== null && p.sample > 0);

    if (patterns.length > 0) {
      elements.patternsGrid.innerHTML = patterns.map(pattern => {
        const successRate = pattern.successRate;
        let rateClass = 'low';
        if (successRate >= 50) rateClass = 'high';
        else if (successRate >= 30) rateClass = 'medium';

        return `
          <div class="pattern-card">
            <div class="pattern-name">${pattern.description}</div>
            <div class="pattern-stats">
              <span class="pattern-rate ${rateClass}">${successRate}%</span>
              <span class="pattern-sample">${pattern.sample} ocorrências</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      elements.patternsGrid.innerHTML = '<p class="no-data">Coletando dados para detectar padrões...</p>';
    }
  }

  // Correlações
  if (advancedStats.correlations) {
    const corr = advancedStats.correlations;

    // Calcula diferença percentual para mostrar correlação
    const playersDiff = corr.playersVsMultiplier.avgMultHighPlayers - corr.playersVsMultiplier.avgMultLowPlayers;
    const betsDiff = corr.betsVsMultiplier.avgMultHighBets - corr.betsVsMultiplier.avgMultLowBets;

    elements.correlationsGrid.innerHTML = `
      <div class="correlation-card">
        <span class="corr-name">Jogadores vs Multiplicador</span>
        <span class="corr-value ${playersDiff > 0 ? 'positive' : playersDiff < 0 ? 'negative' : 'weak'}">
          ${playersDiff > 0 ? '+' : ''}${playersDiff.toFixed(2)}x
        </span>
        <span class="corr-desc">${corr.playersVsMultiplier.insight}</span>
      </div>
      <div class="correlation-card">
        <span class="corr-name">Apostas vs Multiplicador</span>
        <span class="corr-value ${betsDiff > 0 ? 'positive' : betsDiff < 0 ? 'negative' : 'weak'}">
          ${betsDiff > 0 ? '+' : ''}${betsDiff.toFixed(2)}x
        </span>
        <span class="corr-desc">${corr.betsVsMultiplier.insight}</span>
      </div>
    `;
  }
}

/**
 * Helpers para correlações
 */
function formatCorrelation(value) {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function getCorrelationClass(value) {
  if (value === null || value === undefined) return '';
  if (Math.abs(value) < 0.1) return 'weak';
  if (value > 0) return 'positive';
  return 'negative';
}

function getCorrelationDesc(value) {
  if (value === null || value === undefined) return 'Dados insuficientes';
  if (Math.abs(value) < 0.1) return 'Correlação fraca';
  if (Math.abs(value) < 0.3) return 'Correlação moderada';
  return 'Correlação forte';
}

// ========== Simulador de Apostas ==========

let currentBetMode = 'single';

/**
 * Renderiza o estado atual do simulador
 */
function renderSimulator() {
  // Banca
  elements.simBalance.textContent = formatCurrency(simulator.balance);
  elements.simBalance.className = `balance-value ${simulator.balance >= simulator.initialBalance ? 'positive' : 'negative'}`;

  // Estatísticas
  const { stats: simStats } = simulator;
  elements.simTotalBets.textContent = simStats.totalBets;

  const winRate = simStats.totalBets > 0 ? ((simStats.wins / simStats.totalBets) * 100).toFixed(1) : 0;
  elements.simWins.textContent = `${simStats.wins} (${winRate}%)`;

  const profitClass = simStats.totalProfit >= 0 ? 'positive' : 'negative';
  elements.simProfit.textContent = formatCurrency(simStats.totalProfit);
  elements.simProfit.className = `sim-stat-value ${profitClass}`;

  const roi = simStats.totalWagered > 0 ? ((simStats.totalProfit / simStats.totalWagered) * 100).toFixed(1) : 0;
  elements.simROI.textContent = `${roi}%`;
  elements.simROI.className = `sim-stat-value ${parseFloat(roi) >= 0 ? 'positive' : 'negative'}`;

  // Aposta ativa
  if (simulator.activeBet) {
    elements.betForm.classList.add('hidden');
    elements.activeBet.classList.remove('hidden');
    renderActiveBet();
  } else {
    elements.betForm.classList.remove('hidden');
    elements.activeBet.classList.add('hidden');
  }

  // Histórico
  renderSimHistory();

  // Total aposta dupla
  updateDoubleBetTotal();
}

/**
 * Renderiza a aposta ativa
 */
function renderActiveBet() {
  const bet = simulator.activeBet;
  if (!bet) return;

  elements.activeBetStatus.textContent = 'Aguardando rodada...';

  if (bet.mode === 'single') {
    elements.activeBetDetails.innerHTML = `
      <div class="active-bet-row">
        <span>Valor:</span>
        <span>${formatCurrency(bet.amount)}</span>
      </div>
      <div class="active-bet-row">
        <span>Cashout:</span>
        <span>${bet.cashout.toFixed(2)}x</span>
      </div>
      <div class="active-bet-row potential">
        <span>Ganho Potencial:</span>
        <span>${formatCurrency(bet.amount * bet.cashout)}</span>
      </div>
    `;
  } else {
    elements.activeBetDetails.innerHTML = `
      <div class="active-bet-row">
        <span>Aposta 1:</span>
        <span>${formatCurrency(bet.amount)} @ ${bet.cashout.toFixed(2)}x</span>
      </div>
      <div class="active-bet-row">
        <span>Aposta 2:</span>
        <span>${formatCurrency(bet.amount)} @ ${bet.cashout2.toFixed(2)}x</span>
      </div>
      <div class="active-bet-row">
        <span>Total Apostado:</span>
        <span>${formatCurrency(bet.amount * 2)}</span>
      </div>
      <div class="active-bet-row potential">
        <span>Ganho Máximo:</span>
        <span>${formatCurrency(bet.amount * bet.cashout + bet.amount * bet.cashout2)}</span>
      </div>
    `;
  }
}

/**
 * Renderiza o histórico de apostas
 */
function renderSimHistory() {
  if (simulator.history.length === 0) {
    elements.simHistoryList.innerHTML = '<p class="no-history">Nenhuma aposta ainda</p>';
    return;
  }

  // Mostra as últimas 20 apostas (mais recentes primeiro)
  const recent = simulator.history.slice(-20).reverse();

  elements.simHistoryList.innerHTML = recent.map(h => {
    const resultClass = h.profit >= 0 ? 'win' : 'loss';
    const resultText = h.profit >= 0 ? 'GANHOU' : 'PERDEU';
    const modeText = h.mode === 'single' ? 'Simples' : 'Dupla';

    return `
      <div class="history-item ${resultClass}">
        <div class="history-main">
          <span class="history-result">${resultText}</span>
          <span class="history-multiplier">${h.result.toFixed(2)}x</span>
        </div>
        <div class="history-details">
          <span class="history-mode">${modeText}</span>
          <span class="history-amount">${formatCurrency(h.amount)}</span>
          <span class="history-profit ${resultClass}">${h.profit >= 0 ? '+' : ''}${formatCurrency(h.profit)}</span>
        </div>
        <div class="history-time">${formatTime(h.timestamp)}</div>
      </div>
    `;
  }).join('');
}

/**
 * Atualiza o total da aposta dupla
 */
function updateDoubleBetTotal() {
  const amount = parseFloat(elements.betAmountDouble.value) || 0;
  elements.doubleBetTotal.textContent = formatCurrency(amount * 2);
}

/**
 * Coloca uma aposta
 */
function placeBet() {
  if (simulator.activeBet) {
    console.warn('[Simulator] Já existe uma aposta ativa');
    return;
  }

  let amount, cashout, cashout2;

  if (currentBetMode === 'single') {
    amount = parseFloat(elements.betAmount.value) || 0;
    cashout = parseFloat(elements.betCashout.value) || 2;

    if (amount <= 0) {
      alert('Valor da aposta inválido');
      return;
    }

    if (amount > simulator.balance) {
      alert('Saldo insuficiente');
      return;
    }

    if (cashout < 1.01) {
      alert('Cashout mínimo é 1.01x');
      return;
    }

    simulator.activeBet = { mode: 'single', amount, cashout };
    simulator.balance -= amount;

  } else {
    amount = parseFloat(elements.betAmountDouble.value) || 0;
    cashout = 2.17; // Primeira aposta ~2.17x (tempo de reação)
    cashout2 = parseFloat(elements.betCashout2.value) || 5;

    const totalAmount = amount * 2;

    if (amount <= 0) {
      alert('Valor da aposta inválido');
      return;
    }

    if (totalAmount > simulator.balance) {
      alert('Saldo insuficiente para aposta dupla');
      return;
    }

    if (cashout2 < 2.01) {
      alert('Cashout da segunda aposta deve ser maior que 2x');
      return;
    }

    simulator.activeBet = { mode: 'double', amount, cashout, cashout2 };
    simulator.balance -= totalAmount;
  }

  console.log('[Simulator] Aposta colocada:', simulator.activeBet);
  saveSimulatorState();
  renderSimulator();
}

/**
 * Cancela a aposta ativa (devolve o valor)
 */
function cancelBet() {
  if (!simulator.activeBet) return;

  const bet = simulator.activeBet;
  const refund = bet.mode === 'single' ? bet.amount : bet.amount * 2;

  simulator.balance += refund;
  simulator.activeBet = null;

  console.log('[Simulator] Aposta cancelada, devolvido:', formatCurrency(refund));
  saveSimulatorState();
  renderSimulator();
}

/**
 * Reseta o simulador para o estado inicial
 */
function resetSimulator() {
  if (!confirm('Tem certeza que deseja resetar o simulador? Todo o histórico será perdido.')) {
    return;
  }

  simulator = {
    balance: 100,
    initialBalance: 100,
    activeBet: null,
    history: [],
    stats: {
      totalBets: 0,
      wins: 0,
      losses: 0,
      totalWagered: 0,
      totalProfit: 0
    }
  };

  saveSimulatorState();
  renderSimulator();
  console.log('[Simulator] Resetado');
}

/**
 * Resolve a aposta ativa com o resultado da rodada
 */
function resolveActiveBet(roundMultiplier) {
  if (!simulator.activeBet) return;

  const bet = simulator.activeBet;
  let profit = 0;
  let won = false;

  if (bet.mode === 'single') {
    // Aposta simples: ganha se multiplicador >= cashout
    if (roundMultiplier >= bet.cashout) {
      profit = bet.amount * bet.cashout - bet.amount;
      simulator.balance += bet.amount * bet.cashout;
      won = true;
    } else {
      profit = -bet.amount;
    }

  } else {
    // Aposta dupla
    const totalBet = bet.amount * 2;
    let winnings = 0;

    // Aposta 1 (cashout em ~2.17x - tempo de reação)
    if (roundMultiplier >= bet.cashout) {
      winnings += bet.amount * bet.cashout;
    }

    // Aposta 2 (cashout no valor configurado)
    if (roundMultiplier >= bet.cashout2) {
      winnings += bet.amount * bet.cashout2;
    }

    profit = winnings - totalBet;
    simulator.balance += winnings;

    // Considera "ganho" se teve qualquer retorno positivo
    won = profit > 0;
  }

  // Atualiza estatísticas
  simulator.stats.totalBets++;
  simulator.stats.totalWagered += bet.mode === 'single' ? bet.amount : bet.amount * 2;
  simulator.stats.totalProfit += profit;

  if (won) {
    simulator.stats.wins++;
  } else {
    simulator.stats.losses++;
  }

  // Adiciona ao histórico
  simulator.history.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    mode: bet.mode,
    amount: bet.mode === 'single' ? bet.amount : bet.amount * 2,
    cashout: bet.cashout,
    cashout2: bet.cashout2,
    result: roundMultiplier,
    profit,
    balance: simulator.balance
  });

  console.log(`[Simulator] Aposta resolvida: ${won ? 'GANHOU' : 'PERDEU'} | Multiplicador: ${roundMultiplier}x | Lucro: ${formatCurrency(profit)}`);

  // Limpa aposta ativa
  simulator.activeBet = null;

  saveSimulatorState();
  renderSimulator();
}

/**
 * Alterna entre modo de aposta simples e dupla
 */
function setBetMode(mode) {
  currentBetMode = mode;

  // Atualiza botões
  document.querySelectorAll('.bet-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Mostra/esconde inputs
  if (mode === 'single') {
    elements.singleBetInputs.classList.remove('hidden');
    elements.doubleBetInputs.classList.add('hidden');
  } else {
    elements.singleBetInputs.classList.add('hidden');
    elements.doubleBetInputs.classList.remove('hidden');
  }

  // Salva configuração
  saveSimulatorConfig();
}

/**
 * Configura event listeners do simulador
 */
function setupSimulatorEvents() {
  // Toggle de modo
  document.querySelectorAll('.bet-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setBetMode(btn.dataset.mode));
  });

  // Botão apostar
  elements.placeBetBtn.addEventListener('click', placeBet);

  // Botão cancelar
  elements.cancelBetBtn.addEventListener('click', cancelBet);

  // Botão resetar
  elements.simReset.addEventListener('click', resetSimulator);

  // Quick buttons - valor (single)
  elements.singleBetInputs.querySelectorAll('.quick-btn[data-mult]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mult = parseFloat(btn.dataset.mult);
      const current = parseFloat(elements.betAmount.value) || 10;
      elements.betAmount.value = Math.max(1, Math.floor(current * mult));
      saveSimulatorConfig();
    });
  });

  elements.singleBetInputs.querySelectorAll('.quick-btn[data-set="max"]').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.betAmount.value = Math.floor(simulator.balance);
      saveSimulatorConfig();
    });
  });

  // Quick buttons - cashout (single)
  elements.singleBetInputs.querySelectorAll('.quick-btn[data-cashout]').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.betCashout.value = btn.dataset.cashout;
      saveSimulatorConfig();
    });
  });

  // Quick buttons - valor (double)
  elements.doubleBetInputs.querySelectorAll('.quick-btn[data-mult]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mult = parseFloat(btn.dataset.mult);
      const current = parseFloat(elements.betAmountDouble.value) || 5;
      const newValue = Math.max(1, Math.floor(current * mult));
      elements.betAmountDouble.value = newValue;
      updateDoubleBetTotal();
      saveSimulatorConfig();
    });
  });

  // Quick buttons - cashout2 (double)
  elements.doubleBetInputs.querySelectorAll('.quick-btn[data-cashout2]').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.betCashout2.value = btn.dataset.cashout2;
      saveSimulatorConfig();
    });
  });

  // Atualiza total quando muda o valor
  elements.betAmountDouble.addEventListener('input', updateDoubleBetTotal);

  // Salva configurações quando valores mudam
  elements.betAmount.addEventListener('change', saveSimulatorConfig);
  elements.betCashout.addEventListener('change', saveSimulatorConfig);
  elements.betAmountDouble.addEventListener('change', saveSimulatorConfig);
  elements.betCashout2.addEventListener('change', saveSimulatorConfig);
}

// ========== WebSocket Connection ==========

/**
 * Conecta ao WebSocket do Observer
 */
function connectWebSocket(url) {
  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('[WS] Conectado ao Observer');
    updateStatus('connected', 'Conectado');
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const { type, data } = message;

    switch (type) {
      case 'connected':
        console.log('[WS] Mensagem de conexão:', data.message);
        break;

      case 'round':
        console.log('[WS] Nova rodada recebida:', data);
        // Adiciona no início do array
        rounds.unshift(data);

        // Atualiza UI
        renderLastRound(data);
        renderRoundsGrid(true);
        renderTable();

        // Resolve aposta ativa do simulador manual
        if (simulator.activeBet) {
          resolveActiveBet(data.multiplier);
        }

        // Processa rodada no bot automático
        processBotRound(data);

        // Atualiza estatísticas
        fetchStats();
        fetchHourlyAnalysis();
        fetchHouseProfit();
        fetchAdvancedStats();
        break;

      case 'liveBet':
        handleLiveBetEvent(data);
        break;

      case 'betting_phase':
        console.log('[WS] Fase de apostas:', data);
        break;

      case 'ml_prediction':
        console.log('[WS] ML Prediction recebida:', data);
        mlPrediction = data;
        renderMLPrediction(data);
        break;
    }
  };

  ws.onclose = () => {
    console.log('[WS] Desconectado, reconectando em 3s...');
    updateStatus('disconnected', 'Desconectado');
    setTimeout(() => connectWebSocket(url), 3000);
  };

  ws.onerror = (error) => {
    console.error('[WS] Erro:', error);
    updateStatus('disconnected', 'Erro de conexão');
  };
}

/**
 * Processa evento de live betting
 */
function handleLiveBetEvent(event) {
  console.log('[LiveBet] Evento:', event.type, event.data);

  switch (event.type) {
    case 'bet_placed':
      // Aposta colocada na plataforma
      if (botElements.betStatus) {
        botElements.betStatus.textContent = `Aposta #${event.data.betNumber || '?'} colocada!`;
        botElements.betStatus.classList.add('live');
      }
      break;

    case 'cashout':
      // Cashout executado
      console.log(`[LiveBet] Cashout feito: Bet ${event.data.betNumber} @ ${event.data.multiplier}x`);
      if (botElements.betStatus) {
        botElements.betStatus.textContent = `Cashout ${event.data.betNumber}: ${event.data.multiplier}x`;
      }
      break;

    case 'round_end':
      // Rodada terminou
      console.log('[LiveBet] Rodada terminou');
      break;

    case 'error':
      // Erro no live betting
      console.error('[LiveBet] Erro:', event.data);
      if (botElements.betStatus) {
        botElements.betStatus.textContent = 'Erro: ' + (event.data.message || 'Desconhecido');
        botElements.betStatus.classList.add('error');
      }
      break;
  }
}

// ========== ML Predictions ==========

/**
 * Renderiza as previsões de ML na UI
 */
function renderMLPrediction(prediction) {
  if (!prediction) return;

  // Update status
  const statusEl = document.getElementById('mlStatus');
  if (statusEl) {
    statusEl.textContent = 'Ativo';
    statusEl.classList.add('active');
  }

  // Helper function to get probability class
  const getProbClass = (prob) => {
    if (prob >= 0.6) return 'high';
    if (prob >= 0.4) return 'medium';
    return 'low';
  };

  // Helper function to get warning class
  const getWarningClass = (prob) => {
    if (prob >= 0.5) return 'danger';
    if (prob >= 0.3) return 'warning';
    return 'safe';
  };

  // Update probability bars and values
  const probabilities = [
    { key: '2x', value: prediction.prob_gt_2x },
    { key: '3x', value: prediction.prob_gt_3x },
    { key: '4x', value: prediction.prob_gt_4x },
    { key: '5x', value: prediction.prob_gt_5x },
    { key: '7x', value: prediction.prob_gt_7x },
    { key: '10x', value: prediction.prob_gt_10x },
  ];

  probabilities.forEach(({ key, value }) => {
    const bar = document.getElementById(`mlBar${key}`);
    const valueEl = document.getElementById(`mlProb${key}`);

    if (bar && value !== undefined) {
      const percent = Math.round(value * 100);
      bar.style.width = `${percent}%`;
      bar.className = `ml-bar ${getProbClass(value)}`;
    }

    if (valueEl && value !== undefined) {
      const percent = Math.round(value * 100);
      valueEl.textContent = `${percent}%`;
      valueEl.className = `ml-value ${getProbClass(value)}`;
    }
  });

  // Update warnings
  const earlyCrashEl = document.getElementById('mlEarlyCrash');
  const earlyCrashValue = document.getElementById('mlEarlyCrashValue');
  if (earlyCrashEl && prediction.prob_early_crash !== undefined) {
    const prob = prediction.prob_early_crash;
    const percent = Math.round(prob * 100);
    earlyCrashEl.className = `ml-warning-item ${getWarningClass(prob)}`;
    if (earlyCrashValue) earlyCrashValue.textContent = `${percent}%`;
  }

  const lossStreakEl = document.getElementById('mlLossStreak');
  const lossStreakValue = document.getElementById('mlLossStreakValue');
  if (lossStreakEl && prediction.prob_high_loss_streak !== undefined) {
    const prob = prediction.prob_high_loss_streak;
    const percent = Math.round(prob * 100);
    lossStreakEl.className = `ml-warning-item ${getWarningClass(prob)}`;
    if (lossStreakValue) lossStreakValue.textContent = `${percent}%`;
  }

  // Update meta info
  const roundIdEl = document.getElementById('mlRoundId');
  if (roundIdEl && prediction.round_id) {
    roundIdEl.textContent = prediction.round_id;
  }

  const versionEl = document.getElementById('mlModelVersion');
  if (versionEl && prediction.model_version) {
    versionEl.textContent = prediction.model_version.replace('v', '');
  }

  console.log('[ML] Prediction rendered:', prediction);
}

/**
 * Atualiza status de conexão
 */
function updateStatus(status, text) {
  elements.status.className = `status ${status}`;
  elements.status.querySelector('.status-text').textContent = text;
}

// ========== Event Listeners ==========

/**
 * Configura botões de limite
 */
function setupLimitButtons() {
  document.querySelectorAll('.history-controls .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.history-controls .btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentLimit = parseInt(btn.dataset.limit);
      fetchRounds();
    });
  });
}

/**
 * Configura botões de filtro de plataforma
 */
function setupPlatformButtons() {
  document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const platform = btn.dataset.platform;
      currentPlatform = platform || null;

      console.log('[Platform] Filtro alterado para:', currentPlatform || 'todas');

      // Recarrega dados com novo filtro
      await Promise.all([
        fetchRounds(),
        fetchStats(),
        fetchHourlyAnalysis(),
        fetchHouseProfit(),
        fetchAdvancedStats()
      ]);
    });
  });
}

// ========== Inicialização ==========

async function init() {
  console.log('Inicializando dashboard...');

  // Carrega estado do simulador
  loadSimulatorState();

  // Atualiza UI com configurações salvas (após pequeno delay para garantir que DOM está pronto)
  setTimeout(() => {
    updateSimulatorConfigUI();
  }, 100);

  // Busca configuração do Observer
  try {
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    observerApiUrl = config.observerApiUrl;
    console.log('[Config] Observer API:', observerApiUrl);
    console.log('[Config] Observer WS:', config.observerWsUrl);

    // Conecta ao WebSocket do Observer
    connectWebSocket(config.observerWsUrl);
  } catch (err) {
    console.error('[Config] Erro ao buscar config, tentando conexão local...');
    // Fallback para conexão local (quando rodando tudo junto)
    observerApiUrl = '';
    connectWebSocket('ws://localhost:3010');
  }

  // Carrega dados iniciais
  await Promise.all([
    fetchRounds(),
    fetchStats(),
    fetchHourlyAnalysis(),
    fetchHouseProfit(),
    fetchAdvancedStats()
  ]);

  // Configura botões
  setupLimitButtons();
  setupPlatformButtons();

  // Configura simulador
  setupSimulatorEvents();
  renderSimulator();

  // Atualiza estatísticas a cada 30 segundos
  setInterval(fetchStats, 30000);

  // Atualiza análise de horários a cada 60 segundos
  setInterval(fetchHourlyAnalysis, 60000);

  // Atualiza ganho da casa a cada 30 segundos
  setInterval(fetchHouseProfit, 30000);

  // Atualiza análise avançada a cada 30 segundos
  setInterval(fetchAdvancedStats, 30000);

  console.log('Dashboard inicializado!');

  // Configura tabs do simulador
  setupSimulatorTabs();

  // Configura bot
  setupBotEvents();
  loadBotState();
  loadBotRiskState();
  renderBot();
}

// ========== BOT AUTOMÁTICO - SISTEMA MULTI-BOT ==========

// Chaves de storage por bot
const STORAGE_KEYS = {
  bot1: {
    state: 'crash_bot1_state',
    config: 'crash_bot1_config',
    riskState: 'crash_bot1_risk_state',
    sessions: 'crash_bot1_sessions'
  },
  bot2: {
    state: 'crash_bot2_state',
    config: 'crash_bot2_config',
    riskState: 'crash_bot2_risk_state',
    sessions: 'crash_bot2_sessions'
  }
};

// Bot atualmente selecionado na UI
let activeBotTab = 'bot1';

// Factory: Cria estado inicial do bot
function createBotState(botId) {
  return {
    botId,
    active: false,
    balance: 100,
    initialBalance: 100,
    minBalance: 100,  // Menor saldo atingido na sessão
    maxBalance: 100,  // Maior saldo atingido na sessão
    activeBet: null,
    history: [],
    stats: {
      totalBets: 0,
      wins: 0,
      losses: 0,
      totalWagered: 0,
      totalProfit: 0
    },
    lastDecision: null,
    liveMode: false, // Default: modo teste (simulação)
    isProcessing: false,
    lastRoundTime: 0,
    adaptiveCycle: {
      active: false,
      currentTarget: 15,
      attemptsAtCurrentTarget: 0,
      maxAttempts: 3,
      totalCycleAttempts: 0,
      lastHitTarget: null
    }
  };
}

// Factory: Cria configuração do bot
function createBotConfig(botId) {
  return {
    botId,
    betAmount: 10,
    cashout1: 2.0,
    cashout2Default: 5.10,
    cashout2Medium: 7.0,
    cashout2High: 10.0,
    cashout2VeryHigh: 15.0,
    // Gestão de Banca (configurável)
    bankrollManagement: {
      enabled: true,
      maxBetPercent: 5
    },
    // Stop-Loss (configurável)
    stopLoss: {
      enabled: true,
      percent: 30
    },
    // Take-Profit (configurável)
    takeProfit: {
      enabled: true,
      percent: 50
    },
    // Cashout Dinâmico (configurável)
    dynamicCashout: {
      enabled: true,
      conservative: 1.50,
      normal: 2.0,
      aggressive: 2.20
    },
    // ========== CONFIGURACAO ML ==========
    mlConfig: {
      // Habilita uso de ML nas decisoes
      enabled: false,
      // Se true, nao aposta sem ML disponivel
      requireML: false,
      // Modo de integracao: 'override' (ML substitui logica), 'enhance' (ML complementa)
      mode: 'enhance',

      // === REGRAS DE BLOQUEIO (impedem aposta) ===
      blockRules: {
        // Bloqueia se probabilidade de crash precoce for alta
        earlyCrash: {
          enabled: true,
          threshold: 0.35,  // Bloqueia se prob_early_crash > 35%
          priority: 1       // Prioridade (1 = mais alta)
        },
        // Bloqueia se estiver em sequencia ruim
        highLossStreak: {
          enabled: true,
          threshold: 0.50,  // Bloqueia se prob_high_loss_streak > 50%
          priority: 1
        },
        // Bloqueia se prob de 2x for muito baixa
        lowProb2x: {
          enabled: true,
          threshold: 0.40,  // Bloqueia se prob_gt_2x < 40%
          priority: 2
        }
      },

      // === REGRAS DE REQUISITO (precisam ser atendidas) ===
      requireRules: {
        // Requer minimo de prob para 2x
        minProb2x: {
          enabled: false,
          threshold: 0.45   // Requer prob_gt_2x >= 45%
        },
        // Requer que ML esteja confiante
        minConfidence: {
          enabled: false,
          threshold: 0.50   // Pelo menos uma prob > 50%
        }
      },

      // === REGRAS DE AJUSTE (modificam parametros) ===
      adjustRules: {
        // Ajusta valor da aposta baseado em confianca
        betSizeByConfidence: {
          enabled: true,
          // Multiplica aposta quando prob_gt_2x esta em faixa
          highConfidence: { minProb: 0.60, multiplier: 1.2 },
          mediumConfidence: { minProb: 0.50, multiplier: 1.0 },
          lowConfidence: { minProb: 0.40, multiplier: 0.7 },
          veryLowConfidence: { minProb: 0.0, multiplier: 0.5 }
        },
        // Ajusta cashout baseado em probabilidades
        cashoutByProb: {
          enabled: true,
          // Se prob_gt_5x > threshold, usa cashout mais agressivo
          aggressive: { probField: 'prob_gt_5x', threshold: 0.35, cashout: 5.0 },
          // Se prob_gt_3x > threshold, usa cashout medio
          medium: { probField: 'prob_gt_3x', threshold: 0.45, cashout: 3.0 },
          // Padrao conservador
          conservative: { cashout: 2.0 }
        },
        // Reduz aposta em momento de risco
        reduceOnRisk: {
          enabled: true,
          // Se early_crash > threshold, reduz aposta
          earlyCrashThreshold: 0.25,
          reductionFactor: 0.7
        }
      },

      // === OVERRIDE DE SEQUENCIAS ===
      // Se ML confianca alta, ignora analise de sequencias
      overrideSequences: {
        enabled: false,
        // Prob minima para ignorar sequencias desfavoraveis
        minProbToOverride: 0.65
      }
    }
  };
}

// Factory: Cria estado de risco do bot (sem recovery mode)
function createBotRiskState(botId) {
  return {
    botId,
    sessionStartBalance: 100,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    isPaused: false,
    pauseRoundsRemaining: 0,
    sessionProfit: 0,
    lastResults: [],
    totalSessionBets: 0,
    sessionWins: 0,
    stopLossTriggered: false,
    takeProfitTriggered: false
  };
}

// Container principal dos bots
const bots = {
  bot1: {
    state: createBotState('bot1'),
    config: createBotConfig('bot1'),
    riskState: createBotRiskState('bot1')
  },
  bot2: {
    state: createBotState('bot2'),
    config: createBotConfig('bot2'),
    riskState: createBotRiskState('bot2')
  }
};

// Configurações globais de risco (valores default, não mais usados diretamente)
const RISK_CONFIG = {
  minBetAmount: 2,
  maxConsecutiveLosses: 5,
  pauseRoundsAfterMaxLosses: 3,
  coldMomentumReduction: 0.7,
  hotMomentumIncrease: 1.0
};

// Configuração de timing (global para ambos bots)
const BOT_TIMING = {
  delayAfterRound: 2000,
  minTimeBetweenBets: 5000
};

// Aliases para compatibilidade (apontam para bot1 por padrão)
let bot = bots.bot1.state;
let botRiskState = bots.bot1.riskState;
const BOT_CONFIG = bots.bot1.config;

/**
 * Carrega estado de risco do localStorage para um bot específico
 */
function loadBotRiskState(botId = 'bot1') {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS[botId].riskState);
    if (saved) {
      const parsed = JSON.parse(saved);
      bots[botId].riskState = { ...createBotRiskState(botId), ...parsed, botId };
      console.log(`[Risk ${botId}] Estado carregado:`, bots[botId].riskState);
    }
  } catch (e) {
    console.error(`[Risk ${botId}] Erro ao carregar estado:`, e);
  }
}

/**
 * Salva estado de risco no localStorage para um bot específico
 */
function saveBotRiskState(botId = 'bot1') {
  try {
    localStorage.setItem(STORAGE_KEYS[botId].riskState, JSON.stringify(bots[botId].riskState));
  } catch (e) {
    console.error(`[Risk ${botId}] Erro ao salvar estado:`, e);
  }
}

/**
 * Reseta estado de risco (nova sessão) para um bot específico
 */
function resetBotRiskState(botId = 'bot1') {
  const botState = bots[botId].state;
  bots[botId].riskState = {
    botId,
    sessionStartBalance: botState.balance,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    isPaused: false,
    pauseRoundsRemaining: 0,
    sessionProfit: 0,
    lastResults: [],
    totalSessionBets: 0,
    sessionWins: 0,
    stopLossTriggered: false,
    takeProfitTriggered: false
  };
  saveBotRiskState(botId);
  console.log(`[Risk ${botId}] Estado resetado para nova sessão`);
}

/**
 * Calcula o tamanho ideal da aposta baseado em múltiplos fatores
 */
function calculateOptimalBetSize(botId = 'bot1') {
  const botData = bots[botId];
  const botState = botData.state;
  const botConfig = botData.config;
  const riskState = botData.riskState;

  const baseAmount = botConfig.betAmount;
  let multiplier = 1.0;
  const reasons = [];

  // 1. Limite por % do saldo (Kelly-inspired) - só se gestão de banca ativa
  if (botConfig.bankrollManagement.enabled) {
    const maxByBalance = (botState.balance * botConfig.bankrollManagement.maxBetPercent / 100) / 2;
    if (baseAmount > maxByBalance && maxByBalance >= RISK_CONFIG.minBetAmount) {
      multiplier = maxByBalance / baseAmount;
      reasons.push(`Ajuste por saldo: ${(multiplier * 100).toFixed(0)}%`);
    }
  }

  // 2. Ajuste por momentum (se disponível)
  if (advancedStats && advancedStats.momentum) {
    const momentum = advancedStats.momentum.momentumStatus;
    if (momentum === 'cold') {
      multiplier *= RISK_CONFIG.coldMomentumReduction;
      reasons.push(`Momentum frio: ${(RISK_CONFIG.coldMomentumReduction * 100).toFixed(0)}%`);
    }
  }

  // 3. Ajuste por perdas consecutivas (gradual)
  if (riskState.consecutiveLosses >= 2) {
    const lossAdjust = Math.max(0.5, 1 - (riskState.consecutiveLosses - 1) * 0.15);
    multiplier *= lossAdjust;
    reasons.push(`Perdas consecutivas (${riskState.consecutiveLosses}): ${(lossAdjust * 100).toFixed(0)}%`);
  }

  // Calcula valor final
  let finalAmount = Math.max(
    RISK_CONFIG.minBetAmount,
    Math.round(baseAmount * multiplier * 100) / 100
  );

  // Garante que não exceda o saldo disponível
  const maxAffordable = Math.floor(botState.balance / 2 * 100) / 100;
  if (finalAmount > maxAffordable) {
    finalAmount = maxAffordable;
    reasons.push(`Limitado pelo saldo disponível`);
  }

  return {
    amount: finalAmount,
    multiplier,
    reasons,
    isReduced: multiplier < 1.0
  };
}

/**
 * Calcula o primeiro cashout baseado em condições
 */
function calculateOptimalCashout1(botId = 'bot1') {
  const botData = bots[botId];
  const botConfig = botData.config;
  const riskState = botData.riskState;

  // Se cashout dinâmico desativado, usa o normal fixo
  if (!botConfig.dynamicCashout.enabled) {
    const randomized = randomizeCashout(botConfig.dynamicCashout.normal, 0.01, 0.05);
    return {
      cashout: randomized,
      base: botConfig.dynamicCashout.normal,
      reason: 'Fixo (dinâmico desativado)'
    };
  }

  let baseCashout = botConfig.dynamicCashout.normal;
  let reason = 'Normal';

  // Após perdas consecutivas, ser mais conservador
  if (riskState.consecutiveLosses >= 2) {
    baseCashout = botConfig.dynamicCashout.conservative;
    reason = 'Conservador (após perdas)';
  }
  // Após vitórias consecutivas, pode ser um pouco mais agressivo
  else if (riskState.consecutiveWins >= 3) {
    baseCashout = botConfig.dynamicCashout.aggressive;
    reason = 'Agressivo (sequência positiva)';
  }

  // Randomiza levemente (±0.05)
  const variance = baseCashout === botConfig.dynamicCashout.normal ? 0.05 : 0.03;
  const randomized = randomizeCashout(baseCashout, 0.01, variance);

  return {
    cashout: randomized,
    base: baseCashout,
    reason
  };
}

// ============================================================
// ========== MOTOR DE REGRAS ML ==========
// ============================================================

/**
 * Verifica se ML esta disponivel e valido
 */
function isMLAvailable() {
  return mlPrediction !== null &&
         mlPrediction.prob_gt_2x !== undefined &&
         mlPrediction.generated_at !== undefined;
}

/**
 * Obtem a idade da previsao ML em segundos
 */
function getMLPredictionAge() {
  if (!mlPrediction || !mlPrediction.generated_at) return Infinity;
  const generatedAt = new Date(mlPrediction.generated_at);
  const now = new Date();
  return (now - generatedAt) / 1000;
}

/**
 * Avalia regras de BLOQUEIO do ML
 * Retorna: { blocked: boolean, reasons: string[] }
 */
function evaluateMLBlockRules(botId = 'bot1') {
  const botConfig = bots[botId].config;
  const mlConfig = botConfig.mlConfig;
  const result = { blocked: false, reasons: [], triggeredRules: [] };

  if (!mlConfig.enabled || !isMLAvailable()) {
    return result;
  }

  const blockRules = mlConfig.blockRules;

  // Regra: Bloqueia em probabilidade alta de crash precoce
  if (blockRules.earlyCrash.enabled) {
    const prob = mlPrediction.prob_early_crash || 0;
    if (prob > blockRules.earlyCrash.threshold) {
      result.blocked = true;
      result.reasons.push(`ML: Crash precoce alto (${(prob * 100).toFixed(0)}% > ${(blockRules.earlyCrash.threshold * 100).toFixed(0)}%)`);
      result.triggeredRules.push('earlyCrash');
    }
  }

  // Regra: Bloqueia em sequencia de perdas alta
  if (blockRules.highLossStreak.enabled) {
    const prob = mlPrediction.prob_high_loss_streak || 0;
    if (prob > blockRules.highLossStreak.threshold) {
      result.blocked = true;
      result.reasons.push(`ML: Sequencia ruim (${(prob * 100).toFixed(0)}% > ${(blockRules.highLossStreak.threshold * 100).toFixed(0)}%)`);
      result.triggeredRules.push('highLossStreak');
    }
  }

  // Regra: Bloqueia se prob de 2x muito baixa
  if (blockRules.lowProb2x.enabled) {
    const prob = mlPrediction.prob_gt_2x || 0;
    if (prob < blockRules.lowProb2x.threshold) {
      result.blocked = true;
      result.reasons.push(`ML: Prob 2x baixa (${(prob * 100).toFixed(0)}% < ${(blockRules.lowProb2x.threshold * 100).toFixed(0)}%)`);
      result.triggeredRules.push('lowProb2x');
    }
  }

  return result;
}

/**
 * Avalia regras de REQUISITO do ML
 * Retorna: { passed: boolean, reasons: string[] }
 */
function evaluateMLRequireRules(botId = 'bot1') {
  const botConfig = bots[botId].config;
  const mlConfig = botConfig.mlConfig;
  const result = { passed: true, reasons: [], failedRules: [] };

  if (!mlConfig.enabled || !isMLAvailable()) {
    return result;
  }

  const requireRules = mlConfig.requireRules;

  // Regra: Requer minimo de prob para 2x
  if (requireRules.minProb2x.enabled) {
    const prob = mlPrediction.prob_gt_2x || 0;
    if (prob < requireRules.minProb2x.threshold) {
      result.passed = false;
      result.reasons.push(`ML: Prob 2x insuficiente (${(prob * 100).toFixed(0)}% < ${(requireRules.minProb2x.threshold * 100).toFixed(0)}%)`);
      result.failedRules.push('minProb2x');
    }
  }

  // Regra: Requer confianca minima
  if (requireRules.minConfidence.enabled) {
    const maxProb = Math.max(
      mlPrediction.prob_gt_2x || 0,
      mlPrediction.prob_gt_3x || 0,
      mlPrediction.prob_gt_5x || 0
    );
    if (maxProb < requireRules.minConfidence.threshold) {
      result.passed = false;
      result.reasons.push(`ML: Confianca baixa (max ${(maxProb * 100).toFixed(0)}% < ${(requireRules.minConfidence.threshold * 100).toFixed(0)}%)`);
      result.failedRules.push('minConfidence');
    }
  }

  return result;
}

/**
 * Calcula ajustes de ML para o valor da aposta
 * Retorna: { multiplier: number, reasons: string[] }
 */
function calculateMLBetAdjustments(botId = 'bot1') {
  const botConfig = bots[botId].config;
  const mlConfig = botConfig.mlConfig;
  const result = { multiplier: 1.0, reasons: [] };

  if (!mlConfig.enabled || !isMLAvailable()) {
    return result;
  }

  const adjustRules = mlConfig.adjustRules;

  // Ajuste por confianca (prob_gt_2x)
  if (adjustRules.betSizeByConfidence.enabled) {
    const prob2x = mlPrediction.prob_gt_2x || 0;
    const conf = adjustRules.betSizeByConfidence;

    if (prob2x >= conf.highConfidence.minProb) {
      result.multiplier *= conf.highConfidence.multiplier;
      result.reasons.push(`ML: Alta confianca (${(prob2x * 100).toFixed(0)}%) +${((conf.highConfidence.multiplier - 1) * 100).toFixed(0)}%`);
    } else if (prob2x >= conf.mediumConfidence.minProb) {
      result.multiplier *= conf.mediumConfidence.multiplier;
      // Sem ajuste, mantem normal
    } else if (prob2x >= conf.lowConfidence.minProb) {
      result.multiplier *= conf.lowConfidence.multiplier;
      result.reasons.push(`ML: Confianca baixa (${(prob2x * 100).toFixed(0)}%) ${((conf.lowConfidence.multiplier - 1) * 100).toFixed(0)}%`);
    } else {
      result.multiplier *= conf.veryLowConfidence.multiplier;
      result.reasons.push(`ML: Confianca muito baixa (${(prob2x * 100).toFixed(0)}%) ${((conf.veryLowConfidence.multiplier - 1) * 100).toFixed(0)}%`);
    }
  }

  // Reducao por risco de crash precoce
  if (adjustRules.reduceOnRisk.enabled) {
    const probEarly = mlPrediction.prob_early_crash || 0;
    if (probEarly > adjustRules.reduceOnRisk.earlyCrashThreshold) {
      result.multiplier *= adjustRules.reduceOnRisk.reductionFactor;
      result.reasons.push(`ML: Risco crash (${(probEarly * 100).toFixed(0)}%) -${((1 - adjustRules.reduceOnRisk.reductionFactor) * 100).toFixed(0)}%`);
    }
  }

  return result;
}

/**
 * Calcula o cashout recomendado pelo ML
 * Retorna: { cashout: number, reason: string } ou null se nao aplicavel
 */
function calculateMLRecommendedCashout(botId = 'bot1') {
  const botConfig = bots[botId].config;
  const mlConfig = botConfig.mlConfig;

  if (!mlConfig.enabled || !isMLAvailable()) {
    return null;
  }

  const cashoutRules = mlConfig.adjustRules.cashoutByProb;
  if (!cashoutRules.enabled) {
    return null;
  }

  // Verifica do mais agressivo para o mais conservador
  const prob5x = mlPrediction.prob_gt_5x || 0;
  const prob3x = mlPrediction.prob_gt_3x || 0;

  if (prob5x > cashoutRules.aggressive.threshold) {
    return {
      cashout: cashoutRules.aggressive.cashout,
      reason: `ML: Prob 5x alta (${(prob5x * 100).toFixed(0)}%)`
    };
  }

  if (prob3x > cashoutRules.medium.threshold) {
    return {
      cashout: cashoutRules.medium.cashout,
      reason: `ML: Prob 3x boa (${(prob3x * 100).toFixed(0)}%)`
    };
  }

  return {
    cashout: cashoutRules.conservative.cashout,
    reason: 'ML: Conservador'
  };
}

/**
 * Verifica se ML deve fazer override da analise de sequencias
 * Retorna: { shouldOverride: boolean, reason: string }
 */
function shouldMLOverrideSequences(botId = 'bot1') {
  const botConfig = bots[botId].config;
  const mlConfig = botConfig.mlConfig;

  if (!mlConfig.enabled || !isMLAvailable() || !mlConfig.overrideSequences.enabled) {
    return { shouldOverride: false, reason: null };
  }

  const prob2x = mlPrediction.prob_gt_2x || 0;
  if (prob2x >= mlConfig.overrideSequences.minProbToOverride) {
    return {
      shouldOverride: true,
      reason: `ML override: Alta confianca (${(prob2x * 100).toFixed(0)}%)`
    };
  }

  return { shouldOverride: false, reason: null };
}

/**
 * Avaliacao completa do ML para decisao de aposta
 * Combina todas as regras e retorna decisao final
 */
function evaluateMLDecision(botId = 'bot1') {
  const botConfig = bots[botId].config;
  const mlConfig = botConfig.mlConfig;

  const result = {
    mlEnabled: mlConfig.enabled,
    mlAvailable: isMLAvailable(),
    mlAge: getMLPredictionAge(),
    canBet: true,
    shouldBet: null, // null = sem opiniao, true = apostar, false = nao apostar
    reasons: [],
    adjustments: {
      betMultiplier: 1.0,
      recommendedCashout: null
    },
    prediction: mlPrediction
  };

  // Se ML desabilitado, retorna neutro
  if (!mlConfig.enabled) {
    result.reasons.push('ML desabilitado');
    return result;
  }

  // Se ML nao disponivel
  if (!isMLAvailable()) {
    result.mlAvailable = false;
    if (mlConfig.requireML) {
      result.canBet = false;
      result.shouldBet = false;
      result.reasons.push('ML indisponivel (requerido)');
    } else {
      result.reasons.push('ML indisponivel (usando fallback)');
    }
    return result;
  }

  // Avalia regras de bloqueio
  const blockResult = evaluateMLBlockRules(botId);
  if (blockResult.blocked) {
    result.canBet = false;
    result.shouldBet = false;
    result.reasons.push(...blockResult.reasons);
    return result;
  }

  // Avalia regras de requisito
  const requireResult = evaluateMLRequireRules(botId);
  if (!requireResult.passed) {
    result.shouldBet = false;
    result.reasons.push(...requireResult.reasons);
    // Nao bloqueia completamente, apenas recomenda nao apostar
  }

  // Calcula ajustes
  const betAdjust = calculateMLBetAdjustments(botId);
  result.adjustments.betMultiplier = betAdjust.multiplier;
  result.reasons.push(...betAdjust.reasons);

  // Calcula cashout recomendado
  const cashoutRecommend = calculateMLRecommendedCashout(botId);
  if (cashoutRecommend) {
    result.adjustments.recommendedCashout = cashoutRecommend;
    result.reasons.push(cashoutRecommend.reason);
  }

  // Se passou em tudo e tem boa prob, recomenda apostar
  if (requireResult.passed && mlPrediction.prob_gt_2x > 0.5) {
    result.shouldBet = true;
    result.reasons.push(`ML: Condicoes favoraveis (${(mlPrediction.prob_gt_2x * 100).toFixed(0)}% > 2x)`);
  }

  return result;
}

/**
 * Gera resumo das previsoes ML para exibicao
 */
function getMLSummary() {
  if (!isMLAvailable()) {
    return {
      available: false,
      status: 'Aguardando...',
      recommendations: []
    };
  }

  const prob2x = mlPrediction.prob_gt_2x || 0;
  const prob5x = mlPrediction.prob_gt_5x || 0;
  const probEarly = mlPrediction.prob_early_crash || 0;
  const probLoss = mlPrediction.prob_high_loss_streak || 0;

  const recommendations = [];

  // Analisa situacao
  if (probLoss > 0.5) {
    recommendations.push({ type: 'danger', text: 'Sequencia ruim detectada - evite apostas' });
  } else if (probEarly > 0.35) {
    recommendations.push({ type: 'warning', text: 'Risco de crash precoce elevado' });
  }

  if (prob2x > 0.6) {
    recommendations.push({ type: 'success', text: `Boa chance de 2x (${(prob2x * 100).toFixed(0)}%)` });
  }

  if (prob5x > 0.35) {
    recommendations.push({ type: 'info', text: `Chance razoavel de 5x (${(prob5x * 100).toFixed(0)}%)` });
  }

  let status = 'Neutro';
  if (probLoss > 0.5 || probEarly > 0.35) {
    status = 'Desfavoravel';
  } else if (prob2x > 0.55) {
    status = 'Favoravel';
  }

  return {
    available: true,
    status,
    age: getMLPredictionAge(),
    prob2x,
    prob5x,
    probEarly,
    probLoss,
    recommendations
  };
}

// ============================================================
// ========== FIM DO MOTOR DE REGRAS ML ==========
// ============================================================

/**
 * Verifica se deve apostar baseado em regras de risco
 */
function checkRiskRules(botId = 'bot1') {
  const botData = bots[botId];
  const botState = botData.state;
  const botConfig = botData.config;
  const riskState = botData.riskState;

  const issues = [];
  let canBet = true;

  const currentProfit = botState.balance - riskState.sessionStartBalance;

  // 1. Stop-Loss (se ativo)
  if (botConfig.stopLoss.enabled) {
    const stopLossAmount = riskState.sessionStartBalance * botConfig.stopLoss.percent / 100;
    if (currentProfit <= -stopLossAmount) {
      canBet = false;
      riskState.stopLossTriggered = true;
      issues.push(`STOP-LOSS: Perda de ${formatCurrency(Math.abs(currentProfit))} (limite: ${formatCurrency(stopLossAmount)})`);
    }
  }

  // 2. Take-Profit (se ativo)
  if (botConfig.takeProfit.enabled) {
    const takeProfitAmount = riskState.sessionStartBalance * botConfig.takeProfit.percent / 100;
    if (currentProfit >= takeProfitAmount) {
      canBet = false;
      riskState.takeProfitTriggered = true;
      issues.push(`TAKE-PROFIT: Lucro de ${formatCurrency(currentProfit)} (meta: ${formatCurrency(takeProfitAmount)})`);
    }
  }

  // 3. Pausa por perdas consecutivas
  if (riskState.isPaused && riskState.pauseRoundsRemaining > 0) {
    canBet = false;
    issues.push(`PAUSA: ${riskState.pauseRoundsRemaining} rodadas restantes`);
  }

  // 4. Máximo de perdas consecutivas
  if (riskState.consecutiveLosses >= RISK_CONFIG.maxConsecutiveLosses) {
    canBet = false;
    riskState.isPaused = true;
    riskState.pauseRoundsRemaining = RISK_CONFIG.pauseRoundsAfterMaxLosses;
    issues.push(`PROTECAO: ${riskState.consecutiveLosses} perdas seguidas - pausando`);
  }

  // 5. Saldo insuficiente
  if (botState.balance < RISK_CONFIG.minBetAmount * 2) {
    canBet = false;
    issues.push(`SALDO INSUFICIENTE: ${formatCurrency(botState.balance)}`);
  }

  return { canBet, issues };
}

/**
 * Atualiza estado de risco após resultado de aposta
 */
function updateRiskStateAfterBet(botId, won, profit) {
  const riskState = bots[botId].riskState;

  riskState.totalSessionBets++;
  riskState.sessionProfit += profit;

  // Adiciona resultado ao histórico
  riskState.lastResults.push(won);
  if (riskState.lastResults.length > 10) {
    riskState.lastResults.shift();
  }

  if (won) {
    riskState.consecutiveWins++;
    riskState.consecutiveLosses = 0;
    riskState.sessionWins++;
  } else {
    riskState.consecutiveLosses++;
    riskState.consecutiveWins = 0;
  }

  saveBotRiskState(botId);
}

/**
 * Decrementa contador de pausa (chamado a cada rodada)
 */
function decrementPauseCounter(botId = 'bot1') {
  const riskState = bots[botId].riskState;
  if (riskState.isPaused && riskState.pauseRoundsRemaining > 0) {
    riskState.pauseRoundsRemaining--;
    if (riskState.pauseRoundsRemaining === 0) {
      riskState.isPaused = false;
      riskState.consecutiveLosses = 0;
      console.log(`[Risk ${botId}] Pausa encerrada, retomando operações`);
    }
    saveBotRiskState(botId);
  }
}

/**
 * Retorna estatísticas de risco para exibição
 */
function getRiskStats(botId = 'bot1') {
  const riskState = bots[botId].riskState;
  const winRate = riskState.totalSessionBets > 0
    ? (riskState.sessionWins / riskState.totalSessionBets * 100).toFixed(1)
    : 0;

  return {
    sessionProfit: riskState.sessionProfit,
    sessionBets: riskState.totalSessionBets,
    sessionWinRate: winRate,
    consecutiveLosses: riskState.consecutiveLosses,
    consecutiveWins: riskState.consecutiveWins,
    isPaused: riskState.isPaused,
    stopLossTriggered: riskState.stopLossTriggered,
    takeProfitTriggered: riskState.takeProfitTriggered
  };
}

/**
 * Retorna estatísticas agregadas de ambos os bots
 */
function getCombinedStats() {
  const b1 = bots.bot1.state;
  const b2 = bots.bot2.state;
  return {
    totalBalance: b1.balance + b2.balance,
    totalProfit: b1.stats.totalProfit + b2.stats.totalProfit,
    totalBets: b1.stats.totalBets + b2.stats.totalBets,
    totalWins: b1.stats.wins + b2.stats.wins,
    totalLosses: b1.stats.losses + b2.stats.losses
  };
}

/**
 * Migra dados do formato single-bot para multi-bot
 */
function migrateFromSingleBot() {
  try {
    const oldState = localStorage.getItem('crash_bot_state');
    const oldConfig = localStorage.getItem('crash_bot_config');
    const oldRiskState = localStorage.getItem('crash_bot_risk_state');
    const oldSessions = localStorage.getItem('crash_bot_sessions');

    // Se já migrou ou não tem dados antigos, retorna
    if (localStorage.getItem('crash_migration_v2') || !oldState) {
      return;
    }

    console.log('[Migration] Migrando dados do single-bot para multi-bot...');

    // Migra para bot1
    if (oldState) localStorage.setItem(STORAGE_KEYS.bot1.state, oldState);
    if (oldConfig) localStorage.setItem(STORAGE_KEYS.bot1.config, oldConfig);
    if (oldRiskState) localStorage.setItem(STORAGE_KEYS.bot1.riskState, oldRiskState);
    if (oldSessions) localStorage.setItem(STORAGE_KEYS.bot1.sessions, oldSessions);

    // Marca migração como feita
    localStorage.setItem('crash_migration_v2', 'done');
    console.log('[Migration] Migração concluída com sucesso');
  } catch (e) {
    console.error('[Migration] Erro na migração:', e);
  }
}

// Elementos DOM do bot (será mapeado por botId)
const botElements = {
  statusIndicator: null,
  statusText: null,
  toggleBtn: null,
  balance: null,
  resetBtn: null,
  decisionBox: null,
  decisionContent: null,
  activeBet: null,
  betStatus: null,
  betDetails: null,
  totalBets: null,
  wins: null,
  profit: null,
  roi: null,
  historyList: null,
  // Live mode
  liveModeSection: null,
  liveModeToggle: null,
  liveModeLabel: null,
  // Config
  configBetAmount: null,
  configTotalPerRound: null,
  // Sessions
  sessionsBtn: null,
  sessionsModal: null,
  sessionsList: null,
  sessionsClose: null,
  // Balance edit
  balanceEditGroup: null,
  balanceInput: null,
  balanceSaveBtn: null,
  balanceEditBtn: null,
  // Account type
  accountType: null,
  accountLabel: null,
  // Collapsible sections
  configSection: null,
  configToggle: null,
  configBody: null,
  rulesSection: null,
  rulesToggle: null,
  rulesBody: null
};

/**
 * Carrega estado do bot do localStorage
 */
function loadBotState(botId = 'bot1') {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS[botId].state);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Sempre inicia desativado e em modo teste por segurança
      bots[botId].state = { ...createBotState(botId), ...parsed, active: false, liveMode: false, botId };
      console.log(`[Bot ${botId}] Estado carregado:`, bots[botId].state);
    }
  } catch (e) {
    console.error(`[Bot ${botId}] Erro ao carregar estado:`, e);
  }
}

/**
 * Carrega configuração do bot do localStorage
 */
function loadBotConfig(botId = 'bot1') {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS[botId].config);
    if (saved) {
      const parsed = JSON.parse(saved);
      bots[botId].config = { ...createBotConfig(botId), ...parsed, botId };
      console.log(`[Bot ${botId}] Configuração carregada`);
    }
  } catch (e) {
    console.error(`[Bot ${botId}] Erro ao carregar configuração:`, e);
  }
}

/**
 * Salva configuração do bot no localStorage
 */
function saveBotConfig(botId = 'bot1') {
  try {
    localStorage.setItem(STORAGE_KEYS[botId].config, JSON.stringify(bots[botId].config));
  } catch (e) {
    console.error(`[Bot ${botId}] Erro ao salvar configuração:`, e);
  }
}

/**
 * Atualiza os campos de configuração na UI
 */
function updateConfigUI(botId = activeBotTab) {
  const botConfig = bots[botId].config;
  const elements = getBotElements(botId);

  if (elements.betAmount) {
    elements.betAmount.value = botConfig.betAmount;
  }

  // Atualiza toggles de risco
  if (elements.bankrollEnabled) elements.bankrollEnabled.checked = botConfig.bankrollManagement.enabled;
  if (elements.maxBetPercent) elements.maxBetPercent.value = botConfig.bankrollManagement.maxBetPercent;
  if (elements.stopLossEnabled) elements.stopLossEnabled.checked = botConfig.stopLoss.enabled;
  if (elements.stopLossPercent) elements.stopLossPercent.value = botConfig.stopLoss.percent;
  if (elements.takeProfitEnabled) elements.takeProfitEnabled.checked = botConfig.takeProfit.enabled;
  if (elements.takeProfitPercent) elements.takeProfitPercent.value = botConfig.takeProfit.percent;
  if (elements.dynamicCashoutEnabled) elements.dynamicCashoutEnabled.checked = botConfig.dynamicCashout.enabled;
  if (elements.cashoutConservative) elements.cashoutConservative.value = botConfig.dynamicCashout.conservative;
  if (elements.cashoutNormal) elements.cashoutNormal.value = botConfig.dynamicCashout.normal;
  if (elements.cashoutAggressive) elements.cashoutAggressive.value = botConfig.dynamicCashout.aggressive;

  // Atualiza estado visual dos grupos de config
  updateConfigGroupVisibility(botId);
  updateConfigSummary(botId);

  // Inicializa ML Config
  initMLConfigFromState(botId);
}

/**
 * Atualiza visibilidade dos grupos de config baseado nos toggles
 */
function updateConfigGroupVisibility(botId = activeBotTab) {
  const elements = getBotElements(botId);

  if (elements.bankrollEnabled && elements.bankrollBody) {
    elements.bankrollBody.classList.toggle('disabled', !elements.bankrollEnabled.checked);
  }
  if (elements.stopLossEnabled && elements.stopLossBody) {
    elements.stopLossBody.classList.toggle('disabled', !elements.stopLossEnabled.checked);
  }
  if (elements.takeProfitEnabled && elements.takeProfitBody) {
    elements.takeProfitBody.classList.toggle('disabled', !elements.takeProfitEnabled.checked);
  }
  if (elements.dynamicCashoutEnabled && elements.dynamicCashoutBody) {
    elements.dynamicCashoutBody.classList.toggle('disabled', !elements.dynamicCashoutEnabled.checked);
  }
}

/**
 * Atualiza visibilidade do config body do ML
 */
function updateMLConfigVisibility(botId = activeBotTab) {
  const elements = getBotElements(botId);

  if (elements.mlEnabled && elements.mlConfigBody) {
    elements.mlConfigBody.classList.toggle('disabled', !elements.mlEnabled.checked);
  }
}

/**
 * Inicializa os inputs do ML Config a partir do estado salvo
 */
function initMLConfigFromState(botId = activeBotTab) {
  const botConfig = bots[botId].config;
  const elements = getBotElements(botId);
  const mlConfig = botConfig.mlConfig;

  // Enabled toggle
  if (elements.mlEnabled) {
    elements.mlEnabled.checked = mlConfig.enabled;
  }

  // Mode
  if (elements.mlMode) {
    elements.mlMode.value = mlConfig.mode;
  }

  // Require ML
  if (elements.mlRequire) {
    elements.mlRequire.checked = mlConfig.requireML;
  }

  // Block rules
  if (elements.mlBlockEarlyCrash) {
    elements.mlBlockEarlyCrash.checked = mlConfig.blockRules.earlyCrash.enabled;
  }
  if (elements.mlBlockEarlyCrashThreshold) {
    elements.mlBlockEarlyCrashThreshold.value = Math.round(mlConfig.blockRules.earlyCrash.threshold * 100);
  }
  if (elements.mlBlockLossStreak) {
    elements.mlBlockLossStreak.checked = mlConfig.blockRules.highLossStreak.enabled;
  }
  if (elements.mlBlockLossStreakThreshold) {
    elements.mlBlockLossStreakThreshold.value = Math.round(mlConfig.blockRules.highLossStreak.threshold * 100);
  }
  if (elements.mlBlockLowProb2x) {
    elements.mlBlockLowProb2x.checked = mlConfig.blockRules.lowProb2x.enabled;
  }
  if (elements.mlBlockLowProb2xThreshold) {
    elements.mlBlockLowProb2xThreshold.value = Math.round(mlConfig.blockRules.lowProb2x.threshold * 100);
  }

  // Adjust rules
  if (elements.mlAdjustBetSize) {
    elements.mlAdjustBetSize.checked = mlConfig.adjustRules.betSizeByConfidence.enabled;
  }

  // Override sequences
  if (elements.mlOverrideSequences) {
    elements.mlOverrideSequences.checked = mlConfig.overrideSequences.enabled;
  }
  if (elements.mlOverrideThreshold) {
    elements.mlOverrideThreshold.value = Math.round(mlConfig.overrideSequences.minProbToOverride * 100);
  }

  // Update visibility
  updateMLConfigVisibility(botId);
}

/**
 * Atualiza o resumo da configuração
 */
function updateConfigSummary(botId = activeBotTab) {
  const botConfig = bots[botId].config;
  const elements = getBotElements(botId);

  const betAmount = elements.betAmount ? parseFloat(elements.betAmount.value) || botConfig.betAmount : botConfig.betAmount;
  const totalPerRound = betAmount * 2;

  if (elements.totalPerRound) {
    elements.totalPerRound.textContent = formatCurrency(totalPerRound);
  }
}

/**
 * Lê os valores da configuração dos inputs
 */
function readConfigFromInputs(botId = activeBotTab) {
  const botConfig = bots[botId].config;
  const elements = getBotElements(botId);

  // Valor da aposta
  if (elements.betAmount) {
    const value = parseFloat(elements.betAmount.value);
    if (value > 0 && value <= 1000) {
      botConfig.betAmount = value;
    }
  }

  // Gestão de Banca
  if (elements.bankrollEnabled) botConfig.bankrollManagement.enabled = elements.bankrollEnabled.checked;
  if (elements.maxBetPercent) {
    const val = parseFloat(elements.maxBetPercent.value);
    if (val >= 1 && val <= 100) botConfig.bankrollManagement.maxBetPercent = val;
  }

  // Stop-Loss
  if (elements.stopLossEnabled) botConfig.stopLoss.enabled = elements.stopLossEnabled.checked;
  if (elements.stopLossPercent) {
    const val = parseFloat(elements.stopLossPercent.value);
    if (val >= 1 && val <= 100) botConfig.stopLoss.percent = val;
  }

  // Take-Profit
  if (elements.takeProfitEnabled) botConfig.takeProfit.enabled = elements.takeProfitEnabled.checked;
  if (elements.takeProfitPercent) {
    const val = parseFloat(elements.takeProfitPercent.value);
    if (val >= 1 && val <= 500) botConfig.takeProfit.percent = val;
  }

  // Cashout Dinâmico
  if (elements.dynamicCashoutEnabled) botConfig.dynamicCashout.enabled = elements.dynamicCashoutEnabled.checked;
  if (elements.cashoutConservative) {
    const val = parseFloat(elements.cashoutConservative.value);
    if (val >= 1.01 && val <= 10) botConfig.dynamicCashout.conservative = val;
  }
  if (elements.cashoutNormal) {
    const val = parseFloat(elements.cashoutNormal.value);
    if (val >= 1.01 && val <= 10) botConfig.dynamicCashout.normal = val;
  }
  if (elements.cashoutAggressive) {
    const val = parseFloat(elements.cashoutAggressive.value);
    if (val >= 1.01 && val <= 10) botConfig.dynamicCashout.aggressive = val;
  }

  // ML Config
  if (elements.mlEnabled) {
    botConfig.mlConfig.enabled = elements.mlEnabled.checked;
    // Update ML config body visibility
    if (elements.mlConfigBody) {
      elements.mlConfigBody.classList.toggle('disabled', !elements.mlEnabled.checked);
    }
  }
  if (elements.mlMode) botConfig.mlConfig.mode = elements.mlMode.value;
  if (elements.mlRequire) botConfig.mlConfig.requireML = elements.mlRequire.checked;

  // Block Rules
  if (elements.mlBlockEarlyCrash) {
    botConfig.mlConfig.blockRules.earlyCrash.enabled = elements.mlBlockEarlyCrash.checked;
  }
  if (elements.mlBlockEarlyCrashThreshold) {
    const val = parseFloat(elements.mlBlockEarlyCrashThreshold.value);
    if (val >= 0 && val <= 100) botConfig.mlConfig.blockRules.earlyCrash.threshold = val / 100;
  }
  if (elements.mlBlockLossStreak) {
    botConfig.mlConfig.blockRules.highLossStreak.enabled = elements.mlBlockLossStreak.checked;
  }
  if (elements.mlBlockLossStreakThreshold) {
    const val = parseFloat(elements.mlBlockLossStreakThreshold.value);
    if (val >= 0 && val <= 100) botConfig.mlConfig.blockRules.highLossStreak.threshold = val / 100;
  }
  if (elements.mlBlockLowProb2x) {
    botConfig.mlConfig.blockRules.lowProb2x.enabled = elements.mlBlockLowProb2x.checked;
  }
  if (elements.mlBlockLowProb2xThreshold) {
    const val = parseFloat(elements.mlBlockLowProb2xThreshold.value);
    if (val >= 0 && val <= 100) botConfig.mlConfig.blockRules.lowProb2x.threshold = val / 100;
  }

  // Adjust Rules
  if (elements.mlAdjustBetSize) {
    botConfig.mlConfig.adjustRules.betSizeByConfidence.enabled = elements.mlAdjustBetSize.checked;
  }

  // Override Sequences
  if (elements.mlOverrideSequences) {
    botConfig.mlConfig.overrideSequences.enabled = elements.mlOverrideSequences.checked;
  }
  if (elements.mlOverrideThreshold) {
    const val = parseFloat(elements.mlOverrideThreshold.value);
    if (val >= 50 && val <= 100) botConfig.mlConfig.overrideSequences.minProbToOverride = val / 100;
  }

  saveBotConfig(botId);
  updateConfigSummary(botId);
}

/**
 * Obtém elementos DOM de um bot específico
 */
function getBotElements(botId) {
  // Retorna elementos DOM específicos para cada bot
  return {
    // Status
    statusIndicator: document.getElementById(`${botId}StatusIndicator`),
    statusText: document.getElementById(`${botId}StatusText`),
    accountType: document.getElementById(`${botId}AccountType`),
    accountLabel: document.getElementById(`${botId}AccountLabel`),
    toggleBtn: document.getElementById(`${botId}Toggle`),
    // Banca
    balance: document.getElementById(`${botId}Balance`),
    balanceEditGroup: document.getElementById(`${botId}BalanceEditGroup`),
    balanceInput: document.getElementById(`${botId}BalanceInput`),
    balanceSave: document.getElementById(`${botId}BalanceSave`),
    balanceEditBtn: document.getElementById(`${botId}BalanceEdit`),
    sessionsBtn: document.getElementById(`${botId}SessionsBtn`),
    resetBtn: document.getElementById(`${botId}Reset`),
    // Decisão
    decision: document.getElementById(`${botId}Decision`),
    decisionContent: document.getElementById(`${botId}DecisionContent`),
    // Aposta ativa
    activeBet: document.getElementById(`${botId}ActiveBet`),
    betStatus: document.getElementById(`${botId}BetStatus`),
    betDetails: document.getElementById(`${botId}BetDetails`),
    // Estatísticas
    totalBets: document.getElementById(`${botId}TotalBets`),
    wins: document.getElementById(`${botId}Wins`),
    profit: document.getElementById(`${botId}Profit`),
    roi: document.getElementById(`${botId}ROI`),
    minBalance: document.getElementById(`${botId}MinBalance`),
    maxBalance: document.getElementById(`${botId}MaxBalance`),
    initialBalanceEl: document.getElementById(`${botId}InitialBalance`),
    // Histórico
    historyList: document.getElementById(`${botId}HistoryList`),
    // Configurações
    configSection: document.getElementById(`${botId}ConfigSection`),
    configToggle: document.getElementById(`${botId}ConfigToggle`),
    configBody: document.getElementById(`${botId}ConfigBody`),
    liveModeToggle: document.getElementById(`${botId}LiveModeToggle`),
    liveModeLabel: document.getElementById(`${botId}LiveModeLabel`),
    liveModeWarning: document.getElementById(`${botId}LiveModeWarning`),
    betAmount: document.getElementById(`${botId}BetAmount`),
    totalPerRound: document.getElementById(`${botId}TotalPerRound`),
    // Gestão de Risco
    bankrollEnabled: document.getElementById(`${botId}BankrollEnabled`),
    bankrollBody: document.getElementById(`${botId}BankrollBody`),
    maxBetPercent: document.getElementById(`${botId}MaxBetPercent`),
    stopLossEnabled: document.getElementById(`${botId}StopLossEnabled`),
    stopLossBody: document.getElementById(`${botId}StopLossBody`),
    stopLossPercent: document.getElementById(`${botId}StopLossPercent`),
    takeProfitEnabled: document.getElementById(`${botId}TakeProfitEnabled`),
    takeProfitBody: document.getElementById(`${botId}TakeProfitBody`),
    takeProfitPercent: document.getElementById(`${botId}TakeProfitPercent`),
    dynamicCashoutEnabled: document.getElementById(`${botId}DynamicCashoutEnabled`),
    dynamicCashoutBody: document.getElementById(`${botId}DynamicCashoutBody`),
    cashoutConservative: document.getElementById(`${botId}CashoutConservative`),
    cashoutNormal: document.getElementById(`${botId}CashoutNormal`),
    cashoutAggressive: document.getElementById(`${botId}CashoutAggressive`),
    // Regras
    rulesToggle: document.getElementById(`${botId}RulesToggle`),
    rulesBody: document.getElementById(`${botId}RulesBody`),
    // ML Config
    mlEnabled: document.getElementById(`${botId}MLEnabled`),
    mlConfigBody: document.getElementById(`${botId}MLConfigBody`),
    mlMode: document.getElementById(`${botId}MLMode`),
    mlRequire: document.getElementById(`${botId}MLRequire`),
    mlBlockEarlyCrash: document.getElementById(`${botId}MLBlockEarlyCrash`),
    mlBlockEarlyCrashThreshold: document.getElementById(`${botId}MLBlockEarlyCrashThreshold`),
    mlBlockLossStreak: document.getElementById(`${botId}MLBlockLossStreak`),
    mlBlockLossStreakThreshold: document.getElementById(`${botId}MLBlockLossStreakThreshold`),
    mlBlockLowProb2x: document.getElementById(`${botId}MLBlockLowProb2x`),
    mlBlockLowProb2xThreshold: document.getElementById(`${botId}MLBlockLowProb2xThreshold`),
    mlAdjustBetSize: document.getElementById(`${botId}MLAdjustBetSize`),
    mlOverrideSequences: document.getElementById(`${botId}MLOverrideSequences`),
    mlOverrideThreshold: document.getElementById(`${botId}MLOverrideThreshold`),
    // Tab elements
    panel: document.getElementById(`${botId}Panel`),
    tabBalance: document.getElementById(`${botId}TabBalance`),
    tabStatus: document.getElementById(`${botId}TabStatus`)
  };
}

// ========== SESSÕES ARQUIVADAS ==========

/**
 * Carrega sessões arquivadas do localStorage
 */
function loadArchivedSessions(botId = 'bot1') {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS[botId].sessions);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error(`[Bot ${botId}] Erro ao carregar sessões:`, e);
  }
  return [];
}

/**
 * Salva sessões arquivadas no localStorage
 */
function saveArchivedSessions(sessions, botId = 'bot1') {
  try {
    localStorage.setItem(STORAGE_KEYS[botId].sessions, JSON.stringify(sessions));
  } catch (e) {
    console.error(`[Bot ${botId}] Erro ao salvar sessões:`, e);
  }
}

/**
 * Arquiva a sessão atual do bot
 */
function archiveCurrentSession(botId = 'bot1') {
  const botState = bots[botId].state;
  const botConfig = bots[botId].config;

  // Só arquiva se tiver apostas
  if (botState.stats.totalBets === 0) {
    console.log(`[Bot ${botId}] Nenhuma aposta para arquivar`);
    return null;
  }

  const session = {
    id: Date.now(),
    botId,
    startDate: botState.history.length > 0 ? botState.history[0].timestamp : new Date().toISOString(),
    endDate: new Date().toISOString(),
    initialBalance: botState.initialBalance,
    finalBalance: botState.balance,
    stats: { ...botState.stats },
    history: [...botState.history],
    betAmount: botConfig.betAmount
  };

  const sessions = loadArchivedSessions(botId);
  sessions.unshift(session); // Adiciona no início

  // Limita a 20 sessões arquivadas
  if (sessions.length > 20) {
    sessions.pop();
  }

  saveArchivedSessions(sessions, botId);
  console.log(`[Bot ${botId}] Sessão arquivada:`, session.id);

  return session;
}

/**
 * Formata data para exibição
 */
function formatSessionDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Variável para rastrear qual bot está com modal de sessões aberto
let sessionsModalBotId = 'bot1';

/**
 * Renderiza a lista de sessões arquivadas
 */
function renderArchivedSessions(botId = sessionsModalBotId) {
  const sessionsList = document.getElementById('sessionsList');
  if (!sessionsList) return;

  const sessions = loadArchivedSessions(botId);
  const botLabel = botId === 'bot1' ? 'Bot 1' : 'Bot 2';

  if (sessions.length === 0) {
    sessionsList.innerHTML = `
      <div class="no-sessions">
        <p>Nenhuma sessao arquivada para ${botLabel}</p>
        <span>As sessoes sao salvas automaticamente ao resetar o bot</span>
      </div>
    `;
    return;
  }

  sessionsList.innerHTML = sessions.map((session, index) => {
    const profit = session.stats.totalProfit;
    const profitClass = profit >= 0 ? 'positive' : 'negative';
    const winRate = session.stats.totalBets > 0
      ? ((session.stats.wins / session.stats.totalBets) * 100).toFixed(1)
      : 0;
    const roi = session.stats.totalWagered > 0
      ? ((session.stats.totalProfit / session.stats.totalWagered) * 100).toFixed(1)
      : 0;

    return `
      <div class="session-card" data-session-id="${session.id}">
        <div class="session-header">
          <span class="session-number">#${sessions.length - index}</span>
          <span class="session-date">${formatSessionDate(session.startDate)}</span>
          <button class="session-delete-btn" data-session-id="${session.id}" title="Excluir sessao">×</button>
        </div>
        <div class="session-stats">
          <div class="session-stat">
            <span class="stat-label">Apostas</span>
            <span class="stat-value">${session.stats.totalBets}</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">Vitorias</span>
            <span class="stat-value">${session.stats.wins} (${winRate}%)</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">Lucro</span>
            <span class="stat-value ${profitClass}">${profit >= 0 ? '+' : ''}${formatCurrency(profit)}</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">ROI</span>
            <span class="stat-value ${profitClass}">${roi}%</span>
          </div>
        </div>
        <div class="session-details">
          <span>Valor/aposta: R$ ${session.betAmount?.toFixed(2) || '10.00'}</span>
          <span>Apostado: ${formatCurrency(session.stats.totalWagered)}</span>
        </div>
      </div>
    `;
  }).join('');

  // Adiciona eventos de delete
  sessionsList.querySelectorAll('.session-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sessionId = parseInt(btn.dataset.sessionId);
      deleteArchivedSession(sessionId, botId);
    });
  });
}

/**
 * Deleta uma sessão arquivada
 */
function deleteArchivedSession(sessionId, botId = sessionsModalBotId) {
  if (!confirm('Tem certeza que deseja excluir esta sessao?')) return;

  const sessions = loadArchivedSessions(botId);
  const filtered = sessions.filter(s => s.id !== sessionId);
  saveArchivedSessions(filtered, botId);
  renderArchivedSessions(botId);
  console.log(`[Bot ${botId}] Sessao excluida:`, sessionId);
}

/**
 * Abre o modal de sessões
 */
function openSessionsModal(botId = activeBotTab) {
  const sessionsModal = document.getElementById('sessionsModal');
  if (sessionsModal) {
    sessionsModalBotId = botId;
    // Atualiza título do modal
    const modalTitle = sessionsModal.querySelector('h2');
    if (modalTitle) {
      modalTitle.textContent = `Sessoes Arquivadas - ${botId === 'bot1' ? 'Bot 1' : 'Bot 2'}`;
    }
    renderArchivedSessions(botId);
    sessionsModal.classList.add('active');
  }
}

/**
 * Fecha o modal de sessões
 */
function closeSessionsModal() {
  const sessionsModal = document.getElementById('sessionsModal');
  if (sessionsModal) {
    sessionsModal.classList.remove('active');
  }
}

/**
 * Salva estado do bot no localStorage
 */
function saveBotState(botId = 'bot1') {
  try {
    localStorage.setItem(STORAGE_KEYS[botId].state, JSON.stringify(bots[botId].state));
  } catch (e) {
    console.error(`[Bot ${botId}] Erro ao salvar estado:`, e);
  }
}

/**
 * Sincroniza o saldo do bot com o saldo real da plataforma (modo live)
 */
async function syncPlatformBalance(botId = 'bot1', forceSync = false) {
  const botState = bots[botId].state;

  // Só sincroniza em modo live (ou se forçado)
  if (!botState.liveMode && !forceSync) {
    return false;
  }

  console.log(`[Bot ${botId}] Buscando saldo da plataforma...`);

  try {
    const response = await fetch(`${observerApiUrl}/api/live-betting/balance`);
    const result = await response.json();

    if (result.success && typeof result.balance === 'number') {
      const oldBalance = botState.balance;
      botState.balance = result.balance;
      botState.initialBalance = result.balance;

      // Atualiza min/max balance
      if (botState.balance < botState.minBalance) {
        botState.minBalance = botState.balance;
      }
      if (botState.balance > botState.maxBalance) {
        botState.maxBalance = botState.balance;
      }

      console.log(`[Bot ${botId}] Saldo sincronizado: ${formatCurrency(oldBalance)} -> ${formatCurrency(result.balance)}`);

      saveBotState(botId);
      renderBot(botId);
      return true;
    } else {
      console.warn(`[Bot ${botId}] Não foi possível sincronizar saldo:`, result.error || 'Erro desconhecido');
      return false;
    }
  } catch (err) {
    console.error(`[Bot ${botId}] Erro ao sincronizar saldo:`, err);
    return false;
  }
}

/**
 * Configura eventos de um bot específico
 */
function setupBotEventListeners(botId) {
  const elements = getBotElements(botId);

  // Toggle bot on/off
  if (elements.toggleBtn) {
    elements.toggleBtn.addEventListener('click', () => toggleBot(botId));
  }

  // Reset bot
  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', () => resetBot(botId));
  }

  // Live mode toggle
  if (elements.liveModeToggle) {
    elements.liveModeToggle.addEventListener('change', () => handleLiveModeToggle(botId));
  }

  // Config inputs - save on change
  if (elements.betAmount) {
    elements.betAmount.addEventListener('change', () => readConfigFromInputs(botId));
    elements.betAmount.addEventListener('input', () => updateConfigSummary(botId));
  }

  // Risk config toggles
  if (elements.bankrollEnabled) {
    elements.bankrollEnabled.addEventListener('change', () => {
      readConfigFromInputs(botId);
      updateConfigGroupVisibility(botId);
    });
  }
  if (elements.stopLossEnabled) {
    elements.stopLossEnabled.addEventListener('change', () => {
      readConfigFromInputs(botId);
      updateConfigGroupVisibility(botId);
    });
  }
  if (elements.takeProfitEnabled) {
    elements.takeProfitEnabled.addEventListener('change', () => {
      readConfigFromInputs(botId);
      updateConfigGroupVisibility(botId);
    });
  }
  if (elements.dynamicCashoutEnabled) {
    elements.dynamicCashoutEnabled.addEventListener('change', () => {
      readConfigFromInputs(botId);
      updateConfigGroupVisibility(botId);
    });
  }

  // All other config inputs
  const configInputs = [
    elements.maxBetPercent, elements.stopLossPercent, elements.takeProfitPercent,
    elements.cashoutConservative, elements.cashoutNormal, elements.cashoutAggressive
  ];
  configInputs.forEach(input => {
    if (input) {
      input.addEventListener('change', () => readConfigFromInputs(botId));
    }
  });

  // ML Config toggle
  if (elements.mlEnabled) {
    elements.mlEnabled.addEventListener('change', () => {
      readConfigFromInputs(botId);
      updateMLConfigVisibility(botId);
    });
  }

  // ML Config inputs
  const mlConfigInputs = [
    elements.mlMode, elements.mlRequire,
    elements.mlBlockEarlyCrash, elements.mlBlockEarlyCrashThreshold,
    elements.mlBlockLossStreak, elements.mlBlockLossStreakThreshold,
    elements.mlBlockLowProb2x, elements.mlBlockLowProb2xThreshold,
    elements.mlAdjustBetSize,
    elements.mlOverrideSequences, elements.mlOverrideThreshold
  ];
  mlConfigInputs.forEach(input => {
    if (input) {
      input.addEventListener('change', () => readConfigFromInputs(botId));
    }
  });

  // Balance edit events
  if (elements.balanceEditBtn) {
    elements.balanceEditBtn.addEventListener('click', () => toggleBalanceEdit(botId));
  }
  if (elements.balanceSave) {
    elements.balanceSave.addEventListener('click', () => saveBalanceEdit(botId));
  }
  if (elements.balanceInput) {
    elements.balanceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBalanceEdit(botId);
      else if (e.key === 'Escape') cancelBalanceEdit(botId);
    });
  }

  // Sessions button
  if (elements.sessionsBtn) {
    elements.sessionsBtn.addEventListener('click', () => openSessionsModal(botId));
  }

  // Collapsible sections
  if (elements.configToggle) {
    elements.configToggle.addEventListener('click', () => {
      toggleCollapsible(elements.configSection);
    });
  }
  if (elements.rulesToggle) {
    elements.rulesToggle.addEventListener('click', () => {
      const rulesSection = elements.rulesToggle.closest('.bot-rules');
      toggleCollapsible(rulesSection);
    });
  }

  // Inicia seções colapsadas
  if (elements.configSection) {
    elements.configSection.classList.add('collapsed');
  }
}

/**
 * Configura eventos das abas de seleção de bot
 */
function setupBotTabEvents() {
  const botTabs = document.querySelectorAll('.bot-tab');
  const botPanels = document.querySelectorAll('.bot-panel');

  botTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetBotId = tab.dataset.bot;

      // Atualiza tab ativa
      botTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Atualiza painel ativo
      botPanels.forEach(p => p.classList.remove('active'));
      const targetPanel = document.getElementById(`${targetBotId}Panel`);
      if (targetPanel) targetPanel.classList.add('active');

      // Atualiza variável global
      activeBotTab = targetBotId;

      // Atualiza UI do bot selecionado
      renderBot(targetBotId);
      updateConfigUI(targetBotId);
    });
  });
}

/**
 * Configura quick buttons para configurações
 */
function setupQuickButtons() {
  // Quick buttons para valor de aposta
  document.querySelectorAll('.config-quick-btn[data-amount]').forEach(btn => {
    btn.addEventListener('click', () => {
      const botId = btn.dataset.bot || activeBotTab;
      const amount = parseFloat(btn.dataset.amount);
      const elements = getBotElements(botId);

      if (amount > 0 && elements.betAmount) {
        elements.betAmount.value = amount;
        bots[botId].config.betAmount = amount;
        saveBotConfig(botId);
        updateConfigSummary(botId);
      }
    });
  });

  // Quick buttons para stop-loss, take-profit
  document.querySelectorAll('.config-quick-btn[data-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const botId = btn.dataset.bot || activeBotTab;
      const field = btn.dataset.field;
      const value = parseFloat(btn.dataset.value);
      const elements = getBotElements(botId);

      if (field === 'stopLoss' && elements.stopLossPercent) {
        elements.stopLossPercent.value = value;
      } else if (field === 'takeProfit' && elements.takeProfitPercent) {
        elements.takeProfitPercent.value = value;
      }
      readConfigFromInputs(botId);
    });
  });
}

/**
 * Configura eventos do bot (versão multi-bot)
 */
function setupBotEvents() {
  // Configura abas de seleção de bot
  setupBotTabEvents();

  // Configura eventos para cada bot
  setupBotEventListeners('bot1');
  setupBotEventListeners('bot2');

  // Configura quick buttons
  setupQuickButtons();

  // Sessions modal global events
  const sessionsModal = document.getElementById('sessionsModal');
  const sessionsClose = document.getElementById('sessionsClose');

  if (sessionsClose) {
    sessionsClose.addEventListener('click', closeSessionsModal);
  }
  if (sessionsModal) {
    sessionsModal.addEventListener('click', (e) => {
      if (e.target === sessionsModal) closeSessionsModal();
    });
  }

  // Carrega estado e config de ambos bots
  migrateFromSingleBot();
  loadBotState('bot1');
  loadBotState('bot2');
  loadBotConfig('bot1');
  loadBotConfig('bot2');
  loadBotRiskState('bot1');
  loadBotRiskState('bot2');

  // Atualiza UI de ambos bots
  updateConfigUI('bot1');
  updateConfigUI('bot2');
  renderBot('bot1');
  renderBot('bot2');
  updateBotTabBalance('bot1');
  updateBotTabBalance('bot2');
  updateCombinedStats();
}

/**
 * Abre o modo de edição de banca
 */
function toggleBalanceEdit(botId = activeBotTab) {
  const elements = getBotElements(botId);
  const botState = bots[botId].state;

  if (!elements.balanceEditGroup || !elements.balance) return;

  const isEditing = !elements.balanceEditGroup.classList.contains('hidden');

  if (isEditing) {
    // Fecha a edição
    cancelBalanceEdit(botId);
  } else {
    // Abre a edição
    elements.balanceEditGroup.classList.remove('hidden');
    elements.balance.classList.add('hidden');
    elements.balanceEditBtn.classList.add('hidden');

    // Preenche o input com o valor atual
    if (elements.balanceInput) {
      elements.balanceInput.value = botState.balance.toFixed(2);
      elements.balanceInput.focus();
      elements.balanceInput.select();
    }
  }
}

/**
 * Salva a edição de banca
 */
function saveBalanceEdit(botId = activeBotTab) {
  const elements = getBotElements(botId);
  const botState = bots[botId].state;

  if (!elements.balanceInput) return;

  const newBalance = parseFloat(elements.balanceInput.value);

  if (isNaN(newBalance) || newBalance < 0) {
    alert('Por favor, insira um valor válido para a banca.');
    return;
  }

  // Atualiza a banca
  botState.balance = newBalance;
  botState.initialBalance = newBalance;
  botState.minBalance = newBalance;  // Reseta o mínimo ao editar banca manualmente
  botState.maxBalance = newBalance;  // Reseta o máximo ao editar banca manualmente
  saveBotState(botId);

  console.log(`[Bot ${botId}] Banca atualizada: R$ ${newBalance.toFixed(2)}`);

  // Fecha o modo de edição
  cancelBalanceEdit(botId);

  // Atualiza a UI
  renderBot(botId);
  updateBotTabBalance(botId);
}

/**
 * Cancela a edição de banca
 */
function cancelBalanceEdit(botId = activeBotTab) {
  const elements = getBotElements(botId);

  if (elements.balanceEditGroup) {
    elements.balanceEditGroup.classList.add('hidden');
  }
  if (elements.balance) {
    elements.balance.classList.remove('hidden');
  }
  if (elements.balanceEditBtn) {
    elements.balanceEditBtn.classList.remove('hidden');
  }
}

/**
 * Toggle de seção colapsável
 */
function toggleCollapsible(section) {
  if (!section) return;
  section.classList.toggle('collapsed');
}

/**
 * Gera um valor de cashout randomizado
 * Para simular cliques humanos, adiciona um offset aleatório ao valor base
 * @param {number} baseValue - Valor base do cashout
 * @param {number} minOffset - Offset mínimo (padrão 0.03)
 * @param {number} maxOffset - Offset máximo (padrão 0.17)
 */
function randomizeCashout(baseValue, minOffset = 0.03, maxOffset = 0.17) {
  const randomOffset = minOffset + Math.random() * (maxOffset - minOffset);
  return parseFloat((baseValue + randomOffset).toFixed(2));
}

/**
 * Ativa/desativa modo de apostas reais
 * Implementa exclusividade: apenas um bot pode estar em live mode por vez
 */
async function handleLiveModeToggle(botId = activeBotTab) {
  const elements = getBotElements(botId);
  const botState = bots[botId].state;
  const botConfig = bots[botId].config;
  const enabled = elements.liveModeToggle?.checked ?? false;

  if (enabled) {
    // Lê os valores atuais da configuração
    readConfigFromInputs(botId);

    // Pede confirmação antes de ativar
    const totalPerRound = botConfig.betAmount * 2;
    const botLabel = botId === 'bot1' ? 'Bot 1' : 'Bot 2';
    const confirmed = confirm(
      '⚠️ ATENÇÃO: APOSTAS REAIS ⚠️\n\n' +
      `Você está prestes a ativar o modo de apostas REAIS para ${botLabel}.\n` +
      'Isso usará DINHEIRO REAL da sua conta SpinBetter!\n\n' +
      'Configuração atual:\n' +
      '• Valor por aposta: R$ ' + botConfig.betAmount.toFixed(2) + '\n' +
      '• Total por rodada: R$ ' + totalPerRound.toFixed(2) + '\n' +
      '• Cashouts: Automático (baseado nas sequências)\n\n' +
      'Tem certeza que deseja continuar?'
    );

    if (!confirmed) {
      if (elements.liveModeToggle) elements.liveModeToggle.checked = false;
      return;
    }

    // Exclusividade: desativa live mode do outro bot
    const otherBotId = botId === 'bot1' ? 'bot2' : 'bot1';
    const otherBotState = bots[otherBotId].state;
    if (otherBotState.liveMode) {
      otherBotState.liveMode = false;
      saveBotState(otherBotId);
      updateLiveModeUI(otherBotId);
      const otherElements = getBotElements(otherBotId);
      if (otherElements.liveModeToggle) otherElements.liveModeToggle.checked = false;
      console.log(`[Bot ${otherBotId}] Modo live DESATIVADO (exclusividade)`);
      showToast(`Modo live desativado para ${otherBotId === 'bot1' ? 'Bot 1' : 'Bot 2'} (apenas um bot pode estar em live)`);
    }
  }

  try {
    const response = await fetch(`${observerApiUrl}/api/live-betting/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    const result = await response.json();

    if (result.success) {
      botState.liveMode = enabled;
      saveBotState(botId);
      updateLiveModeUI(botId);
      console.log(`[Bot ${botId}] Modo live ${enabled ? 'ATIVADO' : 'desativado'}`);
    } else {
      throw new Error(result.error || 'Erro ao alterar modo live');
    }
  } catch (err) {
    console.error(`[Bot ${botId}] Erro ao alterar modo live:`, err);
    if (elements.liveModeToggle) elements.liveModeToggle.checked = !enabled;
    alert('Erro ao alterar modo live: ' + err.message);
  }
}

/**
 * Exibe uma notificação toast ao usuário
 */
function showToast(message, duration = 3000) {
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Atualiza UI do modo live
 */
function updateLiveModeUI(botId = activeBotTab) {
  const elements = getBotElements(botId);
  const botState = bots[botId].state;

  if (botState.liveMode) {
    if (elements.liveModeLabel) {
      elements.liveModeLabel.textContent = 'Conta Real Ativa';
      elements.liveModeLabel.classList.add('active');
    }
    if (elements.liveModeWarning) {
      elements.liveModeWarning.classList.remove('hidden');
    }
    if (elements.accountType) {
      elements.accountType.classList.add('live');
    }
    if (elements.accountLabel) {
      elements.accountLabel.textContent = 'Conta Real';
    }
    const accountIcon = elements.accountType?.querySelector('.account-icon');
    if (accountIcon) {
      accountIcon.textContent = '$';
    }
  } else {
    if (elements.liveModeLabel) {
      elements.liveModeLabel.textContent = 'Usar Conta Real';
      elements.liveModeLabel.classList.remove('active');
    }
    if (elements.liveModeWarning) {
      elements.liveModeWarning.classList.add('hidden');
    }
    if (elements.accountType) {
      elements.accountType.classList.remove('live');
    }
    if (elements.accountLabel) {
      elements.accountLabel.textContent = 'Simulacao';
    }
    const accountIcon = elements.accountType?.querySelector('.account-icon');
    if (accountIcon) {
      accountIcon.textContent = 'T';
    }
  }
}

/**
 * Configura tabs do simulador
 */
function setupSimulatorTabs() {
  const tabs = document.querySelectorAll('.sim-tab');
  const contents = document.querySelectorAll('.sim-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Remove active de todas as tabs
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Ativa a tab clicada
      tab.classList.add('active');
      const targetContent = document.getElementById(`tab${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      // Se for a tab do bot, atualiza a análise para o bot ativo
      if (targetTab === 'bot' && bots[activeBotTab].state.active) {
        updateBotDecision(activeBotTab);
      }
    });
  });

  // Por padrão, ativar a aba do Bot Automático (em vez de Manual)
  const botTab = document.querySelector('.sim-tab[data-tab="bot"]');
  const manualTab = document.querySelector('.sim-tab[data-tab="manual"]');
  const botContent = document.getElementById('tabBot');
  const manualContent = document.getElementById('tabManual');

  if (botTab && manualTab && botContent && manualContent) {
    manualTab.classList.remove('active');
    manualContent.classList.remove('active');
    botTab.classList.add('active');
    botContent.classList.add('active');
  }
}

/**
 * Liga/desliga o bot
 */
async function toggleBot(botId = activeBotTab) {
  const botState = bots[botId].state;
  botState.active = !botState.active;

  if (botState.active) {
    console.log(`[Bot ${botId}] Ativado!`);

    // Se está em modo live, precisa ativar o live betting no backend
    if (botState.liveMode) {
      try {
        console.log(`[Bot ${botId}] Ativando live betting no backend...`);
        const response = await fetch(`${observerApiUrl}/api/live-betting/enable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true })
        });

        const result = await response.json();

        if (!result.success) {
          console.error(`[Bot ${botId}] Erro ao ativar live betting:`, result.error);
          botState.active = false;
          alert('Erro ao ativar apostas reais: ' + (result.error || 'Erro desconhecido'));
          renderBot(botId);
          return;
        }

        console.log(`[Bot ${botId}] Live betting ativado no backend com sucesso!`);

        // Sincroniza o saldo da plataforma (obrigatório antes de iniciar)
        const synced = await syncPlatformBalance(botId);
        if (!synced) {
          console.warn(`[Bot ${botId}] Não foi possível sincronizar saldo, usando valor atual`);
        }
      } catch (err) {
        console.error(`[Bot ${botId}] Erro ao ativar live betting:`, err);
        botState.active = false;
        alert('Erro ao conectar com o servidor de apostas reais');
        renderBot(botId);
        return;
      }
    }

    updateBotDecision(botId);
  } else {
    console.log(`[Bot ${botId}] Desativado`);
    // Cancela aposta pendente se houver (devolve o valor apostado)
    if (botState.activeBet) {
      const refund = botState.activeBet.amount * 2;
      botState.balance += refund;
      // Atualiza maxBalance se necessário
      if (botState.balance > botState.maxBalance) {
        botState.maxBalance = botState.balance;
      }
      console.log(`[Bot ${botId}] Aposta cancelada, devolvido: ${formatCurrency(refund)}`);
      console.log(`[Bot ${botId}] Saldo após devolução: ${formatCurrency(botState.balance)}`);
      botState.activeBet = null;
    }

    // Se estava em modo live, desativa no backend também
    if (botState.liveMode) {
      try {
        await fetch(`${observerApiUrl}/api/live-betting/enable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false })
        });
        console.log(`[Bot ${botId}] Live betting desativado no backend`);
      } catch (err) {
        console.error(`[Bot ${botId}] Erro ao desativar live betting:`, err);
      }
    }
  }

  saveBotState(botId);
  renderBot(botId);
  updateBotTabBalance(botId);
}

/**
 * Reseta o bot
 */
function resetBot(botId = activeBotTab) {
  const botState = bots[botId].state;
  const hasHistory = botState.stats.totalBets > 0;

  let message = `Tem certeza que deseja resetar o ${botId === 'bot1' ? 'Bot 1' : 'Bot 2'}?`;
  if (hasHistory) {
    message += '\n\nA sessão atual será ARQUIVADA antes do reset.';
  }

  if (!confirm(message)) {
    return;
  }

  // Arquiva a sessão atual antes de resetar
  if (hasHistory) {
    const archived = archiveCurrentSession(botId);
    if (archived) {
      console.log(`[Bot ${botId}] Sessão arquivada com sucesso`);
    }
  }

  // Cria novo estado usando a factory
  bots[botId].state = createBotState(botId);

  saveBotState(botId);

  // Reseta estado de gestão de risco também
  resetBotRiskState(botId);

  renderBot(botId);
  updateBotTabBalance(botId);
  console.log(`[Bot ${botId}] Resetado - Nova sessão iniciada`);
}

/**
 * Analisa as sequências e decide se deve apostar
 * Retorna: { shouldBet, reasons, targetCashout2, betSize, cashout1Info }
 */
function analyzeBotDecision(botId = 'bot1') {
  const botData = bots[botId];
  const botState = botData.state;
  const botConfig = botData.config;
  const mlConfig = botConfig.mlConfig;

  // ========== VERIFICAÇÃO DE RISCO PRIMEIRO ==========
  const riskCheck = checkRiskRules(botId);
  if (!riskCheck.canBet) {
    return {
      shouldBet: false,
      reasons: riskCheck.issues,
      targetCashout2: botConfig.cashout2Default,
      isHighOpportunity: false,
      riskBlocked: true,
      mlDecision: null
    };
  }

  // ========== AVALIAÇÃO ML ==========
  const mlDecision = evaluateMLDecision(botId);

  // Se ML bloqueia a aposta, retorna imediatamente
  if (mlConfig.enabled && !mlDecision.canBet) {
    return {
      shouldBet: false,
      reasons: mlDecision.reasons,
      targetCashout2: botConfig.cashout2Default,
      isHighOpportunity: false,
      mlBlocked: true,
      mlDecision
    };
  }

  // Se ML requer e não está disponível
  if (mlConfig.enabled && mlConfig.requireML && !mlDecision.mlAvailable) {
    return {
      shouldBet: false,
      reasons: ['ML indisponível (requerido para este bot)'],
      targetCashout2: botConfig.cashout2Default,
      isHighOpportunity: false,
      mlDecision
    };
  }

  if (!advancedStats || !advancedStats.sequenceAnalysis) {
    return {
      shouldBet: false,
      reasons: ['Dados insuficientes para análise'],
      targetCashout2: botConfig.cashout2Default,
      isHighOpportunity: false,
      mlDecision
    };
  }

  const seq = advancedStats.sequenceAnalysis;
  const reasons = [];
  let shouldBet = false;
  let targetCashout2 = botConfig.cashout2Default;
  let isHighOpportunity = false;

  // Calcula tamanho ideal da aposta e primeiro cashout
  let betSizeInfo = calculateOptimalBetSize(botId);
  const cashout1Info = calculateOptimalCashout1(botId);

  // ========== APLICA AJUSTES ML NO TAMANHO DA APOSTA ==========
  if (mlConfig.enabled && mlDecision.mlAvailable && mlDecision.adjustments.betMultiplier !== 1.0) {
    const mlMultiplier = mlDecision.adjustments.betMultiplier;
    const adjustedAmount = Math.max(
      RISK_CONFIG.minBetAmount,
      Math.round(betSizeInfo.amount * mlMultiplier * 100) / 100
    );
    betSizeInfo = {
      ...betSizeInfo,
      amount: adjustedAmount,
      mlMultiplier,
      mlAdjusted: true
    };
  }

  // Extrai dados das sequências
  const seq2x = seq.below2x || { currentStreak: 0, avgRoundsToHit: 2, deviationRatio: 0, status: 'normal' };
  const seq5x = seq.below5x || { currentStreak: 0, avgRoundsToHit: 5, deviationRatio: 0, status: 'normal' };
  const seq10x = seq.below10x || { currentStreak: 0, avgRoundsToHit: 10, deviationRatio: 0, status: 'normal' };
  const seq15x = seq.below15x || { currentStreak: 0, avgRoundsToHit: 15, deviationRatio: 0, status: 'normal' };
  const seq20x = seq.below20x || { currentStreak: 0, avgRoundsToHit: 20, deviationRatio: 0, status: 'normal' };

  // Status das sequências
  const is2xAboveAvg = seq2x.status === 'due' || seq2x.status === 'overdue';
  const is5xAboveAvg = seq5x.status === 'due' || seq5x.status === 'overdue';
  const is10xAboveAvg = seq10x.status === 'due' || seq10x.status === 'overdue';
  const is15xAboveAvg = seq15x.status === 'due' || seq15x.status === 'overdue';
  const is20xAboveAvg = seq20x.status === 'due' || seq20x.status === 'overdue';

  // ========================================
  // REGRA 1: Ciclo Adaptável (10x + 15x + 20x todos acima da média)
  // ========================================
  const shouldActivateCycle = is10xAboveAvg && is15xAboveAvg && is20xAboveAvg;

  // Log de diagnóstico das condições
  console.log(`[Bot ${botId}] Análise de condições:`, {
    '2x': { status: seq2x.status, aboveAvg: is2xAboveAvg },
    '5x': { status: seq5x.status, aboveAvg: is5xAboveAvg },
    '10x': { status: seq10x.status, aboveAvg: is10xAboveAvg },
    '15x': { status: seq15x.status, aboveAvg: is15xAboveAvg },
    '20x': { status: seq20x.status, aboveAvg: is20xAboveAvg },
    shouldActivateCycle,
    cycleActive: botState.adaptiveCycle.active
  });

  // Se o ciclo estava ativo mas as condições não são mais válidas, reseta
  const hasPendingCycleBet = botState.activeBet && botState.activeBet.isHighOpportunity;
  if (botState.adaptiveCycle.active && !shouldActivateCycle && !hasPendingCycleBet) {
    console.log(`[Bot ${botId}] Ciclo adaptável DESATIVADO - condições não são mais válidas`);
    botState.adaptiveCycle.active = false;
    botState.adaptiveCycle.currentTarget = 15;
    botState.adaptiveCycle.attemptsAtCurrentTarget = 0;
    botState.adaptiveCycle.totalCycleAttempts = 0;
    saveBotState(botId);
  }

  if (shouldActivateCycle) {
    shouldBet = true;
    isHighOpportunity = true;

    // Ativa o ciclo se ainda não estiver ativo
    if (!botState.adaptiveCycle.active) {
      botState.adaptiveCycle.active = true;
      botState.adaptiveCycle.attemptsAtCurrentTarget = 0;
      botState.adaptiveCycle.totalCycleAttempts = 0;
      console.log(`[Bot ${botId}] Ciclo adaptável ATIVADO - 10x/15x/20x acima da média`);
    }

    // ====================================================
    // DETERMINA O ALVO BASEADO NAS CONDIÇÕES DE 2x E 5x
    // ====================================================
    let cycleTarget;
    let targetReason;

    if (is2xAboveAvg && is5xAboveAvg) {
      cycleTarget = 15;
      targetCashout2 = botConfig.cashout2VeryHigh;
      targetReason = '2x E 5x acima da média -> alvo 15x';
    } else if (is2xAboveAvg || is5xAboveAvg) {
      cycleTarget = 10;
      targetCashout2 = botConfig.cashout2High;
      targetReason = `${is2xAboveAvg ? '2x' : '5x'} acima da média -> alvo 10x`;
    } else {
      cycleTarget = 7;
      targetCashout2 = botConfig.cashout2Medium;
      targetReason = '2x e 5x normais -> alvo 7x';
    }

    // Atualiza o alvo atual do ciclo
    botState.adaptiveCycle.currentTarget = cycleTarget;

    // Informações do ciclo
    const attemptNum = botState.adaptiveCycle.totalCycleAttempts + 1;

    reasons.push(`10x/15x/20x TODOS ACIMA DA MEDIA`);
    reasons.push(`10x: ${seq10x.currentStreak}/${Math.round(seq10x.avgRoundsToHit)} (${seq10x.status})`);
    reasons.push(`15x: ${seq15x.currentStreak}/${Math.round(seq15x.avgRoundsToHit)} (${seq15x.status})`);
    reasons.push(`20x: ${seq20x.currentStreak}/${Math.round(seq20x.avgRoundsToHit)} (${seq20x.status})`);
    reasons.push(`---`);
    reasons.push(`2x: ${seq2x.currentStreak}/${Math.round(seq2x.avgRoundsToHit)} (${seq2x.status}) ${is2xAboveAvg ? 'OK' : 'X'}`);
    reasons.push(`5x: ${seq5x.currentStreak}/${Math.round(seq5x.avgRoundsToHit)} (${seq5x.status}) ${is5xAboveAvg ? 'OK' : 'X'}`);
    reasons.push(`${targetReason}`);
    reasons.push(`Tentativa #${attemptNum} -> cashout ${cycleTarget}x`);

  // ========================================
  // REGRA 2: Aposta Padrão (2x OU 5x acima da média)
  // ========================================
  } else if (is2xAboveAvg || is5xAboveAvg) {
    shouldBet = true;
    targetCashout2 = botConfig.cashout2Default;

    if (is2xAboveAvg) {
      const icon = seq2x.status === 'overdue' ? '[!]' : '[OK]';
      reasons.push(`${icon} 2x ${seq2x.status.toUpperCase()}: ${seq2x.currentStreak} rodadas (média: ${Math.round(seq2x.avgRoundsToHit)})`);
    }
    if (is5xAboveAvg) {
      const icon = seq5x.status === 'overdue' ? '[!]' : '[OK]';
      reasons.push(`${icon} 5x ${seq5x.status.toUpperCase()}: ${seq5x.currentStreak} rodadas (média: ${Math.round(seq5x.avgRoundsToHit)})`);
    }
    reasons.push(`-> Aposta padrão: ~2.10x e ~5.10x`);

  // ========================================
  // NÃO APOSTAR: Aguardando condições (Sequências)
  // ========================================
  } else {
    // Verifica se ML deve fazer override das sequências
    const mlOverride = shouldMLOverrideSequences(botId);

    if (mlConfig.enabled && mlOverride.shouldOverride && mlDecision.shouldBet === true) {
      // ML confia o suficiente para apostar mesmo sem sequências favoráveis
      shouldBet = true;
      reasons.push(`[ML OVERRIDE] ${mlOverride.reason}`);
      reasons.push(`2x: ${seq2x.status} (${seq2x.currentStreak}/${Math.round(seq2x.avgRoundsToHit)}) - ignorado pelo ML`);
      reasons.push(`5x: ${seq5x.status} (${seq5x.currentStreak}/${Math.round(seq5x.avgRoundsToHit)}) - ignorado pelo ML`);

      // Usa cashout recomendado pelo ML
      if (mlDecision.adjustments.recommendedCashout) {
        targetCashout2 = mlDecision.adjustments.recommendedCashout.cashout;
        reasons.push(`Cashout ML: ${targetCashout2}x`);
      }
    } else {
      // Comportamento normal - não aposta
      reasons.push(`2x: ${seq2x.status} (${seq2x.currentStreak}/${Math.round(seq2x.avgRoundsToHit)})`);
      reasons.push(`5x: ${seq5x.status} (${seq5x.currentStreak}/${Math.round(seq5x.avgRoundsToHit)})`);
      reasons.push('-> Aguardando 2x ou 5x ficar overdue');

      // Se ML recomenda não apostar, mostra o motivo
      if (mlConfig.enabled && mlDecision.mlAvailable && mlDecision.shouldBet === false) {
        reasons.push(`---`);
        reasons.push(`[ML] Não recomenda aposta`);
        mlDecision.reasons.slice(0, 2).forEach(r => reasons.push(`  ${r}`));
      }
    }
  }

  // ========== AJUSTE FINAL DE CASHOUT PELO ML ==========
  // Se ML está ativo e tem recomendação de cashout, pode ajustar
  if (shouldBet && mlConfig.enabled && mlDecision.mlAvailable) {
    const mlCashout = mlDecision.adjustments.recommendedCashout;
    if (mlCashout && !isHighOpportunity) {
      // Para apostas normais (não ciclo), ML pode sugerir cashout
      // Usa o maior entre o sugerido pelo ML e o padrão
      if (mlCashout.cashout > targetCashout2) {
        targetCashout2 = mlCashout.cashout;
      }
    }
  }

  // Adiciona informações de gestão de risco quando vai apostar
  if (shouldBet) {
    reasons.push(`---`);
    reasons.push(`Aposta: ${formatCurrency(betSizeInfo.amount)} x2 = ${formatCurrency(betSizeInfo.amount * 2)}`);
    if (betSizeInfo.isReduced) {
      reasons.push(`${betSizeInfo.reasons.join(', ')}`);
    }
    if (betSizeInfo.mlAdjusted) {
      reasons.push(`[ML] Ajuste: ${((betSizeInfo.mlMultiplier - 1) * 100).toFixed(0)}%`);
    }
    reasons.push(`Cashout 1: ${cashout1Info.base}x (${cashout1Info.reason})`);

    // Mostra status de risco
    const riskStats = getRiskStats(botId);
    if (riskStats.consecutiveLosses > 0) {
      reasons.push(`Perdas seguidas: ${riskStats.consecutiveLosses}`);
    }

    // Mostra status ML
    if (mlConfig.enabled && mlDecision.mlAvailable) {
      const prob2x = (mlPrediction.prob_gt_2x * 100).toFixed(0);
      reasons.push(`[ML] Prob 2x: ${prob2x}%`);
    }
  }

  return {
    shouldBet,
    reasons,
    targetCashout2,
    isHighOpportunity,
    betSizeInfo,
    cashout1Info,
    mlDecision
  };
}

/**
 * Atualiza a decisão do bot e renderiza
 */
function updateBotDecision(botId = activeBotTab) {
  const botState = bots[botId].state;
  const decision = analyzeBotDecision(botId);
  botState.lastDecision = decision;
  renderBotDecision(decision, botId);
}

/**
 * Renderiza a decisão do bot
 */
function renderBotDecision(decision, botId = activeBotTab) {
  const elements = getBotElements(botId);
  const botState = bots[botId].state;

  if (!elements.decision || !elements.decisionContent) return;

  // Remove classes anteriores
  elements.decision.classList.remove('should-bet', 'should-wait', 'high-opportunity', 'inactive');

  // Se não há decisão ainda (sem dados), mostra mensagem de espera
  if (!decision || !decision.reasons || decision.reasons.length === 0) {
    elements.decisionContent.innerHTML = '<p class="bot-waiting">Aguardando dados...</p>';
    return;
  }

  // Define classe do box
  if (!botState.active) {
    elements.decision.classList.add('inactive');
  } else if (decision.isHighOpportunity) {
    elements.decision.classList.add('high-opportunity');
  } else if (decision.shouldBet) {
    elements.decision.classList.add('should-bet');
  } else {
    elements.decision.classList.add('should-wait');
  }

  // Monta HTML
  let actionClass = decision.shouldBet ? (decision.isHighOpportunity ? 'high' : 'bet') : 'wait';
  let actionText = decision.shouldBet ? (decision.isHighOpportunity ? 'OPORTUNIDADE RARA!' : 'APOSTAR') : 'AGUARDAR';

  // Se bot inativo, mostra indicador
  let inactiveNotice = '';
  if (!botState.active) {
    inactiveNotice = '<div class="decision-inactive-notice">⏸ Bot desativado - apenas análise</div>';
  }

  let html = `
    ${inactiveNotice}
    <div class="decision-action ${actionClass}">
      <span>${actionText}</span>
    </div>
    <div class="decision-reasons">
      ${decision.reasons.map(r => {
        let reasonClass = '';
        if (r.includes('[OK]') || r.includes('ACIMA')) reasonClass = 'positive';
        else if (r.includes('->') || r.includes('Aposta')) reasonClass = 'highlight';
        return `<div class="decision-reason ${reasonClass}">${r}</div>`;
      }).join('')}
    </div>
  `;

  if (decision.shouldBet) {
    html += `
      <div class="decision-target">
        Aposta 1: <strong>~2.10x</strong> | Aposta 2: <strong>~${decision.targetCashout2}x</strong>
      </div>
    `;
  }

  elements.decisionContent.innerHTML = html;
}

/**
 * Coloca aposta automática do bot
 */
async function placeBotBet(botId, decision) {
  const botState = bots[botId].state;
  const botConfig = bots[botId].config;

  console.log(`[Bot ${botId}] placeBotBet chamado. Estado:`, {
    active: botState.active,
    hasActiveBet: !!botState.activeBet,
    shouldBet: decision?.shouldBet,
    liveMode: botState.liveMode,
    balanceAtual: botState.balance
  });

  if (!botState.active) {
    console.log(`[Bot ${botId}] Aposta ignorada: bot não está ativo`);
    return;
  }
  if (botState.activeBet) {
    console.log(`[Bot ${botId}] Aposta ignorada: já existe aposta ativa`);
    return;
  }
  if (!decision.shouldBet) {
    console.log(`[Bot ${botId}] Aposta ignorada: decisão é não apostar`);
    return;
  }

  // Usa tamanho de aposta dinâmico baseado em gestão de risco
  const betAmount = decision.betSizeInfo ? decision.betSizeInfo.amount : botConfig.betAmount;
  const totalAmount = betAmount * 2;
  console.log(`[Bot ${botId}] COLOCANDO APOSTA: R$ ${totalAmount} (Saldo antes: ${formatCurrency(botState.balance)})`);

  // Usa primeiro cashout dinâmico baseado em condições
  const randomCashout1 = decision.cashout1Info ? decision.cashout1Info.cashout : randomizeCashout(2.0, 0.01, 0.05);
  // Para o segundo cashout, usa o valor base da decisão e randomiza
  const baseCashout2 = decision.targetCashout2;
  const randomCashout2 = randomizeCashout(baseCashout2);

  console.log(`[Bot ${botId}] Cashouts: ${randomCashout1}x (base ${decision.cashout1Info?.base || 2.0}) e ${randomCashout2}x (base ${baseCashout2})`);
  if (decision.betSizeInfo?.isReduced) {
    console.log(`[Bot ${botId}] Aposta REDUZIDA: ${decision.betSizeInfo.reasons.join(', ')}`);
  }

  // Se está em modo live, faz aposta real
  if (botState.liveMode) {
    try {
      console.log(`[Bot ${botId}] Colocando aposta REAL: R$${totalAmount} | Alvos: ${randomCashout1}x e ${randomCashout2}x`);

      const response = await fetch(`${observerApiUrl}/api/live-betting/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount1: betAmount,
          cashout1: randomCashout1,
          amount2: betAmount,
          cashout2: randomCashout2
        })
      });

      const result = await response.json();

      if (!result.success) {
        console.error(`[Bot ${botId}] Erro ao colocar aposta real:`, result.error);
        return;
      }

      console.log(`[Bot ${botId}] Aposta REAL colocada com sucesso!`);
    } catch (err) {
      console.error(`[Bot ${botId}] Erro ao colocar aposta real:`, err);
      return;
    }
  }

  // Registra aposta (simulação ou tracking de aposta real)
  botState.activeBet = {
    amount: betAmount,
    cashout1: randomCashout1,
    cashout2: randomCashout2,
    baseCashout2: baseCashout2,
    baseCashout1: decision.cashout1Info?.base || 2.0,
    isHighOpportunity: decision.isHighOpportunity,
    isLive: botState.liveMode,
    isReducedBet: decision.betSizeInfo?.isReduced || false
  };

  // SEMPRE debita do saldo ao colocar aposta
  const balanceBefore = botState.balance;
  botState.balance -= totalAmount;

  // Atualiza o saldo mínimo se necessário
  if (botState.balance < botState.minBalance) {
    botState.minBalance = botState.balance;
  }

  console.log(`[Bot ${botId}] SALDO: ${formatCurrency(balanceBefore)} -> ${formatCurrency(botState.balance)} (-${formatCurrency(totalAmount)})`);

  saveBotState(botId);
  renderBot(botId);
  updateBotTabBalance(botId);
}

/**
 * Busca o histórico de apostas real da plataforma (para modo live)
 */
async function fetchPlatformHistory() {
  try {
    const response = await fetch(`${observerApiUrl}/api/live-betting/history?limit=10`);
    const result = await response.json();

    if (result.success && result.history) {
      return result.history;
    }
    return [];
  } catch (err) {
    console.error('[Bot] Erro ao buscar histórico da plataforma:', err);
    return [];
  }
}

/**
 * Resolve a aposta do bot com o resultado da rodada
 * Em modo live, busca os dados reais da plataforma
 */
async function resolveBotBet(botId, roundMultiplier) {
  const botState = bots[botId].state;

  if (!botState.activeBet) return;

  const bet = botState.activeBet;
  const betAmount = bet.amount;
  const totalBet = betAmount * 2;
  let winnings = 0;
  let won1 = false;
  let won2 = false;
  let realCashout1 = 0;
  let realCashout2 = 0;

  // Em modo LIVE, busca os dados reais da plataforma
  if (bet.isLive) {
    console.log(`[Bot ${botId}] Modo LIVE: Buscando dados reais da plataforma...`);

    await new Promise(r => setTimeout(r, 1000));
    const platformHistory = await fetchPlatformHistory();

    if (platformHistory.length >= 2) {
      const bet1Data = platformHistory[0];
      const bet2Data = platformHistory[1];

      console.log(`[Bot ${botId}] Dados da plataforma:`, { bet1: bet1Data, bet2: bet2Data });

      won1 = bet1Data.isWin;
      won2 = bet2Data.isWin;
      realCashout1 = bet1Data.cashoutMultiplier;
      realCashout2 = bet2Data.cashoutMultiplier;
      winnings = bet1Data.winAmount + bet2Data.winAmount;

      console.log(`[Bot ${botId}] Resultados REAIS: Aposta1=${won1 ? 'GANHOU' : 'PERDEU'}, Aposta2=${won2 ? 'GANHOU' : 'PERDEU'}, Total=${formatCurrency(winnings)}`);
    } else {
      console.warn(`[Bot ${botId}] Não foi possível obter dados reais, usando cálculo simulado`);
      won1 = roundMultiplier >= bet.cashout1;
      won2 = roundMultiplier >= bet.cashout2;
      if (won1) winnings += betAmount * bet.cashout1;
      if (won2) winnings += betAmount * bet.cashout2;
    }
  } else {
    // Modo simulação
    won1 = roundMultiplier >= bet.cashout1;
    won2 = roundMultiplier >= bet.cashout2;

    if (won1) {
      winnings += betAmount * bet.cashout1;
      realCashout1 = bet.cashout1;
    }
    if (won2) {
      winnings += betAmount * bet.cashout2;
      realCashout2 = bet.cashout2;
    }
  }

  const profit = winnings - totalBet;

  // Adiciona os ganhos ao saldo
  const balanceBefore = botState.balance;
  botState.balance += winnings;

  // Atualiza maxBalance se necessário
  if (botState.balance > botState.maxBalance) {
    botState.maxBalance = botState.balance;
  }

  console.log(`[Bot ${botId}] RESULTADO: Mult=${roundMultiplier}x | Ganho=${formatCurrency(winnings)} | Lucro=${formatCurrency(profit)} | Saldo: ${formatCurrency(balanceBefore)} -> ${formatCurrency(botState.balance)}`);

  // Considera vitória se teve lucro positivo
  const won = profit > 0;

  // Atualiza estatísticas
  botState.stats.totalBets++;
  botState.stats.totalWagered += totalBet;
  botState.stats.totalProfit += profit;

  if (won) {
    botState.stats.wins++;
  } else {
    botState.stats.losses++;
  }

  // Atualiza estado de gestão de risco
  updateRiskStateAfterBet(botId, won, profit);

  // Determina resultado
  let resultText;
  if (won1 && won2) {
    resultText = 'JACKPOT';
  } else if (won1 || won2) {
    resultText = 'PARCIAL';
  } else {
    resultText = 'PERDA';
  }

  // Adiciona ao histórico
  botState.history.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    multiplier: roundMultiplier,
    cashout1: bet.cashout1,
    cashout2: bet.cashout2,
    won1,
    won2,
    profit,
    balance: botState.balance,
    resultText,
    isHighOpportunity: bet.isHighOpportunity
  });

  // Atualiza ciclo adaptável se a aposta foi do ciclo
  if (bet.isHighOpportunity && botState.adaptiveCycle.active) {
    updateAdaptiveCycle(botId, won2, roundMultiplier);
  }

  // Limpa aposta ativa
  botState.activeBet = null;

  saveBotState(botId);
  renderBot(botId);
  updateBotTabBalance(botId);

  // Sincroniza saldo com a plataforma após cada aposta (modo live)
  if (botState.liveMode) {
    setTimeout(() => syncPlatformBalance(botId), 1000);
  }
}

/**
 * Atualiza o ciclo adaptável baseado no resultado da aposta
 */
function updateAdaptiveCycle(botId, hitTarget, multiplier) {
  const botState = bots[botId].state;
  const cycle = botState.adaptiveCycle;
  const currentTarget = cycle.currentTarget;

  cycle.totalCycleAttempts++;

  console.log(`[Bot ${botId}] Ciclo adaptável - Tentativa #${cycle.totalCycleAttempts} (alvo era ${currentTarget}x)`);

  if (hitTarget) {
    console.log(`[Bot ${botId}] ACERTOU ${currentTarget}x na rodada ${multiplier}x! Ciclo resetado.`);
    cycle.active = false;
    cycle.currentTarget = 15;
    cycle.attemptsAtCurrentTarget = 0;
    cycle.totalCycleAttempts = 0;
    cycle.lastHitTarget = currentTarget;
  } else {
    console.log(`[Bot ${botId}] Não atingiu ${currentTarget}x (mult: ${multiplier}x). Total: ${cycle.totalCycleAttempts}`);
  }
}

/**
 * Atualiza o saldo exibido na aba do bot
 */
function updateBotTabBalance(botId) {
  const botState = bots[botId].state;
  const tabBalanceEl = document.getElementById(`${botId}TabBalance`);
  if (tabBalanceEl) {
    tabBalanceEl.textContent = formatCurrency(botState.balance);
  }
  // Atualiza também as estatísticas combinadas
  updateCombinedStats();
}

/**
 * Atualiza estatísticas combinadas dos dois bots
 */
function updateCombinedStats() {
  const stats = getCombinedStats();
  const combinedBalanceEl = document.getElementById('combinedBalance');
  const combinedProfitEl = document.getElementById('combinedProfit');

  if (combinedBalanceEl) {
    combinedBalanceEl.textContent = formatCurrency(stats.totalBalance);
  }
  if (combinedProfitEl) {
    combinedProfitEl.textContent = formatCurrency(stats.totalProfit);
    combinedProfitEl.className = stats.totalProfit >= 0 ? 'positive' : 'negative';
  }
}

/**
 * Renderiza o bot
 */
function renderBot(botId = activeBotTab) {
  const elements = getBotElements(botId);
  const botState = bots[botId].state;

  if (!elements.balance) return;

  // Status
  if (elements.statusIndicator) {
    elements.statusIndicator.classList.toggle('active', botState.active);
    elements.statusIndicator.classList.toggle('live', botState.active && botState.liveMode);
  }
  if (elements.statusText) {
    let statusText = botState.active ? 'Ativo' : 'Desativado';
    if (botState.active && botState.liveMode) {
      statusText = 'LIVE';
    }
    elements.statusText.textContent = statusText;
  }
  if (elements.toggleBtn) {
    elements.toggleBtn.textContent = botState.active ? 'Desativar Bot' : 'Ativar Bot';
    elements.toggleBtn.classList.toggle('active', botState.active);
  }

  // Indicação visual quando bot ativo (apenas se for o bot visível)
  if (botId === activeBotTab) {
    const simulatorSection = document.querySelector('.simulator-section');
    const statusBar = document.querySelector('.bot-status-bar');
    const runningBadge = document.getElementById('botRunningBadge');

    if (simulatorSection) {
      simulatorSection.classList.toggle('bot-running', botState.active);
      simulatorSection.classList.toggle('live-mode', botState.active && botState.liveMode);
    }

    if (statusBar) {
      statusBar.classList.toggle('bot-active', botState.active);
      statusBar.classList.toggle('live-mode', botState.active && botState.liveMode);
    }

    if (runningBadge) {
      runningBadge.classList.toggle('live', botState.liveMode);
      runningBadge.textContent = botState.liveMode ? 'BOT LIVE' : 'BOT ATIVO';
    }
  }

  // Live mode UI
  updateLiveModeUI(botId);
  if (elements.liveModeToggle) {
    elements.liveModeToggle.checked = botState.liveMode;
  }

  // Banca
  elements.balance.textContent = formatCurrency(botState.balance);
  elements.balance.className = `balance-value ${botState.balance >= botState.initialBalance ? 'positive' : 'negative'}`;

  // Estatísticas
  if (elements.totalBets) {
    elements.totalBets.textContent = botState.stats.totalBets;
  }
  if (elements.wins) {
    const winRate = botState.stats.totalBets > 0 ? ((botState.stats.wins / botState.stats.totalBets) * 100).toFixed(1) : 0;
    elements.wins.textContent = `${botState.stats.wins} (${winRate}%)`;
  }
  if (elements.profit) {
    const profitClass = botState.stats.totalProfit >= 0 ? 'positive' : 'negative';
    elements.profit.textContent = formatCurrency(botState.stats.totalProfit);
    elements.profit.className = `sim-stat-value ${profitClass}`;
  }
  if (elements.roi) {
    const roi = botState.stats.totalWagered > 0 ? ((botState.stats.totalProfit / botState.stats.totalWagered) * 100).toFixed(1) : 0;
    elements.roi.textContent = `${roi}%`;
    elements.roi.className = `sim-stat-value ${parseFloat(roi) >= 0 ? 'positive' : 'negative'}`;
  }
  if (elements.minBalance) {
    elements.minBalance.textContent = formatCurrency(botState.minBalance);
    // Destacar em vermelho se chegou perto de quebrar (menos de 20% da banca inicial)
    const dangerThreshold = botState.initialBalance * 0.2;
    elements.minBalance.className = `sim-stat-value ${botState.minBalance <= dangerThreshold ? 'negative' : ''}`;
  }
  if (elements.maxBalance) {
    elements.maxBalance.textContent = formatCurrency(botState.maxBalance);
    // Destacar em verde se teve ganho significativo (mais de 20% acima do inicial)
    const successThreshold = botState.initialBalance * 1.2;
    elements.maxBalance.className = `sim-stat-value ${botState.maxBalance >= successThreshold ? 'positive' : ''}`;
  }
  if (elements.initialBalanceEl) {
    elements.initialBalanceEl.textContent = formatCurrency(botState.initialBalance);
  }

  // Aposta ativa
  if (elements.activeBet) {
    if (botState.activeBet) {
      elements.activeBet.classList.remove('hidden');
      if (elements.betStatus) {
        elements.betStatus.textContent = 'Aguardando resultado...';
      }
      if (elements.betDetails) {
        const betAmount = botState.activeBet.amount;
        const totalBet = betAmount * 2;
        const maxWin = betAmount * botState.activeBet.cashout1 + betAmount * botState.activeBet.cashout2;
        elements.betDetails.innerHTML = `
          <div class="bot-bet-row">
            <span>Aposta 1:</span>
            <span>${formatCurrency(betAmount)} @ ${botState.activeBet.cashout1}x</span>
          </div>
          <div class="bot-bet-row">
            <span>Aposta 2:</span>
            <span>${formatCurrency(betAmount)} @ ${botState.activeBet.cashout2}x</span>
          </div>
          <div class="bot-bet-row">
            <span>Total apostado:</span>
            <span>${formatCurrency(totalBet)}</span>
          </div>
          <div class="bot-bet-row target-highlight">
            <span>Ganho máximo:</span>
            <span>${formatCurrency(maxWin)}</span>
          </div>
        `;
      }
    } else {
      elements.activeBet.classList.add('hidden');
    }
  }

  // Histórico
  renderBotHistory(botId);

  // Atualiza saldo na aba
  updateBotTabBalance(botId);
}

/**
 * Renderiza histórico do bot
 */
function renderBotHistory(botId = activeBotTab) {
  const elements = getBotElements(botId);
  const botState = bots[botId].state;

  if (!elements.historyList) return;

  if (botState.history.length === 0) {
    elements.historyList.innerHTML = '<p class="no-history">Nenhuma aposta ainda</p>';
    return;
  }

  // Mostra as últimas 20 apostas (mais recentes primeiro)
  const recent = botState.history.slice(-20).reverse();

  elements.historyList.innerHTML = recent.map(h => {
    let resultClass = 'loss';
    if (h.won1 && h.won2) resultClass = 'win';
    else if (h.won1 || h.won2) resultClass = 'partial';

    return `
      <div class="history-item ${resultClass}">
        <div class="history-main">
          <span class="history-result">${h.resultText}${h.isHighOpportunity ? ' [!]' : ''}</span>
          <span class="history-multiplier">${h.multiplier.toFixed(2)}x</span>
        </div>
        <div class="history-details">
          <span class="history-mode">Bot</span>
          <span class="history-amount">${h.cashout1}x/${h.cashout2}x</span>
          <span class="history-profit ${h.profit >= 0 ? 'win' : 'loss'}">${h.profit >= 0 ? '+' : ''}${formatCurrency(h.profit)}</span>
        </div>
        <div class="history-time">${formatTime(h.timestamp)}</div>
      </div>
    `;
  }).join('');
}

/**
 * Processa nova rodada para AMBOS os bots
 */
async function processAllBotsRound(round) {
  // Processa ambos os bots
  await processSingleBotRound('bot1', round);
  await processSingleBotRound('bot2', round);
}

/**
 * Processa nova rodada para um bot específico
 */
async function processSingleBotRound(botId, round) {
  const botState = bots[botId].state;
  const botConfig = bots[botId].config;

  console.log(`[Bot ${botId}] processBotRound:`, {
    multiplier: round.multiplier,
    active: botState.active,
    isProcessing: botState.isProcessing,
    hasActiveBet: !!botState.activeBet
  });

  // Decrementa contador de pausa (gestão de risco)
  decrementPauseCounter(botId);

  // Se o bot não está ativo, apenas atualiza a análise
  if (!botState.active) {
    updateBotDecision(botId);
    return;
  }

  // Evita processamento duplo
  if (botState.isProcessing) {
    console.log(`[Bot ${botId}] Já processando, ignorando...`);
    return;
  }

  // Verifica tempo mínimo entre processamentos
  const now = Date.now();
  if (now - botState.lastRoundTime < 3000) {
    console.log(`[Bot ${botId}] Rodada muito próxima, ignorando...`);
    return;
  }

  botState.isProcessing = true;
  botState.lastRoundTime = now;

  console.log(`[Bot ${botId}] Processando rodada: ${round.multiplier}x`);

  // Se tem aposta ativa, resolve primeiro
  if (botState.activeBet) {
    await resolveBotBet(botId, round.multiplier);
  }

  // Aguarda o delay configurado
  setTimeout(async () => {
    // Atualiza análise com os dados mais recentes
    updateBotDecision(botId);

    // Verifica se ainda está ativo
    if (!botState.active) {
      botState.isProcessing = false;
      return;
    }

    // Verifica se tem saldo suficiente
    const totalBet = botConfig.betAmount * 2;
    if (botState.balance < totalBet && !botState.liveMode) {
      console.log(`[Bot ${botId}] Saldo insuficiente para apostar`);
      botState.isProcessing = false;
      return;
    }

    // Se deve apostar e não tem aposta ativa, coloca aposta
    if (botState.lastDecision && botState.lastDecision.shouldBet && !botState.activeBet) {
      console.log(`[Bot ${botId}] Decisão: APOSTAR`);
      await placeBotBet(botId, botState.lastDecision);
    } else if (botState.lastDecision && !botState.lastDecision.shouldBet) {
      console.log(`[Bot ${botId}] Decisão: AGUARDAR`);
    }

    botState.isProcessing = false;
  }, BOT_TIMING.delayAfterRound);
}

// Alias para compatibilidade
async function processBotRound(round) {
  await processAllBotsRound(round);
}

// ========== GERENCIAMENTO DE DADOS ==========

const dataManagementElements = {
  modal: null,
  closeBtn: null,
  manageBtn: null,
  archiveBtn: null,
  resetBtn: null,
  archivesList: null
};

/**
 * Inicializa elementos de gerenciamento de dados
 */
function initDataManagement() {
  dataManagementElements.modal = document.getElementById('dataModal');
  dataManagementElements.closeBtn = document.getElementById('dataModalClose');
  dataManagementElements.manageBtn = document.getElementById('btnManageData');
  dataManagementElements.archiveBtn = document.getElementById('btnArchiveDb');
  dataManagementElements.resetBtn = document.getElementById('btnResetDb');
  dataManagementElements.archivesList = document.getElementById('archivesList');

  if (dataManagementElements.manageBtn) {
    dataManagementElements.manageBtn.addEventListener('click', openDataModal);
  }

  if (dataManagementElements.closeBtn) {
    dataManagementElements.closeBtn.addEventListener('click', closeDataModal);
  }

  if (dataManagementElements.modal) {
    dataManagementElements.modal.addEventListener('click', (e) => {
      if (e.target === dataManagementElements.modal) {
        closeDataModal();
      }
    });
  }

  if (dataManagementElements.archiveBtn) {
    dataManagementElements.archiveBtn.addEventListener('click', archiveDatabase);
  }

  if (dataManagementElements.resetBtn) {
    dataManagementElements.resetBtn.addEventListener('click', resetDatabase);
  }
}

/**
 * Abre o modal de gerenciamento de dados
 */
function openDataModal() {
  if (dataManagementElements.modal) {
    dataManagementElements.modal.classList.add('active');
    loadArchives();
  }
}

/**
 * Fecha o modal de gerenciamento de dados
 */
function closeDataModal() {
  if (dataManagementElements.modal) {
    dataManagementElements.modal.classList.remove('active');
  }
}

/**
 * Carrega lista de arquivos
 */
async function loadArchives() {
  if (!dataManagementElements.archivesList) return;

  dataManagementElements.archivesList.innerHTML = '<p class="loading-text">Carregando...</p>';

  try {
    const response = await fetch(`${observerApiUrl}/api/database/archives`);
    const data = await response.json();

    if (data.success && data.archives.length > 0) {
      renderArchivesList(data.archives);
    } else {
      dataManagementElements.archivesList.innerHTML = `
        <div class="no-archives">
          <span>📂</span>
          <p>Nenhum arquivo salvo</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('[Data] Erro ao carregar arquivos:', err);
    dataManagementElements.archivesList.innerHTML = '<p class="error-text">Erro ao carregar arquivos</p>';
  }
}

/**
 * Renderiza lista de arquivos
 */
function renderArchivesList(archives) {
  dataManagementElements.archivesList.innerHTML = archives.map(archive => `
    <div class="archive-card" data-name="${archive.name}">
      <div class="archive-header">
        <span class="archive-name">${archive.name}</span>
        <button class="archive-delete-btn" title="Deletar arquivo" data-name="${archive.name}">&times;</button>
      </div>
      <div class="archive-info">
        <span>${archive.roundsCount} rodadas</span>
        <span>${formatDateTime(archive.createdAt)}</span>
      </div>
      <div class="archive-actions">
        <button class="btn btn-merge" data-name="${archive.name}" title="Adiciona dados do arquivo aos dados atuais">+ Mesclar</button>
        <button class="btn btn-restore" data-name="${archive.name}" title="Substitui dados atuais pelos do arquivo">Substituir</button>
      </div>
    </div>
  `).join('');

  // Adiciona event listeners
  dataManagementElements.archivesList.querySelectorAll('.btn-merge').forEach(btn => {
    btn.addEventListener('click', () => mergeArchive(btn.dataset.name));
  });

  dataManagementElements.archivesList.querySelectorAll('.btn-restore').forEach(btn => {
    btn.addEventListener('click', () => restoreArchive(btn.dataset.name));
  });

  dataManagementElements.archivesList.querySelectorAll('.archive-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteArchive(btn.dataset.name));
  });
}

/**
 * Arquiva o banco de dados atual
 */
async function archiveDatabase() {
  const name = prompt('Nome do arquivo (opcional, deixe em branco para usar timestamp):');
  if (name === null) return; // Cancelado

  try {
    const response = await fetch(`${observerApiUrl}/api/database/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || null })
    });

    const data = await response.json();

    if (data.success) {
      alert(`Dados arquivados com sucesso!\nNome: ${data.name}\nRodadas: ${data.roundsCount}`);
      loadArchives();
    } else {
      alert(`Erro ao arquivar: ${data.error}`);
    }
  } catch (err) {
    console.error('[Data] Erro ao arquivar:', err);
    alert('Erro ao arquivar dados');
  }
}

/**
 * Reseta o banco de dados
 */
async function resetDatabase() {
  const confirm1 = confirm('Isso vai APAGAR todos os dados atuais e começar do zero.\n\nDeseja arquivar os dados antes de resetar?');
  if (confirm1 === null) return; // Cancelado

  const archive = confirm1;

  if (!archive) {
    const confirm2 = confirm('ATENÇÃO: Os dados atuais serão PERDIDOS permanentemente!\n\nTem certeza que deseja continuar SEM arquivar?');
    if (!confirm2) return;
  }

  try {
    const response = await fetch(`${observerApiUrl}/api/database/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archive })
    });

    const data = await response.json();

    if (data.success) {
      let msg = 'Banco de dados resetado com sucesso!';
      if (data.archived) {
        msg += `\n\nDados arquivados em: ${data.archived.name}`;
      }
      alert(msg);

      // Recarrega dados
      await Promise.all([
        fetchRounds(),
        fetchStats(),
        fetchAdvancedStats(),
        fetchHourlyAnalysis(),
        fetchHouseProfit()
      ]);

      loadArchives();
    } else {
      alert(`Erro ao resetar: ${data.error}`);
    }
  } catch (err) {
    console.error('[Data] Erro ao resetar:', err);
    alert('Erro ao resetar banco de dados');
  }
}

/**
 * Mescla dados de um arquivo com os dados atuais (sem duplicar)
 */
async function mergeArchive(name) {
  const confirmMerge = confirm(`Isso vai ADICIONAR os dados do arquivo "${name}" aos dados atuais.\n\nRodadas duplicadas serão ignoradas automaticamente.\n\nDeseja continuar?`);
  if (!confirmMerge) return;

  try {
    const response = await fetch(`${observerApiUrl}/api/database/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await response.json();

    if (data.success) {
      alert(`Dados mesclados com sucesso!\n\n• Importadas: ${data.imported} rodadas\n• Ignoradas (duplicadas): ${data.skipped} rodadas\n• Total no arquivo: ${data.total} rodadas`);

      // Recarrega dados
      await Promise.all([
        fetchRounds(),
        fetchStats(),
        fetchAdvancedStats(),
        fetchHourlyAnalysis(),
        fetchHouseProfit()
      ]);

      // Não fecha o modal para permitir mais operações
    } else {
      alert(`Erro ao mesclar: ${data.error}`);
    }
  } catch (err) {
    console.error('[Data] Erro ao mesclar:', err);
    alert('Erro ao mesclar dados');
  }
}

/**
 * Restaura um arquivo (substitui dados atuais)
 */
async function restoreArchive(name) {
  const confirmRestore = confirm(`Isso vai SUBSTITUIR todos os dados atuais pelos dados do arquivo "${name}".\n\nDeseja arquivar os dados atuais antes?`);
  if (confirmRestore === null) return;

  // Se o usuário quer arquivar antes
  if (confirmRestore) {
    await archiveDatabaseSilent();
  }

  try {
    const response = await fetch(`${observerApiUrl}/api/database/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await response.json();

    if (data.success) {
      alert(`Arquivo restaurado com sucesso!\nRodadas: ${data.roundsCount}`);

      // Recarrega dados
      await Promise.all([
        fetchRounds(),
        fetchStats(),
        fetchAdvancedStats(),
        fetchHourlyAnalysis(),
        fetchHouseProfit()
      ]);

      closeDataModal();
    } else {
      alert(`Erro ao restaurar: ${data.error}`);
    }
  } catch (err) {
    console.error('[Data] Erro ao restaurar:', err);
    alert('Erro ao restaurar arquivo');
  }
}

/**
 * Arquiva silenciosamente (sem prompts)
 */
async function archiveDatabaseSilent() {
  try {
    const response = await fetch(`${observerApiUrl}/api/database/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: null })
    });
    return await response.json();
  } catch (err) {
    console.error('[Data] Erro ao arquivar silenciosamente:', err);
    return { success: false };
  }
}

/**
 * Deleta um arquivo
 */
async function deleteArchive(name) {
  const confirmDelete = confirm(`Tem certeza que deseja DELETAR o arquivo "${name}"?\n\nEssa ação não pode ser desfeita.`);
  if (!confirmDelete) return;

  try {
    const response = await fetch(`${observerApiUrl}/api/database/archives/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      loadArchives();
    } else {
      alert(`Erro ao deletar: ${data.error}`);
    }
  } catch (err) {
    console.error('[Data] Erro ao deletar arquivo:', err);
    alert('Erro ao deletar arquivo');
  }
}

// Inicia quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  init();
  initDataManagement();
});
