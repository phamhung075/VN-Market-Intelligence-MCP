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
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

from application.usecases import ExtractPDFUseCase
from application.extract_tables_usecase import ExtractTablesUseCase
from application.extract_md_tables_usecase import ExtractMdTablesUseCase
from application.extract_layout_first_usecase import ExtractLayoutFirstUseCase  # LF-EXTRACT
from infrastructure.inspection_store import InspectionStore
from interface.serializers import ExtractPDFRequestSchema, HealthResponse

# AR-PDF FR-1/FR-2: rasterizer + OCR text source imports (lazy-loaded at call site)
# Infrastructure imports are deferred into handlers to keep the interface layer
# thin and avoid circular import issues at module load time.

# PEK-INTEGRATE: market-hours guard (domain primitive — pure function, injected at call site)
# REQ-PEK-11 Layer 2: POST /pek-extract returns HTTP 503 during VN market hours.
# Domain import is permitted in interface layer (interface → domain is valid DDD flow).
from domain.primitives.market_hours.primitive import is_vn_market_open_utc

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


async def _run_extract_md_tables(
    use_case: "ExtractMdTablesUseCase",
    report_id: str,
    pdf_path: str,
    doc_ocr_text: Optional[str],
) -> None:
    """
    Background task wrapper for ExtractMdTablesUseCase.execute().

    Logs errors internally — background tasks must not raise (FastAPI swallows
    unhandled exceptions in background tasks silently; we want visibility).
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        result = await use_case.execute(
            report_id=report_id,
            pdf_path=pdf_path,
            doc_ocr_text=doc_ocr_text,
        )
        _log.info(
            "_run_extract_md_tables: DONE report_id=%s tables_detected=%s pushed=%s",
            report_id,
            result.get("tables_detected"),
            result.get("pushed"),
        )
    except Exception as exc:
        _log.error(
            "_run_extract_md_tables: FAILED report_id=%s error=%s",
            report_id,
            exc,
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
        If VN HOSE is open (Mon–Fri 02:00–08:59 UTC), returns HTTP 503 IMMEDIATELY.
        No model is loaded. No inference runs. RSS stays at cold-start baseline.
    """

    report_id: str
    pdf_path: str


# ---------------------------------------------------------------------------
# AR-PDF FR-1/FR-2 — New request schemas
# ---------------------------------------------------------------------------


class RasterizeRequestSchema(BaseModel):
    """
    POST /api/rasterize — on-demand page rasterization request.

    AR-PDF FR-1 AC-FR1.3: rasterize specific pages of a PDF report.
    Idempotent: already-present pages are returned without re-rendering.

    Fields:
        report_id: Report identifier (used as output subdirectory name).
        filename:  PDF filename (basename only) — resolved to data/pdfs/{filename}.
        pages:     List of 1-indexed page numbers to rasterize.
    """

    report_id: str
    filename: str
    pages: list[int]


async def _run_extract_layout_first(
    use_case: "ExtractLayoutFirstUseCase",
    report_id: str,
    pdf_path: str,
) -> None:
    """
    Background task wrapper for ExtractLayoutFirstUseCase.execute().

    Logs errors internally — background tasks must not raise (FastAPI swallows
    unhandled exceptions in background tasks silently; we want visibility).
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        result = await use_case.execute(
            report_id=report_id,
            pdf_path=pdf_path,
        )
        _log.info(
            "_run_extract_layout_first: DONE report_id=%s "
            "units_total=%s units_passing=%s units_quarantined=%s pushed=%s",
            report_id,
            result.get("units_total"),
            result.get("units_passing"),
            result.get("units_quarantined"),
            result.get("pushed"),
        )
    except Exception as exc:
        _log.error(
            "_run_extract_layout_first: FAILED report_id=%s error=%s",
            report_id,
            exc,
        )


async def _run_pek_extract(
    pek_adapter: Any,
    push_client: Any,
    report_id: str,
    pdf_path: str,
) -> None:
    """
    Background task: run PEK extraction and push results via LayoutFirstPushClient.

    PEK-INTEGRATE: calls PekEngineAdapter.extract_layout_and_tables(), then
    pushes the result payload to mcp-server POST /api/push-bctc-layout
    via the existing LayoutFirstPushClient (unchanged contract).

    BTB-UNBLOCK-DEV observability contract:
      - FAIL-LOUD: exceptions are logged with full traceback (exc_info=True).
        A failed extraction is never silently invisible — ops/QA can search
        for "FAILED" in logs and get the full cause without digging further.
      - ECHO-vs-DB: the DONE log distinguishes between the push-client return
        value (mcp-server echo / input echo — NOT a DB commit count per
        project_mcp_server_write_wedge) and the persisted DB count (which this
        handler cannot observe directly — ops must verify via in-container
        market.db COUNT query).
    """
    import logging as _logging
    _log = _logging.getLogger(__name__)
    try:
        result = pek_adapter.extract_layout_and_tables(
            pdf_path=pdf_path,
            report_id=report_id,
        )
        push_result = await push_client.push_layout(
            report_id=report_id,
            document_map=result.get("document_map", {}),
            units=result.get("units", []),
            page_zones=result.get("page_zones", []),
            pass_rate_report=result.get("pass_rate_report", {}),
        )
        # BTB-UNBLOCK-DEV ECHO-vs-DB: push_result values come from the mcp-server
        # HTTP response body (input echo) — NOT a committed DB row count.
        # Per project_mcp_server_write_wedge: pushBctcLayoutHandler echoes the
        # input length, not the rows actually stored in SQLite.
        # "push_echo" = what mcp-server returned; "db_count" = UNKNOWN from here.
        # Ops MUST verify persistence directly: bun -e "SELECT COUNT(*) ..." in-container.
        _log.info(
            "_run_pek_extract: DONE report_id=%s "
            "push_echo_units=%s push_echo_pages=%s "
            "(NOTE: these are mcp-server echo values, NOT committed DB row counts — "
            "verify db_count via in-container market.db COUNT query)",
            report_id,
            push_result.get("units_stored"),
            push_result.get("pages_stored"),
        )
    except Exception as exc:
        # BTB-UNBLOCK-DEV FAIL-LOUD: log full traceback (exc_info=True).
        # A silent "error=%s" with no traceback was the root cause of the
        # "cycle1 units_stored=28 but DB=0" confusion — the real error was invisible.
        # exc_info=True guarantees the full stack is in the log for ops diagnosis.
        _log.error(
            "_run_pek_extract: FAILED report_id=%s — full traceback follows",
            report_id,
            exc_info=True,
        )


def register_routes(
    router: APIRouter,
    extract_usecase: ExtractPDFUseCase,
    inspection_store: InspectionStore,
    extract_tables_usecase: Optional[ExtractTablesUseCase] = None,
    extract_md_tables_usecase: Optional[ExtractMdTablesUseCase] = None,
    extract_layout_first_usecase: Optional["ExtractLayoutFirstUseCase"] = None,
    pek_engine_adapter: Optional[Any] = None,
    pek_push_client: Optional[Any] = None,
    ocr_text_source: Optional[Any] = None,
    ocr_source_ok: bool = True,
    pdf_data_dir: str = "data/pdfs",
    local_extract_usecase: Optional[ExtractPDFUseCase] = None,
) -> None:
    """Attach all routes to the given APIRouter."""

    # ----------------------------------------------------------------
    # Core routes
    # ----------------------------------------------------------------

    @router.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Liveness probe.

        FU-1 RISK-1: ocr_source_ok reflects startup probe for SqliteOcrTextSource.
        False = MARKET_DB_PATH wrong or volume unmounted — /page-text will return
        source_reachable:false. Fix before running refine to avoid fabrication.
        """
        return HealthResponse(ocr_source_ok=ocr_source_ok)

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

    @router.post("/extract-md-tables", status_code=status.HTTP_202_ACCEPTED)
    async def extract_md_tables(
        body: ExtractMdTablesRequestSchema,
        background_tasks: BackgroundTasks,
    ) -> dict:
        """
        POST /extract-md-tables

        MD-EXTRACT: trigger generic bbox-based markdown table extraction for ALL
        pages of the specified PDF. Returns 202 Accepted immediately; the actual
        extraction and push run as a fire-and-forget background task.

        Accepts:  { report_id: str, pdf_path: str, doc_ocr_text?: str }
        Returns:  { status: "accepted", report_id: str }  (HTTP 202)

        Requires: extract_md_tables_usecase injected at composition root (main.py).
        Returns HTTP 503 if the use case is not wired (graceful degrade).
        """
        if extract_md_tables_usecase is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"status": "failed", "error": "extract_md_tables_usecase not configured"},
            )

        background_tasks.add_task(
            _run_extract_md_tables,
            extract_md_tables_usecase,
            body.report_id,
            body.pdf_path,
            body.doc_ocr_text,
        )

        return {"status": "accepted", "report_id": body.report_id}

    @router.post("/extract-layout-first", status_code=status.HTTP_202_ACCEPTED)
    async def extract_layout_first(
        body: ExtractLayoutFirstRequestSchema,
        background_tasks: BackgroundTasks,
    ) -> dict:
        """
        POST /extract-layout-first

        LF-EXTRACT: trigger Tier 0-3 layout-first extraction for one document.
        Returns 202 Accepted immediately; extraction runs as background task.

        AC-LFE-9: sequential single-doc only. No batch. No concurrency.
        Never invokes run_bctc_batch_sweep.

        Accepts:  { report_id: str, pdf_path: str }
        Returns:  { status: "accepted", report_id: str }  (HTTP 202)

        Requires: extract_layout_first_usecase injected at composition root.
        Returns HTTP 503 if not wired (graceful degrade).
        """
        if extract_layout_first_usecase is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "status": "failed",
                    "error": "extract_layout_first_usecase not configured",
                },
            )

        background_tasks.add_task(
            _run_extract_layout_first,
            extract_layout_first_usecase,
            body.report_id,
            body.pdf_path,
        )

        return {"status": "accepted", "report_id": body.report_id}

    @router.post("/pek-extract", status_code=status.HTTP_202_ACCEPTED)
    async def pek_extract(
        body: PekExtractRequestSchema,
        background_tasks: BackgroundTasks,
    ) -> dict:
        """
        POST /pek-extract

        PEK-INTEGRATE: trigger PDF-Extract-Kit layout+table extraction for one document.
        Returns 202 Accepted immediately; extraction runs as background task.

        Market-hours guard (REQ-PEK-11 Layer 2 — AC-PEK-NEW-1, CRITICAL):
            If VN HOSE is open (Mon-Fri 02:00-08:59 UTC), returns HTTP 503 IMMEDIATELY.
            No model loaded. No inference. RSS stays at cold-start baseline (~80MB).

        Sequential guard (REQ-PEK-4d):
            PekEngineAdapter uses threading.Semaphore(1). Contention → HTTP 429.

        Accepts:  { report_id: str, pdf_path: str }
        Returns:  { status: "accepted", report_id: str }  (HTTP 202)
                  { error: "market_open", retry_after: "after 15:00 ICT (08:00 UTC)" }  (HTTP 503, during 02:00-07:59 UTC Mon-Fri)

        Requires: pek_engine_adapter + pek_push_client injected at composition root.
        Returns HTTP 503 if not wired (graceful degrade, same as other endpoints).
        """
        # Layer 2: market-hours guard — BEFORE any model check or adapter call.
        # AC-PEK-NEW-1: 503 returned, no model load, RSS unchanged.
        if is_vn_market_open_utc():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": "market_open",
                    "retry_after": "after 15:00 ICT (08:00 UTC)",
                    "message": (
                        "PEK extraction blocked during VN HOSE trading hours "
                        "(Mon-Fri 02:00-07:59 UTC). No model loaded."
                    ),
                },
            )

        if pek_engine_adapter is None or pek_push_client is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "status": "failed",
                    "error": "pek_engine_adapter not configured",
                },
            )

        background_tasks.add_task(
            _run_pek_extract,
            pek_engine_adapter,
            pek_push_client,
            body.report_id,
            body.pdf_path,
        )

        return {"status": "accepted", "report_id": body.report_id}

    @router.post("/extract")
    async def extract_pdf(body: ExtractPDFRequestSchema) -> dict:
        """
        POST /extract

        FEAT-PDF-EXTRACTOR-LOCAL-INPUT: accepts either url OR pdf_path.

        url mode (original):
            Accepts: {url: str, source_type?, priority?}
            Storage: HTTPPDFStorageRepository (aiohttp GET)

        pdf_path mode (new):
            Accepts: {pdf_path: str, source_type?, priority?}
            Storage: LocalPDFStorageRepository (local file read)
            Constraint: pdf_path must be an absolute path under /app/data/pdfs.
            The mcp-server and pdf-extractor share volume ./data/pdfs:/app/data/pdfs
            so any already-downloaded PDF is reachable without an HTTP round-trip.

        Returns: ExtractPDFResponse JSON (identical schema for both modes)

        HTTP 503: returned when pdf_path mode is requested but local_extract_usecase
            is not wired at composition root (graceful degrade — same pattern as
            other optional use cases in this service).
        """
        try:
            request_dto = body.to_dto()

            # FEAT-PDF-EXTRACTOR-LOCAL-INPUT: route to local use case when pdf_path set.
            if request_dto.pdf_path:
                if local_extract_usecase is None:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail={
                            "status": "failed",
                            "error": "local_extract_usecase not configured — "
                                     "pdf_path mode unavailable",
                        },
                    )
                response = await local_extract_usecase.execute(request_dto)
            else:
                response = await extract_usecase.execute(request_dto)

            return response.to_json()
        except HTTPException:
            raise
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

    # ----------------------------------------------------------------
    # AR-PDF FR-1 / FR-2 — Page rasterizer + OCR text endpoints
    # ----------------------------------------------------------------

    @router.post("/rasterize")
    async def rasterize_pages(body: RasterizeRequestSchema) -> dict:
        """
        POST /api/rasterize

        AR-PDF FR-1 AC-FR1.3: on-demand rasterization for missing pages.

        Resolves filename → PDF path under data/pdfs/.
        Calls rasterize_page() for each page only if PNG is missing (idempotent).
        Already-present pages are counted in the response without re-rendering.

        Accepts:  { report_id: str, filename: str, pages: list[int] }
        Returns:  { rasterized: list[int], paths: list[str] }
        Auth: none (internal service — same Docker network).

        Returns HTTP 503 if page_rasterizer is not importable (missing pymupdf).
        """
        import logging as _log_mod
        _log = _log_mod.getLogger(__name__)

        try:
            from infrastructure.page_rasterizer import rasterize_page
        except ImportError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": f"page_rasterizer unavailable: {exc}"},
            ) from exc

        pdf_path = os.path.join(pdf_data_dir, body.filename)
        if not os.path.exists(pdf_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "pdf_not_found",
                    "filename": body.filename,
                    "resolved_path": pdf_path,
                },
            )

        import fitz  # type: ignore
        try:
            doc = fitz.open(pdf_path)
            page_count = doc.page_count
            doc.close()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": f"cannot_open_pdf: {exc}"},
            ) from exc

        dpi_env = int(os.getenv("BCTC_RASTER_DPI", "150"))
        rasterized: list[int] = []
        paths: list[str] = []

        for page_num in body.pages:
            if page_num < 1 or page_num > page_count:
                _log.warning(
                    "rasterize_pages: skip page=%d (out of range, pdf has %d pages) "
                    "report_id=%s",
                    page_num,
                    page_count,
                    body.report_id,
                )
                continue
            try:
                out_path = rasterize_page(
                    pdf_path=pdf_path,
                    report_id=body.report_id,
                    page_number=page_num,
                    dpi=dpi_env,
                )
                rasterized.append(page_num)
                paths.append(str(out_path))
            except Exception as exc:
                _log.error(
                    "rasterize_pages: FAILED page=%d report_id=%s error=%s",
                    page_num,
                    body.report_id,
                    exc,
                )

        return {"rasterized": rasterized, "paths": paths}

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
