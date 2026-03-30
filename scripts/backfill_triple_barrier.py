"""Backfill triple barrier labels for all fully-evaluated BUY/SELL signals.

Usage:
    python scripts/backfill_triple_barrier.py [--dry-run]
"""

import os
import sys
from collections import Counter
from datetime import datetime

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.triple_barrier import TripleBarrierLabeler


def main():
    dry_run = "--dry-run" in sys.argv

    supabase = create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_KEY", ""),
    )

    # Fetch all fully-evaluated BUY/SELL signals without barrier labels
    result = (
        supabase.table("signal_evaluations")
        .select("*")
        .eq("fully_evaluated", True)
        .is_("barrier_label", "null")
        .execute()
    )

    evals = [
        e for e in (result.data or [])
        if e.get("signal_type") in ("BUY", "SELL")
    ]
    print(f"Segnali da processare: {len(evals)}")

    if not evals:
        print("Nessun segnale da backfillare.")
        return

    tb = TripleBarrierLabeler()

    stats = Counter()
    hit_hours = []
    errors = 0

    for i, ev in enumerate(evals, 1):
        ticker = ev["ticker"]
        sig_type = ev["signal_type"]
        entry_price = ev.get("entry_price")
        entry_date_str = ev.get("entry_date")

        if not entry_price or not entry_date_str:
            print(f"  [{i}/{len(evals)}] {ticker}: SKIP (no entry_price/date)")
            errors += 1
            continue

        entry_date = datetime.fromisoformat(
            str(entry_date_str).replace("Z", "")
        ).replace(tzinfo=None)

        # Fetch ATR and regime from signals table
        sig_row = (
            supabase.table("signals")
            .select("atr_14, market_regime")
            .eq("id", ev.get("signal_id", ""))
            .limit(1)
            .execute()
        )
        sig_data = sig_row.data[0] if sig_row.data else {}
        atr_14 = sig_data.get("atr_14")
        regime = sig_data.get("market_regime", "neutral")

        try:
            barriers = tb.compute_barriers(
                ticker=ticker,
                entry_price=entry_price,
                entry_date=entry_date,
                atr_14=atr_14,
                regime=regime,
            )
            tb_result = tb.evaluate_signal(
                ticker=ticker,
                entry_price=entry_price,
                entry_date=entry_date,
                barriers=barriers,
            )
        except Exception as e:
            print(f"  [{i}/{len(evals)}] {ticker}: ERROR {e}")
            errors += 1
            continue

        label = tb_result["label"]
        hit = tb_result["barrier_hit"]
        hours = tb_result["time_to_hit_hours"]
        mfe = tb_result["max_favorable"]
        mae = tb_result["max_adverse"]

        stats[hit] += 1
        if hours is not None:
            hit_hours.append(hours)

        # Check if signal direction was correct per barrier label
        correct = (sig_type == "BUY" and label == 1) or (sig_type == "SELL" and label == -1)
        marker = "OK" if correct else ("WRONG" if label != 0 else "NEUTRAL")

        print(
            f"  [{i}/{len(evals)}] {ticker} {sig_type} "
            f"-> label={label} hit={hit} hours={hours} "
            f"MFE={mfe:.2f}% MAE={mae:.2f}% [{marker}]"
        )

        if not dry_run:
            supabase.table("signal_evaluations").update({
                "barrier_label": label,
                "barrier_hit": hit,
                "barrier_hit_hours": hours,
                "max_favorable_pct": mfe,
                "max_adverse_pct": mae,
            }).eq("id", ev["id"]).execute()

    # Summary
    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    print(f"Processati: {len(evals) - errors}")
    print(f"Errori: {errors}")
    print(f"\nBarrier hits:")
    print(f"  Upper (TP):    {stats.get('upper', 0)}")
    print(f"  Lower (SL):    {stats.get('lower', 0)}")
    print(f"  Vertical:      {stats.get('vertical', 0)}")

    if hit_hours:
        import numpy as np
        hours_arr = np.array(hit_hours)
        print(f"\nTempo al hit:")
        print(f"  Media:   {np.mean(hours_arr):.1f}h")
        print(f"  Mediana: {np.median(hours_arr):.1f}h")
        print(f"  Min:     {np.min(hours_arr):.1f}h")
        print(f"  Max:     {np.max(hours_arr):.1f}h")

    if dry_run:
        print("\n[DRY RUN] Nessun dato salvato.")
    else:
        print(f"\nDati salvati in signal_evaluations.")


if __name__ == "__main__":
    main()
