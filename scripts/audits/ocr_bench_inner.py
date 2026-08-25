#!/usr/bin/env python3
"""
scripts/audits/ocr_bench_inner.py — OCR-PADDLE-VI-LANG-FIX-AND-REBENCH

Runs INSIDE the pdf-extractor container (bind-mounted read-only, never baked
into the image). One-shot: constructs the OCR backend named by the
OCR_TEXT_BACKEND env var (same selector the live /pek-extract route uses,
infrastructure/ocr_backends.select_ocr_backend), runs the real
PekEngineAdapter.extract_layout_and_tables() pipeline against a single PDF,
pushes the result to mcp-server via the same LayoutFirstPushClient production
uses, and prints ONE line of JSON to stdout with:
  - wall time
  - resource.getrusage(RUSAGE_SELF) AND RUSAGE_CHILDREN maxrss (both reported,
    to test the "summed self+children" meter-inflation hypothesis directly)
  - this container's own cgroup memory.current/memory.peak/memory.max (to
    cross-check ru_maxrss against the kernel's own cgroup accounting from
    the SAME process, not a different one)
  - page 9 (quarterly income statement) markdown + a second table page, for
    direct diacritic-fidelity comparison across backends
  - the mcp-server push result (echo only — NOT proof of persistence; the
    caller must independently re-read market.db bctc_layout_units)

Usage (run via `docker compose run --rm --no-deps -e OCR_TEXT_BACKEND=<x> ...`):
    python3 -u ocr_bench_inner.py <report_id> <pdf_path>
"""
import asyncio
import hashlib
import json
import logging
import os
import resource
import sys
import time

# FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS (AC-3):
# the `auto` backend's per-region PaddleOCR rescue must fire on the pages that
# were genuinely missed and NOWHERE ELSE — a discriminator that rescues
# everything reintroduces PaddleOCR's Vietnamese-diacritic regression fleet
# wide. Counting the fires by eye in stderr is not evidence, so capture them
# structurally: a logging.Handler on the backend's own "RESCUE FIRED" INFO line,
# attributed to a page by watching the adapter's per-page heartbeat.
_RESCUE_FIRES: list = []
_PAGE_CTX = {"page": None}


class _RescueCapture(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = record.getMessage()
        except Exception:  # noqa: BLE001
            return
        if "extract progress page=" in msg:
            try:
                _PAGE_CTX["page"] = int(msg.split("extract progress page=")[1].split("/")[0])
            except Exception:  # noqa: BLE001
                pass
            return
        if "RESCUE FIRED" in msg:
            _RESCUE_FIRES.append({"page": _PAGE_CTX["page"], "message": msg})


def _read_cgroup_file(path: str):
    try:
        with open(path) as f:
            v = f.read().strip()
        return None if v == "max" else int(v)
    except Exception:
        return None


def main() -> None:
    report_id = sys.argv[1]
    pdf_path = sys.argv[2]
    backend_name = os.environ.get("OCR_TEXT_BACKEND", "tesseract-vie")

    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format="%(levelname)s %(name)s %(message)s",
    )
    capture = _RescueCapture(level=logging.INFO)
    logging.getLogger("infrastructure.ocr_backends").addHandler(capture)
    logging.getLogger("infrastructure.pek_engine_adapter").addHandler(capture)

    sys.path.insert(0, "/app")
    sys.path.insert(0, "/app/PDF-Extract-Kit")

    from infrastructure.ocr_backends import select_ocr_backend
    from infrastructure.pek_engine_adapter import PekEngineAdapter
    from infrastructure.layout_first_push_client import LayoutFirstPushClient

    cgroup_before = {
        "current": _read_cgroup_file("/sys/fs/cgroup/memory.current"),
        "peak": _read_cgroup_file("/sys/fs/cgroup/memory.peak"),
        "max": _read_cgroup_file("/sys/fs/cgroup/memory.max"),
    }

    ocr_backend = select_ocr_backend(paddle_table=None)
    adapter = PekEngineAdapter(ocr_backend=ocr_backend)

    # Time the TABLE PHASE separately from the whole extraction. The two are not
    # interchangeable — layout detection (DocLayout-YOLO over every page) is the
    # larger half of wall_time_s and is identical across text backends, so
    # comparing a whole-run figure against a table-phase baseline understates the
    # difference between backends by more than 2x.
    phase = {"table_phase_s": None, "peak_at_table_start": None}
    _orig_table = PekEngineAdapter._run_table_extraction

    def _timed_table_extraction(self, *args, **kwargs):
        phase["peak_at_table_start"] = _read_cgroup_file("/sys/fs/cgroup/memory.peak")
        _s = time.perf_counter()
        try:
            return _orig_table(self, *args, **kwargs)
        finally:
            phase["table_phase_s"] = round(time.perf_counter() - _s, 2)

    PekEngineAdapter._run_table_extraction = _timed_table_extraction

    t0 = time.perf_counter()
    result = adapter.extract_layout_and_tables(pdf_path=pdf_path, report_id=report_id)
    t1 = time.perf_counter()

    ru_self = resource.getrusage(resource.RUSAGE_SELF)
    ru_children = resource.getrusage(resource.RUSAGE_CHILDREN)

    cgroup_after = {
        "current": _read_cgroup_file("/sys/fs/cgroup/memory.current"),
        "peak": _read_cgroup_file("/sys/fs/cgroup/memory.peak"),
        "max": _read_cgroup_file("/sys/fs/cgroup/memory.max"),
    }
    cgroup_events = {}
    try:
        with open("/sys/fs/cgroup/memory.events") as f:
            for line in f:
                k, v = line.split()
                cgroup_events[k] = int(v)
    except Exception:
        pass

    units = result.get("units", [])
    document_map = result.get("document_map", {})
    page_zones = result.get("page_zones", [])
    pass_rate_report = result.get("pass_rate_report", {})

    # Map schema_page -> unit for quick lookup (document_map carries page_type)
    page_to_unit = {}
    for u in document_map.get("units", []):
        for p in u.get("pages", []):
            page_to_unit[p] = u

    def excerpt_for_page(page_num: int, n: int = 900):
        u_meta = page_to_unit.get(page_num)
        if not u_meta:
            return None
        uid = u_meta["unit_id"]
        match = next((u for u in units if u["unit_id"] == uid), None)
        if not match:
            return None
        return {
            "unit_id": uid,
            "page_type": u_meta.get("page_type"),
            "row_count": match.get("row_count"),
            "quarantined": match.get("quarantined"),
            "quarantine_reason": match.get("quarantine_reason"),
            "markdown_excerpt": (match.get("stitched_markdown") or "")[:n],
        }

    table_pages = sorted(
        p for p, u in page_to_unit.items() if u.get("page_type") == "table"
    )

    # AC-3 evidence at unit granularity: a digest of every unit's stitched
    # markdown, so two backend runs can be diffed unit-by-unit WITHOUT going
    # through the DB (which only ever holds the most recent push). "Only page 9
    # differs" is a stronger negative control than a rescue counter alone,
    # because it also catches a rescue that fired and then silently lost.
    unit_digests = {}
    for pnum in sorted(page_to_unit):
        uid = page_to_unit[pnum]["unit_id"]
        match = next((u for u in units if u["unit_id"] == uid), None)
        md = (match or {}).get("stitched_markdown") or ""
        unit_digests[str(pnum)] = {
            "page_type": page_to_unit[pnum].get("page_type"),
            "md_len": len(md),
            "sha256": hashlib.sha256(md.encode("utf-8")).hexdigest()[:16],
        }

    out = {
        "backend": backend_name,
        "report_id": report_id,
        "wall_time_s": round(t1 - t0, 2),
        "table_phase_s": phase["table_phase_s"],
        "cgroup_peak_at_table_start": phase["peak_at_table_start"],
        "ru_maxrss_self_kb": ru_self.ru_maxrss,
        "ru_maxrss_self_mib_div1024": round(ru_self.ru_maxrss / 1024, 1),
        "ru_maxrss_self_mib_div1000": round(ru_self.ru_maxrss / 1000, 1),
        "ru_maxrss_children_kb": ru_children.ru_maxrss,
        "ru_maxrss_self_plus_children_mib_div1024": round(
            (ru_self.ru_maxrss + ru_children.ru_maxrss) / 1024, 1
        ),
        "cgroup_before": cgroup_before,
        "cgroup_after": cgroup_after,
        "cgroup_events": cgroup_events,
        "total_pages": document_map.get("total_pages"),
        "table_pages": table_pages,
        "unit_digests": unit_digests,
        "rescue_fire_count": len(_RESCUE_FIRES),
        "rescue_fire_pages": sorted({f["page"] for f in _RESCUE_FIRES if f["page"]}),
        "rescue_fires": _RESCUE_FIRES,
        "pass_rate_report": pass_rate_report,
        "page_9": excerpt_for_page(9),
        "page_5_sample": excerpt_for_page(table_pages[0]) if table_pages else None,
    }

    # Push via the SAME client production uses — result is an ECHO only
    # (project_mcp_server_write_wedge); the caller independently re-reads
    # market.db bctc_layout_units for the real count, never trusts this.
    async def _push():
        client = LayoutFirstPushClient(
            mcp_server_url=os.environ.get("MCP_SERVER_URL", "http://mcp-server:3000")
        )
        return await client.push_layout(
            report_id=report_id,
            document_map=document_map,
            units=units,
            page_zones=page_zones,
            pass_rate_report=pass_rate_report,
        )

    try:
        push_result = asyncio.run(_push())
        out["push_echo"] = push_result
    except Exception as exc:  # noqa: BLE001
        out["push_error"] = str(exc)

    print("OCR_BENCH_RESULT_JSON " + json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
