#!/usr/bin/env python3
"""
scripts/audits/ocr_confidence_probe_inner.py
— FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS

DESIGN-PHASE INSTRUMENT (AC-1). Runs INSIDE the pdf-extractor container
(bind-mounted read-only, never baked into the image).

Wraps TesseractVieBackend.recognize_text with a recording shim that, for every
table-region crop the real PekEngineAdapter pipeline hands it, computes ALL the
candidate discriminators named in AC-1 side by side:

  (a) recognised-area / table-region-area coverage ratio
  (b) recognised word/line count vs the line count Tesseract's OWN layout pass
      found in the same region (level-4 rows) — the closest available stand-in
      for "the row count the layout detector found"
  (c) mean(conf) weighted by character count
  (+) INK coverage: fraction of the crop's dark pixels that fall inside a
      recognised word box — a direct recall proxy that is NOT confounded by
      whitespace density the way (a) is.

It does NOT change pipeline behaviour: the shim returns exactly what the
unmodified TesseractVieBackend would return, so the extraction result is
byte-identical to a plain tesseract-vie run. It does NOT push to mcp-server.

Output: one JSON line per run, prefixed OCR_PROBE_RESULT_JSON, carrying a
per-region diagnostic array plus the page->unit map needed to attribute regions
to the 30 layout units.

Usage (via scripts/audits/ocr-confidence-probe.sh):
    python3 -u ocr_confidence_probe_inner.py <report_id> <pdf_path>

Never run during VN market hours (02:00-08:59 UTC weekdays).
"""
import hashlib
import json
import os
import re
import sys
import time

_DIAGS = []

# FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS
# (measurement cycle 2) — AC-1 "instrument NUMERIC-TOKEN DENSITY": count of
# parseable VND accounting figures per region. This is the signal a human
# (qa) used successfully on BOTH FPT and DBC to separate genuinely-broken
# regions ("headers, a stray '178%', zero figures") from legitimate ones
# (coherent lines with real accounting figures) — and it is what the BCTC
# product actually consumes. Matches Vietnamese dot-grouped thousands
# (>=2 groups of 3 digits after the leading group, i.e. >=6 digits total,
# optionally with a comma decimal remainder) — e.g. "20.225.450",
# "3.498.405", "70.112.826". Deliberately NOT circular: it never looks at
# Tesseract's own confidence or box geometry, only at the recognised text.
_VND_FIGURE_RE = re.compile(r"\b\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?\b")


def _otsu_threshold(gray) -> int:
    """Otsu's method on a uint8 grayscale array. Pure numpy — no cv2/scipy."""
    import numpy as np  # type: ignore

    hist = np.bincount(gray.ravel(), minlength=256).astype(np.float64)
    total = gray.size
    if total == 0:
        return 128
    omega = np.cumsum(hist) / total
    mu = np.cumsum(hist * np.arange(256)) / total
    mu_t = mu[-1]
    denom = omega * (1.0 - omega)
    with np.errstate(divide="ignore", invalid="ignore"):
        sigma_b = np.where(denom > 0, (mu_t * omega - mu) ** 2 / denom, 0.0)
    return int(np.argmax(sigma_b))


def _install_shim():
    """Monkeypatch TesseractVieBackend.recognize_text with a recording wrapper."""
    from infrastructure import ocr_gateway
    from infrastructure.ocr_backends import TesseractVieBackend, _to_pil
    from infrastructure.tesseract_config import TESSERACT_LANG, TESSERACT_PSM6_CONFIG

    def probing_recognize_text(self, image_or_region):
        import numpy as np  # type: ignore

        if image_or_region is None:
            return ("", 0.0)
        pil_image = _to_pil(image_or_region)
        if pil_image is None:
            return ("", 0.0)

        t0 = time.perf_counter()
        data = ocr_gateway.run_image_sync(  # noqa: E501
            pil_image,
            mode="data",
            lang=TESSERACT_LANG,
            config=TESSERACT_PSM6_CONFIG,
            output_type=ocr_gateway.OUTPUT_DATAFRAME,
        )
        t1 = time.perf_counter()

        d = {
            "page": _CTX["page"],
            "region": _CTX["region"],
            "ocr_s": round(t1 - t0, 2),
        }

        # ---- crop geometry + ink mask -------------------------------------
        gray = np.asarray(pil_image.convert("L"))
        h, w = gray.shape[:2]
        d["crop_w"], d["crop_h"] = int(w), int(h)
        thr = _otsu_threshold(gray)
        ink = gray <= thr
        ink_total = int(ink.sum())
        d["otsu"] = thr
        d["ink_total"] = ink_total
        d["ink_frac_of_area"] = round(ink_total / max(1, w * h), 5)

        # ---- dataframe anatomy --------------------------------------------
        d["df_rows"] = int(len(data))
        try:
            d["level_counts"] = {
                str(k): int(v) for k, v in data["level"].value_counts().items()
            }
        except Exception:
            d["level_counts"] = {}

        txt = data["text"].astype(str).str.strip()
        conf = data["conf"].astype(float)
        lvl5 = data["level"] == 5 if "level" in data.columns else conf.notna()

        valid_mask = (conf > 0) & (txt != "")
        valid = data[valid_mask]
        d["n_words_valid"] = int(len(valid))
        d["n_lvl5"] = int(lvl5.sum())
        d["n_lvl5_conf_le0"] = int((lvl5 & (conf <= 0)).sum())
        d["n_lvl5_empty_text"] = int((lvl5 & (txt == "")).sum())
        d["n_lvl4_lines"] = int((data["level"] == 4).sum()) if "level" in data.columns else -1
        d["n_lvl3_paras"] = int((data["level"] == 3).sum()) if "level" in data.columns else -1
        d["n_lvl2_blocks"] = int((data["level"] == 2).sum()) if "level" in data.columns else -1

        if len(valid) == 0:
            d.update(
                mean_conf=0.0,
                char_weighted_conf=0.0,
                n_chars=0,
                box_area_cov=0.0,
                ink_cov=0.0,
                line_ink_cov=0.0,
                covered_lines=0,
                numeric_token_count=0,
                numeric_token_density_per_100chars=0.0,
                text_excerpt="",
            )
            _DIAGS.append(d)
            return ("", 0.0)

        vtxt = txt[valid_mask]
        vconf = conf[valid_mask]
        lens = vtxt.str.len()
        n_chars = int(lens.sum())
        d["n_chars"] = n_chars
        d["mean_conf"] = round(float(vconf.mean()) / 100.0, 4)
        d["char_weighted_conf"] = round(
            float((vconf * lens).sum() / max(1, lens.sum())) / 100.0, 4
        )
        d["min_conf"] = round(float(vconf.min()) / 100.0, 4)

        # ---- (a) recognised box area / crop area --------------------------
        # ---- (+) ink inside recognised word boxes -------------------------
        covered = np.zeros((h, w), dtype=bool)
        box_area = 0
        for L, T, W, H in zip(
            valid["left"].astype(int),
            valid["top"].astype(int),
            valid["width"].astype(int),
            valid["height"].astype(int),
        ):
            x0, y0 = max(0, L), max(0, T)
            x1, y1 = min(w, L + W), min(h, T + H)
            if x1 > x0 and y1 > y0:
                covered[y0:y1, x0:x1] = True
                box_area += (x1 - x0) * (y1 - y0)
        d["box_area_cov"] = round(box_area / max(1, w * h), 5)
        d["ink_cov"] = round(int((ink & covered).sum()) / max(1, ink_total), 5)

        # ---- (b) recognised lines vs Tesseract's own line boxes -----------
        if "level" in data.columns:
            lines = data[data["level"] == 4]
            n_lines = len(lines)
            covered_lines = 0
            line_ink_total = 0
            line_ink_covered = 0
            for L, T, W, H in zip(
                lines["left"].astype(int),
                lines["top"].astype(int),
                lines["width"].astype(int),
                lines["height"].astype(int),
            ):
                x0, y0 = max(0, L), max(0, T)
                x1, y1 = min(w, L + W), min(h, T + H)
                if x1 <= x0 or y1 <= y0:
                    continue
                sub_ink = ink[y0:y1, x0:x1]
                sub_cov = covered[y0:y1, x0:x1]
                line_ink_total += int(sub_ink.sum())
                line_ink_covered += int((sub_ink & sub_cov).sum())
                if sub_cov.any():
                    covered_lines += 1
            d["covered_lines"] = covered_lines
            d["line_cov_ratio"] = round(covered_lines / max(1, n_lines), 4)
            d["line_ink_cov"] = round(line_ink_covered / max(1, line_ink_total), 5)
        else:
            d["covered_lines"] = -1
            d["line_cov_ratio"] = -1.0
            d["line_ink_cov"] = -1.0

        texts = vtxt.tolist()
        text = " ".join(t for t in texts if t)
        mean_conf = float(vconf.mean()) / 100.0

        # ---- numeric-token density (AC-1, untested candidate) -------------
        # Computed on the FULL recognised text, never the truncated excerpt,
        # so region length does not bias the count.
        vnd_figures = _VND_FIGURE_RE.findall(text)
        d["numeric_token_count"] = len(vnd_figures)
        d["numeric_token_density_per_100chars"] = round(
            100.0 * len(vnd_figures) / max(1, len(text)), 4
        )

        d["text_excerpt"] = text[:300]
        _DIAGS.append(d)
        return (text.strip(), max(0.0, min(1.0, mean_conf)))

    TesseractVieBackend.recognize_text = probing_recognize_text  # type: ignore[assignment]


_CTX = {"page": None, "region": -1}


def _install_region_tagger():
    """
    Tag each recorded diagnostic with page_num / region_idx WITHOUT duplicating
    _run_table_extraction.

    Two hooks, both read-only:
      * a logging.Filter on the adapter's per-page heartbeat
        ("PekEngineAdapter: extract progress page=%d/%d ...") sets the page;
      * a wrapper on the module-level _safe_bbox(), called exactly once per
        table region immediately before the crop, advances the region index.
    """
    import logging as _logging

    from infrastructure import pek_engine_adapter as pea

    class _PageFilter(_logging.Filter):
        def filter(self, record):
            try:
                msg = record.getMessage()
            except Exception:
                return True
            if "extract progress page=" in msg:
                try:
                    _CTX["page"] = int(
                        msg.split("extract progress page=")[1].split("/")[0]
                    )
                    _CTX["region"] = -1
                except Exception:
                    pass
            return True

    _logging.getLogger("infrastructure.pek_engine_adapter").addFilter(_PageFilter())

    _orig_safe_bbox = pea._safe_bbox

    def _tagging_safe_bbox(bbox):
        _CTX["region"] += 1
        return _orig_safe_bbox(bbox)

    pea._safe_bbox = _tagging_safe_bbox  # type: ignore[assignment]


def main() -> None:
    import logging

    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format="%(levelname)s %(name)s %(message)s",
    )

    report_id = sys.argv[1]
    pdf_path = sys.argv[2]

    sys.path.insert(0, "/app")
    sys.path.insert(0, "/app/PDF-Extract-Kit")

    _install_shim()
    _install_region_tagger()

    from infrastructure.ocr_backends import TesseractVieBackend
    from infrastructure.pek_engine_adapter import PekEngineAdapter

    adapter = PekEngineAdapter(ocr_backend=TesseractVieBackend())

    # AC-5 (carried from PROBE-PDFX-OCR-CONFIDENCE-SECOND-DOCUMENT-MARGIN):
    # table-phase wall clock must be reported WITH fire count, never as a bare
    # whole-pipeline percentage. This probe never fires a rescue (tesseract-vie
    # only, hardcoded above), so its table_phase_s is the 0-fire BASELINE the
    # auto-mode bench run's table_phase_s is compared against.
    phase = {"table_phase_s": None}
    _orig_table = PekEngineAdapter._run_table_extraction

    def _timed_table_extraction(self, *args, **kwargs):
        _s = time.perf_counter()
        try:
            return _orig_table(self, *args, **kwargs)
        finally:
            phase["table_phase_s"] = round(time.perf_counter() - _s, 2)

    PekEngineAdapter._run_table_extraction = _timed_table_extraction

    t0 = time.perf_counter()
    result = adapter.extract_layout_and_tables(pdf_path=pdf_path, report_id=report_id)
    t1 = time.perf_counter()

    document_map = result.get("document_map", {})
    units = result.get("units", [])

    page_to_unit = {}
    for u in document_map.get("units", []):
        for p in u.get("pages", []):
            page_to_unit[p] = {
                "unit_id": u.get("unit_id"),
                "page_type": u.get("page_type"),
            }

    # AC-5: sha256 per unit so a tesseract-vie-only probe run (this script,
    # never pushes, never fires a rescue) can be diffed unit-by-unit against
    # an `auto` bench_inner.py run on the SAME report_id/pdf without going
    # through the DB — same convention as ocr_bench_inner.py's unit_digests.
    unit_rows = {
        u["unit_id"]: {
            "row_count": u.get("row_count"),
            "quarantined": u.get("quarantined"),
            "md_len": len(u.get("stitched_markdown") or ""),
            "sha256": hashlib.sha256(
                (u.get("stitched_markdown") or "").encode("utf-8")
            ).hexdigest()[:16],
        }
        for u in units
    }

    out = {
        "report_id": report_id,
        "wall_time_s": round(t1 - t0, 2),
        "table_phase_s": phase["table_phase_s"],
        "n_regions": len(_DIAGS),
        "total_pages": document_map.get("total_pages"),
        "page_to_unit": {str(k): v for k, v in page_to_unit.items()},
        "unit_rows": unit_rows,
        "regions": _DIAGS,
    }
    print("OCR_PROBE_RESULT_JSON " + json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
