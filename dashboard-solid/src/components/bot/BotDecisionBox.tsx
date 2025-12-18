import { Component, Show, For } from 'solid-js';
import { botsStore } from '../../stores/bots';
import { cn } from '../../lib/utils';
import type { BotId } from '../../types';

interface BotDecisionBoxProps {
  botId: BotId;
}

export const BotDecisionBox: Component<BotDecisionBoxProps> = (props) => {
  const decision = () => botsStore[props.botId].state.lastDecision;
  const botState = () => botsStore[props.botId].state;

  const getDecisionColor = () => {
    if (!decision()) return 'border-border';
    if (decision()?.shouldBet) {
      return decision()?.isHighOpportunity
        ? 'border-green bg-green/5'
        : 'border-yellow bg-yellow/5';
    }
    return 'border-red bg-red/5';
  };

  const getDecisionText = () => {
    if (!decision()) return 'Aguardando análise...';
    if (decision()?.shouldBet) {
      return decision()?.isHighOpportunity ? '✓ APOSTAR (Alta Oportunidade)' : '✓ APOSTAR';
    }
    return '✕ PULAR';
  };

  const getDecisionTextColor = () => {
    if (!decision()) return 'text-text-muted';
    if (decision()?.shouldBet) {
      return decision()?.isHighOpportunity ? 'text-green' : 'text-yellow';
    }
    return 'text-red';
  };

  return (
    <Show when={botState().active}>
      <div
        class={cn(
          'p-4 rounded-lg border-2 mb-4 transition-colors',
          getDecisionColor()
        )}
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-text-muted uppercase">Decisão</span>
          <Show when={decision()?.mlDecision?.mlAvailable}>
            <span class="text-xs text-purple">🤖 ML</span>
          </Show>
        </div>

        <div class={cn('text-lg font-bold mb-3', getDecisionTextColor())}>
          {getDecisionText()}
        </div>

        <Show when={decision()}>
          {(dec) => (
            <div class="space-y-2">
              {/* Target Cashout */}
              <Show when={dec().shouldBet}>
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Target Cashout 2</span>
                  <span class="font-mono text-cyan">
                    {dec().targetCashout2.toFixed(2)}x
                  </span>
                </div>
              </Show>

              {/* Bet Size Info */}
              <Show when={dec().betSizeInfo}>
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Aposta</span>
                  <span class="font-mono text-yellow">
                    R$ {dec().betSizeInfo!.amount.toFixed(2)}
                    <Show when={dec().betSizeInfo!.isReduced}>
                      <span class="text-orange text-xs ml-1">(reduzida)</span>
                    </Show>
                  </span>
                </div>
              </Show>

              {/* Cashout 1 Info */}
              <Show when={dec().cashout1Info}>
                <div class="flex justify-between text-sm">
                  <span class="text-text-muted">Cashout 1</span>
                  <span class="font-mono text-cyan">
                    {dec().cashout1Info!.cashout.toFixed(2)}x
                  </span>
                </div>
              </Show>

              {/* Reasons */}
              <Show when={dec().reasons.length > 0}>
                <div class="mt-2 pt-2 border-t border-border/50">
                  <div class="text-[10px] text-text-muted uppercase mb-1">
                    Razões
                  </div>
                  <div class="text-xs text-text-secondary space-y-0.5">
                    <For each={dec().reasons.slice(0, 4)}>
                      {(reason) => <div>• {reason}</div>}
                    </For>
                    <Show when={dec().reasons.length > 4}>
                      <div class="text-text-muted">
                        +{dec().reasons.length - 4} mais...
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
};
