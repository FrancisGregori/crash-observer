import { Component, For, Show, createSignal } from 'solid-js';
import { visibilityStore, toggleVisibility, visibilityLabels, type VisibilityConfig } from '../../stores/visibility';
import { cn } from '../../lib/utils';

export const SettingsPanel: Component = () => {
  const [isOpen, setIsOpen] = createSignal(false);

  const sections = [
    { title: 'Coluna Esquerda', keys: ['lastRound', 'statistics', 'sequences', 'houseProfit', 'distribution', 'hourlyAnalysis', 'roundsTable'] as (keyof VisibilityConfig)[] },
    { title: 'Coluna Central', keys: ['favorability', 'momentum', 'successRates', 'recommendations', 'mlPredictions'] as (keyof VisibilityConfig)[] },
    { title: 'Coluna Direita', keys: ['simulator', 'bots'] as (keyof VisibilityConfig)[] },
  ];

  return (
    <div class="relative">
      <button
        onClick={() => setIsOpen(!isOpen())}
        class="p-2 rounded hover:bg-white/10 transition-colors"
        title="Configurações de visibilidade"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <Show when={isOpen()}>
        <div class="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
        <div class="absolute right-0 top-full mt-2 w-80 bg-bg-card border border-white/10 rounded-lg shadow-xl z-50 p-4">
          <h3 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
            Visibilidade dos Blocos
          </h3>

          <div class="space-y-4 max-h-96 overflow-y-auto">
            <For each={sections}>
              {(section) => (
                <div>
                  <div class="text-xs text-text-muted mb-2">{section.title}</div>
                  <div class="space-y-1">
                    <For each={section.keys}>
                      {(key) => (
                        <label class="flex items-center gap-3 p-2 rounded hover:bg-white/5 cursor-pointer">
                          <button
                            class={cn(
                              'w-9 h-5 rounded-full transition-colors relative shrink-0',
                              visibilityStore[key] ? 'bg-green' : 'bg-bg-secondary'
                            )}
                            onClick={() => toggleVisibility(key)}
                          >
                            <span
                              class={cn(
                                'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200',
                                visibilityStore[key] && 'left-4'
                              )}
                            />
                          </button>
                          <span class="text-sm text-text-secondary">{visibilityLabels[key]}</span>
                        </label>
                      )}
                    </For>
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
