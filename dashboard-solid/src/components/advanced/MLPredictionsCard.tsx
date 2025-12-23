import { Component, Show, For, createMemo } from 'solid-js';
import { mlStore } from '../../stores/ml';
import { cn } from '../../lib/utils';

// Mini donut chart component
const MiniDonut: Component<{
  value: number;
  label: string;
  color: string;
  size?: number;
}> = (props) => {
  const size = () => props.size ?? 48;
  const strokeWidth = 3;
  const radius = 15.915;

  const getColorClass = () => {
    switch (props.color) {
      case 'green': return 'text-green';
      case 'cyan': return 'text-cyan';
      case 'yellow': return 'text-yellow';
      case 'orange': return 'text-orange';
      case 'red': return 'text-red';
      case 'purple': return 'text-purple';
      default: return 'text-accent';
    }
  };

  return (
    <div class="flex flex-col items-center">
      <div class="relative" style={{ width: `${size()}px`, height: `${size()}px` }}>
        <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke="currentColor"
            stroke-width={strokeWidth}
            class="text-bg-secondary"
          />
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke="currentColor"
            stroke-width={strokeWidth}
            stroke-dasharray={`${props.value} 100`}
            stroke-linecap="round"
            class={getColorClass()}
          />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class={cn('text-sm font-bold', getColorClass())}>
            {Math.round(props.value)}%
          </span>
        </div>
      </div>
      <span class={cn('text-xs font-medium mt-1.5', getColorClass())}>{props.label}</span>
    </div>
  );
};

export const MLPredictionsCard: Component = () => {
  const probabilities = createMemo(() => {
    const pred = mlStore.prediction;
    if (!pred) return [];

    return [
      { threshold: '≥1.5x', probability: (pred.prob_gt_1_5x ?? 0) * 100, color: 'green' },
      { threshold: '≥2x', probability: pred.prob_gt_2x * 100, color: 'cyan' },
      { threshold: '≥3x', probability: pred.prob_gt_3x * 100, color: 'yellow' },
      { threshold: '≥5x', probability: pred.prob_gt_5x * 100, color: 'orange' },
      { threshold: '≥10x', probability: pred.prob_gt_10x * 100, color: 'red' },
    ];
  });

  const confidence = createMemo(() => {
    const pred = mlStore.prediction;
    if (!pred) return 0;
    return pred.prob_gt_2x * 100;
  });

  const riskIndicators = createMemo(() => {
    const pred = mlStore.prediction;
    if (!pred) return [];

    return [
      { name: 'Crash Precoce', value: pred.prob_early_crash * 100, isRisk: true },
      { name: 'Seq. Perdas', value: pred.prob_high_loss_streak * 100, isRisk: true },
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
      <div class="flex items-center justify-between mb-3">
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
          <div class="text-center py-6 text-text-muted">
            <div class="text-3xl mb-2">🤖</div>
            <p class="text-xs font-medium">Aguardando predições...</p>
            <p class="text-[10px] mt-1 opacity-60">(Requer ML Service + Redis)</p>
          </div>
        }
      >
        <div>
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

          {/* Probability Donuts - Grid */}
          <div class="grid grid-cols-5 gap-3 mt-6 pb-4">
            <For each={probabilities()}>
              {(prob) => (
                <MiniDonut
                  value={prob.probability}
                  label={prob.threshold}
                  color={prob.color}
                  size={72}
                />
              )}
            </For>
          </div>

          {/* Confidence + Risk Indicators */}
          <div class="flex justify-center gap-10 pt-5 border-t border-white/5">
            <MiniDonut
              value={confidence()}
              label="Confiança"
              color={confidence() >= 50 ? 'green' : confidence() >= 40 ? 'yellow' : 'red'}
              size={68}
            />
            <For each={riskIndicators()}>
              {(indicator) => (
                <MiniDonut
                  value={indicator.value}
                  label={indicator.name}
                  color={indicator.value > 35 ? 'red' : indicator.value > 25 ? 'yellow' : 'green'}
                  size={68}
                />
              )}
            </For>
          </div>

          {/* Model Info */}
          <div class="text-[10px] text-text-muted text-center pt-1">
            v{mlStore.prediction?.model_version}
          </div>
        </div>
      </Show>
    </div>
  );
};
