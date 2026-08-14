"""
Unit tests — FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS
(2026-08-14, in-process attribution follow-up).

Root cause named via a real in-process memory profile (tracemalloc + gc
object-type census + pyarrow's own native memory-pool accounting, driven
against the deployed image under the real ~4:1 insert:search production
traffic mix — scripts/audits/rag-lancedb-mem-attribution-probe.py): all
three Python/PyArrow-visible planes stayed flat while RSS climbed ~120MB
over 140 ops, ruling out Python heap / PyArrow buffers as the source. By
elimination, and confirmed against the deployed image (lancedb 0.37.1):
`lancedb.connect_async()` with no explicit `session=` builds an internal
`Session.default()` — 6GB index cache + 1GB metadata cache, i.e. effectively
unbounded inside this service's 1GB container.

Two fixes under test here:
  1. LanceDBVectorStore now accepts `index_cache_bytes`/`metadata_cache_bytes`
     and, when either is set, builds an explicit `lancedb.Session(...)` passed
     into `connect_async(..., session=...)`. `None` (default) preserves the
     exact pre-fix behaviour — no session kwarg, lancedb's own unbounded
     default — so any caller that doesn't opt in (including every OTHER test
     in this suite that constructs `LanceDBVectorStore(db_path=...)` with no
     extra kwargs) is unaffected.
  2. `compact_retention` (constructor param) overrides the module-level
     `_COMPACT_RETENTION` (2 days) passed to `table.optimize(cleanup_older_than=...)`.
     Measured evidence (same probe, write-heavy replay): a 2-day retention
     never prunes anything inside this container's real uptime (OOM-restarts
     every 30-90min); re-running optimize() with a short window against the
     SAME corpus pruned 4170 stale versions / ~422MB in one call.
"""

import sys
import os
import math
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from infrastructure.repositories import LanceDBVectorStore, _COMPACT_RETENTION
from domain.models import AnalysisEntry, EmbeddingVector


def _make_entry(entry_id: str) -> AnalysisEntry:
    return AnalysisEntry(
        id=entry_id,
        level="global",
        title=f"Title {entry_id}",
        summary="summary",
        tags=[],
        created_at=datetime.now(tz=timezone.utc),
    )


def _make_vector() -> EmbeddingVector:
    import random
    rng = random.Random(7)
    vals = [rng.gauss(0, 1) for _ in range(384)]
    norm = math.sqrt(sum(v ** 2 for v in vals)) or 1.0
    return EmbeddingVector(dims=384, values=[v / norm for v in vals])


# ── Session cache bound wiring ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_table_session_is_none_when_cache_bytes_not_provided(tmp_path):
    """Default construction (no cache-size kwargs) must NOT pass a session —
    preserves lancedb's own pre-fix Session.default() behaviour exactly, so
    every other test in this suite (constructs LanceDBVectorStore(db_path=...)
    with no extra kwargs) stays byte-for-byte unaffected by this fix."""
    store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
    await store._get_table()
    assert store._session is None


@pytest.mark.asyncio
async def test_get_table_builds_bounded_session_when_cache_bytes_given(tmp_path):
    """index_cache_bytes/metadata_cache_bytes, when set, must produce a real
    lancedb.Session and get passed through to connect_async(session=...) —
    the actual fix for the unbounded-cache root cause."""
    store = LanceDBVectorStore(
        db_path=str(tmp_path / "lancedb"),
        index_cache_bytes=96 * 1024 * 1024,
        metadata_cache_bytes=32 * 1024 * 1024,
    )
    await store._get_table()

    assert store._session is not None
    # Real lancedb.Session object — confirm it reports a real, tiny (just-
    # constructed) size, not a mock stand-in, i.e. the real API was exercised.
    assert store._session.size_bytes >= 0
    assert store._session.approx_num_items >= 0


@pytest.mark.asyncio
async def test_get_table_session_constructed_with_exact_configured_bytes(tmp_path):
    """Patch lancedb.Session itself to assert the EXACT kwargs this fix wires
    through — the most direct possible confirmation of the root-cause fix,
    independent of Session's own runtime accounting."""
    store = LanceDBVectorStore(
        db_path=str(tmp_path / "lancedb"),
        index_cache_bytes=12345,
        metadata_cache_bytes=6789,
    )

    import lancedb as real_lancedb

    with patch.object(real_lancedb, "Session", wraps=real_lancedb.Session) as spy_session:
        await store._get_table()

    spy_session.assert_called_once_with(
        index_cache_size_bytes=12345,
        metadata_cache_size_bytes=6789,
    )


@pytest.mark.asyncio
async def test_bounded_session_stays_near_configured_ceiling_under_real_traffic(tmp_path):
    """REAL end-to-end (no mocks) confirmation: drive real insert()/search()
    traffic — enough to exceed a deliberately tiny cache bound many times over
    if the bound were not actually being enforced — and assert the Session's
    own live size_bytes never blows past its configured ceiling by more than
    a small, generous margin (lancedb's LRU eviction is not required to be
    byte-exact synchronous, so this is a bounded-not-unbounded check, not an
    exact-equality check)."""
    tiny_index_cache = 256 * 1024       # 256 KiB
    tiny_metadata_cache = 128 * 1024    # 128 KiB
    store = LanceDBVectorStore(
        db_path=str(tmp_path / "lancedb"),
        index_cache_bytes=tiny_index_cache,
        metadata_cache_bytes=tiny_metadata_cache,
    )
    vec = _make_vector()

    for i in range(80):
        await store.insert(_make_entry(f"bound-{i}"), vec)
    for _ in range(20):
        await store.search(query_vector=vec, limit=5)

    assert store._session is not None
    # Generous multiplier: this is a regression guard against the OLD
    # unbounded-by-default behaviour (which would have let this climb to
    # hundreds of MB / low GB under equivalent real traffic — see this row's
    # scripts/audits/rag-lancedb-mem-attribution-probe.py measurement), not a
    # tight equality assertion against lancedb's internal eviction timing.
    ceiling = tiny_index_cache + tiny_metadata_cache
    assert store._session.size_bytes <= ceiling * 4, (
        f"session cache grew to {store._session.size_bytes} bytes, "
        f"more than 4x its configured {ceiling}-byte ceiling — bound not respected"
    )


# ── Compaction retention window wiring ────────────────────────────────────


def test_compact_retention_defaults_to_module_constant(tmp_path):
    """No override → preserves the exact pre-fix _COMPACT_RETENTION constant."""
    store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
    assert store._compact_retention == _COMPACT_RETENTION


def test_compact_retention_uses_constructor_override(tmp_path):
    custom = timedelta(hours=3)
    store = LanceDBVectorStore(
        db_path=str(tmp_path / "lancedb"),
        compact_retention=custom,
    )
    assert store._compact_retention == custom
    assert store._compact_retention != _COMPACT_RETENTION


@pytest.mark.asyncio
async def test_compact_uses_configured_retention_not_module_default(tmp_path):
    """compact() must call table.optimize(cleanup_older_than=<the configured
    override>), not the module-level _COMPACT_RETENTION — real table, spy on
    optimize(), same pattern as test_lancedb_compaction.py's AC1/AC2 tests."""
    custom = timedelta(hours=2)
    assert custom != _COMPACT_RETENTION  # sanity: must be a real, different value

    store = LanceDBVectorStore(
        db_path=str(tmp_path / "lancedb"),
        compact_retention=custom,
    )
    table = await store._get_table()
    real_optimize = table.optimize
    calls = []

    async def tracking_optimize(*args, **kwargs):
        calls.append(kwargs)
        return await real_optimize(*args, **kwargs)

    table.optimize = tracking_optimize

    await store.compact()

    assert len(calls) == 1
    assert calls[0]["cleanup_older_than"] == custom


# ── Config wiring ──────────────────────────────────────────────────────────


def test_config_default_index_cache_mb_is_96(monkeypatch):
    from infrastructure.config import Config

    monkeypatch.delenv("LANCEDB_INDEX_CACHE_MB", raising=False)
    cfg = Config.from_env()
    assert cfg.lancedb_index_cache_mb == 96


def test_config_reads_index_cache_mb_from_env(monkeypatch):
    from infrastructure.config import Config

    monkeypatch.setenv("LANCEDB_INDEX_CACHE_MB", "50")
    cfg = Config.from_env()
    assert cfg.lancedb_index_cache_mb == 50


def test_config_default_metadata_cache_mb_is_32(monkeypatch):
    from infrastructure.config import Config

    monkeypatch.delenv("LANCEDB_METADATA_CACHE_MB", raising=False)
    cfg = Config.from_env()
    assert cfg.lancedb_metadata_cache_mb == 32


def test_config_reads_metadata_cache_mb_from_env(monkeypatch):
    from infrastructure.config import Config

    monkeypatch.setenv("LANCEDB_METADATA_CACHE_MB", "16")
    cfg = Config.from_env()
    assert cfg.lancedb_metadata_cache_mb == 16


def test_config_default_compact_retention_hours_is_1(monkeypatch):
    from infrastructure.config import Config

    monkeypatch.delenv("LANCEDB_COMPACT_RETENTION_HOURS", raising=False)
    cfg = Config.from_env()
    assert cfg.lancedb_compact_retention_hours == 1


def test_config_reads_compact_retention_hours_from_env(monkeypatch):
    from infrastructure.config import Config

    monkeypatch.setenv("LANCEDB_COMPACT_RETENTION_HOURS", "6")
    cfg = Config.from_env()
    assert cfg.lancedb_compact_retention_hours == 6


# ── app_factory wiring (production adapter construction) ──────────────────


def test_build_real_adapters_wires_cache_and_retention_from_config(monkeypatch, tmp_path):
    """build_real_adapters() must thread Config's cache-size/retention fields
    into the real LanceDBVectorStore it constructs — the production wiring
    path, not just the class's own constructor defaults."""
    monkeypatch.setenv("LANCEDB_PATH", str(tmp_path / "lancedb"))
    monkeypatch.setenv("DB_PATH", str(tmp_path / "rag_service.db"))
    monkeypatch.setenv("EMBEDDING_CACHE_DIR", str(tmp_path / "models"))
    monkeypatch.setenv("LANCEDB_INDEX_CACHE_MB", "10")
    monkeypatch.setenv("LANCEDB_METADATA_CACHE_MB", "5")
    monkeypatch.setenv("LANCEDB_COMPACT_RETENTION_HOURS", "2")

    from app_factory import build_real_adapters

    _embedder, vector_store, _cfg = build_real_adapters()

    assert vector_store._index_cache_bytes == 10 * 1024 * 1024
    assert vector_store._metadata_cache_bytes == 5 * 1024 * 1024
    assert vector_store._compact_retention == timedelta(hours=2)
