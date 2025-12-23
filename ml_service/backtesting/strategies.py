"""
Strategy definitions for crash game backtesting.

Each strategy implements:
- should_bet(): Decide if we should bet this round
- get_bet_amount(): How much to bet
- get_cashout_target(): At what multiplier to cash out
- on_round_result(): Update internal state after round
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import numpy as np


@dataclass
class BetDecision:
    """Decision for a single round."""
    should_bet: bool
    bet_amount: float = 0.0
    cashout_target: float = 2.0
    reason: str = ""


@dataclass
class RoundData:
    """Data for a single round."""
    id: int
    multiplier: float
    bet_count: int
    total_bet: float
    total_win: float
    created_at: str


class Strategy(ABC):
    """Base class for all strategies."""

    def __init__(self, name: str, initial_bankroll: float = 1000.0):
        self.name = name
        self.initial_bankroll = initial_bankroll
        self.bankroll = initial_bankroll
        self.history: List[Dict[str, Any]] = []
        self.consecutive_losses = 0
        self.consecutive_wins = 0
        self.total_bets = 0
        self.total_wins = 0
        self.paused_rounds = 0

    def reset(self):
        """Reset strategy state."""
        self.bankroll = self.initial_bankroll
        self.history = []
        self.consecutive_losses = 0
        self.consecutive_wins = 0
        self.total_bets = 0
        self.total_wins = 0
        self.paused_rounds = 0

    @abstractmethod
    def decide(self, round_history: List[RoundData]) -> BetDecision:
        """Make a betting decision based on round history."""
        pass

    def on_round_result(self, decision: BetDecision, round_data: RoundData, won: bool, profit: float):
        """Update state after a round result."""
        if decision.should_bet:
            self.total_bets += 1
            self.bankroll += profit

            if won:
                self.total_wins += 1
                self.consecutive_wins += 1
                self.consecutive_losses = 0
            else:
                self.consecutive_losses += 1
                self.consecutive_wins = 0

            self.history.append({
                "round_id": round_data.id,
                "multiplier": round_data.multiplier,
                "bet_amount": decision.bet_amount,
                "target": decision.cashout_target,
                "won": won,
                "profit": profit,
                "bankroll": self.bankroll,
            })

    def get_params(self) -> Dict[str, Any]:
        """Get strategy parameters for logging/comparison."""
        return {"name": self.name}


class FixedTargetStrategy(Strategy):
    """
    Simple fixed target strategy.
    Always bet a fixed amount and cash out at a fixed multiplier.
    """

    def __init__(
        self,
        target: float = 2.0,
        bet_percent: float = 1.0,  # % of bankroll
        min_bet: float = 1.0,
        max_bet: float = 100.0,
        stop_loss_percent: float = 50.0,  # Stop if lost X% of initial
        take_profit_percent: float = 100.0,  # Stop if gained X% of initial
        **kwargs
    ):
        super().__init__(name=f"FixedTarget_{target}x", **kwargs)
        self.target = target
        self.bet_percent = bet_percent
        self.min_bet = min_bet
        self.max_bet = max_bet
        self.stop_loss_percent = stop_loss_percent
        self.take_profit_percent = take_profit_percent

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        # Check stop loss
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        # Check take profit
        profit_percent = (self.bankroll - self.initial_bankroll) / self.initial_bankroll * 100
        if profit_percent >= self.take_profit_percent:
            return BetDecision(False, reason="Take profit triggered")

        # Calculate bet amount
        bet_amount = self.bankroll * (self.bet_percent / 100)
        bet_amount = max(self.min_bet, min(self.max_bet, bet_amount))

        if bet_amount > self.bankroll:
            return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, bet_amount, self.target, "Fixed target bet")

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "target": self.target,
            "bet_percent": self.bet_percent,
            "stop_loss_percent": self.stop_loss_percent,
            "take_profit_percent": self.take_profit_percent,
        }


class MartingaleStrategy(Strategy):
    """
    Martingale betting strategy.
    Double bet after each loss, reset after win.
    """

    def __init__(
        self,
        target: float = 2.0,
        base_bet: float = 1.0,
        multiplier: float = 2.0,  # Multiply bet by this after loss
        max_consecutive_losses: int = 5,  # Max losses before reset
        stop_loss_percent: float = 50.0,
        **kwargs
    ):
        super().__init__(name=f"Martingale_{target}x", **kwargs)
        self.target = target
        self.base_bet = base_bet
        self.multiplier = multiplier
        self.max_consecutive_losses = max_consecutive_losses
        self.stop_loss_percent = stop_loss_percent
        self.current_bet = base_bet

    def reset(self):
        super().reset()
        self.current_bet = self.base_bet

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        # Check stop loss
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        # Reset if max consecutive losses reached
        if self.consecutive_losses >= self.max_consecutive_losses:
            self.current_bet = self.base_bet
            self.consecutive_losses = 0

        if self.current_bet > self.bankroll:
            self.current_bet = self.base_bet
            if self.current_bet > self.bankroll:
                return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, self.current_bet, self.target, "Martingale bet")

    def on_round_result(self, decision: BetDecision, round_data: RoundData, won: bool, profit: float):
        super().on_round_result(decision, round_data, won, profit)

        if decision.should_bet:
            if won:
                self.current_bet = self.base_bet
            else:
                self.current_bet *= self.multiplier

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "target": self.target,
            "base_bet": self.base_bet,
            "multiplier": self.multiplier,
            "max_consecutive_losses": self.max_consecutive_losses,
        }


class AntiMartingaleStrategy(Strategy):
    """
    Anti-Martingale (Paroli) strategy.
    Increase bet after wins, reset after loss.
    """

    def __init__(
        self,
        target: float = 2.0,
        base_bet: float = 1.0,
        multiplier: float = 2.0,
        max_consecutive_wins: int = 3,  # Reset after this many wins
        stop_loss_percent: float = 50.0,
        take_profit_percent: float = 100.0,
        **kwargs
    ):
        super().__init__(name=f"AntiMartingale_{target}x", **kwargs)
        self.target = target
        self.base_bet = base_bet
        self.multiplier = multiplier
        self.max_consecutive_wins = max_consecutive_wins
        self.stop_loss_percent = stop_loss_percent
        self.take_profit_percent = take_profit_percent
        self.current_bet = base_bet

    def reset(self):
        super().reset()
        self.current_bet = self.base_bet

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        profit_percent = (self.bankroll - self.initial_bankroll) / self.initial_bankroll * 100
        if profit_percent >= self.take_profit_percent:
            return BetDecision(False, reason="Take profit triggered")

        if self.consecutive_wins >= self.max_consecutive_wins:
            self.current_bet = self.base_bet
            self.consecutive_wins = 0

        if self.current_bet > self.bankroll:
            self.current_bet = self.base_bet
            if self.current_bet > self.bankroll:
                return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, self.current_bet, self.target, "Anti-Martingale bet")

    def on_round_result(self, decision: BetDecision, round_data: RoundData, won: bool, profit: float):
        super().on_round_result(decision, round_data, won, profit)

        if decision.should_bet:
            if won:
                self.current_bet *= self.multiplier
            else:
                self.current_bet = self.base_bet

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "target": self.target,
            "base_bet": self.base_bet,
            "multiplier": self.multiplier,
            "max_consecutive_wins": self.max_consecutive_wins,
        }


class PatternBasedStrategy(Strategy):
    """
    Pattern-based strategy.
    Look for patterns in recent rounds and bet accordingly.
    """

    def __init__(
        self,
        bet_percent: float = 1.0,
        min_streak_to_bet: int = 3,  # Min rounds below threshold before betting
        streak_threshold: float = 2.0,  # Threshold for streak detection
        target_after_streak: float = 2.0,  # Target after detecting streak
        wait_after_high: int = 1,  # Rounds to wait after high multiplier
        high_threshold: float = 5.0,  # What counts as "high"
        stop_loss_percent: float = 50.0,
        **kwargs
    ):
        super().__init__(name="PatternBased", **kwargs)
        self.bet_percent = bet_percent
        self.min_streak_to_bet = min_streak_to_bet
        self.streak_threshold = streak_threshold
        self.target_after_streak = target_after_streak
        self.wait_after_high = wait_after_high
        self.high_threshold = high_threshold
        self.stop_loss_percent = stop_loss_percent
        self.wait_counter = 0

    def reset(self):
        super().reset()
        self.wait_counter = 0

    def _count_streak(self, rounds: List[RoundData]) -> int:
        """Count consecutive rounds below threshold."""
        count = 0
        for r in reversed(rounds):
            if r.multiplier < self.streak_threshold:
                count += 1
            else:
                break
        return count

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        if len(round_history) < self.min_streak_to_bet:
            return BetDecision(False, reason="Not enough history")

        # Wait after high multiplier
        if self.wait_counter > 0:
            self.wait_counter -= 1
            return BetDecision(False, reason=f"Waiting after high ({self.wait_counter} left)")

        # Check for recent high
        if round_history[-1].multiplier >= self.high_threshold:
            self.wait_counter = self.wait_after_high
            return BetDecision(False, reason="Just had high multiplier, waiting")

        # Check streak
        streak = self._count_streak(round_history)
        if streak >= self.min_streak_to_bet:
            bet_amount = self.bankroll * (self.bet_percent / 100)
            return BetDecision(True, bet_amount, self.target_after_streak,
                             f"Streak of {streak} low rounds detected")

        return BetDecision(False, reason=f"Streak only {streak}, need {self.min_streak_to_bet}")

    def on_round_result(self, decision: BetDecision, round_data: RoundData, won: bool, profit: float):
        super().on_round_result(decision, round_data, won, profit)

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "min_streak_to_bet": self.min_streak_to_bet,
            "streak_threshold": self.streak_threshold,
            "target_after_streak": self.target_after_streak,
            "wait_after_high": self.wait_after_high,
        }


class AdaptiveTargetStrategy(Strategy):
    """
    Adaptive target strategy.
    Starts with higher target and decreases after losses.
    """

    def __init__(
        self,
        start_target: float = 5.0,
        min_target: float = 1.5,
        target_decrement: float = 0.5,
        bet_percent: float = 1.0,
        reset_after_wins: int = 2,  # Reset target after this many consecutive wins
        stop_loss_percent: float = 50.0,
        **kwargs
    ):
        super().__init__(name="AdaptiveTarget", **kwargs)
        self.start_target = start_target
        self.min_target = min_target
        self.target_decrement = target_decrement
        self.bet_percent = bet_percent
        self.reset_after_wins = reset_after_wins
        self.stop_loss_percent = stop_loss_percent
        self.current_target = start_target

    def reset(self):
        super().reset()
        self.current_target = self.start_target

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        bet_amount = self.bankroll * (self.bet_percent / 100)
        if bet_amount > self.bankroll:
            return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, bet_amount, self.current_target,
                         f"Adaptive target at {self.current_target}x")

    def on_round_result(self, decision: BetDecision, round_data: RoundData, won: bool, profit: float):
        super().on_round_result(decision, round_data, won, profit)

        if decision.should_bet:
            if won:
                if self.consecutive_wins >= self.reset_after_wins:
                    self.current_target = self.start_target
            else:
                self.current_target = max(self.min_target,
                                         self.current_target - self.target_decrement)

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "start_target": self.start_target,
            "min_target": self.min_target,
            "target_decrement": self.target_decrement,
            "reset_after_wins": self.reset_after_wins,
        }


class HybridMLStrategy(Strategy):
    """
    Hybrid strategy that uses ML predictions when available.
    Falls back to pattern-based decisions otherwise.
    """

    def __init__(
        self,
        bet_percent: float = 1.0,
        min_confidence: float = 0.6,  # Min ML confidence to bet
        early_crash_max_prob: float = 0.3,  # Block if early crash prob > this
        use_adaptive_target: bool = True,
        base_target: float = 2.0,
        stop_loss_percent: float = 50.0,
        ml_predictions: Optional[Dict[int, Dict[str, float]]] = None,  # Pre-computed ML predictions
        **kwargs
    ):
        super().__init__(name="HybridML", **kwargs)
        self.bet_percent = bet_percent
        self.min_confidence = min_confidence
        self.early_crash_max_prob = early_crash_max_prob
        self.use_adaptive_target = use_adaptive_target
        self.base_target = base_target
        self.stop_loss_percent = stop_loss_percent
        self.ml_predictions = ml_predictions or {}

    def set_predictions(self, predictions: Dict[int, Dict[str, float]]):
        """Set ML predictions for backtesting."""
        self.ml_predictions = predictions

    def _get_target_from_predictions(self, preds: Dict[str, float]) -> float:
        """Select target based on ML predictions."""
        if not self.use_adaptive_target:
            return self.base_target

        # Check probabilities from highest to lowest
        if preds.get("prob_gt_10x", 0) > 0.3:
            return 10.0
        elif preds.get("prob_gt_5x", 0) > 0.35:
            return 5.0
        elif preds.get("prob_gt_3x", 0) > 0.4:
            return 3.0
        elif preds.get("prob_gt_2x", 0) > 0.5:
            return 2.0
        else:
            return self.base_target

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        if not round_history:
            return BetDecision(False, reason="No history")

        # Get prediction for next round (keyed by previous round id)
        last_round_id = round_history[-1].id
        preds = self.ml_predictions.get(last_round_id, {})

        if not preds:
            # No ML prediction available, skip
            return BetDecision(False, reason="No ML prediction available")

        # Check early crash probability
        if preds.get("prob_early_crash", 0) > self.early_crash_max_prob:
            return BetDecision(False, reason="High early crash probability")

        # Check minimum confidence
        prob_2x = preds.get("prob_gt_2x", 0)
        if prob_2x < self.min_confidence:
            return BetDecision(False, reason=f"Low confidence ({prob_2x:.2f})")

        bet_amount = self.bankroll * (self.bet_percent / 100)
        if bet_amount > self.bankroll:
            return BetDecision(False, reason="Insufficient bankroll")

        target = self._get_target_from_predictions(preds)
        return BetDecision(True, bet_amount, target,
                         f"ML suggests {target}x (conf: {prob_2x:.2f})")

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "min_confidence": self.min_confidence,
            "early_crash_max_prob": self.early_crash_max_prob,
            "use_adaptive_target": self.use_adaptive_target,
            "base_target": self.base_target,
        }


class SafetyFirstStrategy(Strategy):
    """
    Safety first (breakeven + profit) strategy.
    Places two bets: one at low target (safety), one at higher target (profit).
    """

    def __init__(
        self,
        safety_target: float = 1.5,
        profit_target: float = 3.0,
        safety_bet_ratio: float = 0.7,  # % of total bet for safety
        total_bet_percent: float = 2.0,  # % of bankroll for total bet
        stop_loss_percent: float = 50.0,
        take_profit_percent: float = 100.0,
        **kwargs
    ):
        super().__init__(name="SafetyFirst", **kwargs)
        self.safety_target = safety_target
        self.profit_target = profit_target
        self.safety_bet_ratio = safety_bet_ratio
        self.total_bet_percent = total_bet_percent
        self.stop_loss_percent = stop_loss_percent
        self.take_profit_percent = take_profit_percent

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        profit_percent = (self.bankroll - self.initial_bankroll) / self.initial_bankroll * 100
        if profit_percent >= self.take_profit_percent:
            return BetDecision(False, reason="Take profit triggered")

        total_bet = self.bankroll * (self.total_bet_percent / 100)
        if total_bet > self.bankroll:
            return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, total_bet, self.profit_target, "Safety first bet")

    def simulate_round(self, bet_amount: float, multiplier: float) -> float:
        """
        Simulate a round with dual bets.
        Returns net profit/loss.
        """
        safety_bet = bet_amount * self.safety_bet_ratio
        profit_bet = bet_amount * (1 - self.safety_bet_ratio)

        profit = 0.0

        # Safety bet result
        if multiplier >= self.safety_target:
            profit += safety_bet * (self.safety_target - 1)
        else:
            profit -= safety_bet

        # Profit bet result
        if multiplier >= self.profit_target:
            profit += profit_bet * (self.profit_target - 1)
        else:
            profit -= profit_bet

        return profit

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "safety_target": self.safety_target,
            "profit_target": self.profit_target,
            "safety_bet_ratio": self.safety_bet_ratio,
            "total_bet_percent": self.total_bet_percent,
        }


class SkipLowStrategy(Strategy):
    """
    Strategy that skips rounds after low multipliers.
    Hypothesis: After very low multipliers, better to wait.
    """

    def __init__(
        self,
        target: float = 2.0,
        bet_percent: float = 1.0,
        skip_after_below: float = 1.2,  # Skip after multiplier below this
        skip_rounds: int = 2,  # How many rounds to skip
        stop_loss_percent: float = 50.0,
        **kwargs
    ):
        super().__init__(name="SkipLow", **kwargs)
        self.target = target
        self.bet_percent = bet_percent
        self.skip_after_below = skip_after_below
        self.skip_rounds = skip_rounds
        self.stop_loss_percent = stop_loss_percent
        self.rounds_to_skip = 0

    def reset(self):
        super().reset()
        self.rounds_to_skip = 0

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        if self.rounds_to_skip > 0:
            self.rounds_to_skip -= 1
            return BetDecision(False, reason=f"Skipping ({self.rounds_to_skip} left)")

        if round_history and round_history[-1].multiplier < self.skip_after_below:
            self.rounds_to_skip = self.skip_rounds
            return BetDecision(False, reason="Low multiplier detected, starting skip")

        bet_amount = self.bankroll * (self.bet_percent / 100)
        if bet_amount > self.bankroll:
            return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, bet_amount, self.target, "Normal bet after clear")

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "target": self.target,
            "skip_after_below": self.skip_after_below,
            "skip_rounds": self.skip_rounds,
        }
