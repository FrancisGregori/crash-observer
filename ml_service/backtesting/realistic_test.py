#!/usr/bin/env python3
"""
Teste realista de estratégias para crash game.

Parâmetros fixos:
- Banca inicial: R$100
- Aposta mínima: R$2
- Janela: 10 horas (~1700 rodadas)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from backtesting.engine import BacktestEngine, BacktestConfig
from backtesting.strategies import Strategy, RoundData, BetDecision
from backtesting.metrics import calculate_metrics, print_metrics, PerformanceMetrics


# Configurações realistas
INITIAL_BANKROLL = 100.0  # R$100
MIN_BET = 2.0  # R$2 mínimo
ROUNDS_PER_HOUR = 170
HOURS_TO_SIMULATE = 10
ROUNDS_PER_SESSION = ROUNDS_PER_HOUR * HOURS_TO_SIMULATE  # 1700 rodadas


class DualBetStrategy(Strategy):
    """
    Estratégia de aposta dupla:
    - Aposta 1 (safety): sai em target baixo para garantir
    - Aposta 2 (profit): tenta levar mais longe para lucrar
    """

    def __init__(
        self,
        safety_target: float = 2.0,
        profit_target: float = 3.0,
        safety_bet: float = 2.0,
        profit_bet: float = 2.0,
        increase_after_wins: int = 0,  # Aumentar aposta após X wins seguidos
        increase_multiplier: float = 1.0,  # Multiplicador de aumento
        stop_loss_percent: float = 50.0,
        **kwargs
    ):
        super().__init__(name=f"DualBet_{safety_target}x_{profit_target}x", **kwargs)
        self.safety_target = safety_target
        self.profit_target = profit_target
        self.base_safety_bet = safety_bet
        self.base_profit_bet = profit_bet
        self.current_safety_bet = safety_bet
        self.current_profit_bet = profit_bet
        self.increase_after_wins = increase_after_wins
        self.increase_multiplier = increase_multiplier
        self.stop_loss_percent = stop_loss_percent

    def reset(self):
        super().reset()
        self.current_safety_bet = self.base_safety_bet
        self.current_profit_bet = self.base_profit_bet

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        total_bet = self.current_safety_bet + self.current_profit_bet
        if total_bet > self.bankroll:
            # Tentar apenas com mínimo
            if MIN_BET * 2 <= self.bankroll:
                total_bet = MIN_BET * 2
            else:
                return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, total_bet, self.profit_target, "Dual bet")

    def simulate_round(self, total_bet: float, multiplier: float) -> float:
        """Simula o resultado da aposta dupla."""
        safety_bet = total_bet / 2
        profit_bet = total_bet / 2

        profit = 0.0

        # Safety bet
        if multiplier >= self.safety_target:
            profit += safety_bet * (self.safety_target - 1)
        else:
            profit -= safety_bet

        # Profit bet
        if multiplier >= self.profit_target:
            profit += profit_bet * (self.profit_target - 1)
        else:
            profit -= profit_bet

        return profit

    def on_round_result(self, decision: BetDecision, round_data: RoundData, won: bool, profit: float):
        # Atualizar apostas baseado em wins consecutivos
        if self.increase_after_wins > 0 and self.consecutive_wins >= self.increase_after_wins:
            self.current_safety_bet = min(
                self.base_safety_bet * self.increase_multiplier,
                self.bankroll * 0.1
            )
            self.current_profit_bet = min(
                self.base_profit_bet * self.increase_multiplier,
                self.bankroll * 0.1
            )
        else:
            self.current_safety_bet = self.base_safety_bet
            self.current_profit_bet = self.base_profit_bet

        super().on_round_result(decision, round_data, won, profit)

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "safety_target": self.safety_target,
            "profit_target": self.profit_target,
            "safety_bet": self.base_safety_bet,
            "profit_bet": self.base_profit_bet,
        }


class WaitForPatternStrategy(Strategy):
    """
    Espera por um padrão antes de apostar.
    Ex: esperar X rodadas abaixo de 2x antes de entrar.
    """

    def __init__(
        self,
        target: float = 2.0,
        bet_amount: float = 2.0,
        wait_for_streak: int = 3,  # Esperar X rodadas abaixo do threshold
        streak_threshold: float = 2.0,
        double_after_pattern: bool = False,  # Dobrar aposta após detectar padrão
        stop_loss_percent: float = 50.0,
        **kwargs
    ):
        super().__init__(name=f"WaitPattern_{wait_for_streak}x{streak_threshold}", **kwargs)
        self.target = target
        self.base_bet = bet_amount
        self.wait_for_streak = wait_for_streak
        self.streak_threshold = streak_threshold
        self.double_after_pattern = double_after_pattern
        self.stop_loss_percent = stop_loss_percent
        self.current_bet = bet_amount

    def reset(self):
        super().reset()
        self.current_bet = self.base_bet

    def _count_streak(self, rounds: List[RoundData]) -> int:
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

        if len(round_history) < self.wait_for_streak:
            return BetDecision(False, reason="Not enough history")

        streak = self._count_streak(round_history)

        if streak >= self.wait_for_streak:
            bet = self.current_bet
            if self.double_after_pattern and streak >= self.wait_for_streak:
                bet = min(self.current_bet * 2, self.bankroll * 0.2)

            if bet > self.bankroll:
                bet = min(self.base_bet, self.bankroll)

            if bet < MIN_BET:
                return BetDecision(False, reason="Bet below minimum")

            return BetDecision(True, bet, self.target,
                             f"Pattern detected: {streak} rounds below {self.streak_threshold}x")

        return BetDecision(False, reason=f"Waiting for pattern ({streak}/{self.wait_for_streak})")

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "target": self.target,
            "wait_for_streak": self.wait_for_streak,
            "streak_threshold": self.streak_threshold,
        }


class ConservativeProgressiveStrategy(Strategy):
    """
    Estratégia conservadora com progressão suave.
    - Começa com aposta mínima
    - Aumenta gradualmente após wins
    - Volta ao mínimo após loss
    """

    def __init__(
        self,
        target: float = 2.0,
        base_bet: float = 2.0,
        progression_factor: float = 1.5,  # Multiplicar aposta após win
        max_bet_multiplier: float = 3.0,  # Máximo de X vezes a aposta base
        reset_after_loss: bool = True,
        stop_loss_percent: float = 50.0,
        **kwargs
    ):
        super().__init__(name=f"Conservative_{target}x", **kwargs)
        self.target = target
        self.base_bet = base_bet
        self.progression_factor = progression_factor
        self.max_bet_multiplier = max_bet_multiplier
        self.reset_after_loss = reset_after_loss
        self.stop_loss_percent = stop_loss_percent
        self.current_bet = base_bet

    def reset(self):
        super().reset()
        self.current_bet = self.base_bet

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        if self.current_bet > self.bankroll:
            self.current_bet = min(self.base_bet, self.bankroll)

        if self.current_bet < MIN_BET:
            return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, self.current_bet, self.target, "Progressive bet")

    def on_round_result(self, decision: BetDecision, round_data: RoundData, won: bool, profit: float):
        super().on_round_result(decision, round_data, won, profit)

        if decision.should_bet:
            if won:
                # Aumentar aposta gradualmente
                self.current_bet = min(
                    self.current_bet * self.progression_factor,
                    self.base_bet * self.max_bet_multiplier
                )
            else:
                if self.reset_after_loss:
                    self.current_bet = self.base_bet

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "target": self.target,
            "base_bet": self.base_bet,
            "progression_factor": self.progression_factor,
            "max_bet_multiplier": self.max_bet_multiplier,
        }


class SkipAfterLossStrategy(Strategy):
    """
    Pula X rodadas após uma perda.
    Ideia: evitar sequências ruins.
    """

    def __init__(
        self,
        target: float = 2.0,
        bet_amount: float = 2.0,
        skip_rounds: int = 2,
        stop_loss_percent: float = 50.0,
        **kwargs
    ):
        super().__init__(name=f"SkipAfterLoss_{skip_rounds}", **kwargs)
        self.target = target
        self.bet_amount = bet_amount
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

        bet = min(self.bet_amount, self.bankroll)
        if bet < MIN_BET:
            return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, bet, self.target, "Normal bet")

    def on_round_result(self, decision: BetDecision, round_data: RoundData, won: bool, profit: float):
        super().on_round_result(decision, round_data, won, profit)

        if decision.should_bet and not won:
            self.rounds_to_skip = self.skip_rounds

    def get_params(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "target": self.target,
            "skip_rounds": self.skip_rounds,
        }


class SimpleBetEveryRound(Strategy):
    """
    Aposta simples em todas as rodadas.
    Baseline para comparação.
    """

    def __init__(
        self,
        target: float = 2.0,
        bet_amount: float = 2.0,
        stop_loss_percent: float = 50.0,
        **kwargs
    ):
        super().__init__(name=f"Simple_{target}x", **kwargs)
        self.target = target
        self.bet_amount = bet_amount
        self.stop_loss_percent = stop_loss_percent

    def decide(self, round_history: List[RoundData]) -> BetDecision:
        loss_percent = (self.initial_bankroll - self.bankroll) / self.initial_bankroll * 100
        if loss_percent >= self.stop_loss_percent:
            return BetDecision(False, reason="Stop loss triggered")

        bet = min(self.bet_amount, self.bankroll)
        if bet < MIN_BET:
            return BetDecision(False, reason="Insufficient bankroll")

        return BetDecision(True, bet, self.target, "Simple bet")

    def get_params(self) -> Dict[str, Any]:
        return {"name": self.name, "target": self.target, "bet_amount": self.bet_amount}


def run_realistic_backtest(engine: BacktestEngine, strategy: Strategy, n_rounds: int = ROUNDS_PER_SESSION):
    """
    Roda backtest realista simulando uma sessão de jogo.
    """
    strategy.reset()
    strategy.bankroll = INITIAL_BANKROLL
    strategy.initial_bankroll = INITIAL_BANKROLL

    rounds = engine.rounds[:n_rounds + 100]  # +100 for warmup

    for i, current_round in enumerate(rounds[100:n_rounds + 100]):
        round_history = rounds[:100 + i]
        decision = strategy.decide(round_history)

        if decision.should_bet:
            # Verificar se é DualBet (tem método especial)
            if hasattr(strategy, 'simulate_round'):
                profit = strategy.simulate_round(decision.bet_amount, current_round.multiplier)
                won = profit > 0
            else:
                won = current_round.multiplier >= decision.cashout_target
                if won:
                    profit = decision.bet_amount * (decision.cashout_target - 1)
                else:
                    profit = -decision.bet_amount

            strategy.on_round_result(decision, current_round, won, profit)

        if strategy.bankroll <= 0:
            break

    return calculate_metrics(strategy.history, INITIAL_BANKROLL, n_rounds)


def run_multiple_sessions(engine: BacktestEngine, strategy_class, strategy_params: dict, n_sessions: int = 10):
    """
    Roda múltiplas sessões de 10 horas para calcular média.
    """
    results = []
    total_rounds = len(engine.rounds)
    session_size = ROUNDS_PER_SESSION

    for session in range(n_sessions):
        # Usar diferentes janelas de dados
        start_idx = (session * session_size) % (total_rounds - session_size - 100)
        if start_idx < 0:
            start_idx = 0

        session_rounds = engine.rounds[start_idx:start_idx + session_size + 100]

        strategy = strategy_class(**strategy_params, initial_bankroll=INITIAL_BANKROLL)
        strategy.reset()
        strategy.bankroll = INITIAL_BANKROLL
        strategy.initial_bankroll = INITIAL_BANKROLL

        for i, current_round in enumerate(session_rounds[100:]):
            if i >= session_size:
                break

            round_history = session_rounds[:100 + i]
            decision = strategy.decide(round_history)

            if decision.should_bet:
                if hasattr(strategy, 'simulate_round'):
                    profit = strategy.simulate_round(decision.bet_amount, current_round.multiplier)
                    won = profit > 0
                else:
                    won = current_round.multiplier >= decision.cashout_target
                    if won:
                        profit = decision.bet_amount * (decision.cashout_target - 1)
                    else:
                        profit = -decision.bet_amount

                strategy.on_round_result(decision, current_round, won, profit)

            if strategy.bankroll <= 0:
                break

        results.append({
            "session": session + 1,
            "final_bankroll": strategy.bankroll,
            "profit": strategy.bankroll - INITIAL_BANKROLL,
            "bets_made": strategy.total_bets,
            "wins": strategy.total_wins,
            "win_rate": strategy.total_wins / max(strategy.total_bets, 1),
        })

    return results


def main():
    print("=" * 70)
    print("  TESTE REALISTA DE ESTRATÉGIAS")
    print("=" * 70)
    print(f"\n  Configurações:")
    print(f"    Banca inicial:    R${INITIAL_BANKROLL:.2f}")
    print(f"    Aposta mínima:    R${MIN_BET:.2f}")
    print(f"    Rodadas/hora:     {ROUNDS_PER_HOUR}")
    print(f"    Horas simuladas:  {HOURS_TO_SIMULATE}")
    print(f"    Total rodadas:    {ROUNDS_PER_SESSION}")
    print()

    engine = BacktestEngine()

    # Estratégias para testar
    strategies = [
        # Sua estratégia atual (dual bet 2x/3x)
        ("DualBet 2x/3x (sua estratégia)", DualBetStrategy, {
            "safety_target": 2.0, "profit_target": 3.0,
            "safety_bet": 2.0, "profit_bet": 2.0
        }),

        # Variações do dual bet
        ("DualBet 1.5x/2.5x", DualBetStrategy, {
            "safety_target": 1.5, "profit_target": 2.5,
            "safety_bet": 2.0, "profit_bet": 2.0
        }),
        ("DualBet 1.5x/3x", DualBetStrategy, {
            "safety_target": 1.5, "profit_target": 3.0,
            "safety_bet": 2.0, "profit_bet": 2.0
        }),
        ("DualBet 1.3x/2x", DualBetStrategy, {
            "safety_target": 1.3, "profit_target": 2.0,
            "safety_bet": 2.0, "profit_bet": 2.0
        }),

        # Aposta simples em diferentes targets
        ("Simple 2x (R$2)", SimpleBetEveryRound, {"target": 2.0, "bet_amount": 2.0}),
        ("Simple 1.5x (R$2)", SimpleBetEveryRound, {"target": 1.5, "bet_amount": 2.0}),
        ("Simple 1.3x (R$2)", SimpleBetEveryRound, {"target": 1.3, "bet_amount": 2.0}),

        # Esperar por padrão
        ("WaitPattern 3x<2x → 2x", WaitForPatternStrategy, {
            "target": 2.0, "bet_amount": 2.0,
            "wait_for_streak": 3, "streak_threshold": 2.0
        }),
        ("WaitPattern 4x<2x → 2x (dobra)", WaitForPatternStrategy, {
            "target": 2.0, "bet_amount": 2.0,
            "wait_for_streak": 4, "streak_threshold": 2.0,
            "double_after_pattern": True
        }),
        ("WaitPattern 3x<1.5x → 1.5x", WaitForPatternStrategy, {
            "target": 1.5, "bet_amount": 2.0,
            "wait_for_streak": 3, "streak_threshold": 1.5
        }),

        # Conservadora progressiva
        ("Conservative 2x (prog 1.5x)", ConservativeProgressiveStrategy, {
            "target": 2.0, "base_bet": 2.0,
            "progression_factor": 1.5, "max_bet_multiplier": 3.0
        }),
        ("Conservative 1.5x (prog 1.5x)", ConservativeProgressiveStrategy, {
            "target": 1.5, "base_bet": 2.0,
            "progression_factor": 1.5, "max_bet_multiplier": 2.0
        }),

        # Skip após loss
        ("SkipAfterLoss 2 rounds (2x)", SkipAfterLossStrategy, {
            "target": 2.0, "bet_amount": 2.0, "skip_rounds": 2
        }),
        ("SkipAfterLoss 3 rounds (2x)", SkipAfterLossStrategy, {
            "target": 2.0, "bet_amount": 2.0, "skip_rounds": 3
        }),

        # Híbridas - combinando padrão + progressão
        ("Híbrida: Pattern + Prog 2x", WaitForPatternStrategy, {
            "target": 2.0, "bet_amount": 2.0,
            "wait_for_streak": 2, "streak_threshold": 2.0,
            "double_after_pattern": True
        }),
        ("Híbrida: Pattern 3 + 1.5x", WaitForPatternStrategy, {
            "target": 1.5, "bet_amount": 2.0,
            "wait_for_streak": 3, "streak_threshold": 1.5
        }),
    ]

    print("\n" + "=" * 70)
    print("  RESULTADOS (Sessão única de 10 horas)")
    print("=" * 70)

    results_table = []

    for name, strategy_class, params in strategies:
        strategy = strategy_class(**params, initial_bankroll=INITIAL_BANKROLL)
        metrics = run_realistic_backtest(engine, strategy)

        profit = metrics.final_bankroll - INITIAL_BANKROLL
        results_table.append({
            "name": name,
            "profit": profit,
            "final": metrics.final_bankroll,
            "bets": metrics.rounds_bet,
            "win_rate": metrics.win_rate,
            "max_dd": metrics.max_drawdown_percent,
        })

    # Ordenar por lucro
    results_table.sort(key=lambda x: x["profit"], reverse=True)

    print(f"\n{'Estratégia':<35} {'Lucro':>10} {'Final':>10} {'Apostas':>8} {'Win%':>7} {'MaxDD':>7}")
    print("-" * 85)

    for r in results_table:
        print(f"{r['name']:<35} R${r['profit']:>+8.2f} R${r['final']:>8.2f} {r['bets']:>8} {r['win_rate']*100:>6.1f}% {r['max_dd']:>6.1f}%")

    # Análise das melhores
    print("\n" + "=" * 70)
    print("  ANÁLISE DETALHADA - TOP 5 ESTRATÉGIAS")
    print("=" * 70)

    for i, r in enumerate(results_table[:5]):
        strategy_info = next(s for s in strategies if s[0] == r["name"])
        strategy = strategy_info[1](**strategy_info[2], initial_bankroll=INITIAL_BANKROLL)
        metrics = run_realistic_backtest(engine, strategy)

        print(f"\n#{i+1}: {r['name']}")
        print(f"    Lucro:              R${metrics.total_profit:+.2f}")
        print(f"    Banca final:        R${metrics.final_bankroll:.2f}")
        print(f"    Apostas feitas:     {metrics.rounds_bet}")
        print(f"    Win rate:           {metrics.win_rate*100:.1f}%")
        print(f"    Max drawdown:       {metrics.max_drawdown_percent:.1f}%")
        print(f"    Expectancy/bet:     R${metrics.expectancy:.3f}")
        print(f"    Lucro/hora:         R${metrics.total_profit / HOURS_TO_SIMULATE:.2f}")

    # Simulação de múltiplas sessões para as top 3
    print("\n" + "=" * 70)
    print("  SIMULAÇÃO DE MÚLTIPLAS SESSÕES (10 sessões de 10h cada)")
    print("=" * 70)

    for i, r in enumerate(results_table[:3]):
        strategy_info = next(s for s in strategies if s[0] == r["name"])
        sessions = run_multiple_sessions(engine, strategy_info[1], strategy_info[2], n_sessions=10)

        profits = [s["profit"] for s in sessions]
        final_bankrolls = [s["final_bankroll"] for s in sessions]

        print(f"\n{r['name']}:")
        print(f"    Lucro médio/sessão:     R${np.mean(profits):+.2f}")
        print(f"    Lucro mediano:          R${np.median(profits):+.2f}")
        print(f"    Desvio padrão:          R${np.std(profits):.2f}")
        print(f"    Melhor sessão:          R${np.max(profits):+.2f}")
        print(f"    Pior sessão:            R${np.min(profits):+.2f}")
        print(f"    Sessões lucrativas:     {sum(1 for p in profits if p > 0)}/10")
        print(f"    Falências:              {sum(1 for f in final_bankrolls if f <= 0)}/10")

    print("\n" + "=" * 70)
    print("  CONCLUSÕES")
    print("=" * 70)

    best = results_table[0]
    print(f"""
    1. MELHOR ESTRATÉGIA: {best['name']}
       - Lucro em 10h: R${best['profit']:+.2f}
       - Win rate: {best['win_rate']*100:.1f}%

    2. SUA ESTRATÉGIA ATUAL (DualBet 2x/3x):
       {next(r for r in results_table if 'sua estratégia' in r['name'])['profit']:+.2f} em 10h

    3. INSIGHTS:
       - Targets mais baixos (1.3x-1.5x) tendem a ser mais consistentes
       - Estratégias que esperam por padrões reduzem exposição
       - Skip após loss pode ajudar a evitar sequências ruins
    """)


if __name__ == "__main__":
    main()
