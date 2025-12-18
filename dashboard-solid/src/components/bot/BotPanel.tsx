import { Component, Show } from 'solid-js';
import { botsStore } from '../../stores/bots';
import { BotStatusBar } from './BotStatusBar';
import { BotBalanceManager } from './BotBalanceManager';
import { BotDecisionBox } from './BotDecisionBox';
import { BotActiveBet } from './BotActiveBet';
import { BotStatsGrid } from './BotStatsGrid';
import { BotHistory } from './BotHistory';
import { BotConfig } from './BotConfig';
import type { BotId } from '../../types';

interface BotPanelProps {
  botId: BotId;
}

export const BotPanel: Component<BotPanelProps> = (props) => {
  return (
    <div>
      {/* Status Bar */}
      <BotStatusBar botId={props.botId} />

      {/* Balance Manager */}
      <BotBalanceManager botId={props.botId} />

      {/* Decision Box (only when active) */}
      <BotDecisionBox botId={props.botId} />

      {/* Active Bet */}
      <BotActiveBet botId={props.botId} />

      {/* Stats Grid */}
      <BotStatsGrid botId={props.botId} />

      {/* History */}
      <BotHistory botId={props.botId} />

      {/* Config */}
      <BotConfig botId={props.botId} />
    </div>
  );
};
