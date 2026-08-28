# size-justification: ~250L — page rasterizer (PyMuPDF): rasterize_page / rasterize_report + orientation-aware _save_upright helper, with load-bearing docstrings (idempotency, force-invalidation AC-6 lever, orientation fail-closed contract, /Rotate=0 sideways-page rationale). Cohesive single-purpose module — the docstrings document cross-site contracts (get_bctc_page_image, OCR paths) that lose their anchor if split out.
"""
infrastructure/page_rasterizer.py — AR-PDF FR-1

Page rasterizer: renders PDF pages as PNG images using PyMuPDF.

Public API:
    rasterize_page(pdf_path, report_id, page_number, dpi, force=False) -> Path
    rasterize_report(pdf_path, report_id, dpi=None, force=False) -> list[Path]

Output path: /data/bctc-page-images/{report_id}/page_{N:04d}.png
DPI: controlled by BCTC_RASTER_DPI env var (default 150).

DDD layer: infrastructure. Zero network calls. Zero model weights.
No domain imports. Idempotent: existing files are returned without re-render.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment-derived defaults
# ---------------------------------------------------------------------------

_DEFAULT_DPI = 150
_BASE_OUTPUT_DIR = "/data/bctc-page-images"


def _get_default_dpi() -> int:
    """Read BCTC_RASTER_DPI env var, returning 150 if unset or invalid."""
    raw = os.getenv("BCTC_RASTER_DPI", str(_DEFAULT_DPI))
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "page_rasterizer: invalid BCTC_RASTER_DPI=%r — using default %d",
            raw,
            _DEFAULT_DPI,
        )
        return _DEFAULT_DPI


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def rasterize_page(
    pdf_path: str,
    report_id: str,
    page_number: int,
    dpi: int,
    force: bool = False,
) -> Path:
    """
    Render page N (1-indexed) of a PDF to PNG at the given DPI.

    Output path: /data/bctc-page-images/{report_id}/page_{N:04d}.png
    Directory is created automatically (mkdir -p semantics).

    Orientation (FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-
    UPSIDE-DOWN): a BCTC landscape page is frequently authored sideways with a
    /Rotate attribute of 0, so PyMuPDF renders it sideways and the refine agent
    reading this PNG through get_bctc_page_image sees the same sideways page the
    OCR path used to see. The rendered pixels are therefore passed through
    infrastructure/ocr_orientation.correct_orientation() — one Tesseract OSD
    probe per page — before being written. Fails closed: on any OSD failure or a
    below-floor confidence the pixels are written exactly as PyMuPDF produced
    them.

    Idempotent: if the output file already exists it is returned without
    re-rendering, UNLESS force=True.

    force=True is the AC-6 invalidation lever for this artifact: PNGs rendered
    before the orientation fix are already on the shared volume and, under plain
    idempotency, would be served sideways forever. A caller that needs the
    stored PNG regenerated (e.g. re-running a report whose pages were rasterized
    pre-fix) passes force=True; POST /rasterize exposes it as a request field.

    Args:
        pdf_path:    Absolute path to the PDF file on disk.
        report_id:   Report identifier — used as the output directory name.
        page_number: 1-indexed page number to render.
        dpi:         Raster resolution in dots-per-inch.
        force:       Re-render and overwrite even when the PNG already exists.

    Returns:
        Path to the output PNG file (always absolute).

    Raises:
        FileNotFoundError: if pdf_path does not exist.
        ValueError: if page_number < 1 or exceeds the PDF page count.
        RuntimeError: if PyMuPDF cannot open or render the page.
    """
    import fitz  # PyMuPDF — must be installed (pymupdf in requirements.txt)

    output_dir = Path(_BASE_OUTPUT_DIR) / report_id
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / f"page_{page_number:04d}.png"

    # Idempotency: return existing file without re-rendering (unless forced).
    if output_path.exists() and not force:
        logger.debug(
            "rasterize_page: cache hit report_id=%s page=%d dpi=%d path=%s",
            report_id,
            page_number,
            dpi,
            output_path,
        )
        return output_path

    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        raise RuntimeError(
            f"rasterize_page: cannot open PDF at {pdf_path}: {exc}"
        ) from exc

    try:
        if page_number < 1 or page_number > doc.page_count:
            raise ValueError(
                f"rasterize_page: page_number={page_number} out of range "
                f"(PDF has {doc.page_count} pages)"
            )

        # fitz uses 0-indexed pages internally; external API is 1-indexed.
        page = doc[page_number - 1]

        # Build matrix: PyMuPDF default unit = 1/72 inch → scale by dpi/72.
        matrix = fitz.Matrix(dpi / 72.0, dpi / 72.0)
        pix = page.get_pixmap(matrix=matrix)

        orientation_deg = _save_upright(pix, output_path)

        logger.info(
            "rasterize_page: rendered report_id=%s page=%d dpi=%d rotated=%ddeg → %s",
            report_id,
            page_number,
            dpi,
            orientation_deg,
            output_path,
        )
        return output_path

    finally:
        doc.close()


def _save_upright(pix: "object", output_path: Path) -> int:
    """
    Write a PyMuPDF pixmap to PNG, correcting page orientation first.

    FIX-PDFX-OCR-ORIENTATION: one Tesseract OSD probe per page. Fails closed —
    if numpy/PIL/pytesseract are unavailable or OSD cannot decide, the pixmap is
    saved through PyMuPDF's own writer exactly as before this fix.

    Returns:
        Degrees of clockwise correction actually applied (0 when none).
    """
    try:
        import numpy as np
        from PIL import Image

        from infrastructure.ocr_orientation import correct_orientation

        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(  # type: ignore[attr-defined]
            pix.height, pix.width, pix.n  # type: ignore[attr-defined]
        )
        if pix.n == 4:  # type: ignore[attr-defined]
            arr = arr[:, :, :3]
        elif pix.n == 1:  # type: ignore[attr-defined]
            arr = np.stack([arr[:, :, 0]] * 3, axis=-1)

        corrected, degrees = correct_orientation(arr)
        if degrees == 0:
            # Same object back — nothing to correct. Use PyMuPDF's own writer so
            # the on-disk bytes are identical to the pre-fix output.
            pix.save(str(output_path))  # type: ignore[attr-defined]
            return 0

        Image.fromarray(corrected).save(str(output_path))
        return degrees

    except Exception as exc:
        logger.warning(
            "page_rasterizer: orientation correction unavailable (%s) — "
            "saving raster as rendered",
            exc,
        )
        pix.save(str(output_path))  # type: ignore[attr-defined]
        return 0


def rasterize_report(
    pdf_path: str,
    report_id: str,
    dpi: int | None = None,
    force: bool = False,
) -> List[Path]:
    """
    Rasterize all pages of a PDF report.

    Reads BCTC_RASTER_DPI env var if dpi is None (default 150).
    Each page is rasterized via rasterize_page() — idempotent per page unless
    force=True (AC-6 invalidation of PNGs rendered before the orientation fix).

    Args:
        pdf_path:  Absolute path to the PDF file.
        report_id: Report identifier — used as the output directory name.
        dpi:       Raster DPI. If None, reads BCTC_RASTER_DPI env var.
        force:     Re-render every page even when its PNG already exists.

    Returns:
        List of Path objects, one per page, in page order (1-indexed).

    Raises:
        RuntimeError: if PyMuPDF cannot open the PDF.
    """
    import fitz  # PyMuPDF

    if dpi is None:
        dpi = _get_default_dpi()

    try:
        doc = fitz.open(pdf_path)
        page_count = doc.page_count
        doc.close()
    except Exception as exc:
        raise RuntimeError(
            f"rasterize_report: cannot open PDF at {pdf_path}: {exc}"
        ) from exc

    logger.info(
        "rasterize_report: report_id=%s total_pages=%d dpi=%d pdf_path=%s",
        report_id,
        page_count,
        dpi,
        pdf_path,
    )

    return [
        rasterize_page(pdf_path, report_id, page_num, dpi, force=force)
        for page_num in range(1, page_count + 1)
    ]
