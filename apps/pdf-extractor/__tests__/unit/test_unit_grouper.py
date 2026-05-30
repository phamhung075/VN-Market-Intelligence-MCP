"""
Unit tests — infrastructure.unit_grouper

Covers:
    - _has_new_title: D-5 title-band detector on pre-extracted hint strings
    - group_pages_into_units: all 7 BTB-ARCH sequences (C-1 through C-7) plus
      new prose-unit emission, blank-bridge, 8-page cap, and edge cases.

All tests are pure-function unit tests. Zero I/O, zero PDF, zero OCR, zero DB.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from infrastructure.unit_grouper import group_pages_into_units, _has_new_title


# ---------------------------------------------------------------------------
# Helper builders
# ---------------------------------------------------------------------------

def _page(page_num: int, page_type: str, title_hints=None):
    return {
        "page_num": page_num,
        "page_type": page_type,
        "title_hints": title_hints or [],
    }


def _table(n, title_hints=None):
    return _page(n, "table", title_hints)


def _prose(n):
    return _page(n, "prose")


def _blank(n):
    return _page(n, "blank")


def _seq(*pages):
    """Shorthand: build a pages list from pre-built page dicts."""
    return list(pages)


def _units_pages(units):
    """Return just (frozenset(pages), page_type) tuples for easy comparison."""
    return [(tuple(sorted(u["pages"])), u["page_type"]) for u in units]


# ===========================================================================
# _has_new_title
# ===========================================================================

class TestHasNewTitle:
    """Tests for the _has_new_title D-5 detector."""

    def test_empty_list_returns_false(self):
        assert _has_new_title([]) is False

    def test_list_of_empty_strings_returns_false(self):
        assert _has_new_title(["", "   "]) is False

    def test_non_empty_hint_without_marker_returns_true(self):
        assert _has_new_title(["BAO CAO TAI CHINH"]) is True

    def test_tiep_theo_suppresses_d5(self):
        assert _has_new_title(["tiếp theo"]) is False

    def test_tiep_theo_case_insensitive(self):
        assert _has_new_title(["Tiếp Theo"]) is False

    def test_continued_suppresses_d5(self):
        assert _has_new_title(["(continued)"]) is False

    def test_continued_without_parens_suppresses_d5(self):
        assert _has_new_title(["continued"]) is False

    def test_first_continuation_hint_suppresses_d5(self):
        """When the first non-empty hint is a continuation marker, D-5 is suppressed."""
        assert _has_new_title(["tiếp theo", "BAO CAO TAI CHINH"]) is False

    def test_new_title_with_multiple_hints(self):
        """First non-empty hint is a real title → D-5 fires."""
        assert _has_new_title(["BAO CAO TAI CHINH", "BAO CAO PHU"]) is True

    def test_mixed_empty_then_title(self):
        """Skip empty hints, find title → True."""
        assert _has_new_title(["", "  ", "BANG KET QUA"]) is True


# ===========================================================================
# group_pages_into_units — core state machine sequences
# ===========================================================================

class TestGroupPagesIntoUnits:
    """
    Covers BTB-ARCH sequences C-1 through C-7 plus additional cases.
    """

    # -----------------------------------------------------------------------
    # C-1: [table, table, prose] → 2 units: table(1,2), prose(3)
    # -----------------------------------------------------------------------
    def test_c1_table_table_prose_two_units(self):
        pages = _seq(_table(1), _table(2), _prose(3))
        units = group_pages_into_units(pages)
        assert len(units) == 2
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1, 2]
        assert units[1]["page_type"] == "prose"
        assert units[1]["pages"] == [3]
        assert 3 not in units[0]["pages"]

    # -----------------------------------------------------------------------
    # C-2: [table, prose, table] → 3 units: table(1), prose(2), table(3)
    # (DV-1 equivalent for unit_grouper)
    # -----------------------------------------------------------------------
    def test_c2_table_prose_table_three_units(self):
        pages = _seq(_table(1), _prose(2), _table(3))
        units = group_pages_into_units(pages)
        assert len(units) == 3
        assert units[0] == {
            **units[0], "page_type": "table", "pages": [1]
        }
        assert units[1]["page_type"] == "prose"
        assert units[1]["pages"] == [2]
        assert units[2]["page_type"] == "table"
        assert units[2]["pages"] == [3]

    # -----------------------------------------------------------------------
    # C-3: [table-no-title, table-with-title] → 2 table units
    # -----------------------------------------------------------------------
    def test_c3_table_then_table_with_title_splits(self):
        pages = _seq(
            _table(1),
            _table(2, title_hints=["BAO CAO TAI CHINH HOP NHAT"]),
        )
        units = group_pages_into_units(pages)
        assert len(units) == 2
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1]
        assert units[1]["page_type"] == "table"
        assert units[1]["pages"] == [2]

    # -----------------------------------------------------------------------
    # C-4: [table, blank, table-same-no-title] → 1 unit (blank bridged)
    # -----------------------------------------------------------------------
    def test_c4_blank_bridged_between_table_pages(self):
        pages = _seq(_table(1), _blank(2), _table(3))
        units = group_pages_into_units(pages)
        assert len(units) == 1
        assert units[0]["page_type"] == "table"
        assert set(units[0]["pages"]) == {1, 2, 3}

    # -----------------------------------------------------------------------
    # C-5: [table, blank, prose] → 2 units, blank NOT in table unit
    # -----------------------------------------------------------------------
    def test_c5_blank_before_prose_not_bridged(self):
        pages = _seq(_table(1), _blank(2), _prose(3))
        units = group_pages_into_units(pages)
        assert len(units) == 2
        assert units[0]["page_type"] == "table"
        assert 2 not in units[0]["pages"], "Blank was incorrectly bridged into table unit"
        assert units[1]["page_type"] == "prose"
        assert 3 in units[1]["pages"]

    # -----------------------------------------------------------------------
    # C-6: [table, prose×8, table] → 3 units
    # -----------------------------------------------------------------------
    def test_c6_table_prose_section_table(self):
        pages = (
            [_table(1)]
            + [_prose(i) for i in range(2, 10)]
            + [_table(10)]
        )
        units = group_pages_into_units(pages)
        assert len(units) == 3
        assert units[0]["page_type"] == "table"
        assert units[1]["page_type"] == "prose"
        assert units[1]["pages"] == list(range(2, 10))
        assert units[2]["page_type"] == "table"
        assert units[2]["pages"] == [10]

    # -----------------------------------------------------------------------
    # C-7: [table, table-tiep-theo, table] → 1 unit (no D-5 split)
    # -----------------------------------------------------------------------
    def test_c7_tiep_theo_stays_in_same_unit(self):
        pages = _seq(
            _table(1),
            _table(2, title_hints=["(tiếp theo)"]),
            _table(3),
        )
        units = group_pages_into_units(pages)
        assert len(units) == 1
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1, 2, 3]

    # -----------------------------------------------------------------------
    # New: prose unit emission (BLOCKING-2 fix)
    # -----------------------------------------------------------------------
    def test_prose_unit_emitted_not_discarded(self):
        """[table, prose] → 2 units; the prose page is emitted, not dropped."""
        pages = _seq(_table(1), _prose(2))
        units = group_pages_into_units(pages)
        assert len(units) == 2
        prose_units = [u for u in units if u["page_type"] == "prose"]
        assert len(prose_units) == 1
        assert prose_units[0]["pages"] == [2]

    def test_document_starting_with_prose_emits_prose_unit(self):
        """Doc starts with prose: prose unit emitted before table unit."""
        pages = _seq(_prose(1), _prose(2), _table(3))
        units = group_pages_into_units(pages)
        assert len(units) == 2
        assert units[0]["page_type"] == "prose"
        assert units[0]["pages"] == [1, 2]
        assert units[1]["page_type"] == "table"

    # -----------------------------------------------------------------------
    # Consecutive table pages — no geometric cap in bctc_page_grouper
    # -----------------------------------------------------------------------
    def test_many_table_pages_same_geometry_one_unit(self):
        """9 consecutive same-geometry table pages → 1 unit (no 8-page cap;
        bctc_page_grouper uses geometric continuity, not an arbitrary cap)."""
        pages = [_table(i) for i in range(1, 10)]
        units = group_pages_into_units(pages)
        assert len(units) == 1
        assert units[0]["page_type"] == "table"
        assert len(units[0]["pages"]) == 9

    def test_title_break_splits_long_sequence(self):
        """A title-band signal (D-5) on page 5 splits the sequence into 2 units."""
        pages = (
            [_table(i) for i in range(1, 5)]
            + [_table(5, title_hints=["BAO CAO TAI CHINH HOP NHAT"])]
            + [_table(i) for i in range(6, 9)]
        )
        units = group_pages_into_units(pages)
        assert len(units) == 2
        assert units[0]["pages"] == [1, 2, 3, 4]
        assert units[1]["pages"] == [5, 6, 7, 8]

    # -----------------------------------------------------------------------
    # New: trailing blank discarded
    # -----------------------------------------------------------------------
    def test_trailing_blank_discarded(self):
        """[table, blank] → 1 table unit; trailing blank not emitted."""
        pages = _seq(_table(1), _blank(2))
        units = group_pages_into_units(pages)
        assert len(units) == 1
        assert units[0]["pages"] == [1]

    def test_trailing_blank_after_prose_discarded(self):
        """[prose, blank] → 1 prose unit; trailing blank not emitted."""
        pages = _seq(_prose(1), _blank(2))
        units = group_pages_into_units(pages)
        assert len(units) == 1
        assert units[0]["page_type"] == "prose"
        assert units[0]["pages"] == [1]

    # -----------------------------------------------------------------------
    # Edge cases
    # -----------------------------------------------------------------------
    def test_empty_input_returns_empty(self):
        assert group_pages_into_units([]) == []

    def test_single_table_page(self):
        """EC-1: Single table page → 1 unit."""
        units = group_pages_into_units([_table(1)])
        assert len(units) == 1
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1]

    def test_single_prose_page(self):
        units = group_pages_into_units([_prose(1)])
        assert len(units) == 1
        assert units[0]["page_type"] == "prose"

    def test_blank_only_document(self):
        """All-blank document → 0 units."""
        units = group_pages_into_units([_blank(1), _blank(2)])
        assert units == []

    def test_leading_blanks_discarded(self):
        """Leading blank pages are pre-document fillers — not emitted."""
        pages = _seq(_blank(1), _blank(2), _table(3))
        units = group_pages_into_units(pages)
        assert len(units) == 1
        assert 1 not in units[0]["pages"]
        assert 2 not in units[0]["pages"]
        assert 3 in units[0]["pages"]

    def test_schema_page_is_first_page_of_unit(self):
        """unit.schema_page must equal unit.pages[0]."""
        pages = [_table(i) for i in range(1, 4)]
        units = group_pages_into_units(pages)
        for u in units:
            assert u["schema_page"] == u["pages"][0]

    def test_unit_id_is_unique_per_unit(self):
        """Each unit gets a distinct UUID."""
        pages = _seq(_table(1), _prose(2), _table(3))
        units = group_pages_into_units(pages)
        ids = [u["unit_id"] for u in units]
        assert len(ids) == len(set(ids))

    def test_all_table_document_one_unit(self):
        """EC-2: all table pages with no D-5 signals → 1 unit."""
        pages = [_table(i) for i in range(1, 6)]
        units = group_pages_into_units(pages)
        assert len(units) == 1
        assert units[0]["pages"] == [1, 2, 3, 4, 5]

    def test_complex_bctc_pattern(self):
        """EC-5: balance sheet p1-3, notes p4, cash flow p5-7."""
        pages = (
            [_table(i) for i in range(1, 4)]
            + [_prose(4)]
            + [_table(i) for i in range(5, 8)]
        )
        units = group_pages_into_units(pages)
        assert len(units) == 3
        assert units[0]["page_type"] == "table"
        assert units[0]["pages"] == [1, 2, 3]
        assert units[1]["page_type"] == "prose"
        assert units[1]["pages"] == [4]
        assert units[2]["page_type"] == "table"
        assert units[2]["pages"] == [5, 6, 7]

    def test_prose_pages_never_in_table_unit(self):
        """Invariant: no prose page appears in any table unit's pages list."""
        pages = (
            [_table(1), _table(2), _prose(3), _prose(4),
             _table(5), _blank(6), _table(7), _prose(8)]
        )
        units = group_pages_into_units(pages)
        for unit in units:
            if unit["page_type"] == "table":
                for pn in unit["pages"]:
                    orig = pages[pn - 1]
                    assert orig["page_type"] != "prose", (
                        f"Prose page {pn} found in table unit: {unit}"
                    )

    def test_blank_between_two_table_blanks_bridged(self):
        """[table, blank, blank, table] → blank pages bridged, 1 unit."""
        pages = _seq(_table(1), _blank(2), _blank(3), _table(4))
        units = group_pages_into_units(pages)
        assert len(units) == 1
        assert set(units[0]["pages"]) == {1, 2, 3, 4}

    def test_blank_between_prose_pages_prose_continues(self):
        """[prose, blank, prose] → prose continues as one unit (blank discarded
        between prose pages since bctc_page_grouper discards pending_blanks
        on each non-blank page in NO_TABLE state)."""
        pages = _seq(_prose(1), _blank(2), _prose(3))
        units = group_pages_into_units(pages)
        assert len(units) == 1
        assert units[0]["page_type"] == "prose"
        # Blank (p2) may or may not appear depending on bridge semantics —
        # what matters is that prose pages p1 and p3 are in one unit.
        assert 1 in units[0]["pages"]
        assert 3 in units[0]["pages"]

    def test_title_on_first_page_of_document_opens_table_unit(self):
        """First table page with title hint → opens table unit (D-5 only fires
        when TABLE_OPEN; first page of document opens a fresh unit regardless)."""
        pages = _seq(_table(1, title_hints=["BAO CAO"]), _table(2))
        units = group_pages_into_units(pages)
        # p1 opens first unit; p2 has no title hint → continue
        assert len(units) == 1
        assert units[0]["pages"] == [1, 2]

    def test_d5_only_fires_when_table_open(self):
        """Title on a page that opens a NEW unit (after flush) is the schema
        page of that new unit — D-5 only fires on continuation pages."""
        # table(1), then table(2) with title → flush p1, open p2 as new unit
        pages = _seq(_table(1), _table(2, title_hints=["TIEU DE MOI"]))
        units = group_pages_into_units(pages)
        assert len(units) == 2
        assert units[1]["pages"] == [2]
        assert units[1]["schema_page"] == 2
