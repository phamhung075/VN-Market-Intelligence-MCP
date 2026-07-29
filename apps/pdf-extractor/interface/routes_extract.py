"""
Interface — POST /extract route.

FACTORY-PDF-split-handlers: extracted from interface/handlers.py.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, status

from application.usecases import ExtractPDFUseCase
from domain.errors import OcrCapacityExceededError, OcrDeadlineExceededError
from interface.serializers import ExtractPDFRequestSchema


def register_extract_routes(
    router: APIRouter,
    extract_usecase: ExtractPDFUseCase,
    local_extract_usecase: Optional[ExtractPDFUseCase] = None,
) -> None:
    """Attach POST /extract to the given APIRouter."""

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
        except OcrCapacityExceededError as exc:
            # FIX-PDFX-TESSERACT-CONCURRENCY (brief §7 backpressure contract):
            # the OCR gateway's bounded queue wait elapsed — signal the caller
            # to back off rather than let the request queue indefinitely.
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
            # A single OCR call exceeded its bounded page deadline — the slot
            # HAS been released (this is the ratchet-break: bounded, not
            # permanent). Surfaced as 503 (transient) rather than 500.
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"status": "failed", "error": "ocr_deadline_exceeded", "message": str(exc)},
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"status": "failed", "error": str(exc)},
            ) from exc
