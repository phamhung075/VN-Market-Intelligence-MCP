"""
infrastructure/ocr_text_source.py — AR-PDF FR-2

Concrete implementations of OcrTextSourcePort (domain/repositories.py).

Implementations:
    SqliteOcrTextSource — reads pdf_extracted_text table from market.db.
    MistralOcrSource    — stub; raises NotImplementedError until wired.

Selection via factory: infrastructure/ocr_text_source_factory.py
Env var: BCTC_PAGE_TEXT_BACKEND (sqlite default / mistral future).

DDD layer: infrastructure. Both implementations import only stdlib (sqlite3).
Zero network calls in SqliteOcrTextSource (local DB only).
Zero model weights in either implementation.

Note: SqliteOcrTextSource uses the Python stdlib sqlite3 module (NOT bun:sqlite —
this is a Python service). The db_path is injected at construction time and must
point to the shared market.db volume path.
"""

from __future__ import annotations

import logging
import sqlite3

logger = logging.getLogger(__name__)


class SqliteOcrTextSource:
    """
    Reads per-page OCR text from the pdf_extracted_text table in market.db.

    Table schema expected:
        pdf_extracted_text (
            filename    TEXT,
            page_number INTEGER,
            text_content TEXT,
            ...
        )

    Implements OcrTextSourcePort (domain/repositories.py).

    DDD layer: infrastructure. Uses sqlite3 stdlib only. Zero network.
    """

    def __init__(self, db_path: str) -> None:
        """
        Args:
            db_path: Absolute path to the SQLite database file (market.db).
        """
        self.db_path = db_path

    def get_page_text(self, filename: str, page_number: int) -> str:
        """
        Return text_content from pdf_extracted_text for (filename, page_number).

        Returns empty string if no row found — NEVER raises on missing data.
        Callers treat empty string as "no OCR text available for this page".

        Args:
            filename:    PDF filename key (matches pdf_extracted_text.filename).
            page_number: 1-indexed page number.

        Returns:
            OCR text string, or "" if no row found.
        """
        try:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT text_content FROM pdf_extracted_text "
                    "WHERE filename = ? AND page_number = ?",
                    (filename, page_number),
                )
                row = cursor.fetchone()
                return row[0] if row and row[0] is not None else ""
            finally:
                conn.close()
        except Exception as exc:
            logger.warning(
                "SqliteOcrTextSource.get_page_text: db_path=%s filename=%s "
                "page_number=%d error=%s — returning empty string",
                self.db_path,
                filename,
                page_number,
                exc,
            )
            return ""


class MistralOcrSource:
    """
    Stub implementation of OcrTextSourcePort for the Mistral OCR backend.

    NOT YET WIRED. Raises NotImplementedError on every call.

    This stub makes the swap seam visible and testable per AC-FR2-3:
    existing code using the factory will fail loudly if BCTC_PAGE_TEXT_BACKEND
    is set to "mistral" before the real implementation is wired.

    DDD layer: infrastructure.
    """

    def get_page_text(self, filename: str, page_number: int) -> str:
        """Raises NotImplementedError — Mistral OCR not yet wired."""
        raise NotImplementedError(
            "Mistral OCR not yet wired. "
            "Set BCTC_PAGE_TEXT_BACKEND=sqlite to use the SQLite backend."
        )
