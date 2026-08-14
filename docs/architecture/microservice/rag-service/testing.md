# rag-service — Testing

## Unit Tests — Domain Services
**File:** `apps/rag-service/__tests__/unit/test_domain_services.py`

Pure function tests (no I/O, no mocks):
- `compute_recency_score`: brand-new=1.0, 7d old=0.5, ancient=~0
- `apply_temporal_decay`: recent beats old for same distance
- `filter_by_max_distance`: removes far results
- Invalid dates → score 0
- Ranking: sorted descending by recency_score

## Unit Tests — Use Cases
**File:** `apps/rag-service/__tests__/unit/test_search_usecase.py`

Mocks: `VectorStorePort`, `EmbedderPort` (AsyncMock)

| Test | Assertion |
|------|-----------|
| SearchUseCase happy path | embedding → search → ranking → response |
| Filtering: level_filter | Passed to vector store |
| Filtering: action_code_filter | Passed to vector store |
| Empty results | Empty response |
| Temporal decay integrated | Ranking uses recency_score |
| Error propagation | VectorStoreError → SearchError |
| IndexUseCase happy path | Embedding text built → entry created → stored |
| Over-fetching | limit * 4 for dedup |

## Integration Tests
**File:** `apps/rag-service/__tests__/integration/test_rag_integration.py`

- Real LanceDB (tmp_path fixture)
- Fake deterministic embedder (hash-based, not real sentence-transformers)
- Full pipeline: index → search → temporal decay
- Recent entries rank higher than old (same content, different created_at)
- Deduplication: same article re-indexed multiple times
- Schema verification: all fields preserved through storage

## Unit Tests — LanceDB Compaction Guard
**File:** `apps/rag-service/__tests__/unit/test_lancedb_compaction.py`

- `compact()` fires exactly once when insert count reaches `_COMPACT_EVERY`
- `compact()` resets `_insert_count` on success
- `compact()` failure is non-fatal — `insert()` still succeeds
- `compact()` called directly does not remove live rows
- **AC1 (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP):** a real, injected `table.optimize()`
  failure still resets `_insert_count` to 0 exactly once (via `finally:`), and the very
  next `insert()` does not immediately re-fire `compact()`
- **AC2 (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP):** two concurrent `insert()` coroutines
  that both cross `_COMPACT_EVERY` (`asyncio.gather`) produce exactly ONE `table.optimize()`
  call, not two — verifies the `self._compact_lock` serialization

## Unit Tests — RAG-FTS-BUILD-MEMORY-BOUND
**File:** `apps/rag-service/__tests__/unit/test_rag_fts_build_memory_bound.py`

- `LANCE_FTS_NUM_SHARDS`/`LANCE_FTS_PARTITION_SIZE` pinned to `"1"`/`"32"` on module import
- `os.environ.setdefault()` semantics: an operator-provided value survives import (verified
  in a fresh `subprocess` — module-level env pinning only runs once per process)
- `_build_fts_index()` still performs exactly 2 `create_index()` calls (title, then summary)
- `hybrid_search()` still returns real results after a bounded-config FTS build

## Unit Tests — FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (vector index)
**File:** `apps/rag-service/__tests__/unit/test_rag_vector_index_build.py`

- `_build_vector_index()` calls `table.create_index('vector', config=IvfPq(...), replace=True)`
  exactly once — pure call-shape check, does NOT call through to the real LanceDB trainer
  (IVF_PQ has a real 256-row training floor; see the end-to-end tests below for real-trainer
  coverage)
- `_maybe_build_vector_index()` below `_VECTOR_INDEX_MIN_ROWS` (256) is a no-op — flag stays
  `False`, no exception (regression guard for every OTHER test file's tiny fixtures)
- Boundary: `row_count == _VECTOR_INDEX_MIN_ROWS - 1` no-ops; `row_count == _VECTOR_INDEX_MIN_ROWS`
  builds exactly once
- `_vector_index_built` flag prevents rebuild on subsequent calls (mirrors `_fts_index_built`)
- **End-to-end, real LanceDB, no mocks:** a 300-row corpus (bulk-seeded via `table.add()`,
  bypassing `store.insert()`'s per-row loop for speed) triggers a REAL IVF_PQ build on the
  first `search()` call; `search()` still returns `list[SearchResult]` afterwards; a second
  `search()` call does not rebuild
- `hybrid_search()` also triggers the same lazy vector-index build (both read `vector`)
- `POST /admin/rebuild-vector-index`: route registered, returns `{"status":"ok"}`, calls
  `vector_store._build_vector_index()`, 503 when `vector_store` not wired — mirrors the
  existing `/admin/rebuild-fts` admin-endpoint test triad exactly

### OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX additions (same file)
- `TestVectorIndexThreadPoolEnvPinning`: `TOKIO_WORKER_THREADS`/`LANCE_CPU_THREADS` pinned to
  `"1"`/`"1"` on module import; `setdefault()` semantics verified in a fresh `subprocess`
  (same pattern as the FTS env-pinning tests above, different env vars)
- `test_concurrent_calls_build_exactly_once`: two `_maybe_build_vector_index()` calls fired
  concurrently via `asyncio.gather()` against a slow (`asyncio.sleep`-yielding) fake build
  must produce exactly ONE real build call — regression guard for the unguarded-race root
  cause (see `infrastructure.md` § OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX)

### FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED additions (same file)
`TestVectorIndexPersistsAcrossRestart` — the per-process `_vector_index_built` flag must not
cause a redundant rebuild of an already-persisted-to-disk index after a simulated restart:
- `test_new_process_does_not_rebuild_existing_persisted_index`: `store1` builds a REAL 300-row
  IVF_PQ index end-to-end; a brand-new `store2` instance pointed at the SAME `db_path`
  (simulates a fresh container process after restart — no shared in-memory state) must detect
  the persisted index via `table.list_indices()` and skip `_build_vector_index()` entirely
- `test_no_persisted_index_still_builds_normally`: negative control — a fresh `db_path` with
  no persisted index still builds normally once the corpus crosses `_VECTOR_INDEX_MIN_ROWS`
  (the persisted-index check must not accidentally short-circuit a legitimate first build)
- `test_list_indices_failure_falls_back_to_existing_behavior`: `table.list_indices()` raising
  (older lancedb / API drift) degrades gracefully to the pre-existing row-count-gated build
  check, rather than crashing or silently skipping a legitimately-needed build

## Unit Tests — malloc_trim sweep (FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS §6 secondary)
**File:** `apps/rag-service/__tests__/unit/test_embedder_idle_unload.py` (extended)

- `_malloc_trim_or_noop()` calls `ctypes.CDLL("libc.so.6").malloc_trim(0)` (mocked `ctypes.CDLL`)
- Gracefully swallows `OSError` (non-glibc platform, e.g. this repo's macOS dev/test host) —
  never raises
- Unmocked real call never raises on this host either (exercises the actual guard)
- `_idle_unload_loop()` calls the trim sweep every cycle, independent of whether
  `_maybe_unload_idle()` actually unloaded anything that cycle
- A trim-sweep exception is non-fatal — the loop survives and keeps polling (mirrors the
  existing `maybe_unload()` exception-swallow behaviour)

## Unit Tests — FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (Session cache bound + compaction retention, in-process attribution follow-up)
**File:** `apps/rag-service/__tests__/unit/test_rag_lancedb_session_and_retention_bound.py`

Root cause named via a real in-process memory profile (tracemalloc + gc
object-type census + pyarrow's own native memory-pool accounting — see
`infrastructure.md`'s section of the same name for the full writeup):
`lancedb.connect_async()` with no `session=` defaults to a 6GB index / 1GB
metadata cache inside a 1GB container; `_COMPACT_RETENTION`'s 2-day default
never prunes anything within this container's real uptime.

- `test_get_table_session_is_none_when_cache_bytes_not_provided`: default
  construction (no cache-size kwargs) must NOT build a session — preserves
  the exact pre-fix behaviour for every other test in the suite
- `test_get_table_builds_bounded_session_when_cache_bytes_given`: real
  `lancedb.Session` gets constructed and wired when cache bytes are given
- `test_get_table_session_constructed_with_exact_configured_bytes`: patches
  `lancedb.Session` to assert the EXACT `index_cache_size_bytes`/
  `metadata_cache_size_bytes` kwargs this fix wires through
- `test_bounded_session_stays_near_configured_ceiling_under_real_traffic`:
  REAL end-to-end (no mocks) — 80 inserts + 20 searches against a deliberately
  tiny (256KiB/128KiB) cache bound, asserts the live `Session.size_bytes`
  never blows past a generous multiple of its configured ceiling — a
  regression guard against the old unbounded-by-default behaviour
- `test_compact_retention_defaults_to_module_constant` /
  `test_compact_retention_uses_constructor_override`: `_compact_retention`
  wiring on the instance
- `test_compact_uses_configured_retention_not_module_default`: real table,
  spy on `optimize()`, confirms `compact()` passes the CONFIGURED override to
  `cleanup_older_than`, not the module-level `_COMPACT_RETENTION`
- Config env default/override pairs for `LANCEDB_INDEX_CACHE_MB` (96),
  `LANCEDB_METADATA_CACHE_MB` (32), `LANCEDB_COMPACT_RETENTION_HOURS` (1)
- `test_build_real_adapters_wires_cache_and_retention_from_config`: production
  wiring path (`app_factory.build_real_adapters()`) threads all three Config
  fields into the real `LanceDBVectorStore` it constructs

## Run Commands
```bash
cd apps/rag-service && python -m pytest
cd apps/rag-service && python -m mypy . --ignore-missing-imports
```
