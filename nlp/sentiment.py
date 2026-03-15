"""Sentiment analysis module using transformer models."""

from transformers import pipeline


class SentimentAnalyzer:
    """Analyzes sentiment of financial text using a pre-trained model."""

    def __init__(self, model_name: str = "ProsusAI/finbert"):
        self.classifier = pipeline("sentiment-analysis", model=model_name)

    def analyze(self, text: str) -> dict:
        """Analyze sentiment of a single text."""
        result = self.classifier(text, truncation=True)[0]
        return {"label": result["label"], "score": result["score"]}

    def analyze_batch(self, texts: list[str]) -> list[dict]:
        """Analyze sentiment of multiple texts."""
        results = self.classifier(texts, truncation=True)
        return [{"label": r["label"], "score": r["score"]} for r in results]
