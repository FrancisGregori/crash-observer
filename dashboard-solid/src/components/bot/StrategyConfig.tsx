import { Component, Show, For, createSignal } from 'solid-js';
import { botsStore, setBotConfig } from '../../stores/bots';
import { cn } from '../../lib/utils';
import type { BotId, StrategyMode, StrategyConfig as StrategyConfigType } from '../../types';

interface StrategyConfigProps {
  botId: BotId;
}

export const StrategyConfig: Component<StrategyConfigProps> = (props) => {
  const [expandedSection, setExpandedSection] = createSignal<string | null>(null);

  const config = () => botsStore[props.botId].config;
  const strategy = () => config().strategy;
  const botState = () => botsStore[props.botId].state;

  const updateStrategy = (updates: Partial<StrategyConfigType>) => {
    setBotConfig(props.botId, {
      strategy: { ...strategy(), ...updates },
    });
  };

  const updateMLStrategy = (updates: any) => {
    updateStrategy({
      mlStrategy: { ...strategy().mlStrategy, ...updates },
    });
  };

  const updateRulesStrategy = (updates: any) => {
    updateStrategy({
      rulesStrategy: { ...strategy().rulesStrategy, ...updates },
    });
  };

  const updateHybrid = (updates: any) => {
    updateStrategy({
      hybrid: { ...strategy().hybrid, ...updates },
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection() === section ? null : section);
  };

  const modes: { value: StrategyMode; label: string; desc: string }[] = [
    { value: 'rules_only', label: 'Regras', desc: 'Sequências e padrões' },
    { value: 'ml_only', label: 'ML', desc: 'Apenas Machine Learning' },
    { value: 'hybrid', label: 'Híbrido', desc: 'ML + Regras combinados' },
  ];

  return (
    <div class="space-y-3">
      {/* Strategy Mode Selector */}
      <div class="p-3 bg-bg-tertiary rounded-lg">
        <div class="text-xs text-text-muted mb-2">Modo de Estratégia</div>
        <div class="grid grid-cols-3 gap-1">
          <For each={modes}>
            {(mode) => (
              <button
                class={cn(
                  'py-2 px-2 rounded text-xs font-medium transition-colors',
                  strategy().mode === mode.value
                    ? 'bg-cyan text-bg-primary'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-secondary/80'
                )}
                onClick={() => updateStrategy({ mode: mode.value })}
                disabled={botState().active}
              >
                <div>{mode.label}</div>
                <div class="text-[10px] opacity-70">{mode.desc}</div>
              </button>
            )}
          </For>
        </div>
      </div>

      {/* ML Strategy Config */}
      <Show when={strategy().mode === 'ml_only' || strategy().mode === 'hybrid'}>
        <div class="p-3 bg-bg-tertiary rounded-lg">
          <button
            class="w-full flex items-center justify-between"
            onClick={() => toggleSection('ml')}
            disabled={botState().active}
          >
            <span class="text-sm font-medium text-cyan">Configuração ML</span>
            <span class="text-text-muted text-xs">
              {expandedSection() === 'ml' ? '▲' : '▼'}
            </span>
          </button>

          <Show when={expandedSection() === 'ml'}>
            <div class="mt-3 space-y-3">
              {/* Min Confidence */}
              <div>
                <label class="block text-xs text-text-muted mb-1">
                  Confiança Mínima para Apostar
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.3"
                    max="0.8"
                    step="0.05"
                    value={strategy().mlStrategy.minConfidenceToBet}
                    onInput={(e) =>
                      updateMLStrategy({ minConfidenceToBet: parseFloat(e.currentTarget.value) })
                    }
                    class="flex-1"
                    disabled={botState().active}
                  />
                  <span class="text-sm font-mono text-cyan w-12 text-right">
                    {(strategy().mlStrategy.minConfidenceToBet * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Bet Sizing Method */}
              <div>
                <label class="block text-xs text-text-muted mb-1">
                  Método de Tamanho de Aposta
                </label>
                <select
                  value={strategy().mlStrategy.betSizing.method}
                  onChange={(e) =>
                    updateMLStrategy({
                      betSizing: {
                        ...strategy().mlStrategy.betSizing,
                        method: e.currentTarget.value,
                      },
                    })
                  }
                  class="w-full bg-bg-secondary text-white text-sm px-3 py-2 rounded border border-border disabled:opacity-50"
                  disabled={botState().active}
                >
                  <option value="fixed">Fixo</option>
                  <option value="confidence_based">Baseado em Confiança</option>
                  <option value="proportional">Proporcional</option>
                </select>
                <div class="text-[10px] text-text-muted mt-1 leading-tight">
                  {strategy().mlStrategy.betSizing.method === 'fixed' && 'Usa sempre o valor base configurado'}
                  {strategy().mlStrategy.betSizing.method === 'confidence_based' && 'Multiplica o valor base pela confiança do ML'}
                  {strategy().mlStrategy.betSizing.method === 'proportional' && 'Proporcional à probabilidade de sucesso'}
                </div>
              </div>

              {/* Confidence Multipliers */}
              <Show when={strategy().mlStrategy.betSizing.method === 'confidence_based'}>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">
                      Baixa (&lt;45%)
                    </label>
                    <input
                      type="number"
                      value={strategy().mlStrategy.betSizing.confidenceMultiplier.lowConfidence}
                      onInput={(e) =>
                        updateMLStrategy({
                          betSizing: {
                            ...strategy().mlStrategy.betSizing,
                            confidenceMultiplier: {
                              ...strategy().mlStrategy.betSizing.confidenceMultiplier,
                              lowConfidence: parseFloat(e.currentTarget.value) || 0.5,
                            },
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="0.1"
                      max="3"
                      step="0.1"
                      disabled={botState().active}
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">
                      Média (45-55%)
                    </label>
                    <input
                      type="number"
                      value={strategy().mlStrategy.betSizing.confidenceMultiplier.midConfidence}
                      onInput={(e) =>
                        updateMLStrategy({
                          betSizing: {
                            ...strategy().mlStrategy.betSizing,
                            confidenceMultiplier: {
                              ...strategy().mlStrategy.betSizing.confidenceMultiplier,
                              midConfidence: parseFloat(e.currentTarget.value) || 1,
                            },
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="0.1"
                      max="3"
                      step="0.1"
                      disabled={botState().active}
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">
                      Alta (55-65%)
                    </label>
                    <input
                      type="number"
                      value={strategy().mlStrategy.betSizing.confidenceMultiplier.highConfidence}
                      onInput={(e) =>
                        updateMLStrategy({
                          betSizing: {
                            ...strategy().mlStrategy.betSizing,
                            confidenceMultiplier: {
                              ...strategy().mlStrategy.betSizing.confidenceMultiplier,
                              highConfidence: parseFloat(e.currentTarget.value) || 1.5,
                            },
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="0.1"
                      max="3"
                      step="0.1"
                      disabled={botState().active}
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">
                      Muito Alta (&gt;65%)
                    </label>
                    <input
                      type="number"
                      value={strategy().mlStrategy.betSizing.confidenceMultiplier.veryHighConfidence}
                      onInput={(e) =>
                        updateMLStrategy({
                          betSizing: {
                            ...strategy().mlStrategy.betSizing,
                            confidenceMultiplier: {
                              ...strategy().mlStrategy.betSizing.confidenceMultiplier,
                              veryHighConfidence: parseFloat(e.currentTarget.value) || 2,
                            },
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="0.1"
                      max="3"
                      step="0.1"
                      disabled={botState().active}
                    />
                  </div>
                </div>
              </Show>

              {/* Target Selection */}
              <div>
                <label class="block text-xs text-text-muted mb-1">
                  Seleção de Target
                </label>
                <select
                  value={strategy().mlStrategy.targetSelection.method}
                  onChange={(e) =>
                    updateMLStrategy({
                      targetSelection: {
                        ...strategy().mlStrategy.targetSelection,
                        method: e.currentTarget.value,
                      },
                    })
                  }
                  class="w-full bg-bg-secondary text-white text-sm px-3 py-2 rounded border border-border disabled:opacity-50"
                  disabled={botState().active}
                >
                  <option value="fixed">Fixo</option>
                  <option value="probability_based">Baseado em Probabilidade</option>
                  <option value="dynamic">Dinâmico</option>
                </select>
                <div class="text-[10px] text-text-muted mt-1 leading-tight">
                  {strategy().mlStrategy.targetSelection.method === 'fixed' && 'Usa sempre o mesmo target configurado'}
                  {strategy().mlStrategy.targetSelection.method === 'probability_based' && 'Escolhe target baseado nas probabilidades do ML (2x, 3x, 5x, 10x)'}
                  {strategy().mlStrategy.targetSelection.method === 'dynamic' && 'Ajusta dinamicamente baseado em condições do mercado'}
                </div>
              </div>

              <Show when={strategy().mlStrategy.targetSelection.method === 'fixed'}>
                <div>
                  <label class="block text-xs text-text-muted mb-1">Target Fixo</label>
                  <input
                    type="number"
                    value={strategy().mlStrategy.targetSelection.fixedTarget}
                    onInput={(e) =>
                      updateMLStrategy({
                        targetSelection: {
                          ...strategy().mlStrategy.targetSelection,
                          fixedTarget: parseFloat(e.currentTarget.value) || 2,
                        },
                      })
                    }
                    class="w-full bg-bg-secondary text-white font-mono px-3 py-2 rounded border border-border text-sm"
                    min="1.1"
                    step="0.5"
                    disabled={botState().active}
                  />
                </div>
              </Show>

              {/* Block Conditions */}
              <div class="space-y-2">
                <div class="text-xs text-text-muted">Condições de Bloqueio</div>

                <div class="flex items-center justify-between p-2 bg-bg-secondary rounded">
                  <span class="text-xs text-text-secondary">Bloquear Crash Precoce</span>
                  <div class="flex items-center gap-2">
                    <input
                      type="number"
                      value={(strategy().mlStrategy.blockConditions.earlyCrash.maxProb * 100).toFixed(0)}
                      onInput={(e) =>
                        updateMLStrategy({
                          blockConditions: {
                            ...strategy().mlStrategy.blockConditions,
                            earlyCrash: {
                              ...strategy().mlStrategy.blockConditions.earlyCrash,
                              maxProb: (parseFloat(e.currentTarget.value) || 35) / 100,
                            },
                          },
                        })
                      }
                      class="w-14 bg-bg-tertiary text-white font-mono px-2 py-1 rounded text-xs text-center"
                      min="10"
                      max="80"
                      disabled={botState().active}
                    />
                    <span class="text-xs text-text-muted">%</span>
                    <button
                      class={cn(
                        'w-9 h-5 rounded-full transition-colors relative',
                        strategy().mlStrategy.blockConditions.earlyCrash.enabled
                          ? 'bg-red'
                          : 'bg-bg-secondary'
                      )}
                      onClick={() =>
                        updateMLStrategy({
                          blockConditions: {
                            ...strategy().mlStrategy.blockConditions,
                            earlyCrash: {
                              ...strategy().mlStrategy.blockConditions.earlyCrash,
                              enabled: !strategy().mlStrategy.blockConditions.earlyCrash.enabled,
                            },
                          },
                        })
                      }
                      disabled={botState().active}
                    >
                      <span
                        class={cn(
                          'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                          strategy().mlStrategy.blockConditions.earlyCrash.enabled && 'left-4'
                        )}
                      />
                    </button>
                  </div>
                </div>

                <div class="flex items-center justify-between p-2 bg-bg-secondary rounded">
                  <span class="text-xs text-text-secondary">Bloquear Seq. Perdas</span>
                  <div class="flex items-center gap-2">
                    <input
                      type="number"
                      value={(strategy().mlStrategy.blockConditions.highLossStreak.maxProb * 100).toFixed(0)}
                      onInput={(e) =>
                        updateMLStrategy({
                          blockConditions: {
                            ...strategy().mlStrategy.blockConditions,
                            highLossStreak: {
                              ...strategy().mlStrategy.blockConditions.highLossStreak,
                              maxProb: (parseFloat(e.currentTarget.value) || 50) / 100,
                            },
                          },
                        })
                      }
                      class="w-14 bg-bg-tertiary text-white font-mono px-2 py-1 rounded text-xs text-center"
                      min="10"
                      max="80"
                      disabled={botState().active}
                    />
                    <span class="text-xs text-text-muted">%</span>
                    <button
                      class={cn(
                        'w-9 h-5 rounded-full transition-colors relative',
                        strategy().mlStrategy.blockConditions.highLossStreak.enabled
                          ? 'bg-red'
                          : 'bg-bg-secondary'
                      )}
                      onClick={() =>
                        updateMLStrategy({
                          blockConditions: {
                            ...strategy().mlStrategy.blockConditions,
                            highLossStreak: {
                              ...strategy().mlStrategy.blockConditions.highLossStreak,
                              enabled: !strategy().mlStrategy.blockConditions.highLossStreak.enabled,
                            },
                          },
                        })
                      }
                      disabled={botState().active}
                    >
                      <span
                        class={cn(
                          'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                          strategy().mlStrategy.blockConditions.highLossStreak.enabled && 'left-4'
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Rules Strategy Config */}
      <Show when={strategy().mode === 'rules_only' || strategy().mode === 'hybrid'}>
        <div class="p-3 bg-bg-tertiary rounded-lg">
          <button
            class="w-full flex items-center justify-between"
            onClick={() => toggleSection('rules')}
            disabled={botState().active}
          >
            <span class="text-sm font-medium text-yellow">Configuração Regras</span>
            <span class="text-text-muted text-xs">
              {expandedSection() === 'rules' ? '▲' : '▼'}
            </span>
          </button>

          <Show when={expandedSection() === 'rules'}>
            <div class="mt-3 space-y-3">
              {/* Streak 2x Rule */}
              <div class="p-2 bg-bg-secondary rounded">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs text-text-secondary">Sequência 2x</span>
                  <button
                    class={cn(
                      'w-9 h-5 rounded-full transition-colors relative',
                      strategy().rulesStrategy.rules.streak2x.enabled
                        ? 'bg-green'
                        : 'bg-bg-tertiary'
                    )}
                    onClick={() =>
                      updateRulesStrategy({
                        rules: {
                          ...strategy().rulesStrategy.rules,
                          streak2x: {
                            ...strategy().rulesStrategy.rules.streak2x,
                            enabled: !strategy().rulesStrategy.rules.streak2x.enabled,
                          },
                        },
                      })
                    }
                    disabled={botState().active}
                  >
                    <span
                      class={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        strategy().rulesStrategy.rules.streak2x.enabled && 'left-4'
                      )}
                    />
                  </button>
                </div>
                <Show when={strategy().rulesStrategy.rules.streak2x.enabled}>
                  <div class="flex items-center gap-2">
                    <label class="text-[10px] text-text-muted">Threshold</label>
                    <input
                      type="number"
                      value={strategy().rulesStrategy.rules.streak2x.multiplierThreshold}
                      onInput={(e) =>
                        updateRulesStrategy({
                          rules: {
                            ...strategy().rulesStrategy.rules,
                            streak2x: {
                              ...strategy().rulesStrategy.rules.streak2x,
                              multiplierThreshold: parseFloat(e.currentTarget.value) || 1.5,
                            },
                          },
                        })
                      }
                      class="w-16 bg-bg-tertiary text-white font-mono px-2 py-1 rounded text-xs text-center"
                      min="1"
                      max="3"
                      step="0.1"
                      disabled={botState().active}
                    />
                    <span class="text-[10px] text-text-muted">x avg</span>
                  </div>
                </Show>
              </div>

              {/* Favorability Rule */}
              <div class="p-2 bg-bg-secondary rounded">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs text-text-secondary">Favorabilidade</span>
                  <button
                    class={cn(
                      'w-9 h-5 rounded-full transition-colors relative',
                      strategy().rulesStrategy.rules.favorability.enabled
                        ? 'bg-green'
                        : 'bg-bg-tertiary'
                    )}
                    onClick={() =>
                      updateRulesStrategy({
                        rules: {
                          ...strategy().rulesStrategy.rules,
                          favorability: {
                            ...strategy().rulesStrategy.rules.favorability,
                            enabled: !strategy().rulesStrategy.rules.favorability.enabled,
                          },
                        },
                      })
                    }
                    disabled={botState().active}
                  >
                    <span
                      class={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        strategy().rulesStrategy.rules.favorability.enabled && 'left-4'
                      )}
                    />
                  </button>
                </div>
                <Show when={strategy().rulesStrategy.rules.favorability.enabled}>
                  <div class="flex items-center gap-2">
                    <label class="text-[10px] text-text-muted">Score mín.</label>
                    <input
                      type="number"
                      value={strategy().rulesStrategy.rules.favorability.minScore}
                      onInput={(e) =>
                        updateRulesStrategy({
                          rules: {
                            ...strategy().rulesStrategy.rules,
                            favorability: {
                              ...strategy().rulesStrategy.rules.favorability,
                              minScore: parseInt(e.currentTarget.value) || 35,
                            },
                          },
                        })
                      }
                      class="w-16 bg-bg-tertiary text-white font-mono px-2 py-1 rounded text-xs text-center"
                      min="0"
                      max="100"
                      disabled={botState().active}
                    />
                  </div>
                </Show>
              </div>

              {/* Momentum Rule */}
              <div class="p-2 bg-bg-secondary rounded">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs text-text-secondary">Momentum</span>
                  <button
                    class={cn(
                      'w-9 h-5 rounded-full transition-colors relative',
                      strategy().rulesStrategy.rules.momentum.enabled
                        ? 'bg-green'
                        : 'bg-bg-tertiary'
                    )}
                    onClick={() =>
                      updateRulesStrategy({
                        rules: {
                          ...strategy().rulesStrategy.rules,
                          momentum: {
                            ...strategy().rulesStrategy.rules.momentum,
                            enabled: !strategy().rulesStrategy.rules.momentum.enabled,
                          },
                        },
                      })
                    }
                    disabled={botState().active}
                  >
                    <span
                      class={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        strategy().rulesStrategy.rules.momentum.enabled && 'left-4'
                      )}
                    />
                  </button>
                </div>
                <Show when={strategy().rulesStrategy.rules.momentum.enabled}>
                  <div class="space-y-1">
                    <label class="flex items-center gap-2 text-[10px] text-text-muted">
                      <input
                        type="checkbox"
                        checked={strategy().rulesStrategy.rules.momentum.blockOnCold}
                        onChange={(e) =>
                          updateRulesStrategy({
                            rules: {
                              ...strategy().rulesStrategy.rules,
                              momentum: {
                                ...strategy().rulesStrategy.rules.momentum,
                                blockOnCold: e.currentTarget.checked,
                              },
                            },
                          })
                        }
                        disabled={botState().active}
                      />
                      Bloquear em momentum frio
                    </label>
                  </div>
                </Show>
              </div>

              {/* Consecutive Losses Rule */}
              <div class="p-2 bg-bg-secondary rounded">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs text-text-secondary">Perdas Consecutivas</span>
                  <button
                    class={cn(
                      'w-9 h-5 rounded-full transition-colors relative',
                      strategy().rulesStrategy.rules.consecutiveLosses.enabled
                        ? 'bg-green'
                        : 'bg-bg-tertiary'
                    )}
                    onClick={() =>
                      updateRulesStrategy({
                        rules: {
                          ...strategy().rulesStrategy.rules,
                          consecutiveLosses: {
                            ...strategy().rulesStrategy.rules.consecutiveLosses,
                            enabled: !strategy().rulesStrategy.rules.consecutiveLosses.enabled,
                          },
                        },
                      })
                    }
                    disabled={botState().active}
                  >
                    <span
                      class={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        strategy().rulesStrategy.rules.consecutiveLosses.enabled && 'left-4'
                      )}
                    />
                  </button>
                </div>
                <Show when={strategy().rulesStrategy.rules.consecutiveLosses.enabled}>
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label class="text-[10px] text-text-muted">Máx. perdas</label>
                      <input
                        type="number"
                        value={strategy().rulesStrategy.rules.consecutiveLosses.maxConsecutive}
                        onInput={(e) =>
                          updateRulesStrategy({
                            rules: {
                              ...strategy().rulesStrategy.rules,
                              consecutiveLosses: {
                                ...strategy().rulesStrategy.rules.consecutiveLosses,
                                maxConsecutive: parseInt(e.currentTarget.value) || 3,
                              },
                            },
                          })
                        }
                        class="w-full bg-bg-tertiary text-white font-mono px-2 py-1 rounded text-xs text-center"
                        min="1"
                        max="10"
                        disabled={botState().active}
                      />
                    </div>
                    <div>
                      <label class="text-[10px] text-text-muted">Reduzir aposta</label>
                      <input
                        type="number"
                        value={strategy().rulesStrategy.rules.consecutiveLosses.reduceBetMultiplier}
                        onInput={(e) =>
                          updateRulesStrategy({
                            rules: {
                              ...strategy().rulesStrategy.rules,
                              consecutiveLosses: {
                                ...strategy().rulesStrategy.rules.consecutiveLosses,
                                reduceBetMultiplier: parseFloat(e.currentTarget.value) || 0.5,
                              },
                            },
                          })
                        }
                        class="w-full bg-bg-tertiary text-white font-mono px-2 py-1 rounded text-xs text-center"
                        min="0.1"
                        max="1"
                        step="0.1"
                        disabled={botState().active}
                      />
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Hybrid Mode Config */}
      <Show when={strategy().mode === 'hybrid'}>
        <div class="p-3 bg-bg-tertiary rounded-lg">
          <button
            class="w-full flex items-center justify-between"
            onClick={() => toggleSection('hybrid')}
            disabled={botState().active}
          >
            <span class="text-sm font-medium text-purple">Configuração Híbrido</span>
            <span class="text-text-muted text-xs">
              {expandedSection() === 'hybrid' ? '▲' : '▼'}
            </span>
          </button>

          <Show when={expandedSection() === 'hybrid'}>
            <div class="mt-3 space-y-3">
              {/* ML Weight */}
              <div>
                <label class="block text-xs text-text-muted mb-1">
                  Peso do ML vs Regras
                </label>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-yellow">Regras</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={strategy().hybrid.mlWeight}
                    onInput={(e) =>
                      updateHybrid({ mlWeight: parseFloat(e.currentTarget.value) })
                    }
                    class="flex-1"
                    disabled={botState().active}
                  />
                  <span class="text-[10px] text-cyan">ML</span>
                  <span class="text-xs font-mono text-white w-10 text-right">
                    {(strategy().hybrid.mlWeight * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Override Options */}
              <div class="space-y-2">
                <label class="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={strategy().hybrid.requireBothAgree}
                    onChange={(e) =>
                      updateHybrid({ requireBothAgree: e.currentTarget.checked })
                    }
                    disabled={botState().active}
                  />
                  Exigir concordância de ambos
                </label>

                <label class="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={strategy().hybrid.mlCanOverrideRules}
                    onChange={(e) =>
                      updateHybrid({ mlCanOverrideRules: e.currentTarget.checked })
                    }
                    disabled={botState().active}
                  />
                  ML pode sobrescrever Regras
                </label>

                <label class="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={strategy().hybrid.rulesCanOverrideML}
                    onChange={(e) =>
                      updateHybrid({ rulesCanOverrideML: e.currentTarget.checked })
                    }
                    disabled={botState().active}
                  />
                  Regras podem sobrescrever ML
                </label>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
