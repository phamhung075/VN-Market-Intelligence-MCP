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

    async def test_push_called_once_with_correct_report_id(self):
        """Push is called exactly once and receives the report_id."""
        uc, ext, push = _make_use_case()

        with _patch_count_pages(3), _patch_rasterize_page(), _patch_pdf2image():
            result = await uc.execute(
                report_id="abc-123",
                pdf_path="/fake/test.pdf",
            )

        assert push.called, "push_md_tables was not called"
        assert push.call_args is not None
        assert push.call_args["report_id"] == "abc-123"

    async def test_push_receives_md_tables(self):
        """Push receives the md_tables list from the extractor."""
        expected_tables = ["| A | B |\n|---|---|\n| 1 | 2 |"]
        ext = FakeGenericMdTableExtractor(md_tables=expected_tables)
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            await uc.execute(report_id="report-001", pdf_path="/fake/test.pdf")

        assert push.call_args is not None
        assert push.call_args["md_tables"] == expected_tables

    async def test_return_shape_pushed_true(self):
        """execute() returns {tables_detected: N >= 1, pushed: True} on success."""
        expected_tables = [
            "| Col1 | Col2 |\n|---|---|\n| cell1 | cell2 |",
            "| A | B | C |\n|---|---|---|\n| x | y | z |",
        ]
        uc, _, _ = _make_use_case(md_tables=expected_tables, push_ok=True, push_tables_stored=2)

        # 1 page: extractor called once per page (returns 2 tables per call)
        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            result = await uc.execute(report_id="r-001", pdf_path="/fake/p.pdf")

        assert result["pushed"] is True
        # 1 page × 2 tables per page = 2 tables_detected
        assert result["tables_detected"] >= 1

    async def test_push_failure_returns_pushed_false(self):
        """If push raises, execute() returns pushed=False (no re-raise)."""
        push = FakeMdPushClient()
        push.set_raise(RuntimeError("network error"))
        ext = FakeGenericMdTableExtractor()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            result = await uc.execute(report_id="r-002", pdf_path="/fake/p.pdf")

        assert result["pushed"] is False
        assert isinstance(result["tables_detected"], int)

    async def test_empty_extractor_result(self):
        """Zero tables extracted → pushed=True (push called with empty list), tables_detected=0."""
        ext = FakeGenericMdTableExtractor(md_tables=[])
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            result = await uc.execute(report_id="r-003", pdf_path="/fake/p.pdf")

        assert result["tables_detected"] == 0
        assert result["pushed"] is True
        assert push.called

    async def test_ocr_as_markdown_passed_to_push(self):
        """doc_ocr_text triggers ocr_as_markdown computation passed to push."""
        ext = FakeGenericMdTableExtractor(ocr_as_markdown="## Header\n> 88.000.000")
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            await uc.execute(
                report_id="r-004",
                pdf_path="/fake/p.pdf",
                doc_ocr_text="A. TAI SAN\n88.089.621",
            )

        assert push.call_args is not None
        assert isinstance(push.call_args["ocr_as_markdown"], str)


class TestExtractMdTablesUseCaseAC6:
    """AC-6: PDF with > MAX_PAGES → WARNING logged, at most MAX_PAGES processed."""

    async def test_page_limit_fires_for_large_pdf(self, caplog):
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
                await uc.execute(report_id="r-large", pdf_path="/fake/large.pdf")

        # AC-6: WARNING must be logged
        warning_messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        assert any("page limit" in m.lower() for m in warning_messages), (
            f"Expected 'page limit' WARNING, got: {warning_messages}"
        )

        # AC-6: at most MAX_PAGES pages must be rasterized
        assert len(pages_rasterized) <= MAX_PAGES, (
            f"Expected ≤{MAX_PAGES} pages rasterized, got {len(pages_rasterized)}"
        )

    async def test_small_pdf_no_warning(self, caplog):
        """
        A PDF with ≤ MAX_PAGES pages does NOT trigger the page-limit WARNING.
        """
        ext = FakeGenericMdTableExtractor(md_tables=[])
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(md_extractor=ext, md_push_client=push)

        with caplog.at_level(logging.WARNING, logger="application.extract_md_tables_usecase"):
            with _patch_count_pages(5), _patch_rasterize_page(), _patch_pdf2image():
                await uc.execute(report_id="r-small", pdf_path="/fake/small.pdf")

        warning_messages = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        page_limit_warnings = [m for m in warning_messages if "page limit" in m.lower()]
        assert len(page_limit_warnings) == 0, (
            f"Unexpected page-limit WARNING for small PDF: {page_limit_warnings}"
        )

    def test_max_pages_constant_is_20(self):
        """MAX_PAGES must equal 20 (brief constraint)."""
        assert MAX_PAGES == 20, f"MAX_PAGES must be 20, got {MAX_PAGES}"


# ---------------------------------------------------------------------------
# MD-EXTRACT-2 DEFECT-A: OcrTextFetchClientPort injection tests
# ---------------------------------------------------------------------------


class FakeOcrTextFetchClient:
    """
    Fake OcrTextFetchClientPort.

    Returns configurable OCR text. Records call arguments.
    Optionally raises to simulate HTTP failure.
    """

    def __init__(self, text: str = "## Section\n> 88.089.621") -> None:
        self._text = text
        self.called = False
        self.last_report_id: Optional[str] = None
        self._should_raise: Optional[Exception] = None

    def set_raise(self, exc: Exception) -> None:
        self._should_raise = exc

    async def fetch_ocr_text(self, report_id: str) -> str:
        self.called = True
        self.last_report_id = report_id
        if self._should_raise is not None:
            raise self._should_raise
        return self._text


class TestOcrFetchClientInjection:
    """
    MD-EXTRACT-2 DEFECT-A: tests for Step 0 OCR text auto-fetch in use case.

    AC-2A (unit level): when doc_ocr_text is None and ocr_fetch_client is
    injected, the fetch client is called and the returned text becomes
    ocr_as_markdown in the push call.
    """

    def _make_use_case_with_ocr_client(
        self,
        ocr_text: str = "## Section\n> 88.089.621",
        should_raise: Optional[Exception] = None,
    ) -> tuple:
        ext = FakeGenericMdTableExtractor()
        push = FakeMdPushClient()
        ocr_client = FakeOcrTextFetchClient(text=ocr_text)
        if should_raise is not None:
            ocr_client.set_raise(should_raise)
        uc = ExtractMdTablesUseCase(
            md_extractor=ext,
            md_push_client=push,
            ocr_fetch_client=ocr_client,
        )
        return uc, ext, push, ocr_client

    async def test_ocr_fetch_client_called_when_no_doc_ocr_text(self):
        """
        When doc_ocr_text is None, ocr_fetch_client.fetch_ocr_text is called
        with the correct report_id.
        """
        uc, ext, push, ocr_client = self._make_use_case_with_ocr_client()

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            await uc.execute(
                report_id="fetch-test-001",
                pdf_path="/fake/test.pdf",
                # doc_ocr_text NOT provided → should trigger Step 0
            )

        assert ocr_client.called, "fetch_ocr_text was not called when doc_ocr_text=None"
        assert ocr_client.last_report_id == "fetch-test-001"

    async def test_ocr_fetch_client_not_called_when_doc_ocr_text_provided(self):
        """
        When doc_ocr_text is explicitly provided by caller, the fetch client
        must NOT be called (avoid redundant HTTP call).
        """
        uc, ext, push, ocr_client = self._make_use_case_with_ocr_client()

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            await uc.execute(
                report_id="fetch-test-002",
                pdf_path="/fake/test.pdf",
                doc_ocr_text="Already provided OCR text",
            )

        assert not ocr_client.called, (
            "fetch_ocr_text was called even though doc_ocr_text was explicitly provided"
        )

    async def test_fetched_ocr_text_appears_in_push_as_markdown(self):
        """
        The OCR text returned by fetch_ocr_text is converted to markdown
        and passed to push_md_tables as ocr_as_markdown (non-empty string).
        """
        raw_ocr = "A. TÀI SẢN NGẮN HẠN\n100  88.089.621  71.999.995"
        uc, ext, push, ocr_client = self._make_use_case_with_ocr_client(
            ocr_text=raw_ocr,
        )

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            await uc.execute(report_id="fetch-test-003", pdf_path="/fake/test.pdf")

        assert push.call_args is not None, "push_md_tables was not called"
        ocr_md = push.call_args["ocr_as_markdown"]
        assert isinstance(ocr_md, str), "ocr_as_markdown must be a string"
        assert len(ocr_md) > 0, "ocr_as_markdown must be non-empty when OCR text is fetched"

    async def test_ocr_fetch_client_not_injected_no_crash(self):
        """
        When no ocr_fetch_client is provided (None), use case continues normally
        without Step 0. ocr_as_markdown stays empty (original behavior).
        """
        ext = FakeGenericMdTableExtractor()
        push = FakeMdPushClient()
        uc = ExtractMdTablesUseCase(
            md_extractor=ext,
            md_push_client=push,
            # ocr_fetch_client NOT provided
        )

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            result = await uc.execute(report_id="no-client-001", pdf_path="/fake/test.pdf")

        assert result["pushed"] is True
        # Push still called; ocr_as_markdown is "" (no text, no client)
        assert push.called
        assert push.call_args["ocr_as_markdown"] == ""

    async def test_graceful_degrade_when_fetch_raises(self):
        """
        If ocr_fetch_client.fetch_ocr_text raises an exception, the use case
        must NOT crash. It continues and ocr_as_markdown stays empty.
        """
        uc, ext, push, ocr_client = self._make_use_case_with_ocr_client(
            should_raise=ConnectionError("mcp-server unreachable"),
        )

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            result = await uc.execute(report_id="fail-fetch-001", pdf_path="/fake/test.pdf")

        # Must not raise; must return normally with pushed status
        assert "pushed" in result
        assert "tables_detected" in result
        # Push still attempted even if OCR fetch failed
        assert push.called

    async def test_empty_fetch_result_gives_empty_ocr_markdown(self):
        """
        When fetch_ocr_text returns empty string (no stored OCR), ocr_as_markdown
        in the push call is also empty string.
        """
        uc, ext, push, ocr_client = self._make_use_case_with_ocr_client(ocr_text="")

        with _patch_count_pages(1), _patch_rasterize_page(), _patch_pdf2image():
            await uc.execute(report_id="empty-ocr-001", pdf_path="/fake/test.pdf")

        assert push.call_args is not None
        assert push.call_args["ocr_as_markdown"] == ""


# ---------------------------------------------------------------------------
# MD-EXTRACT-2 DEFECT-A: AC-2J fence test
# ---------------------------------------------------------------------------


class TestOcrFetchClientFenceAC2J:
    """
    AC-2J: ocr_text_fetch_client.py must NOT import pytesseract or call OCR.
    """

    def test_no_tesseract_in_ocr_fetch_client(self):
        """
        AC-2J: ocr_text_fetch_client.py must contain zero IMPORT or CALL
        references to pytesseract, image_to_string, or image_to_data.

        Uses AST inspection to check only actual import and attribute-access
        nodes (not comments or docstrings), so incidental mentions in docstring
        examples are not false-positives.
        """
        import ast
        import inspect
        import infrastructure.ocr_text_fetch_client as mod

        source = inspect.getsource(mod)
        tree = ast.parse(source)

        forbidden_names = {"pytesseract", "image_to_string", "image_to_data"}

        for node in ast.walk(tree):
            # Check import statements: import pytesseract / from pytesseract import ...
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert alias.name not in forbidden_names, (
                        f"AC-2J violation: 'import {alias.name}' in ocr_text_fetch_client.py"
                    )
            elif isinstance(node, ast.ImportFrom):
                if node.module and node.module in forbidden_names:
                    raise AssertionError(
                        f"AC-2J violation: 'from {node.module} import ...' in ocr_text_fetch_client.py"
                    )
                for alias in node.names:
                    assert alias.name not in forbidden_names, (
                        f"AC-2J violation: 'from ... import {alias.name}' in ocr_text_fetch_client.py"
                    )
            # Check attribute accesses: pytesseract.image_to_data(...)
            elif isinstance(node, ast.Attribute):
                assert node.attr not in forbidden_names, (
                    f"AC-2J violation: attribute '.{node.attr}' in ocr_text_fetch_client.py"
                )
            # Check function calls by name
            elif isinstance(node, ast.Name):
                if node.id in forbidden_names:
                    raise AssertionError(
                        f"AC-2J violation: name '{node.id}' used in ocr_text_fetch_client.py"
                    )

    def test_no_application_or_interface_import(self):
        """Fence-A: ocr_text_fetch_client.py must not import from application/ or interface/."""
        import ast
        import inspect
        import infrastructure.ocr_text_fetch_client as mod

        source = inspect.getsource(mod)
        tree = ast.parse(source)

        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                module = node.module
                assert not module.startswith("application"), (
                    f"Fence-A violation in ocr_text_fetch_client: 'from {module} import ...'"
                )
                assert not module.startswith("interface"), (
                    f"Fence-A violation in ocr_text_fetch_client: 'from {module} import ...'"
                )
