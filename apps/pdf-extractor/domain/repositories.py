"""
Domain — Abstract port definitions (repositories / engines).

All infrastructure implementations MUST satisfy these interfaces.
Domain layer: never imports infrastructure/ or interface/.
"""

from abc import ABC, abstractmethod
from typing import Optional

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
