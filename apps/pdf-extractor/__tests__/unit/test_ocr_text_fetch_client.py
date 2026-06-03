"""
Unit tests — infrastructure/ocr_text_fetch_client.py

FU-FPT-OCR-PAGES-20-46: fetch_ocr_pages() must NOT truncate at 20 pages.
Root cause: _MAX_FETCH_PAGES = 20 was shared between fetch_ocr_text() (which
legitimately caps at 20 for ExtractMdTablesUseCase) and fetch_ocr_pages()
(used by ExtractLayoutFirstUseCase which has no page cap).
Fix: _MAX_FETCH_PAGES_LF = 200 used by fetch_ocr_pages() only.

Tests:
    - fetch_ocr_pages() for a 46-page PDF returns all 46 pages (not truncated at 20).
    - fetch_ocr_pages() for a 10-page PDF returns 10 pages.
    - fetch_ocr_text() for a 46-page PDF still returns at most 20 pages (unchanged).
    - fetch_ocr_pages() caps at _MAX_FETCH_PAGES_LF (200), not _MAX_FETCH_PAGES (20).

DDD: infrastructure unit test — uses aiohttp mock (no DB, no Tesseract, no network).
"""

from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_page_response(page_num: int, total_pages: int, text: str = "") -> dict:
    """Build a mock mcp-server /api/bctc-inspect/ocr response for one page."""
    return {
        "text_content": text or f"OCR text for page {page_num}",
        "total_pages": total_pages,
        "page": page_num,
    }


class _FakeAiohttpSession:
    """
    Minimal aiohttp.ClientSession fake that returns pre-built page responses.

    Simulates GET /api/bctc-inspect/ocr/{report_id}?page=N responses.
    All pages have text_content. total_pages is fixed to _total.
    """

    def __init__(self, total_pages: int) -> None:
        self._total = total_pages

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def get(self, url: str, timeout=None):
        # Parse page number from URL query string
        if "?page=" in url:
            page_num = int(url.split("?page=")[-1])
        else:
            page_num = 1
        return _FakeResponseCtx(_make_page_response(page_num, self._total))


class _FakeResponseCtx:
    def __init__(self, data: dict) -> None:
        self._data = data
        self.status = 200

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def json(self) -> dict:
        return self._data


class TestFetchOcrPagesCap:
    """
    fetch_ocr_pages() must use _MAX_FETCH_PAGES_LF (200), not _MAX_FETCH_PAGES (20).
    FU-FPT-OCR-PAGES-20-46: 46-page FPT Q1-2026 was truncated to 20 pages.
    """

    @pytest.mark.asyncio
    async def test_fetch_ocr_pages_46_page_pdf_returns_all_pages(self):
        """
        A 46-page PDF must yield 46 page records from fetch_ocr_pages().
        Previously truncated at 20 — the root cause of FU-FPT-OCR-PAGES-20-46.
        """
        from infrastructure.ocr_text_fetch_client import OcrTextFetchClient

        client = OcrTextFetchClient(mcp_server_url="http://fake-mcp:3000")

        with patch("aiohttp.ClientSession", return_value=_FakeAiohttpSession(total_pages=46)):
            result = await client.fetch_ocr_pages("fake-report-id")

        assert len(result) == 46, (
            f"Expected 46 page records for a 46-page PDF, got {len(result)}. "
            "fetch_ocr_pages() must use _MAX_FETCH_PAGES_LF (200), not _MAX_FETCH_PAGES (20)."
        )
        # Pages must be in order
        page_numbers = [r["page_number"] for r in result]
        assert page_numbers == list(range(1, 47)), (
            f"Page numbers not sequential: {page_numbers}"
        )

    @pytest.mark.asyncio
    async def test_fetch_ocr_pages_10_page_pdf_returns_10_pages(self):
        """A 10-page PDF yields exactly 10 page records."""
        from infrastructure.ocr_text_fetch_client import OcrTextFetchClient

        client = OcrTextFetchClient(mcp_server_url="http://fake-mcp:3000")

        with patch("aiohttp.ClientSession", return_value=_FakeAiohttpSession(total_pages=10)):
            result = await client.fetch_ocr_pages("fake-report-id")

        assert len(result) == 10

    @pytest.mark.asyncio
    async def test_fetch_ocr_pages_20_page_pdf_returns_20_pages(self):
        """A 20-page PDF yields exactly 20 page records (boundary at old cap)."""
        from infrastructure.ocr_text_fetch_client import OcrTextFetchClient

        client = OcrTextFetchClient(mcp_server_url="http://fake-mcp:3000")

        with patch("aiohttp.ClientSession", return_value=_FakeAiohttpSession(total_pages=20)):
            result = await client.fetch_ocr_pages("fake-report-id")

        assert len(result) == 20

    @pytest.mark.asyncio
    async def test_fetch_ocr_pages_21_page_pdf_returns_21_pages(self):
        """
        A 21-page PDF must yield 21 page records — used to yield only 20.
        This is the one-above-old-cap boundary check.
        """
        from infrastructure.ocr_text_fetch_client import OcrTextFetchClient

        client = OcrTextFetchClient(mcp_server_url="http://fake-mcp:3000")

        with patch("aiohttp.ClientSession", return_value=_FakeAiohttpSession(total_pages=21)):
            result = await client.fetch_ocr_pages("fake-report-id")

        assert len(result) == 21, (
            f"Expected 21 pages, got {len(result)} — fetch_ocr_pages must exceed old 20-page cap."
        )

    @pytest.mark.asyncio
    async def test_fetch_ocr_text_46_page_pdf_still_caps_at_20(self):
        """
        fetch_ocr_text() (used by ExtractMdTablesUseCase) must STILL cap at 20.
        The _MAX_FETCH_PAGES = 20 cap for that path is intentional.
        """
        from infrastructure.ocr_text_fetch_client import OcrTextFetchClient

        client = OcrTextFetchClient(mcp_server_url="http://fake-mcp:3000")

        with patch("aiohttp.ClientSession", return_value=_FakeAiohttpSession(total_pages=46)):
            result = await client.fetch_ocr_text("fake-report-id")

        # Result is concatenated text (not a list), count separators
        page_count = result.count("OCR text for page ")
        assert page_count <= 20, (
            f"fetch_ocr_text() must still cap at 20 pages, got {page_count} pages worth of text."
        )

    def test_lf_cap_constant_is_at_least_46(self):
        """
        _MAX_FETCH_PAGES_LF must be >= 46 to cover the FPT Q1-2026 PDF.
        This test documents the minimum viable value for the constant.
        """
        from infrastructure.ocr_text_fetch_client import _MAX_FETCH_PAGES_LF, _MAX_FETCH_PAGES

        assert _MAX_FETCH_PAGES_LF >= 46, (
            f"_MAX_FETCH_PAGES_LF={_MAX_FETCH_PAGES_LF} — must be >= 46 to cover FPT Q1-2026."
        )
        assert _MAX_FETCH_PAGES == 20, (
            f"_MAX_FETCH_PAGES={_MAX_FETCH_PAGES} — must remain 20 (ExtractMdTablesUseCase cap)."
        )
        assert _MAX_FETCH_PAGES_LF > _MAX_FETCH_PAGES, (
            "LF cap must be strictly greater than the MD-extract cap."
        )
