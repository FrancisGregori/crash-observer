import { Component, Show } from 'solid-js';
import { visibilityStore } from '../../stores/visibility';

// Left Column Components
import { LastRoundCard } from '../analytics/LastRoundCard';
import { FavorabilityScore } from '../advanced/FavorabilityScore';
import { MomentumIndicator } from '../advanced/MomentumIndicator';
import { StatisticsGrid } from '../analytics/StatisticsGrid';
import { SuccessRatesGrid } from '../advanced/SuccessRatesGrid';
import { HouseProfitGrid } from '../analytics/HouseProfitGrid';
import { DistributionChart } from '../analytics/DistributionChart';
import { HourlyAnalysis } from '../analytics/HourlyAnalysis';
import { RoundsTable } from '../analytics/RoundsTable';

// Middle Column Components
import { RecommendationsList } from '../advanced/RecommendationsList';
import { MLPredictionsCard } from '../advanced/MLPredictionsCard';
import { StreaksGrid } from '../analytics/StreaksGrid';

// Right Column Components
import { SimulatorPanel } from '../simulator/SimulatorPanel';
import { BotContainer } from '../bot/BotContainer';

export const MainLayout: Component = () => {
  return (
    <main class="flex-1 flex overflow-hidden">
      {/* Left and Middle columns - scrollable */}
      <div class="flex-1 overflow-y-auto p-4">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column - Data & Statistics */}
          <div class="space-y-4">
            {/* Last Round */}
            <Show when={visibilityStore.lastRound}>
              <LastRoundCard />
            </Show>

            {/* Favorability & Momentum - below Last Round */}
            <Show when={visibilityStore.favorability || visibilityStore.momentum}>
              <div class="grid grid-cols-2 gap-4">
                <Show when={visibilityStore.favorability}>
                  <FavorabilityScore />
                </Show>
                <Show when={visibilityStore.momentum}>
                  <MomentumIndicator />
                </Show>
              </div>
            </Show>

            {/* Statistics */}
            <Show when={visibilityStore.statistics}>
              <StatisticsGrid />
            </Show>

            {/* Success Rates - below Statistics */}
            <Show when={visibilityStore.successRates}>
              <SuccessRatesGrid />
            </Show>

            {/* House Profit */}
            <Show when={visibilityStore.houseProfit}>
              <HouseProfitGrid />
            </Show>

            {/* Distribution */}
            <Show when={visibilityStore.distribution}>
              <DistributionChart />
            </Show>

            {/* Hourly Analysis */}
            <Show when={visibilityStore.hourlyAnalysis}>
              <HourlyAnalysis />
            </Show>

            {/* Rounds Table */}
            <Show when={visibilityStore.roundsTable}>
              <RoundsTable />
            </Show>
          </div>

          {/* Middle Column - Analysis */}
          <div class="space-y-4">
            {/* Recommendations */}
            <Show when={visibilityStore.recommendations}>
              <RecommendationsList />
            </Show>

            {/* ML Predictions */}
            <Show when={visibilityStore.mlPredictions}>
              <MLPredictionsCard />
            </Show>

            {/* Sequences - below ML Predictions */}
            <Show when={visibilityStore.sequences}>
              <StreaksGrid />
            </Show>
          </div>
        </div>
      </div>

      {/* Right Column - Simulator & Bots - Fixed position with internal scroll */}
      <Show when={visibilityStore.simulator || visibilityStore.bots}>
        <div class="w-[620px] shrink-0 border-l border-white/10 bg-bg-primary flex flex-col h-full">
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <Show when={visibilityStore.simulator}>
              <SimulatorPanel />
            </Show>

            <Show when={visibilityStore.bots}>
              <BotContainer />
            </Show>
          </div>
        </div>
      </Show>
    </main>
  );
};
