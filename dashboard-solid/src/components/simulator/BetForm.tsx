import { Component, Show, createSignal, createEffect } from 'solid-js';
import { simulatorStore, setConfig, placeBet } from '../../stores/simulator';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/utils';

export const BetForm: Component = () => {
  const [amount, setAmount] = createSignal(simulatorStore.config.betAmount);
  const [cashout, setCashout] = createSignal(simulatorStore.config.cashout);
  const [cashout2, setCashout2] = createSignal(simulatorStore.config.cashout2);

  const isDouble = () => simulatorStore.config.mode === 'double';
  const totalBet = () => isDouble() ? amount() * 2 : amount();
  const canBet = () => simulatorStore.balance >= totalBet() && amount() > 0;

  // Sync config changes to local state
  createEffect(() => {
    setAmount(simulatorStore.config.betAmount);
    setCashout(simulatorStore.config.cashout);
    setCashout2(simulatorStore.config.cashout2);
  });

  const handleBet = () => {
    if (!canBet()) return;

    // Save config
    setConfig({
      betAmount: amount(),
      cashout: cashout(),
      cashout2: cashout2(),
    });

    // Place bet
    placeBet({
      mode: simulatorStore.config.mode,
      amount: amount(),
      cashout: cashout(),
      cashout2: isDouble() ? cashout2() : undefined,
      timestamp: Date.now(),
    });
  };

  const quickAmounts = [1, 2, 5, 10, 25];
  const quickCashouts = [1.5, 2.0, 3.0, 5.0, 10.0];

  return (
    <div class="space-y-4 mb-4">
      {/* Amount Input */}
      <div>
        <label class="block text-xs text-text-muted mb-2">
          Valor da Aposta {isDouble() && '(cada)'}
        </label>
        <div class="flex gap-2">
          <input
            type="number"
            value={amount()}
            onInput={(e) => setAmount(parseFloat(e.currentTarget.value) || 0)}
            class="flex-1 bg-bg-secondary text-white font-mono px-3 py-2 rounded border border-border focus:border-cyan focus:outline-none"
            min="0.1"
            step="0.1"
          />
        </div>
        <div class="flex gap-1 mt-2">
          {quickAmounts.map((val) => (
            <button
              class={cn(
                'flex-1 px-2 py-1 text-xs rounded transition-colors',
                amount() === val
                  ? 'bg-cyan text-bg-primary'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
              )}
              onClick={() => setAmount(val)}
            >
              {val}
            </button>
          ))}
        </div>
      </div>

      {/* Cashout Input (Single Mode) */}
      <Show when={!isDouble()}>
        <div>
          <label class="block text-xs text-text-muted mb-2">
            Cashout
          </label>
          <div class="flex gap-2">
            <input
              type="number"
              value={cashout()}
              onInput={(e) => setCashout(parseFloat(e.currentTarget.value) || 1.01)}
              class="flex-1 bg-bg-secondary text-white font-mono px-3 py-2 rounded border border-border focus:border-cyan focus:outline-none"
              min="1.01"
              step="0.1"
            />
          </div>
          <div class="flex gap-1 mt-2">
            {quickCashouts.map((val) => (
              <button
                class={cn(
                  'flex-1 px-2 py-1 text-xs rounded transition-colors',
                  cashout() === val
                    ? 'bg-cyan text-bg-primary'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                )}
                onClick={() => setCashout(val)}
              >
                {val}x
              </button>
            ))}
          </div>
        </div>
      </Show>

      {/* Double Mode - Cashout 2 */}
      <Show when={isDouble()}>
        <div class="p-3 bg-bg-secondary/50 rounded-lg border border-border/50">
          <div class="text-xs text-text-muted mb-2">
            Estratégia Double: 2x fixo + variável
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] text-text-muted mb-1">
                Cashout 1 (fixo)
              </label>
              <div class="bg-bg-tertiary px-3 py-2 rounded text-center font-mono text-cyan">
                2.00x
              </div>
            </div>
            <div>
              <label class="block text-[10px] text-text-muted mb-1">
                Cashout 2
              </label>
              <input
                type="number"
                value={cashout2()}
                onInput={(e) => setCashout2(parseFloat(e.currentTarget.value) || 10)}
                class="w-full bg-bg-tertiary text-white font-mono px-3 py-2 rounded border border-border focus:border-cyan focus:outline-none text-center"
                min="2.01"
                step="1"
              />
            </div>
          </div>
        </div>
      </Show>

      {/* Bet Button */}
      <button
        class={cn(
          'w-full py-3 rounded-lg font-bold text-lg transition-all',
          canBet()
            ? 'bg-green text-bg-primary hover:bg-green/90 active:scale-98'
            : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
        )}
        onClick={handleBet}
        disabled={!canBet()}
      >
        <Show
          when={canBet()}
          fallback="Saldo Insuficiente"
        >
          Apostar {formatCurrency(totalBet())}
        </Show>
      </button>

      <Show when={isDouble()}>
        <div class="text-xs text-text-muted text-center">
          Aposta total: {formatCurrency(totalBet())} ({formatCurrency(amount())} × 2)
        </div>
      </Show>
    </div>
  );
};
