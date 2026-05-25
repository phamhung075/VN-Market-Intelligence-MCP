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
from typing import Optional, Protocol

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
