"""
Unit tests — domain/primitives/decimal_normalizer/primitive.py (P1-B2).

Tests cover:
  - Happy: normal billion VND value parsed correctly
  - Edge: VNM decimal-shift corrected via unit_hint="raw_micro"
  - Failure: non-numeric "N/A" returns None (no crash)
  - Failure: empty string returns None
  - Edge: zero string "0" returns 0.0
  - Edge: negative value string returns negative float

Domain rules:
  - Zero imports from infrastructure/, application/, interface/
  - No pdfplumber, pytesseract, aiohttp
  - Pure function: output = f(input) with no side effects
"""

import pytest

from domain.primitives.decimal_normalizer import normalize_decimal


# ---------------------------------------------------------------------------
# Happy path — normal billion VND value
# ---------------------------------------------------------------------------


def test_happy_normal_billion_vnd():
    """Standard billion VND string parsed directly."""
    result = normalize_decimal("1234.5", "billion_vnd")
    assert result == 1234.5


def test_happy_integer_string():
    """Integer string without decimal parsed correctly."""
    result = normalize_decimal("1000", "billion_vnd")
    assert result == 1000.0


# ---------------------------------------------------------------------------
# Edge — decimal-shift correction (VNM net_profit case)
# ---------------------------------------------------------------------------


def test_edge_decimal_shift_vnm_raw_micro():
    """VNM net_profit=0.000051 corrected to 51.0 via unit_hint=raw_micro."""
    result = normalize_decimal("0.000051", "raw_micro")
    assert result == pytest.approx(51.0, rel=1e-6)


def test_edge_decimal_shift_dhg_raw_micro():
    """DHG rev=0.000009 corrected to 9.0 via unit_hint=raw_micro."""
    result = normalize_decimal("0.000009", "raw_micro")
    assert result == pytest.approx(9.0, rel=1e-6)


def test_edge_zero_value():
    """Zero string returns 0.0."""
    result = normalize_decimal("0", "billion_vnd")
    assert result == 0.0


def test_edge_negative_value():
    """Negative string returns negative float."""
    result = normalize_decimal("-500.0", "billion_vnd")
    assert result == pytest.approx(-500.0, rel=1e-6)


# ---------------------------------------------------------------------------
# Failure — non-numeric input returns None (no crash)
# ---------------------------------------------------------------------------


def test_failure_non_numeric_na():
    """"N/A" returns None — graceful handling."""
    result = normalize_decimal("N/A", "billion_vnd")
    assert result is None


def test_failure_empty_string():
    """Empty string returns None — graceful handling."""
    result = normalize_decimal("", "billion_vnd")
    assert result is None


def test_failure_random_text():
    """Arbitrary non-numeric text returns None."""
    result = normalize_decimal("không có số", "billion_vnd")
    assert result is None


# ---------------------------------------------------------------------------
# Default unit_hint (billion_vnd)
# ---------------------------------------------------------------------------


def test_default_unit_hint():
    """Default unit_hint=billion_vnd does not multiply."""
    result = normalize_decimal("500.0")  # no unit_hint kwarg
    assert result == pytest.approx(500.0, rel=1e-6)
