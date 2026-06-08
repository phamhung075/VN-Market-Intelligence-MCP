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
    # FR-3: Phase 1 pre-filter fields — all optional, backward-compatible
    ticker: Optional[str] = Field(None, description="Filter by ticker (e.g. VCB), must match [A-Z0-9]{1,10}")
    sector: Optional[str] = Field(None, description="Filter by sector (e.g. Banking)")
    source_domain: Optional[str] = Field(None, description="Filter by source domain (e.g. cafef.vn)")
    depth_tier: Optional[str] = Field(None, description="Filter by depth tier (shallow|deep)")
    doc_type: Optional[str] = Field(None, description="Filter by doc type (news|filing|macro|analysis)")

    def to_dto(self) -> SearchRequest:
        return SearchRequest(
            query=self.query,
            limit=self.limit,
            decay_half_life_days=self.decay_half_life_days,
            max_distance=self.max_distance,
            level=self.level,
            action_code=self.action_code,
            ticker=self.ticker,
            sector=self.sector,
            source_domain=self.source_domain,
            depth_tier=self.depth_tier,
            doc_type=self.doc_type,
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
    # FR-2: Phase 1 metadata fields — all optional, backward-compatible defaults
    ticker: str = Field("", description="Stock ticker (e.g. VCB)")
    sector: str = Field("", description="Sector (e.g. Banking)")
    source_domain: str = Field("", description="Source domain (e.g. cafef.vn)")
    depth_tier: str = Field("shallow", description="Content depth (shallow|deep)")
    doc_type: str = Field("news", description="Document type (news|filing|macro|analysis)")
    published_at: str = Field("", description="Original publish timestamp (ISO)")
    confidence: float = Field(0.0, ge=0.0, le=1.0, description="Confidence score 0.0–1.0")
    impact_score: float = Field(0.0, ge=0.0, le=10.0, description="Impact score 0–10")

    def to_dto(self) -> IndexRequest:
        return IndexRequest(
            id=self.id,
            content=self.content,
            tags=self.tags,
            level=self.level,
            title=self.title,
            summary=self.summary,
            action_code=self.action_code,
            ticker=self.ticker,
            sector=self.sector,
            source_domain=self.source_domain,
            depth_tier=self.depth_tier,
            doc_type=self.doc_type,
            published_at=self.published_at,
            confidence=self.confidence,
            impact_score=self.impact_score,
        )


class HealthResponse(BaseModel):
    """GET /health response."""

    status: str = "ok"
    service: str = "rag-service"
