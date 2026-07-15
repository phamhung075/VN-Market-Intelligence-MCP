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

- Real LanceDB and SQLite (tmp_path fixtures)
- Fake deterministic embedder (hash-based, not real sentence-transformers)
- Full pipeline: index → search → temporal decay
- Recent entries rank higher than old (same content, different created_at)
- SQLiteAnalysisRepository: save → find_by_id → find_all
- Deduplication: same article re-indexed multiple times
- Schema verification: all fields preserved through storage

## Unit Tests — RAG-FTS-BUILD-MEMORY-BOUND
**File:** `apps/rag-service/__tests__/unit/test_rag_fts_build_memory_bound.py`

- `LANCE_FTS_NUM_SHARDS`/`LANCE_FTS_PARTITION_SIZE` pinned to `"1"`/`"32"` on module import
- `os.environ.setdefault()` semantics: an operator-provided value survives import (verified
  in a fresh `subprocess` — module-level env pinning only runs once per process)
- `_build_fts_index()` still performs exactly 2 `create_index()` calls (title, then summary)
- `hybrid_search()` still returns real results after a bounded-config FTS build

## Run Commands
```bash
cd apps/rag-service && python -m pytest
cd apps/rag-service && python -m mypy . --ignore-missing-imports
```
