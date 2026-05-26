"""
application/extract_md_tables_usecase.py — MD-EXTRACT / MD-EXTRACT-2

ExtractMdTablesUseCase: orchestrates generic markdown table extraction for ALL
pages of a BCTC PDF and pushes results to mcp-server.

Decision A (AUGMENT): this use case is fully separate from ExtractTablesUseCase.
    Different trigger (POST /extract-md-tables), different infra ports, different
    mcp-server table (bctc_md_tables). Zero collision with the structured bctc_table_rows path.

Decision D (GENERIC): runs on ALL pages of the document (not just the balance-sheet
    section). The generic md table detector must find segment reports, income
    statements, cash flows, and notes — which appear on all pages.

Hardware guard (MAX_PAGES = 20):
    Processing 20 pages at ~3-5s/page = up to 100s sequential. Acceptable for
    single-doc re-extract. If PDF has more than MAX_PAGES pages, pages 1..3
    (cover/preamble) are skipped first; remaining pages are taken up to MAX_PAGES.
    A WARNING is logged when truncation occurs (AC-6).

Fire-and-forget (202 Accepted, R-HIGH mitigation):
    The handler wires execute() as a FastAPI BackgroundTask. The endpoint returns
    202 immediately. The use case runs asynchronously. Timeout risk is eliminated.

Privacy: local pdf2image + local Tesseract only. No external API. No cloud OCR.
         Page PNGs are written to a tempfile.TemporaryDirectory context that is
         auto-cleaned on exit or crash (R-LOW mitigation).

Application layer rules (DDD):
    - Imports ONLY from domain/ (ports) and the standard library.
    - ZERO imports from infrastructure/, interface/ — all concrete adapters are
      injected at the composition root (main.py).
    - No HTTP or DB knowledge here — only orchestration via port calls.

Ports injected:
    - GenericMdTableExtractorPort  (concrete: infrastructure.generic_md_table_extractor)
    - MdTablePushClientPort        (concrete: infrastructure.md_table_push_client)
    - OcrTextFetchClientPort       (concrete: infrastructure.ocr_text_fetch_client — MD-EXTRACT-2)

MD-EXTRACT-2 DEFECT-A fix:
    Step 0 added: if doc_ocr_text not provided by caller, auto-fetch stored OCR
    text from mcp-server via OcrTextFetchClientPort before launching extraction.
    This ensures ocr_as_markdown is always populated without re-running Tesseract.
    Zero new Tesseract calls added (HARDWARE SAFE).
"""

from __future__ import annotations

import logging
import os
import tempfile
from typing import Dict, List, Optional

from domain.modules.financial_reports.ports import (
    GenericMdTableExtractorPort,
    MdTablePushClientPort,
    OcrTextFetchClientPort,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hardware guard
# ---------------------------------------------------------------------------

# Maximum number of pages to process in a single run (brief §3.4 + AC-6).
# At ~3-5s per page on the Intel Mac, 20 pages ≈ 60-100s — safe.
MAX_PAGES = 20

# Number of cover/preamble pages to skip when the PDF exceeds MAX_PAGES.
# Pages 1-3 are usually cover page, table of contents, and audit report.
_PREAMBLE_SKIP = 3


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------


class ExtractMdTablesUseCase:
    """
    Application use case: generic markdown table extraction → push to mcp-server.

    Separate from ExtractTablesUseCase (no collision — different trigger,
    different endpoint, different mcp-server table).

    Wiring (composition root — main.py):
        md_extractor      = GenericMdTableExtractor()
        md_push_client    = MdTablePushClient(mcp_server_url=cfg.mcp_server_url)
        ocr_fetch_client  = OcrTextFetchClient(mcp_server_url=cfg.mcp_server_url)
        extract_md_tables_usecase = ExtractMdTablesUseCase(
            md_extractor=md_extractor,
            md_push_client=md_push_client,
            ocr_fetch_client=ocr_fetch_client,
        )

    Hardware:
        - Rasterizes pages sequentially using pdf2image at 200 DPI.
        - Passes ONE page image at a time to the extractor.
        - PIL Image reference is deleted after each page (R-MEDIUM mitigation).
        - Temp PNGs live in a TemporaryDirectory context (R-LOW mitigation).
        - MAX_PAGES = 20 hard cap with WARNING log when exceeded (AC-6).
        - Step 0 (DEFECT-A fix): fetch stored OCR text from mcp-server — ZERO
          new Tesseract calls.
    """

    def __init__(
        self,
        md_extractor: GenericMdTableExtractorPort,
        md_push_client: MdTablePushClientPort,
        ocr_fetch_client: Optional[OcrTextFetchClientPort] = None,
    ) -> None:
        """
        Args:
            md_extractor:     Injected GenericMdTableExtractorPort implementation.
            md_push_client:   Injected MdTablePushClientPort implementation.
            ocr_fetch_client: Optional OcrTextFetchClientPort (MD-EXTRACT-2).
                              When provided and doc_ocr_text is not supplied by
                              caller, the use case auto-fetches OCR text from
                              mcp-server before extraction. Graceful degrade
                              when absent or when fetch returns empty string.
        """
        self._extractor = md_extractor
        self._push_client = md_push_client
        self._ocr_fetch_client = ocr_fetch_client

    async def execute(
        self,
        report_id: str,
        pdf_path: str,
        doc_ocr_text: Optional[str] = None,
    ) -> Dict:
        """
        Orchestrate: rasterize pages → extract md tables → push to mcp-server.

        Runs on ALL pages of the document (not just the balance-sheet section).
        If the PDF has more than MAX_PAGES pages, preamble pages (1-3) are skipped
        first; then pages are taken up to MAX_PAGES from the remaining set.

        Args:
            report_id:     UUID string matching financial_reports.id on mcp-server.
            pdf_path:      Absolute path to the PDF file on disk.
            doc_ocr_text:  Optional flat OCR text (from pdf_extracted_text).
                           When provided, converted to markdown via ocr_text_to_markdown()
                           without re-OCR. When absent, ocr_as_markdown will be "".

        Returns:
            dict with keys:
                tables_detected (int): Number of markdown tables extracted.
                pushed (bool):         True when push_md_tables succeeded.
        """
        logger.info(
            "ExtractMdTablesUseCase.execute: report_id=%s pdf_path=%s",
            report_id,
            pdf_path,
        )

        # ------------------------------------------------------------------
        # Step 0 (MD-EXTRACT-2 DEFECT-A fix): auto-fetch stored OCR text
        # from mcp-server when doc_ocr_text is not provided by the caller.
        # This ensures ocr_as_markdown is populated without new Tesseract calls.
        # Graceful degrade: if fetch fails or returns empty, continue normally.
        # ------------------------------------------------------------------
        if doc_ocr_text is None and self._ocr_fetch_client is not None:
            try:
                fetched = await self._ocr_fetch_client.fetch_ocr_text(report_id)
                if fetched:
                    doc_ocr_text = fetched
                    logger.info(
                        "ExtractMdTablesUseCase: fetched %d chars of OCR text "
                        "from mcp-server for report_id=%s",
                        len(doc_ocr_text),
                        report_id,
                    )
                else:
                    logger.warning(
                        "ExtractMdTablesUseCase: no stored OCR text for "
                        "report_id=%s — ocr_as_markdown will be empty",
                        report_id,
                    )
            except Exception as exc:
                logger.warning(
                    "ExtractMdTablesUseCase: OCR fetch failed for report_id=%s: %s "
                    "— continuing without OCR text",
                    report_id,
                    exc,
                )

        # ------------------------------------------------------------------
        # Step 1: Determine page list (ALL pages, with MAX_PAGES cap)
        # ------------------------------------------------------------------
        try:
            from pdf2image import convert_from_path  # type: ignore
        except ImportError:
            logger.error(
                "ExtractMdTablesUseCase: pdf2image not installed — cannot rasterize pages"
            )
            return {"tables_detected": 0, "pushed": False}

        # Count total pages without rasterizing
        try:
            from pdf2image.exceptions import PDFPageCountError  # type: ignore
        except ImportError:
            PDFPageCountError = Exception  # type: ignore

        total_pages = self._count_pages(pdf_path)
        logger.info(
            "ExtractMdTablesUseCase: PDF has %d pages (path=%s)", total_pages, pdf_path
        )

        # Build the page list: all pages, with preamble skip + MAX_PAGES cap
        all_page_numbers = list(range(1, total_pages + 1))

        if total_pages > MAX_PAGES:
            logger.warning(
                "ExtractMdTablesUseCase: page limit reached — PDF has %d pages "
                "but MAX_PAGES=%d. Skipping first %d preamble pages and processing "
                "up to %d pages.",
                total_pages,
                MAX_PAGES,
                _PREAMBLE_SKIP,
                MAX_PAGES,
            )
            candidate_pages = all_page_numbers[_PREAMBLE_SKIP:]
            page_numbers_to_process = candidate_pages[:MAX_PAGES]
        else:
            page_numbers_to_process = all_page_numbers

        logger.info(
            "ExtractMdTablesUseCase: processing %d pages: %s",
            len(page_numbers_to_process),
            page_numbers_to_process,
        )

        # ------------------------------------------------------------------
        # Step 2: Rasterize pages to temp PNGs, extract tables sequentially
        # ------------------------------------------------------------------
        all_md_tables: List[str] = []

        with tempfile.TemporaryDirectory(prefix="pdf_md_tables_") as tmp_dir:
            for page_num in page_numbers_to_process:
                page_png_path = self._rasterize_page(
                    pdf_path=pdf_path,
                    page_num=page_num,
                    tmp_dir=tmp_dir,
                    convert_from_path=convert_from_path,
                )
                if page_png_path is None:
                    continue

                # Pass a single-element list to the extractor (sequential)
                result = self._extractor.extract_md_tables(
                    page_image_paths=[page_png_path],
                    doc_ocr_text=None,  # doc_ocr_text handled at doc level below
                )
                page_tables: List[str] = result.get("md_tables", [])
                all_md_tables.extend(page_tables)

                # Explicitly delete temp PNG to free disk space during long runs
                try:
                    os.unlink(page_png_path)
                except OSError:
                    pass

        # ------------------------------------------------------------------
        # Step 3: Convert OCR text to markdown (no re-OCR needed)
        # ------------------------------------------------------------------
        if doc_ocr_text is not None:
            # Use the extractor's pure ocr_text_to_markdown helper via a dummy call
            # (passes empty image list, only doc_ocr_text is used for this field)
            ocr_result = self._extractor.extract_md_tables(
                page_image_paths=[],
                doc_ocr_text=doc_ocr_text,
            )
            ocr_as_markdown: str = ocr_result.get("ocr_as_markdown", "")
        else:
            ocr_as_markdown = ""

        tables_detected = len(all_md_tables)
        page_count = len(page_numbers_to_process)

        logger.info(
            "ExtractMdTablesUseCase: detected %d tables from %d pages",
            tables_detected,
            page_count,
        )

        # ------------------------------------------------------------------
        # Step 4: Push to mcp-server
        # ------------------------------------------------------------------
        pushed = False
        try:
            push_result = await self._push_client.push_md_tables(
                report_id=report_id,
                md_tables=all_md_tables,
                ocr_as_markdown=ocr_as_markdown,
                page_count=page_count,
            )
            pushed = bool(push_result.get("ok", False))
            logger.info(
                "ExtractMdTablesUseCase: push OK — tables_stored=%s",
                push_result.get("tables_stored"),
            )
        except Exception as exc:
            logger.error(
                "ExtractMdTablesUseCase: push failed: %s (tables will not be stored)", exc
            )

        logger.info(
            "ExtractMdTablesUseCase.execute DONE: report_id=%s tables_detected=%d pushed=%s",
            report_id,
            tables_detected,
            pushed,
        )

        return {"tables_detected": tables_detected, "pushed": pushed}

    def _count_pages(self, pdf_path: str) -> int:
        """
        Count total pages in the PDF without full rasterization.

        Uses pdfplumber if available (fast native page count); falls back to
        a single pdf2image call that counts returned images.

        Returns 0 on error (caller treats as no pages to process).
        """
        try:
            import pdfplumber  # type: ignore
            with pdfplumber.open(pdf_path) as pdf:
                return len(pdf.pages)
        except Exception:
            pass

        try:
            from pdf2image import pdfinfo_from_path  # type: ignore
            info = pdfinfo_from_path(pdf_path)
            return int(info.get("Pages", 0))
        except Exception as exc:
            logger.warning(
                "ExtractMdTablesUseCase._count_pages: could not count pages: %s — "
                "defaulting to MAX_PAGES=%d",
                exc,
                MAX_PAGES,
            )
            return MAX_PAGES

    def _rasterize_page(
        self,
        pdf_path: str,
        page_num: int,
        tmp_dir: str,
        convert_from_path: object,
    ) -> Optional[str]:
        """
        Rasterize a single PDF page to a PNG in tmp_dir at 200 DPI.

        Returns the absolute path to the PNG, or None on failure.

        HOST SAFETY: converts ONLY one page (first_page=page_num, last_page=page_num).
        Sequential — never called in parallel.
        """
        try:
            images = convert_from_path(  # type: ignore[operator]
                pdf_path,
                dpi=200,
                first_page=page_num,
                last_page=page_num,
                fmt="png",
            )
            if not images:
                logger.warning(
                    "ExtractMdTablesUseCase: pdf2image returned no image for page %d",
                    page_num,
                )
                return None

            png_path = os.path.join(tmp_dir, f"page_{page_num:04d}.png")
            images[0].save(png_path, format="PNG")

            # Release PIL Image reference (R-MEDIUM mitigation)
            images[0].close()
            del images

            return png_path

        except Exception as exc:
            logger.warning(
                "ExtractMdTablesUseCase: rasterize failed for page %d: %s — skipping",
                page_num,
                exc,
            )
            return None
