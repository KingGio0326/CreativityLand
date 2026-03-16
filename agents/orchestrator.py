from langgraph.graph import StateGraph, END
from agents import TradingState
from agents.scraper_agent import scraper_agent
from agents.sentiment_agent import sentiment_agent
from agents.research_agent import research_agent
from agents.risk_agent import risk_agent
from agents.fundamental_agent import fundamental_agent_node
from agents.technical_agent import technical_agent_node
from agents.momentum_agent import momentum_agent_node
from agents.macro_agent import macro_agent_node
from agents.signal_agent import signal_agent
from agents.critic_agent import critic_agent


def should_retry(state: TradingState) -> str:
    if not state["final_signal"] and state["retry_count"] < 2:
        return "sentiment"
    return END


def build_graph():
    graph = StateGraph(TradingState)
    graph.add_node("scraper", scraper_agent)
    graph.add_node("sentiment", sentiment_agent)
    graph.add_node("research", research_agent)
    graph.add_node("risk", risk_agent)
    graph.add_node("fundamental", fundamental_agent_node)
    graph.add_node("technical", technical_agent_node)
    graph.add_node("momentum", momentum_agent_node)
    graph.add_node("macro", macro_agent_node)
    graph.add_node("signal", signal_agent)
    graph.add_node("critic", critic_agent)
    graph.set_entry_point("scraper")
    graph.add_edge("scraper", "sentiment")
    graph.add_edge("sentiment", "research")
    graph.add_edge("research", "risk")
    graph.add_edge("risk", "fundamental")
    graph.add_edge("fundamental", "technical")
    graph.add_edge("technical", "momentum")
    graph.add_edge("momentum", "macro")
    graph.add_edge("macro", "signal")
    graph.add_edge("signal", "critic")
    graph.add_conditional_edges("critic", should_retry)
    return graph.compile()


class TradingOrchestrator:
    def __init__(self):
        self.graph = build_graph()

    def decide(self, ticker: str) -> dict:
        state = TradingState(
            ticker=ticker, articles=[],
            sentiment_summary={}, historical_context="",
            risk_assessment={}, proposed_signal="",
            confidence=0.0, reasoning=[], final_signal="",
            retry_count=0, macro_analysis={},
            macro_adjusted=False, technical_analysis={},
            fundamental_analysis={}, momentum_analysis={},
            mean_reversion_analysis={}, ml_prediction={},
            social_analysis={}
        )
        result = self.graph.invoke(state)
        return {
            "ticker": ticker,
            "signal": result["final_signal"] or "HOLD",
            "confidence": result["confidence"],
            "reasoning": result["reasoning"],
            "risk_level": result["risk_assessment"].get("risk_level"),
            "articles_analyzed": len(result["articles"])
        }
