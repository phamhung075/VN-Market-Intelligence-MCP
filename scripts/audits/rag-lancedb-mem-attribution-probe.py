"""
scripts/audits/rag-lancedb-mem-attribution-probe.py

FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS — PO ruling
po_RULING_CRITICAL_PATH_20260814T0927Z: "no more restart-timing or
deploy-config tweaks... the deliverable is a per-allocation-site attribution
of the growth, from cold start, under live traffic, sufficient to name the
retaining object graph" and explicitly "NOT inferred from RSS deltas".

WHY THIS PROBE DIFFERS FROM THE PRIOR TWO (rag-embedder-mem-arena-probe.py,
rag-lancedb-search-mem-arena-probe.py, both 2026-08-12): those report ONE
number (RSS before/after). This probe layers THREE independent, orthogonal
measurement planes at every checkpoint so growth can be attributed to a
LAYER, not just observed as a magnitude:

  1. tracemalloc — Python-level allocation attribution by file:line. If the
     growth were CPython-heap-resident (lists/dicts/strings piling up in our
     own code), this would show it directly, growing proportionally to RSS.
  2. gc object-type census (stdlib `gc.get_objects()` + `collections.Counter`
     — a dependency-free objgraph.show_growth() equivalent; objgraph itself
     is NOT installed in the deployed image and this avoids adding a new
     runtime dependency for a one-off diagnostic). Growing counts of
     lancedb.* / pyarrow.* wrapper classes would mean Python is holding
     REFERENCES that keep native buffers alive (a Python-attributable retain
     site even though the bytes themselves are native).
  3. pyarrow's own native memory-pool accounting
     (`pyarrow.total_allocated_bytes()` / `default_memory_pool()`) — Arrow
     buffers (RecordBatches, Arrays from `.to_list()`/`.to_arrow()`) are
     allocated through this pool, INDEPENDENT of glibc malloc. Confirmed
     live on the deployed image (2026-08-14): this pool's backend is
     `mimalloc`, not glibc — i.e. a THIRD allocator context in play, entirely
     unreached by `_malloc_trim_or_noop()`'s glibc `malloc_trim(0)` (which
     can only ever address glibc's own arena, see FIX-PDFX precedent). If
     RSS grows while this pool's `bytes_allocated()` stays flat, Arrow-level
     buffers are NOT the source and the leak is further down, inside
     lance-core's own Rust allocations that never route through PyArrow's
     Python-visible pool at all — a real, load-bearing elimination result,
     not a guess.

By elimination across all three planes we can SAY, not infer: "Python-heap
growth is/isn't proportional to RSS growth" and "Arrow-pool growth is/isn't
proportional to RSS growth" — which layer (repo Python code / PyArrow /
lance-core Rust internals) is actually retaining the bytes.

TRAFFIC MIX — THE KEY METHODOLOGICAL FIX vs the two 2026-08-12 probes: both
prior probes tested ONLY search() in isolation. Live production traffic on
the deployed container (docker logs, 2026-08-14T09:39Z, 60min window) is
POST /index : POST /search ≈ 79 : 19 (~4:1), i.e. WRITE-DOMINATED, not
read-dominated. Neither prior probe ever exercised insert()/compact() at
all. This probe drives the SAME ~4:1 write:read ratio against the real
LanceDBVectorStore singleton (same call shape production uses — one store
instance reused across all calls, matching infrastructure/repositories.py's
own _get_table() singleton contract) and runs past _COMPACT_EVERY=100 so
table.optimize() fires for real, not just insert()/search() alone.

USAGE (from repo root, docker compose project already built):
    docker run --rm \
      -v "$SCRATCH/lancedb-copy/lancedb:/app/data/lancedb:rw" \
      -v "$(pwd)/scripts/audits:/probe:ro" \
      -e LANCEDB_PATH=/app/data/lancedb \
      --entrypoint python3 \
      vn-market-intelligence-mcp-rag-service:latest \
      /probe/rag-lancedb-mem-attribution-probe.py [N_OPS] [CHECKPOINT_EVERY]

    N_OPS defaults to 260 (>1x _COMPACT_EVERY so optimize() fires at least
    twice). CHECKPOINT_EVERY defaults to 20.

NOTE: uses a COPY of the corpus (rw this time — insert() needs write access)
— never point this at the live container's own data/live/lancedb directory
while it is running; see the sibling probe's docstring for the full
rationale (concurrent version churn confound + never race the live writer).
"""
import asyncio
import gc
import os
import random
import sys
import time
import tracemalloc
from collections import Counter
from datetime import datetime, timezone


def rss_kb() -> int:
    with open("/proc/self/status") as f:
        for line in f:
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    return -1


def log(stage: str, extra=None) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[ATTRIB] stage={stage} rss_kb={rss_kb()} ts={ts} extra={extra}", flush=True)


def _safe_type_key(o) -> str:
    try:
        t = type(o)
        mod = getattr(t, "__module__", None)
        name = getattr(t, "__name__", None) or repr(t)
        if isinstance(mod, str) and mod not in ("builtins", None):
            return f"{mod}.{name}"
        return str(name)
    except Exception:  # noqa: BLE001 — census must never crash the probe
        return "<unknown>"


def gc_type_census() -> Counter:
    gc.collect()
    return Counter(_safe_type_key(o) for o in gc.get_objects())


def report_deltas(label: str, before: Counter, after: Counter, top_n: int = 15) -> None:
    deltas = Counter()
    for k in set(before) | set(after):
        d = after.get(k, 0) - before.get(k, 0)
        if d != 0:
            deltas[k] = d
    top = deltas.most_common(top_n)
    print(f"[ATTRIB] {label} gc_type_growth_top{top_n}=" + repr(top), flush=True)
    # Specifically call out lancedb/pyarrow wrapper classes even if outside top N —
    # these are the ones that would name a Python-held reference to native buffers.
    named = {k: v for k, v in deltas.items() if k.startswith(("lancedb.", "pyarrow."))}
    print(f"[ATTRIB] {label} gc_type_growth_lancedb_pyarrow_only=" + repr(named), flush=True)


def pyarrow_pool_bytes() -> dict:
    try:
        import pyarrow as pa

        pool = pa.default_memory_pool()
        return {
            "backend_name": pool.backend_name,
            "bytes_allocated": pool.bytes_allocated(),
            "max_memory": pool.max_memory(),
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def tracemalloc_top(label: str, snapshot_before, top_n: int = 10) -> None:
    snapshot_after = tracemalloc.take_snapshot()
    stats = snapshot_after.compare_to(snapshot_before, "lineno") if snapshot_before else snapshot_after.statistics("lineno")
    print(f"[ATTRIB] {label} tracemalloc_top{top_n}:", flush=True)
    for stat in stats[:top_n]:
        print(f"[ATTRIB]   {stat}", flush=True)
    current, peak = tracemalloc.get_traced_memory()
    print(f"[ATTRIB] {label} tracemalloc_current_kb={current // 1024} tracemalloc_peak_kb={peak // 1024}", flush=True)


async def _run(n_ops: int, checkpoint_every: int) -> None:
    sys.path.insert(0, "/app")

    from domain.models import AnalysisEntry, EmbeddingVector  # noqa: E402
    from infrastructure.repositories import LanceDBVectorStore  # noqa: E402

    tracemalloc.start(25)

    log("start", {"n_ops": n_ops, "checkpoint_every": checkpoint_every})
    print(f"[ATTRIB] pyarrow_pool_start={pyarrow_pool_bytes()}", flush=True)

    db_path = os.environ.get("LANCEDB_PATH", "/app/data/lancedb")
    # Optional: exercise the bounded-Session fix (FIX-RAG-EMBEDDER-IDLE-UNLOAD-
    # ALLOCATOR-PAGES-NOT-RETURNED-TO-OS) by setting PROBE_INDEX_CACHE_MB /
    # PROBE_METADATA_CACHE_MB. Unset (default) reproduces the PRE-fix baseline —
    # lancedb's own unbounded Session.default() (6GB index / 1GB metadata).
    index_cache_mb = os.environ.get("PROBE_INDEX_CACHE_MB")
    metadata_cache_mb = os.environ.get("PROBE_METADATA_CACHE_MB")
    index_cache_bytes = int(index_cache_mb) * 1024 * 1024 if index_cache_mb else None
    metadata_cache_bytes = int(metadata_cache_mb) * 1024 * 1024 if metadata_cache_mb else None
    log("session_config", {"index_cache_bytes": index_cache_bytes, "metadata_cache_bytes": metadata_cache_bytes})
    # Real production singleton pattern — ONE store instance reused for every
    # call, exactly like app_factory.build_real_adapters()'s single
    # LanceDBVectorStore wired into both SearchUseCase and IndexUseCase.
    store = LanceDBVectorStore(
        db_path=db_path,
        index_cache_bytes=index_cache_bytes,
        metadata_cache_bytes=metadata_cache_bytes,
    )

    t0 = time.time()
    row_count = await store.count()
    log("table_opened", {"elapsed_s": round(time.time() - t0, 1), "row_count": row_count})

    random.seed(42)
    baseline_gc = gc_type_census()
    baseline_trace_snapshot = tracemalloc.take_snapshot()
    baseline_rss = rss_kb()
    baseline_arrow = pyarrow_pool_bytes()

    # ~4:1 write:read ratio, matching live docker logs 2026-08-14T09:39Z
    # (79 POST /index : 19 POST /search over 60min). insert() every call
    # except every 5th, which is a search() — reproduces the dominant real
    # traffic shape, not a search-only synthetic pattern.
    for i in range(n_ops):
        if i % 5 == 4:
            qvec = EmbeddingVector(dims=384, values=[random.uniform(-1.0, 1.0) for _ in range(384)])
            await store.search(query_vector=qvec, limit=10)
            op = "search"
        else:
            vec = EmbeddingVector(dims=384, values=[random.uniform(-1.0, 1.0) for _ in range(384)])
            entry = AnalysisEntry(
                id=f"probe-{i}-{random.randint(0, 10**9)}",
                level="global",
                title=f"probe title {i}",
                summary=f"probe summary body text for attribution probe iteration {i}",
                tags=["probe", "memory-attribution"],
                created_at=datetime.now(tz=timezone.utc),
                action_code=None,
            )
            await store.insert(entry, vec)
            op = "insert"

        if (i + 1) % checkpoint_every == 0 or i == n_ops - 1:
            sess = getattr(store, "_session", None)
            sess_info = {"size_bytes": sess.size_bytes, "approx_num_items": sess.approx_num_items} if sess else "unbounded(no session)"
            log(f"op_{i}", {"op": op, "insert_count_since_compact": store._insert_count, "session": sess_info})
            cp_gc = gc_type_census()
            report_deltas(f"checkpoint_{i+1}_vs_baseline", baseline_gc, cp_gc)
            cp_arrow = pyarrow_pool_bytes()
            print(f"[ATTRIB] checkpoint_{i+1} pyarrow_pool={cp_arrow} "
                  f"arrow_bytes_delta_vs_baseline={cp_arrow.get('bytes_allocated', 0) - baseline_arrow.get('bytes_allocated', 0)}",
                  flush=True)
            print(f"[ATTRIB] checkpoint_{i+1} rss_delta_vs_baseline_kb={rss_kb() - baseline_rss}", flush=True)
            tracemalloc_top(f"checkpoint_{i+1}", baseline_trace_snapshot)

    log("loop_done", {"final_rss_delta_kb": rss_kb() - baseline_rss})

    gc.collect()
    log("after_gc", {"rss_delta_vs_baseline_kb": rss_kb() - baseline_rss})

    final_gc = gc_type_census()
    report_deltas("final_vs_baseline", baseline_gc, final_gc)
    final_arrow = pyarrow_pool_bytes()
    print(f"[ATTRIB] final pyarrow_pool={final_arrow} "
          f"arrow_bytes_delta_vs_baseline={final_arrow.get('bytes_allocated', 0) - baseline_arrow.get('bytes_allocated', 0)}",
          flush=True)
    tracemalloc_top("final", baseline_trace_snapshot, top_n=20)

    try:
        import ctypes

        libc = ctypes.CDLL("libc.so.6")
        libc.malloc_trim(0)
        log("after_malloc_trim", {"rss_delta_vs_baseline_kb": rss_kb() - baseline_rss})
    except (OSError, AttributeError) as exc:
        log("malloc_trim_unavailable", {"error": str(exc)})

    print("[ATTRIB] DONE", flush=True)


def main() -> None:
    n_ops = int(sys.argv[1]) if len(sys.argv) > 1 else 260
    checkpoint_every = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    asyncio.run(_run(n_ops, checkpoint_every))


if __name__ == "__main__":
    main()
