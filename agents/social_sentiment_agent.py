import os
import praw
from datetime import datetime, timezone
from agents import TradingState

SUBREDDIT_MAP = {
    "AAPL": ["stocks", "wallstreetbets", "apple"],
    "TSLA": ["stocks", "wallstreetbets", "teslainvestorsclub"],
    "MSFT": ["stocks", "wallstreetbets", "microsoft"],
    "AMZN": ["stocks", "wallstreetbets", "amazon"],
    "GOOGL": ["stocks", "wallstreetbets", "google"],
    "META": ["stocks", "wallstreetbets", "facebook"],
    "NVDA": ["stocks", "wallstreetbets", "nvidia"],
    "BTC-USD": ["bitcoin", "cryptocurrency", "CryptoMarkets"],
    "ETH-USD": ["ethereum", "cryptocurrency", "CryptoMarkets"],
}

DEFAULT_SUBS = ["stocks", "wallstreetbets", "investing"]


class SocialSentimentAgent:
    def __init__(self):
        client_id = os.getenv("REDDIT_CLIENT_ID", "")
        client_secret = os.getenv("REDDIT_CLIENT_SECRET", "")
        user_agent = os.getenv("REDDIT_USER_AGENT", "TradingBot/1.0")
        self.reddit = None
        if client_id and client_secret:
            try:
                self.reddit = praw.Reddit(
                    client_id=client_id,
                    client_secret=client_secret,
                    user_agent=user_agent,
                )
            except Exception:
                self.reddit = None

    def _get_posts(self, ticker: str, limit: int = 50) -> list:
        if not self.reddit:
            return []
        subs = SUBREDDIT_MAP.get(ticker, DEFAULT_SUBS)
        posts = []
        clean_ticker = ticker.replace("-", "").replace(".", "")
        for sub_name in subs:
            try:
                subreddit = self.reddit.subreddit(sub_name)
                for post in subreddit.search(
                    clean_ticker, sort="new",
                    time_filter="week", limit=limit,
                ):
                    posts.append({
                        "title": post.title,
                        "text": post.selftext[:500] if post.selftext else "",
                        "score": post.score,
                        "upvote_ratio": post.upvote_ratio,
                        "num_comments": post.num_comments,
                        "created_utc": post.created_utc,
                        "subreddit": sub_name,
                    })
            except Exception:
                continue
        return posts

    def _keyword_sentiment(self, text: str) -> float:
        text_lower = text.lower()
        bullish = [
            "moon", "rocket", "buy", "calls", "bull",
            "breakout", "undervalued", "long", "diamond hands",
            "to the moon", "squeeze", "yolo", "tendies",
        ]
        bearish = [
            "puts", "bear", "sell", "short", "crash",
            "overvalued", "dump", "bubble", "baghold",
            "rug pull", "dead cat", "worthless",
        ]
        score = 0
        for word in bullish:
            if word in text_lower:
                score += 1
        for word in bearish:
            if word in text_lower:
                score -= 1
        return max(-1.0, min(1.0, score / 3))

    def analyze(self, ticker: str) -> dict:
        posts = self._get_posts(ticker)
        if not posts:
            return {
                "signal": "HOLD",
                "confidence": 0.0,
                "post_count": 0,
                "avg_sentiment": 0.0,
                "hype_score": 0.0,
                "bullish_pct": 0.0,
                "bearish_pct": 0.0,
                "reasoning": "Nessun post trovato o Reddit non configurato",
            }

        sentiments = []
        weights = []
        for p in posts:
            text = f"{p['title']} {p['text']}"
            sent = self._keyword_sentiment(text)
            weight = max(1, p["score"]) * p.get("upvote_ratio", 0.5)
            sentiments.append(sent)
            weights.append(weight)

        total_weight = sum(weights)
        if total_weight > 0:
            weighted_avg = sum(
                s * w for s, w in zip(sentiments, weights)
            ) / total_weight
        else:
            weighted_avg = 0.0

        bullish_count = sum(1 for s in sentiments if s > 0)
        bearish_count = sum(1 for s in sentiments if s < 0)
        total = len(sentiments)
        bullish_pct = bullish_count / total if total > 0 else 0
        bearish_pct = bearish_count / total if total > 0 else 0

        # Hype score: volume + engagement
        total_comments = sum(p["num_comments"] for p in posts)
        avg_comments = total_comments / total if total > 0 else 0
        hype_score = min(1.0, (total / 50) * 0.5 + (avg_comments / 100) * 0.5)

        # Signal logic
        if weighted_avg > 0.3 and bullish_pct > 0.6:
            signal = "BUY"
            confidence = min(0.8, abs(weighted_avg) * 0.7 + hype_score * 0.3)
        elif weighted_avg < -0.3 and bearish_pct > 0.6:
            signal = "SELL"
            confidence = min(0.8, abs(weighted_avg) * 0.7 + hype_score * 0.3)
        else:
            signal = "HOLD"
            confidence = 0.3

        return {
            "signal": signal,
            "confidence": round(confidence, 3),
            "post_count": total,
            "avg_sentiment": round(weighted_avg, 3),
            "hype_score": round(hype_score, 3),
            "bullish_pct": round(bullish_pct, 3),
            "bearish_pct": round(bearish_pct, 3),
            "reasoning": (
                f"posts={total}, sent={weighted_avg:.2f}, "
                f"hype={hype_score:.2f}, "
                f"bull={bullish_pct:.0%}/bear={bearish_pct:.0%}"
            ),
        }


def social_agent_node(state: TradingState) -> TradingState:
    agent = SocialSentimentAgent()
    analysis = agent.analyze(state["ticker"])
    state["social_analysis"] = analysis
    state["reasoning"].append(
        f"SocialAgent: {analysis['signal']} "
        f"({analysis['confidence']:.0%}) | "
        f"{analysis['reasoning']}"
    )
    return state
