"""
infrastructure/generic_md_table_extractor.py — MD-EXTRACT-9

GenericMdTableExtractor: number-token-2D generic table detector + markdown emitter.

Implements GenericMdTableExtractorPort (domain/modules/financial_reports/ports.py).

Algorithm (per-page) — MD-EXTRACT-6 COLUMN-ANCHOR-FIRST ORDINAL RECONSTRUCTION:
    Step A — Collect per-word bboxes via pytesseract.image_to_data (TSV/DICT mode).
    Step A2 — Classify tokens: NUMBER tokens (digits/money-groups) vs TEXT tokens (labels).
    Step B — Detect table regions on NUMBER tokens only (≥4 number tokens).
    Step C6 — Detect column anchors from NUMBER token x-positions
              (reuse existing _detect_column_anchors_from_tokens).
    Step C7 — Assign each NUMBER token to its nearest x-column-anchor by argmin
              (_assign_tokens_to_columns). No y-comparison at all.
    Step C8 — Within each column, sort tokens by top (ascending) → ordinal rank.
    Step C8.5 — Within each column, detect intra-column rank gaps and insert None
                sentinel slots so physical row positions align across columns
                (_insert_skip_slots + ref_pitch from columns with ≥3 tokens).
    Step C9 — total_rows = max slot-list length across all columns.
    Step C10 — Reconstruct 2D grid: grid[rank][col] = token text, None→" ".
    Step C10.5 — Cluster text tokens into physical label lines by top-gap threshold
                 (_cluster_text_into_label_lines, gap=15px).
    Step C10.6 — Exclude column-header label lines above first_value_top - 20px
                 (_exclude_pre_data_label_lines).
    Step C10.7 — Ordinal-rank label assignment: data_label_lines[k] ↔ grid[k] by
                 direct index, no y-comparison (_attach_labels_by_rank).
    Step G — Post-processing: strip_header_bands → coalesce_labels → collapse_empty
             → density gate → header detection → markdown emission.
             Separator row: valid GFM |---|---|---| (D2 fix, kept from MD-EXTRACT-5).

Why MD-EXTRACT-1/2/3/4/5 all failed (SCALAR-Y-TOLERANCE EXHAUSTED):
    All five prior attempts compared token top-values across columns to assign rows.
    On wide BCTC tables, OCR skew causes baseline drift of ~4px per column across
    ~300px inter-column spacing, totalling ~28px across 7 columns. The inter-row
    pitch is ~16px. Drift (28px) > gap (16px) → no y-threshold can cleanly separate
    rows for rightmost columns. The diagonal cascade is structurally inevitable.

Why MD-EXTRACT-6 defeats drift>gap (geometric guarantee):
    Within a single column (narrow x-range ~150px), scanner skew drift is at most
    0.016×150 ≈ 2.4px — well below the 20px inter-row pitch. Within-column y-ordering
    is ALWAYS correct. Ordinal rank within a column = physical row index for that column.
    Matching rank-k across all columns reconstructs row-k without any y-comparison
    across columns. Cross-column y-comparison NEVER occurs → diagonal impossible.

Dead-code notes:
    _cluster_rows and _cluster_rows_by_gap are DEAD in MD-EXTRACT-4.
    _cluster_number_rows is DEAD in MD-EXTRACT-5.
    _cluster_number_rows_adaptive, _attach_labels, _build_grid_from_number_rows
        are DEAD in MD-EXTRACT-6.
    All kept for backward compatibility with existing unit tests. DO NOT REMOVE.

OCR substrate: pytesseract.image_to_data called on PIL Image objects already
rasterized at 200 DPI by the use case (same DPI as PdfOcrAdapter.ocr_pages).
Uses --psm 6 (same as OCR adapter — no drift).

DDD layer: infrastructure (calls Tesseract subprocess, reads PIL Image — impure).
    Fence-A prohibits imports from the application or interface layers.

Privacy: self-hosted Tesseract only. Zero network traffic. Zero external API.
         Images remain in-process; no cloud VLM/OCR.

Hardware guard: callers MUST pass images ONE AT A TIME (sequential for-loop).
    Never run multiple image_to_data calls concurrently.

Reuses module-level helpers from text_table_extractor (infra-to-infra import):
    - _norm(s)                     — diacritic-insensitive normalization
    - _is_recognized_section_header(s) — section-header detection gate

AC-0 compliance: ZERO BCTC-specific constants. No code ranges, no balance-sheet
    sentinels, no per-table label keywords. Geometry and generic text patterns only.
    Grep-proof generality per Decision D — no per-table keyword constants anywhere.
"""

from __future__ import annotations

import logging
import math
import os
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

# Infra-to-infra import: reuse module-level helpers (not class methods — safe).
from infrastructure.text_table_extractor import _norm, _is_recognized_section_header

logger = logging.getLogger(__name__)

from infrastructure.generic_md_table.constants import (  # noqa: F401 (re-export parity)
    _ROW_GAP_FACTOR,
    _SAME_LINE_FACTOR,
    _ROW_PITCH_MULTIPLIER,
    _SECTION_GAP_FACTOR,
    _COL_GAP_FACTOR,
    _MIN_INTER_COLUMN_GAP_PX,
    _LEFT_EDGE_BIN_FACTOR,
    _MIN_WORD_CONF,
    _NUMERIC_RE,
    _MONEY_GROUP_RE,
    _MIN_MONEY_GROUPS,
    _CODE_LIKE_RE,
    _MIN_CODE_HITS,
    _MIN_MONEY_THIN,
    _DATE_HEADER_RE,
    _NUMBER_TOKEN_RE,
    SAME_LINE_TOL,
    _CODE_TOKEN_RE,
    _VALUE_TOKEN_RE,
    _COL_ASSIGN_MAX_DIST_FACTOR,
    SKIP_GAP_FACTOR,
    _MIN_WORD_CONF_ORDINAL,
    LABEL_BAND_FACTOR,
    PURE_CODE_COL_THRESHOLD,
    DENSE_COL_THRESHOLD,
    _LABEL_LINE_GAP_PX,
    _LABEL_HEADER_MARGIN_PX,
    _TIER0_DPI,
    _GUTTER_DARK_FRACTION,
    _INK_BBOX_MIN_FRACTION,
    _GUTTER_POSITION_TOLERANCE,
    _ROW_PITCH_CHANGE_TOLERANCE,
    _MIN_GUTTER_WIDTH_PX,
    _MIN_TEXT_COL_WIDTH_PX,
    _MAX_INTER_GUTTER_GAP_PX,
    _GUTTER_DARK_FRACTION_DENSE,
    _MIN_TEXT_COL_WIDTH_PX_50DPI,
    _GUTTER_DARK_FRACTION_50DPI,
    _HEADER_BAND_FRACTION,
    _FOOTER_BAND_FRACTION,
    _ROW_BAND_DARKNESS_THRESHOLD,
    _TABLE_PAGE_MIN_MONEY_GROUPS,
    _ACCOUNT_CODE_MIN_FOR_TABLE,
    _DATE_HEADER_MIN_FOR_TABLE,
    _ALLOW_PROSE_IN_TABLE_UNIT,
    _TABLE_MIN_GUTTER_COUNT,
    _TITLE_BAND_SCAN_LINES,
    _TITLE_BAND_MIN_LEN,
    _TITLE_BAND_MAX_LEN,
    _CONTINUATION_MARKERS,
    _BCTC_MONEY_GROUP_RE,
    MAX_TESSERACT_RETRIES,
    _TESSERACT_RETRY_SLEEP_S,
)
from infrastructure.generic_md_table.markdown_emit import (  # noqa: F401 (re-export parity)
    ocr_text_to_markdown,
    _emit_markdown_table,
)
from infrastructure.generic_md_table.grid_cleanup import (  # noqa: F401 (re-export parity)
    _median,
    _filter_words,
    _cluster_rows,
    _cluster_rows_by_gap,
    _collapse_empty_columns,
    _detect_column_anchors,
    _assign_columns,
    _detect_header_rows,
    _is_data_table,
    _strip_leading_header_bands,
    _coalesce_label_columns,
)


# ---------------------------------------------------------------------------
# MD-EXTRACT-4 — Number-token classification and clustering (pure functions)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# MD-EXTRACT-6 — Column-Anchor-First Ordinal Reconstruction (pure functions)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# MD-EXTRACT-9 — Label-Row Ordinal Reconstruction pure functions
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Internal geometry helpers
# ---------------------------------------------------------------------------






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
















# ---------------------------------------------------------------------------
# DEFECT-B: density gate helper
# ---------------------------------------------------------------------------




# ---------------------------------------------------------------------------
# DEFECT-C.1: leading header band stripper
# ---------------------------------------------------------------------------




# ---------------------------------------------------------------------------
# DEFECT-C.2: label column coalescing
# ---------------------------------------------------------------------------




# ---------------------------------------------------------------------------
# MD-EXTRACT-7-REV — Pure functions for header cutoff and code-col detection
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Public class — implements GenericMdTableExtractorPort
# ---------------------------------------------------------------------------


class GenericMdTableExtractor:
    """
    Generic bbox-based markdown table detector (infrastructure adapter).

    Implements GenericMdTableExtractorPort.

    Receives page images (as file paths to 200-DPI PNGs) and optional flat OCR text.
    Returns per-document markdown tables and an OCR-as-markdown string.

    DDD: infrastructure layer — runs Tesseract subprocess, reads PIL Images.
    Fence-A: no imports from the application or interface layers.

    Privacy: self-hosted Tesseract only. No cloud OCR. No external API.

    Hardware: call extract_md_tables() from a sequential for-loop only.
    NEVER run in parallel — each image_to_data call consumes ~300MB RSS.
    """

    def extract_md_tables(
        self,
        page_image_paths: List[str],
        doc_ocr_text: Optional[str] = None,
    ) -> Dict:
        """
        Run generic table detection on the supplied page image files.

        For each page image:
          1. Call pytesseract.image_to_data (TSV mode) to collect per-word bboxes.
          2. Run Steps B-G to detect tables and emit markdown pipe-tables.
          3. Apply prose-page post-filter (col_count==1 and row_count>15 → skip).

        The doc_ocr_text (if provided) is converted to readable markdown by
        ocr_text_to_markdown() — NO re-OCR needed for that path.

        Args:
            page_image_paths: Absolute paths to 200-DPI page PNG files.
            doc_ocr_text:     Optional flat OCR text from pdf_extracted_text.

        Returns:
            {
                "md_tables":      List[str],  # one markdown pipe-table per detected region
                "ocr_as_markdown": str,       # doc_ocr_text rendered as markdown
                "table_count":    int,        # number of tables detected
            }
        """
        try:
            import pytesseract  # type: ignore
            from pytesseract import Output  # type: ignore
            from PIL import Image  # type: ignore
        except ImportError as exc:
            logger.error(
                "GenericMdTableExtractor: missing dependency %s — returning empty result", exc
            )
            return {"md_tables": [], "ocr_as_markdown": "", "table_count": 0}

        all_md_tables: List[str] = []

        for img_path in page_image_paths:
            try:
                page_image = Image.open(img_path)
                page_tables = self._process_page(page_image, pytesseract, Output)
                all_md_tables.extend(page_tables)
                # Explicitly release PIL Image reference (R-MEDIUM mitigation)
                page_image.close()
                del page_image
            except Exception as exc:
                logger.warning(
                    "GenericMdTableExtractor: failed to process page %s: %s — skipping",
                    img_path,
                    exc,
                )

        ocr_as_md = ocr_text_to_markdown(doc_ocr_text or "")

        return {
            "md_tables": all_md_tables,
            "ocr_as_markdown": ocr_as_md,
            "table_count": len(all_md_tables),
        }

    def _process_page(self, page_image: object, pytesseract: object, Output: object) -> List[str]:
        """
        Process one page image and return a list of markdown pipe-table strings.

        MD-EXTRACT-6 COLUMN-ANCHOR-FIRST ORDINAL RECONSTRUCTION:
        Step A (image_to_data), A2 (classify tokens), B (detect_table_regions) UNCHANGED.
        Steps C-F REPLACED by C6→C7→C8→C8.5→C9→C10→C11 (ordinal approach).
        Step G post-processing pipeline UNCHANGED.

        The ordinal approach defeats drift>gap by eliminating cross-column y-comparison:
        each token is first assigned to a column by x-argmin, then ranked within that
        column by top (ascending). Rank-k across all columns = physical row k.
        The diagonal cascade is geometrically impossible — within-column y-ordering
        is always correct regardless of inter-column skew.

        Each detected table region on the page produces one entry.
        """
        # Step A — Collect per-word bboxes via image_to_data (TSV mode)
        try:
            data = pytesseract.image_to_data(  # type: ignore[attr-defined]
                page_image,
                lang="vie+eng",
                config="--psm 6",
                output_type=Output.DICT,  # type: ignore[attr-defined]
            )
        except Exception as exc:
            logger.warning(
                "GenericMdTableExtractor._process_page: image_to_data failed: %s — skipping",
                exc,
            )
            return []

        words = _filter_words(data)
        if not words:
            return []

        # Step A2 — Classify tokens into NUMBER tokens and TEXT tokens.
        # NUMBER tokens: money-group format + 2-3 digit standalone codes.
        # TEXT tokens: everything else (labels, headers, units, prose).
        number_tokens, text_tokens = _classify_tokens(words)

        if not number_tokens:
            logger.debug(
                "GenericMdTableExtractor: no number tokens on page — skipping"
            )
            return []

        # Compute median word height and width from NUMBER tokens only (clean baselines).
        num_heights = [float(w["height"]) for w in number_tokens if w["height"] > 0]
        num_widths = [float(w["width"]) for w in number_tokens if w["width"] > 0]
        h_med = _median(num_heights) if num_heights else 12.0
        median_word_width = _median(num_widths) if num_widths else 40.0

        if h_med <= 0:
            return []

        # Step B — Detect table regions on NUMBER tokens only.
        table_regions = _detect_table_regions(number_tokens, h_med)
        if not table_regions:
            return []

        page_tables: List[str] = []

        for region_num_tokens in table_regions:
            # Find TEXT tokens within the region's vertical extent (± h_med margin).
            region_top = min(w["top"] for w in region_num_tokens)
            region_bot = max(w["top"] + w["height"] for w in region_num_tokens)
            region_text_tokens = [
                t for t in text_tokens
                if (region_top - h_med) <= t["top"] <= (region_bot + h_med)
            ]

            # Step C5 (REV-3) — Header/date token exclusion.
            # Exclude number tokens above the first value-bearing row. These are
            # column-header date band and page-section number tokens that contaminate
            # anchor detection and produce phantom top grid rows.
            # AC-0: uses _VALUE_TOKEN_RE (generic money-group pattern) + top coordinate.
            first_value_top = _find_first_value_row_top(region_num_tokens)
            clean_number_tokens = _exclude_header_tokens(region_num_tokens, first_value_top)

            if not clean_number_tokens:
                # Fallback: all tokens were header tokens → use original set
                clean_number_tokens = region_num_tokens

            # Step C6 — Column anchor detection from CLEAN NUMBER token x-positions.
            # min(cluster) metric (REV-5): aligns anchors to true column left-edges.
            col_anchors = _detect_column_anchors_from_tokens(
                clean_number_tokens, median_word_width
            )
            n_cols = len(col_anchors)
            if n_cols == 0:
                continue

            # Guard: too few number tokens to build a meaningful grid
            if len(clean_number_tokens) < 4:
                continue

            # Step C7 — Assign each CLEAN NUMBER token to nearest x-column-anchor.
            # NO y-comparison. The entire row assignment is deferred to ordinal ranking.
            col_buckets = _assign_tokens_to_columns(
                clean_number_tokens, col_anchors, median_word_width
            )

            # Guard: all tokens filtered as noise → no grid possible
            if not any(col_buckets):
                continue

            # Step C7.5 (REV-4) — Pure-code-column detection.
            # Identify column buckets that are pure-code (no value tokens) and split.
            # code_note_tokens: re-attached to text pool before C11 as label companions.
            # value_col_buckets + value_anchors: continue the ordinal pipeline.
            # ELSE branch (no pure-code columns): pipeline IDENTICAL to MD-EXTRACT-6.
            code_col_indices, value_col_indices = _identify_pure_code_columns(
                col_buckets, col_anchors
            )

            if code_col_indices:
                # Income-statement path: 2 pure-code columns detected.
                code_note_tokens = [
                    t for i in code_col_indices for t in col_buckets[i]
                ]
                value_col_buckets = [col_buckets[i] for i in value_col_indices]
                value_anchors = [col_anchors[i] for i in value_col_indices]
            else:
                # Segment-report / balance-sheet path: no pure-code columns.
                # Pipeline is IDENTICAL to MD-EXTRACT-6 (ELSE branch).
                code_note_tokens = []
                value_col_buckets = col_buckets
                value_anchors = col_anchors

            if not value_col_buckets or not any(value_col_buckets):
                continue

            n_value_cols = len(value_col_buckets)

            # Steps C8+C8.5+C9+C10 — Build 2D grid via ordinal rank-alignment.
            # Handles mid/trailing empty cells via within-column gap detection.
            # Dense-multi-gap fix (REV-6): prefer_ref_pitch=True for sparse columns.
            grid, col_y_medians = _build_ordinal_grid(value_col_buckets, n_value_cols)
            if not grid:
                continue

            # Step C10.5 (MD-EXTRACT-9) — Cluster text tokens into physical label lines.
            # Greedy line grouping by top-gap threshold (15px). Sorts by (top, left).
            # Result: each entry is one physical print line (left-sorted token list).
            all_label_lines = _cluster_text_into_label_lines(region_text_tokens)

            # Compute y-median for each label line (used by C10.6 header exclusion).
            label_line_ymeds: List[float] = []
            for line in all_label_lines:
                tops = [t["top"] for t in line]
                n = len(tops)
                if n == 0:
                    label_line_ymeds.append(0.0)
                else:
                    sorted_tops = sorted(tops)
                    mid = n // 2
                    ymed = (
                        (sorted_tops[mid - 1] + sorted_tops[mid]) / 2.0
                        if n % 2 == 0
                        else float(sorted_tops[mid])
                    )
                    label_line_ymeds.append(ymed)

            # Step C10.6 (MD-EXTRACT-9) — Exclude column-header label lines.
            # Drops label lines whose y-median falls below first_value_top - margin.
            # first_value_top already computed at Step C5 (line ~2084, in scope).
            data_label_lines, _data_ymeds = _exclude_pre_data_label_lines(
                all_label_lines, label_line_ymeds, first_value_top
            )

            # Step C10.7 / C11 (MD-EXTRACT-9) — Ordinal-rank label assignment.
            # Replaces the scalar-band _attach_labels_ordinal for this call site.
            # data_label_lines[k] pairs with grid[k] by direct index — no y-comparison.
            # code_note_tokens are re-attached per-rank (within 30px of label y-median).
            grid = _attach_labels_by_rank(grid, data_label_lines, code_note_tokens, h_med)
            if not grid:
                continue

            # Post-processing pipeline (Steps G — substrate-agnostic, UNCHANGED):
            # Strip leading letterhead/noise rows above first money-group or date row.
            grid = _strip_leading_header_bands(grid)
            if not grid:
                logger.debug(
                    "GenericMdTableExtractor: grid empty after header strip — skipping"
                )
                continue

            # Merge text-only leading columns into single label column.
            grid = _coalesce_label_columns(grid)

            # Drop columns blank across ALL rows (sparse anchor artefacts).
            grid = _collapse_empty_columns(grid)

            n_rows = len(grid)
            n_cols_grid = len(grid[0]) if grid else 0

            # Density gate: reject prose/letterhead regions with < K money-groups.
            if not _is_data_table(grid):
                logger.debug(
                    "GenericMdTableExtractor: density gate rejected region (ordinal path): "
                    "rows=%d cols=%d — treating as non-table prose",
                    n_rows,
                    n_cols_grid,
                )
                continue

            # Header row detection.
            n_header_rows = _detect_header_rows(grid)
            if n_header_rows == 0:
                continue

            # Markdown pipe-table emission.
            md_table = _emit_markdown_table(grid, n_header_rows)
            if md_table:
                page_tables.append(md_table)
                logger.debug(
                    "GenericMdTableExtractor: emitted table (MD-EXTRACT-6 ordinal path): "
                    "%d rows × %d cols (money_groups=%d)",
                    n_rows,
                    n_cols_grid,
                    len(_MONEY_GROUP_RE.findall(" ".join(c for r in grid for c in r))),
                )

        return page_tables


# =============================================================================
# LF-EXTRACT — Tier 0/1/2 infrastructure functions (layout-first pipeline)
#
# These are module-level functions injected into ExtractLayoutFirstUseCase via
# the composition root. They live in the infrastructure layer because they use
# PIL, Tesseract, and pdf2image (impure I/O).
#
# AC-0 compliance: ZERO BCTC semantic strings in any zone-boundary or column-grid
#     decision path. Geometry is the sole spine. Unit hints are metadata only.
#
# AC-LFE-6: Tesseract (image_to_data) is called ONLY in ocr_unit() (Tier 2).
#     build_document_map() uses only PIL pixel ops + stored OCR text — no Tesseract.
#     zone_page() uses only PIL pixel ops — no Tesseract.
# =============================================================================



def _tesseract_image_to_data(
    page_img: Any,
    lang: str,
    config: str,
) -> Dict:
    """
    Module-level wrapper around pytesseract.image_to_data with retry logic.

    Retries up to MAX_TESSERACT_RETRIES times on any exception (including
    SIGTERM signal -15 which appears as RuntimeError/TesseractError).

    Exposed at module level so tests can patch it without injecting pytesseract
    as a dependency.  ocr_unit() calls this wrapper instead of calling
    pytesseract directly.

    Args:
        page_img: PIL Image to OCR.
        lang:     Tesseract language string (e.g. "vie+eng").
        config:   Tesseract config string (e.g. "--psm 6").

    Returns:
        pytesseract image_to_data output dict (DICT output type).

    Raises:
        Exception: The last exception raised if all attempts are exhausted.
    """
    import time
    import pytesseract  # type: ignore

    last_exc: Optional[Exception] = None
    for attempt in range(MAX_TESSERACT_RETRIES + 1):
        try:
            return pytesseract.image_to_data(
                page_img,
                lang=lang,
                config=config,
                output_type=pytesseract.Output.DICT,
            )
        except Exception as exc:
            last_exc = exc
            if attempt < MAX_TESSERACT_RETRIES:
                logger.warning(
                    "_tesseract_image_to_data: attempt %d/%d failed: %s — retrying in %.1fs",
                    attempt + 1,
                    MAX_TESSERACT_RETRIES + 1,
                    exc,
                    _TESSERACT_RETRY_SLEEP_S,
                )
                time.sleep(_TESSERACT_RETRY_SLEEP_S)
            else:
                logger.warning(
                    "_tesseract_image_to_data: all %d attempts failed for page: %s",
                    MAX_TESSERACT_RETRIES + 1,
                    exc,
                )
    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Tier 0 — build_document_map
# ---------------------------------------------------------------------------


def build_document_map(pages: List[Dict], pdf_path: str) -> Dict:
    """
    Tier 0: Scan all pages, group consecutive pages into logical units by
    geometric column-fingerprint continuity as the SOLE spine.

    Title anchors are hints attached to metadata only — they do NOT influence
    unit grouping (AC-0). Geometry decides.

    Algorithm:
        1. For each page, compute 50-DPI projection-profile fingerprint.
        2. Scan stored OCR text for GENERIC hint vocabulary (not BCTC-specific
           labels — any line with unusual patterns). Attached as metadata only.
        3. Group pages into units by fingerprint continuity test:
           - New unit when: gutter_count changes OR any gutter_x_fraction
             shifts by > GUTTER_POSITION_TOLERANCE OR row_pitch changes > 50%.
           - Page gaps (blank pages) do NOT break a unit.
        4. Tag pages: "table" / "prose" / "blank".
        5. Schema-page = first page of each unit.

    Args:
        pages: List of {page_number, text} dicts from OcrPagesFetchClientPort.
               text = stored OCR text from pdf_extracted_text.
        pdf_path: Absolute path to the PDF for 50-DPI rasterization.

    Returns:
        DocumentMap dict: {
            "report_id": "<uuid>",
            "total_pages": N,
            "units": [
                {
                    "unit_id": "<uuid>",
                    "schema_page": N,
                    "pages": [N, N+1, N+2],
                    "page_type": "table|prose|blank"
                }
            ]
        }

    AC-LFE-6: NO Tesseract calls. PIL pixel ops only for low-DPI rasters.
    AC-0: gutter_x_fractions and row_pitch are purely geometric. Hints are metadata.
    """
    try:
        from pdf2image import convert_from_path  # type: ignore
    except ImportError:
        logger.error("build_document_map: pdf2image not installed")
        return {"report_id": str(uuid.uuid4()), "total_pages": 0, "units": []}

    # Build page text index from the stored OCR pages list
    page_text_by_num: Dict[int, str] = {}
    for p in pages:
        pn = p.get("page_number", 0)
        pt = p.get("text", "") or ""
        page_text_by_num[pn] = pt

    # Determine total pages from OCR record or count
    total_pages = len(pages)
    if pages:
        total_pages = max(p.get("page_number", 0) for p in pages)

    if total_pages == 0:
        logger.warning("build_document_map: no pages found — returning empty map")
        return {
            "report_id": str(uuid.uuid4()),
            "total_pages": 0,
            "units": [],
        }

    # ------------------------------------------------------------------
    # Step 1: Compute per-page fingerprints at 50 DPI
    # ------------------------------------------------------------------
    page_fingerprints: Dict[int, Dict] = {}

    for page_num in range(1, total_pages + 1):
        text = page_text_by_num.get(page_num, "")
        fingerprint = _compute_page_fingerprint_50dpi(
            pdf_path=pdf_path,
            page_num=page_num,
            stored_text=text,
            convert_from_path=convert_from_path,
        )
        page_fingerprints[page_num] = fingerprint

    # ------------------------------------------------------------------
    # Step 2 + 3: Group pages into units using inlined fingerprint continuity
    # AR-PDF FR-14: bctc_page_grouper.py deleted. Grouping now uses
    # _fingerprints_continuous (inlined above) for the dict-based continuity
    # test. The 5-state machine is removed; this path uses a simple
    # scan-and-break grouping on fingerprint continuity.
    # ------------------------------------------------------------------
    units: list = []
    current_unit_pages: list = []
    current_schema_page: int = 1
    current_page_type: str = "prose"
    prev_fp: Optional[dict] = None
    prev_text: str = ""

    for page_num in range(1, total_pages + 1):
        fp = page_fingerprints.get(page_num, {})
        stored_text = page_text_by_num.get(page_num, "")
        page_type = fp.get("page_type", "prose")

        if not current_unit_pages:
            # Start first unit
            current_unit_pages = [page_num]
            current_schema_page = page_num
            current_page_type = page_type
            prev_fp = fp
            prev_text = stored_text
            continue

        # Check if this page continues the current unit.
        # LF-IMPL-2: when _ALLOW_PROSE_IN_TABLE_UNIT is True, a "prose" page
        # inside an ongoing "table" unit is tolerated if gutter geometry is
        # continuous — avoiding false unit breaks at balance-unit START pages
        # that are mis-classified as "prose" despite having tabular geometry.
        same_type = page_type == current_page_type
        prose_in_table = (
            _ALLOW_PROSE_IN_TABLE_UNIT
            and current_page_type == "table"
            and page_type == "prose"
        )

        # For the prose_in_table case, _fingerprints_continuous rejects
        # page_type mismatches unconditionally. To evaluate gutter geometry
        # continuity alone (without the type-mismatch veto), pass the prose
        # fingerprint with page_type coerced to "table" so only the gutter
        # positions and row pitch are compared.
        fp_for_continuity = fp
        if prose_in_table:
            fp_for_continuity = dict(fp)
            fp_for_continuity["page_type"] = "table"

        if (
            prev_fp is not None
            and page_type != "blank"
            and (same_type or prose_in_table)
            and _fingerprints_continuous(prev_fp, fp_for_continuity,
                                         stored_text_b=stored_text)
        ):
            current_unit_pages.append(page_num)
            if prose_in_table:
                logger.info(
                    "build_document_map: page %d classified prose, "
                    "accepted as continuation of table unit starting at page %d "
                    "(gutter-geometry continuous)",
                    page_num,
                    current_schema_page,
                )
        else:
            # Close current unit
            units.append({
                "unit_id": str(uuid.uuid4()),
                "schema_page": current_schema_page,
                "pages": list(current_unit_pages),
                "page_type": current_page_type,
            })
            # Start new unit
            current_unit_pages = [page_num]
            current_schema_page = page_num
            current_page_type = page_type

        prev_fp = fp
        prev_text = stored_text

    # Flush last unit
    if current_unit_pages:
        units.append({
            "unit_id": str(uuid.uuid4()),
            "schema_page": current_schema_page,
            "pages": list(current_unit_pages),
            "page_type": current_page_type,
        })

    doc_map = {
        "report_id": str(uuid.uuid4()),
        "total_pages": total_pages,
        "units": units,
    }

    logger.info(
        "build_document_map: %d pages → %d units (pdf_path=%s)",
        total_pages,
        len(units),
        pdf_path,
    )
    return doc_map


def _compute_page_fingerprint_50dpi(
    pdf_path: str,
    page_num: int,
    stored_text: str,
    convert_from_path: Any,
) -> Dict:
    """
    Compute a geometric column-fingerprint for a page at 50 DPI.

    Uses PIL horizontal projection profile to find gutter x-positions.
    Uses vertical projection profile to estimate row pitch.

    AC-LFE-6: NO Tesseract calls. PIL pixel ops only.
    AC-0: all outputs are geometric descriptors. No BCTC semantic strings.

    Returns:
        {
            "page_number": N,
            "page_type": "table|prose|blank",
            "gutter_count": int,
            "gutter_x_fractions": [float, ...],
            "row_pitch_px_at_50dpi": float,
            "unit_hints": [str, ...],  # raw OCR text lines — metadata only
        }
    """
    try:
        images = convert_from_path(
            pdf_path,
            dpi=_TIER0_DPI,
            first_page=page_num,
            last_page=page_num,
            fmt="png",
        )
        if not images:
            return _blank_fingerprint(page_num)

        img = images[0]
    except Exception as exc:
        logger.debug(
            "_compute_page_fingerprint_50dpi: rasterize failed page %d: %s — blank",
            page_num,
            exc,
        )
        return _blank_fingerprint(page_num)

    try:
        # Convert to grayscale numpy-like computation via PIL
        # We use PIL's getdata() to avoid numpy dependency
        gray = img.convert("L")
        width, height = gray.size

        if width == 0 or height == 0:
            img.close()
            return _blank_fingerprint(page_num)

        pixels = list(gray.getdata())

        # Horizontal projection: dark pixel count per column
        # dark pixel = value < 128
        col_dark = [0] * width
        for y in range(height):
            for x in range(width):
                if pixels[y * width + x] < 128:
                    col_dark[x] += 1

        # Vertical projection: dark pixel count per row
        row_dark = [0] * height
        for y in range(height):
            for x in range(width):
                if pixels[y * width + x] < 128:
                    row_dark[y] += 1

        img.close()

        # Detect gutters: columns where dark-pixel sum is below threshold.
        # Fix: clamp search to ink bounding box and use max-based threshold
        # (not median-based) to avoid detecting page margins as gutters.
        # The same fix that applies to _detect_column_gutters_200dpi at Tier 1.
        x_left_50, x_right_50 = _find_ink_bbox(col_dark)
        ink_region_50 = col_dark[x_left_50:x_right_50 + 1]
        max_ink_dark = max(ink_region_50) if ink_region_50 else 1
        # Use the higher 50-DPI threshold: only the deepest whitespace valleys
        # (structural column separators) should count as gutters in the fingerprint.
        # Intra-column gaps (e.g. between sparse number rows in a value column)
        # are shallower and correctly filtered out by the higher fraction.
        gutter_threshold = (max_ink_dark or 1) * _GUTTER_DARK_FRACTION_50DPI

        # LF-FIX: Collect raw gutter candidates — runs of low-ink columns.
        # Do NOT flush an open gutter at the ink-right boundary: trailing
        # whitespace at the end of the last text column is NOT a column
        # separator. Only closed runs (gutter followed by more ink) are real.
        raw_gutter_centers: List[int] = []
        raw_gutter_ranges_50: List[Tuple[int, int]] = []
        in_gutter = False
        gutter_start = 0
        for i, dark in enumerate(ink_region_50):
            x = x_left_50 + i
            if dark <= gutter_threshold:
                if not in_gutter:
                    in_gutter = True
                    gutter_start = x
            else:
                if in_gutter:
                    gutter_end = x - 1
                    gutter_center = (gutter_start + x) // 2
                    raw_gutter_centers.append(gutter_center)
                    raw_gutter_ranges_50.append((gutter_start, gutter_end))
                    in_gutter = False
        # Open gutter at ink-right is DROPPED (trailing content whitespace).

        # LF-FIX: Filter out gutters that would produce sub-threshold text columns.
        # A gutter is valid only if the text column on BOTH sides is wide enough.
        # This rejects the narrow 20-30px slivers at the page edges.
        gutter_x_positions: List[int] = []
        prev_col_start = x_left_50
        for gi, (g_start, g_end) in enumerate(raw_gutter_ranges_50):
            left_col_width = g_start - prev_col_start
            # Right column ends at the next gutter start or at ink right
            if gi + 1 < len(raw_gutter_ranges_50):
                right_col_end = raw_gutter_ranges_50[gi + 1][0] - 1
            else:
                right_col_end = x_right_50
            right_col_width = right_col_end - g_end
            if (left_col_width >= _MIN_TEXT_COL_WIDTH_PX_50DPI
                    and right_col_width >= _MIN_TEXT_COL_WIDTH_PX_50DPI):
                gutter_x_positions.append(raw_gutter_centers[gi])
            prev_col_start = g_end + 1

        # Convert to fractions of page width (positions relative to full page)
        gutter_x_fractions = [x / width for x in gutter_x_positions]

        # Row pitch: estimate from vertical projection by finding peak-to-peak spacing
        row_pitch = _estimate_row_pitch(row_dark)

        # LF-IMPL-1 — Multi-signal page classifier (3-signal OR).
        #
        # "blank" → empty stored text.
        # "table" → ANY of three generic signals fires:
        #   Signal A: money_group_count >= _TABLE_PAGE_MIN_MONEY_GROUPS
        #             (existing — dense number pages)
        #   Signal B: account_code_count >= _ACCOUNT_CODE_MIN_FOR_TABLE
        #             (AC-0: reuses _CODE_LIKE_RE, catches balance-unit START pages
        #             whose top half is a heading block with few money values)
        #   Signal C: date_header_count >= _DATE_HEADER_MIN_FOR_TABLE
        #             (AC-0: reuses _DATE_HEADER_RE, catches column-header rows on
        #             any financial statement page — e.g. "31/03/2026 31/12/2025")
        # "prose" → all three signals absent.
        #
        # Kills the recurrence class: balance-unit START pages (page 3 of FPT Q1)
        # carry date headers and account codes but sparse money-group density due to
        # the full-width title block at the top — Signal C (date) or B (code) reclassifies.
        stored = stored_text or ""
        money_group_count = len(_MONEY_GROUP_RE.findall(stored))
        account_code_count = len(_CODE_LIKE_RE.findall(stored))
        date_header_count = len(_DATE_HEADER_RE.findall(stored))
        gutter_count = len(gutter_x_positions)

        signal_a = money_group_count >= _TABLE_PAGE_MIN_MONEY_GROUPS
        signal_b = account_code_count >= _ACCOUNT_CODE_MIN_FOR_TABLE
        signal_c = date_header_count >= _DATE_HEADER_MIN_FOR_TABLE

        if not stored or stored.strip() == "":
            page_type = "blank"
        elif signal_a or signal_b or signal_c:
            page_type = "table"
        else:
            page_type = "prose"

        logger.debug(
            "_compute_page_fingerprint_50dpi: page=%d "
            "money_groups=%d(sig_A=%s) codes=%d(sig_B=%s) dates=%d(sig_C=%s) "
            "-> page_type=%s",
            page_num,
            money_group_count, signal_a,
            account_code_count, signal_b,
            date_header_count, signal_c,
            page_type,
        )

        # Unit hints: lines from stored OCR text that contain unusual patterns.
        # These are attached as metadata ONLY — never used in grouping decisions (AC-0).
        unit_hints = _extract_unit_hints(stored_text or "")

        return {
            "page_number": page_num,
            "page_type": page_type,
            "gutter_count": gutter_count,
            "gutter_x_fractions": gutter_x_fractions,
            "row_pitch_px_at_50dpi": row_pitch,
            "unit_hints": unit_hints,
        }

    except Exception as exc:
        logger.debug(
            "_compute_page_fingerprint_50dpi: processing failed page %d: %s — blank",
            page_num,
            exc,
        )
        return _blank_fingerprint(page_num)


def _blank_fingerprint(page_num: int) -> Dict:
    """Return a blank-page fingerprint when rasterization fails."""
    return {
        "page_number": page_num,
        "page_type": "blank",
        "gutter_count": 0,
        "gutter_x_fractions": [],
        "row_pitch_px_at_50dpi": 0.0,
        "unit_hints": [],
    }


def _estimate_row_pitch(row_dark: List[int]) -> float:
    """
    Estimate row pitch from a vertical projection profile.

    Finds alternating dark (text) and light (gap) bands.
    Returns the median peak-to-peak spacing (in pixels).
    If no clear pattern, returns 0.0.

    AC-0: purely geometric — no BCTC semantics.
    """
    if not row_dark or max(row_dark) == 0:
        return 0.0

    max_dark = max(row_dark)
    threshold = max_dark * 0.3  # 30% of maximum = text-bearing row

    # Find transitions from "light" to "dark" rows
    peaks: List[int] = []
    was_dark = False
    for y, count in enumerate(row_dark):
        is_dark = count > threshold
        if is_dark and not was_dark:
            peaks.append(y)
        was_dark = is_dark

    if len(peaks) < 2:
        return 0.0

    spacings = [peaks[i + 1] - peaks[i] for i in range(len(peaks) - 1)]
    # Median spacing
    spacings.sort()
    return float(spacings[len(spacings) // 2])


def _extract_unit_hints(text: str) -> List[str]:
    """
    Extract lines from stored OCR text that could be unit hints.

    These are short lines (< 100 chars) that appear at the top of a section
    and may indicate a new section boundary. Used ONLY as metadata — never
    as grouping criteria (AC-0).

    AC-0: attaches raw OCR text lines as metadata. The hint strings are NOT
    used in any branching or decision logic (only stored for overlay display).
    """
    if not text:
        return []

    hints: List[str] = []
    lines = text.splitlines()
    for line in lines[:20]:  # Only look at top 20 lines for efficiency
        stripped = line.strip()
        if 3 <= len(stripped) <= 80:
            # Short-ish line near the top of the page — could be a section title
            # Only include lines that are not purely numeric (table data is not a hint)
            if not re.fullmatch(r"[\d.,\s]+", stripped):
                hints.append(stripped)
                if len(hints) >= 5:
                    break
    return hints




def _is_title_band(stored_text: str) -> bool:
    """
    Detect whether a page opens with a standalone table-title band (D-5).

    Algorithm (cheap — reads stored OCR text, no new Tesseract calls):
        1. Split text into lines. Scan only the first _TITLE_BAND_SCAN_LINES lines.
        2. For each scanned line:
           a. Strip whitespace. Skip empty and lines shorter than _TITLE_BAND_MIN_LEN.
           b. Skip lines containing money-group pattern (financial data, not a title).
           c. Skip lines that are purely numeric/punctuation.
           d. Skip lines with fewer than 2 words (likely an OCR column-header artifact).
           e. If a candidate line contains a continuation marker → return False immediately.
           f. Otherwise: record as a candidate title line.
        3. If at least one candidate title line found → return True (D-5 fires).
        4. Otherwise → return False (no title band detected).

    AC-0: detects structural pattern (non-numeric standalone line in top region).
    No BCTC-specific keyword strings used in branching decisions.
    Pure function: no I/O, no Tesseract.
    """
    if not stored_text:
        return False

    lines = stored_text.splitlines()
    scan_lines = lines[:_TITLE_BAND_SCAN_LINES]

    for line in scan_lines:
        stripped = line.strip()

        if len(stripped) < _TITLE_BAND_MIN_LEN:
            continue
        if len(stripped) > _TITLE_BAND_MAX_LEN:
            continue
        if _BCTC_MONEY_GROUP_RE.search(stripped):
            continue
        if re.fullmatch(r"[\d.,\s()]+", stripped):
            continue
        if len(stripped.split()) < 2:
            continue

        stripped_lower = stripped.lower()
        for marker in _CONTINUATION_MARKERS:
            if marker in stripped_lower:
                return False

        return True

    return False


def _find_ink_bbox(col_dark: List[int]) -> Tuple[int, int]:
    """
    Find the horizontal ink bounding box of the page.

    Returns (x_left, x_right) where:
        x_left  = index of the leftmost column with col_dark > ink_threshold
        x_right = index of the rightmost column with col_dark > ink_threshold

    If no ink-bearing column is found, returns (0, len(col_dark) - 1) as a
    safe fallback (full-width).

    Purpose: clamp the gutter-valley search to the actual text region so
    that leading/trailing page margins are NEVER detected as gutters. On a
    real document page the majority of columns are whitespace; the global
    median of col_dark is near-zero, causing the old median-based threshold
    to detect only the far-margin pure-white columns as "gutters". Clamping
    to the ink bbox eliminates margin false-positives entirely.

    AC-0: purely geometric — no BCTC semantics.
    """
    if not col_dark:
        return 0, 0

    global_max = max(col_dark) or 1
    ink_threshold = global_max * _INK_BBOX_MIN_FRACTION

    x_left = 0
    x_right = len(col_dark) - 1

    for x in range(len(col_dark)):
        if col_dark[x] > ink_threshold:
            x_left = x
            break

    for x in range(len(col_dark) - 1, -1, -1):
        if col_dark[x] > ink_threshold:
            x_right = x
            break

    # Safety: ensure left <= right
    if x_left > x_right:
        x_left, x_right = 0, len(col_dark) - 1

    return x_left, x_right


# AR-PDF FR-14 — _fingerprints_continuous inlined from bctc_page_grouper.py (deleted in AR-PDF).
# Retained here for backward compatibility with existing test imports.

def _fingerprints_continuous(
    fp_a: dict,
    fp_b: dict,
    stored_text_b: str = "",
) -> bool:
    """
    Test if two page fingerprint dicts belong to the same logical unit.

    Translates dict-based fingerprints into comparable fields and applies
    the same continuity test as the deleted bctc_page_grouper._fingerprints_continuous.

    Args:
        fp_a: Fingerprint dict of the reference page.
        fp_b: Fingerprint dict of the candidate continuation page.
        stored_text_b: Stored OCR text of page B (for D-5 title-band check).
    """
    if fp_a.get("page_type") == "blank" or fp_b.get("page_type") == "blank":
        return False

    pt_a = fp_a.get("page_type", "prose")
    pt_b = fp_b.get("page_type", "prose")
    if pt_a != pt_b:
        return False

    # Gutter count must match
    gc_a = fp_a.get("gutter_count", 0)
    gc_b = fp_b.get("gutter_count", 0)
    if gc_a != gc_b:
        return False

    # Gutter x-fractions must be within tolerance
    gx_a = fp_a.get("gutter_x_fractions", [])
    gx_b = fp_b.get("gutter_x_fractions", [])
    if len(gx_a) != len(gx_b):
        return False
    for xa, xb in zip(gx_a, gx_b):
        if abs(xa - xb) > _GUTTER_POSITION_TOLERANCE:
            return False

    # Row pitch must not change by more than tolerance (only when both available)
    pitch_a = fp_a.get("row_pitch_px_at_50dpi", 0.0)
    pitch_b = fp_b.get("row_pitch_px_at_50dpi", 0.0)
    if pitch_a > 0 and pitch_b > 0:
        change = abs(pitch_a - pitch_b) / max(pitch_a, pitch_b)
        if change > _ROW_PITCH_CHANGE_TOLERANCE:
            return False

    # D-5 removed: _is_title_band fires on ALL financial text (every account-label
    # line has 2+ words and is non-numeric), blocking every continuation on real
    # BCTC corpus → 46 singleton units. Section breaks are now correctly gated by
    # the page_type equality check above (LF-IMPL-1 classifies genuine section-start
    # pages as "table", so prose→table and table→prose transitions already break
    # units; table→table with different gutter geometry also breaks units).
    # _is_title_band is retained as a standalone function for other callers.
    return True


# ---------------------------------------------------------------------------
# Tier 1 — zone_page
# ---------------------------------------------------------------------------


def zone_page(
    page_img: Any,  # PIL Image
    unit_schema: Optional[Dict],
    page_num: int,
    unit_id: str,
    unit_page_type: str,
    is_schema_page: bool,
    schema_inherited_from_page: Optional[int],
) -> Dict:
    """
    Tier 1: Decompose a page into geometric zones.

    For schema-pages (is_schema_page=True, unit_schema=None):
        - Detect column gutters from 200-DPI projection profile.
        - Detect header/footer bands.
        - Detect row bands.

    For continuation pages (is_schema_page=False, unit_schema provided):
        - SKIP column gutter detection entirely.
        - Use unit_schema.column_gutters directly (the schema-inheritance mechanism).
        - Still detect header/footer bands and row bands independently.

    AC-0: Column IDs are positional (col_0, col_1, ...). No semantic labels.
    AC-LFE-6: NO Tesseract calls. PIL pixel ops only.

    Args:
        page_img:                  PIL Image at 200 DPI.
        unit_schema:               Dict with column_gutters list for inheritance,
                                   or None for schema-pages.
        page_num:                  Page number (1-indexed).
        unit_id:                   UUID of the logical unit.
        unit_page_type:            "table" | "prose" | "blank".
        is_schema_page:            True for the first page of the unit.
        schema_inherited_from_page: Page number of schema-page (None if schema-page itself).

    Returns:
        PageZones dict matching the brief §3.2 contract.
    """
    try:
        width, height = page_img.size
        gray = page_img.convert("L")
        pixels = list(gray.getdata())

        # Horizontal projection (dark pixels per column)
        col_dark = [0] * width
        for y in range(height):
            for x in range(width):
                if pixels[y * width + x] < 128:
                    col_dark[x] += 1

        # Vertical projection (dark pixels per row)
        row_dark = [0] * height
        for y in range(height):
            for x in range(width):
                if pixels[y * width + x] < 128:
                    row_dark[y] += 1

    except Exception as exc:
        logger.warning("zone_page: pixel processing failed for page %d: %s", page_num, exc)
        width, height = getattr(page_img, "size", (0, 0))
        if isinstance(width, tuple):
            width, height = 0, 0
        col_dark = []
        row_dark = []

    # ------------------------------------------------------------------
    # Header and footer bands (always re-detected — not inherited)
    # ------------------------------------------------------------------
    header_y_max = int(height * _HEADER_BAND_FRACTION)
    footer_y_min = int(height * (1.0 - _FOOTER_BAND_FRACTION))

    header_band = {"y_min": 0, "y_max": header_y_max}
    footer_band = {"y_min": footer_y_min, "y_max": height}

    # ------------------------------------------------------------------
    # Column gutters: detected for schema-pages, INHERITED for continuation
    # ------------------------------------------------------------------
    if unit_schema is not None and not is_schema_page:
        # Schema inheritance — use schema-page's column gutters directly.
        # This is the NAMED FIX for the missing-header continuation-page scramble.
        column_gutters = unit_schema.get("column_gutters", [])
        logger.debug(
            "zone_page: page %d inherits %d column gutters from schema-page",
            page_num,
            len(column_gutters),
        )
    else:
        # Schema-page: detect column gutters from 200-DPI projection profile
        column_gutters = _detect_column_gutters_200dpi(
            col_dark=col_dark,
            width=width,
        )

    # ------------------------------------------------------------------
    # Row bands (always re-detected from vertical projection)
    # ------------------------------------------------------------------
    row_bands = _detect_row_bands(
        row_dark=row_dark,
        y_start=header_y_max,
        y_end=footer_y_min,
    )

    # Build unit_hints from the zones (no hints from this tier — hints are
    # from Tier 0's stored OCR text scan; we leave it empty here)
    unit_hints: List[str] = []

    zones = {
        "image_width_px": width,
        "image_height_px": height,
        "image_dpi": 200,
        "coordinate_origin": "top-left",
        "coordinate_unit": "px",
        "header_band": header_band,
        "footer_band": footer_band,
        "column_gutters": column_gutters,
        "row_bands": row_bands,
        "unit_hints": unit_hints,
        "unit_boundary_after_page": False,  # Set by use case (last page of unit)
    }

    return {
        "page_number": page_num,
        "unit_id": unit_id,
        "page_type": unit_page_type,
        "is_schema_page": is_schema_page,
        "is_continuation_page": not is_schema_page,
        "schema_inherited_from_page": schema_inherited_from_page,
        "zones": zones,
    }


def _scan_gutter_ranges(
    ink_region: List[int],
    x_left: int,
    x_right: int,
    gutter_threshold: float,
) -> List[Tuple[int, int]]:
    """
    Scan ink_region for raw gutter candidates using a given threshold.

    Returns a list of (gutter_start_x, gutter_end_x) tuples for runs of columns
    whose dark-pixel count is <= gutter_threshold AND whose gap width >= _MIN_GUTTER_WIDTH_PX.
    Open gutters at the right ink-boundary are dropped.

    Helper extracted so _detect_column_gutters_200dpi can retry with a
    different threshold on dense pages (FU-ORPHAN-TOLERANCE dense-page fallback).
    """
    raw_gutter_ranges: List[Tuple[int, int]] = []
    in_gutter = False
    gutter_start = 0
    for i, dark in enumerate(ink_region):
        x = x_left + i
        if dark <= gutter_threshold:
            if not in_gutter:
                in_gutter = True
                gutter_start = x
        else:
            if in_gutter:
                gutter_end = x - 1
                gap_width = gutter_end - gutter_start + 1
                if gap_width >= _MIN_GUTTER_WIDTH_PX:
                    raw_gutter_ranges.append((gutter_start, gutter_end))
                in_gutter = False
    # Open gutter at ink-right is DROPPED (trailing content whitespace).
    return raw_gutter_ranges


def _build_column_regions(
    raw_gutter_ranges: List[Tuple[int, int]],
    x_left: int,
    x_right: int,
) -> List[Dict]:
    """
    Merge, filter, and build column-region dicts from raw gutter ranges.

    Returns None if no valid gutter remains after merge+filter (caller falls back
    to single-column result). Returns column list on success.

    Extracted so _detect_column_gutters_200dpi can share this logic between the
    standard and dense-page-fallback passes.
    """
    # Merge consecutive raw gutters that are close together (OCR ink artifacts).
    merged_gutter_ranges: List[Tuple[int, int]] = [raw_gutter_ranges[0]]
    for cur_start, cur_end in raw_gutter_ranges[1:]:
        prev_start, prev_end = merged_gutter_ranges[-1]
        inter_gap = cur_start - prev_end - 1
        if inter_gap <= _MAX_INTER_GUTTER_GAP_PX:
            merged_gutter_ranges[-1] = (prev_start, cur_end)
        else:
            merged_gutter_ranges.append((cur_start, cur_end))

    # Filter: a gutter is valid only if both adjacent text columns are wide enough.
    gutter_ranges: List[Tuple[int, int]] = []
    prev_col_start = x_left
    for gi, (g_start, g_end) in enumerate(merged_gutter_ranges):
        left_col_width = g_start - prev_col_start
        if gi + 1 < len(merged_gutter_ranges):
            right_col_end = merged_gutter_ranges[gi + 1][0] - 1
        else:
            right_col_end = x_right
        right_col_width = right_col_end - g_end
        if (left_col_width >= _MIN_TEXT_COL_WIDTH_PX
                and right_col_width >= _MIN_TEXT_COL_WIDTH_PX):
            gutter_ranges.append((g_start, g_end))
        prev_col_start = g_end + 1

    if not gutter_ranges:
        return []  # caller returns single-column

    # Build column-region dicts (alternating text and gutter columns).
    columns: List[Dict] = []
    col_idx = 0

    first_gutter_start = gutter_ranges[0][0]
    if first_gutter_start > x_left:
        columns.append({
            "col_id": f"col_{col_idx}",
            "x_min": x_left,
            "x_max": first_gutter_start - 1,
            "is_gutter": False,
        })
        col_idx += 1

    for i, (g_start, g_end) in enumerate(gutter_ranges):
        columns.append({
            "col_id": f"col_{col_idx}",
            "x_min": g_start,
            "x_max": g_end,
            "is_gutter": True,
        })
        col_idx += 1

        next_start = gutter_ranges[i + 1][0] if i + 1 < len(gutter_ranges) else x_right + 1
        if next_start > g_end + 1:
            columns.append({
                "col_id": f"col_{col_idx}",
                "x_min": g_end + 1,
                "x_max": next_start - 1,
                "is_gutter": False,
            })
            col_idx += 1

    return columns


def _detect_column_gutters_200dpi(
    col_dark: List[int],
    width: int,
) -> List[Dict]:
    """
    Detect text column regions from a 200-DPI horizontal projection profile.

    Column gutters (whitespace gaps between text columns) are x-positions where
    the dark-pixel column sum is below a threshold AND the gap width > MIN_GUTTER_WIDTH_PX.

    Returns text COLUMN regions (the areas between gutters), NOT the gutters themselves.
    col_0 is always the leftmost text column.

    Output format matches brief §3.2: each dict has col_id, x_min, x_max.
    Column IDs are positional: col_0, col_1, col_2, ... (AC-0 compliant).

    Dense-page fallback (FU-ORPHAN-TOLERANCE):
        On dense statement pages (income-stmt / cash-flow), the gutter between
        label and value columns has residual ink that exceeds the standard
        _GUTTER_DARK_FRACTION threshold. If the standard pass finds no gutters,
        a second pass uses _GUTTER_DARK_FRACTION_DENSE (0.35) — a more permissive
        threshold that detects gutters in dense text regions.

    AC-0: positional column IDs only. No BCTC semantic labels.
    """
    if not col_dark or width == 0:
        # Fallback: single full-width column
        return [{"col_id": "col_0", "x_min": 0, "x_max": width, "is_gutter": False}]

    # ------------------------------------------------------------------
    # Clamp search to the ink bounding box.
    # This is the PRIMARY fix for the margin-gutter defect:
    # On a real page, most columns are white (margins + inter-col space).
    # The global median of col_dark is near-zero, so threshold ≈ 0 and
    # only the pure-white far-margin columns qualify as "gutters",
    # producing one pseudo-column spanning ~97% of the page.
    # By restricting the valley search to [x_left, x_right] we guarantee
    # that page-margin whitespace is NEVER detected as a column gutter.
    # ------------------------------------------------------------------
    x_left, x_right = _find_ink_bbox(col_dark)
    ink_region = col_dark[x_left:x_right + 1]

    if not ink_region:
        return [{"col_id": "col_0", "x_min": 0, "x_max": width, "is_gutter": False}]

    max_dark_in_region = max(ink_region) or 1

    # ------------------------------------------------------------------
    # Standard pass (threshold = 15% of peak ink)
    # ------------------------------------------------------------------
    gutter_threshold = max_dark_in_region * _GUTTER_DARK_FRACTION
    raw_gutter_ranges = _scan_gutter_ranges(ink_region, x_left, x_right, gutter_threshold)

    if not raw_gutter_ranges:
        # No gutters at standard threshold — try dense-page fallback.
        # FU-ORPHAN-TOLERANCE: dense statement pages have residual ink in the
        # gutter (20-30% of peak), which the standard 15% threshold misses.
        dense_threshold = max_dark_in_region * _GUTTER_DARK_FRACTION_DENSE
        raw_gutter_ranges = _scan_gutter_ranges(ink_region, x_left, x_right, dense_threshold)
        if raw_gutter_ranges:
            logger.debug(
                "_detect_column_gutters_200dpi: dense-page fallback found %d raw gutter(s) "
                "at threshold=%.2f (standard threshold found none)",
                len(raw_gutter_ranges),
                _GUTTER_DARK_FRACTION_DENSE,
            )

    if not raw_gutter_ranges:
        # No inter-column gutters found even with dense fallback.
        return [{"col_id": "col_0", "x_min": x_left, "x_max": x_right, "is_gutter": False}]

    columns = _build_column_regions(raw_gutter_ranges, x_left, x_right)
    if not columns:
        # All candidate gutters rejected by column-width filter.
        return [{"col_id": "col_0", "x_min": x_left, "x_max": x_right, "is_gutter": False}]

    return columns


def _detect_row_bands(
    row_dark: List[int],
    y_start: int,
    y_end: int,
) -> List[Dict]:
    """
    Detect alternating text-dense and text-sparse horizontal strips between
    y_start and y_end.

    Returns a list of row-band dicts: [{y_min, y_max, row_density}].
    row_density is the ratio of dark pixels in this band to the maximum band density.

    AC-0: purely geometric — no BCTC semantics.
    """
    if not row_dark or y_end <= y_start:
        return []

    # Slice to the content area (between header and footer)
    content_rows = row_dark[y_start:y_end]
    if not content_rows:
        return []

    max_dark = max(content_rows) or 1
    threshold = max_dark * _ROW_BAND_DARKNESS_THRESHOLD

    # Group consecutive rows by above/below threshold
    bands: List[Dict] = []
    in_band = False
    band_start = y_start
    band_dark_sum = 0
    band_count = 0

    for i, dark_count in enumerate(content_rows):
        y = y_start + i
        is_text = dark_count > threshold

        if is_text and not in_band:
            in_band = True
            band_start = y
            band_dark_sum = dark_count
            band_count = 1
        elif is_text and in_band:
            band_dark_sum += dark_count
            band_count += 1
        elif not is_text and in_band:
            # End of text band
            band_end = y - 1
            avg_density = (band_dark_sum / band_count / max_dark) if band_count > 0 else 0
            bands.append({
                "y_min": band_start,
                "y_max": band_end,
                "row_density": round(avg_density, 3),
            })
            in_band = False
            band_dark_sum = 0
            band_count = 0

    # Flush final band
    if in_band and band_count > 0:
        avg_density = (band_dark_sum / band_count / max_dark)
        bands.append({
            "y_min": band_start,
            "y_max": y_end - 1,
            "row_density": round(avg_density, 3),
        })

    return bands


# ---------------------------------------------------------------------------
# Tier 2 — ocr_unit
# ---------------------------------------------------------------------------


def ocr_unit(
    unit: Dict,
    zones_by_page: Dict[int, Dict],
    pdf_path: str,
    tmp_dir: str,
    ocr_pages: Optional[List[Dict]] = None,
) -> Dict:
    """
    Tier 2: OCR each page of a logical unit into the known column grid, then
    stitch all pages into a single markdown pipe-table.

    ONE image_to_data call per page (AC-LFE-6 — one Tesseract pass per page).
    Cell text is derived by filtering the resulting word dictionary by bbox
    intersection with the cell region.

    For table units:
        - Schema-page: detect header row (first row band with no numeric tokens).
          Emit header once.
        - Continuation pages: skip header detection. Append data rows directly.
        - Stitch: concatenate pages in reading order (page ASC, row_band_idx ASC).

    For prose units:
        - Concatenate stored OCR text (from ocr_pages) across page breaks as
          plain paragraph text. No new Tesseract pass (AC-LFE-6 compliance).
        - ocr_pages: per-page stored OCR text fetched at Step 0 in the use case.
          Each dict: {"page_number": int, "text": str} (dual-key fallback applied).
        - If ocr_pages is None or all pages have empty text, returns
          stitched_markdown="" with _prose_no_text=True for observability.

    Args:
        unit:          Logical unit dict from DocumentMap.units.
        zones_by_page: Dict[page_number → PageZones] from Tier 1.
        pdf_path:      Absolute path to PDF.
        tmp_dir:       Temporary directory for intermediate PNGs.
        ocr_pages:     Optional list of stored per-page OCR dicts (prose path only).

    Returns:
        UnitOcrResult dict:
        {
            "unit_id":         "<uuid>",
            "page_numbers":    [3, 4, 5, 6],
            "stitched_markdown": "| col_0 | col_1 | ...",
            "row_count":       42,
            "page_row_spans":  [{"page": 3, "row_start": 0, "row_end": 14}, ...],
            "rows_for_gate":   [{"code": str, "label": str, "values": [...], "page": N}, ...],
            "_prose_no_text":  True   # (prose units only, when all pages blank)
        }
    """
    try:
        import pytesseract  # type: ignore
        from pdf2image import convert_from_path  # type: ignore
    except ImportError as exc:
        raise RuntimeError(f"ocr_unit: missing dependency: {exc}")

    unit_id = unit.get("unit_id", str(uuid.uuid4()))
    pages_in_unit: List[int] = unit.get("pages", [])
    unit_page_type: str = unit.get("page_type", "table")

    if not pages_in_unit:
        return _empty_unit_result(unit_id, [])

    # ------------------------------------------------------------------
    # Prose units: concatenate stored OCR text (no new Tesseract pass)
    # Tier 2 for prose = no table structure, just text concatenation.
    #
    # RISK-1 mitigation: dual-key fallback on "text" / "text_content"
    # matches the existing pattern in _eval_push_stage3 (L881-882).
    # ------------------------------------------------------------------
    if unit_page_type != "table":
        prose_lines: List[str] = []

        # Build a lookup from page_number → text from the stored OCR list
        ocr_page_map: Dict[int, str] = {}
        if ocr_pages:
            for page_rec in ocr_pages:
                page_num_key = page_rec.get("page_number") or page_rec.get("page_no")
                if page_num_key is None:
                    continue
                # Dual-key fallback: "text" is canonical; "text_content" is legacy alias
                page_text: str = page_rec.get("text") or page_rec.get("text_content") or ""
                ocr_page_map[int(page_num_key)] = page_text

        for page_num in sorted(pages_in_unit):
            page_text = ocr_page_map.get(page_num, "").strip()
            if page_text:
                prose_lines.append(page_text)

        all_blank = len(prose_lines) == 0
        stitched = "\n".join(prose_lines)
        non_empty_line_count = sum(1 for line in stitched.splitlines() if line.strip())

        result: Dict = {
            "unit_id": unit_id,
            "page_numbers": pages_in_unit,
            "stitched_markdown": stitched,
            "row_count": non_empty_line_count,
            "page_row_spans": [],
            "rows_for_gate": [],
        }
        if all_blank:
            result["_prose_no_text"] = True
        return result

    # ------------------------------------------------------------------
    # Table units: OCR into the column grid, then stitch
    # ------------------------------------------------------------------
    schema_page_num = unit.get("schema_page", pages_in_unit[0])
    all_header_cells: List[str] = []
    all_data_rows: List[List[str]] = []
    page_row_spans: List[Dict] = []
    rows_for_gate: List[Dict] = []
    current_row_idx = 0
    col_count = 0

    for page_num in sorted(pages_in_unit):
        page_zones_entry = zones_by_page.get(page_num)
        if page_zones_entry is None:
            logger.warning("ocr_unit: no zone data for page %d — skipping", page_num)
            continue

        zones = page_zones_entry.get("zones", {})
        column_gutters: List[Dict] = zones.get("column_gutters", [])
        row_bands: List[Dict] = zones.get("row_bands", [])
        header_band: Dict = zones.get("header_band", {"y_min": 0, "y_max": 0})
        footer_band: Dict = zones.get("footer_band", {"y_min": 99999, "y_max": 99999})

        is_schema = (page_num == schema_page_num)

        if not column_gutters or not row_bands:
            logger.debug(
                "ocr_unit: page %d has no column_gutters or row_bands — skipping",
                page_num,
            )
            continue

        # Set col_count from first page with column data
        if col_count == 0:
            col_count = len(column_gutters)

        # Rasterize page at 200 DPI for OCR
        try:
            images = convert_from_path(
                pdf_path,
                dpi=200,
                first_page=page_num,
                last_page=page_num,
                fmt="png",
            )
            if not images:
                logger.warning("ocr_unit: no image for page %d", page_num)
                continue
            page_img = images[0]
        except Exception as exc:
            logger.warning("ocr_unit: rasterize failed for page %d: %s", page_num, exc)
            continue

        try:
            img_width, img_height = page_img.size

            # ONE Tesseract pass per page (AC-LFE-6).
            # BPE-DEV-5: call via _tesseract_image_to_data wrapper which
            # retries up to MAX_TESSERACT_RETRIES times on SIGTERM / load spike.
            try:
                ocr_data = _tesseract_image_to_data(
                    page_img=page_img,
                    lang="vie+eng",
                    config="--psm 6",
                )
            except Exception as exc:
                logger.warning(
                    "ocr_unit: Tesseract failed for page %d after %d attempts: %s — skipping page",
                    page_num,
                    MAX_TESSERACT_RETRIES + 1,
                    exc,
                )
                page_img.close()
                continue

            # Build word records from OCR data
            word_records = _build_word_records(ocr_data)

            # Skip header row detection if this is a continuation page
            page_rows: List[List[str]] = []

            row_span_start = current_row_idx

            for band_idx, band in enumerate(row_bands):
                band_y_min = band.get("y_min", 0)
                band_y_max = band.get("y_max", img_height)

                # Classify as header row (first band on schema-page with no numeric content)
                is_header_band = (
                    is_schema
                    and band_idx == 0
                    and not _band_has_numeric_content(word_records, band_y_min, band_y_max)
                )

                # Extract cell text for each column in this row band
                row_cells: List[str] = []
                for col in column_gutters:
                    col_x_min = col.get("x_min", 0)
                    col_x_max = col.get("x_max", img_width)
                    cell_text = _extract_cell_text(
                        word_records=word_records,
                        x_min=col_x_min,
                        x_max=col_x_max,
                        y_min=band_y_min,
                        y_max=band_y_max,
                    )
                    row_cells.append(cell_text)

                if is_header_band:
                    if not all_header_cells:
                        all_header_cells = row_cells
                else:
                    # Data row
                    if any(c.strip() for c in row_cells):
                        page_rows.append(row_cells)

                        # Build rows_for_gate entry from TEXT columns only
                        # (gutter columns are whitespace separators — skip them).
                        # Mapping for text columns (non-gutter, in order):
                        #   text_col_0 → label  (leftmost: contains descriptive text + code)
                        #   text_col_1+ → values (remaining columns: monetary amounts)
                        # Note: code extraction is omitted — code values may be embedded
                        # within the label column in scrambled OCR order. Treating the
                        # full leftmost text column as "label" ensures _has_label() fires
                        # correctly when there is real textual content in that column.
                        code_val: Optional[str] = None  # No code extraction in layout-first path
                        label_val: Optional[str] = None
                        value_cells: List[Optional[str]] = []
                        text_col_idx = 0

                        for c_idx, cell in enumerate(row_cells):
                            col_meta = column_gutters[c_idx] if c_idx < len(column_gutters) else {}
                            if col_meta.get("is_gutter", False):
                                continue  # Skip whitespace separator columns
                            if text_col_idx == 0:
                                label_val = cell.strip() or None
                            else:
                                value_cells.append(cell.strip() or None)
                            text_col_idx += 1

                        rows_for_gate.append({
                            "code": code_val,
                            "label": label_val,
                            "values": value_cells,
                            "page": page_num,
                        })

            all_data_rows.extend(page_rows)

            row_span_end = current_row_idx + len(page_rows) - 1
            if page_rows:
                page_row_spans.append({
                    "page": page_num,
                    "row_start": row_span_start,
                    "row_end": row_span_end,
                })
                current_row_idx += len(page_rows)

        finally:
            page_img.close()

    # ------------------------------------------------------------------
    # Stitch into markdown pipe-table
    # ------------------------------------------------------------------
    if not col_count and all_data_rows:
        col_count = max(len(r) for r in all_data_rows)
    if not col_count and all_header_cells:
        col_count = len(all_header_cells)

    if col_count == 0:
        return _empty_unit_result(unit_id, pages_in_unit)

    # Pad/truncate rows to uniform column count
    if not all_header_cells:
        all_header_cells = [f"col_{i}" for i in range(col_count)]

    header_cells = (all_header_cells + [""] * col_count)[:col_count]
    data_rows_padded = [
        (row + [""] * col_count)[:col_count]
        for row in all_data_rows
    ]

    # Build GFM pipe-table
    header_line = "| " + " | ".join(header_cells) + " |"
    separator_line = "| " + " | ".join(["---"] * col_count) + " |"
    data_lines = [
        "| " + " | ".join(row) + " |"
        for row in data_rows_padded
    ]
    stitched = "\n".join([header_line, separator_line] + data_lines)

    return {
        "unit_id": unit_id,
        "page_numbers": pages_in_unit,
        "stitched_markdown": stitched,
        "row_count": len(all_data_rows),
        "page_row_spans": page_row_spans,
        "rows_for_gate": rows_for_gate,
    }


def _build_word_records(ocr_data: Dict) -> List[Dict]:
    """
    Convert pytesseract image_to_data output dict to a list of word record dicts.

    Filters out words with conf <= 0 or empty text.

    Returns: [{text, left, top, width, height, conf}, ...]
    """
    records: List[Dict] = []
    n = len(ocr_data.get("text", []))
    for i in range(n):
        text = str(ocr_data["text"][i]).strip()
        conf = int(ocr_data["conf"][i])
        if not text or conf <= 0:
            continue
        records.append({
            "text": text,
            "left": int(ocr_data["left"][i]),
            "top": int(ocr_data["top"][i]),
            "width": int(ocr_data["width"][i]),
            "height": int(ocr_data["height"][i]),
            "conf": conf,
        })
    return records


def _band_has_numeric_content(
    word_records: List[Dict],
    y_min: int,
    y_max: int,
) -> bool:
    """
    Return True if any word in the given y-band contains a numeric value token.

    Used to detect header rows (no numeric content = column-name row).
    AC-0: uses _VALUE_TOKEN_RE (generic financial number pattern).
    """
    for w in word_records:
        top = w.get("top", 0)
        bottom = top + w.get("height", 0)
        # Word overlaps with band
        if top < y_max and bottom > y_min:
            if _VALUE_TOKEN_RE.match(w.get("text", "")):
                return True
    return False


def _extract_cell_text(
    word_records: List[Dict],
    x_min: int,
    x_max: int,
    y_min: int,
    y_max: int,
) -> str:
    """
    Extract and concatenate OCR text from words that fall within the cell region.

    A word is included if its center x falls within [x_min, x_max] AND
    its center y falls within [y_min, y_max].

    Sorts matched words by (top, left) for natural reading order.

    AC-0: positional filtering only — no BCTC semantic matching.
    """
    cell_words: List[Dict] = []
    for w in word_records:
        left = w.get("left", 0)
        top = w.get("top", 0)
        w_width = w.get("width", 0)
        w_height = w.get("height", 0)
        center_x = left + w_width // 2
        center_y = top + w_height // 2
        if x_min <= center_x <= x_max and y_min <= center_y <= y_max:
            cell_words.append(w)

    if not cell_words:
        return ""

    # Sort by (top, left) for reading order
    cell_words.sort(key=lambda w: (w.get("top", 0), w.get("left", 0)))
    return " ".join(w.get("text", "") for w in cell_words).strip()


def _empty_unit_result(unit_id: str, page_numbers: List[int]) -> Dict:
    """Return an empty UnitOcrResult for units with no extractable content."""
    return {
        "unit_id": unit_id,
        "page_numbers": page_numbers,
        "stitched_markdown": "",
        "row_count": 0,
        "page_row_spans": [],
        "rows_for_gate": [],
    }
