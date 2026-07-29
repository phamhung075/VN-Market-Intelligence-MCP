"""
Interface — GET /page-text route (AR-PDF FR-2).

FACTORY-PDF-split-handlers: extracted from interface/handlers.py.
"""

import os
from typing import Any, Optional

from fastapi import APIRouter


def register_page_text_routes(router: APIRouter, ocr_text_source: Optional[Any] = None) -> None:
    """Attach GET /page-text to the given APIRouter."""

    @router.get("/page-text")
    async def get_page_text(filename: str, page_number: int) -> dict:
        """
        GET /api/page-text?filename=<str>&page_number=<int>

        AR-PDF FR-2 AC-FR1.3: retrieve stored OCR text for a page.
        Supports get_bctc_page_text MCP tool (mcp-server calls this endpoint).

        Returns { text: str, source: "sqlite_ocr" | "mistral_ocr" }
        Returns { text: "" } (NOT 404) when no text found — empty string is valid
            for a page that genuinely has no OCR text.

        FU-1 RISK-1: Returns { source_reachable: false } when the underlying source
            raises an exception (DB unreachable, path wrong, volume unmounted).
            This is DISTINCT from "page has no text" (which returns text: "").
            mcp-server must treat source_reachable:false as ERROR, not as empty text,
            to prevent fabrication by the refine agent.

        Query params:
            filename:    PDF filename (matches pdf_extracted_text.filename).
            page_number: 1-indexed page number.

        Auth: none (internal service).
        """
        if ocr_text_source is None:
            # FU-1: ocr_text_source is now always wired in create_app().
            # This branch is only hit if register_routes is called without injection
            # (e.g. legacy test harness). Surface source_reachable:false so callers
            # treat this as an error, not as a page with no text.
            import logging as _log_mod
            _log_mod.getLogger(__name__).error(
                "get_page_text: ocr_text_source is None — seam not wired. "
                "MARKET_DB_PATH or select_ocr_text_source call missing in create_app()."
            )
            return {"text": "", "source": "sqlite_ocr", "source_reachable": False}

        # Determine source label from backend env var
        backend = os.getenv("BCTC_PAGE_TEXT_BACKEND", "sqlite").strip().lower()
        source = "mistral_ocr" if backend == "mistral" else "sqlite_ocr"

        try:
            text = ocr_text_source.get_page_text(filename, page_number)
        except Exception as exc:
            import logging as _log_mod
            _log_mod.getLogger(__name__).error(
                "get_page_text: source_reachable=False filename=%s page_number=%d error=%s — "
                "returning source_reachable:false (not empty string) to prevent fabrication",
                filename,
                page_number,
                exc,
            )
            # FU-1 RISK-1: Do NOT return {"text": ""} silently.
            # source_reachable:false signals to mcp-server that the OCR pipeline
            # is broken, not that the page is empty. Refine must not proceed.
            return {"text": "", "source": source, "source_reachable": False}

        return {"text": text, "source": source, "source_reachable": True}
