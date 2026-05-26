"""
Unit tests — domain/primitives/layout_invariants/primitive.py (LF-EXTRACT)

Tests for the three Tier 3 invariant checkers:
    - check_balance_identity
    - check_codes_monotonic
    - check_no_orphan_rows

All tests use pure in-memory data. Zero I/O, zero Tesseract, zero DB.

AC-0 compliance: test data uses numeric codes and generic value cells.
No hardcoded BCTC semantic strings in any test decision logic.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from domain.primitives.layout_invariants.primitive import (
    check_balance_identity,
    check_codes_monotonic,
    check_no_orphan_rows,
    _parse_code_int,
    _extract_numeric_value,
    _has_any_value,
    _has_label,
)


# ===========================================================================
# Helpers
# ===========================================================================

def _row(code=None, label=None, values=None, page=1):
    """Build a test row dict."""
    return {
        "code": code,
        "label": label,
        "values": values or [],
        "page": page,
    }


# ===========================================================================
# Tests for _parse_code_int
# ===========================================================================

class TestParseCodeInt:
    def test_valid_3digit(self):
        assert _parse_code_int("270") == 270

    def test_valid_2digit(self):
        assert _parse_code_int("10") == 10

    def test_valid_1digit(self):
        assert _parse_code_int("5") == 5

    def test_none_returns_none(self):
        assert _parse_code_int(None) is None

    def test_empty_returns_none(self):
        assert _parse_code_int("") is None

    def test_mixed_text_returns_none(self):
        assert _parse_code_int("10a") is None

    def test_whitespace_stripped(self):
        assert _parse_code_int("  300  ") == 300

    def test_float_string_returns_none(self):
        assert _parse_code_int("100.5") is None


# ===========================================================================
# Tests for _extract_numeric_value
# ===========================================================================

class TestExtractNumericValue:
    def test_plain_integer(self):
        result = _extract_numeric_value("12345")
        assert result == 12345.0

    def test_vn_thousands_dot(self):
        result = _extract_numeric_value("58.102.970")
        assert result == 58102970.0

    def test_empty_returns_none(self):
        assert _extract_numeric_value("") is None

    def test_none_returns_none(self):
        assert _extract_numeric_value(None) is None

    def test_pure_text_returns_none(self):
        assert _extract_numeric_value("abc") is None


# ===========================================================================
# Tests for check_balance_identity
# ===========================================================================

class TestCheckBalanceIdentity:
    def test_balance_passes_exact(self):
        """Sum of 100-multiples == max-code row → pass."""
        rows = [
            _row(code="100", values=["40000000"]),
            _row(code="200", values=["20000000"]),
            _row(code="300", values=["30000000"]),
            _row(code="400", values=["10000000"]),
            _row(code="440", values=["100000000"]),  # max code = sentinel
        ]
        ok, reason = check_balance_identity(rows)
        assert ok, f"Expected pass, got: {reason}"
        assert reason == ""

    def test_balance_fails_delta(self):
        """Sum of 100-multiples != max-code row → fail."""
        rows = [
            _row(code="100", values=["50000000"]),
            _row(code="200", values=["20000000"]),
            _row(code="300", values=["30000000"]),
            _row(code="400", values=["10000000"]),
            _row(code="440", values=["100000000"]),  # sentinel
        ]
        # 50M + 20M + 30M + 10M = 110M != 100M → delta = 10M
        ok, reason = check_balance_identity(rows)
        assert not ok
        assert "balance_identity_fail" in reason
        assert "delta=" in reason

    def test_heuristic_skipped_below_400(self):
        """max_code < 400 → skip (True, balance_check_skipped)."""
        rows = [
            _row(code="100", values=["10000"]),
            _row(code="200", values=["20000"]),
            _row(code="300", values=["30000"]),
        ]
        ok, reason = check_balance_identity(rows)
        assert ok
        assert "balance_check_skipped" in reason

    def test_heuristic_skipped_too_few_codes(self):
        """< 3 distinct codes → skip."""
        rows = [
            _row(code="100", values=["10000"]),
            _row(code="440", values=["10000"]),
        ]
        ok, reason = check_balance_identity(rows)
        assert ok
        assert "balance_check_skipped" in reason

    def test_no_coded_rows_skipped(self):
        """No parseable codes at all → skip."""
        rows = [
            _row(code=None, label="Some label", values=["100"]),
            _row(code=None, label="Other label", values=["200"]),
        ]
        ok, reason = check_balance_identity(rows)
        assert ok
        assert "balance_check_skipped" in reason

    def test_empty_rows_skipped(self):
        """Empty input → skip."""
        ok, reason = check_balance_identity([])
        assert ok
        assert "balance_check_skipped" in reason

    def test_rounding_tolerance(self):
        """Delta <= 1 → pass (rounding tolerance)."""
        rows = [
            _row(code="100", values=["50000000"]),
            _row(code="200", values=["50000001"]),  # 1 extra
            _row(code="440", values=["100000000"]),  # sentinel: 100M
        ]
        # Only 2 top-level subtotals → at least 2 needed, so check runs
        # 50M + 50000001 = 100000001, sentinel = 100M → delta = 1 → PASS
        ok, reason = check_balance_identity(rows)
        assert ok, f"Expected rounding tolerance pass, got: {reason}"


# ===========================================================================
# Tests for check_codes_monotonic
# ===========================================================================

class TestCheckCodesMonotonic:
    def test_strictly_increasing_passes(self):
        """100 → 200 → 300 → 400 → pass."""
        rows = [
            _row(code="100", page=1),
            _row(code="200", page=1),
            _row(code="300", page=2),
            _row(code="400", page=2),
        ]
        ok, reason = check_codes_monotonic(rows)
        assert ok, reason

    def test_non_decreasing_passes(self):
        """100 → 110 → 110 → 120 → pass (duplicates allowed)."""
        rows = [
            _row(code="100", page=1),
            _row(code="110", page=1),
            _row(code="110", page=1),  # duplicate
            _row(code="120", page=1),
        ]
        ok, reason = check_codes_monotonic(rows)
        assert ok, reason

    def test_violation_detected(self):
        """100 → 200 → 150 → fail (non-100-multiple, genuine decrease)."""
        rows = [
            _row(code="100", page=1),
            _row(code="200", page=1),
            _row(code="150", page=2),  # decreases, non-100-multiple
        ]
        ok, reason = check_codes_monotonic(rows)
        assert not ok
        assert "codes_not_monotonic" in reason
        assert "code_before=200" in reason
        assert "code_after=150" in reason

    def test_group_subtotal_allowed(self):
        """
        110 → 120 → 130 → 100 → 200 → pass.
        Code 100 after 130 is a group subtotal (100-multiple) — allowed.
        """
        rows = [
            _row(code="110", page=1),
            _row(code="120", page=1),
            _row(code="130", page=1),
            _row(code="100", page=1),  # group subtotal — 100-multiple, allowed
            _row(code="200", page=2),
        ]
        ok, reason = check_codes_monotonic(rows)
        assert ok, f"Expected pass (group subtotal allowed), got: {reason}"

    def test_page_boundary_flagged(self):
        """Violation across page boundary flagged with page_boundary=True."""
        rows = [
            _row(code="300", page=3),
            _row(code="150", page=4),  # decrease across page boundary
        ]
        ok, reason = check_codes_monotonic(rows)
        assert not ok
        assert "page_boundary=True" in reason

    def test_empty_rows_pass(self):
        ok, reason = check_codes_monotonic([])
        assert ok

    def test_single_row_passes(self):
        ok, reason = check_codes_monotonic([_row(code="100", page=1)])
        assert ok

    def test_no_codes_passes(self):
        """Rows with no parseable codes are ignored → pass."""
        rows = [
            _row(code=None, label="label1", page=1),
            _row(code="abc", label="label2", page=1),
        ]
        ok, reason = check_codes_monotonic(rows)
        assert ok


# ===========================================================================
# Tests for check_no_orphan_rows
# ===========================================================================

class TestCheckNoOrphanRows:
    def test_all_clean_rows_pass(self):
        """All rows have label + at least one value → pass."""
        rows = [
            _row(code="100", label="Assets", values=["1000000", "900000"]),
            _row(code="200", label="Liabilities", values=["500000", "450000"]),
            _row(code="300", label="Equity", values=["500000", "450000"]),
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert ok, reason

    def test_orphan_row_detected(self):
        """Row with label but all empty values → orphan → fail."""
        rows = [
            _row(code="100", label="Assets", values=["1000000"]),
            _row(code="110", label="Current Assets", values=[""]),  # orphan
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert not ok
        assert "orphan_rows" in reason
        assert "orphan=1" in reason

    def test_junk_row_detected(self):
        """Row with no label and no values → junk → fail."""
        rows = [
            _row(code="100", label="Assets", values=["1000000"]),
            _row(code=None, label=None, values=[]),  # junk
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert not ok
        assert "orphan_rows" in reason
        assert "junk=1" in reason

    def test_empty_rows_pass(self):
        """Empty input → pass (nothing to check)."""
        ok, reason = check_no_orphan_rows([])
        assert ok

    def test_multiple_orphans_counted(self):
        rows = [
            _row(label="A", values=[""]),
            _row(label="B", values=[None]),
            _row(label="C", values=["100"]),  # valid
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert not ok
        assert "count=2" in reason

    def test_value_whitespace_only_counts_as_empty(self):
        """Values with only whitespace are treated as empty."""
        rows = [
            _row(label="Label", values=["   ", "\t"]),
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert not ok
        assert "orphan" in reason

    def test_row_with_label_and_value_passes(self):
        """Single row with valid label and value → pass."""
        rows = [_row(label="Something", values=["12345678"])]
        ok, reason = check_no_orphan_rows(rows)
        assert ok

    def test_numeric_only_label_treated_as_no_label(self):
        """
        Secondary fix (LF-FIX): a label that is ONLY numeric (digits/dots/commas)
        is treated as a misassigned value token, NOT a genuine text label.
        A row with purely-numeric label + value cells should fail as a junk row.

        This catches the 'all content in one wide column' structural scramble
        where a narrow 25-30px 'label' column has an OCR number overspill
        while the real content is in the adjacent value column.

        AC-0: generic structural check (numeric-only label detection),
        no Vietnamese keyword matching.
        """
        rows = [
            # Numeric-only 'label' — should be treated as no-label
            _row(label="44.393.950.887.086", values=["28.464.058.214.856"]),
        ]
        ok, reason = check_no_orphan_rows(rows)
        # The row should fail: numeric-only label → classified as junk/orphan
        assert not ok, (
            "Row with purely-numeric label should not pass Invariant 3 "
            "— it indicates a structurally-scrambled column layout."
        )

    def test_numeric_only_label_with_no_values_is_junk(self):
        """
        Numeric-only label + no values = junk row (both slots structurally empty).
        """
        rows = [
            _row(label="1.234.567", values=[""]),
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert not ok

    def test_mixed_label_text_and_numbers_passes(self):
        """
        A label that contains both text and numbers is a genuine label.
        Example: 'Item 1' or 'Cash (note 5)' — these pass the text-content check.
        """
        rows = [
            _row(label="Cash and equivalents (note 5)", values=["12345678"]),
            _row(label="Total assets 2024", values=["99999999"]),
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert ok, f"Mixed label should pass: {reason}"

    def test_has_label_rejects_pure_number(self):
        """Direct test of _has_label for purely-numeric strings."""
        from domain.primitives.layout_invariants.primitive import _has_label
        assert _has_label("88.141.991.634.625") is False
        assert _has_label("100") is False
        assert _has_label("(1.234)") is False

    def test_has_label_accepts_text(self):
        """Direct test of _has_label for strings with text content."""
        from domain.primitives.layout_invariants.primitive import _has_label
        assert _has_label("Phai tra nguoi ban ngan han") is True
        assert _has_label("Cash (note 5)") is True
        assert _has_label("Item 311") is True  # has text "Item"
