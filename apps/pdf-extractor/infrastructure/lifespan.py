"""
Infrastructure — FastAPI lifespan context manager.

Extracted from main.py (P1-A1 composition root shrink) — keeps main.py under 80 logical lines.

PDFX-SINGLE-WORKER-BLOCKING: lifespan now accepts an optional ocr_executor
(ProcessPoolExecutor) and shuts it down cleanly on application stop so worker
processes are not orphaned when the container restarts.
"""

import logging
from concurrent.futures import Executor
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from fastapi import FastAPI

from infrastructure.config import Config


def build_lifespan(cfg: Config, ocr_executor: Optional[Executor] = None):  # type: ignore[return]
    """
    Build and return a FastAPI lifespan async context manager for the given config.

    Args:
        cfg:          Service configuration (host, port, log_level).
        ocr_executor: Optional ProcessPoolExecutor created at composition root.
                      When supplied, it is shut down (wait=True) on application
                      stop to drain in-flight OCR work and reap child processes.

    Usage:
        app = FastAPI(lifespan=build_lifespan(cfg, ocr_executor=ocr_executor))
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        logging.basicConfig(level=getattr(logging, cfg.log_level.upper(), logging.INFO))
        _log = logging.getLogger(__name__)
        _log.info("pdf-extractor starting on %s:%d", cfg.host, cfg.port)
        if ocr_executor is not None:
            _log.info(
                "PDFX-SINGLE-WORKER-BLOCKING: ProcessPoolExecutor ready "
                "(OCR isolated to child process)"
            )
        yield
        _log.info("pdf-extractor shutting down")
        if ocr_executor is not None:
            _log.info(
                "PDFX-SINGLE-WORKER-BLOCKING: shutting down ProcessPoolExecutor "
                "(wait=True — draining in-flight OCR work)"
            )
            ocr_executor.shutdown(wait=True)
            _log.info("PDFX-SINGLE-WORKER-BLOCKING: ProcessPoolExecutor shutdown complete")

    return lifespan
