"""
Interface — POST /extract-md-tables route + its background-task runner.

FACTORY-PDF-split-handlers: extracted from interface/handlers.py.
"""

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from application.extract_md_tables_usecase import ExtractMdTablesUseCase
from interface.schemas import ExtractMdTablesRequestSchema


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


def register_md_tables_routes(
    router: APIRouter,
    extract_md_tables_usecase: Optional[ExtractMdTablesUseCase] = None,
) -> None:
    """Attach POST /extract-md-tables to the given APIRouter."""

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
