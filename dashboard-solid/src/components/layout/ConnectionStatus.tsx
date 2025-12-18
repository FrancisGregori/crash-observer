import { Component, Show } from 'solid-js';
import { connectionStore } from '../../stores/connection';
import { cn } from '../../lib/utils';

export const ConnectionStatus: Component = () => {
  const statusConfig = () => {
    switch (connectionStore.status) {
      case 'connected':
        return {
          color: 'bg-green',
          text: 'Conectado',
          pulse: false,
        };
      case 'connecting':
        return {
          color: 'bg-yellow',
          text: 'Conectando...',
          pulse: true,
        };
      case 'error':
        return {
          color: 'bg-red',
          text: 'Erro',
          pulse: false,
        };
      default:
        return {
          color: 'bg-red',
          text: 'Desconectado',
          pulse: true,
        };
    }
  };

  return (
    <div class="flex items-center gap-2 px-3 py-1.5 bg-bg-card rounded-full border border-white/10">
      <div
        class={cn(
          'w-2 h-2 rounded-full',
          statusConfig().color,
          statusConfig().pulse && 'animate-pulse'
        )}
      />
      <span class="text-xs text-text-secondary">{statusConfig().text}</span>
      <Show when={connectionStore.reconnectAttempts > 0}>
        <span class="text-xs text-text-muted">
          ({connectionStore.reconnectAttempts})
        </span>
      </Show>
    </div>
  );
};
