"""
PDF Extractor — FastAPI application entry point.

Wires all DDD layers:
  Config → Infrastructure → Domain Service → Application UseCase → Interface Handler

Port: 5001 (configurable via $PORT env var)
"""

import logging
import os
import sqlite3
from concurrent.futures import ProcessPoolExecutor

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware

from infrastructure.config import Config
from infrastructure.lifespan import build_lifespan
from infrastructure.startup import ensure_dirs
from infrastructure.repositories import (
    SQLitePDFDocumentRepository,
    HTTPPDFStorageRepository,
    LocalPDFStorageRepository,
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
from infrastructure.ocr_backends import select_ocr_backend  # PEK-IMPL-OCR
from infrastructure.ocr_text_source_factory import select_ocr_text_source  # FU-1
from domain.services import ExtractPDFService
from application.usecases import ExtractPDFUseCase
from application.extract_tables_usecase import ExtractTablesUseCase
from application.extract_md_tables_usecase import ExtractMdTablesUseCase  # MD-EXTRACT
from application.extract_layout_first_usecase import ExtractLayoutFirstUseCase  # LF-EXTRACT
from infrastructure.doclang_serializer import (  # DOCLANG-SERIALIZE
    DocLangSerializer,
    FilesystemDocLangWriteAdapter,
)
from application.doclang_serialize_usecase import DocLangSerializeUseCase  # DOCLANG-SERIALIZE
from interface.handlers import register_routes

logger = logging.getLogger(__name__)


def _probe_ocr_source(market_db_path: str) -> bool:
    """
    FU-1 RISK-1: Startup probe for SqliteOcrTextSource.

    Attempts SELECT 1 FROM pdf_extracted_text LIMIT 1 via read-only URI.
    Returns True if the table is reachable, False otherwise.

    On failure, logs FATAL at ERROR level so ops can see it in container logs.
    The app MUST still start (do not raise) — container must be up to diagnose.
    The return value is surfaced in /health ocr_source_ok field.
    """
    uri = f"file:{market_db_path}?mode=ro"
    try:
        conn = sqlite3.connect(uri, uri=True)
        try:
            conn.execute("SELECT 1 FROM pdf_extracted_text LIMIT 1")
        finally:
            conn.close()
        logger.info(
            "FU-1 startup probe: OCR text source reachable at %s — /page-text is live",
            market_db_path,
        )
        return True
    except Exception as exc:
        logger.error(
            "FATAL: OCR text source unreachable at %s — /page-text will return '' for ALL pages. "
            "Re-refine WILL fabricate. Fix MARKET_DB_PATH or volume mount before running refine. "
            "error=%s",
            market_db_path,
            exc,
        )
        return False


def create_app() -> FastAPI:
    """
    Application factory — builds the FastAPI app with all dependencies wired.

    Separated from module-level instantiation so tests can call create_app()
    with custom env variables without side effects.
    """
    cfg = Config.from_env()

    ensure_dirs(cfg)

    # FU-1: OCR text source — wire SqliteOcrTextSource via factory.
    # BCTC_PAGE_TEXT_BACKEND=sqlite is set in docker-compose.yml → factory selects
    # SqliteOcrTextSource(cfg.market_db_path) automatically.
    ocr_text_source = select_ocr_text_source(cfg.market_db_path)

    # FU-1 RISK-1: startup self-check — fires once after ocr_text_source is built.
    # On failure: ERROR log + ocr_source_ok=False in /health. App still starts.
    ocr_source_ok = _probe_ocr_source(cfg.market_db_path)

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

    # --- FEAT-PDF-EXTRACTOR-LOCAL-INPUT: local-file use case ---
    # Same doc_repo + engine as HTTP mode; storage reads from shared volume
    # ./data/pdfs:/app/data/pdfs instead of fetching over HTTP.
    # PDF_LOCAL_SIZE_CAP_MB env var controls size cap (default 200 MB).
    _pdf_data_dir = os.getenv("PDF_DIR", "/app/data/pdfs")
    local_storage_repo = LocalPDFStorageRepository(
        storage_dir=cfg.storage_dir,
        pdf_data_dir=_pdf_data_dir,
    )
    local_extract_service = ExtractPDFService(
        doc_repo=doc_repo,
        storage_repo=local_storage_repo,
        engine=engine,
    )
    local_extract_usecase = ExtractPDFUseCase(extract_service=local_extract_service)

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

    # PDFX-SINGLE-WORKER-BLOCKING: ProcessPoolExecutor isolates Tesseract CPU into a
    # separate OS process so the uvicorn event loop process stays schedulable by the OS
    # even when OCR saturates CPU at 100%+. max_workers=1 matches D6 host-safety (no
    # parallel Tesseract processes on the 16GB Mac — matches PekEngineAdapter Semaphore(1)).
    # Shutdown is handled in lifespan (build_lifespan receives the executor reference).
    ocr_executor = ProcessPoolExecutor(max_workers=1)

    extract_tables_usecase = ExtractTablesUseCase(
        table_extractor=table_extractor,
        table_push_client=table_push_client,
        alert_port=alert_adapter,       # BT-5: injected AlertPort
        ocr_port=ocr_adapter,           # BT-3-D: injected OcrPort (real Tesseract path)
        ocr_executor=ocr_executor,      # PDFX-SINGLE-WORKER-BLOCKING: process pool
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

    # --- DOCLANG-SERIALIZE: DocLang XML serializer (additive output only) ---
    _doclang_serializer = DocLangSerializer(bbox_provider=None)  # Phase 1: no geometry
    _doclang_write_adapter = FilesystemDocLangWriteAdapter(
        output_dir=cfg.doclang_output_dir
    )
    doclang_serialize_usecase = DocLangSerializeUseCase(
        serializer=_doclang_serializer,
        write_port=_doclang_write_adapter,
    )

    # --- PEK-INTEGRATE: PDF-Extract-Kit engine adapter ---
    # Lazy singleton: models load on first extraction call (cold-start RSS ~80MB).
    # Sequential guard: threading.Semaphore(1) inside PekEngineAdapter.
    # Market-hours guard (Layer 1): CRON_BCTC_REPARSE_JOB env var in docker-compose.yml.
    # Market-hours guard (Layer 2): handled at route level in interface/handlers.py.
    #
    # PEK-IMPL-OCR: OCR backend selection via OCR_TEXT_BACKEND env var.
    # Default (unset or "tesseract-vie"): TesseractVieBackend (proven for Vietnamese BCTC).
    # "paddleocr": PaddleOcrBackend (PaddleOCR PP-StructureV2 direct).
    # "auto": AutoFallbackOcrBackend (Tesseract-first; PaddleOCR on low confidence).
    # paddle_table is not yet loaded at composition-root time (lazy singleton).
    # select_ocr_backend() is called here with paddle_table=None; PaddleOcrBackend/
    # AutoFallbackOcrBackend will have no paddle instance until the first extraction
    # call loads models. For the pluggable architecture, the ocr_backend is passed
    # into PekEngineAdapter and used at extraction time — models are already loaded
    # by then (lazy singleton ensures models exist before _run_table_extraction runs).
    #
    # NOTE: For "paddleocr" or "auto" modes that need the real paddle_table, the
    # adapter calls self._ocr_backend.recognize_text() after models are loaded.
    # The PaddleOcrBackend receives paddle_table=None here but _pek_models_cache
    # provides the real paddle_table to _run_table_extraction which holds it in
    # scope. PaddleOcrBackend wraps the same ocr() call with its own paddle_table
    # slot. If OCR_TEXT_BACKEND=paddleocr|auto, construct the backend AFTER models
    # load via deferred wiring (see note in ocr_backends.py select_ocr_backend).
    # For the test harness and default (tesseract-vie), paddle_table=None is fine.
    _ocr_text_backend = select_ocr_backend(paddle_table=None)
    pek_adapter = PekEngineAdapter(ocr_backend=_ocr_text_backend)
    # PEK push client reuses existing LayoutFirstPushClient (same contract).
    pek_push_client = LayoutFirstPushClient(mcp_server_url=cfg.mcp_server_url)

    # --- FastAPI app ---
    app = FastAPI(
        title="PDF Extractor",
        version="1.0.0",
        description="Extracts structured content from Vietnamese BCTC financial PDFs.",
        lifespan=build_lifespan(cfg, ocr_executor=ocr_executor),
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
        ocr_text_source=ocr_text_source,    # FU-1: wires /page-text handler
        ocr_source_ok=ocr_source_ok,        # FU-1 RISK-1: startup probe result → /health
        local_extract_usecase=local_extract_usecase,  # FEAT-PDF-EXTRACTOR-LOCAL-INPUT
        doclang_serialize_usecase=doclang_serialize_usecase,  # DOCLANG-SERIALIZE
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
