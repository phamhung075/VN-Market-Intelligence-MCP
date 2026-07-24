# size-justification: ~50L — single-purpose constants module (no logic beyond
# the constants themselves), created by FACTORY-PDF-extract-tesseract-config to
# de-duplicate the Tesseract lang/psm/DPI literals that were previously
# copy-pasted (each with its own "DO NOT remove --psm 6" warning) across
# infrastructure/{ocr_adapter,ocr_worker,ocr_backends,extraction_engine}.py and
# infrastructure/generic_md_table/{extractor,unit_ocr}.py (the latter two sit
# behind the infrastructure/generic_md_table_extractor.py thin re-export shim).
"""
infrastructure/tesseract_config.py — single source of truth for Tesseract OCR
invocation constants (BCTC PDF pipeline).

FACTORY-PDF-extract-tesseract-config: extracted from 5 call sites that each
carried an identical inline pytesseract call (lang="vie+eng", config="--psm 6")
plus a duplicated multi-line "DO NOT remove --psm 6" warning comment:
    infrastructure/ocr_adapter.py            (PdfOcrAdapter.ocr_pages)
    infrastructure/ocr_worker.py             (ocr_pages_worker)
    infrastructure/ocr_backends.py           (TesseractVieBackend.recognize_text)
    infrastructure/generic_md_table/extractor.py  (_stage_a_tokenize)
    infrastructure/generic_md_table/unit_ocr.py   (ocr_unit call site)
    infrastructure/extraction_engine.py      (ExtractionEngine._ocr_page)

╔══════════════════════════════════════════════════════════════════════════╗
║ DO NOT remove or change TESSERACT_PSM6_CONFIG ("--psm 6"). This is the   ║
║ ONLY authoritative copy of that warning left in the codebase — every     ║
║ call site above now imports the constant from here instead of re-        ║
║ declaring it.                                                            ║
║                                                                           ║
║ Root cause (drift #4, BT3-FIX3-PSM,                                      ║
║ docs/architecture-briefs/2026-05-26-bctc-table-bt3-fix3-root-cause-      ║
║ ruling.md): Tesseract's default page-segmentation mode (psm 3, auto      ║
║ column segmentation) scrambles BCTC three-block layouts into column-     ║
║ mixed, off-by-one-labeled rows. psm 6 (single uniform text block) reads  ║
║ the layout strictly line-by-line, matching the spike harness that first  ║
║ proved out the pipeline (spike/fpt_balance_sheet_eval.py:160). Removing  ║
║ or changing this value silently re-introduces that drift in production.  ║
╚══════════════════════════════════════════════════════════════════════════╝

DDD layer: infrastructure (pure constants — no domain/application imports,
no I/O, no pytesseract import; call sites keep their own lazy/guarded
`import pytesseract` so ImportError-handling behavior is unchanged).
"""

from __future__ import annotations

# Tesseract language string: Vietnamese + English combined model.
TESSERACT_LANG: str = "vie+eng"

# Tesseract page-segmentation mode. DO NOT remove/change — see module docstring.
TESSERACT_PSM6_CONFIG: str = "--psm 6"

# Rasterization DPI feeding every Tesseract call above (pdf2image
# convert_from_path(dpi=...), pdfplumber page.to_image(resolution=...)). 200 DPI
# is the proven value from the spike harness — matches every pre-refactor
# inline dpi=200 / resolution=200 literal across the 5 call sites. Distinct
# from RASTERIZE_DPI (BCTC_RASTERIZE_DPI env var, ocr_adapter.py/ocr_worker.py)
# which controls the separate PyMuPDF+PaddleOCR fallback path — out of scope
# here (not part of the duplicated Tesseract literal this module extracts).
OCR_RASTER_DPI: int = 200
