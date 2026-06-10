"""
Infrastructure — SentenceTransformersEmbedder.

Implements EmbedderPort using sentence-transformers library (ONNX, local).
Model: paraphrase-multilingual-MiniLM-L12-v2
  → 384-dim vectors, supports Vietnamese / French / English
  → ~400MB, auto-downloads on first run to embedding_cache_dir

GFD-13: lazy-load singleton — model is NOT loaded at startup.
It loads on the first real embed() / embed_batch() call via _ensure_model_loaded().
Container starts at ~150 MiB; warm RSS spikes to ~600-700 MiB on first embed.
"""

import asyncio
import logging
from typing import Optional

from domain.models import EmbeddingVector
from domain.repositories import EmbedderPort

logger = logging.getLogger(__name__)

_DIMS = 384


class SentenceTransformersEmbedder(EmbedderPort):
    """
    Production embedder using sentence-transformers.

    GFD-13: lazy-load — model loads on first embed call, not at startup.
    Thread-safe: asyncio.Lock guards the one-time load path; encode() is reentrant.
    """

    def __init__(self, model_name: str, cache_dir: str) -> None:
        self._model_name = model_name
        self._cache_dir = cache_dir
        self._model = None          # lazy-loaded — None until first embed call
        self._load_lock = None      # asyncio.Lock — created lazily inside first async call
        self._load_error: Optional[Exception] = None  # set if model load fails

    async def initialize(self) -> None:
        """
        Lazy-load: model loads on first embed call, not at startup.
        This method is intentionally a no-op (interface contract preserved for app_factory.py).
        GFD-13: eager startup load removed — deferred to first _ensure_model_loaded() call.
        """
        logger.info(
            "rag-service lazy-load enabled — embedding model will load on first embed call"
        )

    async def _ensure_model_loaded(self) -> None:
        """Lazy-init the model exactly once. Thread-safe via asyncio.Lock."""
        if self._model is not None:       # fast path — already loaded
            return
        if self._load_error is not None:  # previous load attempt failed — surface error
            raise RuntimeError(
                f"embedding model failed to load: {self._load_error}"
            ) from self._load_error
        # Lazy-init the lock (must be created inside a running event loop)
        if self._load_lock is None:
            self._load_lock = asyncio.Lock()
        async with self._load_lock:
            if self._model is not None:   # double-check inside lock
                return
            try:
                await asyncio.to_thread(self._load_model)
            except Exception as exc:
                self._load_error = exc
                raise

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
        await self._ensure_model_loaded()
        results = self._raw_embed([text])
        return EmbeddingVector(dims=_DIMS, values=results[0])

    async def embed_batch(self, texts: list[str]) -> list[EmbeddingVector]:
        """Embed multiple texts in one batch (more efficient)."""
        if not texts:
            return []
        await self._ensure_model_loaded()
        results = self._raw_embed(texts)
        return [EmbeddingVector(dims=_DIMS, values=v) for v in results]
