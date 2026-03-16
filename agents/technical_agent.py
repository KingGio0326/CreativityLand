import yfinance as yf
import pandas as pd
import ta
from agents import TradingState


class TechnicalAgent:
    def analyze(self, ticker: str) -> dict:
        try:
            df = yf.download(
                ticker, period="90d",
                interval="1d", progress=False
            )
            if len(df) < 30:
                raise ValueError("Dati insufficienti")
            close = df["Close"].squeeze()
            volume = df["Volume"].squeeze()
            high = df["High"].squeeze()
            low = df["Low"].squeeze()

            # TREND
            ma20 = ta.trend.sma_indicator(close, 20).iloc[-1]
            ma50 = ta.trend.sma_indicator(close, 50).iloc[-1]
            ma200 = ta.trend.sma_indicator(close, 200).iloc[-1]

            # MOMENTUM
            rsi = ta.momentum.rsi(close, 14).iloc[-1]
            macd_ind = ta.trend.MACD(close)
            macd_hist = macd_ind.macd_diff().iloc[-1]

            # BOLLINGER
            bb = ta.volatility.BollingerBands(close, 20, 2)
            bb_upper = bb.bollinger_hband().iloc[-1]
            bb_lower = bb.bollinger_lband().iloc[-1]
            current_price = float(close.iloc[-1])

            # VOLUME
            vol_avg = float(volume.rolling(20).mean().iloc[-1])
            vol_today = float(volume.iloc[-1])
            volume_ratio = vol_today / vol_avg if vol_avg > 0 else 1.0

            # SCORE
            score = 0
            score += 1 if current_price > ma50 else -1
            golden_cross = ma50 > ma200
            score += 2 if golden_cross else -2
            if rsi < 30:
                score += 2
            elif rsi > 70:
                score -= 2
            if macd_hist > 0:
                score += 1
            else:
                score -= 1
            if current_price < bb_lower:
                score += 1
            elif current_price > bb_upper:
                score -= 1
            if volume_ratio > 1.5:
                score = int(score * 1.2)

            signal = ("BUY" if score > 2
                      else "SELL" if score < -2
                      else "HOLD")
            confidence = min(abs(score) / 6, 1.0)
            bb_pos = ("above" if current_price > bb_upper
                      else "below" if current_price < bb_lower
                      else "inside")
            ma_trend = ("bullish" if ma50 > ma200
                        else "bearish")

            return {
                "signal": signal, "confidence": confidence,
                "rsi": round(float(rsi), 2),
                "macd_hist": round(float(macd_hist), 4),
                "ma_trend": ma_trend,
                "bb_position": bb_pos,
                "golden_cross": bool(golden_cross),
                "volume_surge": volume_ratio > 1.5,
                "score": score,
                "reasoning": (
                    f"RSI={rsi:.1f}, MACD_hist={macd_hist:.4f}, "
                    f"trend={ma_trend}, BB={bb_pos}"
                )
            }
        except Exception as e:
            return {
                "signal": "HOLD", "confidence": 0.3,
                "rsi": 50.0, "macd_hist": 0.0,
                "ma_trend": "neutral", "bb_position": "inside",
                "golden_cross": False, "volume_surge": False,
                "score": 0,
                "reasoning": f"Errore analisi tecnica: {e}"
            }


def technical_agent_node(state: TradingState) -> TradingState:
    agent = TechnicalAgent()
    analysis = agent.analyze(state["ticker"])
    state["technical_analysis"] = analysis
    state["reasoning"].append(
        f"TechnicalAgent: {analysis['signal']} "
        f"({analysis['confidence']:.0%}) | "
        f"{analysis['reasoning']}"
    )
    return state
