import { Component, For, Show, createSignal } from 'solid-js';
import { botsStore } from '../../stores/bots';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/utils';

// Create a signal for the collapsed state that persists
const [isCollapsed, setIsCollapsed] = createSignal(false);

export const BotHistoryBar: Component = () => {
  const activeBotId = () => botsStore.activeBotTab;
  const history = () => botsStore[activeBotId()].state.history;
  const stats = () => botsStore[activeBotId()].state.stats;
  const botState = () => botsStore[activeBotId()].state;

  // Check if any bot is active
  const hasActiveBots = () =>
    botsStore.bot1.state.active || botsStore.bot2.state.active;

  // Only show if there's history and at least one bot is active
  const shouldShow = () => history().length > 0 || hasActiveBots();

  const getResultColor = (won1: boolean, won2: boolean) => {
    if (won1 && won2) return 'bg-green/30 text-green border-green';
    if (won1 && !won2) return 'bg-yellow/30 text-yellow border-yellow';
    return 'bg-red/30 text-red border-red';
  };

  const getResultLabel = (won1: boolean, won2: boolean) => {
    if (won1 && won2) return 'V';
    if (won1 && !won2) return 'P';
    return 'D';
  };

  return (
    <Show when={shouldShow()}>
      <div class="fixed bottom-0 left-0 right-0 z-50 bg-bg-header border-t border-white/10">
        {/* Toggle Header */}
        <button
          class="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
          onClick={() => setIsCollapsed(!isCollapsed())}
        >
          <div class="flex items-center gap-3">
            <span class="text-sm font-semibold text-text-secondary">
              Historico {activeBotId().toUpperCase()}
            </span>
            <Show when={stats().totalBets > 0}>
              <div class="flex items-center gap-2 text-xs">
                <span class="text-green">V:{stats().wins}</span>
                <span class="text-yellow">P:{stats().partials}</span>
                <span class="text-red">D:{stats().losses}</span>
                <span class={cn(
                  'font-mono font-bold ml-2',
                  stats().totalProfit >= 0 ? 'text-green' : 'text-red'
                )}>
                  {stats().totalProfit >= 0 ? '+' : ''}{formatCurrency(stats().totalProfit)}
                </span>
              </div>
            </Show>
          </div>
          <span class="text-text-muted text-sm">
            {isCollapsed() ? '▲' : '▼'}
          </span>
        </button>

        {/* History Content */}
        <Show when={!isCollapsed()}>
          <div class="px-4 pb-3">
            <Show
              when={history().length > 0}
              fallback={
                <div class="text-center text-text-muted text-sm py-2">
                  Aguardando apostas...
                </div>
              }
            >
              <div class="flex gap-2 py-2 scrollbar-hidden overflow-x-auto">
                <For each={history().slice(0, 50)}>
                  {(item, index) => {
                    const isNewest = index() === 0;
                    const isWin = item.won1 || item.won2;
                    const isPartial = item.won1 && !item.won2;

                    return (
                      <div
                        class={cn(
                          'shrink-0 flex items-center justify-between p-2 rounded text-sm max-w-[300px]',
                          isWin
                            ? isPartial
                              ? 'bg-yellow/10'
                              : 'bg-green/10'
                            : 'bg-red/10',
                          isNewest && 'ring-2 ring-white/30'
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
                            <div class="text-text-secondary whitespace-nowrap">
                              {item.resultText}
                            </div>
                            <div class="text-[10px] text-text-muted whitespace-nowrap">
                              Multi: {item.roundMultiplier.toFixed(2)}x •{' '}
                              {formatCurrency(item.amount)} × 2
                              {item.isHighOpportunity && (
                                <span class="text-green ml-1">⭐</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div class="text-right ml-3">
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
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
};
