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
Runs `table.optimize(cleanup_older_than=timedelta(days=2))`:
- Merges small fragment files into larger compacted files (online-safe, reads/writes continue)
- Prunes version manifests older than 2 days; latest version is always kept
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

**No vector index exists on the `vector` column** (only `title`/`summary` get FTS indexes — see below) —
every `vector_search()` call is LanceDB's brute-force exact-kNN scan over the full column.
`FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS`'s 2026-08-12 architect brief
(`docs/architecture-briefs/2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md`) isolated-
repro'd this against a 26,730-row corpus snapshot: opening the table handle alone costs ~130 MiB resident,
and repeated `search()` calls against the same open handle ramp resident memory by ~340-444 MiB within
the first ~20-60 distinct queries before plateauing — the dominant driver of that row's "monotonic growth
from a cold restart" symptom (confirmed ~65-80x larger than the embedder's own per-call footprint, which
was isolated-repro'd and ruled out as the dominant mechanism in the same cycle). `malloc_trim(0)` recovers
only ~8-15% of this — most of the floor is a live, referenced working set, not glibc-arena slack.
Recommended fix (design only, not landed as of that brief): build a `lancedb.index.IvfPq` vector index,
same `create_index()` call shape as the FTS indexes below. See that brief for the full investigation,
fix design, and open considerations (staleness/refresh cadence, build-time memory cost, recall trade-off).

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
```
