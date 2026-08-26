"""
Interface — GET /pek-extract/{report_id} route.

FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S (AC-1):
kept in its own file (mirrors FACTORY-PDF-split-handlers precedent) rather
than folded into interface/routes_pek.py's POST handler, so that file stays
under the project's 120L/file size-lint threshold without needing a
size-justification header.

The 202 response from POST /pek-extract already hands the caller a job id
(report_id). This endpoint is what makes that job id's TERMINAL state
observable — a background task that dies now leaves a durable row in
PekExtractionStatusRepository (status="failed", error=<message>) instead of
only a traceback in stdout, and this route is how a caller reads it back.
"""

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, status


def register_pek_status_routes(
    router: APIRouter,
    pek_status_repo: Optional[Any] = None,
) -> None:
    """Attach GET /pek-extract/{report_id} to the given APIRouter."""

    @router.get("/pek-extract/{report_id}")
    async def pek_extract_status(report_id: str) -> dict:
        """
        GET /pek-extract/{report_id}

        Returns the durable, queryable terminal state of a previously-accepted
        /pek-extract job:
            { report_id, status: "accepted"|"done"|"failed", error, updated_at }

        status="accepted" and no later update means the background task is
        still running (or the worker died before writing a terminal state —
        AC-1 covers the exception path; a hard process kill is a different,
        larger failure mode this row does not close).

        Returns HTTP 404 if pek_status_repo is not wired, or if report_id was
        never accepted (no POST /pek-extract call recorded it).
        """
        if pek_status_repo is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "pek_status_repo not configured"},
            )

        record = pek_status_repo.get(report_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "no recorded /pek-extract attempt for this report_id"},
            )

        return record
