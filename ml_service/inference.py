"""
Inference Service for Crash Game ML Predictions.

This service:
1. Loads trained models into memory
2. Monitors SQLite for new rounds (polling)
3. Generates predictions for each new round
4. Publishes predictions to Redis Pub/Sub

The service runs continuously until stopped.
"""

import sqlite3
import time
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, List

import numpy as np
import pandas as pd
import joblib
import redis

from config import (
    DATABASE_PATH,
    MODELS_DIR,
    MODEL_VERSION,
    MODEL_FILES,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_DB,
    REDIS_PASSWORD,
    REDIS_CHANNEL_PREDICTIONS,
    POLLING_INTERVAL,
    MIN_ROUNDS_FOR_PREDICTION,
    WINDOW_SIZES,
    SEQUENCE_LENGTH,
    MULTIPLIER_THRESHOLDS,
)
from features import FeatureEngineer

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class CrashMLInferenceService:
    """
    Real-time inference service for crash game predictions.

    This service monitors the SQLite database for new rounds and
    publishes predictions to Redis Pub/Sub.
    """

    def __init__(self, db_path: Path = DATABASE_PATH):
        """
        Initialize the inference service.

        Args:
            db_path: Path to SQLite database
        """
        self.db_path = db_path
        self.models = {}
        self.scaler = None
        self.feature_engineer = FeatureEngineer()
        self.redis_client = None
        self.last_processed_id = 0
        self._running = False

    def load_models(self) -> None:
        """Load all trained models from disk."""
        logger.info("Loading models...")

        model_keys = [
            "gt_2x", "gt_3x", "gt_4x", "gt_5x",
            "gt_7x", "gt_10x", "early_crash", "high_loss_streak"
        ]

        for key in model_keys:
            model_path = MODELS_DIR / MODEL_FILES[key]
            if model_path.exists():
                self.models[key] = joblib.load(model_path)
                logger.info(f"  Loaded model: {key}")
            else:
                logger.warning(f"  Model not found: {model_path}")

        # Load scaler
        scaler_path = MODELS_DIR / MODEL_FILES["scaler"]
        if scaler_path.exists():
            self.scaler = joblib.load(scaler_path)
            logger.info("  Loaded feature scaler")
        else:
            logger.warning("  Scaler not found, predictions may be inaccurate")

        logger.info(f"Loaded {len(self.models)} models")

    def connect_redis(self) -> None:
        """Connect to Redis server."""
        logger.info(f"Connecting to Redis at {REDIS_HOST}:{REDIS_PORT}...")

        self.redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            password=REDIS_PASSWORD,
            decode_responses=True
        )

        # Test connection
        try:
            self.redis_client.ping()
            logger.info("  Redis connection successful")
        except redis.ConnectionError as e:
            logger.error(f"  Redis connection failed: {e}")
            raise

    def get_latest_rounds(self, limit: int = 200) -> pd.DataFrame:
        """
        Get the latest rounds from SQLite.

        Args:
            limit: Maximum number of rounds to fetch

        Returns:
            DataFrame with rounds data
        """
        conn = sqlite3.connect(self.db_path)

        query = f"""
            SELECT
                id,
                createdAt,
                betCount,
                totalBet,
                totalWin,
                multiplier
            FROM rounds
            ORDER BY id DESC
            LIMIT {limit}
        """

        df = pd.read_sql_query(query, conn)
        conn.close()

        # Reverse to chronological order
        df = df.iloc[::-1].reset_index(drop=True)

        return df

    def get_new_rounds_since(self, last_id: int) -> pd.DataFrame:
        """
        Get rounds with id > last_id.

        Args:
            last_id: Last processed round ID

        Returns:
            DataFrame with new rounds
        """
        conn = sqlite3.connect(self.db_path)

        query = f"""
            SELECT
                id,
                createdAt,
                betCount,
                totalBet,
                totalWin,
                multiplier
            FROM rounds
            WHERE id > {last_id}
            ORDER BY id ASC
        """

        df = pd.read_sql_query(query, conn)
        conn.close()

        return df

    def extract_features_for_prediction(self, df: pd.DataFrame) -> Optional[np.ndarray]:
        """
        Extract features for predicting the next round.

        Uses all available history to generate features.

        Args:
            df: DataFrame with historical rounds

        Returns:
            Feature array or None if insufficient data
        """
        if len(df) < MIN_ROUNDS_FOR_PREDICTION:
            logger.warning(f"Insufficient data for prediction: {len(df)} rounds")
            return None

        # Use the last valid index (len(df) - 1) since we want to use
        # all data up to and including the last round to predict the NEXT round
        # The extract_features_for_round uses data BEFORE round_idx,
        # so we pass len(df) - 1 which will use data from indices 0 to len(df)-2
        # But we want to use ALL data, so we need a different approach

        # Extract features manually using all available data
        features = self._extract_features_for_next_round(df)

        if features is None:
            return None

        # Convert to array in correct order
        feature_names = self.feature_engineer.get_feature_names()
        feature_array = np.array([features.get(name, 0.0) for name in feature_names])

        return feature_array.reshape(1, -1)

    def _extract_features_for_next_round(self, df: pd.DataFrame) -> Optional[Dict[str, float]]:
        """
        Extract features using ALL available data to predict the next round.

        Args:
            df: DataFrame with all historical rounds

        Returns:
            Dictionary of features
        """
        if len(df) < 10:
            return None

        # Use all data as history
        multipliers = df["multiplier"].values
        bet_counts = df["betCount"].values
        total_bets = df["totalBet"].values
        total_wins = df["totalWin"].values

        # Use current time for time features (predicting the next round)
        timestamp = datetime.now()

        features = {}

        # 1. Time features
        features.update(self.feature_engineer.extract_time_features(timestamp))

        # 2. Rolling statistics for each window size
        for window in WINDOW_SIZES:
            features.update(self.feature_engineer.compute_rolling_stats(
                multipliers, bet_counts, total_bets, total_wins, window
            ))

        # 3. Event counts
        for threshold in MULTIPLIER_THRESHOLDS:
            for window in [50, 100]:
                key = f"count_gt_{threshold}x_last_{window}"
                features[key] = self.feature_engineer.count_events_above_threshold(
                    multipliers, threshold, window
                )

        # 4. Distance since last event
        for threshold in [2.0, 5.0, 10.0]:
            key = f"rounds_since_gt_{threshold}x"
            features[key] = self.feature_engineer.rounds_since_event(multipliers, threshold)

        # 5. Early crash rate
        for window in [20, 50]:
            key = f"early_crash_rate_{window}"
            features[key] = self.feature_engineer.compute_early_crash_rate(multipliers, window)

        # 6. Sequence features (last N multipliers)
        features.update(self.feature_engineer.compute_sequence_features(multipliers))

        # 7. Derived features
        features["multiplier_trend_20"] = self.feature_engineer.compute_multiplier_trend(multipliers, 20)
        features["volatility_ratio"] = self.feature_engineer.compute_volatility_ratio(multipliers)
        features["hot_streak_indicator"] = self.feature_engineer.compute_hot_streak_indicator(multipliers)

        return features

    def generate_predictions(self, features: np.ndarray) -> Dict[str, float]:
        """
        Generate predictions from all models.

        Args:
            features: Feature array (1 x n_features)

        Returns:
            Dictionary of prediction probabilities
        """
        # Scale features
        if self.scaler is not None:
            features_scaled = self.scaler.transform(features)
        else:
            features_scaled = features

        predictions = {}

        model_to_output = {
            "gt_2x": "prob_gt_2x",
            "gt_3x": "prob_gt_3x",
            "gt_4x": "prob_gt_4x",
            "gt_5x": "prob_gt_5x",
            "gt_7x": "prob_gt_7x",
            "gt_10x": "prob_gt_10x",
            "early_crash": "prob_early_crash",
            "high_loss_streak": "prob_high_loss_streak",
        }

        for model_key, output_key in model_to_output.items():
            if model_key in self.models:
                try:
                    proba = self.models[model_key].predict_proba(features_scaled)
                    predictions[output_key] = float(proba[0, 1])
                except Exception as e:
                    logger.error(f"Error predicting {model_key}: {e}")
                    predictions[output_key] = 0.5
            else:
                predictions[output_key] = 0.5  # Default to 50% if model not loaded

        return predictions

    def create_prediction_message(
        self,
        round_id: int,
        predictions: Dict[str, float],
        window_start: int,
        window_end: int
    ) -> Dict:
        """
        Create the prediction message for Redis.

        Args:
            round_id: ID of the round being predicted
            predictions: Dictionary of probabilities
            window_start: First round ID used for features
            window_end: Last round ID used for features

        Returns:
            Message dictionary
        """
        message = {
            "round_id": round_id,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "features_window_start_round": window_start,
            "features_window_end_round": window_end,
            **predictions,
            "model_version": MODEL_VERSION,
        }

        return message

    def publish_prediction(self, message: Dict) -> None:
        """
        Publish prediction to Redis channel.

        Args:
            message: Prediction message dictionary
        """
        if self.redis_client is None:
            logger.warning("Redis not connected, skipping publish")
            return

        try:
            message_json = json.dumps(message)
            subscribers = self.redis_client.publish(
                REDIS_CHANNEL_PREDICTIONS,
                message_json
            )
            logger.info(
                f"Published prediction for round {message['round_id']} "
                f"to {subscribers} subscriber(s)"
            )
        except Exception as e:
            logger.error(f"Failed to publish to Redis: {e}")

    def process_new_round(self, new_round_id: int, history_df: pd.DataFrame) -> None:
        """
        Process a new round and generate predictions.

        Args:
            new_round_id: ID of the newly completed round
            history_df: Historical data including the new round
        """
        logger.info(f"Processing new round: {new_round_id}")

        # Extract features
        features = self.extract_features_for_prediction(history_df)

        if features is None:
            logger.warning("Could not extract features, skipping prediction")
            return

        # Generate predictions
        predictions = self.generate_predictions(features)

        # Determine feature window
        min_window = max(WINDOW_SIZES) + SEQUENCE_LENGTH
        window_start = max(1, new_round_id - min_window + 1)
        window_end = new_round_id

        # Create message
        message = self.create_prediction_message(
            round_id=new_round_id + 1,  # Predicting the NEXT round
            predictions=predictions,
            window_start=window_start,
            window_end=window_end
        )

        # Log predictions
        logger.info(f"Predictions for next round (after {new_round_id}):")
        for key, value in predictions.items():
            logger.info(f"  {key}: {value:.3f}")

        # Publish to Redis
        self.publish_prediction(message)

    def initialize_last_processed_id(self) -> None:
        """Initialize the last processed round ID from the database."""
        df = self.get_latest_rounds(limit=1)
        if len(df) > 0:
            self.last_processed_id = int(df["id"].iloc[-1])
            logger.info(f"Initialized last processed ID: {self.last_processed_id}")
        else:
            self.last_processed_id = 0
            logger.info("No rounds in database yet")

    def run(self) -> None:
        """
        Main loop for the inference service.

        Polls the database for new rounds and generates predictions.
        """
        logger.info("=" * 60)
        logger.info("Starting Crash Game ML Inference Service")
        logger.info("=" * 60)

        # Load models
        self.load_models()

        if len(self.models) == 0:
            logger.error("No models loaded! Run training first.")
            return

        # Connect to Redis
        try:
            self.connect_redis()
        except Exception as e:
            logger.error(f"Could not connect to Redis: {e}")
            logger.info("Continuing without Redis (predictions will only be logged)")

        # Initialize state
        self.initialize_last_processed_id()

        logger.info(f"\nPolling for new rounds every {POLLING_INTERVAL} seconds...")
        logger.info("Press Ctrl+C to stop\n")

        self._running = True

        while self._running:
            try:
                # Check for new rounds
                new_rounds_df = self.get_new_rounds_since(self.last_processed_id)

                if len(new_rounds_df) > 0:
                    # Get full history for feature extraction
                    history_df = self.get_latest_rounds(
                        limit=max(WINDOW_SIZES) + SEQUENCE_LENGTH + 50
                    )

                    # Process each new round
                    for _, row in new_rounds_df.iterrows():
                        round_id = int(row["id"])

                        # Update history to include this round
                        self.process_new_round(round_id, history_df)

                        self.last_processed_id = round_id

                # Wait before next poll
                time.sleep(POLLING_INTERVAL)

            except KeyboardInterrupt:
                logger.info("\nReceived shutdown signal")
                self._running = False

            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(POLLING_INTERVAL)

        logger.info("Inference service stopped")

    def stop(self) -> None:
        """Stop the inference service."""
        self._running = False


def main():
    """Entry point for the inference service."""
    service = CrashMLInferenceService()

    try:
        service.run()
    except KeyboardInterrupt:
        service.stop()


if __name__ == "__main__":
    main()
