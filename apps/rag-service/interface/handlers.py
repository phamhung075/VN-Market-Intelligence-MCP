"""
Interface — FastAPI route handlers (thin HTTP layer).

Handlers delegate all business logic to application usecases.
HTTP concerns (status codes, serialization) are handled here.
"""

import logging

from fastapi import APIRouter, HTTPException, status

from application.usecases import SearchUseCase, IndexUseCase
from interface.serializers import (
    SearchRequestSchema,
    IndexRequestSchema,
    HealthResponse,
)

logger = logging.getLogger(__name__)


def register_routes(
    router: APIRouter,
    search_usecase: SearchUseCase,
    index_usecase: IndexUseCase,
) -> None:
    """Attach all routes to the given APIRouter."""

    @router.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Liveness probe."""
        return HealthResponse()

    @router.post("/search")
    async def search(body: SearchRequestSchema) -> dict:
        """
        POST /search

        Accepts: {query, limit?, decay_half_life_days?, max_distance?, level?, action_code?,
                  ticker?, sector?, source_domain?, depth_tier?, doc_type?}
        Returns: {results: [SearchResultDTO], total: int}

        FR-3: Invalid depth_tier or doc_type → HTTP 400 with descriptive error.
        """
        try:
            request_dto = body.to_dto()
            response = await search_usecase.execute(request_dto)
            return response.to_json()
        except ValueError as exc:
            # FR-3: Validation errors from filter parameters (invalid depth_tier, doc_type, ticker)
            logger.warning("Search validation error: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"status": "invalid_request", "error": str(exc)},
            ) from exc
        except Exception as exc:
            logger.exception("Search failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"status": "failed", "error": str(exc)},
            ) from exc

    @router.post("/index")
    async def index(body: IndexRequestSchema) -> dict:
        """
        POST /index

        Accepts: {id, content, tags?, level?, title?, summary?, action_code?}
        Returns: {status: "ok", indexed: 1, entry_id: str}
        """
        try:
            request_dto = body.to_dto()
            response = await index_usecase.execute(request_dto)
            return response.to_json()
        except Exception as exc:
            logger.exception("Index failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"status": "failed", "error": str(exc)},
            ) from exc
