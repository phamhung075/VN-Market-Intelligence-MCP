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
from infrastructure.ocr_adapter import PdfOcrAdapter  # BT-3-D
from infrastructure.generic_md_table_extractor import GenericMdTableExtractor  # MD-EXTRACT
from infrastructure.generic_md_table_extractor import (  # LF-EXTRACT
    build_document_map,
    zone_page,
    ocr_unit,
)
from infrastructure.md_table_push_client import MdTablePushClient  # MD-EXTRACT
from infrastructure.ocr_text_fetch_client import OcrTextFetchClient  # MD-EXTRACT-2 + LF-EXTRACT
from infrastructure.layout_first_push_client import LayoutFirstPushClient  # LF-EXTRACT
from infrastructure.pek_engine_adapter import PekEngineAdapter  # PEK-INTEGRATE
from domain.services import ExtractPDFService
from application.usecases import ExtractPDFUseCase
from application.extract_tables_usecase import ExtractTablesUseCase
from application.extract_md_tables_usecase import ExtractMdTablesUseCase  # MD-EXTRACT
from application.extract_layout_first_usecase import ExtractLayoutFirstUseCase  # LF-EXTRACT
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

    # --- BT-3-B + BT-5 + BT-3-D: TEXT-path table extraction use case + cross-check gate ---
    table_extractor = TextTableExtractor()
    table_push_client = TablePushClient(mcp_server_url=cfg.mcp_server_url)
    alert_adapter = TelegramAlertAdapter()  # BT-5: WORK-channel alert (creds from env)
    ocr_adapter = PdfOcrAdapter()           # BT-3-D: auto-locate BS pages + Tesseract OCR
    extract_tables_usecase = ExtractTablesUseCase(
        table_extractor=table_extractor,
        table_push_client=table_push_client,
        alert_port=alert_adapter,   # BT-5: injected AlertPort
        ocr_port=ocr_adapter,       # BT-3-D: injected OcrPort (real Tesseract path)
    )

    # --- MD-EXTRACT / MD-EXTRACT-2: generic markdown table extraction use case ---
    md_table_extractor = GenericMdTableExtractor()
    md_table_push_client = MdTablePushClient(mcp_server_url=cfg.mcp_server_url)
    ocr_fetch_client = OcrTextFetchClient(mcp_server_url=cfg.mcp_server_url)  # MD-EXTRACT-2
    extract_md_tables_usecase = ExtractMdTablesUseCase(
        md_extractor=md_table_extractor,
        md_push_client=md_table_push_client,
        ocr_fetch_client=ocr_fetch_client,  # MD-EXTRACT-2: auto-fetch OCR text
    )

    # --- LF-EXTRACT: layout-first Tier 0-3 extraction use case ---
    layout_push_client = LayoutFirstPushClient(mcp_server_url=cfg.mcp_server_url)
    # ocr_fetch_client already instantiated above; reuse (implements both ports)
    extract_layout_first_usecase = ExtractLayoutFirstUseCase(
        push_client=layout_push_client,
        ocr_pages_client=ocr_fetch_client,  # implements OcrPagesFetchClientPort
        build_document_map_fn=build_document_map,
        zone_page_fn=zone_page,
        ocr_unit_fn=ocr_unit,
    )

    # --- PEK-INTEGRATE: PDF-Extract-Kit engine adapter ---
    # Lazy singleton: models load on first extraction call (cold-start RSS ~80MB).
    # Sequential guard: threading.Semaphore(1) inside PekEngineAdapter.
    # Market-hours guard (Layer 1): CRON_BCTC_REPARSE_JOB env var in docker-compose.yml.
    # Market-hours guard (Layer 2): handled at route level in interface/handlers.py.
    pek_adapter = PekEngineAdapter()
    # PEK push client reuses existing LayoutFirstPushClient (same contract).
    pek_push_client = LayoutFirstPushClient(mcp_server_url=cfg.mcp_server_url)

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
    register_routes(
        router,
        extract_usecase,
        inspection_store,
        extract_tables_usecase,
        extract_md_tables_usecase,
        extract_layout_first_usecase=extract_layout_first_usecase,  # LF-EXTRACT
        pek_engine_adapter=pek_adapter,     # PEK-INTEGRATE
        pek_push_client=pek_push_client,    # PEK-INTEGRATE: reuses LayoutFirstPushClient
    )
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
