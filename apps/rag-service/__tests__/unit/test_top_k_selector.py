"""
Unit tests for domain/primitive/top_k_selector/top_k_selector.py

Fence-A: zero imports from application/, infrastructure/, interface/.
"""
import pytest
from domain.primitive.top_k_selector.top_k_selector import select_top_k


class TestSelectTopK:
    """Pure function unit tests for the top_k_selector primitive."""

    def test_golden_returns_first_k(self) -> None:
        """Returns first k elements from the ordered list."""
        results = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
        out = select_top_k(results, k=2)
        assert len(out) == 2
        assert out[0]["id"] == "a"
        assert out[1]["id"] == "b"

    def test_k_equals_len_returns_all(self) -> None:
        """When k == len(results), all results are returned."""
        results = [{"id": "a"}, {"id": "b"}]
        assert select_top_k(results, k=2) == results

    def test_k_exceeds_len_returns_all(self) -> None:
        """k > len(results): all results returned, no error raised."""
        results = [{"id": "a"}]
        assert select_top_k(results, k=5) == results

    def test_k_zero_returns_empty(self) -> None:
        """k=0 must return empty list."""
        results = [{"id": "a"}, {"id": "b"}]
        assert select_top_k(results, k=0) == []

    def test_k_negative_returns_empty(self) -> None:
        """k < 0 is treated same as k=0: returns empty list."""
        results = [{"id": "a"}]
        assert select_top_k(results, k=-1) == []

    def test_order_preserved(self) -> None:
        """Original order must be preserved, no re-sorting."""
        results = [{"id": "first"}, {"id": "second"}, {"id": "third"}]
        out = select_top_k(results, k=2)
        assert [r["id"] for r in out] == ["first", "second"]

    def test_empty_input_returns_empty(self) -> None:
        """Empty input with any k returns empty list."""
        assert select_top_k([], k=3) == []
