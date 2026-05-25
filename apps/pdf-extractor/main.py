"""
PDF Extractor — FastAPI application entry point.

Wires all DDD layers:
  Config → Infrastructure → Domain Service → Application UseCase → Interface Handler

Port: 5001 (configurable via $PORT env var)
"""

import logging
import os

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
from infrastructure.inspection_store import InspectionStore
from infrastructure.text_table_extractor import TextTableExtractor
from infrastructure.table_push_client import TablePushClient
from infrastructure.alert_adapter import TelegramAlertAdapter  # BT-5
from domain.services import ExtractPDFService
from application.usecases import ExtractPDFUseCase
from application.extract_tables_usecase import ExtractTablesUseCase
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

    # --- Inspection store (SI-2: PDF viewer surface) ---
    inspection_store = InspectionStore(
        db_path=cfg.db_path,
        pdf_dir=os.getenv("PDF_DIR", "/app/data/pdfs"),
        extraction_dir=cfg.storage_dir,
    )

    # --- BT-3-B + BT-5: TEXT-path table extraction use case + cross-check gate ---
    table_extractor = TextTableExtractor()
    table_push_client = TablePushClient(mcp_server_url=cfg.mcp_server_url)
    alert_adapter = TelegramAlertAdapter()  # BT-5: WORK-channel alert (creds from env)
    extract_tables_usecase = ExtractTablesUseCase(
        table_extractor=table_extractor,
        table_push_client=table_push_client,
        alert_port=alert_adapter,  # BT-5: injected AlertPort
    )

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
    register_routes(router, extract_usecase, inspection_store, extract_tables_usecase)
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
