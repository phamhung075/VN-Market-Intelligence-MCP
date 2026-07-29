"""
Interface — POST /pek-extract route.

FACTORY-PDF-split-handlers: extracted from interface/handlers.py.

NOTE: this module's dotted path (interface.routes_pek) is load-bearing —
scenarios/pek_single_doc_extraction.py patches "interface.routes_pek.
is_vn_market_open_utc" to simulate open/closed market hours. Do not re-import
is_vn_market_open_utc through an indirection that would break that patch target.
"""

from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

# Domain import is permitted in interface layer (interface → domain is valid DDD flow).
from domain.primitives.market_hours.primitive import is_vn_market_open_utc
from interface.pek_run_helper import _run_pek_extract
from interface.schemas import PekExtractRequestSchema


def register_pek_routes(
    router: APIRouter,
    pek_engine_adapter: Optional[Any] = None,
    pek_push_client: Optional[Any] = None,
) -> None:
    """Attach POST /pek-extract to the given APIRouter."""

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
