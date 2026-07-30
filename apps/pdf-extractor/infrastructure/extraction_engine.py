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

from domain.errors import OcrCapacityExceededError, OcrDeadlineExceededError, OcrPageFailedError
from domain.models import ExtractedTable
from domain.repositories import PDFExtractionEngine
from infrastructure import ocr_gateway
from infrastructure.tesseract_config import (
    OCR_RASTER_DPI,
    TESSERACT_LANG,
    TESSERACT_PSM6_CONFIG,
)


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

        FIX-PDFX-TESSERACT-CONCURRENCY: OcrCapacityExceededError /
        OcrDeadlineExceededError raised by the OCR gateway (via _ocr_page)
        are deliberately re-raised THROUGH this method's broad
        `except Exception` — they are backpressure/deadline signals that must
        reach the HTTP layer as 429/503, not the pre-existing "corrupt /
        password-protected PDF -> return ('', 0.0)" fallback.

        FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW: OcrPageFailedError
        (also raised by _ocr_page, for genuine OCR failures — tesseract
        crash, corrupt raster, any OCR exception that is NOT a capacity/
        deadline signal) is re-raised for the same reason: it must reach
        process_pdf()'s `except PDFProcessingError` branch and mark the
        document failed, not be swallowed here into a hollow ('', 0.0)
        "success". The pre-existing "corrupt / password-protected PDF ->
        return ('', 0.0)" fallback below is otherwise UNCHANGED — it only
        covers pdfplumber.open()/page iteration failures, never an OCR call.
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

        except (OcrCapacityExceededError, OcrDeadlineExceededError, OcrPageFailedError):
            # Must propagate — Capacity/Deadline are transport-layer signals
            # (429/503); OcrPageFailedError is a genuine OCR failure that
            # must mark the document failed rather than being swallowed into
            # a hollow ('', 0.0) "success". See docstring note above.
            raise
        except Exception:
            return "", 0.0

        combined = "\n\n--- Page Break ---\n\n".join(text_parts)
        return combined, confidence if text_parts else 0.0

    def _ocr_page(self, page: object) -> str:
        """
        Run Tesseract on a single pdfplumber page image, through the OCR
        concurrency gateway (infrastructure/ocr_gateway.py — THE single
        process-global concurrency bound; see FIX-PDFX-TESSERACT-CONCURRENCY).

        Runs on a worker thread already (this method is only ever reached via
        asyncio.to_thread(self._extract_text_ocr_sync, ...) from
        extract_text_ocr()) — no event loop is available here, so this calls
        the gateway's SYNC entry point (run_image_sync), which still funnels
        through the same BoundedSemaphore + private ThreadPoolExecutor as the
        async entry point.

        Returns empty string if pytesseract/Pillow is not installed (no OCR
        attempt is made — the environment simply lacks the OCR dependency,
        pre-existing behavior, UNCHANGED), OR if the OCR call itself SUCCEEDS
        but yields no/whitespace-only text (a genuinely blank/sparse scanned
        page — also pre-existing behavior, UNCHANGED; see negative-control
        test).

        Raises OcrCapacityExceededError / OcrDeadlineExceededError (transport
        signals — unchanged, see FIX-PDFX-TESSERACT-CONCURRENCY) or, as of
        FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW, OcrPageFailedError
        when the underlying OCR call raises for any OTHER reason (tesseract
        crash, corrupt raster, etc.) — this is a genuine OCR FAILURE, and
        prior behavior of silently returning "" here made it indistinguishable
        from the legitimate-blank-page case above at every downstream read
        site. None of these three are swallowed here — they propagate.
        """
        try:
            import pytesseract  # noqa: F401  (existence check only — real call goes through the gateway)
        except ImportError:
            return ""

        try:
            # page.to_image() returns a pdfplumber PageImage
            img = page.to_image(resolution=OCR_RASTER_DPI)  # type: ignore[attr-defined]
            # Tesseract config — see infrastructure/tesseract_config.py for the
            # single authoritative "DO NOT remove --psm 6" rationale.
            text: str = ocr_gateway.run_image_sync(
                img.original, mode="string", lang=TESSERACT_LANG, config=TESSERACT_PSM6_CONFIG
            )
            return text.strip()
        except (OcrCapacityExceededError, OcrDeadlineExceededError):
            raise
        except Exception as exc:
            # FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW: a genuine OCR
            # failure (tesseract crash, corrupt raster, timeout NOT already
            # covered by the gateway's own OcrDeadlineExceededError, etc.)
            # must NOT be reported as "" — that is byte-indistinguishable
            # from a legitimate blank page and lets a failed page pass the
            # quality gate (services.py) as a hollow "success". Tag it and
            # let it propagate; the caller's docstring explains the chain.
            raise OcrPageFailedError(
                f"OCR failed for page (tesseract/gateway raised {type(exc).__name__}: {exc})"
            ) from exc
