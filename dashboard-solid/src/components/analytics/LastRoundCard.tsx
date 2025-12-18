import { Component, Show, createMemo } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { getMultiplierColor } from '../../types';
import { formatCurrency, formatNumber, formatRelativeTime } from '../../lib/format';
import { cn } from '../../lib/utils';

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

export const LastRoundCard: Component = () => {
  const lastRound = createMemo(() => roundsStore.rounds[0]);

  const houseProfit = createMemo(() => {
    const round = lastRound();
    if (!round) return 0;
    return round.totalBet - round.totalWin;
  });

  const multiplierColorClass = createMemo(() => {
    const round = lastRound();
    if (!round) return 'text-text-primary';
    return multiplierColors[getMultiplierColor(round.multiplier)];
  });

  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Última Rodada
      </h2>

      <Show
        when={lastRound()}
        fallback={
          <div class="text-center text-text-muted py-8">
            Aguardando dados...
          </div>
        }
      >
        {(round) => (
          <div class="space-y-4">
            {/* Multiplier */}
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs text-text-muted">Multiplicador</span>
                <div class={cn('text-5xl font-black font-mono', multiplierColorClass())}>
                  {round().multiplier >= 10
                    ? Math.floor(round().multiplier)
                    : round().multiplier.toFixed(2)}x
                </div>
              </div>
              <div class="text-right">
                <span class="text-xs text-text-muted">Rodada #{round().id}</span>
                <div class="text-sm text-text-secondary">
                  {formatRelativeTime(round().createdAt)}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div class="grid grid-cols-4 gap-3">
              <div class="text-center p-2 bg-bg-secondary rounded">
                <div class="text-xs text-text-muted mb-1">Jogadores</div>
                <div class="text-lg font-bold font-mono text-cyan">
                  {formatNumber(round().betCount)}
                </div>
              </div>
              <div class="text-center p-2 bg-bg-secondary rounded">
                <div class="text-xs text-text-muted mb-1">Apostado</div>
                <div class="text-lg font-bold font-mono text-yellow">
                  {formatCurrency(round().totalBet)}
                </div>
              </div>
              <div class="text-center p-2 bg-bg-secondary rounded">
                <div class="text-xs text-text-muted mb-1">Pago</div>
                <div class="text-lg font-bold font-mono text-green">
                  {formatCurrency(round().totalWin)}
                </div>
              </div>
              <div class="text-center p-2 bg-bg-secondary rounded">
                <div class="text-xs text-text-muted mb-1">Lucro Casa</div>
                <div
                  class={cn(
                    'text-lg font-bold font-mono',
                    houseProfit() >= 0 ? 'text-green' : 'text-red'
                  )}
                >
                  {formatCurrency(houseProfit())}
                </div>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
