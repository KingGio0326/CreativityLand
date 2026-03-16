def signal_agent(state):
    sentiment = state.get("sentiment_summary", {})
    risk = state.get("risk_assessment", {})
    technical = state.get("technical_analysis", {})
    fundamental = state.get("fundamental_analysis", {})
    s_signal = sentiment.get("signal", "HOLD")
    s_conf = sentiment.get("confidence", 0.0)
    risk_level = risk.get("risk_level", "MEDIUM")
    t_signal = technical.get("signal", "HOLD")
    f_signal = fundamental.get("signal", "HOLD")
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
    # Technical agreement/disagreement adjustment
    if t_signal == final and final != "HOLD":
        confidence += 0.12
    elif t_signal != final and t_signal != "HOLD" and final != "HOLD":
        confidence -= 0.10
    # Triple confirmation: sentiment + technical + fundamental agree
    triple = False
    if (s_signal == t_signal == f_signal
            and s_signal != "HOLD"
            and fundamental.get("available", False)):
        confidence += 0.20
        triple = True
    confidence = round(max(0.0, min(confidence, 1.0)), 3)
    state["proposed_signal"] = final
    state["confidence"] = confidence
    extra = " [TRIPLE CONFIRMATION]" if triple else ""
    state["reasoning"].append(
        f"SignalAgent: {s_signal} + risk={risk_level} "
        f"+ tech={t_signal} + fund={f_signal} → "
        f"{final} ({confidence:.0%}){extra}"
    )
    return state
