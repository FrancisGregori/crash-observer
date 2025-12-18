import { Component, Show } from 'solid-js';
import { formatCurrency, formatPercent } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { SimulatorStats as StatsType } from '../../types';

interface SimulatorStatsProps {
  stats: StatsType;
}

export const SimulatorStats: Component<SimulatorStatsProps> = (props) => {
  const winRate = () =>
    props.stats.totalBets > 0
      ? (props.stats.wins / props.stats.totalBets) * 100
      : 0;

  const avgProfit = () =>
    props.stats.totalBets > 0
      ? props.stats.totalProfit / props.stats.totalBets
      : 0;

  return (
    <Show when={props.stats.totalBets > 0}>
      <div class="mb-4">
        <h3 class="text-xs text-text-muted uppercase tracking-wider mb-2">
          Estatísticas
        </h3>
        <div class="grid grid-cols-4 gap-2">
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-xs text-text-muted">Apostas</div>
            <div class="text-lg font-bold font-mono text-cyan">
              {props.stats.totalBets}
            </div>
          </div>
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-xs text-text-muted">Taxa</div>
            <div
              class={cn(
                'text-lg font-bold font-mono',
                winRate() >= 50 ? 'text-green' : 'text-red'
              )}
            >
              {formatPercent(winRate())}
            </div>
          </div>
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-xs text-text-muted">Apostado</div>
            <div class="text-lg font-bold font-mono text-yellow">
              {formatCurrency(props.stats.totalWagered)}
            </div>
          </div>
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-xs text-text-muted">Lucro</div>
            <div
              class={cn(
                'text-lg font-bold font-mono',
                props.stats.totalProfit >= 0 ? 'text-green' : 'text-red'
              )}
            >
              {formatCurrency(props.stats.totalProfit)}
            </div>
          </div>
        </div>

        {/* Win/Loss Bar */}
        <div class="mt-2">
          <div class="flex justify-between text-xs text-text-muted mb-1">
            <span>
              V: {props.stats.wins} ({formatPercent(winRate())})
            </span>
            <span>
              D: {props.stats.losses} ({formatPercent(100 - winRate())})
            </span>
          </div>
          <div class="h-2 bg-red rounded-full overflow-hidden">
            <div
              class="h-full bg-green transition-all duration-300"
              style={{ width: `${winRate()}%` }}
            />
          </div>
        </div>
      </div>
    </Show>
  );
};
