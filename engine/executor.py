"""TradeExecutor: executes trading signals via Alpaca broker.

Bridges the gap between the multi-agent pipeline (which produces signals)
and the broker (which executes orders). Includes safety checks, position
tracking, and Supabase persistence.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client

from engine.broker_alpaca import AlpacaBroker
from bot_telegram.telegram_notifier import (
    notify_order_opened,
    notify_order_closed,
    notify_circuit_breaker,
    notify_emergency_close,
    notify_drawdown,
)

load_dotenv()

logger = logging.getLogger("engine.executor")


# ── Configuration (overridable via env vars) ─────────────
DEFAULT_CAPITAL = 1000.0
MAX_OPEN_POSITIONS = 10
MAX_DAILY_LOSS_PCT = 5.0        # % of portfolio — circuit breaker
MIN_CONFIDENCE = 0.55           # Skip signals below this
MIN_CONSENSUS = "moderate"      # Skip "weak" consensus
STALE_PRICE_PCT = 5.0           # Skip if price moved > 5% since signal
ORDER_COOLDOWN_HOURS = 6        # Max 1 order per ticker every N hours
MAX_DRAWDOWN_PCT = 15.0         # Close all if equity drops > 15% from peak


class TradeExecutor:
    """Executes BUY/SELL signals with safety checks and position tracking."""

    def __init__(self, paper: bool | None = None):
        if paper is None:
            paper = os.getenv("PAPER_TRADING", "true").lower() == "true"
        self.broker = AlpacaBroker(paper=paper)
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
        self.paper = paper
        self._trading_enabled = os.getenv("TRADING_ENABLED", "false").lower() == "true"

    @property
    def trading_enabled(self) -> bool:
        return self._trading_enabled

    def enable_trading(self):
        self._trading_enabled = True

    def disable_trading(self):
        self._trading_enabled = False

    # ── Main entry point ─────────────────────────────────

    def execute_signal(self, signal: dict) -> dict:
        """Execute a trading signal. Returns execution result dict.

        Args:
            signal: Dict with keys from orchestrator.decide() + exit_strategy.
                Required: ticker, signal, confidence
                Optional: consensus_level, exit_strategy, position_size_pct,
                          kelly_fraction, signal_id

        Returns:
            Dict with: action, ticker, reason, order (if executed),
                       position_id (if tracked in DB)
        """
        ticker = signal.get("ticker", "")
        sig_type = signal.get("signal", "HOLD")
        confidence = signal.get("confidence", 0)

        result = {
            "ticker": ticker,
            "action": "skip",
            "signal": sig_type,
            "reason": "",
            "order": None,
            "position_id": None,
        }

        if not self._trading_enabled:
            result["reason"] = "trading disabled"
            logger.info("Trading disabled, skipping %s %s", ticker, sig_type)
            return result

        if sig_type == "HOLD":
            return self._handle_hold(signal, result)
        elif sig_type == "BUY":
            return self._handle_buy(signal, result)
        elif sig_type == "SELL":
            return self._handle_sell(signal, result)
        else:
            result["reason"] = f"unknown signal type: {sig_type}"
            return result

    # ── Signal handlers ──────────────────────────────────

    def _handle_buy(self, signal: dict, result: dict) -> dict:
        """Handle a BUY signal."""
        ticker = signal["ticker"]
        confidence = signal.get("confidence", 0)
        conf = confidence / 100 if confidence > 1 else confidence

        # ── Pre-flight checks ──
        checks = self._pre_flight_checks(signal)
        if checks:
            result["reason"] = checks
            logger.info("BUY %s skipped: %s", ticker, checks)
            return result

        # ── Calculate position size ──
        equity = self.broker.get_equity()
        if equity <= 0:
            result["reason"] = "no equity available"
            return result

        pos_pct = signal.get("position_size_pct")
        if pos_pct is None:
            pos_pct = conf * 5  # fallback: confidence * 5%
        allocated = equity * (pos_pct / 100)

        # Get current price
        price = self.broker.get_latest_price(ticker)
        if not price:
            # Fallback: use entry price from signal
            exit_data = signal.get("exit_strategy", {})
            price = exit_data.get("entry_price") or signal.get("entry_price")
        if not price or price <= 0:
            result["reason"] = "cannot determine current price"
            return result

        shares = allocated / price
        if shares < 0.001:
            result["reason"] = f"position too small: {shares:.6f} shares"
            return result

        # ── Get SL/TP from ExitStrategyAgent ──
        exit_data = signal.get("exit_strategy", {})
        sl = exit_data.get("stop_loss") or signal.get("stop_loss")
        tp = exit_data.get("take_profit") or signal.get("take_profit")

        # ── Execute order ──
        try:
            order = self.broker.submit_market_order(
                ticker=ticker,
                qty=shares,
                side="buy",
                stop_loss=sl,
                take_profit=tp,
            )
            result["action"] = "opened"
            result["order"] = order
            result["reason"] = (
                f"BUY {shares:.4f} shares @ ~${price:.2f} "
                f"(alloc=${allocated:.2f}, {pos_pct:.1f}%)"
            )
            logger.info("Executed BUY %s: %s", ticker, result["reason"])

            # ── Track in Supabase ──
            pos_id = self._save_position(
                ticker=ticker,
                side="long",
                entry_price=price,
                shares=shares,
                allocated=allocated,
                sl=sl,
                tp=tp,
                signal_id=signal.get("signal_id"),
            )
            result["position_id"] = pos_id

            # ── Telegram notification ──
            try:
                notify_order_opened(
                    ticker=ticker, side="buy", shares=shares,
                    price=price, allocated=allocated,
                    sl=sl, tp=tp, paper=self.paper,
                )
            except Exception:
                pass

        except Exception as e:
            result["reason"] = f"order failed: {e}"
            logger.error("BUY %s failed: %s", ticker, e)

        return result

    def _handle_sell(self, signal: dict, result: dict) -> dict:
        """Handle a SELL signal — close existing LONG position."""
        ticker = signal["ticker"]

        # Check if we have a position to close
        pos = self.broker.get_position(ticker)
        if not pos:
            result["reason"] = "no open position to close"
            logger.info("SELL %s skipped: no position", ticker)
            return result

        # Close via broker
        try:
            order = self.broker.close_position(ticker)
            entry_price = float(pos.get("avg_entry_price", 0))
            current_price = float(pos.get("current_price", 0))
            qty = float(pos.get("qty", 0))
            pnl = float(pos.get("unrealized_pl", 0))

            result["action"] = "closed"
            result["order"] = order
            result["reason"] = (
                f"SELL {qty:.4f} shares "
                f"(entry=${entry_price:.2f} → exit=${current_price:.2f}, "
                f"P&L=${pnl:.2f})"
            )
            logger.info("Executed SELL %s: %s", ticker, result["reason"])

            # ── Update DB: close position + create trade ──
            self._close_position_db(
                ticker=ticker,
                exit_price=current_price,
                pnl_usd=pnl,
                pnl_pct=float(pos.get("unrealized_plpc", 0)) * 100,
                close_reason="signal",
                signal_id_close=signal.get("signal_id"),
            )

            # ── Telegram notification ──
            try:
                notify_order_closed(
                    ticker=ticker, side="long",
                    entry_price=entry_price, exit_price=current_price,
                    shares=qty, pnl=pnl,
                    close_reason="signal", paper=self.paper,
                )
            except Exception:
                pass

        except Exception as e:
            result["reason"] = f"close failed: {e}"
            logger.error("SELL %s failed: %s", ticker, e)

        return result

    def _handle_hold(self, signal: dict, result: dict) -> dict:
        """Handle a HOLD signal — optionally tighten stop to break-even."""
        ticker = signal["ticker"]
        result["action"] = "hold"

        pos = self.broker.get_position(ticker)
        if not pos:
            result["reason"] = "no position, nothing to do"
            return result

        unrealized_pl = float(pos.get("unrealized_pl", 0))
        if unrealized_pl > 0:
            result["reason"] = f"position in profit (${unrealized_pl:.2f}), holding"
            logger.info("HOLD %s: in profit, keeping position", ticker)
        else:
            result["reason"] = f"position at loss (${unrealized_pl:.2f}), holding"

        return result

    # ── Pre-flight checks ────────────────────────────────

    def _pre_flight_checks(self, signal: dict) -> str | None:
        """Run safety checks before opening a position.

        Returns error string if check fails, None if all OK.
        """
        ticker = signal["ticker"]
        confidence = signal.get("confidence", 0)
        conf = confidence / 100 if confidence > 1 else confidence
        consensus = signal.get("consensus_level", "weak")

        # 1. Already have a position?
        if self.broker.has_position(ticker):
            return f"position already open for {ticker}"

        # 2. Confidence too low?
        if conf < MIN_CONFIDENCE:
            return f"confidence too low ({conf:.0%} < {MIN_CONFIDENCE:.0%})"

        # 3. Consensus too weak?
        consensus_order = {"strong": 3, "moderate": 2, "weak": 1}
        min_cons = consensus_order.get(MIN_CONSENSUS, 2)
        sig_cons = consensus_order.get(consensus, 1)
        if sig_cons < min_cons:
            return f"consensus too weak ({consensus})"

        # 4. Too many open positions?
        positions = self.broker.get_positions()
        if len(positions) >= MAX_OPEN_POSITIONS:
            return f"max positions reached ({len(positions)}/{MAX_OPEN_POSITIONS})"

        # 5. Daily loss circuit breaker?
        try:
            acct = self.broker.get_account()
            equity = float(acct.get("equity", 0))
            last_equity = float(acct.get("last_equity", equity))
            if last_equity > 0:
                daily_change = ((equity - last_equity) / last_equity) * 100
                if daily_change < -MAX_DAILY_LOSS_PCT:
                    try:
                        notify_circuit_breaker(daily_change, "ordini bloccati")
                    except Exception:
                        pass
                    return (
                        f"circuit breaker: daily loss {daily_change:.1f}% "
                        f"exceeds -{MAX_DAILY_LOSS_PCT}%"
                    )
        except Exception as e:
            logger.warning("Could not check daily P&L: %s", e)

        # 6. Cooldown: no repeat orders within N hours
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=ORDER_COOLDOWN_HOURS)).isoformat()
        try:
            existing = (
                self.supabase.table("positions")
                .select("id")
                .eq("ticker", ticker)
                .gte("opened_at", cutoff)
                .limit(1)
                .execute()
            )
            if existing.data:
                return f"cooldown: position opened within last {ORDER_COOLDOWN_HOURS}h"
        except Exception:
            pass  # table may not exist yet

        # 7. Market hours (stocks only)
        is_crypto = "-USD" in ticker
        if not is_crypto and not self.broker.is_market_open():
            return "market closed (US stocks)"

        # 8. Price staleness — skip if price moved > X% since signal
        entry_price = signal.get("entry_price") or (
            signal.get("exit_strategy", {}).get("entry_price")
        )
        if entry_price and entry_price > 0:
            current_price = self.broker.get_latest_price(ticker)
            if current_price and current_price > 0:
                price_change = abs((current_price - entry_price) / entry_price) * 100
                if price_change > STALE_PRICE_PCT:
                    return (
                        f"price stale: moved {price_change:.1f}% since signal "
                        f"(entry=${entry_price:.2f}, now=${current_price:.2f})"
                    )

        # 9. Max drawdown — close all if equity dropped > X% from peak
        try:
            acct = self.broker.get_account()
            equity = float(acct.get("equity", 0))
            # Use initial_margin + equity as rough peak proxy,
            # or track peak in DB/memory
            peak = self._get_peak_equity(equity)
            if peak > 0 and equity < peak:
                dd = ((peak - equity) / peak) * 100
                if dd > MAX_DRAWDOWN_PCT:
                    logger.warning(
                        "MAX DRAWDOWN %.1f%% — closing all positions", dd
                    )
                    result = self.emergency_close_all()
                    try:
                        notify_drawdown(equity, peak, dd, result["positions_closed"])
                    except Exception:
                        pass
                    return (
                        f"max drawdown: {dd:.1f}% from peak "
                        f"(peak=${peak:,.2f}, now=${equity:,.2f}) — "
                        f"all positions closed"
                    )
        except Exception as e:
            logger.warning("Could not check drawdown: %s", e)

        return None  # all checks passed

    # ── Peak equity tracking ─────────────────────────────

    def _get_peak_equity(self, current_equity: float) -> float:
        """Get historical peak equity from DB, update if current is higher."""
        try:
            result = (
                self.supabase.table("portfolio_peak")
                .select("peak_equity")
                .limit(1)
                .execute()
            )
            if result.data:
                peak = float(result.data[0]["peak_equity"])
                if current_equity > peak:
                    self.supabase.table("portfolio_peak").update(
                        {"peak_equity": round(current_equity, 2)}
                    ).eq("id", result.data[0].get("id", 1)).execute()
                    return current_equity
                return peak
            else:
                # First run — seed with current equity
                self.supabase.table("portfolio_peak").insert(
                    {"peak_equity": round(current_equity, 2)}
                ).execute()
                return current_equity
        except Exception:
            # Table may not exist yet — just use current as peak
            return current_equity

    # ── DB persistence ───────────────────────────────────

    def _save_position(
        self,
        ticker: str,
        side: str,
        entry_price: float,
        shares: float,
        allocated: float,
        sl: float | None,
        tp: float | None,
        signal_id: str | None,
    ) -> str | None:
        """Save a new position to Supabase. Returns position UUID."""
        row = {
            "ticker": ticker,
            "side": side,
            "entry_price": round(entry_price, 4),
            "shares": round(shares, 6),
            "allocated_usd": round(allocated, 2),
            "status": "open",
        }
        if sl is not None:
            row["stop_loss"] = round(sl, 4)
        if tp is not None:
            row["take_profit"] = round(tp, 4)
        if signal_id:
            row["signal_id"] = signal_id

        try:
            result = self.supabase.table("positions").insert(row).execute()
            pos_id = result.data[0]["id"] if result.data else None
            logger.info("Saved position for %s (id=%s)", ticker, pos_id)
            return pos_id
        except Exception as e:
            logger.error("Failed to save position for %s: %s", ticker, e)
            return None

    def _close_position_db(
        self,
        ticker: str,
        exit_price: float,
        pnl_usd: float,
        pnl_pct: float,
        close_reason: str,
        signal_id_close: str | None = None,
    ) -> None:
        """Close the open position in DB and create a trade record."""
        try:
            # Find open position
            pos_result = (
                self.supabase.table("positions")
                .select("*")
                .eq("ticker", ticker)
                .eq("status", "open")
                .order("opened_at", desc=True)
                .limit(1)
                .execute()
            )
            if not pos_result.data:
                logger.warning("No open DB position for %s to close", ticker)
                return

            pos = pos_result.data[0]
            pos_id = pos["id"]

            # Update position status
            self.supabase.table("positions").update(
                {"status": "closed"}
            ).eq("id", pos_id).execute()

            # Create trade record
            trade_row = {
                "ticker": ticker,
                "side": pos["side"],
                "entry_price": pos["entry_price"],
                "exit_price": round(exit_price, 4),
                "shares": pos["shares"],
                "pnl_usd": round(pnl_usd, 2),
                "pnl_pct": round(pnl_pct, 2),
                "signal_id_open": pos.get("signal_id"),
                "opened_at": pos["opened_at"],
                "closed_at": datetime.now(timezone.utc).isoformat(),
                "close_reason": close_reason,
            }
            if signal_id_close:
                trade_row["signal_id_close"] = signal_id_close

            self.supabase.table("trades").insert(trade_row).execute()
            logger.info(
                "Closed position %s: %s P&L=$%.2f (reason=%s)",
                pos_id, ticker, pnl_usd, close_reason,
            )
        except Exception as e:
            logger.error("Failed to close position in DB for %s: %s", ticker, e)

    # ── Portfolio queries ────────────────────────────────

    def get_open_positions(self) -> list[dict]:
        """Return all open positions from broker."""
        return self.broker.get_positions()

    def get_available_capital(self) -> float:
        """Return available buying power."""
        return self.broker.get_buying_power()

    def get_portfolio_summary(self) -> dict:
        """Return a summary of the current portfolio state."""
        try:
            acct = self.broker.get_account()
            positions = self.broker.get_positions()
            return {
                "equity": float(acct.get("equity", 0)),
                "buying_power": float(acct.get("buying_power", 0)),
                "cash": float(acct.get("cash", 0)),
                "positions_count": len(positions),
                "daily_pnl": float(acct.get("equity", 0)) - float(acct.get("last_equity", 0)),
                "paper": self.paper,
                "trading_enabled": self._trading_enabled,
            }
        except Exception as e:
            logger.error("Portfolio summary failed: %s", e)
            return {"error": str(e)}

    # ── Emergency ────────────────────────────────────────

    def emergency_close_all(self) -> dict:
        """EMERGENCY: Close all positions and cancel all orders.

        This is the kill switch — called by circuit breaker or
        Telegram /stop_trading command.
        """
        self._trading_enabled = False
        logger.warning("EMERGENCY: Closing all positions and disabling trading")

        closed = self.broker.close_all_positions()

        # Mark all DB positions as closed
        try:
            self.supabase.table("positions").update(
                {"status": "closed"}
            ).eq("status", "open").execute()
        except Exception as e:
            logger.error("Failed to update DB positions: %s", e)

        # Telegram notification
        try:
            notify_emergency_close(len(closed), "kill switch")
        except Exception:
            pass

        return {
            "action": "emergency_close",
            "positions_closed": len(closed),
            "trading_enabled": False,
        }
