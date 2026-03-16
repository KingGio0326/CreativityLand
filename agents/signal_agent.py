def signal_agent(state):
    sentiment = state.get("sentiment_summary", {})
    risk = state.get("risk_assessment", {})
    technical = state.get("technical_analysis", {})
    fundamental = state.get("fundamental_analysis", {})
    momentum = state.get("momentum_analysis", {})
    social = state.get("social_analysis", {})
    ml = state.get("ml_prediction", {})
    s_signal = sentiment.get("signal", "HOLD")
    s_conf = sentiment.get("confidence", 0.0)
    risk_level = risk.get("risk_level", "MEDIUM")
    t_signal = technical.get("signal", "HOLD")
    f_signal = fundamental.get("signal", "HOLD")
    m_signal = momentum.get("signal", "HOLD")
    m_trend = momentum.get("trend", "flat")
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
    # Momentum trend filter
    trend_filtered = False
    if m_trend == "strong_down" and final == "BUY":
        final = "HOLD"
        confidence = 0.3
        trend_filtered = True
    # Momentum + sentiment agreement bonus
    if m_signal == s_signal and s_signal != "HOLD":
        confidence += 0.08
    # Social sentiment agreement bonus
    soc_signal = social.get("signal", "HOLD")
    soc_hype = social.get("hype_score", 0.0)
    if soc_signal == final and final != "HOLD":
        confidence += 0.06
    if soc_hype > 0.7 and soc_signal != final and final != "HOLD":
        confidence -= 0.05
    # ML prediction integration
    ml_signal = ml.get("signal", "HOLD")
    ml_override = False
    if ml_signal == s_signal and s_signal != "HOLD":
        confidence += 0.10
    if (ml_signal != "HOLD" and final != "HOLD"
            and ml_signal != final
            and ml_signal != t_signal
            and ml_signal != f_signal
            and ml_signal != m_signal):
        final = "HOLD"
        confidence = 0.35
        ml_override = True
    confidence = round(max(0.0, min(confidence, 1.0)), 3)
    state["proposed_signal"] = final
    state["confidence"] = confidence
    extra = ""
    if triple:
        extra += " [TRIPLE CONFIRMATION]"
    if trend_filtered:
        extra += " [TREND FILTER]"
    if ml_override:
        extra += " [ML OVERRIDE]"
    state["reasoning"].append(
        f"SignalAgent: {s_signal} + risk={risk_level} "
        f"+ tech={t_signal} + fund={f_signal} "
        f"+ mom={m_signal}({m_trend}) + social={soc_signal} "
        f"+ ml={ml_signal} → "
        f"{final} ({confidence:.0%}){extra}"
    )
    return state
