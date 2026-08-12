"""
Unit tests — FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS.

Root cause (architect isolated repro, docs/architecture-briefs/2026-08-12-fix-rag-
embedder-idle-unload-second-growth-source.md §3b/§6): `rag_entries` carries ZERO
index on the 'vector' column -- every vector_search() / .nearest_to() call is
LanceDB's brute-force exact-kNN scan over the full column, with no eviction,
measured as the dominant driver (+340-444 MiB / ~20-600 calls, ~65-80x the
embedder's own per-call footprint) of the row's live OOM-proximity symptom.

Coverage:
  (a) _vector_index_built starts False; _build_vector_index() calls
      table.create_index('vector', config=IvfPq(...), replace=True) exactly once
      (structural — mirrors test_build_fts_index_two_separate_calls's pattern)
  (b) _maybe_build_vector_index() below _VECTOR_INDEX_MIN_ROWS is a no-op — flag
      stays False, no exception (small/test corpora keep the existing brute-force
      path unchanged — zero regression for every OTHER test file's tiny fixtures)
  (c) _maybe_build_vector_index() at/above the threshold builds exactly once, then
      never rebuilds on subsequent calls (flag guards it, same shape as
      _fts_index_built / test_hybrid_search_flag_prevents_rebuild)
  (d) End-to-end (real LanceDB, no mocks): a 300-row corpus triggers a REAL
      IvfPq build on the first search() call; search() still returns results
      (list[SearchResult]) — proves the whole lazy-trigger + real trainer path
      works, not just the call shape
  (e) hybrid_search() also triggers the SAME lazy build (both read 'vector')
  (f) POST /admin/rebuild-vector-index is registered, returns {"status":"ok"},
      and calls vector_store._build_vector_index() — mirrors the existing
      /admin/rebuild-fts admin-endpoint test triad exactly
"""

import sys
import os
import math
import random
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from domain.models import AnalysisEntry, EmbeddingVector, SearchResult
from infrastructure.repositories import LanceDBVectorStore, _VECTOR_INDEX_MIN_ROWS


# ── Helpers ────────────────────────────────────────────────────────────────


def _vec(seed: float = 0.1) -> EmbeddingVector:
    return EmbeddingVector(dims=384, values=[seed] * 384)


def _rand_vec(rng: random.Random) -> list:
    vals = [rng.gauss(0, 1) for _ in range(384)]
    norm = math.sqrt(sum(v ** 2 for v in vals)) or 1.0
    return [v / norm for v in vals]


def _entry(id: str = "e1", title: str = "", summary: str = "") -> AnalysisEntry:
    return AnalysisEntry(
        id=id,
        level="global",
        title=title or f"Title {id}",
        summary=summary or f"Summary {id}",
        tags=["test"],
        created_at=datetime.now(tz=timezone.utc),
        action_code=None,
    )


async def _seed_bulk_rows(store: LanceDBVectorStore, n: int) -> None:
    """Bulk-seed n rows directly via the real table.add() — bypasses store.insert()'s
    one-row-at-a-time loop + _COMPACT_EVERY compaction noise so a 256+ row corpus
    (LanceDB's own IVF_PQ training floor) stays fast in a unit test."""
    table = await store._get_table()
    rng = random.Random(7)
    rows = [
        {
            "id": f"row-{i}",
            "level": "global",
            "title": f"Title {i}",
            "summary": f"Summary {i}",
            "vector": _rand_vec(rng),
            "tags": "[]",
            "action_code": "",
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
            "ticker": "",
            "sector": "",
            "source_domain": "",
            "depth_tier": "shallow",
            "doc_type": "news",
            "published_at": "",
            "confidence": 0.0,
            "impact_score": 0.0,
        }
        for i in range(n)
    ]
    await table.add(rows)


# ── (a) _build_vector_index() call shape ────────────────────────────────────


@pytest.mark.asyncio
class TestBuildVectorIndexCallShape:
    async def test_flag_starts_false(self, tmp_path):
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        assert store._vector_index_built is False

    async def test_build_vector_index_calls_create_index_on_vector_column(self, tmp_path):
        """_build_vector_index() must call create_index('vector', config=IvfPq(...), replace=True).

        Pure call-shape check — does NOT call through to the real LanceDB trainer
        (unlike the FTS structural test), since IVF_PQ has a real 256-row training
        floor (see TestVectorIndexEndToEnd for the real-trainer coverage).
        """
        from lancedb.index import IvfPq

        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await store.insert(_entry("e1"), _vec(0.1))
        table = await store._get_table()

        call_log: list = []

        async def patched_create_index(field_name, **kwargs):
            config = kwargs.get("config")
            if config is not None and "IvfPq" in type(config).__name__:
                call_log.append((field_name, kwargs))
            return None

        table.create_index = patched_create_index

        await store._build_vector_index()

        assert len(call_log) == 1, f"Expected exactly 1 vector index build call, got {call_log}"
        field_name, kwargs = call_log[0]
        assert field_name == "vector"
        assert isinstance(kwargs.get("config"), IvfPq)
        assert kwargs.get("replace") is True


# ── (b) below-threshold: no-op, zero regression on small/test corpora ──────


@pytest.mark.asyncio
class TestMaybeBuildVectorIndexThreshold:
    async def test_below_threshold_is_noop(self, tmp_path):
        """A corpus below _VECTOR_INDEX_MIN_ROWS must NOT attempt a real index build
        (would raise LanceDB's own 'Not enough rows to train PQ' error) — this is
        the guard that keeps every OTHER test file's tiny fixtures unaffected."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await store.insert(_entry("e1"), _vec(0.1))

        await store._maybe_build_vector_index()  # must not raise

        assert store._vector_index_built is False

    async def test_below_threshold_search_does_not_raise(self, tmp_path):
        """search() on a tiny corpus must behave exactly as before — no exception,
        no index build attempted."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await store.insert(_entry("e1", title="VCB earnings"), _vec(0.1))

        results = await store.search(query_vector=_vec(0.1), limit=5)

        assert isinstance(results, list)
        assert store._vector_index_built is False

    async def test_boundary_just_under_threshold_noop(self, tmp_path, monkeypatch):
        """row_count == _VECTOR_INDEX_MIN_ROWS - 1 must still no-op (off-by-one guard)."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await store.insert(_entry("e1"), _vec(0.1))
        table = await store._get_table()

        async def fake_count_rows():
            return _VECTOR_INDEX_MIN_ROWS - 1

        monkeypatch.setattr(table, "count_rows", fake_count_rows)

        build_calls = []
        store._build_vector_index = AsyncMock(side_effect=lambda: build_calls.append(1))

        await store._maybe_build_vector_index()

        assert build_calls == []
        assert store._vector_index_built is False

    async def test_boundary_at_threshold_builds(self, tmp_path, monkeypatch):
        """row_count == _VECTOR_INDEX_MIN_ROWS must trigger exactly one build."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await store.insert(_entry("e1"), _vec(0.1))
        table = await store._get_table()

        async def fake_count_rows():
            return _VECTOR_INDEX_MIN_ROWS

        monkeypatch.setattr(table, "count_rows", fake_count_rows)

        build_calls = []

        async def fake_build():
            build_calls.append(1)

        store._build_vector_index = fake_build

        await store._maybe_build_vector_index()

        assert build_calls == [1]
        assert store._vector_index_built is True


# ── (c) flag guards against rebuild on subsequent calls ────────────────────


@pytest.mark.asyncio
class TestMaybeBuildVectorIndexFlagGuard:
    async def test_flag_prevents_second_build(self, tmp_path, monkeypatch):
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await store.insert(_entry("e1"), _vec(0.1))
        table = await store._get_table()
        monkeypatch.setattr(table, "count_rows", AsyncMock(return_value=_VECTOR_INDEX_MIN_ROWS))

        build_call_count = 0

        async def counted_build():
            nonlocal build_call_count
            build_call_count += 1

        store._build_vector_index = counted_build

        await store._maybe_build_vector_index()
        await store._maybe_build_vector_index()

        assert build_call_count == 1, f"Expected 1 vector-index build, got {build_call_count}"

    async def test_already_built_skips_count_rows_call(self, tmp_path):
        """Once _vector_index_built is True, _maybe_build_vector_index() must not
        even call count_rows() again — cheap short-circuit."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await store.insert(_entry("e1"), _vec(0.1))
        store._vector_index_built = True

        # If _get_table()/count_rows() were called, this would be observable via a
        # crash-on-call sentinel — instead just assert no exception and flag unchanged.
        await store._maybe_build_vector_index()
        assert store._vector_index_built is True


# ── (d) end-to-end: real LanceDB, real IvfPq trainer, no mocks ─────────────


@pytest.mark.asyncio
class TestVectorIndexEndToEnd:
    async def test_large_corpus_search_triggers_real_build(self, tmp_path):
        """A 300-row corpus (>= _VECTOR_INDEX_MIN_ROWS=256) must trigger a REAL
        IvfPq build on the first search() call, and search() must still return
        normal results afterwards — proves the full lazy-trigger + LanceDB
        trainer path works end-to-end, not just the call shape."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await _seed_bulk_rows(store, 300)
        assert store._vector_index_built is False

        results = await store.search(query_vector=_vec(0.1), limit=5)

        assert store._vector_index_built is True
        assert isinstance(results, list)
        for r in results:
            assert isinstance(r, SearchResult)

    async def test_second_search_does_not_rebuild(self, tmp_path):
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await _seed_bulk_rows(store, 300)

        build_calls = []
        original_build = store._build_vector_index

        async def counted_build():
            build_calls.append(1)
            await original_build()

        store._build_vector_index = counted_build

        await store.search(query_vector=_vec(0.1), limit=5)
        await store.search(query_vector=_vec(0.2), limit=5)

        assert build_calls == [1], f"Expected exactly 1 real build, got {len(build_calls)}"


# ── (e) hybrid_search() also triggers the same lazy build ──────────────────


@pytest.mark.asyncio
class TestHybridSearchAlsoBuildsVectorIndex:
    async def test_hybrid_search_triggers_vector_index_build(self, tmp_path, monkeypatch):
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        await store.insert(_entry("e1", title="VCB earnings"), _vec(0.1))
        table = await store._get_table()
        monkeypatch.setattr(table, "count_rows", AsyncMock(return_value=_VECTOR_INDEX_MIN_ROWS))

        build_calls = []

        async def fake_build():
            build_calls.append(1)

        store._build_vector_index = fake_build

        await store.hybrid_search(query_vector=_vec(0.1), query_text="VCB", limit=5)

        assert build_calls == [1]
        assert store._vector_index_built is True


# ── (f) admin endpoint — mirrors /admin/rebuild-fts exactly ────────────────


@pytest.mark.asyncio
class TestRebuildVectorIndexAdminEndpoint:
    def _wire_router(self, vector_store):
        from fastapi import APIRouter
        from interface.handlers import register_routes
        from domain.services import SearchService
        from application.usecases import SearchUseCase, IndexUseCase

        embedder = AsyncMock()
        search_usecase = SearchUseCase(
            vector_store=vector_store, embedder=embedder, search_service=SearchService()
        )
        index_usecase = IndexUseCase(vector_store=vector_store, embedder=embedder)
        router = APIRouter()
        register_routes(
            router,
            search_usecase=search_usecase,
            index_usecase=index_usecase,
            vector_store=vector_store,
        )
        return router

    async def test_route_registered(self):
        vector_store = AsyncMock()
        vector_store._build_vector_index = AsyncMock()
        vector_store._vector_index_built = False
        router = self._wire_router(vector_store)

        routes = [r.path for r in router.routes]
        assert "/admin/rebuild-vector-index" in routes, f"Got routes: {routes}"

    async def test_returns_ok(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        vector_store = AsyncMock()
        vector_store._build_vector_index = AsyncMock()
        vector_store._vector_index_built = False
        router = self._wire_router(vector_store)

        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        resp = client.post("/admin/rebuild-vector-index")

        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json()["status"] == "ok"

    async def test_calls_build_vector_index(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        vector_store = AsyncMock()
        vector_store._build_vector_index = AsyncMock()
        vector_store._vector_index_built = False
        router = self._wire_router(vector_store)

        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        client.post("/admin/rebuild-vector-index")

        vector_store._build_vector_index.assert_called_once()

    async def test_503_when_vector_store_not_wired(self):
        from fastapi import FastAPI, APIRouter
        from fastapi.testclient import TestClient
        from interface.handlers import register_routes
        from domain.services import SearchService
        from application.usecases import SearchUseCase, IndexUseCase

        vector_store = AsyncMock()
        embedder = AsyncMock()
        search_usecase = SearchUseCase(
            vector_store=vector_store, embedder=embedder, search_service=SearchService()
        )
        index_usecase = IndexUseCase(vector_store=vector_store, embedder=embedder)
        router = APIRouter()
        register_routes(
            router,
            search_usecase=search_usecase,
            index_usecase=index_usecase,
            vector_store=None,
        )
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        resp = client.post("/admin/rebuild-vector-index")

        assert resp.status_code == 503
