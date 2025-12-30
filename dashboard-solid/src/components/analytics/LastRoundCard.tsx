import { Component, Show, createMemo } from 'solid-js';
import { roundsStore, getLastSpinbetterRound, getLastBet365Round } from '../../stores/rounds';
import { getMultiplierColor } from '../../types';
import { formatCurrency, formatNumber, formatRelativeTime } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { RoundData } from '../../types';

// Badge-like colors matching the rounds grid
const multiplierColors = {
  low: 'text-red',
  medium: 'text-orange',
  good: 'text-yellow',
  great: 'text-green',
  excellent: 'text-cyan',
  epic: 'text-pink',
  legendary: 'text-purple',
};

interface PlatformCardProps {
  platform: 'spinbetter' | 'bet365';
  round: RoundData | undefined;
}

const PlatformCard: Component<PlatformCardProps> = (props) => {
  const houseProfit = createMemo(() => {
    if (!props.round) return 0;
    return props.round.totalBet - props.round.totalWin;
  });

  const multiplierColorClass = createMemo(() => {
    if (!props.round) return 'text-text-primary';
    return multiplierColors[getMultiplierColor(props.round.multiplier)];
  });

  const platformConfig = {
    spinbetter: {
      name: 'Spinbetter',
      color: 'text-cyan',
      bgColor: 'bg-cyan/10',
      borderColor: 'border-cyan/30',
    },
    bet365: {
      name: 'Bet365',
      color: 'text-green',
      bgColor: 'bg-green/10',
      borderColor: 'border-green/30',
    },
  };

  const config = platformConfig[props.platform];

  return (
    <div class={cn('flex-1 p-3 rounded-lg border', config.bgColor, config.borderColor)}>
      <div class="flex items-center justify-between mb-2">
        <span class={cn('text-xs font-semibold uppercase tracking-wider', config.color)}>
          {config.name}
        </span>
        <Show when={props.round}>
          <span class="text-[10px] text-text-muted">
            #{props.round!.id}
          </span>
        </Show>
      </div>

      <Show
        when={props.round}
        fallback={
          <div class="text-center text-text-muted py-4 text-sm">
            Sem dados
          </div>
        }
      >
        {(round) => (
          <div class="space-y-2">
            {/* Multiplier - Large */}
            <div class="flex items-baseline justify-between">
              <div class={cn('text-3xl font-black font-mono', multiplierColorClass())}>
                {round().multiplier >= 10
                  ? Math.floor(round().multiplier)
                  : round().multiplier.toFixed(2)}x
              </div>
              <div class="text-[10px] text-text-muted">
                {formatRelativeTime(round().createdAt)}
              </div>
            </div>

            {/* Mini Stats */}
            <div class="grid grid-cols-2 gap-1.5 text-[10px]">
              <div class="bg-bg-primary/50 rounded px-2 py-1">
                <span class="text-text-muted">Jogadores: </span>
                <span class="font-mono text-cyan">{formatNumber(round().betCount)}</span>
              </div>
              <div class="bg-bg-primary/50 rounded px-2 py-1">
                <span class="text-text-muted">Apostado: </span>
                <span class="font-mono text-yellow">{formatCurrency(round().totalBet)}</span>
              </div>
              <div class="bg-bg-primary/50 rounded px-2 py-1">
                <span class="text-text-muted">Pago: </span>
                <span class="font-mono text-green">{formatCurrency(round().totalWin)}</span>
              </div>
              <div class="bg-bg-primary/50 rounded px-2 py-1">
                <span class="text-text-muted">Casa: </span>
                <span class={cn('font-mono', houseProfit() >= 0 ? 'text-green' : 'text-red')}>
                  {formatCurrency(houseProfit())}
                </span>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

export const LastRoundCard: Component = () => {
  const lastSpinbetter = createMemo(() => getLastSpinbetterRound());
  const lastBet365 = createMemo(() => getLastBet365Round());

  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Últimas Rodadas
      </h2>

      <div class="flex gap-3">
        <PlatformCard platform="spinbetter" round={lastSpinbetter()} />
        <PlatformCard platform="bet365" round={lastBet365()} />
      </div>
    </div>
  );
};
