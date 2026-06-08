"""
Domain — Core models for RAG service.

Value Objects and Entities.
Domain layer: no imports from infrastructure/ or interface/.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class EmbeddingVector:
    """
    Value Object: a 384-dim embedding vector with metadata.

    Immutable once created — represents the semantic encoding of a text entry.
    """

    dims: int
    values: list[float]

    def __post_init__(self) -> None:
        if len(self.values) != self.dims:
            raise ValueError(
                f"EmbeddingVector: expected {self.dims} dims, got {len(self.values)}"
            )


@dataclass
class AnalysisEntry:
    """
    Entity: a single analysis entry stored in the vector index.

    Lifecycle: created → indexed (vector stored in LanceDB)
    """

    id: str
    level: str          # "global" | "country" | "domain" | "action"
    title: str
    summary: str
    tags: list[str]
    created_at: datetime
    action_code: Optional[str] = None
    # FR-1/FR-2: Phase 1 metadata fields — all optional, backward-compatible defaults
    ticker: str = ""
    sector: str = ""
    source_domain: str = ""
    depth_tier: str = "shallow"
    doc_type: str = "news"
    published_at: str = ""
    confidence: float = 0.0
    impact_score: float = 0.0

    def is_valid_level(self) -> bool:
        return self.level in ("global", "country", "domain", "action")


@dataclass
class SearchResult:
    """
    Value Object: a single result from a vector similarity search.

    distance is the L2 distance (lower = more similar).
    recency_score incorporates temporal decay: similarity * exp(-age / half_life).
    """

    id: str
    level: str
    title: str
    summary: str
    tags: list[str]
    action_code: str
    created_at: str     # ISO timestamp string
    distance: float     # L2 distance from LanceDB
    recency_score: float = 0.0  # temporal-decay-adjusted score (higher = better)
    # FR-3: Phase 1 metadata fields echoed back from LanceDB row
    ticker: str = ""
    sector: str = ""
    source_domain: str = ""
    depth_tier: str = "shallow"
    doc_type: str = "news"
    published_at: str = ""
    confidence: float = 0.0
    impact_score: float = 0.0
