"""Sentiment analysis module using ProsusAI/finbert."""

import logging
import os

from dotenv import load_dotenv
from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline
from supabase import create_client

load_dotenv()

logger = logging.getLogger("nlp.sentiment")


class SentimentAnalyzer:
    """Analyzes financial text sentiment using FinBERT."""

    LABELS = ["positive", "negative", "neutral"]

    def __init__(self, model_name: str = "ProsusAI/finbert"):
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
        self.classifier = pipeline(
            "sentiment-analysis",
            model=self.model,
            tokenizer=self.tokenizer,
        )
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

    def analyze(self, text: str) -> dict:
        """Analyze sentiment of a single text. Truncates to 512 tokens."""
        result = self.classifier(text, truncation=True, max_length=512)[0]
        return {"label": result["label"], "score": round(result["score"], 4)}

    def analyze_batch(self, texts: list[str], batch_size: int = 16) -> list[dict]:
        """Analyze sentiment of multiple texts in batches of 16."""
        results = self.classifier(texts, truncation=True, max_length=512, batch_size=batch_size)
        return [{"label": r["label"], "score": round(r["score"], 4)} for r in results]

    def process_unanalyzed(self, limit: int = 100) -> int:
        """Fetch unprocessed articles from Supabase, analyze, and update."""
        response = (
            self.supabase.table("articles")
            .select("*")
            .eq("processed", False)
            .limit(limit)
            .execute()
        )
        articles = response.data
        if not articles:
            logger.info("No unanalyzed articles found")
            return 0

        texts = [a.get("content") or a.get("title", "") for a in articles]
        sentiments = self.analyze_batch(texts)

        updated = 0
        for article, sentiment in zip(articles, sentiments):
            self.supabase.table("articles").update({
                "sentiment_label": sentiment["label"],
                "sentiment_score": sentiment["score"],
                "processed": True,
            }).eq("id", article["id"]).execute()
            updated += 1

        logger.info("Processed %d articles for sentiment", updated)
        return updated


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    analyzer = SentimentAnalyzer()
    count = analyzer.process_unanalyzed()
    print(f"Sentiment analysis complete: {count} articles processed")
