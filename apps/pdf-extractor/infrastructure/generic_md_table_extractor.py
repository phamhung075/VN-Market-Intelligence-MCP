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

# ---------------------------------------------------------------------------
# Generic geometry constants (no BCTC semantics)
# ---------------------------------------------------------------------------

# Row clustering: start new row when next word top exceeds current row max by
# more than this fraction of median word height.
_ROW_GAP_FACTOR = 0.5

# Gap-histogram row clustering: same-line grouping tolerance as fraction of
# median word height. Words within this vertical distance share a physical scan
# line. Caps at 8px absolute to defuse H_med inflation from tall header tokens.
_SAME_LINE_FACTOR = 0.3

# Row-pitch multiplier: gap must exceed row_pitch × this factor to start a new
# logical row. 1.2 = allow 20% stretch in line spacing before a section break.
_ROW_PITCH_MULTIPLIER = 1.2

# Table boundary detection: vertical gap larger than this × H_med = section break.
_SECTION_GAP_FACTOR = 2.5

# Column detection: gap > this × median_word_width between left-edge clusters.
_COL_GAP_FACTOR = 1.5

# Minimum pixel gap between two distinct column clusters (at 200 DPI).
# Derived from A4 BCTC printing: columns are always separated by ≥1cm whitespace.
# At 200 DPI: 1cm = 79px. Using 80px as a round number with 1px headroom.
# DPI-DEPENDENT constant: calibrated at 200 DPI (the rasterization DPI used in
# extract_md_tables_usecase.py). If DPI changes, rescale this constant proportionally.
# AC-0: generic 200-DPI print geometry. No BCTC column semantics.
_MIN_INTER_COLUMN_GAP_PX = 80

# Histogram bin width for left-edge clustering: fraction of median word width.
_LEFT_EDGE_BIN_FACTOR = 0.3

# Minimum confidence from Tesseract to include a word (0–100 scale from TSV).
_MIN_WORD_CONF = 0

# Numeric value pattern: a token of ≥3 chars that looks like a number.
_NUMERIC_RE = re.compile(r"\d[\d.,]{2,}")

# ---------------------------------------------------------------------------
# DEFECT-B — Noise density gate constants (generic financial patterns)
#
# AC-0: all patterns below are GENERIC — they apply to any financial document
# with locale-agnostic number formatting. ZERO BCTC-specific string literals.
# ---------------------------------------------------------------------------

# Money-group pattern: N,NNN,NNN or N.NNN.NNN (at least one separator group).
# Locale-agnostic: works for both VN dot-thousands and comma-thousands formats.
# Derived from live FPT density profile: real tables have >= 6, noise <= 3.
_MONEY_GROUP_RE = re.compile(r"\d{1,3}(?:[.,]\d{3})+")

# K: minimum money-group matches for a region to be emitted as a table.
# Primary gate. Live data split is clean: real >= 6, noise <= 3, no 4-5 cases.
_MIN_MONEY_GROUPS = 6

# Three-digit standalone code pattern (e.g. 100, 200, 270, 300, 400, 440).
# Generic: these codes appear in income statement, cash flow, and segment
# tables of any BCTC document — not specific to balance sheet.
_CODE_LIKE_RE = re.compile(r"(?<!\d)\d{3}(?!\d)")

# J: minimum 3-digit code hits for the secondary gate (code-rich tables).
_MIN_CODE_HITS = 3

# Money-group floor for the secondary gate (code column + at least 1 value).
_MIN_MONEY_THIN = 1

# ---------------------------------------------------------------------------
# DEFECT-C — Header strip and label-coalescing constants
# ---------------------------------------------------------------------------

# Generic date pattern for column headers (DD/MM/YYYY — locale-agnostic).
# Matches: 31/12/2025, 1/6/2024, etc. No BCTC-specific semantics.
_DATE_HEADER_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")

# ---------------------------------------------------------------------------
# MD-EXTRACT-4 — Number-token-only y-clustering constants
#
# AC-0: all patterns below are GENERIC financial number formats.
# ZERO BCTC-specific string literals.
# ---------------------------------------------------------------------------

# NUMBER token classifier — matches generic financial number tokens:
#   - money groups: 1.234.567 / 1,234,567 / (1.234.567) / -1.234.567
#   - 2-3 digit standalone codes or small integers: 100 / 270 / -30
# TEXT tokens (labels, headers, units, prose) do NOT match.
# KEY INSIGHT: number tokens have uniform character height, no diacritics,
# clean shared baselines → ≤2px y-jitter. Label tokens have Vietnamese
# diacritics that inflate top by 2-4px, causing scatter if clustered together.
_NUMBER_TOKEN_RE = re.compile(
    r'^[\(\-]?\d{1,3}(?:[.,]\d{3})+[\)\-]?$'  # money group: 1.234.567 / (1,234)
    r'|^[\(\-]?\d{2,3}[\)\-]?$'               # 2-3 digit code or small int: 270 / 30
)

# Number-token y-clustering tolerance (pixels at 200 DPI).
# Number tokens on the same print row share a clean baseline with ≤2px jitter.
# Typical inter-row gap on dense financial statements: 8-12px.
# SAME_LINE_TOL=4 cleanly separates rows without false merges or scatter.
# Tunable: increase to 6 if LIVE-VERIFY shows split rows; decrease to 2 for false merges.
SAME_LINE_TOL: int = 4

# ---------------------------------------------------------------------------
# MD-EXTRACT-5 — D4b: Code vs value token discriminators
#
# CODE tokens: 2-3 digit standalone numbers (row codes: 100, 200, 270, 30, etc.)
# VALUE tokens: money-group format with at least one thousands-separator group.
# AC-0: purely numeric pattern matching — zero BCTC-specific label strings.
# ---------------------------------------------------------------------------

# CODE token: 2-3 digit standalone (with optional leading paren/minus, trailing paren/minus).
# Matches: 100, 270, 30, (30), -30  — never embedded in longer number strings.
_CODE_TOKEN_RE = re.compile(r'^[\(\-]?\d{2,3}[\)\-]?$')

# VALUE token: money-group format with at least one thousands-separator group.
# Matches: 1.234.567, 1,234,567, (1.234.567), 58.102.970.741.619 — not plain codes.
_VALUE_TOKEN_RE = re.compile(r'^\d{1,3}(?:[.,]\d{3})+')


# ---------------------------------------------------------------------------
# MD-EXTRACT-6 — Column-Anchor-First Ordinal Reconstruction constants
#
# AC-0: all constants below are GENERIC geometry parameters.
# ZERO BCTC-specific string literals or semantics.
# ---------------------------------------------------------------------------

# Maximum distance (as multiple of median_word_width) for assigning a number token
# to a column anchor. Tokens farther than this are noise — excluded from the grid.
_COL_ASSIGN_MAX_DIST_FACTOR = 3.0

# Skip-slot detection: a within-column gap exceeding this factor × local_pitch
# indicates a missing physical row. Insert ceil(gap/pitch)-1 empty rank slots.
SKIP_GAP_FACTOR = 1.5

# Minimum Tesseract word confidence for tokens entering the ordinal path.
# Filters low-confidence noise tokens before column assignment.
# Lower-confidence tokens are more likely OCR garbage that inflates rank counts.
_MIN_WORD_CONF_ORDINAL = 30

# Label attachment band: TEXT tokens within this factor × h_med of a row's y_median
# are considered label candidates for that row. Wider than MD-EXTRACT-5's 0.6 primary
# band because skewed pages may shift label top by up to half the row pitch.
LABEL_BAND_FACTOR = 1.5


# ---------------------------------------------------------------------------
# MD-EXTRACT-7-REV — Dense income-statement reconstruction constants
#
# AC-0: all constants below are GENERIC geometry parameters.
# ZERO BCTC-specific string literals or semantics.
# ---------------------------------------------------------------------------

# Threshold for classifying a column bucket as a pure-code column.
# A bucket is pure-code when: code_fraction >= this AND value_count == 0.
# Default=0.90: allows up to 10% OCR-noise non-code tokens in code columns.
# AC-0: uses _CODE_TOKEN_RE and _VALUE_TOKEN_RE, both generic numeric patterns.
PURE_CODE_COL_THRESHOLD = 0.90

# Dense-column threshold: when a value column has fewer than this many tokens,
# prefer the cross-column ref_pitch over its own local pitch in _insert_skip_slots.
# Prevents local_pitch contamination from large intra-column skip gaps.
# AC-0: pure geometry. Non-regressing on segment report (columns have 7+ tokens).
DENSE_COL_THRESHOLD = 6


# ---------------------------------------------------------------------------
# MD-EXTRACT-9 — Label-Row Ordinal Reconstruction constants
#
# AC-0: both constants are GENERIC 200-DPI print geometry. Zero BCTC label
# string semantics. Names derive from physical line-spacing geometry:
#   _LABEL_LINE_GAP_PX: any two OCR words within 15px vertical distance share
#       one physical print line (intra-line top variance ≤8px; inter-line gap
#       is 33-38px on dense A4 financial statements at 200 DPI).
#   _LABEL_HEADER_MARGIN_PX: a 20px margin above the first value row is the
#       zone containing column-header / date-band text fragments that are NOT
#       data label lines; 20px << typical inter-row pitch (36px) ensures no
#       data label line is accidentally excluded.
# DPI-DEPENDENT: calibrated at 200 DPI (rasterization DPI in
# extract_md_tables_usecase.py). If DPI changes, rescale proportionally.
# ---------------------------------------------------------------------------

# Vertical gap threshold (pixels) for greedy label-line clustering.
# Two consecutive text tokens whose top-gap exceeds this value belong to
# DIFFERENT physical print lines.
_LABEL_LINE_GAP_PX: int = 15

# Margin (pixels) above the first value-bearing row used to exclude column-header
# text fragments from the data label lines.
_LABEL_HEADER_MARGIN_PX: int = 20


# ---------------------------------------------------------------------------
# Pure helper: OCR text → readable markdown (§2.3)
# ---------------------------------------------------------------------------


def ocr_text_to_markdown(text: str) -> str:
    """
    Convert flat OCR text (from image_to_string output) to readable markdown.

    Pure function: no I/O, no Tesseract, no imports beyond stdlib.

    Algorithm:
        1. Split on newlines.
        2. Lines matching _is_recognized_section_header() → wrapped as ## Header.
        3. Blank lines → blank line (paragraph break).
        4. Lines with ≥4-char numeric data tokens → prefixed with "> " (blockquote).
        5. All other lines → plain paragraph text.

    This is a simple heuristic transform — it converts what is already stored in
    pdf_extracted_text to a more readable form. The full table reconstruction
    comes from the bbox path (Steps A-G in GenericMdTableExtractor).

    Args:
        text: Flat OCR text string (may be empty or None).

    Returns:
        Markdown-formatted string. Empty string if input is empty/None.
    """
    if not text:
        return ""

    lines = text.splitlines()
    output: List[str] = []

    for line in lines:
        stripped = line.strip()

        if not stripped:
            # Blank line → paragraph break
            output.append("")
            continue

        if _is_recognized_section_header(stripped):
            # Promote structural section headers to H2
            output.append(f"## {stripped}")
            continue

        # Numeric data lines (financial rows): blockquote for tabular feel
        if _NUMERIC_RE.search(stripped) and len(_NUMERIC_RE.findall(stripped)) >= 1:
            # Only blockquote lines that are predominantly data (have ≥1 numeric token
            # of ≥4 chars — avoids blockquoting single-digit section numbers)
            numeric_tokens = [t for t in _NUMERIC_RE.findall(stripped) if len(t) >= 4]
            if numeric_tokens:
                output.append(f"> {stripped}")
                continue

        # Default: plain paragraph text
        output.append(stripped)

    return "\n".join(output)


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


def _emit_markdown_table(grid: List[List[str]], n_header_rows: int) -> str:
    """
    Step G — Markdown pipe-table emission.

    Generates a GitHub-flavoured markdown pipe-table from the assembled grid.

    Rules:
      - Header rows are separated from data rows by a |---|...| separator.
      - Cell text: stripped, pipe characters escaped as \\|.
      - Empty cells rendered as single space.

    Args:
        grid:         2-D list of strings (Step E output).
        n_header_rows: Number of header rows (Step F output).

    Returns:
        Markdown pipe-table string, or empty string if grid is empty.
    """
    if not grid:
        return ""

    n_cols = len(grid[0]) if grid else 0
    if n_cols == 0:
        return ""

    def _cell(text: str) -> str:
        """Sanitize a cell value for markdown table emission."""
        cleaned = text.strip().replace("|", "\\|")
        return cleaned if cleaned else " "

    lines: List[str] = []

    for row_idx, row in enumerate(grid):
        # Pad/trim row to n_cols
        padded = list(row) + [" "] * (n_cols - len(row))
        padded = padded[:n_cols]
        line = "| " + " | ".join(_cell(c) for c in padded) + " |"
        lines.append(line)

        # Insert separator after the last header row.
        # D2 fix (MD-EXTRACT-5): valid GFM |---|---|---| (no doubled pipes).
        # Old (WRONG): "|" + "|".join(["---|"] * n) → |---||---||---| (doubled |)
        # New (CORRECT): "|" + "|".join(["---"] * n) + "|" → |---|---|---|
        if row_idx == n_header_rows - 1:
            separator = "|" + "|".join(["---"] * n_cols) + "|"
            lines.append(separator)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# DEFECT-B: density gate helper
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# DEFECT-C.1: leading header band stripper
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# DEFECT-C.2: label column coalescing
# ---------------------------------------------------------------------------


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

# ---------------------------------------------------------------------------
# LF constants — AC-0 compliant geometry parameters
# ---------------------------------------------------------------------------

# Tier 0 low-DPI rasterization: 50 DPI.
# An A4 page at 50 DPI ≈ 280×396 px ≈ 110KB RAM — cheap.
_TIER0_DPI: int = 50

# Gutter detection threshold: a column is a gutter if its dark-pixel sum
# drops below this fraction of the MAX dark-pixel sum WITHIN the ink bounding box.
# Using the ink-bbox max (not the global median) prevents page margins from
# dominating: the global median is near-zero on real pages (most columns are
# whitespace), so threshold ≈ 0 and only the far-margin pure-white columns
# qualify as "gutters" — producing one pseudo-column spanning 97% of the page.
_GUTTER_DARK_FRACTION: float = 0.15

# Ink bounding box: a column is "ink-bearing" if its dark-pixel sum exceeds
# this fraction of the global maximum. Used to clamp the gutter search to the
# actual text region, excluding leading/trailing page margins.
_INK_BBOX_MIN_FRACTION: float = 0.01

# Gutter position tolerance: two pages belong to the same unit if all gutter
# x-fractions differ by less than this value (as fraction of page width).
_GUTTER_POSITION_TOLERANCE: float = 0.05

# Row pitch change tolerance: a unit break fires if row_pitch changes by more
# than this fraction (50% change = significantly different row density).
_ROW_PITCH_CHANGE_TOLERANCE: float = 0.50

# Tier 1 minimum gutter width at 200 DPI (≈2.5mm at 200 DPI).
_MIN_GUTTER_WIDTH_PX: int = 20

# LF-FIX: minimum text column width at 200 DPI.
# A real BCTC table column is at minimum ~1cm wide = 80px at 200 DPI.
# Any "text column" narrower than this is margin noise or edge whitespace,
# NOT a real column. Gutters that would produce sub-threshold columns are
# rejected so that 20-30px slivers at the page margins are never accepted
# as column boundaries (the root cause of the pre-fix 97%-wide col_0 defect).
_MIN_TEXT_COL_WIDTH_PX: int = 80

# LF-FIX: same threshold scaled to 50 DPI (Tier 0 fingerprint).
# 80px at 200 DPI → 80 * 50/200 = 20px at 50 DPI.
_MIN_TEXT_COL_WIDTH_PX_50DPI: int = 20

# Tier 0 gutter threshold for the 50-DPI FINGERPRINT only.
# Uses a HIGHER fraction (40%) than Tier 1 (15%) so that only the deepest
# whitespace valleys — the structural column separators — are detected.
# Smaller intra-column gaps (e.g. between sparse number rows within one column)
# don't reach this level and are correctly ignored. This keeps the fingerprint
# consistent across consecutive pages of the same logical document section.
_GUTTER_DARK_FRACTION_50DPI: float = 0.40

# Tier 1 header band: top fraction of page typically containing headers.
_HEADER_BAND_FRACTION: float = 0.15

# Tier 1 footer band: bottom fraction of page typically containing footers.
_FOOTER_BAND_FRACTION: float = 0.10

# Row band darkness threshold: a row band is "text-dense" if its dark-pixel
# mean (in the vertical profile) exceeds this fraction of the maximum.
_ROW_BAND_DARKNESS_THRESHOLD: float = 0.20

# Tier 0 OCR text density gate: a page is considered "table" if it has
# at least this many money-group tokens in its stored OCR text.
_TABLE_PAGE_MIN_MONEY_GROUPS: int = 3

# Minimum number of gutter columns to classify a page as a table (Tier 0).
_TABLE_MIN_GUTTER_COUNT: int = 1


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
    # Step 2 + 3: Group pages into units by fingerprint continuity
    # ------------------------------------------------------------------
    units: List[Dict] = []
    current_unit_pages: List[int] = []
    current_fp: Optional[Dict] = None

    def _flush_unit() -> None:
        """Close the current unit and append to units list."""
        if not current_unit_pages:
            return
        # Determine unit page_type from the majority of page types
        type_counts: Dict[str, int] = {}
        for pn in current_unit_pages:
            pt = page_fingerprints[pn].get("page_type", "prose")
            type_counts[pt] = type_counts.get(pt, 0) + 1
        dominant_type = max(type_counts, key=lambda t: type_counts[t])

        unit_id = str(uuid.uuid4())
        units.append({
            "unit_id": unit_id,
            "schema_page": current_unit_pages[0],
            "pages": list(current_unit_pages),
            "page_type": dominant_type,
        })

    for page_num in range(1, total_pages + 1):
        fp = page_fingerprints[page_num]
        page_type = fp.get("page_type", "prose")

        if page_type == "blank":
            # Blank page: does NOT break a unit (page-gap tolerance).
            # Just append to current unit if one is open.
            if current_unit_pages:
                current_unit_pages.append(page_num)
            continue

        if current_fp is None:
            # Start first unit
            current_unit_pages = [page_num]
            current_fp = fp
            continue

        # Continuity test (AC-0: purely geometric)
        if _fingerprints_continuous(current_fp, fp):
            current_unit_pages.append(page_num)
            # Update current_fp with the latest (schema-page fingerprint stays
            # anchored — only used to test against continuation pages)
        else:
            # Break: close current unit, start new one
            _flush_unit()
            current_unit_pages = [page_num]
            current_fp = fp

    # Flush the last unit
    _flush_unit()

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

        # Page type: table if gutter_count >= _TABLE_MIN_GUTTER_COUNT
        # AND stored text has enough money-group tokens
        money_group_count = len(_MONEY_GROUP_RE.findall(stored_text or ""))
        gutter_count = len(gutter_x_positions)

        if not stored_text or stored_text.strip() == "":
            page_type = "blank"
        elif gutter_count >= _TABLE_MIN_GUTTER_COUNT and money_group_count >= _TABLE_PAGE_MIN_MONEY_GROUPS:
            page_type = "table"
        else:
            page_type = "prose"

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


def _fingerprints_continuous(fp_a: Dict, fp_b: Dict) -> bool:
    """
    Test if two page fingerprints belong to the same logical unit.

    Continuity test (AC-0 — purely geometric):
        1. gutter_count must be equal.
        2. Each gutter x-fraction must be within GUTTER_POSITION_TOLERANCE.
        3. row_pitch must not change by more than ROW_PITCH_CHANGE_TOLERANCE.

    If either fingerprint is blank, continuity is False (blank pages handled
    separately as page-gap tolerance in build_document_map).

    Returns True if the pages are in the same unit, False if a unit break fires.
    """
    if fp_a.get("page_type") == "blank" or fp_b.get("page_type") == "blank":
        return False

    gc_a = fp_a.get("gutter_count", 0)
    gc_b = fp_b.get("gutter_count", 0)

    # Gutter count change = new unit
    if gc_a != gc_b:
        return False

    # Gutter position shift > tolerance = new unit
    gx_a = fp_a.get("gutter_x_fractions", [])
    gx_b = fp_b.get("gutter_x_fractions", [])
    if len(gx_a) != len(gx_b):
        return False
    for xa, xb in zip(gx_a, gx_b):
        if abs(xa - xb) > _GUTTER_POSITION_TOLERANCE:
            return False

    # Row pitch change > 50% = new unit
    pitch_a = fp_a.get("row_pitch_px_at_50dpi", 0.0)
    pitch_b = fp_b.get("row_pitch_px_at_50dpi", 0.0)
    if pitch_a > 0 and pitch_b > 0:
        change = abs(pitch_a - pitch_b) / max(pitch_a, pitch_b)
        if change > _ROW_PITCH_CHANGE_TOLERANCE:
            return False

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

    AC-0: positional column IDs only. No BCTC semantic labels.
    """
    if not col_dark or width == 0:
        # Fallback: single full-width column
        return [{"col_id": "col_0", "x_min": 0, "x_max": width}]

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
        return [{"col_id": "col_0", "x_min": 0, "x_max": width}]

    # Threshold relative to the max within the ink region (not global median).
    # Valleys inside the ink bbox that drop below this level are real gutters.
    max_dark_in_region = max(ink_region) or 1
    gutter_threshold = max_dark_in_region * _GUTTER_DARK_FRACTION

    # LF-FIX: Collect raw gutter candidates — contiguous runs of low-ink columns
    # WITHIN the ink bbox only.
    # Do NOT flush an open gutter at the ink-right boundary: trailing whitespace
    # after the last text column is NOT a column separator. Only closed runs
    # (gutter immediately followed by more ink content) count as real gutters.
    # This prevents the 20-30px edge slivers from being accepted as columns.
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

    if not raw_gutter_ranges:
        # No inter-column gutters found within the ink bbox.
        # Return a single column spanning the ink bounding box.
        return [{"col_id": "col_0", "x_min": x_left, "x_max": x_right}]

    # LF-FIX: Filter out gutters that would produce sub-threshold text columns.
    # A gutter at position G is valid only if the text column on BOTH sides of G
    # is at least _MIN_TEXT_COL_WIDTH_PX wide. This rejects the 20-30px edge
    # slivers (e.g. page 3 col_2=1630-1653 with 23px width, page 4 col_0=0-25
    # with 25px width) that caused the schema-inheritance cascade failure.
    gutter_ranges: List[Tuple[int, int]] = []
    prev_col_start = x_left
    for gi, (g_start, g_end) in enumerate(raw_gutter_ranges):
        left_col_width = g_start - prev_col_start
        # Right column ends at the next gutter start or at ink right
        if gi + 1 < len(raw_gutter_ranges):
            right_col_end = raw_gutter_ranges[gi + 1][0] - 1
        else:
            right_col_end = x_right
        right_col_width = right_col_end - g_end
        if (left_col_width >= _MIN_TEXT_COL_WIDTH_PX
                and right_col_width >= _MIN_TEXT_COL_WIDTH_PX):
            gutter_ranges.append((g_start, g_end))
        prev_col_start = g_end + 1

    if not gutter_ranges:
        # All candidate gutters were adjacent to sub-threshold columns (edge noise).
        # Return a single column spanning the ink bounding box.
        return [{"col_id": "col_0", "x_min": x_left, "x_max": x_right}]

    # Build text column regions from the ink-bbox edges and the validated gutters.
    # The first column starts at x_left (ink left edge), the last ends at x_right.
    # Encoding: alternate text columns and gutter-whitespace columns so the OCR
    # layer can identify which regions contain text vs. whitespace.
    columns: List[Dict] = []
    col_idx = 0

    # Column from ink-left to the first gutter
    first_gutter_start = gutter_ranges[0][0]
    if first_gutter_start > x_left:
        columns.append({
            "col_id": f"col_{col_idx}",
            "x_min": x_left,
            "x_max": first_gutter_start - 1,
        })
        col_idx += 1

    # Gutter as column boundary + text region after it
    for i, (g_start, g_end) in enumerate(gutter_ranges):
        # Add the gutter as a (narrow whitespace) boundary column
        columns.append({
            "col_id": f"col_{col_idx}",
            "x_min": g_start,
            "x_max": g_end,
        })
        col_idx += 1

        # Text region from this gutter's right edge to next gutter's start
        # (or to ink-right if this is the last gutter)
        next_start = gutter_ranges[i + 1][0] if i + 1 < len(gutter_ranges) else x_right + 1
        if next_start > g_end + 1:
            columns.append({
                "col_id": f"col_{col_idx}",
                "x_min": g_end + 1,
                "x_max": next_start - 1,
            })
            col_idx += 1

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
        - Concatenate OCR text across page breaks as plain paragraph text.

    Args:
        unit:          Logical unit dict from DocumentMap.units.
        zones_by_page: Dict[page_number → PageZones] from Tier 1.
        pdf_path:      Absolute path to PDF.
        tmp_dir:       Temporary directory for intermediate PNGs.

    Returns:
        UnitOcrResult dict:
        {
            "unit_id":         "<uuid>",
            "page_numbers":    [3, 4, 5, 6],
            "stitched_markdown": "| col_0 | col_1 | ...",
            "row_count":       42,
            "page_row_spans":  [{"page": 3, "row_start": 0, "row_end": 14}, ...],
            "rows_for_gate":   [{"code": str, "label": str, "values": [...], "page": N}, ...],
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
    # ------------------------------------------------------------------
    if unit_page_type != "table":
        prose_lines: List[str] = []
        for page_num in sorted(pages_in_unit):
            page_zones = zones_by_page.get(page_num, {})
            # For prose, we don't need to do any OCR — stored text suffices
            # (the use case already has stored text; we emit an empty result
            # so Tier 3 doesn't quarantine prose units on balance-identity).
        return {
            "unit_id": unit_id,
            "page_numbers": pages_in_unit,
            "stitched_markdown": "\n".join(prose_lines),
            "row_count": 0,
            "page_row_spans": [],
            "rows_for_gate": [],
        }

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

            # ONE Tesseract pass per page (AC-LFE-6)
            # image_to_data returns word-level bounding boxes
            try:
                ocr_data = pytesseract.image_to_data(
                    page_img,
                    lang="vie+eng",
                    config="--psm 6",
                    output_type=pytesseract.Output.DICT,
                )
            except Exception as exc:
                logger.warning("ocr_unit: Tesseract failed for page %d: %s", page_num, exc)
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

                        # Build rows_for_gate entry
                        # First non-empty cell as code, second as label, rest as values
                        code_val: Optional[str] = None
                        label_val: Optional[str] = None
                        value_cells: List[Optional[str]] = []

                        for c_idx, cell in enumerate(row_cells):
                            if c_idx == 0:
                                code_val = cell.strip() or None
                            elif c_idx == 1:
                                label_val = cell.strip() or None
                            else:
                                value_cells.append(cell.strip() or None)

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
