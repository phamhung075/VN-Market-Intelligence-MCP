"""
Application — Data Transfer Objects (input/output contracts).

Used by interface/ handlers and returned by usecases.
DTOs are pure data containers with no business logic.
"""

from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class SearchRequest:
    """Input contract: POST /search"""

    query: str
    limit: int = 5
    decay_half_life_days: float = 7.0
    max_distance: float = 0.8
    level: Optional[str] = None
    action_code: Optional[str] = None


@dataclass
class SearchResultDTO:
    """Single search result in the response."""

    id: str
    level: str
    title: str
    summary: str
    tags: list[str]
    action_code: str
    created_at: str
    distance: float
    recency_score: float

    def to_json(self) -> dict:
        return asdict(self)


@dataclass
class SearchResponse:
    """Output contract: returned by SearchUseCase."""

    results: list[SearchResultDTO]
    total: int

    def to_json(self) -> dict:
        return {
            "results": [r.to_json() for r in self.results],
            "total": self.total,
        }


@dataclass
class IndexRequest:
    """Input contract: POST /index"""

    id: str
    content: str
    tags: list[str]
    level: str = "global"
    title: str = ""
    summary: str = ""
    action_code: Optional[str] = None


@dataclass
class IndexResponse:
    """Output contract: returned by IndexUseCase."""

    status: str
    indexed: int
    entry_id: str

    def to_json(self) -> dict:
        return asdict(self)
