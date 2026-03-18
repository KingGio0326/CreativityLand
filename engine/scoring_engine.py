import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta

import numpy as np
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logger = logging.getLogger("scoring_engine")

AGENT_WEIGHTS = {
    "sentiment": 0.22,
    "fundamental": 0.18,
    "technical": 0.15,
    "momentum": 0.12,
    "ml_prediction": 0.11,
    "macro": 0.08,
    "mean_reversion": 0.06,
    "research": 0.00,
    "risk": 0.00,
}


class ScoringEngine:

    def __init__(self):
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

    def get_price_at(self, ticker: str, target_date: datetime) -> float | None:
        """Recupera prezzo di chiusura piu vicino alla data target."""
        start = (target_date - timedelta(days=3)).strftime("%Y-%m-%d")
        end = (target_date + timedelta(days=3)).strftime("%Y-%m-%d")
        try:
            df = yf.download(
                ticker, start=start, end=end,
                progress=False, auto_adjust=True,
            )
            if df.empty:
                return None
            df.index = df.index.tz_localize(None)
            target_naive = target_date.replace(tzinfo=None)
            deltas = [(idx - target_naive).total_seconds() for idx in df.index]
            closest_idx = int(np.argmin([abs(d) for d in deltas]))
            return float(df["Close"].values.flatten()[closest_idx])
        except Exception as e:
            logger.warning("Price fetch error %s: %s", ticker, e)
            return None

    def calculate_score(
        self,
        signal_type: str,
        confidence: float,
        actual_return: float,
    ) -> float:
        """
        Score formula:
        - base: rendimento effettivo pesato per confidence
        - direction_bonus: +1.0 se direzione corretta, -1.0 se sbagliata
        - HOLD: bonus +0.5 se movimento < 2%, -0.5 altrimenti
        """
        conf = confidence / 100.0 if confidence > 1 else confidence

        if signal_type == "BUY":
            direction_bonus = 1.0 if actual_return > 0 else -1.0
        elif signal_type == "SELL":
            direction_bonus = 1.0 if actual_return < 0 else -1.0
        else:  # HOLD
            direction_bonus = 0.5 if abs(actual_return) < 2.0 else -0.5

        score = (actual_return * conf) + direction_bonus
        return round(score, 4)

    def register_signal(self, signal: dict) -> int | None:
        """
        Registra un nuovo segnale appena generato.
        Ritorna l'ID della valutazione creata.
        """
        ticker = signal.get("ticker")
        sig_type = signal.get("signal")
        confidence = signal.get("confidence", 0)
        entry_date = signal.get("created_at", datetime.now().isoformat())

        entry_price = self.get_price_at(
            ticker,
            datetime.fromisoformat(str(entry_date).replace("Z", "")),
        )

        # Estrai agent scores dal reasoning se disponibili
        agent_scores = {}
        reasoning = signal.get("reasoning", [])
        for line in reasoning:
            for agent in AGENT_WEIGHTS:
                if agent.lower() in line.lower():
                    agent_scores[agent] = confidence

        result = (
            self.supabase.table("signal_evaluations")
            .insert({
                "signal_id": str(signal.get("id", "")),
                "ticker": ticker,
                "signal_type": sig_type,
                "confidence": confidence,
                "entry_price": entry_price,
                "entry_date": str(entry_date),
                "agent_scores": agent_scores,
                "fully_evaluated": False,
            })
            .execute()
        )

        eval_id = result.data[0]["id"] if result.data else None
        logger.info(
            "Segnale registrato: %s %s (%.0f%%) @ $%s -> eval_id=%s",
            ticker, sig_type, (confidence or 0) * 100, entry_price, eval_id,
        )
        return eval_id

    def evaluate_pending(self) -> int:
        """
        Aggiorna i prezzi futuri per tutti i segnali
        non ancora completamente valutati.
        Chiamato ad ogni run del bot.
        """
        pending = (
            self.supabase.table("signal_evaluations")
            .select("*")
            .eq("fully_evaluated", False)
            .execute()
        )

        updated = 0
        for ev in pending.data or []:
            entry_date = datetime.fromisoformat(
                str(ev["entry_date"]).replace("Z", "")
            )
            entry_price = ev.get("entry_price")
            if not entry_price:
                continue

            now = datetime.now()
            diff = now - entry_date
            updates: dict = {}

            horizons = {
                "6h": 6 / 24,
                "24h": 1,
                "72h": 3,
                "168h": 7,
            }

            all_done = True
            for label, days in horizons.items():
                if diff.total_seconds() / 86400 >= days:
                    if ev.get(f"price_{label}") is None:
                        target = entry_date + timedelta(days=days)
                        price = self.get_price_at(ev["ticker"], target)
                        if price:
                            ret = (price - entry_price) / entry_price * 100
                            score = self.calculate_score(
                                ev["signal_type"],
                                ev["confidence"],
                                ret,
                            )
                            updates[f"price_{label}"] = price
                            updates[f"return_{label}"] = round(ret, 4)
                            updates[f"score_{label}"] = score
                else:
                    all_done = False

            if updates:
                if all_done:
                    updates["fully_evaluated"] = True
                (
                    self.supabase.table("signal_evaluations")
                    .update(updates)
                    .eq("id", ev["id"])
                    .execute()
                )
                updated += 1

        logger.info("Valutazioni aggiornate: %d", updated)
        return updated

    def update_agent_performance(self):
        """
        Ricalcola le statistiche aggregate per ogni agente
        basandosi sulle valutazioni completate.
        """
        completed = (
            self.supabase.table("signal_evaluations")
            .select("*")
            .not_.is_("score_168h", "null")
            .execute()
        )

        if not completed.data:
            logger.info("Nessuna valutazione completata ancora")
            return

        stats: dict = defaultdict(lambda: {
            "scores": [], "correct": 0, "total": 0,
        })

        for ev in completed.data:
            key = f"pipeline_{ev['ticker']}"
            score = ev.get("score_168h", 0) or 0
            stats[key]["scores"].append(score)
            stats[key]["total"] += 1
            if score > 0:
                stats[key]["correct"] += 1

        today = datetime.now().date().isoformat()
        for key, data in stats.items():
            _, ticker = key.split("_", 1)
            scores = data["scores"]
            if not scores:
                continue

            cumulative = sum(scores)
            avg = np.mean(scores)
            hit_rate = data["correct"] / data["total"]

            (
                self.supabase.table("agent_performance")
                .upsert({
                    "agent_name": "pipeline",
                    "ticker": ticker,
                    "date": today,
                    "signals_total": data["total"],
                    "signals_correct": data["correct"],
                    "hit_rate": round(hit_rate, 4),
                    "avg_score": round(float(avg), 4),
                    "cumulative_score": round(float(cumulative), 4),
                })
                .execute()
            )

        logger.info("Performance aggiornata per %d ticker", len(stats))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    se = ScoringEngine()
    print("Valutando segnali pendenti...")
    n = se.evaluate_pending()
    print(f"Aggiornati: {n}")
    se.update_agent_performance()
    print("Performance aggiornata.")
