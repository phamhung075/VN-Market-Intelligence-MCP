"""
Interface — JSON serializers.

Converts FastAPI Pydantic request models ↔ application DTOs and vice versa.
Keeps handler code thin by centralizing type coercion logic here.
"""

from pydantic import BaseModel, field_validator
from typing import Literal

from application.dtos import ExtractPDFRequest


class ExtractPDFRequestSchema(BaseModel):
    """Pydantic model: validates incoming POST /extract request body."""

    url: str
    source_type: Literal["bctc", "weather", "utility_bill"] = "bctc"
    priority: int = 0

    @field_validator("url")
    @classmethod
    def url_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("url must not be empty")
        return v.strip()

    def to_dto(self) -> ExtractPDFRequest:
        return ExtractPDFRequest(
            url=self.url,
            source_type=self.source_type,
            priority=self.priority,
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
