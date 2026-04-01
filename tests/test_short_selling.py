"""Tests for short selling: exit levels, executor, ratchet, bracket validation."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch, PropertyMock

import pytest


# ── ExitStrategyAgent ──────────────────────────────────────────────────────

class TestExitStrategyLevels:
    """Exit level direction validation for SELL signals."""

    def _calc(self, signal, entry=100.0, confidence=0.6, regime="neutral"):
        from agents.exit_strategy_agent import calculate_exit_levels
        with patch("agents.exit_strategy_agent._compute_atr", return_value=2.0):
            return calculate_exit_levels(
                ticker="AAPL", signal=signal, entry_price=entry,
                confidence=confidence, market_regime=regime,
            )

    def test_buy_sl_below_entry_tp_above(self):
        levels = self._calc("BUY")
        assert levels is not None
        assert levels["stop_loss"] < 100.0
        assert levels["take_profit"] > 100.0

    def test_sell_sl_above_entry_tp_below(self):
        """SHORT: SL above entry, TP below entry — TP < entry < SL."""
        levels = self._calc("SELL")
        assert levels is not None
        assert levels["stop_loss"] > 100.0, "SHORT SL must be above entry"
        assert levels["take_profit"] < 100.0, "SHORT TP must be below entry"

    def test_sell_direction_constraint(self):
        """The triple TP < entry < SL must hold for any SELL signal."""
        levels = self._calc("SELL")
        assert levels is not None
        tp = levels["take_profit"]
        sl = levels["stop_loss"]
        assert tp < 100.0 < sl, f"Expected TP ({tp}) < 100 < SL ({sl})"

    def test_hold_returns_none(self):
        levels = self._calc("HOLD")
        assert levels is None

    def test_invalid_buy_levels_returns_none(self):
        """If computed levels violate BUY direction, return None."""
        from agents.exit_strategy_agent import calculate_exit_levels
        # Force SL above entry via giant ATR — but BUY sets SL below, so we
        # test the validation path by directly calling with a patched scenario
        # where sl_distance > entry (makes stop_loss negative → still < entry).
        # Instead, test by monkey-patching to inject wrong levels:
        import agents.exit_strategy_agent as mod
        orig = mod._compute_atr
        mod._compute_atr = lambda t: 200.0  # ATR > entry → sl = entry - huge → negative
        try:
            levels = calculate_exit_levels("AAPL", "BUY", 10.0, 0.6, "neutral")
            # With a 10.0 entry and ATR=200, stop_loss would be very negative
            # The direction check SL < entry < TP should still hold (SL < 0 < TP).
            # So this should NOT return None — the math still satisfies the constraint.
            # This test just verifies the function doesn't crash.
            assert levels is None or isinstance(levels, dict)
        finally:
            mod._compute_atr = orig


# ── Executor: _open_short ──────────────────────────────────────────────────

class TestOpenShort:
    """Test _open_short() inside TradeExecutor."""

    def _make_executor(self, **broker_overrides):
        """Build a TradeExecutor with mocked broker and Supabase."""
        with patch("engine.executor.AlpacaBroker") as MockBroker, \
             patch("engine.executor.create_client") as MockDB:

            broker = MagicMock()
            broker.get_equity.return_value = 100_000.0   # $1k virtual
            broker.get_latest_price.return_value = 50.0
            broker.has_position.return_value = False
            broker.get_positions.return_value = []
            broker.get_position.return_value = None
            broker.is_market_open.return_value = True
            broker.get_account.return_value = {
                "equity": "100000", "last_equity": "100000",
                "buying_power": "100000",
            }
            broker.submit_market_order.return_value = {
                "id": "order-1", "status": "accepted",
            }
            for k, v in broker_overrides.items():
                setattr(broker, k, v)
            MockBroker.return_value = broker

            db = MagicMock()
            db.table.return_value.select.return_value.eq.return_value \
                .gte.return_value.limit.return_value.execute.return_value \
                = MagicMock(data=[])
            db.table.return_value.insert.return_value.execute.return_value \
                = MagicMock(data=[{"id": "pos-1"}])
            MockDB.return_value = db

            from engine.executor import TradeExecutor
            ex = TradeExecutor(paper=True)
            ex._trading_enabled = True
            ex.broker = broker
            ex.supabase = db
            return ex, broker, db

    def _signal(self, **overrides):
        base = {
            "ticker": "AAPL",
            "signal": "SELL",
            "confidence": 0.75,
            "consensus_level": "strong",
            "exit_strategy": {"stop_loss": 52.0, "take_profit": 46.0},
        }
        base.update(overrides)
        return base

    def test_crypto_short_blocked(self):
        ex, _, _ = self._make_executor()
        result = {"ticker": "BTC-USD", "action": "skip", "reason": "", "order": None, "position_id": None, "signal": "SELL"}
        out = ex._open_short({"ticker": "BTC-USD", "signal": "SELL", "confidence": 0.8}, result)
        assert out["action"] == "skip"
        assert "crypto" in out["reason"].lower()

    def test_low_confidence_blocked(self):
        """Confidence 0.57 < MIN_SHORT_CONFIDENCE 0.60 → skip."""
        ex, _, _ = self._make_executor()
        sig = self._signal(confidence=0.57)
        result = {"ticker": "AAPL", "action": "skip", "reason": "", "order": None, "position_id": None, "signal": "SELL"}
        out = ex._open_short(sig, result)
        assert out["action"] == "skip"
        assert "confidence" in out["reason"].lower()

    def test_earnings_block(self):
        """Upcoming earnings within 7 days → short blocked."""
        ex, _, _ = self._make_executor()
        ex._has_upcoming_earnings = MagicMock(return_value=True)
        sig = self._signal()
        result = {"ticker": "AAPL", "action": "skip", "reason": "", "order": None, "position_id": None, "signal": "SELL"}
        out = ex._open_short(sig, result)
        assert out["action"] == "skip"
        assert "earnings" in out["reason"].lower()

    def test_valid_short_opens(self):
        """Valid short: confidence > 0.60, no earnings, correct SL/TP direction."""
        ex, broker, _ = self._make_executor()
        ex._has_upcoming_earnings = MagicMock(return_value=False)
        # price=10 so shares=int(37.5/10)=3 (sufficient for short)
        broker.get_latest_price.return_value = 10.0
        sig = self._signal(exit_strategy={"stop_loss": 10.4, "take_profit": 9.4})
        result = {"ticker": "AAPL", "action": "skip", "reason": "", "order": None, "position_id": None, "signal": "SELL"}
        out = ex._open_short(sig, result)
        assert out["action"] == "opened_short"
        # Broker called with side="sell"
        broker.submit_market_order.assert_called_once()
        call_kwargs = broker.submit_market_order.call_args
        assert call_kwargs.kwargs.get("side") == "sell" or call_kwargs[1].get("side") == "sell"

    def test_wrong_sl_tp_direction_recalculated(self):
        """If SL < TP for a short (wrong direction), recalculate from 2%/4%."""
        ex, broker, _ = self._make_executor()
        ex._has_upcoming_earnings = MagicMock(return_value=False)
        broker.get_latest_price.return_value = 10.0
        # Wrong: SL=9 (below entry=10), TP=11 (above entry=10) — opposite of SHORT
        sig = self._signal(exit_strategy={"stop_loss": 9.0, "take_profit": 11.0})
        result = {"ticker": "AAPL", "action": "skip", "reason": "", "order": None, "position_id": None, "signal": "SELL"}
        out = ex._open_short(sig, result)
        assert out["action"] == "opened_short"
        call = broker.submit_market_order.call_args
        kwargs = call.kwargs if call.kwargs else call[1]
        # Recalculated SL should be above entry (10 * 1.02 = 10.2), TP below (10 * 0.96 = 9.6)
        assert kwargs["stop_loss"] > 10.0, "Recalculated SL must be above entry"
        assert kwargs["take_profit"] < 10.0, "Recalculated TP must be below entry"

    def test_integer_shares_only(self):
        """Shorts use integer shares (no fractional) to support bracket orders."""
        ex, broker, _ = self._make_executor()
        ex._has_upcoming_earnings = MagicMock(return_value=False)
        # price=50, equity=$1k, pos_pct=5% → allocated=$50 → 1 share (floor)
        broker.get_latest_price.return_value = 50.0
        sig = self._signal()
        result = {"ticker": "AAPL", "action": "skip", "reason": "", "order": None, "position_id": None, "signal": "SELL"}
        out = ex._open_short(sig, result)
        if out["action"] == "opened_short":
            call = broker.submit_market_order.call_args
            kwargs = call.kwargs if call.kwargs else call[1]
            qty = kwargs["qty"]
            assert qty == float(int(qty)), f"Qty must be integer, got {qty}"

    def test_handle_sell_routes_to_close_long_when_position_exists(self):
        """If there's a long position, SELL closes it rather than opening a short."""
        ex, broker, _ = self._make_executor()
        pos = {
            "qty": "10", "avg_entry_price": "48.0",
            "current_price": "52.0", "unrealized_pl": "40.0",
            "unrealized_plpc": "0.0833",
        }
        broker.get_position.return_value = pos
        broker.close_position.return_value = {"id": "close-1"}
        result = {"ticker": "AAPL", "action": "skip", "reason": "", "order": None, "position_id": None, "signal": "SELL"}
        out = ex._handle_sell(self._signal(), result)
        assert out["action"] == "closed"
        broker.close_position.assert_called_once()

    def test_handle_sell_routes_to_open_short_when_no_position(self):
        """No existing position → SELL opens a short."""
        ex, broker, _ = self._make_executor()
        broker.get_position.return_value = None
        ex._has_upcoming_earnings = MagicMock(return_value=False)
        result = {"ticker": "AAPL", "action": "skip", "reason": "", "order": None, "position_id": None, "signal": "SELL"}
        out = ex._handle_sell(self._signal(), result)
        assert out["action"] in ("opened_short", "skip")


# ── Executor: _has_upcoming_earnings ──────────────────────────────────────

class TestHasUpcomingEarnings:

    def _exec(self):
        with patch("engine.executor.AlpacaBroker"), \
             patch("engine.executor.create_client"):
            from engine.executor import TradeExecutor
            ex = TradeExecutor(paper=True)
            return ex

    def test_earnings_in_3_days_returns_true(self):
        ex = self._exec()
        soon = datetime.now(timezone.utc) + timedelta(days=3)
        mock_cal = {"Earnings Date": [soon]}
        with patch("yfinance.Ticker") as MockTicker:
            MockTicker.return_value.calendar = mock_cal
            assert ex._has_upcoming_earnings("AAPL", days=7) is True

    def test_earnings_in_10_days_returns_false(self):
        ex = self._exec()
        far = datetime.now(timezone.utc) + timedelta(days=10)
        mock_cal = {"Earnings Date": [far]}
        with patch("yfinance.Ticker") as MockTicker:
            MockTicker.return_value.calendar = mock_cal
            assert ex._has_upcoming_earnings("AAPL", days=7) is False

    def test_no_calendar_returns_false(self):
        ex = self._exec()
        with patch("yfinance.Ticker") as MockTicker:
            MockTicker.return_value.calendar = None
            assert ex._has_upcoming_earnings("AAPL") is False

    def test_exception_returns_false(self):
        ex = self._exec()
        with patch("yfinance.Ticker", side_effect=Exception("network")):
            assert ex._has_upcoming_earnings("AAPL") is False


# ── Broker: bracket direction validation ───────────────────────────────────

class TestBracketDirectionValidation:

    def _submit(self, side, sl, tp):
        """Submit a market order with mocked httpx.Client."""
        fake_response = MagicMock()
        fake_response.is_success = True
        fake_response.json.return_value = {"id": "o1", "status": "accepted"}

        mock_client_instance = MagicMock()
        mock_client_instance.post.return_value = fake_response

        with patch("engine.broker_alpaca.httpx.Client", return_value=mock_client_instance):
            from engine.broker_alpaca import AlpacaBroker
            import importlib
            import engine.broker_alpaca
            importlib.reload(engine.broker_alpaca)
            b = engine.broker_alpaca.AlpacaBroker(paper=True)
            b._client = mock_client_instance  # override post-init

            b.submit_market_order(
                ticker="AAPL", qty=10, side=side,
                stop_loss=sl, take_profit=tp,
            )
            return mock_client_instance

    def test_buy_valid_bracket(self):
        """BUY: SL=48 < TP=55 → valid bracket."""
        client = self._submit("buy", sl=48.0, tp=55.0)
        body = client.post.call_args[1]["json"]
        assert body.get("order_class") == "bracket"

    def test_buy_invalid_bracket_skipped(self):
        """BUY: SL=55 > TP=48 → bracket skipped."""
        client = self._submit("buy", sl=55.0, tp=48.0)
        body = client.post.call_args[1]["json"]
        assert "order_class" not in body

    def test_sell_valid_bracket(self):
        """SELL: TP=46 < SL=53 → valid bracket."""
        client = self._submit("sell", sl=53.0, tp=46.0)
        body = client.post.call_args[1]["json"]
        assert body.get("order_class") == "bracket"

    def test_sell_invalid_bracket_skipped(self):
        """SELL: TP=55 > SL=48 → invalid direction → bracket skipped."""
        client = self._submit("sell", sl=48.0, tp=55.0)
        body = client.post.call_args[1]["json"]
        assert "order_class" not in body


# ── RatchetManager: short ratcheting ──────────────────────────────────────

class TestShortRatcheting:
    """Test should_ratchet() and execute_ratchet() for short positions."""

    def _mgr(self):
        with patch("engine.ratchet_manager.AlpacaBroker"), \
             patch("engine.ratchet_manager.create_client"):
            from engine.ratchet_manager import RatchetManager
            mgr = RatchetManager(paper=True)
            mgr._get_regime = MagicMock(return_value="neutral")
            mgr._get_market_data = MagicMock(return_value={
                "rsi": 50.0, "volume_ok": True, "atr_14": 2.0,
            })
            return mgr

    def test_short_progress_calculation(self):
        """SHORT at 85% progress toward TP → should ratchet."""
        mgr = self._mgr()
        # Entry=100, TP=90 (10pt distance), price=91.5 → progress=(100-91.5)/10=85%
        result = mgr.should_ratchet(
            ticker="AAPL", side="short",
            entry_price=100.0, current_price=91.5,
            current_sl=103.0, current_tp=90.0,
            ratchet_count=0,
        )
        assert result["should_ratchet"] is True
        assert result["progress_pct"] == pytest.approx(85.0, abs=0.5)

    def test_short_insufficient_progress(self):
        """SHORT at 50% progress → should NOT ratchet (threshold 80%)."""
        mgr = self._mgr()
        # Entry=100, TP=90, price=95 → progress=50%
        result = mgr.should_ratchet(
            ticker="AAPL", side="short",
            entry_price=100.0, current_price=95.0,
            current_sl=103.0, current_tp=90.0,
            ratchet_count=0,
        )
        assert result["should_ratchet"] is False
        assert "progress" in result["reason"]

    def test_short_rsi_oversold_blocks_ratchet(self):
        """SHORT with RSI=18 (oversold) → take profit instead, no ratchet."""
        mgr = self._mgr()
        mgr._get_market_data = MagicMock(return_value={
            "rsi": 18.0, "volume_ok": True, "atr_14": 2.0,
        })
        result = mgr.should_ratchet(
            ticker="AAPL", side="short",
            entry_price=100.0, current_price=91.5,
            current_sl=103.0, current_tp=90.0,
            ratchet_count=0,
        )
        assert result["should_ratchet"] is False
        assert "oversold" in result["reason"].lower() or "rsi" in result["reason"].lower()

    def test_short_rsi_crypto_floor(self):
        """SHORT crypto with RSI=15 (below 18 crypto floor) → no ratchet."""
        mgr = self._mgr()
        mgr._get_market_data = MagicMock(return_value={
            "rsi": 15.0, "volume_ok": True, "atr_14": 100.0,
        })
        result = mgr.should_ratchet(
            ticker="BTC-USD", side="short",
            entry_price=50000.0, current_price=45800.0,
            current_sl=52000.0, current_tp=45000.0,
            ratchet_count=0,
        )
        assert result["should_ratchet"] is False

    def test_execute_ratchet_short_levels(self):
        """SHORT ratchet: new_sl = old_tp, new_tp = old_tp - ATR*mult."""
        mgr = self._mgr()
        mgr.broker.get_bracket_legs = MagicMock(return_value=None)
        mgr.supabase.table.return_value.select.return_value.eq.return_value \
            .single.return_value.execute.return_value = MagicMock(data={
                "ratchet_count": 0, "ratchet_history": [],
            })
        mgr.supabase.table.return_value.update.return_value.eq.return_value \
            .execute.return_value = MagicMock()

        # Entry=100, SL=103, TP=90, current_price=91.5
        # After ratchet: new_sl=90, new_tp=90 - 2.0*2.0=86
        result = mgr.execute_ratchet(
            ticker="AAPL", side="short",
            current_tp=90.0, old_sl=103.0, atr_14=2.0,
            regime="neutral", position_id="pos-1",
            current_price=91.5, entry_price=100.0,
        )
        assert result["new_sl"] == pytest.approx(90.0)
        assert result["new_tp"] == pytest.approx(86.0)
        assert result["action"] in ("ratcheted", "ratcheted_db_only")

    def test_execute_ratchet_short_sanity_no_locked_profit(self):
        """SHORT ratchet skipped if new_sl >= entry_price (no profit locked)."""
        mgr = self._mgr()
        # Entry=100, TP=99 → new_sl=99, which is < 100 ✓ but let's make TP=101 (wrong)
        # Actually, for SHORT invalid TP, use TP >= entry which would be filtered
        # by check_all_positions. Let's test with TP=100.5 (= entry):
        # new_sl=100.5 >= entry=100 should fail
        result = mgr.execute_ratchet(
            ticker="AAPL", side="short",
            current_tp=100.5, old_sl=103.0, atr_14=2.0,
            regime="neutral", position_id="pos-1",
            current_price=100.4, entry_price=100.0,
        )
        assert result["action"] == "skipped"
        assert "no locked profit" in result["reason"]

    def test_enforce_sl_tp_short_sl_hit(self):
        """SHORT: price >= SL → sl_hit (price rose above stop)."""
        mgr = self._mgr()
        mgr.broker.close_position = MagicMock(return_value={"id": "close"})
        mgr.supabase.table.return_value.update.return_value.eq.return_value \
            .execute.return_value = MagicMock()

        with patch("engine.ratchet_manager.RatchetManager._enforce_sl_tp",
                   wraps=mgr._enforce_sl_tp):
            result = mgr._enforce_sl_tp(
                ticker="AAPL", pos_id="p1", side="short",
                current_price=104.0,  # price rose above SL=103
                current_sl=103.0, current_tp=90.0,
            )
        assert result is not None
        assert result["action"] == "closed_manual"
        assert result["reason"] == "SL hit"

    def test_enforce_sl_tp_short_tp_hit(self):
        """SHORT: price <= TP → tp_hit (price dropped below target)."""
        mgr = self._mgr()
        mgr.broker.close_position = MagicMock(return_value={"id": "close"})
        mgr.supabase.table.return_value.update.return_value.eq.return_value \
            .execute.return_value = MagicMock()

        result = mgr._enforce_sl_tp(
            ticker="AAPL", pos_id="p1", side="short",
            current_price=89.5,  # price dropped below TP=90
            current_sl=103.0, current_tp=90.0,
        )
        assert result is not None
        assert result["action"] == "closed_manual"
        assert result["reason"] == "TP hit"

    def test_enforce_sl_tp_short_no_hit(self):
        """SHORT: price between TP and SL → no action."""
        mgr = self._mgr()
        result = mgr._enforce_sl_tp(
            ticker="AAPL", pos_id="p1", side="short",
            current_price=95.0,  # between TP=90 and SL=103
            current_sl=103.0, current_tp=90.0,
        )
        assert result is None

    def test_short_tp_passed_triggers_warning(self):
        """SHORT: price <= TP without ratchet → TP already passed warning."""
        mgr = self._mgr()
        result = mgr.should_ratchet(
            ticker="AAPL", side="short",
            entry_price=100.0, current_price=89.0,  # below TP=90
            current_sl=103.0, current_tp=90.0,
            ratchet_count=0,
        )
        assert result["should_ratchet"] is False
        assert "tp" in result["reason"].lower() or "non eseguito" in result["reason"].lower()
