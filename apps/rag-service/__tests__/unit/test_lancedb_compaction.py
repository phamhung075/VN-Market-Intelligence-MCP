"""
Unit tests — LanceDBVectorStore periodic compaction guard.

Verifies:
- compact() is called after _COMPACT_EVERY inserts
- compact() resets the insert counter
- compact() failure is non-fatal (insert still succeeds)
- compact() can be called directly without side-effects on row count
- FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP AC1: a failing optimize() still
  resets the counter (via finally:), and the very next insert does not
  immediately re-fire compact()
- FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP AC2: two concurrent insert()
  coroutines that both cross _COMPACT_EVERY produce exactly ONE optimize()
  call, not two (asyncio.Lock serialization)
"""

import asyncio
import sys
import os
import math
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from infrastructure.repositories import LanceDBVectorStore, _COMPACT_EVERY
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
    rng = random.Random(42)
    vals = [rng.gauss(0, 1) for _ in range(384)]
    norm = math.sqrt(sum(v ** 2 for v in vals)) or 1.0
    return EmbeddingVector(dims=384, values=[v / norm for v in vals])


@pytest.mark.asyncio
class TestCompactionGuard:

    async def test_compact_called_at_threshold(self, tmp_path):
        """compact() fires exactly once when insert count reaches _COMPACT_EVERY."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        vec = _make_vector()

        compact_calls = []
        original_compact = store.compact

        async def spy_compact():
            compact_calls.append(1)
            await original_compact()

        store.compact = spy_compact

        # Insert _COMPACT_EVERY - 1 entries — compact must NOT fire yet
        for i in range(_COMPACT_EVERY - 1):
            await store.insert(_make_entry(f"e{i}"), vec)

        assert len(compact_calls) == 0, "compact() fired too early"
        assert store._insert_count == _COMPACT_EVERY - 1

        # The _COMPACT_EVERY-th insert must trigger compact
        await store.insert(_make_entry("trigger"), vec)
        assert len(compact_calls) == 1, "compact() should have fired exactly once"

    async def test_compact_resets_counter(self, tmp_path):
        """After compact(), _insert_count resets to 0."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        vec = _make_vector()

        for i in range(_COMPACT_EVERY):
            await store.insert(_make_entry(f"e{i}"), vec)

        # Counter should be reset after compaction
        assert store._insert_count == 0

    async def test_compact_failure_is_nonfatal(self, tmp_path):
        """compact() failure must not raise — insert must still succeed."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        vec = _make_vector()

        async def broken_compact():
            raise RuntimeError("simulated compaction failure")

        store.compact = broken_compact

        # Insert up to threshold — should not raise even though compact fails
        for i in range(_COMPACT_EVERY):
            await store.insert(_make_entry(f"e{i}"), vec)  # must not raise

        # All rows must still be present
        count = await store.count()
        assert count == _COMPACT_EVERY

    async def test_compact_direct_call_preserves_rows(self, tmp_path):
        """Calling compact() directly does not remove live rows."""
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        vec = _make_vector()

        # Insert a handful of entries
        n = 5
        for i in range(n):
            await store.insert(_make_entry(f"direct-{i}"), vec)

        rows_before = await store.count()
        assert rows_before == n

        # Run compaction manually
        await store.compact()

        rows_after = await store.count()
        assert rows_after == rows_before, (
            f"compact() changed row count: {rows_before} → {rows_after}"
        )

    async def test_ac1_failed_optimize_resets_counter_and_does_not_immediately_refire(
        self, tmp_path
    ):
        """AC1 (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP): a real table.optimize()
        failure still resets _insert_count to 0 exactly once (via finally:), and
        the very next insert does NOT immediately re-trigger compact() — this is
        the exact defect: the old code only reset the counter inside the try
        success-path, so a failed optimize() left it >= _COMPACT_EVERY forever.
        """
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        vec = _make_vector()

        # Reach the real table once, then inject a raising optimize() on it —
        # exercises the actual compact() failure path, not a mocked shortcut.
        table = await store._get_table()
        table.optimize = AsyncMock(side_effect=RuntimeError("simulated optimize failure"))

        for i in range(_COMPACT_EVERY):
            await store.insert(_make_entry(f"e{i}"), vec)  # must not raise

        assert table.optimize.call_count == 1, (
            "optimize() should have been attempted exactly once at the threshold"
        )
        assert store._insert_count == 0, (
            "counter must reset to 0 even though optimize() raised"
        )

        # Spy on compact() to prove the NEXT insert does not immediately re-fire it.
        compact_calls = []
        original_compact = store.compact

        async def spy_compact():
            compact_calls.append(1)
            await original_compact()

        store.compact = spy_compact

        await store.insert(_make_entry("post-failure"), vec)
        assert len(compact_calls) == 0, (
            "compact() must not immediately re-fire on the next insert after a reset counter"
        )
        assert store._insert_count == 1

    async def test_ac2_concurrent_inserts_produce_exactly_one_optimize_call(self, tmp_path):
        """AC2 (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP): two concurrent insert()
        coroutines that both cross the _COMPACT_EVERY threshold must produce
        exactly ONE table.optimize() call, not two — asyncio.Lock serialization.
        """
        store = LanceDBVectorStore(db_path=str(tmp_path / "lancedb"))
        vec = _make_vector()

        table = await store._get_table()
        real_optimize = table.optimize
        optimize_calls = []

        async def tracking_optimize(*args, **kwargs):
            optimize_calls.append(1)
            return await real_optimize(*args, **kwargs)

        table.optimize = tracking_optimize

        # Prime the counter one insert below threshold so the next two
        # concurrent inserts both land on/above _COMPACT_EVERY.
        store._insert_count = _COMPACT_EVERY - 1

        await asyncio.gather(
            store.insert(_make_entry("concurrent-a"), vec),
            store.insert(_make_entry("concurrent-b"), vec),
        )

        assert len(optimize_calls) == 1, (
            f"expected exactly ONE optimize() call from two concurrent threshold "
            f"crossings, got {len(optimize_calls)}"
        )
        assert store._insert_count == 0
