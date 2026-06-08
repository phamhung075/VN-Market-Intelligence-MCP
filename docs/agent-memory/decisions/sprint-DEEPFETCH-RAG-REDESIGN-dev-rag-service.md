# Decision Journal — Sprint DEEPFETCH-RAG-REDESIGN · dev-rag-service

**Sprint goal:** Deep-Fetch + RAG Redesign — Phase 1 additive metadata + feasibility probes
**Agent:** dev-rag-service
**Started:** 2026-06-08T10:50:00Z

---

### STEP dev-rag-service-S1 · dev-rag-service · 2026-06-08T10:50:00Z
**task-id:** DFR-P1-RAG
**what-done:** Implemented FR-1 (LanceDB add_columns migration), FR-2 (IndexRequest DTO extension), FR-3 (SearchRequest DTO + LanceDBVectorStore pre-filters). Wrote 19 new unit tests (all GREEN). Verified live migration on rag_entries table.

**what-considered:**
- Migration strategy: add_columns() one-column-at-a-time loop vs all-at-once dict. Chose all-at-once dict (single call to add_columns with all 8 cols) but wrapped each in individual try/except to allow partial-success idempotency on re-run. Spike (DFR-Q4) confirmed add_columns with dict is non-destructive on lancedb 0.30.2.
- ValueError propagation: SearchUseCase catches all exceptions and wraps in SearchError. Added `except ValueError: raise` before the generic catch so invalid filter values propagate as ValueError to the interface layer, enabling HTTP 400. SearchError remains for genuine infrastructure failures.
- Fresh table seed schema: extended seed row to include all 16 columns so new deployments never need add_columns() at all. The seed row is deleted after creation so it does not count as data.
- Schema verification method: `table.schema` is a coroutine in lancedb 0.30.2 — must use `await table.schema()`. Verified in live container.

**why-decision:**
- Per-column loop + try/except: idempotency requirement (AC-FR1-5) — if first 3 columns land and startup crashes, second run must not error on those 3. Single all-or-nothing call would fail on second run for already-existing columns.
- ValueError re-raise: HTTP 400 spec requirement (AC-FR3-4). Wrapping in SearchError would lose the type signal that the handler uses to distinguish 400 vs 500.
- Fence-A/Fence-B clean: no infrastructure imports in domain/primitive, no infrastructure imports in application. Verified by grep.

**live-verification:**
- Row count BEFORE migration: 14028
- Row count AFTER migration: 14028
- Columns after: 16 (['id', 'level', 'title', 'summary', 'vector', 'tags', 'action_code', 'created_at', 'ticker', 'sector', 'source_domain', 'depth_tier', 'doc_type', 'published_at', 'confidence', 'impact_score'])
- Data loss: 0 rows

**test-results:**
- Baseline tests: 85 passed (unchanged)
- New FR-1..FR-3 tests: 19 passed
- Total: 104 passed, 0 failed
- Sandbox primitive: 16/16 PASS
- Sandbox module: 2/2 PASS
- Env audit: EMPTY (no forbidden keys)

**rebuild-required:** YES — rag-service container must be rebuilt to ship new code to Docker. The migration on the live LanceDB was verified using the EXISTING image running against the live volume (confirming the add_columns() path works non-destructively). The new code (FR-2 DTO fields, FR-3 filters, HTTP 400 routing) requires a container rebuild. Targeted rebuild only: `docker compose build rag-service && docker compose up -d rag-service`. Do NOT down&&up (would restart all peers).

**files-changed:**
- apps/rag-service/domain/models.py (FR-1/FR-2: 8 new fields on AnalysisEntry + SearchResult)
- apps/rag-service/domain/repositories.py (FR-3: 5 new params on VectorStorePort.search())
- apps/rag-service/application/dtos.py (FR-2: IndexRequest + FR-3: SearchRequest + SearchResultDTO)
- apps/rag-service/application/usecases.py (FR-2/FR-3: pass-through + ValueError re-raise)
- apps/rag-service/infrastructure/repositories.py (FR-1: migration + FR-2: insert + FR-3: search filters)
- apps/rag-service/interface/handlers.py (FR-3: HTTP 400 for ValueError)
- apps/rag-service/interface/serializers.py (FR-2/FR-3: Pydantic schema extensions)
- apps/rag-service/__tests__/unit/test_fr1_fr2_fr3_metadata.py (19 new tests)

---

### STEP dev-rag-service-S2 · dev-rag-service · 2026-06-08T14:45:00Z
**task-id:** DFR-P3-RAG
**what-done:** Implemented FTS + RRF hybrid search end-to-end. 8 ACs all GREEN:
- VectorStorePort.hybrid_search() abstract method added (domain/repositories.py)
- SearchRequest.hybrid: bool = False DTO field (application/dtos.py)
- LanceDBVectorStore.hybrid_search() with lazy FTS index build (_fts_index_built flag) + _build_fts_index() + _build_filter_clauses() + _dedup_and_trim() extracted helpers (infrastructure/repositories.py)
- SearchUseCase.execute() branches on request.hybrid (application/usecases.py)
- SearchRequestSchema.hybrid field + to_dto() mapping (interface/serializers.py)
- POST /admin/rebuild-fts route + register_routes() now accepts vector_store kwarg (interface/handlers.py)
- main.py passes real_vector_store to register_routes
- sandbox FakeVectorStore.hybrid_search() stub + search() signature updated for Phase 1 params
- 35 new unit tests (all GREEN); 105+35=140 total

**what-considered:**
- FTS index creation API: lancedb 0.30.2 (Docker) has `create_fts_index()` convenience method, but production image was upgraded to 0.33.0 which no longer has it. Used `create_index(col, config=FTS(), replace=True)` — works in both 0.25.3 (local) and 0.33.0 (Docker). Two separate calls for title then summary (not a list — AC-P3R-7, confirmed spike DFR-Q3).
- Hybrid search API: tbl.search(query_type='hybrid') requires embedding function registration in 0.33.0 async API — not available since we pass raw vectors. Used tbl.query().nearest_to(vec).column('vector').nearest_to_text(text).rerank(RRFReranker()).limit(n) — works in both 0.25.3 and 0.33.0 async APIs. This is the AsyncHybridQuery path.
- _fts_index_built: per-instance (not module-level) bool flag. Per-process singleton for single-process FastAPI/uvicorn. Reset to True by /admin/rebuild-fts for fresh-index signal.
- register_routes() signature: added vector_store=None kwarg (backward-compatible). /admin/rebuild-fts returns 503 if not wired.
- Temporal decay: applied on BOTH vector and hybrid paths (unchanged search_service.rank() call).

**why-decision:**
- create_index(config=FTS()) vs create_fts_index(): version-stable API. Production Docker unexpectedly upgraded from 0.30.2 to 0.33.0 — guard against future drift.
- tbl.query().nearest_to().nearest_to_text() vs tbl.search('text', query_type='hybrid'): the latter requires registered embedding functions which we don't have (raw vectors). Former works with any table regardless of embedding registration.
- _build_filter_clauses() extracted: DRY compliance — avoids ~40L duplication between search() and hybrid_search(); also exposes it as a testable unit.

**live-verification:**
- Row count BEFORE (pre-sprint): 14131 (measured before code changes)
- Row count AFTER: 14138 (normal ingest increment; code changes do NOT affect LanceDB)
- No rebuild yet — code change requires targeted rag-service rebuild

**test-results:**
- Baseline (Phase 1): 105 passed (unchanged)
- New DFR-P3 tests: 35 passed (0 failed)
- Total: 140 passed, 0 failed
- Sandbox primitive: 16/16 PASS
- Sandbox module: 2/2 PASS
- Env audit: EMPTY (no forbidden keys)
- Fence-A: CLEAN (no infra/app/interface imports in domain/primitive)
- Fence-B: CLEAN (no infrastructure imports in application)

**rebuild-required:** YES — targeted rag-service rebuild: `docker compose build rag-service && docker compose up -d rag-service`. Do NOT down&&up. After rebuild, POST /search with hybrid=true will be live. /admin/rebuild-fts triggers FTS index build (first ~30s at 14k rows, then cached).

**files-changed:**
- apps/rag-service/domain/repositories.py (hybrid_search() abstract method on VectorStorePort)
- apps/rag-service/application/dtos.py (SearchRequest.hybrid: bool = False)
- apps/rag-service/infrastructure/repositories.py (_build_filter_clauses + _dedup_and_trim helpers; _fts_index_built flag; _build_fts_index(); hybrid_search())
- apps/rag-service/application/usecases.py (hybrid branch in execute())
- apps/rag-service/interface/serializers.py (SearchRequestSchema.hybrid field)
- apps/rag-service/interface/handlers.py (POST /admin/rebuild-fts; vector_store kwarg on register_routes)
- apps/rag-service/main.py (pass real_vector_store to register_routes)
- apps/rag-service/sandbox/__main__.py (FakeVectorStore: hybrid_search stub + search() Phase-1 params)
- apps/rag-service/__tests__/unit/test_dfr_p3_hybrid_search.py (35 new tests)
