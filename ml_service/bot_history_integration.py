"""
Bot History Integration for ML Training.

This module reads bot betting history from the SQLite database and uses it to:
1. Create additional training labels (what targets worked, what didn't)
2. Analyze patterns in successful vs unsuccessful bets
3. Generate features based on bot performance
4. Provide insights for strategy optimization

Usage:
    # As a module in training.py:
    from bot_history_integration import BotHistoryAnalyzer, get_bot_performance_features

    # Or standalone:
    python bot_history_integration.py
"""

import sqlite3
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from collections import defaultdict

import numpy as np
import pandas as pd

from config import DATABASE_PATH, MODELS_DIR

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class BotHistoryAnalyzer:
    """Analyzes bot betting history from the database."""

    def __init__(self, db_path: Path = DATABASE_PATH):
        """
        Initialize with database path.

        Args:
            db_path: Path to SQLite database
        """
        self.db_path = db_path
        self.conn = None
        self.bets_df = None
        self.sessions_df = None

    def connect(self) -> bool:
        """Connect to the database."""
        try:
            self.conn = sqlite3.connect(self.db_path)
            logger.info(f"Connected to database: {self.db_path}")
            return True
        except Exception as e:
            logger.error(f"Error connecting to database: {e}")
            return False

    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            self.conn = None

    def load_bot_history(self) -> bool:
        """Load bot betting history from database."""
        if not self.conn:
            if not self.connect():
                return False

        try:
            # Check if bot_bets table exists
            cursor = self.conn.cursor()
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='bot_bets'"
            )
            if not cursor.fetchone():
                logger.warning("bot_bets table does not exist yet")
                return False

            # Load bets with round data
            self.bets_df = pd.read_sql_query("""
                SELECT
                    bb.*,
                    r.betCount as round_bet_count,
                    r.totalBet as round_total_bet,
                    r.totalWin as round_total_win
                FROM bot_bets bb
                LEFT JOIN rounds r ON bb.round_id = r.id
                ORDER BY bb.timestamp ASC
            """, self.conn)

            # Load sessions
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='bot_sessions'"
            )
            if cursor.fetchone():
                self.sessions_df = pd.read_sql_query(
                    "SELECT * FROM bot_sessions ORDER BY start_time DESC",
                    self.conn
                )
            else:
                self.sessions_df = pd.DataFrame()

            logger.info(f"Loaded {len(self.bets_df)} bets from database")
            logger.info(f"Loaded {len(self.sessions_df)} sessions from database")

            return len(self.bets_df) > 0

        except Exception as e:
            logger.error(f"Error loading bot history: {e}")
            return False

    def analyze_target_performance(self) -> Dict:
        """
        Analyze which target multipliers performed well.

        Returns:
            Dict with performance metrics per target
        """
        if self.bets_df is None or self.bets_df.empty:
            return {}

        target_stats = defaultdict(lambda: {
            'count': 0,
            'wins': 0,
            'losses': 0,
            'partial_wins': 0,
            'total_profit': 0,
            'avg_profit': 0,
        })

        for _, row in self.bets_df.iterrows():
            cashout2 = row.get('cashout2', 2)
            won1 = row.get('won1', 0) == 1
            won2 = row.get('won2', 0) == 1
            profit = row.get('profit', 0)

            target_category = self._categorize_target(cashout2)

            target_stats[target_category]['count'] += 1
            target_stats[target_category]['total_profit'] += profit

            if won1 and won2:
                target_stats[target_category]['wins'] += 1
            elif won1:
                target_stats[target_category]['partial_wins'] += 1
            else:
                target_stats[target_category]['losses'] += 1

        # Calculate averages and rates
        for target, stats in target_stats.items():
            if stats['count'] > 0:
                stats['avg_profit'] = stats['total_profit'] / stats['count']
                stats['win_rate'] = stats['wins'] / stats['count'] * 100
                stats['partial_rate'] = stats['partial_wins'] / stats['count'] * 100
                stats['success_rate'] = (stats['wins'] + stats['partial_wins']) / stats['count'] * 100

        return dict(target_stats)

    def _categorize_target(self, cashout: float) -> str:
        """Categorize cashout value into target bucket."""
        if cashout <= 2.5:
            return "2x"
        elif cashout <= 3.5:
            return "3x"
        elif cashout <= 5.5:
            return "5x"
        elif cashout <= 7.5:
            return "7x"
        elif cashout <= 8.5:
            return "8x"
        elif cashout <= 10.5:
            return "10x"
        elif cashout <= 12.5:
            return "12x"
        elif cashout <= 15.5:
            return "15x"
        else:
            return "20x+"

    def get_optimal_thresholds(self) -> Dict[str, float]:
        """
        Calculate optimal probability thresholds based on actual performance.

        Returns:
            Dict with recommended thresholds for each target
        """
        target_perf = self.analyze_target_performance()
        thresholds = {}

        # Base thresholds - will be adjusted based on performance
        base_thresholds = {
            '2x': 0.55,
            '3x': 0.45,
            '5x': 0.38,
            '7x': 0.33,
            '8x': 0.31,
            '10x': 0.28,
            '12x': 0.25,
            '15x': 0.22,
            '20x+': 0.18,
        }

        for target, stats in target_perf.items():
            if stats['count'] < 10:
                # Not enough data, use default
                thresholds[target] = base_thresholds.get(target, 0.30)
                continue

            # Adjust threshold based on success rate
            success_rate = stats['success_rate'] / 100

            # If success rate is low, increase threshold (be more selective)
            # If success rate is high, threshold can be lower (be more aggressive)
            if success_rate < 0.40:
                # Poor performance - require higher probability
                adjustment = 0.10
            elif success_rate < 0.55:
                # Below average - slight increase
                adjustment = 0.05
            elif success_rate > 0.70:
                # Good performance - can be more aggressive
                adjustment = -0.05
            else:
                adjustment = 0

            base = base_thresholds.get(target, 0.30)
            thresholds[target] = min(0.70, max(0.15, base + adjustment))

        return thresholds

    def get_bot_context_features(self, window: int = 20) -> pd.DataFrame:
        """
        Generate features based on bot performance context.

        These features can be used to help ML understand when the bot
        is in a winning/losing streak, drawdown, etc.

        Args:
            window: Rolling window size for calculations

        Returns:
            DataFrame with bot context features per round
        """
        if self.bets_df is None or self.bets_df.empty:
            return pd.DataFrame()

        df = self.bets_df.copy()

        # Calculate rolling metrics
        df['rolling_profit'] = df['profit'].rolling(window=window, min_periods=1).sum()
        df['rolling_win_rate'] = df['won1'].rolling(window=window, min_periods=1).mean()
        df['rolling_full_win_rate'] = df['won2'].rolling(window=window, min_periods=1).mean()

        # Calculate drawdown
        df['cumulative_profit'] = df['profit'].cumsum()
        df['peak_profit'] = df['cumulative_profit'].cummax()
        df['drawdown'] = df['peak_profit'] - df['cumulative_profit']
        df['drawdown_pct'] = df['drawdown'] / (df['peak_profit'].abs() + 1) * 100

        # Calculate streaks
        df['is_loss'] = (df['won1'] == 0).astype(int)
        df['is_win'] = (df['won2'] == 1).astype(int)

        # Loss streak
        loss_groups = (df['is_loss'] != df['is_loss'].shift()).cumsum()
        df['loss_streak'] = df.groupby(loss_groups)['is_loss'].cumsum() * df['is_loss']

        # Win streak
        win_groups = (df['is_win'] != df['is_win'].shift()).cumsum()
        df['win_streak'] = df.groupby(win_groups)['is_win'].cumsum() * df['is_win']

        # Target success indicators
        for target in ['5x', '7x', '8x', '10x']:
            threshold = float(target.replace('x', ''))
            target_col = f'target_{target}_attempted'
            success_col = f'target_{target}_success'

            df[target_col] = (df['cashout2'] >= threshold - 0.5) & (df['cashout2'] <= threshold + 0.5)
            df[success_col] = df[target_col] & (df['won2'] == 1)

            # Rolling success rate for this target
            df[f'rolling_{target}_success'] = (
                df[success_col].rolling(window=window, min_periods=1).mean()
            )

        # Select relevant features
        feature_cols = [
            'round_id',
            'rolling_profit',
            'rolling_win_rate',
            'rolling_full_win_rate',
            'drawdown_pct',
            'loss_streak',
            'win_streak',
        ] + [f'rolling_{t}_success' for t in ['5x', '7x', '8x', '10x']]

        return df[feature_cols].copy()

    def generate_report(self) -> str:
        """Generate a text report of the analysis."""
        if self.bets_df is None or self.bets_df.empty:
            return "No bot betting data available in database."

        total_bets = len(self.bets_df)
        wins = (self.bets_df['won2'] == 1).sum()
        partials = ((self.bets_df['won1'] == 1) & (self.bets_df['won2'] == 0)).sum()
        losses = (self.bets_df['won1'] == 0).sum()
        total_profit = self.bets_df['profit'].sum()
        avg_profit = self.bets_df['profit'].mean()

        lines = [
            "=" * 60,
            "BOT HISTORY ANALYSIS REPORT (FROM DATABASE)",
            "=" * 60,
            f"Total bets: {total_bets}",
            f"Wins (both): {wins} ({wins/total_bets*100:.1f}%)",
            f"Partials: {partials} ({partials/total_bets*100:.1f}%)",
            f"Losses: {losses} ({losses/total_bets*100:.1f}%)",
            f"Total profit: R${total_profit:.2f}",
            f"Avg profit/bet: R${avg_profit:.4f}",
            "",
            "TARGET PERFORMANCE:",
            "-" * 40,
        ]

        target_perf = self.analyze_target_performance()
        for target in ['2x', '3x', '5x', '7x', '8x', '10x', '12x', '15x', '20x+']:
            if target in target_perf:
                stats = target_perf[target]
                lines.append(
                    f"  {target}: {stats['count']} bets, "
                    f"{stats.get('success_rate', 0):.1f}% success, "
                    f"R${stats['avg_profit']:.4f} avg"
                )

        lines.extend([
            "",
            "RECOMMENDED THRESHOLDS:",
            "-" * 40,
        ])

        thresholds = self.get_optimal_thresholds()
        for target, threshold in sorted(thresholds.items()):
            lines.append(f"  {target}: {threshold:.2f}")

        return "\n".join(lines)


def get_bot_performance_features(db_path: Path = DATABASE_PATH) -> Optional[pd.DataFrame]:
    """
    Get bot performance features for use in ML training.

    This is the main function to call from training.py.

    Args:
        db_path: Path to SQLite database

    Returns:
        DataFrame with bot context features, or None if no data
    """
    analyzer = BotHistoryAnalyzer(db_path)

    if not analyzer.load_bot_history():
        logger.info("No bot history available for training")
        return None

    features = analyzer.get_bot_context_features()
    analyzer.close()

    if features.empty:
        return None

    logger.info(f"Generated {len(features)} bot performance feature rows")
    return features


def get_optimal_thresholds_from_history(db_path: Path = DATABASE_PATH) -> Dict[str, float]:
    """
    Get optimal probability thresholds based on bot history.

    Args:
        db_path: Path to SQLite database

    Returns:
        Dict with recommended thresholds
    """
    analyzer = BotHistoryAnalyzer(db_path)

    if not analyzer.load_bot_history():
        return {}

    thresholds = analyzer.get_optimal_thresholds()
    analyzer.close()

    return thresholds


def main():
    """Main entry point for standalone execution."""
    analyzer = BotHistoryAnalyzer()

    if not analyzer.load_bot_history():
        print("No bot betting history found in database.")
        print("The bot needs to place some bets first to generate training data.")
        return

    # Print report
    print(analyzer.generate_report())

    # Save analysis
    import json

    output_dir = Path(MODELS_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Save target performance
    target_perf = analyzer.analyze_target_performance()
    with open(output_dir / "bot_target_performance.json", 'w') as f:
        json.dump(target_perf, f, indent=2)

    # Save recommended thresholds
    thresholds = analyzer.get_optimal_thresholds()
    with open(output_dir / "bot_recommended_thresholds.json", 'w') as f:
        json.dump(thresholds, f, indent=2)

    # Save context features as CSV
    features = analyzer.get_bot_context_features()
    if not features.empty:
        features.to_csv(output_dir / "bot_context_features.csv", index=False)

    print(f"\nAnalysis saved to {output_dir}")

    analyzer.close()


if __name__ == "__main__":
    main()
