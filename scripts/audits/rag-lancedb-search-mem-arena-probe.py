"""
scripts/audits/rag-lancedb-search-mem-arena-probe.py

FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS — isolated
reproduction/discrimination probe for candidate (2) named in the PO's
2026-08-12T03:03:00Z status_note ("LanceDB reader handles or version-dir
mmaps held open per query"): does repeated search()/vector_search() traffic
against the SAME already-open AsyncTable handle (the real production
singleton pattern — infrastructure.repositories.LanceDBVectorStore._get_table()
opens the connection/table exactly once and reuses it for every call) grow
RSS monotonically call-over-call, and is any of that growth glibc-malloc-
arena-retained (malloc_trim(0)-recoverable) vs a genuine unreclaimable
native cache?

WHAT THIS DOES
    Runs the REAL production code path (infrastructure.repositories.
    LanceDBVectorStore.search(), i.e. exactly what POST /search calls) N
    times in a row against a READ-ONLY COPY of the real production corpus
    (NOT the live container's own data directory — see below), sampling
    VmRSS after every call. After the loop: gc.collect() then
    malloc_trim(0), same sequencing as the sibling embedder probe
    (scripts/audits/rag-embedder-mem-arena-probe.py), so each mechanism's
    own marginal recovery is visible.

WHY A READ-ONLY *COPY*, NOT A READ-ONLY BIND-MOUNT OF data/live/lancedb
    A bind-mount of the live directory would still be safe from a write
    perspective (`:ro`), but the live rag-service container is concurrently
    writing new LanceDB versions to that same directory (ragIndex() traffic,
    compaction) for the entire duration of this probe — introducing a
    confound (this probe's read pattern would be racing real version churn,
    not exercising a stable, reproducible corpus). A snapshot copy removes
    that confound entirely and costs nothing the live container needs
    (LanceDB's on-disk format is plain files, `cp -R` is a safe,
    non-invasive read of the host bind-mount source, never touching the
    running container).

USAGE (from repo root, docker compose project already built, corpus copy
already made — see the architect brief for the exact `cp -R` invocation):
    docker run --rm \
      -v "$SCRATCH/lancedb-copy/lancedb:/app/data/lancedb:ro" \
      -v "$(pwd)/scripts/audits:/probe:ro" \
      -e LANCEDB_PATH=/app/data/lancedb \
      --entrypoint python3 \
      vn-market-intelligence-mcp-rag-service:latest \
      /probe/rag-lancedb-search-mem-arena-probe.py [N_CALLS]

    N_CALLS defaults to 200.

NOTE: LanceDB's Rust core may still attempt to `open()` files O_RDWR
internally for lock/manifest bookkeeping even on a logically read-only
workload; if this probe fails with a permission error, the corrected
invocation drops `:ro` on the copy (still a throwaway copy, still zero
impact on the live container either way — never drop `:ro` on anything
that is NOT a copy).
"""
import asyncio
import ctypes
import gc
import os
import random
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


async def _run(n_calls: int) -> None:
    sys.path.insert(0, "/app")

    from domain.models import EmbeddingVector  # noqa: E402
    from infrastructure.repositories import LanceDBVectorStore  # noqa: E402

    log("start", {"n_calls": n_calls})

    db_path = os.environ.get("LANCEDB_PATH", "/app/data/lancedb")
    store = LanceDBVectorStore(db_path=db_path)

    t0 = time.time()
    row_count = await store.count()
    log("table_opened", {"elapsed_s": round(time.time() - t0, 1), "row_count": row_count})

    libc = ctypes.CDLL("libc.so.6")
    rss_series = []
    random.seed(42)  # deterministic across reruns; still 384 distinct floats per call

    for i in range(n_calls):
        qvec = EmbeddingVector(dims=384, values=[random.uniform(-1.0, 1.0) for _ in range(384)])
        await store.search(query_vector=qvec, limit=10)
        r = rss_kb()
        rss_series.append(r)
        if i < 5 or i % 20 == 0 or i == n_calls - 1:
            log(f"call_{i}")

    log("loop_done", {
        "rss_first": rss_series[0],
        "rss_last": rss_series[-1],
        "delta_kb": rss_series[-1] - rss_series[0],
        "delta_mib": round((rss_series[-1] - rss_series[0]) / 1024, 1),
    })

    gc.collect()
    log("after_gc", {"recovered_kb_vs_loop_end": rss_series[-1] - rss_kb()})

    trimmed = libc.malloc_trim(0)
    log("after_malloc_trim", {
        "malloc_trim_returned": trimmed,
        "recovered_kb_vs_loop_end": rss_series[-1] - rss_kb(),
    })

    log("gc_stats_final", {"counts": gc.get_count(), "garbage_len": len(gc.garbage)})
    print("[PROBE] DONE", flush=True)


def main() -> None:
    n_calls = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    asyncio.run(_run(n_calls))


if __name__ == "__main__":
    main()
