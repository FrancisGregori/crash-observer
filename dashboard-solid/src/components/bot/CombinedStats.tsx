import { Component, createMemo } from 'solid-js';
import { botsStore, getCombinedStats } from '../../stores/bots';
import { formatCurrency, formatPercent } from '../../lib/format';
import { cn } from '../../lib/utils';

export const CombinedStats: Component = () => {
  const stats = createMemo(() => getCombinedStats());
  const winRate = createMemo(() =>
    stats().totalBets > 0 ? (stats().totalWins / stats().totalBets) * 100 : 0
  );

  return (
    <div class="p-3 bg-bg-secondary rounded-lg mb-4">
      <h3 class="text-xs text-text-muted uppercase tracking-wider mb-2">
        Resumo Combinado
      </h3>
      <div class="grid grid-cols-2 gap-3">
        {/* First row */}
        <div class="text-center">
          <div class="text-xs text-text-muted">Banca Total</div>
          <div class="text-lg font-bold font-mono text-cyan">
            {formatCurrency(stats().totalBalance)}
          </div>
        </div>
        <div class="text-center">
          <div class="text-xs text-text-muted">Lucro Total</div>
          <div
            class={cn(
              'text-lg font-bold font-mono',
              stats().totalProfit >= 0 ? 'text-green' : 'text-red'
            )}
          >
            {formatCurrency(stats().totalProfit)}
          </div>
        </div>
        {/* Second row */}
        <div class="text-center">
          <div class="text-xs text-text-muted">Apostas</div>
          <div class="text-lg font-bold font-mono text-yellow">
            {stats().totalBets}
          </div>
        </div>
        <div class="text-center">
          <div class="text-xs text-text-muted">Taxa de Vitória</div>
          <div
            class={cn(
              'text-lg font-bold font-mono',
              winRate() >= 50 ? 'text-green' : 'text-red'
            )}
          >
            {formatPercent(winRate())}
          </div>
        </div>
      </div>
    </div>
  );
};
