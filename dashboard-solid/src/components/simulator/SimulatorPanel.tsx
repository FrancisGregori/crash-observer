import { Component, Show, createSignal } from 'solid-js';
import { simulatorStore, setBetMode, resetSimulator, setBalance } from '../../stores/simulator';
import { formatCurrency, formatPercent } from '../../lib/format';
import { cn } from '../../lib/utils';
import { BalanceDisplay } from './BalanceDisplay';
import { BetModeToggle } from './BetModeToggle';
import { BetForm } from './BetForm';
import { ActiveBetDisplay } from './ActiveBetDisplay';
import { SimulatorStats } from './SimulatorStats';
import { SimulatorHistory } from './SimulatorHistory';

export const SimulatorPanel: Component = () => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal('');

  const handleStartEdit = () => {
    setEditValue(simulatorStore.balance.toString());
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const newBalance = parseFloat(editValue());
    if (!isNaN(newBalance) && newBalance >= 0) {
      setBalance(newBalance);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  return (
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Simulador Manual
        </h2>
        <button
          class="text-xs text-red hover:text-red/80 transition-colors"
          onClick={resetSimulator}
        >
          Reset
        </button>
      </div>

      {/* Balance Display */}
      <BalanceDisplay
        balance={simulatorStore.balance}
        initialBalance={simulatorStore.initialBalance}
        isEditing={isEditing()}
        editValue={editValue()}
        onStartEdit={handleStartEdit}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
        onEditChange={setEditValue}
      />

      {/* Bet Mode Toggle */}
      <div class="mb-4">
        <BetModeToggle
          mode={simulatorStore.config.mode}
          onModeChange={setBetMode}
        />
      </div>

      {/* Active Bet or Bet Form */}
      <Show
        when={simulatorStore.activeBet}
        fallback={<BetForm />}
      >
        <ActiveBetDisplay />
      </Show>

      {/* Stats */}
      <SimulatorStats stats={simulatorStore.stats} />

      {/* History */}
      <SimulatorHistory history={simulatorStore.history} />
    </div>
  );
};
