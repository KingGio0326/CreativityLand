from unittest.mock import patch, MagicMock
from agents.social_sentiment_agent import SocialSentimentAgent, social_agent_node


def _mock_post(title, text="", score=10, upvote_ratio=0.9, num_comments=5):
    post = MagicMock()
    post.title = title
    post.selftext = text
    post.score = score
    post.upvote_ratio = upvote_ratio
    post.num_comments = num_comments
    post.created_utc = 1700000000.0
    return post


def test_no_reddit_returns_hold():
    """Without Reddit credentials, agent returns HOLD."""
    agent = SocialSentimentAgent()
    result = agent.analyze("AAPL")
    assert result["signal"] == "HOLD"
    assert result["post_count"] == 0
    assert result["confidence"] == 0.0


def test_bullish_posts():
    """Bullish posts should produce BUY signal."""
    agent = SocialSentimentAgent()
    bullish_posts = [
        {
            "title": "AAPL to the moon rocket buy calls diamond hands",
            "text": "YOLO squeeze tendies breakout",
            "score": 100,
            "upvote_ratio": 0.95,
            "num_comments": 50,
            "created_utc": 1700000000.0,
            "subreddit": "wallstreetbets",
        }
        for _ in range(10)
    ]
    with patch.object(agent, "_get_posts", return_value=bullish_posts):
        result = agent.analyze("AAPL")
    assert result["signal"] == "BUY"
    assert result["confidence"] > 0
    assert result["bullish_pct"] > 0.5


def test_bearish_posts():
    """Bearish posts should produce SELL signal."""
    agent = SocialSentimentAgent()
    bearish_posts = [
        {
            "title": "AAPL puts bear crash dump sell short",
            "text": "overvalued bubble baghold rug pull dead cat worthless",
            "score": 80,
            "upvote_ratio": 0.85,
            "num_comments": 30,
            "created_utc": 1700000000.0,
            "subreddit": "stocks",
        }
        for _ in range(10)
    ]
    with patch.object(agent, "_get_posts", return_value=bearish_posts):
        result = agent.analyze("AAPL")
    assert result["signal"] == "SELL"
    assert result["confidence"] > 0
    assert result["bearish_pct"] > 0.5


def test_social_agent_node():
    """Node function should update state correctly."""
    state = {
        "ticker": "AAPL",
        "articles": [],
        "sentiment_summary": {},
        "historical_context": "",
        "risk_assessment": {},
        "proposed_signal": "",
        "confidence": 0.0,
        "reasoning": [],
        "final_signal": "",
        "retry_count": 0,
        "macro_analysis": {},
        "macro_adjusted": False,
        "technical_analysis": {},
        "fundamental_analysis": {},
        "momentum_analysis": {},
        "mean_reversion_analysis": {},
        "ml_prediction": {},
        "social_analysis": {},
    }
    result = social_agent_node(state)
    assert "social_analysis" in result
    assert result["social_analysis"]["signal"] in ["BUY", "SELL", "HOLD"]
    assert len(result["reasoning"]) == 1
    assert "SocialAgent" in result["reasoning"][0]
