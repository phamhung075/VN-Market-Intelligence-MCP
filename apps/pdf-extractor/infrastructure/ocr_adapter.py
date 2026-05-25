"""
infrastructure/ocr_adapter.py — BT-3-D

PdfOcrAdapter: implements OcrPort.

Responsibilities:
  1. locate_balance_sheet_pages(pdf_path) — scan native PDF text (pdfplumber, fast,
     no Tesseract) for Vietnamese BCTC balance-sheet markers to identify the page
     range. Falls back to pages 4-7 if markers are absent (logged as heuristic).

  2. ocr_pages(pdf_path, page_numbers) — run Tesseract (vie+eng, --psm 6) via
     pdf2image on the specified pages ONLY. Sequential, one page at a time
     (HOST SAFETY, D6).

DDD: infrastructure layer (does PDF I/O + Tesseract subprocess). Must NOT be imported
     from domain/ or application/ directly. Injected at composition root (main.py).

Privacy: self-hosted Tesseract only. Zero external API calls. Zero data leaves machine.

HOST SAFETY (D6 — 16GB Mac kernel-panic risk):
  - Never OCR the full PDF. Only call ocr_pages() with the page list from
    locate_balance_sheet_pages() (typically 3-5 pages).
  - OCR is sequential (one page per call, no thread pool).

PAGE SEGMENTATION MODE (dual-path-drift lesson, BT3-FIX3-PSM):
  - ocr_pages() uses --psm 6 (single uniform block, strict line-by-line layout).
  - This matches spike/fpt_balance_sheet_eval.py:160 and spike/eval/harness.py:193
    exactly. WITHOUT --psm 6 Tesseract defaults to psm 3 (auto column segmentation),
    which reads BCTC three-block layouts column-by-column, scrambling labels,
    codes, and values into separate interleaved blocks (observed: 47 orphan rows,
    off-by-one labels, dup code 222 despite balance_pass=true).
  - Never remove the config="--psm 6" argument; doing so silently re-introduces
    dual-path drift at the PSM level (drift #4).

Reuses the same Tesseract invocation pattern as:
  - infrastructure/extraction_engine.py PdfplumberExtractionEngine._ocr_page()
  - apps/pdf-extractor/__tests__/integration/test_extract_tables_fpt.py _ocr_pdf_pages()
"""

from __future__ import annotations

import logging
import re
from typing import Dict, List

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Vietnamese balance-sheet section markers (any of these on a page → BS section)
# ---------------------------------------------------------------------------

_BS_MARKERS = [
    "bảng cân đối kế toán",
    "bang can doi ke toan",    # unaccented fallback
    "tài sản ngắn hạn",
    "tài sản dài hạn",
    "nguồn vốn",
    "tổng cộng tài sản",
    "tổng cộng nguồn vốn",
    "tai san ngan han",        # unaccented fallbacks
    "tai san dai han",
    "nguon von",
    "tong cong tai san",
    "tong cong nguon von",
]

# Minimum marker hits before we consider a page "in the balance sheet"
_MIN_MARKER_HITS = 1

# Maximum section length: balance sheets rarely exceed 8 pages in BCTC
_MAX_BS_PAGES = 8

# Safe fallback if auto-locate fails (FPT layout — heuristic, not guaranteed)
_FALLBACK_PAGES = [4, 5, 6, 7]


# ---------------------------------------------------------------------------
# Public adapter class — implements OcrPort (duck-typing, no ABC needed)
# ---------------------------------------------------------------------------


class PdfOcrAdapter:
    """
    Concrete OcrPort adapter.

    locate_balance_sheet_pages() uses pdfplumber native text (fast, no OCR)
    to find the balance-sheet section.

    ocr_pages() uses pdf2image + pytesseract (Tesseract vie+eng) on the
    specified pages only.
    """

    def locate_balance_sheet_pages(self, pdf_path: str) -> List[int]:
        """
        Auto-locate balance-sheet pages by scanning native PDF text for Vietnamese markers.

        Returns 1-indexed page numbers. Falls back to [4, 5, 6, 7] if not found.
        """
        try:
            import pdfplumber  # type: ignore[import]
        except ImportError:
            logger.warning(
                "pdfplumber not installed — using fallback BS pages %s",
                _FALLBACK_PAGES,
            )
            return list(_FALLBACK_PAGES)

        bs_pages: List[int] = []
        in_bs_section = False
        consecutive_non_bs = 0

        try:
            with pdfplumber.open(pdf_path) as pdf:
                total_pages = len(pdf.pages)
                logger.info(
                    "PdfOcrAdapter.locate_balance_sheet_pages: scanning %d pages in %s",
                    total_pages,
                    pdf_path,
                )

                for page_num_0indexed, page in enumerate(pdf.pages):
                    page_num_1indexed = page_num_0indexed + 1

                    # Extract native text (fast — no OCR)
                    native_text = page.extract_text() or ""
                    lower = native_text.lower()

                    # Check for BS markers
                    hits = sum(1 for marker in _BS_MARKERS if marker in lower)

                    if hits >= _MIN_MARKER_HITS:
                        in_bs_section = True
                        consecutive_non_bs = 0
                        bs_pages.append(page_num_1indexed)
                        logger.debug(
                            "PdfOcrAdapter: page %d has %d BS marker(s) → in BS section",
                            page_num_1indexed,
                            hits,
                        )
                    elif in_bs_section:
                        # Allow 1 page gap (sometimes a page is mostly numeric, no markers)
                        consecutive_non_bs += 1
                        if consecutive_non_bs <= 1:
                            bs_pages.append(page_num_1indexed)
                            logger.debug(
                                "PdfOcrAdapter: page %d no BS markers — keeping (gap=%d)",
                                page_num_1indexed,
                                consecutive_non_bs,
                            )
                        else:
                            # Two consecutive pages with no markers = section ended
                            # Remove the trailing gap page we added
                            if bs_pages and bs_pages[-1] != page_num_1indexed - 1:
                                pass  # already not added
                            elif bs_pages:
                                # Remove the last gap page
                                bs_pages.pop()
                            logger.info(
                                "PdfOcrAdapter: BS section ended at page %d (2 consecutive non-BS pages)",
                                page_num_1indexed,
                            )
                            break

                    # Safety cap: if we've collected enough pages, stop scanning
                    if len(bs_pages) >= _MAX_BS_PAGES:
                        logger.info(
                            "PdfOcrAdapter: reached max BS page cap (%d) at page %d",
                            _MAX_BS_PAGES,
                            page_num_1indexed,
                        )
                        break

        except Exception as exc:
            logger.warning(
                "PdfOcrAdapter.locate_balance_sheet_pages error: %s — using fallback %s",
                exc,
                _FALLBACK_PAGES,
            )
            return list(_FALLBACK_PAGES)

        if not bs_pages:
            logger.warning(
                "PdfOcrAdapter: no BS markers found in %s — using fallback pages %s "
                "(heuristic: not guaranteed for all BCTC layouts)",
                pdf_path,
                _FALLBACK_PAGES,
            )
            return list(_FALLBACK_PAGES)

        logger.info(
            "PdfOcrAdapter.locate_balance_sheet_pages: located %d pages %s",
            len(bs_pages),
            bs_pages,
        )
        return bs_pages

    def ocr_pages(self, pdf_path: str, page_numbers: List[int]) -> List[Dict]:
        """
        Run Tesseract (vie+eng) on the specified 1-indexed pages of the PDF.

        Sequential (one page at a time — D6 host safety).
        Uses pdf2image.convert_from_path() at 200 DPI.

        Returns list of {"page_number": int, "text": str} dicts.
        Pages that fail OCR get text="" (logged as warning).
        """
        try:
            from pdf2image import convert_from_path  # type: ignore
        except ImportError:
            logger.error("pdf2image not installed — cannot OCR pages, returning empty text")
            return [{"page_number": p, "text": ""} for p in page_numbers]

        try:
            import pytesseract  # type: ignore
        except ImportError:
            logger.error("pytesseract not installed — cannot OCR pages, returning empty text")
            return [{"page_number": p, "text": ""} for p in page_numbers]

        if not page_numbers:
            return []

        pages_out: List[Dict] = []
        sorted_pages = sorted(set(page_numbers))

        logger.info(
            "PdfOcrAdapter.ocr_pages: OCR'ing pages %s from %s (sequential, Tesseract vie+eng)",
            sorted_pages,
            pdf_path,
        )

        for page_num in sorted_pages:
            try:
                # D6 HOST SAFETY: convert ONLY this single page (not the full PDF)
                images = convert_from_path(
                    pdf_path,
                    dpi=200,
                    first_page=page_num,
                    last_page=page_num,
                    fmt="png",
                )
                if not images:
                    logger.warning(
                        "PdfOcrAdapter: pdf2image returned no images for page %d — skipping",
                        page_num,
                    )
                    pages_out.append({"page_number": page_num, "text": ""})
                    continue

                # --psm 6: single uniform block — reads line-by-line (inline layout).
                # Matches spike/fpt_balance_sheet_eval.py:160 exactly.
                # DO NOT remove config= arg: psm 3 (Tesseract default) triggers
                # column segmentation → scrambled BCTC output (drift #4).
                text: str = pytesseract.image_to_string(
                    images[0], lang="vie+eng", config="--psm 6"
                )
                pages_out.append({"page_number": page_num, "text": text})
                logger.debug(
                    "PdfOcrAdapter: page %d → %d chars of OCR text",
                    page_num,
                    len(text),
                )

            except Exception as exc:
                logger.warning(
                    "PdfOcrAdapter: OCR failed for page %d: %s — using empty text",
                    page_num,
                    exc,
                )
                pages_out.append({"page_number": page_num, "text": ""})

        logger.info(
            "PdfOcrAdapter.ocr_pages: completed %d pages, total chars=%d",
            len(pages_out),
            sum(len(p["text"]) for p in pages_out),
        )
        return pages_out
