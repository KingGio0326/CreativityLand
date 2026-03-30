import logging
import os
import time
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
import ta
import yfinance as yf
from dotenv import load_dotenv
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import TimeSeriesSplit
from supabase import create_client

from agents import TradingState
from engine.fractional_diff import frac_diff_ffd, find_optimal_d

load_dotenv()
logger = logging.getLogger("ml_prediction_agent")

# Default d for FFD when no cached value is available
DEFAULT_FFD_D = 0.4

MODEL_DIR = "models/"

_supabase = None


def _get_supabase():
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
    return _supabase


def encode_rate_direction(direction: str) -> float:
    return {"rising": -1.0, "stable": 0.0,
            "falling": 1.0, "unknown": 0.0}.get(direction, 0.0)


class MLPredictionAgent:
    def _get_cached_d(self, ticker: str) -> dict[str, float]:
        """Load cached optimal d values from Supabase. Returns dict feature->d."""
        defaults = {
            "close": DEFAULT_FFD_D, "high": DEFAULT_FFD_D,
            "low": DEFAULT_FFD_D, "volume": DEFAULT_FFD_D,
        }
        try:
            sb = _get_supabase()
            result = (
                sb.table("ml_feature_params")
                .select("feature_name, optimal_d")
                .eq("ticker", ticker)
                .execute()
            )
            if result.data:
                for row in result.data:
                    name = row["feature_name"]
                    if name in defaults and row["optimal_d"] is not None:
                        defaults[name] = row["optimal_d"]
        except Exception:
            pass  # table may not exist yet
        return defaults

    def _save_cached_d(self, ticker: str, feature: str, d: float, pvalue: float):
        """Save optimal d to Supabase cache."""
        try:
            sb = _get_supabase()
            sb.table("ml_feature_params").upsert({
                "ticker": ticker,
                "feature_name": feature,
                "optimal_d": round(d, 2),
                "adf_pvalue": round(pvalue, 6),
            }, on_conflict="ticker,feature_name").execute()
        except Exception as e:
            logger.warning("Failed to cache d for %s/%s: %s", ticker, feature, e)

    def build_features(self, ticker: str, compute_d: bool = False) -> pd.DataFrame:
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

        # Rate direction (default stable for training data)
        feat["rate_dir"] = 0.0

        # ── Fractional Differentiation (López de Prado AFML cap. 5) ──
        # FFD features preserve memory while achieving stationarity
        if compute_d:
            d_values = {}
            for name, series in [("close", close), ("high", high),
                                 ("low", low), ("volume", volume)]:
                d = find_optimal_d(series)
                d_values[name] = d
                logger.info("FFD %s/%s: optimal d=%.2f", ticker, name, d)
            self._ffd_d_cache = d_values
        else:
            d_values = self._get_cached_d(ticker)

        for name, series in [("close", close), ("high", high),
                             ("low", low), ("volume", volume)]:
            d = d_values.get(name, DEFAULT_FFD_D)
            if d > 0:
                # threshold=1e-3 keeps window manageable for ~500 daily bars
                feat[f"{name}_ffd"] = frac_diff_ffd(series, d, threshold=1e-3)

        # Target: sale > 1% nei prossimi 5 giorni?
        feat["target"] = (
            close.shift(-5) / close - 1 > 0.01
        ).astype(int)

        feat = feat.dropna()
        return feat

    def train(self, ticker: str) -> float:
        df = self.build_features(ticker, compute_d=True)

        # Save computed d values to Supabase cache
        if hasattr(self, "_ffd_d_cache"):
            from statsmodels.tsa.stattools import adfuller
            for name, d in self._ffd_d_cache.items():
                pvalue = 0.0
                try:
                    col = f"{name}_ffd"
                    if col in df.columns:
                        clean = df[col].dropna()
                        if len(clean) >= 20:
                            pvalue = adfuller(clean, maxlag=1, regression="c", autolag=None)[1]
                except Exception:
                    pass
                self._save_cached_d(ticker, name, d, pvalue)

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

    def walk_forward_validate(
        self,
        ticker: str,
        n_splits: int = 5,
        min_train_size: int = 252,
        test_size: int = 63,
    ) -> dict:
        """
        Walk-forward validation: divide dati in finestre temporali
        sequenziali, allena su passato, testa su futuro.
        """
        try:
            df = self.build_features(ticker)
            if len(df) < min_train_size + test_size:
                return {
                    "avg_accuracy": 0.5, "std_accuracy": 0.0,
                    "min_accuracy": 0.5, "max_accuracy": 0.5,
                    "n_splits": 0, "fold_accuracies": [],
                    "is_reliable": False,
                    "error": "Dati insufficienti",
                }

            X = df.drop(columns=["target"]).values
            y = df["target"].values

            tscv = TimeSeriesSplit(
                n_splits=n_splits,
                test_size=test_size,
            )

            accuracies = []
            for fold, (train_idx, test_idx) in enumerate(tscv.split(X)):
                if len(train_idx) < min_train_size:
                    continue

                X_train, X_test = X[train_idx], X[test_idx]
                y_train, y_test = y[train_idx], y[test_idx]

                model_fold = GradientBoostingClassifier(
                    n_estimators=100, max_depth=4,
                    learning_rate=0.05, subsample=0.8,
                    random_state=42,
                )
                model_fold.fit(X_train, y_train)

                acc = accuracy_score(y_test, model_fold.predict(X_test))
                accuracies.append(acc)

                logger.info(
                    "Walk-forward %s fold %d/%d: acc=%.3f "
                    "(train=%d, test=%d)",
                    ticker, fold + 1, n_splits,
                    acc, len(train_idx), len(test_idx),
                )

            if not accuracies:
                return {
                    "avg_accuracy": 0.5, "std_accuracy": 0.0,
                    "min_accuracy": 0.5, "max_accuracy": 0.5,
                    "n_splits": 0, "fold_accuracies": [],
                    "is_reliable": False,
                    "error": "Nessun fold valido",
                }

            avg_acc = float(np.mean(accuracies))
            std_acc = float(np.std(accuracies))

            return {
                "avg_accuracy": round(avg_acc, 4),
                "std_accuracy": round(std_acc, 4),
                "min_accuracy": round(float(min(accuracies)), 4),
                "max_accuracy": round(float(max(accuracies)), 4),
                "n_splits": len(accuracies),
                "fold_accuracies": [round(a, 4) for a in accuracies],
                "is_reliable": std_acc < 0.10 and avg_acc > 0.52,
            }

        except Exception as e:
            logger.warning("Walk-forward error %s: %s", ticker, e)
            return {
                "avg_accuracy": 0.5, "std_accuracy": 0.0,
                "min_accuracy": 0.5, "max_accuracy": 0.5,
                "n_splits": 0, "fold_accuracies": [],
                "is_reliable": False,
                "error": str(e),
            }

    def predict(self, ticker: str, rate_direction: str = "unknown") -> dict:
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
        if "rate_dir" in df.columns:
            df.loc[df.index[-1], "rate_dir"] = encode_rate_direction(
                rate_direction
            )
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

        # Load walk-forward validation results
        is_reliable = False
        wf_avg_acc = 0.5
        try:
            val = (_get_supabase().table("ml_validation")
                   .select("*")
                   .eq("ticker", ticker)
                   .maybe_single()
                   .execute())
            if val.data:
                is_reliable = val.data.get("is_reliable", False)
                wf_avg_acc = val.data.get("avg_accuracy", 0.5)
        except Exception:
            pass

        reasoning_suffix = ""
        if not is_reliable:
            confidence *= 0.75
            reasoning_suffix = " (modello non affidabile)"
        else:
            reasoning_suffix = f" (wf_acc={wf_avg_acc:.2f})"

        return {
            "signal": signal, "confidence": confidence,
            "prob_up": round(prob_up, 3),
            "prob_down": round(prob_down, 3),
            "top_features": [f"{k}={v:.3f}" for k, v in top5],
            "model_accuracy": round(acc, 3),
            "days_since_training": age_days,
            "wf_reliable": is_reliable,
            "wf_avg_accuracy": round(wf_avg_acc, 3),
            "reasoning": (
                f"prob_up={prob_up:.1%}, "
                f"acc={acc:.1%}, age={age_days}d"
                + reasoning_suffix
            ),
        }

    def retrain_all(self, tickers: list[str]) -> None:
        sb = _get_supabase()
        for t in tickers:
            try:
                acc = self.train(t)
                print(f"  {t} retrained: acc={acc:.1%}")

                # Walk-forward validation
                wf = self.walk_forward_validate(t)
                logger.info(
                    "Walk-forward %s: avg_acc=%.3f ± %.3f | reliable=%s",
                    t, wf["avg_accuracy"], wf["std_accuracy"],
                    wf["is_reliable"],
                )

                try:
                    sb.table("ml_validation").upsert({
                        "ticker": t,
                        "avg_accuracy": wf["avg_accuracy"],
                        "std_accuracy": wf["std_accuracy"],
                        "min_accuracy": wf.get("min_accuracy"),
                        "max_accuracy": wf.get("max_accuracy"),
                        "n_splits": wf["n_splits"],
                        "fold_accuracies": wf.get("fold_accuracies", []),
                        "is_reliable": wf["is_reliable"],
                        "updated_at": datetime.now().isoformat(),
                    }).execute()
                except Exception as e:
                    logger.warning("ML validation save error %s: %s", t, e)

            except Exception as e:
                print(f"  {t} failed: {e}")


def ml_agent_node(state: TradingState) -> TradingState:
    agent = MLPredictionAgent()
    rate_dir = state.get("rate_direction", "unknown")
    analysis = agent.predict(state["ticker"], rate_direction=rate_dir)
    state["ml_prediction"] = analysis
    state["reasoning"].append(
        f"MLAgent: {analysis['signal']} "
        f"({analysis['confidence']:.0%}) | "
        f"{analysis['reasoning']}"
    )
    return state
