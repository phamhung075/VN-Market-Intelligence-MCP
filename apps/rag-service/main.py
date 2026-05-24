"""RAG Service — composition root. Port: 5002. Business logic lives in domain/ and application/."""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, APIRouter

from infrastructure.config import Config
from infrastructure.embedder import SentenceTransformersEmbedder
from infrastructure.repositories import LanceDBVectorStore, SQLiteAnalysisRepository
from domain.services import SearchService
from application.usecases import SearchUseCase, IndexUseCase
from interface.handlers import register_routes
from app_factory import build_lifespan, add_cors_middleware


def create_app() -> FastAPI:
    """Wire config, infrastructure, use cases, and routes. Zero business logic."""
    cfg = Config.from_env()

    os.makedirs(cfg.lancedb_path, exist_ok=True)
    os.makedirs(os.path.dirname(cfg.db_path) or ".", exist_ok=True)
    os.makedirs(cfg.embedding_cache_dir, exist_ok=True)

    # Infrastructure adapters
    embedder = SentenceTransformersEmbedder(
        model_name=cfg.embedding_model,
        cache_dir=cfg.embedding_cache_dir,
    )
    vector_store = LanceDBVectorStore(db_path=cfg.lancedb_path)
    analysis_repo = SQLiteAnalysisRepository(db_path=cfg.db_path)

    # Application use cases (DI: inject adapters)
    search_service = SearchService()
    search_usecase = SearchUseCase(
        vector_store=vector_store,
        embedder=embedder,
        search_service=search_service,
    )
    index_usecase = IndexUseCase(
        vector_store=vector_store,
        embedder=embedder,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        async with build_lifespan(app, embedder, cfg):
            yield

    app = FastAPI(
        title="RAG Service",
        version="1.0.0",
        description="Vector search + temporal decay ranking for VN Market Intelligence.",
        lifespan=lifespan,
    )

    add_cors_middleware(app)

    router = APIRouter()
    register_routes(router, search_usecase, index_usecase)
    app.include_router(router)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    cfg = Config.from_env()
    uvicorn.run("main:app", host=cfg.host, port=cfg.port,
                log_level=cfg.log_level.lower(), reload=False)
