from langgraph.graph import StateGraph, END
from agents import TradingState
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
from agents.liquidity_agent import liquidity_agent
from agents.weighted_signal_agent import weighted_signal_node
from agents.critic_agent import critic_agent


def should_retry(state: TradingState) -> str:
    if not state["final_signal"] and state["retry_count"] < 2:
        return "sentiment"
    return END


def build_graph():
    g = StateGraph(TradingState)
    # Nodi
    g.add_node("scraper",        scraper_agent)
    g.add_node("social",         social_agent_node)
    g.add_node("sentiment",      sentiment_agent)
    g.add_node("research",       research_agent)
    g.add_node("fundamental",    fundamental_agent_node)
    g.add_node("technical",      technical_agent_node)
    g.add_node("momentum",       momentum_agent_node)
    g.add_node("mean_reversion", mean_reversion_agent_node)
    g.add_node("ml",             ml_agent_node)
    g.add_node("risk",           risk_agent)
    g.add_node("liquidity",      liquidity_agent)
    g.add_node("macro",          macro_agent_node)
    g.add_node("weighted",       weighted_signal_node)
    g.add_node("critic",         critic_agent)
    # Edges
    g.set_entry_point("scraper")
    g.add_edge("scraper",        "social")
    g.add_edge("social",         "sentiment")
    g.add_edge("sentiment",      "research")
    g.add_edge("research",       "fundamental")
    g.add_edge("fundamental",    "technical")
    g.add_edge("technical",      "momentum")
    g.add_edge("momentum",       "mean_reversion")
    g.add_edge("mean_reversion", "ml")
    g.add_edge("ml",             "risk")
    g.add_edge("risk",           "liquidity")
    g.add_edge("liquidity",      "macro")
    g.add_edge("macro",          "weighted")
    g.add_edge("weighted",       "critic")
    g.add_conditional_edges("critic", should_retry)
    return g.compile()


class TradingOrchestrator:
    def __init__(self):
        self.graph = build_graph()

    def decide(self, ticker: str) -> dict:
        # Fetch pattern matching data before running the graph
        pattern_signal = "HOLD"
        pattern_found = 0
        pattern_similarity = 0.0
        try:
            from engine.pattern_matcher import PatternMatcher
            pm = PatternMatcher()
            pr = pm.find_similar_patterns(ticker)
            if "analysis" in pr:
                rec = pr["analysis"].get("recommendation", {})
                pattern_signal = rec.get("signal", "HOLD")
                pattern_found = pr["analysis"].get("patterns_found", 0)
                pattern_similarity = pr["analysis"].get("best_similarity", 0)
        except Exception as e:
            import logging
            logging.getLogger("orchestrator").warning(
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
        )
        result = self.graph.invoke(state)
        vb = result.get("vote_breakdown", {})
        return {
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
            "reasoning": result["reasoning"]
        }
