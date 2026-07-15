"""
Unit tests — RAG-FTS-BUILD-MEMORY-BOUND.

Task: RAG-FTS-BUILD-MEMORY-BOUND (P1, FIX-S)

Root cause (see infrastructure/repositories.py module header for the full
investigation trail): LanceDB's native FTS builder (rust `lance-index` crate)
fans a build out across `LANCE_FTS_NUM_SHARDS` parallel workers, each
buffering up to `LANCE_FTS_PARTITION_SIZE` MiB (default 2048 MiB) before
flushing to disk. Neither knob is exposed via lancedb's Python `FTS()`
config or `AsyncTable.create_index()` — they are process-global Rust
`LazyLock` statics read from the OS environment on first use. The fix pins
both env vars to small, container-safe values at module-import time.

Coverage:
  AC-1: importing infrastructure.repositories pins LANCE_FTS_NUM_SHARDS=1 and
        LANCE_FTS_PARTITION_SIZE=32 (MiB) as process defaults.
  AC-2: setdefault() semantics — an operator-provided env var (e.g. via
        docker-compose.yml) is NEVER clobbered by the module import.
  AC-3: _build_fts_index() still performs exactly two create_index() calls
        (title, then summary) — the bounded-memory fix does not change the
        AC-P3R-7 call pattern, only the process-level Rust builder config.
  AC-4: search()/hybrid_search() continue to return correct real results
        after a bounded-config FTS build (no functional regression).

All LanceDB operations use a real throwaway LanceDB in a temp directory —
no mocked FTS results.
"""

import os
import subprocess
import sys

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from datetime import datetime, timezone

from domain.models import AnalysisEntry, EmbeddingVector
from infrastructure.repositories import LanceDBVectorStore


def _vec(seed: float = 0.1) -> EmbeddingVector:
    return EmbeddingVector(dims=384, values=[seed] * 384)


def _entry(id: str, title: str, summary: str, ticker: str = "") -> AnalysisEntry:
    return AnalysisEntry(
        id=id,
        level="global",
        title=title,
        summary=summary,
        tags=["test"],
        created_at=datetime.now(tz=timezone.utc),
        action_code=None,
        ticker=ticker,
    )


class TestFtsBuildEnvPinning:
    """AC-1, AC-2: the module pins bounded-memory env vars at import time."""

    def test_env_vars_pinned_after_import(self):
        """Importing infrastructure.repositories pins the two Rust-level env vars."""
        assert os.environ.get("LANCE_FTS_NUM_SHARDS") == "1", (
            "LANCE_FTS_NUM_SHARDS must default to 1 (single worker) to avoid "
            "multiplying the per-worker memory ceiling across parallel workers"
        )
        assert os.environ.get("LANCE_FTS_PARTITION_SIZE") == "32", (
            "LANCE_FTS_PARTITION_SIZE must default to a small MiB value — this "
            "is the per-worker flush threshold bounding build memory"
        )

    def test_operator_override_not_clobbered(self):
        """setdefault() semantics: a pre-set env var survives module import.

        Runs in a FRESH subprocess (the module-level setdefault() only executes
        once per process — this must not be conflated with the already-imported
        module in the current test process).
        """
        env = dict(os.environ)
        env["LANCE_FTS_NUM_SHARDS"] = "4"
        env["LANCE_FTS_PARTITION_SIZE"] = "512"
        service_root = os.path.join(os.path.dirname(__file__), "..", "..")
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys; sys.path.insert(0, '.'); "
                "import infrastructure.repositories; "
                "import os; "
                "print(os.environ['LANCE_FTS_NUM_SHARDS']); "
                "print(os.environ['LANCE_FTS_PARTITION_SIZE'])",
            ],
            cwd=service_root,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, result.stderr
        lines = result.stdout.strip().splitlines()
        assert lines == ["4", "512"], (
            f"operator-provided env vars must survive module import unchanged, got {lines}"
        )


class TestFtsBuildCallPatternUnchanged:
    """AC-3: the bounded-memory fix does not change the two-call AC-P3R-7 pattern."""

    @pytest.mark.asyncio
    async def test_build_fts_index_still_two_separate_calls(self, tmp_path):
        db_path = str(tmp_path / "lancedb_boundcheck")
        store = LanceDBVectorStore(db_path=db_path)
        await store.insert(
            _entry("vcb-1", "VCB earnings Q1 2026", "VCB bank earnings exceeded expectations", "VCB"),
            _vec(0.1),
        )
        table = await store._get_table()
        call_log: list = []
        original_create_index = table.create_index

        async def patched_create_index(field_name, **kwargs):
            config = kwargs.get("config")
            if config is not None and "FTS" in type(config).__name__:
                call_log.append(field_name)
            return await original_create_index(field_name, **kwargs)

        table.create_index = patched_create_index
        await store._build_fts_index()

        assert call_log == ["title", "summary"], (
            f"bounded-memory fix must preserve the two-separate-call pattern, got {call_log}"
        )


class TestFtsBuildFunctionalRegression:
    """AC-4: search()/hybrid_search() unchanged — real end-to-end sanity."""

    @pytest_asyncio.fixture
    async def store_with_rows(self, tmp_path):
        db_path = str(tmp_path / "lancedb_boundfunctional")
        store = LanceDBVectorStore(db_path=db_path)
        await store.insert(
            _entry("vcb-1", "VCB earnings Q1 2026", "VCB bank earnings exceeded expectations", "VCB"),
            _vec(0.1),
        )
        await store.insert(
            _entry("hpg-1", "HPG steel output record", "HPG reports record steel production", "HPG"),
            _vec(0.5),
        )
        return store

    @pytest.mark.asyncio
    async def test_hybrid_search_returns_real_results_after_bounded_build(self, store_with_rows):
        store = store_with_rows
        results = await store.hybrid_search(
            query_vector=_vec(0.1), query_text="VCB earnings", limit=5,
        )
        ids = [r.id for r in results]
        assert "vcb-1" in ids
        assert store._fts_index_built is True
