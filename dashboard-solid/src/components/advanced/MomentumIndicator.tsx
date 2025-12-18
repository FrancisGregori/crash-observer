import { Component, Show, createMemo } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { cn } from '../../lib/utils';

export const MomentumIndicator: Component = () => {
  const momentum = createMemo(() => roundsStore.advancedStats?.momentum);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'hot':
        return '🔥';
      case 'cold':
        return '❄️';
      default:
        return '⚖️';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'hot':
        return 'Quente';
      case 'cold':
        return 'Frio';
      default:
        return 'Estável';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'hot':
        return 'text-orange';
      case 'cold':
        return 'text-cyan';
      default:
        return 'text-yellow';
    }
  };

  const getMeterPosition = (trend: number) => {
    // Trend ranges from -100 to 100, normalize to 0-100
    return Math.max(0, Math.min(100, (trend + 100) / 2));
  };

  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Momentum
      </h2>

      <Show
        when={momentum()}
        fallback={
          <div class="flex flex-col items-center py-4">
            <div class="text-4xl animate-pulse">⏳</div>
            <div class="h-4 w-20 bg-bg-secondary rounded mt-3 animate-pulse" />
          </div>
        }
      >
        {(mom) => (
          <div class="flex flex-col items-center">
            {/* Icon and Status */}
            <div class="text-4xl mb-2">{getStatusIcon(mom().momentumStatus)}</div>
            <div class={cn('text-lg font-bold', getStatusColor(mom().momentumStatus))}>
              {getStatusLabel(mom().momentumStatus)}
            </div>

            {/* Momentum Meter */}
            <div class="w-full mt-4 px-2">
              <div class="relative h-2 bg-bg-secondary rounded-full overflow-hidden">
                {/* Gradient background */}
                <div class="absolute inset-0 bg-gradient-to-r from-cyan via-yellow to-orange" />

                {/* Indicator */}
                <div
                  class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-bg-primary transition-all duration-300"
                  style={{ left: `calc(${getMeterPosition(mom().trend10vs50)}% - 6px)` }}
                />
              </div>
              <div class="flex justify-between mt-1 text-[10px] text-text-muted">
                <span>Frio</span>
                <span>Neutro</span>
                <span>Quente</span>
              </div>
            </div>

            {/* Comparison text */}
            <div class="mt-3 text-xs text-text-muted text-center">
              Últimas 10: {mom().avgLast10.toFixed(2)}x vs Média: {mom().avgMultiplierAll.toFixed(2)}x
            </div>

            {/* Trend percentage */}
            <div class={cn(
              'mt-1 text-sm font-mono',
              mom().trend10vs50 > 0 ? 'text-green' : mom().trend10vs50 < 0 ? 'text-red' : 'text-yellow'
            )}>
              {mom().trend10vs50 > 0 ? '+' : ''}{mom().trend10vs50.toFixed(1)}%
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
