"""Meta-Labeling Agent (López de Prado, AFML cap. 3.6).

Predicts the probability that the primary signal (BUY/SELL) is correct,
calibrating the confidence based on historical triple-barrier outcomes.
Does NOT decide direction — only sizes conviction.
"""

import json
import logging
import os
from datetime import datetime

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.metrics import accuracy_score, precision_score, recall_score
from supabase import create_client
from xgboost import XGBClassifier

from agents import TradingState
from engine.purged_kfold import PurgedKFoldCV

load_dotenv()
logger = logging.getLogger("agents.meta_labeling")

MODEL_NAME = "meta_labeling_global"

_supabase = None


def _get_supabase():
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
    return _supabase


# ── Feature encoding helpers ────────────────────────────────

REGIME_MAP = {"crisis": -2, "bear": -1, "neutral": 0, "bull": 1}
CONSENSUS_MAP = {"strong": 3, "moderate": 2, "weak": 1}

AGENT_NAMES = [
    "sentiment", "fundamental", "momentum", "technical",
    "ml_prediction", "liquidity", "options", "macro",
    "intermarket", "seasonal", "institutional", "mean_reversion",
]


def _vote_to_num(vote) -> float:
    """Convert agent vote to numeric."""
    if isinstance(vote, (int, float)):
        return float(vote)
    if isinstance(vote, str):
        return {"BUY": 1.0, "SELL": -1.0}.get(vote.upper(), 0.0)
    if isinstance(vote, dict):
        sig = vote.get("signal", vote.get("vote", "HOLD"))
        return {"BUY": 1.0, "SELL": -1.0}.get(str(sig).upper(), 0.0)
    return 0.0


class MetaLabelingAgent:
    """Meta-model that predicts P(primary signal is correct)."""

    def __init__(self):
        self.model = None
        self.feature_names = []
        self._loaded = False

    # ── Feature construction ────────────────────────────────

    def build_meta_features(self, state: dict) -> dict:
        """Build features for the meta-model from TradingState or signal dict."""
        feat = {}

        # Primary signal characteristics
        signal = state.get("final_signal") or state.get("signal", "HOLD")
        feat["primary_signal"] = 1.0 if signal == "BUY" else -1.0

        conf = state.get("confidence", 0.5)
        feat["primary_confidence"] = conf / 100 if conf > 1 else conf

        agents_agree = state.get("agents_agree", 0)
        agents_total = state.get("agents_total", 0)
        feat["consensus_ratio"] = (
            agents_agree / agents_total if agents_total > 0 else 0.5
        )
        feat["consensus_level_num"] = CONSENSUS_MAP.get(
            state.get("consensus_level", "weak"), 1
        )

        # Vote breakdown per agent
        vb = state.get("vote_breakdown", {})
        if isinstance(vb, str):
            try:
                vb = json.loads(vb)
            except (json.JSONDecodeError, TypeError):
                vb = {}

        votes = []
        for agent in AGENT_NAMES:
            v = _vote_to_num(vb.get(agent, 0))
            feat[f"vote_{agent}"] = v
            votes.append(v)

        feat["vote_std"] = float(np.std(votes)) if votes else 0.0
        feat["max_bull_vote"] = float(max(votes)) if votes else 0.0
        feat["max_bear_vote"] = float(min(votes)) if votes else 0.0

        # Market context
        feat["regime_num"] = REGIME_MAP.get(
            state.get("market_regime", "neutral"), 0
        )

        # Pattern matching
        pat = state.get("pattern_data", {})
        feat["pattern_boost"] = state.get("pattern_boost", 0.0) or pat.get("boost", 0.0)
        feat["patterns_matched"] = (
            state.get("pattern_patterns_found", 0) or pat.get("patterns_matched", 0)
        )
        feat["best_similarity"] = (
            state.get("pattern_best_similarity", 0.0) or pat.get("best_similarity", 0.0)
        )

        return feat

    def _build_features_from_db_row(self, sig: dict, eval_row: dict) -> dict:
        """Build meta-features from a signals DB row + evaluation row."""
        feat = {}

        signal = sig.get("signal", "HOLD")
        feat["primary_signal"] = 1.0 if signal == "BUY" else -1.0

        conf = sig.get("confidence", 0.5)
        feat["primary_confidence"] = conf / 100 if conf > 1 else conf

        agents_agree = sig.get("agents_agree", 0) or 0
        agents_total = sig.get("agents_total", 0) or 0
        feat["consensus_ratio"] = (
            agents_agree / agents_total if agents_total > 0 else 0.5
        )
        feat["consensus_level_num"] = CONSENSUS_MAP.get(
            sig.get("consensus_level", "weak"), 1
        )

        # Vote breakdown
        vb = sig.get("vote_breakdown", {})
        if isinstance(vb, str):
            try:
                vb = json.loads(vb)
            except (json.JSONDecodeError, TypeError):
                vb = {}

        votes = []
        for agent in AGENT_NAMES:
            v = _vote_to_num(vb.get(agent, 0))
            feat[f"vote_{agent}"] = v
            votes.append(v)

        feat["vote_std"] = float(np.std(votes)) if votes else 0.0
        feat["max_bull_vote"] = float(max(votes)) if votes else 0.0
        feat["max_bear_vote"] = float(min(votes)) if votes else 0.0

        feat["regime_num"] = REGIME_MAP.get(
            sig.get("market_regime", "neutral"), 0
        )

        feat["pattern_boost"] = 0.0
        feat["patterns_matched"] = 0
        feat["best_similarity"] = 0.0

        return feat

    # ── Prediction ──────────────────────────────────────────

    def predict(self, state: dict) -> dict:
        """Predict probability that the primary signal is correct.

        If the model is not available, returns the original confidence
        unchanged (graceful degradation).
        """
        signal = state.get("final_signal") or state.get("proposed_signal", "HOLD")
        orig_conf = state.get("confidence", 0.5)
        orig_conf = orig_conf / 100 if orig_conf > 1 else orig_conf

        default = {
            "meta_probability": orig_conf,
            "meta_confidence": orig_conf,
            "meta_features_used": 0,
            "model_available": False,
        }

        if signal == "HOLD":
            return default

        # Load model if not loaded yet
        if not self._loaded:
            self._load_model()

        if self.model is None:
            return default

        try:
            feat = self.build_meta_features(state)
            X = pd.DataFrame([feat])[self.feature_names]
            prob = float(self.model.predict_proba(X)[0][1])

            return {
                "meta_probability": round(prob, 4),
                "meta_confidence": round(orig_conf * prob, 4),
                "meta_features_used": len(self.feature_names),
                "model_available": True,
            }
        except Exception as e:
            logger.warning("Meta-labeling predict error: %s", e)
            return default

    # ── Training ────────────────────────────────────────────

    def train(self) -> dict:
        """Train the meta-model using historical signals with triple barrier labels.

        Returns training metrics dict.
        """
        sb = _get_supabase()

        # Fetch signals that have barrier_label (from triple barrier evaluation)
        evals = (
            sb.table("signal_evaluations")
            .select("signal_id, ticker, signal_type, entry_date, barrier_label")
            .not_.is_("barrier_label", "null")
            .neq("barrier_label", 0)  # exclude neutral
            .execute()
        )

        if not evals.data or len(evals.data) < 20:
            msg = f"Not enough labeled samples ({len(evals.data) if evals.data else 0})"
            logger.warning("Meta-labeling train: %s", msg)
            return {
                "accuracy": 0.0, "precision": 0.0, "recall": 0.0,
                "n_samples": 0, "n_correct": 0, "n_incorrect": 0,
                "error": msg,
            }

        # Fetch corresponding signal details (vote_breakdown, etc.)
        signal_ids = [e["signal_id"] for e in evals.data]

        # Batch fetch signals (Supabase .in_() supports up to 100)
        all_signals = {}
        for i in range(0, len(signal_ids), 100):
            batch = signal_ids[i:i + 100]
            result = (
                sb.table("signals")
                .select("id, signal, confidence, consensus_level, "
                        "agents_agree, agents_total, vote_breakdown, "
                        "market_regime")
                .in_("id", batch)
                .execute()
            )
            for s in (result.data or []):
                all_signals[s["id"]] = s

        # Build training data
        rows = []
        targets = []
        dates = []

        for ev in evals.data:
            sig = all_signals.get(ev["signal_id"])
            if not sig:
                continue

            feat = self._build_features_from_db_row(sig, ev)
            rows.append(feat)

            # Target: did the primary signal direction match the barrier outcome?
            signal_type = ev["signal_type"]
            barrier = ev["barrier_label"]
            if signal_type == "BUY":
                target = 1 if barrier == 1 else 0
            else:  # SELL
                target = 1 if barrier == -1 else 0
            targets.append(target)

            # Parse entry_date for PurgedKFoldCV
            entry = ev.get("entry_date", "")
            try:
                dates.append(pd.Timestamp(entry))
            except Exception:
                dates.append(pd.Timestamp.now())

        if len(rows) < 20:
            msg = f"Not enough matched samples ({len(rows)})"
            logger.warning("Meta-labeling train: %s", msg)
            return {
                "accuracy": 0.0, "precision": 0.0, "recall": 0.0,
                "n_samples": len(rows), "n_correct": 0, "n_incorrect": 0,
                "error": msg,
            }

        X = pd.DataFrame(rows)
        y = np.array(targets)
        self.feature_names = list(X.columns)

        n_correct = int(y.sum())
        n_incorrect = len(y) - n_correct

        # Cross-validate with PurgedKFoldCV
        n_splits = min(5, len(X) // 5)
        if n_splits < 2:
            n_splits = 2

        pred_times = pd.Series(dates, index=range(len(dates)))
        # Eval horizon: 168h (7 days) for triple barrier
        eval_times = pred_times + pd.Timedelta(hours=168)

        cv = PurgedKFoldCV(n_splits=n_splits, embargo_pct=0.01)
        cv_accuracies = []
        cv_precisions = []
        cv_recalls = []

        try:
            for train_idx, test_idx in cv.split(
                X, pred_times=pred_times, eval_times=eval_times
            ):
                X_tr, X_te = X.iloc[train_idx], X.iloc[test_idx]
                y_tr, y_te = y[train_idx], y[test_idx]

                # Skip folds where one class is missing
                if len(np.unique(y_tr)) < 2 or len(np.unique(y_te)) < 2:
                    continue

                fold_model = XGBClassifier(
                    n_estimators=100, max_depth=3,
                    learning_rate=0.05, subsample=0.8,
                    use_label_encoder=False, eval_metric="logloss",
                    random_state=42, verbosity=0,
                )
                fold_model.fit(X_tr, y_tr)
                preds = fold_model.predict(X_te)

                cv_accuracies.append(accuracy_score(y_te, preds))
                cv_precisions.append(precision_score(y_te, preds, zero_division=0))
                cv_recalls.append(recall_score(y_te, preds, zero_division=0))
        except Exception as e:
            logger.warning("Meta-labeling CV failed: %s", e)

        # Train final model on all data
        self.model = XGBClassifier(
            n_estimators=100, max_depth=3,
            learning_rate=0.05, subsample=0.8,
            use_label_encoder=False, eval_metric="logloss",
            random_state=42, verbosity=0,
        )
        self.model.fit(X, y)

        avg_acc = float(np.mean(cv_accuracies)) if cv_accuracies else 0.0
        avg_prec = float(np.mean(cv_precisions)) if cv_precisions else 0.0
        avg_rec = float(np.mean(cv_recalls)) if cv_recalls else 0.0

        # Save model to Supabase
        metrics = {
            "accuracy": round(avg_acc, 4),
            "precision": round(avg_prec, 4),
            "recall": round(avg_rec, 4),
            "n_samples": len(X),
            "n_correct": n_correct,
            "n_incorrect": n_incorrect,
            "n_splits": n_splits,
        }
        self._save_model(metrics)

        logger.info(
            "Meta-model trained: acc=%.3f prec=%.3f rec=%.3f (%d samples)",
            avg_acc, avg_prec, avg_rec, len(X),
        )

        return metrics

    # ── Model persistence (Supabase) ────────────────────────

    def _save_model(self, metrics: dict):
        """Save the trained XGBoost model to Supabase as JSON."""
        if self.model is None:
            return
        try:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
                self.model.save_model(f.name)
            with open(f.name, "r") as f:
                model_json = json.load(f)
            os.unlink(f.name)

            sb = _get_supabase()
            sb.table("ml_models").upsert({
                "model_name": MODEL_NAME,
                "model_data": model_json,
                "feature_names": self.feature_names,
                "metrics": metrics,
                "n_samples": metrics.get("n_samples", 0),
                "trained_at": datetime.utcnow().isoformat(),
            }, on_conflict="model_name").execute()
            logger.info("Meta-model saved to Supabase")
        except Exception as e:
            logger.warning("Failed to save meta-model: %s", e)

    def _load_model(self):
        """Load the meta-model from Supabase."""
        self._loaded = True
        try:
            sb = _get_supabase()
            result = (
                sb.table("ml_models")
                .select("model_data, feature_names")
                .eq("model_name", MODEL_NAME)
                .maybe_single()
                .execute()
            )
            if not result.data:
                logger.info("No meta-model found in Supabase")
                return

            import tempfile
            model_data = result.data["model_data"]
            self.feature_names = result.data["feature_names"]

            with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
                json.dump(model_data, f)
                tmp_path = f.name

            self.model = XGBClassifier()
            self.model.load_model(tmp_path)
            os.unlink(tmp_path)

            logger.info("Meta-model loaded (%d features)", len(self.feature_names))
        except Exception as e:
            logger.warning("Failed to load meta-model: %s", e)
            self.model = None


# ── LangGraph node ──────────────────────────────────────────

def meta_labeling_node(state: TradingState) -> TradingState:
    """LangGraph node: apply meta-labeling to calibrate confidence."""
    signal = state.get("final_signal") or state.get("proposed_signal", "HOLD")

    if signal == "HOLD":
        state["meta_probability"] = 0.0
        state["meta_confidence"] = state.get("confidence", 0.0)
        state["meta_model_available"] = False
        return state

    agent = MetaLabelingAgent()
    result = agent.predict(state)

    state["meta_probability"] = result["meta_probability"]
    state["meta_confidence"] = result["meta_confidence"]
    state["meta_model_available"] = result["model_available"]

    if result["model_available"]:
        orig = state.get("confidence", 0.0)
        orig = orig / 100 if orig > 1 else orig
        state["confidence"] = result["meta_confidence"]
        state["reasoning"].append(
            f"MetaLabeling: {result['meta_probability']:.0%} prob. success "
            f"(confidence {orig:.0%} \u2192 {result['meta_confidence']:.0%} calibrata)"
        )
    else:
        state["reasoning"].append("MetaLabeling: modello non disponibile, confidence invariata")

    return state
