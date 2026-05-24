"""
PDF Extractor — FastAPI application entry point.

Wires all DDD layers:
  Config → Infrastructure → Domain Service → Application UseCase → Interface Handler

Port: 5001 (configurable via $PORT env var)
"""

import logging

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware

from infrastructure.config import Config
from infrastructure.lifespan import build_lifespan
from infrastructure.startup import ensure_dirs
from infrastructure.repositories import (
    SQLitePDFDocumentRepository,
    HTTPPDFStorageRepository,
)
from infrastructure.extraction_engine import PdfplumberExtractionEngine
from domain.services import ExtractPDFService
from application.usecases import ExtractPDFUseCase
from interface.handlers import register_routes


def create_app() -> FastAPI:
    """
    Application factory — builds the FastAPI app with all dependencies wired.

    Separated from module-level instantiation so tests can call create_app()
    with custom env variables without side effects.
    """
    cfg = Config.from_env()

    ensure_dirs(cfg)

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
    app = FastAPI(
        title="PDF Extractor",
        version="1.0.0",
        description="Extracts structured content from Vietnamese BCTC financial PDFs.",
        lifespan=build_lifespan(cfg),
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
