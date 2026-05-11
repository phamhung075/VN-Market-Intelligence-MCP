"""
Interface — Pydantic schemas for request/response serialization.

Thin HTTP layer: schema validation, conversion to/from application DTOs.
"""

from pydantic import BaseModel, Field
from typing import Optional

from application.dtos import (
    SearchRequest,
    IndexRequest,
)


class SearchRequestSchema(BaseModel):
    """POST /search request body."""

    query: str = Field(..., min_length=1, description="Search query text")
    limit: int = Field(5, ge=1, le=50, description="Max results to return")
    decay_half_life_days: float = Field(
        7.0, ge=0.1, description="Temporal decay half-life in days"
    )
    max_distance: float = Field(
        0.8, ge=0.0, le=2.0, description="Max L2 distance for results"
    )
    level: Optional[str] = Field(None, description="Filter by level (global/country/domain/action)")
    action_code: Optional[str] = Field(None, description="Filter by stock ticker (e.g. VCB)")

    def to_dto(self) -> SearchRequest:
        return SearchRequest(
            query=self.query,
            limit=self.limit,
            decay_half_life_days=self.decay_half_life_days,
            max_distance=self.max_distance,
            level=self.level,
            action_code=self.action_code,
        )


class IndexRequestSchema(BaseModel):
    """POST /index request body."""

    id: str = Field(..., min_length=1, description="Unique entry ID")
    content: str = Field(..., min_length=1, description="Text content to index")
    tags: list[str] = Field(default_factory=list, description="Semantic tags")
    level: str = Field("global", description="Hierarchy level")
    title: str = Field("", description="Short title / headline")
    summary: str = Field("", description="Paragraph summary")
    action_code: Optional[str] = Field(None, description="Stock ticker if action-level")

    def to_dto(self) -> IndexRequest:
        return IndexRequest(
            id=self.id,
            content=self.content,
            tags=self.tags,
            level=self.level,
            title=self.title,
            summary=self.summary,
            action_code=self.action_code,
        )


class HealthResponse(BaseModel):
    """GET /health response."""

    status: str = "ok"
    service: str = "rag-service"
