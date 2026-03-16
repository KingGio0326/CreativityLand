"""Text embeddings module using sentence-transformers/all-MiniLM-L6-v2."""

import logging
import os

from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from supabase import create_client

load_dotenv()

logger = logging.getLogger("nlp.embeddings")


class EmbeddingEngine:
    """Generates 384-dim embeddings and performs semantic search via Supabase/pgvector."""

    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

    def embed(self, text: str) -> list[float]:
        """Generate embedding for a single text."""
        vector = self.model.encode(text)
        return vector.tolist()

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        vectors = self.model.encode(texts)
        return vectors.tolist()

    def process_unembedded(self, limit: int = 100) -> int:
        """Fetch articles without embeddings, generate and store them."""
        response = (
            self.supabase.table("articles")
            .select("*")
            .is_("embedding", "null")
            .limit(limit)
            .execute()
        )
        articles = response.data
        if not articles:
            logger.info("No unembedded articles found")
            return 0

        texts = [
            f"{a.get('title', '')} {a.get('content', '')}".strip()
            for a in articles
        ]
        embeddings = self.embed_batch(texts)

        updated = 0
        for article, emb in zip(articles, embeddings):
            self.supabase.table("articles").update({
                "embedding": emb,
            }).eq("id", article["id"]).execute()
            updated += 1

        logger.info("Embedded %d articles", updated)
        return updated

    def semantic_search(self, query: str, ticker: str = None, limit: int = 10) -> list[dict]:
        """Search articles by semantic similarity using pgvector."""
        query_embedding = self.embed(query)

        # Build RPC call for vector similarity search
        params = {
            "query_embedding": query_embedding,
            "match_count": limit,
        }
        if ticker:
            params["filter_ticker"] = ticker

        # Use raw SQL via Supabase's rpc or postgrest
        # Fallback: use direct query with ordering
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

        if ticker:
            response = (
                self.supabase.rpc("match_articles", {
                    "query_embedding": embedding_str,
                    "filter_ticker": ticker,
                    "match_count": limit,
                }).execute()
            )
        else:
            response = (
                self.supabase.rpc("match_articles", {
                    "query_embedding": embedding_str,
                    "filter_ticker": None,
                    "match_count": limit,
                }).execute()
            )

        results = response.data or []
        logger.info("Semantic search returned %d results", len(results))
        return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    engine = EmbeddingEngine()
    count = engine.process_unembedded()
    print(f"Embeddings complete: {count} articles embedded")
