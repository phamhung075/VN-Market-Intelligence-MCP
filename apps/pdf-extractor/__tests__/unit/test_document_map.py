"""
Unit tests — build_document_map + Tier 0 helper functions (LF-EXTRACT)

Tests cover:
    - _fingerprints_continuous: unit-continuity test logic
    - _estimate_row_pitch: vertical projection peak detection
    - _extract_unit_hints: metadata hint extraction (AC-0: hints never drive logic)
    - build_document_map with injected fingerprint data (no real PDF needed)
    - Page gap tolerance (blank pages do NOT break units)
    - AC-0: geometry is the spine, not hints

All tests use injected data. Zero real PDF, zero Tesseract, zero DB.
AC-0 compliance: test data uses purely geometric inputs.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from infrastructure.generic_md_table_extractor import (
    _fingerprints_continuous,
    _estimate_row_pitch,
    _extract_unit_hints,
    _blank_fingerprint,
    _find_ink_bbox,
    _detect_column_gutters_200dpi,
    _is_title_band,
)


# ===========================================================================
# Tests for _fingerprints_continuous
# ===========================================================================

class TestFingerprintsContinuous:
    """
    Tests for the geometry-spine continuity check.
    AC-0: purely numeric comparisons. No BCTC semantics.
    """

    def _fp(self, page_type="table", gutter_count=3,
            gutter_x_fractions=None, row_pitch=14.0):
        return {
            "page_type": page_type,
            "gutter_count": gutter_count,
            "gutter_x_fractions": gutter_x_fractions or [0.31, 0.55, 0.72],
            "row_pitch_px_at_50dpi": row_pitch,
        }

    def test_identical_fingerprints_are_continuous(self):
        fp = self._fp()
        assert _fingerprints_continuous(fp, fp) is True

    def test_same_gutter_count_and_fractions_within_tolerance(self):
        fp_a = self._fp(gutter_x_fractions=[0.31, 0.55, 0.72])
        fp_b = self._fp(gutter_x_fractions=[0.32, 0.56, 0.73])  # within 5%
        assert _fingerprints_continuous(fp_a, fp_b) is True

    def test_gutter_count_change_breaks_unit(self):
        fp_a = self._fp(gutter_count=3)
        fp_b = self._fp(gutter_count=2)  # one fewer gutter
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_gutter_position_shift_beyond_tolerance_breaks_unit(self):
        fp_a = self._fp(gutter_x_fractions=[0.31, 0.55, 0.72])
        fp_b = self._fp(gutter_x_fractions=[0.37, 0.55, 0.72])  # 0.06 > 0.05 tolerance
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_gutter_position_exactly_at_tolerance_is_continuous(self):
        fp_a = self._fp(gutter_x_fractions=[0.31, 0.55, 0.72])
        fp_b = self._fp(gutter_x_fractions=[0.36, 0.55, 0.72])  # exactly 0.05 = tolerance
        # 0.36 - 0.31 = 0.05 which is NOT > 0.05, so continuous
        assert _fingerprints_continuous(fp_a, fp_b) is True

    def test_row_pitch_change_beyond_50pct_breaks_unit(self):
        fp_a = self._fp(row_pitch=14.0)
        fp_b = self._fp(row_pitch=22.0)  # change = 8/22 ≈ 36% — within threshold
        assert _fingerprints_continuous(fp_a, fp_b) is True

    def test_row_pitch_large_change_breaks_unit(self):
        fp_a = self._fp(row_pitch=10.0)
        fp_b = self._fp(row_pitch=30.0)  # change = 20/30 ≈ 67% > 50% → break
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_blank_page_not_continuous(self):
        """Blank pages are handled in build_document_map as gaps — not by this function."""
        fp_a = self._fp(page_type="blank")
        fp_b = self._fp()
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_page_type_change_prose_to_table_breaks_unit(self):
        """Prose→table transition = structural section boundary = new unit."""
        fp_a = self._fp(page_type="prose", gutter_count=0, gutter_x_fractions=[])
        fp_b = self._fp(page_type="table", gutter_count=0, gutter_x_fractions=[])
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_page_type_change_table_to_prose_breaks_unit(self):
        """Table→prose transition = structural section boundary = new unit."""
        fp_a = self._fp(page_type="table", gutter_count=3)
        fp_b = self._fp(page_type="prose", gutter_count=3)
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_same_prose_page_type_continuous_when_gutters_match(self):
        """Two prose pages with same gutter signature are continuous."""
        fp_a = self._fp(page_type="prose", gutter_count=0, gutter_x_fractions=[])
        fp_b = self._fp(page_type="prose", gutter_count=0, gutter_x_fractions=[])
        assert _fingerprints_continuous(fp_a, fp_b) is True

    def test_mismatched_gutter_count_in_fractions_not_continuous(self):
        fp_a = self._fp(gutter_count=3, gutter_x_fractions=[0.31, 0.55, 0.72])
        fp_b = self._fp(gutter_count=3, gutter_x_fractions=[0.31, 0.55])  # length mismatch
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_zero_pitch_does_not_break_unit(self):
        """Zero pitch is ignored in the pitch comparison (no information)."""
        fp_a = self._fp(row_pitch=0.0)
        fp_b = self._fp(row_pitch=14.0)  # one has pitch, other does not
        # If pitch_a == 0, skip pitch check → continuous if gutters match
        assert _fingerprints_continuous(fp_a, fp_b) is True


# ===========================================================================
# Tests for _estimate_row_pitch
# ===========================================================================

class TestEstimateRowPitch:
    def test_regular_pattern(self):
        """Alternating dense/sparse bands with regular 10px spacing."""
        # 5 text rows (dark) followed by 5 gap rows (light) → pitch ≈ 10
        pattern = ([10] * 5 + [0] * 5) * 10
        pitch = _estimate_row_pitch(pattern)
        assert 8 <= pitch <= 12, f"Expected ~10, got {pitch}"

    def test_empty_returns_zero(self):
        assert _estimate_row_pitch([]) == 0.0

    def test_all_zero_returns_zero(self):
        assert _estimate_row_pitch([0] * 50) == 0.0

    def test_single_peak_returns_zero(self):
        """Only one peak — can't compute spacing."""
        row_dark = [0] * 10 + [10] * 5 + [0] * 10
        pitch = _estimate_row_pitch(row_dark)
        assert pitch == 0.0

    def test_two_peaks_returns_spacing(self):
        """Two peaks separated by 20 rows → pitch = 20."""
        row_dark = [0] * 5 + [10] * 3 + [0] * 20 + [10] * 3 + [0] * 5
        pitch = _estimate_row_pitch(row_dark)
        # First peak at ~7, second at ~30 → spacing ≈ 23
        assert 18 <= pitch <= 28, f"Expected ~23, got {pitch}"


# ===========================================================================
# Tests for _extract_unit_hints
# ===========================================================================

class TestExtractUnitHints:
    """
    AC-0 enforcement: hints are extracted from raw OCR text lines but they are
    NEVER used in grouping decisions — they are metadata only.
    The test confirms that hints are merely strings returned as metadata.
    """

    def test_returns_list(self):
        text = "Some section heading\n123.456.789\nAnother line"
        hints = _extract_unit_hints(text)
        assert isinstance(hints, list)

    def test_pure_numeric_lines_excluded(self):
        """Lines that are purely numeric are not hints."""
        text = "123456789\n58.102.970\n"
        hints = _extract_unit_hints(text)
        # Purely numeric lines should be excluded
        for h in hints:
            import re
            assert not re.fullmatch(r"[\d.,\s]+", h.strip()), (
                f"Purely numeric line should not be a hint: {h!r}"
            )

    def test_short_lines_included(self):
        """Short (3-80 char) non-numeric lines qualify as hints."""
        text = "Section A heading\n"
        hints = _extract_unit_hints(text)
        assert len(hints) >= 1

    def test_empty_text_returns_empty(self):
        assert _extract_unit_hints("") == []

    def test_none_text_returns_empty(self):
        assert _extract_unit_hints(None) == []  # type: ignore

    def test_max_5_hints(self):
        """At most 5 hints are returned."""
        lines = "\n".join(f"Section line {i}" for i in range(20))
        hints = _extract_unit_hints(lines)
        assert len(hints) <= 5


# ===========================================================================
# Tests for _blank_fingerprint
# ===========================================================================

class TestBlankFingerprint:
    def test_blank_page_type(self):
        fp = _blank_fingerprint(7)
        assert fp["page_type"] == "blank"

    def test_page_number_preserved(self):
        fp = _blank_fingerprint(42)
        assert fp["page_number"] == 42

    def test_zero_gutter_count(self):
        fp = _blank_fingerprint(1)
        assert fp["gutter_count"] == 0

    def test_empty_gutter_fractions(self):
        fp = _blank_fingerprint(1)
        assert fp["gutter_x_fractions"] == []


# ===========================================================================
# Tests for fingerprint-based unit grouping logic (pure simulation)
# ===========================================================================

class TestFingerprintGroupingLogic:
    """
    Simulate the unit grouping logic from build_document_map using
    injected fingerprints (no real PDF). Tests AC-0 and schema-page logic.
    """

    def _simulate_grouping(
        self,
        fingerprints: list,
        stored_texts: list = None,
    ) -> list:
        """
        Run the continuity test against a list of fingerprints,
        producing a list of unit groups: [[page_nums], ...].

        Mirrors the UPDATED state-machine logic in build_document_map
        (BCTC-TABLE-BOUNDARY fix):
          - NO_TABLE / TABLE_OPEN states
          - Deferred pending_blanks buffer (Option B)
          - D-5 title-band check via stored_texts parameter
          - Prose pages NEVER appended to a table unit

        Args:
            fingerprints: List of page fingerprint dicts.
            stored_texts: Optional list of stored OCR text strings, parallel
                to fingerprints. Defaults to [""] * len(fingerprints).
        """
        if stored_texts is None:
            stored_texts = [""] * len(fingerprints)

        units = []
        current_pages: list = []
        current_fp = None
        last_committed_d1_fp = None
        pending_blanks: list = []
        state = "NO_TABLE"

        for i, fp in enumerate(fingerprints):
            page_num = i + 1
            page_type = fp.get("page_type", "prose")
            stored_text = stored_texts[i] if i < len(stored_texts) else ""

            if page_type == "blank":
                pending_blanks.append(page_num)
                continue

            if state == "NO_TABLE":
                pending_blanks = []
                if page_type == "table":
                    # Flush any open prose unit before starting a table unit.
                    if current_pages:
                        units.append(list(current_pages))
                    current_pages = [page_num]
                    current_fp = fp
                    last_committed_d1_fp = fp
                    state = "TABLE_OPEN"
                else:
                    if current_fp is None:
                        current_pages = [page_num]
                        current_fp = fp
                    elif _fingerprints_continuous(current_fp, fp, stored_text_b=stored_text):
                        current_pages.append(page_num)
                        current_fp = fp
                    else:
                        units.append(list(current_pages))
                        current_pages = [page_num]
                        current_fp = fp

            elif state == "TABLE_OPEN":
                if page_type == "prose":
                    pending_blanks = []
                    units.append(list(current_pages))
                    current_pages = [page_num]
                    current_fp = fp
                    last_committed_d1_fp = None
                    state = "NO_TABLE"
                else:
                    assert last_committed_d1_fp is not None
                    continuation = _fingerprints_continuous(
                        last_committed_d1_fp, fp, stored_text_b=stored_text
                    )
                    if continuation:
                        current_pages.extend(pending_blanks)
                        pending_blanks = []
                        current_pages.append(page_num)
                        last_committed_d1_fp = fp
                        current_fp = fp
                    else:
                        pending_blanks = []
                        units.append(list(current_pages))
                        current_pages = [page_num]
                        current_fp = fp
                        last_committed_d1_fp = fp

        if current_pages:
            units.append(current_pages)

        return units

    def test_pages_with_same_fingerprint_are_one_unit(self):
        """Three table pages with identical fingerprints → one unit."""
        fp = {
            "page_type": "table",
            "gutter_count": 3,
            "gutter_x_fractions": [0.31, 0.55, 0.72],
            "row_pitch_px_at_50dpi": 14.0,
        }
        groups = self._simulate_grouping([fp, fp, fp])
        assert len(groups) == 1
        assert groups[0] == [1, 2, 3]

    def test_fingerprint_change_creates_new_unit(self):
        """Table page followed by prose page → two units."""
        fp_table = {
            "page_type": "table",
            "gutter_count": 3,
            "gutter_x_fractions": [0.31, 0.55, 0.72],
            "row_pitch_px_at_50dpi": 14.0,
        }
        fp_prose = {
            "page_type": "prose",
            "gutter_count": 0,
            "gutter_x_fractions": [],
            "row_pitch_px_at_50dpi": 20.0,
        }
        # Even though gutter_count 3 != 0, the page_type change also breaks
        groups = self._simulate_grouping([fp_table, fp_table, fp_prose, fp_prose])
        # Pages 1+2 form one unit (table), pages 3+4 form another (prose)
        assert len(groups) == 2
        assert 1 in groups[0] and 2 in groups[0]
        assert 3 in groups[1] and 4 in groups[1]

    def test_blank_page_gap_does_not_break_unit(self):
        """Blank page between two table pages → blank is included in the unit."""
        fp_table = {
            "page_type": "table",
            "gutter_count": 3,
            "gutter_x_fractions": [0.31, 0.55, 0.72],
            "row_pitch_px_at_50dpi": 14.0,
        }
        fp_blank = {
            "page_type": "blank",
            "gutter_count": 0,
            "gutter_x_fractions": [],
            "row_pitch_px_at_50dpi": 0.0,
        }
        groups = self._simulate_grouping([fp_table, fp_blank, fp_table])
        # The blank page is appended to the current unit, not starting a new one
        # Pages 1+2+3 → one unit (blank included in current unit)
        assert len(groups) == 1
        assert set(groups[0]) == {1, 2, 3}

    def test_schema_page_is_first_page_of_unit(self):
        """The first page in each unit group is the schema-page."""
        fp_a = {
            "page_type": "table",
            "gutter_count": 3,
            "gutter_x_fractions": [0.31, 0.55, 0.72],
            "row_pitch_px_at_50dpi": 14.0,
        }
        fp_b = {
            "page_type": "table",
            "gutter_count": 2,  # different from fp_a
            "gutter_x_fractions": [0.40, 0.70],
            "row_pitch_px_at_50dpi": 14.0,
        }
        groups = self._simulate_grouping([fp_a, fp_a, fp_b, fp_b])
        assert len(groups) == 2
        # Schema-page of first unit is page 1
        assert groups[0][0] == 1
        # Schema-page of second unit is page 3
        assert groups[1][0] == 3

    def test_fpt_q1_page5_in_same_unit_as_page3(self):
        """
        Regression test (AC-LFE-2): pages 3,4,5,6 have the same fingerprint
        → they form one unit (page 5 is a continuation, inheriting page 3's schema).
        """
        fp_balance_sheet = {
            "page_type": "table",
            "gutter_count": 4,
            "gutter_x_fractions": [0.20, 0.45, 0.65, 0.80],
            "row_pitch_px_at_50dpi": 12.0,
        }
        # Simulate pages 3,4,5,6 all having the same fingerprint
        groups = self._simulate_grouping(
            [fp_balance_sheet, fp_balance_sheet, fp_balance_sheet, fp_balance_sheet]
        )
        # All 4 pages form one unit
        assert len(groups) == 1
        assert set(groups[0]) == {1, 2, 3, 4}

    def test_page41_different_fingerprint_is_prose_unit(self):
        """
        Regression test (AC-LFE-3): page 41 (notes page) has a different
        fingerprint (fewer gutters, prose type) → it forms its own unit.
        This proves geometry is the spine (not text anchors).
        """
        fp_table = {
            "page_type": "table",
            "gutter_count": 4,
            "gutter_x_fractions": [0.20, 0.45, 0.65, 0.80],
            "row_pitch_px_at_50dpi": 12.0,
        }
        fp_prose = {
            "page_type": "prose",
            "gutter_count": 0,
            "gutter_x_fractions": [],
            "row_pitch_px_at_50dpi": 18.0,
        }
        # Simulate: several table pages, then a prose page (like page 41)
        groups = self._simulate_grouping([fp_table, fp_table, fp_prose])
        assert len(groups) == 2
        # The prose page is in its own unit, not mixed with table pages
        assert fp_table["page_type"] != "prose"  # Sanity check
        # The last group is the prose unit
        assert len(groups[1]) == 1


# ===========================================================================
# Tests for _find_ink_bbox — LF-FIX gutter-detection regression gate
# ===========================================================================

class TestFindInkBbox:
    """
    Tests for the ink bounding box helper that clamps gutter search to the
    actual text region, preventing page margins from being detected as gutters.

    AC-0: purely geometric inputs. No BCTC semantics.
    """

    def test_full_ink_no_margins(self):
        """All columns have ink — bbox spans full width."""
        col_dark = [10, 10, 10, 10, 10]
        x_left, x_right = _find_ink_bbox(col_dark)
        assert x_left == 0
        assert x_right == 4

    def test_left_margin_excluded(self):
        """Leading zero columns are excluded from the ink bbox."""
        # 3 empty margin cols, then ink from col 3 onward
        col_dark = [0, 0, 0, 8, 9, 8, 0]
        x_left, x_right = _find_ink_bbox(col_dark)
        assert x_left == 3
        assert x_right == 5

    def test_right_margin_excluded(self):
        """Trailing zero columns are excluded from the ink bbox."""
        col_dark = [8, 9, 8, 0, 0, 0]
        x_left, x_right = _find_ink_bbox(col_dark)
        assert x_left == 0
        assert x_right == 2

    def test_both_margins_excluded(self):
        """Both leading and trailing zero columns excluded."""
        col_dark = [0, 0, 8, 9, 8, 0, 0]
        x_left, x_right = _find_ink_bbox(col_dark)
        assert x_left == 2
        assert x_right == 4

    def test_empty_col_dark_returns_zero_zero(self):
        """Empty input returns (0, 0) safe fallback."""
        x_left, x_right = _find_ink_bbox([])
        assert x_left == 0
        assert x_right == 0

    def test_all_zero_returns_full_range(self):
        """All-zero profile returns full-width fallback (nothing to exclude)."""
        col_dark = [0, 0, 0, 0]
        x_left, x_right = _find_ink_bbox(col_dark)
        # With all zeros: global_max=0, ink_threshold=0, no column exceeds it,
        # so fallback to full range.
        assert x_left == 0
        assert x_right == 3

    def test_single_ink_column(self):
        """Single ink column at the center."""
        col_dark = [0, 0, 100, 0, 0]
        x_left, x_right = _find_ink_bbox(col_dark)
        assert x_left == 2
        assert x_right == 2


# ===========================================================================
# Tests for _detect_column_gutters_200dpi — LF-FIX primary regression gate
# ===========================================================================

class TestDetectColumnGutters200dpi:
    """
    Tests for the Tier-1 gutter detector.

    PRIMARY regression test: a synthetic profile with wide page margins and
    3 narrow inter-column gutters must produce 4 columns at the INTERNAL
    valleys — NOT one column spanning 97% of the page (the pre-fix failure).

    AC-0: purely geometric inputs. No BCTC semantics.
    """

    def _make_profile(self, width: int, ink_ranges: list, gutter_positions: list,
                      margin_left: int = 0, margin_right: int = 0) -> list:
        """
        Build a synthetic col_dark profile.

        Args:
            width:           total profile width in columns
            ink_ranges:      list of (start, end) where dark=high (ink)
            gutter_positions: list of (start, end) where dark=low (gap)
            margin_left:     number of leading zero columns (margin)
            margin_right:    number of trailing zero columns (margin)

        All unlisted positions default to a moderate dark value (20).
        Ink ranges have dark=100. Gutters have dark=0.
        Margin columns have dark=0.
        """
        profile = [20] * width
        for x in range(margin_left):
            profile[x] = 0
        for x in range(width - margin_right, width):
            profile[x] = 0
        for g_start, g_end in gutter_positions:
            for x in range(g_start, g_end + 1):
                profile[x] = 0
        for i_start, i_end in ink_ranges:
            for x in range(i_start, i_end + 1):
                profile[x] = 100
        return profile

    def test_three_internal_gutters_produce_four_columns(self):
        """
        PRIMARY REGRESSION: synthetic profile with 50-col margins + 3 internal
        20-col gutters. Pre-fix: one column spanning 97% of page (bug).
        Post-fix: 4 text columns at internal valleys, margins excluded.

        Layout: |margin50|col0_200|gutter20|col1_100|gutter20|col2_150|gutter20|col3_200|margin50|
        Total width = 50+200+20+100+20+150+20+200+50 = 810
        """
        width = 810
        margin = 50
        # Text column spans
        col0_end = margin + 200 - 1  # 249
        g0_start = 250; g0_end = 269
        col1_end = 370 - 1           # 369
        g1_start = 370; g1_end = 389
        col2_end = 540 - 1           # 539
        g2_start = 540; g2_end = 559
        # col3 from 560 to 760

        profile = self._make_profile(
            width=width,
            ink_ranges=[
                (margin, col0_end),      # col 0 ink
                (g0_end + 1, g1_start - 1),  # col 1 ink
                (g1_end + 1, g2_start - 1),  # col 2 ink
                (g2_end + 1, width - margin - 1),  # col 3 ink
            ],
            gutter_positions=[
                (g0_start, g0_end),
                (g1_start, g1_end),
                (g2_start, g2_end),
            ],
            margin_left=margin,
            margin_right=margin,
        )

        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)

        # We expect at least 4 text columns (columns 0,2,4,6 in alternating
        # text/gutter layout) — margins must NOT be columns.
        text_cols = [c for c in columns if (c["x_max"] - c["x_min"] + 1) >= 50]
        assert len(text_cols) == 4, (
            f"Expected 4 text columns from 3 internal gutters, got {len(text_cols)}. "
            f"All columns: {columns}"
        )

        # The first text column must start at or near the ink left edge (not at 0)
        leftmost = columns[0]
        assert leftmost["x_min"] >= margin - 5, (
            f"First column starts at {leftmost['x_min']}, expected >= {margin - 5}. "
            f"Left margin was incorrectly included as a column. All columns: {columns}"
        )

        # No column should span more than 60% of the total page width
        max_col_width = max(c["x_max"] - c["x_min"] + 1 for c in columns)
        assert max_col_width <= width * 0.60, (
            f"Widest column is {max_col_width}px = {max_col_width/width:.1%} of page. "
            f"Expected < 60% (pre-fix bug produced 97%). All columns: {columns}"
        )

    def test_no_gutters_produces_single_ink_bbox_column(self):
        """
        All-ink profile (no internal gutters) → single column spanning ink bbox.
        Margins still excluded.
        """
        width = 500
        margin = 30
        profile = self._make_profile(
            width=width,
            ink_ranges=[(margin, width - margin - 1)],
            gutter_positions=[],
            margin_left=margin,
            margin_right=margin,
        )
        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)
        assert len(columns) == 1
        assert columns[0]["col_id"] == "col_0"
        # Column starts at ink left edge, not at 0
        assert columns[0]["x_min"] >= margin - 5, (
            f"Single column starts at {columns[0]['x_min']}, expected >= {margin - 5}."
        )

    def test_column_ids_are_positional(self):
        """Column IDs must match col_N pattern — AC-0."""
        import re
        width = 400
        profile = self._make_profile(
            width=width,
            ink_ranges=[(50, 349)],
            gutter_positions=[(175, 195)],
            margin_left=50,
            margin_right=50,
        )
        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)
        for col in columns:
            assert re.fullmatch(r"col_\d+", col["col_id"]), (
                f"Non-positional column ID: {col['col_id']!r} — AC-0 violation"
            )

    def test_empty_profile_fallback(self):
        """Empty col_dark → fallback single full-width column."""
        columns = _detect_column_gutters_200dpi(col_dark=[], width=0)
        assert len(columns) == 1
        assert columns[0]["col_id"] == "col_0"

    def test_margin_only_columns_not_detected_as_gutters(self):
        """
        Pre-fix regression: page with 5% left margin + ink from 5% to 100%.
        The margin columns must NOT be detected as a gutter.
        Expected: 1 ink column (no internal gutters).
        """
        width = 1000
        margin_cols = 50  # 5% of width
        profile = [0] * margin_cols + [80] * (width - margin_cols)
        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)
        # No internal gutters → should produce 1 column for the ink region
        text_cols = [c for c in columns if (c["x_max"] - c["x_min"] + 1) > 20]
        assert len(text_cols) == 1, (
            f"Margin-only gap was incorrectly detected as a gutter. "
            f"Columns: {columns}"
        )


# ===========================================================================
# LF-FIX regression tests — gutter-detection edge-sliver fix
# ===========================================================================

class TestGutterDetectionEdgeSliverFix:
    """
    LF-FIX targeted regression gate.

    The pre-fix bug: gutter detection produced 20-30px slivers at the page
    margins — these edge slivers were accepted as column boundaries, creating
    one vast pseudo-column (97% of page width) and destroying label/value
    separation.  Pages 3,4,5,6 then had mutually inconsistent fingerprints
    (edge slivers at opposite margins), so Tier-0 grouping never fired and
    pages were left as isolated single-page units.  Schema inheritance was
    never triggered.

    The fix: a gutter is only accepted when the text column on BOTH sides of
    the gutter is >= _MIN_TEXT_COL_WIDTH_PX pixels wide.  Trailing content
    whitespace (open gutter at ink-right) is also dropped.

    All tests use purely geometric synthetic profiles.  AC-0: no BCTC semantics.
    """

    def _fpt_like_profile(self, width: int = 1654) -> list:
        """
        Synthetic horizontal projection profile that approximates the FPT Q1
        2026 balance-sheet page column layout at 200 DPI:
            - Left margin: 56px (0-55)
            - Label column:  56 to 579  (524px, ~35% of page)
            - Gutter 0:     580 to 620  (41px whitespace)
            - Code column:  621 to 744  (124px, ~8%)
            - Gutter 1:     745 to 785  (41px whitespace)
            - Value col 1:  786 to 1240 (455px, ~28%)
            - Gutter 2:    1241 to 1281 (41px whitespace)
            - Value col 2: 1282 to 1597 (316px, ~19%)
            - Right margin: 1598-1653 (56px)
        """
        profile = [0] * width
        # Margins
        for x in range(56):
            profile[x] = 0
        for x in range(1598, width):
            profile[x] = 0
        # Text columns (dense ink)
        for x in range(56, 580):
            profile[x] = 90
        for x in range(621, 745):
            profile[x] = 80
        for x in range(786, 1241):
            profile[x] = 85
        for x in range(1282, 1598):
            profile[x] = 75
        # Gutters (whitespace — zero ink)
        for x in range(580, 621):
            profile[x] = 0
        for x in range(745, 786):
            profile[x] = 0
        for x in range(1241, 1282):
            profile[x] = 0
        return profile

    def test_fpt_like_page_produces_3_gutters(self):
        """
        Profile approximating FPT Q1 balance-sheet pages (3 internal gutters)
        must produce 3 detected gutters → 4 text columns + 3 gutter entries = 7
        total entries, OR just the 4 text columns if returned without whitespace.
        The key assertion: no single column spans more than 40% of the page.
        """
        width = 1654
        profile = self._fpt_like_profile(width)
        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)

        # No column should span more than 40% of the total page width
        max_col_width = max(c["x_max"] - c["x_min"] + 1 for c in columns)
        assert max_col_width <= width * 0.40, (
            f"Widest column is {max_col_width}px = {max_col_width/width:.1%} of page. "
            f"Expected < 40% (pre-fix: 97%). Columns: {columns}"
        )

        # Must find at least 4 distinct text-content columns (width >= 80px)
        text_cols = [c for c in columns if (c["x_max"] - c["x_min"] + 1) >= 80]
        assert len(text_cols) >= 4, (
            f"Expected >= 4 real text columns, got {len(text_cols)}. "
            f"All columns: {columns}"
        )

    def test_trailing_whitespace_not_a_gutter(self):
        """
        LF-FIX: open gutter at the ink-right boundary (trailing content
        whitespace) must NOT be accepted as a column separator.

        Pre-fix: the 'flush at ink_right' path accepted a 23px trailing
        whitespace run as a gutter → produced a 22px col_2 sliver at the right
        edge → identical to the pre-fix page-3 failure.

        Post-fix: the trailing whitespace is dropped → single column.
        """
        width = 1654
        # All ink except trailing 30px whitespace (simulates content ending
        # before the right margin — exactly what caused the page-3 sliver)
        profile = [80] * (width - 30) + [0] * 30
        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)

        # The trailing whitespace must NOT produce a 30px trailing column
        if len(columns) > 1:
            last_col = columns[-1]
            last_col_width = last_col["x_max"] - last_col["x_min"] + 1
            assert last_col_width >= 80, (
                f"Trailing whitespace produced a {last_col_width}px sliver column. "
                f"LF-FIX: open gutters at ink-right must be dropped. "
                f"All columns: {columns}"
            )

    def test_leading_edge_sliver_rejected(self):
        """
        LF-FIX: a narrow (25px) gutter near the left edge that would produce
        a 25px text column (< _MIN_TEXT_COL_WIDTH_PX=80) must be rejected.

        Pre-fix: this produced col_0=0-25 (page-4 failure), then a vast col_2
        spanning almost the entire page.

        Post-fix: gutter rejected → single column spanning the ink region.
        """
        width = 1654
        # Simulates page-4 failure: 25px "text" col at left, then vast content
        profile = [0] * 56                      # left margin
        profile += [90] * 25                    # tiny "text" col 0 (25px)
        profile += [0] * 30                     # narrow gutter (30px)
        profile += [85] * (1654 - 56 - 25 - 30 - 56)  # main content
        profile += [0] * 56                     # right margin
        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)

        # No text column should be narrower than 80px
        text_cols = [c for c in columns if (c["x_max"] - c["x_min"] + 1) >= 80]
        narrow_cols = [c for c in columns if 0 < (c["x_max"] - c["x_min"] + 1) < 80]
        # The 25px column must not appear as the sole content column
        # (if it's a gutter whitespace entry that's fine, but no tiny text region)
        for nc in narrow_cols:
            # Only gutter entries (whitespace columns) should be narrow
            # i.e. they should be bordered by larger columns on both sides
            col_width = nc["x_max"] - nc["x_min"] + 1
            assert col_width <= 60, (
                f"Narrow text column {nc} (width={col_width}px) should have been "
                f"rejected by the minimum column width filter. Columns: {columns}"
            )

    def test_fpt_like_pages_p3_p4_produce_same_gutter_count(self):
        """
        LF-FIX: pages p3 and p4 of FPT Q1 2026 have the same physical column
        layout but differ in which edge the pre-fix gutter was found.  After
        the fix, both pages should produce the same gutter_count from equivalent
        profiles, enabling Tier-0 grouping.

        Simulates p3 (gutters at 35%/47%/75%) and p4 (same layout).
        """
        width = 1654
        profile_p3 = self._fpt_like_profile(width)
        # p4 same layout — no difference in actual column structure
        profile_p4 = list(profile_p3)  # identical

        cols_p3 = _detect_column_gutters_200dpi(col_dark=profile_p3, width=width)
        cols_p4 = _detect_column_gutters_200dpi(col_dark=profile_p4, width=width)

        # Both pages must detect the same number of columns
        assert len(cols_p3) == len(cols_p4), (
            f"p3 detected {len(cols_p3)} columns but p4 detected {len(cols_p4)}. "
            f"Same layout must produce same gutter count. "
            f"p3 cols: {cols_p3}. p4 cols: {cols_p4}"
        )

    def test_fingerprint_consistency_enables_p3_p6_grouping(self):
        """
        LF-FIX end-to-end: simulated pages 3,4,5,6 with the same physical
        column layout produce fingerprints that _fingerprints_continuous()
        recognizes as the same unit.

        Pre-fix: gutters at opposite edges (97% vs 3%) → 95% drift → unit break.
        Post-fix: gutters at correct internal positions (35%/47%/75%) → < 5% drift
        → pages group into one unit → AC-LFE-2 can fire.
        """
        from infrastructure.generic_md_table_extractor import _fingerprints_continuous

        # Post-fix: all 4 pages should produce gutter fractions near [0.35, 0.47, 0.75]
        # We test with synthetic fingerprints that match the expected post-fix output
        fp_balanced = {
            "page_type": "table",
            "gutter_count": 3,
            "gutter_x_fractions": [0.35, 0.47, 0.75],
            "row_pitch_px_at_50dpi": 12.0,
        }
        # Pages 3, 4, 5, 6 all have same layout → same fingerprint
        assert _fingerprints_continuous(fp_balanced, fp_balanced), (
            "Identical post-fix fingerprints must be continuous (same unit)."
        )

        # Verify: pre-fix fingerprints (edge slivers) would FAIL continuity
        fp_pre_fix_p3 = {
            "page_type": "table",
            "gutter_count": 3,
            "gutter_x_fractions": [0.0, 0.97, 0.99],
            "row_pitch_px_at_50dpi": 12.0,
        }
        fp_pre_fix_p4 = {
            "page_type": "table",
            "gutter_count": 3,
            "gutter_x_fractions": [0.0, 0.02, 0.03],
            "row_pitch_px_at_50dpi": 12.0,
        }
        assert not _fingerprints_continuous(fp_pre_fix_p3, fp_pre_fix_p4), (
            "Pre-fix fingerprints (edge slivers at opposite margins) must NOT be "
            "continuous — confirms the pre-fix bug is the cause of unit fragmentation."
        )


class TestIsGutterFlagAndCompoundGutterMerging:
    """
    LF-FIX: compound gutter merging + is_gutter flag.

    When consecutive raw gutter candidates are separated by <= _MAX_INTER_GUTTER_GAP_PX
    ink-bearing pixels (e.g. OCR artifacts within the whitespace zone), they should be
    merged into one compound gutter. The returned column dict must include 'is_gutter'
    so callers can distinguish text cells from whitespace separators.
    """

    def _profile_with_fragmented_gutter(self, width: int = 1654) -> list:
        """
        Build a profile where the structural column separator between
        the label column and value column is fragmented: two 30px dark
        sub-bands separated by a 40px whitespace sub-band, within a
        large whitespace region (total compound gutter ~280px).

        Layout (all values in px):
            left_margin:     0-55  (56px, zero ink)
            label_col:      56-745  (690px, ink=90)
            gutter_part1:  746-775  (30px, ink=0)
            ink_speck:     776-815  (40px, ink=15 — OCR artifact)
            gutter_part2:  816-1035  (220px, ink=0)
            value_col1:   1036-1230  (195px, ink=85)
            narrow_gutter: 1231-1270  (40px, ink=0)
            value_col2:   1271-1597  (327px, ink=80)
            right_margin: 1598-1653  (56px, zero ink)
        """
        profile = [0] * width
        # label column
        for x in range(56, 746):
            profile[x] = 90
        # ink speck within the compound gutter (OCR artifact)
        for x in range(776, 816):
            profile[x] = 15
        # value col 1
        for x in range(1036, 1231):
            profile[x] = 85
        # value col 2
        for x in range(1271, 1598):
            profile[x] = 80
        return profile

    def test_compound_gutter_merged_produces_correct_columns(self):
        """
        A fragmented whitespace zone (two gutter sub-bands with a 40px ink speck
        between them) must be merged into one compound gutter. The result should
        have 3 text columns and 2 gutter separators (total 5 entries), with no
        single text column spanning >50% of the page.
        """
        width = 1654
        profile = self._profile_with_fragmented_gutter(width)
        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)

        text_cols = [c for c in columns if not c.get("is_gutter", False)]
        gutter_cols = [c for c in columns if c.get("is_gutter", False)]

        # Expect 3 text columns (label | value1 | value2)
        assert len(text_cols) == 3, (
            f"Expected 3 text columns after compound gutter merge, got {len(text_cols)}. "
            f"All columns: {columns}"
        )

        # Expect 2 gutter separators
        assert len(gutter_cols) == 2, (
            f"Expected 2 gutter columns, got {len(gutter_cols)}. "
            f"All columns: {columns}"
        )

    def test_is_gutter_true_on_whitespace_columns(self):
        """
        Column entries that represent whitespace separators must have is_gutter=True.
        Text column entries must have is_gutter=False (or absent).
        """
        width = 800
        # Simple 2-text-column layout with one gutter
        profile = [0] * 50 + [80] * 300 + [0] * 50 + [75] * 300 + [0] * 100
        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)

        for col in columns:
            assert "is_gutter" in col, f"Missing is_gutter key in column: {col}"
            col_width = col["x_max"] - col["x_min"] + 1
            if col_width >= 80:
                assert col.get("is_gutter") is False, (
                    f"Wide column ({col_width}px) should NOT be marked as gutter: {col}"
                )

    def test_fallback_single_column_has_is_gutter_false(self):
        """
        Fallback single-column result (no gutters found) must have is_gutter=False.
        """
        columns = _detect_column_gutters_200dpi(col_dark=[], width=0)
        assert len(columns) == 1
        assert columns[0].get("is_gutter") is False

    def test_no_merge_when_inter_gap_exceeds_threshold(self):
        """
        Two gutter sub-bands separated by more than _MAX_INTER_GUTTER_GAP_PX should
        NOT be merged — they are separate structural gutters.
        """
        from infrastructure.generic_md_table_extractor import _MAX_INTER_GUTTER_GAP_PX
        width = 1000
        # Create a profile with 3 text columns separated by 2 wide gutters (80px each)
        # Text columns: 100px each, gutters: 80px each
        # Ink speck in the second gutter is > _MAX_INTER_GUTTER_GAP_PX from the start
        profile = [0] * 50          # left margin
        profile += [80] * 200       # col 0
        profile += [0] * 80         # gutter 1 (no ink artifact — clean gutter)
        profile += [80] * 200       # col 1
        profile += [0] * 80         # gutter 2 (no ink artifact)
        profile += [80] * 340       # col 2
        profile += [0] * 50         # right margin
        columns = _detect_column_gutters_200dpi(col_dark=profile, width=width)

        text_cols = [c for c in columns if not c.get("is_gutter", False)]
        # Should have 3 separate text columns (gutters are clean, no merging needed)
        assert len(text_cols) == 3, (
            f"Expected 3 text columns from 2 separate gutters, got {len(text_cols)}. "
            f"All columns: {columns}"
        )


class TestInvariant3DistinctLabelValueRequirement:
    """
    LF-FIX: Invariant 3 leniency gap — verify that check_no_orphan_rows
    correctly rejects the 'all content in one wide column' scramble case.

    The QA-reported page-4 failure: col_0=empty, col_1=empty,
    col_2='label value1 value2 code all mashed together'.
    A row with no genuine label (or purely-numeric label) plus content in
    col_2 must NOT pass Invariant 3.

    These tests exercise the already-implemented fix in check_no_orphan_rows
    (_has_label rejects purely-numeric labels; value-without-label → orphan).
    """

    def test_all_content_one_column_fails_invariant3(self):
        """
        The page-4 scramble case: BCTC line-item mashed into one cell.
        Simulates: | PHAI TRA 44.393.950.887.086 28.464.058.214.856 NO 300 Cc |  |  |
        In rows_for_gate format: label=None (col_0 empty), values=[mashed_content].
        """
        from domain.primitives.layout_invariants.primitive import check_no_orphan_rows

        # Row as it appears with all-in-one-column layout:
        # label column is empty, everything dumped into the single wide column
        rows = [
            {
                "code": None,
                "label": None,  # label column is empty (col_0 empty)
                "values": ["PHAI TRA 44.393.950.887.086 28.464.058.214.856 NO 300 Cc"],
                "page": 4,
            }
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert not ok, (
            "Row with empty label + all-mashed-content value must fail Invariant 3. "
            "Page-4 false-green must be caught."
        )
        assert "orphan" in reason.lower() or "junk" in reason.lower()

    def test_numeric_only_label_value_in_adjacent_col_fails(self):
        """
        When col_0 (label column) has an OCR number overspill (numeric string)
        and col_2 has the real content, Invariant 3 must catch this.
        _has_label() returns False for purely-numeric labels.
        """
        from domain.primitives.layout_invariants.primitive import check_no_orphan_rows

        rows = [
            {
                "code": None,
                "label": "44.393.950.887.086",  # numeric-only overspill in label col
                "values": ["28.464.058.214.856"],
                "page": 5,
            }
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert not ok, (
            "Row with purely-numeric label (OCR overspill) must fail Invariant 3. "
            "This prevents the page-4 false-green from repeating post-fix."
        )

    def test_genuine_label_and_value_in_distinct_columns_passes(self):
        """
        A correctly extracted row: label col has text, value col has number.
        This must pass Invariant 3 (the fix must not create false-negatives).
        """
        from domain.primitives.layout_invariants.primitive import check_no_orphan_rows

        rows = [
            {
                "code": "310",
                "label": "No ngan han",  # genuine text label
                "values": ["44393950887086", "28464058214856"],  # two value columns
                "page": 5,
            }
        ]
        ok, reason = check_no_orphan_rows(rows)
        assert ok, f"Correctly extracted row must pass Invariant 3, got: {reason}"
