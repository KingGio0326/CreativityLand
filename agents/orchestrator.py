import logging

from langgraph.graph import StateGraph, END
from agents import TradingState
from engine.regime_detector import detect_regime
from engine.utils import sanitize_for_json
from agents.scraper_agent import scraper_agent
from agents.social_sentiment_agent import social_agent_node
from agents.sentiment_agent import sentiment_agent
from agents.research_agent import research_agent
from agents.fundamental_agent import fundamental_agent_node
from agents.technical_agent import technical_agent_node
from agents.momentum_agent import momentum_agent_node
from agents.mean_reversion_agent import mean_reversion_agent_node
from agents.ml_prediction_agent import ml_agent_node
from agents.risk_agent import risk_agent
from agents.macro_agent import macro_agent_node
from agents.options_agent import options_agent
from agents.liquidity_agent import liquidity_agent
from agents.intermarket_agent import intermarket_agent
from agents.seasonal_agent import seasonal_agent
from agents.institutional_agent import institutional_agent
from agents.weighted_signal_agent import weighted_signal_node
from agents.critic_agent import critic_agent


_regime_logger = logging.getLogger("orchestrator")


def regime_node(state: TradingState) -> TradingState:
    """Detect market regime and store in state."""
    try:
        result = detect_regime()
        state["market_regime"] = result["regime"]
        state["regime_confidence"] = result["confidence"]
        state["reasoning"].append(
            f"RegimeDetector: {result['regime'].upper()} "
            f"({result['confidence']:.0%})"
            + (f" -- {result.get('reasoning', '')}" if result.get("reasoning") else "")
        )
    except Exception as e:
        _regime_logger.warning("Regime detection failed: %s", e)
        state["market_regime"] = "neutral"
        state["regime_confidence"] = 0.0
        state["reasoning"].append("RegimeDetector: fallback neutral (error)")
    return state


def should_retry(state: TradingState) -> str:
    if not state["final_signal"] and state["retry_count"] < 2:
        return "sentiment"
    return END


def build_graph():
    g = StateGraph(TradingState)
    # Nodi
    g.add_node("regime",         regime_node)
    g.add_node("scraper",        scraper_agent)
    g.add_node("social",         social_agent_node)
    g.add_node("sentiment",      sentiment_agent)
    g.add_node("research",       research_agent)
    g.add_node("fundamental",    fundamental_agent_node)
    g.add_node("technical",      technical_agent_node)
    g.add_node("options",        options_agent)
    g.add_node("momentum",       momentum_agent_node)
    g.add_node("mean_reversion", mean_reversion_agent_node)
    g.add_node("ml",             ml_agent_node)
    g.add_node("risk",           risk_agent)
    g.add_node("liquidity",      liquidity_agent)
    g.add_node("macro",          macro_agent_node)
    g.add_node("intermarket",    intermarket_agent)
    g.add_node("seasonal",       seasonal_agent)
    g.add_node("institutional",  institutional_agent)
    g.add_node("weighted",       weighted_signal_node)
    g.add_node("critic",         critic_agent)
    # Edges
    g.set_entry_point("regime")
    g.add_edge("regime",         "scraper")
    g.add_edge("scraper",        "social")
    g.add_edge("social",         "sentiment")
    g.add_edge("sentiment",      "research")
    g.add_edge("research",       "fundamental")
    g.add_edge("fundamental",    "technical")
    g.add_edge("technical",      "options")
    g.add_edge("options",        "momentum")
    g.add_edge("momentum",       "mean_reversion")
    g.add_edge("mean_reversion", "ml")
    g.add_edge("ml",             "risk")
    g.add_edge("risk",           "liquidity")
    g.add_edge("liquidity",      "macro")
    g.add_edge("macro",          "intermarket")
    g.add_edge("intermarket",    "seasonal")
    g.add_edge("seasonal",       "institutional")
    g.add_edge("institutional",  "weighted")
    g.add_edge("weighted",       "critic")
    g.add_conditional_edges("critic", should_retry)
    return g.compile()


class TradingOrchestrator:
    def __init__(self):
        self.graph = build_graph()

    def decide(self, ticker: str) -> dict:
        # Detect regime first (cached 6h, fast)
        regime = "neutral"
        regime_conf = 0.0
        try:
            regime_result = detect_regime()
            regime = regime_result.get("regime", "neutral")
            regime_conf = regime_result.get("confidence", 0.0)
        except Exception as e:
            _regime_logger.warning("Pre-graph regime detection failed: %s", e)

        # Fetch pattern matching data with regime filter
        pattern_signal = "HOLD"
        pattern_found = 0
        pattern_similarity = 0.0
        pattern_regime_info = {}
        try:
            from engine.pattern_matcher import PatternMatcher
            pm = PatternMatcher()
            pr = pm.find_similar_patterns(
                ticker, regime_filter=regime,
            )
            if "analysis" in pr:
                rec = pr["analysis"].get("recommendation", {})
                pattern_signal = rec.get("signal", "HOLD")
                pattern_found = pr["analysis"].get("patterns_found") or 0
                pattern_similarity = pr["analysis"].get("best_similarity") or 0.0
                pattern_regime_info = {
                    "regime_filter": pr["analysis"].get("regime_filter"),
                    "regime_filtered_count": pr["analysis"].get("regime_filtered_count", 0),
                    "total_unfiltered_count": pr["analysis"].get("total_unfiltered_count", 0),
                    "used_fallback": pr["analysis"].get("used_fallback", False),
                }
        except Exception as e:
            _regime_logger.warning(
                "Pattern matching failed for %s: %s", ticker, e
            )

        state = TradingState(
            ticker=ticker, articles=[],
            sentiment_summary={}, historical_context="",
            risk_assessment={}, proposed_signal="",
            confidence=0.0, reasoning=[], final_signal="",
            retry_count=0, macro_analysis={},
            macro_adjusted=False, technical_analysis={},
            fundamental_analysis={}, momentum_analysis={},
            mean_reversion_analysis={}, ml_prediction={},
            social_analysis={}, vote_breakdown={},
            pattern_signal=pattern_signal,
            pattern_patterns_found=pattern_found,
            pattern_best_similarity=pattern_similarity,
            pattern_regime_info=pattern_regime_info,
            pattern_boost=0.0,
            rate_direction="unknown",
            market_regime=regime,
            regime_confidence=regime_conf,
        )
        result = self.graph.invoke(state)
        vb = result.get("vote_breakdown", {})

        # Pattern prediction label for tracking
        if pattern_signal == "BUY":
            pat_prediction = "bullish"
        elif pattern_signal == "SELL":
            pat_prediction = "bearish"
        else:
            pat_prediction = "neutral"

        return sanitize_for_json({
            "ticker": ticker,
            "signal": result["final_signal"] or "HOLD",
            "confidence": result["confidence"],
            "consensus_level": vb.get("consensus_level", "?"),
            "agents_agree": vb.get("agents_agree", 0),
            "agents_total": vb.get("agents_total", 0),
            "dominant_factor": vb.get("dominant_factor", "?"),
            "vote_breakdown": vb.get("vote_breakdown", {}),
            "risk_level": result["risk_assessment"].get(
                "risk_level", "?"
            ),
            "articles_analyzed": len(result["articles"]),
            "reasoning": result["reasoning"],
            "market_regime": result.get("market_regime", regime),
            "regime_confidence": result.get("regime_confidence", regime_conf),
            "pattern_data": {
                "prediction": pat_prediction,
                "boost": result.get("pattern_boost", 0.0),
                "patterns_matched": pattern_found,
                "best_similarity": pattern_similarity,
                "regime_at_signal": regime,
                "regime_filtered": bool(
                    pattern_regime_info.get("regime_filter")
                    and pattern_regime_info["regime_filter"] != "neutral"
                ),
            },
        })
