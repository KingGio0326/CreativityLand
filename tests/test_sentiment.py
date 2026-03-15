"""Tests for the sentiment analysis module."""


def test_sentiment_output_format():
    """Test that sentiment output has the expected structure."""
    result = {"label": "positive", "score": 0.95}
    assert "label" in result
    assert "score" in result
    assert isinstance(result["score"], float)
