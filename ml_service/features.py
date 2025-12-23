"""
Feature Engineering Module for Crash Game ML.

This module is responsible for transforming raw round data into features
suitable for machine learning models.

IMPORTANT: All features are computed using ONLY past data relative to
the prediction target. This ensures no data leakage.

Feature Categories:
1. Raw features (from current round context, but only using past data)
2. Time-based features (hour, day, minute)
3. Rolling window statistics (mean, std, min, max, median)
4. Event counting features (count of multipliers above thresholds)
5. Distance features (rounds since last event)
6. Streak features (early crash rate in recent windows)
7. Sequence features (last N multipliers as individual features)
"""

import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import logging

from config import (
    WINDOW_SIZES,
    SEQUENCE_LENGTH,
    MULTIPLIER_THRESHOLDS,
    EARLY_CRASH_THRESHOLD,
    HIGH_LOSS_STREAK_WINDOW,
    HIGH_LOSS_STREAK_THRESHOLD_FACTOR,
)

logger = logging.getLogger(__name__)


class FeatureEngineer:
    """
    Transforms raw crash game data into ML features.

    All transformations are designed to avoid data leakage by only using
    information available before the target round.
    """

    def __init__(self):
        """Initialize the feature engineer."""
        self.feature_names: List[str] = []
        self._build_feature_names()

    def _build_feature_names(self) -> None:
        """Build the list of feature names for reference."""
        names = []

        # Time features
        names.extend(["hour_of_day", "day_of_week", "minute_of_day"])

        # Cyclical time features (sin/cos encoding)
        names.extend([
            "hour_sin", "hour_cos",
            "day_sin", "day_cos",
            "minute_sin", "minute_cos"
        ])

        # Rolling statistics for each window size
        for window in WINDOW_SIZES:
            names.extend([
                f"multiplier_mean_{window}",
                f"multiplier_std_{window}",
                f"multiplier_min_{window}",
                f"multiplier_max_{window}",
                f"multiplier_median_{window}",
                f"bet_count_mean_{window}",
                f"total_bet_mean_{window}",
                f"total_win_mean_{window}",
                f"house_profit_mean_{window}",
            ])

        # Event counts for each threshold and window
        for threshold in MULTIPLIER_THRESHOLDS:
            for window in [50, 100]:
                names.append(f"count_gt_{threshold}x_last_{window}")

        # Distance since last event
        for threshold in [2.0, 5.0, 10.0]:
            names.append(f"rounds_since_gt_{threshold}x")

        # Early crash rate in windows
        for window in [20, 50]:
            names.append(f"early_crash_rate_{window}")

        # Sequence features (last N multipliers)
        for i in range(1, SEQUENCE_LENGTH + 1):
            names.append(f"multiplier_lag_{i}")

        # Derived features
        names.extend([
            "multiplier_trend_20",  # Linear trend of last 20 multipliers
            "volatility_ratio",     # Recent volatility vs historical
            "hot_streak_indicator", # Recent performance vs average
        ])

        self.feature_names = names

    def extract_time_features(self, timestamp: datetime) -> Dict[str, float]:
        """
        Extract time-based features from timestamp.

        Uses cyclical encoding (sin/cos) to preserve the circular nature
        of time (e.g., hour 23 is close to hour 0).

        Args:
            timestamp: The datetime of the round

        Returns:
            Dictionary of time features
        """
        hour = timestamp.hour
        day = timestamp.weekday()  # 0=Monday, 6=Sunday
        minute = timestamp.hour * 60 + timestamp.minute

        features = {
            "hour_of_day": hour,
            "day_of_week": day,
            "minute_of_day": minute,
            # Cyclical encoding
            "hour_sin": np.sin(2 * np.pi * hour / 24),
            "hour_cos": np.cos(2 * np.pi * hour / 24),
            "day_sin": np.sin(2 * np.pi * day / 7),
            "day_cos": np.cos(2 * np.pi * day / 7),
            "minute_sin": np.sin(2 * np.pi * minute / 1440),
            "minute_cos": np.cos(2 * np.pi * minute / 1440),
        }

        return features

    def compute_rolling_stats(
        self,
        multipliers: np.ndarray,
        bet_counts: np.ndarray,
        total_bets: np.ndarray,
        total_wins: np.ndarray,
        window: int
    ) -> Dict[str, float]:
        """
        Compute rolling window statistics.

        Uses the last 'window' values (excluding current) to compute stats.

        Args:
            multipliers: Array of multiplier values
            bet_counts: Array of player counts
            total_bets: Array of total bet amounts
            total_wins: Array of total win amounts
            window: Window size for rolling stats

        Returns:
            Dictionary of rolling statistics
        """
        # Ensure we have enough data
        if len(multipliers) < window:
            # Pad with NaN and use available data
            actual_window = len(multipliers)
        else:
            actual_window = window

        mult = multipliers[-actual_window:]
        bets = bet_counts[-actual_window:]
        tbets = total_bets[-actual_window:]
        twins = total_wins[-actual_window:]
        house_profit = tbets - twins

        features = {
            f"multiplier_mean_{window}": np.mean(mult) if len(mult) > 0 else 0,
            f"multiplier_std_{window}": np.std(mult) if len(mult) > 1 else 0,
            f"multiplier_min_{window}": np.min(mult) if len(mult) > 0 else 0,
            f"multiplier_max_{window}": np.max(mult) if len(mult) > 0 else 0,
            f"multiplier_median_{window}": np.median(mult) if len(mult) > 0 else 0,
            f"bet_count_mean_{window}": np.mean(bets) if len(bets) > 0 else 0,
            f"total_bet_mean_{window}": np.mean(tbets) if len(tbets) > 0 else 0,
            f"total_win_mean_{window}": np.mean(twins) if len(twins) > 0 else 0,
            f"house_profit_mean_{window}": np.mean(house_profit) if len(house_profit) > 0 else 0,
        }

        return features

    def count_events_above_threshold(
        self,
        multipliers: np.ndarray,
        threshold: float,
        window: int
    ) -> int:
        """
        Count how many multipliers exceeded a threshold in a window.

        Args:
            multipliers: Array of multiplier values
            threshold: Threshold to compare against
            window: Number of recent rounds to consider

        Returns:
            Count of multipliers > threshold
        """
        if len(multipliers) < window:
            data = multipliers
        else:
            data = multipliers[-window:]

        return int(np.sum(data > threshold))

    def rounds_since_event(
        self,
        multipliers: np.ndarray,
        threshold: float,
        max_lookback: int = 200
    ) -> int:
        """
        Count rounds since last multiplier exceeded threshold.

        Args:
            multipliers: Array of multiplier values (chronological order)
            threshold: Threshold to check
            max_lookback: Maximum rounds to look back

        Returns:
            Number of rounds since last occurrence (capped at max_lookback)
        """
        lookback = min(len(multipliers), max_lookback)

        for i in range(lookback):
            idx = len(multipliers) - 1 - i
            if multipliers[idx] > threshold:
                return i

        return lookback

    def compute_early_crash_rate(
        self,
        multipliers: np.ndarray,
        window: int
    ) -> float:
        """
        Compute the rate of early crashes in a window.

        An early crash is defined as multiplier <= EARLY_CRASH_THRESHOLD.

        Args:
            multipliers: Array of multiplier values
            window: Window size

        Returns:
            Proportion of early crashes (0 to 1)
        """
        if len(multipliers) < window:
            data = multipliers
        else:
            data = multipliers[-window:]

        if len(data) == 0:
            return 0.0

        early_crashes = np.sum(data <= EARLY_CRASH_THRESHOLD)
        return early_crashes / len(data)

    def compute_multiplier_trend(
        self,
        multipliers: np.ndarray,
        window: int = 20
    ) -> float:
        """
        Compute linear trend of multipliers over a window.

        Positive trend indicates increasing multipliers.
        Negative trend indicates decreasing multipliers.

        Args:
            multipliers: Array of multiplier values
            window: Window size for trend computation

        Returns:
            Slope of the linear trend (normalized)
        """
        if len(multipliers) < 2:
            return 0.0

        if len(multipliers) < window:
            data = multipliers
        else:
            data = multipliers[-window:]

        x = np.arange(len(data))

        # Simple linear regression slope
        if len(data) < 2:
            return 0.0

        x_mean = np.mean(x)
        y_mean = np.mean(data)

        numerator = np.sum((x - x_mean) * (data - y_mean))
        denominator = np.sum((x - x_mean) ** 2)

        if denominator == 0:
            return 0.0

        slope = numerator / denominator

        # Normalize by mean multiplier
        return slope / (y_mean + 1e-6)

    def compute_sequence_features(
        self,
        multipliers: np.ndarray,
        length: int = SEQUENCE_LENGTH
    ) -> Dict[str, float]:
        """
        Extract the last N multipliers as individual features.

        Args:
            multipliers: Array of multiplier values
            length: Number of lags to extract

        Returns:
            Dictionary with lag features
        """
        features = {}

        for i in range(1, length + 1):
            idx = len(multipliers) - i
            if idx >= 0:
                features[f"multiplier_lag_{i}"] = multipliers[idx]
            else:
                features[f"multiplier_lag_{i}"] = 0.0  # Padding for missing data

        return features

    def compute_volatility_ratio(
        self,
        multipliers: np.ndarray,
        recent_window: int = 20,
        historical_window: int = 100
    ) -> float:
        """
        Compute ratio of recent volatility to historical volatility.

        Values > 1 indicate higher recent volatility.
        Values < 1 indicate lower recent volatility.

        Args:
            multipliers: Array of multiplier values
            recent_window: Window for recent volatility
            historical_window: Window for historical volatility

        Returns:
            Volatility ratio
        """
        if len(multipliers) < recent_window:
            return 1.0

        recent_std = np.std(multipliers[-recent_window:])

        if len(multipliers) < historical_window:
            historical_std = np.std(multipliers)
        else:
            historical_std = np.std(multipliers[-historical_window:])

        if historical_std < 1e-6:
            return 1.0

        return recent_std / historical_std

    def compute_hot_streak_indicator(
        self,
        multipliers: np.ndarray,
        recent_window: int = 20,
        historical_window: int = 100
    ) -> float:
        """
        Compute indicator of whether recent performance is above average.

        Values > 0 indicate recent multipliers are above historical average.
        Values < 0 indicate recent multipliers are below historical average.

        Args:
            multipliers: Array of multiplier values
            recent_window: Window for recent average
            historical_window: Window for historical average

        Returns:
            Normalized difference from historical average
        """
        if len(multipliers) < recent_window:
            return 0.0

        recent_mean = np.mean(multipliers[-recent_window:])

        if len(multipliers) < historical_window:
            historical_mean = np.mean(multipliers)
        else:
            historical_mean = np.mean(multipliers[-historical_window:])

        if historical_mean < 1e-6:
            return 0.0

        return (recent_mean - historical_mean) / historical_mean

    def extract_features_for_round(
        self,
        round_idx: int,
        df: pd.DataFrame
    ) -> Optional[Dict[str, float]]:
        """
        Extract all features for predicting a specific round.

        IMPORTANT: Uses only data from rounds BEFORE round_idx.
        This ensures no data leakage.

        Args:
            round_idx: Index of the round to predict (in the dataframe)
            df: DataFrame with all rounds (sorted by time ascending)

        Returns:
            Dictionary of features, or None if insufficient data
        """
        # Get all data BEFORE this round (strictly temporal)
        if round_idx < 1:
            return None

        history = df.iloc[:round_idx]

        if len(history) < 10:  # Minimum data requirement
            return None

        # Extract arrays for efficiency
        multipliers = history["multiplier"].values
        bet_counts = history["betCount"].values
        total_bets = history["totalBet"].values
        total_wins = history["totalWin"].values

        # Get timestamp for time features
        current_row = df.iloc[round_idx]
        try:
            timestamp = pd.to_datetime(current_row["createdAt"])
        except:
            timestamp = datetime.now()

        features = {}

        # 1. Time features
        features.update(self.extract_time_features(timestamp))

        # 2. Rolling statistics for each window size
        for window in WINDOW_SIZES:
            features.update(self.compute_rolling_stats(
                multipliers, bet_counts, total_bets, total_wins, window
            ))

        # 3. Event counts
        for threshold in MULTIPLIER_THRESHOLDS:
            for window in [50, 100]:
                key = f"count_gt_{threshold}x_last_{window}"
                features[key] = self.count_events_above_threshold(
                    multipliers, threshold, window
                )

        # 4. Distance since last event
        for threshold in [2.0, 5.0, 10.0]:
            key = f"rounds_since_gt_{threshold}x"
            features[key] = self.rounds_since_event(multipliers, threshold)

        # 5. Early crash rate
        for window in [20, 50]:
            key = f"early_crash_rate_{window}"
            features[key] = self.compute_early_crash_rate(multipliers, window)

        # 6. Sequence features (last N multipliers)
        features.update(self.compute_sequence_features(multipliers))

        # 7. Derived features
        features["multiplier_trend_20"] = self.compute_multiplier_trend(multipliers, 20)
        features["volatility_ratio"] = self.compute_volatility_ratio(multipliers)
        features["hot_streak_indicator"] = self.compute_hot_streak_indicator(multipliers)

        return features

    def extract_features_batch(
        self,
        df: pd.DataFrame,
        start_idx: int = None
    ) -> Tuple[np.ndarray, List[int]]:
        """
        Extract features for multiple rounds efficiently.

        Args:
            df: DataFrame with rounds (sorted by time ascending)
            start_idx: Starting index (default: minimum required history)

        Returns:
            Tuple of (feature matrix, list of round indices)
        """
        if start_idx is None:
            start_idx = max(WINDOW_SIZES) + SEQUENCE_LENGTH

        features_list = []
        valid_indices = []

        for idx in range(start_idx, len(df)):
            features = self.extract_features_for_round(idx, df)
            if features is not None:
                features_list.append(features)
                valid_indices.append(idx)

        if len(features_list) == 0:
            return np.array([]), []

        # Convert to DataFrame then to numpy for consistent ordering
        features_df = pd.DataFrame(features_list)

        # Ensure consistent column order
        for col in self.feature_names:
            if col not in features_df.columns:
                features_df[col] = 0.0

        features_df = features_df[self.feature_names]

        return features_df.values, valid_indices

    def get_feature_names(self) -> List[str]:
        """Return the list of feature names in order."""
        return self.feature_names.copy()


class LabelGenerator:
    """
    Generates binary labels for training the models.

    All labels are computed from the ACTUAL multiplier of each round,
    not from predictions. The features used to predict these labels
    are computed using only past data.
    """

    @staticmethod
    def generate_threshold_labels(
        multipliers: np.ndarray,
        threshold: float
    ) -> np.ndarray:
        """
        Generate binary labels for multiplier > threshold.

        Args:
            multipliers: Array of actual multiplier values
            threshold: Threshold for binary classification

        Returns:
            Binary array (1 if multiplier > threshold, else 0)
        """
        return (multipliers > threshold).astype(int)

    @staticmethod
    def generate_early_crash_labels(
        multipliers: np.ndarray,
        threshold: float = EARLY_CRASH_THRESHOLD
    ) -> np.ndarray:
        """
        Generate labels for early crash detection.

        Args:
            multipliers: Array of actual multiplier values
            threshold: Early crash threshold (default from config)

        Returns:
            Binary array (1 if multiplier <= threshold, else 0)
        """
        return (multipliers <= threshold).astype(int)

    @staticmethod
    def generate_high_loss_streak_labels(
        df: pd.DataFrame,
        window: int = HIGH_LOSS_STREAK_WINDOW,
        threshold_factor: float = HIGH_LOSS_STREAK_THRESHOLD_FACTOR
    ) -> np.ndarray:
        """
        Generate labels for high loss streak detection.

        A round is labeled as "high loss streak" if the proportion of
        rounds below 2x in the previous 'window' rounds exceeds the
        historical average by 'threshold_factor'.

        Formula:
        - Compute historical average of rounds below 2x (avg_below_2x)
        - For each round, compute proportion in last 'window' rounds
        - Label = 1 if proportion > avg_below_2x * threshold_factor

        Args:
            df: DataFrame with rounds data
            window: Window for streak computation
            threshold_factor: Factor above historical average

        Returns:
            Binary array of labels
        """
        multipliers = df["multiplier"].values
        n = len(multipliers)

        # Compute historical average proportion of rounds below 2x
        # Using all data for the historical baseline
        below_2x = (multipliers < 2.0).astype(float)
        historical_avg = np.mean(below_2x)

        # Threshold for "high loss streak"
        streak_threshold = historical_avg * threshold_factor

        labels = np.zeros(n, dtype=int)

        for i in range(window, n):
            # Proportion of rounds below 2x in the window BEFORE this round
            window_proportion = np.mean(below_2x[i - window:i])

            if window_proportion > streak_threshold:
                labels[i] = 1

        return labels

    @staticmethod
    def generate_all_labels(df: pd.DataFrame) -> Dict[str, np.ndarray]:
        """
        Generate all labels for the dataset.

        Args:
            df: DataFrame with rounds data

        Returns:
            Dictionary mapping label names to arrays
        """
        multipliers = df["multiplier"].values

        labels = {
            "label_gt_1_5x": LabelGenerator.generate_threshold_labels(multipliers, 1.5),
            "label_gt_2x": LabelGenerator.generate_threshold_labels(multipliers, 2.0),
            "label_gt_3x": LabelGenerator.generate_threshold_labels(multipliers, 3.0),
            "label_gt_4x": LabelGenerator.generate_threshold_labels(multipliers, 4.0),
            "label_gt_5x": LabelGenerator.generate_threshold_labels(multipliers, 5.0),
            "label_gt_7x": LabelGenerator.generate_threshold_labels(multipliers, 7.0),
            "label_gt_10x": LabelGenerator.generate_threshold_labels(multipliers, 10.0),
            "label_early_crash": LabelGenerator.generate_early_crash_labels(multipliers),
            "label_high_loss_streak": LabelGenerator.generate_high_loss_streak_labels(df),
        }

        return labels


def create_training_dataset(df: pd.DataFrame) -> Tuple[np.ndarray, Dict[str, np.ndarray], List[int]]:
    """
    Create a complete training dataset from raw rounds data.

    This function:
    1. Sorts data by timestamp
    2. Extracts features using only past data
    3. Generates labels from actual outcomes
    4. Aligns features and labels by round index

    Args:
        df: DataFrame with columns [id, createdAt, betCount, totalBet, totalWin, multiplier]

    Returns:
        Tuple of:
        - Feature matrix (n_samples x n_features)
        - Dictionary of label arrays
        - List of valid round indices
    """
    # Ensure sorted by time
    df = df.sort_values("createdAt").reset_index(drop=True)

    # Extract features
    feature_engineer = FeatureEngineer()
    X, valid_indices = feature_engineer.extract_features_batch(df)

    if len(X) == 0:
        return np.array([]), {}, []

    # Generate labels for all rounds
    all_labels = LabelGenerator.generate_all_labels(df)

    # Subset labels to match valid indices
    labels = {}
    for name, arr in all_labels.items():
        labels[name] = arr[valid_indices]

    logger.info(f"Created dataset with {len(X)} samples and {X.shape[1]} features")
    logger.info(f"Label distribution:")
    for name, arr in labels.items():
        pos = np.sum(arr)
        logger.info(f"  {name}: {pos}/{len(arr)} positive ({100*pos/len(arr):.1f}%)")

    return X, labels, valid_indices
