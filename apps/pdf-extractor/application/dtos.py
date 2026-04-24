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
    """Output contract: returned by ExtractPDFUseCase and serialized to JSON."""

    document_id: str
    tables: list[ExtractedTableDTO]
    text_content: str
    ocr_confidence: float
    extraction_time_ms: int
    status: Literal["success", "failed"]

    def to_json(self) -> dict:
        return asdict(self)
