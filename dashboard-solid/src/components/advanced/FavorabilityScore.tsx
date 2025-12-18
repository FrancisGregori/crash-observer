import { Component, Show, createMemo } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { cn } from '../../lib/utils';

export const FavorabilityScore: Component = () => {
  const score = createMemo(() => roundsStore.advancedStats?.favorabilityScore ?? 0);
  const level = createMemo(() => roundsStore.advancedStats?.favorabilityLevel ?? 'medium');

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green';
    if (score >= 50) return 'text-yellow';
    if (score >= 30) return 'text-orange';
    return 'text-red';
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case 'high':
        return 'Favorável';
      case 'low':
        return 'Desfavorável';
      default:
        return 'Neutro';
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'text-green';
      case 'low':
        return 'text-red';
      default:
        return 'text-yellow';
    }
  };

  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Score de Favorabilidade
      </h2>

      <Show
        when={roundsStore.advancedStats}
        fallback={
          <div class="flex flex-col items-center py-4">
            <div class="w-20 h-20 rounded-full bg-bg-secondary animate-pulse" />
            <div class="h-4 w-24 bg-bg-secondary rounded mt-3 animate-pulse" />
          </div>
        }
      >
        <div class="flex flex-col items-center">
          {/* Circular Score */}
          <div class="relative w-24 h-24">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              {/* Background circle */}
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                class="text-bg-secondary"
              />
              {/* Progress circle */}
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-dasharray={`${score()} 100`}
                stroke-linecap="round"
                class={getScoreColor(score())}
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class={cn('text-2xl font-bold', getScoreColor(score()))}>
                {score()}
              </span>
            </div>
          </div>

          {/* Status */}
          <div class={cn('text-sm font-semibold mt-2', getLevelColor(level()))}>
            {getLevelLabel(level())}
          </div>

          {/* Additional info */}
          <div class="mt-3 text-xs text-text-muted text-center">
            Baseado em {roundsStore.advancedStats?.totalRounds ?? 0} rodadas
          </div>
        </div>
      </Show>
    </div>
  );
};
