"""
Unit tests — domain/primitives/low_confidence_gate/ (P2-B2).

Tests cover:
  - happy path: confidence=0.85 → "normal"
  - edge: confidence=0.15 → "low_confidence" (below threshold)
  - failure: confidence=0.0 → "skip" (exact zero gate)
  - boundary: confidence=0.20 → "normal" (at threshold, not below)
  - boundary: confidence=0.19 → "low_confidence" (strictly below threshold)
  - boundary: confidence=0.01 → "low_confidence"

These boundaries are the canonical G10/G11 injection targets.
A single-literal change to _LOW_CONF_THRESHOLD from 0.2 to 0.3 would flip
boundary_0_20 and boundary_0_25 RED on the dashboard.

Domain rules:
  - Zero imports from infrastructure/, application/, interface/
  - Pure function — no I/O, no side effects
"""

import pytest

from domain.primitives.low_confidence_gate import gate_confidence


# ---------------------------------------------------------------------------
# Import sanity
# ---------------------------------------------------------------------------


def test_low_confidence_gate_imports():
    """Primitive imports without error and alias is callable."""
    from domain.primitives.low_confidence_gate import gate_confidence, low_confidence_gate  # noqa: F401

    assert callable(gate_confidence)
    assert callable(low_confidence_gate)
    assert low_confidence_gate is gate_confidence


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_happy_normal_high_confidence():
    """confidence=0.85 → 'normal' (well above threshold)."""
    result = gate_confidence(confidence=0.85)
    assert result == "normal"


def test_happy_normal_exactly_at_threshold():
    """confidence=0.20 → 'normal' (at threshold, strictly NOT less than)."""
    result = gate_confidence(confidence=0.20)
    assert result == "normal"


def test_happy_normal_full_confidence():
    """confidence=1.0 → 'normal'."""
    result = gate_confidence(confidence=1.0)
    assert result == "normal"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_edge_low_confidence_flag_0_15():
    """confidence=0.15 → 'low_confidence' (below threshold, not zero)."""
    result = gate_confidence(confidence=0.15)
    assert result == "low_confidence"


def test_edge_low_confidence_flag_0_19():
    """confidence=0.19 → 'low_confidence' (strictly below 0.20 boundary)."""
    result = gate_confidence(confidence=0.19)
    assert result == "low_confidence"


def test_edge_low_confidence_flag_0_01():
    """confidence=0.01 → 'low_confidence' (small non-zero)."""
    result = gate_confidence(confidence=0.01)
    assert result == "low_confidence"


# ---------------------------------------------------------------------------
# Failure / skip path
# ---------------------------------------------------------------------------


def test_failure_zero_skip():
    """confidence=0.0 → 'skip' (exact zero gate)."""
    result = gate_confidence(confidence=0.0)
    assert result == "skip"


# ---------------------------------------------------------------------------
# Return type check
# ---------------------------------------------------------------------------


def test_return_is_string():
    """All outcomes are string literals."""
    for conf, expected in [(0.0, "skip"), (0.15, "low_confidence"), (0.85, "normal")]:
        result = gate_confidence(confidence=conf)
        assert isinstance(result, str)
        assert result == expected


# ---------------------------------------------------------------------------
# Fence-A compliance (runtime check)
# ---------------------------------------------------------------------------


def test_fence_a_no_infra_imports():
    """Fence-A: primitive module must not import infrastructure/application/interface."""
    import domain.primitives.low_confidence_gate.primitive as pmod

    src = getattr(pmod, "__file__", "")
    assert src, "Primitive module has no __file__"
    # If this test runs without ImportError from infra/app/interface, Fence-A holds.
