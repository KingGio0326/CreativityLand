import logging
import os
from datetime import datetime, timedelta

import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("fred_client")

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

FRED_SERIES = {
    # Liquidita e politica monetaria
    "fed_balance_sheet": "WALCL",     # Fed balance sheet totale
    "m2_money_supply": "M2SL",        # M2 money supply
    "fed_funds_rate": "FEDFUNDS",     # Fed funds rate
    "sofr": "SOFR",                   # Tasso interbancario USA
    "financial_cond_idx": "NFCI",     # Chicago Fed FCI
    # Macro economia
    "cpi_inflation": "CPIAUCSL",      # CPI inflazione
    "unemployment": "UNRATE",         # Tasso disoccupazione
    "pmi_manufacturing": "MANEMP",    # Manufacturing employment proxy
    "yield_curve_10_2": "T10Y2Y",     # Spread 10y-2y (recessione)
    "vix": "VIXCLS",                  # VIX (volatilita mercato)
    # Interest rates
    "rate_10y": "GS10",               # Treasury 10 anni
    "rate_2y": "GS2",                 # Treasury 2 anni
    "rate_direction": "FEDFUNDS",     # Direzione tassi Fed
}


def get_series(series_id: str, periods: int = 3) -> list[dict]:
    """Recupera ultimi N periodi per una serie FRED."""
    api_key = os.getenv("FRED_API_KEY")
    if not api_key:
        logger.warning("FRED_API_KEY non configurata")
        return []

    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": periods,
        "observation_start": (
            datetime.now() - timedelta(days=365)
        ).strftime("%Y-%m-%d"),
    }

    try:
        resp = httpx.get(FRED_BASE, params=params, timeout=10)
        resp.raise_for_status()
        obs = resp.json().get("observations", [])
        return [
            {"date": o["date"], "value": float(o["value"])}
            for o in obs
            if o["value"] not in (".", "")
        ]
    except Exception as e:
        logger.warning("FRED error %s: %s", series_id, e)
        return []


def get_liquidity_context() -> dict:
    """
    Recupera tutti i dati di liquidita rilevanti
    e calcola direzione e livello.
    """
    result: dict = {}

    # Fed balance sheet
    fed_bs = get_series("WALCL", periods=4)
    if len(fed_bs) >= 2:
        latest = fed_bs[0]["value"]
        prev = fed_bs[-1]["value"]
        change_pct = (latest - prev) / prev * 100
        result["fed_balance_sheet"] = {
            "value": latest,
            "change_pct": round(change_pct, 2),
            "direction": (
                "expanding" if change_pct > 0.5
                else "contracting" if change_pct < -0.5
                else "stable"
            ),
        }

    # M2 money supply
    m2 = get_series("M2SL", periods=4)
    if len(m2) >= 2:
        latest = m2[0]["value"]
        prev = m2[-1]["value"]
        result["m2"] = {
            "value": latest,
            "yoy_change": round((latest - prev) / prev * 100, 2),
            "direction": "expanding" if latest > prev else "contracting",
        }

    # Fed funds rate
    ffr = get_series("FEDFUNDS", periods=6)
    if len(ffr) >= 2:
        latest = ffr[0]["value"]
        oldest = ffr[-1]["value"]
        result["fed_funds_rate"] = {
            "value": latest,
            "direction": (
                "rising" if latest > oldest + 0.1
                else "falling" if latest < oldest - 0.1
                else "stable"
            ),
        }

    # Yield curve 10y-2y
    yc = get_series("T10Y2Y", periods=2)
    if yc:
        val = yc[0]["value"]
        result["yield_curve"] = {
            "value": val,
            "inverted": val < 0,
            "signal": (
                "recession_risk" if val < -0.5
                else "warning" if val < 0
                else "normal"
            ),
        }

    # VIX
    vix = get_series("VIXCLS", periods=2)
    if vix:
        val = vix[0]["value"]
        result["vix"] = {
            "value": val,
            "regime": (
                "fear" if val > 30
                else "elevated" if val > 20
                else "calm"
            ),
        }

    # Calcola liquidity score complessivo (-1 a +1)
    score = 0.0
    factors = 0

    if "fed_balance_sheet" in result:
        d = result["fed_balance_sheet"]["direction"]
        score += 1.0 if d == "expanding" else -1.0 if d == "contracting" else 0
        factors += 1

    if "fed_funds_rate" in result:
        d = result["fed_funds_rate"]["direction"]
        score += -1.0 if d == "rising" else 1.0 if d == "falling" else 0
        factors += 1

    if "yield_curve" in result:
        score += -1.0 if result["yield_curve"]["inverted"] else 0.5
        factors += 1

    if "vix" in result:
        v = result["vix"]["regime"]
        score += -1.0 if v == "fear" else -0.3 if v == "elevated" else 0.5
        factors += 1

    if factors > 0:
        result["liquidity_score"] = round(score / factors, 3)
        result["liquidity_direction"] = (
            "bullish" if score / factors > 0.3
            else "bearish" if score / factors < -0.3
            else "neutral"
        )

    return result


if __name__ == "__main__":
    import json

    logging.basicConfig(level=logging.INFO)
    ctx = get_liquidity_context()
    print(json.dumps(ctx, indent=2))
