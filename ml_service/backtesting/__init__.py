"""
Backtesting system for crash game strategies.
"""

from .engine import BacktestEngine
from .strategies import (
    Strategy,
    FixedTargetStrategy,
    MartingaleStrategy,
    AntiMartingaleStrategy,
    PatternBasedStrategy,
    AdaptiveTargetStrategy,
    HybridMLStrategy,
    SafetyFirstStrategy,
    SkipLowStrategy,
)
from .metrics import calculate_metrics, print_metrics, compare_strategies, export_metrics_csv
from .optimizer import optimize_strategy, grid_search

__all__ = [
    "BacktestEngine",
    "Strategy",
    "FixedTargetStrategy",
    "MartingaleStrategy",
    "AntiMartingaleStrategy",
    "PatternBasedStrategy",
    "AdaptiveTargetStrategy",
    "HybridMLStrategy",
    "SafetyFirstStrategy",
    "SkipLowStrategy",
    "calculate_metrics",
    "print_metrics",
    "compare_strategies",
    "export_metrics_csv",
    "optimize_strategy",
    "grid_search",
]
