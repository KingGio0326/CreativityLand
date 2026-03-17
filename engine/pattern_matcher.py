"""Find historically similar price patterns using pgvector cosine similarity."""

import json
import logging
import os

import numpy as np
from dotenv import load_dotenv
from supabase import create_client

from engine.pattern_extractor import PatternExtractor

load_dotenv()
logger = logging.getLogger("pattern_matcher")


class PatternMatcher:

    def __init__(self):
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
        self.extractor = PatternExtractor()

    def find_similar_patterns(self, ticker: str, top_k: int = 10) -> dict:
        """Find historical patterns similar to the current one."""
        current = self.extractor.get_current_pattern(ticker)
        if not current:
            return {"error": "Dati non disponibili"}

        vector = current["normalized"]
        current_regime = current.get("market_regime", None)

        # Prima cerca nel regime corrente
        result = self.supabase.rpc(
            "match_patterns",
            {
                "query_vector": vector,
                "match_ticker": ticker,
                "match_count": top_k,
                "filter_regime": current_regime,
                "include_crises": True,
            },
        ).execute()

        similar = result.data or []

        # Se trova meno di 5 risultati, allarga a tutti i regimi
        if len(similar) < 5:
            result = self.supabase.rpc(
                "match_patterns",
                {
                    "query_vector": vector,
                    "match_ticker": ticker,
                    "match_count": top_k,
                    "filter_regime": None,
                    "include_crises": True,
                },
            ).execute()
            similar = result.data or []

        if not similar:
            return {
                "current": current,
                "similar": [],
                "analysis": self._empty_analysis(),
            }

        # Analyze outcomes of similar patterns
        outcomes_5d = [
            p["outcome_5d"] for p in similar if p.get("outcome_5d") is not None
        ]
        outcomes_10d = [
            p["outcome_10d"]
            for p in similar
            if p.get("outcome_10d") is not None
        ]
        outcomes_20d = [
            p["outcome_20d"]
            for p in similar
            if p.get("outcome_20d") is not None
        ]

        def stats(vals):
            if not vals:
                return {}
            arr = np.array(vals)
            return {
                "mean": round(float(arr.mean()), 2),
                "median": round(float(np.median(arr)), 2),
                "std": round(float(arr.std()), 2),
                "positive_rate": round(float((arr > 0).mean() * 100), 1),
                "count": len(vals),
            }

        best_match = similar[0] if similar else None

        analysis = {
            "patterns_found": len(similar),
            "best_similarity": (
                round(float(best_match.get("similarity", 0)), 4)
                if best_match
                else 0
            ),
            "best_match_date": (
                best_match.get("end_date") if best_match else None
            ),
            "outcomes": {
                "5d": stats(outcomes_5d),
                "10d": stats(outcomes_10d),
                "20d": stats(outcomes_20d),
            },
            "recommendation": self._generate_recommendation(
                stats(outcomes_10d)
            ),
        }

        return {
            "current": current,
            "similar": similar[:3],  # top 3 for UI
            "analysis": analysis,
        }

    def _generate_recommendation(self, stats_10d: dict) -> dict:
        if not stats_10d:
            return {"signal": "HOLD", "reason": "Dati insufficienti"}

        mean = stats_10d.get("mean", 0)
        pos_rt = stats_10d.get("positive_rate", 50)
        count = stats_10d.get("count", 0)

        if count < 3:
            return {
                "signal": "HOLD",
                "reason": f"Solo {count} pattern simili — confidenza bassa",
            }

        if mean > 2.0 and pos_rt > 65:
            signal = "BUY"
            reason = (
                f"Pattern simili hanno prodotto +{mean:.1f}% "
                f"in media nei 10gg successivi "
                f"({pos_rt:.0f}% dei casi positivi)"
            )
        elif mean < -2.0 and pos_rt < 35:
            signal = "SELL"
            reason = (
                f"Pattern simili hanno prodotto {mean:.1f}% "
                f"in media nei 10gg successivi "
                f"({100 - pos_rt:.0f}% dei casi negativi)"
            )
        else:
            signal = "HOLD"
            reason = (
                f"Pattern simili con rendimento medio {mean:.1f}% "
                f"— segnale non chiaro"
            )

        return {
            "signal": signal,
            "mean_return": mean,
            "positive_rate": pos_rt,
            "sample_size": count,
            "reason": reason,
        }

    def _empty_analysis(self) -> dict:
        return {
            "patterns_found": 0,
            "best_similarity": 0,
            "outcomes": {},
            "recommendation": {
                "signal": "HOLD",
                "reason": "Nessun pattern storico trovato",
            },
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    matcher = PatternMatcher()
    result = matcher.find_similar_patterns("AAPL")
    print(json.dumps(result["analysis"], indent=2))
    print("Raccomandazione:", result["analysis"]["recommendation"])
