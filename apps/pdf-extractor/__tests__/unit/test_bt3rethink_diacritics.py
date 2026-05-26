"""
Unit tests — BT3-FIX5 RETHINK: Diacritics robustness + positional cutoff (AC-8, AC-9).

Tests cover all 10 assertions mandated by the architect ruling:
  1-4.  _norm() diacritic-insensitive normalization
  5-7.  _is_recognized_section_header() gate
  8-9.  _find_code_in_line() embedded-code scan
  10.   _find_code_in_line() → None for garbled noise
  11.   _apply_positional_cutoff() drops post-sentinel rows (AC-9)

All tests are pure unit tests — zero I/O, zero network, zero Tesseract.
Host-safe: no pdf2image, no pytesseract invocation.

References:
  - docs/architecture-briefs/2026-05-26-bctc-table-bt3-rethink-filter-strategy.md
    §6 AC-8 (diacritics robustness tests) and §6 AC-9 (positional cutoff test)
"""

import sys
import os
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from infrastructure.text_table_extractor import (
    _norm,
    _is_recognized_section_header,
    _find_code_in_line,
    _apply_positional_cutoff,
)


# ---------------------------------------------------------------------------
# AC-8 Tests 1-4: _norm() diacritic-insensitive normalization
# ---------------------------------------------------------------------------

class TestNormFunction:
    """Verify _norm() strips all diacritics and uppercases — immune to OCR substrate variation."""

    def test_norm_accented_vs_unaccented_bang_can_doi(self) -> None:
        """AC-8 test 1: 'BẢNG CÂN ĐỐI' (full diacritics) == 'BANG CAN DOI' (no diacritics)."""
        assert _norm("BẢNG CÂN ĐỐI") == _norm("BANG CAN DOI"), (
            "AC-8 test 1 FAILED: accented and unaccented balance-sheet title "
            "must normalize to the same form."
        )

    def test_norm_tai_ngay_variants(self) -> None:
        """AC-8 test 2: 'tại ngày' (accented) == 'tai ngay' (unaccented)."""
        assert _norm("tại ngày") == _norm("tai ngay"), (
            "AC-8 test 2 FAILED: 'tại ngày' and 'tai ngay' must normalize to the same form. "
            "Poppler strips diacritics inconsistently; _norm() must compensate."
        )

    def test_norm_date_pattern_variants(self) -> None:
        """AC-8 test 3: 'ngày 31 tháng' (accented) == 'ngay 31 thang' (unaccented)."""
        assert _norm("ngày 31 tháng") == _norm("ngay 31 thang"), (
            "AC-8 test 3 FAILED: date-pattern check must be diacritic-insensitive."
        )

    def test_norm_signature_keyword_variants(self) -> None:
        """AC-8 test 4: 'Người lập' (accented) == 'Nguoi lap' (unaccented)."""
        assert _norm("Người lập") == _norm("Nguoi lap"), (
            "AC-8 test 4 FAILED: signature keyword must match both diacritic forms."
        )

    def test_norm_uppercases_output(self) -> None:
        """Extra: _norm() output is always uppercase."""
        result = _norm("hello world")
        assert result == result.upper(), (
            f"_norm() must return uppercase string, got: {result!r}"
        )

    def test_norm_empty_string(self) -> None:
        """Extra: _norm('') returns '' without error."""
        assert _norm("") == ""


# ---------------------------------------------------------------------------
# AC-8 Tests 5-7: _is_recognized_section_header()
# ---------------------------------------------------------------------------

class TestIsRecognizedSectionHeader:
    """Verify POSITIVE-KEEP gate: only section-letter and roman-numeral headers pass."""

    def test_section_letter_a_tai_san_ngan_han(self) -> None:
        """AC-8 test 5: 'A. TAI SAN NGAN HAN' → True (section letter present)."""
        assert _is_recognized_section_header("A. TAI SAN NGAN HAN") is True, (
            "AC-8 test 5 FAILED: 'A. TAI SAN NGAN HAN' must be recognized as a section header."
        )

    def test_section_letter_with_full_diacritics(self) -> None:
        """AC-8 test 5b: 'A. TÀI SẢN NGẮN HẠN' (full diacritics) → True."""
        assert _is_recognized_section_header("A. TÀI SẢN NGẮN HẠN") is True, (
            "Section letter header with full diacritics must be recognized."
        )

    def test_garbled_noise_rejected(self) -> None:
        """AC-8 test 6: garbled noise 'ụ So i ide' → False."""
        assert _is_recognized_section_header("ụ So i ide") is False, (
            "AC-8 test 6 FAILED: garbled noise must NOT be recognized as section header."
        )

    def test_balance_sheet_title_rejected(self) -> None:
        """AC-8 test 7: poppler-mangled 'BANG CÂN ĐỐI KẾ TOÁN' → False (not section letter)."""
        assert _is_recognized_section_header("BANG CÂN ĐỐI KẾ TOÁN") is False, (
            "AC-8 test 7 FAILED: balance-sheet title must NOT be recognized as section header. "
            "It does not start with 'A.' .. 'E.' or a roman numeral."
        )

    def test_roman_numeral_i_recognized(self) -> None:
        """AC-8 test 5c: 'I. Tien va cac khoan tuong duong tien' → True."""
        assert _is_recognized_section_header("I. Tien va cac khoan tuong duong tien") is True, (
            "Roman numeral 'I.' sub-section header must be recognized."
        )

    def test_roman_numeral_ii_recognized(self) -> None:
        """AC-8 test 5d: 'II. Tai san co dinh' → True."""
        assert _is_recognized_section_header("II. Tai san co dinh") is True, (
            "Roman numeral 'II.' sub-section header must be recognized."
        )

    def test_roman_numeral_iv_recognized(self) -> None:
        """AC-8 test 5e: 'IV. Cac khoan dau tu tai chinh dai han' → True."""
        assert _is_recognized_section_header("IV. Cac khoan dau tu tai chinh dai han") is True, (
            "Roman numeral 'IV.' sub-section header must be recognized."
        )

    def test_section_b_rejected_when_no_letter(self) -> None:
        """Extra: plain 'B' without dot → False (not a section-letter header)."""
        assert _is_recognized_section_header("B") is False

    def test_signature_nguoi_lap_rejected(self) -> None:
        """Extra: 'Người lập' signature keyword → False."""
        assert _is_recognized_section_header("Người lập") is False

    def test_garbled_line_semicolon_rejected(self) -> None:
        """Extra: ': \\:| /PTP) 7), y2' → False."""
        assert _is_recognized_section_header(r": \:| /PTP) 7), y2") is False

    def test_empty_string_rejected(self) -> None:
        """Extra: empty string → False."""
        assert _is_recognized_section_header("") is False

    def test_section_d_von_chu_so_huu(self) -> None:
        """Extra: 'D. VỐN CHỦ SỞ HỮU' → True (section letter D)."""
        assert _is_recognized_section_header("D. VỐN CHỦ SỞ HỮU") is True

    def test_section_c_no_phai_tra(self) -> None:
        """Extra: 'C. NO PHAI TRA' → True (section letter C)."""
        assert _is_recognized_section_header("C. NO PHAI TRA") is True


# ---------------------------------------------------------------------------
# AC-8 Tests 8-10: _find_code_in_line()
# ---------------------------------------------------------------------------

class TestFindCodeInLine:
    """Verify Layout 5 scan-and-extract: finds embedded BCTC codes regardless of label."""

    def test_note_ref_line_131(self) -> None:
        """
        AC-8 test 8: note-ref line with code 131 and note ref '7'.
        Input: '1. Phải thu ngan han 131 7 12.733.504.688.522 10.537.019.113.380 i'
        Expected: ('131', <label>, <values_rest>)
        """
        line = "1. Phải thu ngan han 131 7 12.733.504.688.522 10.537.019.113.380 i"
        result = _find_code_in_line(line)

        assert result is not None, (
            f"AC-8 test 8 FAILED: _find_code_in_line should return a match for code 131. "
            f"Got: {result}"
        )
        code, label, values_rest = result
        assert code == "131", (
            f"AC-8 test 8 FAILED: expected code='131', got code={code!r}"
        )
        assert "12.733.504.688.522" in values_rest, (
            f"AC-8 test 8 FAILED: expected first value '12.733.504.688.522' in values_rest={values_rest!r}"
        )

    def test_dash_prefix_line_222(self) -> None:
        """
        AC-8 test 9: dash-prefix line with code 222.
        Input: '- Nguyen gia 222 29.148.692.599.137 24.457.733.666.511'
        Expected: ('222', '- Nguyen gia', '29.148.692.599.137 24.457.733.666.511')
        """
        line = "- Nguyen gia 222 29.148.692.599.137 24.457.733.666.511"
        result = _find_code_in_line(line)

        assert result is not None, (
            f"AC-8 test 9 FAILED: _find_code_in_line should return a match for code 222. "
            f"Got: {result}"
        )
        code, label, values_rest = result
        assert code == "222", (
            f"AC-8 test 9 FAILED: expected code='222', got code={code!r}"
        )
        assert "29.148.692.599.137" in values_rest, (
            f"AC-8 test 9 FAILED: expected '29.148.692.599.137' in values_rest={values_rest!r}"
        )

    def test_garbled_noise_returns_none(self) -> None:
        """AC-8 test 10: garbled noise line with no code → None."""
        line = "garbled noise line no code"
        result = _find_code_in_line(line)
        assert result is None, (
            f"AC-8 test 10 FAILED: garbled noise must return None, got: {result}"
        )

    def test_dash_prefix_223_negative_values(self) -> None:
        """Extra: dash-prefix line with code 223 and parenthetical negative values."""
        line = "- Gia tri hao mon luy ke 223 (13.762.875.752.850) (11.683.165.704.793)"
        result = _find_code_in_line(line)
        assert result is not None, f"Expected match for code 223, got None. Line: {line!r}"
        code, label, values_rest = result
        assert code == "223", f"Expected code='223', got {code!r}"
        assert "13.762.875.752.850" in values_rest or "(13.762.875.752.850)" in values_rest, (
            f"Expected negative value in values_rest={values_rest!r}"
        )

    def test_dash_prefix_226_negative_values(self) -> None:
        """Extra: dash-prefix line with code 226 and parenthetical negative values."""
        line = "- Gia tri hao mon luy ke 226 (4.593.793.590) (3.673.326.424)"
        result = _find_code_in_line(line)
        assert result is not None, f"Expected match for code 226, got None. Line: {line!r}"
        code, label, values_rest = result
        assert code == "226", f"Expected code='226', got {code!r}"

    def test_note_ref_319_line(self) -> None:
        """Extra: note-ref line with code 319."""
        line = "8. Phai tra ngan han khac 319 22 1.014.673.786.632 874.015.837.328"
        result = _find_code_in_line(line)
        assert result is not None, f"Expected match for code 319, got None."
        code, label, values_rest = result
        assert code == "319", f"Expected code='319', got {code!r}"
        assert "1.014.673.786.632" in values_rest, (
            f"Expected '1.014.673.786.632' in values_rest={values_rest!r}"
        )

    def test_short_2digit_code_under_100_rejected(self) -> None:
        """Extra: 2-digit code under 100 (e.g. '22') is rejected by code_int < 100 guard."""
        line = "Thuyet minh 22 1.234.567"
        result = _find_code_in_line(line)
        # "22" is below 100 so should be rejected; may return None or a different match
        if result is not None:
            code, _, _ = result
            assert int(code.rstrip("abcdefghijklmnopqrstuvwxyz")) >= 100, (
                f"Guard failed: code={code!r} is below 100 but was accepted. "
                f"Should be rejected by code_int < 100 check."
            )

    def test_large_number_not_mistaken_for_code(self) -> None:
        """Extra: a line with only a large number and no BCTC code → None."""
        line = "88.089.621.779.862"
        result = _find_code_in_line(line)
        assert result is None, (
            f"A standalone large number must not be matched as a code row. Got: {result}"
        )


# ---------------------------------------------------------------------------
# AC-9: _apply_positional_cutoff()
# ---------------------------------------------------------------------------

class TestApplyPositionalCutoff:
    """Verify positional cutoff drops all rows after last sentinel (270/440)."""

    def _make_row(self, code: Optional[str], row_order: int) -> dict:
        return {
            "page_number": 7,
            "row_order": row_order,
            "code": code,
            "label": f"label_{row_order}",
            "value_current": 1.0,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 0,
        }

    def test_cutoff_at_440_drops_post_sentinel_rows(self) -> None:
        """AC-9: rows after code='440' are dropped; sentinel row is kept."""
        rows = [
            self._make_row("300", 0),
            self._make_row("400", 1),
            self._make_row("440", 2),      # sentinel
            self._make_row(None, 3),       # garbled noise → should be dropped
            self._make_row(None, 4),       # garbled noise → should be dropped
            self._make_row(None, 5),       # garbled noise → should be dropped
            self._make_row(None, 6),       # garbled noise → should be dropped
            self._make_row(None, 7),       # garbled noise → should be dropped
        ]
        result = _apply_positional_cutoff(rows, "balance_sheet")

        assert len(result) == 3, (
            f"AC-9 FAILED: Expected 3 rows (up to and including sentinel 440), "
            f"got {len(result)} rows: {result}"
        )
        codes = [r["code"] for r in result]
        assert "440" in codes, "Sentinel row code='440' must be in result"
        assert all(r["code"] is not None for r in result if r["row_order"] <= 2), (
            "All pre-sentinel rows must be preserved"
        )

    def test_cutoff_at_270_drops_post_sentinel_rows(self) -> None:
        """AC-9 variant: sentinel code='270' also triggers cutoff."""
        rows = [
            self._make_row("100", 0),
            self._make_row("200", 1),
            self._make_row("270", 2),      # sentinel
            self._make_row(None, 3),       # noise
            self._make_row(None, 4),       # noise
        ]
        result = _apply_positional_cutoff(rows, "balance_sheet")
        assert len(result) == 3, (
            f"Expected 3 rows after cutoff at 270, got {len(result)}"
        )

    def test_no_sentinel_returns_all_rows_unchanged(self) -> None:
        """AC-9: no sentinel code → all rows returned unchanged (warning logged)."""
        rows = [
            self._make_row("100", 0),
            self._make_row("200", 1),
            self._make_row(None, 2),
        ]
        result = _apply_positional_cutoff(rows, "balance_sheet")
        assert len(result) == len(rows), (
            "When no sentinel found, all rows must be returned unchanged."
        )

    def test_sentinel_at_last_position_no_cutoff(self) -> None:
        """AC-9: sentinel is already the last row — nothing to cut."""
        rows = [
            self._make_row("100", 0),
            self._make_row("270", 1),
        ]
        result = _apply_positional_cutoff(rows, "balance_sheet")
        assert len(result) == 2, (
            "Sentinel at last position → no rows removed, all returned."
        )

    def test_empty_rows_returns_empty(self) -> None:
        """AC-9: empty input → empty output."""
        result = _apply_positional_cutoff([], "balance_sheet")
        assert result == []


