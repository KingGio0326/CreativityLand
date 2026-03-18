import logging

import yfinance as yf
import numpy as np
import pandas as pd
import ta
from agents import TradingState

logger = logging.getLogger("mean_reversion_agent")


class MeanReversionAgent:
    def analyze(self, ticker: str,
                momentum_trend: str = "flat") -> dict:
        # Se mercato in forte trend non usare mean reversion
        if momentum_trend in ["strong_up", "strong_down"]:
            return {
                "signal": "HOLD", "confidence": 0.0,
                "z_score": 0, "bb_percent_b": 0.5,
                "half_life_days": 999, "is_ranging": False,
                "divergence": "none",
                "reasoning": "Disabilitato: mercato in forte trend"
            }
        try:
            df = yf.download(
                ticker, period="60d",
                interval="1d", progress=False
            )
            if len(df) < 20:
                raise ValueError("Dati insufficienti")
            # Flatten multi-level columns from yfinance
            close = pd.Series(
                df["Close"].values.flatten(),
                index=df.index
            )
            logger.info(
                "MeanReversion: %d prezzi, last=%s",
                len(close),
                f"{close.iloc[-1]:.2f}" if len(close) > 0 else "N/A"
            )
            current = float(close.iloc[-1])

            # Z-Score
            mean_20 = float(close.rolling(20).mean().iloc[-1])
            std_20 = float(close.rolling(20).std().iloc[-1])
            if np.isnan(std_20) or std_20 == 0:
                logger.info("MeanReversion: std_20=0 or NaN, returning HOLD")
                z_score = 0.0
            else:
                z_score = (current - mean_20) / std_20

            # Bollinger %B
            try:
                bb = ta.volatility.BollingerBands(close, 20, 2)
                upper = float(bb.bollinger_hband().iloc[-1])
                lower = float(bb.bollinger_lband().iloc[-1])
                if np.isnan(upper) or np.isnan(lower) or upper == lower:
                    bb_b = 0.5
                else:
                    bb_b = (current - lower) / (upper - lower)
            except Exception as bb_err:
                logger.warning("Bollinger calc failed: %s", bb_err)
                bb_b = 0.5

            # RSI divergence
            rsi_series = ta.momentum.rsi(close, 14)
            recent_close = close.iloc[-14:]
            recent_rsi = rsi_series.iloc[-14:]
            price_new_low = (float(recent_close.iloc[-1]) ==
                             float(recent_close.min()))
            rsi_new_low = (float(recent_rsi.iloc[-1]) ==
                           float(recent_rsi.min()))
            price_new_high = (float(recent_close.iloc[-1]) ==
                              float(recent_close.max()))
            rsi_new_high = (float(recent_rsi.iloc[-1]) ==
                            float(recent_rsi.max()))

            if price_new_low and not rsi_new_low:
                divergence = "bullish"
            elif price_new_high and not rsi_new_high:
                divergence = "bearish"
            else:
                divergence = "none"

            # Half-life via AR(1)
            try:
                import statsmodels.api as sm
                y = close.diff().dropna().values
                x = close.shift(1).dropna().values
                min_len = min(len(x), len(y))
                x, y = x[:min_len], y[:min_len]
                x_c = sm.add_constant(x)
                model = sm.OLS(y, x_c).fit()
                beta = model.params[1]
                half_life = (int(-np.log(2) / np.log(abs(beta)))
                             if beta < 0 else 999)
            except Exception:
                half_life = 999

            is_ranging = half_life < 20

            score = 0
            if z_score < -2.0:
                score += 3
            elif z_score < -1.0:
                score += 1
            elif z_score > 2.0:
                score -= 3
            elif z_score > 1.0:
                score -= 1
            if bb_b < 0:
                score += 2
            elif bb_b > 1:
                score -= 2
            if divergence == "bullish":
                score += 2
            elif divergence == "bearish":
                score -= 2
            if is_ranging:
                score = int(score * 1.2)

            signal = ("BUY" if score > 2
                      else "SELL" if score < -2
                      else "HOLD")
            confidence = min(abs(score) / 6, 1.0) * 0.85

            return {
                "signal": signal, "confidence": confidence,
                "z_score": round(z_score, 3),
                "bb_percent_b": round(bb_b, 3),
                "half_life_days": half_life,
                "is_ranging": is_ranging,
                "divergence": divergence,
                "reasoning": (
                    f"z={z_score:.2f}, %B={bb_b:.2f}, "
                    f"half_life={half_life}d, "
                    f"div={divergence}, ranging={is_ranging}"
                )
            }
        except Exception as e:
            return {
                "signal": "HOLD", "confidence": 0.0,
                "z_score": 0, "bb_percent_b": 0.5,
                "half_life_days": 999, "is_ranging": False,
                "divergence": "none",
                "reasoning": f"Errore mean reversion: {e}"
            }


def mean_reversion_agent_node(
    state: TradingState
) -> TradingState:
    momentum = state.get("momentum_analysis", {})
    trend = momentum.get("trend", "flat")
    agent = MeanReversionAgent()
    analysis = agent.analyze(state["ticker"], trend)
    state["mean_reversion_analysis"] = analysis
    state["reasoning"].append(
        f"MeanReversionAgent: {analysis['signal']} "
        f"({analysis['confidence']:.0%}) | "
        f"{analysis['reasoning']}"
    )
    return state
