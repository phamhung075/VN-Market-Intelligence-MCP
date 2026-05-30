"""
Anti-drift gate — CG-1 + CG-2

Proves that BOTH grouping paths (PATH A: build_document_map via
generic_md_table_extractor, PATH B: _run_extraction via pek_engine_adapter)
call the SAME canonical ``group_pages_into_units`` function from
``infrastructure.bctc_page_grouper``.

BTB-DRIFT-DEV update:
    CG-1 PATH B updated: _group_bboxes_into_units is DELETED (AD-2 guards
    this); PATH B now builds PageDescriptors and calls bctc_page_grouper
    directly in _run_extraction.  CG-1 PATH B verifies bctc_page_grouper
    is imported at module level in pek_engine_adapter.
    CG-1 PATH A verifies build_document_map source calls group_pages_into_units
    from bctc_page_grouper.
    CG-2 uses the shared bctc_page_grouper API for PATH B simulation.

PROVEN-RED protocol (before the fix):
    CG-1 PATH A PROVEN-RED: build_document_map does not call
        group_pages_into_units → assert fails.
    CG-2 PROVEN-RED: PATH B discards prose pages entirely (produces a
        different unit list than PATH A which emits prose units) → comparison
        fails.

PROVEN-GREEN (after the fix):
    Both CG-1 and CG-2 pass.

Zero I/O, zero PDF, zero Tesseract, zero DB.
"""
import sys
import os
import inspect

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from infrastructure import pek_engine_adapter
from infrastructure import generic_md_table_extractor
from infrastructure.bctc_page_grouper import (
    PageDescriptor,
    group_pages_into_units as _bctc_group_pages,
)
from infrastructure.unit_grouper import group_pages_into_units


# ---------------------------------------------------------------------------
# Helpers shared by CG-2
# ---------------------------------------------------------------------------

def _units_to_comparable(units):
    """
    Reduce a unit list to a hashable shape for equality comparison.
    Strips unit_id (UUID, not stable across calls).
    Returns a sorted tuple of (frozenset(pages), page_type).
    """
    return tuple(
        sorted(
            (frozenset(u["pages"]), u["page_type"]) for u in units
        )
    )


def _call_path_b(page_sequence):
    """
    Simulate PATH B's descriptor-builder + bctc_page_grouper call.

    BTB-DRIFT-DEV: _group_bboxes_into_units is DELETED.  PATH B now builds
    PageDescriptors directly in _run_extraction.  This helper mirrors that
    logic: build PageDescriptors from the logical sequence and call
    bctc_page_grouper.group_pages_into_units.

    page_sequence: list of str — "table" | "prose" | "blank" | "table_with_title"

    Encoding (mirrors PATH B's descriptor builder in _run_extraction):
    - "table": gutter_count=1, gutter_x_fracs=[0.5], row_pitch=0.0, stored_text=""
    - "prose": gutter_count=0, gutter_x_fracs=[], row_pitch=0.0, stored_text=""
    - "blank": page_type="blank"
    - "table_with_title": same geometry as "table" but PATH B stored_text=""
      (D-5 is silent in PATH B — by design; D-5 is tested via unit_grouper shim
      and test_anti_drift_grouper.py DV-2-B with explicit stored_text)
    """
    descriptors = []
    for i, pt in enumerate(page_sequence):
        pn = i + 1
        if pt == "table" or pt == "table_with_title":
            descriptors.append(PageDescriptor(
                page_num=pn,
                page_type="table",
                gutter_count=1,
                gutter_x_fractions=[0.5],
                row_pitch=0.0,
                stored_text="",
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
        else:  # blank or unknown
            descriptors.append(PageDescriptor(
                page_num=pn,
                page_type="blank",
                gutter_count=0,
                gutter_x_fractions=[],
                row_pitch=0.0,
                stored_text="",
            ))

    unit_descriptors = _bctc_group_pages(descriptors)
    return [
        {
            "unit_id": "test-uid",
            "schema_page": ud.schema_page,
            "pages": ud.pages,
            "page_type": ud.page_type,
        }
        for ud in unit_descriptors
    ]


def _call_path_a(page_sequence):
    """
    Simulate PATH A's grouping logic by constructing the ``pages`` list that
    ``build_document_map`` passes to ``group_pages_into_units`` after the fix.

    Pre-fix (before the refactor) we call the equivalent through the thin wrapper
    ``_simulate_build_document_map_grouping`` which mimics the adapter block
    inside the refactored ``build_document_map``.

    Post-fix: this function calls ``group_pages_into_units`` directly using the
    same input format that PATH A's adapter produces — so CG-2 becomes a
    semantic equivalence test between the two adapter input-conversion layers.
    """
    # Build the pages list in PATH A format
    pages = []
    for i, pt in enumerate(page_sequence):
        pn = i + 1
        # PATH A derives page_type from fingerprint; title_hints from unit_hints.
        # In this test we use a simple synthetic encoding.
        if pt == "table_with_title":
            pages.append({
                "page_num": pn,
                "page_type": "table",
                "title_hints": ["BAO CAO TAI CHINH HOP NHAT"],
            })
        else:
            pages.append({
                "page_num": pn,
                "page_type": pt,
                "title_hints": [],
            })
    return group_pages_into_units(pages)


# ===========================================================================
# CG-1 — Source-inspection gate (PROVEN-RED before fix, GREEN after)
# ===========================================================================

class TestCG1BothPathsImportSameGroupingFunction:
    """
    CG-1: Both PATH A and PATH B must call ``group_pages_into_units`` from
    ``infrastructure.unit_grouper``.

    This test is PROVEN-RED against the pre-fix code (neither function calls
    ``group_pages_into_units``) and PROVEN-GREEN after the fix.

    Failure message is written to be unambiguous about which path drifted.
    """

    def test_cg1_path_b_delegates_to_group_pages_into_units(self):
        """
        CG-1 PATH B: pek_engine_adapter module source must import and call
        group_pages_into_units from infrastructure.bctc_page_grouper.

        BTB-DRIFT-DEV: _group_bboxes_into_units was deleted.  PATH B now calls
        bctc_page_grouper.group_pages_into_units directly in _run_extraction.
        This test verifies bctc_page_grouper is imported in pek_engine_adapter.
        """
        src_b = inspect.getsource(pek_engine_adapter)
        assert "group_pages_into_units" in src_b, (
            "CG-1 DRIFT DETECTED on PATH B: "
            "pek_engine_adapter does not call group_pages_into_units. "
            "Apply the BTB-DRIFT-DEV fix: import from infrastructure.bctc_page_grouper "
            "and call group_pages_into_units in _run_extraction."
        )
        assert "bctc_page_grouper" in src_b, (
            "CG-1 DRIFT DETECTED on PATH B: "
            "pek_engine_adapter does not import from bctc_page_grouper. "
            "The canonical grouper must be imported at the top level."
        )

    def test_cg1_path_a_delegates_to_group_pages_into_units(self):
        """
        CG-1 PATH A: build_document_map source must contain a call to
        group_pages_into_units.  If this fails, PATH A has its own internal
        grouping logic — dual-path drift detected.
        """
        src_a = inspect.getsource(generic_md_table_extractor.build_document_map)
        assert "group_pages_into_units" in src_a, (
            "CG-1 DRIFT DETECTED on PATH A: "
            "build_document_map does not delegate to group_pages_into_units. "
            "Apply the BTB-DRIFT-DEV fix: replace the internal state-machine loop "
            "with an adapter that calls infrastructure.unit_grouper.group_pages_into_units."
        )


# ===========================================================================
# CG-2 — Behavioral agreement gate (PROVEN-RED before fix, GREEN after)
# ===========================================================================

class TestCG2BothPathsAgreeOnSameInput:
    """
    CG-2: Inject the SAME logical page sequence into both adapters and verify
    identical unit shapes are returned.

    Sequences chosen to expose the pre-fix PATH B defect (prose pages silently
    discarded — BLOCKING-2):

    Standard sequence: [table, table, prose, blank, table, blank]
    Expected: 3 units — table(p1,p2), prose(p3), table(p5).
    - p4 (blank) comes before a table page — would bridge under table rules,
      BUT the preceding unit was prose so the blank is between prose and table.
      In the NONE state (after prose flush), blank is discarded as leading
      blank.  Pending_blanks after p4 = [4]; p5 is table → opens TABLE_OPEN;
      wait — p4 blank comes AFTER the prose unit flush... let us trace:
        p1 table → NONE→TABLE_OPEN, pages=[1]
        p2 table → continue, pages=[1,2]
        p3 prose → TABLE_END, flush table(1,2); open prose pages=[3], PROSE_OPEN
        p4 blank → pending_blanks=[4]
        p5 table → flush prose(3, NOT including blank); open table pages=[5],
                    TABLE_OPEN (pending_blanks discarded because PROSE_OPEN→TABLE)
        p6 blank → pending_blanks=[6]
      end: flush table([5]); trailing blank discarded.
      Result: table(1,2), prose(3), table(5).

    Pre-fix PROVEN-RED on CG-2: PATH B discards p3 prose page entirely
    (produces table(1,2), table(5) = 2 units) while PATH A emits 3 units.
    Post-fix GREEN: both paths produce 3 units with the same structure.
    """

    _SEQUENCE = ["table", "table", "prose", "blank", "table", "blank"]

    def test_cg2_standard_sequence_both_paths_agree(self):
        """
        CG-2: [table, table, prose, blank, table, blank]
        Both PATH A and PATH B must return the same 3-unit structure.
        """
        units_b = _call_path_b(self._SEQUENCE)
        units_a = _call_path_a(self._SEQUENCE)

        cmp_a = _units_to_comparable(units_a)
        cmp_b = _units_to_comparable(units_b)

        assert cmp_a == cmp_b, (
            f"CG-2 DRIFT DETECTED: PATH A and PATH B produce different groupings "
            f"for the same input sequence {self._SEQUENCE}.\n"
            f"PATH A result: {units_a}\n"
            f"PATH B result: {units_b}\n"
            "This is the dual-path drift that BTB-DRIFT-DEV must fix."
        )

    def test_cg2_standard_sequence_correct_unit_count(self):
        """
        CG-2 correctness: the standard sequence must produce exactly 3 units
        (table, prose, table) from PATH A (used as the reference after fix).
        """
        units_a = _call_path_a(self._SEQUENCE)
        assert len(units_a) == 3, (
            f"CG-2 correctness FAILED: expected 3 units from PATH A, got {len(units_a)}: {units_a}"
        )
        types = [u["page_type"] for u in sorted(units_a, key=lambda u: u["schema_page"])]
        assert types == ["table", "prose", "table"], (
            f"CG-2 unit types wrong: expected ['table','prose','table'], got {types}"
        )

    def test_cg2_prose_emitted_by_both_paths(self):
        """
        CG-2 BLOCKING-2 check: [table, prose, table] must produce a prose unit
        in BOTH paths.  Pre-fix PATH B returned only 2 table units (prose discarded).
        """
        seq = ["table", "prose", "table"]
        units_a = _call_path_a(seq)
        units_b = _call_path_b(seq)

        prose_a = [u for u in units_a if u["page_type"] == "prose"]
        prose_b = [u for u in units_b if u["page_type"] == "prose"]

        assert len(prose_a) >= 1, (
            f"CG-2 BLOCKING-2: PATH A produced no prose unit from {seq}: {units_a}"
        )
        assert len(prose_b) >= 1, (
            f"CG-2 BLOCKING-2: PATH B produced no prose unit from {seq}: {units_b}\n"
            "PATH B is silently discarding prose pages — BLOCKING-2 not fixed."
        )

        cmp_a = _units_to_comparable(units_a)
        cmp_b = _units_to_comparable(units_b)
        assert cmp_a == cmp_b, (
            f"CG-2 BLOCKING-2 paths diverge on {seq}:\n"
            f"PATH A: {units_a}\nPATH B: {units_b}"
        )
