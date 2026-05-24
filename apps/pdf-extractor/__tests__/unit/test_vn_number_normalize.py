"""
Unit tests — domain/primitives/vn_number_normalize/primitive.py (BT-1).

Root cause of the decimal-shift bug: the old decimal_normalizer called float()
directly on VN-formatted strings where "." = thousands separator and "," = decimal
separator. This caused:
    VNM net_profit  "2.840.370"   → float("2.840.370") → crash / wrong parse
    DHG revenue     "1.234,56"    → float("1.234,56")  → crash / wrong parse

The vn_number_normalize primitive fixes this BEFORE float() is called.

Disambiguation rule for lone "1.234" (ambiguous: 1234 VN-int or 1.234 EN-float?):
    BCTC context: financial figures in triệu (millions) VND are large integers.
    A string matching \d{1,3}(\.\d{3})+ with NO comma = VN thousands-grouped integer.
    So "1.234" → "1234", "51.000" → "51000".
    Only "0,5" or "1.234,5" (comma-decimal suffix) carries a fractional part.

AC3 vectors from BT-1 spec:
    "1.234.567,89" → "1234567.89"
    "51.000"       → "51000"
    "0,5"          → "0.5"
    "51000"        → "51000"         (plain integer passthrough)
    "1,234.5"      → None            (EN-US format: not a VN number, fail-loud)

AC1/AC2 anchors:
    VNM: "2.840.370"  → "2840370"    (was parsed as 0.000051 before fix)
    DHG: "1.234,56"   → "1234.56"    (was parsed as 0.000009 before fix)

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - Pure function: output = f(input) with no side effects
"""

import pytest

from domain.primitives.vn_number_normalize import vn_number_normalize


# ---------------------------------------------------------------------------
# AC1 — VNM net_profit anchor (the 0.000051 regression case)
# ---------------------------------------------------------------------------


def test_vnm_net_profit_plain_integer():
    """
    VNM net_profit "2.840.370" must normalize to "2840370" not cause decimal-shift.

    Before fix: float("2.840.370") raised ValueError → pipeline fell back to 0 or
    the old regex multiplied the wrong sub-string → 0.000051 output.
    After fix:  "2.840.370" → VN thousands-grouped → "2840370" → float 2840370.0
    """
    result = vn_number_normalize("2.840.370")
    assert result == "2840370"


# ---------------------------------------------------------------------------
# AC2 — DHG revenue anchor (the 0.000009 regression case)
# ---------------------------------------------------------------------------


def test_dhg_revenue_decimal():
    """
    DHG revenue "1.234,56" must normalize to "1234.56".

    Before fix: float("1.234,56") raised ValueError → 0 / wrong result.
    After fix:  "1.234,56" → strip thousands dots, swap comma → "1234.56"
    """
    result = vn_number_normalize("1.234,56")
    assert result == "1234.56"


# ---------------------------------------------------------------------------
# AC3 — explicit spec vectors
# ---------------------------------------------------------------------------


def test_ac3_large_decimal():
    """Spec: "1.234.567,89" → "1234567.89"."""
    result = vn_number_normalize("1.234.567,89")
    assert result == "1234567.89"


def test_ac3_thousands_no_decimal():
    """Spec: "51.000" → "51000" (VN thousands grouping, no fraction)."""
    result = vn_number_normalize("51.000")
    assert result == "51000"


def test_ac3_comma_only_decimal():
    """Spec: "0,5" → "0.5" (comma-decimal, no thousands dot)."""
    result = vn_number_normalize("0,5")
    assert result == "0.5"


def test_ac3_plain_integer_passthrough():
    """Spec: "51000" passthrough (no dots, no commas → already clean)."""
    result = vn_number_normalize("51000")
    assert result == "51000"


def test_ac3_en_us_format_returns_none():
    """
    Spec: "1,234.5" (EN-US: comma=thousands, dot=decimal) → None.

    BCTC PDFs never use EN-US format for VN figures. This pattern (comma then dot)
    is ambiguous and rejected as non-VN format → fail-loud None per contract.
    """
    result = vn_number_normalize("1,234.5")
    assert result is None


# ---------------------------------------------------------------------------
# Additional VN number format coverage
# ---------------------------------------------------------------------------


def test_plain_integer_small():
    """Small plain integer "1000" passes through unchanged."""
    result = vn_number_normalize("1000")
    assert result == "1000"


def test_single_digit():
    """Single digit "5" passes through unchanged."""
    result = vn_number_normalize("5")
    assert result == "5"


def test_negative_vn_thousands():
    """Negative VN number "-2.840.370" → "-2840370"."""
    result = vn_number_normalize("-2.840.370")
    assert result == "-2840370"


def test_negative_vn_decimal():
    """Negative VN decimal "(-1.234,5)" using parenthesis BCTC notation → "-1234.5"."""
    result = vn_number_normalize("(1.234,5)")
    assert result == "-1234.5"


def test_empty_string_returns_none():
    """Empty string → None (no numeric content)."""
    result = vn_number_normalize("")
    assert result is None


def test_whitespace_only_returns_none():
    """Whitespace-only → None."""
    result = vn_number_normalize("   ")
    assert result is None


def test_non_numeric_returns_none():
    """Non-numeric text "N/A" → None."""
    result = vn_number_normalize("N/A")
    assert result is None


def test_zero_string():
    """Plain "0" passes through unchanged."""
    result = vn_number_normalize("0")
    assert result == "0"


def test_comma_decimal_no_thousands():
    """VN decimal-only "123,45" (no thousands dot) → "123.45"."""
    result = vn_number_normalize("123,45")
    assert result == "123.45"


def test_single_thousands_group():
    """"1.234" (single thousands group, no comma) → "1234" (VN integer rule)."""
    result = vn_number_normalize("1.234")
    assert result == "1234"
