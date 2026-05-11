"""
Interface — FastAPI route handlers (thin HTTP layer).

Handlers delegate all business logic to application usecases.
HTTP concerns (status codes, serialization) are handled here.
"""

from fastapi import APIRouter, HTTPException, status

from application.usecases import ExtractPDFUseCase
from interface.serializers import ExtractPDFRequestSchema, HealthResponse


def register_routes(router: APIRouter, extract_usecase: ExtractPDFUseCase) -> None:
    """Attach all routes to the given APIRouter."""

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
