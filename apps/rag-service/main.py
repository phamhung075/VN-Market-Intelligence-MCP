"""
RAG Service — FastAPI application entry point.

Wires all DDD layers:
  Config → Infrastructure → Domain Service → Application UseCase → Interface Handler

Port: 5002 (configurable via $PORT env var)
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import APIRouter

from infrastructure.config import Config
from infrastructure.embedder import SentenceTransformersEmbedder
from infrastructure.repositories import LanceDBVectorStore, SQLiteAnalysisRepository
from domain.services import SearchService
from application.usecases import SearchUseCase, IndexUseCase
from interface.handlers import register_routes


def create_app() -> FastAPI:
    """
    Application factory — builds the FastAPI app with all dependencies wired.

    Separated from module-level instantiation so tests can call create_app()
    with custom env variables without side effects.
    """
    cfg = Config.from_env()

    # Ensure storage directories exist
    os.makedirs(cfg.lancedb_path, exist_ok=True)
    os.makedirs(os.path.dirname(cfg.db_path) or ".", exist_ok=True)
    os.makedirs(cfg.embedding_cache_dir, exist_ok=True)

    # --- Infrastructure layer ---
    embedder = SentenceTransformersEmbedder(
        model_name=cfg.embedding_model,
        cache_dir=cfg.embedding_cache_dir,
    )
    vector_store = LanceDBVectorStore(db_path=cfg.lancedb_path)
    analysis_repo = SQLiteAnalysisRepository(db_path=cfg.db_path)

    # --- Domain service ---
    search_service = SearchService()

    # --- Application use cases ---
    search_usecase = SearchUseCase(
        vector_store=vector_store,
        embedder=embedder,
        search_service=search_service,
    )
    index_usecase = IndexUseCase(
        vector_store=vector_store,
        embedder=embedder,
    )

    # --- FastAPI app ---
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        logging.basicConfig(level=getattr(logging, cfg.log_level.upper(), logging.INFO))
        log = logging.getLogger(__name__)
        log.info("rag-service starting on %s:%d", cfg.host, cfg.port)

        # Eagerly load embedding model on startup
        try:
            await embedder.initialize()
        except Exception as exc:
            log.warning("Embedding model preload failed (will retry on first request): %s", exc)

        yield
        log.info("rag-service shutting down")

    app = FastAPI(
        title="RAG Service",
        version="1.0.0",
        description="Vector search + temporal decay ranking for VN Market Intelligence.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    router = APIRouter()
    register_routes(router, search_usecase, index_usecase)
    app.include_router(router)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    cfg = Config.from_env()
    uvicorn.run(
        "main:app",
        host=cfg.host,
        port=cfg.port,
        log_level=cfg.log_level.lower(),
        reload=False,
    )
