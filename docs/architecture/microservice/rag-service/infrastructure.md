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
- Resets `_insert_count` to 0
- Failure is logged as WARNING and does not raise
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
roughly 10x the rag-service `768m` container ceiling (`docker-compose.yml`
`rag-service.deploy.resources.limits.memory`) — independent of `rag_entries` row count.
This is why the build pinned 90-99.9% of the ceiling for 250s+ then OOM-restarted the
container at ~56k rows (RestartCount 258→260).

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

## SQLiteAnalysisRepository
- **File:** `apps/rag-service/infrastructure/repositories.py`

### Schema
```sql
CREATE TABLE IF NOT EXISTS rag_entries (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    action_code TEXT,
    created_at TEXT NOT NULL
);
```

### Operations
- `save(entry)`: `INSERT ... ON CONFLICT DO UPDATE` (upsert), tags→JSON
- `find_by_id(entry_id)`: Fetch + deserialize tags from JSON
- `find_all()`: Fetch all + deserialize

## SentenceTransformersEmbedder
- **File:** `apps/rag-service/infrastructure/embedder.py`
- Implements `EmbedderPort`

### Model
- `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- Dimensions: **384**
- Size: ~400MB (auto-downloads on first use)
- Languages: Vietnamese, French, English, multilingual

### Methods
- `initialize()`: Eagerly loads model from FastAPI lifespan
- `_raw_embed(texts)`: `model.encode(texts, normalize_embeddings=True, show_progress_bar=False)` → numpy→list
- `embed(text)`: Single text → `EmbeddingVector(dims=384, values=...)`
- `embed_batch(texts)`: Multiple texts → list of EmbeddingVector

### Configuration
```python
class Config:
    lancedb_path: str = "./data/lancedb"
    db_path: str = "./data/rag_service.db"
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_cache_dir: str = "./data/models"
    host: str = "0.0.0.0"
    port: int = 5002
```
