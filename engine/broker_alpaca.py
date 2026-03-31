"""Alpaca paper/live broker adapter using REST API (no SDK dependency)."""

import logging
import os
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("engine.broker_alpaca")

PAPER_URL = "https://paper-api.alpaca.markets"
LIVE_URL = "https://api.alpaca.markets"


class AlpacaBroker:
    """Thin wrapper around Alpaca REST API for order management."""

    def __init__(self, paper: bool = True):
        self.api_key = os.getenv("ALPACA_API_KEY", "").strip()
        self.secret_key = os.getenv("ALPACA_SECRET_KEY", "").strip()
        self.base_url = PAPER_URL if paper else LIVE_URL
        self._client = httpx.Client(
            base_url=self.base_url,
            headers={
                "APCA-API-KEY-ID": self.api_key,
                "APCA-API-SECRET-KEY": self.secret_key,
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    # ── Account ──────────────────────────────────────────

    def get_account(self) -> dict:
        """Return account info (buying power, equity, etc.)."""
        r = self._client.get("/v2/account")
        r.raise_for_status()
        return r.json()

    def get_buying_power(self) -> float:
        """Return available buying power in USD."""
        acct = self.get_account()
        return float(acct.get("buying_power", 0))

    def get_equity(self) -> float:
        """Return total account equity."""
        acct = self.get_account()
        return float(acct.get("equity", 0))

    # ── Positions ────────────────────────────────────────

    def get_positions(self) -> list[dict]:
        """Return all open positions."""
        r = self._client.get("/v2/positions")
        r.raise_for_status()
        return r.json()

    def get_position(self, ticker: str) -> dict | None:
        """Return position for a specific ticker, or None."""
        symbol = ticker.replace("-", "")
        try:
            r = self._client.get(f"/v2/positions/{symbol}")
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError:
            return None

    def has_position(self, ticker: str) -> bool:
        """Check if there's an open position for this ticker."""
        return self.get_position(ticker) is not None

    # ── Orders ───────────────────────────────────────────

    def submit_market_order(
        self,
        ticker: str,
        qty: float,
        side: str,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict:
        """Submit a market order, optionally with bracket SL/TP.

        Fractional quantities (qty < 1 or non-integer) require TIF=day and
        do NOT support bracket orders on Alpaca.  SL/TP for fractional orders
        are managed by position_manager.yml via Supabase.

        Args:
            ticker: Symbol (e.g. "AAPL")
            qty: Number of shares (can be fractional)
            side: "buy" or "sell"
            stop_loss: Stop loss price (ignored for fractional orders)
            take_profit: Take profit price (ignored for fractional orders)

        Returns:
            Alpaca order response dict
        """
        symbol = ticker.replace("-", "")

        # Alpaca: fractional orders must use TIF=day and cannot have brackets
        is_fractional = (qty % 1 != 0) or qty < 1
        tif = "day" if is_fractional else "gtc"

        body: dict = {
            "symbol": symbol,
            "qty": str(round(qty, 6)),
            "side": side,
            "type": "market",
            "time_in_force": tif,
        }

        # Bracket order only for whole-share orders
        has_bracket = False
        if not is_fractional and stop_loss is not None and take_profit is not None:
            body["order_class"] = "bracket"
            body["stop_loss"] = {"stop_price": str(round(stop_loss, 2))}
            body["take_profit"] = {"limit_price": str(round(take_profit, 2))}
            has_bracket = True

        if is_fractional:
            logger.info(
                "Fractional order %.6f shares — no bracket, TIF=day. "
                "SL/TP will be managed by position_manager",
                qty,
            )

        logger.info(
            "Order %s: qty=%.6f, fractional=%s, tif=%s, bracket=%s (SL=%s, TP=%s)",
            symbol, qty, is_fractional, tif, has_bracket, stop_loss, take_profit,
        )

        r = self._client.post("/v2/orders", json=body)
        if not r.is_success:
            logger.error("Order failed: %s %s", r.status_code, r.text)
        r.raise_for_status()
        data = r.json()
        logger.info("Order placed: id=%s status=%s", data["id"], data["status"])
        return data

    def close_position(self, ticker: str) -> dict | None:
        """Close an open position by liquidating all shares.

        Returns the order response, or None if no position exists.
        """
        symbol = ticker.replace("-", "")
        pos = self.get_position(ticker)
        if not pos:
            logger.info("No position to close for %s", symbol)
            return None

        # Cancel any pending orders for this ticker first
        self.cancel_orders_for(ticker)

        r = self._client.delete(f"/v2/positions/{symbol}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
        logger.info("Position closed: %s", symbol)
        return data

    def cancel_orders_for(self, ticker: str) -> int:
        """Cancel all open orders for a ticker. Returns count cancelled."""
        symbol = ticker.replace("-", "")
        r = self._client.get("/v2/orders", params={"status": "open", "symbols": symbol})
        r.raise_for_status()
        orders = r.json()
        cancelled = 0
        for order in orders:
            try:
                self._client.delete(f"/v2/orders/{order['id']}")
                cancelled += 1
            except Exception as e:
                logger.warning("Failed to cancel order %s: %s", order["id"], e)
        if cancelled:
            logger.info("Cancelled %d pending orders for %s", cancelled, symbol)
        return cancelled

    def cancel_all_orders(self) -> int:
        """Cancel ALL open orders. Returns count cancelled."""
        r = self._client.delete("/v2/orders")
        r.raise_for_status()
        data = r.json()
        count = len(data) if isinstance(data, list) else 0
        logger.info("Cancelled all orders (%d)", count)
        return count

    def close_all_positions(self) -> list[dict]:
        """Liquidate ALL positions. Returns list of close orders."""
        self.cancel_all_orders()
        r = self._client.delete("/v2/positions")
        r.raise_for_status()
        data = r.json()
        logger.warning("Closed ALL positions (%d)", len(data) if isinstance(data, list) else 0)
        return data if isinstance(data, list) else []

    # ── Market data ──────────────────────────────────────

    def get_latest_price(self, ticker: str) -> float | None:
        """Get latest trade price. Uses Alpaca for stocks, yfinance for crypto."""
        is_crypto = "-USD" in ticker
        if is_crypto:
            return self._get_price_yfinance(ticker)

        symbol = ticker.replace("-", "")
        try:
            r = httpx.get(
                f"https://data.alpaca.markets/v2/stocks/{symbol}/trades/latest",
                headers={
                    "APCA-API-KEY-ID": self.api_key,
                    "APCA-API-SECRET-KEY": self.secret_key,
                },
                timeout=10.0,
            )
            r.raise_for_status()
            return float(r.json()["trade"]["p"])
        except Exception:
            return self._get_price_yfinance(ticker)

    @staticmethod
    def _get_price_yfinance(ticker: str) -> float | None:
        """Fallback price via yfinance."""
        try:
            import yfinance as yf
            df = yf.download(ticker, period="2d", interval="1d", progress=False)
            if len(df) > 0:
                return float(df["Close"].values.flatten()[-1])
        except Exception:
            pass
        return None

    # ── Orders (read + modify) ───────────────────────────

    def get_open_orders(self, ticker: str | None = None) -> list[dict]:
        """Return open orders, optionally filtered by ticker.

        Uses nested=true so bracket legs are included inline.
        """
        params: dict = {"status": "open", "nested": "true"}
        if ticker:
            params["symbols"] = ticker.replace("-", "")
        r = self._client.get("/v2/orders", params=params)
        r.raise_for_status()
        return r.json()

    def replace_order(
        self,
        order_id: str,
        limit_price: float | None = None,
        stop_price: float | None = None,
    ) -> dict:
        """Modify an existing order via PATCH /v2/orders/{order_id}.

        Use limit_price to update a take-profit (limit) leg and
        stop_price to update a stop-loss (stop) leg.
        """
        body: dict = {}
        if limit_price is not None:
            body["limit_price"] = str(round(limit_price, 2))
        if stop_price is not None:
            body["stop_price"] = str(round(stop_price, 2))
        if not body:
            raise ValueError("Must provide limit_price or stop_price")
        r = self._client.patch(f"/v2/orders/{order_id}", json=body)
        if not r.is_success:
            logger.error("replace_order failed: %s %s", r.status_code, r.text)
        r.raise_for_status()
        return r.json()

    def get_bracket_legs(self, ticker: str) -> dict | None:
        """Find the TP and SL order legs for an open bracket position.

        Returns {"tp_order_id", "tp_limit_price", "sl_order_id",
        "sl_stop_price"} or None if no bracket order is found.
        """
        try:
            orders = self.get_open_orders(ticker)
        except Exception as e:
            logger.warning("get_bracket_legs(%s) failed: %s", ticker, e)
            return None

        for order in orders:
            if order.get("order_class") != "bracket":
                continue
            legs = order.get("legs") or []
            tp_order = None
            sl_order = None
            for leg in legs:
                leg_type = leg.get("type", "")
                if leg_type == "limit":
                    tp_order = leg
                elif leg_type in ("stop", "stop_limit"):
                    sl_order = leg
            if tp_order and sl_order:
                return {
                    "tp_order_id": tp_order["id"],
                    "tp_limit_price": float(tp_order.get("limit_price") or 0),
                    "sl_order_id": sl_order["id"],
                    "sl_stop_price": float(sl_order.get("stop_price") or 0),
                }
        logger.info("No bracket legs found for %s", ticker)
        return None

    # ── Market hours ─────────────────────────────────────

    def is_market_open(self) -> bool:
        """Check if US stock market is currently open."""
        try:
            r = self._client.get("/v2/clock")
            r.raise_for_status()
            return r.json().get("is_open", False)
        except Exception:
            return False
