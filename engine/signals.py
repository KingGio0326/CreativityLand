"""Trading signal generation based on weighted sentiment analysis."""

import logging
import os
from datetime import datetime, timezone
from math import exp

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logger = logging.getLogger("engine.signals")


class SignalEngine:
    """Generates BUY/SELL/HOLD signals from recent article sentiments."""

    BUY_THRESHOLD = 0.15
    SELL_THRESHOLD = -0.15
    DECAY_HOURS = 24.0

    def __init__(self):
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

    def generate_signal(self, ticker: str, lookback_hours: int = 48) -> dict:
        """Generate a trading signal for a ticker based on recent sentiment."""
        now = datetime.now(timezone.utc)

        response = (
            self.supabase.table("articles")
            .select("*")
            .eq("ticker", ticker)
            .eq("processed", True)
            .gte("published_at", (now - __import__("datetime").timedelta(hours=lookback_hours)).isoformat())
            .order("published_at", desc=True)
            .execute()
        )
        articles = response.data

        if not articles:
            logger.info("No recent articles for %s, returning HOLD", ticker)
            return {
                "ticker": ticker,
                "signal": "HOLD",
                "confidence": 0.0,
                "reasoning": f"No processed articles in the last {lookback_hours}h",
                "articles_count": 0,
                "score": 0.0,
                "created_at": now.isoformat(),
            }

        weighted_sum = 0.0
        weight_sum = 0.0

        for article in articles:
            published = datetime.fromisoformat(article["published_at"].replace("Z", "+00:00"))
            age_hours = (now - published).total_seconds() / 3600
            weight = exp(-age_hours / self.DECAY_HOURS)

            label = article.get("sentiment_label", "neutral")
            sentiment_score = article.get("sentiment_score", 0.0) or 0.0
            direction = {"positive": 1, "negative": -1, "neutral": 0}.get(label, 0)

            weighted_sum += sentiment_score * direction * weight
            weight_sum += weight

        score = weighted_sum / weight_sum if weight_sum > 0 else 0.0

        if score > self.BUY_THRESHOLD:
            signal = "BUY"
        elif score < self.SELL_THRESHOLD:
            signal = "SELL"
        else:
            signal = "HOLD"

        confidence = min(abs(score) / 0.5, 1.0)

        reasoning_parts = []
        for a in articles[:3]:
            reasoning_parts.append(
                f"[{a.get('sentiment_label', '?')}:{a.get('sentiment_score', 0):.2f}] {a['title'][:60]}"
            )
        reasoning = f"Score={score:.3f} based on {len(articles)} articles. Top: " + " | ".join(reasoning_parts)

        result = {
            "ticker": ticker,
            "signal": signal,
            "confidence": round(confidence, 4),
            "reasoning": reasoning,
            "articles_count": len(articles),
            "score": round(score, 4),
            "created_at": now.isoformat(),
        }

        logger.info("Signal for %s: %s (confidence=%.2f)", ticker, signal, confidence)
        return result

    def generate_all_signals(self, tickers: list[str]) -> list[dict]:
        """Generate signals for multiple tickers."""
        return [self.generate_signal(t) for t in tickers]

    def save_signal(self, signal: dict) -> str | None:
        """Save a signal to Supabase. Returns the signal UUID."""
        row = {
            "ticker": signal["ticker"],
            "signal": signal["signal"],
            "confidence": signal["confidence"],
            "reasoning": signal.get("reasoning", ""),
            "articles_used": [],
            "created_at": signal.get("created_at", datetime.now(timezone.utc).isoformat()),
        }
        result = self.supabase.table("signals").insert(row).execute()
        signal_id = result.data[0]["id"] if result.data else None
        logger.info("Saved signal for %s to Supabase (id=%s)", signal["ticker"], signal_id)
        return signal_id


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    tickers = ["AAPL", "TSLA", "NVDA", "BTC-USD", "ETH-USD", "MSFT", "XOM", "GLD"]
    engine = SignalEngine()
    signals = engine.generate_all_signals(tickers)
    for s in signals:
        engine.save_signal(s)
    print(f"Signals complete: {len(signals)} signals generated and saved")
