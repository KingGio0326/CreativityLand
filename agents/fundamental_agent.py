import yfinance as yf
from agents import TradingState

CRYPTO_TICKERS = ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD"]


class FundamentalAgent:
    def analyze(self, ticker: str) -> dict:
        if ticker in CRYPTO_TICKERS:
            return {
                "available": False, "signal": "NEUTRAL",
                "confidence": 0.0,
                "reasoning": "Fondamentali non disponibili per crypto"
            }
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            score = 0

            pe = info.get("trailingPE")
            peg = info.get("pegRatio")
            rev_growth = info.get("revenueGrowth", 0) or 0
            debt_eq = info.get("debtToEquity", 1) or 1
            roe = info.get("returnOnEquity", 0) or 0
            rec = info.get("recommendationMean", 3) or 3
            current = info.get("currentPrice", 0) or 0
            target = info.get("targetMeanPrice", 0) or 0

            if pe:
                if pe < 15:
                    score += 2
                elif pe < 25:
                    score += 1
                elif pe > 40:
                    score -= 2

            if peg:
                if peg < 1:
                    score += 2
                elif peg < 2:
                    score += 1
                elif peg > 2:
                    score -= 1

            if rev_growth > 0.20:
                score += 2
            elif rev_growth > 0.05:
                score += 1
            elif rev_growth < 0:
                score -= 2

            if debt_eq > 200:
                score -= 1
            elif debt_eq < 50:
                score += 1

            if roe > 0.20:
                score += 2
            elif roe > 0.10:
                score += 1
            elif roe < 0.05:
                score -= 1

            if rec < 2.0:
                score += 2
            elif rec > 3.5:
                score -= 2

            upside = 0.0
            if current > 0 and target > 0:
                upside = (target - current) / current
                if upside > 0.10:
                    score += 1
                elif upside < -0.10:
                    score -= 1

            signal = ("BUY" if score > 4
                      else "SELL" if score < -2
                      else "HOLD")
            confidence = min(abs(score) / 8, 1.0)

            return {
                "available": True, "signal": signal,
                "confidence": confidence,
                "pe_ratio": pe, "peg_ratio": peg,
                "revenue_growth": rev_growth,
                "roe": roe,
                "analyst_signal": (
                    "Strong Buy" if rec < 1.5
                    else "Buy" if rec < 2.5
                    else "Hold" if rec < 3.5
                    else "Sell"
                ),
                "analyst_target": target,
                "upside_potential": round(upside, 3),
                "score": score,
                "reasoning": (
                    f"P/E={f'{pe:.1f}' if pe else 'N/A'}, "
                    f"growth={rev_growth:.0%}, "
                    f"ROE={roe:.0%}, analyst={rec:.1f}"
                )
            }
        except Exception as e:
            return {
                "available": False, "signal": "HOLD",
                "confidence": 0.0,
                "reasoning": f"Errore fondamentali: {e}"
            }


def fundamental_agent_node(state: TradingState) -> TradingState:
    agent = FundamentalAgent()
    analysis = agent.analyze(state["ticker"])
    state["fundamental_analysis"] = analysis
    msg = (
        f"FundamentalAgent: {analysis['signal']} "
        f"({analysis['confidence']:.0%}) | "
        f"{analysis['reasoning']}"
        if analysis["available"]
        else f"FundamentalAgent: {analysis['reasoning']}"
    )
    state["reasoning"].append(msg)
    return state
