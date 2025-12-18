import { Component, Show, For, createSignal } from 'solid-js';
import { formatCurrency, formatRelativeTime } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { SimulatorHistoryItem } from '../../types';

interface SimulatorHistoryProps {
  history: SimulatorHistoryItem[];
}

export const SimulatorHistory: Component<SimulatorHistoryProps> = (props) => {
  const [showAll, setShowAll] = createSignal(false);

  const visibleHistory = () =>
    showAll() ? props.history : props.history.slice(0, 5);

  return (
    <Show when={props.history.length > 0}>
      <div>
        <h3 class="text-xs text-text-muted uppercase tracking-wider mb-2">
          Histórico
        </h3>
        <div class="space-y-1 max-h-48 overflow-y-auto">
          <For each={visibleHistory()}>
            {(item) => (
              <div
                class={cn(
                  'flex items-center justify-between p-2 rounded text-sm',
                  item.won ? 'bg-green/10' : 'bg-red/10'
                )}
              >
                <div class="flex items-center gap-2">
                  <span class={cn('text-xs', item.won ? 'text-green' : 'text-red')}>
                    {item.won ? '✓' : '✕'}
                  </span>
                  <div>
                    <div class="text-text-secondary">
                      {item.resultText}
                    </div>
                    <div class="text-[10px] text-text-muted">
                      {item.mode === 'double' ? 'Double' : 'Single'} • {formatCurrency(item.amount)}
                      {item.mode === 'double' && ' × 2'}
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
            )}
          </For>
        </div>

        <Show when={props.history.length > 5}>
          <button
            class="w-full mt-2 py-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
            onClick={() => setShowAll(!showAll())}
          >
            {showAll()
              ? 'Mostrar menos'
              : `Mostrar todos (${props.history.length})`}
          </button>
        </Show>
      </div>
    </Show>
  );
};
