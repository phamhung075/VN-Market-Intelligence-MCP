"""
Unit tests for domain/primitive/temporal_decay_scorer/temporal_decay_scorer.py

Fence-A: zero imports from application/, infrastructure/, interface/.
R-2 compliance: all tests inject fixed `now` or `now_iso` — no datetime.now() calls.
"""
import math
from datetime import datetime, timezone

import pytest
from domain.primitive.temporal_decay_scorer.temporal_decay_scorer import score


NOW_FIXED = datetime(2026, 5, 24, 0, 0, 0, tzinfo=timezone.utc)
NOW_ISO = "2026-05-24T00:00:00Z"


class TestScore:
    """Pure function unit tests for the temporal_decay_scorer primitive."""

    def test_golden_14_days_two_half_lives(self) -> None:
        """14-day-old document with 7-day half-life = 2 half-lives -> score = similarity * 0.25."""
        result = score(
            similarity=0.8,
            created_at_iso="2026-05-10T00:00:00Z",
            half_life_days=7.0,
            now=NOW_FIXED,
        )
        assert abs(result - 0.2) < 1e-4

    def test_edge_same_day_age_zero(self) -> None:
        """Document created at same time as now: age=0 -> decay_factor=1.0 -> score = similarity."""
        result = score(
            similarity=0.75,
            created_at_iso=NOW_ISO,
            half_life_days=7.0,
            now=NOW_FIXED,
        )
        assert abs(result - 0.75) < 1e-6

    def test_future_date_treated_as_age_zero(self) -> None:
        """Future-dated document: age is clamped to 0 -> score = similarity."""
        result = score(
            similarity=0.6,
            created_at_iso="2026-06-01T00:00:00Z",
            half_life_days=7.0,
            now=NOW_FIXED,
        )
        assert abs(result - 0.6) < 1e-6

    def test_now_iso_injection(self) -> None:
        """now_iso string param overrides now datetime for deterministic scenario runs."""
        result = score(
            similarity=0.8,
            created_at_iso="2026-05-10T00:00:00Z",
            half_life_days=7.0,
            now_iso=NOW_ISO,
        )
        assert abs(result - 0.2) < 1e-4

    def test_seven_day_doc_one_half_life(self) -> None:
        """7-day-old document with 7-day half-life: score = similarity * 0.5."""
        result = score(
            similarity=1.0,
            created_at_iso="2026-05-17T00:00:00Z",
            half_life_days=7.0,
            now=NOW_FIXED,
        )
        assert abs(result - 0.5) < 1e-4

    def test_invalid_timestamp_returns_zero(self) -> None:
        """Invalid timestamp is treated as infinitely old: score approaches 0."""
        result = score(
            similarity=0.9,
            created_at_iso="NOT_A_DATE",
            half_life_days=7.0,
            now=NOW_FIXED,
        )
        assert result == 0.0

    def test_zero_similarity_always_zero(self) -> None:
        """similarity=0 always produces 0 regardless of age."""
        result = score(
            similarity=0.0,
            created_at_iso="2026-05-10T00:00:00Z",
            half_life_days=7.0,
            now=NOW_FIXED,
        )
        assert result == 0.0
