import logging
from datetime import datetime

logger = logging.getLogger("seasonal_agent")

SEASONAL_CALENDAR = {
    # (mese, giorno_inizio, giorno_fine): (nome, impatto, ticker_affected)
    (1, 1, 15):   ("January Effect", "BULLISH", "all"),
    (5, 1, 31):   ("Sell in May", "BEARISH", "all"),
    (6, 1, 30):   ("Summer Slowdown", "BEARISH", "all"),
    (7, 1, 31):   ("Summer Slowdown", "BEARISH", "all"),
    (8, 1, 31):   ("Summer Slowdown", "BEARISH", "all"),
    (9, 1, 30):   ("September Effect", "BEARISH", "all"),
    (10, 1, 31):  ("October Volatility", "VOLATILE", "all"),
    (11, 1, 30):  ("Santa Rally Start", "BULLISH", "all"),
    (12, 1, 31):  ("Santa Rally", "BULLISH", "all"),
    (3, 20, 31):  ("Quarter End Rebalancing", "VOLATILE", "all"),
    (6, 20, 30):  ("Quarter End Rebalancing", "VOLATILE", "all"),
    (9, 20, 30):  ("Quarter End Rebalancing", "VOLATILE", "all"),
    (12, 20, 31): ("Quarter End Rebalancing", "VOLATILE", "all"),
}

OPEX_WEEKS = [15, 16, 17, 18, 19, 20, 21]


def get_current_seasonal_context(date: datetime = None) -> dict:
    """Analizza il contesto stagionale attuale."""
    if date is None:
        date = datetime.now()

    month = date.month
    day = date.day
    day_of_week = date.weekday()

    active_effects = []

    # Controlla effetti stagionali attivi
    for (m, d_start, d_end), (name, impact, _) in SEASONAL_CALENDAR.items():
        if month == m and d_start <= day <= d_end:
            active_effects.append({
                "name": name,
                "impact": impact,
                "days_remaining": d_end - day,
            })

    # Controlla OpEx (terza settimana del mese)
    is_opex = day in OPEX_WEEKS
    if is_opex:
        active_effects.append({
            "name": "OpEx Week",
            "impact": "VOLATILE",
            "days_remaining": 21 - day if day <= 21 else 0,
        })

    # Monday effect
    is_monday = day_of_week == 0
    if is_monday:
        active_effects.append({
            "name": "Monday Effect",
            "impact": "BEARISH",
            "days_remaining": 1,
        })

    return {
        "date": date.strftime("%Y-%m-%d"),
        "month": month,
        "effects": active_effects,
        "is_opex": is_opex,
        "is_monday": is_monday,
    }


def seasonal_agent(state: dict) -> dict:
    ticker = state.get("ticker", "")
    ctx = get_current_seasonal_context()
    effects = ctx["effects"]

    if not effects:
        return {
            **state,
            "seasonal_signal": "HOLD",
            "seasonal_confidence": 0,
            "reasoning": state.get("reasoning", []) + [
                "SeasonalAgent: nessun effetto stagionale rilevante"
            ],
        }

    # Conta impatti
    bullish = sum(1 for e in effects if e["impact"] == "BULLISH")
    bearish = sum(1 for e in effects if e["impact"] == "BEARISH")
    volatile = sum(1 for e in effects if e["impact"] == "VOLATILE")

    if bullish > bearish:
        signal = "BUY"
        confidence = min(bullish * 20, 60)
    elif bearish > bullish:
        signal = "SELL"
        confidence = min(bearish * 20, 60)
    else:
        signal = "HOLD"
        confidence = 10

    # Cap confidence se volatile
    if volatile > 0:
        confidence = min(confidence, 30)

    effect_names = [e["name"] for e in effects]
    reasoning_line = (
        f"SeasonalAgent: {signal} ({confidence}%) | "
        f"Effetti attivi: {', '.join(effect_names)} | "
        f"Bullish: {bullish}, Bearish: {bearish}, Volatile: {volatile}"
    )

    logger.info(reasoning_line)

    return {
        **state,
        "seasonal_signal": signal,
        "seasonal_confidence": confidence,
        "seasonal_effects": effects,
        "reasoning": state.get("reasoning", []) + [reasoning_line],
    }
