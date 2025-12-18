import { Component, Show, createSignal } from 'solid-js';
import { botsStore, setBotBalance, setBotState } from '../../stores/bots';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { BotId } from '../../types';

interface BotBalanceManagerProps {
  botId: BotId;
}

export const BotBalanceManager: Component<BotBalanceManagerProps> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal('');

  const botState = () => botsStore[props.botId].state;

  const profit = () => botState().balance - botState().initialBalance;
  const profitPercent = () =>
    botState().initialBalance > 0
      ? ((botState().balance - botState().initialBalance) / botState().initialBalance) * 100
      : 0;

  const handleStartEdit = () => {
    setEditValue(botState().balance.toString());
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const newBalance = parseFloat(editValue());
    if (!isNaN(newBalance) && newBalance >= 0) {
      setBotBalance(props.botId, newBalance);
      // Reset min/max to current balance
      setBotState(props.botId, {
        minBalance: newBalance,
        maxBalance: newBalance,
        initialBalance: newBalance,
      });
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveEdit();
    if (e.key === 'Escape') handleCancelEdit();
  };

  return (
    <div class="p-4 bg-bg-secondary rounded-lg mb-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-text-muted">Banca</span>
        <Show when={!isEditing() && !botState().active}>
          <button
            class="text-xs text-cyan hover:text-cyan/80 transition-colors"
            onClick={handleStartEdit}
          >
            Editar
          </button>
        </Show>
      </div>

      <Show
        when={!isEditing()}
        fallback={
          <div class="flex items-center gap-2 mb-3">
            <input
              type="number"
              value={editValue()}
              onInput={(e) => setEditValue(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              class="flex-1 bg-bg-tertiary text-white text-2xl font-bold font-mono px-3 py-2 rounded border border-border focus:border-cyan focus:outline-none"
              min="0"
              step="1"
              autofocus
            />
            <button
              class="px-3 py-2 bg-green text-bg-primary rounded font-medium hover:bg-green/80 transition-colors"
              onClick={handleSaveEdit}
            >
              ✓
            </button>
            <button
              class="px-3 py-2 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-tertiary/80 transition-colors"
              onClick={handleCancelEdit}
            >
              ✕
            </button>
          </div>
        }
      >
        <div class="text-3xl font-bold font-mono text-white mb-3">
          {formatCurrency(botState().balance)}
        </div>
      </Show>

      {/* Balance Stats */}
      <div class="grid grid-cols-4 gap-2 text-xs">
        <div class="text-center p-2 bg-bg-tertiary rounded">
          <div class="text-text-muted">Inicial</div>
          <div class="font-mono text-text-secondary">
            {formatCurrency(botState().initialBalance)}
          </div>
        </div>
        <div class="text-center p-2 bg-bg-tertiary rounded">
          <div class="text-text-muted">Mínimo</div>
          <div class="font-mono text-red">
            {formatCurrency(botState().minBalance)}
          </div>
        </div>
        <div class="text-center p-2 bg-bg-tertiary rounded">
          <div class="text-text-muted">Máximo</div>
          <div class="font-mono text-green">
            {formatCurrency(botState().maxBalance)}
          </div>
        </div>
        <div class="text-center p-2 bg-bg-tertiary rounded">
          <div class="text-text-muted">Lucro</div>
          <div
            class={cn('font-mono font-bold', profit() >= 0 ? 'text-green' : 'text-red')}
          >
            {profit() >= 0 ? '+' : ''}
            {profitPercent().toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
};
