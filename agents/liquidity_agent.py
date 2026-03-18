from engine.fred_client import get_liquidity_context
import logging

logger = logging.getLogger("liquidity_agent")


def liquidity_agent(state: dict) -> dict:
    """
    LiquidityAgent — peso 8% nel WeightedVoting.
    Analizza liquidità globale (Fed, M2, tassi, VIX)
    e genera segnale BUY/SELL/HOLD.
    """
    try:
        ctx = get_liquidity_context()
    except Exception as e:
        logger.warning(f"LiquidityAgent error: {e}")
        return {
            **state,
            "liquidity_signal":     "HOLD",
            "liquidity_confidence": 0,
            "reasoning": state.get("reasoning", []) + [
                f"LiquidityAgent: errore FRED API — {e}"
            ]
        }

    score     = ctx.get("liquidity_score", 0)
    direction = ctx.get("liquidity_direction", "neutral")
    fed_dir   = ctx.get("fed_funds_rate", {}).get("direction", "stable")
    yc        = ctx.get("yield_curve", {})
    vix       = ctx.get("vix", {})

    # Genera segnale
    if direction == "bullish" and score > 0.5:
        signal     = "BUY"
        confidence = min(int(abs(score) * 80), 85)
    elif direction == "bearish" and score < -0.5:
        signal     = "SELL"
        confidence = min(int(abs(score) * 80), 85)
    else:
        signal     = "HOLD"
        confidence = 20

    # Costruisci reasoning dettagliato
    details = []
    if "fed_balance_sheet" in ctx:
        bs = ctx["fed_balance_sheet"]
        details.append(
            f"Fed balance sheet {bs['direction']} "
            f"({bs['change_pct']:+.1f}%)"
        )
    if fed_dir != "stable":
        details.append(f"Fed funds rate {fed_dir}")
    if yc.get("inverted"):
        details.append(
            f"Yield curve invertita ({yc['value']:.2f}%) "
            f"— rischio recessione"
        )
    if vix:
        details.append(
            f"VIX {vix['value']:.1f} ({vix['regime']})"
        )

    reasoning_line = (
        f"LiquidityAgent: {signal} ({confidence}%) | "
        f"score={score:.2f} | "
        + " | ".join(details)
    )

    logger.info(reasoning_line)

    return {
        **state,
        "liquidity_signal":     signal,
        "liquidity_confidence": confidence,
        "liquidity_context":    ctx,
        "reasoning": state.get("reasoning", []) + [reasoning_line]
    }
