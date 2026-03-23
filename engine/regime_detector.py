"""Detect the current market regime (bull/bear/neutral/crisis)
using VIX, SPY trend, and TLT flight-to-safety signal."""

import logging
import os
from datetime import datetime, timedelta

import numpy as np
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logger = logging.getLogger("regime_detector")

CACHE_HOURS = 6


def _fetch_indicator(ticker: str, period: str = "3mo") -> dict | None:
    """Download price data and compute trend + SMA indicators."""
    try:
        df = yf.download(ticker, period=period, progress=False, auto_adjust=True)
        if df.empty or len(df) < 10:
            return None

        close = df["Close"].values.flatten()
        current = float(close[-1])

        # 30-day return
        idx_30d = max(0, len(close) - 22)  # ~22 trading days
        trend_30d = (current / float(close[idx_30d]) - 1) * 100

        # SMA 50 and SMA 200 (use what's available)
        sma50 = float(np.mean(close[-50:])) if len(close) >= 50 else None
        sma200 = float(np.mean(close[-200:])) if len(close) >= 200 else None

        return {
            "current": round(current, 2),
            "trend_30d": round(trend_30d, 2),
            "sma50": round(sma50, 2) if sma50 else None,
            "sma200": round(sma200, 2) if sma200 else None,
        }
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", ticker, e)
        return None


def _classify(vix: dict | None, spy: dict | None, tlt: dict | None) -> dict:
    """Combine indicators into a single regime classification."""
    vix_level = vix["current"] if vix else None
    spy_trend = spy["trend_30d"] if spy else None
    tlt_trend = tlt["trend_30d"] if tlt else None

    # -- VIX-based classification (primary signal) --
    if vix_level is not None:
        if vix_level > 35:
            vix_regime = "crisis"
        elif vix_level > 25:
            vix_regime = "bear"
        elif vix_level > 18:
            vix_regime = "neutral"
        else:
            vix_regime = "bull"
    else:
        vix_regime = "neutral"

    # -- SPY trend confirmation --
    if spy_trend is not None:
        if spy_trend > 5:
            spy_regime = "bull"
        elif spy_trend < -5:
            spy_regime = "bear"
        else:
            spy_regime = "neutral"
    else:
        spy_regime = "neutral"

    # -- Crisis override: VIX spike + SPY crash --
    if (vix_level and vix_level > 35) and (spy_trend and spy_trend < -5):
        return {
            "regime": "crisis",
            "confidence": min(0.95, 0.7 + abs(spy_trend) / 100),
            "reasoning": (
                f"VIX={vix_level:.1f} (>35) + SPY 30d={spy_trend:+.1f}% (<-5%)"
            ),
        }

    # -- TLT divergence as stress signal --
    # Bond rally (TLT up) while stocks fall = flight to safety
    tlt_stress = False
    if tlt_trend is not None and spy_trend is not None:
        if tlt_trend > 3 and spy_trend < -2:
            tlt_stress = True

    # -- Combine signals --
    # VIX weight: 0.5, SPY weight: 0.35, TLT stress: 0.15
    regime_scores = {"bull": 0.0, "bear": 0.0, "neutral": 0.0, "crisis": 0.0}
    regime_scores[vix_regime] += 0.50
    regime_scores[spy_regime] += 0.35

    if tlt_stress:
        regime_scores["bear"] += 0.10
        regime_scores["crisis"] += 0.05
    else:
        regime_scores["neutral"] += 0.15

    # SMA cross bonus
    if spy and spy.get("sma50") and spy.get("sma200"):
        if spy["sma50"] > spy["sma200"]:
            regime_scores["bull"] += 0.05  # golden cross
        else:
            regime_scores["bear"] += 0.05  # death cross

    final_regime = max(regime_scores, key=regime_scores.get)
    confidence = round(regime_scores[final_regime], 3)

    parts = []
    if vix_level is not None:
        parts.append(f"VIX={vix_level:.1f}")
    if spy_trend is not None:
        parts.append(f"SPY 30d={spy_trend:+.1f}%")
    if tlt_trend is not None:
        parts.append(f"TLT 30d={tlt_trend:+.1f}%")
    if spy and spy.get("sma50") and spy.get("sma200"):
        cross = "golden" if spy["sma50"] > spy["sma200"] else "death"
        parts.append(f"SMA {cross} cross")
    if tlt_stress:
        parts.append("flight-to-safety detected")

    return {
        "regime": final_regime,
        "confidence": confidence,
        "reasoning": " | ".join(parts),
    }


def _get_cached(supabase) -> dict | None:
    """Return cached regime if less than CACHE_HOURS old."""
    try:
        cutoff = (datetime.now() - timedelta(hours=CACHE_HOURS)).isoformat()
        result = (
            supabase.table("market_regime")
            .select("*")
            .gte("detected_at", cutoff)
            .order("detected_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            row = result.data[0]
            return {
                "regime": row["regime"],
                "confidence": row["confidence"],
                "vix_level": row.get("vix_level"),
                "spy_trend_30d": row.get("spy_trend_30d"),
                "tlt_trend_30d": row.get("tlt_trend_30d"),
                "spy_sma50": row.get("spy_sma50"),
                "spy_sma200": row.get("spy_sma200"),
                "detected_at": row["detected_at"],
                "cached": True,
            }
    except Exception as e:
        logger.warning("Cache read failed: %s", e)
    return None


def _save_cache(supabase, result: dict, vix, spy, tlt) -> None:
    """Save regime to Supabase cache."""
    try:
        supabase.table("market_regime").insert({
            "regime": result["regime"],
            "confidence": result["confidence"],
            "vix_level": vix["current"] if vix else None,
            "spy_trend_30d": spy["trend_30d"] if spy else None,
            "spy_sma50": spy.get("sma50") if spy else None,
            "spy_sma200": spy.get("sma200") if spy else None,
            "tlt_trend_30d": tlt["trend_30d"] if tlt else None,
        }).execute()
    except Exception as e:
        logger.warning("Cache write failed: %s", e)


def detect_regime(force_refresh: bool = False) -> dict:
    """Detect the current market regime.

    Returns:
        dict with keys: regime, confidence, vix_level, spy_trend_30d,
        tlt_trend_30d, spy_sma50, spy_sma200, detected_at, cached
    """
    supabase = create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_KEY", ""),
    )

    # Check cache first
    if not force_refresh:
        cached = _get_cached(supabase)
        if cached:
            logger.info(
                "Using cached regime: %s (%.0f%%) from %s",
                cached["regime"], cached["confidence"] * 100,
                cached["detected_at"],
            )
            return cached

    # Fetch fresh data
    logger.info("Fetching market data for regime detection...")
    vix = _fetch_indicator("^VIX", period="3mo")
    spy = _fetch_indicator("SPY", period="1y")
    tlt = _fetch_indicator("TLT", period="3mo")

    if not vix and not spy:
        logger.warning("No market data available, defaulting to neutral")
        return {
            "regime": "neutral",
            "confidence": 0.0,
            "vix_level": None,
            "spy_trend_30d": None,
            "tlt_trend_30d": None,
            "spy_sma50": None,
            "spy_sma200": None,
            "detected_at": datetime.now().isoformat(),
            "cached": False,
        }

    result = _classify(vix, spy, tlt)

    output = {
        "regime": result["regime"],
        "confidence": result["confidence"],
        "vix_level": vix["current"] if vix else None,
        "spy_trend_30d": spy["trend_30d"] if spy else None,
        "tlt_trend_30d": tlt["trend_30d"] if tlt else None,
        "spy_sma50": spy.get("sma50") if spy else None,
        "spy_sma200": spy.get("sma200") if spy else None,
        "detected_at": datetime.now().isoformat(),
        "cached": False,
        "reasoning": result["reasoning"],
    }

    _save_cache(supabase, result, vix, spy, tlt)
    logger.info(
        "Regime detected: %s (%.0f%%) -- %s",
        output["regime"], output["confidence"] * 100, result["reasoning"],
    )
    return output


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    result = detect_regime(force_refresh=True)
    print(f"\n{'='*50}")
    print(f"  REGIME:     {result['regime'].upper()}")
    print(f"  Confidence: {result['confidence']:.0%}")
    print(f"  VIX:        {result.get('vix_level', 'N/A')}")
    print(f"  SPY 30d:    {result.get('spy_trend_30d', 'N/A')}%")
    print(f"  TLT 30d:    {result.get('tlt_trend_30d', 'N/A')}%")
    if result.get("spy_sma50") and result.get("spy_sma200"):
        cross = "GOLDEN" if result["spy_sma50"] > result["spy_sma200"] else "DEATH"
        print(f"  SMA Cross:  {cross} (50={result['spy_sma50']}, 200={result['spy_sma200']})")
    if result.get("reasoning"):
        print(f"  Reasoning:  {result['reasoning']}")
    print(f"  Cached:     {result.get('cached', False)}")
    print(f"{'='*50}")
