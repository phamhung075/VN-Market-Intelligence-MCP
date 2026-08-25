#!/usr/bin/env python3
"""
scripts/audits/ocr_page_ab_inner.py
— FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS

SINGLE-PAGE A/B INSTRUMENT. Runs INSIDE the pdf-extractor container
(bind-mounted read-only, never baked into the image).

Isolates ONE page of a BCTC PDF, runs the REAL DocLayout-YOLO layout pass on it
to obtain the same table-region bboxes the full pipeline would produce, then
runs BOTH text backends (TesseractVieBackend and PaddleOcrBackend, the latter
with the production paddle_table instance) on the IDENTICAL crop and prints
both transcripts side by side.

Purpose: establish, before any production code is written, whether the rescue
backend can actually read the ink Tesseract misses on that crop — i.e. whether
AC-2 is reachable at all through the `auto` per-page rescue path.

Usage: python3 -u ocr_page_ab_inner.py <pdf_path> <page_num>
Never run during VN market hours (02:00-08:59 UTC weekdays).
"""
import json
import logging
import os
import sys
import tempfile
import time


def main() -> None:
    logging.basicConfig(
        level=logging.WARNING, stream=sys.stderr, format="%(levelname)s %(name)s %(message)s"
    )
    pdf_path = sys.argv[1]
    page_num = int(sys.argv[2])

    sys.path.insert(0, "/app")
    sys.path.insert(0, "/app/PDF-Extract-Kit")

    import numpy as np  # type: ignore
    import pymupdf  # type: ignore
    from pdf2image import convert_from_path  # type: ignore

    from infrastructure import pek_engine_adapter as pea
    from infrastructure.ocr_backends import PaddleOcrBackend, TesseractVieBackend

    # --- isolate the page into a 1-page PDF so layout runs on it alone -----
    tmpdir = tempfile.mkdtemp(prefix="page_ab_")
    single = os.path.join(tmpdir, f"page{page_num}.pdf")
    src = pymupdf.open(pdf_path)
    dst = pymupdf.open()
    dst.insert_pdf(src, from_page=page_num - 1, to_page=page_num - 1)
    dst.save(single)
    dst.close()
    src.close()

    models = pea._get_pek_models()
    layout_task = models.get("layout_task")
    paddle_table = models.get("paddle_table")

    adapter = pea.PekEngineAdapter(ocr_backend=None)
    pages_bboxes, page_dims = adapter._run_layout_detection(
        layout_task=layout_task, pdf_path=single
    )

    bboxes = pages_bboxes.get(1, [])
    table_bboxes = [b for b in bboxes if b.get("label") == pea._LAYOUT_CLASS_TABLE]

    imgs = convert_from_path(single, dpi=200, first_page=1, last_page=1, fmt="png")
    page_arr = np.array(imgs[0])

    tess = TesseractVieBackend()
    padd = PaddleOcrBackend(paddle_table=paddle_table)

    out = {
        "pdf": pdf_path,
        "page": page_num,
        "page_dims": page_dims.get(1),
        "labels_on_page": sorted({str(b.get("label")) for b in bboxes}),
        "n_table_regions": len(table_bboxes),
        "regions": [],
    }

    for idx, bbox in enumerate(table_bboxes):
        x0, y0, x1, y1 = pea._safe_bbox(bbox)
        crop = page_arr[int(y0):int(y1), int(x0):int(x1)]
        if crop.size == 0:
            continue
        t0 = time.perf_counter()
        t_text, t_conf = tess.recognize_text(crop)
        t1 = time.perf_counter()
        p_text, p_conf = padd.recognize_text(crop)
        t2 = time.perf_counter()
        out["regions"].append(
            {
                "region": idx,
                "bbox": [x0, y0, x1, y1],
                "crop_shape": list(crop.shape),
                "tesseract": {
                    "conf": round(t_conf, 4),
                    "s": round(t1 - t0, 2),
                    "chars": len(t_text),
                    "text": t_text,
                },
                "paddleocr": {
                    "conf": round(p_conf, 4),
                    "s": round(t2 - t1, 2),
                    "chars": len(p_text),
                    "text": p_text,
                },
            }
        )

    print("OCR_PAGE_AB_RESULT_JSON " + json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
