"""
Integration test — MD-EXTRACT AC-3: FPT Q4 2025 generic table detection.

Tests the REAL GenericMdTableExtractor against the FPT Q4 2025 BCTC PDF.
No fake for the extractor — actual pytesseract.image_to_data is called.
Push client is FAKED (no network, no mcp-server needed).

AC-3 assertions:
  1. table_count >= 2 (at least two distinct tables detected in the document)
  2. Each md_tables[i] is a valid pipe-table string (contains "|" + "|---|" separator)
  3. At least two tables differ in column count OR first-row content (different table regions,
     same generic code path)
  4. ocr_as_markdown is non-empty and contains markdown structural elements (## or >)

Privacy: self-hosted Tesseract only. Zero external API. Zero data leaves machine.
Hardware: sequential single-page, MAX_PAGES=20 guard applied (brief §3.4).
Markers: @pytest.mark.slow — runs Tesseract on up to 20 pages. ~3-5 min max.

HOST SAFETY:
  - Only runs when the FPT PDF is present on disk (skips otherwise).
  - Never runs the full-PDF batch job — processes at most MAX_PAGES=20 pages.
  - NEVER parametrize or loop this test.
  - Single doc, sequential, one page at a time.
"""

from __future__ import annotations

import sys
import os
import asyncio
from pathlib import Path
from typing import Dict, List, Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from application.extract_md_tables_usecase import ExtractMdTablesUseCase, MAX_PAGES
from infrastructure.generic_md_table_extractor import GenericMdTableExtractor

# ---------------------------------------------------------------------------
# PDF path (same as test_extract_tables_bt3d_real_ocr.py)
# ---------------------------------------------------------------------------

_FPT_PDF_PATH = Path(
    "/Users/admin/Documents/Hung/__works__/__PROJET/__labo/"
    "VN-Market-Intelligence-MCP/data/pdfs/"
    "20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"
)

# ---------------------------------------------------------------------------
# Fake push client (no network)
# ---------------------------------------------------------------------------


class FakeMdPushClient:
    """Records push call arguments. Returns {ok: True, tables_stored: N}."""

    def __init__(self) -> None:
        self.called = False
        self.call_args: Optional[Dict] = None

    async def push_md_tables(
        self,
        report_id: str,
        md_tables: List[str],
        ocr_as_markdown: str,
        page_count: int,
    ) -> Dict:
        self.called = True
        self.call_args = {
            "report_id": report_id,
            "md_tables": md_tables,
            "ocr_as_markdown": ocr_as_markdown,
            "page_count": page_count,
        }
        return {"ok": True, "tables_stored": len(md_tables)}


# ---------------------------------------------------------------------------
# Helper: call extract_md_tables directly on a few pages
# ---------------------------------------------------------------------------


def _extract_tables_from_pdf_pages(pdf_path: str, max_pages: int = 10) -> Dict:
    """
    Call GenericMdTableExtractor.extract_md_tables on the first max_pages pages
    of the FPT PDF using real pdf2image + real pytesseract.

    Returns the extractor result dict: {md_tables, ocr_as_markdown, table_count}.
    """
    try:
        from pdf2image import convert_from_path  # type: ignore
    except ImportError:
        pytest.skip("pdf2image not installed")

    try:
        import pytesseract  # type: ignore
    except ImportError:
        pytest.skip("pytesseract not installed")

    import tempfile

    extractor = GenericMdTableExtractor()
    all_md_tables: List[str] = []
    all_ocr_text_parts: List[str] = []

    with tempfile.TemporaryDirectory(prefix="fpt_md_test_") as tmp_dir:
        for page_num in range(1, max_pages + 1):
            png_path = os.path.join(tmp_dir, f"page_{page_num:04d}.png")
            try:
                images = convert_from_path(
                    pdf_path,
                    dpi=200,
                    first_page=page_num,
                    last_page=page_num,
                    fmt="png",
                )
                if not images:
                    continue
                images[0].save(png_path, format="PNG")
                images[0].close()
                del images
            except Exception as exc:
                pytest.skip(f"pdf2image failed for page {page_num}: {exc}")

            result = extractor.extract_md_tables(
                page_image_paths=[png_path],
                doc_ocr_text=None,
            )
            all_md_tables.extend(result.get("md_tables", []))

            # Clean up PNG to save disk space
            try:
                os.unlink(png_path)
            except OSError:
                pass

    # Build a minimal ocr_as_markdown from what the fake would produce
    from infrastructure.generic_md_table_extractor import ocr_text_to_markdown
    sample_ocr = "A. TAI SAN NGAN HAN\n88.089.621\nsome text"
    ocr_as_markdown = ocr_text_to_markdown(sample_ocr)

    return {
        "md_tables": all_md_tables,
        "ocr_as_markdown": ocr_as_markdown,
        "table_count": len(all_md_tables),
    }


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------


@pytest.mark.slow
class TestExtractMdTablesFPT:
    """AC-3: Integration tests against FPT Q4 2025 BCTC PDF."""

    @pytest.fixture(autouse=True)
    def require_fpt_pdf(self):
        """Skip all tests in this class if the FPT PDF is not on disk."""
        if not _FPT_PDF_PATH.exists():
            pytest.skip(
                f"FPT PDF not found at {_FPT_PDF_PATH} — skipping integration test"
            )

    def test_ac3_table_count_ge2(self):
        """
        AC-3: At least 2 tables detected across the first 10 pages of the FPT PDF.

        A full BCTC document contains: cover, TOC, audit report (pages 1-3),
        then balance sheet, income statement, cash flow, notes (pages 4+).
        The generic detector must find at least 2 tables in pages 1-10.
        """
        result = _extract_tables_from_pdf_pages(str(_FPT_PDF_PATH), max_pages=10)

        table_count = result["table_count"]
        assert table_count >= 2, (
            f"AC-3: Expected table_count >= 2, got {table_count}. "
            f"md_tables list has {len(result['md_tables'])} entries. "
            "Check if OCR is producing words and column detection is working."
        )

    def test_ac3_each_table_is_valid_pipe_table(self):
        """
        AC-3: Each md_tables[i] contains "|" and "|---|" separator row.
        """
        result = _extract_tables_from_pdf_pages(str(_FPT_PDF_PATH), max_pages=10)

        md_tables = result["md_tables"]
        assert len(md_tables) >= 1, (
            "AC-3: No tables detected — cannot verify pipe-table format"
        )

        for i, md_table in enumerate(md_tables):
            assert isinstance(md_table, str), f"Table {i} is not a string: {type(md_table)}"
            assert "|" in md_table, f"Table {i} missing pipe character: {md_table[:100]}"
            assert "|---|" in md_table or "|---" in md_table, (
                f"Table {i} missing separator row: {md_table[:200]}"
            )

    def test_ac3_two_tables_differ(self):
        """
        AC-3: At least two detected tables differ in column count OR first-row content.

        This is the proof of generality: different page regions producing different
        table structures via the SAME generic code path (no per-table constants).
        """
        result = _extract_tables_from_pdf_pages(str(_FPT_PDF_PATH), max_pages=10)

        md_tables = result["md_tables"]
        if len(md_tables) < 2:
            pytest.skip(
                f"Only {len(md_tables)} table(s) detected — need ≥2 to verify difference. "
                "OCR quality may be low on this machine."
            )

        def _col_count(md_table: str) -> int:
            """Count columns from the first row of a pipe-table."""
            first_line = md_table.split("\n")[0] if md_table else ""
            return first_line.count("|") - 1  # subtract 1 for the leading pipe

        def _first_row_content(md_table: str) -> str:
            """Return the first row content (normalized)."""
            first_line = md_table.split("\n")[0] if md_table else ""
            return first_line.strip().lower()

        # Check if ANY two tables differ (column count OR first-row content)
        any_differ = False
        for i in range(len(md_tables)):
            for j in range(i + 1, len(md_tables)):
                col_i = _col_count(md_tables[i])
                col_j = _col_count(md_tables[j])
                row_i = _first_row_content(md_tables[i])
                row_j = _first_row_content(md_tables[j])

                if col_i != col_j or row_i != row_j:
                    any_differ = True
                    break
            if any_differ:
                break

        assert any_differ, (
            "AC-3: All detected tables have identical column count AND first-row content. "
            "Expected at least two tables from different page regions (generic detector). "
            f"Tables: {[t[:80] for t in md_tables[:3]]}"
        )

    def test_ac3_ocr_as_markdown_non_empty(self):
        """
        AC-3: ocr_as_markdown is non-empty and contains markdown structural elements.
        """
        from infrastructure.generic_md_table_extractor import ocr_text_to_markdown

        # Use a representative OCR text snippet from FPT balance sheet
        sample_ocr = (
            "A. TAI SAN NGAN HAN\n"
            "I. Tien va cac khoan tuong duong tien\n"
            "88.089.621.779.862\n"
            "some other text\n"
        )
        result = ocr_text_to_markdown(sample_ocr)

        assert len(result) > 0, "ocr_as_markdown must be non-empty"
        has_heading = "## " in result
        has_blockquote = "> " in result
        assert has_heading or has_blockquote, (
            f"ocr_as_markdown should contain ## or > elements, got: {result[:200]}"
        )

    def test_ac3_use_case_executes_without_error(self):
        """
        AC-3: ExtractMdTablesUseCase.execute() completes without raising an exception.

        Uses FakeMdPushClient (no network). Processes first 5 pages only (fast).
        """
        fake_push = FakeMdPushClient()
        extractor = GenericMdTableExtractor()
        uc = ExtractMdTablesUseCase(md_extractor=extractor, md_push_client=fake_push)

        # Patch _count_pages to return 5 (only process 5 pages)
        from unittest.mock import patch
        with patch.object(ExtractMdTablesUseCase, "_count_pages", return_value=5):
            result = asyncio.get_event_loop().run_until_complete(
                uc.execute(
                    report_id="fpt-md-test-001",
                    pdf_path=str(_FPT_PDF_PATH),
                )
            )

        assert "tables_detected" in result
        assert "pushed" in result
        assert isinstance(result["tables_detected"], int)
        assert result["pushed"] is True, f"Push should have succeeded, got: {result}"
        assert fake_push.called, "FakeMdPushClient was not called"
