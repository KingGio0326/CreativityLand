def _safe_float(x):
    """Convert pandas Series/scalar to float safely."""
    if hasattr(x, "iloc"):
        return float(x.iloc[0])
    if hasattr(x, "item"):
        return float(x.item())
    return float(x)


def risk_agent(state):
    import yfinance as yf
    import numpy as np
    try:
        df = yf.download(
            state["ticker"], period="14d",
            interval="1d", progress=False
        )
        if len(df) < 5:
            raise ValueError("Dati insufficienti")
        close = df["Close"].values.flatten()
        returns = np.diff(close) / close[:-1]
        volatility = float(np.nanstd(returns))
        current = float(close[-1])
        mean_14 = float(np.nanmean(close))
        trend = (current - mean_14) / mean_14 if mean_14 != 0 else 0.0
        cummax = np.maximum.accumulate(close)
        drawdown = float(np.nanmin(close / cummax - 1))
        if volatility > 0.03:
            risk_level = "HIGH"
        elif volatility > 0.01:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"
        state["risk_assessment"] = {
            "risk_level": risk_level,
            "volatility": volatility,
            "trend": trend,
            "max_drawdown": drawdown
        }
        state["reasoning"].append(
            f"RiskAgent: volatility={volatility:.3f} → "
            f"{risk_level} | drawdown={drawdown:.1%}"
        )
    except Exception as e:
        state["risk_assessment"] = {
            "risk_level": "MEDIUM",
            "volatility": 0.02,
            "trend": 0.0,
            "max_drawdown": -0.05
        }
        state["reasoning"].append(f"RiskAgent: fallback MEDIUM ({e})")
    return state
