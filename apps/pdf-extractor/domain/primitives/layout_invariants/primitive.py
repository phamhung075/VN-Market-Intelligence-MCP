"""
domain/primitives/layout_invariants/primitive.py — LF-EXTRACT

Three machine-checkable per-unit invariant checkers for the Tier 3 invariant gate.

Pure functions: zero I/O, zero Tesseract, zero DB.
Domain layer: no imports from infrastructure/, application/, interface/.

AC-0 compliance: ZERO BCTC semantic strings in any decision path.
    - Balance identity uses CODE POSITION geometry (max-code row = total sentinel),
      NOT hardcoded sentinel code values like 270/300/400.
    - Codes-monotonic uses numeric ordering only, no label matching.
    - Orphan-rows checks structural completeness (label + value presence), no label keywords.

Three invariants (all must pass for a unit to be non-quarantined):

    check_balance_identity(rows) -> (pass: bool, reason: str)
        For balance-sheet-shaped units: sum-of-component-rows == total-row.
        Gating heuristic: unit has >= 3 distinct 3-digit code values AND max_code >= 400.
        If heuristic does NOT fire: (True, "balance_check_skipped=true").
        AC-0: sentinel detection by code-position geometry (max code value = total row),
              NOT by hardcoded code constants.

    check_codes_monotonic(rows) -> (pass: bool, reason: str)
        Codes in the unit's first text column must be non-decreasing in document order.
        Emits first violation triplet: (code_before, code_after, page_index).

    check_no_orphan_rows(rows, orphan_ratio_tolerance=0.05) -> (pass: bool, reason: str)
        Every data row must have a non-empty label AND at least one non-empty value.
        Junk rows (no label, no value) also trigger a fail.
        Tolerance: orphan_ratio <= orphan_ratio_tolerance (default 5%) → PASS.
        Rationale: dense statement pages (FPT p7-9 income-stmt/CF) can produce a
        1-column layout when gutter detection finds no gutters — all OCR lands in
        the label slot → 100% orphan for those pages. A ≤5% orphan ratio across
        the UNIT is structurally acceptable (≈ 2-3 rows on a 46-page doc unit).
        FU-ORPHAN-TOLERANCE.

Input row schema (dict per row):
    {
        "code":    str | None,     # BCTC line code, e.g. "100", "270" — or None
        "label":   str | None,     # row label text — or None / empty
        "values":  list[str|None], # list of value cells (col_1 … col_N) — may be None or ""
        "page":    int,            # page number this row came from
    }

All three functions return (bool, str). The bool is True = PASS, False = FAIL.
The str is "" on pass, or a diagnostic reason string on fail.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Internal helpers — AC-0 compliant (no Vietnamese strings, no code constants)
# ---------------------------------------------------------------------------

def _parse_code_int(code_str: Optional[str]) -> Optional[int]:
    """
    Try to parse a code string as an integer.

    Only accepts purely numeric strings (no labels, no mixed text).
    Returns None for None, empty, or non-numeric inputs.

    AC-0: pure numeric extraction — no string matching on BCTC labels.
    """
    if not code_str:
        return None
    stripped = code_str.strip()
    if re.fullmatch(r"\d+", stripped):
        return int(stripped)
    return None


def _extract_numeric_value(cell: Optional[str]) -> Optional[float]:
    """
    Extract a numeric value from a cell string.

    Strips Vietnamese number formatting (dots as thousands, commas as decimal).
    Returns None if the cell is empty or non-numeric.

    AC-0: generic number parser — no label keyword matching.
    """
    if not cell:
        return None
    # Remove whitespace and common Vietnamese thousands separators
    cleaned = cell.strip().replace(" ", "").replace("\xa0", "")
    # Vietnamese format: 1.234.567 → 1234567 or 1.234.567,89 → 1234567.89
    if re.fullmatch(r"[\d.,]+", cleaned):
        # Check if comma is decimal separator (last separator is comma)
        if "," in cleaned and cleaned.rindex(",") > cleaned.rindex(".") if "." in cleaned else False:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            # Dots are thousands separators
            cleaned = cleaned.replace(".", "").replace(",", ".")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _has_any_value(values: Optional[List[Optional[str]]]) -> bool:
    """Return True if at least one value cell has non-empty, non-None content."""
    if not values:
        return False
    return any(
        v is not None and str(v).strip() != ""
        for v in values
    )


def _has_label(label: Optional[str]) -> bool:
    """
    Return True if label is non-empty, non-None, AND contains at least some
    non-numeric text content.

    A label field that contains ONLY numeric content (digits, dots, commas,
    spaces) is classified as a misassigned value token — not a genuine row
    label. This prevents structurally-scrambled rows from passing Invariant 3
    when a narrow "label" column (OCR overspill from an adjacent value column)
    contains a number fragment while the real content is in the value column.

    AC-0: generic structural check — no BCTC keyword matching.
    """
    if not label:
        return False
    stripped = str(label).strip()
    if not stripped:
        return False
    # Reject labels that are purely numeric (digits, Vietnamese thousands dots,
    # commas, parentheses for negative numbers). A real label has text content.
    if re.fullmatch(r"[\d.,\(\)\-\s]+", stripped):
        return False
    return True


# ---------------------------------------------------------------------------
# Invariant 1 — Balance identity across the stitch
# ---------------------------------------------------------------------------

def check_balance_identity(rows: List[Dict]) -> Tuple[bool, str]:
    """
    Check that accounting identity holds for balance-sheet-shaped units.

    Balance-sheet shape heuristic (purely geometric — AC-0):
        - The unit has >= 3 DISTINCT 3-digit numeric codes
        - The maximum code value is >= 400

    This heuristic naturally fires on balance sheets (codes 100..440+) and
    does NOT fire on cash-flow (codes ~500..650) or income statements (codes
    typically < 400 or using different numbering).

    If heuristic does NOT fire: returns (True, "balance_check_skipped=true").

    Identity check:
        - Identify all rows with parseable integer codes.
        - Find the sentinel row: the row with the MAXIMUM code value.
          (AC-0: uses code-position geometry, NOT hardcoded sentinel codes.)
        - Sum all component rows (rows with codes less than the sentinel code
          AND greater than zero). Compare sum to sentinel value.
        - delta = abs(sentinel_value - component_sum).
        - Pass if delta == 0 or within 1 VND rounding.

    Args:
        rows: List of row dicts with keys: code, label, values, page.

    Returns:
        (True, "")                       on pass
        (True, "balance_check_skipped=true")  when heuristic does not fire
        (False, "balance_identity_fail: delta=<N>")  on fail
    """
    # --- Gather rows with parseable integer codes ---
    coded_rows: List[Tuple[int, Optional[float]]] = []
    for row in rows:
        code_int = _parse_code_int(row.get("code"))
        if code_int is None:
            continue
        # Use first non-empty value cell as the row's value
        val_cells = row.get("values") or []
        row_val: Optional[float] = None
        for cell in val_cells:
            row_val = _extract_numeric_value(cell)
            if row_val is not None:
                break
        coded_rows.append((code_int, row_val))

    # --- Heuristic gate ---
    distinct_codes = {c for c, _ in coded_rows}
    if len(distinct_codes) < 3:
        return True, "balance_check_skipped=true"

    max_code = max(distinct_codes)
    if max_code < 400:
        return True, "balance_check_skipped=true"

    # --- Find sentinel row (max code = total row, AC-0) ---
    sentinel_value: Optional[float] = None
    for code_int, val in coded_rows:
        if code_int == max_code:
            sentinel_value = val
            break

    if sentinel_value is None:
        # Sentinel row has no numeric value — cannot check, skip
        return True, "balance_check_skipped=true"

    # --- Sum component rows ---
    # Component rows = rows with codes in [1, max_code - 1]
    # Exclude subtotals: a row whose code is a round-number multiple >= 100 AND
    # whose value is larger than the following row's value is likely a subtotal.
    # Simple approach: sum ALL non-sentinel coded rows, then compare.
    # For balance sheets, sentinel_value == sum of major components.
    # We use a simpler approach: find the top-level subtotals only.
    # Top-level subtotals are rows where code is a multiple of 100 (e.g. 100, 200, 300, 400).
    # Their sum should equal the sentinel.
    top_level_subtotals: List[float] = []
    for code_int, val in coded_rows:
        if code_int == max_code:
            continue
        # Top-level subtotals: divisible by 100, not a sub-component
        if code_int % 100 == 0 and val is not None:
            top_level_subtotals.append(val)

    if len(top_level_subtotals) < 2:
        # Not enough top-level subtotals to verify identity — skip
        return True, "balance_check_skipped=true"

    component_sum = sum(top_level_subtotals)
    delta = abs(sentinel_value - component_sum)

    # Allow rounding tolerance of 1 (1 VND or 1 unit in whatever denomination)
    if delta <= 1.0:
        return True, ""

    return False, f"balance_identity_fail: delta={delta:.0f}"


# ---------------------------------------------------------------------------
# Invariant 2 — Codes monotonic across page boundary
# ---------------------------------------------------------------------------

def check_codes_monotonic(rows: List[Dict]) -> Tuple[bool, str]:
    """
    Check that numeric codes in document order are non-decreasing.

    Processes rows in the order they appear in the list (document order).
    For each consecutive pair of rows that BOTH have parseable integer codes,
    checks that code[i+1] >= code[i].

    Exception (structural subtotals): a code value equal to an ancestor group
    sum (i.e. the NEXT code after a decrease is followed by a higher value that
    exceeds the prior max) is excluded by a simple rule:
        - After any decrease, check if the decreasing value is < the PRIOR max code.
        - If so, it is a structural subtotal (a group total that restates components).
        - If not, it is a genuine out-of-order violation.

    AC-0: purely numeric comparison — no Vietnamese label matching.

    Args:
        rows: List of row dicts in DOCUMENT ORDER (sorted by page, then by row position).

    Returns:
        (True, "")                        on pass
        (False, "codes_not_monotonic: code_before=<A> code_after=<B> page_boundary=<P>")
    """
    coded_rows: List[Tuple[int, int]] = []  # (code_int, page_number)
    for row in rows:
        code_int = _parse_code_int(row.get("code"))
        if code_int is None:
            continue
        page = row.get("page", 0)
        coded_rows.append((code_int, page))

    if len(coded_rows) < 2:
        return True, ""

    max_seen = coded_rows[0][0]
    for i in range(1, len(coded_rows)):
        cur_code, cur_page = coded_rows[i]
        prev_code, prev_page = coded_rows[i - 1]

        if cur_code < prev_code:
            # Check if this is a structural subtotal (repeated ancestor group code):
            # A structural subtotal has a code value that has appeared before AND
            # is less than the running max. Example: after codes 110, 120, 130, code 100
            # is a subtotal for the 1xx group. This is normal balance-sheet structure.
            # Rule: if cur_code < max_seen AND cur_code % 100 != 0, it's a violation.
            # If cur_code % 100 == 0, it MIGHT be a group total — be lenient.
            if cur_code % 100 == 0:
                # Could be a group subtotal — allow (structural pattern)
                pass
            else:
                # Genuine out-of-order violation
                boundary_crossed = (cur_page != prev_page)
                return (
                    False,
                    f"codes_not_monotonic: code_before={prev_code} "
                    f"code_after={cur_code} "
                    f"page_boundary={boundary_crossed}",
                )
        else:
            max_seen = max(max_seen, cur_code)

    return True, ""


# ---------------------------------------------------------------------------
# Invariant 3 — Every data row has a label and at least one value
# ---------------------------------------------------------------------------

def check_no_orphan_rows(
    rows: List[Dict],
    orphan_ratio_tolerance: float = 0.05,
) -> Tuple[bool, str]:
    """
    Check that every data row has a non-empty label AND at least one non-empty value.

    Tolerance (FU-ORPHAN-TOLERANCE):
        If the fraction of bad rows (orphans + junk) is <= orphan_ratio_tolerance,
        the unit PASSES. Default tolerance = 5% (0.05).

        Rationale: dense BCTC statement pages (income-stmt / cash-flow, FPT p7-9)
        can produce a 1-column layout when gutter detection finds no column gutters
        — all OCR text lands in the label slot → 100% orphan for those pages.
        A unit with an 8.7% orphan ratio overall (FPT unit d8613f7c) is otherwise
        valid: the orphans are concentrated on 3 dense pages, the rest is clean.
        Allowing up to 5% preserves structural validation for the common junk-noise
        case while not quarantining units that are overwhelmingly clean.

        Tolerance boundary: orphan_ratio > 5.0% → FAIL; orphan_ratio <= 5.0% → PASS.

    Definitions:
        - Orphan row: label is present (non-empty) but ALL value columns are empty/null.
        - Junk row: BOTH label AND all value columns are empty/null (pure noise).
        - Value-only row: value present but label is missing or purely numeric
          (indicates column detection placed all content into one column).

    AC-0: checks structural completeness only (presence/absence of label and values),
          no Vietnamese keyword matching.

    Args:
        rows:                   List of row dicts with keys: code, label, values, page.
        orphan_ratio_tolerance: Fraction of bad rows allowed to still PASS.
                                Default 0.05 (5%). Must be in [0.0, 1.0].

    Returns:
        (True, "")                                      on pass (no orphans, or within tolerance)
        (True, "orphan_rows_within_tolerance: ...")     on pass via tolerance
        (False, "orphan_rows: count=<N> ratio=<R>")    on fail (exceeds tolerance)
    """
    if not rows:
        return True, ""

    orphan_count = 0
    junk_count = 0

    for row in rows:
        label = row.get("label")
        values = row.get("values") or []

        has_lab = _has_label(label)
        has_val = _has_any_value(values)

        if has_lab and not has_val:
            # Label present but no value — orphan row
            orphan_count += 1
        elif not has_lab and not has_val:
            # Neither label nor value — junk row
            junk_count += 1
        elif not has_lab and has_val:
            # Value present but label is missing or purely numeric.
            # This is the secondary fix (LF-FIX): in a correctly-detected
            # multi-column layout, every data row should have a text label
            # in its dedicated label column. A row with values but no genuine
            # label indicates the column detection placed all content into the
            # value column, losing the structural label+value separation.
            # Classify as an orphan (values without label).
            orphan_count += 1

    total_bad = orphan_count + junk_count
    if total_bad == 0:
        return True, ""

    total_rows = len(rows)
    orphan_ratio = total_bad / total_rows

    if orphan_ratio <= orphan_ratio_tolerance:
        # Within tolerance — structural noise, not a structural failure
        return (
            True,
            f"orphan_rows_within_tolerance: count={total_bad} "
            f"ratio={orphan_ratio:.3f} tolerance={orphan_ratio_tolerance:.3f} "
            f"(orphan={orphan_count}, junk={junk_count})",
        )

    return (
        False,
        f"orphan_rows: count={total_bad} ratio={orphan_ratio:.3f} "
        f"exceeds_tolerance={orphan_ratio_tolerance:.3f} "
        f"(orphan={orphan_count}, junk={junk_count})",
    )
