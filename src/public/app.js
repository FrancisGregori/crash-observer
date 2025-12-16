// ========== Estado Global ==========
let rounds = [];
let stats = {};
let hourlyData = {};
let houseProfitData = {};
let advancedStats = {};
let currentLimit = 50;

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
    const response = await fetch(`/api/rounds?limit=${currentLimit}`);
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
    const response = await fetch('/api/stats');
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
    const response = await fetch('/api/hourly');
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
    const response = await fetch('/api/house-profit');
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
    const response = await fetch('/api/advanced');
    advancedStats = await response.json();
    console.log('[DEBUG] advancedStats:', advancedStats);
    renderAdvancedStats();
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
    });
  });

  elements.singleBetInputs.querySelectorAll('.quick-btn[data-set="max"]').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.betAmount.value = Math.floor(simulator.balance);
    });
  });

  // Quick buttons - cashout (single)
  elements.singleBetInputs.querySelectorAll('.quick-btn[data-cashout]').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.betCashout.value = btn.dataset.cashout;
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
    });
  });

  // Quick buttons - cashout2 (double)
  elements.doubleBetInputs.querySelectorAll('.quick-btn[data-cashout2]').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.betCashout2.value = btn.dataset.cashout2;
    });
  });

  // Atualiza total quando muda o valor
  elements.betAmountDouble.addEventListener('input', updateDoubleBetTotal);
}

// ========== Server-Sent Events ==========

/**
 * Conecta ao stream de eventos SSE
 */
function connectSSE() {
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('connected', () => {
    console.log('SSE conectado');
    updateStatus('connected', 'Conectado');
  });

  eventSource.addEventListener('round', (event) => {
    const round = JSON.parse(event.data);
    console.log('Nova rodada recebida:', round);

    // Adiciona no início do array
    rounds.unshift(round);

    // Atualiza UI
    renderLastRound(round);
    renderRoundsGrid(true);
    renderTable();

    // Resolve aposta ativa do simulador manual
    if (simulator.activeBet) {
      resolveActiveBet(round.multiplier);
    }

    // Processa rodada no bot automático
    processBotRound(round);

    // Atualiza estatísticas, análise de horários, ganho da casa e análise avançada
    fetchStats();
    fetchHourlyAnalysis();
    fetchHouseProfit();
    fetchAdvancedStats();
  });

  // Eventos de live betting
  eventSource.addEventListener('liveBet', (event) => {
    const liveBetEvent = JSON.parse(event.data);
    handleLiveBetEvent(liveBetEvent);
  });

  eventSource.onerror = () => {
    console.error('Erro no SSE, reconectando...');
    updateStatus('disconnected', 'Desconectado');
    eventSource.close();

    // Tenta reconectar após 3 segundos
    setTimeout(connectSSE, 3000);
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

// ========== Inicialização ==========

async function init() {
  console.log('Inicializando dashboard...');

  // Carrega estado do simulador
  loadSimulatorState();

  // Carrega dados iniciais
  await Promise.all([
    fetchRounds(),
    fetchStats(),
    fetchHourlyAnalysis(),
    fetchHouseProfit(),
    fetchAdvancedStats()
  ]);

  // Configura SSE para atualizações em tempo real
  connectSSE();

  // Configura botões
  setupLimitButtons();

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
  renderBot();
}

// ========== BOT AUTOMÁTICO ==========

const BOT_STORAGE_KEY = 'crash_bot_state';
const BOT_SESSIONS_KEY = 'crash_bot_sessions';

// Estado do bot
let bot = {
  active: false,
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
  },
  lastDecision: null,
  liveMode: true, // Modo de apostas reais - padrão é conta real
  isProcessing: false, // Flag para evitar processamento duplo
  lastRoundTime: 0, // Timestamp da última rodada processada
  // Ciclo adaptável para cashouts altos (15x/10x)
  adaptiveCycle: {
    active: false,           // Se o ciclo adaptável está ativo
    currentTarget: 15,       // Alvo atual (15 ou 10)
    attemptsAtCurrentTarget: 0, // Quantas tentativas no alvo atual
    maxAttempts: 3,          // Máximo de tentativas antes de mudar
    totalCycleAttempts: 0,   // Total de tentativas no ciclo
    lastHitTarget: null      // Último alvo que acertou
  }
};

// Configuração de timing
const BOT_TIMING = {
  delayAfterRound: 2000, // 2 segundos de espera após rodada terminar
  minTimeBetweenBets: 5000 // Mínimo 5 segundos entre apostas
};

// Configurações do bot (valores padrão, serão sobrescritos pelo localStorage)
const BOT_CONFIG = {
  betAmount: 10,          // R$10 por aposta
  cashout1: 2.17,         // Primeira aposta sai em 2.17x
  cashout2Default: 5.10,  // Segunda aposta sai em 5.10x por padrão
  cashout2High: 10.0,     // Segunda aposta sai em 10x se sequências muito atrasadas
  cashout2VeryHigh: 15.0  // Segunda aposta sai em 15x se sequências extremamente atrasadas
};

const BOT_CONFIG_STORAGE_KEY = 'crash_bot_config';

// Elementos DOM do bot
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
function loadBotState() {
  try {
    const saved = localStorage.getItem(BOT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Sempre inicia desativado por segurança, mas sempre em modo live (conta real) por padrão
      bot = { ...bot, ...parsed, active: false, liveMode: true };
      console.log('[Bot] Estado carregado:', bot);
    }
  } catch (e) {
    console.error('[Bot] Erro ao carregar estado:', e);
  }
}

/**
 * Carrega configuração do bot do localStorage
 */
function loadBotConfig() {
  try {
    const saved = localStorage.getItem(BOT_CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      BOT_CONFIG.betAmount = parsed.betAmount || 10;
      console.log('[Bot] Configuração carregada: R$' + BOT_CONFIG.betAmount + ' por aposta');
    }
  } catch (e) {
    console.error('[Bot] Erro ao carregar configuração:', e);
  }
}

/**
 * Salva configuração do bot no localStorage
 */
function saveBotConfig() {
  try {
    const config = {
      betAmount: BOT_CONFIG.betAmount
    };
    localStorage.setItem(BOT_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('[Bot] Erro ao salvar configuração:', e);
  }
}

/**
 * Atualiza os campos de configuração na UI
 */
function updateConfigUI() {
  if (botElements.configBetAmount) {
    botElements.configBetAmount.value = BOT_CONFIG.betAmount;
  }
  updateConfigSummary();
}

/**
 * Atualiza o resumo da configuração
 */
function updateConfigSummary() {
  const betAmount = botElements.configBetAmount ? parseFloat(botElements.configBetAmount.value) || BOT_CONFIG.betAmount : BOT_CONFIG.betAmount;
  const totalPerRound = betAmount * 2;

  if (botElements.configTotalPerRound) {
    botElements.configTotalPerRound.textContent = formatCurrency(totalPerRound);
  }
}

/**
 * Lê os valores da configuração dos inputs
 */
function readConfigFromInputs() {
  if (botElements.configBetAmount) {
    const value = parseFloat(botElements.configBetAmount.value);
    if (value > 0 && value <= 1000) {
      BOT_CONFIG.betAmount = value;
    }
  }

  saveBotConfig();
  updateConfigSummary();
}

// ========== SESSÕES ARQUIVADAS ==========

/**
 * Carrega sessões arquivadas do localStorage
 */
function loadArchivedSessions() {
  try {
    const saved = localStorage.getItem(BOT_SESSIONS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[Bot] Erro ao carregar sessões:', e);
  }
  return [];
}

/**
 * Salva sessões arquivadas no localStorage
 */
function saveArchivedSessions(sessions) {
  try {
    localStorage.setItem(BOT_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error('[Bot] Erro ao salvar sessões:', e);
  }
}

/**
 * Arquiva a sessão atual do bot
 */
function archiveCurrentSession() {
  // Só arquiva se tiver apostas
  if (bot.stats.totalBets === 0) {
    console.log('[Bot] Nenhuma aposta para arquivar');
    return null;
  }

  const session = {
    id: Date.now(),
    startDate: bot.history.length > 0 ? bot.history[0].timestamp : new Date().toISOString(),
    endDate: new Date().toISOString(),
    initialBalance: bot.initialBalance,
    finalBalance: bot.balance,
    stats: { ...bot.stats },
    history: [...bot.history],
    betAmount: BOT_CONFIG.betAmount
  };

  const sessions = loadArchivedSessions();
  sessions.unshift(session); // Adiciona no início

  // Limita a 20 sessões arquivadas
  if (sessions.length > 20) {
    sessions.pop();
  }

  saveArchivedSessions(sessions);
  console.log('[Bot] Sessão arquivada:', session.id);

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

/**
 * Renderiza a lista de sessões arquivadas
 */
function renderArchivedSessions() {
  if (!botElements.sessionsList) return;

  const sessions = loadArchivedSessions();

  if (sessions.length === 0) {
    botElements.sessionsList.innerHTML = `
      <div class="no-sessions">
        <p>Nenhuma sessão arquivada</p>
        <span>As sessões são salvas automaticamente ao resetar o bot</span>
      </div>
    `;
    return;
  }

  botElements.sessionsList.innerHTML = sessions.map((session, index) => {
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
          <button class="session-delete-btn" data-session-id="${session.id}" title="Excluir sessão">×</button>
        </div>
        <div class="session-stats">
          <div class="session-stat">
            <span class="stat-label">Apostas</span>
            <span class="stat-value">${session.stats.totalBets}</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">Vitórias</span>
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
  botElements.sessionsList.querySelectorAll('.session-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sessionId = parseInt(btn.dataset.sessionId);
      deleteArchivedSession(sessionId);
    });
  });
}

/**
 * Deleta uma sessão arquivada
 */
function deleteArchivedSession(sessionId) {
  if (!confirm('Tem certeza que deseja excluir esta sessão?')) return;

  const sessions = loadArchivedSessions();
  const filtered = sessions.filter(s => s.id !== sessionId);
  saveArchivedSessions(filtered);
  renderArchivedSessions();
  console.log('[Bot] Sessão excluída:', sessionId);
}

/**
 * Abre o modal de sessões
 */
function openSessionsModal() {
  if (botElements.sessionsModal) {
    renderArchivedSessions();
    botElements.sessionsModal.classList.add('active');
  }
}

/**
 * Fecha o modal de sessões
 */
function closeSessionsModal() {
  if (botElements.sessionsModal) {
    botElements.sessionsModal.classList.remove('active');
  }
}

/**
 * Salva estado do bot no localStorage
 */
function saveBotState() {
  try {
    localStorage.setItem(BOT_STORAGE_KEY, JSON.stringify(bot));
  } catch (e) {
    console.error('[Bot] Erro ao salvar estado:', e);
  }
}

/**
 * Sincroniza o saldo do bot com o saldo real da plataforma (modo live)
 */
async function syncPlatformBalance(forceSync = false) {
  // Só sincroniza em modo live (ou se forçado)
  if (!bot.liveMode && !forceSync) {
    return false;
  }

  console.log('[Bot] 💰 Buscando saldo da plataforma...');

  try {
    const response = await fetch('/api/live-betting/balance');
    const result = await response.json();

    if (result.success && typeof result.balance === 'number') {
      const oldBalance = bot.balance;
      bot.balance = result.balance;
      bot.initialBalance = result.balance; // Atualiza também o saldo inicial para cálculos corretos

      console.log(`[Bot] 💰 Saldo sincronizado: ${formatCurrency(oldBalance)} → ${formatCurrency(result.balance)}`);

      saveBotState();
      renderBot();
      return true;
    } else {
      console.warn('[Bot] ⚠️ Não foi possível sincronizar saldo:', result.error || 'Erro desconhecido');
      return false;
    }
  } catch (err) {
    console.error('[Bot] ❌ Erro ao sincronizar saldo:', err);
    return false;
  }
}

/**
 * Inicializa elementos DOM do bot
 */
function initBotElements() {
  botElements.statusIndicator = document.getElementById('botStatusIndicator');
  botElements.statusText = document.getElementById('botStatusText');
  botElements.toggleBtn = document.getElementById('botToggle');
  botElements.balance = document.getElementById('botBalance');
  botElements.resetBtn = document.getElementById('botReset');
  botElements.decisionBox = document.getElementById('botDecision');
  botElements.decisionContent = document.getElementById('botDecisionContent');
  botElements.activeBet = document.getElementById('botActiveBet');
  botElements.betStatus = document.getElementById('botBetStatus');
  botElements.betDetails = document.getElementById('botBetDetails');
  botElements.totalBets = document.getElementById('botTotalBets');
  botElements.wins = document.getElementById('botWins');
  botElements.profit = document.getElementById('botProfit');
  botElements.roi = document.getElementById('botROI');
  botElements.historyList = document.getElementById('botHistoryList');
  // Live mode elements
  botElements.liveModeSection = document.getElementById('liveModeSection');
  botElements.liveModeToggle = document.getElementById('liveModeToggle');
  botElements.liveModeLabel = document.getElementById('liveModeLabel');
  botElements.liveModeWarning = document.getElementById('liveModeWarning');
  // Config elements
  botElements.configBetAmount = document.getElementById('botBetAmount');
  botElements.configTotalPerRound = document.getElementById('botTotalPerRound');
  // Sessions elements
  botElements.sessionsBtn = document.getElementById('botSessionsBtn');
  botElements.sessionsModal = document.getElementById('sessionsModal');
  botElements.sessionsList = document.getElementById('sessionsList');
  botElements.sessionsClose = document.getElementById('sessionsClose');
  // Balance edit elements
  botElements.balanceEditGroup = document.getElementById('balanceEditGroup');
  botElements.balanceInput = document.getElementById('botBalanceInput');
  botElements.balanceSaveBtn = document.getElementById('botBalanceSave');
  botElements.balanceEditBtn = document.getElementById('botBalanceEdit');
  // Account type elements
  botElements.accountType = document.getElementById('botAccountType');
  botElements.accountLabel = document.getElementById('botAccountLabel');
  // Collapsible sections
  botElements.configSection = document.getElementById('botConfigSection');
  botElements.configToggle = document.getElementById('configToggle');
  botElements.configBody = document.getElementById('configBody');
  botElements.rulesSection = document.querySelector('.bot-rules.collapsible');
  botElements.rulesToggle = document.getElementById('rulesToggle');
  botElements.rulesBody = document.getElementById('rulesBody');
}

/**
 * Configura eventos do bot
 */
function setupBotEvents() {
  initBotElements();

  if (botElements.toggleBtn) {
    botElements.toggleBtn.addEventListener('click', toggleBot);
  }

  if (botElements.resetBtn) {
    botElements.resetBtn.addEventListener('click', resetBot);
  }

  // Live mode toggle
  if (botElements.liveModeToggle) {
    botElements.liveModeToggle.addEventListener('change', handleLiveModeToggle);
  }

  // Config inputs - save on change (blur), update summary on input (typing)
  if (botElements.configBetAmount) {
    botElements.configBetAmount.addEventListener('change', readConfigFromInputs);
    botElements.configBetAmount.addEventListener('input', updateConfigSummary);
  }

  // Quick buttons for bet amount
  document.querySelectorAll('.config-quick-btn[data-amount]').forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = parseFloat(btn.dataset.amount);
      if (amount > 0 && botElements.configBetAmount) {
        botElements.configBetAmount.value = amount;
        BOT_CONFIG.betAmount = amount;
        saveBotConfig();
        updateConfigSummary();
      }
    });
  });

  // Sessions events
  if (botElements.sessionsBtn) {
    botElements.sessionsBtn.addEventListener('click', openSessionsModal);
  }
  if (botElements.sessionsClose) {
    botElements.sessionsClose.addEventListener('click', closeSessionsModal);
  }
  if (botElements.sessionsModal) {
    // Fecha ao clicar fora do modal
    botElements.sessionsModal.addEventListener('click', (e) => {
      if (e.target === botElements.sessionsModal) {
        closeSessionsModal();
      }
    });
  }

  // Balance edit events
  if (botElements.balanceEditBtn) {
    botElements.balanceEditBtn.addEventListener('click', toggleBalanceEdit);
  }
  if (botElements.balanceSaveBtn) {
    botElements.balanceSaveBtn.addEventListener('click', saveBalanceEdit);
  }
  if (botElements.balanceInput) {
    botElements.balanceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveBalanceEdit();
      } else if (e.key === 'Escape') {
        cancelBalanceEdit();
      }
    });
  }

  // Collapsible sections events
  if (botElements.configToggle) {
    botElements.configToggle.addEventListener('click', () => {
      toggleCollapsible(botElements.configSection);
    });
  }
  if (botElements.rulesToggle) {
    botElements.rulesToggle.addEventListener('click', () => {
      toggleCollapsible(botElements.rulesSection);
    });
  }

  // Inicia as seções colapsadas para economizar espaço
  if (botElements.configSection) {
    botElements.configSection.classList.add('collapsed');
  }
  if (botElements.rulesSection) {
    botElements.rulesSection.classList.add('collapsed');
  }

  // Load config and update UI
  loadBotConfig();
  updateConfigUI();
}

/**
 * Abre o modo de edição de banca
 */
function toggleBalanceEdit() {
  if (!botElements.balanceEditGroup || !botElements.balance) return;

  const isEditing = !botElements.balanceEditGroup.classList.contains('hidden');

  if (isEditing) {
    // Fecha a edição
    cancelBalanceEdit();
  } else {
    // Abre a edição
    botElements.balanceEditGroup.classList.remove('hidden');
    botElements.balance.classList.add('hidden');
    botElements.balanceEditBtn.classList.add('hidden');

    // Preenche o input com o valor atual
    if (botElements.balanceInput) {
      botElements.balanceInput.value = bot.balance.toFixed(2);
      botElements.balanceInput.focus();
      botElements.balanceInput.select();
    }
  }
}

/**
 * Salva a edição de banca
 */
function saveBalanceEdit() {
  if (!botElements.balanceInput) return;

  const newBalance = parseFloat(botElements.balanceInput.value);

  if (isNaN(newBalance) || newBalance < 0) {
    alert('Por favor, insira um valor válido para a banca.');
    return;
  }

  // Atualiza a banca
  bot.balance = newBalance;
  bot.initialBalance = newBalance;
  saveBotState();

  console.log(`[Bot] Banca atualizada: R$ ${newBalance.toFixed(2)}`);

  // Fecha o modo de edição
  cancelBalanceEdit();

  // Atualiza a UI
  renderBot();
}

/**
 * Cancela a edição de banca
 */
function cancelBalanceEdit() {
  if (botElements.balanceEditGroup) {
    botElements.balanceEditGroup.classList.add('hidden');
  }
  if (botElements.balance) {
    botElements.balance.classList.remove('hidden');
  }
  if (botElements.balanceEditBtn) {
    botElements.balanceEditBtn.classList.remove('hidden');
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
 * Para simular cliques humanos, adiciona entre 0.03 e 0.17 ao valor base
 */
function randomizeCashout(baseValue) {
  const minOffset = 0.03;
  const maxOffset = 0.17;
  const randomOffset = minOffset + Math.random() * (maxOffset - minOffset);
  return parseFloat((baseValue + randomOffset).toFixed(2));
}

/**
 * Ativa/desativa modo de apostas reais
 */
async function handleLiveModeToggle() {
  const enabled = botElements.liveModeToggle.checked;

  if (enabled) {
    // Lê os valores atuais da configuração
    readConfigFromInputs();

    // Pede confirmação antes de ativar
    const totalPerRound = BOT_CONFIG.betAmount * 2;
    const confirmed = confirm(
      '⚠️ ATENÇÃO: APOSTAS REAIS ⚠️\n\n' +
      'Você está prestes a ativar o modo de apostas REAIS.\n' +
      'Isso usará DINHEIRO REAL da sua conta SpinBetter!\n\n' +
      'Configuração atual:\n' +
      '• Valor por aposta: R$ ' + BOT_CONFIG.betAmount.toFixed(2) + '\n' +
      '• Total por rodada: R$ ' + totalPerRound.toFixed(2) + '\n' +
      '• Cashouts: Automático (baseado nas sequências)\n\n' +
      'Tem certeza que deseja continuar?'
    );

    if (!confirmed) {
      botElements.liveModeToggle.checked = false;
      return;
    }
  }

  try {
    const response = await fetch('/api/live-betting/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    const result = await response.json();

    if (result.success) {
      bot.liveMode = enabled;
      saveBotState();
      updateLiveModeUI();
      console.log(`[Bot] Modo live ${enabled ? 'ATIVADO' : 'desativado'}`);
    } else {
      throw new Error(result.error || 'Erro ao alterar modo live');
    }
  } catch (err) {
    console.error('[Bot] Erro ao alterar modo live:', err);
    botElements.liveModeToggle.checked = !enabled;
    alert('Erro ao alterar modo live: ' + err.message);
  }
}

/**
 * Atualiza UI do modo live
 */
function updateLiveModeUI() {
  if (bot.liveMode) {
    // Label no config
    if (botElements.liveModeLabel) {
      botElements.liveModeLabel.textContent = 'Conta Real Ativa';
      botElements.liveModeLabel.classList.add('active');
    }
    // Warning
    if (botElements.liveModeWarning) {
      botElements.liveModeWarning.classList.remove('hidden');
    }
    // Account type indicator
    if (botElements.accountType) {
      botElements.accountType.classList.add('live');
    }
    if (botElements.accountLabel) {
      botElements.accountLabel.textContent = 'Conta Real';
    }
    // Icon
    const accountIcon = botElements.accountType?.querySelector('.account-icon');
    if (accountIcon) {
      accountIcon.textContent = '💰';
    }
  } else {
    // Label no config
    if (botElements.liveModeLabel) {
      botElements.liveModeLabel.textContent = 'Usar Conta Real';
      botElements.liveModeLabel.classList.remove('active');
    }
    // Warning
    if (botElements.liveModeWarning) {
      botElements.liveModeWarning.classList.add('hidden');
    }
    // Account type indicator
    if (botElements.accountType) {
      botElements.accountType.classList.remove('live');
    }
    if (botElements.accountLabel) {
      botElements.accountLabel.textContent = 'Conta Fictícia';
    }
    // Icon
    const accountIcon = botElements.accountType?.querySelector('.account-icon');
    if (accountIcon) {
      accountIcon.textContent = '🎮';
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

      // Se for a tab do bot, atualiza a análise
      if (targetTab === 'bot' && bot.active) {
        updateBotDecision();
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
async function toggleBot() {
  bot.active = !bot.active;

  if (bot.active) {
    console.log('[Bot] Ativado!');

    // Se está em modo live, precisa ativar o live betting no backend
    if (bot.liveMode) {
      try {
        console.log('[Bot] Ativando live betting no backend...');
        const response = await fetch('/api/live-betting/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true })
        });

        const result = await response.json();

        if (!result.success) {
          console.error('[Bot] Erro ao ativar live betting:', result.error);
          bot.active = false;
          alert('Erro ao ativar apostas reais: ' + (result.error || 'Erro desconhecido'));
          renderBot();
          return;
        }

        console.log('[Bot] Live betting ativado no backend com sucesso!');

        // Sincroniza o saldo da plataforma (obrigatório antes de iniciar)
        const synced = await syncPlatformBalance();
        if (!synced) {
          console.warn('[Bot] Não foi possível sincronizar saldo, usando valor atual');
        }
      } catch (err) {
        console.error('[Bot] Erro ao ativar live betting:', err);
        bot.active = false;
        alert('Erro ao conectar com o servidor de apostas reais');
        renderBot();
        return;
      }
    }

    updateBotDecision();
  } else {
    console.log('[Bot] Desativado');
    // Cancela aposta pendente se houver (devolve o valor apostado)
    if (bot.activeBet) {
      const refund = bot.activeBet.amount * 2;
      bot.balance += refund;
      console.log(`[Bot] Aposta cancelada, devolvido: ${formatCurrency(refund)}`);
      console.log(`[Bot] Saldo após devolução: ${formatCurrency(bot.balance)}`);
      bot.activeBet = null;
    }

    // Se estava em modo live, desativa no backend também
    if (bot.liveMode) {
      try {
        await fetch('/api/live-betting/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false })
        });
        console.log('[Bot] Live betting desativado no backend');
      } catch (err) {
        console.error('[Bot] Erro ao desativar live betting:', err);
      }
    }
  }

  saveBotState();
  renderBot();
}

/**
 * Reseta o bot
 */
function resetBot() {
  const hasHistory = bot.stats.totalBets > 0;

  let message = 'Tem certeza que deseja resetar o bot?';
  if (hasHistory) {
    message += '\n\nA sessão atual será ARQUIVADA antes do reset.';
  }

  if (!confirm(message)) {
    return;
  }

  // Arquiva a sessão atual antes de resetar
  if (hasHistory) {
    const archived = archiveCurrentSession();
    if (archived) {
      console.log('[Bot] Sessão arquivada com sucesso');
    }
  }

  bot = {
    active: false,
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
    },
    lastDecision: null,
    liveMode: true, // Mantém conta real como padrão
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

  saveBotState();
  renderBot();
  console.log('[Bot] Resetado - Nova sessão iniciada');
}

/**
 * Analisa as sequências e decide se deve apostar
 * Retorna: { shouldBet, reasons, targetCashout2 }
 */
function analyzeBotDecision() {
  if (!advancedStats || !advancedStats.sequenceAnalysis) {
    return {
      shouldBet: false,
      reasons: ['Dados insuficientes para análise'],
      targetCashout2: BOT_CONFIG.cashout2Default,
      isHighOpportunity: false
    };
  }

  const seq = advancedStats.sequenceAnalysis;
  const reasons = [];
  let shouldBet = false;
  let targetCashout2 = BOT_CONFIG.cashout2Default;
  let isHighOpportunity = false;

  // Extrai dados das sequências
  const seq2x = seq.below2x || { currentStreak: 0, avgRoundsToHit: 2, deviationRatio: 0, status: 'normal' };
  const seq5x = seq.below5x || { currentStreak: 0, avgRoundsToHit: 5, deviationRatio: 0, status: 'normal' };
  const seq10x = seq.below10x || { currentStreak: 0, avgRoundsToHit: 10, deviationRatio: 0, status: 'normal' };
  const seq15x = seq.below15x || { currentStreak: 0, avgRoundsToHit: 15, deviationRatio: 0, status: 'normal' };
  const seq20x = seq.below20x || { currentStreak: 0, avgRoundsToHit: 20, deviationRatio: 0, status: 'normal' };

  // Status das sequências
  // 'due' = acima da média (deviationRatio > 1)
  // 'overdue' = muito acima da média (deviationRatio > 1.5)
  const is2xAboveAvg = seq2x.status === 'due' || seq2x.status === 'overdue';
  const is5xAboveAvg = seq5x.status === 'due' || seq5x.status === 'overdue';
  const is10xAboveAvg = seq10x.status === 'due' || seq10x.status === 'overdue';
  const is15xAboveAvg = seq15x.status === 'due' || seq15x.status === 'overdue';
  const is20xAboveAvg = seq20x.status === 'due' || seq20x.status === 'overdue';

  // ========================================
  // REGRA 1: Ciclo Adaptável (10x + 15x + 20x todos acima da média)
  // ========================================
  const shouldActivateCycle = is10xAboveAvg && is15xAboveAvg && is20xAboveAvg;

  // Se o ciclo estava ativo mas as condições não são mais válidas, reseta
  if (bot.adaptiveCycle.active && !shouldActivateCycle) {
    console.log('[Bot] 🔄 Ciclo adaptável DESATIVADO - condições não são mais válidas');
    bot.adaptiveCycle.active = false;
    bot.adaptiveCycle.currentTarget = 15;
    bot.adaptiveCycle.attemptsAtCurrentTarget = 0;
    bot.adaptiveCycle.totalCycleAttempts = 0;
    saveBotState();
  }

  if (shouldActivateCycle) {
    shouldBet = true;
    isHighOpportunity = true;

    // Ativa o ciclo se ainda não estiver ativo
    if (!bot.adaptiveCycle.active) {
      bot.adaptiveCycle.active = true;
      bot.adaptiveCycle.currentTarget = 15; // Começa tentando 15x
      bot.adaptiveCycle.attemptsAtCurrentTarget = 0;
      bot.adaptiveCycle.totalCycleAttempts = 0;
      console.log('[Bot] 🔄 Ciclo adaptável ATIVADO - 10x/15x/20x acima da média - Começando com alvo 15x');
    }

    // Usa o alvo do ciclo adaptável
    const cycleTarget = bot.adaptiveCycle.currentTarget;
    targetCashout2 = cycleTarget === 15 ? BOT_CONFIG.cashout2VeryHigh : BOT_CONFIG.cashout2High;

    // Informações do ciclo
    const attemptNum = bot.adaptiveCycle.attemptsAtCurrentTarget + 1;
    const maxAttempts = bot.adaptiveCycle.maxAttempts;

    reasons.push(`🔥 10x/15x/20x TODOS ACIMA DA MÉDIA`);
    reasons.push(`10x: ${seq10x.currentStreak}/${Math.round(seq10x.avgRoundsToHit)} (${seq10x.status})`);
    reasons.push(`15x: ${seq15x.currentStreak}/${Math.round(seq15x.avgRoundsToHit)} (${seq15x.status})`);
    reasons.push(`20x: ${seq20x.currentStreak}/${Math.round(seq20x.avgRoundsToHit)} (${seq20x.status})`);
    reasons.push(`🔄 Ciclo: tentativa ${attemptNum}/${maxAttempts} → alvo ${cycleTarget}x`);

  // ========================================
  // REGRA 2: Aposta Padrão (2x OU 5x acima da média)
  // ========================================
  } else if (is2xAboveAvg || is5xAboveAvg) {
    shouldBet = true;
    targetCashout2 = BOT_CONFIG.cashout2Default; // 5.10x

    if (is2xAboveAvg) {
      const icon = seq2x.status === 'overdue' ? '🔥' : '✅';
      reasons.push(`${icon} 2x ${seq2x.status.toUpperCase()}: ${seq2x.currentStreak} rodadas (média: ${Math.round(seq2x.avgRoundsToHit)})`);
    }
    if (is5xAboveAvg) {
      const icon = seq5x.status === 'overdue' ? '🔥' : '✅';
      reasons.push(`${icon} 5x ${seq5x.status.toUpperCase()}: ${seq5x.currentStreak} rodadas (média: ${Math.round(seq5x.avgRoundsToHit)})`);
    }
    reasons.push(`→ Aposta padrão: ~2.10x e ~5.10x`);

  // ========================================
  // NÃO APOSTAR: Aguardando condições
  // ========================================
  } else {
    reasons.push(`2x: ${seq2x.status} (${seq2x.currentStreak}/${Math.round(seq2x.avgRoundsToHit)})`);
    reasons.push(`5x: ${seq5x.status} (${seq5x.currentStreak}/${Math.round(seq5x.avgRoundsToHit)})`);
    reasons.push('→ Aguardando 2x ou 5x ficar overdue');
  }

  return {
    shouldBet,
    reasons,
    targetCashout2,
    isHighOpportunity
  };
}

/**
 * Atualiza a decisão do bot e renderiza
 */
function updateBotDecision() {
  const decision = analyzeBotDecision();
  bot.lastDecision = decision;
  renderBotDecision(decision);
}

/**
 * Renderiza a decisão do bot
 */
function renderBotDecision(decision) {
  if (!botElements.decisionBox || !botElements.decisionContent) return;

  // Remove classes anteriores
  botElements.decisionBox.classList.remove('should-bet', 'should-wait', 'high-opportunity');

  if (!bot.active) {
    botElements.decisionContent.innerHTML = '<p class="bot-waiting">Aguardando ativação...</p>';
    return;
  }

  // Define classe do box
  if (decision.isHighOpportunity) {
    botElements.decisionBox.classList.add('high-opportunity');
  } else if (decision.shouldBet) {
    botElements.decisionBox.classList.add('should-bet');
  } else {
    botElements.decisionBox.classList.add('should-wait');
  }

  // Monta HTML
  let actionClass = decision.shouldBet ? (decision.isHighOpportunity ? 'high' : 'bet') : 'wait';
  let actionIcon = decision.shouldBet ? (decision.isHighOpportunity ? '🚀' : '✅') : '⏳';
  let actionText = decision.shouldBet ? (decision.isHighOpportunity ? 'OPORTUNIDADE RARA!' : 'APOSTAR') : 'AGUARDAR';

  let html = `
    <div class="decision-action ${actionClass}">
      <span>${actionIcon}</span>
      <span>${actionText}</span>
    </div>
    <div class="decision-reasons">
      ${decision.reasons.map(r => {
        let reasonClass = '';
        if (r.includes('✅') || r.includes('🔥')) reasonClass = 'positive';
        else if (r.includes('→') || r.includes('⚡')) reasonClass = 'highlight';
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

  botElements.decisionContent.innerHTML = html;
}

/**
 * Coloca aposta automática do bot
 */
async function placeBotBet(decision) {
  console.log('[Bot] placeBotBet chamado. Estado:', {
    active: bot.active,
    hasActiveBet: !!bot.activeBet,
    shouldBet: decision?.shouldBet,
    liveMode: bot.liveMode,
    balanceAtual: bot.balance
  });

  if (!bot.active) {
    console.log('[Bot] Aposta ignorada: bot não está ativo');
    return;
  }
  if (bot.activeBet) {
    console.log('[Bot] Aposta ignorada: já existe aposta ativa');
    return;
  }
  if (!decision.shouldBet) {
    console.log('[Bot] Aposta ignorada: decisão é não apostar');
    return;
  }

  const totalAmount = BOT_CONFIG.betAmount * 2;
  console.log(`[Bot] COLOCANDO APOSTA: R$ ${totalAmount} (Saldo antes: ${formatCurrency(bot.balance)})`);

  // Gera valores de cashout randomizados para simular cliques humanos
  // Para o primeiro cashout (base 2.0), gera entre 2.03 e 2.17
  const randomCashout1 = randomizeCashout(2.0);
  // Para o segundo cashout, usa o valor base da decisão e randomiza
  const baseCashout2 = decision.targetCashout2;
  const randomCashout2 = randomizeCashout(baseCashout2);

  console.log(`[Bot] Cashouts randomizados: ${randomCashout1}x (base 2.0) e ${randomCashout2}x (base ${baseCashout2})`);

  // Se está em modo live, faz aposta real
  if (bot.liveMode) {
    try {
      console.log(`[Bot] Colocando aposta REAL: R$${totalAmount} | Alvos: ${randomCashout1}x e ${randomCashout2}x`);

      const response = await fetch('/api/live-betting/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount1: BOT_CONFIG.betAmount,
          cashout1: randomCashout1,
          amount2: BOT_CONFIG.betAmount,
          cashout2: randomCashout2
        })
      });

      const result = await response.json();

      if (!result.success) {
        console.error('[Bot] Erro ao colocar aposta real:', result.error);
        return;
      }

      console.log('[Bot] Aposta REAL colocada com sucesso!');
    } catch (err) {
      console.error('[Bot] Erro ao colocar aposta real:', err);
      return;
    }
  }

  // Registra aposta (simulação ou tracking de aposta real)
  bot.activeBet = {
    amount: BOT_CONFIG.betAmount,
    cashout1: randomCashout1,
    cashout2: randomCashout2,
    baseCashout2: baseCashout2, // Mantém o valor base para referência
    isHighOpportunity: decision.isHighOpportunity,
    isLive: bot.liveMode
  };

  // SEMPRE debita do saldo ao colocar aposta (simulação ou live para tracking)
  const balanceBefore = bot.balance;
  bot.balance -= totalAmount;
  console.log(`[Bot] *** SALDO ATUALIZADO ***`);
  console.log(`[Bot] Antes: ${formatCurrency(balanceBefore)}`);
  console.log(`[Bot] Aposta: -${formatCurrency(totalAmount)}`);
  console.log(`[Bot] Depois: ${formatCurrency(bot.balance)}`);

  console.log(`[Bot] Aposta ${bot.liveMode ? 'REAL' : 'simulada'} colocada | Alvos: ${randomCashout1}x e ${randomCashout2}x`);

  saveBotState();
  renderBot();
  console.log(`[Bot] Estado salvo e UI renderizada. Saldo atual: ${formatCurrency(bot.balance)}`);
}

/**
 * Busca o histórico de apostas real da plataforma (para modo live)
 */
async function fetchPlatformHistory() {
  try {
    const response = await fetch('/api/live-betting/history?limit=10');
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
async function resolveBotBet(roundMultiplier) {
  if (!bot.activeBet) return;

  const bet = bot.activeBet;
  const betAmount = bet.amount;
  const totalBet = betAmount * 2;
  let winnings = 0;
  let won1 = false;
  let won2 = false;
  let realCashout1 = 0;
  let realCashout2 = 0;

  // Em modo LIVE, busca os dados reais da plataforma
  if (bet.isLive) {
    console.log('[Bot] Modo LIVE: Buscando dados reais da plataforma...');

    // Aguarda um pouco para a plataforma atualizar a tabela
    await new Promise(r => setTimeout(r, 1000));

    const platformHistory = await fetchPlatformHistory();

    if (platformHistory.length >= 2) {
      // As 2 primeiras entradas são as apostas mais recentes (ordem decrescente)
      // Cada rodada tem 2 apostas (bet1 e bet2)
      const bet1Data = platformHistory[0];
      const bet2Data = platformHistory[1];

      console.log('[Bot] Dados da plataforma:', { bet1: bet1Data, bet2: bet2Data });

      // Usa os valores reais de ganho
      won1 = bet1Data.isWin;
      won2 = bet2Data.isWin;
      realCashout1 = bet1Data.cashoutMultiplier;
      realCashout2 = bet2Data.cashoutMultiplier;

      // Ganhos reais da plataforma
      winnings = bet1Data.winAmount + bet2Data.winAmount;

      console.log(`[Bot] Resultados REAIS da plataforma:`);
      console.log(`[Bot]   Aposta 1: ${won1 ? 'GANHOU' : 'PERDEU'} (cashout ${realCashout1}x) = ${formatCurrency(bet1Data.winAmount)}`);
      console.log(`[Bot]   Aposta 2: ${won2 ? 'GANHOU' : 'PERDEU'} (cashout ${realCashout2}x) = ${formatCurrency(bet2Data.winAmount)}`);
      console.log(`[Bot]   Total ganho: ${formatCurrency(winnings)}`);
    } else {
      console.warn('[Bot] Não foi possível obter dados reais, usando cálculo simulado');
      // Fallback para cálculo simulado
      won1 = roundMultiplier >= bet.cashout1;
      won2 = roundMultiplier >= bet.cashout2;
      if (won1) winnings += betAmount * bet.cashout1;
      if (won2) winnings += betAmount * bet.cashout2;
    }
  } else {
    // Modo simulação: calcula baseado nos alvos definidos
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

  // Adiciona os ganhos ao saldo (já foi subtraído quando a aposta foi colocada)
  const balanceBefore = bot.balance;
  bot.balance += winnings;

  console.log(`[Bot] *** RESULTADO DA APOSTA ${bet.isLive ? '(LIVE)' : '(SIMULAÇÃO)'} ***`);
  console.log(`[Bot] Multiplicador da rodada: ${roundMultiplier}x`);
  console.log(`[Bot] Aposta 1: ${won1 ? 'GANHOU' : 'PERDEU'}${realCashout1 > 0 ? ` @ ${realCashout1}x` : ''}`);
  console.log(`[Bot] Aposta 2: ${won2 ? 'GANHOU' : 'PERDEU'}${realCashout2 > 0 ? ` @ ${realCashout2}x` : ''}`);
  console.log(`[Bot] Saldo: ${formatCurrency(balanceBefore)} + ${formatCurrency(winnings)} (ganhos) = ${formatCurrency(bot.balance)}`);
  console.log(`[Bot] Lucro líquido: ${formatCurrency(profit)}`);

  // Considera vitória se teve lucro positivo
  const won = profit > 0;

  // Atualiza estatísticas
  bot.stats.totalBets++;
  bot.stats.totalWagered += totalBet;
  bot.stats.totalProfit += profit;

  if (won) {
    bot.stats.wins++;
  } else {
    bot.stats.losses++;
  }

  // Determina resultado
  let resultText;
  if (won1 && won2) {
    resultText = 'JACKPOT';
  } else if (won1 || won2) {
    // Parcial: uma das apostas deu lucro
    resultText = 'PARCIAL';
  } else {
    resultText = 'PERDA';
  }

  // Adiciona ao histórico
  bot.history.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    multiplier: roundMultiplier,
    cashout1: bet.cashout1,
    cashout2: bet.cashout2,
    won1,
    won2,
    profit,
    balance: bot.balance,
    resultText,
    isHighOpportunity: bet.isHighOpportunity
  });

  console.log(`[Bot] Resultado: ${resultText} | Mult: ${roundMultiplier}x | Lucro: ${formatCurrency(profit)}`);

  // Atualiza ciclo adaptável se estiver ativo
  if (bot.adaptiveCycle.active && bet.isHighOpportunity) {
    updateAdaptiveCycle(won2, roundMultiplier);
  }

  // Limpa aposta ativa
  bot.activeBet = null;

  saveBotState();
  renderBot();

  // Sincroniza saldo com a plataforma após cada aposta (modo live)
  if (bot.liveMode) {
    // Pequeno delay para garantir que a plataforma atualizou o saldo
    setTimeout(() => syncPlatformBalance(), 1000);
  }
}

/**
 * Atualiza o ciclo adaptável baseado no resultado da aposta
 * @param {boolean} hitTarget - Se a segunda aposta (alvo alto) foi bem sucedida
 * @param {number} multiplier - O multiplicador da rodada
 */
function updateAdaptiveCycle(hitTarget, multiplier) {
  const cycle = bot.adaptiveCycle;
  const currentTarget = cycle.currentTarget;

  cycle.attemptsAtCurrentTarget++;
  cycle.totalCycleAttempts++;

  console.log(`[Bot] 🔄 Ciclo adaptável - Tentativa ${cycle.attemptsAtCurrentTarget}/${cycle.maxAttempts} no alvo ${currentTarget}x`);

  if (hitTarget) {
    // Acertou o alvo! Reseta o ciclo
    console.log(`[Bot] ✅ ACERTOU ${currentTarget}x na rodada ${multiplier}x! Ciclo resetado.`);
    cycle.active = false;
    cycle.currentTarget = 15;
    cycle.attemptsAtCurrentTarget = 0;
    cycle.totalCycleAttempts = 0;
    cycle.lastHitTarget = currentTarget;
  } else {
    // Não acertou - verifica se precisa mudar de alvo
    if (cycle.attemptsAtCurrentTarget >= cycle.maxAttempts) {
      // Mudou para o outro alvo
      const newTarget = currentTarget === 15 ? 10 : 15;
      console.log(`[Bot] 🔄 ${cycle.maxAttempts} tentativas em ${currentTarget}x falharam. Mudando para ${newTarget}x`);

      cycle.currentTarget = newTarget;
      cycle.attemptsAtCurrentTarget = 0;

      // Se já tentou 15x e 10x (6 tentativas no total), o ciclo continua
      // até acertar ou as sequências voltarem ao normal
      if (cycle.totalCycleAttempts >= 6) {
        console.log(`[Bot] 🔄 Ciclo completo (${cycle.totalCycleAttempts} tentativas). Voltando para ${newTarget}x`);
      }
    } else {
      console.log(`[Bot] ❌ Não atingiu ${currentTarget}x (mult: ${multiplier}x). Próxima tentativa: ${cycle.attemptsAtCurrentTarget + 1}/${cycle.maxAttempts}`);
    }
  }
}

/**
 * Renderiza o bot
 */
function renderBot() {
  if (!botElements.balance) return;

  // Status
  if (botElements.statusIndicator) {
    botElements.statusIndicator.classList.toggle('active', bot.active);
    botElements.statusIndicator.classList.toggle('live', bot.active && bot.liveMode);
  }
  if (botElements.statusText) {
    let statusText = bot.active ? 'Ativo' : 'Desativado';
    if (bot.active && bot.liveMode) {
      statusText = 'LIVE';
    }
    botElements.statusText.textContent = statusText;
  }
  if (botElements.toggleBtn) {
    botElements.toggleBtn.textContent = bot.active ? 'Desativar Bot' : 'Ativar Bot';
    botElements.toggleBtn.classList.toggle('active', bot.active);
  }

  // Indicação visual proeminente quando bot ativo
  const simulatorSection = document.querySelector('.simulator-section');
  const statusBar = document.querySelector('.bot-status-bar');
  const runningBadge = document.getElementById('botRunningBadge');

  if (simulatorSection) {
    simulatorSection.classList.toggle('bot-running', bot.active);
    simulatorSection.classList.toggle('live-mode', bot.active && bot.liveMode);
  }

  if (statusBar) {
    statusBar.classList.toggle('bot-active', bot.active);
    statusBar.classList.toggle('live-mode', bot.active && bot.liveMode);
  }

  if (runningBadge) {
    runningBadge.classList.toggle('live', bot.liveMode);
    runningBadge.textContent = bot.liveMode ? 'BOT LIVE' : 'BOT ATIVO';
  }

  // Live mode UI
  updateLiveModeUI();
  if (botElements.liveModeToggle) {
    botElements.liveModeToggle.checked = bot.liveMode;
  }

  // Banca
  botElements.balance.textContent = formatCurrency(bot.balance);
  botElements.balance.className = `balance-value ${bot.balance >= bot.initialBalance ? 'positive' : 'negative'}`;

  // Estatísticas
  if (botElements.totalBets) {
    botElements.totalBets.textContent = bot.stats.totalBets;
  }
  if (botElements.wins) {
    const winRate = bot.stats.totalBets > 0 ? ((bot.stats.wins / bot.stats.totalBets) * 100).toFixed(1) : 0;
    botElements.wins.textContent = `${bot.stats.wins} (${winRate}%)`;
  }
  if (botElements.profit) {
    const profitClass = bot.stats.totalProfit >= 0 ? 'positive' : 'negative';
    botElements.profit.textContent = formatCurrency(bot.stats.totalProfit);
    botElements.profit.className = `sim-stat-value ${profitClass}`;
  }
  if (botElements.roi) {
    const roi = bot.stats.totalWagered > 0 ? ((bot.stats.totalProfit / bot.stats.totalWagered) * 100).toFixed(1) : 0;
    botElements.roi.textContent = `${roi}%`;
    botElements.roi.className = `sim-stat-value ${parseFloat(roi) >= 0 ? 'positive' : 'negative'}`;
  }

  // Aposta ativa
  if (botElements.activeBet) {
    if (bot.activeBet) {
      botElements.activeBet.classList.remove('hidden');
      if (botElements.betStatus) {
        botElements.betStatus.textContent = 'Aguardando resultado...';
      }
      if (botElements.betDetails) {
        const betAmount = bot.activeBet.amount;
        const totalBet = betAmount * 2;
        const maxWin = betAmount * bot.activeBet.cashout1 + betAmount * bot.activeBet.cashout2;
        botElements.betDetails.innerHTML = `
          <div class="bot-bet-row">
            <span>Aposta 1:</span>
            <span>${formatCurrency(betAmount)} @ ${bot.activeBet.cashout1}x</span>
          </div>
          <div class="bot-bet-row">
            <span>Aposta 2:</span>
            <span>${formatCurrency(betAmount)} @ ${bot.activeBet.cashout2}x</span>
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
      botElements.activeBet.classList.add('hidden');
    }
  }

  // Histórico
  renderBotHistory();
}

/**
 * Renderiza histórico do bot
 */
function renderBotHistory() {
  if (!botElements.historyList) return;

  if (bot.history.length === 0) {
    botElements.historyList.innerHTML = '<p class="no-history">Nenhuma aposta ainda</p>';
    return;
  }

  // Mostra as últimas 20 apostas (mais recentes primeiro)
  const recent = bot.history.slice(-20).reverse();

  botElements.historyList.innerHTML = recent.map(h => {
    let resultClass = 'loss';
    if (h.won1 && h.won2) resultClass = 'win';
    else if (h.won1 || h.won2) resultClass = 'partial'; // Uma das apostas deu lucro

    return `
      <div class="history-item ${resultClass}">
        <div class="history-main">
          <span class="history-result">${h.resultText}${h.isHighOpportunity ? ' 🚀' : ''}</span>
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
 * Processa nova rodada para o bot
 */
async function processBotRound(round) {
  // Se o bot não está ativo, apenas atualiza a análise
  if (!bot.active) {
    updateBotDecision();
    return;
  }

  // Evita processamento duplo
  if (bot.isProcessing) {
    console.log('[Bot] Já processando, ignorando...');
    return;
  }

  // Verifica tempo mínimo entre processamentos
  const now = Date.now();
  if (now - bot.lastRoundTime < 3000) { // Mínimo 3 segundos entre rodadas
    console.log('[Bot] Rodada muito próxima, ignorando...');
    return;
  }

  bot.isProcessing = true;
  bot.lastRoundTime = now;

  console.log(`[Bot] Processando rodada: ${round.multiplier}x`);

  // Se tem aposta ativa, resolve primeiro (aguarda para obter dados reais em modo live)
  if (bot.activeBet) {
    await resolveBotBet(round.multiplier);
  }

  // Aguarda o delay configurado antes de decidir a próxima aposta
  // Isso dá tempo para a fase de apostas começar
  console.log(`[Bot] Aguardando ${BOT_TIMING.delayAfterRound / 1000}s antes de analisar próxima aposta...`);

  setTimeout(async () => {
    // Atualiza análise com os dados mais recentes
    updateBotDecision();

    // Verifica se ainda está ativo e pode apostar
    if (!bot.active) {
      bot.isProcessing = false;
      return;
    }

    // Verifica se tem saldo suficiente
    const totalBet = BOT_CONFIG.betAmount * 2;
    if (bot.balance < totalBet && !bot.liveMode) {
      console.log('[Bot] Saldo insuficiente para apostar');
      bot.isProcessing = false;
      return;
    }

    // Se deve apostar e não tem aposta ativa, coloca aposta
    if (bot.lastDecision && bot.lastDecision.shouldBet && !bot.activeBet) {
      console.log('[Bot] Decisão: APOSTAR');
      await placeBotBet(bot.lastDecision);
    } else if (bot.lastDecision && !bot.lastDecision.shouldBet) {
      console.log('[Bot] Decisão: AGUARDAR');
    }

    bot.isProcessing = false;
  }, BOT_TIMING.delayAfterRound);
}

// Inicia quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);
