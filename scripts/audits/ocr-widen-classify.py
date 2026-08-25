#!/usr/bin/env python3
"""
scripts/audits/ocr-widen-classify.py
FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS
— measurement cycle 2, n>=8 widen.

Reads one OCR_PROBE_RESULT_JSON line (from scripts/audits/ocr_confidence_probe_inner.py,
run via ocr-confidence-probe.sh or an ad hoc docker compose invocation) and prints a
per-region table with EVERY untested-signal candidate named in the 2026-08-25T17:52Z
PO ruling, plus a ground-truth label derived ONLY from recognised TEXT (never from any
confidence/coverage score under test):

  label = "legit"   if numeric_token_count >= 1 (a parseable VND accounting figure was
                     actually recognised in this region) OR the text_excerpt contains a
                     recognisable run of Vietnamese words (heuristic backstop for regions
                     that are legitimately prose, e.g. table captions/footnotes, not figures)
  label = "broken"  if numeric_token_count == 0 AND n_chars < 40 (near-empty/garbled read)
  label = "ambiguous" otherwise — EXCLUDED from max(broken)/min(legit) band edges and
                     flagged for manual read of text_excerpt.

This mirrors, not replaces, the human read: every "broken"/"legit" call this script makes
is re-printed with its text_excerpt so it can be eyeballed and overridden. It never reads
mean_conf/ink_cov/line_ink_cov/etc. to produce the label — those are exactly the columns
being evaluated.

Usage: python3 scripts/audits/ocr-widen-classify.py <path/to/result.jsonl> [--doc NAME]
"""
from __future__ import annotations

import json
import re
import sys

_VI_MARKERS = (
    "của", "và", "các", "năm", "tháng", "đồng", "công ty", "tài sản",
    "ngày", "được", "cho", "trong", "không", "tại", "theo", "số",
    "kinh doanh", "đầu tư", "vốn", "nguyên giá", "thuyết minh", "hợp nhất",
    "cổ phần", "phải", "chi phí", "doanh thu", "tập đoàn", "xây dựng",
)

# Ground-truth-ONLY numeric check (never the production candidate under test,
# which stays exactly as instrumented in ocr_confidence_probe_inner.py's
# Vietnamese-dot-grouped regex). FRT_2025_Q4 uses COMMA-grouped thousands
# ("116,016,686,474") where DBC_2025_Q4 uses DOT-grouped ("439.331.953.874") --
# a genuine per-issuer formatting difference, not noise. A ground-truth check
# that only recognises one convention silently mislabels an entire document's
# legitimate regions as "ambiguous"/"broken", which is exactly the trap AC-4
# warns against ("ground truth by reading extracted cell content, never by the
# score under test") -- so this backstop accepts EITHER separator.
_NUMERIC_ANY_SEP_RE = re.compile(r"\b\d{1,3}(?:[.,]\d{3}){2,}(?:[.,]\d+)?\b")


def vi_score(text: str) -> int:
    low = text.lower()
    return sum(low.count(m) for m in _VI_MARKERS)


def label_region(r: dict) -> str:
    n_chars = r.get("n_chars", 0)
    numeric = r.get("numeric_token_count", 0)
    excerpt = r.get("text_excerpt", "")
    vi = vi_score(excerpt)
    numeric_any_sep = len(_NUMERIC_ANY_SEP_RE.findall(excerpt))
    if numeric >= 1 or numeric_any_sep >= 1:
        return "legit"
    if vi >= 1:
        return "legit"  # recognisable Vietnamese words present -- a real read,
        # short or long, prose or table header/footnote; NOT gibberish.
    if n_chars < 40:
        return "broken"
    return "ambiguous"


def main() -> int:
    path = sys.argv[1]
    doc_name = None
    if "--doc" in sys.argv:
        doc_name = sys.argv[sys.argv.index("--doc") + 1]

    with open(path, encoding="utf-8") as fh:
        line = fh.readline()
    assert line.startswith("OCR_PROBE_RESULT_JSON "), f"unexpected content in {path}"
    payload = json.loads(line[len("OCR_PROBE_RESULT_JSON "):])

    regions = payload["regions"]
    signals = ["mean_conf", "min_conf", "ink_cov", "line_ink_cov", "box_area_cov",
               "n_lvl5_conf_le0", "n_lvl5_empty_text", "numeric_token_count",
               "numeric_token_density_per_100chars"]

    rows = []
    for r in regions:
        lbl = label_region(r)
        rows.append({**r, "label": lbl})

    print(f"=== {doc_name or path} — {len(rows)} regions ===")
    for r in rows:
        print(
            f"p{r.get('page')!s:>3} r{r.get('region')!s:>2} [{r['label']:>9}] "
            f"mean_conf={r.get('mean_conf', 0):.3f} min_conf={r.get('min_conf', 0):.3f} "
            f"ink_cov={r.get('ink_cov', 0):.3f} line_ink_cov={r.get('line_ink_cov', 0):.3f} "
            f"n_lvl5_conf_le0={r.get('n_lvl5_conf_le0', 0)} n_lvl5_empty_text={r.get('n_lvl5_empty_text', 0)} "
            f"numeric_tok={r.get('numeric_token_count', 0)} n_chars={r.get('n_chars', 0)} "
            f"excerpt={r.get('text_excerpt', '')[:70]!r}"
        )

    print(f"\n--- band edges per signal ({doc_name or path}) ---")
    for sig in signals:
        broken_vals = [r[sig] for r in rows if r["label"] == "broken" and sig in r]
        legit_vals = [r[sig] for r in rows if r["label"] == "legit" and sig in r]
        if not broken_vals or not legit_vals:
            print(f"{sig:35s} broken n={len(broken_vals)} legit n={len(legit_vals)} — insufficient for a band")
            continue
        max_broken = max(broken_vals)
        min_legit = min(legit_vals)
        sep = "SEPARATED" if min_legit > max_broken else "OVERLAP"
        print(f"{sig:35s} max(broken)={max_broken:.5f}  min(legit)={min_legit:.5f}  [{sep}]  "
              f"(n_broken={len(broken_vals)}, n_legit={len(legit_vals)})")

    n_ambig = sum(1 for r in rows if r["label"] == "ambiguous")
    if n_ambig:
        print(f"\n{n_ambig} region(s) labelled AMBIGUOUS (excluded from bands) — manual read required:")
        for r in rows:
            if r["label"] == "ambiguous":
                print(f"  p{r.get('page')} r{r.get('region')} n_chars={r.get('n_chars')} "
                      f"excerpt={r.get('text_excerpt', '')[:120]!r}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
