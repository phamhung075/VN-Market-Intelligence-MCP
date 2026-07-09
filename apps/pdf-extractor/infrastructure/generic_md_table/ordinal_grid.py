# size-justification: ~1210L — the MD-EXTRACT-4..9 ordinal-reconstruction algorithm
# family (docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md,
# FACTORY-PDF-split-generic-md-table Stage 4/8). This is ONE cohesive algorithm with
# deep intra-family call dependencies: _cluster_number_rows_adaptive calls
# _estimate_inter_row_pitch; _build_ordinal_grid calls _insert_skip_slots per column;
# extractor.py's per-region pipeline chains _detect_table_regions ->
# _detect_column_anchors_from_tokens -> _assign_tokens_to_columns ->
# _identify_pure_code_columns -> _build_ordinal_grid -> _cluster_text_into_label_lines
# -> _exclude_pre_data_label_lines -> _attach_labels_by_rank in strict sequence.
# Several functions (_cluster_number_rows, _cluster_number_rows_adaptive,
# _attach_labels, _build_grid_from_number_rows, _attach_labels_ordinal) are DEAD on
# the live hot path (superseded by later MD-EXTRACT generations) but are kept
# verbatim for existing unit-test back-compat per the god-file's own "Dead-code
# notes" (DO NOT REMOVE). Splitting this family further along MD-EXTRACT-N
# generation boundaries would scatter functions that call each other across files
# with no DDD-layer benefit — same infrastructure layer, same algorithm, same
# consumer (extractor.py). Kept as one file matching the task's approved module list.
"""
infrastructure/generic_md_table/ordinal_grid.py — MD-EXTRACT-4..9 (Stage 4/8)

Column-anchor-first ordinal table reconstruction: the core number-token
classification, row/column clustering, and ordinal-rank grid-building pipeline
that defeats the drift>gap diagonal-cascade failure mode (see module docstring
in infrastructure/generic_md_table_extractor.py for the full algorithm writeup).

Live hot-path functions (Steps A2, B, C6-C11):
    _classify_tokens, _detect_table_regions, _detect_column_anchors_from_tokens,
    _assign_tokens_to_columns, _insert_skip_slots, _build_ordinal_grid,
    _cluster_text_into_label_lines, _exclude_pre_data_label_lines,
    _attach_labels_by_rank, _find_first_value_row_top, _exclude_header_tokens,
    _identify_pure_code_columns.

Dead (kept for unit-test back-compat, DO NOT REMOVE — see "Dead-code notes" in
the god-file's original module docstring):
    _cluster_number_rows, _estimate_inter_row_pitch (only live caller is the dead
    _cluster_number_rows_adaptive), _cluster_number_rows_adaptive, _attach_labels,
    _build_grid_from_number_rows, _attach_labels_ordinal.

DDD layer: infrastructure (pure functions — no I/O, no Tesseract, no PIL, no DB).

See docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md for the
split approach (FACTORY-PDF-split-generic-md-table).
"""

from __future__ import annotations

import logging
import math
from typing import Dict, List, Optional

from infrastructure.generic_md_table.constants import (
    SAME_LINE_TOL,
    _NUMBER_TOKEN_RE,
    _NUMERIC_RE,
    _SECTION_GAP_FACTOR,
    _LEFT_EDGE_BIN_FACTOR,
    _MIN_INTER_COLUMN_GAP_PX,
    _COL_ASSIGN_MAX_DIST_FACTOR,
    _MIN_WORD_CONF_ORDINAL,
    SKIP_GAP_FACTOR,
    DENSE_COL_THRESHOLD,
    LABEL_BAND_FACTOR,
    _LABEL_LINE_GAP_PX,
    _LABEL_HEADER_MARGIN_PX,
    _CODE_TOKEN_RE,
    _VALUE_TOKEN_RE,
    PURE_CODE_COL_THRESHOLD,
)

logger = logging.getLogger(__name__)


def _classify_tokens(words: List[Dict]):
    """
    Split image_to_data word list into (number_tokens, text_tokens).

    NUMBER tokens match _NUMBER_TOKEN_RE (money groups + 2-3 digit codes).
    TEXT tokens are everything else (labels, headers, units, prose).

    Pure function: no I/O, no Tesseract, no DB.

    This is the key fix for MD-EXTRACT-1/2/3 failures:
    Vietnamese diacritic LABEL tokens have inflated/jittered top values that
    scatter across y-bands. By clustering NUMBER tokens only, we avoid diacritic
    inflation entirely. Labels are attached afterwards (Step F).

    AC-0: uses _NUMBER_TOKEN_RE (generic financial number pattern).
          Zero BCTC-specific label strings.

    Args:
        words: Filtered image_to_data word dicts (conf > 0, text non-empty).

    Returns:
        (number_tokens, text_tokens) — two lists of word dicts.
    """
    number_tokens: List[Dict] = []
    text_tokens: List[Dict] = []
    for w in words:
        txt = w.get("text", "").strip()
        if not txt:
            continue
        if _NUMBER_TOKEN_RE.match(txt):
            number_tokens.append(w)
        else:
            text_tokens.append(w)
    return number_tokens, text_tokens


def _cluster_number_rows(
    number_tokens: List[Dict],
    same_line_tol: int = SAME_LINE_TOL,
) -> List[List[Dict]]:
    """
    # DEAD in MD-EXTRACT-5 — replaced by _cluster_number_rows_adaptive.
    # Kept for backward compatibility with existing unit tests. DO NOT REMOVE.
    #
    # Failure mode (D1 wide-row cascade-split): fixed anchor current_top = first
    # token top. Lens-distortion drift of 8-15px over a 2400px-wide page caused
    # rightmost tokens (top+14px) to fail abs(top - current_top) <= 4 → cascade
    # split into 2-3 fragment rows. _cluster_number_rows_adaptive fixes this via
    # large-gap mode row-pitch estimation + running-centroid comparison.

    Group number tokens into rows by y-coordinate using SAME_LINE_TOL (FIXED anchor).

    Algorithm:
      1. Sort number tokens by top.
      2. Greedy same-y grouping: add to current row while abs(top - current_top) ≤ tol.
      3. When top exceeds tolerance: close current row, start new one.
      4. Each row is sorted by left (x ascending).

    Pure function: no I/O, no Tesseract, no DB.

    AC-0: zero BCTC-specific constants.

    Args:
        number_tokens: List of number-token word dicts (from _classify_tokens).
        same_line_tol: y-distance tolerance in pixels (default SAME_LINE_TOL=4).

    Returns:
        List of row groups, each a list of word dicts sorted by left (x ascending).
        Returns [] if input is empty.
    """
    if not number_tokens:
        return []

    sorted_by_y = sorted(number_tokens, key=lambda w: w["top"])
    rows: List[List[Dict]] = []
    current_row: List[Dict] = [sorted_by_y[0]]
    current_top: int = sorted_by_y[0]["top"]

    for w in sorted_by_y[1:]:
        if abs(w["top"] - current_top) <= same_line_tol:
            current_row.append(w)
        else:
            rows.append(sorted(current_row, key=lambda t: t["left"]))
            current_row = [w]
            current_top = w["top"]

    rows.append(sorted(current_row, key=lambda t: t["left"]))
    return rows


def _estimate_inter_row_pitch(
    number_tokens: List[Dict],
    same_line_tol: int = SAME_LINE_TOL,
) -> float:
    """
    Estimate the inter-row pitch from NUMBER token top-value distribution.

    Uses large-gap mode on a 2px-binned histogram of top values to separate
    the inter-row boundary transitions from the within-row micro-gaps.

    Within-row micro-gaps (OCR jitter): small, plentiful → dominate the median.
    Row-boundary gaps: larger, fewer → isolated by large_gaps = [g > median].

    Algorithm (§3 Step 2 of MD-EXTRACT-5 brief):
      1. Bin all token top values to 2px buckets: bin = (top // 2) * 2.
      2. Build sorted list of unique bins: unique_bins.
      3. Compute adjacent inter-bin gaps.
      4. gap_median = median(gaps).
      5. large_gaps = [g for g in gaps if g > gap_median].
      6. row_pitch = min(large_gaps) if large_gaps else gap_median.
      7. Fallback: if len(unique_bins) < 3 or row_pitch <= 0 or large_gaps empty
             → return 0.0 (triggers same_line_tol fallback in caller).

    Pure function: stdlib only. No I/O, no Tesseract, no DB.

    AC-0: geometry only — zero BCTC-specific constants.

    Args:
        number_tokens: List of number-token word dicts (each has "top" key).
        same_line_tol:  Unused here; accepted for signature symmetry with caller.

    Returns:
        Estimated inter-row pitch in pixels (positive), or 0.0 for fallback.
    """
    if not number_tokens:
        return 0.0

    # Step 1-2: bin tops to 2px and collect unique bins
    binned = [(w["top"] // 2) * 2 for w in number_tokens]
    unique_bins = sorted(set(binned))

    # Fallback: too few unique bins to estimate pitch reliably
    if len(unique_bins) < 3:
        return 0.0

    # Step 3: adjacent inter-bin gaps
    gaps = [unique_bins[i + 1] - unique_bins[i] for i in range(len(unique_bins) - 1)]

    # Step 4: gap median (sort-based, no statistics import)
    sorted_gaps = sorted(gaps)
    n = len(sorted_gaps)
    mid = n // 2
    if n % 2 == 0:
        gap_median = (sorted_gaps[mid - 1] + sorted_gaps[mid]) / 2.0
    else:
        gap_median = float(sorted_gaps[mid])

    # Step 5-6: large-gap mode — only gaps above the median are row-boundary candidates
    large_gaps = [g for g in gaps if g > gap_median]
    if not large_gaps:
        # All gaps equal (flat page with no clear row structure) → fallback
        return 0.0

    row_pitch = float(min(large_gaps))

    # Safety: row_pitch must be positive
    if row_pitch <= 0.0:
        return 0.0

    return row_pitch


def _cluster_number_rows_adaptive(
    number_tokens: List[Dict],
    same_line_tol: int = SAME_LINE_TOL,
) -> List[List[Dict]]:
    """
    # DEAD in MD-EXTRACT-6 — replaced by column-anchor-first ordinal reconstruction.
    # Kept for backward compatibility with existing unit tests. DO NOT REMOVE.
    # _process_page now uses _assign_tokens_to_columns + _build_ordinal_grid + _attach_labels_ordinal.

    Group number tokens into rows using adaptive tolerance + running-centroid.

    Fixes D1 wide-row cascade-split from MD-EXTRACT-4:
    The old _cluster_number_rows used a FIXED anchor (first token top).
    Lens-distortion baseline drift of 8-15px over a 2400px-wide BCTC page caused
    rightmost tokens to fail abs(top - first_top) <= 4 → row fragment cascade.

    This function derives the tolerance FROM THE DOCUMENT (per-page) via:
      Step 2: _estimate_inter_row_pitch — large-gap mode on 2px-binned histogram.
      Step 3: adaptive_tol = min(int(0.45 × row_pitch), 8).
              0.45 × pitch = admit within 45% of row-pitch (generous for drift,
              tight enough to exclude adjacent rows at 100% pitch).
              8px absolute cap: safety ceiling for very-large pitch estimates.
      Step 4: greedy grouping with RUNNING-CENTROID comparison (not fixed anchor).
              Each admitted token updates the running mean → tracks baseline drift.

    Worked example (§8 AC-5-SEG fixture, row_pitch=14, adaptive_tol=6):
      row0 tops [100..106] all admitted (centroid tracks 100→103), centroid=103.
      row1 first token top=120: |120-103|=17 > 6 → new row. All row1 tokens admitted.
      Result: EXACTLY 2 groups of 7 tokens. No bleed.

    Fallback: if _estimate_inter_row_pitch returns 0 (sparse page, ≤2 unique bins,
    or all gaps equal), use same_line_tol (fixed, default=4). Logged at DEBUG.

    Pure function: no I/O, no Tesseract, no DB.

    AC-0: geometry only — zero BCTC-specific constants.

    Args:
        number_tokens: List of number-token word dicts (from _classify_tokens).
        same_line_tol: Fixed fallback tolerance in pixels (default SAME_LINE_TOL=4).

    Returns:
        List of row groups, each a list of word dicts sorted by left (x ascending).
        Returns [] if input is empty.
    """
    if not number_tokens:
        return []

    # Step 1: sort by top
    sorted_tokens = sorted(number_tokens, key=lambda w: w["top"])

    # Step 2: estimate inter-row pitch via large-gap mode
    row_pitch = _estimate_inter_row_pitch(number_tokens, same_line_tol)

    # Step 3: compute adaptive tolerance
    if row_pitch > 0:
        adaptive_tol = min(int(0.45 * row_pitch), 8)
        tol = adaptive_tol
        logger.info("_cluster_number_rows_adaptive: row_pitch=%s adaptive_tol=%s n_tokens=%s (MD-EXTRACT-6 diagnostic)", row_pitch, adaptive_tol, len(number_tokens))
    else:
        tol = same_line_tol
        logger.info("_cluster_number_rows_adaptive: sparse/flat page, row_pitch=0, adaptive_tol=%s n_tokens=%s (MD-EXTRACT-6 diagnostic)", same_line_tol, len(number_tokens))

    # Step 4: greedy grouping with running-centroid anchor
    rows: List[List[Dict]] = []
    current_row: List[Dict] = [sorted_tokens[0]]
    current_centroid: float = float(sorted_tokens[0]["top"])

    for w in sorted_tokens[1:]:
        if abs(w["top"] - current_centroid) <= tol:
            # Admit token: update running centroid
            current_row.append(w)
            current_centroid = sum(t["top"] for t in current_row) / len(current_row)
        else:
            # Close current row, start new one
            rows.append(sorted(current_row, key=lambda t: t["left"]))
            current_row = [w]
            current_centroid = float(w["top"])

    rows.append(sorted(current_row, key=lambda t: t["left"]))
    return rows


def _attach_labels(
    row_groups: List[List[Dict]],
    text_tokens: List[Dict],
    h_med: float,
) -> List[tuple]:
    """
    # DEAD in MD-EXTRACT-6 — replaced by _attach_labels_ordinal (Step C11).
    # Kept for backward compatibility with existing unit tests. DO NOT REMOVE.

    For each number-row group, find nearest TEXT tokens by y and prepend as label.

    Strategy (per §3 REVISED Step F):
      1. Compute y-centroid (y_c) of the row group's number tokens.
      2. Find TEXT tokens within h_med × 0.6 of y_c → primary match.
      3. If none in primary band: find nearest within h_med × 2.0 → fallback.
      4. Space-join matched TEXT tokens sorted by left (x ascending).
      5. If still none: label = "" (honest empty — OCR merge or header row).

    Pure function: no I/O, no Tesseract, no DB.

    AC-0: zero BCTC-specific constants. Generic y-band attachment.

    AC-4A guarantee: every row with ≥1 number token has a label cell (possibly
    empty if no TEXT token exists within 2×h_med — the honest bar per §2.3).

    Args:
        row_groups:  List of number-row groups (from _cluster_number_rows).
        text_tokens: All TEXT tokens on the page (from _classify_tokens).
        h_med:       Median word height from number tokens (pixels).

    Returns:
        List of (label_str, row_tokens) tuples. Same length as row_groups.
    """
    result: List[tuple] = []
    for row in row_groups:
        if not row:
            continue
        y_c = sum(w["top"] for w in row) / len(row)

        # Primary: TEXT tokens within h_med × 0.6
        close = [t for t in text_tokens if abs(t["top"] - y_c) <= h_med * 0.6]

        # Fallback: nearest within h_med × 2.0
        if not close:
            nearest = sorted(text_tokens, key=lambda t: abs(t["top"] - y_c))
            if nearest and abs(nearest[0]["top"] - y_c) <= h_med * 2.0:
                close = [nearest[0]]

        label = " ".join(
            t["text"] for t in sorted(close, key=lambda t: t["left"])
        ).strip()
        result.append((label, row))
    return result


def _build_grid_from_number_rows(
    labeled_rows: List[tuple],
    col_anchors: List[float],
) -> List[List[str]]:
    """
    # DEAD in MD-EXTRACT-6 — replaced by _build_ordinal_grid (Steps C8+C8.5+C9+C10).
    # Kept for backward compatibility with existing unit tests. DO NOT REMOVE.

    Assign number tokens + labels to (row_idx, col_idx) cells.

    Grid layout: column 0 = label cell, columns 1..N = number-token columns
    ordered by col_anchors.

    D4b (MD-EXTRACT-5): CODE tokens (2-3 digit standalone, matching _CODE_TOKEN_RE)
    are routed to the LEFTMOST number-column slot (col_anchors[0]) regardless of
    their x-position. VALUE tokens (money-group format, matching _VALUE_TOKEN_RE)
    are assigned to their x-nearest col_anchor. This prevents code+value cell
    concatenation (e.g., "100 58.102.970.741.619" in one cell).

    Tokens matching neither CODE nor VALUE (e.g., small unformatted integers) fall
    back to the x-nearest anchor assignment (previous behaviour, no regression).

    Pure function: no I/O, no Tesseract, no DB.

    AC-0: geometry only — _CODE_TOKEN_RE and _VALUE_TOKEN_RE are purely numeric
    patterns. Zero BCTC-specific label strings.

    Args:
        labeled_rows:  List of (label_str, row_tokens) from _attach_labels.
        col_anchors:   Sorted column anchor x-positions (from _detect_column_anchors
                       applied to number tokens only).

    Returns:
        2-D list of strings. grid[row_idx][0] = label, grid[row_idx][1..N] = values.
        Empty cells represented as " " (pipe-table compatibility).
    """
    if not labeled_rows or not col_anchors:
        return []

    n_val_cols = len(col_anchors)
    grid: List[List[str]] = []

    for label, row_tokens in labeled_rows:
        # Initialize: N value slots
        cell_words: List[List[str]] = [[] for _ in range(n_val_cols)]

        for w in row_tokens:
            txt = w.get("text", "").strip()
            left = float(w["left"])

            if _CODE_TOKEN_RE.match(txt):
                # D4b: CODE token → leftmost number column (index 0)
                cell_words[0].append(txt)
            elif _VALUE_TOKEN_RE.match(txt):
                # D4b: VALUE token → x-nearest column anchor
                distances = [abs(left - anchor) for anchor in col_anchors]
                nearest_col = distances.index(min(distances))
                cell_words[nearest_col].append(txt)
            else:
                # Fallback: x-nearest anchor (no regression for other token types)
                distances = [abs(left - anchor) for anchor in col_anchors]
                nearest_col = distances.index(min(distances))
                cell_words[nearest_col].append(txt)

        # Build row: label cell + value cells
        value_cells = [
            " ".join(words).strip() if words else " "
            for words in cell_words
        ]
        value_cells = [c if c else " " for c in value_cells]

        row_cells = [label if label else " "] + value_cells
        grid.append(row_cells)

    return grid


def _detect_column_anchors_from_tokens(
    tokens: List[Dict],
    median_word_width: float,
) -> List[float]:
    """
    Column anchor detection — two-pass implementation (MD-EXTRACT-8).

    Pass 1: Form raw left-edge clusters using fine bin_width derived from CODE
            token widths (short, uniform ~20-30px at 200 DPI) rather than ALL
            token widths. Falls back to _LEFT_EDGE_BIN_FACTOR × median_word_width
            if no code tokens present (maintains backward compatibility for sparse
            pages without a code column).

    Pass 2: Merge adjacent clusters whose gap < _MIN_INTER_COLUMN_GAP_PX (80px).
            This replaces the w_med-derived col_gap oracle that inflated to 250px
            on long-string income statement tokens (root cause of MD-EXTRACT-8
            failure). _MIN_INTER_COLUMN_GAP_PX = 80px is fixed for 200 DPI output
            (1cm whitespace — the rasterization DPI used in extract_md_tables_usecase.py).

    Root cause fixed: on pages with long cumulative money strings (18-char figures
    like "20.258.866.135.395"), w_med inflates to ~167px → old col_gap = 1.5×167 =
    250.5px, which absorbs the 225px gap between the code-column anchor (957) and
    the first value column (1182), causing all 4 real value columns to be lost.
    The fixed 80px threshold correctly separates all clusters (smallest real gap = 92px
    between Thuyết minh col at 1049 and Val-A at 1182, after code exclusion at C7.5).

    Non-regression (segment report):
        Segment value tokens are short (8-10 chars, ~70-80px wide), producing
        w_med ≈ 75px → old col_gap ≈ 112px. Segment inter-column whitespace is
        ≥150px. Both old and new algorithms correctly separate segment columns.
        The two-pass approach is strictly more accurate on long-string pages and
        at least as accurate on short-string pages.

    Pure function: no I/O, no Tesseract, no DB.

    AC-0: _CODE_TOKEN_RE is a generic 2-3 digit pattern. _MIN_INTER_COLUMN_GAP_PX is
          a generic 200-DPI geometry constant. Zero BCTC-specific string constants.

    Args:
        tokens:            Flat list of word dicts (each has "left", optionally "width").
        median_word_width: Median word width (pixels). Used for Pass-1 fallback bin_width.

    Returns:
        Sorted list of column anchor x-positions (min of each surviving cluster).
        Returns [0.0] if no tokens supplied.
    """
    if not tokens or median_word_width <= 0:
        return [0.0]

    all_lefts = sorted(float(w["left"]) for w in tokens)
    if not all_lefts:
        return [0.0]

    # Pass 1 — form fine-grained left-edge clusters.
    # Use CODE token width for bin_width (short, uniform ~20-30px at 200 DPI).
    # Code tokens like "01", "10", "100" have widths ≈ 20-30px → bin_width ≈ 6-9px.
    # This produces tighter, more accurate clusters than 0.3 × 167px = 50px bins.
    # Fallback: _LEFT_EDGE_BIN_FACTOR × median_word_width (unchanged from prior impl)
    # for pages with no code column (e.g. pure summary tables or segment report).
    code_widths = [
        float(w["width"])
        for w in tokens
        if _CODE_TOKEN_RE.match(w.get("text", "").strip()) and w.get("width", 0) > 0
    ]
    if code_widths:
        sorted_cw = sorted(code_widths)
        code_w_med = sorted_cw[len(sorted_cw) // 2]
        bin_width = max(1.0, _LEFT_EDGE_BIN_FACTOR * code_w_med)
    else:
        bin_width = max(1.0, _LEFT_EDGE_BIN_FACTOR * median_word_width)

    clusters: List[List[float]] = []
    current_cluster = [all_lefts[0]]
    for left in all_lefts[1:]:
        if left - current_cluster[-1] <= bin_width:
            current_cluster.append(left)
        else:
            clusters.append(current_cluster)
            current_cluster = [left]
    clusters.append(current_cluster)

    # REV-5: use min(cluster) instead of centroid → left-edge-aligned anchors.
    # For homogeneous clusters (all same left) min == centroid. For slight OCR
    # left-edge variation, min aligns to the column's true left boundary.
    cluster_mins = [min(c) for c in clusters]

    # Pass 2 — merge clusters whose gap < _MIN_INTER_COLUMN_GAP_PX.
    # This is the core MD-EXTRACT-8 fix: column gap is now a fixed physical constant
    # (80px at 200 DPI = 1cm whitespace) rather than a function of median token width.
    # On income statement pages: old col_gap=250.5px absorbed Val-A (225px from code);
    # new 80px threshold keeps all 10 fine clusters, producing correct value anchors.
    merged: List[float] = [cluster_mins[0]]
    for anchor in cluster_mins[1:]:
        if anchor - merged[-1] > _MIN_INTER_COLUMN_GAP_PX:
            merged.append(anchor)
        # else: within same column group — absorbed under merged[-1]

    return merged


def _assign_tokens_to_columns(
    number_tokens: List[Dict],
    col_anchors: List[float],
    median_word_width: float,
) -> List[List[Dict]]:
    """
    Step C7 — Assign each NUMBER token to its nearest x-column-anchor.

    Pure function: no I/O, no Tesseract, no DB.

    For each token, compute argmin(|token.left - anchor|) across all col_anchors.
    Tokens whose nearest-anchor distance exceeds _COL_ASSIGN_MAX_DIST_FACTOR × median_word_width
    are noise tokens far from any column — excluded from the grid entirely.

    This step makes NO comparison of top (y) values across columns. The entire row
    assignment is deferred to within-column ordinal ranking (Step C8).

    AC-0: geometry only — ZERO BCTC-specific string literals.

    Args:
        number_tokens:     List of number-token word dicts (from _classify_tokens).
        col_anchors:       Sorted column anchor x-positions (from _detect_column_anchors_from_tokens).
        median_word_width: Median word width (pixels) — used for noise-distance gate.

    Returns:
        col_buckets: List[List[Dict]] of length len(col_anchors).
        col_buckets[c] contains all tokens assigned to column c, in original order.
    """
    n_cols = len(col_anchors)
    col_buckets: List[List[Dict]] = [[] for _ in range(n_cols)]

    max_dist = _COL_ASSIGN_MAX_DIST_FACTOR * max(median_word_width, 1.0)

    for token in number_tokens:
        left = float(token["left"])
        # Filter by minimum confidence for ordinal path
        conf = token.get("conf", 100)
        if conf < _MIN_WORD_CONF_ORDINAL:
            continue

        distances = [abs(left - anchor) for anchor in col_anchors]
        min_dist = min(distances)
        if min_dist > max_dist:
            # Noise token: too far from any column anchor
            continue
        nearest_col = distances.index(min_dist)
        col_buckets[nearest_col].append(token)

    return col_buckets


def _insert_skip_slots(
    sorted_tokens: List[Optional[Dict]],
    ref_pitch: Optional[float] = None,
    prefer_ref_pitch: bool = False,
) -> List[Optional[Dict]]:
    """
    Step C8.5 — Detect within-column rank gaps and insert None sentinel slots.

    Pure function: no I/O, no Tesseract, no DB.

    Given a single column's token list ALREADY SORTED BY TOP (ascending), detects
    intra-column y-gaps that exceed SKIP_GAP_FACTOR × local_pitch and inserts
    ceil(gap/local_pitch)-1 None sentinels before the token following the gap.

    A None slot represents a missing physical row (genuine absent value) in that
    column. After insertion, the slot-list length equals the number of physical
    rows this column spans, with correct rank-alignment.

    Degenerate case (2 tokens, 1 delta): single delta == the skip gap itself, so
    median([delta]) = delta and threshold = 1.5 × delta. Since delta < threshold
    always, no skip would be detected. Fix: use ref_pitch when only 1 gap exists.

    Dense-multi-gap fix (REV-6, §MD-EXTRACT-7 §5): when prefer_ref_pitch=True,
    use ref_pitch as working pitch even for columns with ≥2 gaps. This prevents
    local_pitch contamination on sparse value columns (e.g. columns with 3-4 tokens
    where one delta is a large skip gap — the local median is then inflated by that
    very gap, causing the threshold to miss it). Columns with fewer tokens than
    DENSE_COL_THRESHOLD are candidates for prefer_ref_pitch=True in _build_ordinal_grid.

    AC-0: geometry only — ZERO BCTC-specific string literals.

    Args:
        sorted_tokens:    Tokens sorted by top ascending. May be None if already slots.
        ref_pitch:        Cross-column reference pitch (median of local pitches from
                          columns with ≥ 3 tokens). Used when len(sorted_tokens) < 3
                          or when prefer_ref_pitch=True.
        prefer_ref_pitch: When True, always use ref_pitch as working_pitch (overrides
                          local median). Applies to sparse columns that would otherwise
                          compute a contaminated local_pitch.

    Returns:
        List of token dicts interspersed with None sentinels. Same token objects,
        original dicts not modified.
    """
    # Filter out any Nones passed in (should not happen but be defensive)
    real_tokens = [t for t in sorted_tokens if t is not None]

    if len(real_tokens) <= 1:
        return list(real_tokens)

    # Compute consecutive top-deltas
    deltas = [
        real_tokens[i + 1]["top"] - real_tokens[i]["top"]
        for i in range(len(real_tokens) - 1)
    ]

    # Determine local_pitch
    if prefer_ref_pitch and ref_pitch is not None and ref_pitch > 0:
        # Dense-multi-gap fix: override local median with cross-column ref_pitch.
        # Used for sparse value columns (< DENSE_COL_THRESHOLD tokens) where the
        # local median of deltas is contaminated by the very skip gaps we need to detect.
        local_pitch: Optional[float] = ref_pitch
    elif len(deltas) >= 2:
        # Two or more gaps — use median of deltas as local_pitch
        sorted_deltas = sorted(deltas)
        n = len(sorted_deltas)
        mid = n // 2
        local_pitch = (
            (sorted_deltas[mid - 1] + sorted_deltas[mid]) / 2.0
            if n % 2 == 0
            else float(sorted_deltas[mid])
        )
    elif ref_pitch is not None and ref_pitch > 0:
        # Only 1 gap: use cross-column reference pitch instead of contaminated local
        local_pitch = ref_pitch
    else:
        # Cannot determine pitch — no skip insertion possible
        return list(real_tokens)

    if not local_pitch or local_pitch <= 0:
        return list(real_tokens)

    threshold = SKIP_GAP_FACTOR * local_pitch

    slots: List[Optional[Dict]] = [real_tokens[0]]
    for i, delta in enumerate(deltas):
        if delta > threshold:
            n_empty = math.ceil(delta / local_pitch) - 1
            slots.extend([None] * n_empty)
        slots.append(real_tokens[i + 1])

    return slots


def _build_ordinal_grid(
    col_buckets: List[List[Dict]],
    n_cols: int,
) -> tuple:
    """
    Steps C8+C8.5+C9+C10 — Build 2D grid via ordinal rank-alignment.

    Pure function: no I/O, no Tesseract, no DB.

    Algorithm:
      C8:   Sort each col_bucket by top (ascending) — ordinal rank within column.
      C8.5: Compute ref_pitch = median(local_pitch_c for cols with ≥3 tokens).
            Call _insert_skip_slots(col_bucket, ref_pitch) per column.
            If NO column has ≥3 tokens → ref_pitch unavailable → pure-ordinal
            (no skip insertion), log WARNING.
      C9:   total_rows = max(len(col_slots[c]) for all c).
      C10:  grid[rank][col] = token['text'].strip() or " " for None slots.
            Multiple tokens with same (rank, col): space-join left-sorted.

    col_y_medians[rank] = median(top of non-None tokens at rank across all columns).
    Used by _attach_labels_ordinal for y-band label attachment.

    AC-0: geometry only — ZERO BCTC-specific string literals.

    Args:
        col_buckets: List[List[Dict]] — one list per column (from _assign_tokens_to_columns).
        n_cols:      Number of columns (= len(col_buckets)).

    Returns:
        (grid, col_y_medians) where:
          grid: List[List[str]] — grid[rank][col] = cell text.
          col_y_medians: List[float] — representative y for each rank.
    """
    if n_cols == 0 or not col_buckets:
        return ([], [])

    # C8: sort each column by top
    sorted_cols: List[List[Dict]] = [
        sorted(col, key=lambda w: w["top"]) for col in col_buckets
    ]

    # C8.5: compute ref_pitch from columns with ≥3 tokens
    local_pitches: List[float] = []
    for col in sorted_cols:
        if len(col) >= 3:
            deltas = [col[i + 1]["top"] - col[i]["top"] for i in range(len(col) - 1)]
            sorted_d = sorted(deltas)
            nd = len(sorted_d)
            mid = nd // 2
            lp = (
                (sorted_d[mid - 1] + sorted_d[mid]) / 2.0
                if nd % 2 == 0
                else float(sorted_d[mid])
            )
            if lp > 0:
                local_pitches.append(lp)

    if local_pitches:
        sorted_lp = sorted(local_pitches)
        n = len(sorted_lp)
        mid = n // 2
        ref_pitch: Optional[float] = (
            (sorted_lp[mid - 1] + sorted_lp[mid]) / 2.0
            if n % 2 == 0
            else float(sorted_lp[mid])
        )
    else:
        ref_pitch = None
        logger.warning(
            "_build_ordinal_grid: no column has ≥3 tokens — ref_pitch unavailable, "
            "using pure-ordinal (no skip insertion). "
            "Mid-column empty cells may misalign (R-MEDIUM per brief §10)."
        )

    # C8.5 (continued): insert skip slots per column.
    # Dense-multi-gap fix (REV-6): for sparse columns (< DENSE_COL_THRESHOLD tokens),
    # prefer the cross-column ref_pitch over the column's own contaminated local pitch.
    # This prevents skip-insertion failures when a column's local_pitch is inflated
    # by the very large gaps we need to detect as missing rows.
    col_slots: List[List[Optional[Dict]]] = []
    for col in sorted_cols:
        prefer = (ref_pitch is not None and ref_pitch > 0 and
                  len(col) < DENSE_COL_THRESHOLD)
        col_slots.append(_insert_skip_slots(col, ref_pitch, prefer_ref_pitch=prefer))

    # C9: total rows
    if not col_slots:
        return ([], [])
    total_rows = max(len(slots) for slots in col_slots)
    if total_rows == 0:
        return ([], [])

    # C10: build grid — grid[rank][col]
    grid: List[List[str]] = [[" "] * n_cols for _ in range(total_rows)]

    # col_y_tops[rank] accumulates tops of non-None tokens for y_median computation
    col_y_tops: List[List[float]] = [[] for _ in range(total_rows)]

    for col_idx, slots in enumerate(col_slots):
        for rank, slot in enumerate(slots):
            if rank >= total_rows:
                break
            if slot is not None:
                text = slot.get("text", "").strip()
                if grid[rank][col_idx] == " ":
                    grid[rank][col_idx] = text if text else " "
                else:
                    # Multiple tokens in same (rank, col): space-join left-sorted
                    existing = grid[rank][col_idx]
                    # Re-join by left position: put new token in order
                    existing_left = 0  # approximate — keep as-is for multi-token
                    new_left = float(slot.get("left", 0))
                    if new_left < existing_left:
                        grid[rank][col_idx] = (text + " " + existing).strip()
                    else:
                        grid[rank][col_idx] = (existing + " " + text).strip()
                col_y_tops[rank].append(float(slot["top"]))

    # Compute col_y_medians per rank
    col_y_medians: List[float] = []
    for rank in range(total_rows):
        tops = col_y_tops[rank]
        if tops:
            sorted_t = sorted(tops)
            n = len(sorted_t)
            mid = n // 2
            med = (
                (sorted_t[mid - 1] + sorted_t[mid]) / 2.0
                if n % 2 == 0
                else float(sorted_t[mid])
            )
            col_y_medians.append(med)
        else:
            col_y_medians.append(0.0)

    return (grid, col_y_medians)


def _attach_labels_ordinal(
    grid: List[List[str]],
    col_y_medians: List[float],
    text_tokens: List[Dict],
    h_med: float,
) -> List[List[str]]:
    """
    Step C11 — Attach labels to each ordinal row using y-median band matching.

    Pure function: no I/O, no Tesseract, no DB.

    For each ordinal row k:
      1. y_med_k = col_y_medians[k] (median top of rank-k tokens across columns).
      2. Find TEXT tokens where abs(token.top - y_med_k) <= LABEL_BAND_FACTOR × h_med.
      3. Sort matched TEXT tokens by left, space-join → label_k.
      4. Fallback: if no match in primary band, use nearest TEXT token within 2.5×h_med.
      5. Prepend label_k as column 0: grid[k] = [label_k] + grid[k].
      6. Greedy removal: once a TEXT token is used for row k, remove it from the
         candidate pool for row k+1 (prevents same label appearing on adjacent rows).

    AC-0: LABEL_BAND_FACTOR is a generic geometry constant.

    Args:
        grid:           2D grid from _build_ordinal_grid (no label column yet).
        col_y_medians:  Representative y per rank (from _build_ordinal_grid).
        text_tokens:    All TEXT tokens on the page (from _classify_tokens).
        h_med:          Median word height (pixels) from number tokens.

    Returns:
        Grid with label prepended as column 0 (same number of rows, one more column).
    """
    if not grid:
        return grid

    # Work on a mutable copy of the text token pool
    available_text: List[Dict] = list(text_tokens)

    result: List[List[str]] = []
    for rank, row in enumerate(grid):
        y_med = col_y_medians[rank] if rank < len(col_y_medians) else 0.0

        if y_med <= 0.0 or not available_text:
            result.append([" "] + list(row))
            continue

        # Primary band: TEXT tokens within LABEL_BAND_FACTOR × h_med of y_med
        primary = [
            t for t in available_text
            if abs(t["top"] - y_med) <= LABEL_BAND_FACTOR * h_med
        ]

        if not primary:
            # Fallback: nearest within 2.5 × h_med
            sorted_by_dist = sorted(available_text, key=lambda t: abs(t["top"] - y_med))
            if sorted_by_dist and abs(sorted_by_dist[0]["top"] - y_med) <= 2.5 * h_med:
                primary = [sorted_by_dist[0]]

        if primary:
            # Sort by left and join
            label = " ".join(
                t["text"] for t in sorted(primary, key=lambda t: t["left"])
            ).strip()
            # Remove used tokens (greedy: prevents re-use on adjacent rows)
            used_ids = {id(t) for t in primary}
            available_text = [t for t in available_text if id(t) not in used_ids]
        else:
            label = " "

        result.append([label] + list(row))

    return result


def _cluster_text_into_label_lines(
    text_tokens: List[Dict],
    label_line_gap_px: int = _LABEL_LINE_GAP_PX,
) -> List[List[Dict]]:
    """
    Step C10.5 — Cluster text tokens into physical label lines.

    Sorts tokens by (top, left) and greedily groups them: when the gap between
    the current token's top and the previous token's top in the current line
    exceeds label_line_gap_px, a new line is started.

    Robustness (FLAG-D): compares each new token's top against the running
    minimum top of the current line (first-token anchor) rather than the
    previous token, to handle OCR baseline slope without false splits.
    Within a physical print line, all token tops stay within ≤8px of each
    other (200-DPI intra-line variance). Inter-line gaps are 33-38px on
    dense A4 financial statements at 200 DPI — far above the 15px threshold.

    AC-0: uses ONLY top/left coordinates and the generic label_line_gap_px
    threshold. Zero BCTC string constants, zero label string matching.
    Pure function: no I/O, no Tesseract, no DB.

    Args:
        text_tokens:       List of text-token word dicts with 'top' and 'left'.
        label_line_gap_px: Vertical gap threshold (pixels) to start a new line.
                           Default: _LABEL_LINE_GAP_PX (= 15px at 200 DPI).

    Returns:
        List of label lines; each line is a list of token dicts sorted by left.
    """
    if not text_tokens:
        return []

    # Sort all tokens by (top, left) so we scan in reading order
    sorted_tokens = sorted(text_tokens, key=lambda t: (t["top"], t["left"]))

    label_lines: List[List[Dict]] = []
    current_line: List[Dict] = [sorted_tokens[0]]
    current_line_min_top: int = sorted_tokens[0]["top"]

    for tok in sorted_tokens[1:]:
        gap = tok["top"] - current_line_min_top
        if gap <= label_line_gap_px:
            current_line.append(tok)
            # Update running min so a drifting baseline does not chain-merge lines
            current_line_min_top = min(current_line_min_top, tok["top"])
        else:
            # Flush completed line (left-sorted)
            label_lines.append(sorted(current_line, key=lambda t: t["left"]))
            current_line = [tok]
            current_line_min_top = tok["top"]

    # Flush last line
    if current_line:
        label_lines.append(sorted(current_line, key=lambda t: t["left"]))

    return label_lines


def _exclude_pre_data_label_lines(
    label_lines: List[List[Dict]],
    label_line_ymeds: List[float],
    first_value_top: float,
    margin_px: int = _LABEL_HEADER_MARGIN_PX,
) -> tuple:
    """
    Step C10.6 — Remove label lines in the column-header zone above the data region.

    Any label line whose y-median falls below (first_value_top - margin_px) is a
    column-header text fragment (e.g., date band, note-number header) and must not
    be paired with a data row.

    The margin_px (default 20px) is strictly less than the inter-row pitch on dense
    A4 financial statements (36px at 200 DPI), guaranteeing that no actual data label
    line is excluded.

    AC-0: uses ONLY top coordinates (first_value_top from number-token scan) and the
    generic margin_px geometry constant. Zero BCTC string constants.
    Pure function: no I/O, no Tesseract, no DB.

    Args:
        label_lines:        List of label lines from _cluster_text_into_label_lines.
        label_line_ymeds:   Parallel list of y-medians for each label line.
        first_value_top:    Top coordinate of the first value-bearing number token.
        margin_px:          Grace margin above first_value_top for the cutoff.

    Returns:
        (data_label_lines, data_label_ymeds) — header-stripped parallel lists.
    """
    cutoff = first_value_top - margin_px
    data_label_lines: List[List[Dict]] = []
    data_label_ymeds: List[float] = []
    for line, ymed in zip(label_lines, label_line_ymeds):
        if ymed >= cutoff:
            data_label_lines.append(line)
            data_label_ymeds.append(ymed)
    return data_label_lines, data_label_ymeds


def _attach_labels_by_rank(
    grid: List[List[str]],
    data_label_lines: List[List[Dict]],
    code_note_tokens: List[Dict],
    h_med: float,
) -> List[List[str]]:
    """
    Step C10.7 — Attach labels to ordinal rows by direct index (rank-based pairing).

    Pairs data_label_lines[k] with grid[k] by rank index — NO y-distance comparison.
    This eliminates the band-over-reach defect in _attach_labels_ordinal (which used
    a 27px scalar band that spans 1.5× the 36px label-line pitch, merging adjacent
    label lines into a single cell).

    Label construction for rank k:
      1. Sort data_label_lines[k] by left, space-join → base label text.
      2. Append any code_note_tokens whose top is within _LABEL_LINE_GAP_PX * 2
         of the label line's y-median (per-rank code re-attachment, replacing the
         global label_pool injection at C11).
      3. Sort merged token set by left, space-join.

    Count-mismatch handling:
      - len(data_label_lines) < len(grid): trailing value rows get label = " ".
      - len(data_label_lines) > len(grid): extra label lines are emitted as
        empty-value rows (one extra row per orphan label line).

    AC-0: uses ONLY top/left coordinates and _LABEL_LINE_GAP_PX geometry constant.
    Zero BCTC string constants.
    Pure function: no I/O, no Tesseract, no DB.

    Args:
        grid:              2D grid from _build_ordinal_grid (no label column yet).
        data_label_lines:  Header-stripped label lines from _exclude_pre_data_label_lines.
        code_note_tokens:  Tokens from pure-code columns (re-attached as label companions).
        h_med:             Median word height (pixels) — kept for API symmetry.

    Returns:
        Grid with label prepended as column 0.  May have additional rows if
        len(data_label_lines) > len(grid).
    """
    if not grid and not data_label_lines:
        return grid

    n_value_rows = len(grid)
    n_label_lines = len(data_label_lines)
    result: List[List[str]] = []

    # Pair value rows with label lines (up to the minimum of the two counts)
    for rank in range(max(n_value_rows, n_label_lines)):
        value_row = grid[rank] if rank < n_value_rows else None
        label_line = data_label_lines[rank] if rank < n_label_lines else None

        if label_line is None:
            # Extra value rows beyond label line count → empty label
            label = " "
        else:
            # Compute y-median of this label line for code_note_tokens attachment
            tops = [t["top"] for t in label_line]
            y_med_label = float(sum(tops)) / len(tops) if tops else 0.0

            # Merge label line tokens with nearby code_note_tokens
            nearby_codes = [
                t for t in code_note_tokens
                if abs(t["top"] - y_med_label) <= _LABEL_LINE_GAP_PX * 2
            ]
            merged_tokens = label_line + nearby_codes
            label = " ".join(
                t["text"] for t in sorted(merged_tokens, key=lambda t: t["left"])
            ).strip() or " "

        if value_row is not None:
            result.append([label] + list(value_row))
        else:
            # Extra label lines beyond value row count → empty-value row
            n_cols = len(grid[0]) if grid else 0
            result.append([label] + [" "] * n_cols)

    return result


def _find_first_value_row_top(number_tokens: List[Dict]) -> float:
    """
    Return the `top` coordinate of the first token (lowest top value) that
    matches _VALUE_TOKEN_RE (a money-group / multi-digit number).

    Used as a positional cutoff: tokens with top < this value are in the
    column-header / page-section zone above the first data row and must be
    excluded from anchor detection and ordinal grid construction.

    If no value token is found (page has only code tokens), returns 0.0
    (no cutoff — all tokens pass). This is the safe fallback.

    AC-0: purely geometric (top coordinate comparison). Zero BCTC-specific
    string constants. Does not use label text or table-type knowledge.

    Pure function: no I/O, no Tesseract, no DB.

    Args:
        number_tokens: List of number-token word dicts (from _classify_tokens).

    Returns:
        Minimum top coordinate among VALUE-class tokens, or 0.0 if none.
    """
    value_tops = [
        float(w["top"]) for w in number_tokens
        if _VALUE_TOKEN_RE.match(w["text"].strip())
    ]
    return min(value_tops) if value_tops else 0.0


def _exclude_header_tokens(
    number_tokens: List[Dict],
    first_value_top: float,
) -> List[Dict]:
    """
    Exclude number tokens whose top coordinate is strictly less than
    first_value_top. These tokens are in the column-header / page-section
    zone above the first data row.

    AC-0: top-coordinate comparison only. No label string matching.
    Zero Tesseract calls. Pure in-memory filter.

    Args:
        number_tokens:    List of number-token word dicts.
        first_value_top:  Cutoff top coordinate (from _find_first_value_row_top).

    Returns:
        Filtered list. If first_value_top <= 0.0, returns unchanged (safe fallback).
    """
    if first_value_top <= 0.0:
        return number_tokens  # safe fallback: no cutoff
    return [w for w in number_tokens if float(w["top"]) >= first_value_top]


def _identify_pure_code_columns(
    col_buckets: List[List[Dict]],
    col_anchors: List[float],
) -> tuple:
    """
    Classifies each column bucket as pure-code or value.

    A bucket is pure-code if:
        (code_count / total_count >= PURE_CODE_COL_THRESHOLD) AND (value_count == 0)

    Returns:
        (code_col_indices, value_col_indices) — two lists of column indices.

    Non-regression proof for segment report: all segment buckets have value_count > 0
    → the condition value_count == 0 is FALSE for every bucket → code_col_indices = []
    → Step C7.5 takes the ELSE branch → pipeline IDENTICAL to MD-EXTRACT-6.

    AC-0: uses _CODE_TOKEN_RE and _VALUE_TOKEN_RE (generic numeric patterns).
    Zero BCTC-specific string constants. Pure function — no I/O, no Tesseract.

    Args:
        col_buckets:  List of token buckets (one per column, from _assign_tokens_to_columns).
        col_anchors:  Column anchor x-positions (same length as col_buckets).

    Returns:
        (code_col_indices, value_col_indices) — indices into col_buckets.
    """
    code_col_indices: List[int] = []
    value_col_indices: List[int] = []
    for i, bucket in enumerate(col_buckets):
        if not bucket:
            value_col_indices.append(i)
            continue
        code_count = sum(
            1 for w in bucket if _CODE_TOKEN_RE.match(w["text"].strip())
        )
        value_count = sum(
            1 for w in bucket if _VALUE_TOKEN_RE.match(w["text"].strip())
        )
        total_count = len(bucket)
        if value_count == 0 and (code_count / total_count) >= PURE_CODE_COL_THRESHOLD:
            code_col_indices.append(i)
        else:
            value_col_indices.append(i)
    return code_col_indices, value_col_indices


def _detect_table_regions(words: List[Dict], h_med: float) -> List[List[Dict]]:
    """
    Step B — Table boundary detection.

    Split the page's word list into one or more table regions by detecting
    large vertical gaps (≥ 2.5 × H_med) between adjacent words.

    Each region that contains at least two numeric-like tokens is retained as
    a table candidate. If no significant gap is found, the entire word set is
    treated as one region (the full page minus any preamble detected by this
    function naturally via word ordering).

    Args:
        words: All filtered words on the page, sorted by top coordinate.
        h_med: Median word height across the page.

    Returns:
        List of word groups, each group being a list of word dicts.
        Typically 1 group per page; may be 2+ on multi-table pages.
    """
    if not words:
        return []

    gap_threshold = _SECTION_GAP_FACTOR * h_med if h_med > 0 else 20.0

    # Compute vertical gaps between adjacent words (sorted by top)
    sorted_words = sorted(words, key=lambda w: w["top"])
    regions: List[List[Dict]] = []
    current_region: List[Dict] = [sorted_words[0]]

    for i in range(1, len(sorted_words)):
        prev = sorted_words[i - 1]
        curr = sorted_words[i]
        gap = curr["top"] - (prev["top"] + prev["height"])
        if gap > gap_threshold:
            # Section break — check if current region has enough numeric tokens
            regions.append(current_region)
            current_region = [curr]
        else:
            current_region.append(curr)

    regions.append(current_region)

    # Filter: keep only regions that contain ≥2 numeric-like tokens
    # (avoids treating preamble-only header blocks as tables).
    table_regions: List[List[Dict]] = []
    for region in regions:
        num_count = sum(1 for w in region if _NUMERIC_RE.search(w["text"]))
        if num_count >= 2:
            table_regions.append(region)

    # Fallback: if no region has ≥2 numeric tokens, treat the whole page as one region
    if not table_regions:
        table_regions = [sorted_words]

    return table_regions

