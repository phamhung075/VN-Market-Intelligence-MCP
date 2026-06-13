"""
Integration test — BT-3-D: Real production OCR path via /extract-tables.

This test PROVES the gap diagnosed in BT-3-D:
  - BT-3-C gave a FALSE-GREEN by pre-supplying OCR text to the assembler
  - The real production path (ExtractTablesUseCase.execute()) never called Tesseract
  - After BT-3-D fix, OCR is wired into the use case via OcrPort injection

Marks: @pytest.mark.slow — runs Tesseract on located balance-sheet pages of the
       FPT PDF (~16–25s CPU, 4 pages). Do NOT run in CI loops.

HOST SAFETY (D6 — 16GB Mac kernel-panic risk):
  - Only the auto-located balance-sheet section pages are OCR'd (NOT the whole PDF).
  - Tesseract is called sequentially, one page at a time, with no batching.
  - DO NOT parametrize or loop this test.
  - DO NOT add more slow real-OCR tests without explicit PO approval.

FPT golden anchors (BT-0 spike eval, regression locked):
    Code 270 = Total Assets:       88,089,621,779,862 VND  (= balance_pass reference)
    Code 300 = Total Liabilities:  44,338,155,487,272 VND
    Code 400 = Total Equity:       43,751,466,292,590 VND
    balance_pass = True, delta = 0.0 (identity holds to the dong)

Privacy: self-hosted Tesseract only. Zero external API calls. Zero data leaves machine.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


from pathlib import Path
from typing import Dict, List, Optional

import pytest

# ---------------------------------------------------------------------------
# Path to FPT PDF
# ---------------------------------------------------------------------------

_FPT_PDF_PATH = Path(
    "/Users/admin/Documents/Hung/__works__/__PROJET/__labo/"
    "VN-Market-Intelligence-MCP/data/pdfs/"
    "20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"
)

# ---------------------------------------------------------------------------
# Fake push client (no network)
# ---------------------------------------------------------------------------


class _FakePushClient:
    """
    Fake TablePushClientPort — records push call, returns rows_stored.
    Zero credentials, zero network required.
    """

    def __init__(self) -> None:
        self.push_calls: List[Dict] = []

    async def push_table(
        self,
        report_id: str,
        statement_section: str,
        rows: List[Dict],
        balance_check: Optional[Dict],
        period_current: str,
        period_prior: Optional[str],
    ) -> Dict:
        self.push_calls.append({
            "report_id": report_id,
            "statement_section": statement_section,
            "rows": rows,
            "balance_check": balance_check,
            "period_current": period_current,
            "period_prior": period_prior,
        })
        return {"ok": True, "rows_stored": len(rows)}


# ---------------------------------------------------------------------------
# BT-3-D: The real production path test
# ---------------------------------------------------------------------------

@pytest.mark.slow
async def test_extract_tables_usecase_real_ocr_path() -> None:
    """
    BT-3-D REAL OCR PATH TEST.

    Exercises the ACTUAL production wiring:
      - ExtractTablesUseCase.execute() with pdf_path only (no pre-supplied pages/text)
      - OcrPort (PdfOcrAdapter) called by the use case to OCR the balance-sheet pages
      - Auto-locate: balance-sheet section found via Vietnamese markers
      - TextTableExtractor.assemble() receives real OCR text (not pre-supplied)

    BEFORE fix (BT-3-D gap):
      - execute() builds pages=[{"page_number": 0, "path": pdf_path}], no "text" key
      - assemble() gets page.get("text", "") = "" for every page → 0 rows
      - Returns {rows_stored: 0, balance_pass: False}  ← FAIL

    AFTER fix (BT-3-D):
      - execute() calls OcrPort to OCR located balance-sheet pages → pages have "text"
      - assemble() parses real OCR text → ≥80 rows
      - balance_pass=True, golden anchors code 270/300/400 present  ← PASS

    Golden anchors:
      Code 270 (Total Assets):      88,089,621,779,862 VND
      Code 300 (Total Liabilities): 44,338,155,487,272 VND
      Code 400 (Total Equity):      43,751,466,292,590 VND
      balance_pass = True
    """
    if not _FPT_PDF_PATH.exists():
        pytest.skip(f"FPT PDF not found at {_FPT_PDF_PATH} — skipping real-OCR test")

    # Check required libraries
    try:
        import pdf2image  # noqa: F401
    except ImportError:
        pytest.skip("pdf2image not installed — skipping real-OCR test")
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        pytest.skip("pytesseract not installed — skipping real-OCR test")

    from infrastructure.text_table_extractor import TextTableExtractor
    from infrastructure.ocr_adapter import PdfOcrAdapter
    from application.extract_tables_usecase import ExtractTablesUseCase

    # Inject real OcrPort + real TextTableExtractor + fake push client
    ocr_adapter = PdfOcrAdapter()
    table_extractor = TextTableExtractor()
    fake_push = _FakePushClient()

    usecase = ExtractTablesUseCase(
        table_extractor=table_extractor,
        table_push_client=fake_push,
        ocr_port=ocr_adapter,  # BT-3-D: real OCR injected
    )

    report_id = "bt3d-fpt-real-ocr-test-uuid-0001"

    result = await usecase.execute(
        report_id=report_id,
        pdf_path=str(_FPT_PDF_PATH),
        statement_section="balance_sheet",
    )

    # ---- Assertions ----

    # BT-3-D AC core: the real OCR path must yield rows (NOT 0)
    assert result["rows_stored"] >= 80, (
        f"BT-3-D FAIL: real OCR path returned rows_stored={result['rows_stored']} "
        f"(expected ≥80). This proves OCR was never called (still the bug) or "
        f"the balance-sheet pages were not located correctly."
    )

    # Balance identity must hold (FPT BS identity = the dong)
    assert result["balance_pass"] is True, (
        f"BT-3-D FAIL: balance_pass=False, delta={result['balance_delta']}. "
        f"Check OCR quality and VN number parsing."
    )

    # Push was called exactly once with correct report_id
    assert len(fake_push.push_calls) == 1, (
        f"Expected 1 push call, got {len(fake_push.push_calls)}"
    )
    assert fake_push.push_calls[0]["report_id"] == report_id

    # Golden anchor verification — codes 270, 300, 400 must be present and correct
    pushed_rows = fake_push.push_calls[0]["rows"]
    code_to_value = {
        row["code"]: row["value_current"]
        for row in pushed_rows
        if row.get("code") in ("270", "300", "400")
    }

    # Golden anchors (VND, exact to float precision)
    GOLDEN_270 = 88_089_621_779_862.0
    GOLDEN_300 = 44_338_155_487_272.0
    GOLDEN_400 = 43_751_466_292_590.0
    TOLERANCE = 1.0  # 1 VND absolute tolerance for float rounding

    assert "270" in code_to_value, (
        f"Code 270 (Total Assets) not found in extracted rows. "
        f"Codes found: {sorted(set(r['code'] for r in pushed_rows if r['code']))}"
    )
    assert "300" in code_to_value, "Code 300 (Total Liabilities) not found in extracted rows."
    assert "400" in code_to_value, "Code 400 (Total Equity) not found in extracted rows."

    assert abs(code_to_value["270"] - GOLDEN_270) <= TOLERANCE, (
        f"Code 270 golden anchor FAIL: got {code_to_value['270']}, expected {GOLDEN_270}"
    )
    assert abs(code_to_value["300"] - GOLDEN_300) <= TOLERANCE, (
        f"Code 300 golden anchor FAIL: got {code_to_value['300']}, expected {GOLDEN_300}"
    )
    assert abs(code_to_value["400"] - GOLDEN_400) <= TOLERANCE, (
        f"Code 400 golden anchor FAIL: got {code_to_value['400']}, expected {GOLDEN_400}"
    )
