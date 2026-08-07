# size-justification: 175L — lazy-load + idle-unload is one cohesive lifecycle:
# _ensure_model_loaded()/_load_model() (GFD-13 lazy singleton) and
# _maybe_unload_idle() (FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH) share the SAME
# asyncio.Lock double-check-lock pattern and the SAME _model /
# _last_used_monotonic state on this one singleton. Splitting load vs unload
# into separate files would either duplicate that lock or force tight
# cross-file coupling to it, for zero token benefit — this file IS the
# singleton's full state machine, not a bag of unrelated helpers.
"""
Infrastructure — SentenceTransformersEmbedder.

Implements EmbedderPort using sentence-transformers library (ONNX, local).
Model: paraphrase-multilingual-MiniLM-L12-v2
  → 384-dim vectors, supports Vietnamese / French / English
  → ~400MB, auto-downloads on first run to embedding_cache_dir

GFD-13: lazy-load singleton — model is NOT loaded at startup.
It loads on the first real embed() / embed_batch() call via _ensure_model_loaded().
Container starts at ~150 MiB; warm RSS spikes to ~600-700 MiB on first embed.

FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH: idle-unload, symmetric to the lazy-load above.
Once loaded, the model previously stayed resident for the container's entire
remaining lifetime (no release path at all). _maybe_unload_idle() now unloads
the model + gc.collect() after EMBEDDER_IDLE_UNLOAD_MINUTES of no embed() /
embed_batch() calls (driven by a background loop in app_factory.build_lifespan).
Reload on the next call is transparent — it goes through the SAME
_ensure_model_loaded() double-check-lock path used for the original lazy-load;
no second load path was added.
"""

import asyncio
import gc
import logging
import time
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

    FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH: idle-unload — model unloads after N
    idle minutes and reloads transparently on the next call via the same lock.
    """

    def __init__(self, model_name: str, cache_dir: str) -> None:
        self._model_name = model_name
        self._cache_dir = cache_dir
        self._model = None          # lazy-loaded — None until first embed call
        self._load_lock = None      # asyncio.Lock — created lazily inside first async call
        self._load_error: Optional[Exception] = None  # set if model load fails
        self._last_used_monotonic: Optional[float] = None  # time.monotonic() at last embed

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

    async def _maybe_unload_idle(self, idle_threshold_s: float) -> bool:
        """
        Unload the model if it has been idle longer than idle_threshold_s.

        Symmetric to _ensure_model_loaded(): same lock, same double-check
        pattern (check outside the lock cheaply, re-check inside the lock
        before mutating — a concurrent embed() may have refreshed
        _last_used_monotonic, or another unload check may already have run,
        while we were waiting for the lock).

        Returns True if the model was unloaded this call, False otherwise
        (nothing loaded, not yet idle, or lost the race to a fresher use).
        Never raises — driven by a fire-and-forget background loop.
        """
        if self._model is None or self._last_used_monotonic is None:
            return False  # nothing loaded, nothing to unload
        if time.monotonic() - self._last_used_monotonic <= idle_threshold_s:
            return False  # not idle long enough yet — cheap check, no lock needed

        if self._load_lock is None:
            self._load_lock = asyncio.Lock()
        async with self._load_lock:
            # Double-check inside the lock — the model may have been reloaded
            # (embed() reset _last_used_monotonic) while we waited for the lock.
            if self._model is None or self._last_used_monotonic is None:
                return False
            if time.monotonic() - self._last_used_monotonic <= idle_threshold_s:
                return False
            self._model = None
            gc.collect()
            logger.info(
                "Embedding model unloaded after %.0fs idle (threshold=%.0fs). "
                "Will reload transparently on next embed call.",
                time.monotonic() - self._last_used_monotonic,
                idle_threshold_s,
            )
            return True

    def _raw_embed(self, texts: list[str]) -> list[list[float]]:
        """Synchronous batch encode — returns list of float lists."""
        self._last_used_monotonic = time.monotonic()
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
