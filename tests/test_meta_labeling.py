"""Tests for Meta-Labeling Agent."""

import numpy as np
import pytest

from agents.meta_labeling_agent import (
    MetaLabelingAgent,
    _vote_to_num,
    AGENT_NAMES,
    REGIME_MAP,
    CONSENSUS_MAP,
    meta_labeling_node,
)


# ── Helpers ──────────────────────────────────────────────────

def _make_state(**overrides):
    """Create a minimal TradingState-like dict."""
    state = {
        "ticker": "AAPL",
        "final_signal": "BUY",
        "proposed_signal": "BUY",
        "confidence": 0.65,
        "consensus_level": "moderate",
        "agents_agree": 7,
        "agents_total": 12,
        "vote_breakdown": {
            "sentiment": {"signal": "BUY"},
            "fundamental": {"signal": "BUY"},
            "momentum": {"signal": "SELL"},
            "technical": {"signal": "BUY"},
            "ml_prediction": {"signal": "HOLD"},
            "liquidity": {"signal": "BUY"},
            "options": {"signal": "HOLD"},
            "macro": {"signal": "BUY"},
            "intermarket": {"signal": "SELL"},
            "seasonal": {"signal": "BUY"},
            "institutional": {"signal": "BUY"},
            "mean_reversion": {"signal": "SELL"},
        },
        "market_regime": "bull",
        "pattern_boost": 0.15,
        "pattern_patterns_found": 3,
        "pattern_best_similarity": 0.82,
        "pattern_data": {},
        "reasoning": [],
        "meta_probability": 0.0,
        "meta_confidence": 0.0,
        "meta_model_available": False,
    }
    state.update(overrides)
    return state


# ── TestVoteEncoding ─────────────────────────────────────────

class TestVoteEncoding:
    def test_string_buy(self):
        assert _vote_to_num("BUY") == 1.0

    def test_string_sell(self):
        assert _vote_to_num("SELL") == -1.0

    def test_string_hold(self):
        assert _vote_to_num("HOLD") == 0.0

    def test_dict_signal(self):
        assert _vote_to_num({"signal": "BUY"}) == 1.0

    def test_numeric(self):
        assert _vote_to_num(0.5) == 0.5

    def test_none(self):
        assert _vote_to_num(None) == 0.0


# ── TestBuildMetaFeatures ────────────────────────────────────

class TestBuildMetaFeatures:
    def test_returns_dict(self):
        agent = MetaLabelingAgent()
        feat = agent.build_meta_features(_make_state())
        assert isinstance(feat, dict)

    def test_has_primary_signal(self):
        agent = MetaLabelingAgent()
        feat = agent.build_meta_features(_make_state(final_signal="BUY"))
        assert feat["primary_signal"] == 1.0

        feat = agent.build_meta_features(_make_state(final_signal="SELL"))
        assert feat["primary_signal"] == -1.0

    def test_has_all_agent_votes(self):
        agent = MetaLabelingAgent()
        feat = agent.build_meta_features(_make_state())
        for name in AGENT_NAMES:
            assert f"vote_{name}" in feat

    def test_consensus_ratio(self):
        agent = MetaLabelingAgent()
        feat = agent.build_meta_features(_make_state(agents_agree=9, agents_total=12))
        assert feat["consensus_ratio"] == pytest.approx(0.75)

    def test_regime_encoding(self):
        for regime, expected in REGIME_MAP.items():
            agent = MetaLabelingAgent()
            feat = agent.build_meta_features(_make_state(market_regime=regime))
            assert feat["regime_num"] == expected

    def test_vote_std_positive(self):
        agent = MetaLabelingAgent()
        feat = agent.build_meta_features(_make_state())
        # With mixed BUY/SELL/HOLD votes, std should be > 0
        assert feat["vote_std"] > 0

    def test_pattern_features(self):
        agent = MetaLabelingAgent()
        feat = agent.build_meta_features(_make_state(
            pattern_boost=0.15, pattern_patterns_found=5,
            pattern_best_similarity=0.9
        ))
        assert feat["pattern_boost"] == 0.15
        assert feat["patterns_matched"] == 5
        assert feat["best_similarity"] == 0.9

    def test_feature_count(self):
        agent = MetaLabelingAgent()
        feat = agent.build_meta_features(_make_state())
        # 4 signal + 12 votes + 3 vote stats + 1 regime + 3 pattern = 23
        assert len(feat) == 23


# ── TestPredict ──────────────────────────────────────────────

class TestPredict:
    def test_hold_returns_default(self):
        agent = MetaLabelingAgent()
        result = agent.predict(_make_state(final_signal="HOLD"))
        assert result["model_available"] is False

    def test_no_model_passes_through(self):
        agent = MetaLabelingAgent()
        state = _make_state(confidence=0.70)
        result = agent.predict(state)
        assert result["model_available"] is False
        assert result["meta_confidence"] == pytest.approx(0.70)

    def test_confidence_above_one_normalized(self):
        agent = MetaLabelingAgent()
        state = _make_state(confidence=70)  # percentage, not fraction
        result = agent.predict(state)
        assert result["meta_confidence"] == pytest.approx(0.70)


# ── TestGracefulDegradation ──────────────────────────────────

class TestGracefulDegradation:
    def test_node_without_model(self):
        """meta_labeling_node should not crash without a trained model."""
        state = _make_state()
        result = meta_labeling_node(state)
        assert result["meta_model_available"] is False
        assert result["meta_confidence"] == result["confidence"]
        assert any("MetaLabeling" in r for r in result["reasoning"])

    def test_node_hold_skips(self):
        state = _make_state(final_signal="HOLD", proposed_signal="HOLD")
        result = meta_labeling_node(state)
        assert result["meta_probability"] == 0.0
        assert result["meta_model_available"] is False
