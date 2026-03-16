def critic_agent(state):
    signal = state.get("proposed_signal", "HOLD")
    confidence = state.get("confidence", 0.0)
    risk = state.get("risk_assessment", {})
    articles_count = len(state.get("articles", []))
    retry = state.get("retry_count", 0)
    reject_reasons = []
    if confidence < 0.4:
        reject_reasons.append(f"confidence {confidence:.0%} < 40%")
    if articles_count < 3:
        reject_reasons.append(f"solo {articles_count} articoli")
    if (risk.get("risk_level") == "HIGH"
            and signal == "BUY"
            and retry < 2):
        reject_reasons.append("HIGH risk + BUY pericoloso")
    if reject_reasons and retry < 2:
        state["retry_count"] = retry + 1
        state["proposed_signal"] = ""
        state["reasoning"].append(
            f"CriticAgent: RIGETTATO (retry {retry+1}/2) — "
            + ", ".join(reject_reasons)
        )
    else:
        state["final_signal"] = signal or "HOLD"
        state["reasoning"].append(
            f"CriticAgent: APPROVATO → {state['final_signal']} "
            f"({confidence:.0%})"
        )
    return state
