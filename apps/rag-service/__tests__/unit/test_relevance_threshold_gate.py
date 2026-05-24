"""
Unit tests for domain/primitive/relevance_threshold_gate/relevance_threshold_gate.py

Fence-A: zero imports from application/, infrastructure/, interface/.
"""
import pytest
from domain.primitive.relevance_threshold_gate.relevance_threshold_gate import gate


class TestGate:
    """Pure function unit tests for the relevance_threshold_gate primitive."""

    def test_golden_filters_one_result(self) -> None:
        """Results with distance <= max_distance pass; others are excluded."""
        results = [{"id": "a", "distance": 0.3}, {"id": "b", "distance": 0.8}]
        out = gate(results, max_distance=0.5)
        assert len(out) == 1
        assert out[0]["id"] == "a"

    def test_inclusive_boundary_keeps_exact_match(self) -> None:
        """distance == max_distance is INCLUSIVE: result must be kept."""
        results = [{"id": "exact", "distance": 0.5}]
        out = gate(results, max_distance=0.5)
        assert out == [{"id": "exact", "distance": 0.5}]

    def test_all_above_threshold_returns_empty(self) -> None:
        """When all results exceed max_distance, output must be empty list."""
        results = [{"id": "a", "distance": 0.6}, {"id": "b", "distance": 0.9}]
        out = gate(results, max_distance=0.5)
        assert out == []

    def test_empty_input_returns_empty(self) -> None:
        """Empty input list is valid; must return empty list."""
        assert gate([], max_distance=0.5) == []

    def test_order_preserved(self) -> None:
        """Filtered results must maintain original ordering."""
        results = [
            {"id": "first", "distance": 0.1},
            {"id": "second", "distance": 0.2},
            {"id": "third", "distance": 0.3},
        ]
        out = gate(results, max_distance=0.5)
        assert [r["id"] for r in out] == ["first", "second", "third"]

    def test_all_pass_threshold(self) -> None:
        """All results below threshold: all are returned."""
        results = [{"id": "a", "distance": 0.1}, {"id": "b", "distance": 0.2}]
        out = gate(results, max_distance=1.0)
        assert len(out) == 2

    def test_zero_threshold(self) -> None:
        """max_distance=0.0 keeps only results with distance exactly 0."""
        results = [{"id": "zero", "distance": 0.0}, {"id": "nonzero", "distance": 0.01}]
        out = gate(results, max_distance=0.0)
        assert len(out) == 1
        assert out[0]["id"] == "zero"
