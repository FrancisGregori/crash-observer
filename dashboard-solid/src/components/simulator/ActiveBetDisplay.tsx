import { Component, Show } from 'solid-js';
import { simulatorStore, cancelBet } from '../../stores/simulator';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/utils';

export const ActiveBetDisplay: Component = () => {
  const bet = () => simulatorStore.activeBet;
  const isDouble = () => bet()?.mode === 'double';
  const totalBet = () => {
    const b = bet();
    if (!b) return 0;
    return isDouble() ? b.amount * 2 : b.amount;
  };

  return (
    <Show when={bet()}>
      {(activeBet) => (
        <div class="mb-4 p-4 bg-yellow/10 border border-yellow/30 rounded-lg">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-semibold text-yellow">
              ⏳ Aposta Ativa
            </span>
            <button
              class="text-xs text-red hover:text-red/80 transition-colors"
              onClick={cancelBet}
            >
              Cancelar
            </button>
          </div>

          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Modo</span>
              <span class="text-text-secondary capitalize">
                {activeBet().mode}
              </span>
            </div>

            <div class="flex justify-between text-sm">
              <span class="text-text-muted">Valor Total</span>
              <span class="text-yellow font-mono font-bold">
                {formatCurrency(totalBet())}
              </span>
            </div>

            <Show when={!isDouble()}>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Cashout</span>
                <span class="text-green font-mono">
                  {activeBet().cashout.toFixed(2)}x
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Potencial</span>
                <span class="text-green font-mono font-bold">
                  {formatCurrency(activeBet().amount * activeBet().cashout)}
                </span>
              </div>
            </Show>

            <Show when={isDouble()}>
              <div class="grid grid-cols-2 gap-3 mt-2 p-2 bg-bg-secondary rounded">
                <div class="text-center">
                  <div class="text-[10px] text-text-muted">Aposta 1</div>
                  <div class="text-sm font-mono text-cyan">2.00x</div>
                  <div class="text-xs text-text-secondary">
                    → {formatCurrency(activeBet().amount * 2)}
                  </div>
                </div>
                <div class="text-center">
                  <div class="text-[10px] text-text-muted">Aposta 2</div>
                  <div class="text-sm font-mono text-cyan">
                    {(activeBet().cashout2 || 10).toFixed(2)}x
                  </div>
                  <div class="text-xs text-text-secondary">
                    → {formatCurrency(activeBet().amount * (activeBet().cashout2 || 10))}
                  </div>
                </div>
              </div>
            </Show>
          </div>

          <div class="mt-3 text-xs text-text-muted text-center animate-pulse">
            Aguardando resultado da rodada...
          </div>
        </div>
      )}
    </Show>
  );
};
