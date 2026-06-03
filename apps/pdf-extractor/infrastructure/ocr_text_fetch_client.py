"""
infrastructure/ocr_text_fetch_client.py — MD-EXTRACT-2 (DEFECT-A fix) + LF-EXTRACT

OcrTextFetchClient: HTTP GET client that reads stored per-page OCR text from
mcp-server. Provides two methods:
    - fetch_ocr_text(report_id) → concatenated str (MD-EXTRACT-2 / OcrTextFetchClientPort)
    - fetch_ocr_pages(report_id) → List[{page_number, text}] (LF-EXTRACT / OcrPagesFetchClientPort)

Implements OcrTextFetchClientPort + OcrPagesFetchClientPort
    (domain/modules/financial_reports/ports.py).

Source endpoint: GET /api/bctc-inspect/ocr/{report_id}?page=N
    Response shape (per page):
        {
            "text_content": "... raw OCR text ...",
            "total_pages": 7,
            "page": 1
        }

Algorithm (fetch_ocr_text):
    1. GET /api/bctc-inspect/ocr/{report_id} (no page param) to read total_pages.
    2. Loop pages 1..min(total_pages, MAX_PAGES), GET ?page=N.
    3. Concatenate text_content fields with "\\n\\n---\\n\\n" separator.
    4. On any HTTP failure: log WARNING, return partial text accumulated so far.
    5. Returns empty string when total_pages == 0 or first request fails.

Algorithm (fetch_ocr_pages — LF-EXTRACT Tier 0):
    Same fetching strategy but uses _MAX_FETCH_PAGES_LF (200) instead of
    _MAX_FETCH_PAGES (20). Layout-first has no page cap — it processes the
    entire PDF (e.g. FPT Q1-2026 has 46 pages; fetch must cover all of them).
    Returns [{"page_number": N, "text": "..."}, ...] for Tier 0 fingerprinting.
    No Tesseract calls added. Host-safe.

DDD layer: infrastructure (makes outbound HTTP via aiohttp — impure).
    Fence-A: must NOT import from application/ or interface/.

Privacy: HTTP calls go to our own mcp-server only (internal Docker network).
    ZERO external API calls. ZERO Tesseract calls. The OCR text was produced
    by prior Tesseract processing already stored in mcp-server.

Hardware: no Tesseract subprocess calls added (HTTP only). Zero kernel-panic risk.
    AC-2J verified: this file contains zero OCR library calls or imports.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Hard cap for fetch_ocr_text() — matches ExtractMdTablesUseCase.MAX_PAGES (20).
# Do NOT raise: that use case deliberately limits to 20 pages for host safety.
_MAX_FETCH_PAGES = 20

# Separate cap for fetch_ocr_pages() used by ExtractLayoutFirstUseCase (LF-EXTRACT).
# Layout-first processes the ENTIRE PDF with no page limit — the Tier 0 fingerprint
# loop iterates range(1, total_pages+1) so capping ocr-page fetch at 20 silently
# truncates to 20 OCR pages and builds a 20-page document map even for 46-page PDFs.
# Fix: FU-FPT-OCR-PAGES-20-46 — raise to 200 (covers any real BCTC report).
# Host-safe: these calls are cheap HTTP fetches; no Tesseract involved.
_MAX_FETCH_PAGES_LF = 200

# Page-break marker inserted between concatenated pages (human-readable).
_PAGE_SEPARATOR = "\n\n---\n\n"


class OcrTextFetchClient:
    """
    Fetches stored per-page OCR text from mcp-server and concatenates pages.

    Implements OcrTextFetchClientPort.

    DDD: infrastructure layer — makes outbound HTTP (aiohttp).
    Fence-A: no imports from application/ or interface/.

    Wired at composition root in main.py:
        ocr_fetch_client = OcrTextFetchClient(mcp_server_url=cfg.mcp_server_url)
    """

    def __init__(self, mcp_server_url: str) -> None:
        """
        Args:
            mcp_server_url: Base URL of mcp-server (e.g. "http://mcp-server:3000").
                            Must NOT have a trailing slash.
        """
        self._mcp_url = mcp_server_url.rstrip("/")

    async def fetch_ocr_text(self, report_id: str) -> str:
        """
        Concatenate all stored OCR pages for the given report.

        Calls GET /api/bctc-inspect/ocr/{report_id} first to get total_pages,
        then loops pages 1..N fetching text_content per page.

        Args:
            report_id: UUID string matching financial_reports.id on mcp-server.

        Returns:
            Concatenated OCR text. Empty string on failure or no stored text.
        """
        try:
            import aiohttp  # type: ignore
        except ImportError:
            logger.error(
                "OcrTextFetchClient: aiohttp not installed — cannot fetch OCR text"
            )
            return ""

        base_url = f"{self._mcp_url}/api/bctc-inspect/ocr/{report_id}"

        try:
            async with aiohttp.ClientSession() as session:
                # Step 1: fetch page 1 to learn total_pages
                first_url = f"{base_url}?page=1"
                try:
                    async with session.get(first_url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                        if resp.status != 200:
                            logger.warning(
                                "OcrTextFetchClient: GET %s returned HTTP %d — no OCR text",
                                first_url,
                                resp.status,
                            )
                            return ""
                        first_data = await resp.json()
                except Exception as exc:
                    logger.warning(
                        "OcrTextFetchClient: request failed for %s: %s — returning ''",
                        first_url,
                        exc,
                    )
                    return ""

                total_pages: int = int(first_data.get("total_pages", 0))
                if total_pages == 0:
                    logger.warning(
                        "OcrTextFetchClient: total_pages=0 for report_id=%s — no OCR text stored",
                        report_id,
                    )
                    return ""

                logger.info(
                    "OcrTextFetchClient: report_id=%s has %d OCR pages — fetching up to %d",
                    report_id,
                    total_pages,
                    _MAX_FETCH_PAGES,
                )

                # Step 2: Accumulate page 1 text, then loop remaining pages
                pages_text = []
                first_text = str(first_data.get("text_content", "")).strip()
                if first_text:
                    pages_text.append(first_text)

                pages_to_fetch = min(total_pages, _MAX_FETCH_PAGES)

                for page_num in range(2, pages_to_fetch + 1):
                    page_url = f"{base_url}?page={page_num}"
                    try:
                        async with session.get(
                            page_url, timeout=aiohttp.ClientTimeout(total=15)
                        ) as page_resp:
                            if page_resp.status != 200:
                                logger.warning(
                                    "OcrTextFetchClient: GET %s returned HTTP %d — skipping page",
                                    page_url,
                                    page_resp.status,
                                )
                                continue
                            page_data = await page_resp.json()
                            page_text = str(page_data.get("text_content", "")).strip()
                            if page_text:
                                pages_text.append(page_text)
                    except Exception as exc:
                        logger.warning(
                            "OcrTextFetchClient: request failed for page %d (%s): %s — skipping",
                            page_num,
                            page_url,
                            exc,
                        )
                        # Graceful degrade: continue with remaining pages

                combined = _PAGE_SEPARATOR.join(pages_text)
                logger.info(
                    "OcrTextFetchClient: fetched %d pages → %d chars of OCR text for report_id=%s",
                    len(pages_text),
                    len(combined),
                    report_id,
                )
                return combined

        except Exception as exc:
            logger.error(
                "OcrTextFetchClient: unexpected error fetching OCR text for %s: %s — returning ''",
                report_id,
                exc,
            )
            return ""

    async def fetch_ocr_pages(self, report_id: str) -> List[Dict]:
        """
        Fetch stored per-page OCR text as structured page records for Tier 0 (LF-EXTRACT).

        Implements OcrPagesFetchClientPort.

        Returns a list of dicts: [{"page_number": int, "text": str}, ...]
        sorted by page_number ascending. Returns [] on failure.

        Hardware safe: no Tesseract calls. HTTP only.
        """
        try:
            import aiohttp  # type: ignore
        except ImportError:
            logger.error(
                "OcrTextFetchClient: aiohttp not installed — cannot fetch OCR pages"
            )
            return []

        base_url = f"{self._mcp_url}/api/bctc-inspect/ocr/{report_id}"

        try:
            async with aiohttp.ClientSession() as session:
                # Fetch page 1 to learn total_pages
                first_url = f"{base_url}?page=1"
                try:
                    async with session.get(first_url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                        if resp.status != 200:
                            logger.warning(
                                "OcrTextFetchClient.fetch_ocr_pages: GET %s returned HTTP %d",
                                first_url,
                                resp.status,
                            )
                            return []
                        first_data = await resp.json()
                except Exception as exc:
                    logger.warning(
                        "OcrTextFetchClient.fetch_ocr_pages: request failed %s: %s",
                        first_url,
                        exc,
                    )
                    return []

                total_pages: int = int(first_data.get("total_pages", 0))
                if total_pages == 0:
                    return []

                # Use _MAX_FETCH_PAGES_LF (200) here — layout-first has no page
                # cap so we must fetch ALL stored pages (fix FU-FPT-OCR-PAGES-20-46).
                pages_to_fetch = min(total_pages, _MAX_FETCH_PAGES_LF)
                result: List[Dict] = []

                logger.info(
                    "OcrTextFetchClient.fetch_ocr_pages: report_id=%s total_pages=%d "
                    "fetching up to %d (LF cap)",
                    report_id,
                    total_pages,
                    _MAX_FETCH_PAGES_LF,
                )

                # Include page 1
                first_text = str(first_data.get("text_content", "")).strip()
                result.append({"page_number": 1, "text": first_text})

                # Fetch remaining pages
                for page_num in range(2, pages_to_fetch + 1):
                    page_url = f"{base_url}?page={page_num}"
                    try:
                        async with session.get(
                            page_url, timeout=aiohttp.ClientTimeout(total=15)
                        ) as page_resp:
                            if page_resp.status != 200:
                                # Missing page — include as empty (page gap)
                                result.append({"page_number": page_num, "text": ""})
                                continue
                            page_data = await page_resp.json()
                            page_text = str(page_data.get("text_content", "")).strip()
                            result.append({"page_number": page_num, "text": page_text})
                    except Exception as exc:
                        logger.warning(
                            "OcrTextFetchClient.fetch_ocr_pages: page %d failed: %s — marking blank",
                            page_num,
                            exc,
                        )
                        result.append({"page_number": page_num, "text": ""})

                logger.info(
                    "OcrTextFetchClient.fetch_ocr_pages: report_id=%s fetched %d pages",
                    report_id,
                    len(result),
                )
                return result

        except Exception as exc:
            logger.error(
                "OcrTextFetchClient.fetch_ocr_pages: unexpected error for %s: %s",
                report_id,
                exc,
            )
            return []
