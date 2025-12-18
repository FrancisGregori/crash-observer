import { Component } from 'solid-js';
import { FavorabilityScore } from '../advanced/FavorabilityScore';
import { MomentumIndicator } from '../advanced/MomentumIndicator';
import { MLPredictionsCard } from '../advanced/MLPredictionsCard';
import { SuccessRatesGrid } from '../advanced/SuccessRatesGrid';
import { RecommendationsList } from '../advanced/RecommendationsList';
import { SimulatorPanel } from '../simulator/SimulatorPanel';
import { BotContainer } from '../bot/BotContainer';

export const RightColumn: Component = () => {
  return (
    <div class="space-y-4">
      {/* Advanced Analysis */}
      <div class="grid grid-cols-2 gap-4">
        <FavorabilityScore />
        <MomentumIndicator />
      </div>

      {/* ML Predictions */}
      <MLPredictionsCard />

      {/* Success Rates */}
      <SuccessRatesGrid />

      {/* Recommendations */}
      <RecommendationsList />

      {/* Simulator */}
      <SimulatorPanel />

      {/* Bots */}
      <BotContainer />
    </div>
  );
};
