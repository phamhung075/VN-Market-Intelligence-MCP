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
