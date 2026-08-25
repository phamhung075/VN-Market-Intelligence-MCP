#!/usr/bin/env python3
"""
scripts/audits/ocr-orientation-probe.py
FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN

Evidence harness for the orientation fix. Runs INSIDE the pdf-extractor
container (needs fitz/pymupdf + pytesseract + tesseract osd traineddata):

    docker cp scripts/audits/ocr-orientation-probe.py \
        vn-market-intelligence-mcp-pdf-extractor-1:/tmp/ocr-orientation-probe.py
    docker exec vn-market-intelligence-mcp-pdf-extractor-1 \
        python3 /tmp/ocr-orientation-probe.py --pdf /app/data/pdfs/VIC_2026_Q1.pdf \
        --pages 11,13,14,15,16,34,41,60,67 --ocr

Reports, per page:
  osd_rotate       clockwise degrees Tesseract OSD says are needed (0/90/180/270)
  osd_conf         OSD orientation confidence
  With --ocr, also OCRs the page BEFORE and AFTER the correction with the
  production text-path config (vie+eng, --psm 6) and reports:
  vi_score         count of common Vietnamese function words found in the text
                   (an ORIENTATION-INDEPENDENT readability proxy: a 180/90 read
                   produces mojibake that scores ~0 while a correct read scores
                   high). This is deliberately NOT a tesseract confidence number
                   -- per this row's AC-4, confidence is the metric that lies.
  chars            character count
  identical        True when AFTER text == BEFORE text (i.e. passthrough)

Exit code is always 0; this is a measurement tool, not a gate.
"""
from __future__ import annotations

import argparse
import json
import sys
import time

# Common Vietnamese function/BCTC words. Orientation-independent readability
# proxy: mojibake from a rotated read practically never contains these.
_VI_MARKERS = (
    "của", "và", "các", "năm", "tháng", "đồng", "công ty", "tài sản",
    "ngày", "được", "cho", "trong", "không", "tại", "theo", "số",
    "kinh doanh", "đầu tư", "vốn", "nguyên giá", "thuyết minh", "hợp nhất",
    "cổ phần", "phải", "chi phí", "doanh thu", "tập đoàn", "xây dựng",
)


def vi_score(text: str) -> int:
    low = text.lower()
    return sum(low.count(m) for m in _VI_MARKERS)


def render(doc, page_number: int, dpi: int):
    import fitz  # noqa: F401
    import numpy as np

    page = doc[page_number - 1]
    matrix = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=matrix)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        arr = arr[:, :, :3]
    elif pix.n == 1:
        arr = np.stack([arr[:, :, 0]] * 3, axis=-1)
    return arr, page.rotation


def ocr(arr, lang: str, config: str) -> str:
    import pytesseract
    from PIL import Image

    return pytesseract.image_to_string(Image.fromarray(arr), lang=lang, config=config)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--pages", default="", help="comma list; empty = all pages")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--ocr", action="store_true", help="also OCR before/after (slow)")
    ap.add_argument("--lang", default="vie+eng")
    ap.add_argument("--config", default="--psm 6")
    ap.add_argument("--json-out", default="")
    ap.add_argument("--code-root", default="/app",
                    help="import root for infrastructure.ocr_orientation "
                         "(use an overlay dir to test an un-deployed fix "
                         "without writing into the live /app)")
    args = ap.parse_args()

    import fitz

    sys.path.insert(0, args.code_root)
    from infrastructure.ocr_orientation import correct_orientation, detect_rotation_degrees

    doc = fitz.open(args.pdf)
    if args.pages.strip():
        pages = [int(p) for p in args.pages.split(",") if p.strip()]
    else:
        pages = list(range(1, doc.page_count + 1))

    results = {}
    for p in pages:
        if p < 1 or p > doc.page_count:
            continue
        arr, pdf_rot = render(doc, p, args.dpi)

        t0 = time.perf_counter()
        rot = detect_rotation_degrees(arr)
        osd_ms = (time.perf_counter() - t0) * 1000.0

        rec = {
            "pdf_rotate_attr": pdf_rot,
            "raster_wh": [int(arr.shape[1]), int(arr.shape[0])],
            "osd_rotate": rot,
            "osd_ms": round(osd_ms, 1),
        }

        if args.ocr:
            t1 = time.perf_counter()
            before = ocr(arr, args.lang, args.config)
            before_ms = (time.perf_counter() - t1) * 1000.0

            corrected, applied = correct_orientation(arr)
            # AC-4 discipline: the AFTER text is ALWAYS re-OCR'd, including when
            # applied == 0. Short-circuiting to `before` on a passthrough would
            # make `identical` a tautology instead of a measurement.
            t2 = time.perf_counter()
            after = ocr(corrected, args.lang, args.config)
            after_ms = (time.perf_counter() - t2) * 1000.0

            rec.update({
                "applied": applied,
                "chars_before": len(before),
                "chars_after": len(after),
                "vi_before": vi_score(before),
                "vi_after": vi_score(after),
                "identical": after == before,
                "same_object_passthrough": bool(corrected is arr),
                "ocr_ms_before": round(before_ms, 1),
                "ocr_ms_after": round(after_ms, 1),
                "sample_before": before[:180].replace("\n", " | "),
                "sample_after": after[:180].replace("\n", " | "),
            })
        results[p] = rec
        print(f"page {p:>3}  osd_rotate={rec['osd_rotate']:>3}  osd_ms={rec['osd_ms']:>7.1f}"
              + (f"  vi {rec['vi_before']:>3}->{rec['vi_after']:<3}"
                 f"  chars {rec['chars_before']:>5}->{rec['chars_after']:<5}"
                 f"  identical={rec['identical']}" if args.ocr else ""), flush=True)

    doc.close()
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(results, fh, ensure_ascii=False, indent=1)
        print(f"\nwrote {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
