"""
select_period_column — pure domain primitive (BT-1).

Picks the correct result column from a BCTC table row that may contain
multiple period columns (current-quarter, YTD, prior-period, consolidated
vs parent entity).

This primitive handles the DETERMINISTIC part of column selection only.
Full semantic disambiguation (e.g. two "Quý IV" columns — parent vs consolidated)
requires the table-structure model output from BT-0/BT-3.

TODO (BT-3 model-dependent):
    When BT-3 supplies real column-header tokens from the winning extractor,
    replace the keyword heuristic below with a proper semantic match against
    the model's column-type classification output. The interface of this
    primitive (cells, hint, headers → index, value) is stable and will not
    change.

--- Selection algorithm (deterministic, in priority order) ---

1. Header keyword match (if headers provided + hint provided):
   Map hint to a set of Vietnamese / English keywords:
       "consolidated"  → ["hợp nhất", "consolidated"]
       "current"       → ["quý", "quarter", "current"]
       "ytd"           → ["lũy kế", "ytd", "year to date"]
   Find first header (case-insensitive) that contains any keyword for the hint.
   If found → return that column's (index, value) — even if the cell is empty.
   If no header matches → fall through to position heuristic.

2. Position heuristic (fallback):
   Return the first non-empty, numeric-looking cell.
   "Numeric-looking" = strip whitespace; matches the VN number pattern or a
   plain integer/decimal. Label-only text is skipped.
   If no numeric cell found → return (None, None).

--- Domain layer rules ---
    - Zero imports from infrastructure/, application/, interface/
    - No pdfplumber, pytesseract, aiohttp
    - No DB access, no file I/O, no network calls
    - Pure function: output = f(input) with no side effects

PYTHONPATH requirement: caller sets PYTHONPATH=apps/pdf-extractor.
"""

from __future__ import annotations

import re
from typing import Optional


# ---------------------------------------------------------------------------
# Hint → keyword mapping
# ---------------------------------------------------------------------------

_HINT_KEYWORDS: dict[str, list[str]] = {
    # Vietnamese BCTC consolidated column keywords
    "consolidated": ["hợp nhất", "consolidated"],
    # Current quarter / period
    "current": ["quý", "quarter", "current"],
    # Year-to-date / cumulative
    "ytd": ["lũy kế", "ytd", "year to date"],
    # Parent company only
    "parent": ["công ty mẹ", "parent"],
}

# ---------------------------------------------------------------------------
# Numeric detection — a cell is "numeric-looking" if it can plausibly be a
# financial figure (VN-formatted or plain number).  Labels and text are not.
# ---------------------------------------------------------------------------

# VN number: optional parenthesis + optional minus + digits + VN separators
_NUMERIC_RE = re.compile(
    r"^\(?-?\d[\d.,]*\)?$"
)


def _is_numeric_looking(cell: str) -> bool:
    """Return True if cell looks like a numeric financial figure."""
    s = cell.strip()
    if not s:
        return False
    return bool(_NUMERIC_RE.match(s))


def _normalise_hint(hint: str) -> str:
    """Lower-case and strip the hint for comparison."""
    return hint.strip().lower()


def _header_matches_hint(header: str, hint_lower: str) -> bool:
    """Return True if header contains any keyword for the given hint."""
    keywords = _HINT_KEYWORDS.get(hint_lower, [hint_lower])
    header_lower = header.strip().lower()
    return any(kw in header_lower for kw in keywords)


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------


def select_period_column(
    cells: list[str],
    hint: Optional[str] = None,
    headers: Optional[list[str]] = None,
) -> list:
    """
    Select the best result column from a BCTC table row.

    Args:
        cells:   List of raw cell strings for a single data row.
        hint:    Optional semantic hint: "consolidated" | "current" | "ytd" | "parent"
                 or any custom keyword. Case-insensitive. Default None = no preference.
        headers: Optional list of column header strings (same length as cells).
                 Used for keyword-based column selection. Default None.

    Returns:
        [index, value] list (JSON-serializable):
            index: int column index of the selected cell, or None if none found.
            value: str raw cell value at that index, or None if none found.

    Note:
        Returns a list (not tuple) so that JSON round-trip equality works in
        the sandbox runner (JSON arrays deserialize as lists, not tuples).

        If headers are not supplied or hint is None, falls back to the position
        heuristic (first non-empty numeric cell).

        TODO (BT-3): When model-based column classification is available, the
        caller should pass model output as additional context. This primitive
        will remain the deterministic fallback.
    """
    if not cells:
        return [None, None]

    # --- Step 1: Header keyword match ---
    if hint is not None and headers is not None and len(headers) == len(cells):
        hint_lower = _normalise_hint(hint)
        for i, header in enumerate(headers):
            if _header_matches_hint(header, hint_lower):
                return [i, cells[i]]

    # --- Step 2: Position heuristic — first non-empty numeric cell ---
    for i, cell in enumerate(cells):
        if cell.strip() and _is_numeric_looking(cell):
            return [i, cell]

    # No suitable cell found
    return [None, None]
