import { Component, For, createMemo, Show } from 'solid-js';
import { roundsStore, getSpinbetterRounds, getBet365Rounds } from '../../stores/rounds';
import { getMultiplierColor, getPlatformLabel } from '../../types';
import { formatMultiplier } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { RoundData } from '../../types';

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

interface PlatformRowProps {
  platform: 'spinbetter' | 'bet365';
  rounds: RoundData[];
}

const PlatformRow: Component<PlatformRowProps> = (props) => {
  const platformConfig = {
    spinbetter: {
      name: 'SB',
      fullName: 'Spinbetter',
      color: 'text-cyan',
      bgColor: 'bg-cyan/20',
      borderColor: 'border-cyan',
    },
    bet365: {
      name: 'B365',
      fullName: 'Bet365',
      color: 'text-green',
      bgColor: 'bg-green/20',
      borderColor: 'border-green',
    },
  };

  const config = platformConfig[props.platform];

  return (
    <div class="flex items-center gap-2">
      {/* Platform label */}
      <div
        class={cn(
          'shrink-0 px-2 py-1 rounded text-[10px] font-bold uppercase',
          config.bgColor,
          config.color
        )}
        title={config.fullName}
      >
        {config.name}
      </div>

      {/* Rounds */}
      <div class="flex gap-1.5 overflow-x-auto scrollbar-hidden">
        <Show
          when={props.rounds.length > 0}
          fallback={
            <div class="text-text-muted text-xs py-1.5 px-3 italic">
              Aguardando dados...
            </div>
          }
        >
          <For each={props.rounds.slice(0, 50)}>
            {(round) => {
              const color = getMultiplierColor(round.multiplier);

              return (
                <div
                  class={cn(
                    'shrink-0 px-3 py-1 rounded-full flex items-center justify-center',
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
        </Show>
      </div>
    </div>
  );
};

export const RoundsGrid: Component = () => {
  const spinbetterRounds = createMemo(() => getSpinbetterRounds());
  const bet365Rounds = createMemo(() => getBet365Rounds());

  return (
    <div class="flex flex-col gap-2 py-3 pl-2">
      <PlatformRow platform="spinbetter" rounds={spinbetterRounds()} />
      <PlatformRow platform="bet365" rounds={bet365Rounds()} />
    </div>
  );
};
