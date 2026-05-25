# DEPRECATED (PDF-INSPECT-REDO): This /inspect surface reads pdf_documents (junk table).
# Real inspection viewer moved to mcp-server GET /api/bctc-inspect.
# DO NOT extend. Safe to delete once PI-3-redo QA confirms mcp-server viewer works.
# SI-2 BOUNDARY: PDF inspection viewer surface.
# This file is part of the served /inspect viewer (Sprint PDF-INSPECT).
# It is SEPARATE from the sandbox trace dashboard (dashboard/index.html).
# Do NOT merge viewer code into dashboard/index.html or dashboard/traces.js.
"""
Interface — FastAPI route handlers (thin HTTP layer).

Handlers delegate all business logic to application usecases.
HTTP concerns (status codes, serialization) are handled here.
"""

import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

from application.usecases import ExtractPDFUseCase
from application.extract_tables_usecase import ExtractTablesUseCase
from infrastructure.inspection_store import InspectionStore
from interface.serializers import ExtractPDFRequestSchema, HealthResponse

# Viewer HTML template is co-located in the interface/ layer.
_VIEWER_HTML_PATH = Path(__file__).parent / "viewer.html"


# ---------------------------------------------------------------------------
# BT-3-B: POST /extract-tables request schema
# ---------------------------------------------------------------------------


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

    @property
    def valid_sections(self):
        return {"balance_sheet", "income_statement", "cash_flow"}

    def validate_section(self) -> None:
        if self.statement_section not in self.valid_sections:
            raise ValueError(
                f"statement_section must be one of {self.valid_sections}, "
                f"got: {self.statement_section!r}"
            )


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------


def register_routes(
    router: APIRouter,
    extract_usecase: ExtractPDFUseCase,
    inspection_store: InspectionStore,
    extract_tables_usecase: Optional[ExtractTablesUseCase] = None,
) -> None:
    """Attach all routes to the given APIRouter."""

    # ----------------------------------------------------------------
    # Core routes
    # ----------------------------------------------------------------

    @router.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Liveness probe."""
        return HealthResponse()

    @router.post("/extract-tables")
    async def extract_tables(body: ExtractTablesRequestSchema) -> dict:
        """
        POST /extract-tables

        BT-3-B: Extract structured BCTC table rows from a PDF file and push them
        to mcp-server for storage.

        Accepts: {report_id: str, pdf_path: str, statement_section: str}
        Returns: {ok: bool, rows_stored: int, balance_pass: bool, balance_delta: float}

        Requires: extract_tables_usecase injected at composition root (main.py).
        Returns HTTP 503 if the use case is not wired (graceful degrade).
        """
        if extract_tables_usecase is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"status": "failed", "error": "extract_tables_usecase not configured"},
            )

        try:
            body.validate_section()
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"status": "failed", "error": str(exc)},
            ) from exc

        try:
            result = await extract_tables_usecase.execute(
                report_id=body.report_id,
                pdf_path=body.pdf_path,
                statement_section=body.statement_section,
                pre_supplied_pages=body.pages,  # BT-3-D: pass through pre-supplied text
            )
            return {
                "ok": True,
                "rows_stored": result.get("rows_stored", 0),
                "balance_pass": result.get("balance_pass", False),
                "balance_delta": result.get("balance_delta", 0.0),
            }
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"status": "failed", "error": str(exc)},
            ) from exc

    @router.post("/extract")
    async def extract_pdf(body: ExtractPDFRequestSchema) -> dict:
        """
        POST /extract

        Accepts: {url, source_type, priority?}
        Returns: ExtractPDFResponse JSON
        """
        try:
            request_dto = body.to_dto()
            response = await extract_usecase.execute(request_dto)
            return response.to_json()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"status": "failed", "error": str(exc)},
            ) from exc

    # ----------------------------------------------------------------
    # SI-2: PDF inspection viewer routes
    # GET /inspect           — serve the viewer HTML page
    # GET /inspect/pdfs      — list available documents
    # GET /inspect/pdf/{id}  — stream PDF bytes
    # GET /inspect/extraction/{id} — return extraction JSON
    # ----------------------------------------------------------------

    @router.get("/inspect", response_class=HTMLResponse)
    async def viewer_page() -> HTMLResponse:
        """
        GET /inspect

        Serve the side-by-side PDF / extracted-content viewer HTML.
        Template is read from interface/viewer.html at request time so that
        template edits take effect without restarting the server.
        """
        if not _VIEWER_HTML_PATH.is_file():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Viewer template not found.",
            )
        html = _VIEWER_HTML_PATH.read_text(encoding="utf-8")
        return HTMLResponse(content=html)

    @router.get("/inspect/pdfs")
    async def list_pdfs() -> dict:
        """
        GET /inspect/pdfs

        Returns JSON with list of available documents:
          {
            "items": [
              {
                "doc_id": "<uuid>",
                "filename": "VCB_2025_Q4.pdf",
                "ticker": "VCB",
                "period": "2025 Q4",
                "has_extraction": true,
                "has_pdf": true
              }
            ]
          }

        Honest-degrade: documents with missing PDF or extraction are included
        with has_pdf/has_extraction set to False.
        """
        try:
            items = inspection_store.list_docs()
            return {"items": items}
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"error": str(exc)},
            ) from exc

    @router.get("/inspect/pdf/{doc_id}")
    async def get_pdf_bytes(doc_id: str) -> Response:
        """
        GET /inspect/pdf/{doc_id}

        Stream the raw PDF bytes for doc_id.
        Returns application/pdf on success.
        Returns HTTP 404 if the file is not found on disk.
        Returns HTTP 400 if doc_id is not a valid UUID.
        """
        try:
            pdf_bytes = inspection_store.get_pdf_bytes(doc_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_doc_id", "doc_id": doc_id},
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"error": str(exc)},
            ) from exc

        if pdf_bytes is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "pdf_not_found", "doc_id": doc_id},
            )

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{doc_id}.pdf"'},
        )

    @router.get("/inspect/extraction/{doc_id}")
    async def get_extraction(doc_id: str) -> dict:
        """
        GET /inspect/extraction/{doc_id}

        Return extraction JSON for doc_id.
        Returns HTTP 404 if the extraction file is not found.
        Returns HTTP 400 if doc_id is not a valid UUID.
        """
        try:
            data = inspection_store.get_extraction(doc_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "invalid_doc_id", "doc_id": doc_id},
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"error": str(exc)},
            ) from exc

        if data is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "extraction_not_found", "doc_id": doc_id},
            )

        return data
