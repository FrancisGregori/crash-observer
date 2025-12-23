import { Component, Show, For, createSignal, createEffect, on } from 'solid-js';
import { botsStore, setBotConfig } from '../../stores/bots';
import { cn } from '../../lib/utils';
import type { BotId, StrategyMode, StrategyConfig as StrategyConfigType } from '../../types';
import {
  createDefaultBreakevenProfitConfig,
  createDefaultWaitPatternConfig,
  createDefaultConservativeConfig,
  type BreakevenProfitConfig,
  type WaitPatternConfig,
  type ConservativeConfig,
} from '../../types/strategy';
import { StrategyPresetSelector } from './StrategyPresetSelector';

interface StrategyConfigProps {
  botId: BotId;
}

export const StrategyConfig: Component<StrategyConfigProps> = (props) => {
  const [expandedSection, setExpandedSection] = createSignal<string | null>(null);

  const config = () => botsStore[props.botId].config;
  const strategy = () => config().strategy;
  const botState = () => botsStore[props.botId].state;

  // Ensure configs exist (for migrations from older versions)
  const breakevenProfit = (): BreakevenProfitConfig => {
    return strategy().breakevenProfit || createDefaultBreakevenProfitConfig();
  };

  const waitPattern = (): WaitPatternConfig => {
    return strategy().waitPattern || createDefaultWaitPatternConfig();
  };

  const conservative = (): ConservativeConfig => {
    return strategy().conservative || createDefaultConservativeConfig();
  };

  // Auto-expand section ONLY when mode changes (not on other config changes)
  createEffect(
    on(
      () => strategy().mode,
      (mode) => {
        if (mode === 'breakeven_profit') {
          setExpandedSection('breakeven');
        } else if (mode === 'ml_only') {
          setExpandedSection('ml');
        } else if (mode === 'rules_only') {
          setExpandedSection('rules');
        } else if (mode === 'hybrid') {
          setExpandedSection('ml');
        } else if (mode === 'wait_pattern') {
          setExpandedSection('wait_pattern');
        } else if (mode === 'conservative') {
          setExpandedSection('conservative');
        }
      },
      { defer: false }
    )
  );

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

  const updateWaitPattern = (updates: any) => {
    updateStrategy({
      waitPattern: { ...waitPattern(), ...updates },
    });
  };

  const updateConservative = (updates: any) => {
    updateStrategy({
      conservative: { ...conservative(), ...updates },
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection() === section ? null : section);
  };

  const modes: { value: StrategyMode; label: string; desc: string; color?: string }[] = [
    { value: 'conservative', label: '1.5x', desc: 'Conservador simples', color: 'green' },
    { value: 'wait_pattern', label: 'Padrão', desc: 'Espera sequência', color: 'cyan' },
    { value: 'rules_only', label: 'Regras', desc: 'Sequências e padrões' },
    { value: 'ml_only', label: 'ML', desc: 'Machine Learning' },
    { value: 'hybrid', label: 'Híbrido', desc: 'ML + Regras' },
    { value: 'breakeven_profit', label: 'BE+Lucro', desc: 'Break-even + ML' },
  ];

  const updateBreakevenProfit = (updates: any) => {
    updateStrategy({
      breakevenProfit: { ...breakevenProfit(), ...updates },
    });
  };

  const getModeButtonClass = (mode: { value: StrategyMode; color?: string }) => {
    if (strategy().mode !== mode.value) {
      return 'bg-bg-secondary text-text-secondary hover:bg-bg-secondary/80';
    }
    if (mode.color === 'green') return 'bg-green text-bg-primary';
    if (mode.color === 'cyan') return 'bg-cyan text-bg-primary';
    if (mode.value === 'breakeven_profit') return 'bg-purple text-white';
    return 'bg-cyan text-bg-primary';
  };

  return (
    <div class="space-y-3">
      {/* Quick Preset Selector */}
      <StrategyPresetSelector botId={props.botId} />

      {/* Strategy Mode Selector */}
      <div class="p-3 bg-bg-tertiary rounded-lg">
        <div class="text-xs text-text-muted mb-2">Modo de Estratégia</div>
        <div class="grid grid-cols-3 gap-1">
          <For each={modes}>
            {(mode) => (
              <button
                class={cn(
                  'py-2 px-2 rounded text-xs font-medium transition-colors',
                  getModeButtonClass(mode)
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

      {/* Break-even + Profit Strategy Config */}
      <Show when={strategy().mode === 'breakeven_profit'}>
        <div class="p-3 bg-bg-tertiary rounded-lg">
          <button
            class="w-full flex items-center justify-between"
            onClick={() => toggleSection('breakeven')}
            disabled={botState().active}
          >
            <span class="text-sm font-medium text-purple">Configuração BE + Lucro</span>
            <span class="text-text-muted text-xs">
              {expandedSection() === 'breakeven' ? '▲' : '▼'}
            </span>
          </button>

          <Show when={expandedSection() === 'breakeven'}>
            <div class="mt-3 space-y-4">
              {/* Strategy Explanation */}
              <div class="p-2 bg-purple/10 rounded text-xs text-purple border border-purple/30">
                <strong>Como funciona:</strong> A primeira aposta sai em ~2x para cobrir ambas as apostas (break-even).
                A segunda aposta mira targets mais altos baseados no ML (3x, 5x, 7x, 10x, etc).
              </div>

              {/* Break-even Settings */}
              <div class="space-y-2">
                <div class="text-xs text-text-muted font-medium">Aposta Break-even (1ª)</div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Target Break-even</label>
                    <input
                      type="number"
                      value={breakevenProfit().breakeven.targetMultiplier}
                      onInput={(e) =>
                        updateBreakevenProfit({
                          breakeven: {
                            ...breakevenProfit().breakeven,
                            targetMultiplier: parseFloat(e.currentTarget.value) || 2,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="1.5"
                      max="3"
                      step="0.1"
                      disabled={botState().active}
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Mínimo</label>
                    <input
                      type="number"
                      value={breakevenProfit().breakeven.minMultiplier}
                      onInput={(e) =>
                        updateBreakevenProfit({
                          breakeven: {
                            ...breakevenProfit().breakeven,
                            minMultiplier: parseFloat(e.currentTarget.value) || 1.5,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="1.1"
                      max="2"
                      step="0.1"
                      disabled={botState().active}
                    />
                  </div>
                </div>
              </div>

              {/* Profit Settings */}
              <div class="space-y-2">
                <div class="text-xs text-text-muted font-medium">Aposta Lucro (2ª)</div>

                <div>
                  <label class="block text-[10px] text-text-muted mb-1">Confiança Mínima ML</label>
                  <div class="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.3"
                      max="0.7"
                      step="0.05"
                      value={breakevenProfit().profit.minMLConfidence}
                      onInput={(e) =>
                        updateBreakevenProfit({
                          profit: {
                            ...breakevenProfit().profit,
                            minMLConfidence: parseFloat(e.currentTarget.value),
                          },
                        })
                      }
                      class="flex-1"
                      disabled={botState().active}
                    />
                    <span class="text-sm font-mono text-purple w-12 text-right">
                      {(breakevenProfit().profit.minMLConfidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                <div>
                  <label class="block text-[10px] text-text-muted mb-1">Target Padrão (sem ML)</label>
                  <input
                    type="number"
                    value={breakevenProfit().profit.defaultTarget}
                    onInput={(e) =>
                      updateBreakevenProfit({
                        profit: {
                          ...breakevenProfit().profit,
                          defaultTarget: parseFloat(e.currentTarget.value) || 3,
                        },
                      })
                    }
                    class="w-full bg-bg-secondary text-white font-mono px-3 py-2 rounded border border-border text-sm"
                    min="2"
                    max="20"
                    step="0.5"
                    disabled={botState().active}
                  />
                </div>

                <div class="flex items-center justify-between p-2 bg-bg-secondary rounded">
                  <span class="text-xs text-text-secondary">Usar ML para Target</span>
                  <button
                    class={cn(
                      'w-9 h-5 rounded-full transition-colors relative',
                      breakevenProfit().profit.useMLTarget
                        ? 'bg-purple'
                        : 'bg-bg-tertiary'
                    )}
                    onClick={() =>
                      updateBreakevenProfit({
                        profit: {
                          ...breakevenProfit().profit,
                          useMLTarget: !breakevenProfit().profit.useMLTarget,
                        },
                      })
                    }
                    disabled={botState().active}
                  >
                    <span
                      class={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        breakevenProfit().profit.useMLTarget && 'left-4'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Target Thresholds */}
              <Show when={breakevenProfit().profit.useMLTarget}>
                <div class="space-y-2">
                  <div class="text-xs text-text-muted font-medium">Probabilidades Mínimas por Target</div>
                  <div class="grid grid-cols-3 gap-2">
                    <div>
                      <label class="block text-[10px] text-text-muted mb-1">3x</label>
                      <input
                        type="number"
                        value={(breakevenProfit().profit.targetThresholds.target3x * 100).toFixed(0)}
                        onInput={(e) =>
                          updateBreakevenProfit({
                            profit: {
                              ...breakevenProfit().profit,
                              targetThresholds: {
                                ...breakevenProfit().profit.targetThresholds,
                                target3x: (parseFloat(e.currentTarget.value) || 50) / 100,
                              },
                            },
                          })
                        }
                        class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-xs text-center"
                        min="10"
                        max="80"
                        disabled={botState().active}
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] text-text-muted mb-1">5x</label>
                      <input
                        type="number"
                        value={(breakevenProfit().profit.targetThresholds.target5x * 100).toFixed(0)}
                        onInput={(e) =>
                          updateBreakevenProfit({
                            profit: {
                              ...breakevenProfit().profit,
                              targetThresholds: {
                                ...breakevenProfit().profit.targetThresholds,
                                target5x: (parseFloat(e.currentTarget.value) || 40) / 100,
                              },
                            },
                          })
                        }
                        class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-xs text-center"
                        min="10"
                        max="70"
                        disabled={botState().active}
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] text-text-muted mb-1">10x</label>
                      <input
                        type="number"
                        value={(breakevenProfit().profit.targetThresholds.target10x * 100).toFixed(0)}
                        onInput={(e) =>
                          updateBreakevenProfit({
                            profit: {
                              ...breakevenProfit().profit,
                              targetThresholds: {
                                ...breakevenProfit().profit.targetThresholds,
                                target10x: (parseFloat(e.currentTarget.value) || 25) / 100,
                              },
                            },
                          })
                        }
                        class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-xs text-center"
                        min="5"
                        max="50"
                        disabled={botState().active}
                      />
                    </div>
                  </div>
                </div>
              </Show>

              {/* Skip Conditions */}
              <div class="space-y-2">
                <div class="text-xs text-text-muted font-medium">Condições de Pular</div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Máx Crash Precoce %</label>
                    <input
                      type="number"
                      value={(breakevenProfit().skipConditions.maxEarlyCrashProb * 100).toFixed(0)}
                      onInput={(e) =>
                        updateBreakevenProfit({
                          skipConditions: {
                            ...breakevenProfit().skipConditions,
                            maxEarlyCrashProb: (parseFloat(e.currentTarget.value) || 40) / 100,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="20"
                      max="70"
                      disabled={botState().active}
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Máx Seq Perdas %</label>
                    <input
                      type="number"
                      value={(breakevenProfit().skipConditions.maxLossStreakProb * 100).toFixed(0)}
                      onInput={(e) =>
                        updateBreakevenProfit({
                          skipConditions: {
                            ...breakevenProfit().skipConditions,
                            maxLossStreakProb: (parseFloat(e.currentTarget.value) || 55) / 100,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="30"
                      max="80"
                      disabled={botState().active}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Conservative Strategy Config */}
      <Show when={strategy().mode === 'conservative'}>
        <div class="p-3 bg-bg-tertiary rounded-lg border-l-2 border-green">
          <button
            class="w-full flex items-center justify-between"
            onClick={() => toggleSection('conservative')}
            disabled={botState().active}
          >
            <span class="text-sm font-medium text-green">Configuração Conservador</span>
            <span class="text-text-muted text-xs">
              {expandedSection() === 'conservative' ? '▲' : '▼'}
            </span>
          </button>

          <Show when={expandedSection() === 'conservative'}>
            <div class="mt-3 space-y-4">
              {/* Strategy Explanation */}
              <div class="p-2 bg-green/10 rounded text-xs text-green border border-green/30">
                <strong>Estratégia simples:</strong> Aposta um valor fixo em todas as rodadas e sai em um target baixo (1.3x-1.5x).
                Alto win rate, lucro consistente.
              </div>

              {/* Betting Config */}
              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-text-muted mb-1">Target</label>
                    <input
                      type="number"
                      value={conservative().betting.targetMultiplier}
                      onInput={(e) =>
                        updateConservative({
                          betting: {
                            ...conservative().betting,
                            targetMultiplier: parseFloat(e.currentTarget.value) || 1.5,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-3 py-2 rounded border border-border text-sm"
                      min="1.1"
                      max="3"
                      step="0.1"
                      disabled={botState().active}
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-text-muted mb-1">Valor Aposta</label>
                    <input
                      type="number"
                      value={conservative().betting.baseBetAmount}
                      onInput={(e) =>
                        updateConservative({
                          betting: {
                            ...conservative().betting,
                            baseBetAmount: parseFloat(e.currentTarget.value) || 2,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-3 py-2 rounded border border-border text-sm"
                      min="1"
                      step="0.5"
                      disabled={botState().active}
                    />
                  </div>
                </div>

                {/* Bet Every Round Toggle */}
                <div class="flex items-center justify-between p-2 bg-bg-secondary rounded">
                  <div>
                    <span class="text-xs text-text-secondary">Apostar toda rodada</span>
                    <p class="text-[10px] text-text-muted">Se desativado, usa detecção de padrão</p>
                  </div>
                  <button
                    class={cn(
                      'w-9 h-5 rounded-full transition-colors relative',
                      conservative().betting.betEveryRound ? 'bg-green' : 'bg-bg-tertiary'
                    )}
                    onClick={() =>
                      updateConservative({
                        betting: {
                          ...conservative().betting,
                          betEveryRound: !conservative().betting.betEveryRound,
                        },
                      })
                    }
                    disabled={botState().active}
                  >
                    <span
                      class={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        conservative().betting.betEveryRound && 'left-4'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Progression Config */}
              <div class="space-y-2">
                <div class="flex items-center justify-between p-2 bg-bg-secondary rounded">
                  <div>
                    <span class="text-xs text-text-secondary">Progressão</span>
                    <p class="text-[10px] text-text-muted">Aumentar aposta após wins</p>
                  </div>
                  <button
                    class={cn(
                      'w-9 h-5 rounded-full transition-colors relative',
                      conservative().progression.enabled ? 'bg-green' : 'bg-bg-tertiary'
                    )}
                    onClick={() =>
                      updateConservative({
                        progression: {
                          ...conservative().progression,
                          enabled: !conservative().progression.enabled,
                        },
                      })
                    }
                    disabled={botState().active}
                  >
                    <span
                      class={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        conservative().progression.enabled && 'left-4'
                      )}
                    />
                  </button>
                </div>

                <Show when={conservative().progression.enabled}>
                  <div class="grid grid-cols-2 gap-2 p-2 bg-bg-secondary rounded">
                    <div>
                      <label class="block text-[10px] text-text-muted mb-1">Após X wins</label>
                      <input
                        type="number"
                        value={conservative().progression.increaseAfterWins}
                        onInput={(e) =>
                          updateConservative({
                            progression: {
                              ...conservative().progression,
                              increaseAfterWins: parseInt(e.currentTarget.value) || 2,
                            },
                          })
                        }
                        class="w-full bg-bg-tertiary text-white font-mono px-2 py-1 rounded text-xs text-center"
                        min="1"
                        max="5"
                        disabled={botState().active}
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] text-text-muted mb-1">Multiplicar por</label>
                      <input
                        type="number"
                        value={conservative().progression.progressionFactor}
                        onInput={(e) =>
                          updateConservative({
                            progression: {
                              ...conservative().progression,
                              progressionFactor: parseFloat(e.currentTarget.value) || 1.5,
                            },
                          })
                        }
                        class="w-full bg-bg-tertiary text-white font-mono px-2 py-1 rounded text-xs text-center"
                        min="1.1"
                        max="3"
                        step="0.1"
                        disabled={botState().active}
                      />
                    </div>
                  </div>
                </Show>
              </div>

              {/* Risk Config */}
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-text-muted mb-1">Stop Loss %</label>
                  <input
                    type="number"
                    value={conservative().risk.stopLossPercent}
                    onInput={(e) =>
                      updateConservative({
                        risk: {
                          ...conservative().risk,
                          stopLossPercent: parseInt(e.currentTarget.value) || 50,
                        },
                      })
                    }
                    class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                    min="10"
                    max="90"
                    disabled={botState().active}
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-text-muted mb-1">Take Profit %</label>
                  <input
                    type="number"
                    value={conservative().risk.takeProfitPercent}
                    onInput={(e) =>
                      updateConservative({
                        risk: {
                          ...conservative().risk,
                          takeProfitPercent: parseInt(e.currentTarget.value) || 100,
                        },
                      })
                    }
                    class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                    min="10"
                    max="500"
                    disabled={botState().active}
                  />
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Wait Pattern Strategy Config */}
      <Show when={strategy().mode === 'wait_pattern'}>
        <div class="p-3 bg-bg-tertiary rounded-lg border-l-2 border-cyan">
          <button
            class="w-full flex items-center justify-between"
            onClick={() => toggleSection('wait_pattern')}
            disabled={botState().active}
          >
            <span class="text-sm font-medium text-cyan">Configuração Esperar Padrão</span>
            <span class="text-text-muted text-xs">
              {expandedSection() === 'wait_pattern' ? '▲' : '▼'}
            </span>
          </button>

          <Show when={expandedSection() === 'wait_pattern'}>
            <div class="mt-3 space-y-4">
              {/* Strategy Explanation */}
              <div class="p-2 bg-cyan/10 rounded text-xs text-cyan border border-cyan/30">
                <strong>Como funciona:</strong> Espera X rodadas consecutivas abaixo de um threshold antes de apostar.
                Menos apostas, menor exposição ao risco.
              </div>

              {/* Pattern Detection */}
              <div class="space-y-2">
                <div class="text-xs text-text-muted font-medium">Detecção de Padrão</div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Mín. rodadas</label>
                    <input
                      type="number"
                      value={waitPattern().pattern.minStreakLength}
                      onInput={(e) =>
                        updateWaitPattern({
                          pattern: {
                            ...waitPattern().pattern,
                            minStreakLength: parseInt(e.currentTarget.value) || 3,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="2"
                      max="10"
                      disabled={botState().active}
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Threshold</label>
                    <input
                      type="number"
                      value={waitPattern().pattern.streakThreshold}
                      onInput={(e) =>
                        updateWaitPattern({
                          pattern: {
                            ...waitPattern().pattern,
                            streakThreshold: parseFloat(e.currentTarget.value) || 2,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="1.5"
                      max="5"
                      step="0.5"
                      disabled={botState().active}
                    />
                  </div>
                </div>
                <p class="text-[10px] text-text-muted">
                  Espera {waitPattern().pattern.minStreakLength} rodadas abaixo de {waitPattern().pattern.streakThreshold}x
                </p>
              </div>

              {/* Betting Config */}
              <div class="space-y-2">
                <div class="text-xs text-text-muted font-medium">Aposta</div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Target</label>
                    <input
                      type="number"
                      value={waitPattern().betting.targetMultiplier}
                      onInput={(e) =>
                        updateWaitPattern({
                          betting: {
                            ...waitPattern().betting,
                            targetMultiplier: parseFloat(e.currentTarget.value) || 2,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="1.5"
                      max="5"
                      step="0.5"
                      disabled={botState().active}
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Valor Base</label>
                    <input
                      type="number"
                      value={waitPattern().betting.baseBetAmount}
                      onInput={(e) =>
                        updateWaitPattern({
                          betting: {
                            ...waitPattern().betting,
                            baseBetAmount: parseFloat(e.currentTarget.value) || 2,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="1"
                      step="0.5"
                      disabled={botState().active}
                    />
                  </div>
                </div>

                {/* Double on Pattern */}
                <div class="flex items-center justify-between p-2 bg-bg-secondary rounded">
                  <div>
                    <span class="text-xs text-text-secondary">Dobrar no padrão</span>
                    <p class="text-[10px] text-text-muted">Dobrar aposta quando padrão detectado</p>
                  </div>
                  <button
                    class={cn(
                      'w-9 h-5 rounded-full transition-colors relative',
                      waitPattern().betting.doubleBetOnPattern ? 'bg-cyan' : 'bg-bg-tertiary'
                    )}
                    onClick={() =>
                      updateWaitPattern({
                        betting: {
                          ...waitPattern().betting,
                          doubleBetOnPattern: !waitPattern().betting.doubleBetOnPattern,
                        },
                      })
                    }
                    disabled={botState().active}
                  >
                    <span
                      class={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all',
                        waitPattern().betting.doubleBetOnPattern && 'left-4'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Risk Config */}
              <div class="space-y-2">
                <div class="text-xs text-text-muted font-medium">Gerenciamento de Risco</div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Stop Loss %</label>
                    <input
                      type="number"
                      value={waitPattern().risk.stopLossPercent}
                      onInput={(e) =>
                        updateWaitPattern({
                          risk: {
                            ...waitPattern().risk,
                            stopLossPercent: parseInt(e.currentTarget.value) || 50,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="10"
                      max="90"
                      disabled={botState().active}
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] text-text-muted mb-1">Max Perdas Seguidas</label>
                    <input
                      type="number"
                      value={waitPattern().risk.maxConsecutiveLosses}
                      onInput={(e) =>
                        updateWaitPattern({
                          risk: {
                            ...waitPattern().risk,
                            maxConsecutiveLosses: parseInt(e.currentTarget.value) || 5,
                          },
                        })
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border text-sm text-center"
                      min="2"
                      max="10"
                      disabled={botState().active}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
