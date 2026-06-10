"""
Interface — FastAPI route handlers (thin HTTP layer).

Handlers delegate all business logic to application usecases.
HTTP concerns (status codes, serialization) are handled here.
"""

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

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
    vector_store: Any = None,
    embedder: Any = None,
) -> None:
    """Attach all routes to the given APIRouter.

    vector_store: optional VectorStorePort instance needed for /admin/rebuild-fts
    and /embed/health.  If not provided those endpoints return 503.
    embedder: optional EmbedderPort instance needed for /embed/health model probe.
    """

    @router.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        """Liveness probe."""
        return HealthResponse()

    @router.get("/embed/health")
    async def embed_health() -> Response:
        """Capability probe — verifies sentence-transformer model + LanceDB index.

        GFD-7: read-only, non-blocking.
        Returns 200 {"status":"ok","model_loaded":true,"index_size":<int>,"model_name":"<str>"}
        Returns 503 {"status":"error","reason":"<str>"} on any failure.
        """
        try:
            if embedder is None:
                return Response(
                    status_code=503,
                    content=json.dumps({"status": "error", "reason": "embedder not wired"}),
                    media_type="application/json",
                )

            # Test 1: model loaded — _model is None until initialize()/first embed call.
            model_obj = getattr(embedder, "_model", None)
            if model_obj is None:
                return Response(
                    status_code=503,
                    content=json.dumps({"status": "error", "reason": "model not loaded"}),
                    media_type="application/json",
                )

            # 1-token encode smoke test (synchronous, non-blocking for a single token).
            model_obj.encode("a", convert_to_tensor=False, show_progress_bar=False)

            # Test 2: LanceDB row count (0 acceptable on fresh deploy).
            index_size = 0
            if vector_store is not None:
                index_size = await vector_store.count()

            model_name: str = getattr(embedder, "_model_name", "unknown")

            return Response(
                status_code=200,
                content=json.dumps({
                    "status": "ok",
                    "model_loaded": True,
                    "index_size": index_size,
                    "model_name": model_name,
                }),
                media_type="application/json",
            )
        except Exception as exc:
            logger.exception("embed_health probe failed")
            return Response(
                status_code=503,
                content=json.dumps({"status": "error", "reason": str(exc)}),
                media_type="application/json",
            )

    @router.post("/search")
    async def search(body: SearchRequestSchema) -> dict:
        """
        POST /search

        Accepts: {query, limit?, decay_half_life_days?, max_distance?, level?, action_code?,
                  ticker?, sector?, source_domain?, depth_tier?, doc_type?, hybrid?}
        Returns: {results: [SearchResultDTO], total: int}

        FR-3: Invalid depth_tier or doc_type → HTTP 400 with descriptive error.
        DFR-P3: hybrid=true routes to FTS+vector RRF hybrid path; hybrid=false (default) is vector-only.
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

    @router.post("/admin/rebuild-fts")
    async def rebuild_fts() -> dict:
        """
        POST /admin/rebuild-fts

        DFR-P3: Force rebuild both FTS indexes (title + summary).
        Called by daily cron (mcp-server) at ~02:00 UTC or on-demand.
        Internal only — port 5002 is not exposed externally.

        Returns: {"status": "ok", "message": "FTS indexes rebuilt"}
        """
        if vector_store is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"status": "error", "error": "vector_store not wired into router"},
            )
        try:
            await vector_store._build_fts_index()
            # Reset the lazy-init flag so the store knows index is fresh.
            vector_store._fts_index_built = True
            logger.info("[admin/rebuild-fts] FTS indexes rebuilt successfully.")
            return {"status": "ok", "message": "FTS indexes rebuilt"}
        except Exception as exc:
            logger.exception("FTS rebuild failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"status": "error", "error": str(exc)},
            ) from exc
