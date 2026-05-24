"""
app_factory.py — FastAPI app construction helpers.

Extracted from main.py (P2-D G3 composition-root trim).
Holds lifespan context manager and middleware configuration so that main.py
remains a pure wiring-only composition root (≤80 lines).

This module is infrastructure-adjacent (it knows about FastAPI app structure)
but contains NO business logic: no similarity calculations, no ranking, no math.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

if TYPE_CHECKING:
    from infrastructure.embedder import SentenceTransformersEmbedder
    from infrastructure.config import Config


@asynccontextmanager
async def build_lifespan(
    app: FastAPI,
    embedder: "SentenceTransformersEmbedder",
    cfg: "Config",
) -> AsyncGenerator[None, None]:
    """
    FastAPI lifespan context manager.

    Eagerly initialises the embedding model on startup so the first search
    request is not penalised with a cold-start delay.

    Args:
        app:     the FastAPI application instance (unused directly, required by protocol).
        embedder: the SentenceTransformersEmbedder adapter to initialise.
        cfg:     service config for logging parameters.
    """
    logging.basicConfig(level=getattr(logging, cfg.log_level.upper(), logging.INFO))
    log = logging.getLogger(__name__)
    log.info("rag-service starting on %s:%d", cfg.host, cfg.port)

    try:
        await embedder.initialize()
    except Exception as exc:
        log.warning(
            "Embedding model preload failed (will retry on first request): %s", exc
        )

    yield
    log.info("rag-service shutting down")


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
