import { Component, Show } from 'solid-js';
import { botsStore } from '../../stores/bots';
import { formatCurrency } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { BotId } from '../../types';

interface BotActiveBetProps {
  botId: BotId;
}

export const BotActiveBet: Component<BotActiveBetProps> = (props) => {
  const activeBet = () => botsStore[props.botId].state.activeBet;

  return (
    <Show when={activeBet()}>
      {(bet) => (
        <div
          class={cn(
            'p-4 rounded-lg border-2 mb-4',
            bet().isLive
              ? 'border-green bg-green/10 animate-pulse'
              : 'border-yellow bg-yellow/10'
          )}
        >
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-semibold text-yellow">
              ⏳ Aposta Ativa
            </span>
            <div class="flex items-center gap-2">
              <Show when={bet().isHighOpportunity}>
                <span class="text-xs text-green">⭐ Alta Oport.</span>
              </Show>
              <Show when={bet().isLive}>
                <span class="px-2 py-0.5 text-xs bg-green text-bg-primary rounded font-bold">
                  LIVE
                </span>
              </Show>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="text-center p-2 bg-bg-secondary rounded">
              <div class="text-[10px] text-text-muted">Valor Total</div>
              <div class="text-lg font-bold font-mono text-yellow">
                {formatCurrency(bet().amount * 2)}
              </div>
              <Show when={bet().isReducedBet}>
                <div class="text-[10px] text-orange">(reduzida)</div>
              </Show>
            </div>
            <div class="text-center p-2 bg-bg-secondary rounded">
              <div class="text-[10px] text-text-muted">Potencial Máx</div>
              <div class="text-lg font-bold font-mono text-green">
                {formatCurrency(bet().amount * bet().cashout1 + bet().amount * bet().cashout2)}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 mt-3">
            <div class="p-2 bg-bg-secondary rounded">
              <div class="text-[10px] text-text-muted text-center mb-1">
                Aposta 1
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Valor:</span>
                <span class="font-mono text-yellow">
                  {formatCurrency(bet().amount)}
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Cashout:</span>
                <span class="font-mono text-cyan">
                  {bet().cashout1.toFixed(2)}x
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Retorno:</span>
                <span class="font-mono text-green">
                  {formatCurrency(bet().amount * bet().cashout1)}
                </span>
              </div>
            </div>
            <div class="p-2 bg-bg-secondary rounded">
              <div class="text-[10px] text-text-muted text-center mb-1">
                Aposta 2
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Valor:</span>
                <span class="font-mono text-yellow">
                  {formatCurrency(bet().amount)}
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Cashout:</span>
                <span class="font-mono text-cyan">
                  {bet().cashout2.toFixed(2)}x
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-text-muted">Retorno:</span>
                <span class="font-mono text-green">
                  {formatCurrency(bet().amount * bet().cashout2)}
                </span>
              </div>
            </div>
          </div>

          <div class="mt-3 text-xs text-text-muted text-center">
            Aguardando resultado...
          </div>
        </div>
      )}
    </Show>
  );
};
