def sentiment_agent(state):
    import math
    from datetime import datetime, timezone
    from nlp.sentiment import SentimentAnalyzer
    if not state["articles"]:
        state["sentiment_summary"] = {
            "signal": "HOLD", "score": 0.0,
            "confidence": 0.0, "distribution": {}
        }
        state["reasoning"].append("SentimentAgent: nessun articolo")
        return state
    sa = SentimentAnalyzer()
    texts = [
        f"{a['title']}. {a.get('content','')[:200]}"
        for a in state["articles"]
    ]
    sentiments = sa.analyze_batch(texts)
    now = datetime.now(timezone.utc)
    total_weight = 0
    weighted_sum = 0
    dist = {"positive": 0, "negative": 0, "neutral": 0}
    for article, sentiment in zip(state["articles"], sentiments):
        try:
            pub = datetime.fromisoformat(
                article["published_at"].replace("Z", "+00:00")
            )
            age_hours = (now - pub).total_seconds() / 3600
        except Exception:
            age_hours = 24
        weight = math.exp(-age_hours / 24)
        direction = (1 if sentiment["label"] == "positive"
                     else -1 if sentiment["label"] == "negative"
                     else 0)
        weighted_sum += sentiment["score"] * direction * weight
        total_weight += weight
        dist[sentiment["label"]] = dist.get(
            sentiment["label"], 0
        ) + 1
    score = weighted_sum / total_weight if total_weight > 0 else 0
    signal = ("BUY" if score > 0.15
              else "SELL" if score < -0.15
              else "HOLD")
    confidence = min(abs(score) / 0.5, 1.0)
    state["sentiment_summary"] = {
        "signal": signal, "score": score,
        "confidence": confidence, "distribution": dist
    }
    state["reasoning"].append(
        f"SentimentAgent: score={score:.3f} → {signal} "
        f"({confidence:.0%}) | dist={dist}"
    )
    return state
