"""ExitStrategyAgent: calculates ATR-based stop loss, take profit, and trailing stop."""

import logging
import numpy as np
import yfinance as yf

logger = logging.getLogger("agents.exit_strategy")

REGIME_MULTIPLIERS = {
    "crisis": 3.0,
    "bear": 2.5,
    "neutral": 2.0,
    "bull": 1.5,
}


def _compute_atr(ticker: str, period: int = 14) -> float:
    """Compute ATR-14 using daily data (hourly for crypto)."""
    is_crypto = "-USD" in ticker
    interval = "1h" if is_crypto else "1d"
    lookback = "7d" if is_crypto else "30d"

    df = yf.download(
        ticker, period=lookback, interval=interval, progress=False,
    )
    if len(df) < period + 1:
        raise ValueError(f"Insufficient data for ATR ({len(df)} bars)")

    high = df["High"].values.flatten()
    low = df["Low"].values.flatten()
    close = df["Close"].values.flatten()

    # True Range
    tr = np.maximum(
        high[1:] - low[1:],
        np.maximum(
            np.abs(high[1:] - close[:-1]),
            np.abs(low[1:] - close[:-1]),
        ),
    )

    # Simple moving average of TR for last `period` bars
    atr = float(np.mean(tr[-period:]))
    return atr


def calculate_exit_levels(
    ticker: str,
    signal: str,
    entry_price: float,
    confidence: float,
    market_regime: str,
) -> dict | None:
    """Calculate stop loss, take profit, and trailing stop for a signal.

    Returns None for HOLD signals or if data is unavailable.
    """
    if signal == "HOLD" or entry_price <= 0:
        return None

    # Normalize confidence to 0-1
    conf = confidence / 100.0 if confidence > 1 else confidence

    try:
        atr_14 = _compute_atr(ticker)
    except Exception as e:
        logger.warning("ATR calculation failed for %s: %s", ticker, e)
        # Fallback: estimate ATR as 2% of price
        atr_14 = entry_price * 0.02

    # Regime-adjusted multiplier
    multiplier = REGIME_MULTIPLIERS.get(market_regime, 2.0)

    # Confidence adjustment: high confidence → tighter stop (0.85-1.15)
    confidence_adj = 1.0 - (conf - 0.5) * 0.3

    # Stop loss distance
    sl_distance = atr_14 * multiplier * confidence_adj

    # Risk-reward ratio: 2.0-3.0 based on confidence
    rr_ratio = 2.0 + (conf * 1.0)

    # Take profit distance
    tp_distance = sl_distance * rr_ratio

    # Calculate levels based on direction
    if signal == "BUY":
        stop_loss = entry_price - sl_distance
        take_profit = entry_price + tp_distance
        trailing_activation = entry_price + (tp_distance * 0.5)
    else:  # SELL
        stop_loss = entry_price + sl_distance
        take_profit = entry_price - tp_distance
        trailing_activation = entry_price - (tp_distance * 0.5)

    # Trailing level = break-even when trailing activates
    trailing_level = entry_price

    # Validate direction: BUY → SL < entry < TP; SELL → TP < entry < SL
    if signal == "BUY" and not (stop_loss < entry_price < take_profit):
        logger.error(
            "ExitStrategyAgent: invalid BUY levels for %s — "
            "SL=%.4f, entry=%.4f, TP=%.4f",
            ticker, stop_loss, entry_price, take_profit,
        )
        return None
    if signal == "SELL" and not (take_profit < entry_price < stop_loss):
        logger.error(
            "ExitStrategyAgent: invalid SELL levels for %s — "
            "TP=%.4f, entry=%.4f, SL=%.4f",
            ticker, take_profit, entry_price, stop_loss,
        )
        return None

    return {
        "stop_loss": round(stop_loss, 4),
        "take_profit": round(take_profit, 4),
        "sl_distance": round(sl_distance, 4),
        "tp_distance": round(tp_distance, 4),
        "sl_percentage": round((sl_distance / entry_price) * 100, 2),
        "tp_percentage": round((tp_distance / entry_price) * 100, 2),
        "risk_reward_ratio": round(rr_ratio, 2),
        "atr_14": round(atr_14, 4),
        "regime_multiplier": multiplier,
        "trailing_activation": round(trailing_activation, 4),
        "trailing_level": round(trailing_level, 4),
    }


def exit_strategy_agent(state) -> dict:
    """LangGraph node: compute exit levels and store in state."""
    ticker = state["ticker"]
    signal = state.get("final_signal") or state.get("proposed_signal", "HOLD")
    confidence = state.get("confidence", 0.5)
    regime = state.get("market_regime", "neutral")

    # Use last close as entry price proxy
    try:
        df = yf.download(ticker, period="2d", interval="1d", progress=False)
        entry_price = float(df["Close"].values.flatten()[-1])
    except Exception:
        entry_price = 0.0

    levels = calculate_exit_levels(
        ticker, signal, entry_price, confidence, regime,
    )

    if levels:
        state["exit_strategy"] = levels
        # For SHORT, SL is above entry (+) and TP is below entry (-)
        sl_sign = "+" if signal == "SELL" else "-"
        tp_sign = "-" if signal == "SELL" else "+"
        state["reasoning"].append(
            f"ExitStrategyAgent: SL=${levels['stop_loss']:.2f} "
            f"({sl_sign}{levels['sl_percentage']:.1f}%) | "
            f"TP=${levels['take_profit']:.2f} "
            f"({tp_sign}{levels['tp_percentage']:.1f}%) | "
            f"R:R={levels['risk_reward_ratio']:.1f} | "
            f"ATR={levels['atr_14']:.2f} x{levels['regime_multiplier']}"
        )
    else:
        state["exit_strategy"] = {}
        state["reasoning"].append(
            "ExitStrategyAgent: HOLD — no exit levels calculated"
        )

    return state
