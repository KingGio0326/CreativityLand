"""Extract and store normalized price patterns for similarity matching."""

import logging
import os
from datetime import datetime, timedelta

import numpy as np
import yfinance as yf
from dotenv import load_dotenv
from scipy.signal import resample
from supabase import create_client

load_dotenv()
logger = logging.getLogger("pattern_extractor")


class PatternExtractor:

    def __init__(self):
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

    def get_ohlcv(self, ticker: str, days: int = 30) -> np.ndarray | None:
        end = datetime.now()
        start = end - timedelta(days=days + 10)
        df = yf.download(
            ticker, start=start, end=end, progress=False, auto_adjust=True
        )
        if df.empty or len(df) < 5:
            return None
        closes = df["Close"].values[-days:]
        return closes

    def normalize_pattern(self, prices: np.ndarray) -> list[float]:
        """Normalize to [-1, 1] relative to first value, resample to 30 points."""
        base = prices[0]
        returns = (prices - base) / base
        normalized = resample(returns, 30)
        return normalized.tolist()

    def build_historical_patterns(self, ticker: str, years: int = 3) -> int:
        """Download historical data and save all 30-day patterns with outcomes."""
        end = datetime.now()
        start = end - timedelta(days=365 * years)
        df = yf.download(
            ticker, start=start, end=end, progress=False, auto_adjust=True
        )
        if df.empty:
            logger.warning("Nessun dato per %s", ticker)
            return 0

        closes = df["Close"].values
        dates = df.index

        patterns_saved = 0
        window = 30
        step = 5  # every 5 days a new pattern

        for i in range(0, len(closes) - window - 20, step):
            pattern = closes[i : i + window]
            if len(pattern) < window:
                continue

            norm = self.normalize_pattern(pattern)

            start_d = dates[i].date().isoformat()
            end_d = dates[i + window - 1].date().isoformat()

            end_price = closes[i + window - 1]

            def outcome(n):
                idx = i + window + n - 1
                if idx >= len(closes):
                    return None
                return float((closes[idx] - end_price) / end_price * 100)

            self.supabase.table("price_patterns").upsert(
                {
                    "ticker": ticker,
                    "start_date": start_d,
                    "end_date": end_d,
                    "pattern_vector": norm,
                    "outcome_5d": outcome(5),
                    "outcome_10d": outcome(10),
                    "outcome_20d": outcome(20),
                }
            ).execute()
            patterns_saved += 1

        logger.info("%s: salvati %d pattern storici", ticker, patterns_saved)
        return patterns_saved

    def get_current_pattern(self, ticker: str) -> dict | None:
        """Get the current 30-day normalized pattern for a ticker."""
        prices = self.get_ohlcv(ticker, days=30)
        if prices is None:
            return None
        norm = self.normalize_pattern(prices)
        return {
            "ticker": ticker,
            "prices": prices.tolist(),
            "normalized": norm,
            "current_price": float(prices[-1]),
            "change_30d_pct": float(
                (prices[-1] - prices[0]) / prices[0] * 100
            ),
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    pe = PatternExtractor()

    tickers = ["AAPL", "TSLA", "NVDA", "MSFT", "XOM"]
    for t in tickers:
        n = pe.build_historical_patterns(t, years=3)
        print(f"{t}: {n} pattern salvati")
        cp = pe.get_current_pattern(t)
        if cp:
            print(f"  Prezzo attuale: ${cp['current_price']:.2f}")
            print(f"  Variazione 30g: {cp['change_30d_pct']:.1f}%")
