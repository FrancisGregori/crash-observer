import { Component, For, Show, createSignal } from 'solid-js';
import { botsStore, setBotConfig } from '../../stores/bots';
import { cn } from '../../lib/utils';
import type { BotId } from '../../types';
import {
  STRATEGY_PRESETS,
  createDefaultWaitPatternConfig,
  createDefaultConservativeConfig,
} from '../../types/strategy';

interface StrategyPresetSelectorProps {
  botId: BotId;
}

interface PresetInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  roi: string;
  winRate: string;
  risk: string;
}

const presets: PresetInfo[] = [
  {
    id: 'conservative_1_5x',
    name: 'Conservador 1.5x',
    description: 'Aposta toda rodada, sai em 1.5x',
    icon: '🛡️',
    color: 'green',
    roi: '+29%',
    winRate: '67%',
    risk: 'Médio',
  },
  {
    id: 'wait_pattern_2x',
    name: 'Esperar Padrão',
    description: 'Espera 3 rodadas <2x, aposta em 2x',
    icon: '⏳',
    color: 'cyan',
    roi: '+20%',
    winRate: '52%',
    risk: 'Baixo',
  },
  {
    id: 'wait_pattern_aggressive',
    name: 'Padrão Agressivo',
    description: 'Espera 4 rodadas, dobra aposta',
    icon: '🔥',
    color: 'orange',
    roi: '+8%',
    winRate: '51%',
    risk: 'Alto',
  },
  {
    id: 'progressive_1_5x',
    name: 'Progressivo 1.5x',
    description: '1.5x com aumento após wins',
    icon: '📈',
    color: 'purple',
    roi: '+15%',
    winRate: '65%',
    risk: 'Médio',
  },
];

export const StrategyPresetSelector: Component<StrategyPresetSelectorProps> = (props) => {
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [selectedPreset, setSelectedPreset] = createSignal<string | null>(null);

  const config = () => botsStore[props.botId].config;
  const strategy = () => config().strategy;
  const botState = () => botsStore[props.botId].state;

  // Detect current preset
  const currentPreset = () => {
    const mode = strategy().mode;
    if (mode === 'conservative') {
      const cons = strategy().conservative;
      if (cons?.betting?.targetMultiplier === 1.5 && !cons?.progression?.enabled) {
        return 'conservative_1_5x';
      }
      if (cons?.progression?.enabled) {
        return 'progressive_1_5x';
      }
    }
    if (mode === 'wait_pattern') {
      const wp = strategy().waitPattern;
      if (wp?.pattern?.minStreakLength === 4 && wp?.betting?.doubleBetOnPattern) {
        return 'wait_pattern_aggressive';
      }
      return 'wait_pattern_2x';
    }
    return null;
  };

  const applyPreset = (presetId: string) => {
    const preset = STRATEGY_PRESETS[presetId as keyof typeof STRATEGY_PRESETS];
    if (!preset) return;

    setSelectedPreset(presetId);

    // Build the full config update
    const updates: any = {
      mode: preset.config.mode,
    };

    if (preset.config.mode === 'conservative' && 'conservative' in preset.config) {
      updates.conservative = {
        ...createDefaultConservativeConfig(),
        ...preset.config.conservative,
      };
    }

    if (preset.config.mode === 'wait_pattern' && 'waitPattern' in preset.config) {
      updates.waitPattern = {
        ...createDefaultWaitPatternConfig(),
        ...preset.config.waitPattern,
      };
    }

    setBotConfig(props.botId, {
      strategy: { ...strategy(), ...updates },
    });

    setIsExpanded(false);
  };

  const getPresetColor = (color: string) => {
    switch (color) {
      case 'green': return 'border-green bg-green/10 hover:bg-green/20';
      case 'cyan': return 'border-cyan bg-cyan/10 hover:bg-cyan/20';
      case 'orange': return 'border-orange bg-orange/10 hover:bg-orange/20';
      case 'purple': return 'border-purple bg-purple/10 hover:bg-purple/20';
      default: return 'border-border bg-bg-secondary';
    }
  };

  const getActiveColor = (color: string) => {
    switch (color) {
      case 'green': return 'ring-2 ring-green';
      case 'cyan': return 'ring-2 ring-cyan';
      case 'orange': return 'ring-2 ring-orange';
      case 'purple': return 'ring-2 ring-purple';
      default: return '';
    }
  };

  return (
    <div class="mb-3">
      {/* Compact Header */}
      <button
        class="w-full flex items-center justify-between p-2 bg-gradient-to-r from-cyan/20 to-purple/20 rounded-lg border border-cyan/30 hover:border-cyan/50 transition-all"
        onClick={() => setIsExpanded(!isExpanded())}
        disabled={botState().active}
      >
        <div class="flex items-center gap-2">
          <span class="text-lg">🎯</span>
          <div class="text-left">
            <div class="text-sm font-medium text-white">
              {currentPreset()
                ? presets.find(p => p.id === currentPreset())?.name || 'Personalizado'
                : 'Selecionar Estratégia'}
            </div>
            <div class="text-[10px] text-text-muted">
              Baseado em backtests com 20k rodadas
            </div>
          </div>
        </div>
        <span class="text-text-muted">{isExpanded() ? '▲' : '▼'}</span>
      </button>

      {/* Expanded Presets */}
      <Show when={isExpanded()}>
        <div class="mt-2 p-3 bg-bg-secondary rounded-lg border border-border space-y-2">
          <div class="text-xs text-text-muted mb-2">
            Resultados de backtest (10h, banca R$100, aposta R$2)
          </div>

          <For each={presets}>
            {(preset) => (
              <button
                class={cn(
                  'w-full p-3 rounded-lg border transition-all text-left',
                  getPresetColor(preset.color),
                  currentPreset() === preset.id && getActiveColor(preset.color),
                  botState().active && 'opacity-50 cursor-not-allowed'
                )}
                onClick={() => !botState().active && applyPreset(preset.id)}
              >
                <div class="flex items-start gap-3">
                  <span class="text-2xl">{preset.icon}</span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                      <span class="font-medium text-white">{preset.name}</span>
                      <span class={cn(
                        'text-sm font-mono font-bold',
                        preset.roi.startsWith('+') ? 'text-green' : 'text-red'
                      )}>
                        {preset.roi}
                      </span>
                    </div>
                    <div class="text-xs text-text-muted mt-0.5">{preset.description}</div>
                    <div class="flex gap-3 mt-2 text-[10px]">
                      <span class="text-text-muted">
                        Win: <span class="text-white font-mono">{preset.winRate}</span>
                      </span>
                      <span class="text-text-muted">
                        Risco: <span class={cn(
                          'font-medium',
                          preset.risk === 'Baixo' && 'text-green',
                          preset.risk === 'Médio' && 'text-yellow',
                          preset.risk === 'Alto' && 'text-orange'
                        )}>{preset.risk}</span>
                      </span>
                    </div>
                  </div>
                  <Show when={currentPreset() === preset.id}>
                    <span class="text-green text-sm">✓</span>
                  </Show>
                </div>
              </button>
            )}
          </For>

          <div class="pt-2 border-t border-border">
            <div class="text-[10px] text-text-muted text-center">
              Ou configure manualmente abaixo
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
