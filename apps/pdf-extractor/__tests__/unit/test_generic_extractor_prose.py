"""
Unit tests — ocr_unit() prose branch (BPE-DEV-1 regression guard)

Validates the prose branch fix: ocr_unit() must return non-empty stitched_markdown
when ocr_pages contains text for the pages in the unit.

Previously ocr_unit() declared prose_lines=[] but never appended to it — returning
stitched_markdown="" always for prose units (silent 7-sprint regression). These tests
are the guard that would have caught that defect.

All tests: zero I/O, zero Tesseract, zero DB. Pure function tests.
"""

import sys
import os
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from infrastructure.generic_md_table_extractor import ocr_unit


# ===========================================================================
# Helpers
# ===========================================================================

def _prose_unit(pages: list, unit_id: str = None) -> dict:
    """Build a minimal prose unit dict."""
    return {
        "unit_id": unit_id or str(uuid.uuid4()),
        "pages": pages,
        "page_type": "prose",
        "schema_page": pages[0] if pages else None,
    }


def _ocr_page(page_number: int, text: str) -> dict:
    """Build a stored OCR page dict (matches fetch_ocr_pages output schema)."""
    return {"page_number": page_number, "text": text}


# ===========================================================================
# TC-1: Prose branch with text → non-empty stitched_markdown
# ===========================================================================

class TestProseWithText:

    def test_single_page_returns_nonempty_stitched_markdown(self):
        """
        TC-1: prose unit + ocr_pages with text → stitched_markdown != "".
        Core regression guard: this assertion was MISSING for 7+ sprints.
        """
        unit = _prose_unit(pages=[12])
        ocr_pages = [_ocr_page(12, "Chính sách kế toán áp dụng cho kỳ kế toán.")]

        result = ocr_unit(
            unit=unit,
            zones_by_page={},
            pdf_path="",
            tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert result["stitched_markdown"] != "", (
            "Prose unit with OCR text must return non-empty stitched_markdown"
        )
        assert result.get("_prose_no_text") is not True, (
            "_prose_no_text must not be True when text is present"
        )

    def test_stitched_markdown_contains_source_text(self):
        """stitched_markdown content must match the stored OCR text."""
        source_text = "Công ty cổ phần FPT — thuyết minh báo cáo tài chính."
        unit = _prose_unit(pages=[12])
        ocr_pages = [_ocr_page(12, source_text)]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert source_text in result["stitched_markdown"]

    def test_row_count_equals_nonempty_line_count(self):
        """
        TC-1 row_count: for prose units, row_count = count of non-empty text lines
        (not table rows).
        """
        text = "Doanh thu thuần:\n\nLợi nhuận gộp:\nChi phí tài chính:"
        # 3 non-empty lines above (blank line excluded)
        unit = _prose_unit(pages=[5])
        ocr_pages = [_ocr_page(5, text)]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert result["row_count"] == 3, (
            f"Expected row_count=3 (non-empty lines), got {result['row_count']}"
        )

    def test_multi_page_prose_unit_concatenated(self):
        """Multi-page prose unit: pages stitched in page-number order."""
        unit = _prose_unit(pages=[10, 11, 12])
        ocr_pages = [
            _ocr_page(12, "Page 12 text."),
            _ocr_page(10, "Page 10 text."),
            _ocr_page(11, "Page 11 text."),
        ]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        sm = result["stitched_markdown"]
        assert sm != ""
        # Pages must appear in ascending page-number order
        assert sm.index("Page 10") < sm.index("Page 11") < sm.index("Page 12"), (
            "Prose pages must be stitched in ascending page-number order"
        )

    def test_prose_no_text_flag_absent_when_text_present(self):
        """_prose_no_text key must not be set (or must be False) when text present."""
        unit = _prose_unit(pages=[1])
        ocr_pages = [_ocr_page(1, "Some text content.")]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        # Either key absent or explicitly False — must not be True
        assert result.get("_prose_no_text") is not True


# ===========================================================================
# TC-1b: Prose branch with empty ocr_pages → stitched_markdown="" + _prose_no_text=True
# ===========================================================================

class TestProseAllBlank:

    def test_empty_text_returns_empty_stitched_markdown(self):
        """
        TC-1b: prose unit + ocr_pages with empty text →
        stitched_markdown == "" and _prose_no_text == True.
        """
        unit = _prose_unit(pages=[12])
        ocr_pages = [_ocr_page(12, "")]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert result["stitched_markdown"] == "", (
            "All-blank prose unit must return stitched_markdown=''"
        )
        assert result.get("_prose_no_text") is True, (
            "_prose_no_text must be True when all pages have empty text"
        )

    def test_none_ocr_pages_returns_empty_and_prose_no_text_flag(self):
        """ocr_pages=None (not provided) → empty stitched_markdown + _prose_no_text=True."""
        unit = _prose_unit(pages=[5])

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=None,
        )

        assert result["stitched_markdown"] == ""
        assert result.get("_prose_no_text") is True

    def test_whitespace_only_text_treated_as_blank(self):
        """Whitespace-only text after strip() is blank — unit flagged _prose_no_text."""
        unit = _prose_unit(pages=[3])
        ocr_pages = [_ocr_page(3, "   \n  \t  ")]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert result["stitched_markdown"] == ""
        assert result.get("_prose_no_text") is True

    def test_multi_page_all_blank_flagged(self):
        """Multi-page prose unit with all blank pages → _prose_no_text=True."""
        unit = _prose_unit(pages=[1, 2, 3])
        ocr_pages = [
            _ocr_page(1, ""),
            _ocr_page(2, ""),
            _ocr_page(3, ""),
        ]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert result["stitched_markdown"] == ""
        assert result.get("_prose_no_text") is True


# ===========================================================================
# EC-1: Mixed blank and non-blank pages in prose unit
# ===========================================================================

class TestMixedBlankAndNonBlankPages:

    def test_blank_pages_skipped_gracefully(self):
        """
        EC-1: a blank page within a prose unit must not emit a blank line.
        Only non-blank pages contribute to stitched_markdown.
        """
        unit = _prose_unit(pages=[10, 11, 12])
        ocr_pages = [
            _ocr_page(10, "First page text."),
            _ocr_page(11, ""),             # blank — skip
            _ocr_page(12, "Third page text."),
        ]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        sm = result["stitched_markdown"]
        assert sm != ""
        assert "First page text." in sm
        assert "Third page text." in sm
        # Blank page should not produce spurious empty content
        assert result.get("_prose_no_text") is not True

    def test_partial_blank_pages_row_count_correct(self):
        """row_count counts only non-empty lines; blank pages add no lines."""
        unit = _prose_unit(pages=[1, 2])
        ocr_pages = [
            _ocr_page(1, "Line one\nLine two"),  # 2 lines
            _ocr_page(2, ""),                     # blank, skipped
        ]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert result["row_count"] == 2, (
            f"Expected row_count=2 (from page 1 only), got {result['row_count']}"
        )


# ===========================================================================
# RISK-1: dual-key fallback (text_content legacy alias)
# ===========================================================================

class TestDualKeyFallback:

    def test_text_content_key_used_when_text_absent(self):
        """
        RISK-1: When ocr_page dict has 'text_content' key instead of 'text',
        the dual-key fallback must still extract the value.
        """
        unit = _prose_unit(pages=[7])
        # Legacy dict with 'text_content' key (not 'text')
        ocr_pages = [{"page_number": 7, "text_content": "Legacy key text content."}]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert result["stitched_markdown"] != "", (
            "Dual-key fallback must read 'text_content' when 'text' absent"
        )
        assert "Legacy key text content." in result["stitched_markdown"]

    def test_text_key_takes_priority_over_text_content(self):
        """When both 'text' and 'text_content' present, 'text' wins."""
        unit = _prose_unit(pages=[8])
        ocr_pages = [{
            "page_number": 8,
            "text": "Canonical text value.",
            "text_content": "Legacy text_content value.",
        }]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        # 'text' key takes priority (truthy short-circuit in dual-key pattern)
        assert "Canonical text value." in result["stitched_markdown"]


# ===========================================================================
# NFR-3: prose units return rows_for_gate=[] (invariant gates skip cleanly)
# ===========================================================================

class TestProseGateSkip:

    def test_rows_for_gate_empty_for_prose_unit(self):
        """
        NFR-3: prose units must return rows_for_gate=[] so invariant gates
        skip cleanly (all gates have empty-input early exits).
        No financial rows in prose text.
        """
        unit = _prose_unit(pages=[12])
        ocr_pages = [_ocr_page(12, "Thuyết minh: Doanh thu 1.000 tỷ đồng.")]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert result["rows_for_gate"] == [], (
            "Prose units must return rows_for_gate=[] to skip invariant gates"
        )

    def test_page_row_spans_empty_for_prose_unit(self):
        """Prose units return page_row_spans=[] (no table row-span tracking)."""
        unit = _prose_unit(pages=[5])
        ocr_pages = [_ocr_page(5, "Some prose content.")]

        result = ocr_unit(
            unit=unit, zones_by_page={}, pdf_path="", tmp_dir="",
            ocr_pages=ocr_pages,
        )

        assert result["page_row_spans"] == []


# ===========================================================================
# Backward compatibility: default ocr_pages=None does not break table units
# ===========================================================================

class TestTablePathUnaffected:

    def test_table_unit_not_handled_by_prose_branch(self):
        """
        AC-4: Table branch is entered for page_type='table'.
        The prose branch fix must not affect the table code path.
        A table unit will try to import pytesseract/pdf2image — we just check
        the RuntimeError is raised (missing dep in test env) NOT an AttributeError
        or other prose-branch related error.
        """
        table_unit = {
            "unit_id": str(uuid.uuid4()),
            "pages": [1],
            "page_type": "table",
            "schema_page": 1,
        }

        try:
            ocr_unit(
                unit=table_unit,
                zones_by_page={},
                pdf_path="",
                tmp_dir="",
                ocr_pages=None,  # default — backward compat
            )
        except RuntimeError as exc:
            # Expected: pytesseract/pdf2image not available in test env
            assert "missing dependency" in str(exc), (
                f"Expected 'missing dependency' error, got: {exc}"
            )
        except Exception as exc:
            raise AssertionError(
                f"Table unit triggered unexpected exception (prose branch regression?): {exc}"
            )
