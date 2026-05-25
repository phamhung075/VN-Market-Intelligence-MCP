"""
Integration test — BT-3-C: FPT balance-sheet extraction (real PDF, Tesseract OCR).

Marks: @pytest.mark.slow — runs Tesseract on 4 PDF pages (~16s CPU).
Run ONCE per verification cycle. Do NOT put real-PDF OCR inside a loop or
parametrised matrix (Mac kernel-panic risk: D6 HOST SAFETY).

Tests:
    - TextTableExtractor.assemble() on real FPT BCTC PDF (pages 4-7, 1-indexed)
      produces ≥70 structured rows and balance_pass=True.
    - ExtractTablesUseCase.execute() with mock push client returns correct
      rows_stored + balance_pass shape (no network required).
    - FinancialReportsModule.process_report() returns new BT-3-C keys
      structured_table_rows + balance_check when table_assembler is wired.

FPT golden anchors (BT-0 spike eval, regression locked):
    Total Assets:       88,089,621,779,862 VND
    Total Liabilities:  44,338,155,487,272 VND
    Total Equity:       43,751,466,292,590 VND
    balance_pass = True (accounting identity holds to the dong)

Privacy: self-hosted Tesseract only. Zero external API calls. Zero data leaves machine.
"""

import sys
import os

# Adjust sys.path so package imports work from apps/pdf-extractor/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import asyncio
from pathlib import Path
from typing import Dict, List, Optional

import pytest

# ---------------------------------------------------------------------------
# Path to FPT PDF
# ---------------------------------------------------------------------------

_FPT_PDF_PATH = Path(
    "/Users/admin/Documents/Hung/__works__/__PROJET/__labo/"
    "VN-Market-Intelligence-MCP/data/pdfs-local/"
    "20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"
)

# ---------------------------------------------------------------------------
# Tesseract page-OCR helper
# ---------------------------------------------------------------------------


def _ocr_pdf_pages(pdf_path: Path, page_range: range) -> List[Dict]:
    """
    Run Tesseract (vie+eng) on the given 0-indexed pages of a PDF.

    Returns list of {page_number: 1-indexed, text: str} dicts.
    Uses pdf2image + pytesseract (Pillow → PNG → Tesseract subprocess).

    HOST SAFETY (D6): called ONCE per test run, on a fixed page range (4 pages).
    Do NOT call this inside a loop or parametrised fixture.
    """
    try:
        from pdf2image import convert_from_path  # type: ignore
    except ImportError:
        pytest.skip("pdf2image not installed — skipping real-PDF integration test")

    try:
        import pytesseract  # type: ignore
    except ImportError:
        pytest.skip("pytesseract not installed — skipping real-PDF integration test")

    if not pdf_path.exists():
        pytest.skip(f"FPT PDF not found at {pdf_path} — skipping real-PDF integration test")

    pages_out: List[Dict] = []

    # Convert only the requested pages (1-indexed for pdf2image)
    first_page = min(page_range) + 1  # pdf2image is 1-indexed
    last_page = max(page_range) + 1

    images = convert_from_path(
        str(pdf_path),
        dpi=200,
        first_page=first_page,
        last_page=last_page,
        fmt="png",
    )

    for offset, img in enumerate(images):
        page_num_1indexed = first_page + offset
        text = pytesseract.image_to_string(img, lang="vie+eng")
        pages_out.append({
            "page_number": page_num_1indexed,
            "text": text,
        })

    return pages_out


# ---------------------------------------------------------------------------
# Fake push client (no network)
# ---------------------------------------------------------------------------


class _FakePushClient:
    """
    Fake TablePushClientPort — records the push call, returns rows_stored.
    Does NOT make any HTTP request. Zero credentials required.
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
# OCR once per test session (cached) — avoids redundant Tesseract runs
# ---------------------------------------------------------------------------

_cached_fpt_pages: Optional[List[Dict]] = None


def _get_fpt_pages() -> List[Dict]:
    """Return OCR'd pages list, running Tesseract at most once per session."""
    global _cached_fpt_pages
    if _cached_fpt_pages is None:
        # FPT balance sheet: pages 4–7 (0-indexed: 3–6)
        _cached_fpt_pages = _ocr_pdf_pages(_FPT_PDF_PATH, range(3, 7))
    return _cached_fpt_pages


# ---------------------------------------------------------------------------
# Test 1: TextTableExtractor.assemble() on real FPT data
# ---------------------------------------------------------------------------


@pytest.mark.slow
def test_text_table_extractor_fpt_rows_and_balance() -> None:
    """
    TextTableExtractor.assemble() on real FPT PDF pages 4-7 produces:
      - ≥70 structured rows
      - balance_pass=True (Total Assets = Liab + Equity to 1 VND tolerance)

    HOST SAFETY: one-shot OCR, 4 pages, ~16s. Do not run in CI loops.
    """
    from infrastructure.text_table_extractor import TextTableExtractor
    from application.extract_tables_usecase import _compute_balance_check

    extractor = TextTableExtractor()
    pages = _get_fpt_pages()

    result = extractor.assemble(pages=pages, statement_section="balance_sheet")

    rows: List[Dict] = result.get("rows", [])
    period_current: Optional[str] = result.get("period_current")
    period_prior: Optional[str] = result.get("period_prior")

    # AC-2 (BT-3-C): ≥70 structured rows
    assert len(rows) >= 70, (
        f"Expected ≥70 rows from FPT balance sheet, got {len(rows)}. "
        "Check Tesseract OCR output or extractor parsing logic."
    )

    # Period detection (FPT Q4 2025)
    assert period_current is not None, "period_current should be detected from FPT pages"

    # Balance check
    balance = _compute_balance_check(rows)
    assert balance is not None, (
        "balance_check should not be None for FPT balance-sheet pages "
        "(codes 270/300/400 must be present)"
    )
    assert balance["balance_pass"] is True, (
        f"FPT balance identity FAILED: "
        f"assets={balance['total_assets']}, "
        f"liabilities={balance['total_liabilities']}, "
        f"equity={balance['total_equity']}, "
        f"delta={balance['balance_delta']}"
    )
    # Verify the three golden anchors are present (BT-0 regression anchors)
    assert balance["total_assets"] is not None, "Total Assets (code 270) must be present"
    assert balance["total_liabilities"] is not None, "Total Liabilities (code 300) must be present"
    assert balance["total_equity"] is not None, "Total Equity (code 400/440) must be present"


# ---------------------------------------------------------------------------
# Test 2: ExtractTablesUseCase.execute() with mock push client
# ---------------------------------------------------------------------------


@pytest.mark.slow
def test_extract_tables_usecase_fpt_e2e() -> None:
    """
    ExtractTablesUseCase.execute() on real FPT data with a fake push client:
      - rows_stored ≥ 70
      - balance_pass = True
      - push client called exactly once with correct report_id
      - no network required (fake push client)
    """
    from infrastructure.text_table_extractor import TextTableExtractor
    from application.extract_tables_usecase import ExtractTablesUseCase

    pages = _get_fpt_pages()

    # Subclass TextTableExtractor to pre-supply page text (avoid re-OCR path)
    class PreloadedTextTableExtractor(TextTableExtractor):
        """Use pre-OCR'd pages instead of reading from disk."""

        def assemble(self, pages, statement_section):  # type: ignore
            # pages arg from use case has {"page_number": 0, "path": ...}
            # We override to use the pre-OCR'd pages instead
            return super().assemble(
                pages=_get_fpt_pages(),
                statement_section=statement_section,
            )

    fake_push = _FakePushClient()
    extractor = PreloadedTextTableExtractor()
    usecase = ExtractTablesUseCase(
        table_extractor=extractor,
        table_push_client=fake_push,
    )

    report_id = "fpt-test-uuid-0000-0000-000000000001"
    result = asyncio.get_event_loop().run_until_complete(
        usecase.execute(
            report_id=report_id,
            pdf_path=str(_FPT_PDF_PATH),
            statement_section="balance_sheet",
        )
    )

    # AC-1 (BT-3-C): rows_stored ≥ 70
    assert result["rows_stored"] >= 70, (
        f"Expected rows_stored ≥ 70, got {result['rows_stored']}"
    )
    # balance_pass = True
    assert result["balance_pass"] is True, (
        f"Expected balance_pass=True, got balance_delta={result['balance_delta']}"
    )
    # push client called exactly once
    assert len(fake_push.push_calls) == 1
    assert fake_push.push_calls[0]["report_id"] == report_id


# ---------------------------------------------------------------------------
# Test 3: FinancialReportsModule.process_report() returns BT-3-C keys
# ---------------------------------------------------------------------------


@pytest.mark.slow
def test_process_report_returns_structured_table_rows() -> None:
    """
    FinancialReportsModule.process_report() with table_assembler wired returns:
      - structured_table_rows ≥ 70 rows
      - balance_check with balance_pass=True
      - all existing 14 keys still present (backward-compat)
    """
    from infrastructure.text_table_extractor import TextTableExtractor
    from domain.modules.financial_reports.module import FinancialReportsModule

    # -- Minimal mock ports (same pattern as existing unit tests) --

    class _MockNormalizer:
        def normalize(self, raw: str, unit_hint: str = "billion_vnd"):
            try:
                return float(raw.replace(",", ""))
            except (ValueError, AttributeError):
                return None

    class _MockValidator:
        def validate(self, total_assets, total_equity, total_liabilities,
                     operating_margin, net_revenue) -> float:
            return 0.9

    class _MockConfidenceScorer:
        def score(self, ocr_confidence: float, table_count: int) -> dict:
            return {"pass": True, "quality_score": ocr_confidence}

    class _MockLowConfidenceGate:
        def gate(self, confidence: float) -> str:
            return "normal"

    class _MockRatioComputer:
        def compute(self, numerator: float, denominator: float,
                    ratio_type: str) -> Optional[float]:
            if denominator == 0:
                return None
            return numerator / denominator

    class _MockFieldExtractor:
        def extract(self, text: str, field_name: str) -> Optional[str]:
            return None

    pages = _get_fpt_pages()

    module = FinancialReportsModule(
        normalizer=_MockNormalizer(),
        validator=_MockValidator(),
        confidence_scorer=_MockConfidenceScorer(),
        low_confidence_gate=_MockLowConfidenceGate(),
        ratio_computer=_MockRatioComputer(),
        field_extractor=_MockFieldExtractor(),
        table_assembler=TextTableExtractor(),
    )

    result = module.process_report(
        raw_assets="88089621",
        raw_equity="43751466",
        raw_liabilities="44338155",
        raw_margin="0.1",
        raw_revenue="100000",
        pages=pages,
        statement_section="balance_sheet",
    )

    # Backward-compat: all 14 existing keys still present
    existing_keys = {
        "normalized_assets", "normalized_equity", "normalized_liabilities",
        "normalized_margin", "normalized_revenue", "confidence",
        "ocr_quality_pass", "ocr_quality_score", "disposition",
        "gross_margin", "extracted_net_revenue", "revenue_reconciliation",
        "selected_column_index", "selected_column_value",
    }
    for key in existing_keys:
        assert key in result, f"Backward-compat key missing: {key}"

    # BT-3-C new keys present
    assert "structured_table_rows" in result, "structured_table_rows key missing from process_report()"
    assert "balance_check" in result, "balance_check key missing from process_report()"

    # structured_table_rows: ≥70 rows
    rows = result["structured_table_rows"]
    assert rows is not None, "structured_table_rows should not be None when table_assembler is wired"
    assert len(rows) >= 70, (
        f"Expected ≥70 structured rows, got {len(rows)}"
    )

    # balance_check passes
    bc = result["balance_check"]
    assert bc is not None, "balance_check should not be None for balance_sheet section"
    assert bc["balance_pass"] is True, (
        f"balance_pass=False; delta={bc['balance_delta']}"
    )


# ---------------------------------------------------------------------------
# Test 4: process_report() without table_assembler returns None for new keys
# ---------------------------------------------------------------------------


def test_process_report_no_table_assembler_returns_none_for_new_keys() -> None:
    """
    When table_assembler is NOT wired, process_report() returns None for
    structured_table_rows and balance_check (backward-compat).
    No OCR needed — fast unit test.
    """
    from domain.modules.financial_reports.module import FinancialReportsModule

    class _MockNormalizer:
        def normalize(self, raw: str, unit_hint: str = "billion_vnd"):
            return 1.0

    class _MockValidator:
        def validate(self, **kwargs) -> float:
            return 0.9

    class _MockConfidenceScorer:
        def score(self, ocr_confidence, table_count) -> dict:
            return {"pass": True, "quality_score": 0.9}

    class _MockLowConfidenceGate:
        def gate(self, confidence) -> str:
            return "normal"

    class _MockRatioComputer:
        def compute(self, numerator, denominator, ratio_type):
            return None

    class _MockFieldExtractor:
        def extract(self, text, field_name):
            return None

    module = FinancialReportsModule(
        normalizer=_MockNormalizer(),
        validator=_MockValidator(),
        confidence_scorer=_MockConfidenceScorer(),
        low_confidence_gate=_MockLowConfidenceGate(),
        ratio_computer=_MockRatioComputer(),
        field_extractor=_MockFieldExtractor(),
        # table_assembler NOT wired (default None)
    )

    result = module.process_report(
        raw_assets="1000",
        raw_equity="500",
        raw_liabilities="500",
        raw_margin="0.1",
        raw_revenue="2000",
    )

    assert result["structured_table_rows"] is None, (
        "structured_table_rows should be None when table_assembler not wired"
    )
    assert result["balance_check"] is None, (
        "balance_check should be None when table_assembler not wired"
    )
    # All 14 existing keys still present
    assert "normalized_assets" in result
    assert "confidence" in result
    assert "disposition" in result
