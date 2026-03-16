from agents import TradingState

WEIGHTS = {
    "sentiment":      0.22,
    "social":         0.08,
    "fundamental":    0.18,
    "technical":      0.15,
    "momentum":       0.12,
    "mean_reversion": 0.06,
    "ml_prediction":  0.11,
    "macro":          0.08,
}


def signal_to_num(signal: str) -> float:
    return {"BUY": 1.0, "SELL": -1.0,
            "HOLD": 0.0, "NEUTRAL": 0.0}.get(signal, 0.0)


def weighted_vote(state: TradingState) -> dict:
    sources = {
        "sentiment":      state.get("sentiment_summary", {}),
        "social":         state.get("social_analysis", {}),
        "fundamental":    state.get("fundamental_analysis", {}),
        "technical":      state.get("technical_analysis", {}),
        "momentum":       state.get("momentum_analysis", {}),
        "mean_reversion": state.get("mean_reversion_analysis", {}),
        "ml_prediction":  state.get("ml_prediction", {}),
        "macro":          state.get("macro_analysis", {}),
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


def weighted_signal_node(state: TradingState) -> TradingState:
    result = weighted_vote(state)
    state["proposed_signal"] = result["signal"]
    state["confidence"] = result["confidence"]
    state["reasoning"].append(
        f"WeightedVote: {result['signal']} "
        f"({result['confidence']:.0%}) | "
        f"consensus={result['consensus_level']} "
        f"({result['agents_agree']}/{result['agents_total']}) | "
        f"dominant={result['dominant_factor']}"
    )
    state["vote_breakdown"] = result
    return state
