import { Component, Show } from 'solid-js';
import { botsStore } from '../../stores/bots';
import { formatCurrency, formatPercent } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { BotId } from '../../types';

interface BotStatsGridProps {
  botId: BotId;
}

export const BotStatsGrid: Component<BotStatsGridProps> = (props) => {
  const stats = () => botsStore[props.botId].state.stats;
  const riskState = () => botsStore[props.botId].riskState;

  const winRate = () =>
    stats().totalBets > 0 ? (stats().wins / stats().totalBets) * 100 : 0;

  const avgProfit = () =>
    stats().totalBets > 0 ? stats().totalProfit / stats().totalBets : 0;

  return (
    <Show when={stats().totalBets > 0}>
      <div class="mb-4">
        <h3 class="text-xs text-text-muted uppercase tracking-wider mb-2">
          Estatísticas
        </h3>
        <div class="grid grid-cols-4 gap-2 mb-2">
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-xs text-text-muted">Apostas</div>
            <div class="text-md font-bold font-mono text-cyan">
              {stats().totalBets}
            </div>
          </div>
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-xs text-text-muted">Taxa</div>
            <div
              class={cn(
                'text-md font-bold font-mono',
                winRate() >= 50 ? 'text-green' : 'text-red'
              )}
            >
              {formatPercent(winRate())}
            </div>
          </div>
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-xs text-text-muted">Apostado</div>
            <div class="text-md font-bold font-mono text-yellow">
              {formatCurrency(stats().totalWagered)}
            </div>
          </div>
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-xs text-text-muted">Lucro</div>
            <div
              class={cn(
                'text-md font-bold font-mono',
                stats().totalProfit >= 0 ? 'text-green' : 'text-red'
              )}
            >
              {formatCurrency(stats().totalProfit)}
            </div>
          </div>
        </div>

        {/* Win/Loss Bar */}
        <div class="mb-2">
          <div class="flex justify-between text-xs text-text-muted mb-1">
            <span>V: {stats().wins}</span>
            <span>D: {stats().losses}</span>
          </div>
          <div class="h-2 bg-red rounded-full overflow-hidden">
            <div
              class="h-full bg-green transition-all duration-300"
              style={{ width: `${winRate()}%` }}
            />
          </div>
        </div>

        {/* Risk State */}
        <div class="grid grid-cols-3 gap-2 text-xs">
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-text-muted">Sequência V</div>
            <div class="font-mono text-green">
              {riskState().consecutiveWins}
            </div>
          </div>
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-text-muted">Sequência D</div>
            <div class="font-mono text-red">
              {riskState().consecutiveLosses}
            </div>
          </div>
          <div class="text-center p-2 bg-bg-secondary rounded">
            <div class="text-text-muted">Lucro Sessão</div>
            <div
              class={cn(
                'font-mono',
                riskState().sessionProfit >= 0 ? 'text-green' : 'text-red'
              )}
            >
              {formatCurrency(riskState().sessionProfit)}
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
