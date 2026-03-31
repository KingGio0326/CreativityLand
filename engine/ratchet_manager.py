"""Ratcheting Take Profit manager.

When price approaches TP with strong momentum, the old TP becomes the new SL
and a higher TP is set.  Both bracket legs are PATCHed on Alpaca in real time
(TP first — safe, then SL — risky).  Full sanity-check and post-PATCH
verification guard every execution.
"""

import logging
import os
from datetime import datetime

import pandas as pd
import ta
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

from engine.broker_alpaca import AlpacaBroker

load_dotenv()
logger = logging.getLogger("engine.ratchet_manager")

# Regime multipliers (same as ExitStrategyAgent)
REGIME_ATR_MULT = {
    "crisis": 3.0,
    "bear":   2.5,
    "neutral": 2.0,
    "bull":   1.5,
}

# Price must have travelled this fraction of the entry→TP distance
PROXIMITY_NORMAL = 0.80  # 80% progress triggers ratchet
PROXIMITY_BEAR   = 0.90  # more conservative in bear markets

# Velocity: must reach PROXIMITY in < 50% of max holding time (168h)
MAX_HOLDING_HOURS       = 168.0
VELOCITY_THRESHOLD_PCT  = 0.50

# RSI overbought caps — above these, take profit instead of ratcheting
RSI_THRESHOLD_STOCK  = 78.0
RSI_THRESHOLD_CRYPTO = 82.0

# ATR guard: skip if ATR > this fraction of price (extreme volatility)
ATR_MAX_PRICE_PCT = 0.15

# Post-PATCH verification tolerance (absolute price units)
VERIFY_TOLERANCE = 0.02


class RatchetManager:
    """Checks open long positions and ratchets SL/TP where conditions are met."""

    MAX_RATCHETS = 3

    def __init__(self, paper: bool | None = None):
        if paper is None:
            paper = os.getenv("PAPER_TRADING", "true").lower() == "true"
        self.broker = AlpacaBroker(paper=paper)
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
        self.paper = paper

    # ── Main entry point ─────────────────────────────────

    def check_all_positions(self) -> list[dict]:
        """Check every open long position and ratchet where warranted.

        Returns a list of result dicts (one per position).
        """
        try:
            pos_result = (
                self.supabase.table("positions")
                .select("*")
                .eq("status", "open")
                .eq("side", "long")
                .execute()
            )
            positions = pos_result.data or []
        except Exception as e:
            logger.error("check_all_positions: DB fetch failed: %s", e)
            return []

        if not positions:
            logger.info("No open long positions to check")
            return []

        results = []
        for pos in positions:
            ticker        = pos.get("ticker", "")
            entry_price   = float(pos.get("entry_price") or 0)
            current_sl    = float(pos.get("stop_loss")   or 0)
            current_tp    = float(pos.get("take_profit") or 0)
            ratchet_count = int(pos.get("ratchet_count") or 0)
            pos_id        = pos.get("id")

            if not current_tp or current_tp <= entry_price:
                results.append({"ticker": ticker, "action": "skip",
                                 "reason": "no valid TP set"})
                continue

            current_price = self.broker.get_latest_price(ticker)
            if not current_price:
                results.append({"ticker": ticker, "action": "skip",
                                 "reason": "could not get current price"})
                continue

            # Parse opened_at → naive UTC datetime
            opened_at = None
            raw_ts = pos.get("opened_at")
            if raw_ts:
                try:
                    ts = pd.Timestamp(raw_ts)
                    opened_at = ts.tz_localize(None) if ts.tzinfo else ts
                    opened_at = opened_at.to_pydatetime()
                except Exception:
                    pass

            # Fetch market data once — shared by should_ratchet and
            # execute_ratchet to avoid a double yfinance download
            market_data = self._get_market_data(ticker)

            check = self.should_ratchet(
                ticker=ticker,
                entry_price=entry_price,
                current_price=current_price,
                current_sl=current_sl,
                current_tp=current_tp,
                ratchet_count=ratchet_count,
                opened_at=opened_at,
                market_data=market_data,
            )

            if check["should_ratchet"]:
                atr_14 = market_data.get("atr_14") or 0.0
                res = self.execute_ratchet(
                    ticker=ticker,
                    current_tp=current_tp,
                    old_sl=current_sl,
                    atr_14=atr_14,
                    regime=check["regime"],
                    position_id=pos_id,
                    current_price=current_price,
                    entry_price=entry_price,
                )
                results.append(res)

                if res.get("action") in ("ratcheted", "ratcheted_tp_only",
                                         "ratcheted_db_only"):
                    try:
                        from bot_telegram.telegram_notifier import notify_ratchet
                        notify_ratchet(
                            ticker=ticker,
                            ratchet_count=res["ratchet_count"],
                            old_sl=res["old_sl"],
                            new_sl=res["new_sl"],
                            old_tp=res["old_tp"],
                            new_tp=res["new_tp"],
                            progress_pct=check["progress_pct"],
                            paper=self.paper,
                        )
                    except Exception as e:
                        logger.warning("Telegram ratchet notify failed: %s", e)
            else:
                results.append({
                    "ticker": ticker,
                    "action": "no_ratchet",
                    "reason": check["reason"],
                    "progress_pct": check.get("progress_pct", 0.0),
                })

        return results

    # ── Condition evaluation ─────────────────────────────

    def should_ratchet(
        self,
        ticker: str,
        entry_price: float,
        current_price: float,
        current_sl: float,
        current_tp: float,
        ratchet_count: int,
        opened_at: datetime | None = None,
        market_data: dict | None = None,
    ) -> dict:
        """Evaluate multi-factor conditions for ratchet eligibility.

        Returns a dict with should_ratchet (bool) and diagnostic fields.
        Checks are evaluated cheapest-first to short-circuit early.
        """

        def _no(reason, *, progress_pct=0.0, velocity_ok=None,
                momentum_ok=None, volume_ok=None, regime="unknown"):
            return {
                "should_ratchet": False, "reason": reason,
                "progress_pct": progress_pct, "velocity_ok": velocity_ok,
                "momentum_ok": momentum_ok, "volume_ok": volume_ok,
                "regime": regime,
            }

        # 1. Max ratchets guard (no I/O)
        if ratchet_count >= self.MAX_RATCHETS:
            return _no(
                f"max ratchets reached ({ratchet_count}/{self.MAX_RATCHETS})"
            )

        # 2. Price already above TP — possible missed execution
        if current_price >= current_tp:
            logger.warning(
                "should_ratchet %s: price %.4f >= TP %.4f — possible unexecuted TP order",
                ticker, current_price, current_tp,
            )
            try:
                from bot_telegram.telegram_notifier import notify
                notify(
                    f"\u26a0\ufe0f <b>TP NON ESEGUITO [{ticker}]</b>\n"
                    f"Prezzo <b>${current_price:.4f}</b> \u2265 TP <b>${current_tp:.4f}</b>\n"
                    f"Verificare se l'ordine TP \u00e8 stato eseguito su Alpaca!"
                )
            except Exception:
                pass
            return _no(
                f"prezzo {current_price:.4f} >= TP {current_tp:.4f} — ordine TP non eseguito?",
                regime="unknown",
            )

        # 3. Regime check (Supabase, fast)
        regime = self._get_regime()
        if regime == "crisis":
            return _no("crisis regime — take profit instead of ratcheting",
                       regime=regime)

        # 4. Proximity check (arithmetic, no I/O)
        tp_distance = current_tp - entry_price
        if tp_distance <= 0:
            return _no("invalid: TP <= entry_price", regime=regime)

        progress = (current_price - entry_price) / tp_distance
        progress_pct = round(progress * 100, 1)
        threshold = PROXIMITY_BEAR if regime == "bear" else PROXIMITY_NORMAL
        if progress < threshold:
            return _no(
                f"progress {progress_pct:.1f}% < {threshold*100:.0f}% threshold",
                progress_pct=progress_pct, regime=regime,
            )

        # 5. Velocity check (datetime arithmetic, no I/O)
        velocity_ok = True
        if opened_at is not None:
            hours_elapsed = (datetime.utcnow() - opened_at).total_seconds() / 3600
            velocity_ok = hours_elapsed < MAX_HOLDING_HOURS * VELOCITY_THRESHOLD_PCT

        # 6. Momentum + volume (market data — fetch lazily if not provided)
        if market_data is None:
            market_data = self._get_market_data(ticker)

        rsi       = market_data.get("rsi", 50.0)
        volume_ok = market_data.get("volume_ok", True)

        is_crypto   = "-USD" in ticker
        rsi_cap     = RSI_THRESHOLD_CRYPTO if is_crypto else RSI_THRESHOLD_STOCK
        momentum_ok = rsi < rsi_cap

        if not velocity_ok:
            return _no(
                f"velocity too slow (reached {progress_pct:.0f}% in >50% of hold time)",
                progress_pct=progress_pct, velocity_ok=False,
                momentum_ok=momentum_ok, volume_ok=volume_ok, regime=regime,
            )

        if not momentum_ok:
            return _no(
                f"RSI {rsi:.1f} >= {rsi_cap} (overbought — take profit instead)",
                progress_pct=progress_pct, velocity_ok=velocity_ok,
                momentum_ok=False, volume_ok=volume_ok, regime=regime,
            )

        if not volume_ok:
            return _no(
                "volume below 20-period average — weak breakout",
                progress_pct=progress_pct, velocity_ok=velocity_ok,
                momentum_ok=momentum_ok, volume_ok=False, regime=regime,
            )

        return {
            "should_ratchet": True,
            "reason": (
                f"all conditions met: progress={progress_pct:.1f}%, "
                f"RSI={rsi:.1f}, volume_ok=True, regime={regime}"
            ),
            "progress_pct": progress_pct,
            "velocity_ok": velocity_ok,
            "momentum_ok": momentum_ok,
            "volume_ok": volume_ok,
            "regime": regime,
        }

    # ── Ratchet execution ────────────────────────────────

    def execute_ratchet(
        self,
        ticker: str,
        current_tp: float,
        old_sl: float,
        atr_14: float,
        regime: str,
        position_id: str,
        current_price: float = 0.0,
        entry_price: float = 0.0,
    ) -> dict:
        """Execute the ratchet: old TP → new SL, new TP = old TP + ATR × mult.

        Safety order: TP PATCH first (safe), SL PATCH second (risky).
        Sanity-checks levels before touching Alpaca, then verifies post-PATCH.
        Always updates Supabase even if Alpaca PATCH(es) failed.
        """

        # ── ATR protection ────────────────────────────────────
        if atr_14 <= 0:
            logger.warning("Ratchet skipped for %s: ATR not available or zero", ticker)
            return {"action": "skipped", "ticker": ticker,
                    "reason": "ATR not available or zero"}
        if current_price > 0 and atr_14 > current_price * ATR_MAX_PRICE_PCT:
            logger.warning(
                "Ratchet skipped for %s: ATR %.4f > %.0f%% of price %.4f (extreme volatility)",
                ticker, atr_14, ATR_MAX_PRICE_PCT * 100, current_price,
            )
            return {
                "action": "skipped", "ticker": ticker,
                "reason": (
                    f"ATR {atr_14:.4f} > {ATR_MAX_PRICE_PCT*100:.0f}% of "
                    f"price {current_price:.4f} — extreme volatility"
                ),
            }

        atr_mult = REGIME_ATR_MULT.get(regime, 2.0)
        new_sl   = round(current_tp, 4)
        new_tp   = round(current_tp + atr_14 * atr_mult, 4)

        # ── Sanity checks on computed levels ─────────────────
        # NOTE: new_sl = current_tp > current_price (ratchet fires BEFORE hitting TP),
        # so the check new_sl < current_price is intentionally absent here.
        skip_reason: str | None = None
        if entry_price > 0 and new_sl <= entry_price:
            skip_reason = (
                f"new_sl {new_sl} <= entry_price {entry_price} — no locked profit"
            )
        elif new_tp <= new_sl * 1.005:
            skip_reason = (
                f"new_tp {new_tp} not > new_sl {new_sl} × 1.005 (< 0.5% gap)"
            )
        elif current_price > 0 and new_tp <= current_price:
            skip_reason = (
                f"new_tp {new_tp} <= current_price {current_price:.4f} — TP already passed"
            )

        if skip_reason:
            logger.warning("Ratchet sanity check failed for %s: %s", ticker, skip_reason)
            return {"action": "skipped", "ticker": ticker, "reason": skip_reason}

        # ── Fetch current ratchet metadata from DB ────────────
        current_count = 0
        ratchet_history: list = []
        try:
            row = (
                self.supabase.table("positions")
                .select("ratchet_count, ratchet_history")
                .eq("id", position_id)
                .single()
                .execute()
            )
            if row.data:
                current_count   = int(row.data.get("ratchet_count") or 0)
                ratchet_history = list(row.data.get("ratchet_history") or [])
        except Exception as e:
            logger.warning("Could not fetch ratchet metadata for %s: %s", ticker, e)

        # ── PATCH Alpaca bracket legs — TP first, then SL ─────
        tp_patched  = False
        sl_patched  = False
        patch_error: str | None = None

        try:
            legs = self.broker.get_bracket_legs(ticker)
            if legs:
                # Step 1: PATCH TP (safe — only raising the limit order)
                try:
                    self.broker.replace_order(legs["tp_order_id"], limit_price=new_tp)
                    tp_patched = True
                except Exception as e:
                    patch_error = f"TP PATCH failed: {e}"
                    logger.error(
                        "Ratchet TP PATCH failed for %s — SL not touched: %s",
                        ticker, e,
                    )

                if tp_patched:
                    # Step 2: PATCH SL (risky — raising the stop)
                    try:
                        self.broker.replace_order(legs["sl_order_id"], stop_price=new_sl)
                        sl_patched = True
                    except Exception as e:
                        patch_error = f"SL PATCH failed after TP updated: {e}"
                        logger.critical(
                            "Ratchet CRITICAL for %s: TP updated to %.4f but SL PATCH failed: %s",
                            ticker, new_tp, e,
                        )
                        try:
                            from bot_telegram.telegram_notifier import notify
                            notify(
                                f"\u26a0\ufe0f <b>RATCHET CRITICO [{ticker}]</b>\n"
                                f"TP aggiornato a <b>${new_tp:.4f}</b> "
                                f"ma SL rimasto a <b>${old_sl:.4f}</b>\n"
                                f"Controllare manualmente su Alpaca!"
                            )
                        except Exception as ne:
                            logger.warning("Telegram critical ratchet notify failed: %s", ne)

                if tp_patched and sl_patched:
                    logger.info(
                        "Ratchet #%d %s: SL %.4f→%.4f, TP %.4f→%.4f",
                        current_count + 1, ticker, old_sl, new_sl, current_tp, new_tp,
                    )
                    # Post-PATCH verification
                    try:
                        verified = self.broker.get_bracket_legs(ticker)
                        if verified:
                            tp_ok = abs(verified["tp_limit_price"] - new_tp) < VERIFY_TOLERANCE
                            sl_ok = abs(verified["sl_stop_price"] - new_sl) < VERIFY_TOLERANCE
                            if not (tp_ok and sl_ok):
                                logger.error(
                                    "Ratchet post-PATCH verify FAILED for %s: "
                                    "expected SL=%.4f/TP=%.4f, found SL=%.4f/TP=%.4f",
                                    ticker, new_sl, new_tp,
                                    verified["sl_stop_price"], verified["tp_limit_price"],
                                )
                                try:
                                    from bot_telegram.telegram_notifier import notify
                                    notify(
                                        f"\u26a0\ufe0f <b>RATCHET VERIFICA FALLITA [{ticker}]</b>\n"
                                        f"Atteso SL=<b>${new_sl:.4f}</b> / TP=<b>${new_tp:.4f}</b>\n"
                                        f"Trovato SL=<b>${verified['sl_stop_price']:.4f}</b> / "
                                        f"TP=<b>${verified['tp_limit_price']:.4f}</b>\n"
                                        f"Verificare su Alpaca!"
                                    )
                                except Exception as ne:
                                    logger.warning("Telegram verify notify failed: %s", ne)
                    except Exception as e:
                        logger.warning("Post-PATCH verification failed for %s: %s", ticker, e)
            else:
                patch_error = "bracket legs not found on Alpaca — DB updated only"
                logger.warning("Ratchet %s: %s", ticker, patch_error)
        except Exception as e:
            patch_error = str(e)
            logger.error("Ratchet PATCH failed for %s: %s", ticker, e)

        legs_patched = tp_patched and sl_patched

        # ── Update Supabase — always, even on partial Alpaca failure ─
        new_count = current_count + 1
        ratchet_history.append({
            "ratchet_n":    new_count,
            "old_sl":       round(old_sl, 4),
            "old_tp":       round(current_tp, 4),
            "new_sl":       new_sl,
            "new_tp":       new_tp,
            "timestamp":    datetime.utcnow().isoformat(),
            "legs_patched": legs_patched,
            "tp_patched":   tp_patched,
            "sl_patched":   sl_patched,
        })
        try:
            self.supabase.table("positions").update({
                "stop_loss":       new_sl,
                "take_profit":     new_tp,
                "ratchet_count":   new_count,
                "last_ratchet_at": datetime.utcnow().isoformat(),
                "ratchet_history": ratchet_history,
            }).eq("id", position_id).execute()
        except Exception as e:
            logger.error("DB update after ratchet failed for %s: %s", ticker, e)

        if legs_patched:
            action = "ratcheted"
        elif tp_patched:
            action = "ratcheted_tp_only"
        else:
            action = "ratcheted_db_only"

        return {
            "action":        action,
            "ticker":        ticker,
            "old_sl":        round(old_sl, 4),
            "new_sl":        new_sl,
            "old_tp":        round(current_tp, 4),
            "new_tp":        new_tp,
            "ratchet_count": new_count,
            "legs_patched":  legs_patched,
            "tp_patched":    tp_patched,
            "sl_patched":    sl_patched,
            "patch_error":   patch_error,
        }

    # ── Helpers (mockable for unit tests) ────────────────

    def _get_market_data(self, ticker: str) -> dict:
        """Download RSI-14, volume ratio, and ATR-14 from yfinance.

        Uses daily data for stocks and hourly for crypto (consistent with
        ExitStrategyAgent). Returns safe defaults on failure.
        """
        is_crypto = "-USD" in ticker
        interval  = "1h"  if is_crypto else "1d"
        period    = "7d"  if is_crypto else "60d"

        try:
            df = yf.download(ticker, period=period, interval=interval, progress=False)
            if len(df) < 20:
                return {"rsi": 50.0, "volume_ok": True, "atr_14": 0.0}

            close  = df["Close"].squeeze()
            high   = df["High"].squeeze()
            low    = df["Low"].squeeze()
            volume = df["Volume"].squeeze()

            # RSI-14
            rsi_val = float(ta.momentum.rsi(close, window=14).iloc[-1])
            if pd.isna(rsi_val):
                rsi_val = 50.0

            # Volume: mean of last 4 bars vs 20-bar SMA
            vol_recent = float(volume.iloc[-4:].mean())
            vol_avg    = float(volume.rolling(20).mean().iloc[-1])
            volume_ok  = (vol_recent > vol_avg) if vol_avg > 0 else True

            # ATR-14 (Wilder method via ta)
            atr_val = float(
                ta.volatility.average_true_range(high, low, close, window=14).iloc[-1]
            )
            if pd.isna(atr_val):
                atr_val = float(close.iloc[-1]) * 0.02

            return {"rsi": rsi_val, "volume_ok": volume_ok, "atr_14": atr_val}

        except Exception as e:
            logger.warning("_get_market_data(%s) failed: %s", ticker, e)
            return {"rsi": 50.0, "volume_ok": True, "atr_14": 0.0}

    def _get_regime(self) -> str:
        """Return the latest market regime from Supabase."""
        try:
            result = (
                self.supabase.table("market_regime")
                .select("regime")
                .order("detected_at", desc=True)
                .limit(1)
                .execute()
            )
            if result.data:
                return result.data[0].get("regime", "neutral")
        except Exception as e:
            logger.warning("_get_regime failed: %s", e)
        return "neutral"
