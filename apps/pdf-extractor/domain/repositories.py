"""
Domain — Abstract port definitions (repositories / engines).

All infrastructure implementations MUST satisfy these interfaces.
Domain layer: never imports infrastructure/ or interface/.

BT-5: AlertPort added — pure Protocol for WORK-channel alert emission.
Injected into ExtractTablesUseCase at the composition root.
Concrete adapter (infrastructure/) sends Telegram WORK alerts; test fake
records messages without I/O.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Protocol

from domain.models import PDFDocument, ExtractedContent, ExtractedTable
from typing import Any  # noqa: F401 (re-exported for adapter protocol use)


class PDFDocumentRepository(ABC):
    """Port: persistence layer for PDF document metadata."""

    @abstractmethod
    async def save(self, doc: PDFDocument) -> None:
        """Persist or update a PDFDocument (upsert by id)."""

    @abstractmethod
    async def find_by_id(self, doc_id: str) -> Optional[PDFDocument]:
        """Return document by id, or None if not found."""

    @abstractmethod
    async def find_pending(self) -> list[PDFDocument]:
        """Return all documents with status='pending'."""

    @abstractmethod
    async def find_all(self) -> list[PDFDocument]:
        """Return all documents (any status), ordered by extracted_at DESC."""


class PDFStorageRepository(ABC):
    """Port: file storage — fetch raw bytes + persist extracted JSON."""

    @abstractmethod
    async def fetch_pdf(self, url: str) -> bytes:
        """Download PDF from URL and return raw bytes."""

    @abstractmethod
    async def store_extraction(self, doc_id: str, content: ExtractedContent) -> str:
        """Persist extraction result JSON; return storage path."""


class PDFExtractionEngine(ABC):
    """Port: extraction algorithm — tables + OCR text."""

    @abstractmethod
    async def extract_tables(self, pdf_bytes: bytes) -> list[ExtractedTable]:
        """Parse tabular data from PDF bytes."""

    @abstractmethod
    async def extract_text_ocr(self, pdf_bytes: bytes) -> tuple[str, float]:
        """
        Extract text from PDF, using OCR as fallback for scanned pages.

        Returns:
            (text, confidence) where confidence in [0.0, 1.0]
        """


class OcrPort(Protocol):
    """
    Pure Protocol — BT-3-D: OCR a PDF file into per-page text.

    Domain layer rule: pure Protocol, zero infra imports, zero I/O here.
    Concrete adapter: infrastructure/ocr_adapter.PdfOcrAdapter
    (uses pdf2image + pytesseract vie+eng — self-hosted only, zero external API).

    HOST SAFETY (D6 — 16GB Mac kernel-panic risk):
        - Implementations MUST OCR only the pages specified in page_numbers.
        - Caller (ExtractTablesUseCase) provides only the located balance-sheet
          pages, NEVER blindly passes the full PDF page range.
        - OCR is sequential (one page at a time) — never parallel/batch.

    Privacy: self-hosted Tesseract only. Zero external API. Zero data leaves machine.
    """

    def ocr_pages(
        self,
        pdf_path: str,
        page_numbers: List[int],
    ) -> List[Dict]:
        """
        Run Tesseract (vie+eng) on the specified pages of a PDF.

        Args:
            pdf_path:     Absolute path to the PDF file on disk.
            page_numbers: 1-indexed page numbers to OCR (e.g. [4, 5, 6, 7]).
                          MUST be a small, located subset (not the full PDF).

        Returns:
            list of dicts: [{"page_number": int, "text": str}, ...]
            Ordered by page_numbers. Pages that fail OCR get text="".
        """
        ...

    def locate_balance_sheet_pages(
        self,
        pdf_path: str,
    ) -> List[int]:
        """
        Auto-locate balance-sheet section pages in a BCTC PDF.

        Scans page text for Vietnamese markers:
            - "BẢNG CÂN ĐỐI KẾ TOÁN"
            - "TÀI SẢN"
            - "NGUỒN VỐN"
            - "TỔNG CỘNG TÀI SẢN"
            - "TỔNG CỘNG NGUỒN VỐN"

        Returns 1-indexed page numbers of the located balance-sheet section.
        If nothing is found, returns pages 4..7 as a safe FPT-derived fallback
        (flagged in log as a heuristic fallback — not guaranteed correct for
        all BCTC layouts).

        HOST SAFETY: this method uses pdfplumber native text (fast, no Tesseract)
        to locate the pages. Only the located pages are then passed to ocr_pages().
        """
        ...


class AlertPort(Protocol):
    """
    Pure Protocol — BT-5 cross-check gate alert emission (WORK channel).

    Domain layer rule: this is a pure Protocol (typing.Protocol).
    Zero imports from infrastructure/, application/, interface/.
    Zero I/O, zero Telegram credentials.

    Concrete adapter (production): infrastructure/alert_adapter.py
        → sends Telegram message to WORK channel using project alert mechanism.
    Fake adapter (tests): FakeAlertPort in test files
        → records messages in a list, no network.

    DDD compliance: AlertPort is injected at the composition root (main.py).
    The use case calls send_work_alert() — it has no knowledge of Telegram
    or credentials (those live only in the infrastructure adapter).
    """

    def send_work_alert(self, message: str) -> None:
        """
        Send a WORK-channel alert message.

        Args:
            message: Plain-text alert message (≤ 4096 chars for Telegram compatibility).
                     Must include report_id and reason for WORK-channel diagnosis.

        Note: fire-and-forget — implementations must NOT raise on Telegram failure.
              Log the error internally and return normally to avoid disrupting the
              extraction pipeline.
        """
        ...


class OcrBackendPort(Protocol):
    """
    Pure Protocol — PEK-IMPL-OCR: pluggable cell/line text-recognition backend.

    Domain layer rule: pure Protocol, zero infra imports, zero I/O here.
    Concrete adapters (infrastructure/):
        - infrastructure/ocr_backends.PaddleOcrBackend  — wraps PaddleOCR PP-StructureV2
        - infrastructure/ocr_backends.TesseractVieBackend — wraps pytesseract (vie+eng, --psm 6)

    Selection policy (infrastructure/ocr_backends.select_ocr_backend()):
        - Default (OCR_TEXT_BACKEND unset or "tesseract-vie"): TesseractVieBackend.
          Vietnamese BCTC has rich diacritics — Tesseract vie+eng is proven on this corpus.
        - "paddleocr": PaddleOcrBackend (PaddleOCR PP-StructureV2 direct, CPU).
        - "auto": TesseractVieBackend first; if confidence < threshold, retry with
          PaddleOcrBackend; keep the higher-confidence result.

    Confidence scoring (BCTC low-confidence handling):
        - confidence == 0.0: empty/no-text result — upstream skips insert.
        - confidence < 0.2:  low-confidence result — upstream inserts with low_confidence flag.
        - confidence >= 0.2: normal result — upstream inserts as-is.

    Hard constraint: ONLY the cell/line TEXT step is pluggable via this port.
    LAYOUT detection (DocLayout-YOLO) and TABLE-GRID detection (PaddleOCR PP-StructureV2
    table mode) are NOT pluggable. This port is for the text inside detected cells only.

    REQ-PEK-12 candidate (OCR pluggability — to be formalized by PO at PEK-EXIT).
    """

    def recognize_text(
        self,
        image_or_region: Any,
    ) -> tuple[str, float]:
        """
        Recognize text in a single image region (cropped cell or line image).

        Args:
            image_or_region: Image data for OCR. Accepted types vary by backend:
                - numpy ndarray (H×W×C, uint8, BGR or RGB) — PaddleOCR + Tesseract both accept.
                - PIL.Image.Image — Tesseract backend accepts directly.
                Backends must handle None gracefully (return ("", 0.0)).

        Returns:
            (text, confidence) where:
                text:       Recognized text string (stripped). Empty string if none found.
                confidence: Float in [0.0, 1.0].
                            0.0 = no text / error.
                            0.0–0.2 = low confidence (low_confidence flag upstream).
                            ≥0.2 = normal confidence.

        Contract:
            - Must NOT raise on empty or None input — return ("", 0.0) instead.
            - Must NOT perform layout detection or table-grid detection.
            - Must NOT make network calls (all inference is on-host).
            - Thread-safe: may be called from multiple threads (adapter must be reentrant
              or use its own internal lock if the underlying library is not thread-safe).
        """
        ...


class PekEngineAdapterPort(Protocol):
    """
    Port for the PDF-Extract-Kit engine adapter (PEK-INTEGRATE).

    The adapter (infrastructure/pek_engine_adapter.py) wraps:
      - LayoutDetectionTask (DocLayout-YOLO, CPU) — from pdf_extract_kit.tasks
      - OCRTask (PaddleOCR, CPU) — from pdf_extract_kit.tasks
      - PaddleOCR PP-StructureV2 table mode (paddleocr package) — direct, NOT via PEK task

    Lazy singleton pattern: models load on first call (_pek_models_cache).
    Sequential guard: threading.Semaphore(1) — one extraction at a time; HTTP 429 on contention.

    DDD layer: domain port — zero infrastructure imports, zero I/O, pure Protocol.

    Hard constraints (REQ-PEK-2 / CRITICAL):
        - NEVER imports TableParsingTask or FormulaDetectionTask
          (struct_eqtable.py hard-asserts torch.cuda.is_available() → crash on CPU)
        - CPU-only (no paddlepaddle_gpu, no lmdeploy, no CUDA)
        - models load lazily on first call (cold-start RSS ~80MB)

    Implemented by:
        - infrastructure/pek_engine_adapter.PekEngineAdapter (production)
        - FakePekEngineAdapter (tests — injected, zero model weights)

    REQ-PEK-0 (pristine-engine invariant): the adapter imports pdf_extract_kit
    read-only as a library. Zero edits to the PDF-Extract-Kit subtree ever.
    """

    def extract_layout_and_tables(
        self,
        pdf_path: str,
        report_id: str,
    ) -> Dict:
        """
        Run the PEK layout+table extraction pipeline on one PDF document.

        Pipeline (per page, sequential):
            1. LayoutDetectionTask.predict_pdfs(pdf_path) → bboxes per page
            2. For each 'table' bbox: OCRTask + PaddleOCR table mode → table cells
            3. Map bboxes → LF-OVERLAY bctc_page_zones / bctc_layout_units contract

        Args:
            pdf_path:  Absolute path to the PDF file (already stored locally).
            report_id: UUID string matching financial_reports.id on mcp-server.

        Returns:
            dict with keys:
                document_map:     dict — Tier 0 DocumentMap (total_pages, units)
                units:            list[dict] — per-unit OCR results (stitched_markdown, …)
                page_zones:       list[dict] — per-page zone data (LF-OVERLAY contract)
                pass_rate_report: dict — quarantine stats

        Raises:
            RuntimeError: if models cannot be loaded or semaphore times out (→ HTTP 429).
        """
        ...
