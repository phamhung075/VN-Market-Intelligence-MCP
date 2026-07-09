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
from infrastructure.generic_md_table.ordinal_grid import (  # noqa: F401 (re-export parity)
    _classify_tokens,
    _cluster_number_rows,
    _estimate_inter_row_pitch,
    _cluster_number_rows_adaptive,
    _attach_labels,
    _build_grid_from_number_rows,
    _detect_column_anchors_from_tokens,
    _assign_tokens_to_columns,
    _insert_skip_slots,
    _build_ordinal_grid,
    _attach_labels_ordinal,
    _cluster_text_into_label_lines,
    _exclude_pre_data_label_lines,
    _attach_labels_by_rank,
    _find_first_value_row_top,
    _exclude_header_tokens,
    _identify_pure_code_columns,
    _detect_table_regions,
)


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





from infrastructure.generic_md_table.document_map import (  # noqa: F401 (re-export parity)
    build_document_map,
    _compute_page_fingerprint_50dpi,
    _blank_fingerprint,
    _estimate_row_pitch,
    _extract_unit_hints,
    _is_title_band,
    _find_ink_bbox,
    _fingerprints_continuous,
)
from infrastructure.generic_md_table.page_zoning import (  # noqa: F401 (re-export parity)
    zone_page,
    _scan_gutter_ranges,
    _build_column_regions,
    _detect_column_gutters_200dpi,
    _detect_row_bands,
)
from infrastructure.generic_md_table.unit_ocr import (  # noqa: F401 (re-export parity)
    _tesseract_image_to_data,
    ocr_unit,
    _build_word_records,
    _band_has_numeric_content,
    _extract_cell_text,
    _empty_unit_result,
)



