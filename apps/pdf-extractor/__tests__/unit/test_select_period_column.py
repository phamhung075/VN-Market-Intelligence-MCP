"""
Unit tests — domain/primitives/select_period_column/primitive.py (BT-1).

Picks the correct result column index from a BCTC table row that may contain
multiple period columns (current-quarter, YTD, prior-period, consolidated vs parent).

This primitive handles the DETERMINISTIC part of column selection:
    1. Keyword-hint matching: if caller provides a hint ("consolidated", "current"),
       prefer columns whose headers contain those keywords.
    2. Position heuristic: when no keyword match, prefer the FIRST non-empty
       numeric cell (BCTC standard: leftmost column = most-current period).
    3. Returns the column index (int) and the raw string value at that index.

TODO (BT-3/model-dependent):
    Full semantic column disambiguation when multiple columns share the same
    header keyword (e.g. two "Quý" columns for parent vs consolidated entity)
    requires the table-structure model output from BT-0/BT-3. This primitive
    returns the deterministic best-guess; the model adapter in BT-3 will override
    when higher confidence is available.

Domain layer rules:
    - Zero imports from infrastructure/, application/, interface/
    - Pure function: output = f(input) with no side effects
"""

import pytest

from domain.primitives.select_period_column import select_period_column


# ---------------------------------------------------------------------------
# Happy path — single numeric cell, no hint needed
# ---------------------------------------------------------------------------


def test_single_cell_no_hint():
    """Single cell row → index 0 always selected."""
    idx, val = select_period_column(["1.234.567"])
    assert idx == 0
    assert val == "1.234.567"


def test_first_numeric_preferred():
    """
    Multiple cells, no hint → first non-empty numeric cell selected.
    BCTC convention: leftmost column = most-current period.
    """
    idx, val = select_period_column(["2.840.370", "2.750.000", "2.600.000"])
    assert idx == 0
    assert val == "2.840.370"


# ---------------------------------------------------------------------------
# Hint matching — prefer column that matches a header hint
# ---------------------------------------------------------------------------


def test_hint_consolidated_keyword():
    """
    Rows with headers: hint="consolidated" → select cell at column with
    'hợp nhất' in corresponding header.
    """
    headers = ["Công ty mẹ", "Hợp nhất"]
    cells = ["1.000.000", "2.840.370"]
    idx, val = select_period_column(cells, hint="consolidated", headers=headers)
    assert idx == 1
    assert val == "2.840.370"


def test_hint_current_quarter():
    """
    hint="current" matches header containing 'quý' or 'current'.
    """
    headers = ["Lũy kế", "Quý IV"]
    cells = ["10.000.000", "2.840.370"]
    idx, val = select_period_column(cells, hint="current", headers=headers)
    assert idx == 1
    assert val == "2.840.370"


def test_hint_no_match_falls_back_to_first():
    """
    hint provided but no header matches → fall back to first non-empty numeric.
    """
    headers = ["Cột A", "Cột B"]
    cells = ["2.840.370", "1.000.000"]
    idx, val = select_period_column(cells, hint="consolidated", headers=headers)
    assert idx == 0
    assert val == "2.840.370"


# ---------------------------------------------------------------------------
# Edge — empty / blank cells skipped
# ---------------------------------------------------------------------------


def test_skip_empty_cells():
    """Empty leading cells skipped; first non-empty selected."""
    idx, val = select_period_column(["", "", "2.840.370", "1.000.000"])
    assert idx == 2
    assert val == "2.840.370"


def test_skip_whitespace_cells():
    """Whitespace-only cells treated as empty."""
    idx, val = select_period_column(["   ", "2.840.370"])
    assert idx == 1
    assert val == "2.840.370"


def test_all_empty_returns_none():
    """All cells empty → returns (None, None)."""
    idx, val = select_period_column(["", "  ", ""])
    assert idx is None
    assert val is None


def test_empty_list_returns_none():
    """Empty cell list → returns (None, None)."""
    idx, val = select_period_column([])
    assert idx is None
    assert val is None


# ---------------------------------------------------------------------------
# Edge — non-numeric cells (label columns) skipped
# ---------------------------------------------------------------------------


def test_skip_label_cells():
    """Label/text cells skipped; first numeric selected."""
    idx, val = select_period_column(["Doanh thu", "2.840.370", "1.000.000"])
    assert idx == 1
    assert val == "2.840.370"


def test_numeric_detection_vn_format():
    """VN-formatted numbers ("2.840.370") detected as numeric."""
    idx, val = select_period_column(["2.840.370"])
    assert idx == 0


def test_numeric_detection_plain():
    """Plain integers detected as numeric."""
    idx, val = select_period_column(["51000"])
    assert idx == 0


# ---------------------------------------------------------------------------
# Hint keyword variants (case-insensitive)
# ---------------------------------------------------------------------------


def test_hint_case_insensitive():
    """Hint matching is case-insensitive."""
    headers = ["HỢP NHẤT", "Công ty mẹ"]
    cells = ["2.840.370", "1.000.000"]
    idx, val = select_period_column(cells, hint="Consolidated", headers=headers)
    assert idx == 0
    assert val == "2.840.370"
