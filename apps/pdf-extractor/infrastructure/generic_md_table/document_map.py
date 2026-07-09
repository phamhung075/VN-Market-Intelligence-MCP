# size-justification: ~640L — Tier 0 (LF-EXTRACT) document-map construction: per-page
# 50-DPI geometric fingerprinting + fingerprint-continuity unit grouping.
# FACTORY-PDF-split-generic-md-table Stage 5/8 (docs/architecture-briefs/
# 2026-06-15-maintainability-factory-audit.md). build_document_map() and
# _compute_page_fingerprint_50dpi() are the two largest functions (186L/199L) and
# form one linear pipeline (build_document_map calls _compute_page_fingerprint_50dpi
# per page, then _fingerprints_continuous per adjacent pair); the remaining five
# helpers (_blank_fingerprint, _estimate_row_pitch, _extract_unit_hints,
# _is_title_band, _find_ink_bbox) are private leaf helpers used only within this
# Tier-0 pipeline. Kept as one file matching the task's approved module list.
"""
infrastructure/generic_md_table/document_map.py — LF-EXTRACT Tier 0 (Stage 5/8)

Tier 0: build_document_map() scans all pages, groups consecutive pages into
logical units by geometric column-fingerprint continuity (50-DPI projection
profile) as the SOLE spine — title/hint text is metadata only (AC-0).

    build_document_map(pages, pdf_path)      — public entry point (injected into
                                                ExtractLayoutFirstUseCase at the
                                                composition root, main.py).
    _compute_page_fingerprint_50dpi(...)      — per-page geometric fingerprint.
    _fingerprints_continuous(fp_a, fp_b, ...) — unit-continuity test between pages.
    _blank_fingerprint / _estimate_row_pitch / _extract_unit_hints / _is_title_band /
    _find_ink_bbox                            — pure leaf helpers.

AC-LFE-6: NO Tesseract calls in this module — PIL pixel ops + stored OCR text only.

DDD layer: infrastructure (PIL pixel ops — impure I/O via pdf2image.convert_from_path).

See docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md for the
split approach (FACTORY-PDF-split-generic-md-table).
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from infrastructure.generic_md_table.constants import (
    _TIER0_DPI,
    _GUTTER_DARK_FRACTION_50DPI,
    _INK_BBOX_MIN_FRACTION,
    _GUTTER_POSITION_TOLERANCE,
    _ROW_PITCH_CHANGE_TOLERANCE,
    _MIN_TEXT_COL_WIDTH_PX_50DPI,
    _MONEY_GROUP_RE,
    _CODE_LIKE_RE,
    _DATE_HEADER_RE,
    _TABLE_PAGE_MIN_MONEY_GROUPS,
    _ACCOUNT_CODE_MIN_FOR_TABLE,
    _DATE_HEADER_MIN_FOR_TABLE,
    _ALLOW_PROSE_IN_TABLE_UNIT,
    _TITLE_BAND_SCAN_LINES,
    _TITLE_BAND_MIN_LEN,
    _TITLE_BAND_MAX_LEN,
    _CONTINUATION_MARKERS,
    _BCTC_MONEY_GROUP_RE,
)

logger = logging.getLogger(__name__)


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

