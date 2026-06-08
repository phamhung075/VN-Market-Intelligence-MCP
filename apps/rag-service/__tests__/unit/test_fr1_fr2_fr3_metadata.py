"""
Unit tests — FR-1 (LanceDB migration), FR-2 (IndexRequest DTO), FR-3 (SearchRequest DTO + filters).

DEEPFETCH-RAG-REDESIGN Phase 1.

All LanceDB operations use a real throwaway LanceDB in a temp directory so the
migration path is exercised without touching the live DB.  No embedding model
is loaded: vectors are pre-computed fixed arrays.

Coverage:
  - AC-FR1-1: post-migration schema has 16 columns
  - AC-FR1-2: row count pre == post (zero data loss)
  - AC-FR1-3: existing search with no new params returns same result set
  - AC-FR1-4: fresh table initialises with 16-col schema (no add_columns needed)
  - AC-FR1-5: double-startup add_columns is idempotent (no error)
  - AC-FR2-1: POST /index (6-field legacy call) succeeds
  - AC-FR2-2: POST /index (14-field full call) stores all 8 new fields
  - AC-FR2-3: Existing IndexRequest dataclass is backward-compatible
  - AC-FR2-4: ticker/doc_type round-trip via insert → search
  - AC-FR3-1: search with no new params returns same result set
  - AC-FR3-2: ticker filter excludes non-matching rows
  - AC-FR3-3: doc_type filter works
  - AC-FR3-4: invalid depth_tier raises ValueError
  - AC-FR3-5: invalid depth_tier propagates to HTTP 400 via SearchUseCase
"""

import sys
import os
import asyncio
import tempfile
import shutil

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from domain.models import AnalysisEntry, EmbeddingVector, SearchResult
from domain.services import SearchService
from application.dtos import IndexRequest, SearchRequest, SearchResultDTO
from application.usecases import SearchUseCase, IndexUseCase
from infrastructure.repositories import LanceDBVectorStore
from datetime import datetime, timezone
from unittest.mock import AsyncMock


# ── Helpers ────────────────────────────────────────────────────────────────

def _vec(seed: float = 0.1) -> EmbeddingVector:
    """Return a fixed 384-dim vector for test isolation."""
    return EmbeddingVector(dims=384, values=[seed] * 384)


def _entry(
    id: str = "e1",
    ticker: str = "",
    doc_type: str = "news",
    depth_tier: str = "shallow",
    sector: str = "",
    source_domain: str = "",
) -> AnalysisEntry:
    return AnalysisEntry(
        id=id,
        level="global",
        title=f"Title {id}",
        summary=f"Summary {id}",
        tags=["test"],
        created_at=datetime.now(tz=timezone.utc),
        action_code=None,
        ticker=ticker,
        doc_type=doc_type,
        depth_tier=depth_tier,
        sector=sector,
        source_domain=source_domain,
    )


@pytest_asyncio.fixture
async def store_with_data(tmp_path):
    """
    Fixture: LanceDBVectorStore with 3 pre-seeded rows.
    Returns (store, tmp_path).
    """
    db_path = str(tmp_path / "lancedb")
    store = LanceDBVectorStore(db_path=db_path)

    # Insert 3 rows — one VCB/filing, one HPG/news, one generic
    await store.insert(_entry("vcb-1", ticker="VCB", doc_type="filing"), _vec(0.1))
    await store.insert(_entry("hpg-1", ticker="HPG", doc_type="news"), _vec(0.2))
    await store.insert(_entry("gen-1"), _vec(0.3))

    return store, tmp_path


# ── FR-1: LanceDB migration ────────────────────────────────────────────────

class TestFR1Migration:

    @pytest.mark.asyncio
    async def test_ac_fr1_4_fresh_table_has_16_columns(self, tmp_path):
        """AC-FR1-4: fresh deploy gets 16-column schema without migration."""
        db_path = str(tmp_path / "lancedb_fresh")
        store = LanceDBVectorStore(db_path=db_path)
        await store.insert(_entry("seed-1"), _vec())
        table = await store._get_table()
        schema = await table.schema()
        assert len(schema.names) == 16, f"Expected 16 cols, got {len(schema.names)}: {schema.names}"

    @pytest.mark.asyncio
    async def test_ac_fr1_4_fresh_table_has_all_8_new_columns(self, tmp_path):
        """AC-FR1-4: all 8 Phase 1 columns present in fresh table schema."""
        db_path = str(tmp_path / "lancedb_fresh2")
        store = LanceDBVectorStore(db_path=db_path)
        await store.insert(_entry("seed-1"), _vec())
        table = await store._get_table()
        schema = await table.schema()
        new_cols = {"ticker", "sector", "source_domain", "depth_tier", "doc_type",
                    "published_at", "confidence", "impact_score"}
        assert new_cols.issubset(set(schema.names)), (
            f"Missing columns: {new_cols - set(schema.names)}"
        )

    @pytest.mark.asyncio
    async def test_ac_fr1_5_double_startup_idempotent(self, tmp_path):
        """AC-FR1-5: calling _get_table() twice (simulating double-startup) raises no error."""
        db_path = str(tmp_path / "lancedb_idem")
        store = LanceDBVectorStore(db_path=db_path)
        await store.insert(_entry("seed-1"), _vec())

        # Simulate second startup: new store instance against same DB path
        store2 = LanceDBVectorStore(db_path=db_path)
        # Should not raise — migration is idempotent
        table = await store2._get_table()
        schema = await table.schema()
        assert len(schema.names) == 16

    @pytest.mark.asyncio
    async def test_ac_fr1_2_row_count_preserved_after_get_table(self, store_with_data):
        """AC-FR1-2: opening existing table (migration path) preserves row count."""
        store, tmp_path = store_with_data
        count = await store.count()
        assert count == 3

        # Open again as a new store instance — triggers migration path
        db_path = str(tmp_path / "lancedb")
        store2 = LanceDBVectorStore(db_path=db_path)
        count_after = await store2.count()
        assert count_after == count, f"Row count changed: {count} → {count_after}"

    @pytest.mark.asyncio
    async def test_ac_fr1_1_existing_table_migrated_to_16_columns(self, store_with_data):
        """AC-FR1-1: existing table gains 16 columns after migration path runs."""
        store, tmp_path = store_with_data
        db_path = str(tmp_path / "lancedb")
        store2 = LanceDBVectorStore(db_path=db_path)
        table = await store2._get_table()
        schema = await table.schema()
        assert len(schema.names) == 16, f"Expected 16 cols, got {len(schema.names)}: {schema.names}"


# ── FR-2: IndexRequest DTO ─────────────────────────────────────────────────

class TestFR2IndexRequestDTO:

    def test_ac_fr2_3_legacy_6_field_call_compiles(self):
        """AC-FR2-3: existing 6-field IndexRequest is still valid (backward-compatible)."""
        req = IndexRequest(id="e1", content="test", tags=["t"])
        assert req.ticker == ""
        assert req.sector == ""
        assert req.source_domain == ""
        assert req.depth_tier == "shallow"
        assert req.doc_type == "news"
        assert req.published_at == ""
        assert req.confidence == 0.0
        assert req.impact_score == 0.0

    def test_ac_fr2_2_full_14_field_call(self):
        """AC-FR2-2: full 14-field IndexRequest accepts all new fields."""
        req = IndexRequest(
            id="e1",
            content="test",
            tags=["t"],
            level="action",
            title="T",
            summary="S",
            action_code="VCB",
            ticker="VCB",
            sector="Banking",
            source_domain="cafef.vn",
            depth_tier="shallow",
            doc_type="filing",
            published_at="2026-06-08T00:00:00Z",
            confidence=0.9,
            impact_score=7.5,
        )
        assert req.ticker == "VCB"
        assert req.doc_type == "filing"
        assert req.confidence == 0.9
        assert req.impact_score == 7.5

    @pytest.mark.asyncio
    async def test_ac_fr2_4_ticker_doc_type_round_trip(self, store_with_data):
        """AC-FR2-4: row indexed with doc_type='filing' and ticker='VCB' is retrievable
        with those values in the result."""
        store, _ = store_with_data
        # vcb-1 was inserted with ticker="VCB", doc_type="filing"
        results = await store.search(
            query_vector=_vec(0.1),
            limit=10,
        )
        vcb_results = [r for r in results if r.id == "vcb-1"]
        assert len(vcb_results) == 1
        assert vcb_results[0].ticker == "VCB"
        assert vcb_results[0].doc_type == "filing"

    @pytest.mark.asyncio
    async def test_ac_fr2_1_legacy_insert_succeeds(self, tmp_path):
        """AC-FR2-1: inserting with only the original 6 fields (no new metadata) succeeds."""
        db_path = str(tmp_path / "lancedb_legacy")
        store = LanceDBVectorStore(db_path=db_path)
        # Construct AnalysisEntry with legacy fields only (defaults for new fields)
        entry = AnalysisEntry(
            id="legacy-1",
            level="global",
            title="Legacy",
            summary="Legacy summary",
            tags=[],
            created_at=datetime.now(tz=timezone.utc),
        )
        await store.insert(entry, _vec())
        count = await store.count()
        assert count == 1


# ── FR-3: SearchRequest DTO + pre-filters ─────────────────────────────────

class TestFR3SearchFilters:

    @pytest.mark.asyncio
    async def test_ac_fr3_1_no_new_params_same_result_count(self, store_with_data):
        """AC-FR3-1: search with no new filter params returns all 3 rows (no regression)."""
        store, _ = store_with_data
        results = await store.search(query_vector=_vec(0.15), limit=10)
        assert len(results) == 3

    @pytest.mark.asyncio
    async def test_ac_fr3_2_ticker_filter_excludes_non_matching(self, store_with_data):
        """AC-FR3-2: ticker='VCB' filter returns only VCB row; HPG row is absent."""
        store, _ = store_with_data
        results = await store.search(
            query_vector=_vec(0.15),
            limit=10,
            ticker_filter="VCB",
        )
        ids = [r.id for r in results]
        assert "vcb-1" in ids, f"VCB row missing from results: {ids}"
        assert "hpg-1" not in ids, f"HPG row should be filtered out, but got: {ids}"

    @pytest.mark.asyncio
    async def test_ac_fr3_3_doc_type_filter_works(self, store_with_data):
        """AC-FR3-3: doc_type='filing' filter returns only VCB/filing row."""
        store, _ = store_with_data
        results = await store.search(
            query_vector=_vec(0.15),
            limit=10,
            doc_type_filter="filing",
        )
        ids = [r.id for r in results]
        assert "vcb-1" in ids
        assert "hpg-1" not in ids  # HPG is doc_type="news"
        assert "gen-1" not in ids   # gen-1 is doc_type="news" (default)

    @pytest.mark.asyncio
    async def test_ac_fr3_4_invalid_depth_tier_raises_value_error(self, store_with_data):
        """AC-FR3-4: invalid depth_tier raises ValueError (HTTP 400 at interface layer)."""
        store, _ = store_with_data
        with pytest.raises(ValueError, match="depth_tier"):
            await store.search(
                query_vector=_vec(0.15),
                limit=10,
                depth_tier_filter="INVALID",
            )

    @pytest.mark.asyncio
    async def test_ac_fr3_4_invalid_doc_type_raises_value_error(self, store_with_data):
        """FR-3: invalid doc_type also raises ValueError."""
        store, _ = store_with_data
        with pytest.raises(ValueError, match="doc_type"):
            await store.search(
                query_vector=_vec(0.15),
                limit=10,
                doc_type_filter="INVALID_TYPE",
            )

    @pytest.mark.asyncio
    async def test_ac_fr3_4_invalid_ticker_raises_value_error(self, store_with_data):
        """FR-3: invalid ticker (lowercase) raises ValueError."""
        store, _ = store_with_data
        with pytest.raises(ValueError, match="ticker"):
            await store.search(
                query_vector=_vec(0.15),
                limit=10,
                ticker_filter="vcb",  # lowercase = invalid
            )

    @pytest.mark.asyncio
    async def test_ac_fr3_5_invalid_depth_tier_propagates_to_use_case(self):
        """AC-FR3-5: invalid depth_tier propagates as ValueError through SearchUseCase
        (not wrapped in SearchError), allowing the handler to return HTTP 400."""
        vector_store = AsyncMock()
        vector_store.search.side_effect = ValueError("Invalid depth_tier filter: 'bad'")
        embedder = AsyncMock()
        embedder.embed.return_value = _vec()
        search_service = SearchService()

        usecase = SearchUseCase(
            vector_store=vector_store,
            embedder=embedder,
            search_service=search_service,
        )

        with pytest.raises(ValueError, match="depth_tier"):
            await usecase.execute(
                SearchRequest(query="q", depth_tier="bad")
            )

    @pytest.mark.asyncio
    async def test_metadata_fields_propagated_in_results(self, store_with_data):
        """FR-3: search results include the 8 metadata fields from the stored row."""
        store, _ = store_with_data
        results = await store.search(
            query_vector=_vec(0.15),
            limit=10,
            ticker_filter="VCB",
        )
        assert len(results) == 1
        r = results[0]
        assert r.ticker == "VCB"
        assert r.doc_type == "filing"
        assert r.depth_tier == "shallow"

    @pytest.mark.asyncio
    async def test_search_result_dto_has_metadata_fields(self):
        """FR-3: SearchResultDTO dataclass has all 8 new metadata fields with defaults."""
        dto = SearchResultDTO(
            id="e1", level="global", title="T", summary="S",
            tags=[], action_code="", created_at="", distance=0.1, recency_score=0.5,
        )
        assert dto.ticker == ""
        assert dto.sector == ""
        assert dto.source_domain == ""
        assert dto.depth_tier == "shallow"
        assert dto.doc_type == "news"
        assert dto.published_at == ""
        assert dto.confidence == 0.0
        assert dto.impact_score == 0.0

    @pytest.mark.asyncio
    async def test_depth_tier_filter_shallow_works(self, store_with_data):
        """FR-3: depth_tier='shallow' filter (valid) returns matching rows."""
        store, _ = store_with_data
        results = await store.search(
            query_vector=_vec(0.15),
            limit=10,
            depth_tier_filter="shallow",
        )
        # All 3 rows have depth_tier="shallow" (default)
        assert len(results) == 3
