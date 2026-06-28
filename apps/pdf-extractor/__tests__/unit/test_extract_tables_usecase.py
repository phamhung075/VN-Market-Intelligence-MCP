"""
Unit tests for application/extract_tables_usecase.py (BT-3-B).

Tests use injected FAKES for both ports — zero creds, zero network, zero Tesseract I/O.

Coverage:
  - TC1: happy path — assemble + balance-check + push all called; correct return shape
  - TC2: FPT golden balance-check (Total Assets 88089621.779862 = Liab + Equity) → balance_pass=True
  - TC3: deliberately unbalanced fixture → balance_pass=False
  - TC4: execute() returns {rows_stored, balance_pass, balance_delta} shape
  - TC5: push_table receives correct payload structure (report_id, rows, balance_check)
  - TC6: assembler returns empty rows → execute() handles gracefully, push called with empty rows
  - TC7: push_client returns rows_stored N → execute() echoes same N
  - TC8: assemble called with correct pages + statement_section arguments
  - TC9: balance_delta sign: delta = assets - (liab + equity)
  - TC10: balance tolerance — exact match (delta=0.0) → balance_pass=True
  - TC11: OcrPort calls are offloaded via asyncio.to_thread (event loop not blocked by OCR)
"""

import asyncio
import threading
from typing import Dict, List, Optional

import pytest

from application.extract_tables_usecase import (
    ExtractTablesUseCase,
    _detect_section_start,
    _filter_pages_to_section,
)

# ---------------------------------------------------------------------------
# FPT golden figures (from BT-0 spike eval — regression anchors)
# ---------------------------------------------------------------------------

# These are in raw VND (as stored in bctc_table_rows)
FPT_TOTAL_ASSETS = 88_089_621_779_862.0       # code 270
FPT_TOTAL_LIABILITIES = 44_338_155_487_272.0  # code 300
FPT_TOTAL_EQUITY = 43_751_466_292_590.0       # code 400

# ---------------------------------------------------------------------------
# Fake adapters
# ---------------------------------------------------------------------------


class FakeTableAssembler:
    """
    Fake TableAssemblerPort — returns a configurable structured result.
    Records call arguments for assertion.
    """

    def __init__(
        self,
        rows: Optional[List[Dict]] = None,
        period_current: str = "31/12/2025",
        period_prior: Optional[str] = "31/12/2024",
    ) -> None:
        self._rows = rows if rows is not None else []
        self._period_current = period_current
        self._period_prior = period_prior
        self.call_args: Optional[Dict] = None

    def assemble(self, pages: List[Dict], statement_section: str) -> Dict:
        self.call_args = {"pages": pages, "statement_section": statement_section}
        return {
            "rows": self._rows,
            "period_current": self._period_current,
            "period_prior": self._period_prior,
        }


class FakePushClient:
    """
    Fake TablePushClientPort — records call arguments and returns configurable result.
    """

    def __init__(self, rows_stored: int = 0) -> None:
        self._rows_stored = rows_stored
        self.call_args: Optional[Dict] = None
        self.called = False

    async def push_table(
        self,
        report_id: str,
        statement_section: str,
        rows: List[Dict],
        balance_check: Optional[Dict],
        period_current: str,
        period_prior: Optional[str],
    ) -> Dict:
        self.called = True
        self.call_args = {
            "report_id": report_id,
            "statement_section": statement_section,
            "rows": rows,
            "balance_check": balance_check,
            "period_current": period_current,
            "period_prior": period_prior,
        }
        return {"ok": True, "rows_stored": self._rows_stored}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fpt_rows() -> List[Dict]:
    """Minimal FPT balance-sheet rows with the golden anchor figures."""
    return [
        {
            "page_number": 4,
            "row_order": 0,
            "code": "270",
            "label": "TỔNG CỘNG TÀI SẢN",
            "value_current": FPT_TOTAL_ASSETS,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
        {
            "page_number": 5,
            "row_order": 1,
            "code": "300",
            "label": "NỢ PHẢI TRẢ",
            "value_current": FPT_TOTAL_LIABILITIES,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
        {
            "page_number": 6,
            "row_order": 2,
            "code": "400",
            "label": "VỐN CHỦ SỞ HỮU",
            "value_current": FPT_TOTAL_EQUITY,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
    ]


# ---------------------------------------------------------------------------
# TC1 — happy path: all adapters called, return shape correct
# ---------------------------------------------------------------------------


async def test_tc1_happy_path_all_adapters_called():
    rows = _fpt_rows()
    assembler = FakeTableAssembler(rows=rows)
    push_client = FakePushClient(rows_stored=len(rows))

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = await usecase.execute(
        report_id="test-report-id-1",
        pdf_path="/tmp/fpt.pdf",
        statement_section="balance_sheet",
    )

    # assembler was called
    assert assembler.call_args is not None, "assembler.assemble() was not called"
    # push_client was called
    assert push_client.called, "push_client.push_table() was not called"
    # return shape correct
    assert "rows_stored" in result
    assert "balance_pass" in result
    assert "balance_delta" in result


# ---------------------------------------------------------------------------
# TC2 — FPT golden balance-check: Total Assets = Liab + Equity → balance_pass=True
# ---------------------------------------------------------------------------


async def test_tc2_fpt_golden_balance_check_balanced():
    rows = _fpt_rows()
    assembler = FakeTableAssembler(rows=rows)
    push_client = FakePushClient(rows_stored=3)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = await usecase.execute(
        report_id="fpt-uuid-golden",
        pdf_path="/data/pdfs/FPT_2025_Q4.pdf",
        statement_section="balance_sheet",
    )

    assert result["balance_pass"] is True, (
        f"FPT golden balance-check failed: balance_pass={result['balance_pass']}, "
        f"delta={result['balance_delta']}"
    )
    # delta should be zero (or within float tolerance)
    assert abs(result["balance_delta"]) < 1.0, (
        f"Balance delta too large: {result['balance_delta']}"
    )


# ---------------------------------------------------------------------------
# TC3 — deliberately unbalanced fixture → balance_pass=False
# ---------------------------------------------------------------------------


async def test_tc3_unbalanced_fixture_returns_false():
    """
    Assets=100, Liab=50, Equity=40 → 100 != 50+40=90 → unbalanced.
    """
    unbalanced_rows = [
        {
            "page_number": 1,
            "row_order": 0,
            "code": "270",
            "label": "TỔNG CỘNG TÀI SẢN",
            "value_current": 100.0,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
        {
            "page_number": 1,
            "row_order": 1,
            "code": "300",
            "label": "NỢ PHẢI TRẢ",
            "value_current": 50.0,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
        {
            "page_number": 1,
            "row_order": 2,
            "code": "400",
            "label": "VỐN CHỦ SỞ HỮU",
            "value_current": 40.0,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
    ]
    assembler = FakeTableAssembler(rows=unbalanced_rows)
    push_client = FakePushClient(rows_stored=3)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = await usecase.execute(
        report_id="unbalanced-test",
        pdf_path="/tmp/test.pdf",
        statement_section="balance_sheet",
    )

    assert result["balance_pass"] is False, (
        f"Expected balance_pass=False for unbalanced fixture, got {result['balance_pass']}"
    )
    # delta = 100 - (50 + 40) = 10
    assert abs(result["balance_delta"] - 10.0) < 1e-6, (
        f"Expected delta=10.0, got {result['balance_delta']}"
    )


# ---------------------------------------------------------------------------
# TC4 — return shape has exactly the three required keys
# ---------------------------------------------------------------------------


async def test_tc4_return_shape_has_required_keys():
    assembler = FakeTableAssembler(rows=[])
    push_client = FakePushClient(rows_stored=0)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = await usecase.execute(
        report_id="shape-test",
        pdf_path="/tmp/test.pdf",
        statement_section="income_statement",
    )

    assert set(result.keys()) >= {"rows_stored", "balance_pass", "balance_delta"}


# ---------------------------------------------------------------------------
# TC5 — push_table receives correct payload structure
# ---------------------------------------------------------------------------


async def test_tc5_push_client_receives_correct_payload():
    rows = _fpt_rows()
    assembler = FakeTableAssembler(rows=rows, period_current="31/12/2025", period_prior="31/12/2024")
    push_client = FakePushClient(rows_stored=len(rows))

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    await usecase.execute(
        report_id="payload-test-id",
        pdf_path="/tmp/fpt.pdf",
        statement_section="balance_sheet",
    )

    assert push_client.call_args is not None
    args = push_client.call_args
    assert args["report_id"] == "payload-test-id"
    assert args["statement_section"] == "balance_sheet"
    assert args["rows"] == rows
    assert args["period_current"] == "31/12/2025"
    assert args["period_prior"] == "31/12/2024"
    # balance_check dict present with expected keys
    assert args["balance_check"] is not None
    bc = args["balance_check"]
    assert "balance_pass" in bc
    assert "balance_delta" in bc


# ---------------------------------------------------------------------------
# TC6 — empty rows → execute() handles gracefully, push called with empty rows
# ---------------------------------------------------------------------------


async def test_tc6_empty_rows_handled_gracefully():
    assembler = FakeTableAssembler(rows=[])
    push_client = FakePushClient(rows_stored=0)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = await usecase.execute(
        report_id="empty-rows-test",
        pdf_path="/tmp/empty.pdf",
        statement_section="cash_flow",
    )

    assert push_client.called
    assert push_client.call_args["rows"] == []
    assert result["rows_stored"] == 0


# ---------------------------------------------------------------------------
# TC7 — push_client returns rows_stored N → execute() echoes same N
# ---------------------------------------------------------------------------


async def test_tc7_rows_stored_echoed_from_push_client():
    rows = _fpt_rows()
    assembler = FakeTableAssembler(rows=rows)
    push_client = FakePushClient(rows_stored=42)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = await usecase.execute(
        report_id="echo-test",
        pdf_path="/tmp/fpt.pdf",
        statement_section="balance_sheet",
    )

    assert result["rows_stored"] == 42


# ---------------------------------------------------------------------------
# TC8 — assemble called with correct pages + statement_section arguments
# ---------------------------------------------------------------------------


async def test_tc8_assembler_called_with_correct_args():
    assembler = FakeTableAssembler(rows=[])
    push_client = FakePushClient(rows_stored=0)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    await usecase.execute(
        report_id="args-test",
        pdf_path="/tmp/test.pdf",
        statement_section="income_statement",
    )

    assert assembler.call_args is not None
    assert assembler.call_args["statement_section"] == "income_statement"
    # pages must be a list (may be empty or populated from pdf_path reading)
    assert isinstance(assembler.call_args["pages"], list)


# ---------------------------------------------------------------------------
# TC9 — balance_delta sign: delta = assets - (liab + equity)
# ---------------------------------------------------------------------------


async def test_tc9_balance_delta_sign():
    """
    Assets=200, Liab=100, Equity=50 → delta = 200 - 150 = 50 (positive).
    """
    rows = [
        {"page_number": 1, "row_order": 0, "code": "270", "label": "TOTAL ASSETS",
         "value_current": 200.0, "value_prior": None, "unit": "vnd", "is_summary_row": 1},
        {"page_number": 1, "row_order": 1, "code": "300", "label": "LIABILITIES",
         "value_current": 100.0, "value_prior": None, "unit": "vnd", "is_summary_row": 1},
        {"page_number": 1, "row_order": 2, "code": "400", "label": "EQUITY",
         "value_current": 50.0, "value_prior": None, "unit": "vnd", "is_summary_row": 1},
    ]
    assembler = FakeTableAssembler(rows=rows)
    push_client = FakePushClient(rows_stored=3)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = await usecase.execute(
        report_id="delta-sign-test",
        pdf_path="/tmp/test.pdf",
        statement_section="balance_sheet",
    )

    # delta = 200 - (100 + 50) = 50
    assert abs(result["balance_delta"] - 50.0) < 1e-6


# ---------------------------------------------------------------------------
# TC10 — exact match (delta=0.0) → balance_pass=True
# ---------------------------------------------------------------------------


async def test_tc10_exact_match_delta_zero_balance_pass_true():
    """
    Assets = Liab + Equity exactly → delta=0.0 → balance_pass=True.
    """
    rows = [
        {"page_number": 1, "row_order": 0, "code": "270", "label": "TOTAL ASSETS",
         "value_current": 1_000_000.0, "value_prior": None, "unit": "vnd", "is_summary_row": 1},
        {"page_number": 1, "row_order": 1, "code": "300", "label": "LIABILITIES",
         "value_current": 600_000.0, "value_prior": None, "unit": "vnd", "is_summary_row": 1},
        {"page_number": 1, "row_order": 2, "code": "400", "label": "EQUITY",
         "value_current": 400_000.0, "value_prior": None, "unit": "vnd", "is_summary_row": 1},
    ]
    assembler = FakeTableAssembler(rows=rows)
    push_client = FakePushClient(rows_stored=3)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = await usecase.execute(
        report_id="exact-match-test",
        pdf_path="/tmp/test.pdf",
        statement_section="balance_sheet",
    )

    assert result["balance_pass"] is True
    assert abs(result["balance_delta"]) < 1e-6


# ---------------------------------------------------------------------------
# TC11 — OcrPort calls are offloaded to a thread (event loop not blocked)
# ---------------------------------------------------------------------------


class ThreadTrackingOcrPort:
    """
    Fake OcrPort that records the thread ID for each call.

    TC11 verifies that both locate_balance_sheet_pages() and ocr_pages()
    are called from a worker thread, NOT from the event loop thread.
    If they run on the event loop thread, asyncio.to_thread() was not used
    and Tesseract would block /health during real OCR work.
    """

    def __init__(self):
        self.event_loop_thread_id: int = threading.get_ident()
        self.locate_thread_id: Optional[int] = None
        self.ocr_thread_id: Optional[int] = None

    def locate_balance_sheet_pages(self, pdf_path: str) -> List[int]:
        self.locate_thread_id = threading.get_ident()
        return [1, 2]

    def ocr_pages(self, pdf_path: str, page_numbers: List[int]) -> List[Dict]:
        self.ocr_thread_id = threading.get_ident()
        return [{"page_number": p, "text": ""} for p in page_numbers]


def test_tc11_ocr_port_runs_in_worker_thread_not_event_loop():
    """
    TC11: When OcrPort is injected, execute() must call locate_balance_sheet_pages()
    and ocr_pages() via asyncio.to_thread() — i.e., both run on a worker thread,
    never on the asyncio event loop thread.

    Regression guard for the /health block bug: if these calls run synchronously
    on the event loop thread, Tesseract OCR pins the loop and makes /health
    unresponsive for 10-30+ seconds per page. This test must FAIL if the
    asyncio.to_thread() wrappers are removed.
    """
    ocr_port = ThreadTrackingOcrPort()
    # Record the event loop thread ID inside the test coroutine (same thread as await)
    event_loop_thread_id_in_coro: Optional[int] = None

    async def run():
        nonlocal event_loop_thread_id_in_coro
        event_loop_thread_id_in_coro = threading.get_ident()
        # Update the port's baseline to match the actual event loop thread
        ocr_port.event_loop_thread_id = event_loop_thread_id_in_coro

        assembler = FakeTableAssembler(rows=[])
        push_client = FakePushClient(rows_stored=0)
        usecase = ExtractTablesUseCase(
            table_extractor=assembler,
            table_push_client=push_client,
            ocr_port=ocr_port,
        )
        await usecase.execute(
            report_id="tc11-thread-test",
            pdf_path="/tmp/nonexistent.pdf",
            statement_section="balance_sheet",
        )

    asyncio.run(run())

    # Both OcrPort calls must have been dispatched to a worker thread
    assert ocr_port.locate_thread_id is not None, (
        "locate_balance_sheet_pages was never called — check Path B routing"
    )
    assert ocr_port.ocr_thread_id is not None, (
        "ocr_pages was never called — check Path B routing"
    )
    assert ocr_port.locate_thread_id != event_loop_thread_id_in_coro, (
        "locate_balance_sheet_pages ran on the event loop thread — "
        "asyncio.to_thread() was not used; this would block /health during OCR"
    )
    assert ocr_port.ocr_thread_id != event_loop_thread_id_in_coro, (
        "ocr_pages ran on the event loop thread — "
        "asyncio.to_thread() was not used; this would block /health during OCR"
    )


# ---------------------------------------------------------------------------
# FR-4 — Section-boundary content-signal detection tests
# ---------------------------------------------------------------------------


def test_fr4_detect_section_start_income_statement_accented():
    """
    AC-2: page with income-statement Vietnamese title keyword → 'income_statement'.
    Tests accented (diacritical) form.
    """
    page_text = "Báo cáo kết quả hoạt động kinh doanh\nNăm 2026\nDoanh thu thuần"
    assert _detect_section_start(page_text) == "income_statement"


def test_fr4_detect_section_start_income_statement_unaccented():
    """
    AC-2: diacritic-insensitive: unaccented IS keyword also detected.
    """
    page_text = "bao cao ket qua hoat dong kinh doanh\nnăm tài chính 2025"
    assert _detect_section_start(page_text) == "income_statement"


def test_fr4_detect_section_start_income_statement_b02_tctd():
    """
    AC-2: B02-TCTD banking income statement title (same keyword, no issuer branch).
    """
    page_text = "Kết quả hoạt động kinh doanh\nThu nhập lãi thuần"
    assert _detect_section_start(page_text) == "income_statement"


def test_fr4_detect_section_start_cash_flow():
    """
    AC-2: cash-flow section keyword → 'cash_flow'.
    """
    page_text = "Báo cáo lưu chuyển tiền tệ năm 2026\nHoạt động kinh doanh"
    assert _detect_section_start(page_text) == "cash_flow"


def test_fr4_detect_section_start_cash_flow_unaccented():
    """
    AC-2: diacritic-insensitive: unaccented CF keyword also detected.
    """
    page_text = "luu chuyen tien te\nHoat dong kinh doanh"
    assert _detect_section_start(page_text) == "cash_flow"


def test_fr4_detect_section_start_none_balance_sheet_page():
    """
    AC-2: balance-sheet page (no IS/CF keyword) → None.
    """
    page_text = "Tiền mặt\n100.000\nTiền gửi\n500.000\nTổng tài sản"
    assert _detect_section_start(page_text) is None


def test_fr4_detect_section_start_none_continuation_page():
    """
    AC-2: plain data page (no section header) → None (continuation page).
    """
    page_text = "Chi phí bán hàng 1.234.567\nChi phí quản lý 2.345.678"
    assert _detect_section_start(page_text) is None


def test_fr4_filter_pages_income_statement_selects_contiguous_run():
    """
    AC-3: income_statement call with mixed pages → contiguous IS run selected (pages 2-3).
    Pages stop when CF header is encountered.
    """
    pages = [
        {"text": "Tiền mặt 100.000\nTiền gửi 500.000", "page_number": 1},  # BS
        {"text": "Báo cáo kết quả hoạt động kinh doanh\nDoanh thu 1.000.000", "page_number": 2},  # IS header
        {"text": "Chi phí 500.000\nLợi nhuận gộp 500.000", "page_number": 3},  # IS continuation
        {"text": "Báo cáo lưu chuyển tiền tệ\nHoạt động kinh doanh", "page_number": 4},  # CF header
    ]
    is_pages = _filter_pages_to_section(pages, "income_statement")
    assert len(is_pages) == 2, f"Expected 2 IS pages, got {len(is_pages)}"
    assert is_pages[0]["page_number"] == 2
    assert is_pages[1]["page_number"] == 3


def test_fr4_filter_pages_cash_flow_selects_correctly():
    """
    AC-3: cash_flow call → CF page selected; stops when no more pages.
    """
    pages = [
        {"text": "Tiền mặt 100.000\nTiền gửi 500.000", "page_number": 1},  # BS
        {"text": "Báo cáo kết quả hoạt động kinh doanh\nDoanh thu 1.000.000", "page_number": 2},  # IS header
        {"text": "Chi phí 500.000", "page_number": 3},  # IS continuation
        {"text": "Báo cáo lưu chuyển tiền tệ\nHoạt động kinh doanh", "page_number": 4},  # CF header
    ]
    cf_pages = _filter_pages_to_section(pages, "cash_flow")
    assert len(cf_pages) == 1, f"Expected 1 CF page, got {len(cf_pages)}"
    assert cf_pages[0]["page_number"] == 4


def test_fr4_filter_pages_balance_sheet_excludes_is_pages():
    """
    AC-3: balance_sheet call with mixed pages → IS pages excluded from result.
    Page 1 (no IS/CF header) is kept; page 2 (IS header) is excluded.
    Note: select_balance_sheet_section() falls back to all pages when no BS markers
    are found in the fixture; FR-4 then excludes the IS/CF pages.
    """
    pages = [
        {"text": "Tiền mặt 100.000\nTiền gửi 500.000", "page_number": 1},  # BS continuation
        {"text": "Báo cáo kết quả hoạt động kinh doanh\nDoanh thu 1.000.000", "page_number": 2},  # IS header
    ]
    bs_pages = _filter_pages_to_section(pages, "balance_sheet")
    page_numbers = [p["page_number"] for p in bs_pages]
    assert 2 not in page_numbers, (
        f"IS page (page 2) must be excluded from balance_sheet, got: {page_numbers}"
    )
    assert 1 in page_numbers, (
        f"Non-IS page (page 1) must remain in balance_sheet, got: {page_numbers}"
    )


def test_fr4_filter_pages_balance_sheet_excludes_cf_pages():
    """
    AC-3: balance_sheet call → CF pages excluded from result.
    """
    pages = [
        {"text": "Nợ phải trả 1.000.000\nVốn chủ sở hữu 500.000", "page_number": 1},  # BS
        {"text": "Báo cáo lưu chuyển tiền tệ\nHoạt động kinh doanh", "page_number": 2},  # CF header
    ]
    bs_pages = _filter_pages_to_section(pages, "balance_sheet")
    page_numbers = [p["page_number"] for p in bs_pages]
    assert 2 not in page_numbers, (
        f"CF page (page 2) must be excluded from balance_sheet, got: {page_numbers}"
    )


def test_fr4_fpt_non_regression_no_section_keywords():
    """
    AC-7: FPT pages (no IS/CF section keywords) → all pages retained for balance_sheet.
    FPT balance-sheet pages contain no income-statement or cash-flow section headers.
    Verifies FR-4 does NOT re-route any FPT balance-sheet page wrongly.
    """
    fpt_pages = [
        {"text": "270 88.089.621.779.862\nTỔNG CỘNG TÀI SẢN", "page_number": 4},
        {"text": "300 44.338.155.487.272\nNỢ PHẢI TRẢ", "page_number": 5},
        {"text": "400 43.751.466.292.590\nVỐN CHỦ SỞ HỮU", "page_number": 6},
    ]
    # _detect_section_start must return None for all FPT BS pages
    for p in fpt_pages:
        result = _detect_section_start(p["text"])
        assert result is None, (
            f"FPT page {p['page_number']} incorrectly detected as section '{result}'"
        )
    # _filter_pages_to_section for balance_sheet must not drop any FPT pages
    # (select_balance_sheet_section may or may not filter — either way FR-4 keeps None pages)
    bs_result = _filter_pages_to_section(fpt_pages, "balance_sheet")
    # All FPT pages must remain (none have IS/CF keywords)
    result_nums = [p["page_number"] for p in bs_result]
    for p in fpt_pages:
        assert p["page_number"] in result_nums, (
            f"FPT page {p['page_number']} was wrongly dropped by FR-4 filter"
        )


def test_fr4_off_balance_sheet_page_stays_in_balance_sheet():
    """
    AC-3 / EC-3: off-balance-sheet pages (Cam kết ngoại bảng) contain no IS/CF
    keywords → _detect_section_start returns None → remain in balance_sheet.
    """
    page_text = "Cam kết ngoại bảng\nBảo lãnh vay vốn 500.000\nCam kết khác 200.000"
    assert _detect_section_start(page_text) is None


def test_fr4_detect_section_start_case_insensitive():
    """
    AC-2: detection is case-insensitive (handles uppercase OCR output).
    """
    page_text = "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH"
    assert _detect_section_start(page_text) == "income_statement"
