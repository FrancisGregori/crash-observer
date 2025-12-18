import { Component, Show, For, createMemo } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { formatPercent } from '../../lib/format';
import { cn } from '../../lib/utils';

const getBarColor = (range: string): string => {
  if (range.includes('< 2x') || range === '< 2x') return 'bg-red';
  if (range.includes('2x') && range.includes('3x')) return 'bg-orange';
  if (range.includes('3x') && range.includes('5x')) return 'bg-yellow';
  if (range.includes('5x') && range.includes('10x')) return 'bg-green';
  if (range.includes('10x')) return 'bg-cyan';
  return 'bg-purple';
};

export const DistributionChart: Component = () => {
  const distribution = () => roundsStore.stats?.distribution || [];

  const totalCount = createMemo(() => {
    return distribution().reduce((sum, d) => sum + d.count, 0);
  });

  const maxCount = createMemo(() => {
    const dist = distribution();
    if (dist.length === 0) return 1;
    return Math.max(...dist.map((d) => d.count), 1);
  });

  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Distribuição de Multiplicadores
      </h2>

      <Show
        when={distribution().length > 0}
        fallback={
          <div class="space-y-2">
            <For each={[1, 2, 3, 4, 5]}>
              {() => (
                <div class="flex items-center gap-3">
                  <div class="w-16 h-4 bg-bg-secondary rounded animate-pulse" />
                  <div class="flex-1 h-6 bg-bg-secondary rounded animate-pulse" />
                  <div class="w-12 h-4 bg-bg-secondary rounded animate-pulse" />
                </div>
              )}
            </For>
          </div>
        }
      >
        <div class="space-y-2">
          <For each={distribution()}>
            {(item) => {
              const barWidth = () =>
                maxCount() > 0
                  ? (item.count / maxCount()) * 100
                  : 0;
              const percentage = () =>
                totalCount() > 0
                  ? (item.count / totalCount()) * 100
                  : 0;

              return (
                <div class="flex items-center gap-3">
                  <span class="w-20 text-xs text-text-secondary font-mono text-right">
                    {item.range}
                  </span>
                  <div class="flex-1 h-6 bg-bg-secondary rounded overflow-hidden">
                    <div
                      class={cn('h-full transition-all duration-300', getBarColor(item.range))}
                      style={{ width: `${barWidth()}%` }}
                    />
                  </div>
                  <span class="w-20 text-xs text-text-muted font-mono">
                    {formatPercent(percentage())} ({item.count})
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};
