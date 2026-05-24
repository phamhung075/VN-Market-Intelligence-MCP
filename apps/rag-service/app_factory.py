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

import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Callable, Optional, Tuple, TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

if TYPE_CHECKING:
    from domain.repositories import EmbedderPort, VectorStorePort
    from infrastructure.config import Config


def build_lifespan(
    embedder: Any,
    cfg: Any,
) -> Callable[[FastAPI], Any]:
    """
    Return a FastAPI-compatible lifespan async context manager factory.

    In production (real SentenceTransformersEmbedder), calls embedder.initialize().
    In service-tier sandbox (fake adapter), duck-types: if no initialize(), skips.
    """

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

        yield
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
