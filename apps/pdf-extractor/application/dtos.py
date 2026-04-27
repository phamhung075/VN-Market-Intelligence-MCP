"""
Application — Data Transfer Objects (input/output contracts).

Used by interface/ handlers and returned by usecases.
DTOs are pure data containers with no business logic.
"""

from dataclasses import dataclass, asdict
from typing import Literal


@dataclass
class ExtractPDFRequest:
    """Input contract: POST /extract"""

    url: str
    source_type: Literal["bctc", "weather", "utility_bill"]
    priority: int = 0


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
