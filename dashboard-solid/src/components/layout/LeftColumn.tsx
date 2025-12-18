import { Component } from 'solid-js';
import { LastRoundCard } from '../analytics/LastRoundCard';
import { StatisticsGrid } from '../analytics/StatisticsGrid';
import { StreaksGrid } from '../analytics/StreaksGrid';
import { HouseProfitGrid } from '../analytics/HouseProfitGrid';
import { DistributionChart } from '../analytics/DistributionChart';
import { HourlyAnalysis } from '../analytics/HourlyAnalysis';
import { RoundsTable } from '../analytics/RoundsTable';

export const LeftColumn: Component = () => {
  return (
    <div class="space-y-4">
      {/* Last Round */}
      <LastRoundCard />

      {/* Statistics */}
      <StatisticsGrid />

      {/* Current Streaks */}
      <StreaksGrid />

      {/* House Profit */}
      <HouseProfitGrid />

      {/* Distribution Chart */}
      <DistributionChart />

      {/* Hourly Analysis */}
      <HourlyAnalysis />

      {/* Rounds Table */}
      <RoundsTable />
    </div>
  );
};
