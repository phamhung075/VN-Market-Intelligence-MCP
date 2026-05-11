"""
Infrastructure — SentenceTransformersEmbedder.

Implements EmbedderPort using sentence-transformers library (ONNX, local).
Model: paraphrase-multilingual-MiniLM-L12-v2
  → 384-dim vectors, supports Vietnamese / French / English
  → ~400MB, auto-downloads on first run to embedding_cache_dir

Singleton pattern: model loaded once at startup, reused for all requests.
"""

import logging
from typing import Optional

from domain.models import EmbeddingVector
from domain.repositories import EmbedderPort

logger = logging.getLogger(__name__)

_DIMS = 384


class SentenceTransformersEmbedder(EmbedderPort):
    """
    Production embedder using sentence-transformers.

    Call initialize() once at startup (or it's done lazily on first embed call).
    Thread-safe: sentence-transformers encode() is reentrant.
    """

    def __init__(self, model_name: str, cache_dir: str) -> None:
        self._model_name = model_name
        self._cache_dir = cache_dir
        self._model = None  # lazy-loaded

    async def initialize(self) -> None:
        """
        Eagerly load the model.
        Call from FastAPI lifespan so first request isn't slow.
        """
        self._load_model()

    def _load_model(self):
        if self._model is not None:
            return
        try:
            from sentence_transformers import SentenceTransformer

            logger.info(
                "Loading embedding model: %s (first load ~400MB)...", self._model_name
            )
            self._model = SentenceTransformer(
                self._model_name,
                cache_folder=self._cache_dir,
            )
            logger.info("Embedding model ready.")
        except ImportError as exc:
            raise RuntimeError(
                "sentence-transformers not installed. "
                "Run: pip install sentence-transformers"
            ) from exc

    def _raw_embed(self, texts: list[str]) -> list[list[float]]:
        """Synchronous batch encode — returns list of float lists."""
        self._load_model()
        embeddings = self._model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return [emb.tolist() for emb in embeddings]

    async def embed(self, text: str) -> EmbeddingVector:
        """Embed a single text. Uses batch encode internally."""
        results = self._raw_embed([text])
        return EmbeddingVector(dims=_DIMS, values=results[0])

    async def embed_batch(self, texts: list[str]) -> list[EmbeddingVector]:
        """Embed multiple texts in one batch (more efficient)."""
        if not texts:
            return []
        results = self._raw_embed(texts)
        return [EmbeddingVector(dims=_DIMS, values=v) for v in results]
