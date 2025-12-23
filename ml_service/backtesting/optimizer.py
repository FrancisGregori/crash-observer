"""
Strategy parameter optimization for backtesting.
"""

from typing import Dict, Any, List, Type, Optional, Callable, Tuple
from itertools import product
import numpy as np
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

from .strategies import Strategy
from .engine import BacktestEngine, BacktestConfig
from .metrics import PerformanceMetrics


def grid_search(
    engine: BacktestEngine,
    strategy_class: Type[Strategy],
    param_grid: Dict[str, List[Any]],
    config: BacktestConfig = None,
    metric: str = "roi_percent",
    n_jobs: int = 1,
    verbose: bool = True,
) -> List[Tuple[Dict[str, Any], PerformanceMetrics]]:
    """
    Perform grid search over strategy parameters.

    Args:
        engine: BacktestEngine instance
        strategy_class: Strategy class to optimize
        param_grid: Dictionary of parameter names to lists of values
        config: Backtest configuration
        metric: Metric to optimize ('roi_percent', 'sharpe_ratio', 'profit_factor', etc.)
        n_jobs: Number of parallel jobs (1 = sequential)
        verbose: Print progress

    Returns:
        List of (params, metrics) tuples sorted by metric (best first)
    """
    if config is None:
        config = BacktestConfig()

    # Generate all parameter combinations
    param_names = list(param_grid.keys())
    param_values = list(param_grid.values())
    combinations = list(product(*param_values))

    total_combos = len(combinations)
    if verbose:
        print(f"Grid search: {total_combos} parameter combinations")

    results = []

    for i, combo in enumerate(combinations):
        params = dict(zip(param_names, combo))

        try:
            strategy = strategy_class(**params)
            metrics = engine.run_backtest(strategy, config)
            results.append((params, metrics))

            if verbose and (i + 1) % 10 == 0:
                print(f"  Progress: {i+1}/{total_combos} combinations tested")

        except Exception as e:
            if verbose:
                print(f"  Error with params {params}: {e}")
            continue

    # Sort by metric (descending for most metrics)
    def get_metric(item):
        m = item[1]
        val = getattr(m, metric, 0)
        # Handle inf values
        if val == float('inf'):
            return float('inf')
        if val == float('-inf'):
            return float('-inf')
        return val

    results.sort(key=get_metric, reverse=True)

    if verbose and results:
        print(f"\nBest parameters ({metric}):")
        best_params, best_metrics = results[0]
        for k, v in best_params.items():
            print(f"  {k}: {v}")
        print(f"  {metric}: {getattr(best_metrics, metric):.4f}")

    return results


def optimize_strategy(
    engine: BacktestEngine,
    strategy_class: Type[Strategy],
    param_ranges: Dict[str, Tuple[float, float]],
    config: BacktestConfig = None,
    metric: str = "roi_percent",
    n_iterations: int = 100,
    method: str = "random",
    verbose: bool = True,
) -> Tuple[Dict[str, Any], PerformanceMetrics]:
    """
    Optimize strategy parameters using random or bayesian search.

    Args:
        engine: BacktestEngine instance
        strategy_class: Strategy class to optimize
        param_ranges: Dictionary of parameter names to (min, max) tuples
        config: Backtest configuration
        metric: Metric to optimize
        n_iterations: Number of random samples
        method: 'random' or 'bayesian'
        verbose: Print progress

    Returns:
        Tuple of (best_params, best_metrics)
    """
    if config is None:
        config = BacktestConfig()

    best_params = None
    best_metrics = None
    best_value = float('-inf')

    for i in range(n_iterations):
        # Sample random parameters
        params = {}
        for name, (min_val, max_val) in param_ranges.items():
            if isinstance(min_val, int) and isinstance(max_val, int):
                params[name] = np.random.randint(min_val, max_val + 1)
            else:
                params[name] = np.random.uniform(min_val, max_val)

        try:
            strategy = strategy_class(**params)
            metrics = engine.run_backtest(strategy, config)

            value = getattr(metrics, metric, 0)
            if value != float('inf') and value != float('-inf') and value > best_value:
                best_value = value
                best_params = params.copy()
                best_metrics = metrics

                if verbose:
                    print(f"  Iteration {i+1}: New best {metric} = {value:.4f}")

        except Exception as e:
            if verbose:
                print(f"  Iteration {i+1}: Error - {e}")
            continue

        if verbose and (i + 1) % 20 == 0:
            print(f"  Progress: {i+1}/{n_iterations} iterations")

    return best_params, best_metrics


def sensitivity_analysis(
    engine: BacktestEngine,
    strategy_class: Type[Strategy],
    base_params: Dict[str, Any],
    param_to_vary: str,
    values: List[Any],
    config: BacktestConfig = None,
    metrics_to_track: List[str] = None,
) -> Dict[str, List[float]]:
    """
    Analyze how a single parameter affects performance.

    Args:
        engine: BacktestEngine instance
        strategy_class: Strategy class
        base_params: Base parameter values
        param_to_vary: Name of parameter to vary
        values: List of values to test
        config: Backtest configuration
        metrics_to_track: List of metric names to track

    Returns:
        Dictionary mapping metric names to lists of values
    """
    if config is None:
        config = BacktestConfig()

    if metrics_to_track is None:
        metrics_to_track = ["roi_percent", "win_rate", "max_drawdown_percent", "sharpe_ratio"]

    results = {param_to_vary: values}
    for metric in metrics_to_track:
        results[metric] = []

    for value in values:
        params = base_params.copy()
        params[param_to_vary] = value

        try:
            strategy = strategy_class(**params)
            metrics = engine.run_backtest(strategy, config)

            for metric in metrics_to_track:
                results[metric].append(getattr(metrics, metric, 0))

        except Exception as e:
            print(f"Error with {param_to_vary}={value}: {e}")
            for metric in metrics_to_track:
                results[metric].append(0)

    return results


def print_sensitivity_analysis(results: Dict[str, List[float]], param_name: str) -> None:
    """Print formatted sensitivity analysis results."""
    print(f"\n{'='*70}")
    print(f"  SENSITIVITY ANALYSIS: {param_name}")
    print(f"{'='*70}")

    param_values = results[param_name]
    metrics = [k for k in results.keys() if k != param_name]

    # Header
    header = f"{'Value':>10}"
    for m in metrics:
        header += f" | {m[:15]:>15}"
    print(header)
    print("-" * 70)

    # Data rows
    for i, val in enumerate(param_values):
        row = f"{val:>10.2f}" if isinstance(val, float) else f"{val:>10}"
        for m in metrics:
            metric_val = results[m][i]
            if m in ["win_rate"]:
                row += f" | {metric_val*100:>14.1f}%"
            elif m in ["roi_percent", "max_drawdown_percent"]:
                row += f" | {metric_val:>14.1f}%"
            else:
                row += f" | {metric_val:>15.2f}"
        print(row)

    print(f"{'='*70}\n")


def find_optimal_bet_size(
    engine: BacktestEngine,
    strategy_class: Type[Strategy],
    base_params: Dict[str, Any],
    bet_percent_range: Tuple[float, float] = (0.5, 10.0),
    n_points: int = 20,
    config: BacktestConfig = None,
) -> Dict[str, Any]:
    """
    Find optimal bet size that maximizes risk-adjusted returns.

    Uses Kelly Criterion principles to find the optimal fraction.

    Args:
        engine: BacktestEngine instance
        strategy_class: Strategy class
        base_params: Base parameters (must have 'bet_percent')
        bet_percent_range: (min, max) bet percentage to test
        n_points: Number of points to test
        config: Backtest configuration

    Returns:
        Dictionary with optimal bet size and analysis
    """
    if config is None:
        config = BacktestConfig()

    bet_percents = np.linspace(bet_percent_range[0], bet_percent_range[1], n_points)

    results = []

    for bet_pct in bet_percents:
        params = base_params.copy()
        params["bet_percent"] = bet_pct

        try:
            strategy = strategy_class(**params)
            metrics = engine.run_backtest(strategy, config)

            results.append({
                "bet_percent": bet_pct,
                "roi": metrics.roi_percent,
                "sharpe": metrics.sharpe_ratio,
                "max_dd": metrics.max_drawdown_percent,
                "final_bankroll": metrics.final_bankroll,
            })

        except Exception:
            continue

    if not results:
        return {"optimal_bet_percent": 1.0, "results": []}

    # Find optimal by different criteria
    best_roi = max(results, key=lambda x: x["roi"])
    best_sharpe = max(results, key=lambda x: x["sharpe"])

    # Risk-adjusted: maximize ROI / max_dd ratio
    for r in results:
        r["risk_adjusted"] = r["roi"] / max(r["max_dd"], 0.01)

    best_risk_adjusted = max(results, key=lambda x: x["risk_adjusted"])

    return {
        "optimal_by_roi": best_roi["bet_percent"],
        "optimal_by_sharpe": best_sharpe["bet_percent"],
        "optimal_by_risk_adjusted": best_risk_adjusted["bet_percent"],
        "recommended": best_risk_adjusted["bet_percent"],
        "results": results,
    }


def print_optimal_bet_size(analysis: Dict[str, Any]) -> None:
    """Print optimal bet size analysis."""
    print(f"\n{'='*60}")
    print("  OPTIMAL BET SIZE ANALYSIS")
    print(f"{'='*60}")

    print(f"\n  Optimal by ROI:           {analysis['optimal_by_roi']:.1f}%")
    print(f"  Optimal by Sharpe:        {analysis['optimal_by_sharpe']:.1f}%")
    print(f"  Optimal by Risk-Adjusted: {analysis['optimal_by_risk_adjusted']:.1f}%")
    print(f"\n  RECOMMENDED: {analysis['recommended']:.1f}%")

    print(f"\n  Detailed Results:")
    print(f"  {'Bet %':>8} | {'ROI':>10} | {'Sharpe':>8} | {'Max DD':>10} | {'Final $':>10}")
    print("  " + "-" * 55)

    for r in analysis["results"]:
        print(f"  {r['bet_percent']:>7.1f}% | {r['roi']:>9.1f}% | {r['sharpe']:>8.2f} | "
              f"{r['max_dd']:>9.1f}% | ${r['final_bankroll']:>9,.0f}")

    print(f"{'='*60}\n")
