"""
infrastructure/generic_md_table_extractor.py — MD-EXTRACT

GenericMdTableExtractor: bbox-based generic table detector + markdown emitter.

Implements GenericMdTableExtractorPort (domain/modules/financial_reports/ports.py).

Algorithm (per-page):
    Step A — Per-word bbox collection via pytesseract.image_to_data (TSV/DICT mode).
    Step B — Table boundary detection: vertical gap histogram separates preamble
             from table body; multi-table pages produce separate regions.
    Step C — Row clustering: y-band greedy merge (0.5 × H_med tolerance).
    Step D — Column detection: left-edge histogram, 1.5 × median_word_width gap threshold.
    Step E — Grid assembly: 2-D list[row][col] = cell_text.
    Step F — Header detection: first 1-2 rows when no numeric tokens in row 0.
    Step G — Markdown pipe-table emission: | header | ... |\\n|---|...\\n| cell | ...

OCR substrate: pytesseract.image_to_data called on PIL Image objects already
rasterized at 200 DPI by the use case (same DPI as PdfOcrAdapter.ocr_pages).
Uses --psm 6 for consistent line-by-line layout (same as OCR adapter — never drift).

DDD layer: infrastructure (calls Tesseract subprocess, reads PIL Image — impure).
    DDD: may import from domain/primitives and infrastructure/. Fence-A prohibits
         imports from the application or interface layers.

Privacy: self-hosted Tesseract only. Zero network traffic. Zero external API.
         Images remain in-process; no cloud VLM/OCR. Same privacy guarantee as
         PdfOcrAdapter.ocr_pages.

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

# Prose page filter: if col_count == 1 and row_count > this threshold, treat
# as prose (not a table) and emit only via ocr_as_markdown path.
_PROSE_ROW_THRESHOLD = 15


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
    Step C — Row clustering via greedy y-band merge.

    Groups words into rows: a new row starts when the next word's top coordinate
    exceeds the current row's max(top + height) by more than 0.5 × H_med.
    This tolerates multi-line cells and OCR baseline jitter.

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

        Each detected table region on the page produces one entry.
        Prose regions (1-column, > _PROSE_ROW_THRESHOLD rows) are filtered out.
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

        # Compute median word height and width for geometry thresholds
        heights = [float(w["height"]) for w in words if w["height"] > 0]
        widths = [float(w["width"]) for w in words if w["width"] > 0]
        h_med = _median(heights)
        median_word_width = _median(widths)

        if h_med <= 0:
            return []

        # Step B — Detect table regions (vertical gap histogram)
        table_regions = _detect_table_regions(words, h_med)
        if not table_regions:
            return []

        page_tables: List[str] = []

        for region_words in table_regions:
            # Step C — Row clustering
            rows = _cluster_rows(region_words, h_med)
            if not rows:
                continue

            # Step D — Column anchor detection
            col_anchors = _detect_column_anchors(rows, median_word_width)
            n_cols = len(col_anchors)

            # Step E — Grid assembly
            grid = _assign_columns(rows, col_anchors)
            n_rows = len(grid)

            # Post-filter: 1-column, many rows → prose page (not a table)
            if n_cols == 1 and n_rows > _PROSE_ROW_THRESHOLD:
                logger.debug(
                    "GenericMdTableExtractor: prose filter: region has %d rows "
                    "and 1 column — treating as prose, skipping pipe-table emit",
                    n_rows,
                )
                continue

            # Step F — Header row detection
            n_header_rows = _detect_header_rows(grid)
            if n_header_rows == 0:
                continue

            # Step G — Markdown pipe-table emission
            md_table = _emit_markdown_table(grid, n_header_rows)
            if md_table:
                page_tables.append(md_table)
                logger.debug(
                    "GenericMdTableExtractor: emitted table: %d rows × %d cols",
                    n_rows,
                    n_cols,
                )

        return page_tables
