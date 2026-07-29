"""
Interface — POST /extract-tables route.

FACTORY-PDF-split-handlers: extracted from interface/handlers.py.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, status

from application.extract_tables_usecase import ExtractTablesUseCase
from domain.errors import OcrCapacityExceededError, OcrDeadlineExceededError
from interface.schemas import ExtractTablesRequestSchema


def register_extract_tables_routes(
    router: APIRouter,
    extract_tables_usecase: Optional[ExtractTablesUseCase] = None,
) -> None:
    """Attach POST /extract-tables to the given APIRouter."""

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
        except OcrCapacityExceededError as exc:
            retry_after_s = max(1, int(round(getattr(exc, "retry_after_s", 5.0))))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "status": "failed",
                    "error": "ocr_capacity",
                    "retry_after_s": retry_after_s,
                },
                headers={"Retry-After": str(retry_after_s)},
            ) from exc
        except OcrDeadlineExceededError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"status": "failed", "error": "ocr_deadline_exceeded", "message": str(exc)},
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"status": "failed", "error": str(exc)},
            ) from exc
