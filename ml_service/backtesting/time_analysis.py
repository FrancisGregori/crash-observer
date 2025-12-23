#!/usr/bin/env python3
"""
Análise de períodos do dia para identificar melhores horários para apostar.
"""

import sqlite3
from pathlib import Path
from datetime import datetime
import numpy as np
from collections import defaultdict

# Configurações
DB_PATH = Path(__file__).parent.parent.parent / "data" / "crash_stats.db"

# Definição dos períodos
PERIODS = {
    "Madrugada (00-06h)": (0, 6),
    "Manhã (06-12h)": (6, 12),
    "Tarde (12-18h)": (12, 18),
    "Noite (18-00h)": (18, 24),
}

DETAILED_PERIODS = {
    "00-03h": (0, 3),
    "03-06h": (3, 6),
    "06-09h": (6, 9),
    "09-12h": (9, 12),
    "12-15h": (12, 15),
    "15-18h": (15, 18),
    "18-21h": (18, 21),
    "21-00h": (21, 24),
}


def load_data():
    """Carrega dados do banco."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT createdAt, multiplier, betCount, totalBet, totalWin
        FROM rounds
        ORDER BY createdAt ASC
    """)

    rows = cursor.fetchall()
    conn.close()

    data = []
    for row in rows:
        created_at = row[0]
        # Parse ISO format
        try:
            dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            # Converter para horário local (assumindo UTC-3 para Brasil)
            hour = (dt.hour - 3) % 24
        except:
            continue

        data.append({
            "datetime": created_at,
            "hour": hour,
            "multiplier": row[1],
            "bet_count": row[2],
            "total_bet": row[3],
            "total_win": row[4],
        })

    return data


def analyze_by_hour(data):
    """Analisa estatísticas por hora."""
    by_hour = defaultdict(list)

    for d in data:
        by_hour[d["hour"]].append(d["multiplier"])

    results = {}
    for hour in range(24):
        mults = by_hour.get(hour, [])
        if not mults:
            continue

        results[hour] = {
            "count": len(mults),
            "avg": np.mean(mults),
            "median": np.median(mults),
            "std": np.std(mults),
            "min": np.min(mults),
            "max": np.max(mults),
            "pct_gt_1_5x": sum(1 for m in mults if m >= 1.5) / len(mults) * 100,
            "pct_gt_2x": sum(1 for m in mults if m >= 2.0) / len(mults) * 100,
            "pct_gt_3x": sum(1 for m in mults if m >= 3.0) / len(mults) * 100,
            "pct_gt_5x": sum(1 for m in mults if m >= 5.0) / len(mults) * 100,
            "pct_early_crash": sum(1 for m in mults if m <= 1.2) / len(mults) * 100,
        }

    return results


def analyze_by_period(data, periods):
    """Analisa estatísticas por período."""
    by_period = defaultdict(list)

    for d in data:
        hour = d["hour"]
        for period_name, (start, end) in periods.items():
            if start <= hour < end:
                by_period[period_name].append(d["multiplier"])
                break

    results = {}
    for period_name, mults in by_period.items():
        if not mults:
            continue

        results[period_name] = {
            "count": len(mults),
            "avg": np.mean(mults),
            "median": np.median(mults),
            "std": np.std(mults),
            "pct_gt_1_5x": sum(1 for m in mults if m >= 1.5) / len(mults) * 100,
            "pct_gt_2x": sum(1 for m in mults if m >= 2.0) / len(mults) * 100,
            "pct_gt_3x": sum(1 for m in mults if m >= 3.0) / len(mults) * 100,
            "pct_gt_5x": sum(1 for m in mults if m >= 5.0) / len(mults) * 100,
            "pct_early_crash": sum(1 for m in mults if m <= 1.2) / len(mults) * 100,
        }

    return results


def simulate_strategy_by_period(data, periods, target=1.5, bet=2.0):
    """
    Simula uma estratégia simples em cada período.
    Retorna o lucro/prejuízo por período.
    """
    by_period = defaultdict(list)

    for d in data:
        hour = d["hour"]
        for period_name, (start, end) in periods.items():
            if start <= hour < end:
                by_period[period_name].append(d["multiplier"])
                break

    results = {}
    for period_name, mults in by_period.items():
        wins = 0
        losses = 0
        profit = 0

        for m in mults:
            if m >= target:
                wins += 1
                profit += bet * (target - 1)
            else:
                losses += 1
                profit -= bet

        total = wins + losses
        results[period_name] = {
            "total_rounds": total,
            "wins": wins,
            "losses": losses,
            "win_rate": wins / total * 100 if total > 0 else 0,
            "profit": profit,
            "roi": profit / (total * bet) * 100 if total > 0 else 0,
        }

    return results


def print_analysis():
    """Imprime análise completa."""
    print("=" * 80)
    print("  ANÁLISE DE PERÍODOS DO DIA")
    print("=" * 80)

    print("\nCarregando dados...")
    data = load_data()
    print(f"Total de rodadas: {len(data):,}")

    if not data:
        print("Sem dados para analisar!")
        return

    # Análise por período amplo
    print("\n" + "=" * 80)
    print("  ESTATÍSTICAS POR PERÍODO (Horário de Brasília)")
    print("=" * 80)

    period_stats = analyze_by_period(data, PERIODS)

    print(f"\n{'Período':<25} {'Rounds':>8} {'Média':>8} {'Mediana':>8} {'>1.5x':>8} {'>2x':>8} {'<1.2x':>8}")
    print("-" * 80)

    for period, stats in sorted(period_stats.items(), key=lambda x: PERIODS.get(x[0], (0,0))[0]):
        print(f"{period:<25} {stats['count']:>8,} {stats['avg']:>8.2f}x {stats['median']:>8.2f}x "
              f"{stats['pct_gt_1_5x']:>7.1f}% {stats['pct_gt_2x']:>7.1f}% {stats['pct_early_crash']:>7.1f}%")

    # Análise por período detalhado
    print("\n" + "=" * 80)
    print("  ESTATÍSTICAS DETALHADAS (Intervalos de 3h)")
    print("=" * 80)

    detailed_stats = analyze_by_period(data, DETAILED_PERIODS)

    print(f"\n{'Período':<15} {'Rounds':>8} {'Média':>8} {'>1.5x':>8} {'>2x':>8} {'>3x':>8} {'<1.2x':>8}")
    print("-" * 70)

    for period, stats in sorted(detailed_stats.items(), key=lambda x: DETAILED_PERIODS.get(x[0], (0,0))[0]):
        print(f"{period:<15} {stats['count']:>8,} {stats['avg']:>8.2f}x "
              f"{stats['pct_gt_1_5x']:>7.1f}% {stats['pct_gt_2x']:>7.1f}% "
              f"{stats['pct_gt_3x']:>7.1f}% {stats['pct_early_crash']:>7.1f}%")

    # Análise por hora
    print("\n" + "=" * 80)
    print("  ESTATÍSTICAS POR HORA")
    print("=" * 80)

    hour_stats = analyze_by_hour(data)

    print(f"\n{'Hora':<8} {'Rounds':>8} {'Média':>8} {'>1.5x':>8} {'>2x':>8} {'<1.2x':>8} {'Qualidade':>10}")
    print("-" * 70)

    # Calcular score de qualidade (maior % >2x e menor % early crash)
    for hour in range(24):
        if hour not in hour_stats:
            continue
        stats = hour_stats[hour]
        # Score: mais >2x é bom, menos early crash é bom
        quality = stats['pct_gt_2x'] - stats['pct_early_crash']
        stats['quality'] = quality

    for hour in range(24):
        if hour not in hour_stats:
            continue
        stats = hour_stats[hour]
        quality_str = "★★★" if stats['quality'] > 35 else "★★" if stats['quality'] > 30 else "★" if stats['quality'] > 25 else ""
        print(f"{hour:02d}:00    {stats['count']:>8,} {stats['avg']:>8.2f}x "
              f"{stats['pct_gt_1_5x']:>7.1f}% {stats['pct_gt_2x']:>7.1f}% "
              f"{stats['pct_early_crash']:>7.1f}% {quality_str:>10}")

    # Simulação de estratégia por período
    print("\n" + "=" * 80)
    print("  SIMULAÇÃO: Estratégia 1.5x por Período")
    print("  (Aposta R$2, target 1.5x)")
    print("=" * 80)

    strategy_results = simulate_strategy_by_period(data, PERIODS, target=1.5, bet=2.0)

    print(f"\n{'Período':<25} {'Rounds':>8} {'Wins':>8} {'Win%':>8} {'Lucro':>12} {'ROI':>8}")
    print("-" * 75)

    for period, stats in sorted(strategy_results.items(), key=lambda x: x[1]['roi'], reverse=True):
        profit_str = f"R${stats['profit']:+.2f}"
        print(f"{period:<25} {stats['total_rounds']:>8,} {stats['wins']:>8,} "
              f"{stats['win_rate']:>7.1f}% {profit_str:>12} {stats['roi']:>+7.1f}%")

    # Simulação detalhada
    print("\n" + "=" * 80)
    print("  SIMULAÇÃO DETALHADA: Estratégia 1.5x (Intervalos de 3h)")
    print("=" * 80)

    detailed_strategy = simulate_strategy_by_period(data, DETAILED_PERIODS, target=1.5, bet=2.0)

    print(f"\n{'Período':<15} {'Rounds':>8} {'Win%':>8} {'Lucro':>12} {'ROI':>8}")
    print("-" * 55)

    sorted_periods = sorted(detailed_strategy.items(), key=lambda x: x[1]['roi'], reverse=True)

    for period, stats in sorted_periods:
        profit_str = f"R${stats['profit']:+.2f}"
        roi_color = "+" if stats['roi'] > 0 else ""
        print(f"{period:<15} {stats['total_rounds']:>8,} "
              f"{stats['win_rate']:>7.1f}% {profit_str:>12} {stats['roi']:>+7.1f}%")

    # Ranking e recomendações
    print("\n" + "=" * 80)
    print("  RANKING E RECOMENDAÇÕES")
    print("=" * 80)

    # Melhores horários (por ROI)
    best_periods = sorted_periods[:3]
    worst_periods = sorted_periods[-3:]

    print("\n🏆 MELHORES HORÁRIOS (maior ROI com 1.5x):")
    for i, (period, stats) in enumerate(best_periods, 1):
        print(f"   {i}. {period}: ROI {stats['roi']:+.1f}%, Win rate {stats['win_rate']:.1f}%")

    print("\n⚠️ PIORES HORÁRIOS (menor ROI com 1.5x):")
    for i, (period, stats) in enumerate(reversed(worst_periods), 1):
        print(f"   {i}. {period}: ROI {stats['roi']:+.1f}%, Win rate {stats['win_rate']:.1f}%")

    # Analisar por dia da semana também
    print("\n" + "=" * 80)
    print("  ANÁLISE POR DIA DA SEMANA")
    print("=" * 80)

    by_weekday = defaultdict(list)
    weekday_names = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

    for d in data:
        try:
            dt = datetime.fromisoformat(d["datetime"].replace('Z', '+00:00'))
            weekday = dt.weekday()
            by_weekday[weekday].append(d["multiplier"])
        except:
            continue

    print(f"\n{'Dia':<12} {'Rounds':>8} {'Média':>8} {'>1.5x':>8} {'>2x':>8} {'<1.2x':>8}")
    print("-" * 55)

    weekday_results = {}
    for weekday in range(7):
        mults = by_weekday.get(weekday, [])
        if not mults:
            continue

        weekday_results[weekday] = {
            "name": weekday_names[weekday],
            "count": len(mults),
            "avg": np.mean(mults),
            "pct_gt_1_5x": sum(1 for m in mults if m >= 1.5) / len(mults) * 100,
            "pct_gt_2x": sum(1 for m in mults if m >= 2.0) / len(mults) * 100,
            "pct_early_crash": sum(1 for m in mults if m <= 1.2) / len(mults) * 100,
        }

        stats = weekday_results[weekday]
        print(f"{stats['name']:<12} {stats['count']:>8,} {stats['avg']:>8.2f}x "
              f"{stats['pct_gt_1_5x']:>7.1f}% {stats['pct_gt_2x']:>7.1f}% "
              f"{stats['pct_early_crash']:>7.1f}%")

    print("\n" + "=" * 80)
    print("  CONCLUSÃO")
    print("=" * 80)

    if best_periods:
        best = best_periods[0]
        print(f"""
    Com base nos dados analisados:

    ✅ MELHOR HORÁRIO: {best[0]}
       - ROI: {best[1]['roi']:+.1f}%
       - Win Rate: {best[1]['win_rate']:.1f}%
       - Total de rodadas analisadas: {best[1]['total_rounds']:,}

    ❌ EVITAR: {worst_periods[-1][0]}
       - ROI: {worst_periods[-1][1]['roi']:+.1f}%
       - Win Rate: {worst_periods[-1][1]['win_rate']:.1f}%

    📊 OBSERVAÇÕES:
       - Os dados são de um período limitado ({len(data):,} rodadas)
       - Variações podem ocorrer dia a dia
       - Use esses horários como referência, não como garantia
    """)


if __name__ == "__main__":
    print_analysis()
