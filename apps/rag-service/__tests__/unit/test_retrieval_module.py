"""
Unit tests — RetrievalModule (domain/module/retrieval/).

All ports (EmbedderModulePort, VectorSearchPort) are injected as AsyncMock.
Zero infrastructure imports. Zero lancedb, sentence_transformers, torch.

Tests:
  (a) happy path — returns top-k results in recency-score order
  (b) empty vector store — returns empty list
  (c) all results beyond max_distance — returns empty list
"""

from __future__ import annotations

import sys
import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

# Inject service root into sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from domain.module.retrieval.module import RetrievalModule
from domain.module.retrieval.ports import EmbedderModulePort, VectorSearchPort


# ── Fixtures ──────────────────────────────────────────────────────────────


FIXED_VECTOR: list[float] = [0.1] * 384

# Fixed "now" for deterministic recency scoring in all tests
FIXED_NOW = datetime(2026, 5, 24, 12, 0, 0, tzinfo=timezone.utc)

# ISO strings relative to FIXED_NOW
# 2h ago: high recency
RECENT_ISO = "2026-05-24T10:00:00+00:00"
# 28h ago: medium recency
MEDIUM_ISO = "2026-05-23T08:00:00+00:00"
# 72h ago: lower recency
OLD_ISO = "2026-05-21T12:00:00+00:00"


def make_result(
    id: str,
    distance: float,
    created_at: str = RECENT_ISO,
) -> dict:
    return {
        "id": id,
        "distance": distance,
        "created_at": created_at,
        "level": "global",
        "title": f"Title {id}",
        "summary": f"Summary {id}",
        "tags": [],
        "action_code": "",
    }


@pytest.fixture
def mock_ports():
    """Return (embedder, vector_search) as AsyncMock pair.

    AsyncMock() without spec: attribute access on an AsyncMock returns another
    AsyncMock, so embedder.embed is itself an AsyncMock coroutine function.
    Setting .return_value on it makes await embedder.embed(...) return that value.
    """
    embedder = AsyncMock()
    embedder.embed.return_value = FIXED_VECTOR

    vector_search = AsyncMock()
    vector_search.search.return_value = []  # default: empty

    return embedder, vector_search


# ── (a) Happy path: returns top-k results in recency-score order ──────────


@pytest.mark.asyncio
class TestRetrievalModuleHappyPath:

    async def test_returns_top_k_results(self, mock_ports):
        """Happy path: 3 candidates within distance, top_k=2 → 2 results."""
        embedder, vector_search = mock_ports
        vector_search.search.return_value = [
            make_result("r1", distance=0.2, created_at=RECENT_ISO),
            make_result("r2", distance=0.3, created_at=MEDIUM_ISO),
            make_result("r3", distance=0.4, created_at=OLD_ISO),
        ]
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        results = await module.retrieve(
            query_text="test query",
            top_k=2,
            max_distance=0.8,
            half_life_days=7.0,
            now=FIXED_NOW,
        )

        assert len(results) == 2
        # All returned results must be within max_distance
        for r in results:
            assert r["distance"] <= 0.8

    async def test_results_ordered_by_recency_score_descending(self, mock_ports):
        """Results must be sorted descending by recency_score."""
        embedder, vector_search = mock_ports
        vector_search.search.return_value = [
            make_result("recent", distance=0.2, created_at=RECENT_ISO),
            make_result("old", distance=0.2, created_at=OLD_ISO),
        ]
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        results = await module.retrieve(
            query_text="q",
            top_k=5,
            max_distance=0.8,
            half_life_days=7.0,
            now=FIXED_NOW,
        )

        assert len(results) == 2
        # Recency scores present and descending
        scores = [r["recency_score"] for r in results]
        assert scores == sorted(scores, reverse=True)
        # "recent" has higher score than "old" (same distance, different age)
        ids = [r["id"] for r in results]
        assert ids[0] == "recent", f"Expected 'recent' first, got {ids}"

    async def test_embedder_called_with_query_text(self, mock_ports):
        """EmbedderModulePort.embed() must be called with the query text."""
        embedder, vector_search = mock_ports
        vector_search.search.return_value = []
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        await module.retrieve(query_text="VCB banking sector", now=FIXED_NOW)

        embedder.embed.assert_called_once_with("VCB banking sector")

    async def test_vector_search_called_with_embedded_vector(self, mock_ports):
        """VectorSearchPort.search() must receive the vector from the embedder."""
        embedder, vector_search = mock_ports
        custom_vector = [0.5] * 384
        embedder.embed.return_value = custom_vector
        vector_search.search.return_value = []
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        await module.retrieve(query_text="q", top_k=3, now=FIXED_NOW)

        call_kwargs = vector_search.search.call_args
        assert call_kwargs is not None
        called_vector = call_kwargs[1].get("vector") or call_kwargs[0][0]
        assert called_vector == custom_vector

    async def test_similarity_field_present_in_results(self, mock_ports):
        """Each result dict must have a 'similarity' key (set by similarity_scorer primitive)."""
        embedder, vector_search = mock_ports
        vector_search.search.return_value = [
            make_result("r1", distance=0.3, created_at=RECENT_ISO),
        ]
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        results = await module.retrieve(query_text="q", now=FIXED_NOW)

        assert len(results) == 1
        assert "similarity" in results[0]
        # similarity = 1 / (1 + 0.3) ≈ 0.769
        import pytest as _pt
        assert results[0]["similarity"] == _pt.approx(1.0 / 1.3, abs=1e-4)


# ── (b) Empty vector store → returns empty list ───────────────────────────


@pytest.mark.asyncio
class TestRetrievalModuleEmptyVectorStore:

    async def test_empty_vector_store_returns_empty_list(self, mock_ports):
        """If VectorSearchPort returns [], retrieve() returns []."""
        embedder, vector_search = mock_ports
        vector_search.search.return_value = []
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        results = await module.retrieve(query_text="q", now=FIXED_NOW)

        assert results == []

    async def test_embedder_still_called_on_empty_store(self, mock_ports):
        """Embedder is called even when store is empty (embed happens before search)."""
        embedder, vector_search = mock_ports
        vector_search.search.return_value = []
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        await module.retrieve(query_text="empty test", now=FIXED_NOW)

        # Embedder must have been called (pipeline: embed → search → score)
        embedder.embed.assert_called_once()


# ── (c) All results beyond max_distance → returns empty list ─────────────


@pytest.mark.asyncio
class TestRetrievalModuleDistanceFilter:

    async def test_all_beyond_max_distance_returns_empty(self, mock_ports):
        """If all raw results have distance > max_distance, retrieve() returns []."""
        embedder, vector_search = mock_ports
        vector_search.search.return_value = [
            make_result("r1", distance=0.9, created_at=RECENT_ISO),
            make_result("r2", distance=0.95, created_at=RECENT_ISO),
        ]
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        results = await module.retrieve(
            query_text="q",
            max_distance=0.8,
            now=FIXED_NOW,
        )

        assert results == []

    async def test_partial_filter_keeps_within_max_distance(self, mock_ports):
        """Only results within max_distance survive the relevance gate."""
        embedder, vector_search = mock_ports
        vector_search.search.return_value = [
            make_result("close", distance=0.4, created_at=RECENT_ISO),
            make_result("far",   distance=0.9, created_at=RECENT_ISO),
        ]
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        results = await module.retrieve(
            query_text="q",
            max_distance=0.8,
            now=FIXED_NOW,
        )

        assert len(results) == 1
        assert results[0]["id"] == "close"

    async def test_exact_max_distance_boundary_included(self, mock_ports):
        """A result with distance == max_distance is included (<=, not <)."""
        embedder, vector_search = mock_ports
        vector_search.search.return_value = [
            make_result("boundary", distance=0.8, created_at=RECENT_ISO),
        ]
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        results = await module.retrieve(
            query_text="q",
            max_distance=0.8,
            now=FIXED_NOW,
        )

        assert len(results) == 1
        assert results[0]["id"] == "boundary"


# ── (d) All 5 primitives wired end-to-end ────────────────────────────────


@pytest.mark.asyncio
class TestRetrievalModuleAllPrimitivesPipeline:

    async def test_end_to_end_all_5_primitives(self, mock_ports):
        """
        AC-6a: End-to-end pipeline exercising all 5 primitives.

        Setup:
          - 2 raw results: doc-keep (distance=0.3, within threshold) and
            doc-filter (distance=0.9, beyond max_distance=0.5)
          - now=FIXED_NOW, half_life_days=7.0

        Expected:
          - context_window_packer packs both results' metadata
          - similarity_scorer converts distance → similarity for each
          - relevance_threshold_gate drops doc-filter (distance 0.9 > 0.5)
          - temporal_decay_scorer applies decay to doc-keep
          - top_k_selector returns [doc-keep] (only 1 passes)
        """
        embedder, vector_search = mock_ports
        vector_search.search.return_value = [
            {
                "id": "doc-keep",
                "distance": 0.3,
                "created_at": RECENT_ISO,
                "title": "VN-Index Q1 2026",
                "summary": "Earnings growth accelerated",
                "source": "VNDirect",
                "action_code": "VNM",
            },
            {
                "id": "doc-filter",
                "distance": 0.9,
                "created_at": RECENT_ISO,
                "title": "Distant result",
                "summary": "Far beyond threshold",
                "source": "Other",
                "action_code": "",
            },
        ]
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        results = await module.retrieve(
            query_text="VN-Index earnings",
            top_k=5,
            max_distance=0.5,
            half_life_days=7.0,
            now=FIXED_NOW,
        )

        # Only doc-keep passes the threshold gate
        assert len(results) == 1
        assert results[0]["id"] == "doc-keep"

        # Similarity field present (set by similarity_scorer)
        assert "similarity" in results[0]
        import pytest as _pt
        assert results[0]["similarity"] == _pt.approx(1.0 / (1.0 + 0.3), abs=1e-4)

        # Recency score present (set by temporal_decay_scorer)
        assert "recency_score" in results[0]
        assert results[0]["recency_score"] > 0.0

        # Packed text present (set by context_window_packer)
        assert "packed_text" in results[0]
        assert "VN-Index Q1 2026" in results[0]["packed_text"]

    async def test_now_injection_propagated_through_pipeline(self, mock_ports):
        """
        AC-6b: now parameter is passed through to temporal_decay_scorer correctly.

        Two results with the same distance but different creation times.
        When now is fixed, the older document gets a lower recency_score.
        Verifying now_injection: both runs with same FIXED_NOW produce same scores.
        """
        embedder, vector_search = mock_ports
        vector_search.search.return_value = [
            make_result("young", distance=0.2, created_at=RECENT_ISO),   # 2h old
            make_result("old",   distance=0.2, created_at=OLD_ISO),      # 72h old
        ]
        module = RetrievalModule(embedder=embedder, vector_search=vector_search)

        # Run 1: inject FIXED_NOW
        results_1 = await module.retrieve(
            query_text="q",
            top_k=5,
            max_distance=0.8,
            half_life_days=7.0,
            now=FIXED_NOW,
        )

        # Run 2: inject same FIXED_NOW — scores must be byte-identical (determinism gate)
        vector_search.search.return_value = [
            make_result("young", distance=0.2, created_at=RECENT_ISO),
            make_result("old",   distance=0.2, created_at=OLD_ISO),
        ]
        results_2 = await module.retrieve(
            query_text="q",
            top_k=5,
            max_distance=0.8,
            half_life_days=7.0,
            now=FIXED_NOW,
        )

        assert len(results_1) == 2
        assert len(results_2) == 2

        # Scores are identical across both runs (determinism)
        scores_1 = [r["recency_score"] for r in results_1]
        scores_2 = [r["recency_score"] for r in results_2]
        assert scores_1 == scores_2

        # Younger document has strictly higher recency score
        score_young = next(r["recency_score"] for r in results_1 if r["id"] == "young")
        score_old   = next(r["recency_score"] for r in results_1 if r["id"] == "old")
        assert score_young > score_old
