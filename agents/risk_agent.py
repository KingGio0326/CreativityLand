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
        returns = df["Close"].pct_change().dropna()
        volatility = float(returns.std())
        current = float(df["Close"].iloc[-1])
        mean_14 = float(df["Close"].mean())
        trend = (current - mean_14) / mean_14
        drawdown = float(
            (df["Close"] / df["Close"].cummax() - 1).min()
        )
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
