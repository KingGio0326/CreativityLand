"""Test locale del position manager.

Esegue gli stessi step del workflow position_manager.yml:
  1. Ratchet check su tutte le posizioni aperte
  2. (Trailing stop e orphan check vengono saltati in locale per sicurezza)

Uso:
    python scripts/run_position_manager.py
"""
from dotenv import load_dotenv

load_dotenv()

from engine.ratchet_manager import RatchetManager

manager = RatchetManager()
results = manager.check_all_positions()

for r in results:
    action = r.get("action", "skip")
    ticker = r.get("ticker", "?")
    reason = r.get("reason", "")
    progress = r.get("progress_pct")

    if action == "ratcheted":
        label = f"RATCHETED #{r.get('ratchet_count', '?')} | SL {r.get('old_sl')} → {r.get('new_sl')} | TP {r.get('old_tp')} → {r.get('new_tp')}"
    elif action in ("ratcheted_tp_only", "ratcheted_db_only"):
        label = f"{action.upper()} | {reason}"
    elif action == "skipped":
        label = f"SKIPPED | {reason}"
    else:
        label = f"no action | {reason}"

    if progress is not None:
        label += f" (progress {progress:.1f}%)"

    print(f"{ticker:12s}: {label}")

print(f"\nProcessed {len(results)} positions")
