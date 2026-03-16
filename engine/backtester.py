"""Backtesting engine using backtrader and yfinance."""

import logging
import os
import random
import backtrader as bt
import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logger = logging.getLogger("engine.backtester")


class SentimentStrategy(bt.Strategy):
    """Backtrader strategy driven by sentiment signals."""

    params = (
        ("signals", {}),
        ("stop_loss", 0.03),
        ("take_profit", 0.08),
    )

    def __init__(self):
        self.entry_price = None
        self.trade_results = []

    def next(self):
        dt_str = self.datas[0].datetime.date(0).isoformat()
        sig = self.p.signals.get(dt_str)

        if sig and not self.position:
            if sig["signal"] == "BUY" and sig.get("confidence", 0) > 0.5:
                size = int(self.broker.getcash() * 0.10 / self.data.close[0])
                if size > 0:
                    self.buy(size=size)
                    self.entry_price = self.data.close[0]

        elif self.position:
            current = self.data.close[0]
            if self.entry_price:
                pnl_pct = (current - self.entry_price) / self.entry_price
                if pnl_pct <= -self.p.stop_loss:
                    self.close()
                    self.entry_price = None
                    return
                if pnl_pct >= self.p.take_profit:
                    self.close()
                    self.entry_price = None
                    return

            if sig and sig["signal"] == "SELL":
                self.close()
                self.entry_price = None

    def notify_trade(self, trade):
        if trade.isclosed:
            self.trade_results.append(trade.pnl)


class Backtester:
    """Runs backtests using backtrader with sentiment signals."""

    def __init__(self, initial_capital: float = 10000.0):
        self.initial_capital = initial_capital
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

    def run(self, ticker: str, start_date: str, end_date: str) -> dict:
        """Run a backtest for a ticker over a date range."""
        # Download price data
        df = yf.download(ticker, start=start_date, end=end_date, progress=False)
        if df.empty:
            logger.error("No price data for %s", ticker)
            return self._empty_result(ticker, start_date, end_date)

        # Flatten MultiIndex columns if present
        if hasattr(df.columns, "levels"):
            df.columns = df.columns.get_level_values(0)

        # Load signals from Supabase
        signals = self._load_signals(ticker, start_date, end_date)

        if not signals:
            logger.info("No historical signals for %s, generating random demo signals", ticker)
            signals = self._generate_demo_signals(df)

        # Run backtrader
        cerebro = bt.Cerebro()
        cerebro.broker.setcash(self.initial_capital)
        cerebro.broker.setcommission(commission=0.001)

        data = bt.feeds.PandasData(dataname=df)
        cerebro.adddata(data)
        cerebro.addstrategy(SentimentStrategy, signals=signals)
        cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name="sharpe", riskfreerate=0.04)
        cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")

        results = cerebro.run()
        strat = results[0]

        final_value = cerebro.broker.getvalue()
        total_return = (final_value - self.initial_capital) / self.initial_capital

        sharpe_analysis = strat.analyzers.sharpe.get_analysis()
        sharpe_ratio = sharpe_analysis.get("sharperatio")
        sharpe_ratio = sharpe_ratio if sharpe_ratio is not None else 0.0

        dd_analysis = strat.analyzers.drawdown.get_analysis()
        max_drawdown = dd_analysis.get("max", {}).get("drawdown", 0.0) / 100

        trade_results = strat.trade_results
        trades_count = len(trade_results)
        win_rate = sum(1 for t in trade_results if t > 0) / trades_count if trades_count > 0 else 0.0

        result = {
            "ticker": ticker,
            "start_date": start_date,
            "end_date": end_date,
            "total_return": round(total_return, 4),
            "sharpe_ratio": round(sharpe_ratio, 4),
            "max_drawdown": round(max_drawdown, 4),
            "win_rate": round(win_rate, 4),
            "trades_count": trades_count,
            "final_value": round(final_value, 2),
        }

        logger.info(
            "Backtest %s: return=%.2f%% sharpe=%.2f trades=%d",
            ticker, total_return * 100, sharpe_ratio, trades_count
        )
        return result

    def save_results(self, ticker: str, results: dict) -> None:
        """Save backtest results to Supabase."""
        row = {
            "ticker": ticker,
            "start_date": results["start_date"],
            "end_date": results["end_date"],
            "total_return": results["total_return"],
            "sharpe_ratio": results["sharpe_ratio"],
            "max_drawdown": results["max_drawdown"],
            "win_rate": results["win_rate"],
            "trades_count": results["trades_count"],
        }
        self.supabase.table("backtest_results").insert(row).execute()
        logger.info("Saved backtest results for %s", ticker)

    def _load_signals(self, ticker: str, start_date: str, end_date: str) -> dict:
        """Load historical signals from Supabase."""
        response = (
            self.supabase.table("signals")
            .select("*")
            .eq("ticker", ticker)
            .gte("created_at", start_date)
            .lte("created_at", end_date)
            .execute()
        )

        signals = {}
        for s in response.data:
            dt = s["created_at"][:10]
            signals[dt] = {"signal": s["signal"], "confidence": s.get("confidence", 0.5)}

        return signals

    def _generate_demo_signals(self, df) -> dict:
        """Generate random demo signals for backtesting when no historical data exists."""
        random.seed(42)
        signals = {}
        dates = [d.strftime("%Y-%m-%d") for d in df.index]

        for date in dates:
            if random.random() < 0.08:
                signals[date] = {
                    "signal": random.choice(["BUY", "SELL"]),
                    "confidence": round(random.uniform(0.4, 0.95), 2),
                }

        return signals

    def _empty_result(self, ticker: str, start_date: str, end_date: str) -> dict:
        """Return an empty result when no data is available."""
        return {
            "ticker": ticker,
            "start_date": start_date,
            "end_date": end_date,
            "total_return": 0.0,
            "sharpe_ratio": 0.0,
            "max_drawdown": 0.0,
            "win_rate": 0.0,
            "trades_count": 0,
            "final_value": self.initial_capital,
        }
