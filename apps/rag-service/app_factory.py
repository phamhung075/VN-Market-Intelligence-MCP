# size-justification: 177L — composition-root app-factory: build_lifespan()
# (FastAPI lifespan wiring + FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH background loop),
# add_cors_middleware(), and build_real_adapters() (service-tier fake injection
# vs production SentenceTransformers/LanceDB adapter construction) are all the
# SAME extraction-from-main.py scope (P2-D G3 composition-root trim) — one file
# holding main.py's app-construction helpers, not unrelated concerns. Splitting
# further would fragment cohesive composition-root wiring for zero token
# benefit, mirroring the sibling single-purpose files in this directory
# (main.py stays the pure wiring-only root; this file is its helper module).
"""
app_factory.py — FastAPI app construction helpers.

Extracted from main.py (P2-D G3 composition-root trim).
Holds lifespan factory, middleware configuration, and adapter construction so
that main.py remains a pure wiring-only composition root (<=80 lines).

This module is infrastructure-adjacent (it knows about FastAPI app structure)
but contains NO business logic: no similarity calculations, no ranking, no math.

P3-A (service-tier injection): build_real_adapters() accepts optional overrides —
  when injected (service-tier sandbox), returns the fakes unchanged with a stub Config.
  When not injected (production), builds real SentenceTransformers + LanceDB adapters.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Callable, Optional, Tuple, TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

if TYPE_CHECKING:
    from domain.repositories import EmbedderPort, VectorStorePort
    from infrastructure.config import Config

logger = logging.getLogger(__name__)

# Bounded poll interval for the idle-unload background loop. Not env-configurable
# on purpose — it is an internal check cadence, not a user-facing knob (the knob
# is EMBEDDER_IDLE_UNLOAD_MINUTES, which controls the actual idle threshold).
_IDLE_UNLOAD_CHECK_INTERVAL_S = 60.0


async def _idle_unload_loop(embedder: Any, idle_threshold_s: float) -> None:
    """
    Background loop (FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH): every
    _IDLE_UNLOAD_CHECK_INTERVAL_S, ask the embedder to unload itself if it has
    sat idle longer than idle_threshold_s.

    Duck-typed: sandbox/fake embedders (service-tier injection) do not implement
    _maybe_unload_idle(), so this loop is a permanent no-op for them — zero
    behaviour change to the deterministic sandbox path.

    Runs until cancelled (build_lifespan cancels it on shutdown). Never lets an
    exception escape — a broken idle-unload check must never take the service
    down; it just logs and keeps polling.
    """
    maybe_unload = getattr(embedder, "_maybe_unload_idle", None)
    if not callable(maybe_unload):
        return  # embedder does not support idle-unload — nothing to do, ever
    while True:
        await asyncio.sleep(_IDLE_UNLOAD_CHECK_INTERVAL_S)
        try:
            await maybe_unload(idle_threshold_s)
        except Exception:
            logger.exception("idle-unload check failed (embedder stays as-is)")


def build_lifespan(
    embedder: Any,
    cfg: Any,
) -> Callable[[FastAPI], Any]:
    """
    Return a FastAPI-compatible lifespan async context manager factory.

    In production (real SentenceTransformersEmbedder), calls embedder.initialize()
    and starts the idle-unload background loop (FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH),
    cancelled cleanly on shutdown.
    In service-tier sandbox (fake adapter), duck-types: if no initialize()/
    _maybe_unload_idle(), both are skipped — zero sandbox behaviour change.
    """
    idle_unload_minutes = getattr(cfg, "embedder_idle_unload_minutes", 15)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        logging.basicConfig(
            level=getattr(logging, cfg.log_level.upper(), logging.INFO)
        )
        log = logging.getLogger(__name__)
        log.info("rag-service starting on %s:%d", cfg.host, cfg.port)

        # Duck-type: real embedder has initialize(); fake adapters do not.
        initialize = getattr(embedder, "initialize", None)
        if callable(initialize):
            try:
                await initialize()
            except Exception as exc:
                log.warning(
                    "Embedding model preload failed (will retry on first request): %s",
                    exc,
                )

        idle_unload_task = asyncio.create_task(
            _idle_unload_loop(embedder, idle_threshold_s=idle_unload_minutes * 60.0)
        )

        try:
            yield
        finally:
            idle_unload_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await idle_unload_task
            log.info("rag-service shutting down")

    return lifespan


def add_cors_middleware(app: FastAPI) -> None:
    """
    Attach CORS middleware allowing all origins/methods/headers.

    Extracted from create_app() to keep the composition root free of
    middleware configuration details.
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )


def build_real_adapters(
    embedder_override: Optional["EmbedderPort"] = None,
    vector_store_override: Optional["VectorStorePort"] = None,
) -> Tuple[Any, Any, Any]:
    """
    Construct (embedder, vector_store, cfg) for use by create_app().

    Production path (both None): builds real SentenceTransformersEmbedder +
    LanceDBVectorStore from Config.from_env(); performs filesystem mkdir.

    Injection path (overrides provided): returns the injected fakes unchanged.
    In this case cfg is a minimal stub — no real Config env vars are read for
    DB/embedding paths (but Config.from_env() is still called so log_level,
    host, port defaults are available for the lifespan logger).

    Returns: (embedder, vector_store, cfg)
    """
    from infrastructure.config import Config

    cfg = Config.from_env()

    if embedder_override is not None:
        # Service-tier test path: use injected fakes, skip all filesystem ops.
        return embedder_override, vector_store_override, cfg

    # Production path — build real infrastructure adapters.
    from infrastructure.embedder import SentenceTransformersEmbedder
    from infrastructure.repositories import LanceDBVectorStore

    os.makedirs(cfg.lancedb_path, exist_ok=True)
    os.makedirs(os.path.dirname(cfg.db_path) or ".", exist_ok=True)
    os.makedirs(cfg.embedding_cache_dir, exist_ok=True)

    embedder = SentenceTransformersEmbedder(
        model_name=cfg.embedding_model,
        cache_dir=cfg.embedding_cache_dir,
    )
    vector_store = LanceDBVectorStore(db_path=cfg.lancedb_path)

    return embedder, vector_store, cfg
