def research_agent(state):
    from nlp.embeddings import EmbeddingEngine
    sentiment = state.get("sentiment_summary", {})
    direction = sentiment.get("signal", "HOLD")
    query = (
        f"crisi storica {state['ticker']} impatto prezzi"
        if direction == "SELL"
        else f"crescita storica {state['ticker']} catalyst positivo"
    )
    results = []
    try:
        ee = EmbeddingEngine()
        results = ee.semantic_search(
            query, ticker=state["ticker"], limit=3
        )
        context = "\n".join([
            f"- {r['title']} (similarity: {r.get('similarity',0):.2f})"
            for r in results
        ])
        state["historical_context"] = context or "Nessun contesto storico"
    except Exception as e:
        state["historical_context"] = f"Errore ricerca: {e}"
    state["reasoning"].append(
        f"ResearchAgent: query='{query[:50]}...' "
        f"trovati {len(results)} "
        f"precedenti storici"
    )
    return state
