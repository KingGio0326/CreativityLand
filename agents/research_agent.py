import logging
import os

from engine.arxiv_search import search_for_context
from engine.llm_client import call_llm

logger = logging.getLogger("research_agent")


class ResearchAgent:

    def __init__(self):
        self.enabled = bool(os.getenv("OPENROUTER_API_KEY"))

    def analyze(self, state: dict) -> dict:
        ticker = state.get("ticker", "")
        signal = state.get("pipeline_signal", "HOLD")
        regime = state.get("market_regime", "unknown")
        sentiment_score = state.get("sentiment_score", 0)

        # Costruisci contesto agenti
        agents_context = {
            "mean_reversion_active": abs(state.get("zscore", 0)) > 1.0,
            "technical_bearish": state.get("technical_signal", "") == "SELL",
        }

        # Cerca paper rilevanti su arXiv
        papers = search_for_context(ticker, signal, regime, agents_context)

        if not papers:
            state["historical_context"] = "Nessun paper arXiv trovato."
            state["research_papers_count"] = 0
            state["reasoning"].append(
                "ResearchAgent: nessun paper trovato su arXiv"
            )
            return state

        # Costruisci prompt per Claude
        papers_text = "\n\n".join([
            f"PAPER {i + 1}: {p['title']}\n"
            f"Data: {p['published']}\n"
            f"Abstract: {p['abstract']}"
            for i, p in enumerate(papers)
        ])

        prompt = (
            "Sei un analista quantitativo. Analizza questi paper accademici "
            "recenti da arXiv nel contesto di una decisione di trading.\n\n"
            "CONTESTO ATTUALE:\n"
            f"- Ticker: {ticker}\n"
            f"- Segnale pipeline: {signal}\n"
            f"- Regime di mercato: {regime}\n"
            f"- Sentiment score: {sentiment_score:.3f}\n\n"
            f"PAPER TROVATI:\n{papers_text}\n\n"
            "Rispondi in modo conciso con:\n"
            f"1. INSIGHT CHIAVE: cosa dicono questi paper che è rilevante per {ticker} oggi?\n"
            f"2. CONFERMA O SMENTISCE il segnale {signal}?\n"
            "3. SUGGERIMENTO PARAMETRI: c'è qualcosa nei paper che suggerisce "
            "di aggiustare RSI threshold, finestra temporale, o altri parametri?\n\n"
            "Massimo 150 parole. Sii specifico e actionable."
        )

        research_context = ""
        try:
            if not self.enabled:
                raise ValueError("OPENROUTER_API_KEY non configurata")
            research_context = call_llm(
                prompt=prompt,
                system="Sei un analista quantitativo. Sintetizza questi paper arXiv in insight concreti per il trading.",
                model="google/gemini-flash-2.0",
                max_tokens=300,
                temperature=0.2,
            )
        except Exception as e:
            logger.error("ResearchAgent LLM error: %s", e)
            research_context = f"Errore LLM: {e}"

        logger.info("ResearchAgent: analizzati %d paper arXiv", len(papers))

        state["historical_context"] = research_context
        state["research_papers_count"] = len(papers)
        state["research_papers"] = [
            {"title": p["title"], "url": p["url"]} for p in papers
        ]
        state["reasoning"].append(
            f"ResearchAgent: {len(papers)} paper arXiv analizzati. "
            f"{research_context[:120]}..."
        )
        return state


def research_agent(state):
    """Node function compatible with the orchestrator graph."""
    agent = ResearchAgent()
    return agent.analyze(state)
