import logging
from datetime import datetime, timedelta

import numpy as np
import yfinance as yf

logger = logging.getLogger("intermarket_agent")

# Relazioni intermarket classiche (John Murphy)
INTERMARKET_RELATIONS = {
    # Dollaro USA
    "DXY_proxy": "UUP",
    # Obbligazioni
    "bonds_10y": "TLT",
    "bonds_short": "SHY",
    # Materie prime
    "commodities": "DJP",
    "oil": "USO",
    "gold": "GLD",
    # Volatilita
    "vix_proxy": "VIXY",
    # Azionario settoriale
    "tech": "QQQ",
    "energy": "XLE",
    "financials": "XLF",
}

# Mappa relazioni per categoria di ticker
TICKER_RELATIONS = {
    "AAPL":    ["bonds_10y", "DXY_proxy", "tech"],
    "NVDA":    ["bonds_10y", "DXY_proxy", "tech"],
    "MSFT":    ["bonds_10y", "DXY_proxy", "tech"],
    "TSLA":    ["bonds_10y", "DXY_proxy", "tech"],
    "BTC-USD": ["DXY_proxy", "vix_proxy", "bonds_short"],
    "ETH-USD": ["DXY_proxy", "vix_proxy", "bonds_short"],
    "XOM":     ["oil", "DXY_proxy", "energy"],
    "GLD":     ["DXY_proxy", "bonds_10y", "vix_proxy"],
}


def get_30d_return(symbol: str) -> float | None:
    """Calcola il return a 30 giorni per un simbolo."""
    try:
        end = datetime.now()
        start = end - timedelta(days=35)
        df = yf.download(
            symbol,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=True,
        )
        if df.empty or len(df) < 5:
            return None
        prices = df["Close"].values.flatten()
        return float((prices[-1] - prices[0]) / prices[0] * 100)
    except Exception as e:
        logger.warning("Intermarket fetch error %s: %s", symbol, e)
        return None


def analyze_intermarket(ticker: str) -> dict:
    """Analizza le relazioni intermarket per il ticker."""
    relations = TICKER_RELATIONS.get(ticker, ["DXY_proxy", "bonds_10y"])

    signals: list[str] = []
    details: list[str] = []

    for rel_name in relations:
        symbol = INTERMARKET_RELATIONS.get(rel_name)
        if not symbol:
            continue

        ret = get_30d_return(symbol)
        if ret is None:
            continue

        direction = "up" if ret > 0 else "down"
        impact = "NEUTRAL"

        if rel_name == "DXY_proxy":
            if ticker in [
                "AAPL", "NVDA", "MSFT", "TSLA",
                "BTC-USD", "ETH-USD", "GLD", "XOM",
            ]:
                impact = "BEARISH" if direction == "up" else "BULLISH"
            details.append(
                f"USD {'forte' if direction == 'up' else 'debole'} "
                f"({ret:+.1f}%) -> {impact} per {ticker}"
            )

        elif rel_name == "bonds_10y":
            if ticker in ["AAPL", "NVDA", "MSFT", "TSLA", "GLD"]:
                impact = "BEARISH" if direction == "down" else "BULLISH"
            details.append(
                f"Bond 10Y {'yield in salita' if direction == 'down' else 'yield in calo'} "
                f"(TLT {ret:+.1f}%) -> {impact} per {ticker}"
            )

        elif rel_name == "bonds_short":
            if ticker in ["BTC-USD", "ETH-USD"]:
                impact = "BULLISH" if direction == "up" else "BEARISH"
            details.append(
                f"Bond 2Y (SHY {ret:+.1f}%) -> {impact} per {ticker}"
            )

        elif rel_name == "oil":
            if ticker == "XOM":
                impact = "BULLISH" if direction == "up" else "BEARISH"
            details.append(
                f"Petrolio {'in rialzo' if direction == 'up' else 'in ribasso'} "
                f"({ret:+.1f}%) -> {impact} per {ticker}"
            )

        elif rel_name == "vix_proxy":
            impact = "BEARISH" if direction == "up" else "BULLISH"
            details.append(
                f"VIX {'in salita' if direction == 'up' else 'in calo'} "
                f"({ret:+.1f}%) -> {impact}"
            )

        elif rel_name in ("tech", "energy", "financials"):
            impact = "BULLISH" if direction == "up" else "BEARISH"
            details.append(f"Settore {rel_name} {ret:+.1f}% -> {impact}")

        if impact != "NEUTRAL":
            signals.append(impact)

    # Aggrega segnali
    bullish = signals.count("BULLISH")
    bearish = signals.count("BEARISH")
    total = len(signals)

    if total == 0:
        return {
            "signal": "HOLD",
            "confidence": 0,
            "details": [],
            "summary": "Dati intermarket non disponibili",
        }

    if bullish > bearish:
        signal = "BUY"
        confidence = int((bullish / total) * 70)
    elif bearish > bullish:
        signal = "SELL"
        confidence = int((bearish / total) * 70)
    else:
        signal = "HOLD"
        confidence = 15

    return {
        "signal": signal,
        "confidence": confidence,
        "bullish_count": bullish,
        "bearish_count": bearish,
        "total_signals": total,
        "details": details,
        "summary": f"{bullish}/{total} segnali bullish | {bearish}/{total} bearish",
    }


def intermarket_agent(state: dict) -> dict:
    ticker = state.get("ticker", "")

    result = analyze_intermarket(ticker)

    reasoning_line = (
        f"IntermarketAgent: {result['signal']} ({result['confidence']}%) | "
        f"{result['summary']} | "
        + " | ".join(result["details"][:2])
    )

    logger.info(reasoning_line)

    return {
        **state,
        "intermarket_signal": result["signal"],
        "intermarket_confidence": result["confidence"],
        "intermarket_data": result,
        "reasoning": state.get("reasoning", []) + [reasoning_line],
    }
