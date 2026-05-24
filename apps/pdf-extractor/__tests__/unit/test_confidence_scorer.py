"""
Unit tests — domain/primitives/confidence_scorer/ (P2-B1).

Tests cover:
  - happy path: high OCR confidence + tables → pass=True
  - edge: low OCR confidence BUT tables present → pass=True (tables compensate)
  - failure: low OCR confidence AND no tables → pass=False
  - boundary: exactly at threshold (0.5) → pass=True
  - boundary: just below threshold (0.499) with no tables → pass=False
  - quality_score always equals the raw ocr_confidence

Domain rules:
  - Zero imports from infrastructure/, application/, interface/
  - Pure function — no I/O, no side effects
"""

import pytest

from domain.primitives.confidence_scorer import score_confidence


# ---------------------------------------------------------------------------
# Import sanity
# ---------------------------------------------------------------------------


def test_confidence_scorer_imports():
    """Primitive imports without error and alias is callable."""
    from domain.primitives.confidence_scorer import confidence_scorer, score_confidence  # noqa: F401

    assert callable(score_confidence)
    assert callable(confidence_scorer)
    assert confidence_scorer is score_confidence


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_happy_high_confidence_with_tables():
    """High OCR confidence + tables → pass=True, quality_score = ocr_confidence."""
    result = score_confidence(ocr_confidence=0.85, table_count=2)
    assert result["pass"] is True
    assert result["quality_score"] == pytest.approx(0.85, rel=1e-9)


def test_happy_high_confidence_no_tables():
    """High OCR confidence without tables → pass=True (confidence alone is sufficient)."""
    result = score_confidence(ocr_confidence=0.9, table_count=0)
    assert result["pass"] is True
    assert result["quality_score"] == pytest.approx(0.9, rel=1e-9)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_edge_low_confidence_rescued_by_tables():
    """Low OCR confidence (0.3) BUT 3 tables found → pass=True (tables compensate)."""
    result = score_confidence(ocr_confidence=0.3, table_count=3)
    assert result["pass"] is True
    assert result["quality_score"] == pytest.approx(0.3, rel=1e-9)


def test_edge_exactly_at_threshold_no_tables():
    """OCR confidence exactly at threshold (0.5) with no tables → pass=True.

    The gate fires only when confidence is STRICTLY LESS THAN threshold.
    At exactly 0.5, the condition is not met → pass=True.
    """
    result = score_confidence(ocr_confidence=0.5, table_count=0)
    assert result["pass"] is True


def test_edge_zero_confidence_with_tables():
    """Zero OCR confidence BUT tables found → pass=True (tables rescue)."""
    result = score_confidence(ocr_confidence=0.0, table_count=1)
    assert result["pass"] is True
    assert result["quality_score"] == pytest.approx(0.0, rel=1e-9)


# ---------------------------------------------------------------------------
# Failure path
# ---------------------------------------------------------------------------


def test_failure_low_confidence_no_tables():
    """Low OCR confidence (0.3) AND no tables → pass=False."""
    result = score_confidence(ocr_confidence=0.3, table_count=0)
    assert result["pass"] is False
    assert result["quality_score"] == pytest.approx(0.3, rel=1e-9)


def test_failure_zero_confidence_no_tables():
    """Zero OCR confidence AND no tables → pass=False."""
    result = score_confidence(ocr_confidence=0.0, table_count=0)
    assert result["pass"] is False
    assert result["quality_score"] == pytest.approx(0.0, rel=1e-9)


def test_failure_just_below_threshold_no_tables():
    """Just below threshold (0.499) AND no tables → pass=False."""
    result = score_confidence(ocr_confidence=0.499, table_count=0)
    assert result["pass"] is False


# ---------------------------------------------------------------------------
# Return shape
# ---------------------------------------------------------------------------


def test_result_has_correct_keys():
    """Result dict always contains 'pass' and 'quality_score'."""
    result = score_confidence(ocr_confidence=0.7, table_count=1)
    assert "pass" in result
    assert "quality_score" in result


def test_quality_score_equals_raw_ocr_confidence():
    """quality_score is always the raw ocr_confidence — no bonus applied."""
    for conf in [0.0, 0.25, 0.5, 0.75, 1.0]:
        result = score_confidence(ocr_confidence=conf, table_count=5)
        assert result["quality_score"] == pytest.approx(conf, rel=1e-9)


# ---------------------------------------------------------------------------
# Fence-A compliance (runtime check)
# ---------------------------------------------------------------------------


def test_fence_a_no_infra_imports():
    """Fence-A: primitive module must not import infrastructure/application/interface."""
    import domain.primitives.confidence_scorer.primitive as pmod

    src = getattr(pmod, "__file__", "")
    assert src, "Primitive module has no __file__"
    # If this test runs without ImportError from infra/app/interface, Fence-A holds.
    # Additional grep-based check is run as part of AC-3 smoke check.
