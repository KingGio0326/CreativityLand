"""Text embeddings module for semantic similarity."""

from sentence_transformers import SentenceTransformer
import numpy as np


class EmbeddingModel:
    """Generates text embeddings for semantic search and similarity."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)

    def encode(self, texts: list[str]) -> np.ndarray:
        """Encode texts into embedding vectors."""
        return self.model.encode(texts)

    def similarity(self, text_a: str, text_b: str) -> float:
        """Compute cosine similarity between two texts."""
        embeddings = self.model.encode([text_a, text_b])
        cos_sim = np.dot(embeddings[0], embeddings[1]) / (
            np.linalg.norm(embeddings[0]) * np.linalg.norm(embeddings[1])
        )
        return float(cos_sim)
