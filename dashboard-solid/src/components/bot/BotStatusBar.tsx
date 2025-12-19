import { Component, Show, createSignal } from 'solid-js';
import {
  botsStore,
  setBotActive,
  setBotLiveMode,
  resetBot,
} from '../../stores/bots';
import { cn } from '../../lib/utils';
import type { BotId } from '../../types';

interface BotStatusBarProps {
  botId: BotId;
}

export const BotStatusBar: Component<BotStatusBarProps> = (props) => {
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const botState = () => botsStore[props.botId].state;
  const riskState = () => botsStore[props.botId].riskState;

  const getStatusText = () => {
    if (isLoading()) return 'Iniciando...';
    if (!botState().active) return 'Inativo';
    if (riskState().stopLossTriggered) return 'Stop Loss';
    if (riskState().takeProfitTriggered) return 'Take Profit';
    if (riskState().isPaused) return `Pausado (${riskState().pauseRoundsRemaining})`;
    if (botState().liveMode) return 'Modo Live';
    return 'Modo Teste';
  };

  const getStatusColor = () => {
    if (isLoading()) return 'text-cyan';
    if (!botState().active) return 'text-text-muted';
    if (riskState().stopLossTriggered) return 'text-red';
    if (riskState().takeProfitTriggered) return 'text-green';
    if (riskState().isPaused) return 'text-orange';
    if (botState().liveMode) return 'text-green';
    return 'text-yellow';
  };

  const handleToggleActive = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await setBotActive(props.botId, !botState().active);
      if (result !== true) {
        // result can be false or an error message string
        const errorMsg = typeof result === 'string' ? result : 'Falha ao ativar modo live. Verifique o console para mais detalhes.';
        setError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Erro: ${errorMsg}`);
      console.error('[BotStatusBar] Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleLive = () => {
    setBotLiveMode(props.botId, !botState().liveMode);
  };

  const handleReset = () => {
    if (confirm('Tem certeza que deseja resetar o bot?')) {
      resetBot(props.botId);
    }
  };

  return (
    <div class="space-y-3 mb-4">
      {/* Live/Test Mode Toggle - Always visible */}
      <div class="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
        <span class="text-sm text-text-secondary">Modo de Operação</span>
        <div class="flex items-center gap-2">
          <span class={cn(
            'text-xs',
            !botState().liveMode ? 'text-yellow font-bold' : 'text-text-muted'
          )}>
            Teste
          </span>
          <button
            class={cn(
              'w-12 h-6 rounded-full transition-colors relative shrink-0',
              botState().liveMode ? 'bg-green' : 'bg-yellow'
            )}
            onClick={handleToggleLive}
          >
            <span
              class={cn(
                'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow',
                botState().liveMode && 'left-7'
              )}
            />
          </button>
          <span class={cn(
            'text-xs',
            botState().liveMode ? 'text-green font-bold' : 'text-text-muted'
          )}>
            Live
          </span>
        </div>
      </div>

      {/* Status Bar */}
      <div class="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
        {/* Status */}
        <div class="flex items-center gap-3">
          <div
            class={cn(
              'w-3 h-3 rounded-full',
              botState().active
                ? botState().liveMode
                  ? 'bg-green animate-pulse'
                  : 'bg-yellow'
                : 'bg-bg-tertiary'
            )}
          />
          <div>
            <div class={cn('text-sm font-semibold', getStatusColor())}>
              {getStatusText()}
            </div>
            <Show when={botState().isProcessing}>
              <div class="text-xs text-text-muted animate-pulse">
                Processando...
              </div>
            </Show>
          </div>
        </div>

        {/* Controls */}
        <div class="flex items-center gap-2">
          {/* Active Toggle */}
          <button
            class={cn(
              'px-4 py-1.5 text-xs rounded font-bold transition-colors',
              isLoading() && 'opacity-50 cursor-wait',
              botState().active
                ? 'bg-red text-white hover:bg-red/80'
                : 'bg-green text-bg-primary hover:bg-green/80'
            )}
            onClick={handleToggleActive}
            disabled={isLoading()}
          >
            {isLoading() ? '...' : botState().active ? 'PARAR' : 'INICIAR'}
          </button>

          {/* Reset */}
          <button
            class="px-2 py-1.5 text-sm text-text-muted hover:text-red transition-colors"
            onClick={handleReset}
            title="Resetar bot"
            disabled={isLoading()}
          >
            ↺
          </button>
        </div>
      </div>

      {/* Error Message */}
      <Show when={error()}>
        <div class="p-2 bg-red/20 border border-red/30 rounded text-xs text-red text-center">
          {error()}
        </div>
      </Show>
    </div>
  );
};
