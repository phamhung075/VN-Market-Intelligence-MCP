"""
infrastructure/ocr_text_source_factory.py — AR-PDF FR-2

Factory for OcrTextSourcePort implementations.

Selects the concrete implementation based on BCTC_PAGE_TEXT_BACKEND env var:
    "sqlite"  (default) → SqliteOcrTextSource(db_path)
    "mistral"           → MistralOcrSource() [stub — raises NotImplementedError]

Public API:
    select_ocr_text_source(db_path: str) -> OcrTextSourcePort

DDD layer: infrastructure. Zero domain imports.

Note: this env var is SEPARATE from OCR_TEXT_BACKEND (which controls the
cell/line text recognition backend for PEK extraction). This factory controls
the page-level OCR text retrieval source only.
"""

from __future__ import annotations

import logging
import os

from infrastructure.ocr_text_source import MistralOcrSource, SqliteOcrTextSource

logger = logging.getLogger(__name__)

_DEFAULT_BACKEND = "sqlite"


def select_ocr_text_source(db_path: str) -> "SqliteOcrTextSource | MistralOcrSource":
    """
    Create and return the appropriate OcrTextSourcePort implementation.

    Reads BCTC_PAGE_TEXT_BACKEND env var (default "sqlite").

    Args:
        db_path: Absolute path to the SQLite market.db file.
                 Used only for the sqlite backend; ignored by MistralOcrSource.

    Returns:
        SqliteOcrTextSource if BCTC_PAGE_TEXT_BACKEND == "sqlite" (default).
        MistralOcrSource    if BCTC_PAGE_TEXT_BACKEND == "mistral".

    Raises:
        ValueError: if BCTC_PAGE_TEXT_BACKEND is set to an unknown value.
    """
    backend = os.getenv("BCTC_PAGE_TEXT_BACKEND", _DEFAULT_BACKEND).strip().lower()

    if backend == "sqlite":
        logger.debug(
            "select_ocr_text_source: backend=sqlite db_path=%s", db_path
        )
        return SqliteOcrTextSource(db_path)

    if backend == "mistral":
        logger.debug("select_ocr_text_source: backend=mistral (stub)")
        return MistralOcrSource()

    raise ValueError(
        f"Unknown BCTC_PAGE_TEXT_BACKEND: {backend!r}. "
        f"Valid values: 'sqlite' (default), 'mistral'."
    )
