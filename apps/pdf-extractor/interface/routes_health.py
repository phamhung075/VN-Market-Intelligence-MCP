"""
Interface — GET /health route.

FACTORY-PDF-split-handlers: extracted from interface/handlers.py.
"""

from fastapi import APIRouter

from interface.serializers import HealthResponse


def register_health_routes(router: APIRouter, ocr_source_ok: bool = True) -> None:
    """Attach GET /health to the given APIRouter."""

    @router.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Liveness probe.

        FU-1 RISK-1: ocr_source_ok reflects startup probe for SqliteOcrTextSource.
        False = MARKET_DB_PATH wrong or volume unmounted — /page-text will return
        source_reachable:false. Fix before running refine to avoid fabrication.

        FIX-PDFX-TESSERACT-CONCURRENCY (brief §5.2 / AC-6): ocr block publishes
        the concurrency gate's bookkeeping ALONGSIDE OS ground truth
        (semaphore count vs. actual live tesseract children via /proc) so the
        exact defect class this row exists to fix — "a counter that disagreed
        with reality" — is diagnosable from this endpoint alone.
        """
        import logging as _log_mod

        try:
            from infrastructure import ocr_gateway
            ocr_block = ocr_gateway.inflight()
        except Exception as exc:  # never let observability break liveness
            _log_mod.getLogger(__name__).warning(
                "health: ocr_gateway.inflight() failed: %s", exc
            )
            ocr_block = None

        return HealthResponse(ocr_source_ok=ocr_source_ok, ocr=ocr_block)
