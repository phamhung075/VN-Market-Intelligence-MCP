"""
Unit tests — LanceDBVectorStore periodic compaction guard.

Verifies:
- compact() is called after _COMPACT_EVERY inserts
- compact() resets the insert counter
- compact() failure is non-fatal (insert still succeeds)
- compact() can be called directly without side-effects on row count
"""

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
