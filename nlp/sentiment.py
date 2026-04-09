"""Sentiment analysis module using ProsusAI/finbert."""

import logging
import math
import os
import time

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logger = logging.getLogger("nlp.sentiment")

# ---------------------------------------------------------------------------
# Retry utility
# ---------------------------------------------------------------------------

def _with_retry(fn, retries: int = 4, base_delay: float = 1.0):
    """
    Call fn() up to `retries` times with exponential backoff.
    Delays: 1s, 2s, 4s, 8s (for retries=4).
    Raises the last exception if all attempts fail.
    """
    delay = base_delay
    last_exc = None
    for attempt in range(retries):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                logger.warning(
                    "Attempt %d/%d failed (%s: %s) — retrying in %.0fs",
                    attempt + 1, retries, type(exc).__name__, exc, delay,
                )
                time.sleep(delay)
                delay *= 2
            else:
                logger.error(
                    "All %d attempts failed (%s: %s)",
                    retries, type(exc).__name__, exc,
                )
    raise last_exc


class SentimentAnalyzer:
    """Analyzes financial text sentiment using FinBERT."""

    LABELS = ["positive", "negative", "neutral"]

    def __init__(self, model_name: str = "ProsusAI/finbert"):
        self._model_available = False
        self.classifier = None
        try:
            from transformers import (
                AutoTokenizer,
                AutoModelForSequenceClassification,
                pipeline,
            )
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = AutoModelForSequenceClassification.from_pretrained(model_name)
            self.classifier = pipeline(
                "sentiment-analysis",
                model=model,
                tokenizer=tokenizer,
            )
            self._model_available = True
        except Exception as exc:
            logger.warning(
                "FinBERT model load failed — sentiment analysis degraded: %s", exc
            )

        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

    def analyze(self, text: str) -> dict:
        """Analyze sentiment of a single text. Truncates to 512 tokens."""
        if not self._model_available:
            return {"label": "neutral", "score": 0.0}
        result = self.classifier(text, truncation=True, max_length=512)[0]
        return {"label": result["label"], "score": round(result["score"], 4)}

    def analyze_batch(self, texts: list[str], batch_size: int = 16) -> list[dict]:
        """Analyze sentiment of multiple texts in batches of 16."""
        if not self._model_available:
            return [{"label": "neutral", "score": 0.0} for _ in texts]
        results = self.classifier(texts, truncation=True, max_length=512, batch_size=batch_size)
        return [{"label": r["label"], "score": round(r["score"], 4)} for r in results]

    def process_unanalyzed(self, limit: int = 100) -> int:
        """Fetch unprocessed articles from Supabase, analyze, and update.

        Uses geo_weight to produce a weighted sentiment score:
        weighted_score = raw_score * geo_weight

        Returns the number of articles successfully updated.
        If the model is unavailable, returns 0 without marking articles processed.
        """
        if not self._model_available:
            logger.warning("Model unavailable — skipping process_unanalyzed")
            return 0

        # Fetch with retry
        try:
            response = _with_retry(
                lambda: (
                    self.supabase.table("articles")
                    .select("*")
                    .eq("processed", False)
                    .limit(limit)
                    .execute()
                )
            )
        except Exception as exc:
            logger.error("Failed to fetch unanalyzed articles after retries: %s", exc)
            return 0

        articles = response.data
        if not articles:
            logger.info("No unanalyzed articles found")
            return 0

        texts = [a.get("content") or a.get("title", "") for a in articles]
        sentiments = self.analyze_batch(texts)

        updated = 0
        failed = 0
        for article, sentiment in zip(articles, sentiments):
            geo_weight = article.get("geo_weight", 1.0) or 1.0
            weighted_score = round(sentiment["score"] * geo_weight, 4)
            payload = {
                "sentiment_label": sentiment["label"],
                "sentiment_score": weighted_score,
                "processed": True,
            }
            try:
                _with_retry(
                    lambda p=payload, aid=article["id"]: (
                        self.supabase.table("articles")
                        .update(p)
                        .eq("id", aid)
                        .execute()
                    )
                )
                updated += 1
            except Exception as exc:
                logger.error(
                    "Failed to update article %s after retries — leaving unprocessed: %s",
                    article.get("id"), exc,
                )
                failed += 1

        logger.info(
            "Sentiment: found=%d updated=%d failed=%d",
            len(articles), updated, failed,
        )
        return updated


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    analyzer = SentimentAnalyzer()
    count = analyzer.process_unanalyzed()
    print(f"Sentiment analysis complete: {count} articles processed")
