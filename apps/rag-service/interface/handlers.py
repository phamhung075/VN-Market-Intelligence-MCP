# size-justification: 233L — one thin HTTP-layer file, register_routes() is this
# service's single FastAPI router composition point: /health, /embed/health,
# /search, /index, and the two admin index-rebuild endpoints (/admin/rebuild-fts,
# /admin/rebuild-vector-index — FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-
# RETURNED-TO-OS, 2026-08-12, +32L — deliberately mirrors the existing rebuild-fts
# handler's exact shape rather than a new abstraction). Splitting handlers into
# per-route files would fragment one small, cohesive router for zero benefit.
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
        """Capability probe — cold/warm state reporting. NEVER triggers model load.

        Cold (model not loaded yet): 200 {"status":"ok","model_loaded":false,"state":"cold",...}
        Warm (model loaded):         200 {"status":"ok","model_loaded":true,"state":"warm",...}
        503 ONLY on genuine failure (LanceDB unreachable, or model load previously failed).

        GFD-13: cold state is NORMAL — do NOT return 503 merely because model is not loaded.
        This handler is PURELY PASSIVE — it reads _model but NEVER calls _ensure_model_loaded().
        """
        try:
            if embedder is None:
                return Response(
                    status_code=503,
                    content=json.dumps({"status": "error", "reason": "embedder not wired"}),
                    media_type="application/json",
                )

            # LanceDB index_size — queryable without the model
            index_size = 0
            if vector_store is not None:
                index_size = await vector_store.count()

            model_name: str = getattr(embedder, "_model_name", "unknown")
            model_obj = getattr(embedder, "_model", None)
            load_error = getattr(embedder, "_load_error", None)

            # Surface a previous failed load attempt as 503
            if load_error is not None:
                return Response(
                    status_code=503,
                    content=json.dumps({
                        "status": "error",
                        "reason": f"model load failed: {load_error}",
                    }),
                    media_type="application/json",
                )

            if model_obj is None:
                # Cold state — normal, not an error
                return Response(
                    status_code=200,
                    content=json.dumps({
                        "status": "ok",
                        "model_loaded": False,
                        "state": "cold",
                        "index_size": index_size,
                        "model_name": model_name,
                    }),
                    media_type="application/json",
                )

            # Warm state — run 1-token smoke test to confirm model is callable
            model_obj.encode("a", convert_to_tensor=False, show_progress_bar=False)

            return Response(
                status_code=200,
                content=json.dumps({
                    "status": "ok",
                    "model_loaded": True,
                    "state": "warm",
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

    @router.post("/admin/rebuild-vector-index")
    async def rebuild_vector_index() -> dict:
        """
        POST /admin/rebuild-vector-index

        FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS: force rebuild
        the IVF_PQ ANN vector index on the 'vector' column. On-demand only —
        deliberately a SEPARATE endpoint from /admin/rebuild-fts, not wired onto any
        cron (see infrastructure/repositories.py's _VECTOR_INDEX_MIN_ROWS comment for
        why this stays decoupled from RAG-FTS-BUILD-MEMORY-BOUND's disabled nightly
        cron). Internal only — port 5002 is not exposed externally.

        Returns: {"status": "ok", "message": "Vector index rebuilt"}
        """
        if vector_store is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"status": "error", "error": "vector_store not wired into router"},
            )
        try:
            await vector_store._build_vector_index()
            # Reset the lazy-init flag so the store knows the index is fresh.
            vector_store._vector_index_built = True
            logger.info("[admin/rebuild-vector-index] Vector index rebuilt successfully.")
            return {"status": "ok", "message": "Vector index rebuilt"}
        except Exception as exc:
            logger.exception("Vector index rebuild failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"status": "error", "error": str(exc)},
            ) from exc
