import { Component, Show, For, createSignal } from 'solid-js';
import {
  botsStore,
  saveCurrentConfig,
  loadSavedConfig,
  deleteSavedConfig,
  getSessionHistory,
  deleteSession,
  clearSessionHistory,
} from '../../stores/bots';
import { cn } from '../../lib/utils';
import type { BotId, SavedBotConfig, BotSessionRecord } from '../../types';

interface ConfigManagerProps {
  botId: BotId;
}

export const ConfigManager: Component<ConfigManagerProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<'configs' | 'history'>('configs');
  const [newConfigName, setNewConfigName] = createSignal('');
  const [showSaveForm, setShowSaveForm] = createSignal(false);

  const botState = () => botsStore[props.botId].state;
  const savedConfigs = () => botsStore.savedConfigs;
  const sessionHistory = () => botsStore.sessionHistory.filter(s => s.botId === props.botId);

  const handleSaveConfig = () => {
    const name = newConfigName().trim();
    if (name) {
      saveCurrentConfig(props.botId, name);
      setNewConfigName('');
      setShowSaveForm(false);
    }
  };

  const handleLoadConfig = (configId: string) => {
    if (!botState().active) {
      loadSavedConfig(configId, props.botId);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  const getStrategyLabel = (mode: string) => {
    switch (mode) {
      case 'ml_only': return 'ML';
      case 'rules_only': return 'Regras';
      case 'hybrid': return 'Híbrido';
      case 'breakeven_profit': return 'BE+Lucro';
      default: return mode;
    }
  };

  return (
    <div class="mt-4 border-t border-border pt-4">
      {/* Tabs */}
      <div class="flex gap-1 mb-3">
        <button
          class={cn(
            'flex-1 py-1.5 text-xs font-medium rounded transition-colors',
            activeTab() === 'configs'
              ? 'bg-cyan text-bg-primary'
              : 'bg-bg-secondary text-text-muted hover:text-text-secondary'
          )}
          onClick={() => setActiveTab('configs')}
        >
          Configs Salvas ({savedConfigs().length})
        </button>
        <button
          class={cn(
            'flex-1 py-1.5 text-xs font-medium rounded transition-colors',
            activeTab() === 'history'
              ? 'bg-cyan text-bg-primary'
              : 'bg-bg-secondary text-text-muted hover:text-text-secondary'
          )}
          onClick={() => setActiveTab('history')}
        >
          Histórico ({sessionHistory().length})
        </button>
      </div>

      {/* Configs Tab */}
      <Show when={activeTab() === 'configs'}>
        <div class="space-y-2">
          {/* Save Current Config */}
          <Show when={!showSaveForm()}>
            <button
              class="w-full py-2 text-xs font-medium bg-bg-secondary rounded hover:bg-bg-tertiary transition-colors text-cyan border border-cyan/30"
              onClick={() => setShowSaveForm(true)}
              disabled={botState().active}
            >
              + Salvar Config Atual
            </button>
          </Show>

          <Show when={showSaveForm()}>
            <div class="p-2 bg-bg-secondary rounded space-y-2">
              <input
                type="text"
                placeholder="Nome da configuração..."
                value={newConfigName()}
                onInput={(e) => setNewConfigName(e.currentTarget.value)}
                class="w-full bg-bg-tertiary text-white text-xs px-2 py-1.5 rounded border border-border focus:border-cyan focus:outline-none"
                onKeyPress={(e) => e.key === 'Enter' && handleSaveConfig()}
              />
              <div class="flex gap-1">
                <button
                  class="flex-1 py-1 text-xs bg-cyan text-bg-primary rounded"
                  onClick={handleSaveConfig}
                >
                  Salvar
                </button>
                <button
                  class="flex-1 py-1 text-xs bg-bg-tertiary text-text-muted rounded"
                  onClick={() => setShowSaveForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </Show>

          {/* Saved Configs List */}
          <div class="max-h-48 overflow-y-auto space-y-1">
            <For each={savedConfigs()} fallback={
              <div class="text-xs text-text-muted text-center py-4">
                Nenhuma configuração salva
              </div>
            }>
              {(config) => (
                <div class="p-2 bg-bg-secondary rounded flex items-center justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-white font-medium truncate">{config.name}</div>
                    <div class="text-[10px] text-text-muted">
                      {getStrategyLabel(config.config.strategy.mode)} | R${config.config.betAmount}
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <button
                      class={cn(
                        'px-2 py-1 text-[10px] rounded transition-colors',
                        botState().active
                          ? 'bg-bg-tertiary text-text-muted cursor-not-allowed'
                          : 'bg-cyan/20 text-cyan hover:bg-cyan/30'
                      )}
                      onClick={() => handleLoadConfig(config.id)}
                      disabled={botState().active}
                      title="Carregar"
                    >
                      Usar
                    </button>
                    <button
                      class="px-2 py-1 text-[10px] bg-red/20 text-red rounded hover:bg-red/30 transition-colors"
                      onClick={() => deleteSavedConfig(config.id)}
                      title="Excluir"
                    >
                      X
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* History Tab */}
      <Show when={activeTab() === 'history'}>
        <div class="space-y-2">
          <Show when={sessionHistory().length > 0}>
            <button
              class="w-full py-1.5 text-[10px] font-medium bg-red/10 text-red rounded hover:bg-red/20 transition-colors border border-red/30"
              onClick={() => {
                if (confirm('Limpar todo o histórico deste bot?')) {
                  clearSessionHistory();
                }
              }}
            >
              Limpar Histórico
            </button>
          </Show>

          {/* Session History List */}
          <div class="max-h-64 overflow-y-auto space-y-1">
            <For each={sessionHistory()} fallback={
              <div class="text-xs text-text-muted text-center py-4">
                Nenhuma sessão registrada
              </div>
            }>
              {(session) => (
                <div class="p-2 bg-bg-secondary rounded">
                  <div class="flex items-start justify-between gap-2 mb-1">
                    <div class="text-[10px] text-text-muted">
                      {formatDate(session.startTime)} - {formatDate(session.endTime)}
                    </div>
                    <button
                      class="text-[10px] text-red hover:text-red/80"
                      onClick={() => deleteSession(session.id)}
                    >
                      X
                    </button>
                  </div>

                  <div class="grid grid-cols-4 gap-1 text-[10px]">
                    <div>
                      <div class="text-text-muted">Duração</div>
                      <div class="text-white font-mono">{formatDuration(session.durationMs)}</div>
                    </div>
                    <div>
                      <div class="text-text-muted">Rodadas</div>
                      <div class="text-white font-mono">{session.totalRounds}</div>
                    </div>
                    <div>
                      <div class="text-text-muted">Taxa Acerto</div>
                      <div class={cn(
                        'font-mono',
                        session.winRate >= 50 ? 'text-green' : 'text-red'
                      )}>
                        {session.winRate.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div class="text-text-muted">Lucro</div>
                      <div class={cn(
                        'font-mono',
                        session.totalProfit >= 0 ? 'text-green' : 'text-red'
                      )}>
                        {session.totalProfit >= 0 ? '+' : ''}R${session.totalProfit.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div class="mt-1 pt-1 border-t border-border/50 grid grid-cols-3 gap-1 text-[10px]">
                    <div>
                      <span class="text-text-muted">Inicial: </span>
                      <span class="text-white font-mono">R${session.initialBalance.toFixed(0)}</span>
                    </div>
                    <div>
                      <span class="text-text-muted">Mín: </span>
                      <span class="text-red font-mono">R${session.minBalance.toFixed(0)}</span>
                    </div>
                    <div>
                      <span class="text-text-muted">Máx: </span>
                      <span class="text-green font-mono">R${session.maxBalance.toFixed(0)}</span>
                    </div>
                  </div>

                  <div class="mt-1 text-[10px] text-text-muted">
                    <span class="text-purple">{getStrategyLabel(session.config.strategy.mode)}</span>
                    {' | '}
                    W: {session.totalWins} / L: {session.totalLosses}
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};
