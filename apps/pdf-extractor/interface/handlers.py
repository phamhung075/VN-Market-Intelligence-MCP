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

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse, Response

from application.usecases import ExtractPDFUseCase
from infrastructure.inspection_store import InspectionStore
from interface.serializers import ExtractPDFRequestSchema, HealthResponse

# Viewer HTML template is co-located in the interface/ layer.
_VIEWER_HTML_PATH = Path(__file__).parent / "viewer.html"


def register_routes(
    router: APIRouter,
    extract_usecase: ExtractPDFUseCase,
    inspection_store: InspectionStore,
) -> None:
    """Attach all routes to the given APIRouter."""

    # ----------------------------------------------------------------
    # Core routes
    # ----------------------------------------------------------------

    @router.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Liveness probe."""
        return HealthResponse()

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
