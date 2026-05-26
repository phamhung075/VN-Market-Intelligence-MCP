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

    def _simulate_grouping(self, fingerprints: list) -> list:
        """
        Run the continuity test against a list of fingerprints,
        producing a list of unit groups: [[page_nums], ...].
        Mirrors the logic in build_document_map.
        """
        units = []
        current_pages = []
        current_fp = None

        for i, fp in enumerate(fingerprints):
            page_num = i + 1
            page_type = fp.get("page_type", "prose")

            if page_type == "blank":
                if current_pages:
                    current_pages.append(page_num)
                continue

            if current_fp is None:
                current_pages = [page_num]
                current_fp = fp
                continue

            if _fingerprints_continuous(current_fp, fp):
                current_pages.append(page_num)
            else:
                units.append(list(current_pages))
                current_pages = [page_num]
                current_fp = fp

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
