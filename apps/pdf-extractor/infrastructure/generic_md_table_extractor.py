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
