import { Component, Show, For, createSignal } from 'solid-js';
import { botsStore } from '../../stores/bots';
import { formatCurrency, formatRelativeTime } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { BotId } from '../../types';

interface BotHistoryProps {
  botId: BotId;
}

export const BotHistory: Component<BotHistoryProps> = (props) => {
  const [showAll, setShowAll] = createSignal(false);

  const history = () => botsStore[props.botId].state.history;
  const visibleHistory = () =>
    showAll() ? history() : history().slice(0, 5);

  return (
    <Show when={history().length > 0}>
      <div class="mb-4">
        <h3 class="text-xs text-text-muted uppercase tracking-wider mb-2">
          Histórico
        </h3>
        <div class="space-y-1 max-h-48 overflow-y-auto">
          <For each={visibleHistory()}>
            {(item) => {
              const isWin = item.won1 || item.won2;
              const isPartial = item.won1 && !item.won2;

              return (
                <div
                  class={cn(
                    'flex items-center justify-between p-2 rounded text-sm',
                    isWin
                      ? isPartial
                        ? 'bg-yellow/10'
                        : 'bg-green/10'
                      : 'bg-red/10'
                  )}
                >
                  <div class="flex items-center gap-2">
                    <div class="flex flex-col items-center gap-0.5">
                      <span
                        class={cn(
                          'text-[10px]',
                          item.won1 ? 'text-green' : 'text-red'
                        )}
                      >
                        {item.won1 ? '✓' : '✕'}
                      </span>
                      <span
                        class={cn(
                          'text-[10px]',
                          item.won2 ? 'text-green' : 'text-red'
                        )}
                      >
                        {item.won2 ? '✓' : '✕'}
                      </span>
                    </div>
                    <div>
                      <div class="text-text-secondary">
                        {item.resultText}
                      </div>
                      <div class="text-[10px] text-text-muted">
                        Multi: {item.roundMultiplier.toFixed(2)}x •{' '}
                        {formatCurrency(item.amount)} × 2
                        {item.isHighOpportunity && (
                          <span class="text-green ml-1">⭐</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div class="text-right">
                    <div
                      class={cn(
                        'font-mono font-bold',
                        item.profit >= 0 ? 'text-green' : 'text-red'
                      )}
                    >
                      {item.profit >= 0 ? '+' : ''}
                      {formatCurrency(item.profit)}
                    </div>
                    <div class="text-[10px] text-text-muted">
                      {formatCurrency(item.balance)}
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        <Show when={history().length > 5}>
          <button
            class="w-full mt-2 py-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
            onClick={() => setShowAll(!showAll())}
          >
            {showAll()
              ? 'Mostrar menos'
              : `Mostrar todos (${history().length})`}
          </button>
        </Show>
      </div>
    </Show>
  );
};
