"""
Infrastructure — PdfplumberExtractionEngine.

Implements PDFExtractionEngine port using:
- pdfplumber for table extraction from native PDFs
- pytesseract + Pillow for OCR fallback on scanned pages

Infrastructure layer: knows about pdfplumber/tesseract, never imported by domain/.
"""

import asyncio
import io
from typing import Optional

from domain.models import ExtractedTable
from domain.repositories import PDFExtractionEngine


class PdfplumberExtractionEngine(PDFExtractionEngine):
    """
    Concrete extraction engine: pdfplumber (native) + pytesseract (OCR fallback).

    Both public async methods offload synchronous pdfplumber/pytesseract work to a
    worker thread via asyncio.to_thread(), so the uvicorn event loop stays free to
    serve /health (and other routes) while a long extraction is in progress.

    Pattern mirrors table_push_client.py, alert_adapter.py, layout_first_push_client.py,
    md_table_push_client.py, eval_push_client.py, repositories.py — all use the same
    asyncio.to_thread() offload for blocking I/O.
    """

    # ------------------------------------------------------------------
    # Public async interface (thin wrappers — event-loop-safe)
    # ------------------------------------------------------------------

    async def extract_tables(self, pdf_bytes: bytes) -> list[ExtractedTable]:
        """
        Extract all tables from a PDF buffer.

        Offloads synchronous pdfplumber work to a worker thread so the event loop
        is not blocked during multi-page table extraction.

        Returns an empty list if pdfplumber is unavailable or the PDF has no tables.
        Never raises — callers rely on empty list to detect absence of tables.
        """
        return await asyncio.to_thread(self._extract_tables_sync, pdf_bytes)

    async def extract_text_ocr(self, pdf_bytes: bytes) -> tuple[str, float]:
        """
        Extract text from PDF, using OCR as fallback for scanned pages.

        Offloads synchronous pdfplumber + pytesseract work to a worker thread so the
        event loop is not blocked during OCR processing.

        Returns:
            (combined_text, confidence) where confidence in [0.0, 1.0]
        """
        return await asyncio.to_thread(self._extract_text_ocr_sync, pdf_bytes)

    # ------------------------------------------------------------------
    # Private sync helpers (run on worker thread via asyncio.to_thread)
    # ------------------------------------------------------------------

    def _extract_tables_sync(self, pdf_bytes: bytes) -> list[ExtractedTable]:
        """
        Synchronous body of extract_tables — runs on a worker thread.

        Each call creates its own BytesIO + pdfplumber handle; thread-safe.
        """
        try:
            import pdfplumber  # type: ignore[import]
        except ImportError:
            return []

        tables: list[ExtractedTable] = []
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    page_tables = page.extract_tables()
                    if not page_tables:
                        continue
                    for table_idx, table in enumerate(page_tables):
                        if not table:
                            continue
                        # First row used as headers; empty cells coerced to ""
                        headers: list[str] = [
                            str(cell) if cell is not None else ""
                            for cell in (table[0] if table else [])
                        ]
                        rows: list[list[str]] = [
                            [str(cell) if cell is not None else "" for cell in row]
                            for row in table[1:]
                        ]
                        tables.append(
                            ExtractedTable(
                                table_index=table_idx,
                                headers=headers,
                                rows=rows,
                                page_number=page_num,
                            )
                        )
        except Exception:
            # Corrupt / password-protected PDF — return what we have
            pass

        return tables

    def _extract_text_ocr_sync(self, pdf_bytes: bytes) -> tuple[str, float]:
        """
        Synchronous body of extract_text_ocr — runs on a worker thread.

        Strategy:
        1. Try native text extraction via pdfplumber (fast, high confidence).
        2. If a page has < 50 chars of native text, run Tesseract OCR on that page.
        3. Aggregate all page texts, track minimum confidence.

        Each call creates its own BytesIO + pdfplumber handle; thread-safe.
        """
        try:
            import pdfplumber  # type: ignore[import]
        except ImportError:
            return "", 0.0

        text_parts: list[str] = []
        confidence = 1.0  # optimistic; reduced if OCR is used

        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    native_text: Optional[str] = page.extract_text()

                    if native_text and len(native_text.strip()) >= 50:
                        text_parts.append(native_text)
                    else:
                        # OCR fallback — requires Tesseract + Pillow
                        ocr_text = self._ocr_page(page)
                        if ocr_text:
                            text_parts.append(ocr_text)
                            confidence = min(confidence, 0.8)
                        elif native_text:
                            text_parts.append(native_text)
                            confidence = min(confidence, 0.3)
                        else:
                            confidence = min(confidence, 0.3)

        except Exception:
            return "", 0.0

        combined = "\n\n--- Page Break ---\n\n".join(text_parts)
        return combined, confidence if text_parts else 0.0

    def _ocr_page(self, page: object) -> str:
        """
        Run Tesseract on a single pdfplumber page image.

        Returns empty string if pytesseract or Pillow is not installed.
        """
        try:
            import pytesseract  # type: ignore[import]
        except ImportError:
            return ""

        try:
            # page.to_image() returns a pdfplumber PageImage
            img = page.to_image(resolution=200)  # type: ignore[attr-defined]
            # --psm 6: single uniform block — reads line-by-line (inline layout).
            # Matches spike/fpt_balance_sheet_eval.py:160 and ocr_adapter.py.
            # DO NOT remove config= arg: psm 3 (Tesseract default) triggers
            # column segmentation → scrambled BCTC output (drift #4).
            text: str = pytesseract.image_to_string(
                img.original, lang="vie+eng", config="--psm 6"
            )
            return text.strip()
        except Exception:
            return ""
