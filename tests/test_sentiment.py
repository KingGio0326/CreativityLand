import pytest
from unittest.mock import patch, MagicMock, call
from nlp.sentiment import SentimentAnalyzer, _with_retry


# ---------------------------------------------------------------------------
# Existing tests (kept)
# ---------------------------------------------------------------------------

def test_analyze_returns_correct_keys():
    with patch.object(SentimentAnalyzer, "__init__", lambda self, **kw: None):
        sa = SentimentAnalyzer()
        sa._model_available = True
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
        sa._model_available = True
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
        sa._model_available = True
        sa.classifier = MagicMock(
            return_value=[{"label": "negative", "score": 0.88}]
        )
        sa.supabase = MagicMock()
        result = sa.analyze("Company going bankrupt")
        assert result["label"] in ["positive", "negative", "neutral"]


# ---------------------------------------------------------------------------
# Retry utility
# ---------------------------------------------------------------------------

def test_retry_succeeds_on_second_attempt():
    """Function that fails once then succeeds should not raise."""
    calls = []
    def flaky():
        calls.append(1)
        if len(calls) < 2:
            raise ConnectionError("temporary")
        return "ok"

    result = _with_retry(flaky, retries=3, base_delay=0)
    assert result == "ok"
    assert len(calls) == 2


def test_retry_raises_after_all_attempts():
    """Function that always fails should raise after exhausting retries."""
    def always_fail():
        raise RuntimeError("always")

    with pytest.raises(RuntimeError, match="always"):
        _with_retry(always_fail, retries=3, base_delay=0)


# ---------------------------------------------------------------------------
# Model unavailable — graceful degradation
# ---------------------------------------------------------------------------

def test_model_load_failure_no_crash():
    """If FinBERT fails to load, __init__ must not raise."""
    with patch("nlp.sentiment.create_client", return_value=MagicMock()):
        with patch(
            "transformers.AutoTokenizer.from_pretrained",
            side_effect=OSError("network error"),
        ):
            sa = SentimentAnalyzer()
    assert sa._model_available is False


def test_model_unavailable_analyze_returns_neutral():
    with patch.object(SentimentAnalyzer, "__init__", lambda self, **kw: None):
        sa = SentimentAnalyzer()
        sa._model_available = False
        sa.classifier = None
        sa.supabase = MagicMock()
        result = sa.analyze("anything")
    assert result == {"label": "neutral", "score": 0.0}


def test_model_unavailable_process_unanalyzed_returns_zero():
    """When model is not available, process_unanalyzed must return 0 and not
    mark any articles as processed."""
    with patch.object(SentimentAnalyzer, "__init__", lambda self, **kw: None):
        sa = SentimentAnalyzer()
        sa._model_available = False
        sa.classifier = None
        sb = MagicMock()
        sa.supabase = sb

        result = sa.process_unanalyzed()

    assert result == 0
    # Supabase update must NOT have been called
    sb.table.return_value.update.assert_not_called()


# ---------------------------------------------------------------------------
# Supabase transient failures
# ---------------------------------------------------------------------------

def _make_sa_with_model():
    """Return a SentimentAnalyzer with mocked model and Supabase."""
    with patch.object(SentimentAnalyzer, "__init__", lambda self, **kw: None):
        sa = SentimentAnalyzer()
    sa._model_available = True
    sa.classifier = MagicMock(return_value=[{"label": "positive", "score": 0.9}])
    sa.supabase = MagicMock()
    return sa


def test_update_fails_once_then_succeeds():
    """If one update attempt fails but the retry succeeds, article is counted."""
    sa = _make_sa_with_model()

    article = {
        "id": "art-1", "content": "Good news", "geo_weight": 1.0,
    }
    # Fetch returns one article
    sa.supabase.table.return_value.select.return_value \
        .eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[article]
        )

    # Update: first call raises, second call succeeds
    update_execute = MagicMock(
        side_effect=[ConnectionError("502"), MagicMock()]
    )
    sa.supabase.table.return_value.update.return_value \
        .eq.return_value.execute = update_execute

    result = sa.process_unanalyzed(limit=100)
    assert result == 1


def test_update_always_fails_does_not_raise():
    """If all update retries fail, process_unanalyzed must not raise and
    must return 0 (the article stays unprocessed)."""
    sa = _make_sa_with_model()

    article = {
        "id": "art-2", "content": "Bad network", "geo_weight": 1.0,
    }
    sa.supabase.table.return_value.select.return_value \
        .eq.return_value.limit.return_value.execute.return_value = MagicMock(
            data=[article]
        )
    sa.supabase.table.return_value.update.return_value \
        .eq.return_value.execute = MagicMock(
            side_effect=ConnectionError("503")
        )

    # Must not raise
    result = sa.process_unanalyzed(limit=100)
    assert result == 0


def test_fetch_fails_temporarily_then_succeeds():
    """If the fetch fails once then succeeds, processing continues normally."""
    sa = _make_sa_with_model()

    article = {"id": "art-3", "content": "Recovery", "geo_weight": 1.0}

    fetch_mock = MagicMock()
    fetch_mock.data = [article]

    execute_calls = [ConnectionError("502"), fetch_mock]
    sa.supabase.table.return_value.select.return_value \
        .eq.return_value.limit.return_value.execute = MagicMock(
            side_effect=execute_calls
        )

    sa.supabase.table.return_value.update.return_value \
        .eq.return_value.execute.return_value = MagicMock()

    result = sa.process_unanalyzed(limit=100)
    assert result == 1


def test_fetch_always_fails_returns_zero():
    """If all fetch retries fail, process_unanalyzed returns 0 without crashing."""
    sa = _make_sa_with_model()

    sa.supabase.table.return_value.select.return_value \
        .eq.return_value.limit.return_value.execute = MagicMock(
            side_effect=ConnectionError("always down")
        )

    result = sa.process_unanalyzed(limit=100)
    assert result == 0
