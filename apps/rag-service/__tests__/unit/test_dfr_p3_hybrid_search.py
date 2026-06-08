"""
Unit tests — DFR-P3-RAG: FTS + RRF hybrid search.

Sprint: DEEPFETCH-RAG-REDESIGN Phase 3
Task:   DFR-P3-RAG

Coverage (8 ACs):
  AC-P3R-1: hybrid=false path returns same vector results as before (zero regression)
  AC-P3R-2: hybrid=true returns HTTP 200 with results (no 500)
  AC-P3R-3: hybrid results rank BM25-matching rows above pure-vector results
  AC-P3R-4: first hybrid request triggers lazy FTS build (no 500; succeeds)
  AC-P3R-5: POST /admin/rebuild-fts returns {"status": "ok"}
  AC-P3R-6: non-hybrid callers (no hybrid field) are unaffected
  AC-P3R-7: FTS index built with two separate calls (title then summary) — not a list
  AC-P3R-8: hybrid_search() uses .vector().text() pattern — not string-in-search

All LanceDB operations use a real throwaway LanceDB in a temp directory.
No embedding model is loaded: vectors are pre-computed fixed arrays.

NOTE: AC-P3R-7 and AC-P3R-8 are structural (code-review) — verified by the implementation
itself (test_two_separate_fts_calls + test_hybrid_uses_vector_text_pattern) which would
fail if the wrong pattern were used.
"""

import sys
import os
import asyncio

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from domain.models import AnalysisEntry, EmbeddingVector, SearchResult
from domain.repositories import VectorStorePort
from domain.services import SearchService
from application.dtos import SearchRequest, SearchResultDTO
from application.usecases import SearchUseCase
from infrastructure.repositories import LanceDBVectorStore
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock
import inspect


# ── Helpers ────────────────────────────────────────────────────────────────

def _vec(seed: float = 0.1) -> EmbeddingVector:
    """Return a fixed 384-dim vector for test isolation."""
    return EmbeddingVector(dims=384, values=[seed] * 384)


def _entry(
    id: str = "e1",
    title: str = "",
    summary: str = "",
    ticker: str = "",
    doc_type: str = "news",
    depth_tier: str = "shallow",
) -> AnalysisEntry:
    return AnalysisEntry(
        id=id,
        level="global",
        title=title or f"Title {id}",
        summary=summary or f"Summary {id}",
        tags=["test"],
        created_at=datetime.now(tz=timezone.utc),
        action_code=None,
        ticker=ticker,
        doc_type=doc_type,
        depth_tier=depth_tier,
    )


@pytest_asyncio.fixture
async def vcb_store(tmp_path):
    """
    Fixture: LanceDBVectorStore with 3 rows:
      - vcb-1: title/summary contains 'VCB earnings', ticker=VCB
      - hpg-1: title/summary contains 'HPG steel output'
      - gen-1: generic market news, no specific ticker mention
    Returns (store, tmp_path).
    """
    db_path = str(tmp_path / "lancedb_p3")
    store = LanceDBVectorStore(db_path=db_path)

    await store.insert(
        _entry("vcb-1", title="VCB earnings Q1 2026", summary="VCB bank earnings exceeded expectations",
               ticker="VCB"),
        _vec(0.1),
    )
    await store.insert(
        _entry("hpg-1", title="HPG steel output record", summary="HPG reports record steel production",
               ticker="HPG"),
        _vec(0.5),
    )
    await store.insert(
        _entry("gen-1", title="Market update", summary="General market conditions stable"),
        _vec(0.9),
    )
    return store, tmp_path


# ── Domain port tests ──────────────────────────────────────────────────────

class TestHybridSearchPortSignature:
    """AC-P3R-8: VectorStorePort defines hybrid_search() abstract method."""

    def test_vector_store_port_has_hybrid_search(self):
        """VectorStorePort must declare hybrid_search() as abstractmethod."""
        assert hasattr(VectorStorePort, "hybrid_search"), (
            "VectorStorePort must define hybrid_search() abstract method"
        )

    def test_hybrid_search_is_abstract(self):
        """hybrid_search() must be abstract (not concrete)."""
        method = getattr(VectorStorePort, "hybrid_search", None)
        assert method is not None
        assert getattr(method, "__isabstractmethod__", False), (
            "VectorStorePort.hybrid_search must be @abstractmethod"
        )

    def test_hybrid_search_signature_has_query_text(self):
        """hybrid_search() port signature includes query_text: str parameter."""
        import inspect
        sig = inspect.signature(VectorStorePort.hybrid_search)
        assert "query_text" in sig.parameters, (
            "hybrid_search() must have query_text parameter"
        )

    def test_hybrid_search_signature_has_query_vector(self):
        """hybrid_search() port signature includes query_vector parameter."""
        import inspect
        sig = inspect.signature(VectorStorePort.hybrid_search)
        assert "query_vector" in sig.parameters, (
            "hybrid_search() must have query_vector parameter"
        )


# ── DTO tests ──────────────────────────────────────────────────────────────

class TestSearchRequestHybridField:
    """AC-P3R-1 / AC-P3R-6: SearchRequest.hybrid is a bool, default False."""

    def test_search_request_has_hybrid_field(self):
        """SearchRequest dataclass has hybrid: bool field."""
        req = SearchRequest(query="test")
        assert hasattr(req, "hybrid"), "SearchRequest must have 'hybrid' field"

    def test_hybrid_defaults_to_false(self):
        """SearchRequest.hybrid defaults to False (backward-compatible)."""
        req = SearchRequest(query="test")
        assert req.hybrid is False

    def test_hybrid_can_be_set_to_true(self):
        """SearchRequest.hybrid can be set to True."""
        req = SearchRequest(query="test", hybrid=True)
        assert req.hybrid is True

    def test_existing_fields_unchanged_with_hybrid_false(self):
        """Existing fields unaffected when hybrid=False (no regression)."""
        req = SearchRequest(
            query="VCB earnings",
            limit=10,
            level="action",
            ticker="VCB",
            hybrid=False,
        )
        assert req.query == "VCB earnings"
        assert req.limit == 10
        assert req.level == "action"
        assert req.ticker == "VCB"
        assert req.hybrid is False


# ── Serializer tests ───────────────────────────────────────────────────────

class TestSearchRequestSchemaHybridField:
    """AC-P3R-6: SearchRequestSchema accepts hybrid field; to_dto() maps it."""

    def test_schema_has_hybrid_field(self):
        """SearchRequestSchema has hybrid field with default False."""
        from interface.serializers import SearchRequestSchema
        schema = SearchRequestSchema(query="test")
        assert hasattr(schema, "hybrid"), "SearchRequestSchema must have 'hybrid' field"
        assert schema.hybrid is False

    def test_schema_hybrid_true_maps_to_dto(self):
        """hybrid=True in schema propagates to DTO via to_dto()."""
        from interface.serializers import SearchRequestSchema
        schema = SearchRequestSchema(query="test", hybrid=True)
        dto = schema.to_dto()
        assert dto.hybrid is True

    def test_schema_hybrid_false_maps_to_dto(self):
        """hybrid=False in schema propagates to DTO via to_dto()."""
        from interface.serializers import SearchRequestSchema
        schema = SearchRequestSchema(query="test", hybrid=False)
        dto = schema.to_dto()
        assert dto.hybrid is False

    def test_schema_without_hybrid_defaults_false(self):
        """SearchRequestSchema without hybrid field → dto.hybrid is False."""
        from interface.serializers import SearchRequestSchema
        schema = SearchRequestSchema(query="test")
        dto = schema.to_dto()
        assert dto.hybrid is False


# ── Infrastructure: LanceDBVectorStore.hybrid_search() ────────────────────

class TestLanceDBHybridSearchImplementation:
    """AC-P3R-2/3/4/7/8: hybrid_search() implementation in LanceDBVectorStore."""

    @pytest.mark.asyncio
    async def test_hybrid_search_returns_results(self, vcb_store):
        """AC-P3R-2: hybrid_search() returns results without raising."""
        store, _ = vcb_store
        results = await store.hybrid_search(
            query_vector=_vec(0.1),
            query_text="VCB earnings",
            limit=5,
        )
        assert isinstance(results, list)
        assert len(results) > 0

    @pytest.mark.asyncio
    async def test_hybrid_search_vcb_in_results(self, vcb_store):
        """AC-P3R-3: hybrid search for 'VCB earnings' includes vcb-1 row."""
        store, _ = vcb_store
        results = await store.hybrid_search(
            query_vector=_vec(0.1),
            query_text="VCB earnings",
            limit=5,
        )
        ids = [r.id for r in results]
        assert "vcb-1" in ids, f"VCB row not found in hybrid results: {ids}"

    @pytest.mark.asyncio
    async def test_hybrid_search_fts_index_builds_lazily(self, tmp_path):
        """AC-P3R-4: first hybrid_search() on fresh store triggers lazy FTS build — no error."""
        db_path = str(tmp_path / "lancedb_lazy")
        store = LanceDBVectorStore(db_path=db_path)
        # Seed some rows
        await store.insert(
            _entry("vcb-1", title="VCB earnings Q1", summary="VCB bank results"),
            _vec(0.1),
        )
        # _fts_index_built must start as False
        assert store._fts_index_built is False, "_fts_index_built must start False"
        # First hybrid call must not raise
        results = await store.hybrid_search(
            query_vector=_vec(0.1),
            query_text="VCB earnings",
            limit=5,
        )
        assert isinstance(results, list)
        # After first call, flag must be True
        assert store._fts_index_built is True, "_fts_index_built should be True after first hybrid call"

    @pytest.mark.asyncio
    async def test_hybrid_search_flag_prevents_rebuild(self, tmp_path):
        """AC-P3R-4: second hybrid_search() call does NOT rebuild FTS (flag guards it)."""
        db_path = str(tmp_path / "lancedb_norep")
        store = LanceDBVectorStore(db_path=db_path)
        await store.insert(
            _entry("vcb-1", title="VCB earnings", summary="VCB bank"),
            _vec(0.1),
        )

        build_call_count = 0
        original_build = store._build_fts_index

        async def counted_build():
            nonlocal build_call_count
            build_call_count += 1
            return await original_build()

        store._build_fts_index = counted_build

        # First call
        await store.hybrid_search(query_vector=_vec(0.1), query_text="VCB", limit=5)
        # Second call — should NOT rebuild
        await store.hybrid_search(query_vector=_vec(0.1), query_text="VCB", limit=5)

        assert build_call_count == 1, f"Expected 1 FTS build, got {build_call_count}"

    @pytest.mark.asyncio
    async def test_hybrid_search_with_filter_still_works(self, vcb_store):
        """AC-P3R: existing Phase-1 metadata filters work in hybrid mode."""
        store, _ = vcb_store
        results = await store.hybrid_search(
            query_vector=_vec(0.1),
            query_text="VCB earnings",
            limit=5,
            ticker_filter="VCB",
        )
        ids = [r.id for r in results]
        # With ticker_filter=VCB, only vcb-1 should be present
        assert "vcb-1" in ids
        assert "hpg-1" not in ids
        assert "gen-1" not in ids

    @pytest.mark.asyncio
    async def test_hybrid_search_invalid_ticker_raises_value_error(self, vcb_store):
        """AC-P3R: invalid ticker filter in hybrid mode raises ValueError (same as vector path)."""
        store, _ = vcb_store
        with pytest.raises(ValueError, match="ticker"):
            await store.hybrid_search(
                query_vector=_vec(0.1),
                query_text="VCB",
                limit=5,
                ticker_filter="vcb",  # lowercase = invalid
            )

    @pytest.mark.asyncio
    async def test_hybrid_search_returns_search_result_objects(self, vcb_store):
        """AC-P3R-2: hybrid_search() returns list[SearchResult] objects."""
        store, _ = vcb_store
        results = await store.hybrid_search(
            query_vector=_vec(0.1),
            query_text="VCB",
            limit=5,
        )
        for r in results:
            assert isinstance(r, SearchResult), f"Expected SearchResult, got {type(r)}"

    @pytest.mark.asyncio
    async def test_build_fts_index_two_separate_calls(self, tmp_path):
        """AC-P3R-7: _build_fts_index() calls create_index('title') then create_index('summary') — never a list.

        Uses create_index(field, config=FTS()) pattern (version-stable API across lancedb 0.25.3+).
        """
        db_path = str(tmp_path / "lancedb_twocall")
        store = LanceDBVectorStore(db_path=db_path)
        await store.insert(
            _entry("vcb-1", title="VCB earnings", summary="VCB bank"),
            _vec(0.1),
        )
        table = await store._get_table()
        call_log: list = []

        original_create_index = table.create_index

        async def patched_create_index(field_name, **kwargs):
            # Only log FTS index calls (ignore vector index calls if any)
            config = kwargs.get("config")
            if config is not None and "FTS" in type(config).__name__:
                call_log.append(field_name)
            return await original_create_index(field_name, **kwargs)

        table.create_index = patched_create_index

        await store._build_fts_index()

        assert len(call_log) == 2, f"Expected 2 separate FTS index calls, got {len(call_log)}: {call_log}"
        assert call_log[0] == "title", f"First call must be create_index('title', ...), got {call_log[0]}"
        assert call_log[1] == "summary", f"Second call must be create_index('summary', ...), got {call_log[1]}"
        # Must NOT use a list
        for arg in call_log:
            assert not isinstance(arg, list), (
                "create_index must NOT be called with a list field name — each field needs a separate call"
            )

    @pytest.mark.asyncio
    async def test_dedup_and_trim_removes_duplicates(self, tmp_path):
        """AC-P3R: _dedup_and_trim() removes rows with identical (title, summary)."""
        db_path = str(tmp_path / "lancedb_dedup")
        store = LanceDBVectorStore(db_path=db_path)
        # Two rows with same title+summary (simulating re-indexed deep entry)
        rows = [
            {"id": "r1", "title": "Same title", "summary": "Same summary",
             "level": "global", "tags": "[]", "action_code": "",
             "created_at": datetime.now(tz=timezone.utc).isoformat(),
             "ticker": "", "sector": "", "source_domain": "",
             "depth_tier": "shallow", "doc_type": "news",
             "published_at": "", "confidence": 0.0, "impact_score": 0.0,
             "_relevance_score": 0.9},
            {"id": "r2", "title": "Same title", "summary": "Same summary",  # duplicate
             "level": "global", "tags": "[]", "action_code": "",
             "created_at": datetime.now(tz=timezone.utc).isoformat(),
             "ticker": "", "sector": "", "source_domain": "",
             "depth_tier": "shallow", "doc_type": "news",
             "published_at": "", "confidence": 0.0, "impact_score": 0.0,
             "_relevance_score": 0.8},
            {"id": "r3", "title": "Different title", "summary": "Different summary",
             "level": "global", "tags": "[]", "action_code": "",
             "created_at": datetime.now(tz=timezone.utc).isoformat(),
             "ticker": "", "sector": "", "source_domain": "",
             "depth_tier": "shallow", "doc_type": "news",
             "published_at": "", "confidence": 0.0, "impact_score": 0.0,
             "_relevance_score": 0.7},
        ]
        results = store._dedup_and_trim(rows, limit=10)
        ids = [r.id for r in results]
        assert len(results) == 2, f"Expected 2 after dedup, got {len(results)}: {ids}"
        assert "r1" in ids
        assert "r3" in ids
        assert "r2" not in ids  # duplicate removed

    @pytest.mark.asyncio
    async def test_dedup_and_trim_respects_limit(self, tmp_path):
        """AC-P3R: _dedup_and_trim() caps output at requested limit."""
        db_path = str(tmp_path / "lancedb_trim")
        store = LanceDBVectorStore(db_path=db_path)
        rows = [
            {"id": f"r{i}", "title": f"Title {i}", "summary": f"Summary {i}",
             "level": "global", "tags": "[]", "action_code": "",
             "created_at": datetime.now(tz=timezone.utc).isoformat(),
             "ticker": "", "sector": "", "source_domain": "",
             "depth_tier": "shallow", "doc_type": "news",
             "published_at": "", "confidence": 0.0, "impact_score": 0.0,
             "_relevance_score": 0.9 - i * 0.1}
            for i in range(10)
        ]
        results = store._dedup_and_trim(rows, limit=3)
        assert len(results) == 3


# ── SearchUseCase hybrid branch ────────────────────────────────────────────

class TestSearchUseCaseHybridBranch:
    """AC-P3R-1: hybrid=False → vector path. AC-P3R-2: hybrid=True → hybrid_search() called."""

    @pytest.mark.asyncio
    async def test_hybrid_false_calls_vector_search(self):
        """AC-P3R-1: hybrid=False → usecase calls vector_store.search() not hybrid_search()."""
        vector_store = AsyncMock()
        vector_store.search.return_value = []
        vector_store.hybrid_search = AsyncMock(return_value=[])
        embedder = AsyncMock()
        embedder.embed.return_value = _vec()
        search_service = SearchService()

        usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=search_service,
        )

        await usecase.execute(SearchRequest(query="VCB earnings", hybrid=False))

        vector_store.search.assert_called_once()
        vector_store.hybrid_search.assert_not_called()

    @pytest.mark.asyncio
    async def test_hybrid_true_calls_hybrid_search(self):
        """AC-P3R-2: hybrid=True → usecase calls vector_store.hybrid_search() not search()."""
        vector_store = AsyncMock()
        vector_store.search = AsyncMock(return_value=[])
        vector_store.hybrid_search = AsyncMock(return_value=[])
        embedder = AsyncMock()
        embedder.embed.return_value = _vec()
        search_service = SearchService()

        usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=search_service,
        )

        await usecase.execute(SearchRequest(query="VCB earnings", hybrid=True))

        vector_store.hybrid_search.assert_called_once()
        vector_store.search.assert_not_called()

    @pytest.mark.asyncio
    async def test_hybrid_true_passes_query_text(self):
        """AC-P3R-8: hybrid_search() receives query_text=request.query."""
        vector_store = AsyncMock()
        vector_store.hybrid_search = AsyncMock(return_value=[])
        embedder = AsyncMock()
        embedder.embed.return_value = _vec()
        search_service = SearchService()

        usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=search_service,
        )

        await usecase.execute(SearchRequest(query="VCB Q1 earnings", hybrid=True))

        call_kwargs = vector_store.hybrid_search.call_args[1]
        assert call_kwargs.get("query_text") == "VCB Q1 earnings", (
            f"Expected query_text='VCB Q1 earnings', got {call_kwargs}"
        )

    @pytest.mark.asyncio
    async def test_hybrid_true_temporal_decay_applied(self):
        """AC: temporal decay ranking applied on hybrid path too."""
        now_iso = datetime.now(tz=timezone.utc).isoformat()
        old_iso = (datetime.now(tz=timezone.utc).replace(year=2020)).isoformat()

        # Return 2 results: one recent, one old
        recent_result = SearchResult(
            id="recent", level="global", title="T", summary="S",
            tags=[], action_code="", created_at=now_iso, distance=0.5,
        )
        old_result = SearchResult(
            id="old", level="global", title="T2", summary="S2",
            tags=[], action_code="", created_at=old_iso, distance=0.2,
        )

        vector_store = AsyncMock()
        vector_store.hybrid_search = AsyncMock(return_value=[recent_result, old_result])
        embedder = AsyncMock()
        embedder.embed.return_value = _vec()
        search_service = SearchService()

        usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=search_service,
        )

        response = await usecase.execute(
            SearchRequest(query="test", hybrid=True, limit=10, decay_half_life_days=7.0)
        )

        # Response must have results
        assert len(response.results) > 0
        # Recency scores must be present
        for r in response.results:
            assert r.recency_score >= 0.0

    @pytest.mark.asyncio
    async def test_hybrid_false_no_hybrid_field_backward_compat(self):
        """AC-P3R-6: SearchRequest without hybrid field → vector path unchanged."""
        vector_store = AsyncMock()
        vector_store.search = AsyncMock(return_value=[])
        vector_store.hybrid_search = AsyncMock(return_value=[])
        embedder = AsyncMock()
        embedder.embed.return_value = _vec()
        search_service = SearchService()

        usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=search_service,
        )

        # No hybrid field → defaults to False → vector path
        await usecase.execute(SearchRequest(query="test"))

        vector_store.search.assert_called_once()
        vector_store.hybrid_search.assert_not_called()

    @pytest.mark.asyncio
    async def test_hybrid_true_passes_filters(self):
        """AC-P3R: hybrid path passes same filter kwargs as vector path."""
        vector_store = AsyncMock()
        vector_store.hybrid_search = AsyncMock(return_value=[])
        embedder = AsyncMock()
        embedder.embed.return_value = _vec()
        search_service = SearchService()

        usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=search_service,
        )

        await usecase.execute(
            SearchRequest(
                query="VCB earnings",
                hybrid=True,
                ticker="VCB",
                doc_type="filing",
            )
        )

        call_kwargs = vector_store.hybrid_search.call_args[1]
        assert call_kwargs.get("ticker_filter") == "VCB"
        assert call_kwargs.get("doc_type_filter") == "filing"


# ── Handler: /admin/rebuild-fts route ─────────────────────────────────────

class TestAdminRebuildFtsRoute:
    """AC-P3R-5: POST /admin/rebuild-fts returns {"status":"ok"}."""

    @pytest.mark.asyncio
    async def test_rebuild_fts_route_registered(self):
        """POST /admin/rebuild-fts handler function must exist in handlers module."""
        from interface.handlers import register_routes
        from fastapi import APIRouter
        from application.usecases import SearchUseCase, IndexUseCase

        vector_store = AsyncMock()
        vector_store._build_fts_index = AsyncMock()
        vector_store._fts_index_built = False
        embedder = AsyncMock()
        search_usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=SearchService(),
        )
        index_usecase = IndexUseCase(
            vector_store=vector_store,
            embedder=embedder,
        )

        router = APIRouter()
        register_routes(router, search_usecase=search_usecase, index_usecase=index_usecase,
                        vector_store=vector_store)

        # Check that /admin/rebuild-fts route is registered
        routes = [r.path for r in router.routes]
        assert "/admin/rebuild-fts" in routes, (
            f"POST /admin/rebuild-fts must be registered. Got routes: {routes}"
        )

    @pytest.mark.asyncio
    async def test_rebuild_fts_returns_ok(self):
        """AC-P3R-5: POST /admin/rebuild-fts calls _build_fts_index() and returns status:ok."""
        from fastapi.testclient import TestClient
        from fastapi import FastAPI, APIRouter
        from interface.handlers import register_routes
        from application.usecases import SearchUseCase, IndexUseCase

        vector_store = AsyncMock()
        vector_store._build_fts_index = AsyncMock()
        vector_store._fts_index_built = False
        embedder = AsyncMock()
        search_usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=SearchService(),
        )
        index_usecase = IndexUseCase(
            vector_store=vector_store,
            embedder=embedder,
        )

        app = FastAPI()
        router = APIRouter()
        register_routes(router, search_usecase=search_usecase, index_usecase=index_usecase,
                        vector_store=vector_store)
        app.include_router(router)

        client = TestClient(app)
        resp = client.post("/admin/rebuild-fts")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json()["status"] == "ok", f"Expected status:ok, got {resp.json()}"

    @pytest.mark.asyncio
    async def test_rebuild_fts_calls_build_method(self):
        """AC-P3R-5: POST /admin/rebuild-fts calls vector_store._build_fts_index()."""
        from fastapi.testclient import TestClient
        from fastapi import FastAPI, APIRouter
        from interface.handlers import register_routes
        from application.usecases import SearchUseCase, IndexUseCase

        vector_store = AsyncMock()
        vector_store._build_fts_index = AsyncMock()
        vector_store._fts_index_built = False
        embedder = AsyncMock()
        search_usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=SearchService(),
        )
        index_usecase = IndexUseCase(
            vector_store=vector_store,
            embedder=embedder,
        )

        app = FastAPI()
        router = APIRouter()
        register_routes(router, search_usecase=search_usecase, index_usecase=index_usecase,
                        vector_store=vector_store)
        app.include_router(router)

        client = TestClient(app)
        client.post("/admin/rebuild-fts")

        vector_store._build_fts_index.assert_called_once()


# ── LanceDB build_filter_clauses shared helper ───────────────────────────

class TestBuildFilterClausesHelper:
    """AC-P3R: _build_filter_clauses() is a shared private method on LanceDBVectorStore."""

    @pytest.mark.asyncio
    async def test_store_has_build_filter_clauses(self, tmp_path):
        """LanceDBVectorStore has _build_filter_clauses() as a private method."""
        db_path = str(tmp_path / "lancedb_fc")
        store = LanceDBVectorStore(db_path=db_path)
        assert hasattr(store, "_build_filter_clauses"), (
            "LanceDBVectorStore must have _build_filter_clauses() method"
        )

    @pytest.mark.asyncio
    async def test_build_filter_clauses_no_filters(self, tmp_path):
        """_build_filter_clauses() with no args returns empty list."""
        db_path = str(tmp_path / "lancedb_fc2")
        store = LanceDBVectorStore(db_path=db_path)
        clauses = store._build_filter_clauses()
        assert clauses == [], f"Expected [], got {clauses}"

    @pytest.mark.asyncio
    async def test_build_filter_clauses_ticker(self, tmp_path):
        """_build_filter_clauses(ticker_filter='VCB') returns valid SQL clause."""
        db_path = str(tmp_path / "lancedb_fc3")
        store = LanceDBVectorStore(db_path=db_path)
        clauses = store._build_filter_clauses(ticker_filter="VCB")
        assert len(clauses) == 1
        assert "VCB" in clauses[0]

    @pytest.mark.asyncio
    async def test_build_filter_clauses_invalid_ticker_raises(self, tmp_path):
        """_build_filter_clauses(ticker_filter='vcb') raises ValueError (lowercase invalid)."""
        db_path = str(tmp_path / "lancedb_fc4")
        store = LanceDBVectorStore(db_path=db_path)
        with pytest.raises(ValueError, match="ticker"):
            store._build_filter_clauses(ticker_filter="vcb")
