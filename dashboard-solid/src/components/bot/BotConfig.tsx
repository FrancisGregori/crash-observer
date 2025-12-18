import { Component, Show, createSignal } from 'solid-js';
import { botsStore, setBotConfig, setBotBetAmount } from '../../stores/bots';
import { cn } from '../../lib/utils';
import type { BotId } from '../../types';
import { StrategyConfig } from './StrategyConfig';

interface BotConfigProps {
  botId: BotId;
}

export const BotConfig: Component<BotConfigProps> = (props) => {
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<'general' | 'strategy'>('strategy');
  const config = () => botsStore[props.botId].config;
  const botState = () => botsStore[props.botId].state;

  const handleBetAmountChange = (value: string) => {
    const amount = parseFloat(value);
    if (!isNaN(amount) && amount > 0) {
      setBotBetAmount(props.botId, amount);
    }
  };

  const handleToggle = (
    section: 'bankrollManagement' | 'stopLoss' | 'takeProfit' | 'dynamicCashout',
    field: 'enabled'
  ) => {
    setBotConfig(props.botId, {
      [section]: {
        ...config()[section],
        [field]: !config()[section][field],
      },
    });
  };

  const handleValueChange = (
    section: 'bankrollManagement' | 'stopLoss' | 'takeProfit',
    field: string,
    value: string
  ) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setBotConfig(props.botId, {
        [section]: {
          ...config()[section],
          [field]: numValue,
        },
      });
    }
  };

  const handleCashoutChange = (field: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setBotConfig(props.botId, {
        dynamicCashout: {
          ...config().dynamicCashout,
          [field]: numValue,
        },
      });
    }
  };

  return (
    <div class="mb-4">
      <button
        class="w-full flex items-center justify-between p-3 bg-bg-secondary rounded-lg hover:bg-bg-tertiary transition-colors"
        onClick={() => setIsExpanded(!isExpanded())}
        disabled={botState().active}
      >
        <span class="text-sm font-medium text-text-secondary">
          Configurações
        </span>
        <span class="text-text-muted">
          {isExpanded() ? '▲' : '▼'}
        </span>
      </button>

      <Show when={isExpanded()}>
        <div class="mt-2 bg-bg-secondary rounded-lg overflow-hidden">
          {/* Read-only indicator */}
          <Show when={botState().active}>
            <div class="px-4 py-2 bg-yellow/10 border-b border-yellow/30 text-xs text-yellow text-center">
              Modo visualização (pare o bot para editar)
            </div>
          </Show>

          {/* Tabs */}
          <div class="flex border-b border-border">
            <button
              class={cn(
                'flex-1 py-2 text-xs font-medium transition-colors',
                activeTab() === 'strategy'
                  ? 'bg-bg-tertiary text-cyan border-b-2 border-cyan'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              onClick={() => setActiveTab('strategy')}
            >
              Estratégia
            </button>
            <button
              class={cn(
                'flex-1 py-2 text-xs font-medium transition-colors',
                activeTab() === 'general'
                  ? 'bg-bg-tertiary text-cyan border-b-2 border-cyan'
                  : 'text-text-muted hover:text-text-secondary'
              )}
              onClick={() => setActiveTab('general')}
            >
              Geral
            </button>
          </div>

          {/* Strategy Tab */}
          <Show when={activeTab() === 'strategy'}>
            <div class="p-4">
              <StrategyConfig botId={props.botId} />
            </div>
          </Show>

          {/* General Tab */}
          <Show when={activeTab() === 'general'}>
            <div class="p-4 space-y-4">
              {/* Bet Amount */}
              <div>
                <label class="block text-xs text-text-muted mb-1">
                  Valor Base da Aposta
                </label>
                <input
                  type="number"
                  value={config().betAmount}
                  onInput={(e) => handleBetAmountChange(e.currentTarget.value)}
                  class="w-full bg-bg-tertiary text-white font-mono px-3 py-2 rounded border border-border focus:border-cyan focus:outline-none disabled:opacity-50"
                  min="0.1"
                  step="0.1"
                  disabled={botState().active}
                />
              </div>

              {/* Bankroll Management */}
              <div class="p-3 bg-bg-tertiary rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-text-secondary">
                    Gestão de Banca
                  </span>
                  <button
                    class={cn(
                      'w-11 h-6 rounded-full transition-colors relative shrink-0',
                      config().bankrollManagement.enabled
                        ? 'bg-green'
                        : 'bg-bg-secondary',
                      botState().active && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => !botState().active && handleToggle('bankrollManagement', 'enabled')}
                  >
                    <span
                      class={cn(
                        'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-200',
                        config().bankrollManagement.enabled && 'left-6'
                      )}
                    />
                  </button>
                </div>
                <Show when={config().bankrollManagement.enabled}>
                  <div class="mt-2">
                    <label class="block text-xs text-text-muted mb-1">
                      Máx % por Aposta
                    </label>
                    <input
                      type="number"
                      value={config().bankrollManagement.maxBetPercent}
                      onInput={(e) =>
                        handleValueChange(
                          'bankrollManagement',
                          'maxBetPercent',
                          e.currentTarget.value
                        )
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-3 py-2 rounded border border-border focus:border-cyan focus:outline-none text-sm disabled:opacity-50"
                      min="1"
                      max="100"
                      disabled={botState().active}
                    />
                  </div>
                </Show>
              </div>

              {/* Stop Loss */}
              <div class="p-3 bg-bg-tertiary rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-text-secondary">Stop Loss</span>
                  <button
                    class={cn(
                      'w-11 h-6 rounded-full transition-colors relative shrink-0',
                      config().stopLoss.enabled ? 'bg-red' : 'bg-bg-secondary',
                      botState().active && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => !botState().active && handleToggle('stopLoss', 'enabled')}
                  >
                    <span
                      class={cn(
                        'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-200',
                        config().stopLoss.enabled && 'left-6'
                      )}
                    />
                  </button>
                </div>
                <Show when={config().stopLoss.enabled}>
                  <div class="mt-2">
                    <label class="block text-xs text-text-muted mb-1">
                      Parar ao perder %
                    </label>
                    <input
                      type="number"
                      value={config().stopLoss.percent}
                      onInput={(e) =>
                        handleValueChange('stopLoss', 'percent', e.currentTarget.value)
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-3 py-2 rounded border border-border focus:border-cyan focus:outline-none text-sm disabled:opacity-50"
                      min="1"
                      max="100"
                      disabled={botState().active}
                    />
                  </div>
                </Show>
              </div>

              {/* Take Profit */}
              <div class="p-3 bg-bg-tertiary rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-text-secondary">Take Profit</span>
                  <button
                    class={cn(
                      'w-11 h-6 rounded-full transition-colors relative shrink-0',
                      config().takeProfit.enabled ? 'bg-green' : 'bg-bg-secondary',
                      botState().active && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => !botState().active && handleToggle('takeProfit', 'enabled')}
                  >
                    <span
                      class={cn(
                        'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-200',
                        config().takeProfit.enabled && 'left-6'
                      )}
                    />
                  </button>
                </div>
                <Show when={config().takeProfit.enabled}>
                  <div class="mt-2">
                    <label class="block text-xs text-text-muted mb-1">
                      Parar ao ganhar %
                    </label>
                    <input
                      type="number"
                      value={config().takeProfit.percent}
                      onInput={(e) =>
                        handleValueChange('takeProfit', 'percent', e.currentTarget.value)
                      }
                      class="w-full bg-bg-secondary text-white font-mono px-3 py-2 rounded border border-border focus:border-cyan focus:outline-none text-sm disabled:opacity-50"
                      min="1"
                      max="1000"
                      disabled={botState().active}
                    />
                  </div>
                </Show>
              </div>

              {/* Dynamic Cashout */}
              <div class="p-3 bg-bg-tertiary rounded-lg">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-text-secondary">
                    Cashout Dinâmico
                  </span>
                  <button
                    class={cn(
                      'w-11 h-6 rounded-full transition-colors relative shrink-0',
                      config().dynamicCashout.enabled
                        ? 'bg-cyan'
                        : 'bg-bg-secondary',
                      botState().active && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => !botState().active && handleToggle('dynamicCashout', 'enabled')}
                  >
                    <span
                      class={cn(
                        'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-200',
                        config().dynamicCashout.enabled && 'left-6'
                      )}
                    />
                  </button>
                </div>
                <Show when={config().dynamicCashout.enabled}>
                  <div class="grid grid-cols-3 gap-2 mt-2">
                    <div>
                      <label class="block text-[10px] text-text-muted mb-1">
                        Conservador
                      </label>
                      <input
                        type="number"
                        value={config().dynamicCashout.conservative}
                        onInput={(e) =>
                          handleCashoutChange('conservative', e.currentTarget.value)
                        }
                        class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border focus:border-cyan focus:outline-none text-sm text-center disabled:opacity-50"
                        min="1.01"
                        step="0.1"
                        disabled={botState().active}
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] text-text-muted mb-1">
                        Normal
                      </label>
                      <input
                        type="number"
                        value={config().dynamicCashout.normal}
                        onInput={(e) =>
                          handleCashoutChange('normal', e.currentTarget.value)
                        }
                        class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border focus:border-cyan focus:outline-none text-sm text-center disabled:opacity-50"
                        min="1.01"
                        step="0.1"
                        disabled={botState().active}
                      />
                    </div>
                    <div>
                      <label class="block text-[10px] text-text-muted mb-1">
                        Agressivo
                      </label>
                      <input
                        type="number"
                        value={config().dynamicCashout.aggressive}
                        onInput={(e) =>
                          handleCashoutChange('aggressive', e.currentTarget.value)
                        }
                        class="w-full bg-bg-secondary text-white font-mono px-2 py-1 rounded border border-border focus:border-cyan focus:outline-none text-sm text-center disabled:opacity-50"
                        min="1.01"
                        step="0.5"
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
    </div>
  );
};
