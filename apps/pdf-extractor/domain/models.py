"""
Domain — Core models for PDF Extractor service.

Value Objects and Entities.
Domain layer: no imports from infrastructure/ or interface/.
"""

from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime


@dataclass
class PDFDocument:
    """
    Entity: represents a single PDF document in the processing pipeline.

    Lifecycle: pending → processing → success | failed
    """

    id: str
    url: str
    source_type: str  # 'bctc' | 'weather' | 'utility_bill'
    status: str       # 'pending' | 'processing' | 'success' | 'failed'
    extracted_at: Optional[datetime] = None

    def is_terminal(self) -> bool:
        """Return True if document reached a final state (success or failed)."""
        return self.status in ("success", "failed")


@dataclass
class ExtractedTable:
    """
    Value Object: structured tabular data extracted from a PDF page.

    Immutable once created — represents a snapshot of a table at extraction time.
    headers and rows contain raw string values as parsed from the PDF.
    """

    table_index: int
    headers: list[str]
    rows: list[list[str]]
    page_number: int


@dataclass
class ExtractedContent:
    """
    Value Object: complete extraction result for one PDF document.

    ocr_confidence in [0.0, 1.0]:
      1.0  — direct text extraction succeeded (high confidence)
      0.8  — OCR fallback used (moderate confidence)
      0.3  — partial text only (low confidence)
      0.0  — nothing extracted

    confidence_financial in [0.0, 1.0]:
      Score from validate_financial_figures() — accounting identity checks.
      1.0  — all 6 rules pass
      0.0  — hard violation (e.g. assets < equity as in VNM Q4 2024 corruption)
      0.1+ — soft violations stacked (e.g. margin > 1.0 as in VEA Q4 2024)

    composite_confidence = min(ocr_confidence, confidence_financial)
    Downstream consumers should use composite to decide on signal generation.
    """

    document_id: str
    tables: list[ExtractedTable]
    text_content: str
    ocr_confidence: float
    extraction_time_ms: int
    confidence_financial: float = 1.0
