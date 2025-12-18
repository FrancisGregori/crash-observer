import { Component, Show, For, createSignal, createMemo } from 'solid-js';
import { roundsStore, setCurrentLimit, fetchRounds } from '../../stores/rounds';
import { formatCurrency, formatMultiplier, formatRelativeTime } from '../../lib/format';
import { getMultiplierColorClass } from '../../types';
import { cn } from '../../lib/utils';

const LIMIT_OPTIONS = [50, 100, 200, 500];

export const RoundsTable: Component = () => {
  const [showAll, setShowAll] = createSignal(false);

  const visibleRounds = createMemo(() => {
    const rounds = roundsStore.rounds;
    return showAll() ? rounds : rounds.slice(0, 20);
  });

  const handleLimitChange = async (limit: number) => {
    setCurrentLimit(limit);
    await fetchRounds(limit);
  };

  return (
    <div class="card">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Histórico de Rodadas
        </h2>
        <div class="flex items-center gap-2">
          <span class="text-xs text-text-muted">Limite:</span>
          <For each={LIMIT_OPTIONS}>
            {(limit) => (
              <button
                class={cn(
                  'px-2 py-1 text-xs rounded transition-colors',
                  roundsStore.currentLimit === limit
                    ? 'bg-cyan text-bg-primary'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                )}
                onClick={() => handleLimitChange(limit)}
              >
                {limit}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show
        when={roundsStore.rounds.length > 0}
        fallback={
          <div class="text-center text-text-muted py-8">
            Aguardando dados...
          </div>
        }
      >
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 px-2 text-text-muted font-medium">ID</th>
                <th class="text-left py-2 px-2 text-text-muted font-medium">Tempo</th>
                <th class="text-right py-2 px-2 text-text-muted font-medium">Multi</th>
                <th class="text-right py-2 px-2 text-text-muted font-medium">Jogadores</th>
                <th class="text-right py-2 px-2 text-text-muted font-medium">Apostado</th>
                <th class="text-right py-2 px-2 text-text-muted font-medium">Pago</th>
                <th class="text-right py-2 px-2 text-text-muted font-medium">Lucro Casa</th>
              </tr>
            </thead>
            <tbody>
              <For each={visibleRounds()}>
                {(round) => {
                  const houseProfit = round.totalBet - round.totalWin;
                  return (
                    <tr class="border-b border-border/50 hover:bg-bg-secondary/50 transition-colors">
                      <td class="py-2 px-2 text-text-muted font-mono">
                        #{round.id}
                      </td>
                      <td class="py-2 px-2 text-text-secondary">
                        {formatRelativeTime(round.createdAt)}
                      </td>
                      <td class={cn('py-2 px-2 text-right font-mono font-bold', getMultiplierColorClass(round.multiplier))}>
                        {formatMultiplier(round.multiplier)}
                      </td>
                      <td class="py-2 px-2 text-right text-text-secondary">
                        {round.betCount}
                      </td>
                      <td class="py-2 px-2 text-right text-yellow font-mono">
                        {formatCurrency(round.totalBet)}
                      </td>
                      <td class="py-2 px-2 text-right text-green font-mono">
                        {formatCurrency(round.totalWin)}
                      </td>
                      <td class={cn('py-2 px-2 text-right font-mono', houseProfit >= 0 ? 'text-green' : 'text-red')}>
                        {formatCurrency(houseProfit)}
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>

        <Show when={roundsStore.rounds.length > 20}>
          <div class="mt-3 text-center">
            <button
              class="px-4 py-2 text-sm bg-bg-secondary text-text-secondary rounded hover:bg-bg-tertiary transition-colors"
              onClick={() => setShowAll(!showAll())}
            >
              {showAll()
                ? 'Mostrar menos'
                : `Mostrar todas (${roundsStore.rounds.length})`}
            </button>
          </div>
        </Show>
      </Show>
    </div>
  );
};
