# size-justification: ~330L — the public GenericMdTableExtractorPort implementation.
# FACTORY-PDF-split-generic-md-table Stage 8/8 (final — docs/architecture-briefs/
# 2026-06-15-maintainability-factory-audit.md). _process_page (the god-file's single
# largest method) is split into 3 named stage helpers matching the algorithm's own
# lettered steps (Step A tokenize, Step A2 classify+measure, Steps C5-G per-region
# reconstruct-and-emit) — behavior-preserving (same call order, same guard
# conditions, same log messages), verified via the full pytest suite (a per-region
# helper cannot be byte-diffed against the original loop body the way earlier
# stages' verbatim moves were, since the loop body becomes a standalone function).
# _process_page itself stays a bound method (test surface: tests call and
# monkeypatch extractor._process_page directly) delegating to the module-level stage
# helpers below it.
"""
infrastructure/generic_md_table/extractor.py — MD-EXTRACT-9 (Stage 8/8, final)

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

OCR substrate: pytesseract.image_to_data called on PIL Image objects already
rasterized at 200 DPI by the use case (same DPI as PdfOcrAdapter.ocr_pages).
Uses --psm 6 (same as OCR adapter — no drift).

DDD layer: infrastructure (calls Tesseract subprocess, reads PIL Image — impure).
    Fence-A prohibits imports from the application or interface layers.

Privacy: self-hosted Tesseract only. Zero network traffic. Zero external API.
         Images remain in-process; no cloud VLM/OCR.

Hardware guard: callers MUST pass images ONE AT A TIME (sequential for-loop).
    Never run multiple image_to_data calls concurrently.

See docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md for the
split approach (FACTORY-PDF-split-generic-md-table).
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from infrastructure.generic_md_table.constants import _MONEY_GROUP_RE
from infrastructure.generic_md_table.markdown_emit import (
    ocr_text_to_markdown,
    _emit_markdown_table,
)
from infrastructure.generic_md_table.grid_cleanup import (
    _median,
    _filter_words,
    _collapse_empty_columns,
    _detect_header_rows,
    _is_data_table,
    _strip_leading_header_bands,
    _coalesce_label_columns,
)
from infrastructure.generic_md_table.ordinal_grid import (
    _classify_tokens,
    _detect_table_regions,
    _detect_column_anchors_from_tokens,
    _assign_tokens_to_columns,
    _build_ordinal_grid,
    _cluster_text_into_label_lines,
    _exclude_pre_data_label_lines,
    _attach_labels_by_rank,
    _find_first_value_row_top,
    _exclude_header_tokens,
    _identify_pure_code_columns,
)
from infrastructure.tesseract_config import TESSERACT_LANG, TESSERACT_PSM6_CONFIG

logger = logging.getLogger(__name__)


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

        Delegates to the module-level stage helpers below (kept as a bound method —
        not a module-level function — because tests call/monkeypatch
        extractor._process_page directly as the test seam).
        """
        # Step A — Collect per-word bboxes via image_to_data (TSV mode).
        data = _stage_a_tokenize(page_image, pytesseract, Output)
        if data is None:
            return []

        words = _filter_words(data)
        if not words:
            return []

        # Step A2 — Classify tokens into NUMBER tokens and TEXT tokens; compute
        # median word height/width from NUMBER tokens only (clean baselines).
        number_tokens, text_tokens, h_med, median_word_width = _stage_a2_classify_and_measure(words)
        if not number_tokens or h_med <= 0:
            return []

        # Step B — Detect table regions on NUMBER tokens only.
        table_regions = _detect_table_regions(number_tokens, h_med)
        if not table_regions:
            return []

        page_tables: List[str] = []

        for region_num_tokens in table_regions:
            md_table = _process_table_region(
                region_num_tokens, text_tokens, h_med, median_word_width
            )
            if md_table:
                page_tables.append(md_table)

        return page_tables


# ---------------------------------------------------------------------------
# Named stage helpers — _process_page split by algorithm step (Stage 8/8)
# ---------------------------------------------------------------------------


def _stage_a_tokenize(page_image: object, pytesseract: object, Output: object) -> Optional[Dict]:
    """Step A — Collect per-word bboxes via pytesseract.image_to_data (TSV mode)."""
    try:
        return pytesseract.image_to_data(  # type: ignore[attr-defined]
            page_image,
            lang=TESSERACT_LANG,
            config=TESSERACT_PSM6_CONFIG,
            output_type=Output.DICT,  # type: ignore[attr-defined]
        )
    except Exception as exc:
        logger.warning(
            "GenericMdTableExtractor._process_page: image_to_data failed: %s — skipping",
            exc,
        )
        return None


def _stage_a2_classify_and_measure(
    words: List[Dict],
) -> Tuple[List[Dict], List[Dict], float, float]:
    """
    Step A2 — Classify filtered words into NUMBER/TEXT tokens and compute median
    word height/width from NUMBER tokens only (clean baselines, no diacritic jitter).

    Returns (number_tokens, text_tokens, h_med, median_word_width). An empty
    number_tokens list signals "no number tokens on page — skip" (already logged
    here, matching the original inline behavior).
    """
    number_tokens, text_tokens = _classify_tokens(words)

    if not number_tokens:
        logger.debug(
            "GenericMdTableExtractor: no number tokens on page — skipping"
        )
        return [], [], 0.0, 0.0

    num_heights = [float(w["height"]) for w in number_tokens if w["height"] > 0]
    num_widths = [float(w["width"]) for w in number_tokens if w["width"] > 0]
    h_med = _median(num_heights) if num_heights else 12.0
    median_word_width = _median(num_widths) if num_widths else 40.0

    return number_tokens, text_tokens, h_med, median_word_width


def _process_table_region(
    region_num_tokens: List[Dict],
    text_tokens: List[Dict],
    h_med: float,
    median_word_width: float,
) -> Optional[str]:
    """
    Steps C5-G — reconstruct and emit one markdown pipe-table for a single
    table region detected by Step B (_detect_table_regions).

    Returns the markdown table string, or None if this region should be
    skipped (any guard/gate below fails — matches the original per-region
    `continue` semantics inside the _process_page loop).
    """
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
        return None

    # Guard: too few number tokens to build a meaningful grid
    if len(clean_number_tokens) < 4:
        return None

    # Step C7 — Assign each CLEAN NUMBER token to nearest x-column-anchor.
    # NO y-comparison. The entire row assignment is deferred to ordinal ranking.
    col_buckets = _assign_tokens_to_columns(
        clean_number_tokens, col_anchors, median_word_width
    )

    # Guard: all tokens filtered as noise → no grid possible
    if not any(col_buckets):
        return None

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
        return None

    n_value_cols = len(value_col_buckets)

    # Steps C8+C8.5+C9+C10 — Build 2D grid via ordinal rank-alignment.
    # Handles mid/trailing empty cells via within-column gap detection.
    # Dense-multi-gap fix (REV-6): prefer_ref_pitch=True for sparse columns.
    grid, col_y_medians = _build_ordinal_grid(value_col_buckets, n_value_cols)
    if not grid:
        return None

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
    # first_value_top already computed above (Step C5).
    data_label_lines, _data_ymeds = _exclude_pre_data_label_lines(
        all_label_lines, label_line_ymeds, first_value_top
    )

    # Step C10.7 / C11 (MD-EXTRACT-9) — Ordinal-rank label assignment.
    # Replaces the scalar-band _attach_labels_ordinal for this call site.
    # data_label_lines[k] pairs with grid[k] by direct index — no y-comparison.
    # code_note_tokens are re-attached per-rank (within 30px of label y-median).
    grid = _attach_labels_by_rank(grid, data_label_lines, code_note_tokens, h_med)
    if not grid:
        return None

    # Post-processing pipeline (Steps G — substrate-agnostic, UNCHANGED):
    # Strip leading letterhead/noise rows above first money-group or date row.
    grid = _strip_leading_header_bands(grid)
    if not grid:
        logger.debug(
            "GenericMdTableExtractor: grid empty after header strip — skipping"
        )
        return None

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
        return None

    # Header row detection.
    n_header_rows = _detect_header_rows(grid)
    if n_header_rows == 0:
        return None

    # Markdown pipe-table emission.
    md_table = _emit_markdown_table(grid, n_header_rows)
    if md_table:
        logger.debug(
            "GenericMdTableExtractor: emitted table (MD-EXTRACT-6 ordinal path): "
            "%d rows × %d cols (money_groups=%d)",
            n_rows,
            n_cols_grid,
            len(_MONEY_GROUP_RE.findall(" ".join(c for r in grid for c in r))),
        )

    return md_table or None
