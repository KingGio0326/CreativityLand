import pytest
from unittest.mock import patch, MagicMock
from nlp.sentiment import SentimentAnalyzer


def test_analyze_returns_correct_keys():
    with patch.object(SentimentAnalyzer, "__init__", lambda self, **kw: None):
        sa = SentimentAnalyzer()
        sa.classifier = MagicMock(
            return_value=[{"label": "positive", "score": 0.95}]
        )
        sa.supabase = MagicMock()
        result = sa.analyze("Apple beats earnings")
        assert "label" in result
        assert "score" in result


def test_analyze_batch_length():
    with patch.object(SentimentAnalyzer, "__init__", lambda self, **kw: None):
        sa = SentimentAnalyzer()
        sa.classifier = MagicMock(
            return_value=[
                {"label": "positive", "score": 0.9},
                {"label": "negative", "score": 0.8},
                {"label": "neutral", "score": 0.7},
            ]
        )
        sa.supabase = MagicMock()
        results = sa.analyze_batch(["a", "b", "c"])
        assert len(results) == 3


def test_label_values():
    with patch.object(SentimentAnalyzer, "__init__", lambda self, **kw: None):
        sa = SentimentAnalyzer()
        sa.classifier = MagicMock(
            return_value=[{"label": "negative", "score": 0.88}]
        )
        sa.supabase = MagicMock()
        result = sa.analyze("Company going bankrupt")
        assert result["label"] in ["positive", "negative", "neutral"]
