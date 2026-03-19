import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

_supabase = None


def _get_supabase():
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
    return _supabase


def _safe_float(x):
    """Convert pandas Series/scalar to float safely."""
    if hasattr(x, "iloc"):
        return float(x.iloc[0])
    if hasattr(x, "item"):
        return float(x.item())
    return float(x)


def kelly_position_size(
    confidence: float,
    win_rate: float = 0.55,
    avg_win: float = 0.03,
    avg_loss: float = 0.02,
    capital: float = 10000.0,
    max_fraction: float = 0.25,
) -> dict:
    """
    Kelly criterion per position sizing ottimale.

    Formula: f* = (p*b - q) / b
    dove:
    - p = win_rate (probabilita di vincita)
    - q = 1 - p (probabilita di perdita)
    - b = avg_win / avg_loss (rapporto win/loss)

    Usa fractional Kelly (0.5x) per ridurre volatilita.
    """
    p = min(max(win_rate, 0.1), 0.9)
    q = 1 - p
    b = avg_win / avg_loss if avg_loss > 0 else 1.5

    # Kelly fraction
    kelly_f = (p * b - q) / b

    # Fractional Kelly (50%) — piu conservativo
    fractional_kelly = kelly_f * 0.5

    # Aggiusta per confidence del segnale
    confidence_adj = confidence / 100.0 if confidence > 1 else confidence
    adjusted_kelly = fractional_kelly * confidence_adj

    # Cap al max_fraction (mai piu del 25% del capitale)
    final_fraction = min(max(adjusted_kelly, 0.0), max_fraction)

    # Calcola capitale suggerito (simbolico per paper trading)
    suggested_capital = capital * final_fraction

    return {
        "kelly_fraction": round(kelly_f, 4),
        "fractional_kelly": round(fractional_kelly, 4),
        "adjusted_kelly": round(adjusted_kelly, 4),
        "final_fraction": round(final_fraction, 4),
        "suggested_pct": round(final_fraction * 100, 1),
        "suggested_capital": round(suggested_capital, 2),
        "edge": round(p * b - q, 4),
    }


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

        # ── Kelly criterion position sizing ──
        final_confidence = state.get("confidence", 0.5)
        historical_win_rate = 0.55  # default conservativo
        try:
            perf = _get_supabase().table("agent_performance") \
                .select("hit_rate, avg_score") \
                .eq("ticker", state["ticker"]) \
                .eq("agent_name", "pipeline") \
                .order("date", desc=True) \
                .limit(1) \
                .execute()
            if perf.data:
                historical_win_rate = perf.data[0].get(
                    "hit_rate", 0.55,
                )
        except Exception:
            pass

        kelly = kelly_position_size(
            confidence=final_confidence,
            win_rate=historical_win_rate,
        )
        state["kelly_sizing"] = kelly
        state["reasoning"].append(
            f"RiskAgent: Kelly sizing → {kelly['suggested_pct']}% capitale "
            f"(edge={kelly['edge']:.3f}, "
            f"win_rate={historical_win_rate:.2f})"
        )

    except Exception as e:
        state["risk_assessment"] = {
            "risk_level": "MEDIUM",
            "volatility": 0.02,
            "trend": 0.0,
            "max_drawdown": -0.05
        }
        state["kelly_sizing"] = kelly_position_size(
            confidence=0.5, win_rate=0.55,
        )
        state["reasoning"].append(f"RiskAgent: fallback MEDIUM ({e})")
    return state
