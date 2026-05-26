"""
infrastructure/generic_md_table_extractor.py — MD-EXTRACT-4

GenericMdTableExtractor: number-token-2D generic table detector + markdown emitter.

Implements GenericMdTableExtractorPort (domain/modules/financial_reports/ports.py).

Algorithm (per-page) — MD-EXTRACT-4 NUMBER-TOKEN-ONLY PATH:
    Step A — Collect per-word bboxes via pytesseract.image_to_data (TSV/DICT mode).
    Step A2 — Classify tokens: NUMBER tokens (digits/money-groups) vs TEXT tokens (labels).
    Step B — Detect table regions on NUMBER tokens only (≥4 number tokens).
    Step C — Cluster NUMBER tokens into rows by y using SAME_LINE_TOL=4px.
             NUMBER tokens have clean baselines (no diacritic inflation) — ≤2px jitter.
    Step D — Derive column anchors from NUMBER token x (left) positions.
    Step E — Build number grid: each row = [number tokens in their column slots].
    Step F — Attach labels: for each number-row y-band find nearest TEXT tokens.
    Step G — Post-processing: strip_header_bands → coalesce_labels → collapse_empty
             → density gate → header detection → markdown emission.

Root-cause of MD-EXTRACT-1/2/3 failures (DUAL-PATH DRIFT #5):
    Clustering ALL tokens (labels + numbers) by y failed because Vietnamese-diacritic
    label tokens have inflated top values (2-4px diacritic overhang), making them
    scatter across y-bands. Number tokens have clean, uniform baselines.
    Fix: cluster NUMBER tokens ONLY by y; attach TEXT label tokens afterwards.

Dead-code notes:
    _cluster_rows and _cluster_rows_by_gap are DEAD in MD-EXTRACT-4.
    Kept for backward compatibility with existing unit tests. DO NOT REMOVE.
    Candidate-2 (psm-6 line-text path) functions were CANCELLED per architect ruling
    2026-05-26: psm-6 linearizes BCTC wide tables in column-major order, making
    row-aligned splitting impossible. All cancelled functions are absent from this file.

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
import re
from typing import Dict, List, Optional

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
    Group number tokens into rows by y-coordinate using SAME_LINE_TOL.

    Because number tokens have ≤2px y-jitter and the typical inter-row gap is
    8-12px, SAME_LINE_TOL=4 cleanly separates rows without false merges.

    This replaces _cluster_rows / _cluster_rows_by_gap for the number-token path.
    The prior functions clustered ALL tokens (labels + numbers), so Vietnamese-
    diacritic label tokens inflated y-band boundaries causing scatter.

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


def _attach_labels(
    row_groups: List[List[Dict]],
    text_tokens: List[Dict],
    h_med: float,
) -> List[tuple]:
    """
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
    Assign number tokens + labels to (row_idx, col_idx) cells.

    Grid layout: column 0 = label cell, columns 1..N = number-token columns
    ordered by col_anchors.

    For each number token in a row, assign to nearest col_anchor (by left distance).
    The label cell is prepended as column 0.

    Pure function: no I/O, no Tesseract, no DB.

    AC-0: geometry only — zero BCTC-specific constants.

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
        # Initialize: label + N value slots
        cell_words: List[List[str]] = [[] for _ in range(n_val_cols)]

        for w in row_tokens:
            left = float(w["left"])
            # Assign to nearest col_anchor
            distances = [abs(left - anchor) for anchor in col_anchors]
            nearest_col = distances.index(min(distances))
            cell_words[nearest_col].append(w["text"])

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
    Column anchor detection from a flat list of word tokens (not row-grouped).

    Used in the MD-EXTRACT-4 number-token path where column anchors are derived
    from NUMBER tokens only (not ALL tokens). The original _detect_column_anchors
    takes row-grouped word lists; this variant accepts a flat token list.

    Algorithm: same as _detect_column_anchors but accepts List[Dict] directly.
    Collects all token left-edges, bins them, clusters by gap threshold.

    Pure function.

    AC-0: geometry only.

    Args:
        tokens:            Flat list of word dicts (each has "left" key).
        median_word_width: Median word width (pixels) for gap threshold.

    Returns:
        Sorted list of column anchor x-positions. Returns [0.0] if no tokens.
    """
    if not tokens or median_word_width <= 0:
        return [0.0]

    all_lefts = sorted(float(w["left"]) for w in tokens)
    if not all_lefts:
        return [0.0]

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

    cluster_anchors = [sum(c) / len(c) for c in clusters]

    col_gap = _COL_GAP_FACTOR * median_word_width
    merged: List[float] = [cluster_anchors[0]]
    for anchor in cluster_anchors[1:]:
        if anchor - merged[-1] > col_gap:
            merged.append(anchor)

    return merged


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
    cluster_anchors = [sum(c) / len(c) for c in clusters]

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

        # Insert separator after the last header row
        if row_idx == n_header_rows - 1:
            separator = "|" + "|".join(["---|"] * n_cols)
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

        MD-EXTRACT-4 NUMBER-TOKEN-ONLY PATH:
        Classify tokens → cluster number rows by y → detect col anchors from numbers
        → attach labels → build grid → post-process → density gate → emit markdown.

        Root-cause fix: prior cycles clustered ALL tokens (labels + numbers) by y.
        Vietnamese-diacritic label tokens have inflated top (2-4px diacritic overhang)
        causing scatter across y-bands. NUMBER tokens have clean shared baselines.
        Solution: cluster NUMBER tokens only; attach TEXT labels afterwards.

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
        # This separation eliminates diacritic-inflated top values from clustering.
        number_tokens, text_tokens = _classify_tokens(words)

        if not number_tokens:
            # No numeric content — not a table page
            logger.debug(
                "GenericMdTableExtractor: no number tokens on page — skipping"
            )
            return []

        # Compute median word height from NUMBER tokens only (clean baselines).
        # Using number tokens for h_med avoids diacritic inflation from label tokens.
        num_heights = [float(w["height"]) for w in number_tokens if w["height"] > 0]
        num_widths = [float(w["width"]) for w in number_tokens if w["width"] > 0]
        h_med = _median(num_heights) if num_heights else 12.0
        median_word_width = _median(num_widths) if num_widths else 40.0

        if h_med <= 0:
            return []

        # Compute SAME_LINE_TOL: per brief §3.3 — min(4, h_med * 0.3).
        # SAME_LINE_TOL=4 is already the right value at 200 DPI for typical BCTC
        # financials (h_med ≈ 14-18px → 0.3 × h_med ≈ 4-5px).
        same_line_tol = min(SAME_LINE_TOL, int(h_med * 0.3)) if h_med > 0 else SAME_LINE_TOL

        # Step B — Detect table regions on NUMBER tokens only.
        # Using number tokens avoids including prose preamble in region boundaries.
        table_regions = _detect_table_regions(number_tokens, h_med)
        if not table_regions:
            return []

        page_tables: List[str] = []

        for region_num_tokens in table_regions:
            # Find TEXT tokens within the region's vertical extent (± h_med margin)
            # to allow label attachment for rows near region boundaries.
            region_top = min(w["top"] for w in region_num_tokens)
            region_bot = max(w["top"] + w["height"] for w in region_num_tokens)
            region_text_tokens = [
                t for t in text_tokens
                if (region_top - h_med) <= t["top"] <= (region_bot + h_med)
            ]

            # Step C — Cluster NUMBER tokens into rows by y using SAME_LINE_TOL.
            # Number tokens have ≤2px y-jitter → clean row separation at tol=4.
            row_groups = _cluster_number_rows(region_num_tokens, same_line_tol)
            if not row_groups:
                continue

            # Step D — Derive column anchors from NUMBER token x (left) positions.
            # Using number tokens only: their left-edges align on grid columns.
            col_anchors = _detect_column_anchors_from_tokens(
                region_num_tokens, median_word_width
            )
            if not col_anchors:
                continue

            # Step F — Attach labels: for each number-row y-band find nearest TEXT tokens.
            labeled_rows = _attach_labels(row_groups, region_text_tokens, h_med)
            if not labeled_rows:
                continue

            # Step E — Build 2D grid: [label, col0_val, col1_val, ..., colN_val]
            grid = _build_grid_from_number_rows(labeled_rows, col_anchors)
            if not grid:
                continue

            # Post-processing pipeline (substrate-agnostic helpers — UNCHANGED):
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
            n_cols = len(grid[0]) if grid else 0

            # Density gate: reject prose/letterhead regions with < K money-groups.
            if not _is_data_table(grid):
                logger.debug(
                    "GenericMdTableExtractor: density gate rejected region: "
                    "rows=%d cols=%d — treating as non-table prose",
                    n_rows,
                    n_cols,
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
                    "GenericMdTableExtractor: emitted table (MD-EXTRACT-4 number-token path): "
                    "%d rows × %d cols (money_groups=%d, same_line_tol=%d)",
                    n_rows,
                    n_cols,
                    len(_MONEY_GROUP_RE.findall(" ".join(c for r in grid for c in r))),
                    same_line_tol,
                )

        return page_tables
