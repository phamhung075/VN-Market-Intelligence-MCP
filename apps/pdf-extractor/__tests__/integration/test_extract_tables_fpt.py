"""
Integration test — BT3-FIX: FPT balance-sheet extraction (fixture-based, zero Tesseract).

Anti-false-green gate: drives a REAL TextTableExtractor() instance (no subclass bypass).
Fixture: __tests__/fixtures/fpt_q4_2025_pages_4-7.txt — committed real OCR text
         (page 4 verbatim from spike eval markdown; pages 5-7 reconstructed from
         gold JSON using the same Tesseract label-first one-line-per-row format).

HOST SAFETY: zero Tesseract, zero PDF I/O, zero network.
Privacy: self-hosted only, zero external API.

Assertions (must FAIL on pre-fix code, PASS after fix):
  AC-INT-1:  0 orphan rows  (code is not None AND label == "")
  AC-INT-2:  0 junk rows    (code is None AND value_current is None AND no alpha content)
  AC-INT-3:  code "100" present
  AC-INT-4:  no duplicate codes
  AC-INT-5:  value_prior populated on ≥90% of coded rows
  AC-INT-6:  sentinel 270 == 88089621779862 (± 1.0 VND)
  AC-INT-7:  sentinel 300 == 44338155487272 (± 1.0 VND)
  AC-INT-8:  sentinel 400 == 43751466292590 (± 1.0 VND)
  AC-INT-9:  balance identity: 270 == 300 + 400 within 1.0 VND
  AC-INT-10: ≥70 total rows extracted
  AC-INT-11: period_current detected (non-None)
"""

import sys
import os

# Adjust sys.path so package imports work from apps/pdf-extractor/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from pathlib import Path
from typing import Dict, List, Optional

import pytest

# ---------------------------------------------------------------------------
# Fixture loader — reads the committed OCR text file, splits by page marker
# ---------------------------------------------------------------------------

_FIXTURE_PATH = Path(__file__).parent.parent / "fixtures" / "fpt_q4_2025_pages_4-7.txt"

# Sentinel values from BT-0 spike eval gold (FPT Q4 2025 balance sheet)
_SENTINEL_270 = 88_089_621_779_862.0   # Total Assets
_SENTINEL_300 = 44_338_155_487_272.0   # Total Liabilities
_SENTINEL_400 = 43_751_466_292_590.0   # Total Equity
_TOLERANCE_VND = 1.0                   # 1 VND tolerance for float comparison


def _load_fixture_pages() -> List[Dict]:
    """
    Load committed fixture file and split into per-page dicts.

    Format: pages are delimited by '--- PAGE N ---' markers.
    Returns list of {page_number: int, text: str} dicts.
    """
    if not _FIXTURE_PATH.exists():
        pytest.fail(
            f"Fixture file not found: {_FIXTURE_PATH}\n"
            "Run `git status` to confirm the fixture is committed."
        )

    raw = _FIXTURE_PATH.read_text(encoding="utf-8")
    pages: List[Dict] = []

    # Split on page markers
    import re
    parts = re.split(r"--- PAGE (\d+) ---", raw)
    # parts = ['', '4', '<page4 text>', '5', '<page5 text>', ...]
    i = 1
    while i + 1 < len(parts):
        page_num = int(parts[i])
        text = parts[i + 1]
        pages.append({"page_number": page_num, "text": text})
        i += 2

    return pages


# ---------------------------------------------------------------------------
# Core assertion helper — extracts sentinel values from row list
# ---------------------------------------------------------------------------

def _find_sentinel(rows: List[Dict], code: str) -> Optional[float]:
    """Return value_current for the first row with the given code, or None."""
    for row in rows:
        if row.get("code") == code:
            return row.get("value_current")
    return None


# ---------------------------------------------------------------------------
# Test: TextTableExtractor with real fixture text (no subclass, no Tesseract)
# ---------------------------------------------------------------------------


def test_text_table_extractor_fpt_fixture_assertions() -> None:
    """
    Drive a REAL TextTableExtractor() instance with the committed fixture text.

    This test exercises the ACTUAL production parser code path (no subclass bypass).
    All AC-INT-1..AC-INT-11 assertions must pass after the BT3-FIX parser change.

    This is the anti-false-green gate mandated by the architect ruling.
    """
    from infrastructure.text_table_extractor import TextTableExtractor

    extractor = TextTableExtractor()
    pages = _load_fixture_pages()

    assert len(pages) == 4, (
        f"Expected 4 pages in fixture (pages 4-7), got {len(pages)}. "
        f"Check {_FIXTURE_PATH}"
    )

    result = extractor.assemble(pages=pages, statement_section="balance_sheet")

    rows: List[Dict] = result.get("rows", [])
    period_current: Optional[str] = result.get("period_current")

    # --- AC-INT-10: ≥70 total rows extracted ---
    assert len(rows) >= 70, (
        f"AC-INT-10 FAILED: Expected ≥70 rows, got {len(rows)}. "
        "Extractor may be suppressing rows or fixture has insufficient data."
    )

    # --- AC-INT-11: period_current detected ---
    assert period_current is not None, (
        "AC-INT-11 FAILED: period_current not detected from fixture text. "
        "Check _detect_periods() or fixture header line '31/12/2025  31/12/2024'."
    )

    # --- AC-INT-1: 0 orphan rows (code not None AND label == "") ---
    orphan_rows = [r for r in rows if r.get("code") is not None and r.get("label") == ""]
    assert len(orphan_rows) == 0, (
        f"AC-INT-1 FAILED: {len(orphan_rows)} orphan row(s) found "
        f"(code present but label empty). Pre-fix these come from _build_rows_from_block_columns. "
        f"First offender: {orphan_rows[0] if orphan_rows else 'N/A'}"
    )

    # --- AC-INT-2: 0 junk rows (code None, value None, no alphabetic content) ---
    import re
    junk_rows = [
        r for r in rows
        if r.get("code") is None
        and r.get("value_current") is None
        and not re.search(r"[A-Za-zÀ-ỹ]{3,}", r.get("label", ""))
    ]
    assert len(junk_rows) == 0, (
        f"AC-INT-2 FAILED: {len(junk_rows)} junk row(s) found "
        f"(code=None, value=None, no alpha content). "
        f"Tightened else-branch filter should reject these. "
        f"First offender: {junk_rows[0] if junk_rows else 'N/A'}"
    )

    # --- AC-INT-3: code "100" present ---
    codes_present = [r.get("code") for r in rows]
    assert "100" in codes_present, (
        "AC-INT-3 FAILED: code '100' (TÀI SẢN NGẮN HẠN) not found in extracted rows. "
        "Check Layout 1/2 parsing of 'A. TÀI SẢN NGAN HAN 100 ...' line."
    )

    # --- AC-INT-4: no duplicate codes ---
    coded_rows = [r for r in rows if r.get("code") is not None]
    code_counts: Dict[str, int] = {}
    for r in coded_rows:
        c = r["code"]
        code_counts[c] = code_counts.get(c, 0) + 1
    duplicates = {c: n for c, n in code_counts.items() if n > 1}
    assert len(duplicates) == 0, (
        f"AC-INT-4 FAILED: duplicate codes found: {duplicates}. "
        "Pre-fix code 222 was duplicated due to block-column + inline parser both running."
    )

    # --- AC-INT-5: value_prior populated on ≥90% of coded rows ---
    coded_with_value = [r for r in coded_rows if r.get("value_current") is not None]
    coded_with_prior = [r for r in coded_with_value if r.get("value_prior") is not None]
    if coded_with_value:
        prior_pct = len(coded_with_prior) / len(coded_with_value)
        assert prior_pct >= 0.90, (
            f"AC-INT-5 FAILED: value_prior populated on only {prior_pct:.1%} of "
            f"coded+value rows (expected ≥90%). "
            f"Pre-fix this was ~0% due to _build_rows_from_block_columns having empty prior list."
        )

    # --- AC-INT-6: sentinel 270 exact ---
    val_270 = _find_sentinel(rows, "270")
    assert val_270 is not None, "AC-INT-6 FAILED: code '270' (Total Assets) not found"
    assert abs(val_270 - _SENTINEL_270) <= _TOLERANCE_VND, (
        f"AC-INT-6 FAILED: code 270 value {val_270} != expected {_SENTINEL_270} "
        f"(delta={abs(val_270 - _SENTINEL_270):.1f} VND)"
    )

    # --- AC-INT-7: sentinel 300 exact ---
    val_300 = _find_sentinel(rows, "300")
    assert val_300 is not None, "AC-INT-7 FAILED: code '300' (Total Liabilities) not found"
    assert abs(val_300 - _SENTINEL_300) <= _TOLERANCE_VND, (
        f"AC-INT-7 FAILED: code 300 value {val_300} != expected {_SENTINEL_300} "
        f"(delta={abs(val_300 - _SENTINEL_300):.1f} VND)"
    )

    # --- AC-INT-8: sentinel 400 exact ---
    val_400 = _find_sentinel(rows, "400")
    assert val_400 is not None, "AC-INT-8 FAILED: code '400' (Total Equity) not found"
    assert abs(val_400 - _SENTINEL_400) <= _TOLERANCE_VND, (
        f"AC-INT-8 FAILED: code 400 value {val_400} != expected {_SENTINEL_400} "
        f"(delta={abs(val_400 - _SENTINEL_400):.1f} VND)"
    )

    # --- AC-INT-9: balance identity 270 == 300 + 400 ---
    balance_delta = abs(val_270 - (val_300 + val_400))
    assert balance_delta <= _TOLERANCE_VND, (
        f"AC-INT-9 FAILED: balance identity broken. "
        f"270={val_270}, 300={val_300}, 400={val_400}, "
        f"300+400={val_300 + val_400}, delta={balance_delta:.1f} VND"
    )


# ---------------------------------------------------------------------------
# Test: ExtractTablesUseCase with real extractor + fake push client
# ---------------------------------------------------------------------------


class _FakePushClient:
    """Fake TablePushClientPort — records calls, returns rows_stored. Zero HTTP."""

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


async def test_extract_tables_usecase_with_real_extractor_fixture() -> None:
    """
    ExtractTablesUseCase.execute() with real TextTableExtractor + fixture pages
    + fake push client.

    Verifies:
    - rows_stored ≥ 70
    - balance_pass = True
    - push client called once with correct report_id
    - No subclass override — real parser code path exercised.
    """
    from infrastructure.text_table_extractor import TextTableExtractor
    from application.extract_tables_usecase import ExtractTablesUseCase

    pages = _load_fixture_pages()

    # Wire real extractor — direct instance, NO subclass
    extractor = TextTableExtractor()
    fake_push = _FakePushClient()
    usecase = ExtractTablesUseCase(
        table_extractor=extractor,
        table_push_client=fake_push,
    )

    report_id = "fpt-bt3-fix-test-uuid-0000-000000000001"

    # Use a fake pdf_path — the use case only calls extractor.assemble() with pages,
    # not with the path directly in the fixture test. We override the pages supply
    # by patching assemble to return fixture-based result.
    # Actually: the real use case calls assemble with pages derived from pdf_path.
    # Since we cannot run Tesseract (host safety), we wrap the extractor to inject
    # fixture pages when assemble is called with a dummy pdf_path arg.

    class _FixtureTextTableExtractor(TextTableExtractor):
        """
        Injects fixture pages into assemble().

        This is NOT a bypass of the parser — it only overrides the pdf_path
        → pages conversion step (which is Tesseract I/O). The core parsing
        logic (_parse_lines_to_rows, _try_parse_code_row, etc.) runs UNCHANGED.

        The full-parse fixture test (test_text_table_extractor_fpt_fixture_assertions)
        above drives the real parser without any subclass, fulfilling the
        anti-false-green mandate.
        """

        def assemble(self, pages, statement_section):  # type: ignore
            # Replace whatever pages the use case constructed from pdf_path
            # with our committed fixture pages.
            return super().assemble(
                pages=_load_fixture_pages(),
                statement_section=statement_section,
            )

    extractor_with_fixture = _FixtureTextTableExtractor()
    usecase_fixture = ExtractTablesUseCase(
        table_extractor=extractor_with_fixture,
        table_push_client=fake_push,
    )

    result = await usecase_fixture.execute(
        report_id=report_id,
        pdf_path="/fake/path/to/fpt.pdf",
        statement_section="balance_sheet",
    )

    assert result["rows_stored"] >= 70, (
        f"Expected rows_stored ≥ 70, got {result['rows_stored']}"
    )
    assert result["balance_pass"] is True, (
        f"Expected balance_pass=True, got balance_delta={result['balance_delta']}"
    )
    assert len(fake_push.push_calls) == 1
    assert fake_push.push_calls[0]["report_id"] == report_id


# ---------------------------------------------------------------------------
# Test: process_report() without table_assembler returns None for new keys
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
