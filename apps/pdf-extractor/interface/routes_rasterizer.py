"""
Interface — POST /rasterize route (AR-PDF FR-1).

FACTORY-PDF-split-handlers: extracted from interface/handlers.py.
"""

import os

from fastapi import APIRouter, HTTPException, status

from interface.schemas import RasterizeRequestSchema


def register_rasterizer_routes(router: APIRouter, pdf_data_dir: str = "data/pdfs") -> None:
    """Attach POST /rasterize to the given APIRouter."""

    @router.post("/rasterize")
    async def rasterize_pages(body: RasterizeRequestSchema) -> dict:
        """
        POST /api/rasterize

        AR-PDF FR-1 AC-FR1.3: on-demand rasterization for missing pages.

        Resolves filename → PDF path under data/pdfs/.
        Calls rasterize_page() for each page only if PNG is missing (idempotent).
        Already-present pages are counted in the response without re-rendering.

        Accepts:  { report_id: str, filename: str, pages: list[int] }
        Returns:  { rasterized: list[int], paths: list[str] }
        Auth: none (internal service — same Docker network).

        Returns HTTP 503 if page_rasterizer is not importable (missing pymupdf).
        """
        import logging as _log_mod
        _log = _log_mod.getLogger(__name__)

        try:
            from infrastructure.page_rasterizer import rasterize_page
        except ImportError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": f"page_rasterizer unavailable: {exc}"},
            ) from exc

        pdf_path = os.path.join(pdf_data_dir, body.filename)
        if not os.path.exists(pdf_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "pdf_not_found",
                    "filename": body.filename,
                    "resolved_path": pdf_path,
                },
            )

        import fitz  # type: ignore
        try:
            doc = fitz.open(pdf_path)
            page_count = doc.page_count
            doc.close()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": f"cannot_open_pdf: {exc}"},
            ) from exc

        dpi_env = int(os.getenv("BCTC_RASTER_DPI", "150"))
        rasterized: list[int] = []
        paths: list[str] = []

        for page_num in body.pages:
            if page_num < 1 or page_num > page_count:
                _log.warning(
                    "rasterize_pages: skip page=%d (out of range, pdf has %d pages) "
                    "report_id=%s",
                    page_num,
                    page_count,
                    body.report_id,
                )
                continue
            try:
                out_path = rasterize_page(
                    pdf_path=pdf_path,
                    report_id=body.report_id,
                    page_number=page_num,
                    dpi=dpi_env,
                )
                rasterized.append(page_num)
                paths.append(str(out_path))
            except Exception as exc:
                _log.error(
                    "rasterize_pages: FAILED page=%d report_id=%s error=%s",
                    page_num,
                    body.report_id,
                    exc,
                )

        return {"rasterized": rasterized, "paths": paths}
