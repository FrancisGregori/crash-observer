"""
Performance metrics calculation for backtesting.
"""

from dataclasses import dataclass
from typing import List, Dict, Any
import numpy as np


@dataclass
class PerformanceMetrics:
    """Comprehensive performance metrics for a strategy."""

    # Basic stats
    total_rounds: int
    rounds_bet: int
    rounds_won: int
    rounds_lost: int
    rounds_skipped: int

    # Financial
    initial_bankroll: float
    final_bankroll: float
    total_profit: float
    total_wagered: float
    roi_percent: float  # Return on investment

    # Win/Loss
    win_rate: float
    avg_win: float
    avg_loss: float
    profit_factor: float  # Gross profit / Gross loss

    # Risk metrics
    max_drawdown: float
    max_drawdown_percent: float
    max_consecutive_losses: int
    max_consecutive_wins: int

    # Advanced
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float  # Return / Max Drawdown
    expectancy: float  # Expected profit per bet

    # Equity curve stats
    peak_bankroll: float
    lowest_bankroll: float


def calculate_metrics(
    history: List[Dict[str, Any]],
    initial_bankroll: float,
    total_rounds: int
) -> PerformanceMetrics:
    """
    Calculate comprehensive performance metrics from trade history.

    Args:
        history: List of trade records with 'profit', 'bankroll', 'won' fields
        initial_bankroll: Starting bankroll
        total_rounds: Total number of rounds in backtest

    Returns:
        PerformanceMetrics object
    """

    if not history:
        return PerformanceMetrics(
            total_rounds=total_rounds,
            rounds_bet=0,
            rounds_won=0,
            rounds_lost=0,
            rounds_skipped=total_rounds,
            initial_bankroll=initial_bankroll,
            final_bankroll=initial_bankroll,
            total_profit=0.0,
            total_wagered=0.0,
            roi_percent=0.0,
            win_rate=0.0,
            avg_win=0.0,
            avg_loss=0.0,
            profit_factor=0.0,
            max_drawdown=0.0,
            max_drawdown_percent=0.0,
            max_consecutive_losses=0,
            max_consecutive_wins=0,
            sharpe_ratio=0.0,
            sortino_ratio=0.0,
            calmar_ratio=0.0,
            expectancy=0.0,
            peak_bankroll=initial_bankroll,
            lowest_bankroll=initial_bankroll,
        )

    # Extract data
    profits = [h["profit"] for h in history]
    bankrolls = [h["bankroll"] for h in history]
    bet_amounts = [h["bet_amount"] for h in history]
    wins = [h["won"] for h in history]

    # Basic counts
    rounds_bet = len(history)
    rounds_won = sum(wins)
    rounds_lost = rounds_bet - rounds_won
    rounds_skipped = total_rounds - rounds_bet

    # Financial metrics
    final_bankroll = bankrolls[-1] if bankrolls else initial_bankroll
    total_profit = final_bankroll - initial_bankroll
    total_wagered = sum(bet_amounts)
    roi_percent = (total_profit / initial_bankroll) * 100 if initial_bankroll > 0 else 0

    # Win/Loss metrics
    win_rate = rounds_won / rounds_bet if rounds_bet > 0 else 0
    winning_trades = [p for p in profits if p > 0]
    losing_trades = [p for p in profits if p < 0]
    avg_win = np.mean(winning_trades) if winning_trades else 0
    avg_loss = abs(np.mean(losing_trades)) if losing_trades else 0

    gross_profit = sum(winning_trades)
    gross_loss = abs(sum(losing_trades))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf') if gross_profit > 0 else 0

    # Drawdown calculation
    equity_curve = [initial_bankroll] + bankrolls
    peak = equity_curve[0]
    max_dd = 0
    max_dd_pct = 0

    for equity in equity_curve:
        if equity > peak:
            peak = equity
        dd = peak - equity
        dd_pct = dd / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd
            max_dd_pct = dd_pct

    # Consecutive wins/losses
    max_consec_wins = 0
    max_consec_losses = 0
    current_wins = 0
    current_losses = 0

    for won in wins:
        if won:
            current_wins += 1
            current_losses = 0
            max_consec_wins = max(max_consec_wins, current_wins)
        else:
            current_losses += 1
            current_wins = 0
            max_consec_losses = max(max_consec_losses, current_losses)

    # Risk-adjusted returns
    returns = np.array(profits) / np.array(bet_amounts) if bet_amounts else np.array([])

    if len(returns) > 1:
        std_returns = np.std(returns)
        mean_return = np.mean(returns)
        sharpe = (mean_return / std_returns) * np.sqrt(252) if std_returns > 0 else 0

        # Sortino (downside deviation)
        negative_returns = returns[returns < 0]
        if len(negative_returns) > 0:
            downside_std = np.std(negative_returns)
            sortino = (mean_return / downside_std) * np.sqrt(252) if downside_std > 0 else 0
        else:
            sortino = float('inf') if mean_return > 0 else 0
    else:
        sharpe = 0
        sortino = 0

    # Calmar ratio
    annual_return = roi_percent / 100  # Simplified
    calmar = annual_return / max_dd_pct if max_dd_pct > 0 else 0

    # Expectancy
    expectancy = (win_rate * avg_win) - ((1 - win_rate) * avg_loss)

    return PerformanceMetrics(
        total_rounds=total_rounds,
        rounds_bet=rounds_bet,
        rounds_won=rounds_won,
        rounds_lost=rounds_lost,
        rounds_skipped=rounds_skipped,
        initial_bankroll=initial_bankroll,
        final_bankroll=final_bankroll,
        total_profit=total_profit,
        total_wagered=total_wagered,
        roi_percent=roi_percent,
        win_rate=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
        profit_factor=profit_factor,
        max_drawdown=max_dd,
        max_drawdown_percent=max_dd_pct * 100,
        max_consecutive_losses=max_consec_losses,
        max_consecutive_wins=max_consec_wins,
        sharpe_ratio=sharpe,
        sortino_ratio=sortino,
        calmar_ratio=calmar,
        expectancy=expectancy,
        peak_bankroll=max(equity_curve),
        lowest_bankroll=min(equity_curve),
    )


def print_metrics(metrics: PerformanceMetrics, strategy_name: str = "Strategy"):
    """Print formatted metrics report."""

    print(f"\n{'='*60}")
    print(f"  {strategy_name} - Performance Report")
    print(f"{'='*60}")

    print(f"\n📊 OVERVIEW")
    print(f"  Total Rounds:     {metrics.total_rounds:,}")
    print(f"  Rounds Bet:       {metrics.rounds_bet:,} ({metrics.rounds_bet/metrics.total_rounds*100:.1f}%)")
    print(f"  Rounds Skipped:   {metrics.rounds_skipped:,}")

    print(f"\n💰 FINANCIAL")
    print(f"  Initial:          ${metrics.initial_bankroll:,.2f}")
    print(f"  Final:            ${metrics.final_bankroll:,.2f}")
    print(f"  Profit/Loss:      ${metrics.total_profit:+,.2f}")
    print(f"  ROI:              {metrics.roi_percent:+.2f}%")
    print(f"  Total Wagered:    ${metrics.total_wagered:,.2f}")

    print(f"\n🎯 WIN/LOSS")
    print(f"  Won:              {metrics.rounds_won:,}")
    print(f"  Lost:             {metrics.rounds_lost:,}")
    print(f"  Win Rate:         {metrics.win_rate*100:.1f}%")
    print(f"  Avg Win:          ${metrics.avg_win:,.2f}")
    print(f"  Avg Loss:         ${metrics.avg_loss:,.2f}")
    print(f"  Profit Factor:    {metrics.profit_factor:.2f}")

    print(f"\n📉 RISK")
    print(f"  Max Drawdown:     ${metrics.max_drawdown:,.2f} ({metrics.max_drawdown_percent:.1f}%)")
    print(f"  Max Consec Loss:  {metrics.max_consecutive_losses}")
    print(f"  Max Consec Win:   {metrics.max_consecutive_wins}")
    print(f"  Peak Bankroll:    ${metrics.peak_bankroll:,.2f}")
    print(f"  Lowest Bankroll:  ${metrics.lowest_bankroll:,.2f}")

    print(f"\n📈 RISK-ADJUSTED")
    print(f"  Sharpe Ratio:     {metrics.sharpe_ratio:.2f}")
    print(f"  Sortino Ratio:    {metrics.sortino_ratio:.2f}")
    print(f"  Calmar Ratio:     {metrics.calmar_ratio:.2f}")
    print(f"  Expectancy:       ${metrics.expectancy:,.2f}")

    print(f"{'='*60}\n")


def compare_strategies(results: Dict[str, PerformanceMetrics]) -> None:
    """Print a comparison table of multiple strategies."""

    if not results:
        print("No results to compare")
        return

    print(f"\n{'='*100}")
    print(f"  STRATEGY COMPARISON")
    print(f"{'='*100}")

    # Header
    headers = ["Strategy", "ROI%", "Win Rate", "Profit Factor", "Max DD%", "Sharpe", "Final $"]
    header_fmt = "{:<25} {:>10} {:>10} {:>14} {:>10} {:>10} {:>12}"
    print(header_fmt.format(*headers))
    print("-" * 100)

    # Sort by ROI
    sorted_results = sorted(results.items(), key=lambda x: x[1].roi_percent, reverse=True)

    for name, m in sorted_results:
        row = [
            name[:24],
            f"{m.roi_percent:+.1f}%",
            f"{m.win_rate*100:.1f}%",
            f"{m.profit_factor:.2f}",
            f"{m.max_drawdown_percent:.1f}%",
            f"{m.sharpe_ratio:.2f}",
            f"${m.final_bankroll:,.0f}",
        ]
        print(header_fmt.format(*row))

    print(f"{'='*100}\n")

    # Winner analysis
    best_roi = max(results.items(), key=lambda x: x[1].roi_percent)
    best_sharpe = max(results.items(), key=lambda x: x[1].sharpe_ratio)
    best_winrate = max(results.items(), key=lambda x: x[1].win_rate)
    lowest_dd = min(results.items(), key=lambda x: x[1].max_drawdown_percent)

    print("🏆 BEST PERFORMERS:")
    print(f"  Best ROI:        {best_roi[0]} ({best_roi[1].roi_percent:+.1f}%)")
    print(f"  Best Sharpe:     {best_sharpe[0]} ({best_sharpe[1].sharpe_ratio:.2f})")
    print(f"  Best Win Rate:   {best_winrate[0]} ({best_winrate[1].win_rate*100:.1f}%)")
    print(f"  Lowest Drawdown: {lowest_dd[0]} ({lowest_dd[1].max_drawdown_percent:.1f}%)")
    print()


def export_metrics_csv(
    results: Dict[str, PerformanceMetrics],
    filepath: str
) -> None:
    """Export metrics to CSV file."""

    import csv

    fieldnames = [
        "strategy", "total_rounds", "rounds_bet", "rounds_won", "rounds_lost",
        "initial_bankroll", "final_bankroll", "total_profit", "roi_percent",
        "win_rate", "avg_win", "avg_loss", "profit_factor",
        "max_drawdown", "max_drawdown_percent", "max_consecutive_losses",
        "sharpe_ratio", "sortino_ratio", "expectancy"
    ]

    with open(filepath, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for name, m in results.items():
            writer.writerow({
                "strategy": name,
                "total_rounds": m.total_rounds,
                "rounds_bet": m.rounds_bet,
                "rounds_won": m.rounds_won,
                "rounds_lost": m.rounds_lost,
                "initial_bankroll": m.initial_bankroll,
                "final_bankroll": m.final_bankroll,
                "total_profit": m.total_profit,
                "roi_percent": m.roi_percent,
                "win_rate": m.win_rate,
                "avg_win": m.avg_win,
                "avg_loss": m.avg_loss,
                "profit_factor": m.profit_factor,
                "max_drawdown": m.max_drawdown,
                "max_drawdown_percent": m.max_drawdown_percent,
                "max_consecutive_losses": m.max_consecutive_losses,
                "sharpe_ratio": m.sharpe_ratio,
                "sortino_ratio": m.sortino_ratio,
                "expectancy": m.expectancy,
            })

    print(f"Metrics exported to {filepath}")
