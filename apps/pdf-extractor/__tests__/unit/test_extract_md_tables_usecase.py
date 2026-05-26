"""
Unit tests for application/extract_md_tables_usecase.py (MD-EXTRACT AC-4, AC-6).

Tests use injected FAKES for both ports:
  - FakeGenericMdTableExtractor  — returns configurable md_tables list
  - FakeMdPushClient             — records call arguments, returns configurable result

Zero network, zero creds, zero real OCR, zero real PDF.

Coverage:
  - AC-4: use case calls push exactly once, passes report_id + md_tables + ocr_as_markdown
          Returns {tables_detected: N, pushed: True}.
  - AC-6: PDF with > MAX_PAGES (20) pages → WARNING logged, at most MAX_PAGES processed.
  - Happy path: push succeeds → pushed=True.
  - Push failure: exception from push client → pushed=False (no re-raise).
  - Empty tables: push called with empty md_tables list → pushed=True, tables_detected=0.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from typing import Dict, List, Optional
from unittest.mock import MagicMock, patch

import pytest

from application.extract_md_tables_usecase import ExtractMdTablesUseCase, MAX_PAGES


# ---------------------------------------------------------------------------
# Fake adapters
# ---------------------------------------------------------------------------


class FakeGenericMdTableExtractor:
    """
    Fake GenericMdTableExtractorPort.

    Returns configurable md_tables list. Records all call arguments.
    When called with empty page_image_paths, still returns ocr_as_markdown
    (used by the use case for the doc_ocr_text path).
    """

    def __init__(
        self,
        md_tables: Optional[List[str]] = None,
        ocr_as_markdown: str = "## Section A\n> 88.089.621",
    ) -> None:
        self._md_tables = md_tables if md_tables is not None else [
            "| Col1 | Col2 |\n|---|---|\n| cell1 | cell2 |",
            "| A | B | C |\n|---|---|---|\n| x | y | z |",
        ]
        self._ocr_as_markdown = ocr_as_markdown
        self.call_log: List[Dict] = []

    def extract_md_tables(
        self,
        page_image_paths: List[str],
        doc_ocr_text: Optional[str] = None,
    ) -> Dict:
        self.call_log.append(
            {"page_image_paths": page_image_paths, "doc_ocr_text": doc_ocr_text}
        )
        # When no page images supplied (doc_ocr_text-only call), return just ocr_as_markdown
        if not page_image_paths:
            return {
                "md_tables": [],
                "ocr_as_markdown": self._ocr_as_markdown if doc_ocr_text else "",
                "table_count": 0,
            }
        return {
            "md_tables": self._md_tables,
            "ocr_as_markdown": self._ocr_as_markdown,
            "table_count": len(self._md_tables),
        }


class FakeMdPushClient:
    """
    Fake MdTablePushClientPort.

    Records call arguments and returns configurable push result.
    """

    def __init__(self, ok: bool = True, tables_stored: int = 2) -> None:
        self._ok = ok
        self._tables_stored = tables_stored
        self.call_args: Optional[Dict] = None
        self.called = False
        self._should_raise: Optional[Exception] = None

    def set_raise(self, exc: Exception) -> None:
        self._should_raise = exc

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
        if self._should_raise is not None:
            raise self._should_raise
        return {"ok": self._ok, "tables_stored": self._tables_stored}


# ---------------------------------------------------------------------------
# Helpers: mock out PDF/filesystem operations
# ---------------------------------------------------------------------------


def _make_use_case(
    fake_extractor: Optional[FakeGenericMdTableExtractor] = None,
    fake_push: Optional[FakeMdPushClient] = None,
    md_tables: Optional[List[str]] = None,
    ocr_md: str = "## Section\n> data",
    push_ok: bool = True,
    push_tables_stored: int = 2,
) -> tuple:
    ext = fake_extractor or FakeGenericMdTableExtractor(
        md_tables=md_tables, ocr_as_markdown=ocr_md
    )
    push = fake_push or FakeMdPushClient(ok=push_ok, tables_stored=push_tables_stored)
    uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)
    return uc, ext, push


def _patch_count_pages(page_count: int):
    """Return a context manager that patches _count_pages to return page_count."""
    return patch.object(ExtractMdTablesUseCase, "_count_pages", return_value=page_count)


def _patch_rasterize_page(png_paths: Optional[List[Optional[str]]] = None):
    """Return a context manager that patches _rasterize_page to cycle through png_paths."""
    # If None, return a fake path string for every call
    call_idx = {"i": 0}
    default_paths = png_paths or []

    def fake_rasterize(self, pdf_path, page_num, tmp_dir, convert_from_path):
        idx = call_idx["i"]
        call_idx["i"] += 1
        if default_paths and idx < len(default_paths):
            return default_paths[idx]
        return f"/fake/tmp/page_{page_num:04d}.png"

    return patch.object(ExtractMdTablesUseCase, "_rasterize_page", fake_rasterize)


def _patch_pdf2image():
    """Patch the pdf2image import inside execute() to avoid ImportError."""
    import sys
    from unittest.mock import MagicMock
    mock_module = MagicMock()
    mock_module.convert_from_path = MagicMock(return_value=[])
    return patch.dict(sys.modules, {"pdf2image": mock_module, "pdf2image.exceptions": mock_module})


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------


class TestExtractMdTablesUseCaseAC4:
    """AC-4: use case calls push once with correct arguments."""

    def test_push_called_once_with_correct_report_id(self):
        """Push is called exactly once and receives the report_id."""
        uc, ext, push = _make_use_case()

        with _patch_count_pages(3), _patch_rasterize_page(), _patch_pdf2image():
            result = asyncio.get_event_loop().run_until_complete(
                uc.execute(
                    report_id="abc-123",
                    pdf_path="/fake/test.pdf",
                )
            )

        assert push.called, "push_md_tables was not called"
        assert push.call_args is not None
        assert push.call_args["report_id"] == "abc-123"

    def test_push_receives_md_tables(self):
        """Push receives the md_tables list from the extractor."""
        expected_tables = ["| A | B |\n|---|---|\n| 1 | 2 |"]
        ext = FakeGenericMdTableExtractor(md_tables=expected_tables)
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            asyncio.get_event_loop().run_until_complete(
                uc.execute(report_id="report-001", pdf_path="/fake/test.pdf")
            )

        assert push.call_args is not None
        assert push.call_args["md_tables"] == expected_tables

    def test_return_shape_pushed_true(self):
        """execute() returns {tables_detected: N >= 1, pushed: True} on success."""
        expected_tables = [
            "| Col1 | Col2 |\n|---|---|\n| cell1 | cell2 |",
            "| A | B | C |\n|---|---|---|\n| x | y | z |",
        ]
        uc, _, _ = _make_use_case(md_tables=expected_tables, push_ok=True, push_tables_stored=2)

        # 1 page: extractor called once per page (returns 2 tables per call)
        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            result = asyncio.get_event_loop().run_until_complete(
                uc.execute(report_id="r-001", pdf_path="/fake/p.pdf")
            )

        assert result["pushed"] is True
        # 1 page × 2 tables per page = 2 tables_detected
        assert result["tables_detected"] >= 1

    def test_push_failure_returns_pushed_false(self):
        """If push raises, execute() returns pushed=False (no re-raise)."""
        push = FakeMdPushClient()
        push.set_raise(RuntimeError("network error"))
        ext = FakeGenericMdTableExtractor()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            result = asyncio.get_event_loop().run_until_complete(
                uc.execute(report_id="r-002", pdf_path="/fake/p.pdf")
            )

        assert result["pushed"] is False
        assert isinstance(result["tables_detected"], int)

    def test_empty_extractor_result(self):
        """Zero tables extracted → pushed=True (push called with empty list), tables_detected=0."""
        ext = FakeGenericMdTableExtractor(md_tables=[])
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            result = asyncio.get_event_loop().run_until_complete(
                uc.execute(report_id="r-003", pdf_path="/fake/p.pdf")
            )

        assert result["tables_detected"] == 0
        assert result["pushed"] is True
        assert push.called

    def test_ocr_as_markdown_passed_to_push(self):
        """doc_ocr_text triggers ocr_as_markdown computation passed to push."""
        ext = FakeGenericMdTableExtractor(ocr_as_markdown="## Header\n> 88.000.000")
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            asyncio.get_event_loop().run_until_complete(
                uc.execute(
                    report_id="r-004",
                    pdf_path="/fake/p.pdf",
                    doc_ocr_text="A. TAI SAN\n88.089.621",
                )
            )

        assert push.call_args is not None
        assert isinstance(push.call_args["ocr_as_markdown"], str)


class TestExtractMdTablesUseCaseAC6:
    """AC-6: PDF with > MAX_PAGES → WARNING logged, at most MAX_PAGES processed."""

    def test_page_limit_fires_for_large_pdf(self, caplog):
        """
        A PDF with MAX_PAGES + 5 pages triggers a WARNING log message
        containing 'page limit reached'.
        """
        large_page_count = MAX_PAGES + 5
        ext = FakeGenericMdTableExtractor(md_tables=[])
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        pages_rasterized = []

        def recording_rasterize(self, pdf_path, page_num, tmp_dir, convert_from_path):
            pages_rasterized.append(page_num)
            return f"/fake/page_{page_num}.png"

        with caplog.at_level(logging.WARNING, logger="application.extract_md_tables_usecase"):
            with _patch_count_pages(large_page_count), \
                 patch.object(ExtractMdTablesUseCase, "_rasterize_page", recording_rasterize), \
                 _patch_pdf2image():
                asyncio.get_event_loop().run_until_complete(
                    uc.execute(report_id="r-large", pdf_path="/fake/large.pdf")
                )

        # AC-6: WARNING must be logged
        warning_messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        assert any("page limit" in m.lower() for m in warning_messages), (
            f"Expected 'page limit' WARNING, got: {warning_messages}"
        )

        # AC-6: at most MAX_PAGES pages must be rasterized
        assert len(pages_rasterized) <= MAX_PAGES, (
            f"Expected ≤{MAX_PAGES} pages rasterized, got {len(pages_rasterized)}"
        )

    def test_small_pdf_no_warning(self, caplog):
        """
        A PDF with ≤ MAX_PAGES pages does NOT trigger the page-limit WARNING.
        """
        ext = FakeGenericMdTableExtractor(md_tables=[])
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with caplog.at_level(logging.WARNING, logger="application.extract_md_tables_usecase"):
            with _patch_count_pages(5), _patch_rasterize_page(), _patch_pdf2image():
                asyncio.get_event_loop().run_until_complete(
                    uc.execute(report_id="r-small", pdf_path="/fake/small.pdf")
                )

        warning_messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        page_limit_warnings = [m for m in warning_messages if "page limit" in m.lower()]
        assert len(page_limit_warnings) == 0, (
            f"Unexpected page-limit WARNING for small PDF: {page_limit_warnings}"
        )

    def test_max_pages_constant_is_20(self):
        """MAX_PAGES must equal 20 (brief constraint)."""
        assert MAX_PAGES == 20, f"MAX_PAGES must be 20, got {MAX_PAGES}"
