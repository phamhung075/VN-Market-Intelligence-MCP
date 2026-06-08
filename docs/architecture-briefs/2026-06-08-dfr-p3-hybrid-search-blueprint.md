<!-- size-justification: 200L — FTS+RRF design, index-build timing decision, collision-avoidance call, risk table, AC. Self-contained for dev-rag-service + thin dev-mcp-server slice. -->
# Architecture Brief — DFR-P3-HYBRID: FTS + RRF Hybrid Search

**Date:** 2026-06-08
**Authored by:** Architect (brownfield + directed design)
**Task ID:** ARCH-DFR-P3 (directed — PO hand-off 2026-06-08-dfr-p2-p3-architect-handoff.md)
**Sprint:** DEEPFETCH-RAG-REDESIGN
**Status:** DESIGN COMPLETE — ready for ba/pm → dev dispatch
**Zones:** rag-service (primary) + mcp-server (thin opt-in flag only)
**BUILD-STANDARD:** lean (new feature within existing zone)
**Feasibility input:** docs/spikes/SPIKE_DFR-Q3-Q4-lancedb-feasibility.md (DFR-Q3 DONE — FTS + hybrid CONFIRMED in lancedb 0.30.2)
**Depends on:** DFR-P1-RAG DONE (8 metadata cols live in rag_entries — FTS built on title/summary columns)

---

## Brownfield State (Phase 1 baseline verified)

- `apps/rag-service/infrastructure/repositories.py` — `LanceDBVectorStore.search()` is the only search method. Uses `table.vector_search(query_vector.values).limit(wide_limit)`. No FTS or hybrid path.
- `apps/rag-service/application/dtos.py` — `SearchRequest` has `query: str`, `limit`, `decay_half_life_days`, `max_distance`, `level`, `action_code`, and all Phase 1 filter fields. No `hybrid: bool` field yet.
- `apps/rag-service/interface/serializers.py` — `SearchRequestSchema` Pydantic model. Needs one new optional field: `hybrid: bool = False`.
- `apps/rag-service/application/usecases.py` — `SearchUseCase.execute()` calls `vector_store.search()`. Will need to branch on `request.hybrid`.
- `apps/rag-service/domain/repositories.py` — `VectorStorePort` defines the port interface. New `hybrid_search()` method needs to be added here.
- `apps/mcp-server/src/infrastructure/rag/ragHttpClient.ts` — `RagSearchRequest` interface. Needs one new optional field: `hybrid?: boolean`.
- LanceDB 0.30.2 confirmed in Docker image. `create_fts_index()` works single-field (two calls needed for title + summary). `LanceHybridQueryBuilder` + `.vector().text()` + `RRFReranker` all functional.

**Key API constraint (confirmed in spike):** `tbl.search(query_type='hybrid')` must NOT receive a string argument in `search()`. The `.vector()` and `.text()` methods must be set explicitly:
```python
result = (
    tbl.search(query_type='hybrid')
       .vector(query_vec)
       .text('VCB earnings')
       .rerank(reranker)
       .limit(10)
       .to_list()
)
```
Passing a string directly to `tbl.search('query', query_type='hybrid')` raises an error.

---

## FTS Index Design

### 1. FTS Index Creation (2-call pattern)

**Confirmed working in lancedb 0.30.2 (spike-verified):**
```python
tbl.create_fts_index('title', replace=True)
tbl.create_fts_index('summary', replace=True)
```

NOT `tbl.create_fts_index(['title', 'summary'])` — multi-field list raises error in native mode.

`replace=True` is used for both calls to allow idempotent re-creation on index refresh without raising an error if the index already exists.

### 2. Index Build Timing — Decision: LAZY ON FIRST HYBRID QUERY + SCHEDULED REFRESH

**Options considered:**
- A. Startup: build on every service start. Problem: 14k+ rows; index build takes ~30–60s; blocks first search during warm-up. Against the health-probe liveness invariant.
- B. On-write (after every `table.add()`): too frequent (news ingest adds ~5-20 rows per cycle); FTS re-index cost is O(corpus) not O(delta) in lancedb 0.30.2 native mode.
- C. Lazy on first hybrid query + scheduled daily refresh: index is built once on first request with `hybrid=True`, then refreshed on a daily cron. Zero startup cost; stale index (at most 24h) is acceptable for keyword recall.

**Decision: Option C (lazy + scheduled refresh).**

Implementation:
- `LanceDBVectorStore` has a module-level `_fts_index_built: bool` flag (per-process singleton).
- On first `hybrid_search()` call: `if not _fts_index_built: _build_fts_index(); _fts_index_built = True`
- `_build_fts_index()` calls `create_fts_index('title', replace=True)` then `create_fts_index('summary', replace=True)`.
- A maintenance endpoint `POST /admin/rebuild-fts` (or triggered by a daily cron in mcp-server via a new VPS-proxy-style watchdog job) calls this directly. Dev-rag-service can implement a `/admin/rebuild-fts` endpoint (simple POST, no auth required — internal network only).
- Index stays valid for ~24h. Stale FTS on new inserts means keyword recall slightly degrades for the most recent ~200 rows (those indexed after the last FTS rebuild). Acceptable: vector recall still covers these rows.

**Why not on-startup?** The rag-service Docker container starts before data volume is mounted in some edge restart scenarios. A startup FTS build that races with a health probe would produce false-unhealthy signals. The lazy pattern avoids this.

**Why not on-write?** LanceDB native FTS `create_fts_index` rebuilds the entire index every time — not incremental. At 14k rows and growing, that's too expensive per-insert.

---

## Hybrid Search Implementation

### 3. VectorStorePort extension (domain/repositories.py)

Add to `VectorStorePort`:
```python
async def hybrid_search(
    self,
    query_vector: EmbeddingVector,
    query_text: str,
    limit: int,
    level_filter: Optional[str] = None,
    action_code_filter: Optional[str] = None,
    ticker_filter: Optional[str] = None,
    sector_filter: Optional[str] = None,
    source_domain_filter: Optional[str] = None,
    depth_tier_filter: Optional[str] = None,
    doc_type_filter: Optional[str] = None,
) -> list[SearchResult]: ...
```

Same signature as `search()` with the addition of `query_text: str`.

### 4. LanceDBVectorStore.hybrid_search() (infrastructure/repositories.py)

```python
async def hybrid_search(self, query_vector, query_text, limit, **filter_kwargs) -> list[SearchResult]:
    table = await self._get_table()
    # Ensure FTS index is built (lazy init)
    if not self._fts_index_built:
        await self._build_fts_index()
        self._fts_index_built = True

    from lancedb.rerankers import RRFReranker
    reranker = RRFReranker()

    # Build pre-filter clauses (same validation logic as vector_search)
    clauses = self._build_filter_clauses(**filter_kwargs)

    q = (
        table.search(query_type='hybrid')
             .vector(query_vector.values)
             .text(query_text)
             .rerank(reranker)
             .limit(limit * 4)   # over-fetch for dedup
    )
    if clauses:
        q = q.where(" AND ".join(clauses))

    raw_rows = await q.to_list()
    return self._dedup_and_trim(raw_rows, limit)
```

Refactor: extract `_build_filter_clauses()` and `_dedup_and_trim()` as private methods shared by both `search()` and `hybrid_search()` — avoids code duplication.

### 5. SearchUseCase.execute() branch (application/usecases.py)

```python
async def execute(self, request: SearchRequest) -> SearchResponse:
    query_vec = await self._embedder.embed(request.query)
    if request.hybrid:
        raw_results = await self._vector_store.hybrid_search(
            query_vector=query_vec,
            query_text=request.query,
            limit=request.limit,
            **self._extract_filter_kwargs(request),
        )
    else:
        raw_results = await self._vector_store.search(
            query_vector=query_vec,
            limit=request.limit,
            **self._extract_filter_kwargs(request),
        )
    # Apply temporal decay + build response (unchanged path)
    ...
```

Temporal decay applies on BOTH paths — hybrid results also get `recency_score` weighting.

### 6. DTO extension (application/dtos.py)

```python
@dataclass
class SearchRequest:
    query: str
    limit: int = 5
    decay_half_life_days: float = 7.0
    max_distance: float = 0.8
    level: Optional[str] = None
    action_code: Optional[str] = None
    ticker: Optional[str] = None
    sector: Optional[str] = None
    source_domain: Optional[str] = None
    depth_tier: Optional[str] = None
    doc_type: Optional[str] = None
    hybrid: bool = False          # NEW — default False for backward compat
```

### 7. Serializer extension (interface/serializers.py)

```python
class SearchRequestSchema(BaseModel):
    # ... existing fields ...
    hybrid: bool = Field(False, description="Use hybrid BM25+vector search (default false)")

    def to_dto(self) -> SearchRequest:
        return SearchRequest(
            # ... existing fields ...
            hybrid=self.hybrid,
        )
```

### 8. Admin endpoint (interface/handlers.py + optional)

```python
@router.post("/admin/rebuild-fts")
async def rebuild_fts() -> dict:
    """Force rebuild FTS index — called by daily cron or on demand."""
    try:
        await vector_store._build_fts_index()
        return {"status": "ok", "message": "FTS index rebuilt"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
```

This endpoint is internal (no auth, port 5002 not exposed externally). mcp-server can call it via a daily cron job (e.g. `deepFetchFtsRebuildJob.ts` at 02:00 UTC daily — off-peak).

---

## mcp-server: Thin Opt-In Caller

**Principle: ONE flag only. Do NOT merge with P2's mcp-server work on the same files.**

### 9. ragHttpClient.ts extension

Add one optional field:
```typescript
export interface RagSearchRequest {
  // ... existing fields ...
  hybrid?: boolean;   // NEW — default false; pass true for chef/bctc-analyst queries
}
```

### 10. Caller sites that should opt in (pass `hybrid: true`)

These callers benefit most from ticker-exact BM25 recall:
- `pollNews.ts` — `defaultRagRetriever()` at line 455: pass `hybrid: false` (news context enrichment is semantic, not ticker-exact; vector is sufficient)
- Chef synthesis tools (wherever `ragSearch()` is called with a ticker-specific query) — pass `hybrid: true`
- bctc-analyst tool (ticker-specific filing queries) — pass `hybrid: true`

**Concrete change in ragHttpClient callers:**
```typescript
// In defaultRagRetriever (pollNews.ts):
const response = await ragSearch({
  query,
  decay_half_life_days: decayHalfLifeDays,
  ...(options?.k !== undefined ? { limit: options.k } : {}),
  // hybrid intentionally omitted → defaults to false (vector-only path)
});
```

The pollNews ragRetriever does NOT pass `hybrid: true` — it runs contextual enrichment which is semantic, not ticker-exact. Only CHEF and BCTC analyst callers (where the user knows the ticker they want) should pass `hybrid: true`.

---

## Shared Module Collision Avoidance (PO Risk)

The only shared file between P2 and P3 mcp-server work is `ragHttpClient.ts`:
- **P2** adds `deepFetchVpsJob.ts` and `deepFetchMainJob.ts` — these call `ragIndex()` (write path), NOT `ragSearch()` (read path).
- **P3** adds `hybrid?: boolean` to `RagSearchRequest` interface (one optional field on the read-path interface).

**These two changes touch DIFFERENT interfaces in the same file:**
- P2 writes: `ragIndex()` / `RagIndexRequest` interface — body_text re-index call.
- P3 writes: `ragSearch()` / `RagSearchRequest` interface — `hybrid` flag.

**Collision risk: LOW.** The changes are in different interfaces and different call sites. They can be developed in parallel without conflict provided:
1. P3's mcp-server slice (`hybrid?: boolean` in `RagSearchRequest`) is committed as a standalone diff — it adds exactly 1 field to 1 interface and 0-N caller opt-ins.
2. P2's mcp-server work (queue tables, gate, two scheduler jobs, ragIndex re-index calls) is committed independently.
3. **No file-level merge conflict is expected** because P2 touches `schema-news.ts` + `pollNews.ts` + scheduler files + `ragHttpClient.ts:ragIndex`, while P3 touches `ragHttpClient.ts:ragSearch` only.

**If PM decides to run P2 and P3 mcp-server slices concurrently:** serialize the two `ragHttpClient.ts` commits via commit-mutex (one merges first, other rebases). The `ragIndex` interface (P2) and `RagSearchRequest` interface (P3) are in separate `interface` blocks in the same file — a rebase is trivially resolved.

**Recommendation:** PM sequences dev-mcp-server P3 slice AFTER dev-mcp-server P2 slice is merged. They are not on the critical path for each other — the rag-service P3 work can proceed fully in parallel with all of P2.

---

## DDD Layer Assignments

| Component | File | Layer |
|-----------|------|-------|
| `hybrid_search()` port signature | `domain/repositories.py` | **domain** |
| `hybrid: bool` field on SearchRequest | `application/dtos.py` | application |
| FTS index build + `LanceDBVectorStore.hybrid_search()` | `infrastructure/repositories.py` | infrastructure |
| `SearchUseCase.execute()` branch | `application/usecases.py` | application |
| `SearchRequestSchema.hybrid` | `interface/serializers.py` | interface |
| `/admin/rebuild-fts` route | `interface/handlers.py` | interface |
| `hybrid?: boolean` in `RagSearchRequest` | `ragHttpClient.ts` | infrastructure (mcp-server) |

**Golden rule check:** `domain/repositories.py` defines the `VectorStorePort` interface with `hybrid_search()` but does NOT import lancedb. The lancedb-specific implementation is in `infrastructure/repositories.py`. ✓

---

## Risk Table

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R-P3-1 | FTS index build blocks search on first hybrid request | Low | Lazy init runs once, ~30s at 14k rows; blocking only affects first hybrid caller; non-hybrid path unaffected |
| R-P3-2 | FTS index stale for newest rows (up to 24h) | Low | Daily cron rebuild + lazy fallback; vector recall still covers new rows |
| R-P3-3 | RRFReranker import fails on lancedb version drift | Low | Confirmed available in 0.30.2 (spike); wrap in try/except with fallback to vector-only |
| R-P3-4 | P2/P3 collision on ragHttpClient.ts | Low | Separate interfaces (ragIndex vs ragSearch); serialize commits via commit-mutex if parallel |
| R-P3-5 | Hybrid search latency too high for 15min cycle | Low | Hybrid path opt-in only; pollNews defaultRagRetriever does NOT use hybrid; adds ~40ms to chef queries |
| R-P3-6 | `create_fts_index(replace=True)` errors on concurrent builds | Low | `_fts_index_built` flag is per-process; single-process FastAPI (uvicorn); no concurrent build |

---

## Acceptance Criteria (for QA)

1. `POST /search {"query": "VCB earnings", "hybrid": false}` returns same results as before (vector-only path unchanged).
2. `POST /search {"query": "VCB earnings", "hybrid": true}` returns results; no 500 error.
3. Hybrid results rank `VCB`-mentioning rows higher than vector-only for "VCB earnings" query (BM25 boost).
4. `POST /search {"query": "x", "hybrid": true}` on a corpus with no FTS index yet triggers lazy index build (no 500; returns results within 60s).
5. `POST /admin/rebuild-fts` returns `{"status": "ok"}` and subsequent hybrid queries succeed.
6. `RagSearchRequest` TypeScript interface compiles with `hybrid?: boolean` field.
7. Existing non-hybrid callers (`hybrid` absent / `hybrid: false`) continue to work without changes.
8. `hybrid_search()` in `LanceDBVectorStore` uses `.vector().text()` pattern — NOT `tbl.search('text_string', query_type='hybrid')`.

---

## BUILD-STANDARD: lean
New feature within existing `apps/rag-service/` zone + one-field extension on mcp-server's HTTP client interface. No new microservice.
