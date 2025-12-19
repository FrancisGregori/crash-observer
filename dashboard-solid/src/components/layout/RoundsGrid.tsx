import { Component, For, createMemo } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { getMultiplierColor } from '../../types';
import { formatMultiplier } from '../../lib/format';
import { cn } from '../../lib/utils';

// Color mapping for multiplier ranges - more vibrant colors
const colorClasses = {
  low: 'bg-red/30 text-red border-red',
  medium: 'bg-orange/30 text-orange border-orange',
  good: 'bg-yellow/30 text-yellow border-yellow',
  great: 'bg-green/30 text-green border-green',
  excellent: 'bg-cyan/30 text-cyan border-cyan',
  epic: 'bg-pink/30 text-pink border-pink',
  legendary: 'bg-purple/30 text-purple border-purple',
};

export const RoundsGrid: Component = () => {
  // Get the 50 most recent rounds
  const recentRounds = createMemo(() => roundsStore.rounds.slice(0, 50));

  return (
    <div class="flex gap-1.5 py-4 pl-2 scrollbar-hidden overflow-x-auto">
      <For each={recentRounds()}>
        {(round, index) => {
          const color = getMultiplierColor(round.multiplier);
          const isNewest = index() === 0;

          return (
            <div
              class={cn(
                'shrink-0 px-4 py-1.5 rounded-full flex items-center justify-center',
                'text-xs font-bold font-mono border transition-all',
                colorClasses[color],
                  'text-white'
              )}
              title={`Rodada #${round.id} - ${formatMultiplier(round.multiplier)}`}
            >
              {round.multiplier >= 10
                ? Math.floor(round.multiplier)
                : round.multiplier.toFixed(2)}x
            </div>
          );
        }}
      </For>
    </div>
  );
};
