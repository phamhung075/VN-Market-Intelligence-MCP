"""
Unit tests — BT3-FIX4 Parser Hardening (AC-8).

Tests cover the 5 regression cases specified in the architect ruling
(docs/architecture-briefs/2026-05-26-bctc-table-bt3-fix4-parser-hardening.md §5 AC-8).

All tests use fixture text only — zero creds, zero network, zero Tesseract I/O.
Host-safe: no pdf2image, no pytesseract invocation.

AC-8 cases:
  1. Dash-prefixed sub-item with parenthetical negative value → parses as a code row
  2. Line with 1-digit note ref between code and value → note ref discarded, both values captured
  3. Line with code "421b" → code="421b", correct values
  4. Junk line "Người lập phó tổng giám đốc" → zero rows
  5. Junk line "Hà Nội, ngày 23 tháng 01 năm 2025" → zero rows
"""

import sys
import os

# Adjust sys.path so package imports work when run from apps/pdf-extractor/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from infrastructure.text_table_extractor import TextTableExtractor


# ---------------------------------------------------------------------------
# Helper: run a single fixture line through the extractor and return rows
# ---------------------------------------------------------------------------

def _extract_line(line: str, period_header: str = "31/12/2025  31/12/2024") -> list:
    """
    Wrap a single OCR line in a minimal page fixture and extract rows.

    Includes a period header line so period_current / period_prior are detected
    (required for select_period_column to work correctly).

    Returns only the rows that have code IS NOT None (skip pure header rows
    that the extractor emits from the period-header line itself).
    Actually: returns ALL rows from the fixture; caller can filter as needed.
    """
    text = f"{period_header}\n{line}\n"
    pages = [{"page_number": 1, "text": text}]
    extractor = TextTableExtractor()
    result = extractor.assemble(pages=pages, statement_section="balance_sheet")
    return result.get("rows", [])


def _find_code(rows: list, code: str) -> dict | None:
    """Return first row with the given code field, or None."""
    for r in rows:
        if r.get("code") == code:
            return r
    return None


def _coded_rows(rows: list) -> list:
    """Return only rows that have a non-None code."""
    return [r for r in rows if r.get("code") is not None]


# ---------------------------------------------------------------------------
# AC-8 Case 1: Dash-prefixed sub-item with parenthetical negative value
# ---------------------------------------------------------------------------

class TestAC8Case1DashPrefixedSubItem:
    """
    CHANGE-1: Trailing anchor relaxation allows lines ending with ')' to match
    Layout 4 (_CODE_ROW_SINGLE_SPACE_RE).

    Input: "- Giá trị hao mòn lũy kế 223 (13.762.875.752.850) (11.683.165.704.793)"

    Before fix: Layout 4 regex had [a-zA-Z|\\]* at end; lines ending with ')'
    (a parenthetical negative prior value) did NOT end with an ASCII letter so
    the trailing anchor anchored on zero letters — BUT the regex group matched
    the paren value correctly only if the full suffix consumed the ')'.
    Root: the value_current group captured the first paren token but the
    trailing anchor consumed nothing, leaving the second paren token OUTSIDE
    the capture group → regex backtrack failure.

    After fix: [a-zA-Z|\\]? (at most one letter) + r'\s*$' — lines ending with
    ')' match because the optional trailing letter is absent (zero letters is fine).
    """

    def test_dash_sub_item_parses_as_code_row(self) -> None:
        """AC-8 Case 1: dash-prefixed line with parenthetical negative value → code row."""
        line = "- Giá trị hao mòn lũy kế 223 (13.762.875.752.850) (11.683.165.704.793)"
        rows = _extract_line(line)
        code_rows = _coded_rows(rows)

        assert len(code_rows) >= 1, (
            f"AC-8 Case 1 FAILED: Expected at least 1 code row from dash-prefixed line. "
            f"Got rows: {rows}"
        )

        row_223 = _find_code(rows, "223")
        assert row_223 is not None, (
            f"AC-8 Case 1 FAILED: code '223' not found in rows. Rows: {rows}"
        )

    def test_dash_sub_item_value_current_negative(self) -> None:
        """AC-8 Case 1: parenthetical negative value_current parsed correctly."""
        line = "- Giá trị hao mòn lũy kế 223 (13.762.875.752.850) (11.683.165.704.793)"
        rows = _extract_line(line)
        row_223 = _find_code(rows, "223")

        assert row_223 is not None, f"Code 223 not found. Rows: {rows}"
        assert row_223["value_current"] is not None, (
            f"AC-8 Case 1 FAILED: value_current is None for code 223. Row: {row_223}"
        )
        # Value should be negative: -13,762,875,752,850
        assert row_223["value_current"] < 0, (
            f"AC-8 Case 1 FAILED: value_current should be negative, got {row_223['value_current']}"
        )
        assert abs(abs(row_223["value_current"]) - 13_762_875_752_850.0) <= 1.0, (
            f"AC-8 Case 1 FAILED: value_current magnitude wrong. "
            f"Expected 13762875752850, got {row_223['value_current']}"
        )

    def test_dash_sub_item_value_prior_negative(self) -> None:
        """AC-8 Case 1: parenthetical negative value_prior captured (not lost to trailing anchor)."""
        line = "- Giá trị hao mòn lũy kế 223 (13.762.875.752.850) (11.683.165.704.793)"
        rows = _extract_line(line)
        row_223 = _find_code(rows, "223")

        assert row_223 is not None, f"Code 223 not found. Rows: {rows}"
        assert row_223["value_prior"] is not None, (
            f"AC-8 Case 1 FAILED: value_prior is None for code 223. "
            f"Before fix, the trailing paren was consumed by the anchor instead of "
            f"being captured in the value group. Row: {row_223}"
        )
        assert row_223["value_prior"] < 0, (
            f"AC-8 Case 1 FAILED: value_prior should be negative, got {row_223['value_prior']}"
        )
        assert abs(abs(row_223["value_prior"]) - 11_683_165_704_793.0) <= 1.0, (
            f"AC-8 Case 1 FAILED: value_prior magnitude wrong. "
            f"Expected 11683165704793, got {row_223['value_prior']}"
        )


# ---------------------------------------------------------------------------
# AC-8 Case 2: Note-ref number between code and value — note ref discarded
# ---------------------------------------------------------------------------

class TestAC8Case2NoteRefDiscarded:
    """
    CHANGE-1 + CHANGE-3: Note-ref pattern extended from r'\d{1,2}' to r'\d{1,3}'.

    Input: "1. Phải thu ngắn hạn của khách hàng 131 7 12.733.504.688.522 10.537.019.113.380 i"

    Layout 4 has an optional note-number group (?:\d{1,3}\s+)? after the code.
    The single-digit "7" between code "131" and value "12.733.504.688.522" should
    be consumed by this group (note ref discarded). The trailing "i" is consumed
    by the relaxed trailing anchor [a-zA-Z|\\]? (at most one letter).

    After fix: code="131", value_current=12733504688522, value_prior=10537019113380.
    """

    def test_note_ref_line_parses_as_code_row(self) -> None:
        """AC-8 Case 2: line with 1-digit note ref → code row extracted."""
        line = "1. Phải thu ngắn hạn của khách hàng 131 7 12.733.504.688.522 10.537.019.113.380 i"
        rows = _extract_line(line)
        row_131 = _find_code(rows, "131")

        assert row_131 is not None, (
            f"AC-8 Case 2 FAILED: code '131' not found. Rows: {rows}"
        )

    def test_note_ref_value_current_captured(self) -> None:
        """AC-8 Case 2: value_current is 12733504688522 (note ref '7' not parsed as value)."""
        line = "1. Phải thu ngắn hạn của khách hàng 131 7 12.733.504.688.522 10.537.019.113.380 i"
        rows = _extract_line(line)
        row_131 = _find_code(rows, "131")

        assert row_131 is not None, f"Code 131 not found. Rows: {rows}"
        assert row_131["value_current"] is not None, (
            f"AC-8 Case 2 FAILED: value_current is None. Row: {row_131}"
        )
        assert abs(row_131["value_current"] - 12_733_504_688_522.0) <= 1.0, (
            f"AC-8 Case 2 FAILED: value_current={row_131['value_current']}, "
            f"expected 12733504688522. Note ref '7' may have been mis-parsed as the value."
        )

    def test_note_ref_value_prior_captured(self) -> None:
        """AC-8 Case 2: value_prior is 10537019113380 (both values captured despite trailing 'i')."""
        line = "1. Phải thu ngắn hạn của khách hàng 131 7 12.733.504.688.522 10.537.019.113.380 i"
        rows = _extract_line(line)
        row_131 = _find_code(rows, "131")

        assert row_131 is not None, f"Code 131 not found. Rows: {rows}"
        assert row_131["value_prior"] is not None, (
            f"AC-8 Case 2 FAILED: value_prior is None. "
            f"Before fix, trailing 'i' consumed by old anchor prevented capturing prior value. "
            f"Row: {row_131}"
        )
        assert abs(row_131["value_prior"] - 10_537_019_113_380.0) <= 1.0, (
            f"AC-8 Case 2 FAILED: value_prior={row_131['value_prior']}, "
            f"expected 10537019113380."
        )


# ---------------------------------------------------------------------------
# AC-8 Case 3: Letter-suffix code "421b" parsed correctly
# ---------------------------------------------------------------------------

class TestAC8Case3LetterSuffixCode421b:
    """
    CHANGE-2: Code digit group extended to r'\d{2,3}[a-z]?' — accepts codes with
    a trailing lowercase letter (e.g. "421b", "411q").

    Input: "- Lợi nhuận sau thuế chưa phân phối kỳ này 421b 6.924.484.515.123 5.572.300.562.297"

    After fix: code="421b" (suffix letter kept in code field),
    value_current=6924484515123, value_prior=5572300562297.
    """

    def test_letter_suffix_code_421b_parsed(self) -> None:
        """AC-8 Case 3: code '421b' extracted as code field (not dropped as junk)."""
        line = "- Lợi nhuận sau thuế chưa phân phối kỳ này 421b 6.924.484.515.123 5.572.300.562.297"
        rows = _extract_line(line)
        row_421b = _find_code(rows, "421b")

        assert row_421b is not None, (
            f"AC-8 Case 3 FAILED: code '421b' not found in rows. "
            f"Before fix, \\d{{2,3}} rejected trailing 'b'. Rows: {rows}"
        )

    def test_letter_suffix_code_421b_value_current(self) -> None:
        """AC-8 Case 3: value_current == 6924484515123 for code '421b'."""
        line = "- Lợi nhuận sau thuế chưa phân phối kỳ này 421b 6.924.484.515.123 5.572.300.562.297"
        rows = _extract_line(line)
        row_421b = _find_code(rows, "421b")

        assert row_421b is not None, f"Code 421b not found. Rows: {rows}"
        assert row_421b["value_current"] is not None, (
            f"AC-8 Case 3 FAILED: value_current is None. Row: {row_421b}"
        )
        assert abs(row_421b["value_current"] - 6_924_484_515_123.0) <= 1.0, (
            f"AC-8 Case 3 FAILED: value_current={row_421b['value_current']}, "
            f"expected 6924484515123."
        )

    def test_letter_suffix_code_421b_value_prior(self) -> None:
        """AC-8 Case 3: value_prior == 5572300562297 for code '421b'."""
        line = "- Lợi nhuận sau thuế chưa phân phối kỳ này 421b 6.924.484.515.123 5.572.300.562.297"
        rows = _extract_line(line)
        row_421b = _find_code(rows, "421b")

        assert row_421b is not None, f"Code 421b not found. Rows: {rows}"
        assert row_421b["value_prior"] is not None, (
            f"AC-8 Case 3 FAILED: value_prior is None. Row: {row_421b}"
        )
        assert abs(row_421b["value_prior"] - 5_572_300_562_297.0) <= 1.0, (
            f"AC-8 Case 3 FAILED: value_prior={row_421b['value_prior']}, "
            f"expected 5572300562297."
        )

    def test_letter_suffix_code_is_not_summary(self) -> None:
        """AC-8 Case 3: code '421b' is NOT a summary row (not in _SUMMARY_CODES set)."""
        line = "- Lợi nhuận sau thuế chưa phân phối kỳ này 421b 6.924.484.515.123 5.572.300.562.297"
        rows = _extract_line(line)
        row_421b = _find_code(rows, "421b")

        assert row_421b is not None, f"Code 421b not found. Rows: {rows}"
        assert row_421b["is_summary_row"] == 0, (
            f"AC-8 Case 3 FAILED: is_summary_row should be 0 for non-summary code '421b', "
            f"got {row_421b['is_summary_row']}."
        )


# ---------------------------------------------------------------------------
# AC-8 Case 4: Junk line "Người lập phó tổng giám đốc" → zero rows
# ---------------------------------------------------------------------------

class TestAC8Case4JunkSignatureBlock:
    """
    CHANGE-4: Signature-block keywords added to the junk-line skip list.

    The keywords "người lập" and "phó tổng" are both in the skip list.
    Any line containing them is filtered BEFORE reaching the code-row parser.
    The result should be zero rows (the period header line is also filtered as
    a date-only line, so the extractor returns no rows at all).
    """

    def test_junk_signature_block_produces_zero_rows(self) -> None:
        """AC-8 Case 4: 'Người lập phó tổng giám đốc' → zero rows emitted."""
        line = "Người lập phó tổng giám đốc"
        rows = _extract_line(line)

        # The extractor should emit zero code rows for this junk line
        code_rows = _coded_rows(rows)
        assert len(code_rows) == 0, (
            f"AC-8 Case 4 FAILED: Expected 0 code rows from signature junk line, "
            f"got {len(code_rows)} code rows: {code_rows}"
        )

        # Also verify the junk line does not appear as a header row
        junk_in_labels = [
            r for r in rows
            if r.get("code") is None
            and ("người lập" in (r.get("label") or "").lower()
                 or "phó tổng" in (r.get("label") or "").lower())
        ]
        assert len(junk_in_labels) == 0, (
            f"AC-8 Case 4 FAILED: Signature junk line leaked as header row. "
            f"Offending rows: {junk_in_labels}"
        )

    def test_junk_nguoi_lap_keyword_standalone(self) -> None:
        """AC-8 Case 4: 'Người lập' as standalone line → zero code rows."""
        line = "Người lập"
        rows = _extract_line(line)
        code_rows = _coded_rows(rows)
        assert len(code_rows) == 0, (
            f"Expected 0 code rows from 'Người lập', got {code_rows}"
        )

    def test_junk_ke_toan_truong_keyword(self) -> None:
        """AC-8 Case 4: 'Kế toán trưởng' → zero code rows."""
        line = "Kế toán trưởng"
        rows = _extract_line(line)
        code_rows = _coded_rows(rows)
        assert len(code_rows) == 0, (
            f"Expected 0 code rows from 'Kế toán trưởng', got {code_rows}"
        )


# ---------------------------------------------------------------------------
# AC-8 Case 5: Junk line "Hà Nội, ngày 23 tháng 01 năm 2025" → zero rows
# ---------------------------------------------------------------------------

class TestAC8Case5JunkSignatureDate:
    """
    CHANGE-4: Signature date regex skip.

    The regex re.search(r"ngày\s+\d{1,2}\s+tháng", low_stripped) matches
    any signature date line with "ngày <day> tháng" pattern.

    The string "hà nội, ngày" keyword in the skip list also catches the location
    prefix. Either filter catches "Hà Nội, ngày 23 tháng 01 năm 2025".
    """

    def test_junk_signature_date_produces_zero_rows(self) -> None:
        """AC-8 Case 5: 'Hà Nội, ngày 23 tháng 01 năm 2025' → zero rows emitted."""
        line = "Hà Nội, ngày 23 tháng 01 năm 2025"
        rows = _extract_line(line)

        code_rows = _coded_rows(rows)
        assert len(code_rows) == 0, (
            f"AC-8 Case 5 FAILED: Expected 0 code rows from signature date line, "
            f"got {len(code_rows)} code rows: {code_rows}"
        )

        # Also verify the junk line does not appear as a header row
        junk_in_labels = [
            r for r in rows
            if r.get("code") is None
            and ("ngày" in (r.get("label") or "").lower())
        ]
        assert len(junk_in_labels) == 0, (
            f"AC-8 Case 5 FAILED: Signature date line leaked as header row. "
            f"Offending rows: {junk_in_labels}"
        )

    def test_junk_signature_date_day_23(self) -> None:
        """AC-8 Case 5: regex catches 'ngày 23 tháng' specifically."""
        line = "ngày 23 tháng 01 năm 2025"
        rows = _extract_line(line)
        code_rows = _coded_rows(rows)
        assert len(code_rows) == 0, (
            f"Expected 0 code rows from 'ngày 23 tháng...', got {code_rows}"
        )

    def test_junk_signature_date_other_days(self) -> None:
        """AC-8 Case 5: regex catches other day variants (1, 5, 31)."""
        for day in [1, 5, 15, 31]:
            line = f"Hà Nội, ngày {day} tháng 01 năm 2025"
            rows = _extract_line(line)
            code_rows = _coded_rows(rows)
            assert len(code_rows) == 0, (
                f"Expected 0 code rows from signature date (day={day}), got {code_rows}"
            )

    def test_junk_ha_noi_keyword_unaccented(self) -> None:
        """AC-8 Case 5: unaccented 'ha noi' fallback → zero code rows."""
        line = "Ha Noi, ngay 23 thang 01 nam 2025"
        rows = _extract_line(line)
        code_rows = _coded_rows(rows)
        assert len(code_rows) == 0, (
            f"Expected 0 code rows from unaccented 'Ha Noi...' line, got {code_rows}"
        )


# ---------------------------------------------------------------------------
# Non-regression sanity: existing pure-digit codes still parse correctly
# ---------------------------------------------------------------------------

class TestNonRegressionPureDigitCodes:
    """
    Verify that CHANGE-2 ([a-z]? extension) does NOT break existing pure-digit codes.

    The [a-z]? suffix is OPTIONAL — zero existing matches are disrupted.
    These tests confirm summary codes and standard codes still parse.
    """

    def test_summary_code_270_unchanged(self) -> None:
        """Non-regression: code '270' (Total Assets) still parsed as code row."""
        line = "TỔNG CỘNG TÀI SẢN 270 88.089.621.779.862 71.999.995.678.620"
        rows = _extract_line(line)
        row_270 = _find_code(rows, "270")
        assert row_270 is not None, f"Code 270 not found. Rows: {rows}"
        assert abs(row_270["value_current"] - 88_089_621_779_862.0) <= 1.0

    def test_summary_code_100_unchanged(self) -> None:
        """Non-regression: code '100' still parsed as summary row."""
        line = "A. TÀI SẢN NGAN HAN  100  58.102.970.741.619  45.535.942.846.453"
        rows = _extract_line(line)
        row_100 = _find_code(rows, "100")
        assert row_100 is not None, f"Code 100 not found. Rows: {rows}"
        assert row_100["is_summary_row"] == 1, (
            f"Code 100 should be summary row, got is_summary_row={row_100['is_summary_row']}"
        )
        assert abs(row_100["value_current"] - 58_102_970_741_619.0) <= 1.0

    def test_standard_code_110_unchanged(self) -> None:
        """Non-regression: code '110' (standard code) still parsed correctly."""
        line = "I. Tiền và các khoản tương đương tiền  110  10.540.181.640.920  9.315.440.438.884"
        rows = _extract_line(line)
        row_110 = _find_code(rows, "110")
        assert row_110 is not None, f"Code 110 not found. Rows: {rows}"
        assert row_110["is_summary_row"] == 0
        assert abs(row_110["value_current"] - 10_540_181_640_920.0) <= 1.0

    def test_negative_value_code_137_unchanged(self) -> None:
        """Non-regression: code '137' with parenthetical negative still parsed."""
        line = "6. Dự phòng phải thu ngắn hạn khó đòi  137  (586.166.744.274)  (619.531.925.859)"
        rows = _extract_line(line)
        row_137 = _find_code(rows, "137")
        assert row_137 is not None, f"Code 137 not found. Rows: {rows}"
        assert row_137["value_current"] is not None
        assert row_137["value_current"] < 0
