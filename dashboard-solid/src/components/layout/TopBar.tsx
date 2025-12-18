import { Component } from 'solid-js';
import { ConnectionStatus } from './ConnectionStatus';
import { RoundsGrid } from './RoundsGrid';
import { SettingsPanel } from './SettingsPanel';

export const TopBar: Component = () => {
  return (
    <header class="sticky top-0 z-50 bg-bg-header border-b border-white/10 px-4 py-3">
      <div class="flex items-center justify-between gap-4">
        {/* Logo / Title */}
        <div class="flex items-center gap-3 shrink-0">
          <h1 class="text-xl font-bold text-white">
            Crash <span class="text-accent">Observer</span>
          </h1>
          <ConnectionStatus />
        </div>

        {/* Rounds Grid */}
        <div class="flex-1 overflow-hidden">
          <RoundsGrid />
        </div>

        {/* Settings */}
        <div class="shrink-0">
          <SettingsPanel />
        </div>
      </div>
    </header>
  );
};
