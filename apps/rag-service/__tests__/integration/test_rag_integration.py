"""
Integration tests — SearchUseCase + IndexUseCase with real LanceDB.

Tests: end-to-end indexing → searching → temporal decay ranking.
Uses tmp_path fixture for isolated DB per test.
Mocks only the embedder (sentence-transformers not required for integration tests).
"""

import sys
import os
import math
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from domain.models import EmbeddingVector, SearchResult
from domain.repositories import EmbedderPort
from domain.services import SearchService
from application.dtos import SearchRequest, IndexRequest
from application.usecases import SearchUseCase, IndexUseCase
from infrastructure.repositories import LanceDBVectorStore


# ── Fake Embedder (deterministic, no model download) ─────────────────────


class FakeEmbedder(EmbedderPort):
    """
    Deterministic embedder for testing.
    Each text maps to a stable 384-dim vector based on hash.
    Distinct texts get different vectors so similarity search is meaningful.
    """

    async def embed(self, text: str) -> EmbeddingVector:
        # Use first chars to make partially different vectors
        seed = sum(ord(c) for c in text[:20])
        import random
        rng = random.Random(seed)
        values = [rng.gauss(0, 1) for _ in range(384)]
        # Normalize
        norm = math.sqrt(sum(v ** 2 for v in values)) or 1.0
        values = [v / norm for v in values]
        return EmbeddingVector(dims=384, values=values)

    async def embed_batch(self, texts: list[str]) -> list[EmbeddingVector]:
        return [await self.embed(t) for t in texts]


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture
def embedder():
    return FakeEmbedder()


@pytest.fixture
def lancedb_store(tmp_path):
    return LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))


@pytest.fixture
def search_service():
    return SearchService()


@pytest.fixture
def index_usecase(lancedb_store, embedder):
    return IndexUseCase(vector_store=lancedb_store, embedder=embedder)


@pytest.fixture
def search_usecase(lancedb_store, embedder, search_service):
    return SearchUseCase(
        vector_store=lancedb_store,
        embedder=embedder,
        search_service=search_service,
    )


# ── Helpers ────────────────────────────────────────────────────────────────


def days_ago_iso(n: float) -> str:
    dt = datetime.now(tz=timezone.utc) - timedelta(days=n)
    return dt.isoformat()


# ── Integration: IndexUseCase + SearchUseCase end-to-end ─────────────────


@pytest.mark.asyncio
class TestIndexAndSearchEndToEnd:

    async def test_index_then_search_returns_indexed_entry(
        self, index_usecase, search_usecase
    ):
        await index_usecase.execute(
            IndexRequest(
                id="e1",
                content="VCB banking sector credit growth",
                tags=["banking", "credit"],
                level="action",
                title="VCB Credit Update",
                action_code="VCB",
            )
        )

        response = await search_usecase.execute(
            SearchRequest(query="VCB banking credit", limit=5, max_distance=2.0)
        )

        assert response.total >= 1
        ids = [r.id for r in response.results]
        assert "e1" in ids

    async def test_vector_store_count_increases_after_index(
        self, index_usecase, lancedb_store
    ):
        before = await lancedb_store.count()

        await index_usecase.execute(
            IndexRequest(id="count-test", content="count test entry", tags=[])
        )

        after = await lancedb_store.count()
        assert after == before + 1

    async def test_search_returns_empty_on_empty_store(self, search_usecase):
        response = await search_usecase.execute(
            SearchRequest(query="anything", limit=5)
        )
        assert response.total == 0

    async def test_recent_entries_rank_higher_than_old(
        self, lancedb_store, embedder, search_service
    ):
        """
        Index two entries with the same content (same vector) but different ages.
        Recent entry should rank first after temporal decay.
        """
        # Use a deterministic vector for both (simulating similar content)
        shared_vector = await embedder.embed("banking sector update VN market")

        # Override insert with known vectors + timestamps
        from domain.models import AnalysisEntry

        now = datetime.now(tz=timezone.utc)

        old_entry = AnalysisEntry(
            id="old-1",
            level="global",
            title="Old Banking Update",
            summary="banking update 30 days ago",
            tags=["banking"],
            created_at=now - timedelta(days=30),
        )
        new_entry = AnalysisEntry(
            id="new-1",
            level="global",
            title="Recent Banking Update",
            summary="banking update recent",
            tags=["banking"],
            created_at=now - timedelta(hours=2),
        )

        await lancedb_store.insert(old_entry, shared_vector)
        await lancedb_store.insert(new_entry, shared_vector)

        # Search with temporal decay
        usecase = SearchUseCase(
            vector_store=lancedb_store,
            embedder=embedder,
            search_service=search_service,
        )
        response = await usecase.execute(
            SearchRequest(
                query="banking sector update VN market",
                limit=5,
                max_distance=2.0,
                decay_half_life_days=7.0,
            )
        )

        assert response.total >= 2
        # Recent entry should rank first (higher recency_score)
        assert response.results[0].id == "new-1"

    async def test_index_response_contains_entry_id(self, index_usecase):
        response = await index_usecase.execute(
            IndexRequest(id="resp-test", content="test", tags=[])
        )
        assert response.entry_id == "resp-test"
        assert response.status == "ok"
        assert response.indexed == 1

    async def test_search_result_has_all_fields(
        self, index_usecase, search_usecase
    ):
        await index_usecase.execute(
            IndexRequest(
                id="full-fields",
                content="macro economic indicators Vietnam GDP",
                tags=["macro", "gdp"],
                level="country",
                title="Vietnam GDP",
                summary="Vietnam GDP grew 6.7% in Q1",
                action_code=None,
            )
        )

        response = await search_usecase.execute(
            SearchRequest(query="Vietnam GDP macro", limit=5, max_distance=2.0)
        )

        assert response.total >= 1
        result = response.results[0]
        assert result.id == "full-fields"
        assert result.level == "country"
        assert result.title == "Vietnam GDP"
        assert result.summary == "Vietnam GDP grew 6.7% in Q1"
        assert isinstance(result.tags, list)
        assert isinstance(result.distance, float)
        assert isinstance(result.recency_score, float)
