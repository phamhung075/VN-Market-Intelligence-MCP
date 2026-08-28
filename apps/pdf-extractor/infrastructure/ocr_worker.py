# size-justification: ~580L — ProcessPoolExecutor worker module: 4 module-level picklable worker functions (detect_low_text_density, rasterize+OCR, balance-sheet locator, ocr_pages) + shared helpers; legitimately grew via reviewed fixes (executor recycle + per-doc PaddleOCR rescue budget 1db5f9f81, orientation integration 905e32be1, wide-scan + PaddleOCR fallback 734ab5d51). The picklable-module-level contract (ProcessPoolExecutor.submit) makes class extraction a rework, not a cleanup.
"""
infrastructure/ocr_worker.py — PDFX-SINGLE-WORKER-BLOCKING + FIX-BCTC-BANK-PDF-OCR-RASTERIZE

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

FIX-BCTC-BANK-PDF-OCR-RASTERIZE (2026-06-15):
  Root cause (mirror): locate_balance_sheet_pages_worker() ran only native-text
  marker scan. Scanned/image-only bank PDFs (VCB, CTG) have 0 native chars →
  no BS markers → always fell back to [4,5,6,7] → Tesseract on those pages
  yielded few chars → 0 rows parsed.

  Fix (two layers — mirrors ocr_adapter.py exactly):
  Layer 1 (locate): detect_low_text_density_worker() → if True, wide-scan returns
    all pages [1.._MAX_BS_PAGES]. GENERIC — no per-ticker logic.
  Layer 2 (ocr): when Tesseract yields < LOW_TESSERACT_PAGE_CHARS on a page,
    _rasterize_and_ocr_page_worker() rasterizes via PyMuPDF at RASTERIZE_DPI DPI
    and runs PaddleOCR. Keep the result with more characters. GENERIC.

  Non-regression: text-native PDFs (FPT, VNM) have >>50 chars/page →
  detect_low_text_density_worker returns False → unchanged Tesseract-only path.

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

SYNC RULE: whenever ocr_adapter.py changes LOW_TEXT_DENSITY_THRESHOLD,
  LOW_TESSERACT_PAGE_CHARS, RASTERIZE_DPI, _BS_MARKERS, _MIN_MARKER_HITS,
  _MAX_BS_PAGES, or _FALLBACK_PAGES, update the mirror constants here too.
  The worker runs in a subprocess that does NOT import ocr_adapter, so any
  drift between the two files produces split-brain behaviour.
"""

from __future__ import annotations

import logging
import os
from typing import Dict, List

from infrastructure.tesseract_config import (
    OCR_RASTER_DPI,
    TESSERACT_LANG,
    TESSERACT_PSM6_CONFIG,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FIX-BCTC-BANK-PDF-OCR-RASTERIZE — Generic low-text-density constants
# (mirrors ocr_adapter.py — keep in sync)
# ---------------------------------------------------------------------------

LOW_TEXT_DENSITY_THRESHOLD: float = float(
    os.environ.get("BCTC_LOW_TEXT_DENSITY_THRESHOLD", "50.0")
)
LOW_TESSERACT_PAGE_CHARS: int = int(
    os.environ.get("BCTC_LOW_TESSERACT_PAGE_CHARS", "30")
)
RASTERIZE_DPI: int = int(os.environ.get("BCTC_RASTERIZE_DPI", "200"))

# ---------------------------------------------------------------------------
# FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM (worker-recycling amendment,
# 2026-08-26) — per-document PaddleOCR rescue-fire budget.
#
# max_tasks_per_child=1 on the ocr_executor (main.py) recycles this process
# BETWEEN tasks, but ocr_pages_worker loops over every rescue fire INSIDE one
# uninterruptible task (application/extract_tables_usecase.py submits exactly
# one ocr_pages_worker call per document). Recycling cannot bound a single
# pathological document's own accumulated fires — this budget is the safety
# belt for that intra-task case. Default 4 is PROVISIONAL pending AC-3 (a
# real fire-count sweep against this module's own _paddle_ocr_worker_instance
# call site — never measured directly; see the design brief's evidence-
# provenance note before citing any number here as a measurement of THIS
# mechanism).
BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT: int = int(
    os.environ.get("BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT", "4")
)

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

# Module-level PaddleOCR instance cache for the subprocess (avoids reload per page).
_paddle_ocr_worker_instance = None


def _malloc_trim_or_noop() -> None:
    """
    Best-effort glibc malloc_trim(0) — returns freed native-allocator arena
    pages back to the OS. FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM
    (worker-recycling amendment, 2026-08-26) §5: attacks the INTRA-document
    compounding that max_tasks_per_child recycling structurally cannot reach
    (recycling only bounds cross-task/cross-document retention). Same
    ctypes.CDLL("libc.so.6") shape already shipped twice — interface/
    pek_run_helper.py's _malloc_trim_or_noop and interface/routes_extract.py's
    call site. Duplicated here (not imported) because this module must stay
    self-contained and picklable for the ProcessPoolExecutor child — it does
    not import interface/ (a higher DDD layer).

    Guarded: "libc.so.6" only resolves on glibc-based Linux (the production
    container's actual runtime) — macOS dev/test host, musl/Alpine, etc.
    raise OSError/AttributeError here, caught and treated as a silent no-op.
    """
    try:
        import ctypes

        libc = ctypes.CDLL("libc.so.6")
        libc.malloc_trim(0)
    except (OSError, AttributeError):
        pass  # non-glibc platform (e.g. macOS dev/test host) — nothing to trim


# ---------------------------------------------------------------------------
# Picklable worker functions (called in child process via ProcessPoolExecutor)
# ---------------------------------------------------------------------------


def detect_low_text_density_worker(
    pdf_path: str,
    max_sample_pages: int = 10,
) -> bool:
    """
    Worker: detect whether a PDF is image-only / scanned (low native text density).

    Mirror of detect_low_text_density() from ocr_adapter.py — implemented as a
    standalone picklable function so it can run in the ProcessPoolExecutor subprocess
    without importing infrastructure.ocr_adapter.

    Returns True when average native chars/page < LOW_TEXT_DENSITY_THRESHOLD.
    Returns False on any error (safe default — standard path runs).

    GENERIC: no per-ticker, no allowlist, no date literals.
    """
    try:
        import pdfplumber  # type: ignore[import]
    except ImportError:
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
    except Exception:
        return False

    if pages_sampled == 0:
        return False

    avg_chars_per_page = total_chars / pages_sampled
    is_low = avg_chars_per_page < LOW_TEXT_DENSITY_THRESHOLD

    logger.info(
        "detect_low_text_density_worker: pdf=%s pages_sampled=%d total_chars=%d "
        "avg_chars/page=%.1f threshold=%.1f → low_density=%s",
        pdf_path,
        pages_sampled,
        total_chars,
        avg_chars_per_page,
        LOW_TEXT_DENSITY_THRESHOLD,
        is_low,
    )

    return is_low


def _rasterize_and_ocr_page_worker(pdf_path: str, page_num: int) -> str:
    """
    Worker: rasterize a single PDF page via PyMuPDF and run PaddleOCR.

    Mirror of PdfOcrAdapter._rasterize_and_ocr_page() — implemented as a
    standalone picklable function so it can run in the ProcessPoolExecutor subprocess.

    Used as fallback when Tesseract yields < LOW_TESSERACT_PAGE_CHARS on a page.

    GENERIC: no per-ticker, no per-form, no date literals.

    Args:
        pdf_path: Absolute path to the PDF file.
        page_num: 1-indexed page number to rasterize and OCR.

    Returns:
        Extracted text string (may be empty if PaddleOCR finds nothing or errors).
    """
    global _paddle_ocr_worker_instance  # noqa: PLW0603

    try:
        import fitz  # type: ignore[import]  # pymupdf
    except ImportError:
        logger.error("_rasterize_and_ocr_page_worker: pymupdf (fitz) not installed")
        return ""

    try:
        from paddleocr import PaddleOCR  # type: ignore[import]
    except ImportError:
        logger.error("_rasterize_and_ocr_page_worker: paddleocr not installed")
        return ""

    try:
        import numpy as np  # type: ignore[import]
    except ImportError:
        logger.error("_rasterize_and_ocr_page_worker: numpy not installed")
        return ""

    # PaddleOCR instance — module-level cache in subprocess (process lives for
    # the duration of the ProcessPoolExecutor; safe to cache here).
    if _paddle_ocr_worker_instance is None:
        logger.info(
            "_rasterize_and_ocr_page_worker: loading PaddleOCR (lang=vi, CPU-only) — first call"
        )
        # use_angle_cls=False: DELIBERATE — the old "BCTC tables are not rotated"
        # premise is FALSE and is gone (FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-
        # BCTC-PAGES-READ-UPSIDE-DOWN). Rotation is corrected on the rasterized
        # pixels below via infrastructure/ocr_orientation, one OSD probe per page,
        # instead of PaddleOCR's per-text-line angle-classifier CNN.
        # lang='vi': PEK-OCR-ROOTCAUSE — was "en", whose rec-model character dictionary has
        # no Vietnamese diacritics and cannot emit them. BCTC text requires the Vietnamese
        # model; mirrors the same fix already applied to ocr_adapter.py and the table path
        # (pek_engine_adapter.py).
        _paddle_ocr_worker_instance = PaddleOCR(
            use_angle_cls=False,
            lang="vi",
            use_gpu=False,
            show_log=False,
        )
        logger.info("_rasterize_and_ocr_page_worker: PaddleOCR ready")

    try:
        doc = fitz.open(pdf_path)
        try:
            if page_num < 1 or page_num > doc.page_count:
                logger.warning(
                    "_rasterize_and_ocr_page_worker: page_num=%d out of range (PDF has %d pages)",
                    page_num,
                    doc.page_count,
                )
                return ""

            page = doc[page_num - 1]  # 0-indexed internally
            matrix = fitz.Matrix(RASTERIZE_DPI / 72.0, RASTERIZE_DPI / 72.0)
            pix = page.get_pixmap(matrix=matrix)
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

        # FIX-PDFX-OCR-ORIENTATION AC-2 site 2/3 (PaddleOCR fallback read).
        from infrastructure.ocr_orientation import correct_orientation

        img_array, _orientation_deg = correct_orientation(img_array)
        if _orientation_deg:
            logger.info(
                "_rasterize_and_ocr_page_worker: page %d rotated %d deg clockwise "
                "before OCR (orientation auto-detected)",
                page_num,
                _orientation_deg,
            )

        ocr_result = _paddle_ocr_worker_instance.ocr(img_array, cls=False)

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
            "_rasterize_and_ocr_page_worker: page %d → %d chars via PaddleOCR (%d lines)",
            page_num,
            len(result_text),
            len(lines),
        )
        return result_text

    except Exception as exc:
        logger.warning(
            "_rasterize_and_ocr_page_worker: page %d error: %s — returning empty",
            page_num,
            exc,
        )
        return ""


def locate_balance_sheet_pages_worker(pdf_path: str) -> List[int]:
    """
    Worker: locate balance-sheet pages by scanning native PDF text.

    Mirror of PdfOcrAdapter.locate_balance_sheet_pages() implemented as a
    standalone function so it can be dispatched via ProcessPoolExecutor.

    FIX-BCTC-BANK-PDF-OCR-RASTERIZE wide-scan path:
      If detect_low_text_density_worker() returns True (image-only / scanned PDF),
      pdfplumber finds no BS markers in native text → standard scan would always
      return [4,5,6,7]. Instead, return ALL page numbers up to _MAX_BS_PAGES so
      OCR covers the actual BS section wherever it lies.
      GENERIC — triggered purely by char density, not by ticker or form name.

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

    # ── FIX-BCTC-BANK-PDF-OCR-RASTERIZE: wide-scan for image-only PDFs ──────
    # Scanned PDFs have no native text → no BS markers → old code always returned
    # [4,5,6,7]. Generic fix: detect low density first; if triggered, return ALL
    # pages up to _MAX_BS_PAGES. GENERIC — no per-ticker, no allowlist.
    if detect_low_text_density_worker(pdf_path):
        try:
            with pdfplumber.open(pdf_path) as pdf:
                total_pages = len(pdf.pages)
        except Exception:
            return list(_FALLBACK_PAGES)

        wide_pages = list(range(1, min(total_pages, _MAX_BS_PAGES) + 1))
        logger.info(
            "locate_balance_sheet_pages_worker: low-text-density PDF detected "
            "→ wide-scan %d pages %s",
            len(wide_pages),
            wide_pages,
        )
        return wide_pages

    # ── Standard marker-scan path (text-native PDFs) ─────────────────────────
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

    except Exception:
        return list(_FALLBACK_PAGES)

    if not bs_pages:
        return list(_FALLBACK_PAGES)

    return bs_pages


def ocr_pages_worker(pdf_path: str, page_numbers: List[int]) -> List[Dict]:
    """
    Worker: run Tesseract (vie+eng, --psm 6) on specified 1-indexed pages.

    Mirror of PdfOcrAdapter.ocr_pages() as a standalone picklable function.

    PAGE SEGMENTATION MODE: config sourced from infrastructure/tesseract_config.py
    (single authoritative "DO NOT remove --psm 6" warning — see that module).

    FIX-BCTC-BANK-PDF-OCR-RASTERIZE rasterize fallback:
      For each page where Tesseract yields < LOW_TESSERACT_PAGE_CHARS chars,
      _rasterize_and_ocr_page_worker() is called (PyMuPDF rasterize at
      RASTERIZE_DPI DPI + PaddleOCR). The result with MORE chars is kept.
      GENERIC — no per-ticker logic. Any page below the threshold triggers fallback.

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
    # FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM (worker-recycling amendment,
    # 2026-08-26): per-document PaddleOCR rescue-fire budget. A local counter is
    # sufficient — application/extract_tables_usecase.py submits exactly ONE
    # ocr_pages_worker call per document, so this call's own lifetime IS "one
    # document"; nothing needs to persist across calls or processes.
    rescue_fires_used = 0

    for page_num in sorted_pages:
        try:
            images = convert_from_path(
                pdf_path,
                dpi=OCR_RASTER_DPI,
                first_page=page_num,
                last_page=page_num,
                fmt="png",
            )
            if not images:
                pages_out.append({"page_number": page_num, "text": ""})
                continue

            # FIX-PDFX-OCR-ORIENTATION AC-2 site 2/3 (PRIMARY read).
            # Mirrors ocr_adapter.ocr_pages(): a rotated page yields hundreds of
            # chars of mojibake, above LOW_TESSERACT_PAGE_CHARS, so the PaddleOCR
            # fallback below never fires — correcting only the PaddleOCR
            # construction site would leave this path broken. One OSD probe per
            # page; same-object no-op on pages already upright.
            from infrastructure.ocr_orientation import correct_orientation

            page_image, _orientation_deg = correct_orientation(images[0])
            if _orientation_deg:
                logger.info(
                    "ocr_pages_worker: page %d rotated %d deg clockwise before Tesseract "
                    "(orientation auto-detected)",
                    page_num,
                    _orientation_deg,
                )

            text: str = pytesseract.image_to_string(
                page_image, lang=TESSERACT_LANG, config=TESSERACT_PSM6_CONFIG
            )

            # ── FIX-BCTC-BANK-PDF-OCR-RASTERIZE: PaddleOCR fallback ──────────
            # When Tesseract yields very few chars (< LOW_TESSERACT_PAGE_CHARS),
            # the page is likely an image-only scan that Tesseract struggles with.
            # Try PyMuPDF rasterize + PaddleOCR and keep whichever has more chars.
            # GENERIC — no ticker/form/date literals.
            if len(text.strip()) < LOW_TESSERACT_PAGE_CHARS:
                if rescue_fires_used >= BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT:
                    # FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM AC-4: budget
                    # exhausted for this document — recycling (main.py
                    # max_tasks_per_child=1) only bounds CROSS-task retention, it
                    # cannot interrupt this already-running task, so a single
                    # pathological document must not be allowed to keep firing
                    # unbounded. Remaining low-char pages keep their Tesseract
                    # result as-is (same fallback already used on a
                    # _rasterize_and_ocr_page_worker exception below) — logged so
                    # a page silently reverting to a weak read is visible.
                    logger.warning(
                        "ocr_pages_worker: PaddleOCR rescue budget exhausted "
                        "(%d/%d fires already used this document) — page %d stays "
                        "on its Tesseract result (%d chars), rescue skipped",
                        rescue_fires_used,
                        BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT,
                        page_num,
                        len(text.strip()),
                    )
                else:
                    logger.info(
                        "ocr_pages_worker: page %d Tesseract yielded %d chars "
                        "(< LOW_TESSERACT_PAGE_CHARS=%d) — trying PaddleOCR rasterize fallback",
                        page_num,
                        len(text.strip()),
                        LOW_TESSERACT_PAGE_CHARS,
                    )
                    rescue_fires_used += 1
                    try:
                        paddle_text = _rasterize_and_ocr_page_worker(pdf_path, page_num)
                        if len(paddle_text.strip()) > len(text.strip()):
                            logger.info(
                                "ocr_pages_worker: page %d PaddleOCR (%d chars) > "
                                "Tesseract (%d chars) — using PaddleOCR result",
                                page_num,
                                len(paddle_text.strip()),
                                len(text.strip()),
                            )
                            text = paddle_text
                        else:
                            logger.info(
                                "ocr_pages_worker: page %d PaddleOCR (%d chars) <= "
                                "Tesseract (%d chars) — keeping Tesseract result",
                                page_num,
                                len(paddle_text.strip()),
                                len(text.strip()),
                            )
                    except Exception as paddle_exc:
                        logger.warning(
                            "ocr_pages_worker: page %d PaddleOCR fallback failed: %s "
                            "— keeping Tesseract result (%d chars)",
                            page_num,
                            paddle_exc,
                            len(text.strip()),
                        )
                    finally:
                        # FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM AC-5: trim
                        # after every FIRE (attempted, success or exception) — not
                        # per page. Attacks the intra-document compounding that
                        # cross-task recycling (main.py max_tasks_per_child=1)
                        # structurally cannot reach (§5 of the worker-recycling brief).
                        _malloc_trim_or_noop()

            pages_out.append({"page_number": page_num, "text": text})

        except Exception as exc:
            pages_out.append({"page_number": page_num, "text": ""})

    return pages_out
