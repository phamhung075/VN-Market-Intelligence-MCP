"""
Domain — Abstract port definitions (repositories / embedder).

All infrastructure implementations MUST satisfy these interfaces.
Domain layer: never imports infrastructure/ or interface/.
"""

from abc import ABC, abstractmethod
from typing import Optional

from domain.models import AnalysisEntry, EmbeddingVector, SearchResult


class VectorStorePort(ABC):
    """Port: LanceDB vector storage — insert + similarity search."""

    @abstractmethod
    async def insert(self, entry: AnalysisEntry, vector: EmbeddingVector) -> None:
        """Persist an entry with its embedding vector."""

    @abstractmethod
    async def search(
        self,
        query_vector: EmbeddingVector,
        limit: int,
        level_filter: Optional[str] = None,
        action_code_filter: Optional[str] = None,
        # FR-3: Phase 1 pre-filter fields
        ticker_filter: Optional[str] = None,
        sector_filter: Optional[str] = None,
        source_domain_filter: Optional[str] = None,
        depth_tier_filter: Optional[str] = None,
        doc_type_filter: Optional[str] = None,
    ) -> list[SearchResult]:
        """Return top-k similar entries sorted by ascending L2 distance."""

    @abstractmethod
    async def hybrid_search(
        self,
        query_vector: EmbeddingVector,
        query_text: str,
        limit: int,
        level_filter: Optional[str] = None,
        action_code_filter: Optional[str] = None,
        # Phase 1 pre-filter fields (same as search())
        ticker_filter: Optional[str] = None,
        sector_filter: Optional[str] = None,
        source_domain_filter: Optional[str] = None,
        depth_tier_filter: Optional[str] = None,
        doc_type_filter: Optional[str] = None,
    ) -> list[SearchResult]:
        """Return top-k results via FTS + vector RRF hybrid search."""

    @abstractmethod
    async def count(self) -> int:
        """Return total number of indexed entries."""


class AnalysisRepositoryPort(ABC):
    """Port: SQLite metadata store for AnalysisEntry records."""

    @abstractmethod
    async def save(self, entry: AnalysisEntry) -> None:
        """Persist or update an AnalysisEntry (upsert by id)."""

    @abstractmethod
    async def find_by_id(self, entry_id: str) -> Optional[AnalysisEntry]:
        """Return entry by id, or None if not found."""

    @abstractmethod
    async def find_all(self) -> list[AnalysisEntry]:
        """Return all stored entries."""


class EmbedderPort(ABC):
    """Port: text embedding — converts text to EmbeddingVector."""

    @abstractmethod
    async def embed(self, text: str) -> EmbeddingVector:
        """Embed a single text string into a 384-dim vector."""

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[EmbeddingVector]:
        """Embed multiple texts in one batch (more efficient)."""
