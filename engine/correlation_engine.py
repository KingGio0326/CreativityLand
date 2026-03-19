import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger("correlation_engine")

MONITORED_TICKERS = [
    "AAPL", "TSLA", "NVDA", "BTC-USD",
    "ETH-USD", "MSFT", "XOM", "GLD",
]


def build_correlation_matrix(
    tickers: list[str] | None = None,
    period_days: int = 90,
) -> dict:
    """
    Calcola la matrice di correlazione tra i ticker
    negli ultimi N giorni.
    Ritorna dict con matrice e insights chiave.
    """
    if tickers is None:
        tickers = MONITORED_TICKERS

    end = datetime.now()
    start = end - timedelta(days=period_days + 5)

    try:
        df = yf.download(
            tickers,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=True,
        )["Close"]

        if df.empty:
            return {}

        # Calcola returns giornalieri
        returns = df.pct_change().dropna()

        # Matrice correlazione
        corr_matrix = returns.corr()

        # Identifica correlazioni significative
        high_correlations = []
        low_correlations = []

        for i, t1 in enumerate(tickers):
            for j, t2 in enumerate(tickers):
                if j <= i:
                    continue
                if t1 not in corr_matrix or t2 not in corr_matrix:
                    continue
                corr = float(corr_matrix.loc[t1, t2])
                if abs(corr) > 0.7:
                    high_correlations.append({
                        "ticker1": t1,
                        "ticker2": t2,
                        "correlation": round(corr, 3),
                        "type": "positive" if corr > 0 else "negative",
                    })
                elif abs(corr) < 0.2:
                    low_correlations.append({
                        "ticker1": t1,
                        "ticker2": t2,
                        "correlation": round(corr, 3),
                    })

        return {
            "matrix": corr_matrix.round(3).to_dict(),
            "high_correlations": sorted(
                high_correlations,
                key=lambda x: abs(x["correlation"]),
                reverse=True,
            ),
            "low_correlations": low_correlations,
            "computed_at": datetime.now().isoformat(),
            "period_days": period_days,
        }

    except Exception as e:
        logger.warning("Correlation matrix error: %s", e)
        return {}


def get_portfolio_correlation_risk(
    open_positions: list[str],
    new_ticker: str,
) -> dict:
    """
    Valuta il rischio di correlazione aggiungendo
    new_ticker al portafoglio esistente.
    """
    if not open_positions:
        return {"risk": "low", "avg_correlation": 0.0}

    try:
        all_tickers = list(set(open_positions + [new_ticker]))
        result = build_correlation_matrix(all_tickers, period_days=60)

        if not result or "matrix" not in result:
            return {"risk": "unknown", "avg_correlation": 0.0}

        matrix = result["matrix"]
        correlations = []

        for pos in open_positions:
            if pos in matrix and new_ticker in matrix[pos]:
                corr = abs(float(matrix[pos][new_ticker]))
                correlations.append(corr)

        if not correlations:
            return {"risk": "low", "avg_correlation": 0.0}

        avg_corr = float(np.mean(correlations))
        risk = (
            "high" if avg_corr > 0.7
            else "medium" if avg_corr > 0.4
            else "low"
        )

        return {
            "risk": risk,
            "avg_correlation": round(avg_corr, 3),
            "correlations": {
                pos: round(abs(float(
                    matrix.get(pos, {}).get(new_ticker, 0)
                )), 3)
                for pos in open_positions
                if pos in matrix
            },
        }

    except Exception as e:
        logger.warning("Portfolio correlation error: %s", e)
        return {"risk": "unknown", "avg_correlation": 0.0}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = build_correlation_matrix()
    print("Alta correlazione:")
    for c in result.get("high_correlations", []):
        print(f"  {c['ticker1']} <-> {c['ticker2']}: {c['correlation']}")
