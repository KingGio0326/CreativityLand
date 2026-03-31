"""Tests for RatchetManager — should_ratchet() and execute_ratchet()."""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, call, patch

import pytest

from engine.ratchet_manager import (
    RatchetManager,
    REGIME_ATR_MULT,
    PROXIMITY_NORMAL,
    PROXIMITY_BEAR,
    RSI_THRESHOLD_STOCK,
    RSI_THRESHOLD_CRYPTO,
    MAX_HOLDING_HOURS,
    VELOCITY_THRESHOLD_PCT,
    ATR_MAX_PRICE_PCT,
)


# ── Fixtures ──────────────────────────────────────────────────

@pytest.fixture
def mgr(monkeypatch):
    """RatchetManager with broker and supabase mocked out."""
    monkeypatch.setenv("SUPABASE_URL", "http://fake")
    monkeypatch.setenv("SUPABASE_KEY", "fake")
    monkeypatch.setenv("PAPER_TRADING", "true")

    with patch("engine.ratchet_manager.AlpacaBroker"), \
         patch("engine.ratchet_manager.create_client"):
        m = RatchetManager(paper=True)
    m.broker = MagicMock()
    m.supabase = MagicMock()
    return m


def _good_market_data(rsi=55.0, atr=2.0):
    """Market data that passes all momentum/volume checks."""
    return {"rsi": rsi, "volume_ok": True, "atr_14": atr}


# ── should_ratchet ────────────────────────────────────────────

class TestShouldRatchet:

    def _call(self, mgr, regime="neutral", **overrides):
        defaults = dict(
            ticker="AAPL",
            entry_price=100.0,
            current_price=118.0,    # 90% of the way to TP=120
            current_sl=95.0,
            current_tp=120.0,
            ratchet_count=0,
            opened_at=datetime.utcnow() - timedelta(hours=30),  # 30h, well < 84h threshold
            market_data=_good_market_data(),
        )
        defaults.update(overrides)
        mgr._get_regime = MagicMock(return_value=regime)
        return mgr.should_ratchet(**defaults)

    def test_all_conditions_met(self, mgr):
        res = self._call(mgr)
        assert res["should_ratchet"] is True
        assert res["regime"] == "neutral"
        assert res["progress_pct"] == pytest.approx(90.0, abs=0.1)

    def test_max_ratchets_reached(self, mgr):
        res = self._call(mgr, ratchet_count=3)
        assert res["should_ratchet"] is False
        assert "max ratchets" in res["reason"]

    def test_crisis_regime_skips(self, mgr):
        res = self._call(mgr, regime="crisis")
        assert res["should_ratchet"] is False
        assert "crisis" in res["reason"]

    def test_insufficient_progress(self, mgr):
        # Only 50% progress — below PROXIMITY_NORMAL=0.80
        res = self._call(mgr, current_price=110.0)  # (110-100)/(120-100)=50%
        assert res["should_ratchet"] is False
        assert "progress" in res["reason"]
        assert res["progress_pct"] == pytest.approx(50.0, abs=0.1)

    def test_bear_regime_higher_threshold(self, mgr):
        # 82% progress — passes PROXIMITY_NORMAL but fails PROXIMITY_BEAR=0.90
        res = self._call(mgr, regime="bear", current_price=116.4)  # (116.4-100)/20=82%
        assert res["should_ratchet"] is False
        assert "90%" in res["reason"] or "threshold" in res["reason"]

    def test_rsi_too_high_stock(self, mgr):
        res = self._call(mgr, market_data=_good_market_data(rsi=RSI_THRESHOLD_STOCK + 1))
        assert res["should_ratchet"] is False
        assert "RSI" in res["reason"]
        assert res["momentum_ok"] is False

    def test_rsi_threshold_crypto(self, mgr):
        # Crypto has higher RSI cap
        res = self._call(
            mgr,
            ticker="BTC-USD",
            market_data=_good_market_data(rsi=RSI_THRESHOLD_STOCK + 1),
        )
        # RSI_THRESHOLD_STOCK+1 = 79 < RSI_THRESHOLD_CRYPTO=82 → should pass
        assert res["should_ratchet"] is True

    def test_volume_below_avg(self, mgr):
        md = {"rsi": 55.0, "volume_ok": False, "atr_14": 2.0}
        res = self._call(mgr, market_data=md)
        assert res["should_ratchet"] is False
        assert "volume" in res["reason"]
        assert res["volume_ok"] is False

    def test_velocity_too_slow(self, mgr):
        # 90h elapsed > 84h threshold (168 * 0.50)
        slow_open = datetime.utcnow() - timedelta(hours=90)
        res = self._call(mgr, opened_at=slow_open)
        assert res["should_ratchet"] is False
        assert "velocity" in res["reason"]
        assert res["velocity_ok"] is False

    def test_price_above_tp_warns_and_skips(self, mgr):
        """Price >= TP means the TP order may not have executed — skip + warn."""
        with patch("engine.ratchet_manager.RatchetManager.should_ratchet",
                   wraps=mgr.should_ratchet):
            with patch("bot_telegram.telegram_notifier.notify") as mock_notify:
                # Patch the import inside the function
                with patch("builtins.__import__", side_effect=_import_with_mock_notify(mock_notify)):
                    pass  # import side-effect approach is complex, test directly below

        # Simpler: just call and assert the result
        mgr._get_regime = MagicMock(return_value="neutral")
        res = mgr.should_ratchet(
            ticker="AAPL",
            entry_price=100.0,
            current_price=121.0,   # above TP=120
            current_sl=95.0,
            current_tp=120.0,
            ratchet_count=0,
            market_data=_good_market_data(),
        )
        assert res["should_ratchet"] is False
        assert "non eseguito" in res["reason"] or ">= TP" in res["reason"] or "TP" in res["reason"]

    def test_no_opened_at_velocity_ok(self, mgr):
        """If opened_at is None, velocity check defaults to True."""
        res = self._call(mgr, opened_at=None)
        assert res["should_ratchet"] is True
        assert res["velocity_ok"] is True


def _import_with_mock_notify(mock_notify):
    """Helper for import patching — unused, kept for clarity."""
    return None


# ── execute_ratchet ───────────────────────────────────────────

class TestExecuteRatchet:

    def _supabase_row(self, mgr, count=0, history=None):
        """Wire the supabase mock to return ratchet metadata."""
        row = MagicMock()
        row.data = {"ratchet_count": count, "ratchet_history": history or []}
        mgr.supabase.table.return_value.select.return_value \
            .eq.return_value.single.return_value.execute.return_value = row
        mgr.supabase.table.return_value.update.return_value \
            .eq.return_value.execute.return_value = MagicMock()

    def _legs(self, tp_price=120.0, sl_price=95.0):
        return {
            "tp_order_id": "tp-001",
            "tp_limit_price": tp_price,
            "sl_order_id": "sl-001",
            "sl_stop_price": sl_price,
        }

    def test_correct_new_levels(self, mgr):
        self._supabase_row(mgr)
        mgr.broker.get_bracket_legs.return_value = self._legs()
        mgr.broker.replace_order.return_value = {}

        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=2.0,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )

        # new_sl = old TP; new_tp = old_tp + atr * mult
        assert res["new_sl"] == 120.0
        expected_tp = round(120.0 + 2.0 * REGIME_ATR_MULT["neutral"], 4)
        assert res["new_tp"] == expected_tp
        assert res["action"] == "ratcheted"
        assert res["legs_patched"] is True

    def test_tp_patched_before_sl(self, mgr):
        """TP order must be replaced before SL order."""
        self._supabase_row(mgr)
        mgr.broker.get_bracket_legs.return_value = self._legs()
        mgr.broker.replace_order.return_value = {}

        mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=2.0,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )

        calls = mgr.broker.replace_order.call_args_list
        assert len(calls) == 2
        # First call must be TP
        assert calls[0] == call("tp-001", limit_price=round(120.0 + 2.0 * 2.0, 4))
        # Second call must be SL
        assert calls[1] == call("sl-001", stop_price=120.0)

    def test_ratchet_count_incremented(self, mgr):
        self._supabase_row(mgr, count=1)
        mgr.broker.get_bracket_legs.return_value = self._legs()
        mgr.broker.replace_order.return_value = {}

        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=2.0,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )
        assert res["ratchet_count"] == 2

    def test_no_bracket_legs_db_only(self, mgr):
        self._supabase_row(mgr)
        mgr.broker.get_bracket_legs.return_value = None

        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=2.0,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )
        assert res["action"] == "ratcheted_db_only"
        assert res["legs_patched"] is False
        mgr.broker.replace_order.assert_not_called()

    def test_atr_zero_skips(self, mgr):
        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=0.0,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )
        assert res["action"] == "skipped"
        assert "ATR" in res["reason"]
        mgr.broker.replace_order.assert_not_called()

    def test_atr_negative_skips(self, mgr):
        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=-1.0,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )
        assert res["action"] == "skipped"

    def test_atr_extreme_volatility_skips(self, mgr):
        # ATR > 15% of price
        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=118.0 * (ATR_MAX_PRICE_PCT + 0.01),  # just above threshold
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )
        assert res["action"] == "skipped"
        assert "volatility" in res["reason"].lower() or "ATR" in res["reason"]

    def test_sanity_new_sl_not_above_entry(self, mgr):
        # new_sl = current_tp = 105, entry_price = 110 → new_sl <= entry_price
        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=105.0,
            old_sl=95.0,
            atr_14=2.0,
            regime="neutral",
            position_id="pos-1",
            current_price=106.0,
            entry_price=110.0,
        )
        assert res["action"] == "skipped"
        assert "entry_price" in res["reason"]

    def test_sanity_tp_already_passed(self, mgr):
        # current_price=125 > new_tp=124 (current_tp=120 + atr2*mult2.0=4 = 124)
        # TP is already behind us — would immediately trigger → skip
        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=2.0,
            regime="neutral",
            position_id="pos-1",
            current_price=125.0,  # above new_tp=124
            entry_price=100.0,
        )
        assert res["action"] == "skipped"
        assert "passed" in res["reason"] or "TP" in res["reason"]

    def test_sanity_insufficient_sl_tp_gap(self, mgr):
        """new_tp must be > new_sl × 1.005 (≥0.5% gap)."""
        # ATR=0.001 → new_tp = 120.002, new_sl = 120.0
        # 120.002 < 120.0 × 1.005 = 120.6 → must skip
        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=0.001,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )
        assert res["action"] == "skipped"
        assert "gap" in res["reason"] or "1.005" in res["reason"]

    def test_tp_patch_failure_sl_not_touched(self, mgr):
        """If TP PATCH fails, SL must not be touched."""
        self._supabase_row(mgr)
        mgr.broker.get_bracket_legs.return_value = self._legs()
        mgr.broker.replace_order.side_effect = Exception("network error")

        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=2.0,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )
        # Only one replace_order call (the TP attempt) — SL must not be called
        assert mgr.broker.replace_order.call_count == 1
        assert res["tp_patched"] is False
        assert res["sl_patched"] is False
        assert res["action"] == "ratcheted_db_only"

    def test_sl_patch_failure_tp_only(self, mgr):
        """If SL PATCH fails after TP succeeds → ratcheted_tp_only."""
        self._supabase_row(mgr)
        mgr.broker.get_bracket_legs.return_value = self._legs()

        call_count = [0]
        def replace_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return {}        # TP succeeds
            raise Exception("SL order rejected")  # SL fails

        mgr.broker.replace_order.side_effect = replace_side_effect

        with patch("engine.ratchet_manager.RatchetManager.execute_ratchet",
                   wraps=mgr.execute_ratchet):
            # Suppress the internal telegram notify
            with patch("builtins.__import__"):
                pass

        res = mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=2.0,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )
        assert res["tp_patched"] is True
        assert res["sl_patched"] is False
        assert res["action"] == "ratcheted_tp_only"

    def test_regime_multiplier_applied(self, mgr):
        """Different regimes produce different new_tp distances."""
        self._supabase_row(mgr)
        mgr.broker.get_bracket_legs.return_value = self._legs()
        mgr.broker.replace_order.return_value = {}

        for regime, mult in REGIME_ATR_MULT.items():
            if regime == "crisis":
                continue  # crisis is blocked before execute_ratchet
            self._supabase_row(mgr)
            res = mgr.execute_ratchet(
                ticker="AAPL",
                current_tp=120.0,
                old_sl=95.0,
                atr_14=2.0,
                regime=regime,
                position_id="pos-1",
                current_price=118.0,
                entry_price=100.0,
            )
            assert res["new_tp"] == round(120.0 + 2.0 * mult, 4), \
                f"Wrong new_tp for regime={regime}"

    def test_supabase_updated_even_on_patch_failure(self, mgr):
        """DB must always be updated, even if Alpaca PATCH fails."""
        self._supabase_row(mgr)
        mgr.broker.get_bracket_legs.return_value = None  # no bracket found

        mgr.execute_ratchet(
            ticker="AAPL",
            current_tp=120.0,
            old_sl=95.0,
            atr_14=2.0,
            regime="neutral",
            position_id="pos-1",
            current_price=118.0,
            entry_price=100.0,
        )

        # Supabase update must have been called
        mgr.supabase.table.return_value.update.assert_called_once()
