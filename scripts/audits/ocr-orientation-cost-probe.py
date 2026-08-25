#!/usr/bin/env python3
"""
scripts/audits/ocr-orientation-cost-probe.py
FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN — AC-5.

Measures the wall-clock AND memory cost the orientation step adds, A/B, inside
the pdf-extractor container:

    ARM A (baseline)  rasterize -> OCR
    ARM B (treatment) rasterize -> correct_orientation -> OCR

MEMORY IS READ FROM THE CONTAINER CGROUP, never from ru_maxrss. ru_maxrss
double-counts copy-on-write pages across the per-cell tesseract forks and would
report a fabricated regression. Specifically:

    /sys/fs/cgroup/memory.current   sampled every SAMPLE_S during each arm;
                                    the max over the window is that arm's peak.
                                    (memory.peak itself is monotonic for the
                                    life of the cgroup and is NOT writable from
                                    inside the container, so it cannot be reset
                                    between arms — its DELTA is still reported.)
    /sys/fs/cgroup/memory.peak      before/after, delta reported.
    /sys/fs/cgroup/memory.events    before/after; `max` and `oom_kill` are the
                                    counters the 2026-08-25T17:52Z PO ruling
                                    used, baseline 0.
    /sys/fs/cgroup/memory.max       the cap, printed so no report ever again
                                    quotes a stale figure from memory.

Usage (from the repo root):
    docker cp scripts/audits/ocr-orientation-cost-probe.py \
        vn-market-intelligence-mcp-pdf-extractor-1:/tmp/cost-probe.py
    docker exec vn-market-intelligence-mcp-pdf-extractor-1 python3 /tmp/cost-probe.py \
        --pdf /app/data/pdfs/VIC_2026_Q1.pdf --pages 11,13,14,15,16,34,41,60,61,67 \
        --code-root /tmp/pdfxfix --repeats 2

Caveat, stated rather than hidden: the container is LIVE. Other requests hitting
the service during the run perturb memory.current. Run the arms interleaved
(--repeats >= 2) and compare the arm medians, not a single pair.
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time

CGROUP = "/sys/fs/cgroup"
SAMPLE_S = 0.1


def _read_int(name: str) -> int:
    try:
        with open(f"{CGROUP}/{name}", encoding="utf-8") as fh:
            return int(fh.read().strip())
    except Exception:
        return -1


def _read_events() -> dict:
    out = {}
    try:
        with open(f"{CGROUP}/memory.events", encoding="utf-8") as fh:
            for line in fh:
                k, _, v = line.partition(" ")
                out[k.strip()] = int(v.strip())
    except Exception:
        pass
    return out


class _Sampler:
    """Sample memory.current on a background thread; report the window max."""

    def __init__(self) -> None:
        self.max_bytes = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        while not self._stop.is_set():
            cur = _read_int("memory.current")
            if cur > self.max_bytes:
                self.max_bytes = cur
            self._stop.wait(SAMPLE_S)

    def __enter__(self) -> "_Sampler":
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._stop.set()
        self._thread.join(timeout=2.0)


def _render(doc, page_number: int, dpi: int):
    import fitz  # noqa: F401
    import numpy as np

    page = doc[page_number - 1]
    pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72.0, dpi / 72.0))
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        arr = arr[:, :, :3]
    elif pix.n == 1:
        arr = np.stack([arr[:, :, 0]] * 3, axis=-1)
    return arr


def _arm(doc, pages, dpi, lang, config, with_orientation: bool) -> dict:
    import pytesseract
    from PIL import Image

    from infrastructure.ocr_orientation import correct_orientation

    peak_before = _read_int("memory.peak")
    ev_before = _read_events()

    per_page_orientation_s = []
    t0 = time.perf_counter()
    with _Sampler() as sampler:
        for p in pages:
            arr = _render(doc, p, dpi)
            if with_orientation:
                t_or = time.perf_counter()
                arr, _deg = correct_orientation(arr)
                per_page_orientation_s.append(time.perf_counter() - t_or)
            pytesseract.image_to_string(Image.fromarray(arr), lang=lang, config=config)
    total_s = time.perf_counter() - t0

    peak_after = _read_int("memory.peak")
    ev_after = _read_events()

    return {
        "arm": "B_with_orientation" if with_orientation else "A_baseline",
        "pages": len(pages),
        "total_s": round(total_s, 2),
        "s_per_page": round(total_s / max(1, len(pages)), 3),
        "orientation_s_per_page": (
            round(sum(per_page_orientation_s) / len(per_page_orientation_s), 3)
            if per_page_orientation_s else 0.0
        ),
        "window_peak_current_mib": round(sampler.max_bytes / 1048576, 1),
        "cgroup_peak_before_mib": round(peak_before / 1048576, 1),
        "cgroup_peak_after_mib": round(peak_after / 1048576, 1),
        "cgroup_peak_delta_mib": round((peak_after - peak_before) / 1048576, 1),
        "events_max_delta": ev_after.get("max", 0) - ev_before.get("max", 0),
        "events_oom_kill_delta": ev_after.get("oom_kill", 0) - ev_before.get("oom_kill", 0),
        "events_after": ev_after,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--pages", required=True)
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--lang", default="vie+eng")
    ap.add_argument("--config", default="--psm 6")
    ap.add_argument("--repeats", type=int, default=2)
    ap.add_argument("--code-root", default="/app")
    ap.add_argument("--json-out", default="")
    args = ap.parse_args()

    sys.path.insert(0, args.code_root)
    import fitz

    cap = _read_int("memory.max")
    print(f"cgroup memory.max = {cap} B = {cap / 1048576:.0f} MiB = {cap / 1073741824:.2f} GiB")
    print(f"cgroup memory.events at start = {_read_events()}")
    print()

    doc = fitz.open(args.pdf)
    pages = [int(p) for p in args.pages.split(",") if p.strip()]

    runs = []
    for i in range(args.repeats):
        for with_or in (False, True):
            rec = _arm(doc, pages, args.dpi, args.lang, args.config, with_or)
            rec["repeat"] = i
            runs.append(rec)
            print(f"[{rec['arm']}#{i}] {rec['total_s']:>6.2f}s total  "
                  f"{rec['s_per_page']:.3f}s/page  "
                  f"orientation {rec['orientation_s_per_page']:.3f}s/page  "
                  f"window_peak {rec['window_peak_current_mib']:.1f} MiB  "
                  f"cgroup_peak_delta {rec['cgroup_peak_delta_mib']:+.1f} MiB  "
                  f"events max+{rec['events_max_delta']} oom_kill+{rec['events_oom_kill_delta']}",
                  flush=True)
    doc.close()

    def _median(vals):
        s = sorted(vals)
        return s[len(s) // 2]

    a = [r for r in runs if r["arm"] == "A_baseline"]
    b = [r for r in runs if r["arm"] == "B_with_orientation"]
    print()
    print("MEDIANS")
    print(f"  s/page             A={_median([r['s_per_page'] for r in a]):.3f}  "
          f"B={_median([r['s_per_page'] for r in b]):.3f}  "
          f"delta={_median([r['s_per_page'] for r in b]) - _median([r['s_per_page'] for r in a]):+.3f}")
    print(f"  window peak MiB    A={_median([r['window_peak_current_mib'] for r in a]):.1f}  "
          f"B={_median([r['window_peak_current_mib'] for r in b]):.1f}  "
          f"delta={_median([r['window_peak_current_mib'] for r in b]) - _median([r['window_peak_current_mib'] for r in a]):+.1f}")
    print(f"  events max total   {sum(r['events_max_delta'] for r in runs)}")
    print(f"  events oom_kill    {sum(r['events_oom_kill_delta'] for r in runs)}")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump({"cap_bytes": cap, "runs": runs}, fh, indent=1)
        print(f"\nwrote {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
