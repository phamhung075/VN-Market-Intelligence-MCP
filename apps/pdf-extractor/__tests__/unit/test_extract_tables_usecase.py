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
"""

import asyncio
from typing import Dict, List, Optional

import pytest

from application.extract_tables_usecase import ExtractTablesUseCase

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


def _run(coro):
    """Run a coroutine synchronously in tests."""
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------------------------------------------------------------------------
# TC1 — happy path: all adapters called, return shape correct
# ---------------------------------------------------------------------------


def test_tc1_happy_path_all_adapters_called():
    rows = _fpt_rows()
    assembler = FakeTableAssembler(rows=rows)
    push_client = FakePushClient(rows_stored=len(rows))

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = _run(
        usecase.execute(
            report_id="test-report-id-1",
            pdf_path="/tmp/fpt.pdf",
            statement_section="balance_sheet",
        )
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


def test_tc2_fpt_golden_balance_check_balanced():
    rows = _fpt_rows()
    assembler = FakeTableAssembler(rows=rows)
    push_client = FakePushClient(rows_stored=3)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = _run(
        usecase.execute(
            report_id="fpt-uuid-golden",
            pdf_path="/data/pdfs/FPT_2025_Q4.pdf",
            statement_section="balance_sheet",
        )
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


def test_tc3_unbalanced_fixture_returns_false():
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

    result = _run(
        usecase.execute(
            report_id="unbalanced-test",
            pdf_path="/tmp/test.pdf",
            statement_section="balance_sheet",
        )
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


def test_tc4_return_shape_has_required_keys():
    assembler = FakeTableAssembler(rows=[])
    push_client = FakePushClient(rows_stored=0)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = _run(
        usecase.execute(
            report_id="shape-test",
            pdf_path="/tmp/test.pdf",
            statement_section="income_statement",
        )
    )

    assert set(result.keys()) >= {"rows_stored", "balance_pass", "balance_delta"}


# ---------------------------------------------------------------------------
# TC5 — push_table receives correct payload structure
# ---------------------------------------------------------------------------


def test_tc5_push_client_receives_correct_payload():
    rows = _fpt_rows()
    assembler = FakeTableAssembler(rows=rows, period_current="31/12/2025", period_prior="31/12/2024")
    push_client = FakePushClient(rows_stored=len(rows))

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    _run(
        usecase.execute(
            report_id="payload-test-id",
            pdf_path="/tmp/fpt.pdf",
            statement_section="balance_sheet",
        )
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


def test_tc6_empty_rows_handled_gracefully():
    assembler = FakeTableAssembler(rows=[])
    push_client = FakePushClient(rows_stored=0)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = _run(
        usecase.execute(
            report_id="empty-rows-test",
            pdf_path="/tmp/empty.pdf",
            statement_section="cash_flow",
        )
    )

    assert push_client.called
    assert push_client.call_args["rows"] == []
    assert result["rows_stored"] == 0


# ---------------------------------------------------------------------------
# TC7 — push_client returns rows_stored N → execute() echoes same N
# ---------------------------------------------------------------------------


def test_tc7_rows_stored_echoed_from_push_client():
    rows = _fpt_rows()
    assembler = FakeTableAssembler(rows=rows)
    push_client = FakePushClient(rows_stored=42)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    result = _run(
        usecase.execute(
            report_id="echo-test",
            pdf_path="/tmp/fpt.pdf",
            statement_section="balance_sheet",
        )
    )

    assert result["rows_stored"] == 42


# ---------------------------------------------------------------------------
# TC8 — assemble called with correct pages + statement_section arguments
# ---------------------------------------------------------------------------


def test_tc8_assembler_called_with_correct_args():
    assembler = FakeTableAssembler(rows=[])
    push_client = FakePushClient(rows_stored=0)

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
    )

    _run(
        usecase.execute(
            report_id="args-test",
            pdf_path="/tmp/test.pdf",
            statement_section="income_statement",
        )
    )

    assert assembler.call_args is not None
    assert assembler.call_args["statement_section"] == "income_statement"
    # pages must be a list (may be empty or populated from pdf_path reading)
    assert isinstance(assembler.call_args["pages"], list)


# ---------------------------------------------------------------------------
# TC9 — balance_delta sign: delta = assets - (liab + equity)
# ---------------------------------------------------------------------------


def test_tc9_balance_delta_sign():
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

    result = _run(
        usecase.execute(
            report_id="delta-sign-test",
            pdf_path="/tmp/test.pdf",
            statement_section="balance_sheet",
        )
    )

    # delta = 200 - (100 + 50) = 50
    assert abs(result["balance_delta"] - 50.0) < 1e-6


# ---------------------------------------------------------------------------
# TC10 — exact match (delta=0.0) → balance_pass=True
# ---------------------------------------------------------------------------


def test_tc10_exact_match_delta_zero_balance_pass_true():
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

    result = _run(
        usecase.execute(
            report_id="exact-match-test",
            pdf_path="/tmp/test.pdf",
            statement_section="balance_sheet",
        )
    )

    assert result["balance_pass"] is True
    assert abs(result["balance_delta"]) < 1e-6
