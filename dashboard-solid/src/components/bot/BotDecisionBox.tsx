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

        {/* Reasons */}
        <Show when={decision()?.reasons && decision()!.reasons.length > 0}>
          <div class="pt-2 border-t border-border/50">
            <div class="text-[10px] text-text-muted uppercase mb-1">
              Razões
            </div>
            <div class="text-xs text-text-secondary space-y-0.5">
              <For each={decision()!.reasons.slice(0, 4)}>
                {(reason) => <div>• {reason}</div>}
              </For>
              <Show when={decision()!.reasons.length > 4}>
                <div class="text-text-muted">
                  +{decision()!.reasons.length - 4} mais...
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
};
