"""
scripts/audits/pdfx-pek-mem-arena-probe.py

FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM — isolated reproduction/
discrimination probe for the PEK (PDF-Extract-Kit) in-process RSS-growth
mechanism in apps/pdf-extractor.

WHAT THIS DOES
    Runs the REAL production code path (infrastructure.pek_engine_adapter.
    _load_pek_models + PekLayoutModel.predict_pdfs, i.e. the doclayout_yolo
    YOLOv10 layout pass over a whole PDF) TWICE against a real BCTC PDF,
    sampling this process's own VmRSS at each stage, and A/B-tests glibc
    malloc_trim(0) after each pass. This discriminates AC5's three
    candidates for the retained-idle-floor mechanism:
      (a) unreleased Python heap        -> gc.collect() would recover it
      (b) glibc malloc-arena fragmentation -> malloc_trim(0) would recover it
      (c) deliberate cache (torch/paddle's own native pool)
                                          -> NEITHER gc nor malloc_trim
                                             touches it (never free()'d back
                                             to glibc in the first place)

WHY A SEPARATE CONTAINER, NOT THE LIVE PID1
    malloc_trim(0) and repeated model-load/inference cycles are memory-
    hungry and must NOT run inside the live production pdf-extractor
    container (shared 2.5 GiB cgroup budget with the real uvicorn PID1 —
    an OOM in this probe could take PID1 down as collateral, and the
    production container's lifecycle must stay read-only per this row's
    scope_out). This script is designed to run in a THROWAWAY, separate-
    cgroup `docker run --rm` container from the SAME image, so it never
    touches the live container's memory budget.

USAGE (from repo root, docker compose project already built):
    SCRATCH=/path/to/a/tmp/dir   # only needs to hold nothing; script is bind-mounted directly
    docker run --rm \
      -v vn-market-intelligence-mcp_pek_model_cache:/app/PDF-Extract-Kit/models \
      -v "$(pwd)/data/pdfs:/app/data/pdfs:ro" \
      -v "$(pwd)/scripts/audits:/probe:ro" \
      -e HUGGINGFACE_HUB_CACHE=/app/PDF-Extract-Kit/models/huggingface \
      -e MODELSCOPE_CACHE=/app/PDF-Extract-Kit/models/modelscope \
      -e YOLO_CONFIG_DIR=/app/PDF-Extract-Kit/models/yolo \
      -e PADDLE_OCR_BASE_DIR=/app/PDF-Extract-Kit/models/paddleocr \
      --entrypoint python3 \
      vn-market-intelligence-mcp-pdf-extractor:latest \
      /probe/pdfx-pek-mem-arena-probe.py /app/data/pdfs/<real-scanned-bctc>.pdf

RESULT ON RECORD (2026-08-07T23:48-23:51Z, NVL.pdf, 59 real pages, this
exact script, docs/architecture-briefs/2026-08-07-fix-pdfx-parent-process-
memory-burst-headroom.md § Evidence):
    start                    rss=10,008 kB
    models_loaded            rss=865,676 kB   (+845.4 MiB — model load alone,
                                                NOT the ~80MB main.py comment claims)
    job1_layout_done (59p)   rss=1,362,472 kB (+485.2 MiB for ONE document)
    job1_after_gc             rss=1,362,472 kB (0 recovered — rules out (a))
    job1_after_malloc_trim    rss=1,192,616 kB (-165.9 MiB recovered — (b) confirmed live)
    job2_layout_done (59p)   rss=1,428,980 kB (+230.8 MiB — 2nd pass, smaller
                                                than job1's cold-start delta)
    job2_after_malloc_trim    rss=1,193,336 kB (-230.1 MiB — ~99.7% of job2's
                                                own growth recovered by malloc_trim(0))
    => steady-state per-job RSS growth is DOMINANTLY glibc-malloc-arena-
       retained memory, reclaimable via malloc_trim(0); trimmed floor is
       STABLE across repeated jobs (1,192,616 -> 1,193,336 kB, +0.06%).
"""
import ctypes
import gc
import sys
import time


def rss_kb() -> int:
    with open("/proc/self/status") as f:
        for line in f:
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    return -1


def log(stage: str, extra=None) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[PROBE] stage={stage} rss_kb={rss_kb()} ts={ts} extra={extra}", flush=True)


def main() -> None:
    sys.path.insert(0, "/app")
    sys.path.insert(0, "/app/PDF-Extract-Kit")

    log("start")

    from infrastructure.pek_engine_adapter import _load_pek_models  # noqa: E402

    t0 = time.time()
    models = _load_pek_models()
    log("models_loaded", {"elapsed_s": round(time.time() - t0, 1)})

    layout_task = models["layout_task"]
    paddle_table = models["paddle_table"]
    log("models_ready", {
        "layout_task_loaded": layout_task is not None,
        "paddle_table_loaded": paddle_table is not None,
    })

    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "/app/data/pdfs/NVL.pdf"
    libc = ctypes.CDLL("libc.so.6")

    for job_idx in (1, 2):
        t0 = time.time()
        results = layout_task.predict_pdfs([pdf_path])
        elapsed = time.time() - t0
        npages = len(results[0]) if results else 0
        log(f"job{job_idx}_layout_done", {"pdf": pdf_path, "pages": npages, "elapsed_s": round(elapsed, 1)})

        gc.collect()
        log(f"job{job_idx}_after_gc")

        trimmed = libc.malloc_trim(0)
        log(f"job{job_idx}_after_malloc_trim", {"malloc_trim_returned": trimmed})

    log("gc_stats_final", {"counts": gc.get_count(), "garbage_len": len(gc.garbage)})
    print("[PROBE] DONE", flush=True)


if __name__ == "__main__":
    main()
