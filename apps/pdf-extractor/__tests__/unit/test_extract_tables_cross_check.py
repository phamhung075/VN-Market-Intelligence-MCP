"""
Unit tests — BT-5 cross-check confidence gate in ExtractTablesUseCase.

Tests use injected FAKES for all ports (zero creds, zero network, zero Tesseract I/O).

Coverage:
  - TC-GW1: FPT golden case → gate PASS (balance holds + no anomaly) → push called once
  - TC-GW2: Deliberately unbalanced fixture → gate BLOCK → push NOT called → blocked_reason set
             alert emitted (via injected FakeAlertPort)
  - TC-GW3: Decimal-shift fixture (one figure 10×+ off) → gate BLOCK → push NOT called
  - TC-GW4: Alert emitted with expected message format on block
  - TC-GW5: blocked_reason = "cross_check_fail" when blocked
  - TC-GW6: blocked_reason = None (absent or None) when gate passes

All blocking is DDD-compliant:
    - reconcile_figures imported from domain.primitives (pure)
    - AlertPort is a pure Protocol injected at the composition root
    - No HTTP/DB calls in the gate logic
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from typing import Dict, List, Optional

from application.extract_tables_usecase import ExtractTablesUseCase

# ---------------------------------------------------------------------------
# FPT golden figures (regression anchors — must PASS the gate)
# ---------------------------------------------------------------------------

FPT_TOTAL_ASSETS = 88_089_621_779_862.0       # code 270
FPT_TOTAL_LIABILITIES = 44_338_155_487_272.0  # code 300
FPT_TOTAL_EQUITY = 43_751_466_292_590.0       # code 400


# ---------------------------------------------------------------------------
# Fake adapters
# ---------------------------------------------------------------------------


class FakeTableAssembler:
    """Returns configurable structured rows."""

    def __init__(
        self,
        rows: Optional[List[Dict]] = None,
        period_current: str = "31/12/2025",
        period_prior: Optional[str] = "31/12/2024",
    ) -> None:
        self._rows = rows if rows is not None else []
        self._period_current = period_current
        self._period_prior = period_prior
        self.call_count = 0

    def assemble(self, pages: List[Dict], statement_section: str) -> Dict:
        self.call_count += 1
        return {
            "rows": self._rows,
            "period_current": self._period_current,
            "period_prior": self._period_prior,
        }


class FakePushClient:
    """Records whether push_table was called."""

    def __init__(self, rows_stored: int = 3) -> None:
        self._rows_stored = rows_stored
        self.called = False
        self.call_count = 0

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
        self.call_count += 1
        return {"ok": True, "rows_stored": self._rows_stored}


class FakeAlertPort:
    """
    Fake AlertPort — records alert messages sent.
    Does NOT send real Telegram messages. Injected in tests.
    """

    def __init__(self) -> None:
        self.alerts: List[str] = []

    async def send_work_alert(self, message: str) -> None:
        self.alerts.append(message)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fpt_rows() -> List[Dict]:
    """Minimal balanced FPT rows — gate should PASS."""
    return [
        {
            "page_number": 4,
            "row_order": 0,
            "code": "100",
            "label": "TÀI SẢN NGẮN HẠN",
            "value_current": 58_102_970_741_619.0,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
        {
            "page_number": 5,
            "row_order": 1,
            "code": "270",
            "label": "TỔNG CỘNG TÀI SẢN",
            "value_current": FPT_TOTAL_ASSETS,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
        {
            "page_number": 6,
            "row_order": 2,
            "code": "300",
            "label": "NỢ PHẢI TRẢ",
            "value_current": FPT_TOTAL_LIABILITIES,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
        {
            "page_number": 7,
            "row_order": 3,
            "code": "400",
            "label": "VỐN CHỦ SỞ HỮU",
            "value_current": FPT_TOTAL_EQUITY,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
    ]


def _unbalanced_rows() -> List[Dict]:
    """
    Rows where Total Assets (270) != Liabilities (300) + Equity (400).
    Assets=100, Liab=50, Equity=40 → delta=10 (above 1 VND tolerance) → BLOCK.
    """
    return [
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


def _decimal_shift_rows() -> List[Dict]:
    """
    Rows where code 270 = 1_000_000.0 but code 300 = 1.0 and code 400 = 0.0
    → total_assets (1_000_000) vs liab+equity (1.0) = 1_000_000× ratio → SHIFT → BLOCK.
    """
    return [
        {
            "page_number": 1,
            "row_order": 0,
            "code": "270",
            "label": "TỔNG CỘNG TÀI SẢN",
            "value_current": 1_000_000.0,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
        {
            "page_number": 1,
            "row_order": 1,
            "code": "300",
            "label": "NỢ PHẢI TRẢ",
            "value_current": 1.0,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
        {
            "page_number": 1,
            "row_order": 2,
            "code": "400",
            "label": "VỐN CHỦ SỞ HỮU",
            "value_current": 0.5,
            "value_prior": None,
            "unit": "vnd",
            "is_summary_row": 1,
        },
    ]


# ---------------------------------------------------------------------------
# TC-GW1: FPT golden → gate PASS → push called once
# ---------------------------------------------------------------------------


async def test_gw1_fpt_golden_gate_passes_push_called_once():
    """
    FPT balanced rows (balance_pass=True, no decimal-shift anomaly):
    gate must PASS and push must be called exactly once.
    """
    assembler = FakeTableAssembler(rows=_fpt_rows())
    push_client = FakePushClient(rows_stored=4)
    alert_port = FakeAlertPort()

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
        alert_port=alert_port,
    )

    result = await usecase.execute(
        report_id="fpt-golden-uuid",
        pdf_path="/data/pdfs/FPT_2025_Q4.pdf",
        statement_section="balance_sheet",
    )

    assert push_client.called, "push_table must be called when gate passes"
    assert push_client.call_count == 1, "push_table must be called exactly once"
    assert result.get("blocked_reason") is None, (
        f"FPT golden case must not be blocked; got blocked_reason={result.get('blocked_reason')}"
    )
    assert result["balance_pass"] is True
    assert len(alert_port.alerts) == 0, "No alert must be sent when gate passes"


# ---------------------------------------------------------------------------
# TC-GW2: Unbalanced fixture → gate BLOCK → push NOT called → blocked_reason set
# ---------------------------------------------------------------------------


async def test_gw2_unbalanced_fixture_blocks_push():
    """
    Unbalanced rows (balance_pass=False):
    gate BLOCKS push; blocked_reason = 'cross_check_fail'; alert emitted.
    """
    assembler = FakeTableAssembler(rows=_unbalanced_rows())
    push_client = FakePushClient(rows_stored=3)
    alert_port = FakeAlertPort()

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
        alert_port=alert_port,
    )

    result = await usecase.execute(
        report_id="unbalanced-report-uuid",
        pdf_path="/tmp/unbalanced.pdf",
        statement_section="balance_sheet",
    )

    assert not push_client.called, "push_table must NOT be called when gate blocks"
    assert result.get("blocked_reason") == "cross_check_fail", (
        f"Expected blocked_reason='cross_check_fail', got {result.get('blocked_reason')}"
    )
    assert len(alert_port.alerts) >= 1, "Alert must be sent when gate blocks"


# ---------------------------------------------------------------------------
# TC-GW3: Decimal-shift fixture → gate BLOCK → push NOT called
# ---------------------------------------------------------------------------


async def test_gw3_decimal_shift_fixture_blocks_push():
    """
    Rows where total_assets is 1_000_000× larger than (liab+equity sum).
    reconcile_figures must return 'shift' → gate BLOCKS push.
    """
    assembler = FakeTableAssembler(rows=_decimal_shift_rows())
    push_client = FakePushClient(rows_stored=3)
    alert_port = FakeAlertPort()

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
        alert_port=alert_port,
    )

    result = await usecase.execute(
        report_id="decimal-shift-uuid",
        pdf_path="/tmp/shift.pdf",
        statement_section="balance_sheet",
    )

    assert not push_client.called, (
        "push_table must NOT be called for decimal-shift anomaly; "
        f"push was called {push_client.call_count} times"
    )
    assert result.get("blocked_reason") == "cross_check_fail"
    assert len(alert_port.alerts) >= 1


# ---------------------------------------------------------------------------
# TC-GW4: Alert message format contains report_id and reason
# ---------------------------------------------------------------------------


async def test_gw4_alert_message_contains_report_id():
    """Alert message must contain the report_id so the WORK channel reader can diagnose."""
    assembler = FakeTableAssembler(rows=_unbalanced_rows())
    push_client = FakePushClient()
    alert_port = FakeAlertPort()

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
        alert_port=alert_port,
    )

    await usecase.execute(
        report_id="alert-format-test-uuid",
        pdf_path="/tmp/test.pdf",
        statement_section="balance_sheet",
    )

    assert len(alert_port.alerts) >= 1
    msg = alert_port.alerts[0]
    assert "alert-format-test-uuid" in msg, (
        f"Alert message must contain report_id. Got: {msg!r}"
    )


# ---------------------------------------------------------------------------
# TC-GW5: blocked_reason = "cross_check_fail" when blocked
# ---------------------------------------------------------------------------


async def test_gw5_blocked_reason_value_is_cross_check_fail():
    """Verify the exact string value of blocked_reason when gate fires."""
    assembler = FakeTableAssembler(rows=_unbalanced_rows())
    push_client = FakePushClient()
    alert_port = FakeAlertPort()

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
        alert_port=alert_port,
    )

    result = await usecase.execute(
        report_id="blocked-reason-test",
        pdf_path="/tmp/test.pdf",
        statement_section="balance_sheet",
    )

    assert result["blocked_reason"] == "cross_check_fail"
    assert result["rows_stored"] == 0  # nothing was stored


# ---------------------------------------------------------------------------
# TC-GW6: blocked_reason absent / None when gate passes
# ---------------------------------------------------------------------------


async def test_gw6_blocked_reason_none_when_gate_passes():
    """When extraction is clean, blocked_reason must be None (or absent)."""
    assembler = FakeTableAssembler(rows=_fpt_rows())
    push_client = FakePushClient(rows_stored=4)
    alert_port = FakeAlertPort()

    usecase = ExtractTablesUseCase(
        table_extractor=assembler,
        table_push_client=push_client,
        alert_port=alert_port,
    )

    result = await usecase.execute(
        report_id="clean-extraction-test",
        pdf_path="/tmp/fpt.pdf",
        statement_section="balance_sheet",
    )

    assert result.get("blocked_reason") is None
    assert push_client.called
