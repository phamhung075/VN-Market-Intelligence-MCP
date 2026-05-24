"""
Infrastructure — FastAPI lifespan context manager.

Extracted from main.py (P1-A1 composition root shrink) — keeps main.py under 80 logical lines.
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from infrastructure.config import Config


def build_lifespan(cfg: Config):  # type: ignore[return]
    """
    Build and return a FastAPI lifespan async context manager for the given config.

    Usage:
        app = FastAPI(lifespan=build_lifespan(cfg))
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        logging.basicConfig(level=getattr(logging, cfg.log_level.upper(), logging.INFO))
        logging.getLogger(__name__).info(
            "pdf-extractor starting on %s:%d", cfg.host, cfg.port
        )
        yield
        logging.getLogger(__name__).info("pdf-extractor shutting down")

    return lifespan
