#!/usr/bin/env python3
"""
CLI for running crash game strategy backtests.

Usage:
    python run_backtest.py                    # Run all preset strategies
    python run_backtest.py --compare          # Compare strategies
    python run_backtest.py --optimize         # Optimize best strategy
    python run_backtest.py --monte-carlo      # Monte Carlo simulation
    python run_backtest.py --sensitivity      # Sensitivity analysis
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from backtesting import (
    BacktestEngine,
    FixedTargetStrategy,
    MartingaleStrategy,
    AntiMartingaleStrategy,
    PatternBasedStrategy,
    AdaptiveTargetStrategy,
    SafetyFirstStrategy,
    SkipLowStrategy,
    calculate_metrics,
    print_metrics,
    compare_strategies,
    export_metrics_csv,
)
from backtesting.engine import BacktestConfig, print_data_stats
from backtesting.optimizer import (
    grid_search,
    optimize_strategy,
    sensitivity_analysis,
    print_sensitivity_analysis,
    find_optimal_bet_size,
    print_optimal_bet_size,
)


def get_preset_strategies(initial_bankroll: float = 1000.0):
    """Get a list of preset strategies to test."""
    return [
        # Conservative fixed targets
        FixedTargetStrategy(target=1.5, bet_percent=1.0, initial_bankroll=initial_bankroll),
        FixedTargetStrategy(target=2.0, bet_percent=1.0, initial_bankroll=initial_bankroll),
        FixedTargetStrategy(target=3.0, bet_percent=1.0, initial_bankroll=initial_bankroll),

        # More aggressive bet sizing
        FixedTargetStrategy(target=2.0, bet_percent=2.0, initial_bankroll=initial_bankroll),
        FixedTargetStrategy(target=2.0, bet_percent=5.0, initial_bankroll=initial_bankroll),

        # Martingale variations
        MartingaleStrategy(target=2.0, base_bet=10.0, multiplier=2.0, max_consecutive_losses=4,
                          initial_bankroll=initial_bankroll),
        MartingaleStrategy(target=1.5, base_bet=10.0, multiplier=1.5, max_consecutive_losses=5,
                          initial_bankroll=initial_bankroll),

        # Anti-Martingale
        AntiMartingaleStrategy(target=2.0, base_bet=10.0, multiplier=1.5, max_consecutive_wins=3,
                              initial_bankroll=initial_bankroll),

        # Pattern based
        PatternBasedStrategy(bet_percent=2.0, min_streak_to_bet=3, streak_threshold=2.0,
                            target_after_streak=2.0, initial_bankroll=initial_bankroll),
        PatternBasedStrategy(bet_percent=2.0, min_streak_to_bet=5, streak_threshold=1.5,
                            target_after_streak=2.5, initial_bankroll=initial_bankroll),

        # Adaptive target
        AdaptiveTargetStrategy(start_target=5.0, min_target=1.5, target_decrement=0.5,
                              bet_percent=1.0, initial_bankroll=initial_bankroll),
        AdaptiveTargetStrategy(start_target=3.0, min_target=1.3, target_decrement=0.3,
                              bet_percent=2.0, initial_bankroll=initial_bankroll),

        # Safety first (dual bet)
        SafetyFirstStrategy(safety_target=1.5, profit_target=3.0, safety_bet_ratio=0.7,
                           total_bet_percent=2.0, initial_bankroll=initial_bankroll),
        SafetyFirstStrategy(safety_target=1.3, profit_target=4.0, safety_bet_ratio=0.6,
                           total_bet_percent=2.0, initial_bankroll=initial_bankroll),

        # Skip low
        SkipLowStrategy(target=2.0, bet_percent=2.0, skip_after_below=1.2, skip_rounds=2,
                       initial_bankroll=initial_bankroll),
    ]


def run_comparison(engine: BacktestEngine, initial_bankroll: float, verbose: bool):
    """Run comparison of all preset strategies."""
    print("\n" + "="*60)
    print("  RUNNING STRATEGY COMPARISON")
    print("="*60)

    strategies = get_preset_strategies(initial_bankroll)
    config = BacktestConfig(initial_bankroll=initial_bankroll, verbose=verbose)

    results = engine.run_comparison(strategies, config)
    compare_strategies(results)

    return results


def run_optimization(engine: BacktestEngine, initial_bankroll: float):
    """Run parameter optimization for top strategies."""
    print("\n" + "="*60)
    print("  RUNNING PARAMETER OPTIMIZATION")
    print("="*60)

    config = BacktestConfig(initial_bankroll=initial_bankroll)

    # Optimize FixedTarget strategy
    print("\n1. Optimizing FixedTarget strategy...")
    param_grid = {
        "target": [1.3, 1.5, 1.7, 2.0, 2.5, 3.0],
        "bet_percent": [0.5, 1.0, 2.0, 3.0, 5.0],
        "stop_loss_percent": [30, 50, 70],
    }
    fixed_results = grid_search(engine, FixedTargetStrategy, param_grid, config)

    # Optimize PatternBased strategy
    print("\n2. Optimizing PatternBased strategy...")
    pattern_grid = {
        "min_streak_to_bet": [2, 3, 4, 5, 6],
        "streak_threshold": [1.5, 2.0, 2.5],
        "target_after_streak": [1.5, 2.0, 2.5, 3.0],
        "bet_percent": [1.0, 2.0, 3.0],
    }
    pattern_results = grid_search(engine, PatternBasedStrategy, pattern_grid, config)

    # Optimize Adaptive strategy
    print("\n3. Optimizing AdaptiveTarget strategy...")
    adaptive_grid = {
        "start_target": [3.0, 4.0, 5.0],
        "min_target": [1.3, 1.5, 2.0],
        "target_decrement": [0.3, 0.5, 0.7],
        "bet_percent": [1.0, 2.0, 3.0],
    }
    adaptive_results = grid_search(engine, AdaptiveTargetStrategy, adaptive_grid, config)

    # Print top 3 for each
    print("\n" + "="*60)
    print("  TOP 3 CONFIGURATIONS PER STRATEGY")
    print("="*60)

    for name, results in [("FixedTarget", fixed_results),
                          ("PatternBased", pattern_results),
                          ("AdaptiveTarget", adaptive_results)]:
        print(f"\n{name}:")
        for i, (params, metrics) in enumerate(results[:3]):
            print(f"  #{i+1}: ROI={metrics.roi_percent:+.1f}%, "
                  f"WinRate={metrics.win_rate*100:.1f}%, "
                  f"Sharpe={metrics.sharpe_ratio:.2f}")
            print(f"       Params: {params}")


def run_monte_carlo(engine: BacktestEngine, initial_bankroll: float, n_sims: int):
    """Run Monte Carlo simulation on best strategies."""
    print("\n" + "="*60)
    print("  RUNNING MONTE CARLO SIMULATION")
    print("="*60)

    config = BacktestConfig(initial_bankroll=initial_bankroll)

    strategies_to_test = [
        ("Fixed 2x", FixedTargetStrategy(target=2.0, bet_percent=1.0,
                                         initial_bankroll=initial_bankroll)),
        ("Fixed 1.5x", FixedTargetStrategy(target=1.5, bet_percent=2.0,
                                           initial_bankroll=initial_bankroll)),
        ("Adaptive", AdaptiveTargetStrategy(start_target=3.0, min_target=1.5,
                                            initial_bankroll=initial_bankroll)),
    ]

    for name, strategy in strategies_to_test:
        print(f"\n{name}:")
        results = engine.monte_carlo_simulation(strategy, n_simulations=n_sims, config=config)

        print(f"  Mean ROI:          {results['mean_roi']:+.1f}%")
        print(f"  Median ROI:        {results['median_roi']:+.1f}%")
        print(f"  ROI Std Dev:       {results['std_roi']:.1f}%")
        print(f"  5th Percentile:    {results['percentile_5']:+.1f}%")
        print(f"  95th Percentile:   {results['percentile_95']:+.1f}%")
        print(f"  Bankruptcy Rate:   {results['bankruptcy_rate']:.1f}%")
        print(f"  Positive ROI Rate: {results['positive_roi_rate']:.1f}%")


def run_sensitivity(engine: BacktestEngine, initial_bankroll: float):
    """Run sensitivity analysis on key parameters."""
    print("\n" + "="*60)
    print("  RUNNING SENSITIVITY ANALYSIS")
    print("="*60)

    config = BacktestConfig(initial_bankroll=initial_bankroll)

    # Target sensitivity
    print("\n1. Target Multiplier Sensitivity (FixedTarget)")
    base_params = {"bet_percent": 2.0, "initial_bankroll": initial_bankroll}
    target_analysis = sensitivity_analysis(
        engine, FixedTargetStrategy, base_params,
        "target", [1.2, 1.3, 1.5, 1.7, 2.0, 2.5, 3.0, 4.0, 5.0],
        config
    )
    print_sensitivity_analysis(target_analysis, "target")

    # Bet size sensitivity
    print("\n2. Bet Size Sensitivity (FixedTarget @ 2x)")
    base_params = {"target": 2.0, "initial_bankroll": initial_bankroll}
    bet_analysis = sensitivity_analysis(
        engine, FixedTargetStrategy, base_params,
        "bet_percent", [0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0],
        config
    )
    print_sensitivity_analysis(bet_analysis, "bet_percent")

    # Optimal bet size
    print("\n3. Finding Optimal Bet Size")
    optimal = find_optimal_bet_size(
        engine, FixedTargetStrategy, base_params,
        bet_percent_range=(0.5, 10.0), n_points=20, config=config
    )
    print_optimal_bet_size(optimal)


def run_walk_forward(engine: BacktestEngine, initial_bankroll: float):
    """Run walk-forward validation."""
    print("\n" + "="*60)
    print("  RUNNING WALK-FORWARD VALIDATION")
    print("="*60)

    config = BacktestConfig(initial_bankroll=initial_bankroll)

    strategies = [
        ("Fixed 2x", FixedTargetStrategy, {"target": 2.0, "bet_percent": 2.0,
                                           "initial_bankroll": initial_bankroll}),
        ("Adaptive", AdaptiveTargetStrategy, {"start_target": 3.0, "min_target": 1.5,
                                              "bet_percent": 2.0,
                                              "initial_bankroll": initial_bankroll}),
    ]

    for name, strategy_class, params in strategies:
        print(f"\n{name}:")
        results = engine.walk_forward_test(
            strategy_class, params, n_splits=5, train_ratio=0.7, config=config
        )

        avg_roi = sum(r.roi_percent for r in results) / len(results)
        avg_win_rate = sum(r.win_rate for r in results) / len(results)
        print(f"  Average ROI across windows: {avg_roi:+.1f}%")
        print(f"  Average Win Rate: {avg_win_rate*100:.1f}%")
        print(f"  Consistency: {sum(1 for r in results if r.roi_percent > 0)}/{len(results)} positive windows")


def main():
    parser = argparse.ArgumentParser(description="Crash Game Strategy Backtester")
    parser.add_argument("--db", type=str, help="Path to database file")
    parser.add_argument("--bankroll", type=float, default=1000.0, help="Initial bankroll")
    parser.add_argument("--compare", action="store_true", help="Compare all preset strategies")
    parser.add_argument("--optimize", action="store_true", help="Run parameter optimization")
    parser.add_argument("--monte-carlo", action="store_true", help="Run Monte Carlo simulation")
    parser.add_argument("--sensitivity", action="store_true", help="Run sensitivity analysis")
    parser.add_argument("--walk-forward", action="store_true", help="Run walk-forward validation")
    parser.add_argument("--all", action="store_true", help="Run all analyses")
    parser.add_argument("--n-sims", type=int, default=500, help="Number of Monte Carlo simulations")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--export", type=str, help="Export results to CSV file")

    args = parser.parse_args()

    # Initialize engine
    print("Initializing backtest engine...")
    engine = BacktestEngine(args.db)

    # Print data stats
    stats = engine.get_data_stats()
    print_data_stats(stats)

    # Default to compare if no specific action
    if not any([args.compare, args.optimize, args.monte_carlo,
                args.sensitivity, args.walk_forward, args.all]):
        args.compare = True

    results = None

    if args.all or args.compare:
        results = run_comparison(engine, args.bankroll, args.verbose)

    if args.all or args.optimize:
        run_optimization(engine, args.bankroll)

    if args.all or args.monte_carlo:
        run_monte_carlo(engine, args.bankroll, args.n_sims)

    if args.all or args.sensitivity:
        run_sensitivity(engine, args.bankroll)

    if args.all or args.walk_forward:
        run_walk_forward(engine, args.bankroll)

    if args.export and results:
        export_metrics_csv(results, args.export)

    print("\nBacktest complete!")


if __name__ == "__main__":
    main()
