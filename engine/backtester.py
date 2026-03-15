"""Backtesting engine for evaluating trading strategies."""

import pandas as pd


class Backtester:
    """Simulates trading strategy performance on historical data."""

    def __init__(self, initial_capital: float = 10000.0):
        self.initial_capital = initial_capital

    def run(self, signals: list[str], prices: list[float]) -> dict:
        """Run backtest with given signals and price series."""
        capital = self.initial_capital
        position = 0.0
        trades = []

        for i, (signal, price) in enumerate(zip(signals, prices)):
            if signal == "BUY" and capital > 0:
                position = capital / price
                capital = 0.0
                trades.append({"step": i, "action": "BUY", "price": price})
            elif signal == "SELL" and position > 0:
                capital = position * price
                position = 0.0
                trades.append({"step": i, "action": "SELL", "price": price})

        # Close any open position at the last price
        if position > 0:
            capital = position * prices[-1]

        return {
            "initial_capital": self.initial_capital,
            "final_capital": round(capital, 2),
            "return_pct": round((capital - self.initial_capital) / self.initial_capital * 100, 2),
            "num_trades": len(trades),
            "trades": trades,
        }
