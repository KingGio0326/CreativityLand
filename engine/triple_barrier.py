"""Triple Barrier Labeling (López de Prado, AFML cap. 3).

Defines three barriers for each signal:
  - Upper barrier (TP): entry + ATR_mult * ATR_14
  - Lower barrier (SL): entry - ATR_mult * ATR_14
  - Vertical barrier (time): entry + max_holding_period

The first barrier touched determines the true label of the signal.
"""

import logging
from datetime import datetime, timedelta

import numpy as np
import yfinance as yf

logger = logging.getLogger("triple_barrier")

REGIME_ATR_MULT = {
    "crisis": 3.0,
    "bear": 2.5,
    "neutral": 2.0,
    "bull": 1.5,
}

MAX_HOLDING_HOURS = 168  # 7 days — matches our scoring horizon


class TripleBarrierLabeler:
    """Computes and evaluates triple barriers for trading signals."""

    def compute_barriers(
        self,
        ticker: str,
        entry_price: float,
        entry_date: datetime,
        atr_14: float | None = None,
        regime: str = "neutral",
    ) -> dict:
        """Compute the three barriers for a signal.

        If atr_14 is not provided, compute it from yfinance (last 20 days).
        """
        if atr_14 is None or atr_14 <= 0:
            atr_14 = self._compute_atr(ticker, entry_date)

        multiplier = REGIME_ATR_MULT.get(regime, 2.0)

        upper = entry_price + (multiplier * atr_14)
        lower = entry_price - (multiplier * atr_14)
        vertical = entry_date + timedelta(hours=MAX_HOLDING_HOURS)

        return {
            "upper_barrier": round(upper, 4),
            "lower_barrier": round(lower, 4),
            "vertical_barrier": vertical,
            "atr_14": round(atr_14, 4),
            "atr_multiplier": multiplier,
            "regime": regime,
        }

    def evaluate_signal(
        self,
        ticker: str,
        entry_price: float,
        entry_date: datetime,
        barriers: dict,
    ) -> dict:
        """Evaluate which barrier was hit first.

        Downloads intraday prices from entry_date to min(vertical_barrier, now)
        and iterates chronologically to find the first barrier touch.
        """
        upper = barriers["upper_barrier"]
        lower = barriers["lower_barrier"]
        vertical = barriers["vertical_barrier"]

        # Download price data from entry to barrier end
        end_date = min(vertical, datetime.now())
        prices = self._get_price_series(ticker, entry_date, end_date)

        result = {
            "label": 0,
            "barrier_hit": "vertical",
            "barrier_hit_time": None,
            "time_to_hit_hours": None,
            "return_at_hit": 0.0,
            "final_return": 0.0,
            "max_favorable": 0.0,
            "max_adverse": 0.0,
        }

        if prices is None or len(prices) == 0:
            logger.warning("No price data for %s, cannot evaluate", ticker)
            return result

        highs = prices["High"].values.flatten()
        lows = prices["Low"].values.flatten()
        closes = prices["Close"].values.flatten()
        timestamps = prices.index

        max_favorable = 0.0
        max_adverse = 0.0

        for i in range(len(prices)):
            high = float(highs[i])
            low = float(lows[i])

            # Track max excursions using highs/lows
            fav_pct = (high - entry_price) / entry_price * 100
            adv_pct = (entry_price - low) / entry_price * 100
            max_favorable = max(max_favorable, fav_pct)
            max_adverse = max(max_adverse, adv_pct)

            # Check upper barrier (TP hit)
            if high >= upper:
                hit_time = timestamps[i]
                if hasattr(hit_time, "to_pydatetime"):
                    hit_time = hit_time.to_pydatetime()
                if hasattr(hit_time, "tzinfo") and hit_time.tzinfo:
                    hit_time = hit_time.replace(tzinfo=None)
                hours = (hit_time - entry_date).total_seconds() / 3600
                ret = (upper - entry_price) / entry_price * 100
                result.update({
                    "label": 1,
                    "barrier_hit": "upper",
                    "barrier_hit_time": hit_time,
                    "time_to_hit_hours": round(hours, 2),
                    "return_at_hit": round(ret, 4),
                })
                break

            # Check lower barrier (SL hit)
            if low <= lower:
                hit_time = timestamps[i]
                if hasattr(hit_time, "to_pydatetime"):
                    hit_time = hit_time.to_pydatetime()
                if hasattr(hit_time, "tzinfo") and hit_time.tzinfo:
                    hit_time = hit_time.replace(tzinfo=None)
                hours = (hit_time - entry_date).total_seconds() / 3600
                ret = (lower - entry_price) / entry_price * 100
                result.update({
                    "label": -1,
                    "barrier_hit": "lower",
                    "barrier_hit_time": hit_time,
                    "time_to_hit_hours": round(hours, 2),
                    "return_at_hit": round(ret, 4),
                })
                break

        # Vertical barrier: no barrier touched, label from final return
        if result["barrier_hit"] == "vertical":
            final_close = float(closes[-1])
            final_ret = (final_close - entry_price) / entry_price * 100
            result["final_return"] = round(final_ret, 4)
            result["time_to_hit_hours"] = round(
                MAX_HOLDING_HOURS, 2
            )
            result["return_at_hit"] = round(final_ret, 4)

            if final_ret > 0.5:
                result["label"] = 1
            elif final_ret < -0.5:
                result["label"] = -1
            else:
                result["label"] = 0  # neutral — within ±0.5%
        else:
            # For upper/lower hits, also record final return at last bar
            final_close = float(closes[-1])
            result["final_return"] = round(
                (final_close - entry_price) / entry_price * 100, 4
            )

        result["max_favorable"] = round(max_favorable, 4)
        result["max_adverse"] = round(max_adverse, 4)

        return result

    # ── Internal helpers ─────────────────────────────────

    @staticmethod
    def _compute_atr(ticker: str, ref_date: datetime, period: int = 14) -> float:
        """Compute ATR-14 from yfinance data around ref_date."""
        is_crypto = "-USD" in ticker
        interval = "1h" if is_crypto else "1d"
        lookback_days = 7 if is_crypto else 30

        start = (ref_date - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        end = (ref_date + timedelta(days=1)).strftime("%Y-%m-%d")

        try:
            df = yf.download(
                ticker, start=start, end=end,
                interval=interval, progress=False, auto_adjust=True,
            )
            if len(df) < period + 1:
                raise ValueError(f"Insufficient data ({len(df)} bars)")

            high = df["High"].values.flatten()
            low = df["Low"].values.flatten()
            close = df["Close"].values.flatten()

            tr = np.maximum(
                high[1:] - low[1:],
                np.maximum(
                    np.abs(high[1:] - close[:-1]),
                    np.abs(low[1:] - close[:-1]),
                ),
            )
            atr = float(np.mean(tr[-period:]))
            return atr
        except Exception as e:
            logger.warning("ATR calc failed for %s: %s, using 2%% fallback", ticker, e)
            # Fallback: estimate ATR as 2% of a rough price
            try:
                df = yf.download(ticker, period="5d", progress=False, auto_adjust=True)
                if not df.empty:
                    return float(df["Close"].values.flatten()[-1]) * 0.02
            except Exception:
                pass
            return 1.0  # absolute fallback

    @staticmethod
    def _get_price_series(ticker: str, start: datetime, end: datetime):
        """Download intraday price series (1h for crypto, 15min for stocks)."""
        is_crypto = "-USD" in ticker
        interval = "1h" if is_crypto else "15m"

        start_str = start.strftime("%Y-%m-%d")
        # yfinance 15m data limited to ~60 days; 1h to ~730 days
        end_str = (end + timedelta(days=1)).strftime("%Y-%m-%d")

        try:
            df = yf.download(
                ticker, start=start_str, end=end_str,
                interval=interval, progress=False, auto_adjust=True,
            )
            if df.empty:
                return None

            # Filter to actual time range
            if df.index.tz is not None:
                df.index = df.index.tz_localize(None)
            df = df[df.index >= start]
            df = df[df.index <= end]

            return df if len(df) > 0 else None
        except Exception as e:
            logger.warning("Price series fetch failed for %s: %s", ticker, e)
            return None
