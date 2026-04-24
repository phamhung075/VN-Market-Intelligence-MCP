"""
Unit tests — SearchUseCase and IndexUseCase (application layer).

All ports (VectorStorePort, EmbedderPort) are AsyncMock.
Tests cover: happy path, empty results, error propagation, temporal decay integration.
"""

import sys
import os
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from domain.models import EmbeddingVector, SearchResult
from domain.services import SearchService
from domain.errors import SearchError, IndexError
from application.dtos import SearchRequest, IndexRequest
from application.usecases import SearchUseCase, IndexUseCase


# ── Fixtures ───────────────────────────────────────────────────────────────


def make_embedding() -> EmbeddingVector:
    return EmbeddingVector(dims=384, values=[0.1] * 384)


def make_search_result(
    id: str = "entry-1",
    distance: float = 0.3,
    created_at: str | None = None,
) -> SearchResult:
    if created_at is None:
        created_at = datetime.now(tz=timezone.utc).isoformat()
    return SearchResult(
        id=id,
        level="global",
        title=f"Title {id}",
        summary=f"Summary {id}",
        tags=["test"],
        action_code="",
        created_at=created_at,
        distance=distance,
    )


@pytest.fixture
def mocked_ports():
    vector_store = AsyncMock()
    embedder = AsyncMock()
    embedder.embed.return_value = make_embedding()
    search_service = SearchService()
    return {
        "vector_store": vector_store,
        "embedder": embedder,
        "search_service": search_service,
    }


# ── SearchUseCase ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestSearchUseCaseHappyPath:

    async def test_returns_search_response_with_results(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].search.return_value = [
            make_search_result("r1", distance=0.2),
            make_search_result("r2", distance=0.4),
        ]

        usecase = SearchUseCase(**p)
        response = await usecase.execute(
            SearchRequest(query="VCB banking", limit=5)
        )

        assert response.total == 2
        assert len(response.results) == 2
        assert response.results[0].id in ("r1", "r2")

    async def test_calls_embedder_with_query(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].search.return_value = []

        usecase = SearchUseCase(**p)
        await usecase.execute(SearchRequest(query="test query"))

        p["embedder"].embed.assert_called_once_with("test query")

    async def test_passes_filters_to_vector_store(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].search.return_value = []

        usecase = SearchUseCase(**p)
        await usecase.execute(
            SearchRequest(query="q", level="action", action_code="VCB")
        )

        call_kwargs = p["vector_store"].search.call_args[1]
        assert call_kwargs.get("level_filter") == "action"
        assert call_kwargs.get("action_code_filter") == "VCB"

    async def test_empty_vector_store_returns_empty_response(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].search.return_value = []

        usecase = SearchUseCase(**p)
        response = await usecase.execute(SearchRequest(query="q"))

        assert response.total == 0
        assert response.results == []

    async def test_results_have_recency_score_populated(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].search.return_value = [
            make_search_result("r1", distance=0.3),
        ]

        usecase = SearchUseCase(**p)
        response = await usecase.execute(SearchRequest(query="q"))

        assert response.results[0].recency_score > 0.0

    async def test_result_limit_respected(self, mocked_ports):
        p = mocked_ports
        # Provide 10 results from vector store
        p["vector_store"].search.return_value = [
            make_search_result(f"r{i}", distance=0.1 + i * 0.05)
            for i in range(10)
        ]

        usecase = SearchUseCase(**p)
        response = await usecase.execute(SearchRequest(query="q", limit=3))

        assert response.total <= 3

    async def test_vector_store_error_raises_search_error(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].search.side_effect = RuntimeError("DB error")

        usecase = SearchUseCase(**p)

        with pytest.raises(SearchError):
            await usecase.execute(SearchRequest(query="q"))


# ── IndexUseCase ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestIndexUseCaseHappyPath:

    async def test_returns_ok_response(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].insert = AsyncMock()

        usecase = IndexUseCase(
            vector_store=p["vector_store"],
            embedder=p["embedder"],
        )
        response = await usecase.execute(
            IndexRequest(id="entry-1", content="Test content", tags=["tag1"])
        )

        assert response.status == "ok"
        assert response.indexed == 1
        assert response.entry_id == "entry-1"

    async def test_calls_embedder_with_built_text(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].insert = AsyncMock()

        usecase = IndexUseCase(
            vector_store=p["vector_store"],
            embedder=p["embedder"],
        )
        await usecase.execute(
            IndexRequest(
                id="e1",
                content="Market update",
                tags=["macro"],
                level="global",
                title="VN Market",
                action_code=None,
            )
        )

        p["embedder"].embed.assert_called_once()
        call_arg = p["embedder"].embed.call_args[0][0]
        assert "Market update" in call_arg

    async def test_insert_called_once(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].insert = AsyncMock()

        usecase = IndexUseCase(
            vector_store=p["vector_store"],
            embedder=p["embedder"],
        )
        await usecase.execute(
            IndexRequest(id="e1", content="content", tags=[])
        )

        p["vector_store"].insert.assert_called_once()

    async def test_insert_error_raises_index_error(self, mocked_ports):
        p = mocked_ports
        p["vector_store"].insert = AsyncMock(side_effect=RuntimeError("insert failed"))

        usecase = IndexUseCase(
            vector_store=p["vector_store"],
            embedder=p["embedder"],
        )

        with pytest.raises(IndexError):
            await usecase.execute(
                IndexRequest(id="e1", content="content", tags=[])
            )
