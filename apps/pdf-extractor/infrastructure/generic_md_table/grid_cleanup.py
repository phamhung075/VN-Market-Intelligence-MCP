# size-justification: 335L — grid post-processing + legacy MD-EXTRACT-1..4 row/column
# clustering (dead code, kept for existing unit-test back-compat per the god-file's own
# "Dead-code notes" — DO NOT REMOVE). FACTORY-PDF-split-generic-md-table Stage 3/8.
# Splitting further would separate _cluster_rows from its sole caller
# _cluster_rows_by_gap (same MD-EXTRACT-3/4 fallback family) and would separate the
# Step G post-processing helpers (_strip_leading_header_bands, _coalesce_label_columns,
# _collapse_empty_columns, _detect_header_rows, _is_data_table) from the single grid
# pipeline they form together in extractor.py — one cohesive "grid cleanup" seam.
"""
infrastructure/generic_md_table/grid_cleanup.py — MD-EXTRACT (Stage 3/8)

Two families of pure grid-manipulation functions, both extracted verbatim from
infrastructure/generic_md_table_extractor.py:

  1. Legacy MD-EXTRACT-1..4 row/column clustering (_median, _filter_words,
     _cluster_rows, _cluster_rows_by_gap, _detect_column_anchors, _assign_columns).
     DEAD on the live extraction hot path (superseded by the MD-EXTRACT-6 ordinal
     approach in ordinal_grid.py) but kept for backward compatibility with existing
     unit tests that import and exercise them directly — DO NOT REMOVE.

  2. Step G grid post-processing helpers used on the LIVE hot path
     (_strip_leading_header_bands, _coalesce_label_columns, _collapse_empty_columns,
     _detect_header_rows, _is_data_table) — called from GenericMdTableExtractor
     after the ordinal grid is built (extractor.py).

DDD layer: infrastructure (pure functions — no I/O, no Tesseract, no PIL, no DB).

See docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md for the
split approach (FACTORY-PDF-split-generic-md-table).
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from infrastructure.text_table_extractor import _is_recognized_section_header

from infrastructure.generic_md_table.constants import (
    _ROW_GAP_FACTOR,
    _SAME_LINE_FACTOR,
    _ROW_PITCH_MULTIPLIER,
    _COL_GAP_FACTOR,
    _LEFT_EDGE_BIN_FACTOR,
    _MIN_WORD_CONF,
    _NUMERIC_RE,
    _MONEY_GROUP_RE,
    _MIN_MONEY_GROUPS,
    _CODE_LIKE_RE,
    _MIN_CODE_HITS,
    _MIN_MONEY_THIN,
    _DATE_HEADER_RE,
)

logger = logging.getLogger(__name__)


def _median(values: List[float]) -> float:
    """Return median of a non-empty list of floats."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    mid = n // 2
    if n % 2 == 0:
        return (sorted_vals[mid - 1] + sorted_vals[mid]) / 2.0
    return sorted_vals[mid]


def _filter_words(data: Dict) -> List[Dict]:
    """
    Filter pytesseract image_to_data output to confident, non-empty words.

    Returns list of word dicts with keys: left, top, width, height, text, conf.
    """
    words: List[Dict] = []
    n = len(data.get("text", []))
    for i in range(n):
        text = str(data["text"][i]).strip()
        if not text:
            continue
        try:
            conf = int(data["conf"][i])
        except (ValueError, TypeError):
            conf = -1
        if conf <= _MIN_WORD_CONF:
            continue
        words.append(
            {
                "left": int(data["left"][i]),
                "top": int(data["top"][i]),
                "width": int(data["width"][i]),
                "height": int(data["height"][i]),
                "text": text,
                "conf": conf,
            }
        )
    return words


def _cluster_rows(words: List[Dict], h_med: float) -> List[List[Dict]]:
    """
    # DEAD in MD-EXTRACT-4 — replaced by _cluster_number_rows
    # Kept for backward compatibility with existing unit tests (DO NOT REMOVE).
    # The MD-EXTRACT-4 _process_page uses _cluster_number_rows (number tokens only).

    Step C — Row clustering via greedy y-band merge.

    Groups words into rows: a new row starts when the next word's top coordinate
    exceeds the current row's max(top + height) by more than 0.5 × H_med.
    This tolerates multi-line cells and OCR baseline jitter.

    Kept as a private fallback for sparse pages (< 3 lines detected by
    _cluster_rows_by_gap). Existing unit tests reference this function directly.

    Args:
        words: Words within a single table region (any order accepted).
        h_med: Median word height.

    Returns:
        List of rows, each row being a list of words sorted by left coordinate.
    """
    if not words:
        return []

    row_gap = _ROW_GAP_FACTOR * h_med if h_med > 0 else 5.0
    sorted_words = sorted(words, key=lambda w: w["top"])

    rows: List[List[Dict]] = []
    current_row: List[Dict] = [sorted_words[0]]
    current_row_max_bottom = sorted_words[0]["top"] + sorted_words[0]["height"]

    for word in sorted_words[1:]:
        if word["top"] > current_row_max_bottom + row_gap:
            # Start a new row
            rows.append(sorted(current_row, key=lambda w: w["left"]))
            current_row = [word]
            current_row_max_bottom = word["top"] + word["height"]
        else:
            current_row.append(word)
            bottom = word["top"] + word["height"]
            if bottom > current_row_max_bottom:
                current_row_max_bottom = bottom

    rows.append(sorted(current_row, key=lambda w: w["left"]))
    return rows


def _cluster_rows_by_gap(words: List[Dict], h_med: float) -> List[List[Dict]]:
    """
    # DEAD in MD-EXTRACT-4 — replaced by _cluster_number_rows
    # Kept for backward compatibility with existing unit tests (DO NOT REMOVE).
    # MD-EXTRACT-3 analysis: this fixed the balance-sheet collapse but scatter
    # persisted for wide tables (income statement, segment report) because it
    # still clustered ALL tokens including diacritic-inflated label tokens.
    # The fix is in _cluster_number_rows (number tokens only, SAME_LINE_TOL=4).

    Step C (DEFECT-D fix) — Row clustering via gap-histogram row-pitch detection.

    Replaces the greedy height-based _cluster_rows for dense multi-column grids
    (income statement, segment report) where the old 0.5 × H_med tolerance was
    too wide, collapsing 25 physical lines into a single "row".

    Algorithm (per brief §3.1 Steps 1–7):
      1. Sort words by top coordinate.
      2. Group words into candidate physical lines: two words share a line if
         their top values differ by ≤ SAME_LINE_TOLERANCE.
         SAME_LINE_TOLERANCE = min(floor(_SAME_LINE_FACTOR × h_med), 8)
         The 8px absolute cap defuses H_med inflation from tall header tokens
         (brief Risk R-HIGH #2).
      3. Compute inter-line gaps between consecutive candidate line tops.
      4. row_pitch = median(gaps > 0). Fallback to h_med if no positive gaps.
      5. ROW_SPLIT_THRESHOLD = row_pitch × _ROW_PITCH_MULTIPLIER.
      6. Walk lines in top-sorted order. Start a new grid row when the gap from
         the previous line exceeds ROW_SPLIT_THRESHOLD.
      7. Within each row, sort words by left coordinate (strict left-to-right;
         never column-major).

    Fallback (brief Risk R-HIGH #1): if fewer than 3 candidate lines are detected
    OR row_pitch <= 0, fall back to _cluster_rows (height-based). Log DEBUG.

    AC-0: pure geometric logic — zero BCTC-specific constants.
    DDD: pure function (no I/O, no Tesseract, no DB).

    Args:
        words: Words within a single table region (any order accepted).
        h_med: Median word height across the page.

    Returns:
        List of rows, each row being a list of words sorted by left coordinate.
        Rows are sorted by ascending top coordinate.
    """
    if not words:
        return []

    import math

    # Step 1 — Sort words by top coordinate
    sorted_words = sorted(words, key=lambda w: w["top"])

    # SAME_LINE_TOLERANCE: cap at 8px (brief Risk R-HIGH #2)
    same_line_tol = min(math.floor(_SAME_LINE_FACTOR * h_med), 8) if h_med > 0 else 2

    # Step 2 — Group words into candidate physical lines
    # A candidate line is a group of words whose top values are all within
    # same_line_tol of each other (greedy scan, sequential).
    candidate_lines: List[List[Dict]] = []
    if not sorted_words:
        return []

    current_line: List[Dict] = [sorted_words[0]]
    current_line_top = sorted_words[0]["top"]

    for word in sorted_words[1:]:
        if abs(word["top"] - current_line_top) <= same_line_tol:
            current_line.append(word)
        else:
            candidate_lines.append(current_line)
            current_line = [word]
            current_line_top = word["top"]
    candidate_lines.append(current_line)

    # Fallback: zero or one candidate line → height-based clustering
    # (brief Risk R-HIGH #1 specifies < 3 lines; however with 2 lines we still
    # have 1 valid gap to compute row_pitch, so we only fall back for < 2 lines).
    if len(candidate_lines) < 2:
        logger.debug(
            "_cluster_rows_by_gap: only %d candidate line(s) — falling back to "
            "_cluster_rows (height-based)",
            len(candidate_lines),
        )
        return _cluster_rows(words, h_med)

    # Step 3 — Compute inter-line gaps between consecutive candidate line tops
    # Use the minimum top value of each candidate line as its representative top
    line_tops = [min(w["top"] for w in line) for line in candidate_lines]

    gaps: List[float] = []
    for i in range(1, len(line_tops)):
        gap = line_tops[i] - line_tops[i - 1]
        if gap > 0:
            gaps.append(float(gap))

    # Step 4 — row_pitch = median of positive gaps
    if not gaps:
        logger.debug(
            "_cluster_rows_by_gap: no positive inter-line gaps — falling back to "
            "_cluster_rows (height-based)",
        )
        return _cluster_rows(words, h_med)

    row_pitch = _median(gaps)
    if row_pitch <= 0:
        logger.debug(
            "_cluster_rows_by_gap: row_pitch <= 0 — falling back to _cluster_rows"
        )
        return _cluster_rows(words, h_med)

    # Step 5 — Row-split threshold
    row_split_threshold = row_pitch * _ROW_PITCH_MULTIPLIER

    # Step 6 — Emit grid rows from candidate lines.
    # Primary: each candidate physical line = exactly one grid row (Step 7).
    # A new *logical* row starts when the gap from the previous line exceeds
    # row_split_threshold — this handles the case where two candidate lines
    # (e.g., a wrapped label) should merge into a single grid row. In practice,
    # for tightly-packed BCTC financial statements every consecutive gap equals
    # row_pitch (< threshold), so each candidate line becomes its own grid row.
    # The threshold fires only for unusually large gaps (section breaks), which
    # already should have been split by Step B but may appear at region edges.
    #
    # IMPORTANT: the logic is:
    #   gap > threshold → start a NEW grid row (section break detected)
    #   gap <= threshold → same continuous table → this candidate line is its
    #                      OWN grid row too (not merged with previous).
    #
    # In other words: EVERY candidate line produces a grid row. The threshold
    # only determines whether to treat a large gap as a section break (cosmetic —
    # in practice table splitting is already handled by _detect_table_regions).
    grid_rows: List[List[Dict]] = []

    for line in candidate_lines:
        # Step 7 — Sort words within each row by left coordinate (strict left-to-right)
        grid_rows.append(sorted(line, key=lambda w: w["left"]))

    return grid_rows


def _collapse_empty_columns(grid: List[List[str]]) -> List[List[str]]:
    """
    Drop columns that are empty (whitespace-only) across ALL rows including header.

    Fixes empty-column proliferation: after _coalesce_label_columns reduces the
    left side, the right side may still contain column slots populated only in
    some rows but blank in all others (sparse anchor assignment artefact).

    A column is EMPTY if every cell in that column across all rows is either an
    empty string or whitespace-only after strip(). If the header row has text in
    a column that column is KEPT (brief Risk R-MEDIUM #1 — may be a label-only
    column header). A column is dropped only when even the header cell is blank.

    AC-0: operates on the assembled grid only — zero BCTC-specific constants.
    DDD: pure function — no I/O, no Tesseract, no DB. Infrastructure layer.

    Args:
        grid: 2-D list of strings.

    Returns:
        Grid with all-empty columns removed. Returns original grid unchanged if
        the result would have 0 columns (let the density gate handle rejection).
    """
    if not grid or not grid[0]:
        return grid

    n_cols = len(grid[0])

    # Identify non-empty columns: at least one row has a non-blank cell
    keep_cols: List[int] = []
    for col_idx in range(n_cols):
        col_is_empty = all(
            (row[col_idx].strip() == "" if col_idx < len(row) else True)
            for row in grid
        )
        if not col_is_empty:
            keep_cols.append(col_idx)

    if not keep_cols:
        # All columns empty — let density gate reject
        return grid

    if len(keep_cols) == n_cols:
        # Nothing to drop
        return grid

    # Rebuild grid keeping only non-empty columns
    return [
        [row[col_idx] if col_idx < len(row) else " " for col_idx in keep_cols]
        for row in grid
    ]


def _detect_column_anchors(rows: List[List[Dict]], median_word_width: float) -> List[float]:
    """
    Step D — Column anchor detection via left-edge histogram.

    Collects all word left-edges across all rows and identifies clusters
    (peaks) in the histogram. Gaps of > 1.5 × median_word_width between
    clusters define column boundaries.

    Args:
        rows:              List of row word lists.
        median_word_width: Median word width across all words.

    Returns:
        Sorted list of column anchor x-positions.
    """
    if not rows or median_word_width <= 0:
        return [0.0]

    # Collect all left-edge values
    all_lefts: List[float] = []
    for row in rows:
        for word in row:
            all_lefts.append(float(word["left"]))

    if not all_lefts:
        return [0.0]

    # Bin left-edges: bin_width = 0.3 × median_word_width
    bin_width = max(1.0, _LEFT_EDGE_BIN_FACTOR * median_word_width)
    sorted_lefts = sorted(all_lefts)

    # Greedy cluster: group lefts within bin_width into a cluster
    clusters: List[List[float]] = []
    current_cluster = [sorted_lefts[0]]

    for left in sorted_lefts[1:]:
        if left - current_cluster[-1] <= bin_width:
            current_cluster.append(left)
        else:
            clusters.append(current_cluster)
            current_cluster = [left]
    clusters.append(current_cluster)

    # Cluster anchor = mean of the cluster
    cluster_anchors = [min(c) for c in clusters]

    # Merge clusters that are within gap_threshold of each other
    col_gap = _COL_GAP_FACTOR * median_word_width
    merged_anchors: List[float] = [cluster_anchors[0]]
    for anchor in cluster_anchors[1:]:
        if anchor - merged_anchors[-1] > col_gap:
            merged_anchors.append(anchor)
        # else: within same column — skip (already represented by merged_anchors[-1])

    return merged_anchors


def _assign_columns(
    rows: List[List[Dict]], col_anchors: List[float]
) -> List[List[str]]:
    """
    Steps E — Grid assembly.

    Assign each word to its nearest column anchor. Build the 2-D grid
    grid[row_idx][col_idx] = space-joined text of words in that cell.

    Args:
        rows:        Row-clustered word lists (Step C output).
        col_anchors: Column anchor x-positions (Step D output).

    Returns:
        2-D list of strings [row_idx][col_idx]. Empty cells = " ".
    """
    n_cols = len(col_anchors)
    grid: List[List[str]] = []

    for row_words in rows:
        cell_words: List[List[str]] = [[] for _ in range(n_cols)]

        for word in row_words:
            left = float(word["left"])
            # Assign to nearest column anchor
            distances = [abs(left - anchor) for anchor in col_anchors]
            nearest_col = distances.index(min(distances))
            cell_words[nearest_col].append(word["text"])

        # Join words within each cell
        row_cells = [" ".join(words).strip() if words else " " for words in cell_words]
        # Replace empty strings with single space (pipe-table parser compatibility)
        row_cells = [c if c else " " for c in row_cells]
        grid.append(row_cells)

    return grid


def _detect_header_rows(grid: List[List[str]]) -> int:
    """
    Step F — Header row detection.

    Returns the number of header rows (1 or 2).
    Uses 2 header rows when the first row has no numeric tokens
    (it is a label row with column name text, and row 1 has more specifics).
    Otherwise, uses 1 header row.
    """
    if not grid:
        return 0
    if len(grid) == 1:
        return 1

    first_row = grid[0]
    has_numeric = any(_NUMERIC_RE.search(cell) for cell in first_row)
    if not has_numeric and len(grid) >= 2:
        return 2
    return 1


def _is_data_table(grid: List[List[str]]) -> bool:
    """
    Generic density gate: emit grid as a pipe-table only if it contains
    financial data.

    Two acceptance conditions (OR — either is sufficient):
      1. money_groups >= _MIN_MONEY_GROUPS: at least K cells match the
         N,NNN,NNN or N.NNN.NNN number format (locale-agnostic financial).
      2. code_hits >= _MIN_CODE_HITS AND money_groups >= _MIN_MONEY_THIN:
         at least J three-digit standalone codes AND at least 1 money-group
         (section-header pages with a code column + a few values also qualify).

    Returns False for letterhead / title / prose blocks (zero financial numbers).

    AC-0: zero BCTC-specific constants. Uses only _MONEY_GROUP_RE (generic
    financial number pattern) and _CODE_LIKE_RE (generic 3-digit code pattern).
    Geometry and generic number patterns only — no per-table label keywords.

    Args:
        grid: 2-D list of strings assembled by _assign_columns().

    Returns:
        True if the grid passes the financial density gate; False otherwise.
    """
    if not grid:
        return False

    flat = " ".join(cell for row in grid for cell in row)
    money_groups = len(_MONEY_GROUP_RE.findall(flat))

    # Primary gate: sufficient money-group density
    if money_groups >= _MIN_MONEY_GROUPS:
        return True

    # Secondary gate: code-rich table with at least one money-group
    code_hits = len(_CODE_LIKE_RE.findall(flat))
    return code_hits >= _MIN_CODE_HITS and money_groups >= _MIN_MONEY_THIN


def _strip_leading_header_bands(grid: List[List[str]]) -> List[List[str]]:
    """
    Remove leading rows that contain ZERO money-group tokens (letterhead noise).

    Stop stripping at the first row that:
      - has at least one money-group match (_MONEY_GROUP_RE), OR
      - contains a date-header pattern (_DATE_HEADER_RE: DD/MM/YYYY), OR
      - is a recognized section header (_is_recognized_section_header).

    These stop-conditions preserve legitimate column header rows (e.g. date
    headers like "31/12/2025", BCTC section labels like "A. TÀI SẢN NGẮN HẠN")
    while stripping company-name / letterhead lines glued to the table top by
    Step B's vertical-gap detection.

    AC-0: uses only _MONEY_GROUP_RE (generic) and _DATE_HEADER_RE (generic).
    _is_recognized_section_header is a diacritic-insensitive geometry helper
    with no hardcoded table-type constants — also AC-0 compliant.

    DDD: pure function — no I/O, no Tesseract, no DB. Infrastructure layer.

    Args:
        grid: 2-D list of strings from _assign_columns().

    Returns:
        Grid with leading noise rows removed. May be empty if all rows were noise.
    """
    start = 0
    for i, row in enumerate(grid):
        flat = " ".join(row)
        has_money = bool(_MONEY_GROUP_RE.search(flat))
        has_date = bool(_DATE_HEADER_RE.search(flat))
        is_section_hdr = _is_recognized_section_header(flat)
        if has_money or has_date or is_section_hdr:
            start = i
            break
    return grid[start:]


def _coalesce_label_columns(grid: List[List[str]]) -> List[List[str]]:
    """
    Merge adjacent TEXT-ONLY columns at the left of the first numeric column
    into a single label column.

    A column is TEXT-ONLY if it has zero money-group matches across ALL rows.
    The first column that contains at least one money-group match across all
    its rows is the boundary: it and all columns to its right are kept separate.

    Fixes: "Phải trả người | bán ngắn | hạn" (3 false columns) → single
    label cell "Phải trả người bán ngắn hạn".

    AC-0: uses only _MONEY_GROUP_RE (generic financial number pattern).
    No BCTC label constants, no hardcoded column positions.

    DDD: pure function — no I/O, no Tesseract, no DB. Infrastructure layer.

    Args:
        grid: 2-D list of strings from _assign_columns() (or post-strip).

    Returns:
        Grid with text-only leading columns merged into a single label column.
        Returns unchanged grid when: grid is empty, first_numeric <= 1,
        or no numeric column exists (let density gate handle rejection).
    """
    if not grid or not grid[0]:
        return grid

    n_cols = len(grid[0])

    # Find the first numeric column (leftmost with any money-group match)
    first_numeric: Optional[int] = None
    for col_idx in range(n_cols):
        col_text = " ".join(
            row[col_idx] for row in grid if col_idx < len(row)
        )
        if _MONEY_GROUP_RE.search(col_text):
            first_numeric = col_idx
            break

    if first_numeric is None or first_numeric <= 1:
        # No numeric column found, or label is already single-column — keep as-is
        return grid

    # Merge columns 0..first_numeric-1 into a single label column per row
    merged: List[List[str]] = []
    for row in grid:
        label_parts = [
            row[i].strip()
            for i in range(first_numeric)
            if i < len(row) and row[i].strip()
        ]
        label = " ".join(label_parts)
        rest = list(row[first_numeric:]) if first_numeric < len(row) else []
        merged.append([label] + rest)
    return merged
