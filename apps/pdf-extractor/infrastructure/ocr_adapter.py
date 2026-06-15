"""
infrastructure/ocr_adapter.py — BT-3-D + FIX-BCTC-BANK-PDF-OCR-RASTERIZE

PdfOcrAdapter: implements OcrPort.

Responsibilities:
  1. locate_balance_sheet_pages(pdf_path) — scan native PDF text (pdfplumber, fast,
     no Tesseract) for Vietnamese BCTC balance-sheet markers to identify the page
     range. Falls back to pages 4-7 if markers are absent (logged as heuristic).

     FIX-BCTC-BANK-PDF-OCR-RASTERIZE: when detect_low_text_density() detects that
     the PDF has < LOW_TEXT_DENSITY_THRESHOLD native chars/page (image-only / scanned),
     returns ALL page numbers (wide-scan) because BS markers cannot be found in native
     text of a scanned PDF. This is GENERIC — no per-ticker or per-form allowlist.

  2. ocr_pages(pdf_path, page_numbers) — run Tesseract (vie+eng, --psm 6) via
     pdf2image on the specified pages ONLY. Sequential, one page at a time
     (HOST SAFETY, D6).

     FIX-BCTC-BANK-PDF-OCR-RASTERIZE: when a page's Tesseract output is below
     LOW_TESSERACT_PAGE_CHARS, falls back to PyMuPDF rasterize + PaddleOCR
     (_rasterize_and_ocr_page). GENERIC — triggers on any low-text page regardless
     of ticker, form number, or bank name.

  3. detect_low_text_density(pdf_path) [module-level function] — returns True when
     average native chars/page is < LOW_TEXT_DENSITY_THRESHOLD (scanned/image-only PDF).
     GENERIC — no ticker, no allowlist, no date literals.

  4. _rasterize_and_ocr_page(pdf_path, page_num) [instance method] — rasterizes a
     single page via PyMuPDF at RASTERIZE_DPI DPI, runs PaddleOCR, returns text string.

DDD: infrastructure layer (does PDF I/O + Tesseract subprocess + PaddleOCR).
     Must NOT be imported from domain/ or application/ directly. Injected at
     composition root (main.py).

Privacy: self-hosted Tesseract + PaddleOCR only. Zero external API calls.
         Zero data leaves machine.

HOST SAFETY (D6 — 16GB Mac kernel-panic risk):
  - Never OCR the full PDF. Only call ocr_pages() with the page list from
    locate_balance_sheet_pages() (typically 3-5 pages for text-native, all pages
    capped at _MAX_BS_PAGES=8 for scanned).
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

FIX-BCTC-BANK-PDF-OCR-RASTERIZE (2026-06-15):
  Root cause: bank PDFs (VCB_2026_Q1.pdf, CTG) are scanned/image-only — fitz raw
  yields ~110 chars across 53 pages. Native pdfplumber.extract_text() returns "" on
  every page → no BS markers found → fallback to pages [4,5,6,7] → Tesseract on those
  pages also yields very few chars because the BS section may be on other pages AND
  scanned images without embedded text produce poor Tesseract output without
  preprocessing → 0 rows parsed → pushBctcExtraction chars:0 confidence:0.

  Generic fix (two layers):
  Layer 1 (locate): detect_low_text_density → wide-scan (all pages up to _MAX_BS_PAGES)
    so the correct pages are OCR'd even when BS markers are absent.
  Layer 2 (ocr): when Tesseract yields < LOW_TESSERACT_PAGE_CHARS on a page, rasterize
    via PyMuPDF at 200 DPI and run PaddleOCR (already in the pdf-extractor image) as
    supplementary OCR. Take the result with more chars.

  Non-regression: text-native PDFs (FPT, VNM) have >>50 chars/page → detect_low_text_density
    returns False → standard Tesseract-only path runs unchanged.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FIX-BCTC-BANK-PDF-OCR-RASTERIZE — Generic low-text-density constants
# ---------------------------------------------------------------------------

# Average chars per page below which a PDF is considered image-only/scanned.
# Calibrated: VCB_2026_Q1.pdf ≈ 110 chars / 53 pages ≈ 2 chars/page.
# FPT Q4 2025 has hundreds of chars/page (text-native). Threshold = 50 chars/page.
# GENERIC: no per-ticker, no per-form, no allowlist. Any PDF below this is wide-scanned.
LOW_TEXT_DENSITY_THRESHOLD: float = float(
    os.environ.get("BCTC_LOW_TEXT_DENSITY_THRESHOLD", "50.0")
)

# Minimum Tesseract chars per page before triggering PaddleOCR rasterize fallback.
# If Tesseract returns fewer chars than this on a specific page, rasterize + PaddleOCR
# is tried on that page. Threshold = 30 chars (a single line of a BCTC table has ~30+).
# GENERIC: applies to ANY page of ANY PDF, regardless of ticker.
LOW_TESSERACT_PAGE_CHARS: int = int(
    os.environ.get("BCTC_LOW_TESSERACT_PAGE_CHARS", "30")
)

# DPI for PyMuPDF rasterization when PaddleOCR fallback is triggered.
# 200 DPI matches the existing pdf2image/Tesseract DPI (ocr_adapter consistency).
RASTERIZE_DPI: int = int(os.environ.get("BCTC_RASTERIZE_DPI", "200"))

# ---------------------------------------------------------------------------
# FIX-BCTC-BANK-PDF-OCR-RASTERIZE — Module-level helper
# ---------------------------------------------------------------------------


def detect_low_text_density(
    pdf_path: str,
    max_sample_pages: int = 10,
) -> bool:
    """
    Detect whether a PDF is image-only / scanned (low native text density).

    Scans up to max_sample_pages pages using pdfplumber native text extraction
    (no OCR — fast). Returns True when the average chars-per-page is below
    LOW_TEXT_DENSITY_THRESHOLD.

    GENERIC CONTRACT:
      - No ticker, no allowlist, no per-filename logic.
      - Purely structural: any PDF with < LOW_TEXT_DENSITY_THRESHOLD chars/page
        (default 50) is considered image-only and routed to wide-scan + rasterize.
      - Threshold is configurable via BCTC_LOW_TEXT_DENSITY_THRESHOLD env var.

    Args:
        pdf_path:         Absolute path to the PDF file.
        max_sample_pages: Maximum pages to sample (default 10 — enough to decide
                          without reading a 50-page bank PDF entirely).

    Returns:
        True  → low-text-density (image-only / scanned) → wide-scan + rasterize path.
        False → sufficient native text → standard Tesseract-only path unchanged.

    Error handling: any exception (ImportError, corrupt PDF) returns False (safe
    default — standard path runs; worst case is 0 rows, not a crash).
    """
    try:
        import pdfplumber  # type: ignore[import]
    except ImportError:
        logger.warning(
            "detect_low_text_density: pdfplumber not installed — returning False (safe default)"
        )
        return False

    total_chars = 0
    pages_sampled = 0

    try:
        with pdfplumber.open(pdf_path) as pdf:
            sample = pdf.pages[:max_sample_pages]
            for page in sample:
                text = page.extract_text() or ""
                total_chars += len(text)
                pages_sampled += 1
    except Exception as exc:
        logger.warning(
            "detect_low_text_density: error reading %s: %s — returning False",
            pdf_path,
            exc,
        )
        return False

    if pages_sampled == 0:
        return False

    avg_chars_per_page = total_chars / pages_sampled
    is_low = avg_chars_per_page < LOW_TEXT_DENSITY_THRESHOLD

    logger.info(
        "detect_low_text_density: pdf=%s pages_sampled=%d total_chars=%d "
        "avg_chars/page=%.1f threshold=%.1f → low_density=%s",
        pdf_path,
        pages_sampled,
        total_chars,
        avg_chars_per_page,
        LOW_TEXT_DENSITY_THRESHOLD,
        is_low,
    )

    return is_low


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

    FIX-BCTC-BANK-PDF-OCR-RASTERIZE: when detect_low_text_density() is True
    (image-only / scanned PDF), returns ALL pages (capped at _MAX_BS_PAGES) so that
    the correct BS pages are OCR'd even when no BS markers are present in native text.

    ocr_pages() uses pdf2image + pytesseract (Tesseract vie+eng) on the
    specified pages only.

    FIX-BCTC-BANK-PDF-OCR-RASTERIZE: when Tesseract returns < LOW_TESSERACT_PAGE_CHARS
    on a page, falls back to _rasterize_and_ocr_page() (PyMuPDF + PaddleOCR). The result
    with more characters is used. GENERIC — no per-ticker logic.
    """

    def locate_balance_sheet_pages(self, pdf_path: str) -> List[int]:
        """
        Auto-locate balance-sheet pages by scanning native PDF text for Vietnamese markers.

        FIX-BCTC-BANK-PDF-OCR-RASTERIZE wide-scan path:
          If detect_low_text_density(pdf_path) returns True (image-only / scanned PDF),
          pdfplumber can find no BS markers in native text, so the standard marker-scan
          would always fall back to [4,5,6,7]. Instead, return ALL page numbers (up to
          _MAX_BS_PAGES) so that ocr_pages() OCRs the correct pages.

          This is GENERIC — triggered purely by char density, not by ticker or form name.

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

        # ── FIX-BCTC-BANK-PDF-OCR-RASTERIZE: wide-scan for image-only PDFs ──────
        # For scanned / image-only PDFs, pdfplumber.extract_text() returns "" on every
        # page → no BS markers will be found → standard path always falls back to
        # [4,5,6,7]. This is wrong: VCB's balance sheet may start on a different page.
        # Generic fix: detect low text density first. If triggered, return ALL pages
        # up to _MAX_BS_PAGES so OCR covers the actual BS section wherever it lies.
        # GENERIC — no per-ticker, no per-form allowlist. Purely structural detection.
        if detect_low_text_density(pdf_path):
            try:
                with pdfplumber.open(pdf_path) as pdf:
                    total_pages = len(pdf.pages)
            except Exception as exc:
                logger.warning(
                    "PdfOcrAdapter.locate_balance_sheet_pages: cannot open PDF for "
                    "wide-scan page count: %s — using fallback %s",
                    exc,
                    _FALLBACK_PAGES,
                )
                return list(_FALLBACK_PAGES)

            wide_pages = list(range(1, min(total_pages, _MAX_BS_PAGES) + 1))
            logger.info(
                "PdfOcrAdapter.locate_balance_sheet_pages: low-text-density PDF detected "
                "(image-only/scanned) — wide-scan returning pages %s (total_pages=%d)",
                wide_pages,
                total_pages,
            )
            return wide_pages

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

        FIX-BCTC-BANK-PDF-OCR-RASTERIZE rasterize fallback:
          For each page where Tesseract yields < LOW_TESSERACT_PAGE_CHARS chars,
          _rasterize_and_ocr_page() is called (PyMuPDF rasterize at RASTERIZE_DPI DPI
          + PaddleOCR). The result with MORE characters is kept. This covers image-only
          pages where Tesseract via pdf2image yields very few chars due to image quality
          or encoding issues that PaddleOCR handles better.

          GENERIC — no per-ticker logic. Any page below the threshold triggers the fallback.

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

                # ── FIX-BCTC-BANK-PDF-OCR-RASTERIZE: PaddleOCR fallback ──────────
                # When Tesseract yields very few chars (< LOW_TESSERACT_PAGE_CHARS),
                # the page is likely an image-only scan that Tesseract struggles with.
                # Try PyMuPDF rasterize + PaddleOCR and keep whichever result has more
                # characters. GENERIC — no ticker/form/date literals.
                if len(text.strip()) < LOW_TESSERACT_PAGE_CHARS:
                    logger.info(
                        "PdfOcrAdapter: page %d Tesseract yielded %d chars "
                        "(< LOW_TESSERACT_PAGE_CHARS=%d) — trying PaddleOCR rasterize fallback",
                        page_num,
                        len(text.strip()),
                        LOW_TESSERACT_PAGE_CHARS,
                    )
                    try:
                        paddle_text = self._rasterize_and_ocr_page(pdf_path, page_num)
                        if len(paddle_text.strip()) > len(text.strip()):
                            logger.info(
                                "PdfOcrAdapter: page %d PaddleOCR (%d chars) > "
                                "Tesseract (%d chars) — using PaddleOCR result",
                                page_num,
                                len(paddle_text.strip()),
                                len(text.strip()),
                            )
                            text = paddle_text
                        else:
                            logger.info(
                                "PdfOcrAdapter: page %d PaddleOCR (%d chars) <= "
                                "Tesseract (%d chars) — keeping Tesseract result",
                                page_num,
                                len(paddle_text.strip()),
                                len(text.strip()),
                            )
                    except Exception as paddle_exc:
                        logger.warning(
                            "PdfOcrAdapter: page %d PaddleOCR fallback failed: %s "
                            "— keeping Tesseract result (%d chars)",
                            page_num,
                            paddle_exc,
                            len(text.strip()),
                        )

                pages_out.append({"page_number": page_num, "text": text})
                logger.debug(
                    "PdfOcrAdapter: page %d → %d chars of OCR text (final)",
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

    def _rasterize_and_ocr_page(self, pdf_path: str, page_num: int) -> str:
        """
        FIX-BCTC-BANK-PDF-OCR-RASTERIZE: rasterize a single PDF page via PyMuPDF
        and run PaddleOCR on the result.

        Used as a fallback when Tesseract yields < LOW_TESSERACT_PAGE_CHARS on a page.

        Strategy:
          1. Open the PDF with fitz (PyMuPDF) — already in requirements.txt (pymupdf).
          2. Render page at RASTERIZE_DPI DPI → numpy array (RGB).
          3. Run PaddleOCR.ocr(image, cls=False) → text lines.
          4. Join all line texts with newlines and return.

        GENERIC: no per-ticker, no per-form, no date literals. Purely structural.

        Args:
            pdf_path: Absolute path to the PDF file.
            page_num: 1-indexed page number to rasterize and OCR.

        Returns:
            Extracted text string (may be empty if PaddleOCR finds nothing).

        Raises:
            RuntimeError: if fitz or paddleocr cannot be imported (infra misconfiguration).
            Any other exception propagates so the caller (ocr_pages) can log + fall through.
        """
        try:
            import fitz  # type: ignore[import]  # pymupdf
        except ImportError as exc:
            raise RuntimeError(
                f"_rasterize_and_ocr_page: pymupdf (fitz) not installed: {exc}"
            ) from exc

        try:
            from paddleocr import PaddleOCR  # type: ignore[import]
        except ImportError as exc:
            raise RuntimeError(
                f"_rasterize_and_ocr_page: paddleocr not installed: {exc}"
            ) from exc

        # Lazy-init PaddleOCR instance (cached on the adapter instance to avoid
        # repeated model loading — PaddleOCR load is expensive ~5-10s first call).
        if not hasattr(self, "_paddle_ocr_instance") or self._paddle_ocr_instance is None:
            logger.info(
                "_rasterize_and_ocr_page: loading PaddleOCR (lang=en, CPU-only) — first call"
            )
            # use_angle_cls=False: BCTC tables are not rotated.
            # lang='en': PaddleOCR 'en' model handles digits + Latin + basic diacritics.
            # use_gpu=False: enforced — host has no CUDA (D6 Mac host safety).
            self._paddle_ocr_instance = PaddleOCR(
                use_angle_cls=False,
                lang="en",
                use_gpu=False,
                show_log=False,
            )
            logger.info("_rasterize_and_ocr_page: PaddleOCR ready")

        # Rasterize the page via PyMuPDF
        doc = fitz.open(pdf_path)
        try:
            if page_num < 1 or page_num > doc.page_count:
                logger.warning(
                    "_rasterize_and_ocr_page: page_num=%d out of range (PDF has %d pages)",
                    page_num,
                    doc.page_count,
                )
                return ""

            page = doc[page_num - 1]  # 0-indexed internally
            matrix = fitz.Matrix(RASTERIZE_DPI / 72.0, RASTERIZE_DPI / 72.0)
            pix = page.get_pixmap(matrix=matrix)
            # Convert pixmap to numpy array (RGB uint8)
            import numpy as np  # type: ignore[import]
            img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                pix.height, pix.width, pix.n
            )
            # Ensure RGB (not RGBA or grayscale) — PaddleOCR expects 3-channel
            if pix.n == 4:
                img_array = img_array[:, :, :3]
            elif pix.n == 1:
                img_array = np.stack([img_array[:, :, 0]] * 3, axis=-1)
        finally:
            doc.close()

        # Run PaddleOCR
        ocr_result = self._paddle_ocr_instance.ocr(img_array, cls=False)

        # Collect text lines from PaddleOCR result structure:
        # ocr_result: list of pages; each page: list of [[bbox], [text, confidence]]
        lines: List[str] = []
        if ocr_result and ocr_result[0]:
            for item in ocr_result[0]:
                if item and len(item) >= 2:
                    text_conf = item[1]
                    if text_conf and text_conf[0]:
                        word = str(text_conf[0]).strip()
                        if word:
                            lines.append(word)

        result_text = "\n".join(lines)
        logger.info(
            "_rasterize_and_ocr_page: page %d → %d chars via PaddleOCR (%d lines)",
            page_num,
            len(result_text),
            len(lines),
        )
        return result_text
