import { Component, Show } from 'solid-js';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/utils';

interface BalanceDisplayProps {
  balance: number;
  initialBalance: number;
  isEditing: boolean;
  editValue: string;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (value: string) => void;
}

export const BalanceDisplay: Component<BalanceDisplayProps> = (props) => {
  const profit = () => props.balance - props.initialBalance;
  const profitPercent = () =>
    props.initialBalance > 0
      ? ((props.balance - props.initialBalance) / props.initialBalance) * 100
      : 0;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') props.onSaveEdit();
    if (e.key === 'Escape') props.onCancelEdit();
  };

  return (
    <div class="p-4 bg-bg-secondary rounded-lg mb-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-text-muted">Banca</span>
        <Show when={!props.isEditing}>
          <button
            class="text-xs text-cyan hover:text-cyan/80 transition-colors"
            onClick={props.onStartEdit}
          >
            Editar
          </button>
        </Show>
      </div>

      <Show
        when={!props.isEditing}
        fallback={
          <div class="flex items-center gap-2">
            <input
              type="number"
              value={props.editValue}
              onInput={(e) => props.onEditChange(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              class="flex-1 bg-bg-tertiary text-white text-2xl font-bold font-mono px-3 py-2 rounded border border-border focus:border-cyan focus:outline-none"
              min="0"
              step="1"
              autofocus
            />
            <button
              class="px-3 py-2 bg-green text-bg-primary rounded font-medium hover:bg-green/80 transition-colors"
              onClick={props.onSaveEdit}
            >
              ✓
            </button>
            <button
              class="px-3 py-2 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-tertiary/80 transition-colors"
              onClick={props.onCancelEdit}
            >
              ✕
            </button>
          </div>
        }
      >
        <div class="text-3xl font-bold font-mono text-white">
          {formatCurrency(props.balance)}
        </div>
      </Show>

      <div class="flex items-center justify-between mt-2 text-sm">
        <span class="text-text-muted">
          Inicial: {formatCurrency(props.initialBalance)}
        </span>
        <span
          class={cn(
            'font-mono',
            profit() >= 0 ? 'text-green' : 'text-red'
          )}
        >
          {profit() >= 0 ? '+' : ''}
          {formatCurrency(profit())} ({profitPercent().toFixed(1)}%)
        </span>
      </div>
    </div>
  );
};
