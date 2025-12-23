"""
Backtesting engine for crash game strategies.
"""

import sqlite3
from pathlib import Path
from typing import List, Dict, Any, Optional, Type
from dataclasses import dataclass
import numpy as np
from datetime import datetime

from .strategies import Strategy, RoundData, BetDecision, SafetyFirstStrategy
from .metrics import calculate_metrics, PerformanceMetrics


@dataclass
class BacktestConfig:
    """Configuration for backtest execution."""
    initial_bankroll: float = 1000.0
    start_round: Optional[int] = None  # Round ID to start from
    end_round: Optional[int] = None  # Round ID to end at
    warmup_rounds: int = 100  # Rounds to skip for feature calculation
    verbose: bool = False


class BacktestEngine:
    """
    Engine for running backtests on historical crash game data.
    """

    def __init__(self, db_path: str = None):
        """
        Initialize backtest engine.

        Args:
            db_path: Path to SQLite database with rounds data
        """
        if db_path is None:
            # Default path relative to project root
            project_root = Path(__file__).parent.parent.parent
            db_path = project_root / "data" / "crash_stats.db"

        self.db_path = Path(db_path)
        if not self.db_path.exists():
            raise FileNotFoundError(f"Database not found: {self.db_path}")

        self.rounds: List[RoundData] = []
        self._load_data()

    def _load_data(self) -> None:
        """Load rounds data from database."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, multiplier, betCount, totalBet, totalWin, createdAt
            FROM rounds
            ORDER BY id ASC
        """)

        self.rounds = [
            RoundData(
                id=row[0],
                multiplier=row[1],
                bet_count=row[2],
                total_bet=row[3],
                total_win=row[4],
                created_at=row[5],
            )
            for row in cursor.fetchall()
        ]

        conn.close()
        print(f"Loaded {len(self.rounds):,} rounds from database")

    def get_rounds_range(
        self,
        start_idx: Optional[int] = None,
        end_idx: Optional[int] = None
    ) -> List[RoundData]:
        """Get a slice of rounds by index."""
        return self.rounds[start_idx:end_idx]

    def run_backtest(
        self,
        strategy: Strategy,
        config: BacktestConfig = None
    ) -> PerformanceMetrics:
        """
        Run a backtest with a given strategy.

        Args:
            strategy: Strategy instance to test
            config: Backtest configuration

        Returns:
            PerformanceMetrics with results
        """
        if config is None:
            config = BacktestConfig()

        # Reset strategy state
        strategy.reset()
        strategy.bankroll = config.initial_bankroll
        strategy.initial_bankroll = config.initial_bankroll

        # Filter rounds by range if specified
        rounds_to_test = self.rounds

        if config.start_round is not None:
            rounds_to_test = [r for r in rounds_to_test if r.id >= config.start_round]

        if config.end_round is not None:
            rounds_to_test = [r for r in rounds_to_test if r.id <= config.end_round]

        # Skip warmup rounds
        if config.warmup_rounds > 0:
            rounds_to_test = rounds_to_test[config.warmup_rounds:]

        if not rounds_to_test:
            print("No rounds to test after filtering")
            return calculate_metrics([], config.initial_bankroll, 0)

        history = []

        for i, current_round in enumerate(rounds_to_test):
            # Get history up to this round (not including current)
            round_history = rounds_to_test[:i]

            # Get strategy decision
            decision = strategy.decide(round_history)

            if decision.should_bet:
                # Simulate the bet
                if isinstance(strategy, SafetyFirstStrategy):
                    profit = strategy.simulate_round(decision.bet_amount, current_round.multiplier)
                    won = profit > 0
                else:
                    won = current_round.multiplier >= decision.cashout_target
                    if won:
                        profit = decision.bet_amount * (decision.cashout_target - 1)
                    else:
                        profit = -decision.bet_amount

                # Update strategy state
                strategy.on_round_result(decision, current_round, won, profit)

                if config.verbose and i % 1000 == 0:
                    print(f"Round {i}: Bet ${decision.bet_amount:.2f} @ {decision.cashout_target}x "
                          f"| Mult: {current_round.multiplier:.2f}x | {'WIN' if won else 'LOSS'} "
                          f"| Bankroll: ${strategy.bankroll:.2f}")

            # Check for bankruptcy
            if strategy.bankroll <= 0:
                if config.verbose:
                    print(f"Strategy bankrupted at round {i}")
                break

        # Calculate metrics
        metrics = calculate_metrics(
            strategy.history,
            config.initial_bankroll,
            len(rounds_to_test)
        )

        return metrics

    def run_comparison(
        self,
        strategies: List[Strategy],
        config: BacktestConfig = None
    ) -> Dict[str, PerformanceMetrics]:
        """
        Run backtests on multiple strategies and compare.

        Args:
            strategies: List of strategy instances
            config: Backtest configuration

        Returns:
            Dictionary mapping strategy names to metrics
        """
        results = {}

        for strategy in strategies:
            print(f"Running backtest for: {strategy.name}")
            metrics = self.run_backtest(strategy, config)
            results[strategy.name] = metrics

        return results

    def walk_forward_test(
        self,
        strategy_class: Type[Strategy],
        strategy_params: Dict[str, Any],
        n_splits: int = 5,
        train_ratio: float = 0.7,
        config: BacktestConfig = None
    ) -> List[PerformanceMetrics]:
        """
        Perform walk-forward optimization.

        Splits data into n_splits windows, trains on train_ratio of each window,
        and tests on remaining.

        Args:
            strategy_class: Strategy class to instantiate
            strategy_params: Parameters for strategy
            n_splits: Number of windows
            train_ratio: Fraction of each window for training
            config: Base backtest configuration

        Returns:
            List of metrics for each test window
        """
        if config is None:
            config = BacktestConfig()

        n_rounds = len(self.rounds)
        window_size = n_rounds // n_splits

        results = []

        for i in range(n_splits):
            window_start = i * window_size
            window_end = min((i + 1) * window_size, n_rounds)
            train_end = window_start + int((window_end - window_start) * train_ratio)

            # Create fresh strategy
            strategy = strategy_class(**strategy_params)

            # Set test range
            test_config = BacktestConfig(
                initial_bankroll=config.initial_bankroll,
                start_round=self.rounds[train_end].id,
                end_round=self.rounds[window_end - 1].id if window_end < n_rounds else None,
                warmup_rounds=0,  # Already handled by start_round
                verbose=config.verbose,
            )

            metrics = self.run_backtest(strategy, test_config)
            results.append(metrics)

            print(f"Window {i+1}/{n_splits}: ROI = {metrics.roi_percent:+.1f}%, "
                  f"Win Rate = {metrics.win_rate*100:.1f}%")

        return results

    def monte_carlo_simulation(
        self,
        strategy: Strategy,
        n_simulations: int = 1000,
        sample_size: Optional[int] = None,
        config: BacktestConfig = None
    ) -> Dict[str, Any]:
        """
        Run Monte Carlo simulation by randomly sampling rounds.

        This helps understand the strategy's performance distribution
        and risk of ruin.

        Args:
            strategy: Strategy to test
            n_simulations: Number of simulations to run
            sample_size: Rounds per simulation (default: same as total)
            config: Backtest configuration

        Returns:
            Dictionary with simulation statistics
        """
        if config is None:
            config = BacktestConfig()

        if sample_size is None:
            sample_size = len(self.rounds) - config.warmup_rounds

        final_bankrolls = []
        rois = []
        bankruptcies = 0

        rounds_array = self.rounds[config.warmup_rounds:]

        for sim in range(n_simulations):
            # Random sample of rounds (with replacement)
            sampled_indices = np.random.choice(
                len(rounds_array),
                size=sample_size,
                replace=True
            )
            sampled_rounds = [rounds_array[i] for i in sampled_indices]

            # Create temporary engine with sampled data
            strategy.reset()
            strategy.bankroll = config.initial_bankroll
            strategy.initial_bankroll = config.initial_bankroll

            bankrupt = False
            for i, current_round in enumerate(sampled_rounds):
                round_history = sampled_rounds[:i]
                decision = strategy.decide(round_history)

                if decision.should_bet:
                    if isinstance(strategy, SafetyFirstStrategy):
                        profit = strategy.simulate_round(decision.bet_amount, current_round.multiplier)
                        won = profit > 0
                    else:
                        won = current_round.multiplier >= decision.cashout_target
                        if won:
                            profit = decision.bet_amount * (decision.cashout_target - 1)
                        else:
                            profit = -decision.bet_amount

                    strategy.on_round_result(decision, current_round, won, profit)

                    if strategy.bankroll <= 0:
                        bankrupt = True
                        break

            final_bankrolls.append(strategy.bankroll if not bankrupt else 0)
            roi = ((strategy.bankroll - config.initial_bankroll) / config.initial_bankroll) * 100
            rois.append(roi)
            if bankrupt:
                bankruptcies += 1

            if (sim + 1) % 100 == 0:
                print(f"Simulation {sim + 1}/{n_simulations} complete")

        return {
            "n_simulations": n_simulations,
            "mean_final_bankroll": np.mean(final_bankrolls),
            "median_final_bankroll": np.median(final_bankrolls),
            "std_final_bankroll": np.std(final_bankrolls),
            "mean_roi": np.mean(rois),
            "median_roi": np.median(rois),
            "std_roi": np.std(rois),
            "min_roi": np.min(rois),
            "max_roi": np.max(rois),
            "percentile_5": np.percentile(rois, 5),
            "percentile_95": np.percentile(rois, 95),
            "bankruptcy_rate": bankruptcies / n_simulations * 100,
            "positive_roi_rate": sum(1 for r in rois if r > 0) / n_simulations * 100,
        }

    def get_data_stats(self) -> Dict[str, Any]:
        """Get statistics about the loaded data."""
        if not self.rounds:
            return {}

        multipliers = [r.multiplier for r in self.rounds]

        return {
            "total_rounds": len(self.rounds),
            "first_round_date": self.rounds[0].created_at,
            "last_round_date": self.rounds[-1].created_at,
            "avg_multiplier": np.mean(multipliers),
            "median_multiplier": np.median(multipliers),
            "std_multiplier": np.std(multipliers),
            "min_multiplier": np.min(multipliers),
            "max_multiplier": np.max(multipliers),
            "pct_above_2x": sum(1 for m in multipliers if m >= 2.0) / len(multipliers) * 100,
            "pct_above_3x": sum(1 for m in multipliers if m >= 3.0) / len(multipliers) * 100,
            "pct_above_5x": sum(1 for m in multipliers if m >= 5.0) / len(multipliers) * 100,
            "pct_above_10x": sum(1 for m in multipliers if m >= 10.0) / len(multipliers) * 100,
            "pct_below_1.5x": sum(1 for m in multipliers if m < 1.5) / len(multipliers) * 100,
            "pct_early_crash": sum(1 for m in multipliers if m <= 1.2) / len(multipliers) * 100,
        }


def print_data_stats(stats: Dict[str, Any]) -> None:
    """Print formatted data statistics."""
    print(f"\n{'='*50}")
    print("  DATA STATISTICS")
    print(f"{'='*50}")
    print(f"  Total Rounds:     {stats['total_rounds']:,}")
    print(f"  Date Range:       {stats['first_round_date'][:10]} to {stats['last_round_date'][:10]}")
    print(f"\n  Multiplier Stats:")
    print(f"    Average:        {stats['avg_multiplier']:.2f}x")
    print(f"    Median:         {stats['median_multiplier']:.2f}x")
    print(f"    Std Dev:        {stats['std_multiplier']:.2f}")
    print(f"    Min:            {stats['min_multiplier']:.2f}x")
    print(f"    Max:            {stats['max_multiplier']:.2f}x")
    print(f"\n  Distribution:")
    print(f"    Early crash (<1.2x):  {stats['pct_early_crash']:.1f}%")
    print(f"    Below 1.5x:           {stats['pct_below_1.5x']:.1f}%")
    print(f"    Above 2x:             {stats['pct_above_2x']:.1f}%")
    print(f"    Above 3x:             {stats['pct_above_3x']:.1f}%")
    print(f"    Above 5x:             {stats['pct_above_5x']:.1f}%")
    print(f"    Above 10x:            {stats['pct_above_10x']:.1f}%")
    print(f"{'='*50}\n")
