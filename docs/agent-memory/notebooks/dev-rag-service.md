# dev-rag-service — Notebook

Zone: `apps/rag-service/` | Stack: Python/FastAPI | DB: rag_service.db (write)

## Working Memory

### 2026-06-08 — DFR-P3-RAG DONE-CODE (DEEPFETCH-RAG-REDESIGN Phase 3)

**Task:** DFR-P3-RAG | **Sprint:** DEEPFETCH-RAG-REDESIGN | **Status:** done-code — rebuild + QA pending

**What shipped:**
- `VectorStorePort.hybrid_search()` abstract method (domain/repositories.py)
- `SearchRequest.hybrid: bool = False` DTO field (application/dtos.py)
- `LanceDBVectorStore._build_fts_index()` — 2-call pattern: `create_index('title', config=FTS())` then `create_index('summary', config=FTS())` — NOT a list (AC-P3R-7)
- `LanceDBVectorStore.hybrid_search()` — `tbl.query().nearest_to(vec).column('vector').nearest_to_text(text).rerank(RRFReranker()).limit(n*4)` — NOT string-in-search (AC-P3R-8)
- `_fts_index_built: bool` per-process lazy-init flag (False on startup — no startup FTS build)
- `_build_filter_clauses()` + `_dedup_and_trim()` extracted as shared private helpers (DRY)
- `SearchUseCase.execute()` branches on `request.hybrid` — hybrid=True calls `hybrid_search()`, False calls `search()`
- `SearchRequestSchema.hybrid: bool = False` field in serializer
- `POST /admin/rebuild-fts` route — calls `_build_fts_index()` + resets flag
- `register_routes()` extended with `vector_store=None` kwarg for rebuild endpoint
- `FakeVectorStore.hybrid_search()` stub in sandbox (delegates to search() — ZERO LanceDB in sandbox)

**API note:** Production Docker upgraded to lancedb 0.33.0 (was 0.30.2 at spike). `create_fts_index()` is gone — using `create_index(config=FTS())` which works in both 0.25.3 and 0.33.0. Hybrid query uses `tbl.query().nearest_to().nearest_to_text()` (AsyncHybridQuery path), which is the stable API.

**Live verification:**
- Row count BEFORE: 14,131 | AFTER: 14,138 (normal ingest, code does NOT affect LanceDB)
- Sandbox primitive: 16/16 PASS | module: 2/2 PASS | env audit: EMPTY
- Tests: 140 passed (105 baseline preserved + 35 new) | 0 failed

**Rebuild required:** `docker compose build rag-service && docker compose up -d rag-service` (targeted only). After rebuild: POST /admin/rebuild-fts to seed FTS index (~30s), then hybrid=true queries live.

**Decision step:** STEP dev-rag-service-S2 in `docs/agent-memory/decisions/sprint-DEEPFETCH-RAG-REDESIGN-dev-rag-service.md`

---

### 2026-06-08 — DFR-P1-RAG DONE-CODE (DEEPFETCH-RAG-REDESIGN Phase 1)

**Task:** DFR-P1-RAG | **Sprint:** DEEPFETCH-RAG-REDESIGN
**Status:** done-code — awaiting container rebuild (ops) + QA sign-off (DFR-QA-1)

**What shipped:**
- FR-1: `_get_table()` now runs idempotent add_columns() migration (+8 columns). Fresh tables get 16-col seed schema. E4 graceful degrade if add_columns() absent.
- FR-2: `IndexRequest` extended with 8 optional fields (ticker, sector, source_domain, depth_tier, doc_type, published_at, confidence, impact_score). `AnalysisEntry` domain model updated. `insert()` passes all 8 fields.
- FR-3: `SearchRequest` extended with 5 optional filter fields. `LanceDBVectorStore.search()` pre-filters via WHERE clauses. Invalid depth_tier/doc_type/ticker → ValueError → HTTP 400.

**Live verification:**
- Row count BEFORE migration: 14,028
- Row count AFTER migration: 14,028 (zero data loss)
- Columns: 16 confirmed
- Sandbox primitive: 16/16 PASS | module: 2/2 PASS | env audit: EMPTY
- Tests: 104 passed (85 baseline preserved + 19 new)

**Rebuild required:** `docker compose build rag-service && docker compose up -d rag-service` (targeted only — no down&&up).

**Decision step:** `docs/agent-memory/decisions/sprint-DEEPFETCH-RAG-REDESIGN-dev-rag-service.md`

---

### 2026-06-08 — SPIKE DFR-Q3 + DFR-Q4 (DEEPFETCH-RAG-REDESIGN feasibility)

**Tasks:** DFR-Q4 (gates DFR-P1-RAG migration) · DFR-Q3 (gates DFR-P3-HYBRID)
**Mode:** Recon only — no production changes, no live table altered.

**DJ-GATE-1 — verified raw version:**
- Docker image (`vn-market-intelligence-mcp-rag-service:latest`): **lancedb 0.30.2**
- Host Python 3.13: lancedb 0.25.3 (not authoritative for production)
- `requirements.txt` lower-bound: `lancedb>=0.6.0`

**DFR-Q4 — add_columns() non-destructive? YES**
Tested against throwaway LanceDB in ephemeral Docker run. 3-row table with current live schema received all 8 new Phase 1 columns (`ticker`, `sector`, `source_domain`, `depth_tier`, `doc_type`, `published_at`, `confidence`, `impact_score`). Row count before=after=3. Original field values intact. Defaults: `depth_tier='shallow'`, `doc_type='news'`, numerics 0.0, optional strings null. Vectors NOT re-embedded. Risk R4 RESOLVED.

**DFR-Q3 — FTS + hybrid available? YES (with one API constraint)**
`create_fts_index()`: functional but single-field only in native mode — cannot pass `['title','summary']` as list; must call twice (once per field). `LanceHybridQueryBuilder` functional via `.vector().text()` pattern (not string-in-search). `RRFReranker` available and functional. No upgrade needed — 0.30.2 >> required v0.8+.

**Findings doc:** `docs/spikes/SPIKE_DFR-Q3-Q4-lancedb-feasibility.md`
**Both tasks:** DONE — orch-state updated.

---

### 2026-05-27 — DISK RECLAIM + COMPACTION GUARD (maintenance task)

**Trigger:** Host disk 100% full. Investigation identified two separate LanceDB stores.

**Root cause (two-store split):**
- **Container store** (`market_data` named volume, `/app/data/lancedb/`): 2.0 GB, 6880 fragments, 6877 versions — the LIVE store.
- **Local orphaned store** (`data/lancedb/` in project root): 23 GB, 2261 fragments — legacy artifact from a prior bind-mount phase; no running container reads/writes it.

**Actions taken:**
1. Compacted the container store via `docker exec` + `lancedb.optimize(cleanup_older_than=timedelta(days=1))`:
   - Pass 1: 6875 fragments merged → 1 compacted fragment; 5934 old versions pruned; 1.48 GB removed.
   - Pass 2: remaining 6879 old manifest files cleaned; 558 MB freed. Store: 2.0 GB → 16 MB.
   - Row count before=after=6875. Queryability: PASS.
2. Deleted orphaned local `data/lancedb/rag_entries.lance/` (23 GB, confirmed not mounted by any container). Host disk: 168 GB → 145 GB used, 38 GB → 61 GB free (82% → 71%).
3. Added periodic compaction guard to `LanceDBVectorStore.insert()`: every 100 inserts triggers `optimize(cleanup_older_than=2 days)` automatically. `compact()` method also exposed directly.
4. 4 new unit tests in `__tests__/unit/test_lancedb_compaction.py` (85/85 total). Sandbox 16+2+3 all PASS. Env audit: empty.
5. Updated `docs/architecture/microservice/rag-service/infrastructure.md` with compaction docs.
6. Commits: `e1407a74` (code + tests), `44a039c9` (docs). Container rebuild required.

**Zone health:** 85/85 tests GREEN, 16+2+3 sandbox GREEN, env audit empty. Compaction guard wired — bloat cannot recur. REBUILD_REQUIRED: ops must `docker compose up -d --build rag-service`.

---

### 2026-05-24 — TASKS P3-A → P3-D (service-tier completion — SCALE pilot REOPEN)

**Trigger:** PO cycle-78 DEFECT-REOPEN — user pilot-review rejected 12/12 close. Tier-3 (service) had zero scenario evidence, dashboard permanently NOT-RUN with dishonest hint.

**P3-A — service-tier scenario path:**
- `sandbox/__main__.py`: `--tier=service` added to choices; `_run_service_scenario()` boots `create_app(embedder=FakeEmbedder, vector_store=FakeVectorStore)` via FastAPI TestClient. FakeEmbedder: deterministic hash-seed unit vector; FakeVectorStore: in-memory L2 search. ZERO model/DB/credentials.
- `main.py`: `create_app(embedder=None, vector_store=None)` seam added (68L, <=80L). None → real adapters (prod unchanged). Injected → fakes (test/sandbox path).
- `app_factory.py`: `build_real_adapters(embedder_override, vector_store_override)` extracts the conditional wiring. `build_lifespan` returns factory callable, duck-types `initialize()` (fakes skip it).
- Scenarios: `service/scenarios/search_golden.json`, `index_golden.json`, `search_empty_query_422.json` (3/3 GREEN exit 0).
- Determinism: identical output across 2 runs (excluding elapsed_ms).
- Env gate: same `_FORBIDDEN_ENV_REGEX` gate; `LANCEDB_PATH=/tmp/x → exit 1`.

**P3-B — dashboard honesty:**
- `dashboard/index.html`: 3 service trace scripts added (`trace-service-search-golden`, `trace-service-index-golden`, `trace-service-search-422`). MICROSERVICE_CARDS updated to 3 real traceIds (no more null). Footer "No network calls to port 5002 in Phase 1" fixed. Stale "NOT-RUN until live HTTP wiring verified" removed. Dishonest "not implemented / Phase 2" hint text deleted.

**P3-C — dash-check:**
- `dashboard/dash-check.py`: 25→30 checks. 3 service trace GREEN assertions, dishonest hint absent check, 3 service traceIds wired check. Exit 0.

**P3-D — G12 DoD gate:**
- primitive: 16/16 EXIT:0
- module: 2/2 EXIT:0
- service: 3/3 EXIT:0
- env audit: EMPTY (anchored gate, no forbidden keys)
- LANCEDB_PATH injection → EXIT:1 (gate fires)
- dash-check: 30/30 EXIT:0
- pytest: 81/81
- main.py: 68L (<=80L G3 invariant)
- create_app() production path: unchanged when both args are None.

**Commits:** `a9832c5e` (code changes — contaminated into pdf-inspect architect commit, content correct per policy no-history-rewrite), `c4589c9e` (scenarios + traces JSON files — clean atomic commit).

**P3-A/B/C/D status:** DONE. P3-E is QA+PO scope. Not marking pilot DONE (QA+PO own re-close).

---

### 2026-05-24 — TASK P2-K2 (G9 Playwright headless trust contract — LAST Phase 2 task)

**Spec:** `apps/rag-service/dashboard/trust-contract.spec.mjs` (standalone Playwright .mjs, mirrors kinh-dich dash-check.mjs pattern)
**Result:** `apps/rag-service/dashboard/trust-contract-result.json` — PASS
**Screenshot:** `apps/rag-service/dashboard/trust-contract-screenshot.png`

**VERDICT (LIVE Playwright run, Chromium 147.0.7727.15, playwright-core from apps/mcp-server/node_modules):**
- panels_ok: true (3/3 panels rendered)
- primitive_cards_count: 5/5 all GREEN (similarity-scorer, relevance-threshold-gate, temporal-decay-scorer, top-k-selector, context-window-packer)
- module_ok: true (retrieval GREEN)
- microservice_not_run: true (honest NOT-RUN)
- colors_match_traces: true — proved via page.route() DOM patch: similarity-scorer trace patched to passed=false in-memory → card showed FAIL (RED). File on disk NOT modified. Transient, never committed.
- console_errors: 0
- network_calls: 0
- verdict: PASS

**G12 DoD (final):** 16/16 primitive sandbox GREEN, 2/2 module sandbox GREEN, 81/81 pytest, env audit empty.

**Commits:** `fa1b7773` (spec + result, via concurrent pdf-extractor agent pick-up), `4c0c0edb` (screenshot + commitSHA fix)

**P2-K2 status:** DONE. All Phase 2 tasks complete (P2-B1 through P2-K2). G9 PASS verdict live. NEXT: PO does G9 Path-B sign-off + terminal 12/12 atomic close + decisionMatrix.
