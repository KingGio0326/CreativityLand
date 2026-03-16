import yfinance as yf
import numpy as np
from agents import TradingState


class MomentumAgent:
    def analyze(self, ticker: str) -> dict:
        try:
            df = yf.download(
                ticker, period="1y",
                interval="1d", progress=False
            )
            if len(df) < 60:
                raise ValueError("Dati insufficienti")
            close = df["Close"].squeeze()
            current = float(close.iloc[-1])

            def mom(days):
                if len(close) > days:
                    past = float(close.iloc[-days])
                    return (current / past) - 1 if past > 0 else 0
                return 0

            m1 = mom(21)
            m3 = mom(63)
            m6 = mom(126)
            m12 = mom(252)

            score_w = (0.40 * m3 + 0.30 * m6 +
                       0.20 * m12 + 0.10 * m1)

            # Relative strength vs SPY
            try:
                spy = yf.download(
                    "SPY", period="1y",
                    interval="1d", progress=False
                )
                spy_close = spy["Close"].squeeze()
                spy_ret = (float(spy_close.iloc[-1]) /
                           float(spy_close.iloc[0])) - 1
                ticker_ret = (current /
                              float(close.iloc[0])) - 1
                rs = ((1 + ticker_ret) /
                      (1 + spy_ret) if spy_ret != -1 else 1)
            except Exception:
                rs = 1.0

            # Weekly win rate
            weekly = close.resample("W").last().pct_change().dropna()
            win_rate = float((weekly > 0).mean()) if len(weekly) > 0 else 0.5

            score = 0
            if score_w > 0.15:
                score += 2
            elif score_w > 0.05:
                score += 1
            elif score_w < -0.10:
                score -= 2
            elif score_w < 0:
                score -= 1

            if rs > 1.1:
                score += 2
            elif rs < 0.9:
                score -= 2

            if win_rate > 0.60:
                score += 1
            elif win_rate < 0.40:
                score -= 1

            if score_w > 0.20:
                trend = "strong_up"
            elif score_w > 0.05:
                trend = "up"
            elif score_w < -0.15:
                trend = "strong_down"
            elif score_w < 0:
                trend = "down"
            else:
                trend = "flat"

            signal = ("BUY" if score > 2
                      else "SELL" if score < -2
                      else "HOLD")
            confidence = min(abs(score) / 5, 1.0)

            return {
                "signal": signal, "confidence": confidence,
                "momentum_3m": round(m3, 4),
                "momentum_6m": round(m6, 4),
                "momentum_12m": round(m12, 4),
                "relative_strength": round(rs, 3),
                "weekly_win_rate": round(win_rate, 3),
                "trend": trend, "score": score,
                "reasoning": (
                    f"mom3m={m3:.1%}, mom6m={m6:.1%}, "
                    f"RS={rs:.2f}, win_rate={win_rate:.0%}, "
                    f"trend={trend}"
                )
            }
        except Exception as e:
            return {
                "signal": "HOLD", "confidence": 0.3,
                "momentum_3m": 0, "momentum_6m": 0,
                "momentum_12m": 0, "relative_strength": 1.0,
                "weekly_win_rate": 0.5, "trend": "flat",
                "score": 0,
                "reasoning": f"Errore momentum: {e}"
            }


def momentum_agent_node(state: TradingState) -> TradingState:
    agent = MomentumAgent()
    analysis = agent.analyze(state["ticker"])
    state["momentum_analysis"] = analysis
    state["reasoning"].append(
        f"MomentumAgent: {analysis['signal']} "
        f"({analysis['confidence']:.0%}) | "
        f"{analysis['reasoning']}"
    )
    return state
