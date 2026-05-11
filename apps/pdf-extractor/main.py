"""
PDF Extractor — FastAPI application entry point.

Wires all DDD layers:
  Config → Infrastructure → Domain Service → Application UseCase → Interface Handler

Port: 5001 (configurable via $PORT env var)
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from infrastructure.config import Config
from infrastructure.repositories import (
    SQLitePDFDocumentRepository,
    HTTPPDFStorageRepository,
)
from infrastructure.extraction_engine import PdfplumberExtractionEngine
from domain.services import ExtractPDFService
from application.usecases import ExtractPDFUseCase
from interface.handlers import register_routes
from fastapi import APIRouter


def create_app() -> FastAPI:
    """
    Application factory — builds the FastAPI app with all dependencies wired.

    Separated from module-level instantiation so tests can call create_app()
    with custom env variables without side effects.
    """
    cfg = Config.from_env()

    # Ensure storage directory exists
    os.makedirs(cfg.storage_dir, exist_ok=True)
    os.makedirs(os.path.dirname(cfg.db_path) or ".", exist_ok=True)

    # --- Infrastructure layer ---
    doc_repo = SQLitePDFDocumentRepository(db_path=cfg.db_path)
    storage_repo = HTTPPDFStorageRepository(storage_dir=cfg.storage_dir)
    engine = PdfplumberExtractionEngine()

    # --- Domain service ---
    extract_service = ExtractPDFService(
        doc_repo=doc_repo,
        storage_repo=storage_repo,
        engine=engine,
    )

    # --- Application use case ---
    extract_usecase = ExtractPDFUseCase(extract_service=extract_service)

    # --- FastAPI app ---
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        logging.basicConfig(level=getattr(logging, cfg.log_level.upper(), logging.INFO))
        logging.getLogger(__name__).info(
            "pdf-extractor starting on %s:%d", cfg.host, cfg.port
        )
        yield
        logging.getLogger(__name__).info("pdf-extractor shutting down")

    app = FastAPI(
        title="PDF Extractor",
        version="1.0.0",
        description="Extracts structured content from Vietnamese BCTC financial PDFs.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    router = APIRouter()
    register_routes(router, extract_usecase)
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
