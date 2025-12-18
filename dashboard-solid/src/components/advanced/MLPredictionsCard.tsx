import { Component, Show, For, createMemo } from 'solid-js';
import { mlStore } from '../../stores/ml';
import { formatPercent } from '../../lib/format';
import { cn } from '../../lib/utils';

export const MLPredictionsCard: Component = () => {
  const probabilities = createMemo(() => {
    const pred = mlStore.prediction;
    if (!pred) return [];

    return [
      { threshold: '≥2x', probability: pred.prob_gt_2x * 100, color: 'green' },
      { threshold: '≥3x', probability: pred.prob_gt_3x * 100, color: 'cyan' },
      { threshold: '≥5x', probability: pred.prob_gt_5x * 100, color: 'yellow' },
      { threshold: '≥10x', probability: pred.prob_gt_10x * 100, color: 'orange' },
    ];
  });

  const riskIndicators = createMemo(() => {
    const pred = mlStore.prediction;
    if (!pred) return [];

    return [
      { name: 'Confiança', value: pred.prob_gt_2x * 100, isConfidence: true },
      { name: 'Crash Precoce', value: pred.prob_early_crash * 100, isConfidence: false },
      { name: 'Seq. Perdas', value: pred.prob_high_loss_streak * 100, isConfidence: false },
    ];
  });

  const decision = createMemo(() => {
    const pred = mlStore.prediction;
    if (!pred) return 'wait';

    if (pred.prob_early_crash > 0.35 || pred.prob_high_loss_streak > 0.5) {
      return 'skip';
    }
    if (pred.prob_gt_2x >= 0.5) {
      return 'bet';
    }
    return 'wait';
  });

  const getBarColor = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green';
      case 'cyan': return 'bg-cyan';
      case 'yellow': return 'bg-yellow';
      case 'orange': return 'bg-orange';
      default: return 'bg-accent';
    }
  };

  const getTextColor = (color: string) => {
    switch (color) {
      case 'green': return 'text-green';
      case 'cyan': return 'text-cyan';
      case 'yellow': return 'text-yellow';
      case 'orange': return 'text-orange';
      default: return 'text-accent';
    }
  };

  const getDecisionColor = (dec: string) => {
    switch (dec) {
      case 'bet': return 'text-green';
      case 'skip': return 'text-red';
      default: return 'text-yellow';
    }
  };

  const getDecisionBgColor = (dec: string) => {
    switch (dec) {
      case 'bet': return 'bg-green/20 border-green';
      case 'skip': return 'bg-red/20 border-red';
      default: return 'bg-yellow/20 border-yellow';
    }
  };

  const getDecisionLabel = (dec: string) => {
    switch (dec) {
      case 'bet': return 'APOSTAR';
      case 'skip': return 'PULAR';
      default: return 'AGUARDAR';
    }
  };

  return (
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Predições ML
        </h2>
        <Show
          when={mlStore.isConnected}
          fallback={<span class="text-xs px-2 py-0.5 rounded bg-red/20 text-red">Offline</span>}
        >
          <span class="text-xs px-2 py-0.5 rounded bg-green/20 text-green">Online</span>
        </Show>
      </div>

      <Show
        when={mlStore.prediction}
        fallback={
          <div class="text-center py-8 text-text-muted">
            <div class="text-4xl mb-3">🤖</div>
            <p class="text-sm font-medium">Aguardando predições...</p>
            <p class="text-xs mt-1 opacity-60">(Requer ML Service + Redis)</p>
          </div>
        }
      >
        <div class="space-y-4">
          {/* Compact Decision - inline */}
          <div class={cn(
            'flex items-center justify-between p-2 rounded-lg border',
            getDecisionBgColor(decision())
          )}>
            <div class="flex items-center gap-2">
              <span class="text-xs text-text-muted">Decisão:</span>
              <span class={cn('text-sm font-black', getDecisionColor(decision()))}>
                {getDecisionLabel(decision())}
              </span>
            </div>
            <span class="text-xs text-text-muted">
              #{mlStore.prediction?.round_id}
            </span>
          </div>

          {/* Probability Bars */}
          <div class="space-y-3">
            <For each={probabilities()}>
              {(prob) => (
                <div>
                  <div class="flex justify-between items-center mb-1.5">
                    <span class="text-sm font-medium text-text-secondary">{prob.threshold}</span>
                    <span class={cn('text-lg font-bold font-mono', getTextColor(prob.color))}>
                      {formatPercent(prob.probability)}
                    </span>
                  </div>
                  <div class="h-3 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      class={cn('h-full rounded-full transition-all duration-500', getBarColor(prob.color))}
                      style={{ width: `${prob.probability}%` }}
                    />
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* Risk Indicators */}
          <div class="p-3 bg-bg-secondary rounded-lg">
            <div class="text-xs text-text-muted mb-2 uppercase tracking-wider">Indicadores</div>
            <div class="grid grid-cols-3 gap-2">
              <For each={riskIndicators()}>
                {(indicator) => (
                  <div class="text-center">
                    <div class="text-[10px] text-text-muted mb-0.5">{indicator.name}</div>
                    <div class={cn(
                      'text-base font-bold font-mono',
                      indicator.isConfidence
                        ? (indicator.value >= 50 ? 'text-green' : indicator.value >= 40 ? 'text-yellow' : 'text-red')
                        : (indicator.value > 35 ? 'text-red' : indicator.value > 25 ? 'text-yellow' : 'text-green')
                    )}>
                      {formatPercent(indicator.value)}
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Model Info */}
          <div class="text-xs text-text-muted text-center pt-2 border-t border-white/5">
            Modelo: {mlStore.prediction?.model_version}
          </div>
        </div>
      </Show>
    </div>
  );
};
