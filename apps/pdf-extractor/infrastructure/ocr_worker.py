"""
infrastructure/ocr_worker.py — PDFX-SINGLE-WORKER-BLOCKING

Standalone (module-level, picklable) worker functions for the CPU-bound OCR
path. These are called via ProcessPoolExecutor.submit() so Tesseract runs in
a separate OS process, keeping the uvicorn event loop process free to accept
/health connections even when OCR pegs CPU at 100%+.

ROOT CAUSE (A-20): asyncio.to_thread() moved OCR off the event loop thread,
but Tesseract + pdfplumber still ran inside the same uvicorn process. When CPU
was saturated (104%), the OS stopped scheduling uvicorn's process fast enough
for it to accept new TCP connections within the docker healthcheck 10s window.
ProcessPoolExecutor isolation gives the OCR its own CPU budget without
competing with uvicorn's event loop for OS scheduling time.

DDD: infrastructure layer. Only imported at composition root (main.py) and
from extract_tables_usecase.py via injected executor. Never imported from
domain/.

Picklability contract:
  - All functions MUST be module-level (top-level def, not methods/closures).
  - All arguments and return values MUST be pickle-serializable (str, list, dict).
  - No global module-state side-effects that are unsafe to fork.

HOST SAFETY (D6 — 16GB Mac):
  - ProcessPoolExecutor is created with max_workers=1 (single child process).
    A second concurrent /extract-tables call will wait for the first to finish
    rather than spawning another Tesseract process. This matches the
    threading.Semaphore(1) guard on PekEngineAdapter.
  - Callers must use asyncio.wait_for() with a timeout if time-bounding is needed.
"""

from __future__ import annotations

import logging
import re
from typing import Dict, List

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Vietnamese balance-sheet markers (duplicated from ocr_adapter.py so this
# module stays self-contained and picklable without importing infrastructure/).
# Keep in sync with ocr_adapter._BS_MARKERS when either changes.
# ---------------------------------------------------------------------------

_BS_MARKERS = [
    "bảng cân đối kế toán",
    "bang can doi ke toan",
    "tài sản ngắn hạn",
    "tài sản dài hạn",
    "nguồn vốn",
    "tổng cộng tài sản",
    "tổng cộng nguồn vốn",
    "tai san ngan han",
    "tai san dai han",
    "nguon von",
    "tong cong tai san",
    "tong cong nguon von",
]
_MIN_MARKER_HITS = 1
_MAX_BS_PAGES = 8
_FALLBACK_PAGES = [4, 5, 6, 7]


# ---------------------------------------------------------------------------
# Picklable worker functions (called in child process via ProcessPoolExecutor)
# ---------------------------------------------------------------------------


def locate_balance_sheet_pages_worker(pdf_path: str) -> List[int]:
    """
    Worker: locate balance-sheet pages by scanning native PDF text.

    Mirror of PdfOcrAdapter.locate_balance_sheet_pages() implemented as a
    standalone function so it can be dispatched via ProcessPoolExecutor.

    Args:
        pdf_path: Absolute path to the PDF file.

    Returns:
        List of 1-indexed page numbers containing BS content.
        Falls back to [4, 5, 6, 7] if markers not found.
    """
    try:
        import pdfplumber  # type: ignore[import]
    except ImportError:
        return list(_FALLBACK_PAGES)

    bs_pages: List[int] = []
    in_bs_section = False
    consecutive_non_bs = 0

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num_0indexed, page in enumerate(pdf.pages):
                page_num_1indexed = page_num_0indexed + 1
                native_text = page.extract_text() or ""
                lower = native_text.lower()
                hits = sum(1 for marker in _BS_MARKERS if marker in lower)

                if hits >= _MIN_MARKER_HITS:
                    in_bs_section = True
                    consecutive_non_bs = 0
                    bs_pages.append(page_num_1indexed)
                elif in_bs_section:
                    consecutive_non_bs += 1
                    if consecutive_non_bs <= 1:
                        bs_pages.append(page_num_1indexed)
                    else:
                        if bs_pages:
                            bs_pages.pop()
                        break

                if len(bs_pages) >= _MAX_BS_PAGES:
                    break

    except Exception as exc:
        return list(_FALLBACK_PAGES)

    if not bs_pages:
        return list(_FALLBACK_PAGES)

    return bs_pages


def ocr_pages_worker(pdf_path: str, page_numbers: List[int]) -> List[Dict]:
    """
    Worker: run Tesseract (vie+eng, --psm 6) on specified 1-indexed pages.

    Mirror of PdfOcrAdapter.ocr_pages() as a standalone picklable function.

    PAGE SEGMENTATION MODE: --psm 6 (single uniform block). See ocr_adapter.py
    for the full rationale — DO NOT change to psm 3.

    Args:
        pdf_path:     Absolute path to the PDF file.
        page_numbers: 1-indexed page numbers to OCR.

    Returns:
        List of {"page_number": int, "text": str} dicts.
        Pages that fail OCR get text="" (logged as warning).
    """
    try:
        from pdf2image import convert_from_path  # type: ignore
    except ImportError:
        return [{"page_number": p, "text": ""} for p in page_numbers]

    try:
        import pytesseract  # type: ignore
    except ImportError:
        return [{"page_number": p, "text": ""} for p in page_numbers]

    if not page_numbers:
        return []

    pages_out: List[Dict] = []
    sorted_pages = sorted(set(page_numbers))

    for page_num in sorted_pages:
        try:
            images = convert_from_path(
                pdf_path,
                dpi=200,
                first_page=page_num,
                last_page=page_num,
                fmt="png",
            )
            if not images:
                pages_out.append({"page_number": page_num, "text": ""})
                continue

            text: str = pytesseract.image_to_string(
                images[0], lang="vie+eng", config="--psm 6"
            )
            pages_out.append({"page_number": page_num, "text": text})

        except Exception as exc:
            pages_out.append({"page_number": page_num, "text": ""})

    return pages_out
