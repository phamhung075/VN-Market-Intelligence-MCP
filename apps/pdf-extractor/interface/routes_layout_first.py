"""
Interface — POST /extract-layout-first route + its background-task runner.

FACTORY-PDF-split-handlers: extracted from interface/handlers.py.
"""

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from application.extract_layout_first_usecase import ExtractLayoutFirstUseCase  # LF-EXTRACT
from interface.schemas import ExtractLayoutFirstRequestSchema


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


def register_layout_first_routes(
    router: APIRouter,
    extract_layout_first_usecase: Optional["ExtractLayoutFirstUseCase"] = None,
) -> None:
    """Attach POST /extract-layout-first to the given APIRouter."""

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
