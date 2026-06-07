"""
Application — Data Transfer Objects (input/output contracts).

Used by interface/ handlers and returned by usecases.
DTOs are pure data containers with no business logic.
"""

from dataclasses import dataclass, asdict
from typing import Literal, Optional


@dataclass
class ExtractPDFRequest:
    """Input contract: POST /extract

    FEAT-PDF-EXTRACTOR-LOCAL-INPUT:
    Either ``url`` (HTTP/HTTPS) or ``pdf_path`` (container-local absolute path)
    must be provided. When ``pdf_path`` is set, the handler selects
    LocalPDFStorageRepository instead of HTTPPDFStorageRepository.
    ``url`` is set to an empty-string sentinel when only ``pdf_path`` is given
    (domain service stores it; storage repo reads ``pdf_path`` instead of ``url``).
    """

    url: str
    source_type: Literal["bctc", "weather", "utility_bill"]
    priority: int = 0
    pdf_path: Optional[str] = None


@dataclass
class ExtractedTableDTO:
    """Row-level output contract — mirrors domain ExtractedTable."""

    table_index: int
    headers: list[str]
    rows: list[list[str]]
    page_number: int


@dataclass
class ExtractPDFResponse:
    """Output contract: returned by ExtractPDFUseCase and serialized to JSON.

    confidence_financial: score from validate_financial_figures() in [0.0, 1.0].
      1.0 when no financial figures are parsed at extraction time (default).
      Downstream parsers that resolve actual figures should update this field.
      composite_confidence = min(ocr_confidence, confidence_financial) for signal gating.
    """

    document_id: str
    tables: list[ExtractedTableDTO]
    text_content: str
    ocr_confidence: float
    extraction_time_ms: int
    status: Literal["success", "failed"]
    confidence_financial: float = 1.0

    def to_json(self) -> dict:
        return asdict(self)
