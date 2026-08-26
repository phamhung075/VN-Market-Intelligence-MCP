"""
Interface — Pydantic request schemas for pdf-extractor POST/GET endpoints.

FACTORY-PDF-split-handlers: extracted from interface/handlers.py — pure
request-shape validation, no orchestration logic. The one business rule that
used to live here (the statement_section allow-set) now reads a domain
constant instead of owning the rule in the interface layer.
"""

from typing import Optional

from pydantic import BaseModel

from domain.constants import STATEMENT_SECTIONS


class ExtractTablesRequestSchema(BaseModel):
    """
    Pydantic model: validates incoming POST /extract-tables request body.

    BT-3-D: Added optional `pages` field for pre-supplied per-page OCR text.
    When supplied by the caller (e.g. mcp-server backfill — BT-4b-2 DEFERRED),
    the use case reuses the stored OCR text instead of running Tesseract again
    (host-safe — avoids redundant OCR on the 16GB Mac).

    BT-4b-2 DEFERRED: mcp-server backfillBctcTables job should populate pages
    from pdf_extracted_text for each doc before calling /extract-tables, so that
    re-extraction never re-OCRs a doc that already has stored OCR text.
    """

    report_id: str
    pdf_path: str
    statement_section: str = "balance_sheet"
    pages: Optional[list] = None  # BT-3-D: optional pre-supplied [{page_number, text}]

    def validate_section(self) -> None:
        if self.statement_section not in STATEMENT_SECTIONS:
            raise ValueError(
                f"statement_section must be one of {STATEMENT_SECTIONS}, "
                f"got: {self.statement_section!r}"
            )


class ExtractMdTablesRequestSchema(BaseModel):
    """
    Pydantic model: validates incoming POST /extract-md-tables request body.

    MD-EXTRACT: trigger generic bbox-based markdown table extraction.
    The endpoint returns 202 Accepted immediately (background task — fire-and-forget).
    """

    report_id: str
    pdf_path: str
    doc_ocr_text: Optional[str] = None  # optional flat OCR text from pdf_extracted_text


class ExtractLayoutFirstRequestSchema(BaseModel):
    """
    Pydantic model: validates incoming POST /extract-layout-first request body.

    LF-EXTRACT: trigger Tier 0-3 layout-first extraction pipeline for one document.
    The endpoint returns 202 Accepted immediately (background task — fire-and-forget).

    AC-LFE-9 (sequential): one document per call. No batch. No concurrency.
    host-safe: never invokes run_bctc_batch_sweep.
    """

    report_id: str
    pdf_path: str


class PekExtractRequestSchema(BaseModel):
    """
    Pydantic model: validates incoming POST /pek-extract request body.

    PEK-INTEGRATE: trigger PDF-Extract-Kit layout+table extraction for one document.
    Endpoint returns 202 Accepted immediately (background task — fire-and-forget).

    Market-hours guard (REQ-PEK-11 Layer 2 — AC-PEK-NEW-1):
        Blocked while domain.primitives.market_hours.primitive.is_vn_market_open_utc()
        returns True — see that primitive for the authoritative window (this
        docstring used to restate it as "02:00-08:59 UTC" and drifted from the
        actual "02:00-07:59 UTC" guard — FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-
        THEN-SILENTLY-DROPPED-SEMAPHORE-1800S AC-5).
        No model is loaded. No inference runs. RSS stays at cold-start baseline.
    """

    report_id: str
    pdf_path: str


class RasterizeRequestSchema(BaseModel):
    """
    POST /api/rasterize — on-demand page rasterization request.

    AR-PDF FR-1 AC-FR1.3: rasterize specific pages of a PDF report.
    Idempotent: already-present pages are returned without re-rendering.

    Fields:
        report_id: Report identifier (used as output subdirectory name).
        filename:  PDF filename (basename only) — resolved to data/pdfs/{filename}.
        pages:     List of 1-indexed page numbers to rasterize.
        force:     Re-render even when the PNG already exists (default False).
                   FIX-PDFX-OCR-ORIENTATION AC-6: PNGs written before the
                   orientation fix are sideways on the shared volume and plain
                   idempotency would serve them forever. force=true is the
                   invalidation lever for this artifact.
    """

    report_id: str
    filename: str
    pages: list[int]
    force: bool = False
