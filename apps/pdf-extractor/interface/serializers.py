"""
Interface — JSON serializers.

Converts FastAPI Pydantic request models ↔ application DTOs and vice versa.
Keeps handler code thin by centralizing type coercion logic here.
"""

from pydantic import BaseModel, field_validator, model_validator
from typing import Literal, Optional

from application.dtos import ExtractPDFRequest


class ExtractPDFRequestSchema(BaseModel):
    """Pydantic model: validates incoming POST /extract request body.

    FEAT-PDF-EXTRACTOR-LOCAL-INPUT:
    Accepts either:
      - ``url``      (HTTP/HTTPS URL — original mode, unchanged)
      - ``pdf_path`` (absolute container path under /app/data/pdfs — new mode)

    At least one of url or pdf_path must be provided and non-empty.
    When both are supplied, pdf_path takes precedence (handler selects local repo).
    """

    url: Optional[str] = None
    pdf_path: Optional[str] = None
    source_type: Literal["bctc", "weather", "utility_bill"] = "bctc"
    priority: int = 0

    @model_validator(mode="after")
    def require_url_or_pdf_path(self) -> "ExtractPDFRequestSchema":
        has_url = bool(self.url and self.url.strip())
        has_pdf_path = bool(self.pdf_path and self.pdf_path.strip())
        if not has_url and not has_pdf_path:
            raise ValueError("Either 'url' or 'pdf_path' must be provided and non-empty")
        if has_url:
            self.url = self.url.strip()  # type: ignore[union-attr]
        if has_pdf_path:
            self.pdf_path = self.pdf_path.strip()  # type: ignore[union-attr]
        return self

    def to_dto(self) -> ExtractPDFRequest:
        # When pdf_path is set, url is stored as empty sentinel (domain service
        # stores the doc; LocalPDFStorageRepository reads pdf_path directly).
        effective_url = self.url or ""
        return ExtractPDFRequest(
            url=effective_url,
            source_type=self.source_type,
            priority=self.priority,
            pdf_path=self.pdf_path,
        )


class HealthResponse(BaseModel):
    """Pydantic model: GET /health response.

    FU-1: ocr_source_ok reflects the startup probe result for SqliteOcrTextSource.
    False means MARKET_DB_PATH is wrong / volume unmounted — /page-text will return
    source_reachable:false for all calls. Fix the env var or mount before re-running
    refine (a misconfigured source silently returning '' causes fabrication).
    """

    status: Literal["ok"] = "ok"
    service: str = "pdf-extractor"
    ocr_source_ok: bool = True
