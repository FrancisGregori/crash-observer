import { Component, Show, For, createMemo } from 'solid-js';
import { roundsStore } from '../../stores/rounds';

interface StreakData {
  label: string;
  threshold: number;
  current: number;
  avg: number;
}

interface StreakCardProps {
  data: StreakData;
}

const StreakCard: Component<StreakCardProps> = (props) => {
  const getStreakColor = (current: number, avg: number) => {
    const ratio = current / avg;
    if (ratio >= 1.5) return 'text-red';
    if (ratio >= 1.2) return 'text-orange';
    if (ratio >= 0.8) return 'text-yellow';
    return 'text-green';
  };

  return (
    <div class="stat-card">
      <span class="stat-label">{props.data.label}</span>
      <span class={`stat-value ${getStreakColor(props.data.current, props.data.avg)}`}>
        {props.data.current}
      </span>
      <div class="text-xs text-text-muted mt-1">
        média: <span class="text-cyan font-mono">{props.data.avg.toFixed(1)}</span>
      </div>
    </div>
  );
};

export const StreaksGrid: Component = () => {
  // Get averages from advanced stats
  const getAvg = (threshold: number): number => {
    const advanced = roundsStore.advancedStats;
    if (!advanced?.probabilities) return threshold; // Default to threshold as approximation

    const key = `x${threshold}`;
    const prob = advanced.probabilities[key];
    if (prob?.avgRoundsToHit) {
      return prob.avgRoundsToHit;
    }
    return threshold; // Fallback
  };

  const streaksData = createMemo((): StreakData[] => {
    const streaks = roundsStore.stats?.streaks;
    if (!streaks) return [];

    return [
      { label: '< 2x', threshold: 2, current: streaks.below2x, avg: getAvg(2) },
      { label: '< 5x', threshold: 5, current: streaks.below5x, avg: getAvg(5) },
      { label: '< 10x', threshold: 10, current: streaks.below10x, avg: getAvg(10) },
      { label: '< 15x', threshold: 15, current: streaks.below15x, avg: getAvg(15) },
      { label: '< 20x', threshold: 20, current: streaks.below20x, avg: getAvg(20) },
    ];
  });

  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Sequências Atuais (sem atingir)
      </h2>

      <Show
        when={streaksData().length > 0}
        fallback={
          <div class="grid grid-cols-5 gap-3">
            <For each={[1, 2, 3, 4, 5]}>
              {() => (
                <div class="stat-card animate-pulse">
                  <div class="h-3 w-12 bg-bg-secondary rounded mb-2" />
                  <div class="h-6 w-10 bg-bg-secondary rounded" />
                </div>
              )}
            </For>
          </div>
        }
      >
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <For each={streaksData()}>
            {(data) => <StreakCard data={data} />}
          </For>
        </div>
      </Show>
    </div>
  );
};
