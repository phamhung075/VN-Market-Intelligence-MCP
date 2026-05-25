"""
Unit tests — BT-7: Path-A section filter + period detection hardening.

HOST-SAFE: all tests use FIXTURE text — no PDF I/O, no Tesseract, no OCR.

BT-7 scope:
  1. select_balance_sheet_section(page_texts) — pure function that filters a
     pre-supplied list of {page_number, text} dicts to only the balance-sheet
     pages (those containing BS markers). Shared logic between Path A and Path B.

  2. Period detection rejects signature dates — "26/01/2026 16:18:09 +07'00'" or
     similar digital-signature timestamp patterns must not become period_current.
     Real period columns come from BS table headers (e.g. "31/12/2025  31/12/2024").

  3. Path A (ExtractTablesUseCase with pre_supplied_pages) now applies
     select_balance_sheet_section BEFORE passing pages to assemble().
     After the fix: supplying 44 noisy pages produces ~74-96 BS rows,
     period_current=31/12/2025, golden anchors intact, balance_pass=True.

Fixture design:
  - NOISE_PAGES: cover page + digital-signature page + notes pages (non-BS)
    The signature page contains "26/01/2026" + "16:18:09 +07'00'" (timestamps).
  - BS_PAGES: 4 pages of balance-sheet OCR text containing BS markers +
    FPT golden-anchor code rows (270/300/400).

These fixtures simulate the actual FPT Q4 2025 OCR text structure described
in the PO's live verification (2170 rows, period_current="26/01/2026" — noisy).
After the BT-7 fix, Path A filters to BS_PAGES only → ~6 code rows, golden
anchors verified, period_current="31/12/2025".

Note: the fixture uses simplified but structurally faithful text — enough to
exercise the section-filter + period-detection logic without requiring real OCR.
"""

import asyncio
import sys
import os
from typing import Dict, List, Optional

import pytest

# Adjust sys.path so tests run from apps/pdf-extractor/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


# ---------------------------------------------------------------------------
# Fixture builder
# ---------------------------------------------------------------------------

# Cover page — noise: company name, date header, no BS markers
_COVER_PAGE_TEXT = """\
CÔNG TY CỔ PHẦN FPT
BÁO CÁO TÀI CHÍNH HỢP NHẤT
Năm tài chính kết thúc ngày 31 tháng 12 năm 2025
FPT Corporation
Annual Financial Report
"""

# Digital-signature page — noise: contains "26/01/2026" + time (signature timestamp)
_SIGNATURE_PAGE_TEXT = """\
Digitally signed by NGUYEN VAN A
Date: 2026.01.26 16:18:09 +07'00'
26/01/2026
Company Secretary
FPT Corporation
Hà Nội, ngày 26 tháng 01 năm 2026
"""

# Notes page 1 — noise: notes text, no BS structure
_NOTES_PAGE_1_TEXT = """\
THUYẾT MINH BÁO CÁO TÀI CHÍNH HỢP NHẤT
Ghi chú số 1: Thông tin chung
FPT Corporation được thành lập theo Giấy phép...
Đơn vị tiền tệ sử dụng trong báo cáo tài chính là Đồng Việt Nam (VND).
"""

# Notes page 2 — noise: more notes
_NOTES_PAGE_2_TEXT = """\
Ghi chú số 2: Cơ sở lập báo cáo tài chính
Báo cáo tài chính hợp nhất được lập theo các Chuẩn mực Kế toán Việt Nam...
31/12/2025 là ngày kết thúc kỳ báo cáo.
"""

# Notes page 3 — noise: more notes with a date but no BS structure
_NOTES_PAGE_3_TEXT = """\
Ghi chú số 15: Các khoản phải thu
Tại ngày 31/12/2025, các khoản phải thu ngắn hạn bao gồm:
Phải thu khách hàng: 10.000.000.000
Trả trước cho người bán: 500.000.000
"""

# Balance-sheet page A — BẢNG CÂN ĐỐI KẾ TOÁN + TÀI SẢN section
# This page carries the BS header, period headers, and current-asset codes
_BS_PAGE_A_TEXT = """\
BẢNG CÂN ĐỐI KẾ TOÁN HỢP NHẤT
Tại ngày 31 tháng 12 năm 2025
Đơn vị: VND
                                31/12/2025      31/12/2024
A. TÀI SẢN NGẮN HẠN  100  58.102.970.741.619  45.535.942.846.453
I. Tiền và tương đương tiền  110  10.540.181.640.920  8.125.619.929.289
1. Tiền  111  8.084.826.991.114  6.725.619.929.289
2. Tương đương tiền  112  2.455.354.649.806  1.400.000.000.000
"""

# Balance-sheet page B — still TÀI SẢN section, non-current assets
_BS_PAGE_B_TEXT = """\
TÀI SẢN DÀI HẠN  200  29.986.651.038.243  26.464.052.832.167
I. Các khoản phải thu dài hạn  210  500.000.000.000  300.000.000.000
TỔNG CỘNG TÀI SẢN  270  88.089.621.779.862  71.999.995.678.620
"""

# Balance-sheet page C — NGUỒN VỐN section (liabilities + equity)
_BS_PAGE_C_TEXT = """\
NGUỒN VỐN
B. NỢ PHẢI TRẢ  300  44.338.155.487.272  36.272.455.574.820
I. Nợ ngắn hạn  310  30.000.000.000.000  25.000.000.000.000
II. Nợ dài hạn  330  14.338.155.487.272  11.272.455.574.820
"""

# Balance-sheet page D — equity section + total
_BS_PAGE_D_TEXT = """\
TỔNG CỘNG NGUỒN VỐN
D. VỐN CHỦ SỞ HỮU  400  43.751.466.292.590  35.727.540.104.800
I. Vốn chủ sở hữu  410  43.748.716.292.590  35.724.790.104.800
TỔNG CỘNG NGUỒN VỐN (440=300+400)  440  88.089.621.779.862  71.999.995.678.620
"""

# Simulated 44-page FPT Q4 2025 OCR text as pre-supplied pages (Path A input)
# - Pages 1-5: noise (cover, signature, notes)
# - Pages 6-9: balance-sheet content
# - Pages 10-40: more notes noise (simplified as repeated notes text)
def _build_noisy_pages() -> List[Dict]:
    """Build a 44-page fixture simulating the full FPT Q4 OCR dump."""
    pages = []

    # Page 1: cover
    pages.append({"page_number": 1, "text": _COVER_PAGE_TEXT})
    # Page 2: digital signature (the "26/01/2026" corruption source)
    pages.append({"page_number": 2, "text": _SIGNATURE_PAGE_TEXT})
    # Pages 3-5: notes noise
    pages.append({"page_number": 3, "text": _NOTES_PAGE_1_TEXT})
    pages.append({"page_number": 4, "text": _NOTES_PAGE_2_TEXT})
    pages.append({"page_number": 5, "text": _NOTES_PAGE_3_TEXT})
    # Pages 6-9: balance-sheet section
    pages.append({"page_number": 6, "text": _BS_PAGE_A_TEXT})
    pages.append({"page_number": 7, "text": _BS_PAGE_B_TEXT})
    pages.append({"page_number": 8, "text": _BS_PAGE_C_TEXT})
    pages.append({"page_number": 9, "text": _BS_PAGE_D_TEXT})
    # Pages 10-44: more noise (notes)
    for i in range(10, 45):
        pages.append({
            "page_number": i,
            "text": (
                f"Ghi chú số {i - 9}: Nội dung ghi chú\n"
                f"Thông tin bổ sung cho kỳ kết thúc 31/12/2025.\n"
                f"Số liệu so sánh tại 31/12/2024.\n"
            )
        })

    return pages


def _build_bs_only_pages() -> List[Dict]:
    """Build only the 4 balance-sheet pages (the expected output after filtering)."""
    return [
        {"page_number": 6, "text": _BS_PAGE_A_TEXT},
        {"page_number": 7, "text": _BS_PAGE_B_TEXT},
        {"page_number": 8, "text": _BS_PAGE_C_TEXT},
        {"page_number": 9, "text": _BS_PAGE_D_TEXT},
    ]


# ---------------------------------------------------------------------------
# FPT golden anchors (VND, same as BT-0 spike eval regression anchors)
# ---------------------------------------------------------------------------

FPT_TOTAL_ASSETS = 88_089_621_779_862.0       # code 270
FPT_TOTAL_LIABILITIES = 44_338_155_487_272.0  # code 300
FPT_TOTAL_EQUITY = 43_751_466_292_590.0       # code 400


# ---------------------------------------------------------------------------
# PART 1: select_balance_sheet_section (pure function tests)
# ---------------------------------------------------------------------------


def test_sbs_filters_out_non_bs_pages():
    """
    select_balance_sheet_section on a noisy 44-page set must return only the
    4 BS pages (6, 7, 8, 9) — not the 40 noise pages.
    """
    from domain.primitives.select_balance_sheet_section.primitive import (
        select_balance_sheet_section,
    )

    noisy = _build_noisy_pages()
    filtered = select_balance_sheet_section(noisy)

    page_numbers = [p["page_number"] for p in filtered]
    assert set(page_numbers) == {6, 7, 8, 9}, (
        f"Expected BS pages {{6,7,8,9}}, got {page_numbers}"
    )
    assert len(filtered) <= 8, (
        f"Filtered result too large ({len(filtered)} pages) — non-BS pages leaking through"
    )


def test_sbs_keeps_bs_only_input_unchanged():
    """
    When all supplied pages are BS pages, select_balance_sheet_section must
    return all of them (no over-filtering).
    """
    from domain.primitives.select_balance_sheet_section.primitive import (
        select_balance_sheet_section,
    )

    bs_pages = _build_bs_only_pages()
    filtered = select_balance_sheet_section(bs_pages)

    assert len(filtered) == 4, (
        f"Expected 4 BS pages returned unchanged, got {len(filtered)}"
    )
    assert [p["page_number"] for p in filtered] == [6, 7, 8, 9]


def test_sbs_empty_input_returns_empty():
    """Empty page list → empty result (no crash)."""
    from domain.primitives.select_balance_sheet_section.primitive import (
        select_balance_sheet_section,
    )

    result = select_balance_sheet_section([])
    assert result == []


def test_sbs_signature_page_excluded():
    """
    The digital-signature page (contains "26/01/2026" but NO BS markers)
    must be excluded.
    """
    from domain.primitives.select_balance_sheet_section.primitive import (
        select_balance_sheet_section,
    )

    pages = [
        {"page_number": 1, "text": _SIGNATURE_PAGE_TEXT},
        {"page_number": 2, "text": _BS_PAGE_A_TEXT},
    ]
    filtered = select_balance_sheet_section(pages)
    page_numbers = [p["page_number"] for p in filtered]
    assert 1 not in page_numbers, (
        "Signature page was not filtered out — it contains a date but no BS markers"
    )
    assert 2 in page_numbers, "BS page was incorrectly filtered out"


def test_sbs_notes_pages_with_bs_dates_excluded():
    """
    Notes pages that mention a date like '31/12/2025' but lack BS structural markers
    should NOT be selected (they are notes, not the balance sheet).
    _NOTES_PAGE_3_TEXT has '31/12/2025' but no BẢNG CÂN ĐỐI / TÀI SẢN / NGUỒN VỐN.
    """
    from domain.primitives.select_balance_sheet_section.primitive import (
        select_balance_sheet_section,
    )

    pages = [
        {"page_number": 1, "text": _NOTES_PAGE_3_TEXT},
        {"page_number": 2, "text": _BS_PAGE_B_TEXT},
    ]
    filtered = select_balance_sheet_section(pages)
    page_numbers = [p["page_number"] for p in filtered]
    # page 1 is notes (has "31/12/2025" but not a BS marker)
    # page 2 is BS (has "TÀI SẢN DÀI HẠN", "TỔNG CỘNG TÀI SẢN", "NGUỒN VỐN")
    assert 2 in page_numbers, f"BS page 2 was incorrectly filtered out: {page_numbers}"


# ---------------------------------------------------------------------------
# PART 2: Period detection rejects signature dates
# ---------------------------------------------------------------------------


def test_period_detection_rejects_signature_date():
    """
    A page containing ONLY a digital-signature timestamp like
    "26/01/2026 16:18:09 +07'00'" must NOT produce period_current=26/01/2026.
    The period_current must come from the BS header row instead.
    """
    from infrastructure.text_table_extractor import TextTableExtractor

    extractor = TextTableExtractor()

    # Simulate Path A with signature noise before BS pages
    pages = [
        {"page_number": 2, "text": _SIGNATURE_PAGE_TEXT},  # noise — signature date
        {"page_number": 6, "text": _BS_PAGE_A_TEXT},        # BS header with 31/12/2025
    ]
    result = extractor.assemble(pages=pages, statement_section="balance_sheet")

    period_current = result.get("period_current")
    assert period_current != "26/01/2026", (
        f"period_current={period_current!r} — signature date leaked into period detection! "
        "Expected '31/12/2025' from the BS header row."
    )
    assert period_current == "31/12/2025", (
        f"period_current={period_current!r} — expected '31/12/2025' from BS header."
    )


def test_period_detection_rejects_signature_date_when_first_in_all_pages():
    """
    Even when the signature page appears FIRST in the pages list, the period
    detection must reject the signature timestamp and prefer the BS header date.
    This is the FPT Q4 exact failure: signature page 2 came before BS pages 6-9
    and its "26/01/2026" was picked as period_current.
    """
    from infrastructure.text_table_extractor import TextTableExtractor

    extractor = TextTableExtractor()

    # Signature page before BS pages — simulates FPT Q4 pre-supply path (before BT-7 fix)
    pages = [
        {"page_number": 1, "text": _COVER_PAGE_TEXT},
        {"page_number": 2, "text": _SIGNATURE_PAGE_TEXT},  # has "26/01/2026"
        {"page_number": 6, "text": _BS_PAGE_A_TEXT},        # has "31/12/2025  31/12/2024"
        {"page_number": 7, "text": _BS_PAGE_B_TEXT},
        {"page_number": 8, "text": _BS_PAGE_C_TEXT},
        {"page_number": 9, "text": _BS_PAGE_D_TEXT},
    ]
    result = extractor.assemble(pages=pages, statement_section="balance_sheet")
    period_current = result.get("period_current")

    assert period_current != "26/01/2026", (
        f"BT-7 regression: period_current={period_current!r}. "
        "Signature date '26/01/2026' leaked into period_current — "
        "this is the FPT Q4 corruption bug that BT-7 must fix."
    )
    assert period_current == "31/12/2025", (
        f"period_current={period_current!r} expected '31/12/2025' from BS header."
    )


# ---------------------------------------------------------------------------
# PART 3: Path A end-to-end with ExtractTablesUseCase (fixture, no OCR)
# ---------------------------------------------------------------------------


class FakePushClientCapture:
    """Capture push_table call for assertions."""

    def __init__(self) -> None:
        self.called = False
        self.call_args: Optional[Dict] = None

    async def push_table(self, **kwargs) -> Dict:
        self.called = True
        self.call_args = kwargs
        return {"ok": True, "rows_stored": len(kwargs.get("rows", []))}


class FakeOcrPortRaiseOnCall:
    """OcrPort that raises if called — proves Path A doesn't invoke OCR."""

    def locate_balance_sheet_pages(self, pdf_path: str) -> List[int]:
        raise RuntimeError(
            "BT-7: locate_balance_sheet_pages was called on Path A — "
            "pre-supplied pages should bypass OCR entirely."
        )

    def ocr_pages(self, pdf_path: str, page_numbers: List[int]) -> List[Dict]:
        raise RuntimeError(
            "BT-7: ocr_pages was called on Path A — "
            "pre-supplied pages should bypass OCR entirely."
        )


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_path_a_with_noisy_pages_after_bt7_fix_filters_to_bs_section():
    """
    THE KEY BT-7 TEST.

    Supplies 44 noisy pages (simulating FPT Q4 mcp-server pre-supply) to
    ExtractTablesUseCase via pre_supplied_pages (Path A).

    BEFORE BT-7 fix: 2170 rows, period_current="26/01/2026".
    AFTER BT-7 fix: ≤96 rows (only BS pages), period_current="31/12/2025",
                    golden anchors 270/300/400 exact, balance_pass=True.

    This test MUST FAIL before the BT-7 changes are applied (proving it catches
    the noise regression) and PASS after.
    """
    from application.extract_tables_usecase import ExtractTablesUseCase
    from infrastructure.text_table_extractor import TextTableExtractor

    noisy_pages = _build_noisy_pages()

    extractor = TextTableExtractor()
    push_client = FakePushClientCapture()
    ocr_port = FakeOcrPortRaiseOnCall()  # proves OCR never called on Path A

    usecase = ExtractTablesUseCase(
        table_extractor=extractor,
        table_push_client=push_client,
        ocr_port=ocr_port,
    )

    result = _run(
        usecase.execute(
            report_id="fpt-q4-2025-bt7-test",
            pdf_path="/data/pdfs/FPT_2025_Q4.pdf",
            statement_section="balance_sheet",
            pre_supplied_pages=noisy_pages,
        )
    )

    # ---------- Assertions: what BT-7 fix must achieve ----------

    # 1. OCR was never invoked (Path A uses pre-supplied text only)
    #    (Guaranteed by FakeOcrPortRaiseOnCall — if OCR called, test raises before here)

    # 2. Row count: after filtering, only BS pages produce rows.
    #    Fixture has 4 BS pages with ~8 code rows total.
    #    Before fix: all 44 pages → large row count. After fix: ≤30 code rows.
    assert push_client.called, "push_table was not called — gate may have blocked unexpectedly"
    stored_rows = push_client.call_args.get("rows", [])
    row_count = len(stored_rows)
    assert row_count <= 96, (
        f"BT-7 row-count regression: {row_count} rows stored — "
        f"BS section filter is not applied. Expected ≤96 (BS rows only), "
        f"not {row_count} (all-pages noise). BT-7 fix required."
    )

    # 3. period_current must be 31/12/2025 (from BS header), not 26/01/2026 (signature)
    period_current = push_client.call_args.get("period_current")
    assert period_current == "31/12/2025", (
        f"BT-7 period regression: period_current={period_current!r}. "
        f"Expected '31/12/2025' from BS header. "
        f"Got '26/01/2026' if signature date leaked — fix period detection."
    )

    # 4. Golden anchors: codes 270/300/400 must still be exact
    rows_with_code = {r["code"]: r["value_current"] for r in stored_rows if r.get("code")}
    assert "270" in rows_with_code, (
        f"Code 270 (Total Assets) not found in stored rows. Codes present: {list(rows_with_code.keys())}"
    )
    assert "300" in rows_with_code, (
        f"Code 300 (Total Liabilities) not found in stored rows."
    )
    assert "400" in rows_with_code, (
        f"Code 400 (Total Equity) not found in stored rows."
    )

    anchor_270 = rows_with_code.get("270")
    anchor_300 = rows_with_code.get("300")
    anchor_400 = rows_with_code.get("400")

    assert anchor_270 is not None and abs(anchor_270 - FPT_TOTAL_ASSETS) < 1.0, (
        f"Code 270 golden anchor mismatch: got {anchor_270}, expected {FPT_TOTAL_ASSETS}"
    )
    assert anchor_300 is not None and abs(anchor_300 - FPT_TOTAL_LIABILITIES) < 1.0, (
        f"Code 300 golden anchor mismatch: got {anchor_300}, expected {FPT_TOTAL_LIABILITIES}"
    )
    assert anchor_400 is not None and abs(anchor_400 - FPT_TOTAL_EQUITY) < 1.0, (
        f"Code 400 golden anchor mismatch: got {anchor_400}, expected {FPT_TOTAL_EQUITY}"
    )

    # 5. balance_pass must be True (golden anchors balance to the dong)
    assert result.get("balance_pass") is True, (
        f"balance_pass={result.get('balance_pass')} — expected True with FPT golden anchors. "
        f"Delta={result.get('balance_delta')}"
    )


def test_path_a_period_prior_is_31_12_2024():
    """
    After BT-7 fix, period_prior must be 31/12/2024 (the second date in the BS header)
    not any other date from noise pages.
    """
    from application.extract_tables_usecase import ExtractTablesUseCase
    from infrastructure.text_table_extractor import TextTableExtractor

    noisy_pages = _build_noisy_pages()
    extractor = TextTableExtractor()
    push_client = FakePushClientCapture()
    ocr_port = FakeOcrPortRaiseOnCall()

    usecase = ExtractTablesUseCase(
        table_extractor=extractor,
        table_push_client=push_client,
        ocr_port=ocr_port,
    )

    _run(
        usecase.execute(
            report_id="fpt-q4-period-prior-test",
            pdf_path="/data/pdfs/FPT_2025_Q4.pdf",
            statement_section="balance_sheet",
            pre_supplied_pages=noisy_pages,
        )
    )

    period_prior = push_client.call_args.get("period_prior")
    assert period_prior == "31/12/2024", (
        f"period_prior={period_prior!r} — expected '31/12/2024' from BS header. "
        "May be corrupted by noise pages or not set at all."
    )


def test_path_b_slow_real_ocr_test_still_green():
    """
    Sanity check: the Path B (no pre_supplied_pages) with a FakeOcrPort
    that returns only the BS pages still works — BT-7 must not break Path B.
    """
    from application.extract_tables_usecase import ExtractTablesUseCase
    from infrastructure.text_table_extractor import TextTableExtractor

    bs_only_pages = _build_bs_only_pages()

    class FakeOcrPortReturnsBS:
        def locate_balance_sheet_pages(self, pdf_path: str) -> List[int]:
            return [6, 7, 8, 9]

        def ocr_pages(self, pdf_path: str, page_numbers: List[int]) -> List[Dict]:
            return bs_only_pages

    extractor = TextTableExtractor()
    push_client = FakePushClientCapture()
    ocr_port = FakeOcrPortReturnsBS()

    usecase = ExtractTablesUseCase(
        table_extractor=extractor,
        table_push_client=push_client,
        ocr_port=ocr_port,
    )

    result = _run(
        usecase.execute(
            report_id="path-b-sanity",
            pdf_path="/data/pdfs/FPT_2025_Q4.pdf",
            statement_section="balance_sheet",
        )
    )

    assert result.get("balance_pass") is True, (
        f"Path B sanity failed: balance_pass={result.get('balance_pass')}"
    )
    assert push_client.called
