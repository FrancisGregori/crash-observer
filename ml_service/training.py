"""
Training Pipeline for Crash Game ML Models.

This module handles:
1. Loading data from SQLite
2. Splitting data temporally (no data leakage)
3. Training multiple XGBoost classifiers
4. Evaluating model performance
5. Saving trained models

IMPORTANT: The split is done temporally to prevent any data leakage.
Training data comes first, then validation, then test.
"""

import sqlite3
import logging
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Tuple, Optional

import numpy as np
import pandas as pd
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    roc_auc_score,
    log_loss,
    brier_score_loss,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
)
from xgboost import XGBClassifier

from config import (
    DATABASE_PATH,
    MODELS_DIR,
    MODEL_VERSION,
    MODEL_FILES,
    TRAIN_RATIO,
    VALIDATION_RATIO,
    TEST_RATIO,
    MIN_ROUNDS_FOR_TRAINING,
    XGBOOST_PARAMS,
    USE_CLASS_WEIGHTS,
)
from features import FeatureEngineer, LabelGenerator, create_training_dataset

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def load_rounds_from_sqlite(db_path: Path = DATABASE_PATH) -> pd.DataFrame:
    """
    Load all rounds from the SQLite database.

    Args:
        db_path: Path to the SQLite database

    Returns:
        DataFrame with rounds data
    """
    logger.info(f"Loading rounds from {db_path}")

    if not db_path.exists():
        raise FileNotFoundError(f"Database not found at {db_path}")

    conn = sqlite3.connect(db_path)

    query = """
        SELECT
            id,
            createdAt,
            betCount,
            totalBet,
            totalWin,
            multiplier
        FROM rounds
        ORDER BY createdAt ASC
    """

    df = pd.read_sql_query(query, conn)
    conn.close()

    logger.info(f"Loaded {len(df)} rounds from database")

    return df


def temporal_split(
    X: np.ndarray,
    labels: Dict[str, np.ndarray],
    train_ratio: float = TRAIN_RATIO,
    val_ratio: float = VALIDATION_RATIO
) -> Tuple[Dict, Dict, Dict]:
    """
    Split data temporally into train, validation, and test sets.

    This ensures no data leakage by using:
    - First train_ratio of data for training
    - Next val_ratio for validation
    - Remaining for testing

    Args:
        X: Feature matrix
        labels: Dictionary of label arrays
        train_ratio: Proportion for training
        val_ratio: Proportion for validation

    Returns:
        Tuple of (train_data, val_data, test_data) where each is a dict
        with 'X' and label arrays
    """
    n = len(X)

    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    train_data = {"X": X[:train_end]}
    val_data = {"X": X[train_end:val_end]}
    test_data = {"X": X[val_end:]}

    for name, arr in labels.items():
        train_data[name] = arr[:train_end]
        val_data[name] = arr[train_end:val_end]
        test_data[name] = arr[val_end:]

    logger.info(f"Split data - Train: {train_end}, Val: {val_end - train_end}, Test: {n - val_end}")

    return train_data, val_data, test_data


def compute_class_weight(y: np.ndarray) -> Dict[int, float]:
    """
    Compute class weights for imbalanced data.

    Uses the 'balanced' strategy from sklearn.

    Args:
        y: Binary label array

    Returns:
        Dictionary mapping class to weight
    """
    n_samples = len(y)
    n_positive = np.sum(y)
    n_negative = n_samples - n_positive

    if n_positive == 0 or n_negative == 0:
        return {0: 1.0, 1: 1.0}

    # Balanced weights
    weight_positive = n_samples / (2 * n_positive)
    weight_negative = n_samples / (2 * n_negative)

    return {0: weight_negative, 1: weight_positive}


def compute_scale_pos_weight(y: np.ndarray) -> float:
    """
    Compute scale_pos_weight for XGBoost (ratio of negative to positive).

    Args:
        y: Binary label array

    Returns:
        Scale weight for positive class
    """
    n_positive = np.sum(y)
    n_negative = len(y) - n_positive

    if n_positive == 0:
        return 1.0

    return n_negative / n_positive


def train_single_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    label_name: str
) -> XGBClassifier:
    """
    Train a single XGBoost classifier.

    Args:
        X_train: Training features
        y_train: Training labels
        X_val: Validation features
        y_val: Validation labels
        label_name: Name of the label being predicted

    Returns:
        Trained XGBClassifier
    """
    logger.info(f"Training model for {label_name}")

    # Compute class imbalance weight
    scale_pos_weight = 1.0
    if USE_CLASS_WEIGHTS:
        scale_pos_weight = compute_scale_pos_weight(y_train)
        logger.info(f"  Class imbalance ratio: {scale_pos_weight:.2f}")

    # Create model with configured parameters
    params = XGBOOST_PARAMS.copy()
    params["scale_pos_weight"] = scale_pos_weight

    model = XGBClassifier(**params)

    # Train with early stopping
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        verbose=False
    )

    # Log training results
    train_pred = model.predict_proba(X_train)[:, 1]
    val_pred = model.predict_proba(X_val)[:, 1]

    train_auc = roc_auc_score(y_train, train_pred) if len(np.unique(y_train)) > 1 else 0
    val_auc = roc_auc_score(y_val, val_pred) if len(np.unique(y_val)) > 1 else 0

    logger.info(f"  Train AUC: {train_auc:.4f}, Val AUC: {val_auc:.4f}")

    return model


def evaluate_model(
    model: XGBClassifier,
    X: np.ndarray,
    y: np.ndarray,
    label_name: str,
    set_name: str = "Test"
) -> Dict:
    """
    Evaluate model performance on a dataset.

    Computes multiple metrics including:
    - AUC-ROC
    - Log loss
    - Brier score
    - Accuracy, Precision, Recall, F1

    Args:
        model: Trained classifier
        X: Features
        y: True labels
        label_name: Name of the target
        set_name: Name of the dataset (for logging)

    Returns:
        Dictionary of metrics
    """
    y_pred_proba = model.predict_proba(X)[:, 1]
    y_pred = model.predict(X)

    metrics = {}

    # Probabilistic metrics
    if len(np.unique(y)) > 1:
        metrics["auc_roc"] = roc_auc_score(y, y_pred_proba)
        metrics["log_loss"] = log_loss(y, y_pred_proba)
    else:
        metrics["auc_roc"] = 0.0
        metrics["log_loss"] = 0.0

    metrics["brier_score"] = brier_score_loss(y, y_pred_proba)

    # Classification metrics
    metrics["accuracy"] = accuracy_score(y, y_pred)
    metrics["precision"] = precision_score(y, y_pred, zero_division=0)
    metrics["recall"] = recall_score(y, y_pred, zero_division=0)
    metrics["f1"] = f1_score(y, y_pred, zero_division=0)

    # Class distribution
    metrics["n_positive"] = int(np.sum(y))
    metrics["n_negative"] = int(len(y) - np.sum(y))
    metrics["positive_rate"] = np.mean(y)

    logger.info(f"\n{set_name} metrics for {label_name}:")
    logger.info(f"  AUC-ROC: {metrics['auc_roc']:.4f}")
    logger.info(f"  Log Loss: {metrics['log_loss']:.4f}")
    logger.info(f"  Brier Score: {metrics['brier_score']:.4f}")
    logger.info(f"  Accuracy: {metrics['accuracy']:.4f}")
    logger.info(f"  Precision: {metrics['precision']:.4f}")
    logger.info(f"  Recall: {metrics['recall']:.4f}")
    logger.info(f"  F1: {metrics['f1']:.4f}")
    logger.info(f"  Positive rate: {metrics['positive_rate']:.2%}")

    return metrics


def save_model(model, scaler: StandardScaler, model_name: str) -> Path:
    """
    Save a trained model to disk.

    Args:
        model: Trained model
        scaler: Fitted scaler (can be None)
        model_name: Name for the model file

    Returns:
        Path to saved model
    """
    model_path = MODELS_DIR / MODEL_FILES[model_name]
    joblib.dump(model, model_path)
    logger.info(f"Saved model to {model_path}")

    if scaler is not None:
        scaler_path = MODELS_DIR / MODEL_FILES["scaler"]
        joblib.dump(scaler, scaler_path)
        logger.info(f"Saved scaler to {scaler_path}")

    return model_path


def save_training_metadata(metrics: Dict, feature_names: list) -> None:
    """
    Save training metadata and metrics to a JSON file.

    Args:
        metrics: Dictionary of all model metrics
        feature_names: List of feature names
    """
    metadata = {
        "model_version": MODEL_VERSION,
        "trained_at": datetime.now().isoformat(),
        "feature_names": feature_names,
        "metrics": metrics,
    }

    metadata_path = MODELS_DIR / "training_metadata.json"

    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    logger.info(f"Saved training metadata to {metadata_path}")


def run_training_pipeline(db_path: Path = DATABASE_PATH) -> Dict:
    """
    Run the complete training pipeline.

    This function:
    1. Loads data from SQLite
    2. Creates features and labels
    3. Splits data temporally
    4. Trains models for each target
    5. Evaluates on test set
    6. Saves models and metadata

    Args:
        db_path: Path to SQLite database

    Returns:
        Dictionary with training results and metrics
    """
    logger.info("=" * 60)
    logger.info("Starting ML Training Pipeline")
    logger.info("=" * 60)

    # 1. Load data
    df = load_rounds_from_sqlite(db_path)

    if len(df) < MIN_ROUNDS_FOR_TRAINING:
        raise ValueError(
            f"Insufficient data for training. "
            f"Need at least {MIN_ROUNDS_FOR_TRAINING} rounds, "
            f"but only have {len(df)}"
        )

    # 2. Create training dataset
    logger.info("\nCreating training dataset...")
    X, labels, valid_indices = create_training_dataset(df)

    if len(X) == 0:
        raise ValueError("No valid samples created from data")

    feature_engineer = FeatureEngineer()
    feature_names = feature_engineer.get_feature_names()

    # 3. Split data temporally
    logger.info("\nSplitting data temporally...")
    train_data, val_data, test_data = temporal_split(X, labels)

    # 4. Scale features
    logger.info("\nScaling features...")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(train_data["X"])
    X_val_scaled = scaler.transform(val_data["X"])
    X_test_scaled = scaler.transform(test_data["X"])

    # 5. Train models for each target
    models = {}
    all_metrics = {}

    target_names = [
        "label_gt_1_5x",
        "label_gt_2x",
        "label_gt_3x",
        "label_gt_4x",
        "label_gt_5x",
        "label_gt_7x",
        "label_gt_10x",
        "label_early_crash",
        "label_high_loss_streak",
    ]

    # Map label names to model file keys
    label_to_model_key = {
        "label_gt_1_5x": "gt_1_5x",
        "label_gt_2x": "gt_2x",
        "label_gt_3x": "gt_3x",
        "label_gt_4x": "gt_4x",
        "label_gt_5x": "gt_5x",
        "label_gt_7x": "gt_7x",
        "label_gt_10x": "gt_10x",
        "label_early_crash": "early_crash",
        "label_high_loss_streak": "high_loss_streak",
    }

    for label_name in target_names:
        logger.info(f"\n{'=' * 40}")
        logger.info(f"Training model for: {label_name}")
        logger.info("=" * 40)

        y_train = train_data[label_name]
        y_val = val_data[label_name]
        y_test = test_data[label_name]

        # Skip if all same class
        if len(np.unique(y_train)) < 2:
            logger.warning(f"Skipping {label_name}: only one class in training data")
            continue

        # Train model
        model = train_single_model(
            X_train_scaled, y_train,
            X_val_scaled, y_val,
            label_name
        )

        # Evaluate on test set
        test_metrics = evaluate_model(
            model, X_test_scaled, y_test, label_name, "Test"
        )

        # Store model and metrics
        model_key = label_to_model_key[label_name]
        models[model_key] = model
        all_metrics[label_name] = test_metrics

        # Save model
        save_model(model, None, model_key)

    # Save scaler (only once)
    scaler_path = MODELS_DIR / MODEL_FILES["scaler"]
    joblib.dump(scaler, scaler_path)
    logger.info(f"\nSaved feature scaler to {scaler_path}")

    # 6. Save metadata
    save_training_metadata(all_metrics, feature_names)

    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("Training Pipeline Complete!")
    logger.info("=" * 60)
    logger.info(f"Trained {len(models)} models")
    logger.info(f"Models saved to: {MODELS_DIR}")

    return {
        "n_samples": len(X),
        "n_features": X.shape[1],
        "n_models": len(models),
        "metrics": all_metrics,
        "model_version": MODEL_VERSION,
    }


if __name__ == "__main__":
    try:
        results = run_training_pipeline()
        print("\nTraining completed successfully!")
        print(f"Results: {json.dumps(results, indent=2, default=str)}")
    except Exception as e:
        logger.error(f"Training failed: {e}")
        raise
