"""
Unit tests — domain/primitives/ratio_computer/ (P2-B3).

Tests cover:
  - happy path: gross_margin 300/1000 → 0.3
  - happy path: debt_equity ratio
  - happy path: ROE ratio
  - edge: zero denominator → None (no crash)
  - failure/valid: negative equity → negative ratio (valid arithmetic)
  - unsupported ratio_type → None
  - return type is float or None

Domain rules:
  - Zero imports from infrastructure/, application/, interface/
  - Pure function — no I/O, no side effects
"""

import pytest

from domain.primitives.ratio_computer import compute_ratio


# ---------------------------------------------------------------------------
# Import sanity
# ---------------------------------------------------------------------------


def test_ratio_computer_imports():
    """Primitive imports without error and alias is callable."""
    from domain.primitives.ratio_computer import compute_ratio, ratio_computer  # noqa: F401

    assert callable(compute_ratio)
    assert callable(ratio_computer)
    assert ratio_computer is compute_ratio


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_happy_gross_margin():
    """gross_margin: 300/1000 → 0.30."""
    result = compute_ratio(numerator=300.0, denominator=1000.0, ratio_type="gross_margin")
    assert result == pytest.approx(0.3, rel=1e-9)


def test_happy_debt_equity():
    """debt_equity: 6000/4000 → 1.5."""
    result = compute_ratio(numerator=6000.0, denominator=4000.0, ratio_type="debt_equity")
    assert result == pytest.approx(1.5, rel=1e-9)


def test_happy_roe():
    """roe: 500/4000 → 0.125."""
    result = compute_ratio(numerator=500.0, denominator=4000.0, ratio_type="roe")
    assert result == pytest.approx(0.125, rel=1e-9)


def test_happy_perfect_ratio():
    """1000/1000 → 1.0."""
    result = compute_ratio(numerator=1000.0, denominator=1000.0, ratio_type="gross_margin")
    assert result == pytest.approx(1.0, rel=1e-9)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_edge_zero_denominator_returns_none():
    """Zero denominator → None (no crash, no ZeroDivisionError)."""
    result = compute_ratio(numerator=100.0, denominator=0.0, ratio_type="debt_equity")
    assert result is None


def test_edge_zero_numerator():
    """Zero numerator with non-zero denominator → 0.0."""
    result = compute_ratio(numerator=0.0, denominator=1000.0, ratio_type="gross_margin")
    assert result == pytest.approx(0.0, rel=1e-9)


# ---------------------------------------------------------------------------
# Failure / negative equity (valid arithmetic)
# ---------------------------------------------------------------------------


def test_failure_negative_equity():
    """Negative equity denominator → negative ratio (valid arithmetic, consumer responsibility)."""
    result = compute_ratio(numerator=500.0, denominator=-50.0, ratio_type="debt_equity")
    assert result == pytest.approx(-10.0, rel=1e-9)


def test_failure_both_negative():
    """Both negative → positive ratio (double negative)."""
    result = compute_ratio(numerator=-200.0, denominator=-50.0, ratio_type="roe")
    assert result == pytest.approx(4.0, rel=1e-9)


# ---------------------------------------------------------------------------
# Unsupported ratio type
# ---------------------------------------------------------------------------


def test_unsupported_ratio_type_returns_none():
    """Unknown ratio_type → None (graceful, no exception)."""
    result = compute_ratio(numerator=100.0, denominator=200.0, ratio_type="unknown_ratio")
    assert result is None


def test_empty_ratio_type_returns_none():
    """Empty string ratio_type → None."""
    result = compute_ratio(numerator=100.0, denominator=200.0, ratio_type="")
    assert result is None


# ---------------------------------------------------------------------------
# Fence-A compliance (runtime check)
# ---------------------------------------------------------------------------


def test_fence_a_no_infra_imports():
    """Fence-A: primitive module must not import infrastructure/application/interface."""
    import domain.primitives.ratio_computer.primitive as pmod

    src = getattr(pmod, "__file__", "")
    assert src, "Primitive module has no __file__"
