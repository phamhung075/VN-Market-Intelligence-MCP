# size-justification: 444L — Tier 1 (LF-EXTRACT) page zoning: zone_page() (129L) +
# _detect_column_gutters_200dpi() (77L, standard pass + FU-ORPHAN-TOLERANCE dense-page
# fallback pass, sharing _scan_gutter_ranges/_build_column_regions) + _detect_row_bands
# (67L). FACTORY-PDF-split-generic-md-table Stage 6/8 — one cohesive Tier-1 pipeline,
# matches the task's approved module list.
"""
infrastructure/generic_md_table/page_zoning.py — LF-EXTRACT Tier 1 (Stage 6/8)

Tier 1: zone_page() decomposes one 200-DPI page image into geometric zones
(header/footer bands, column gutters, row bands) — either detected fresh (for
a unit's schema-page) or inherited from the schema-page (for continuation pages,
the schema-inheritance mechanism that fixes the missing-header continuation-page
scramble).

    zone_page(page_img, unit_schema, ...)   — public entry point (injected into
                                               ExtractLayoutFirstUseCase at the
                                               composition root, main.py).
    _detect_column_gutters_200dpi(...)      — column gutter detection (schema-pages).
    _scan_gutter_ranges / _build_column_regions — shared helpers reused by the
                                               standard pass and the dense-page
                                               fallback pass (FU-ORPHAN-TOLERANCE).
    _detect_row_bands(...)                  — text-dense/sparse row-band detection.

Cross-module import: _find_ink_bbox is shared between Tier 0 (document_map.py,
the 50-DPI fingerprint) and Tier 1 (this module, the 200-DPI zone detector) — both
clamp their gutter-valley search to the ink bounding box. Defined once in
document_map.py, imported here (one-directional: page_zoning -> document_map, no
import cycle).

AC-LFE-6: NO Tesseract calls in this module — PIL pixel ops only.

DDD layer: infrastructure (PIL pixel ops on an already-rasterized page image).

See docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md for the
split approach (FACTORY-PDF-split-generic-md-table).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from infrastructure.generic_md_table.constants import (
    _HEADER_BAND_FRACTION,
    _FOOTER_BAND_FRACTION,
    _MIN_GUTTER_WIDTH_PX,
    _MAX_INTER_GUTTER_GAP_PX,
    _MIN_TEXT_COL_WIDTH_PX,
    _GUTTER_DARK_FRACTION,
    _GUTTER_DARK_FRACTION_DENSE,
    _ROW_BAND_DARKNESS_THRESHOLD,
)
from infrastructure.generic_md_table.document_map import _find_ink_bbox

logger = logging.getLogger(__name__)


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

