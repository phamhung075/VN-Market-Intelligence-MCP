"""
Unit tests for the ocr_text_to_markdown() pure function (MD-EXTRACT).

Tests verify:
  - Section headers promoted to ## H2
  - Blank lines preserved as paragraph breaks
  - Lines with ≥4-char numeric tokens blockquoted with "> "
  - Non-section, non-numeric lines emitted as plain text
  - Empty / None input returns empty string
  - Vietnamese section header patterns (A., I., etc.)
  - Multi-section documents produce correct structure

All tests are pure function (no I/O, no creds, no network).
"""

from __future__ import annotations

import pytest

from infrastructure.generic_md_table_extractor import ocr_text_to_markdown


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_empty_string_returns_empty():
    assert ocr_text_to_markdown("") == ""


def test_none_returns_empty():
    assert ocr_text_to_markdown(None) == ""  # type: ignore[arg-type]


def test_whitespace_only_returns_blank():
    result = ocr_text_to_markdown("   \n  \n")
    # All blank → output is blank lines only
    assert result.strip() == ""


# ---------------------------------------------------------------------------
# Section header promotion
# ---------------------------------------------------------------------------


class TestSectionHeaderPromotion:
    def test_section_a_promoted(self):
        """'A. TÀI SẢN NGẮN HẠN' → '## A. TÀI SẢN NGẮN HẠN'"""
        result = ocr_text_to_markdown("A. TÀI SẢN NGẮN HẠN")
        assert result.startswith("## "), f"Expected '## ' prefix, got: {result!r}"

    def test_section_b_promoted(self):
        result = ocr_text_to_markdown("B. TÀI SẢN DÀI HẠN")
        assert result.startswith("## ")

    def test_roman_numeral_i_promoted(self):
        """'I. Tiền và các khoản tương đương tiền' → '## I. ...'"""
        result = ocr_text_to_markdown("I. Tien va cac khoan tuong duong tien")
        assert result.startswith("## ")

    def test_roman_numeral_iv_promoted(self):
        result = ocr_text_to_markdown("IV. Tai san co dinh")
        assert result.startswith("## ")

    def test_non_section_not_promoted(self):
        """'Công ty cổ phần FPT' is NOT a recognized section header."""
        result = ocr_text_to_markdown("Cong ty co phan FPT")
        assert not result.startswith("## ")


# ---------------------------------------------------------------------------
# Numeric line blockquoting
# ---------------------------------------------------------------------------


class TestNumericLineBlockquote:
    def test_numeric_line_blockquoted(self):
        """Line with ≥4-char numeric token → blockquote."""
        line = "100  88.089.621.779.862  71.999.995.678.620"
        result = ocr_text_to_markdown(line)
        assert result.startswith("> "), f"Expected '>  ' prefix, got: {result!r}"

    def test_short_number_not_blockquoted(self):
        """Short numbers (< 4 chars) should not trigger blockquote."""
        line = "số 10"
        result = ocr_text_to_markdown(line)
        # "10" is only 2 chars — should NOT be blockquoted
        assert not result.startswith("> "), f"Unexpected blockquote for: {line!r}"

    def test_date_token_not_always_blockquoted(self):
        """Date headers like '31/12/2025' have 10 chars — they may be blockquoted."""
        # This is acceptable behavior since dates ARE numeric-ish; the test just
        # verifies no crash and the result is a string.
        line = "31/12/2025  31/12/2024"
        result = ocr_text_to_markdown(line)
        assert isinstance(result, str)


# ---------------------------------------------------------------------------
# Blank line preservation
# ---------------------------------------------------------------------------


class TestBlankLinePreservation:
    def test_blank_line_between_sections(self):
        text = "A. TÀI SẢN\n\n88.089.621"
        result = ocr_text_to_markdown(text)
        # There should be a blank line (empty string between sections)
        lines = result.split("\n")
        assert "" in lines, f"Expected blank line in output: {lines}"

    def test_multiple_blank_lines(self):
        text = "Line 1\n\n\nLine 2"
        result = ocr_text_to_markdown(text)
        assert "Line 1" in result
        assert "Line 2" in result


# ---------------------------------------------------------------------------
# Multi-section document structure
# ---------------------------------------------------------------------------


class TestMultiSectionDocument:
    def test_full_document_structure(self):
        """
        A representative OCR page output is converted to correct markdown structure.
        """
        text = (
            "BCTC HOP NHAT\n"
            "\n"
            "A. TAI SAN NGAN HAN\n"
            "I. Tien va cac khoan tuong duong tien\n"
            "111  8.084.826.991.114  6.725.619.929.289\n"
            "\n"
            "B. TAI SAN DAI HAN\n"
            "IV. Tai san co dinh\n"
            "221  15.385.816.846.287  16.543.212.345.678\n"
        )
        result = ocr_text_to_markdown(text)

        # Section A header promoted
        assert "## A." in result or "## A " in result

        # Section B header promoted
        assert "## B." in result or "## B " in result

        # Subsection I promoted (roman numeral)
        assert "## I." in result or "## I " in result

        # Numeric lines blockquoted
        assert "> " in result

        # Document is not empty
        assert len(result) > 50

    def test_output_is_string(self):
        result = ocr_text_to_markdown("some text\n88.000.000\n")
        assert isinstance(result, str)
