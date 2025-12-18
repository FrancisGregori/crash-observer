import { Component } from 'solid-js';
import { botsStore, setActiveBotTab } from '../../stores/bots';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { BotId } from '../../types';

export const BotSelector: Component = () => {
  const tabs: { id: BotId; label: string }[] = [
    { id: 'bot1', label: 'Bot 1' },
    { id: 'bot2', label: 'Bot 2' },
  ];

  return (
    <div class="flex rounded-lg overflow-hidden border border-border mb-4">
      {tabs.map((tab) => {
        const isActive = () => botsStore.activeBotTab === tab.id;
        const botState = () => botsStore[tab.id].state;
        const statusColor = () => {
          if (!botState().active) return 'bg-bg-tertiary';
          if (botState().liveMode) return 'bg-green';
          return 'bg-yellow';
        };

        return (
          <button
            class={cn(
              'flex-1 px-4 py-2 flex flex-col items-center justify-center gap-0.5 text-sm font-medium transition-colors',
              isActive()
                ? 'bg-cyan text-bg-primary'
                : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
            )}
            onClick={() => setActiveBotTab(tab.id)}
          >
            <div class="flex items-center gap-2">
              <span
                class={cn('w-2 h-2 rounded-full', statusColor())}
              />
              {tab.label}
            </div>
            <div class={cn(
              'text-xs font-mono',
              isActive() ? 'text-bg-primary/80' : 'text-text-muted'
            )}>
              {formatCurrency(botState().balance)}
            </div>
          </button>
        );
      })}
    </div>
  );
};
