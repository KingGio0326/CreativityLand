import os
import json
import anthropic
from agents import TradingState

MACRO_KEYWORDS = [
    "war", "guerra", "missile", "sanctions", "sanzioni",
    "invasion", "invasione", "conflict", "conflitto",
    "oil embargo", "embargo", "NATO", "Fed rate",
    "interest rate", "inflation", "inflazione",
    "recession", "recessione", "bank crisis",
    "election", "elezioni", "tariff", "dazi"
]


class MacroAgent:
    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        self.enabled = bool(api_key)
        if self.enabled:
            self.client = anthropic.Anthropic(api_key=api_key)
        self.model = "claude-haiku-4-5-20251001"

    def is_macro_relevant(self, articles: list[dict]) -> bool:
        count = sum(
            1 for a in articles
            if any(
                kw.lower() in (a.get("title", "") +
                               a.get("content", "")).lower()
                for kw in MACRO_KEYWORDS
            )
        )
        return count >= 2

    def analyze_causal_impact(
        self, ticker: str, articles: list[dict],
        research_context: str = "",
        research_papers_count: int = 0,
    ) -> dict:
        if not self.enabled:
            return {
                "has_macro_impact": False,
                "impact_direction": "neutral",
                "impact_magnitude": "low",
                "causal_chain": "ANTHROPIC_API_KEY non configurata",
                "confidence": 0.0,
                "relevant_events": [],
                "time_horizon": "short_term",
                "signal": "HOLD"
            }
        top = articles[:5]
        prompt = f"""Sei un analista finanziario esperto.
Analizza questi articoli e determina l'impatto sul ticker {ticker}.

Articoli:
{json.dumps([{
    "title": a["title"],
    "content": a.get("content", "")[:300],
} for a in top], indent=2, ensure_ascii=False)}

Rispondi SOLO con JSON valido, niente altro:
{{
  "has_macro_impact": true/false,
  "impact_direction": "positive"|"negative"|"neutral",
  "impact_magnitude": "high"|"medium"|"low",
  "causal_chain": "max 2 righe spiegazione",
  "confidence": 0.0-1.0,
  "relevant_events": ["lista eventi"],
  "time_horizon": "immediate"|"short_term"|"long_term"
}}"""
        if research_context and research_papers_count > 0:
            prompt += f"""

CONTESTO LETTERATURA ACCADEMICA RECENTE:
{research_context}

Considera questi insights accademici nella tua analisi macro,
specialmente se confermano o contraddicono i segnali di mercato.
"""
        try:
            response = self.client.messages.create(
                model=self.model, max_tokens=500,
                messages=[{"role": "user", "content": prompt}]
            )
            text = response.content[0].text.strip()
            text = text.replace("```json", "").replace("```", "").strip()
            # Find JSON object in response
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                text = text[start:end]
            result = json.loads(text)
            # Ensure required keys
            result.setdefault("has_macro_impact", False)
            result.setdefault("impact_direction", "neutral")
            result.setdefault("impact_magnitude", "low")
            result.setdefault("causal_chain", "")
            result.setdefault("confidence", 0.0)
            result.setdefault("relevant_events", [])
            result.setdefault("time_horizon", "short_term")
            # Derive signal from direction
            direction = result.get("impact_direction", "neutral")
            result.setdefault("signal",
                "BUY" if direction == "positive"
                else "SELL" if direction == "negative"
                else "HOLD"
            )
            return result
        except Exception as e:
            return {
                "has_macro_impact": False,
                "impact_direction": "neutral",
                "impact_magnitude": "low",
                "causal_chain": f"Errore analisi: {e}",
                "confidence": 0.0,
                "relevant_events": [],
                "time_horizon": "short_term",
                "signal": "HOLD"
            }

    def get_adjusted_signal(
        self, original_signal: str,
        original_confidence: float,
        macro: dict
    ) -> tuple[str, float, str]:
        if not macro.get("has_macro_impact"):
            return original_signal, original_confidence, "no macro impact"
        magnitude = macro.get("impact_magnitude", "low")
        direction = macro.get("impact_direction", "neutral")
        macro_signal = (
            "BUY" if direction == "positive"
            else "SELL" if direction == "negative"
            else "HOLD"
        )
        macro_conf = macro.get("confidence", 0.5) * 0.9
        if magnitude == "high":
            return (macro_signal, macro_conf,
                    f"macro override: {macro['causal_chain']}")
        elif magnitude == "medium":
            if macro_signal == original_signal:
                return (original_signal,
                        min(original_confidence * 1.1, 1.0),
                        "macro confirms signal")
            else:
                return ("HOLD",
                        original_confidence * 0.7,
                        f"macro conflict: {macro['causal_chain']}")
        else:
            adj = -0.05 if macro_signal != original_signal else 0
            return (original_signal,
                    original_confidence + adj,
                    "macro minor adjustment")


def macro_agent_node(state: TradingState) -> TradingState:
    agent = MacroAgent()

    # Compute current rate direction and store in state
    try:
        from engine.pattern_extractor import get_rate_direction
        from datetime import datetime
        current_rate_dir = get_rate_direction(datetime.now())
    except Exception:
        current_rate_dir = "unknown"
    state["rate_direction"] = current_rate_dir

    research_context = state.get("historical_context", "")
    research_papers_count = state.get("research_papers_count", 0)
    if agent.is_macro_relevant(state["articles"]):
        analysis = agent.analyze_causal_impact(
            state["ticker"], state["articles"],
            research_context=research_context,
            research_papers_count=research_papers_count,
        )
        state["macro_analysis"] = analysis
        state["reasoning"].append(
            f"MacroAgent: {analysis['causal_chain']} "
            f"(magnitude={analysis['impact_magnitude']}, "
            f"direction={analysis['impact_direction']})"
        )
        if research_context and research_papers_count > 0:
            state["reasoning"].append(
                f"MacroAgent: integrato insight da {research_papers_count} paper arXiv"
            )
    else:
        state["macro_analysis"] = {
            "has_macro_impact": False,
            "impact_direction": "neutral",
            "impact_magnitude": "low",
            "confidence": 0.0,
            "causal_chain": "Nessun evento macro rilevante",
            "relevant_events": [],
            "time_horizon": "short_term",
            "signal": "HOLD"
        }
        state["reasoning"].append(
            "MacroAgent: nessun evento geopolitico/macro rilevato"
        )
    if current_rate_dir != "unknown":
        state["reasoning"].append(
            f"MacroAgent: Rate direction: {current_rate_dir}"
        )
    return state
