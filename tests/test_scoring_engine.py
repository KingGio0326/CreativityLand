"""
Tests for ScoringEngine NaN/inf robustness.
Covers the bug: ValueError: Out of range float values are not JSON compliant
caused by yfinance returning NaN prices that propagated into Supabase payloads.
"""
import math
import types
from datetime import datetime
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# Helpers — isolate ScoringEngine from Supabase at import time
# ---------------------------------------------------------------------------

def _make_engine():
    """Return a ScoringEngine with a mocked Supabase client."""
    with patch("engine.scoring_engine.create_client", return_value=MagicMock()):
        from engine.scoring_engine import ScoringEngine
        return ScoringEngine()


# ---------------------------------------------------------------------------
# get_price_at — NaN / inf filtering
# ---------------------------------------------------------------------------

class TestGetPriceAt:

    def _df_with_close(self, value):
        """Return a minimal yfinance-style DataFrame with one Close row."""
        idx = pd.DatetimeIndex([datetime(2026, 4, 1)])
        return pd.DataFrame({"Close": [value]}, index=idx)

    def test_returns_none_for_nan(self):
        engine = _make_engine()
        with patch("yfinance.download", return_value=self._df_with_close(float("nan"))):
            result = engine.get_price_at("AAPL", datetime(2026, 4, 1))
        assert result is None

    def test_returns_none_for_inf(self):
        engine = _make_engine()
        with patch("yfinance.download", return_value=self._df_with_close(float("inf"))):
            result = engine.get_price_at("AAPL", datetime(2026, 4, 1))
        assert result is None

    def test_returns_none_for_neg_inf(self):
        engine = _make_engine()
        with patch("yfinance.download", return_value=self._df_with_close(float("-inf"))):
            result = engine.get_price_at("AAPL", datetime(2026, 4, 1))
        assert result is None

    def test_returns_valid_price(self):
        engine = _make_engine()
        with patch("yfinance.download", return_value=self._df_with_close(185.42)):
            result = engine.get_price_at("AAPL", datetime(2026, 4, 1))
        assert result == pytest.approx(185.42)

    def test_returns_none_for_empty_df(self):
        engine = _make_engine()
        with patch("yfinance.download", return_value=pd.DataFrame()):
            result = engine.get_price_at("AAPL", datetime(2026, 4, 1))
        assert result is None


# ---------------------------------------------------------------------------
# evaluate_pending — NaN price does not crash, does not reach Supabase
# ---------------------------------------------------------------------------

class TestEvaluatePendingNaN:

    def _pending_eval(self, ticker="MA", signal_type="HOLD"):
        return {
            "id": "test-id-001",
            "ticker": ticker,
            "signal_type": signal_type,
            "confidence": 0.75,
            "entry_price": 300.0,
            "entry_date": "2026-03-01T00:00:00",
            "price_6h": None,
            "price_24h": None,
            "price_72h": None,
            "price_168h": None,
            "score_6h": None,
            "score_24h": None,
            "score_72h": None,
            "score_168h": None,
            "barrier_label": None,
            "signal_id": "sig-001",
        }

    def test_nan_price_does_not_raise(self):
        """NaN from get_price_at must not propagate to Supabase."""
        engine = _make_engine()

        pending_mock = MagicMock()
        pending_mock.data = [self._pending_eval()]
        engine.supabase.table.return_value.select.return_value \
            .eq.return_value.execute.return_value = pending_mock

        # get_price_at always returns NaN
        engine.get_price_at = MagicMock(return_value=float("nan"))

        # Should not raise
        result = engine.evaluate_pending()
        assert isinstance(result, int)

        # Supabase .update() must NOT have been called with NaN values
        update_calls = engine.supabase.table.return_value.update.call_args_list
        for call in update_calls:
            payload = call.args[0] if call.args else call.kwargs.get("data", {})
            for k, v in payload.items():
                if isinstance(v, float):
                    assert math.isfinite(v), f"Non-finite value in payload: {k}={v}"

    def test_valid_price_updates_supabase(self):
        """A valid price must still produce an update."""
        engine = _make_engine()

        pending_mock = MagicMock()
        ev = self._pending_eval(signal_type="BUY")
        # Make the signal old enough for all horizons
        ev["entry_date"] = "2020-01-01T00:00:00"
        pending_mock.data = [ev]

        engine.supabase.table.return_value.select.return_value \
            .eq.return_value.execute.return_value = pending_mock
        # Supabase update chain mock
        engine.supabase.table.return_value.update.return_value \
            .eq.return_value.execute.return_value = MagicMock()
        # Supabase signals fetch for triple barrier
        engine.supabase.table.return_value.select.return_value \
            .eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])

        engine.get_price_at = MagicMock(return_value=310.0)

        result = engine.evaluate_pending()
        assert result >= 1


# ---------------------------------------------------------------------------
# Payload sanitization — inline guard strips non-finite floats
# ---------------------------------------------------------------------------

class TestPayloadSanitization:

    def test_sanitize_strips_nan(self):
        """Direct check that the sanitization logic works as expected."""
        updates = {
            "price_168h": float("nan"),
            "return_168h": float("nan"),
            "score_168h": 0.0,
            "fully_evaluated": True,
        }
        safe = {
            k: v for k, v in updates.items()
            if not (isinstance(v, float) and not math.isfinite(v))
        }
        assert "price_168h" not in safe
        assert "return_168h" not in safe
        assert safe["score_168h"] == 0.0
        assert safe["fully_evaluated"] is True

    def test_sanitize_strips_inf(self):
        updates = {"x": float("inf"), "y": 42.0}
        safe = {
            k: v for k, v in updates.items()
            if not (isinstance(v, float) and not math.isfinite(v))
        }
        assert "x" not in safe
        assert safe["y"] == 42.0
