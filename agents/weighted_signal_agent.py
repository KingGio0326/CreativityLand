from agents import TradingState

WEIGHTS = {
    "sentiment":      0.22,
    "fundamental":    0.18,
    "momentum":       0.12,
    "technical":      0.11,
    "ml_prediction":  0.11,
    "liquidity":      0.08,
    "macro":          0.04,
    "mean_reversion": 0.06,
    "options":        0.06,
    "intermarket":    0.04,
}


def signal_to_num(signal: str) -> float:
    return {"BUY": 1.0, "SELL": -1.0,
            "HOLD": 0.0, "NEUTRAL": 0.0}.get(signal, 0.0)


def _liquidity_as_source(state: TradingState) -> dict:
    """Convert liquidity agent output to standard source format."""
    sig = state.get("liquidity_signal")
    if not sig:
        return {}
    return {
        "signal": sig,
        "confidence": state.get("liquidity_confidence", 20) / 100,
        "available": True,
    }


def _options_as_source(state: TradingState) -> dict:
    """Convert options agent output to standard source format."""
    sig = state.get("options_signal")
    if not sig:
        return {}
    return {
        "signal": sig,
        "confidence": state.get("options_confidence", 0) / 100,
        "available": True,
    }


def _intermarket_as_source(state: TradingState) -> dict:
    """Convert intermarket agent output to standard source format."""
    sig = state.get("intermarket_signal")
    if not sig:
        return {}
    return {
        "signal": sig,
        "confidence": state.get("intermarket_confidence", 0) / 100,
        "available": True,
    }


def weighted_vote(state: TradingState) -> dict:
    sources = {
        "sentiment":      state.get("sentiment_summary", {}),
        "fundamental":    state.get("fundamental_analysis", {}),
        "technical":      state.get("technical_analysis", {}),
        "momentum":       state.get("momentum_analysis", {}),
        "mean_reversion": state.get("mean_reversion_analysis", {}),
        "ml_prediction":  state.get("ml_prediction", {}),
        "liquidity":      _liquidity_as_source(state),
        "options":        _options_as_source(state),
        "macro":          state.get("macro_analysis", {}),
        "intermarket":    _intermarket_as_source(state),
    }

    total_weight = 0
    weighted_sum = 0
    vote_breakdown = {}
    skipped = []

    for name, data in sources.items():
        if not data:
            skipped.append(name)
            continue
        if not data.get("available", True):
            skipped.append(name)
            continue
        if name == "macro" and not data.get("has_macro_impact"):
            skipped.append(name)
            continue

        sig = data.get("signal", "HOLD")
        conf = data.get("confidence", 0.5)
        w = WEIGHTS[name]

        vote_breakdown[name] = {
            "signal": sig, "confidence": conf
        }
        weighted_sum += signal_to_num(sig) * conf * w
        total_weight += w

    if total_weight == 0:
        return {
            "signal": "HOLD", "confidence": 0.0,
            "score": 0.0, "consensus_level": "weak",
            "agents_agree": 0, "agents_total": 0,
            "dominant_factor": "none",
            "vote_breakdown": {}
        }

    final_score = weighted_sum / total_weight

    if final_score > 0.15:
        final_signal = "BUY"
    elif final_score < -0.15:
        final_signal = "SELL"
    else:
        final_signal = "HOLD"

    confidence = min(abs(final_score) / 0.5, 1.0)

    # Consensus level
    agreeing = sum(
        1 for v in vote_breakdown.values()
        if v["signal"] == final_signal
        or (final_signal == "HOLD"
            and v["signal"] in ["HOLD", "NEUTRAL"])
    )
    total_voting = len(vote_breakdown)

    if total_voting > 0:
        ratio = agreeing / total_voting
        consensus = ("strong" if ratio >= 0.70
                     else "moderate" if ratio >= 0.50
                     else "weak")
    else:
        consensus = "weak"

    # Weak consensus -> forza HOLD
    if consensus == "weak":
        final_signal = "HOLD"
        confidence *= 0.6

    # Dominant factor
    dominant = max(
        vote_breakdown.items(),
        key=lambda x: WEIGHTS.get(x[0], 0) * x[1]["confidence"],
        default=("none", {})
    )[0] if vote_breakdown else "none"

    return {
        "signal": final_signal,
        "confidence": round(confidence, 3),
        "score": round(final_score, 4),
        "consensus_level": consensus,
        "agents_agree": agreeing,
        "agents_total": total_voting,
        "dominant_factor": dominant,
        "vote_breakdown": vote_breakdown
    }


def pattern_multiplier(
    pipeline_signal: str,
    pattern_signal: str,
    patterns_found: int,
    similarity: float,
) -> float:
    """Adjust confidence based on pattern matching agreement."""
    if patterns_found < 5 or similarity < 0.75:
        return 1.0
    if pattern_signal == "HOLD":
        return 1.0
    if pipeline_signal == pattern_signal:
        boost = 1.0 + (0.15 * min(similarity, 1.0))
        return round(boost, 3)
    else:
        penalty = 1.0 - (0.15 * min(similarity, 1.0))
        return round(penalty, 3)


def research_confidence_modifier(
    research_context: str,
    pipeline_signal: str,
) -> float:
    """Return a confidence multiplier based on how much
    academic literature supports or contradicts the signal."""
    if not research_context or len(research_context) < 50:
        return 1.0

    context_lower = research_context.lower()

    confirms = any(word in context_lower for word in [
        "conferma", "supporta", "concorda", "bullish",
        "confirms", "supports", "agrees", "positive",
    ])

    contradicts = any(word in context_lower for word in [
        "smentisce", "contraddice", "bearish", "negativo",
        "contradicts", "opposes", "negative", "against",
    ])

    if confirms and not contradicts:
        return 1.05
    elif contradicts and not confirms:
        return 0.95
    else:
        return 1.0


def weighted_signal_node(state: TradingState) -> TradingState:
    result = weighted_vote(state)

    # Apply pattern matching multiplier
    pat_signal = state.get("pattern_signal", "HOLD")
    pat_found = state.get("pattern_patterns_found", 0)
    pat_sim = state.get("pattern_best_similarity", 0.0)

    mult = pattern_multiplier(
        result["signal"], pat_signal, pat_found, pat_sim
    )
    base_confidence = result["confidence"]
    final_confidence = min(base_confidence * mult, 1.0)

    # Apply research context modifier
    research_context = state.get("historical_context", "")
    research_mod = research_confidence_modifier(
        research_context, result["signal"]
    )
    final_confidence = min(final_confidence * research_mod, 1.0)

    state["proposed_signal"] = result["signal"]
    state["confidence"] = round(final_confidence, 3)
    state["reasoning"].append(
        f"WeightedVote: {result['signal']} "
        f"({final_confidence:.0%}) | "
        f"consensus={result['consensus_level']} "
        f"({result['agents_agree']}/{result['agents_total']}) | "
        f"dominant={result['dominant_factor']}"
    )

    if mult > 1.0:
        state["reasoning"].append(
            f"PatternMatching: CONFERMA segnale "
            f"(similarity={pat_sim:.2f}, "
            f"boost=+{(mult - 1) * 100:.0f}%)"
        )
    elif mult < 1.0:
        state["reasoning"].append(
            f"PatternMatching: SMENTISCE segnale "
            f"(similarity={pat_sim:.2f}, "
            f"penalita=-{(1 - mult) * 100:.0f}%)"
        )

    if research_mod > 1.0:
        state["reasoning"].append(
            "ResearchAgent: letteratura accademica CONFERMA il segnale (+5%)"
        )
    elif research_mod < 1.0:
        state["reasoning"].append(
            "ResearchAgent: letteratura accademica SMENTISCE il segnale (-5%)"
        )

    state["vote_breakdown"] = result
    return state
