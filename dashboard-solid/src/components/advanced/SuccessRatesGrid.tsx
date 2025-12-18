import { Component, Show, For, createMemo } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { formatPercent } from '../../lib/format';
import { cn } from '../../lib/utils';

interface RateItemProps {
  label: string;
  rate: number;
  avgRounds: number;
  description: string;
  color: string;
}

const RateItem: Component<RateItemProps> = (props) => {
  return (
    <div class="text-center p-3 bg-bg-secondary rounded-lg">
      <div class="text-xs text-text-muted mb-1">{props.label}</div>
      <div class={cn('text-xl font-bold font-mono', props.color)}>
        {formatPercent(props.rate)}
      </div>
      <div class="h-1.5 bg-bg-tertiary rounded-full mt-2 overflow-hidden">
        <div
          class={cn('h-full transition-all duration-300', props.color.replace('text-', 'bg-'))}
          style={{ width: `${Math.min(props.rate, 100)}%` }}
        />
      </div>
      <div class="text-[10px] text-text-muted mt-1">
        ~{props.avgRounds.toFixed(1)} rodadas
      </div>
    </div>
  );
};

export const SuccessRatesGrid: Component = () => {
  const rates = createMemo(() => {
    const successRates = roundsStore.advancedStats?.successRates;
    if (!successRates) return [];

    const rateConfigs = [
      { key: '2x', color: 'text-green' },
      { key: '3x', color: 'text-cyan' },
      { key: '5x', color: 'text-yellow' },
      { key: '10x', color: 'text-orange' },
    ];

    return rateConfigs
      .map(config => {
        const data = successRates[config.key];
        if (!data) return null;
        return {
          label: `≥${config.key}`,
          rate: data.rate,
          avgRounds: data.avgRounds,
          description: data.description,
          color: config.color,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  });

  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Taxas de Sucesso
      </h2>

      <Show
        when={rates().length > 0}
        fallback={
          <div class="grid grid-cols-4 gap-3">
            <For each={[1, 2, 3, 4]}>
              {() => (
                <div class="text-center p-3 bg-bg-secondary rounded-lg animate-pulse">
                  <div class="h-3 w-8 mx-auto bg-bg-tertiary rounded mb-2" />
                  <div class="h-6 w-12 mx-auto bg-bg-tertiary rounded" />
                </div>
              )}
            </For>
          </div>
        }
      >
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <For each={rates()}>
            {(item) => (
              <RateItem
                label={item.label}
                rate={item.rate}
                avgRounds={item.avgRounds}
                description={item.description}
                color={item.color}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
