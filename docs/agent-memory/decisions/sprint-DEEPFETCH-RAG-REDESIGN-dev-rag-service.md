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
