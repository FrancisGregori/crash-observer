import { Component, Show, For } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { formatNumber, formatMultiplier } from '../../lib/format';

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
}

const StatCard: Component<StatCardProps> = (props) => {
  return (
    <div class="stat-card">
      <span class="stat-label">{props.label}</span>
      <span class={`stat-value ${props.color || ''}`}>{props.value}</span>
    </div>
  );
};

export const StatisticsGrid: Component = () => {
  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Estatísticas Gerais
      </h2>

      <Show
        when={roundsStore.stats}
        fallback={
          <div class="grid grid-cols-5 gap-3">
            <For each={[1, 2, 3, 4, 5]}>
              {() => (
                <div class="stat-card animate-pulse">
                  <div class="h-3 w-16 bg-bg-secondary rounded mb-2" />
                  <div class="h-6 w-12 bg-bg-secondary rounded" />
                </div>
              )}
            </For>
          </div>
        }
      >
        {(stats) => (
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <StatCard
              label="Total Rodadas"
              value={formatNumber(stats().totalRounds)}
              color="text-cyan"
            />
            <StatCard
              label="Média"
              value={formatMultiplier(stats().avgMultiplier)}
              color="text-yellow"
            />
            <StatCard
              label="Máximo"
              value={formatMultiplier(stats().maxMultiplier)}
              color="text-green"
            />
            <StatCard
              label="Mínimo"
              value={formatMultiplier(stats().minMultiplier)}
              color="text-red"
            />
            <StatCard
              label="Média Jogadores"
              value={formatNumber(stats().bettingStats?.avgPlayers || 0)}
              color="text-purple"
            />
          </div>
        )}
      </Show>
    </div>
  );
};
