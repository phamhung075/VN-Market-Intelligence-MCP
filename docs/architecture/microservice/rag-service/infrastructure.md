# rag-service — Infrastructure

## LanceDBVectorStore
- **File:** `apps/rag-service/infrastructure/repositories.py`
- Implements `VectorStorePort`

### Schema
```
Table: "rag_entries"
Columns:
  id: TEXT PRIMARY KEY
  level: TEXT
  title: TEXT
  summary: TEXT
  vector: ARRAY[float] (384-dim)
  tags: TEXT (JSON string)
  action_code: TEXT
  created_at: TEXT (ISO datetime)
```

### insert(entry, vector)
Builds row dict, calls `table.add([row])`. Tags serialized to JSON.

After each insert, increments an internal `_insert_count` counter. When
`_insert_count >= _COMPACT_EVERY` (100), calls `compact()` automatically then
resets the counter. Compaction failure is non-fatal — insert still succeeds.

### compact()
Runs `table.optimize(cleanup_older_than=self._compact_retention)` —
`self._compact_retention` defaults to the module constant `_COMPACT_RETENTION`
(2 days) but is normally overridden in production via `Config.
lancedb_compact_retention_hours` (env `LANCEDB_COMPACT_RETENTION_HOURS`,
default **1h** — see the
`FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (in-process
attribution, 2026-08-14)` section below for why the 2-day default was measured
to never prune anything in this container's real uptime):
- Merges small fragment files into larger compacted files (online-safe, reads/writes continue)
- Prunes version manifests older than the configured retention window; latest version is always kept
- Resets `_insert_count` to 0 **in a `finally:` block — unconditionally, whether `optimize()`
  succeeds or raises** (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP, 2026-08-05: the reset used to
  live only in the try success-path, so a failed `optimize()` left the counter stuck
  `>= _COMPACT_EVERY` and every subsequent `insert()` re-fired a full-table optimize —
  repeated large rewrites inside the container's thin memory headroom)
- Failure is logged as WARNING and does not raise
- Serialized by a per-instance `asyncio.Lock` (`self._compact_lock`): if a compaction is
  already in flight when a second concurrent `insert()` crosses `_COMPACT_EVERY`, that
  second `compact()` call returns immediately without launching its own `optimize()` — the
  in-flight compaction's `finally` resets the counter for both callers
- Can be called directly for manual/maintenance runs (e.g. a `/compact` admin endpoint or cron)

**Why this matters:** every `table.add()` creates a new fragment file + manifest version.
Without periodic compaction, a 100-insert/day workload produces ~36k fragments/year and
several GB of write-amplification. With this guard, fragments converge to a single compacted
file after each compaction cycle (~100 inserts).

### search(query_vector, limit, level_filter?, action_code_filter?)
1. Build filter clauses:
   - Level filter: validates against `{"global", "country", "domain", "action"}`
   - Action code filter: validates regex `^[A-Z0-9]{1,10}$` (stock ticker format)
2. Over-fetch: `wide_limit = min(50, max(limit*4, limit))`
3. Vector search: `table.vector_search(query_vector.values).limit(wide_limit).where(...)`
4. Dedup by `(title, summary)` key (same article re-indexed multiple times)
5. Parse tags from JSON string
6. Return `list[SearchResult]` with L2 distance

**FIXED (2026-08-12, dev-rag-service, `FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS`):**
until this fix, no vector index existed on the `vector` column (only `title`/`summary` had FTS indexes —
see below), so every `vector_search()`/`.nearest_to()` call was LanceDB's brute-force exact-kNN scan over
the full column. The architect's 2026-08-12 brief
(`docs/architecture-briefs/2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md`) isolated-
repro'd this against a 26,730-row corpus snapshot: opening the table handle alone cost ~130 MiB resident,
and repeated `search()` calls against the same open handle ramped resident memory by ~340-444 MiB within
the first ~20-60 distinct queries before plateauing — the dominant driver of that row's "monotonic growth
from a cold restart" symptom (confirmed ~65-80x larger than the embedder's own per-call footprint, which
was isolated-repro'd and ruled out as the dominant mechanism in the same cycle). `malloc_trim(0)` recovered
only ~8-15% of this — most of the floor was a live, referenced working set, not glibc-arena slack (the
periodic trim sweep landed anyway as a secondary/complementary fix — see the idle-unload section below).

**Fix landed:** `_build_vector_index()` / `_maybe_build_vector_index()` (`infrastructure/repositories.py`,
same section as `_build_fts_index()` below) build a `lancedb.index.IvfPq(distance_type="l2")` ANN index on
`vector`, lazily, the first time `search()` or `hybrid_search()` sees a corpus of at least
`_VECTOR_INDEX_MIN_ROWS = 256` rows — LanceDB's own IVF_PQ trainer floor (empirically confirmed on
lancedb 0.25.3: `RuntimeError("Not enough rows to train PQ. Requires 256 rows but only N available")`
below it). Below the floor, the check is a cheap `count_rows()` no-op, re-checked on the next call — small/
test corpora keep using the pre-existing brute-force path unchanged (zero regression). Guarded by
`_vector_index_built` (never rebuilds once True), same lifecycle contract as `_fts_index_built`. On-demand
refresh: `POST /admin/rebuild-vector-index` (see `api-reference.md`) — a SEPARATE endpoint from
`/admin/rebuild-fts`, deliberately NOT wired onto `RAG-FTS-BUILD-MEMORY-BOUND`'s disabled nightly cron
(cross-row decision the architect brief explicitly left unmade). **Open, not resolved by this fix:**
build-time memory cost of the first production IVF_PQ training pass (26,730+ rows) was not live-measured
before landing — flagged for the ops-supervised ≥2h live cold-start verification this row's own AC requires
(brief §5); the corpus keeps growing (~100 rows/h) so the index's own resident size grows slowly over time
too — expected and bounded, not a regression path.

#### OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX (build-time OOM the above fix introduced)
**CAVEAT (qa, 2026-08-14, added while closing FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED):**
the `TOKIO_WORKER_THREADS`/`LANCE_CPU_THREADS` pin documented in this section is CONFIRMED
necessary but **INSUFFICIENT ALONE** — 3 kernel memcg OOM-kills recurred after this exact fix
deployed and was content-hash-verified live, all invoked by `lancedb-tokio-w`, the very thread
the pin targets. Do **not** read this section as a complete resolution. See
§ FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED below for the live in-container
discrimination (the pin measurably takes effect but neither Tokio's on-demand blocking pool nor
lance-core's rayon IO-core-reservation floor can be pinned below 2 threads — no further env
lever exists) and the fix that actually addresses the restart-triggered amplifier (skip the
redundant full-corpus index rebuild when a valid index already persists on disk).

The "open, not resolved" flag above was exactly right: deploying the fix (image
`sha256:bdb808678a26`, 2026-08-12T10:14:37Z) OOM-restarted the container TWICE more within
10 minutes (10:18:10Z, 10:24:01Z) — the "fix" was itself now the crash trigger. Two
independent, compounding causes, found by reading `dmesg` **inside the Docker Desktop VM**
(`docker run --rm --privileged --pid=host alpine dmesg`) — NOT via `docker inspect
.State.OOMKilled`, which read `false`/`ExitCode=0` for both events and is **unreliable in
this environment** (the VM-boundary cgroup OOM signal does not reliably propagate to
dockerd's reported container state here; always cross-check `dmesg` for authoritative
OOM evidence, not `docker inspect`):

1. **Unbounded general-purpose Lance/Tokio thread pools.** `dmesg` showed the kernel memcg
   OOM-killer invoked by threads named `lancedb-tokio-w` (truncated `lancedb-tokio-worker`)
   and `lance-cpu` — i.e. the OOM fires from *inside* LanceDB's native Rust worker threads
   during IVF_PQ/KMeans training, not inside the CPython heap. This is why
   `_malloc_trim_or_noop()` (see below) cannot reach it at all: it sweeps glibc's arena via
   `ctypes`, a completely different allocator context from Rust's still-in-use (not merely
   fragmented-but-freed) thread-local allocations mid-build.
   `strings /usr/local/lib/python3.10/dist-packages/lancedb/_lancedb.abi3.so` (installed
   version **0.36.0** — confirms drift from the FTS fix's own comment referencing 0.33.0;
   `requirements.txt` only pins `lancedb>=0.6.0`) surfaced the exact knobs, same
   "process-global `LazyLock`, read once at first use" shape as `LANCE_FTS_NUM_SHARDS` above:
   - `TOKIO_WORKER_THREADS` — sizes the `lancedb-tokio-worker` async runtime; falls back to
     the **host's** visible CPU count if unset (`os.cpu_count()` inside the container reports
     6 — the Docker Desktop VM's allocation — not the compose `cpus: 1.0` cgroup quota, which
     `sched_getaffinity()`-based detection cannot see without explicit `cpuset` pinning).
   - `LANCE_CPU_THREADS` — sizes `lance-core`'s separate compute-intensive pool (KMeans/PQ
     training is exactly this); same host-CPU-count-by-default oversubscription risk.
   **Fix** (`infrastructure/repositories.py` module header, next to the FTS pins):
   ```python
   os.environ.setdefault("TOKIO_WORKER_THREADS", "1")
   os.environ.setdefault("LANCE_CPU_THREADS", "1")
   ```
2. **Unguarded concurrent rebuild race.** `_maybe_build_vector_index()`'s pre-check
   (`if self._vector_index_built: return`) awaits `_get_table()`/`count_rows()` *before*
   setting the flag — on the single-threaded asyncio event loop those awaits are yield
   points, so two `/search` requests arriving close together (confirmed present in the live
   traffic — the corpus also has a steady stream of concurrent `POST /index` inserts) can
   both observe the flag still `False` and both launch a full, independent `create_index()`
   build concurrently, each already expensive enough on its own to approach the 1GiB ceiling
   — N concurrent builds multiply that peak instead of just repeating it once more. Same race
   shape `compact()`'s own `_compact_lock` already exists to prevent for `optimize()` (see
   `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` above), just never applied to the newer
   vector-index path. **Fix:** `_vector_index_lock` (`asyncio.Lock`), double-checked inside
   the lock — a racing caller blocks, then finds the flag already `True` and no-ops.

Both fixes are unit-tested (`__tests__/unit/test_rag_vector_index_build.py`:
`TestVectorIndexThreadPoolEnvPinning`, `test_concurrent_calls_build_exactly_once`) — see
`testing.md`.

#### FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED (post-deploy: the thread-pool pin is confirmed effective but insufficient; the real per-restart amplifier fixed)
After `ca6d86869` (the two `os.environ.setdefault()` pins above) deployed and was
content-hash-verified live (container `/app/infrastructure/repositories.py` md5 matched
`git HEAD` — not a stale-image issue), `dmesg` **inside the Docker Desktop VM** still showed
3 kernel memcg OOM-kills over the following ~44h (2026-08-12T13:46:51Z, 14:00:57Z,
2026-08-13T09:20:09Z), all invoked by `lancedb-tokio-w` — the exact thread the pin targets.
`docker inspect .State.OOMKilled` read `false`/`ExitCode=0` for all 3 (confirmed unreliable
in this environment, per the section above — never trust it here).

**Discrimination (ineffective vs. insufficient) — done in-container, live, against the
running production image, not theoretically:**
1. Isolated a fresh Python process inside the live container (`docker exec`, same
   `/app/infrastructure/repositories.py`, scratch LanceDB path — no production data
   touched) and confirmed, by print, that `os.environ["TOKIO_WORKER_THREADS"]` /
   `["LANCE_CPU_THREADS"]` read `"1"` **before** the first `lancedb.connect_async()` call
   (the pin's own documented ordering requirement). No `"Falling back to auto"` fallback
   message (confirmed present in the compiled `_lancedb.abi3.so` via `strings` as the
   literal error path for an unparseable value) appeared in container logs — the value is
   syntactically valid and accepted.
2. Enumerated `/proc/<pid>/task/*/comm` in BOTH the live production container and the
   isolated fresh-process repro: **2 `lancedb-tokio-w` + 2 `lance-cpu` threads persist even
   with both vars pinned to `"1"`** — never converging to 1. A parallel no-pin control run
   (env vars suppressed) showed a comparable 2/2 count, not the theoretical
   `num_cpus`-sized (6) blow-up the pin was designed to prevent — i.e. the pin measurably
   changes behavior (rules out "silently ignored"), it simply cannot reach exactly 1.
3. `strings` on the compiled `.so` found **no `max_blocking_threads` (or equivalent)** env
   knob anywhere in the binary. Root cause: `TOKIO_WORKER_THREADS` sizes only Tokio's CORE
   async-executor worker pool; Tokio maintains a SEPARATE, always-present, on-demand
   BLOCKING-thread pool (used for blocking file I/O during table-open/index-build) that
   inherits the SAME `"lancedb-tokio-worker"` thread-name prefix (hence indistinguishable
   in `/proc`) but has no exposed size knob here. `lance-cpu` is a `rayon` pool whose
   `LANCE_CPU_THREADS` interacts with an undocumented `LANCE_IO_CORE_RESERVATION` floor
   (message string: `"Number of CPUs is less than or equal to the number of IO core
   reservations... using 1 CPU for compute intensive tasks"`) — also bottoms out above 1.
   **Verdict: NOT ineffective — INSUFFICIENT. No further env-var lever exists for either
   pool; do not re-attempt a tighter pin.**

**The actual restart-triggered amplifier (fixed this row):** `_vector_index_built` is a
per-**process** flag — always `False` on a fresh container start — but a LanceDB index is
part of the on-disk Lance dataset manifest and **persists across restarts**. Confirmed live:
production `vector_idx` was built once at `2026-08-13T09:30:44Z` (~10 min after the
`09:20:09Z` restart/OOM) and was still valid, unrebuilt, 22h+ later
(`num_indexed_rows=29,364` of `29,419` total — a normal small incremental gap, not a stale
index). Without a check, **every** restart re-triggers a full IVF_PQ/KMeans retrain over the
WHOLE corpus on the first `search()`/`hybrid_search()` call — the single most
thread/memory-heavy operation in this file — even when a valid index from the prior
process's build is already sitting on disk. `_maybe_build_vector_index()` now calls
`table.list_indices()` inside the existing `_vector_index_lock` critical section before
attempting a build; if an index already covers the `vector` column, it sets
`_vector_index_built = True` and returns without rebuilding.
`list_indices()` failure (older lancedb / API drift) degrades to the pre-existing
row-count-gated build check (never silently skips a legitimately-needed first build).
Unit-tested: `TestVectorIndexPersistsAcrossRestart` in
`__tests__/unit/test_rag_vector_index_build.py` (persisted-index skip, negative control —
no persisted index still builds normally, `list_indices()`-raises fallback) — see `testing.md`.

**Still open, flagged for PO/ops — out of this agent's zone (`apps/rag-service/` code
only, not `docker-compose.yml`):** live container memory sits at ~91–95% of the 1GiB
ceiling even in **steady state** (no rebuild in flight) — `docker stats` sampled
934.3MiB/1024MiB (91.24%) post-fix-diagnosis, task board recorded 976.6–977.1MiB
(95.37–95.42%) at dispatch time. The redundant-rebuild fix above removes the dominant
per-restart amplifier, but does not by itself prove headroom is sufficient for every future
growth/traffic scenario at a corpus that keeps growing (~100 rows/h) — a memory-limit
review of `docker-compose.yml`'s `rag-service.deploy.resources.limits.memory` (currently
`1g`) is a reasonable companion action for ops to consider, not made here.

**AC per PO directive (binding, do not weaken):** REBUILD_REQUIRED — after redeploy,
verification is **≥2h supervised sampling with `dmesg` inside the Docker Desktop VM** as the
sole pass/fail signal. **Never** `docker inspect .State.OOMKilled` (proven unreliable this
incident) and **never** a short/immediate-only probe window — the sibling row
`FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW` exists precisely
because a prior certification on this exact container used both invalid signals and was
falsified by the kernel 60 minutes after closing.

#### FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (in-process attribution, 2026-08-14: the row's own long-standing "monotonic growth from a cold process" symptom, finally named — not RSS-delta-inferred)

PO ruling `po_RULING_CRITICAL_PATH_20260814T0927Z` explicitly banned another
restart-timing/deploy-config guess after three prior fixes (memory cap raise,
thread-pool pin, redundant-rebuild skip above) each looked like a fix and then
failed within hours. This required a real **in-process memory profile**, not
another RSS before/after number.

**Method** (`scripts/audits/rag-lancedb-mem-attribution-probe.py`, run against
the deployed image with a read-write COPY of the production corpus — never the
live container's own data): drove the real `LanceDBVectorStore` singleton
(same call shape production uses) through the **real live traffic mix**
(`docker logs`, 2026-08-14T09:39Z 60-min window: ~79 `POST /index` : ~19
`POST /search`, i.e. **write-dominated**, not read-dominated — both prior
2026-08-12 probes tested `search()` only) while instrumenting three
independent, orthogonal planes simultaneously at every checkpoint:
1. `tracemalloc` — Python-heap allocation attribution by file:line.
2. `gc.get_objects()` type census (dependency-free `objgraph.show_growth()`
   equivalent — `objgraph` itself is not installed in the deployed image).
3. `pyarrow.default_memory_pool().bytes_allocated()` — Arrow's own native
   memory-pool accounting (confirmed live: backend `mimalloc`, a THIRD
   allocator context, separate from both glibc and CPython's heap).

**Result, by elimination:** over 140 ops (~4.5min), RSS climbed ~120MB while
ALL THREE planes stayed essentially flat — `tracemalloc_current_kb` moved
39784→39844 (+60KB total), `pyarrow` pool `bytes_allocated` stayed **0 the
entire run**, and `lancedb`/`pyarrow` wrapper-object live counts (via the gc
census) never grew past +1. None of Python's own heap, PyArrow's own buffer
pool, or Python-visible object counts can account for the growth — it is
native memory inside lance-core's Rust internals, invisible to
`malloc_trim(0)` (glibc-only, see the `FIX-PDFX` precedent this row already
cites) and to every Python-level tool.

**Named root cause:** `lancedb.connect_async()` called with no `session=`
kwarg (the pre-fix code in `_get_table()`) builds lancedb's own internal
`Session.default()` — confirmed live against lancedb 0.37.1's own docstring:
*"equivalent to creating a session with 6GB index cache and 1GB metadata
cache"*. That is a 7GB native LRU ceiling inside a container whose entire
memory budget is 1GB — in practice indistinguishable from unbounded, because
it never gets remotely close to its own eviction floor before the container
OOMs. Every unique IVF_PQ index page and every dataset-version manifest
touched by `insert()`/`search()`/`hybrid_search()`/`compact()` gets cached and
is never evicted.

**Fix 1 — bounded Session:** `LanceDBVectorStore.__init__` now accepts
`index_cache_bytes`/`metadata_cache_bytes`; when either is set, `_get_table()`
builds an explicit `lancedb.Session(index_cache_size_bytes=...,
metadata_cache_size_bytes=...)` and passes it into
`connect_async(session=session)`. `None` (default, e.g. every existing test
that constructs `LanceDBVectorStore(db_path=...)` with no extra kwargs)
preserves the exact pre-fix unbounded behaviour — zero behaviour change for
any caller that doesn't opt in. Production always opts in via
`Config.lancedb_index_cache_mb` / `lancedb_metadata_cache_mb` (env
`LANCEDB_INDEX_CACHE_MB` / `LANCEDB_METADATA_CACHE_MB`, default **96MB /
32MB** — sized to comfortably hold this corpus's ~136MB on-disk IVF_PQ index
footprint while leaving headroom under the 1GB cap for the ~400-700MB warm
embedding model). The constructed `Session` is kept as `self._session` so a
caller/diagnostic can read `.size_bytes` / `.approx_num_items` directly.

**Fix 2 — bounded compaction retention (a second, independently measured
contributor):** even with the Session bounded, a long synthetic replay
(~1200 ops) still showed RSS climbing, because `_COMPACT_RETENTION`
(`timedelta(days=2)`) means version manifests are **never** eligible for
pruning within any realistic single container lifetime (this service has
OOM-restarted every 30-90min throughout the incident). Direct confirmation:
re-running `table.optimize(cleanup_older_than=timedelta(seconds=0))` against
the same grown corpus copy pruned **4170 old versions and reclaimed
422,906,121 bytes (~422MiB)** of stale on-disk version data in one call
(`OptimizeStats(...).prune.bytes_removed`) — entirely invisible to, and
unaffected by, the Session-cache bound (a separate, read-side LRU).
`compact_retention` (constructor param, wired from
`Config.lancedb_compact_retention_hours` / env
`LANCEDB_COMPACT_RETENTION_HOURS`, default **1h**) shortens this window so
nearly every `_COMPACT_EVERY`-triggered `compact()` cycle actually finds
something to prune, instead of every commit in the container's entire life
staying live forever. This trades a shorter rollback/time-travel window for a
memory-bounded, actually-surviving container — a deliberate tradeoff, not
hidden.

**Tests:** `__tests__/unit/test_rag_lancedb_session_and_retention_bound.py` —
Session-not-built-by-default, Session built with exact configured bytes
(patched `lancedb.Session` spy), a REAL end-to-end traffic replay confirming
the live `Session.size_bytes` stays bounded (not unbounded) under real
insert()/search() traffic, retention-override wiring through `compact()`
(real table, spy on `optimize()`), `Config` env defaults/overrides for all
three new knobs, and `build_real_adapters()` production wiring. 215/215
pytest green (201 baseline + 14 new).

**Co-fixed same cycle (QA `CHANGES_REQUESTED` 2026-08-12T09:33Z, blocking
honest test attestation on every prior rag-service closure):**
`fastapi.testclient.TestClient` could not import in the deployed image —
`starlette` (resolves to 1.6.0 here) requires **`httpx2`**, not `httpx`
(confirmed via the literal live error message); added `httpx2>=2.10.0` to
`requirements.txt`.

**Still open — this row's own AC, not closable from this agent's zone alone:**
closure requires the `RAG-MEM-DURABILITY-BAR v2` D1-D5 measurement (in
particular D3's positive plateau: `<=0.02 pp/min over the final 12h AND
<=85% of cap`) — an ops-supervised, multi-hour post-deploy measurement, not
something a single dev-rag-service cycle can execute. `REBUILD_REQUIRED:
true`.

### count()
Returns `table.count_rows()`, 0 on exception.

### hybrid_search(query_vector, query_text, ...) + FTS index (DFR-P3)
- `_fts_index_built` (per-container flag): first `hybrid_search()` call lazily
  triggers `_build_fts_index()`; never rebuilt again within that container's
  lifetime unless `/admin/rebuild-fts` is hit explicitly (nightly cron).
- `_build_fts_index()`: two SEPARATE `table.create_index(field, config=FTS(), replace=True)`
  calls — title, then summary (never a list — each field gets its own index).
- Search pattern: `table.query().nearest_to(vec).column("vector").nearest_to_text(text)
  .rerank(RRFReranker()).limit(...)` — NOT `tbl.search(text, query_type='hybrid')`.

#### RAG-FTS-BUILD-MEMORY-BOUND (bounded-memory FTS build)
Root cause (qa-verified, commit `2af76decc`): the native FTS builder lancedb calls into
(Rust crate `lance-index`, `scalar/inverted/builder.rs`) fans the build out across
`LANCE_FTS_NUM_SHARDS` parallel workers (default `max(1, num_cpus/2)` — resolved from
the **host's** visible CPU count, not the container's `cpus:` cgroup quota), and each
worker buffers its share of tokens/postings in memory until it hits
`LANCE_FTS_PARTITION_SIZE` MiB (**default 2048 MiB per worker**) before flushing to disk.
Neither knob is exposed by lancedb's Python `FTS()` config dataclass or
`AsyncTable.create_index()` — they are process-global Rust `LazyLock` statics read from
the OS environment on first use (and cached for the process lifetime). Default
worst-case in-flight memory on a multi-core host is `(num_cpus/2) * 2048 MiB` — many GB,
independent of `rag_entries` row count. This is why the build pinned 90-99.9% of the
ceiling for 250s+ then OOM-restarted the container at ~56k rows (RestartCount 258→260),
**against the container's ceiling at the time this row's investigation was written
(`768m`)**. **CORRECTION (2026-08-12, architect):** the rag-service `deploy.resources.
limits.memory` ceiling is now `1g` (raised by commit `2f835ec63`, 2026-08-06 —
`docs/architecture-briefs/2026-08-06-rag-service-memory-sizing-remediation.md`) — this
row's own board text and `repositories.py:67`'s comment still say `768m`, a known,
already-flagged staleness (see that 2026-08-06 brief's own cross-reference, and
`docs/architecture-briefs/2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md`
§2), not corrected in either of those two locations as of this note. Does not change the
fix's own bound (`LANCE_FTS_PARTITION_SIZE=32` MiB is small relative to either ceiling).
The nightly rebuild cron that would exercise this path (`ragFtsRebuildCronJob`) is
gated OFF by default (`CRON_RAG_FTS_REBUILD_ENABLED`, unset in this deployment) and has
never fired here — see the 2026-08-12 brief §3c for the live confirmation this is not a
live/active concern today.

**Investigated + rejected:** the legacy Tantivy-backed builder
(`LanceTable.create_fts_index(use_tantivy=True, writer_heap_size=...)`) DOES expose a
genuine bounded writer and works on lancedb 0.25.3 (local dev) — but it is **hard-removed**
in lancedb **0.33.0** (Docker/production pin): calling it raises
`ValueError("Tantivy-based FTS has been removed")` unconditionally. Not usable at the
pinned production version.

**Fix (`infrastructure/repositories.py` module header):** pin the two Rust env vars to
small, container-safe values via `os.environ.setdefault(...)` at module import time
(must happen before the process's first FTS build — the Rust `LazyLock` caches on first
read, so setting them later is a no-op):
```python
os.environ.setdefault("LANCE_FTS_NUM_SHARDS", "1")     # single worker — cpus: 1.0 limit anyway
os.environ.setdefault("LANCE_FTS_PARTITION_SIZE", "32")  # MiB — per-worker flush threshold
```
`setdefault()` means an operator-provided `LANCE_FTS_NUM_SHARDS`/`LANCE_FTS_PARTITION_SIZE`
in `docker-compose.yml` always wins — these can be retuned without a code change. The
`_build_fts_index()` call pattern itself (two `create_index()` calls, title then summary)
is **unchanged** — only the Rust builder's own worker/memory config changes.

This bound is corpus-size-**independent**: `LANCE_FTS_PARTITION_SIZE` caps how much a
single worker holds before flushing, not a function of total row count — so it changes
how many times the builder flushes as `rag_entries` grows, not how much memory any one
flush cycle uses. Holds at 56k rows today and continues to hold as `ragIndex()` writes
keep growing the corpus.

Verified locally (lancedb 0.25.3 — same `lance-index` FTS builder as the 0.33.0 Docker
pin) on a 60k-row / high-cardinality-vocabulary stress corpus: unbounded default
config reached 3.28 GB max RSS / 1.55 GB peak footprint (`/usr/bin/time -l`); the bounded
config (`NUM_SHARDS=1`, `PARTITION_SIZE=8` MiB) dropped this to 1.37 GB max RSS / 640 MB
peak footprint. Realistic (non-pathological-vocabulary) financial-news text is expected
to bound much tighter still, since the flush-bounded posting buffer (not an ever-growing
unique-term dictionary) then dominates build memory. **Live-container peak-mem +
wall-clock on the real ~56k-row corpus is pending qa/ops verification** (RAG-FTS-BUILD-MEMORY-BOUND
task — dev-side sanity run was blocked by an unrelated Docker Desktop host outage;
see task notebook).

## SentenceTransformersEmbedder
- **File:** `apps/rag-service/infrastructure/embedder.py`
- Implements `EmbedderPort`

### Model
- `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- Dimensions: **384**
- Size: ~400MB (auto-downloads on first use)
- Languages: Vietnamese, French, English, multilingual

### Methods
- `initialize()`: no-op called from FastAPI lifespan — model does NOT load here (GFD-13
  lazy-load; see below). Kept only for interface-contract compatibility.
- `_ensure_model_loaded()`: lazy-init the model exactly once, thread-safe via
  `asyncio.Lock` (double-check-lock pattern) — created lazily inside the first async call.
- `_raw_embed(texts)`: sets `_last_used_monotonic = time.monotonic()`, then
  `model.encode(texts, normalize_embeddings=True, show_progress_bar=False)` → numpy→list
- `embed(text)`: Single text → `EmbeddingVector(dims=384, values=...)`
- `embed_batch(texts)`: Multiple texts → list of EmbeddingVector
- `_maybe_unload_idle(idle_threshold_s)`: FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH — under the
  SAME `_load_lock` used for loading, if the model is loaded and idle longer than
  `idle_threshold_s`, sets `_model = None` and calls `gc.collect()`. Returns whether it
  unloaded. Never raises.

#### GFD-13 lazy-load / FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH idle-unload
The model is NOT loaded at container startup (`initialize()` is a no-op) — it loads on
the first `embed()`/`embed_batch()` call via `_ensure_model_loaded()`'s double-check-lock.
Originally this load had **no release path**: once warmed, the ~600-700 MiB model stayed
resident for the container's entire remaining lifetime, regardless of traffic, pinning the
container near its memory cap indefinitely after the very first request.

`_maybe_unload_idle()` closes that gap, symmetrically: a background `asyncio.create_task`
loop in `app_factory.build_lifespan()` polls every 60s (fixed internal cadence, not
env-configurable) and calls `_maybe_unload_idle(idle_threshold_s)`, where
`idle_threshold_s = EMBEDDER_IDLE_UNLOAD_MINUTES * 60`. The loop is cancelled cleanly in
the lifespan's shutdown path. Reload on the next `embed()`/`embed_batch()` call is fully
transparent — it goes through the SAME `_ensure_model_loaded()` lock path used for the
original lazy-load; no second load path exists. `/embed/health` truthfully reports the
resulting `state` flip `"warm" → "cold" → "warm"` (GFD-7, unchanged) — cold is a state the
service can now return to, not only start in.

Duck-typed for the service-tier sandbox: fake embedders injected via `create_app()` do not
implement `_maybe_unload_idle()`, so the background loop is a permanent no-op for them —
zero sandbox/determinism impact.

**`malloc_trim(0)` sweep (2026-08-12, `FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-
RETURNED-TO-OS` §6 secondary fix):** `app_factory._idle_unload_loop()`'s same 60s poll cycle
also calls `_malloc_trim_or_noop()` (`app_factory.py`) every iteration, independent of
whether `_maybe_unload_idle()` actually unloaded anything that cycle. Guarded
`ctypes.CDLL("libc.so.6").malloc_trim(0)` — same shape as the
`FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM` precedent; on any non-glibc platform (macOS
dev/test host, musl/Alpine) `ctypes.CDLL` raises `OSError`/`AttributeError`, caught and
treated as a silent no-op. Isolated repro measured this recovers only ~8-15% of the LanceDB
vector-search read path's resident growth — real but minor next to the primary vector-index
fix above; landed anyway as cheap, low-risk insurance per the architect brief's explicit
recommendation. This is also the original allocator-retention mechanism this row's own
(now-superseded) title referred to — it was real, just not the dominant contributor.

### Configuration
```python
class Config:
    lancedb_path: str = "./data/lancedb"
    db_path: str = "./data/rag_service.db"
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_cache_dir: str = "./data/models"
    host: str = "0.0.0.0"
    port: int = 5002
    embedder_idle_unload_minutes: int = 15  # env: EMBEDDER_IDLE_UNLOAD_MINUTES
    # FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (2026-08-14)
    lancedb_index_cache_mb: int = 96          # env: LANCEDB_INDEX_CACHE_MB
    lancedb_metadata_cache_mb: int = 32       # env: LANCEDB_METADATA_CACHE_MB
    lancedb_compact_retention_hours: float = 1  # env: LANCEDB_COMPACT_RETENTION_HOURS
```
