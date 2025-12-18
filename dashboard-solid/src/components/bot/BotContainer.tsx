import { Component, Show } from 'solid-js';
import { botsStore } from '../../stores/bots';
import { BotSelector } from './BotSelector';
import { CombinedStats } from './CombinedStats';
import { BotPanel } from './BotPanel';

export const BotContainer: Component = () => {
  return (
    <div class="card">
      <h2 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
        Bots Automatizados
      </h2>

      {/* Combined Stats */}
      <CombinedStats />

      {/* Bot Selector Tabs */}
      <BotSelector />

      {/* Active Bot Panel */}
      <Show when={botsStore.activeBotTab === 'bot1'}>
        <BotPanel botId="bot1" />
      </Show>
      <Show when={botsStore.activeBotTab === 'bot2'}>
        <BotPanel botId="bot2" />
      </Show>
    </div>
  );
};
