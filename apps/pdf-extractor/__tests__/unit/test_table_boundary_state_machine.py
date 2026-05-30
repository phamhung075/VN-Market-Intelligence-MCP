"""
Unit tests — BCTC-TABLE-BOUNDARY state machine (BTB-DEV, updated BTB-DRIFT-DEV)

Tests cover:
    Class A — _is_title_band: D-5 title-band detector (raw OCR text, pure function)
    Class A2 — _has_new_title: D-5 detector on pre-extracted title_hints strings
               (unit_grouper, canonical path after BTB-DRIFT-DEV)
    Class B — _fingerprints_continuous with stored_text_b: D-5 via continuity test
    Class C — State-machine simulation via group_pages_into_units (canonical after
               BTB-DRIFT-DEV)
        Includes DV-1 and DV-2 deliberate-violation anti-false-green tests.

BTB-DRIFT-DEV update (2026-05-30):
    Class C's _simulate_state_machine now delegates to
    infrastructure.unit_grouper.group_pages_into_units — the single canonical
    grouping function called by both PATH A and PATH B. The fingerprint-based
    simulation adapter converts fp dicts into the pages-list format.

All tests are pure-function unit tests. Zero real PDF. Zero Tesseract. Zero DB.
Zero network. AC-0 compliance: test data uses purely generic inputs.

DV-1 and DV-2 must be PROVEN-RED against the pre-fix code, then GREEN post-fix.
Pre-fix PROVEN-RED is documented in the RETURN block of the BTB-DEV handoff.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from infrastructure.generic_md_table_extractor import (
    _is_title_band,
    _fingerprints_continuous,
)
from infrastructure.unit_grouper import group_pages_into_units, _has_new_title


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _fp_table(gutter_count=3, gutter_x_fractions=None, row_pitch=14.0):
    """Return a standard table-page fingerprint."""
    return {
        "page_type": "table",
        "gutter_count": gutter_count,
        "gutter_x_fractions": gutter_x_fractions or [0.31, 0.55, 0.72],
        "row_pitch_px_at_50dpi": row_pitch,
    }


def _fp_prose():
    """Return a standard prose-page fingerprint."""
    return {
        "page_type": "prose",
        "gutter_count": 0,
        "gutter_x_fractions": [],
        "row_pitch_px_at_50dpi": 18.0,
    }


def _fp_blank():
    """Return a blank-page fingerprint."""
    return {
        "page_type": "blank",
        "gutter_count": 0,
        "gutter_x_fractions": [],
        "row_pitch_px_at_50dpi": 0.0,
    }


def _simulate_state_machine(fingerprints: list, stored_texts: list = None) -> list:
    """
    Pure-function simulation of the BCTC-TABLE-BOUNDARY state machine loop.

    BTB-DRIFT-DEV update: delegates to group_pages_into_units (canonical) with
    a thin adapter that converts fingerprint dicts → pages-list format.

    stored_texts: when provided, non-empty strings are interpreted as title-band
    signals via _is_title_band (backward-compat for Class B tests that inject raw
    OCR text). For the canonical D-5 check we convert them to title_hints using
    a simple heuristic: if stored_text contains a title band → title_hints=["TITLE"],
    if continuation marker → title_hints=["tiếp theo"], else title_hints=[].

    Returns a list of unit dicts:
        [{"pages": [N, ...], "page_type": "table"|"prose"}, ...]
    """
    if stored_texts is None:
        stored_texts = [""] * len(fingerprints)

    pages = []
    for i, fp in enumerate(fingerprints):
        page_num = i + 1
        page_type = fp.get("page_type", "prose")
        stored_text = stored_texts[i] if i < len(stored_texts) else ""

        # Convert stored_text D-5 signal to title_hints format so that
        # group_pages_into_units receives the same effective information.
        # This preserves Class C test semantics after the delegation refactor.
        title_hints: list = []
        if stored_text and page_type == "table":
            from infrastructure.generic_md_table_extractor import _is_title_band as _itb
            lower = stored_text.lower()
            _CONT = ("tiếp theo", "(continued)", "continued")
            if any(m in lower for m in _CONT):
                # Continuation marker: supply it so _has_new_title returns False
                title_hints = ["tiếp theo"]
            elif _itb(stored_text):
                # Title band detected in raw text → supply a non-empty title hint
                title_hints = ["TITLE_BAND_DETECTED"]

        pages.append({
            "page_num": page_num,
            "page_type": page_type,
            "title_hints": title_hints,
        })

    raw_units = group_pages_into_units(pages)
    # Strip unit_id (not stable) to match the old simulation return shape
    return [{"pages": u["pages"], "page_type": u["page_type"]} for u in raw_units]


# ===========================================================================
# Class A — _is_title_band tests
# ===========================================================================

class TestIsTitleBand:
    """
    Pure-function tests for the D-5 title-band detector.
    AC-0: inputs are generic non-numeric text patterns.
    """

    def test_a1_standalone_title_line_returns_true(self):
        """A-1: Text opening with a standalone non-numeric Vietnamese title."""
        text = "BANG KET QUA HOAT DONG KINH DOANH\n1.234.567\n2.345.678\n"
        assert _is_title_band(text) is True

    def test_a2_tiep_theo_continuation_marker_returns_false(self):
        """A-2: Text opening with '(tiếp theo)' — confirmed continuation, not a new title."""
        text = "(tiếp theo)\n1.234.567\n2.345.678\n"
        assert _is_title_band(text) is False

    def test_a2_continued_marker_returns_false(self):
        """A-2 variant: '(continued)' continuation marker."""
        text = "(continued)\n1.234.567\n2.345.678\n"
        assert _is_title_band(text) is False

    def test_a3_only_numeric_lines_in_top_8_returns_false(self):
        """A-3: Top 8 lines are all numeric/money-group — no title band."""
        lines = "\n".join([
            "1.234.567",
            "2.345.678",
            "3.456.789",
            "4.567.890",
            "5.678.901",
            "6.789.012",
            "7.890.123",
            "8.901.234",
        ])
        text = lines + "\nMOT TIEU DE DANG XET\n"  # title only after scan window
        assert _is_title_band(text) is False

    def test_a4_empty_string_returns_false(self):
        """A-4: Empty stored text — no title band."""
        assert _is_title_band("") is False

    def test_a4_none_handled(self):
        """A-4 variant: None-like empty check (function receives only str)."""
        assert _is_title_band("") is False

    def test_a5_title_on_line_9_not_detected(self):
        """A-5: Title appears on line 9 (beyond the 8-line scan window) — not detected."""
        numeric_lines = "\n".join(["1.234.567"] * 8)
        title_line = "TIEU DE NGOAI KHUNG QUET"
        text = numeric_lines + "\n" + title_line + "\n"
        assert _is_title_band(text) is False

    def test_single_word_line_not_a_title(self):
        """R-4 mitigation: single-word short line (e.g. 'TM') must not trigger D-5."""
        text = "TM\n1.234.567\n2.345.678\n"
        assert _is_title_band(text) is False

    def test_money_group_line_not_a_title(self):
        """Line containing money-group pattern must be skipped."""
        text = "Tong so 1.234.567 dong\n"
        # Contains a money-group pattern → skipped as financial data
        assert _is_title_band(text) is False

    def test_purely_numeric_line_not_a_title(self):
        """A line of only digits and punctuation must not trigger D-5."""
        text = "1234567890\n"
        assert _is_title_band(text) is False

    def test_title_with_two_words_detected(self):
        """A title line with 2+ non-numeric words should fire D-5."""
        text = "Bao cao tai chinh\n1.234.567\n"
        assert _is_title_band(text) is True

    def test_continuation_marker_case_insensitive(self):
        """Continuation marker check must be case-insensitive."""
        text = "TIEP THEO\n1.234.567\n"
        # "tiep theo" != "tiếp theo" (without diacritics) — won't match marker
        # but let's test exact marker with casing
        text2 = "Tiếp Theo\n1.234.567\n"
        # "tiếp theo" in "tiếp theo" → case-insensitive match → return False
        assert _is_title_band(text2) is False


# ===========================================================================
# Class A2 — _has_new_title (unit_grouper canonical D-5, BTB-DRIFT-DEV)
# ===========================================================================

class TestHasNewTitle:
    """
    Tests for _has_new_title — the D-5 detector used by group_pages_into_units.
    Operates on pre-extracted title_hints strings (not raw OCR text).
    BTB-DRIFT-DEV: replaces the per-path _is_title_band call in the hot path.
    """

    def test_a2_1_empty_list_false(self):
        assert _has_new_title([]) is False

    def test_a2_2_empty_strings_false(self):
        assert _has_new_title(["", "   "]) is False

    def test_a2_3_real_title_hint_fires_d5(self):
        assert _has_new_title(["BAO CAO TAI CHINH"]) is True

    def test_a2_4_tiep_theo_suppresses_d5(self):
        assert _has_new_title(["tiếp theo"]) is False

    def test_a2_5_tiep_theo_case_insensitive(self):
        assert _has_new_title(["Tiếp Theo"]) is False

    def test_a2_6_continued_suppresses_d5(self):
        assert _has_new_title(["(continued)"]) is False

    def test_a2_7_first_hint_continuation_suppresses_d5(self):
        """Continuation marker on first non-empty hint suppresses D-5."""
        assert _has_new_title(["tiếp theo", "BAO CAO"]) is False

    def test_a2_8_first_hint_title_fires_d5(self):
        """First non-empty hint is a real title → D-5 fires."""
        assert _has_new_title(["BAO CAO", "tiếp theo"]) is True


# ===========================================================================
# Class B — _fingerprints_continuous with stored_text_b
# ===========================================================================

class TestFingerprintsContinuousWithText:
    """
    Tests for _fingerprints_continuous with the new stored_text_b parameter.
    Extends existing geometry tests with D-5 title-band signal.
    """

    def test_b1_empty_text_same_geometry_continuous(self):
        """B-1: Matching geometry, empty stored_text_b → True (regression: existing behaviour)."""
        fp = _fp_table()
        assert _fingerprints_continuous(fp, fp, stored_text_b="") is True

    def test_b2_title_band_text_breaks_continuation(self):
        """B-2: Matching geometry but page B has a title-band → D-5 fires → False."""
        fp = _fp_table()
        title_text = "BANG KET QUA HOAT DONG\n1.234.567\n"
        assert _fingerprints_continuous(fp, fp, stored_text_b=title_text) is False

    def test_b3_tiep_theo_does_not_break_continuation(self):
        """B-3: Continuation marker — D-5 does NOT fire → True."""
        fp = _fp_table()
        cont_text = "(tiếp theo)\n1.234.567\n2.345.678\n"
        assert _fingerprints_continuous(fp, fp, stored_text_b=cont_text) is True

    def test_b4_gutter_count_mismatch_breaks_regardless_of_text(self):
        """B-4: Gutter-count mismatch fires D-4 condition 2 → False."""
        fp_a = _fp_table(gutter_count=3)
        fp_b = _fp_table(gutter_count=2)
        assert _fingerprints_continuous(fp_a, fp_b, stored_text_b="") is False

    def test_b_backward_compat_no_text_arg(self):
        """Existing callers omitting stored_text_b still work (defaults to '')."""
        fp = _fp_table()
        # Calling with only 2 args — must not raise
        result = _fingerprints_continuous(fp, fp)
        assert result is True

    def test_b_title_band_numeric_text_does_not_break(self):
        """A page with only numeric content — no D-5 — still continues."""
        fp = _fp_table()
        numeric_text = "1.234.567\n2.345.678\n3.456.789\n"
        assert _fingerprints_continuous(fp, fp, stored_text_b=numeric_text) is True


# ===========================================================================
# Class C — State-machine simulation tests (DV-1, DV-2 included)
# ===========================================================================

class TestStateMachineSimulation:
    """
    Tests for the build_document_map state-machine loop (via pure simulation).
    DV-1 and DV-2 are anti-false-green deliberate-violation tests.
    All inputs are injected fingerprints — no real PDF.
    """

    # -----------------------------------------------------------------------
    # DV-1 (FR-1 + FR-2 combined) — DELIBERATE VIOLATION TEST
    # Pre-fix: [table, prose, table] with matching geometry → 1 unit (WRONG)
    # Post-fix: → 3 units (CORRECT)
    # -----------------------------------------------------------------------

    def test_dv1_table_prose_table_produces_three_units(self):
        """
        DV-1 (FR-2 AC-FR2-1): [table, prose, table] with geometrically identical
        table fingerprints on pages 1 and 3 MUST yield 3 units:
            unit_1 = {pages: [1], page_type: "table"}
            unit_2 = {pages: [2], page_type: "prose"}
            unit_3 = {pages: [3], page_type: "table"}

        Pre-fix PROVEN-RED: with the old majority-vote + unconditional blank bridge
        logic, _simulate_grouping would return only 1 unit (table+prose+table merged
        because prose page was appended to the single running unit and majority-vote
        typed it "table"). The old _simulate_grouping did not split on prose pages
        when the surrounding table fingerprints were identical — it relied solely on
        _fingerprints_continuous(table_fp, prose_fp) returning False, but then would
        still merge them all in the same run. With NO_TABLE state machine the prose
        page NOW triggers TABLE_END → flush → open prose unit → next table triggers
        TABLE_START → 3 units.

        Post-fix GREEN: 3 units.
        """
        fp_table = _fp_table()
        fp_prose = _fp_prose()

        units = _simulate_state_machine(
            [fp_table, fp_prose, fp_table]
        )

        assert len(units) == 3, (
            f"DV-1 FAILED: Expected 3 units from [table, prose, table], "
            f"got {len(units)}: {units}"
        )
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1]
        assert units[1]["page_type"] == "prose"
        assert units[1]["pages"] == [2]
        assert units[2]["page_type"] == "table"
        assert units[2]["pages"] == [3]

    # -----------------------------------------------------------------------
    # DV-2 — DELIBERATE VIOLATION TEST
    # Pre-fix: _fingerprints_continuous(fp_table, fp_table_with_title) → True
    # Post-fix: → False
    # -----------------------------------------------------------------------

    def test_dv2_fingerprints_continuous_with_title_band_returns_false(self):
        """
        DV-2 (FR-3 AC-FR3-1): Two geometrically identical table fingerprints
        where page B has a title-band in its stored OCR text MUST return False.

        Pre-fix PROVEN-RED: the old _fingerprints_continuous had no D-5 check.
        Calling _fingerprints_continuous(fp_table, fp_table) returned True
        regardless of stored_text_b content. DV-2 would have returned True
        pre-fix, causing the gate to be hollow.

        Post-fix GREEN: returns False (D-5 fires on title band).
        """
        fp_table = _fp_table()
        title_text = "BANG KET QUA HOAT DONG KINH DOANH\n1.234.567\n"

        result = _fingerprints_continuous(fp_table, fp_table, stored_text_b=title_text)

        assert result is False, (
            f"DV-2 FAILED: Expected False (D-5 fires on title band), "
            f"got True. Title-band check is missing or not working."
        )

    # -----------------------------------------------------------------------
    # C-1 (FR-1): [table, table, prose] → 2 units
    # -----------------------------------------------------------------------

    def test_c1_table_table_prose_two_units(self):
        """C-1 (FR-1): Table×2 then prose → 2 units: table(p1,p2) prose(p3)."""
        fp_table = _fp_table()
        fp_prose = _fp_prose()

        units = _simulate_state_machine([fp_table, fp_table, fp_prose])

        assert len(units) == 2, f"Expected 2 units, got {len(units)}: {units}"
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1, 2]
        assert units[1]["page_type"] == "prose"
        assert units[1]["pages"] == [3]
        # Invariant: prose page NOT in the table unit
        assert 3 not in units[0]["pages"]

    # -----------------------------------------------------------------------
    # C-3 (FR-3): [table-no-title, table-with-title] → 2 units
    # -----------------------------------------------------------------------

    def test_c3_table_then_table_with_title_two_units(self):
        """C-3 (FR-3 AC-FR3-1): Two identical-geometry table pages where page 2 has a
        title band → 2 separate table units, not 1."""
        fp_table = _fp_table()
        title_text = "BAO CAO TAI CHINH HOP NHAT\n1.234.567\n"

        units = _simulate_state_machine(
            [fp_table, fp_table],
            stored_texts=["", title_text],
        )

        assert len(units) == 2, (
            f"C-3 FAILED: Expected 2 table units (title-band break), "
            f"got {len(units)}: {units}"
        )
        assert units[0]["page_type"] == "table"
        assert units[1]["page_type"] == "table"
        assert units[0]["pages"] == [1]
        assert units[1]["pages"] == [2]

    # -----------------------------------------------------------------------
    # C-4 (FR-4 AC-FR4-1): [table, blank, table-same-geometry-no-title] → 1 unit
    # -----------------------------------------------------------------------

    def test_c4_table_blank_table_same_geometry_one_unit(self):
        """C-4 (FR-4): Blank between two matching table pages → blank bridged, 1 unit."""
        fp_table = _fp_table()
        fp_blank = _fp_blank()

        units = _simulate_state_machine([fp_table, fp_blank, fp_table])

        assert len(units) == 1, (
            f"C-4 FAILED: Expected 1 unit (blank bridged), got {len(units)}: {units}"
        )
        assert units[0]["page_type"] == "table"
        assert set(units[0]["pages"]) == {1, 2, 3}

    # -----------------------------------------------------------------------
    # C-5 (FR-4 AC-FR4-2): [table, blank, prose] → 2 units, blank NOT in table
    # -----------------------------------------------------------------------

    def test_c5_table_blank_prose_blank_not_in_table_unit(self):
        """C-5 (FR-4 AC-FR4-2): Blank before prose — blank NOT bridged into table unit."""
        fp_table = _fp_table()
        fp_blank = _fp_blank()
        fp_prose = _fp_prose()

        units = _simulate_state_machine([fp_table, fp_blank, fp_prose])

        assert len(units) == 2, (
            f"C-5 FAILED: Expected 2 units (table then prose), got {len(units)}: {units}"
        )
        assert units[0]["page_type"] == "table"
        # Blank (page 2) MUST NOT be in the table unit
        assert 2 not in units[0]["pages"], (
            "C-5 FAILED: Blank page was incorrectly bridged into the table unit."
        )
        assert units[1]["page_type"] == "prose"
        assert 3 in units[1]["pages"]

    # -----------------------------------------------------------------------
    # C-6 (EC-3): [table, prose×8, table] different geometry → 3 units
    # -----------------------------------------------------------------------

    def test_c6_table_prose_section_table_three_units(self):
        """C-6 (EC-3): Table then 8 prose pages then another table → 3 units."""
        fp_table = _fp_table()
        fp_prose = _fp_prose()
        sequence = [fp_table] + [fp_prose] * 8 + [fp_table]

        units = _simulate_state_machine(sequence)

        assert len(units) == 3, (
            f"C-6 FAILED: Expected 3 units (table+prose_section+table), "
            f"got {len(units)}: {units}"
        )
        assert units[0]["page_type"] == "table"
        assert units[1]["page_type"] == "prose"
        assert units[2]["page_type"] == "table"
        assert units[1]["pages"] == list(range(2, 10))  # pages 2–9

    # -----------------------------------------------------------------------
    # C-7 (EC-4): [table, table-tiep-theo, table] same geometry → 1 unit
    # -----------------------------------------------------------------------

    def test_c7_tiep_theo_pages_stay_in_same_unit(self):
        """C-7 (EC-4): Continuation-marker page must NOT split the table unit."""
        fp_table = _fp_table()
        tiep_theo_text = "(tiếp theo)\n1.234.567\n2.345.678\n"

        units = _simulate_state_machine(
            [fp_table, fp_table, fp_table],
            stored_texts=["", tiep_theo_text, ""],
        )

        assert len(units) == 1, (
            f"C-7 FAILED: Continuation marker split the table. "
            f"Expected 1 unit, got {len(units)}: {units}"
        )
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1, 2, 3]

    # -----------------------------------------------------------------------
    # Additional state machine integrity tests
    # -----------------------------------------------------------------------

    def test_table_only_document_single_unit(self):
        """EC-2: All-table document with matching geometry → 1 unit."""
        fp = _fp_table()
        units = _simulate_state_machine([fp] * 5)
        assert len(units) == 1
        assert units[0]["pages"] == [1, 2, 3, 4, 5]

    def test_blank_only_at_start_discarded(self):
        """R-2: Leading blank pages before first non-blank are pre-doc fillers → discarded."""
        fp_blank = _fp_blank()
        fp_table = _fp_table()
        units = _simulate_state_machine([fp_blank, fp_blank, fp_table])
        assert len(units) == 1
        # Blank pages (1,2) must NOT appear in the table unit
        assert 1 not in units[0]["pages"]
        assert 2 not in units[0]["pages"]
        assert 3 in units[0]["pages"]

    def test_prose_pages_never_in_table_unit(self):
        """Invariant: no prose page appears in any table unit's pages list."""
        fp_table = _fp_table()
        fp_prose = _fp_prose()
        fp_blank = _fp_blank()

        sequence = [
            fp_table, fp_table, fp_prose, fp_prose,
            fp_table, fp_blank, fp_table, fp_prose,
        ]
        units = _simulate_state_machine(sequence)

        for unit in units:
            if unit["page_type"] == "table":
                for pn in unit["pages"]:
                    fp = sequence[pn - 1]
                    assert fp.get("page_type") != "prose", (
                        f"Prose page {pn} found in table unit: {unit}"
                    )

    def test_schema_page_type_from_first_page(self):
        """FR-1: Unit's page_type comes from its first (schema) page, not majority vote."""
        # A table unit that is flushed with only table pages → type="table"
        fp_table = _fp_table()
        fp_prose = _fp_prose()

        units = _simulate_state_machine([fp_table, fp_table, fp_prose])
        # First unit: 2 table pages → type must be "table"
        assert units[0]["page_type"] == "table"
        # Second unit: 1 prose page → type must be "prose"
        assert units[1]["page_type"] == "prose"

    def test_geometry_break_adjacency_model(self):
        """
        BTB-DRIFT-DEV semantic update (Architect brief R-2):
        group_pages_into_units uses adjacency-only continuity (matching PATH B).
        Two table pages with different gutter counts but no D-5 title signal are
        kept in ONE unit — geometric D-4 checks are NOT applied at this layer.

        The D-4 geometric check remains in _fingerprints_continuous (PATH A's
        _fingerprints_continuous still exists for backward-compat) but it is no
        longer in the grouping hot path.  If geometric continuity needs to be
        re-added to the grouper in a future sprint, it would be an optional
        parameter to group_pages_into_units.
        """
        fp_a = _fp_table(gutter_count=3)
        fp_b = _fp_table(gutter_count=2)

        units = _simulate_state_machine([fp_a, fp_b])

        # Adjacency-only: both are table pages, no title signal → stay in 1 unit
        assert len(units) == 1, (
            f"Expected 1 unit under adjacency model (no geometry check in grouper), "
            f"got {len(units)}: {units}"
        )
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1, 2]

    def test_single_page_table_document(self):
        """EC-1: Single D-1 page → 1 table unit."""
        units = _simulate_state_machine([_fp_table()])
        assert len(units) == 1
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1]

    def test_blank_pages_only_empty_result(self):
        """All-blank document → no non-blank pages → 0 units flushed."""
        units = _simulate_state_machine([_fp_blank(), _fp_blank()])
        assert len(units) == 0


# ===========================================================================
# Transition predicate unit tests (individual D-1 through D-5 checks)
# ===========================================================================

class TestTransitionPredicates:
    """
    Per-predicate tests for the five D-4 conditions and D-5.
    Each predicate is tested in isolation via _fingerprints_continuous.
    """

    def test_d1_table_page_type_required(self):
        """D-1: Both fingerprints must be page_type='table' to continue."""
        fp_table = _fp_table()
        fp_prose = _fp_prose()
        # prose → table is NOT continuous
        assert _fingerprints_continuous(fp_prose, fp_table) is False
        # table → prose is NOT continuous
        assert _fingerprints_continuous(fp_table, fp_prose) is False

    def test_d2_gutter_count_must_match(self):
        """D-4 condition 2: gutter_count mismatch → not continuous."""
        fp_a = _fp_table(gutter_count=3)
        fp_b = _fp_table(gutter_count=4)
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_d3_gutter_position_within_tolerance(self):
        """D-4 condition 3: gutter fraction within 5% tolerance → continuous."""
        fp_a = _fp_table(gutter_x_fractions=[0.30, 0.55, 0.72])
        fp_b = _fp_table(gutter_x_fractions=[0.34, 0.55, 0.72])  # 0.04 < 0.05
        assert _fingerprints_continuous(fp_a, fp_b) is True

    def test_d3_gutter_position_beyond_tolerance(self):
        """D-4 condition 3: gutter fraction beyond 5% tolerance → not continuous."""
        fp_a = _fp_table(gutter_x_fractions=[0.30, 0.55, 0.72])
        fp_b = _fp_table(gutter_x_fractions=[0.36, 0.55, 0.72])  # 0.06 > 0.05
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_d4_row_pitch_stability(self):
        """D-4 condition 4: pitch change > 50% → not continuous."""
        fp_a = _fp_table(row_pitch=10.0)
        fp_b = _fp_table(row_pitch=30.0)  # 20/30 ≈ 67% > 50% → break
        assert _fingerprints_continuous(fp_a, fp_b) is False

    def test_d4_row_pitch_within_tolerance(self):
        """D-4 condition 4: pitch change ≤ 50% → continuous (geometry only)."""
        fp_a = _fp_table(row_pitch=14.0)
        fp_b = _fp_table(row_pitch=20.0)  # 6/20 = 30% ≤ 50% → pass
        assert _fingerprints_continuous(fp_a, fp_b) is True

    def test_d5_title_band_fires(self):
        """D-5: Title-band text on page B → _fingerprints_continuous returns False."""
        fp = _fp_table()
        title_text = "MOT TIEU DE MANG TINH CHAT BAO CAO\n1.234.567\n"
        assert _fingerprints_continuous(fp, fp, stored_text_b=title_text) is False

    def test_d5_continuation_marker_suppresses_d5(self):
        """D-5: Continuation marker ('tiếp theo') suppresses D-5 → returns True."""
        fp = _fp_table()
        cont_text = "(tiếp theo)\n1.234.567\n"
        assert _fingerprints_continuous(fp, fp, stored_text_b=cont_text) is True

    def test_blank_fingerprint_never_continuous(self):
        """Blank pages must never pass the continuity test."""
        fp_blank = _fp_blank()
        fp_table = _fp_table()
        assert _fingerprints_continuous(fp_blank, fp_table) is False
        assert _fingerprints_continuous(fp_table, fp_blank) is False
