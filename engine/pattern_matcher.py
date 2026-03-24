"""Find historically similar price patterns using pgvector cosine similarity."""

import logging
import math
import os
from datetime import datetime

import numpy as np
from dotenv import load_dotenv
from supabase import create_client

from engine.pattern_extractor import PatternExtractor, get_seasonal_features, get_rate_direction

load_dotenv()
logger = logging.getLogger("pattern_matcher")

# Maps detector regime → allowed stored regimes + crisis_only flag
# Stored regimes: bull, bear, sideways, volatile_bull, unknown
# Detector regimes: bull, bear, neutral, crisis
REGIME_GROUPS: dict[str, dict] = {
    "crisis": {"regimes": None, "crisis_only": True},          # any regime, but only crisis periods
    "bear":   {"regimes": ["bear", "sideways"], "crisis_only": False},
    "bull":   {"regimes": ["bull", "volatile_bull"], "crisis_only": False},
    "neutral": {"regimes": None, "crisis_only": False},        # all patterns
}


def sanitize_vector(v: list) -> list:
    """Replace NaN and Inf with 0.0 to avoid JSON serialization errors."""
    return [
        0.0 if (math.isnan(x) or math.isinf(x)) else x
        for x in v
    ]


def seasonal_similarity_boost(
    current_date,
    pattern_date_str: str,
) -> float:
    """Ritorna un boost 1.0-1.1 se le condizioni stagionali coincidono."""
    try:
        pattern_date = datetime.strptime(pattern_date_str[:10], "%Y-%m-%d")
        current = get_seasonal_features(current_date)
        historical = get_seasonal_features(pattern_date)

        matches = 0
        total = 0

        seasonal_flags = [
            "is_january_effect", "is_sell_in_may",
            "is_santa_rally", "is_opex_week", "is_quarter_end",
        ]

        for flag in seasonal_flags:
            if current[flag] == 1.0 or historical[flag] == 1.0:
                total += 1
                if current[flag] == historical[flag]:
                    matches += 1

        if total == 0:
            return 1.0

        boost = 1.0 + (matches / total) * 0.10
        return round(boost, 3)
    except Exception:
        return 1.0


class PatternMatcher:

    def __init__(self):
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
        self.extractor = PatternExtractor()

    def find_similar_patterns(
        self, ticker: str, top_k: int = 10, regime_filter: str | None = None,
    ) -> dict:
        """Find historical patterns similar to the current one.

        Args:
            ticker: Ticker symbol.
            top_k: Max number of similar patterns to return.
            regime_filter: Detector regime (bull/bear/neutral/crisis).
                If provided, only patterns from matching market conditions
                are returned. Falls back to unfiltered if too few matches.
        """
        current = self.extractor.get_current_pattern(ticker)
        if not current:
            return {"error": "Dati non disponibili"}

        vector = sanitize_vector(current["normalized"])

        # Build regime filter params
        group = REGIME_GROUPS.get(regime_filter or "neutral", REGIME_GROUPS["neutral"])
        filter_regimes = group["regimes"]
        crisis_only = group["crisis_only"]

        # Search with regime filter
        filtered_count = 0
        used_fallback = False

        if regime_filter and regime_filter != "neutral":
            result = self.supabase.rpc(
                "match_patterns",
                {
                    "query_vector": vector,
                    "match_ticker": ticker,
                    "match_count": top_k,
                    "filter_regimes": filter_regimes,
                    "crisis_only": crisis_only,
                },
            ).execute()
            similar = result.data or []
            filtered_count = len(similar)

            # Fallback: if too few matches, search without filter
            if filtered_count < 5:
                logger.warning(
                    "Regime filter '%s' too restrictive for %s: %d matches, "
                    "falling back to all regimes",
                    regime_filter, ticker, filtered_count,
                )
                result = self.supabase.rpc(
                    "match_patterns",
                    {
                        "query_vector": vector,
                        "match_ticker": ticker,
                        "match_count": top_k,
                        "filter_regimes": None,
                        "crisis_only": False,
                    },
                ).execute()
                similar = result.data or []
                used_fallback = True
        else:
            # No regime filter — search all
            result = self.supabase.rpc(
                "match_patterns",
                {
                    "query_vector": vector,
                    "match_ticker": ticker,
                    "match_count": top_k,
                    "filter_regimes": None,
                    "crisis_only": False,
                },
            ).execute()
            similar = result.data or []

        # Count total (unfiltered) for comparison logging
        total_unfiltered = len(similar)
        if regime_filter and regime_filter != "neutral" and not used_fallback:
            # Get unfiltered count for comparison
            unfiltered_result = self.supabase.rpc(
                "match_patterns",
                {
                    "query_vector": vector,
                    "match_ticker": ticker,
                    "match_count": top_k,
                    "filter_regimes": None,
                    "crisis_only": False,
                },
            ).execute()
            total_unfiltered = len(unfiltered_result.data or [])

        if not similar:
            return {
                "current": current,
                "similar": [],
                "analysis": self._empty_analysis(),
            }

        # Apply seasonal similarity boost
        now = datetime.now()
        for p in similar:
            base_sim = float(p.get("similarity", 0) or 0)
            boost = float(seasonal_similarity_boost(
                now, p.get("end_date", "")
            ))
            p["seasonal_boost"] = boost
            p["similarity"] = round(base_sim * boost, 4)

        # Apply rate direction boost
        current_rate_dir = get_rate_direction(now)
        for p in similar:
            sim = float(p.get("similarity", 0) or 0)
            pattern_rate_dir = p.get("rate_direction", "unknown")
            if (current_rate_dir != "unknown"
                    and pattern_rate_dir != "unknown"
                    and current_rate_dir == pattern_rate_dir):
                p["similarity"] = round(sim * 1.05, 4)
            elif (current_rate_dir != "unknown"
                    and pattern_rate_dir != "unknown"
                    and current_rate_dir != pattern_rate_dir):
                p["similarity"] = round(sim * 0.97, 4)

        # Re-sort by boosted similarity
        similar.sort(key=lambda p: float(p.get("similarity", 0) or 0), reverse=True)

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
            "regime_filter": regime_filter,
            "regime_filtered_count": filtered_count,
            "total_unfiltered_count": total_unfiltered,
            "used_fallback": used_fallback,
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
    from engine.utils import safe_json_dumps
    logging.basicConfig(level=logging.INFO)
    matcher = PatternMatcher()
    result = matcher.find_similar_patterns("AAPL")
    print(safe_json_dumps(result["analysis"], indent=2))
    print("Raccomandazione:", result["analysis"]["recommendation"])
