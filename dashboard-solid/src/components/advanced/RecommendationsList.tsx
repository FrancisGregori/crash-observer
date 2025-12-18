import { Component, Show, For, createMemo } from 'solid-js';
import { roundsStore } from '../../stores/rounds';
import { cn } from '../../lib/utils';

interface Recommendation {
  type: 'high_priority' | 'timing' | 'strategy' | 'momentum';
  icon: string;
  text: string;
}

const getTypeColor = (type: Recommendation['type']) => {
  switch (type) {
    case 'high_priority':
      return 'border-red text-red';
    case 'timing':
      return 'border-cyan text-cyan';
    case 'strategy':
      return 'border-yellow text-yellow';
    case 'momentum':
      return 'border-green text-green';
    default:
      return 'border-text-muted text-text-muted';
  }
};

const getTypeLabel = (type: Recommendation['type']) => {
  switch (type) {
    case 'high_priority':
      return 'Prioridade';
    case 'timing':
      return 'Timing';
    case 'strategy':
      return 'Estratégia';
    case 'momentum':
      return 'Momentum';
    default:
      return 'Info';
  }
};

export const RecommendationsList: Component = () => {
  // Generate recommendations from advanced stats
  const recommendations = createMemo((): Recommendation[] => {
    const stats = roundsStore.advancedStats;
    if (!stats) return [];

    const recs: Recommendation[] = [];

    // Check momentum
    if (stats.momentum) {
      if (stats.momentum.momentumStatus === 'hot') {
        recs.push({
          type: 'momentum',
          icon: '🔥',
          text: `Momento quente! Média recente ${stats.momentum.avgLast10.toFixed(2)}x (${stats.momentum.trend10vs50 > 0 ? '+' : ''}${stats.momentum.trend10vs50.toFixed(1)}% vs histórico)`
        });
      } else if (stats.momentum.momentumStatus === 'cold') {
        recs.push({
          type: 'high_priority',
          icon: '❄️',
          text: `Momento frio. Média recente ${stats.momentum.avgLast10.toFixed(2)}x (${stats.momentum.trend10vs50.toFixed(1)}% vs histórico)`
        });
      }
    }

    // Check sequence analysis for overdue multipliers
    if (stats.sequenceAnalysis) {
      const sequences = Object.entries(stats.sequenceAnalysis);
      for (const [key, seq] of sequences) {
        if (seq.status === 'overdue') {
          recs.push({
            type: 'timing',
            icon: '⏰',
            text: `${seq.threshold}x está atrasado! ${seq.currentStreak} rodadas sem (média: ${seq.avgRoundsToHit.toFixed(1)})`
          });
        } else if (seq.status === 'due' && seq.deviationRatio >= 1) {
          recs.push({
            type: 'strategy',
            icon: '📊',
            text: `${seq.threshold}x próximo da média (${seq.currentStreak}/${seq.avgRoundsToHit.toFixed(0)} rodadas)`
          });
        }
      }
    }

    // Check favorability
    if (stats.favorabilityScore >= 70) {
      recs.push({
        type: 'momentum',
        icon: '✅',
        text: `Score de favorabilidade alto (${stats.favorabilityScore}). Condições favoráveis para apostas.`
      });
    } else if (stats.favorabilityScore <= 40) {
      recs.push({
        type: 'high_priority',
        icon: '⚠️',
        text: `Score de favorabilidade baixo (${stats.favorabilityScore}). Considere pausar.`
      });
    }

    // Check patterns
    if (stats.patterns) {
      const { after3Below2x, after5Below2x } = stats.patterns;
      if (after5Below2x && after5Below2x.successRate > 50) {
        recs.push({
          type: 'strategy',
          icon: '📈',
          text: `Após 5 rodadas <2x, taxa de sucesso é ${after5Below2x.successRate.toFixed(1)}%`
        });
      }
    }

    return recs.slice(0, 5); // Limit to 5 recommendations
  });

  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Recomendações
      </h2>

      <Show
        when={roundsStore.advancedStats}
        fallback={
          <div class="space-y-2">
            <For each={[1, 2, 3]}>
              {() => (
                <div class="flex items-center gap-3 p-3 bg-bg-secondary rounded animate-pulse">
                  <div class="w-6 h-6 bg-bg-tertiary rounded" />
                  <div class="flex-1">
                    <div class="h-4 w-3/4 bg-bg-tertiary rounded" />
                  </div>
                </div>
              )}
            </For>
          </div>
        }
      >
        <Show
          when={recommendations().length > 0}
          fallback={
            <div class="text-center py-6 text-text-muted">
              <div class="text-2xl mb-2">💡</div>
              <p class="text-sm">Sem recomendações no momento</p>
            </div>
          }
        >
          <div class="space-y-2">
            <For each={recommendations()}>
              {(rec) => (
                <div class={cn(
                  'flex items-start gap-3 p-3 bg-bg-secondary rounded-lg border-l-2',
                  getTypeColor(rec.type)
                )}>
                  <span class="text-lg">{rec.icon}</span>
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <span class={cn('text-[10px] uppercase font-semibold', getTypeColor(rec.type))}>
                        {getTypeLabel(rec.type)}
                      </span>
                    </div>
                    <p class="text-sm text-text-secondary">{rec.text}</p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
};
