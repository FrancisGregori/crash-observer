import { Component, Show, For, createMemo } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { formatPercent } from '../../lib/format';
import { cn } from '../../lib/utils';

export const HourlyAnalysis: Component = () => {
  const hourlyData = () => roundsStore.hourlyAnalysis?.hourly || [];

  const currentHour = () => new Date().getHours();

  const maxRounds = createMemo(() => {
    const hours = hourlyData();
    if (hours.length === 0) return 1;
    return Math.max(...hours.map((h) => h.rounds), 1);
  });

  const globalRate = createMemo(() => {
    const hours = hourlyData();
    if (hours.length === 0) return 0;
    const totalRounds = hours.reduce((sum, h) => sum + h.rounds, 0);
    const totalAbove2x = hours.reduce((sum, h) => sum + h.roundsAbove2x, 0);
    return totalRounds > 0 ? (totalAbove2x / totalRounds) * 100 : 0;
  });

  const currentHourData = createMemo(() => {
    return hourlyData().find(h => h.hour === currentHour());
  });

  const sortedByRate = createMemo(() => {
    return [...hourlyData()]
      .filter(h => h.rounds >= 5)
      .sort((a, b) => b.successRate2x - a.successRate2x);
  });

  const bestHours = createMemo(() => sortedByRate().slice(0, 3));
  const worstHours = createMemo(() => sortedByRate().slice(-3).reverse());

  const getHourLabel = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}h`;
  };

  const getRateColor = (rate: number, global: number) => {
    const diff = rate - global;
    if (diff > 10) return 'text-green';
    if (diff > 0) return 'text-cyan';
    if (diff > -10) return 'text-yellow';
    return 'text-red';
  };

  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Análise por Hora (Taxa ≥2x)
      </h2>

      <Show
        when={hourlyData().length > 0}
        fallback={
          <div class="space-y-4">
            <div class="grid grid-cols-12 gap-1">
              <For each={Array(24).fill(0)}>
                {() => (
                  <div class="h-16 bg-bg-secondary rounded animate-pulse" />
                )}
              </For>
            </div>
          </div>
        }
      >
        <div class="space-y-4">
          {/* Current Hour Info */}
          <div class="flex items-center justify-between p-3 bg-bg-secondary rounded">
            <div>
              <span class="text-xs text-text-muted">Hora Atual</span>
              <div class="text-lg font-bold text-cyan">
                {getHourLabel(currentHour())}
              </div>
            </div>
            <div class="text-right">
              <span class="text-xs text-text-muted">Taxa ≥2x</span>
              <div
                class={cn(
                  'text-lg font-bold',
                  getRateColor(currentHourData()?.successRate2x || 0, globalRate())
                )}
              >
                {formatPercent(currentHourData()?.successRate2x || 0)}
              </div>
            </div>
            <div class="text-right">
              <span class="text-xs text-text-muted">Média Global</span>
              <div class="text-lg font-bold text-text-secondary">
                {formatPercent(globalRate())}
              </div>
            </div>
          </div>

          {/* Hourly Bar Chart */}
          <div class="grid grid-cols-12 gap-1">
            <For each={hourlyData()}>
              {(hour) => {
                const barHeight = () =>
                  maxRounds() > 0 ? (hour.rounds / maxRounds()) * 100 : 0;
                const isCurrentHour = () => hour.hour === currentHour();

                return (
                  <div
                    class={cn(
                      'flex flex-col items-center',
                      isCurrentHour() && 'bg-bg-tertiary rounded'
                    )}
                  >
                    <div class="h-16 w-full flex items-end justify-center">
                      <div
                        class={cn(
                          'w-full rounded-t transition-all',
                          isCurrentHour() ? 'bg-cyan' : 'bg-bg-tertiary'
                        )}
                        style={{ height: `${barHeight()}%` }}
                        title={`${hour.rounds} rodadas, ${formatPercent(hour.successRate2x)} ≥2x`}
                      />
                    </div>
                    <span
                      class={cn(
                        'text-[10px] mt-1',
                        isCurrentHour() ? 'text-cyan font-bold' : 'text-text-muted'
                      )}
                    >
                      {hour.hour}
                    </span>
                  </div>
                );
              }}
            </For>
          </div>

          {/* Best and Worst Hours */}
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="text-xs text-text-muted block mb-2">
                Melhores Horas
              </span>
              <div class="space-y-1">
                <For each={bestHours()}>
                  {(hour) => (
                    <div class="flex justify-between text-sm">
                      <span class="text-green">{getHourLabel(hour.hour)}</span>
                      <span class="text-text-secondary">
                        {formatPercent(hour.successRate2x)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
            <div>
              <span class="text-xs text-text-muted block mb-2">
                Piores Horas
              </span>
              <div class="space-y-1">
                <For each={worstHours()}>
                  {(hour) => (
                    <div class="flex justify-between text-sm">
                      <span class="text-red">{getHourLabel(hour.hour)}</span>
                      <span class="text-text-secondary">
                        {formatPercent(hour.successRate2x)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
