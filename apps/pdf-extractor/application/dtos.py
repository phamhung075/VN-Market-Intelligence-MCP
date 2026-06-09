"""
Application — Data Transfer Objects (input/output contracts).

Used by interface/ handlers and returned by usecases.
DTOs are pure data containers with no business logic.
"""

from dataclasses import dataclass, asdict, field
from typing import Any, Dict, List, Literal, Optional


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
class VisionVerifyMarker:
    """
    Escalation marker emitted when gate (a) or gate (b) fails for a page/unit.

    Signals that the page/rows need vision verification but does NOT trigger it
    (the Python service cannot call vision). The flow (flow/main.md) reads this
    marker and runs pdftoppm → LLM-reads-PNG only for the flagged pages.

    Fields:
        page_numbers:   Pages that failed the gate (1-indexed, matches PDF page numbering).
        failing_reason: Human-readable reason (from check_bs_accounting_identities or
                        check_code_whitelist) explaining which gate failed and why.
        flagged_codes:  Codes that failed the whitelist gate (empty if only checksum failed).
        gate:           Which gate triggered: "checksum" | "code_whitelist" | "both"
    """

    page_numbers: List[int]
    failing_reason: str
    flagged_codes: List[str]
    gate: Literal["checksum", "code_whitelist", "both"]


@dataclass
class ExtractPDFResponse:
    """Output contract: returned by ExtractPDFUseCase and serialized to JSON.

    confidence_financial: score from validate_financial_figures() in [0.0, 1.0].
      1.0 when no financial figures are parsed at extraction time (default).
      Downstream parsers that resolve actual figures should update this field.
      composite_confidence = min(ocr_confidence, confidence_financial) for signal gating.

    needs_vision_verify: True when gate (a) checksum or gate (b) code-whitelist failed.
      When True, vision_verify_markers contains the structured escalation details.
      Pages listed in the markers need pdftoppm → LLM-reads-PNG verification.
      Pages NOT listed have passed both gates and are trusted without vision cost.
    """

    document_id: str
    tables: list[ExtractedTableDTO]
    text_content: str
    ocr_confidence: float
    extraction_time_ms: int
    status: Literal["success", "failed"]
    confidence_financial: float = 1.0
    needs_vision_verify: bool = False
    vision_verify_markers: List[VisionVerifyMarker] = field(default_factory=list)

    def to_json(self) -> dict:
        return asdict(self)
