import os
import time
import yfinance as yf
import pandas as pd
import numpy as np
import ta
import joblib
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score
from agents import TradingState

MODEL_DIR = "models/"


class MLPredictionAgent:
    def build_features(self, ticker: str) -> pd.DataFrame:
        df = yf.download(
            ticker, period="2y",
            interval="1d", progress=False
        )
        if len(df) < 60:
            raise ValueError("Dati insufficienti")
        close = df["Close"].squeeze()
        volume = df["Volume"].squeeze()
        high = df["High"].squeeze()
        low = df["Low"].squeeze()

        feat = pd.DataFrame(index=df.index)

        # Returns
        feat["r1"] = close.pct_change(1)
        feat["r5"] = close.pct_change(5)
        feat["r10"] = close.pct_change(10)
        feat["r20"] = close.pct_change(20)

        # Technical
        feat["rsi"] = ta.momentum.rsi(close, 14)
        macd = ta.trend.MACD(close)
        feat["macd_hist"] = macd.macd_diff()
        bb = ta.volatility.BollingerBands(close, 20, 2)
        feat["bb_width"] = bb.bollinger_wband()
        feat["atr"] = ta.volatility.average_true_range(
            high, low, close, 14
        )

        # Momentum
        feat["mom5"] = close.pct_change(5)
        feat["mom10"] = close.pct_change(10)
        feat["mom20"] = close.pct_change(20)

        # Volatility
        feat["std5"] = close.pct_change().rolling(5).std()
        feat["std20"] = close.pct_change().rolling(20).std()
        feat["hl_ratio"] = (high - low) / close

        # Volume
        feat["vol_ratio"] = (
            volume / volume.rolling(20).mean()
        )

        # Calendar
        feat["dow"] = pd.to_datetime(df.index).dayofweek
        feat["month"] = pd.to_datetime(df.index).month

        # Target: sale > 1% nei prossimi 5 giorni?
        feat["target"] = (
            close.shift(-5) / close - 1 > 0.01
        ).astype(int)

        feat = feat.dropna()
        return feat

    def train(self, ticker: str) -> float:
        df = self.build_features(ticker)
        if len(df) < 50:
            raise ValueError("Dati insufficienti per training")
        X = df.drop(columns=["target"])
        y = df["target"]
        split = int(len(df) * 0.80)
        X_train, X_test = X.iloc[:split], X.iloc[split:]
        y_train, y_test = y.iloc[:split], y.iloc[split:]
        model = GradientBoostingClassifier(
            n_estimators=200, max_depth=4,
            learning_rate=0.05, subsample=0.8,
            random_state=42
        )
        model.fit(X_train, y_train)
        acc = accuracy_score(y_test, model.predict(X_test))
        path = f"{MODEL_DIR}{ticker.replace('-', '_')}_gb.pkl"
        joblib.dump({"model": model, "accuracy": acc,
                     "features": list(X.columns)}, path)
        print(f"  Model {ticker}: accuracy={acc:.1%}")
        return acc

    def predict(self, ticker: str) -> dict:
        path = f"{MODEL_DIR}{ticker.replace('-', '_')}_gb.pkl"
        retrain = (
            not os.path.exists(path)
            or (time.time() - os.path.getmtime(path)) > 7 * 86400
        )
        if retrain:
            try:
                self.train(ticker)
            except Exception as e:
                return {
                    "signal": "HOLD", "confidence": 0.0,
                    "prob_up": 0.5, "prob_down": 0.5,
                    "top_features": [], "model_accuracy": 0.0,
                    "days_since_training": 0,
                    "reasoning": f"Training fallito: {e}"
                }
        saved = joblib.load(path)
        model = saved["model"]
        acc = saved["accuracy"]
        feats = saved["features"]
        age_days = int(
            (time.time() - os.path.getmtime(path)) / 86400
        )
        df = self.build_features(ticker)
        X_latest = df.drop(columns=["target"])[feats].iloc[[-1]]
        prob_up = float(model.predict_proba(X_latest)[0][1])
        prob_down = 1 - prob_up
        importance = dict(zip(feats, model.feature_importances_))
        top5 = sorted(importance.items(),
                      key=lambda x: x[1], reverse=True)[:5]
        signal = ("BUY" if prob_up > 0.65
                  else "SELL" if prob_up < 0.35
                  else "HOLD")
        confidence = min(abs(prob_up - 0.5) * 2, 1.0)
        return {
            "signal": signal, "confidence": confidence,
            "prob_up": round(prob_up, 3),
            "prob_down": round(prob_down, 3),
            "top_features": [f"{k}={v:.3f}" for k, v in top5],
            "model_accuracy": round(acc, 3),
            "days_since_training": age_days,
            "reasoning": (
                f"prob_up={prob_up:.1%}, "
                f"acc={acc:.1%}, age={age_days}d"
            )
        }

    def retrain_all(self, tickers: list[str]) -> None:
        for t in tickers:
            try:
                acc = self.train(t)
                print(f"  {t} retrained: acc={acc:.1%}")
            except Exception as e:
                print(f"  {t} failed: {e}")


def ml_agent_node(state: TradingState) -> TradingState:
    agent = MLPredictionAgent()
    analysis = agent.predict(state["ticker"])
    state["ml_prediction"] = analysis
    state["reasoning"].append(
        f"MLAgent: {analysis['signal']} "
        f"({analysis['confidence']:.0%}) | "
        f"{analysis['reasoning']}"
    )
    return state
