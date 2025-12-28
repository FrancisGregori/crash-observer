"""
Configuration for the Crash Game ML Service.

This module contains all configuration parameters for:
- Database connection
- Redis connection
- Model parameters
- Feature engineering settings
- Training settings
"""

import os
from pathlib import Path

# =============================================================================
# PATHS
# =============================================================================

# Base directory (ml_service folder)
BASE_DIR = Path(__file__).parent

# Project root
PROJECT_ROOT = BASE_DIR.parent

# Database path
DATABASE_PATH = PROJECT_ROOT / "data" / "crash_stats.db"

# Model storage
MODELS_DIR = BASE_DIR / "models"
LOGS_DIR = BASE_DIR / "logs"

# Ensure directories exist
MODELS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# =============================================================================
# REDIS CONFIGURATION
# =============================================================================

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

# Channel for publishing predictions
REDIS_CHANNEL_PREDICTIONS = "ml_predictions"

# =============================================================================
# MODEL CONFIGURATION
# =============================================================================

# Current model version
MODEL_VERSION = "v1.0.0"

# Model file names
MODEL_FILES = {
    "gt_1_5x": "model_gt_1_5x.joblib",
    "gt_2x": "model_gt_2x.joblib",
    "gt_3x": "model_gt_3x.joblib",
    "gt_4x": "model_gt_4x.joblib",
    "gt_5x": "model_gt_5x.joblib",
    "gt_7x": "model_gt_7x.joblib",
    "gt_10x": "model_gt_10x.joblib",
    "early_crash": "model_early_crash.joblib",
    "high_loss_streak": "model_high_loss_streak.joblib",
    "scaler": "feature_scaler.joblib",
}

# =============================================================================
# FEATURE ENGINEERING SETTINGS
# =============================================================================

# Window sizes for rolling statistics
WINDOW_SIZES = [20, 50, 100]

# Number of previous multipliers to include as features
SEQUENCE_LENGTH = 20

# Thresholds for counting events
MULTIPLIER_THRESHOLDS = [1.5, 2.0, 3.0, 4.0, 5.0, 7.0, 10.0]

# Early crash threshold (multiplier <= this value is considered early crash)
EARLY_CRASH_THRESHOLD = 1.20

# High loss streak configuration
# A streak is considered "high loss" if the percentage of rounds below 2x
# in the last N rounds exceeds the historical average by this factor
HIGH_LOSS_STREAK_WINDOW = 20
HIGH_LOSS_STREAK_THRESHOLD_FACTOR = 1.3  # 30% above historical average

# =============================================================================
# TRAINING CONFIGURATION
# =============================================================================

# Temporal split ratios
TRAIN_RATIO = 0.7
VALIDATION_RATIO = 0.15
TEST_RATIO = 0.15

# Minimum rounds needed for training
MIN_ROUNDS_FOR_TRAINING = 1000

# XGBoost parameters (tuned for imbalanced classification and stability)
XGBOOST_PARAMS = {
    "n_estimators": 300,           # Mais árvores para melhor generalização
    "max_depth": 5,                # Reduzido para evitar overfitting
    "learning_rate": 0.03,         # Learning rate menor para convergência mais suave
    "min_child_weight": 5,         # Aumentado para evitar overfitting em dados raros
    "subsample": 0.75,             # Amostragem de dados
    "colsample_bytree": 0.75,      # Amostragem de features
    "colsample_bylevel": 0.8,      # Amostragem por nível
    "gamma": 0.2,                  # Regularização mais forte
    "reg_alpha": 0.5,              # L1 regularização
    "reg_lambda": 2.0,             # L2 regularização mais forte
    "random_state": 42,
    "n_jobs": -1,
    "use_label_encoder": False,
    "eval_metric": "auc",          # AUC é melhor para classificação binária desbalanceada
    "early_stopping_rounds": 30,   # Early stopping para evitar overfitting
}

# Parâmetros específicos para modelos de eventos raros (7x+, 10x+)
XGBOOST_PARAMS_RARE_EVENTS = {
    **XGBOOST_PARAMS,
    "max_depth": 4,                # Mais raso para eventos raros
    "min_child_weight": 10,        # Mais conservador
    "learning_rate": 0.02,         # Mais lento
    "n_estimators": 400,           # Mais árvores
    "reg_lambda": 3.0,             # Regularização ainda mais forte
}

# Class weights for imbalanced targets
# These will be computed dynamically based on data
USE_CLASS_WEIGHTS = True

# =============================================================================
# INFERENCE SERVICE SETTINGS
# =============================================================================

# Polling interval for new rounds (seconds)
POLLING_INTERVAL = 2.0

# Minimum rounds needed before making predictions
MIN_ROUNDS_FOR_PREDICTION = 100

# =============================================================================
# LOGGING
# =============================================================================

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
