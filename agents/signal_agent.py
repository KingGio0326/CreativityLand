def signal_agent(state):
    sentiment = state.get("sentiment_summary", {})
    risk = state.get("risk_assessment", {})
    s_signal = sentiment.get("signal", "HOLD")
    s_conf = sentiment.get("confidence", 0.0)
    risk_level = risk.get("risk_level", "MEDIUM")
    if s_signal == "BUY" and risk_level in ["LOW", "MEDIUM"]:
        final = "BUY"
        confidence = s_conf * (0.9 if risk_level == "MEDIUM" else 1.0)
    elif s_signal == "SELL":
        final = "SELL"
        confidence = s_conf * 0.9
    elif risk_level == "HIGH":
        final = "HOLD"
        confidence = 0.3
    else:
        final = "HOLD"
        confidence = 0.5
    state["proposed_signal"] = final
    state["confidence"] = round(confidence, 3)
    state["reasoning"].append(
        f"SignalAgent: {s_signal} + risk={risk_level} → "
        f"{final} ({confidence:.0%})"
    )
    return state
