"""
Unit tests — domain/services.py

Tests: compute_recency_score, apply_temporal_decay, filter_by_max_distance, SearchService.rank
All pure functions — no I/O, no mocks needed.
"""

import math
import sys
import os
from datetime import datetime, timezone, timedelta

import pytest

# Adjust sys.path so imports resolve from apps/rag-service/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from domain.models import SearchResult
from domain.services import (
    compute_recency_score,
    apply_temporal_decay,
    filter_by_max_distance,
    SearchService,
    DEFAULT_HALF_LIFE_DAYS,
    DEFAULT_MAX_DISTANCE,
)


# ── Helpers ───────────────────────────────────────────────────────────────


def make_result(
    id: str = "test-id",
    distance: float = 0.5,
    created_at: str | None = None,
    level: str = "global",
) -> SearchResult:
    if created_at is None:
        created_at = datetime.now(tz=timezone.utc).isoformat()
    return SearchResult(
        id=id,
        level=level,
        title="Test entry",
        summary="Test summary",
        tags=[],
        action_code="",
        created_at=created_at,
        distance=distance,
    )


def hours_ago(n: float) -> str:
    return (datetime.now(tz=timezone.utc) - timedelta(hours=n)).isoformat()


def days_ago(n: float) -> str:
    return hours_ago(n * 24)


# ── compute_recency_score ────────────────────────────────────────────────


class TestComputeRecencyScore:

    def test_brand_new_entry_returns_full_similarity(self):
        """Age=0 → decay_factor=1.0 → recency_score = similarity"""
        score = compute_recency_score(similarity=0.8, created_at_iso=hours_ago(0))
        assert score == pytest.approx(0.8, abs=0.01)

    def test_7day_old_entry_with_7d_half_life_returns_half(self):
        """Age=7d, half_life=7d → decay=0.5 → score = similarity * 0.5"""
        score = compute_recency_score(
            similarity=0.8,
            created_at_iso=days_ago(7),
            half_life_days=7,
        )
        assert score == pytest.approx(0.4, abs=0.02)

    def test_very_old_entry_approaches_zero(self):
        """365-day-old entry with 7d half-life: decay ≈ 2^(-52) ≈ 0"""
        score = compute_recency_score(
            similarity=1.0,
            created_at_iso=days_ago(365),
            half_life_days=7,
        )
        assert score < 0.001

    def test_invalid_date_returns_zero(self):
        """Invalid ISO date → treated as infinitely old → score = 0"""
        score = compute_recency_score(similarity=1.0, created_at_iso="not-a-date")
        assert score == 0.0

    def test_zero_similarity_always_returns_zero(self):
        """Zero similarity * any decay = 0"""
        score = compute_recency_score(similarity=0.0, created_at_iso=hours_ago(1))
        assert score == 0.0

    def test_formula_14_days_half_life_7(self):
        """14d old, half_life=7: decay=0.5^(14/7)=0.25 → score=sim*0.25"""
        score = compute_recency_score(
            similarity=0.6,
            created_at_iso=days_ago(14),
            half_life_days=7,
        )
        assert score == pytest.approx(0.6 * 0.25, abs=0.01)


# ── apply_temporal_decay ─────────────────────────────────────────────────


class TestApplyTemporalDecay:

    def test_empty_input_returns_empty(self):
        assert apply_temporal_decay([]) == []

    def test_recent_ranks_higher_than_old_same_distance(self):
        recent = make_result(id="recent", distance=0.5, created_at=hours_ago(1))
        old = make_result(id="old", distance=0.5, created_at=days_ago(30))
        ranked = apply_temporal_decay([old, recent])
        assert ranked[0].id == "recent"
        assert ranked[1].id == "old"

    def test_results_sorted_descending_by_recency_score(self):
        results = [
            make_result(id="a", distance=0.3, created_at=days_ago(60)),
            make_result(id="b", distance=0.1, created_at=days_ago(60)),
            make_result(id="c", distance=0.5, created_at=days_ago(60)),
        ]
        ranked = apply_temporal_decay(results)
        # b has best similarity (lowest distance) → highest recency_score
        assert ranked[0].id == "b"
        scores = [r.recency_score for r in ranked]
        assert scores == sorted(scores, reverse=True)

    def test_recency_score_populated_on_all_results(self):
        results = [
            make_result(id=f"r{i}", distance=0.5, created_at=days_ago(i))
            for i in range(5)
        ]
        ranked = apply_temporal_decay(results)
        for r in ranked:
            assert r.recency_score > 0.0

    def test_original_fields_preserved(self):
        original = make_result(
            id="preserve-test",
            distance=0.4,
            created_at=days_ago(3),
            level="action",
        )
        original.tags = ["vn", "banking"]
        original.action_code = "VCB"
        original.title = "Title"
        original.summary = "Summary"

        ranked = apply_temporal_decay([original])
        r = ranked[0]

        assert r.id == "preserve-test"
        assert r.level == "action"
        assert r.title == "Title"
        assert r.summary == "Summary"
        assert r.tags == ["vn", "banking"]
        assert r.action_code == "VCB"

    def test_phase1_metadata_fields_preserved(self):
        """Regression: ensure apply_temporal_decay preserves all 8 Phase 1 metadata fields."""
        original = make_result(
            id="phase1-test",
            distance=0.5,
            created_at=days_ago(2),
        )
        # Set all 8 Phase 1 metadata fields
        original.ticker = "VCB"
        original.sector = "Banking"
        original.source_domain = "hochiminh-stock-exchange"
        original.depth_tier = "deep"
        original.doc_type = "filing"
        original.published_at = "2026-06-01T10:00:00Z"
        original.confidence = 0.85
        original.impact_score = 0.92

        ranked = apply_temporal_decay([original])
        r = ranked[0]

        # Assert all Phase 1 metadata survives
        assert r.ticker == "VCB"
        assert r.sector == "Banking"
        assert r.source_domain == "hochiminh-stock-exchange"
        assert r.depth_tier == "deep"
        assert r.doc_type == "filing"
        assert r.published_at == "2026-06-01T10:00:00Z"
        assert r.confidence == 0.85
        assert r.impact_score == 0.92
        # Also verify recency_score is computed
        assert r.recency_score > 0.0

    def test_single_result_returns_list_of_one(self):
        single = make_result(distance=0.3, created_at=hours_ago(5))
        result = apply_temporal_decay([single])
        assert len(result) == 1

    def test_aggressive_half_life_penalizes_old_entries(self):
        """With half_life=1, 7d-old entry should have lower score than gentle half_life=30."""
        old = make_result(distance=0.3, created_at=days_ago(7))
        aggressive = apply_temporal_decay([old], half_life_days=1)[0].recency_score
        gentle = apply_temporal_decay([old], half_life_days=30)[0].recency_score
        assert gentle > aggressive


# ── filter_by_max_distance ────────────────────────────────────────────────


class TestFilterByMaxDistance:

    def test_removes_results_beyond_threshold(self):
        results = [
            make_result(id="close", distance=0.3),
            make_result(id="medium", distance=0.79),
            make_result(id="far", distance=0.81),
            make_result(id="very-far", distance=1.5),
        ]
        filtered = filter_by_max_distance(results, 0.8)
        ids = [r.id for r in filtered]
        assert "close" in ids
        assert "medium" in ids
        assert "far" not in ids
        assert "very-far" not in ids

    def test_keeps_all_when_threshold_very_high(self):
        results = [make_result(distance=d) for d in [0.1, 0.9, 1.5]]
        assert len(filter_by_max_distance(results, 999.0)) == 3

    def test_returns_empty_when_all_exceed_threshold(self):
        results = [make_result(distance=d) for d in [0.9, 1.1, 1.5]]
        assert filter_by_max_distance(results, 0.8) == []

    def test_default_threshold_is_0_8(self):
        results = [
            make_result(id="ok", distance=0.799),
            make_result(id="over", distance=0.801),
        ]
        filtered = filter_by_max_distance(results)
        assert [r.id for r in filtered] == ["ok"]


# ── SearchService.rank ────────────────────────────────────────────────────


class TestSearchServiceRank:

    def setup_method(self):
        self.service = SearchService()

    def test_applies_filter_then_decay(self):
        results = [
            make_result(id="within", distance=0.5, created_at=hours_ago(1)),
            make_result(id="beyond", distance=0.9, created_at=hours_ago(1)),
        ]
        ranked = self.service.rank(results, max_distance=0.8)
        ids = [r.id for r in ranked]
        assert "within" in ids
        assert "beyond" not in ids

    def test_returns_empty_for_empty_input(self):
        assert self.service.rank([]) == []

    def test_recent_entry_ranks_first(self):
        results = [
            make_result(id="old", distance=0.3, created_at=days_ago(14)),
            make_result(id="new", distance=0.3, created_at=hours_ago(1)),
        ]
        ranked = self.service.rank(results)
        assert ranked[0].id == "new"
