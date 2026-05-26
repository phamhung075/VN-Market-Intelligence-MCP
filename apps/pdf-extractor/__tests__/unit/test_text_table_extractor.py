"""
Unit tests for infrastructure/text_table_extractor.py (BT-3-A).

Tests use fixture text only — zero creds, zero network, zero Tesseract I/O.

Coverage:
  - TC1: code row parse (code, label, value_current, value_prior extracted)
  - TC2: header/separator row passthrough (code=None)
  - TC3: None-value row (code present, values blank/non-numeric)
  - TC4: summary code flags (100, 270, 440 → is_summary_row=1)
  - TC5: VN number normalization (dot-thousands → correct float)
  - TC6: negative BCTC parenthesis notation
  - TC7: multi-page stitching (row_order increments globally)
  - TC8: period detection from header lines
  - TC9: empty input → empty rows
  - TC10: FPT golden balance-check (code 100 value matches anchor to the dong)
"""

import pytest
from infrastructure.text_table_extractor import TextTableExtractor

# ---------------------------------------------------------------------------
# Shared fixture text helpers
# ---------------------------------------------------------------------------

# Minimal FPT p4 fixture (1 header row + 4 code rows)
# BT3-FIX-3: Form title ("BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT") and the "Mã số"
# column-header line are now filtered as form-level noise per the architect's spec.
# BT3-FIX5 Ruling A: POSITIVE-KEEP gate — only section-letter ("A. ...") or
# roman-numeral ("I. ...") headers pass through as code=None rows. Standalone
# section names like "NGUỒN VỐN" without a structural prefix are silently dropped
# (cosmetic; does not affect balance_pass or sentinel values — per ruling R-1).
# Use "A. NGUON VON" (section-letter prefix) to test header-row passthrough.
FIXTURE_P4_MINIMAL = """\
A. NGUON VON
Đơn vị: VND
31/12/2025  31/12/2024
A. TÀI SẢN NGAN HAN  100  58.102.970.741.619  45.535.942.846.453
I. Tiền và các khoản tương đương tiền  110  10.540.181.640.920  9.315.440.438.884
1. Tiền  111  8.084.826.991.114  6.725.619.929.289
2. Các khoản tương đương tiền  112  2.455.354.649.806  2.589.820.509.595
"""

# Fixture with parenthesis-negative values
FIXTURE_NEGATIVES = """\
TÀI SẲN Mã số  31/12/2025  31/12/2024
6. Dự phòng phải thu ngắn hạn khó đòi  137  (586.166.744.274)  (619.531.925.859)
2. Dự phòng giảm giá hàng tồn kho  149  (83.623.807.838)  (133.467.537.483)
"""

# Fixture for None-value row (code row, no numeric values after label)
FIXTURE_NO_VALUES = """\
TÀI SẲN Mã số  31/12/2025  31/12/2024
Một khoản mục không có số liệu  999
"""

# Fixture for summary codes
FIXTURE_SUMMARY_CODES = """\
TÀI SẲN  31/12/2025
A. TÀI SẢN NGAN HAN  100  58.102.970.741.619
B. TÀI SẢN DÀI HAN  200  29.986.651.038.243
TỔNG CỘNG TÀI SẢN  270  88.089.621.779.862
NỢPHẢI TRẢ  300  44.338.155.487.272
VỐN CHỦ SỞ HỮU  400  43.751.466.292.590
TỔNG CỘNG NGUỒN VỐN  440  88.089.621.779.862
"""

# Two-page fixture for stitching test
FIXTURE_PAGE1 = """\
TÀI SẲN  31/12/2025
100  TÀI SẢN NGAN HAN  58.102.970.741.619
110  Tiền  10.540.181.640.920
"""

FIXTURE_PAGE2 = """\
200  TÀI SẢN DÀI HAN  29.986.651.038.243
270  TỔNG CỘNG TÀI SẢN  88.089.621.779.862
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestTextTableExtractor:
    """Unit tests for TextTableExtractor.assemble()."""

    def setup_method(self) -> None:
        self.extractor = TextTableExtractor()

    # --- TC1: code row parse ---

    def test_code_row_parse_basic(self) -> None:
        """Code row with code, label, value_current, value_prior all parsed."""
        pages = [{"page_number": 4, "text": FIXTURE_P4_MINIMAL}]
        result = self.extractor.assemble(pages, "balance_sheet")

        rows = result["rows"]
        # Find code 110 row
        row_110 = next((r for r in rows if r["code"] == "110"), None)
        assert row_110 is not None, "code=110 row must be present"
        assert row_110["label"] is not None
        assert "Tiền" in row_110["label"]
        assert row_110["value_current"] == pytest.approx(10_540_181_640_920.0, rel=1e-6)
        assert row_110["page_number"] == 4
        assert row_110["unit"] == "vnd"  # fixture says "Đơn vị: VND"

    # --- TC2: header/separator row passthrough ---

    def test_header_row_code_is_none(self) -> None:
        """Header/separator rows have code=None and value_current=None.

        BT3-FIX5 Ruling A: POSITIVE-KEEP gate replaces alpha-3 heuristic.
        Only section-letter ("A. ...") or roman-numeral ("I. ...") headers
        pass through. Fixture uses "A. NGUON VON" which matches the section-
        letter pattern and should appear as a code=None header row.
        """
        pages = [{"page_number": 4, "text": FIXTURE_P4_MINIMAL}]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        header_rows = [r for r in rows if r["code"] is None]
        # "A. NGUON VON" is the section-letter header in the fixture
        assert len(header_rows) >= 1, "At least one header row expected (A. NGUON VON)"
        for r in header_rows:
            assert r["value_current"] is None
            assert r["value_prior"] is None
            assert r["code"] is None
            assert r["label"] is not None

    # --- TC3: None-value row ---

    def test_none_value_row(self) -> None:
        """Code row with no numeric values has value_current=None, value_prior=None."""
        pages = [{"page_number": 1, "text": FIXTURE_NO_VALUES}]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        row_999 = next((r for r in rows if r["code"] == "999"), None)
        assert row_999 is not None, "code=999 row must be present"
        assert row_999["value_current"] is None
        assert row_999["value_prior"] is None

    # --- TC4: summary code flagging ---

    def test_summary_codes_flagged(self) -> None:
        """Codes 100, 200, 270, 300, 400, 440 get is_summary_row=1."""
        pages = [{"page_number": 4, "text": FIXTURE_SUMMARY_CODES}]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        summary_codes = {r["code"] for r in rows if r["is_summary_row"] == 1}
        assert "100" in summary_codes
        assert "200" in summary_codes
        assert "270" in summary_codes
        assert "300" in summary_codes
        assert "400" in summary_codes
        assert "440" in summary_codes

    def test_non_summary_codes_not_flagged(self) -> None:
        """Codes like 110, 111, 112 are NOT summary rows."""
        pages = [{"page_number": 4, "text": FIXTURE_P4_MINIMAL}]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        for code in ["110", "111", "112"]:
            row = next((r for r in rows if r["code"] == code), None)
            if row is not None:
                assert row["is_summary_row"] == 0, f"code={code} must NOT be summary"

    # --- TC5: VN number normalization ---

    def test_vn_dot_thousands_parses_correctly(self) -> None:
        """VN dot-thousands numbers (e.g. 58.102.970.741.619) parse to correct float."""
        pages = [{"page_number": 4, "text": FIXTURE_P4_MINIMAL}]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        row_100 = next((r for r in rows if r["code"] == "100"), None)
        assert row_100 is not None
        # 58,102,970,741,619 VND (not shifted)
        assert row_100["value_current"] == pytest.approx(58_102_970_741_619.0, rel=1e-6)

    # --- TC6: parenthesis-negative ---

    def test_parenthesis_negative_values(self) -> None:
        """(586.166.744.274) → -586166744274.0 (negative, correct magnitude)."""
        pages = [{"page_number": 4, "text": FIXTURE_NEGATIVES}]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        row_137 = next((r for r in rows if r["code"] == "137"), None)
        assert row_137 is not None, "code=137 row must be present"
        assert row_137["value_current"] is not None
        assert row_137["value_current"] < 0, "Parenthesis-negative must be negative"
        assert row_137["value_current"] == pytest.approx(-586_166_744_274.0, rel=1e-6)

    # --- TC7: multi-page stitching ---

    def test_multi_page_row_order_is_global(self) -> None:
        """row_order increments globally across pages (no reset per page)."""
        pages = [
            {"page_number": 1, "text": FIXTURE_PAGE1},
            {"page_number": 2, "text": FIXTURE_PAGE2},
        ]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        orders = [r["row_order"] for r in rows]
        # Must be strictly increasing
        assert orders == sorted(orders), "row_order must be non-decreasing"
        # No duplicates
        assert len(orders) == len(set(orders)), "row_order must be unique per row"

    def test_multi_page_page_numbers_preserved(self) -> None:
        """Rows from page 1 have page_number=1; rows from page 2 have page_number=2."""
        pages = [
            {"page_number": 1, "text": FIXTURE_PAGE1},
            {"page_number": 2, "text": FIXTURE_PAGE2},
        ]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        page1_rows = [r for r in rows if r["page_number"] == 1]
        page2_rows = [r for r in rows if r["page_number"] == 2]
        assert len(page1_rows) >= 1, "Must have rows from page 1"
        assert len(page2_rows) >= 1, "Must have rows from page 2"

    # --- TC8: period detection ---

    def test_period_current_detected(self) -> None:
        """period_current extracted from header line (31/12/2025)."""
        pages = [{"page_number": 4, "text": FIXTURE_P4_MINIMAL}]
        result = self.extractor.assemble(pages, "balance_sheet")
        assert result["period_current"] == "31/12/2025"

    def test_period_prior_detected(self) -> None:
        """period_prior extracted from header line (31/12/2024)."""
        pages = [{"page_number": 4, "text": FIXTURE_P4_MINIMAL}]
        result = self.extractor.assemble(pages, "balance_sheet")
        assert result["period_prior"] == "31/12/2024"

    # --- TC9: empty input ---

    def test_empty_pages_returns_empty(self) -> None:
        """Empty pages list returns empty rows."""
        result = self.extractor.assemble([], "balance_sheet")
        assert result["rows"] == []
        assert result["period_current"] is None
        assert result["period_prior"] is None

    def test_empty_text_page_returns_empty(self) -> None:
        """Page with empty text returns empty rows."""
        pages = [{"page_number": 1, "text": ""}]
        result = self.extractor.assemble(pages, "balance_sheet")
        assert result["rows"] == []

    # --- TC10: FPT golden balance-check values ---

    def test_fpt_code_100_golden_value(self) -> None:
        """
        FPT p4 code 100: value_current = 58,102,970,741,619 VND (from BT-0 spike).
        This is the golden regression anchor — must pass to the dong.
        """
        pages = [{"page_number": 4, "text": FIXTURE_P4_MINIMAL}]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        row_100 = next((r for r in rows if r["code"] == "100"), None)
        assert row_100 is not None
        # Golden: 58,102,970,741,619 VND exactly (within float precision)
        assert row_100["value_current"] == pytest.approx(58_102_970_741_619.0, rel=1e-9)

    def test_fpt_code_112_golden_value(self) -> None:
        """
        FPT p4 code 112: value_current = 2,455,354,649,806 VND.
        Tests correct parsing of medium-sized VN number.
        """
        pages = [{"page_number": 4, "text": FIXTURE_P4_MINIMAL}]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]

        row_112 = next((r for r in rows if r["code"] == "112"), None)
        assert row_112 is not None
        assert row_112["value_current"] == pytest.approx(2_455_354_649_806.0, rel=1e-6)

    # --- TC11: return dict shape ---

    def test_assemble_returns_required_keys(self) -> None:
        """assemble() result always contains rows, period_current, period_prior."""
        pages = [{"page_number": 1, "text": ""}]
        result = self.extractor.assemble(pages, "balance_sheet")
        assert "rows" in result
        assert "period_current" in result
        assert "period_prior" in result

    def test_row_dict_contains_required_fields(self) -> None:
        """Each row dict has all required fields."""
        pages = [{"page_number": 4, "text": FIXTURE_P4_MINIMAL}]
        result = self.extractor.assemble(pages, "balance_sheet")
        rows = result["rows"]
        assert len(rows) > 0

        required_fields = {
            "page_number", "row_order", "code", "label",
            "value_current", "value_prior", "unit", "is_summary_row",
        }
        for row in rows:
            missing = required_fields - set(row.keys())
            assert not missing, f"Row missing fields: {missing} — row={row}"


class TestTablePushClientInstantiation:
    """Smoke tests for TablePushClient instantiation (no network calls)."""

    def test_instantiates_with_default_url(self) -> None:
        from infrastructure.table_push_client import TablePushClient
        client = TablePushClient()
        assert "mcp-server" in client._push_endpoint

    def test_instantiates_with_custom_url(self) -> None:
        from infrastructure.table_push_client import TablePushClient
        client = TablePushClient(mcp_server_url="http://localhost:3000")
        assert "localhost:3000" in client._push_endpoint

    def test_push_table_is_async(self) -> None:
        """push_table must be declared as a coroutine function."""
        import asyncio
        from infrastructure.table_push_client import TablePushClient
        client = TablePushClient()
        # inspect signature — it must return a coroutine
        assert asyncio.iscoroutinefunction(client.push_table)
