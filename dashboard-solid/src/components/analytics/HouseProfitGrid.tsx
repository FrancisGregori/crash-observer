import { Component, Show, For } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { formatCurrency, formatNumber } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { HouseProfitPeriod } from '../../types';

interface ProfitCardProps {
  label: string;
  data: HouseProfitPeriod;
  class?: string;
}

const ProfitCard: Component<ProfitCardProps> = (props) => {
  const isPositive = () => props.data.houseProfit >= 0;

  return (
    <div class={cn('stat-card', props.class)}>
      <span class="stat-label whitespace-nowrap">{props.label}</span>
      <span class={cn('stat-value text-sm sm:text-base', isPositive() ? 'text-green' : 'text-red')}>
        {formatCurrency(props.data.houseProfit)}
      </span>
      <div class="text-[10px] text-text-muted mt-1">
        {formatNumber(props.data.rounds)} rodadas
      </div>
    </div>
  );
};

export const HouseProfitGrid: Component = () => {
  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Lucro da Casa
      </h2>

      <Show
        when={roundsStore.houseProfit}
        fallback={
          <div class="space-y-3">
            <div class="grid grid-cols-3 gap-3">
              <For each={[1, 2, 3]}>
                {() => (
                  <div class="stat-card animate-pulse">
                    <div class="h-3 w-12 bg-bg-secondary rounded mb-2" />
                    <div class="h-6 w-16 bg-bg-secondary rounded" />
                  </div>
                )}
              </For>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <For each={[1, 2]}>
                {() => (
                  <div class="stat-card animate-pulse">
                    <div class="h-3 w-12 bg-bg-secondary rounded mb-2" />
                    <div class="h-6 w-16 bg-bg-secondary rounded" />
                  </div>
                )}
              </For>
            </div>
          </div>
        }
      >
        {(data) => (
          <div class="space-y-3">
            {/* First row: 1h, 3h, 6h */}
            <div class="grid grid-cols-3 gap-3">
              <ProfitCard label="1 Hora" data={data().currentHour} />
              <ProfitCard label="3 Horas" data={data().last3Hours} />
              <ProfitCard label="6 Horas" data={data().last6Hours} />
            </div>
            {/* Second row: 24h and Total each 1/2 width */}
            <div class="grid grid-cols-2 gap-3">
              <ProfitCard label="24 Horas" data={data().last24Hours} />
              <ProfitCard label="Total" data={data().allTime} />
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
