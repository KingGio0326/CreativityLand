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
        # Portfolio correlation risk
        corr_risk = {"risk": "unknown", "avg_correlation": 0.0}
        try:
            from engine.correlation_engine import get_portfolio_correlation_risk
            open_positions = [
                t for t in [
                    "AAPL", "TSLA", "NVDA", "BTC-USD",
                    "ETH-USD", "MSFT", "XOM", "GLD",
                ]
                if t != state["ticker"]
            ]
            corr_risk = get_portfolio_correlation_risk(
                open_positions, state["ticker"],
            )
            if corr_risk["risk"] == "high":
                risk_level = "HIGH"
        except Exception:
            pass

        state["risk_assessment"] = {
            "risk_level": risk_level,
            "volatility": volatility,
            "trend": trend,
            "max_drawdown": drawdown,
            "correlation_risk": corr_risk["risk"],
            "avg_correlation": corr_risk.get("avg_correlation", 0.0),
        }
        reasoning_line = (
            f"RiskAgent: volatility={volatility:.3f} → "
            f"{risk_level} | drawdown={drawdown:.1%}"
        )
        if corr_risk["risk"] in ("high", "medium"):
            reasoning_line += (
                f" | corr_risk={corr_risk['risk']}"
                f" (avg={corr_risk['avg_correlation']:.2f})"
            )
        state["reasoning"].append(reasoning_line)
    except Exception as e:
        state["risk_assessment"] = {
            "risk_level": "MEDIUM",
            "volatility": 0.02,
            "trend": 0.0,
            "max_drawdown": -0.05
        }
        state["reasoning"].append(f"RiskAgent: fallback MEDIUM ({e})")
    return state
