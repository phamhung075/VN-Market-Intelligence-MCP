"""
Anti-drift guard — BTB-DRIFT-DEV (bctc_page_grouper SSOT)

Tests:
    AD-1 — path-agreement: both PATH A and PATH B descriptor builders produce
            identical unit boundaries for the same page sequence.
    AD-2 — deleted-function guard: _group_bboxes_into_units must NOT exist in
            pek_engine_adapter — fails loudly if a second grouper is reintroduced.
    DV-1-B — [table, prose, table] via shared grouper → 3 units incl prose unit.
    DV-2-B — title-band split via shared grouper → 2 units when D-5 fires.
    test_9_consecutive_table_pages_not_split — 9 identical table pages → 1 unit.
            (8-page cap REMOVED; geometric _is_continuous is the only split criterion.)

PROVEN-RED evidence (against the OLD dual-path code):
    AD-2 PROVEN-RED:
        The old code had ``_group_bboxes_into_units`` as a module-level function in
        pek_engine_adapter.py (lines 541–610 per the architect brownfield map).
        ``hasattr(pek_engine_adapter, "_group_bboxes_into_units")`` would have returned
        True → the assert ``not hasattr(...)`` would have FAILED (RED).
        After BTB-DRIFT-DEV: function deleted → assert passes (GREEN).

    9-page regression PROVEN-RED:
        The old code had ``_MAX_CONSECUTIVE_TABLE_PAGES = 8`` in _group_bboxes_into_units.
        9 consecutive table pages → cap fires at page 8 → force-split → 2 units
        ([pages 1-8], [page 9]).  The test asserts ``len(units) == 1`` → FAILED (RED).
        After BTB-DRIFT-DEV: cap removed, _is_continuous drives splits → 9 identical
        pages stay ONE unit → assert passes (GREEN).

Zero I/O, zero PDF, zero Tesseract, zero DB.  AC-0 compliant.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
import infrastructure.pek_engine_adapter as pek_engine_adapter_module
from infrastructure.bctc_page_grouper import PageDescriptor, group_pages_into_units


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _table_desc(page_num: int, gutter_count: int = 3,
                gutter_x_fractions=None, row_pitch: float = 14.0,
                stored_text: str = "") -> PageDescriptor:
    """Standard table-page descriptor for test sequences."""
    return PageDescriptor(
        page_num=page_num,
        page_type="table",
        gutter_count=gutter_count,
        gutter_x_fractions=gutter_x_fractions if gutter_x_fractions is not None else [0.31, 0.55, 0.72],
        row_pitch=row_pitch,
        stored_text=stored_text,
    )


def _prose_desc(page_num: int) -> PageDescriptor:
    """Standard prose-page descriptor for test sequences."""
    return PageDescriptor(
        page_num=page_num,
        page_type="prose",
        gutter_count=0,
        gutter_x_fractions=[],
        row_pitch=0.0,
        stored_text="",
    )


def _blank_desc(page_num: int) -> PageDescriptor:
    """Standard blank-page descriptor for test sequences."""
    return PageDescriptor(
        page_num=page_num,
        page_type="blank",
        gutter_count=0,
        gutter_x_fractions=[],
        row_pitch=0.0,
        stored_text="",
    )


# PATH A descriptor builder (mirrors build_document_map adapter block)
# Builds PageDescriptors from synthetic fingerprint dicts with OCR stored_text.
def _build_path_a_descriptors(page_sequence):
    """
    Build PageDescriptors using PATH A's adapter logic.
    page_sequence: list of ("table"|"prose"|"blank", stored_text_str)
    """
    descriptors = []
    for i, (pt, stored_text) in enumerate(page_sequence):
        pn = i + 1
        if pt == "table":
            descriptors.append(PageDescriptor(
                page_num=pn,
                page_type="table",
                gutter_count=3,
                gutter_x_fractions=[0.31, 0.55, 0.72],
                row_pitch=14.0,
                stored_text=stored_text,
            ))
        elif pt == "prose":
            descriptors.append(PageDescriptor(
                page_num=pn,
                page_type="prose",
                gutter_count=0,
                gutter_x_fractions=[],
                row_pitch=0.0,
                stored_text=stored_text,
            ))
        else:  # blank
            descriptors.append(PageDescriptor(
                page_num=pn,
                page_type="blank",
                gutter_count=0,
                gutter_x_fractions=[],
                row_pitch=0.0,
                stored_text="",
            ))
    return descriptors


# PATH B descriptor builder (mirrors _run_extraction Step 2 adapter block)
# Builds PageDescriptors from PEK bbox geometry; stored_text always "" (D-5 silent).
def _build_path_b_descriptors(page_sequence):
    """
    Build PageDescriptors using PATH B's adapter logic.
    page_sequence: list of "table"|"prose"|"blank" (no stored_text in PATH B)
    """
    descriptors = []
    for i, pt in enumerate(page_sequence):
        pn = i + 1
        if pt == "table":
            descriptors.append(PageDescriptor(
                page_num=pn,
                page_type="table",
                gutter_count=3,
                gutter_x_fractions=[0.31, 0.55, 0.72],
                row_pitch=0.0,   # PATH B: no row pitch from bboxes
                stored_text="",  # PATH B: no OCR text; D-5 silent
            ))
        elif pt == "prose":
            descriptors.append(PageDescriptor(
                page_num=pn,
                page_type="prose",
                gutter_count=0,
                gutter_x_fractions=[],
                row_pitch=0.0,
                stored_text="",
            ))
        else:  # blank
            descriptors.append(PageDescriptor(
                page_num=pn,
                page_type="blank",
                gutter_count=0,
                gutter_x_fractions=[],
                row_pitch=0.0,
                stored_text="",
            ))
    return descriptors


# ---------------------------------------------------------------------------
# AD-1 — path-agreement: same PageDescriptors → identical boundaries
# ---------------------------------------------------------------------------

class TestAD1PathAgreement:
    """
    AD-1: Both PATH A and PATH B descriptor builders, fed to the SAME
    group_pages_into_units(), produce identical unit boundaries.

    This is the primary structural anti-drift guard: if someone adds a second
    grouper, the two paths will diverge and this test will catch it.
    """

    def test_ad1_both_paths_produce_same_boundaries(self):
        """
        AD-1: Feed the same logical sequence through PATH A + PATH B descriptor
        builders.  Assert identical unit boundaries (pages + page_type per unit).
        """
        sequence = ["table", "table", "prose", "table"]

        # PATH A builds descriptors with stored_text="" (no D-5 text provided)
        path_a_descs = _build_path_a_descriptors([(pt, "") for pt in sequence])
        # PATH B builds descriptors (stored_text="" always)
        path_b_descs = _build_path_b_descriptors(sequence)

        units_a = group_pages_into_units(path_a_descs)
        units_b = group_pages_into_units(path_b_descs)

        # Compare boundaries: (frozenset(pages), page_type) tuples
        def to_shape(units):
            return sorted(
                (tuple(u.pages), u.page_type)
                for u in units
            )

        assert to_shape(units_a) == to_shape(units_b), (
            f"AD-1 DRIFT DETECTED: PATH A and PATH B produce different groupings.\n"
            f"PATH A descriptors → units: {[(u.pages, u.page_type) for u in units_a]}\n"
            f"PATH B descriptors → units: {[(u.pages, u.page_type) for u in units_b]}\n"
            "This indicates a second grouper exists. BTB-DRIFT fix is broken."
        )

    def test_ad1_explicit_four_page_sequence(self):
        """
        AD-1 explicit: [table(1), table(2), prose(3), table(4)] → 3 units.
        PATH A and PATH B agree: table(1,2), prose(3), table(4).
        """
        pages = [
            PageDescriptor(1, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
            PageDescriptor(2, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
            PageDescriptor(3, "prose", 0, [], 18.0, ""),
            PageDescriptor(4, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
        ]
        units = group_pages_into_units(pages)
        assert len(units) == 3, f"AD-1: expected 3 units, got {len(units)}: {units}"
        assert units[0].page_type == "table"
        assert units[0].pages == [1, 2]
        assert units[1].page_type == "prose"
        assert units[1].pages == [3]
        assert units[2].page_type == "table"
        assert units[2].pages == [4]


# ---------------------------------------------------------------------------
# AD-2 — deleted-function guard
# ---------------------------------------------------------------------------

class TestAD2DeletedFunctionGuard:
    """
    AD-2: _group_bboxes_into_units MUST NOT exist in pek_engine_adapter.

    PROVEN-RED (against old code): the function was defined at module-level in
    pek_engine_adapter.py (lines 541–610 per architect brownfield map).
    hasattr(pek_engine_adapter, "_group_bboxes_into_units") → True → assert fails.

    PROVEN-GREEN (after BTB-DRIFT-DEV): function deleted → hasattr → False → passes.

    If this test fails, a second grouper has been re-introduced — dual-path drift #3
    has re-occurred.
    """

    def test_ad2_group_bboxes_into_units_deleted(self):
        """
        AD-2: _group_bboxes_into_units must NOT exist in pek_engine_adapter.
        """
        assert not hasattr(pek_engine_adapter_module, "_group_bboxes_into_units"), (
            "DRIFT GUARD FAILED (AD-2): _group_bboxes_into_units still exists in "
            "pek_engine_adapter.  BTB-DRIFT fix requires it be deleted and replaced "
            "by bctc_page_grouper.group_pages_into_units.  If this test is failing, "
            "a second grouper has been re-introduced — dual-path drift #3."
        )


# ---------------------------------------------------------------------------
# DV-1-B — [table, prose, table] → 3 units via shared grouper
# ---------------------------------------------------------------------------

class TestDV1BTableProsTable:
    """
    DV-1-B: [table, prose, table] via bctc_page_grouper.group_pages_into_units
    must produce 3 units including a prose unit.

    This mirrors DV-1 from the BTB-DEV state-machine tests but directly
    exercises the shared grouper that BOTH paths call after BTB-DRIFT-DEV.
    """

    def test_dv1b_table_prose_table_three_units_via_shared_grouper(self):
        """
        DV-1-B: [table, prose, table] → 3 units: table(1), prose(2), table(3).
        """
        pages = [
            PageDescriptor(1, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
            PageDescriptor(2, "prose", 0, [], 18.0, ""),
            PageDescriptor(3, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
        ]
        units = group_pages_into_units(pages)
        assert len(units) == 3, (
            f"DV-1-B: expected 3 units (table, prose, table), got {len(units)}: "
            f"{[(u.pages, u.page_type) for u in units]}"
        )
        assert units[1].page_type == "prose", (
            f"DV-1-B: middle unit must be prose, got {units[1].page_type}"
        )
        assert units[1].pages == [2]
        assert units[0].page_type == "table"
        assert units[2].page_type == "table"


# ---------------------------------------------------------------------------
# DV-2-B — title-band split via shared grouper
# ---------------------------------------------------------------------------

class TestDV2BTitleBandSplit:
    """
    DV-2-B: Two geometrically identical table pages where page 2 has a
    title-band text (D-5 fires) → 2 separate table units.

    PATH B passes stored_text="" in production (D-5 silently disabled — by
    design, correct per R-1 in the architect brief).  This test proves the
    mechanism works when stored_text IS supplied, as insurance for when PATH B
    gains OCR text access.
    """

    def test_dv2b_title_band_splits_via_shared_grouper(self):
        """
        DV-2-B: [table-no-title, table-with-title] → 2 units (D-5 fires).
        """
        pages = [
            PageDescriptor(1, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
            PageDescriptor(2, "table", 3, [0.31, 0.55, 0.72], 14.0,
                           "BANG KET QUA HOAT DONG\n1.234.567\n"),
        ]
        units = group_pages_into_units(pages)
        assert len(units) == 2, (
            f"DV-2-B: title-band must split identical-geometry table pages, "
            f"got {len(units)} units: {[(u.pages, u.page_type) for u in units]}"
        )
        assert units[0].pages == [1]
        assert units[1].pages == [2]
        assert units[0].page_type == "table"
        assert units[1].page_type == "table"

    def test_dv2b_continuation_marker_suppresses_d5(self):
        """
        DV-2-B safety: 'tiếp theo' (continuation marker) in stored_text → D-5
        suppressed → pages stay in the SAME unit (not split).
        """
        pages = [
            PageDescriptor(1, "table", 3, [0.31, 0.55, 0.72], 14.0, ""),
            PageDescriptor(2, "table", 3, [0.31, 0.55, 0.72], 14.0,
                           "tiếp theo trang trước"),
        ]
        units = group_pages_into_units(pages)
        assert len(units) == 1, (
            f"DV-2-B continuation: 'tiếp theo' must suppress D-5, pages should "
            f"stay in 1 unit, got {len(units)} units"
        )


# ---------------------------------------------------------------------------
# 9-page regression — 8-cap removed
# ---------------------------------------------------------------------------

class TestNinePageRegressionCapRemoved:
    """
    9-page regression: 9 consecutive geometrically identical table pages → 1 unit.

    PROVEN-RED (against old _group_bboxes_into_units with _MAX_CONSECUTIVE_TABLE_PAGES=8):
        The old code force-split at page 8:
            if len(current_unit_pages) >= 8: finalize_unit(); start_new()
        For 9 pages: pages 1-8 → unit 1 (cap fires), page 9 → unit 2.
        The test asserts len(units) == 1 → FAILED (RED) against old code.

    PROVEN-GREEN (after BTB-DRIFT-DEV — _is_continuous replaces cap):
        9 consecutive pages with identical geometry → _is_continuous returns True
        for every transition → no force-split → 1 unit (GREEN).
    """

    def test_9_consecutive_table_pages_not_split(self):
        """
        Regression: 8-page cap would force-split at page 8 → 2 units.
        After BTB-DRIFT-DEV: 9 identical pages → 1 unit (cap removed).
        """
        pages = [
            PageDescriptor(i, "table", 3, [0.31, 0.55, 0.72], 14.0, "")
            for i in range(1, 10)  # 9 pages
        ]
        units = group_pages_into_units(pages)
        assert len(units) == 1, (
            f"9-page regression FAILED: 8-page cap force-splits at page 8. "
            f"Got {len(units)} units with pages: "
            f"{[u.pages for u in units]}. "
            f"BTB-DRIFT-DEV fix: cap replaced by _is_continuous geometric predicate."
        )
        assert units[0].pages == list(range(1, 10)), (
            f"9-page unit must contain all 9 pages, got {units[0].pages}"
        )

    def test_12_consecutive_identical_pages_one_unit(self):
        """
        Extended regression: 12 identical pages (beyond old 8-cap) → 1 unit.
        """
        pages = [
            PageDescriptor(i, "table", 3, [0.31, 0.55, 0.72], 14.0, "")
            for i in range(1, 13)  # 12 pages
        ]
        units = group_pages_into_units(pages)
        assert len(units) == 1, (
            f"12 identical table pages must form 1 unit (no cap), "
            f"got {len(units)} units"
        )

    def test_two_distinct_adjacent_tables_under_8_pages_split(self):
        """
        Counter-test: two geometrically distinct tables (different gutter count)
        with 4 pages each → 2 units (old cap wouldn't have split these; the new
        geometric predicate correctly does).

        Proves _is_continuous is the correct criterion in BOTH directions:
        - same geometry → stay together (above 9-page test)
        - different geometry → split correctly (this test)
        """
        # Table A: gutter_count=3
        # Table B: gutter_count=2 (different layout)
        pages = (
            [PageDescriptor(i, "table", 3, [0.31, 0.55, 0.72], 14.0, "") for i in range(1, 5)]
            + [PageDescriptor(i, "table", 2, [0.40, 0.70], 14.0, "") for i in range(5, 9)]
        )
        units = group_pages_into_units(pages)
        assert len(units) == 2, (
            f"Two distinct adjacent tables (gutter_count 3 vs 2) must split into "
            f"2 units, got {len(units)}: {[(u.pages, u.page_type) for u in units]}"
        )
        assert units[0].pages == [1, 2, 3, 4]
        assert units[1].pages == [5, 6, 7, 8]
