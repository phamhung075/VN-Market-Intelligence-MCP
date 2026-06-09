# Decision Journal — Sprint DEEPFETCH-RAG-REDESIGN · dev-mcp-server

**Sprint goal:** Deep-Fetch + RAG Redesign — Phase 1 additive metadata + feasibility probes
**Agent:** dev-mcp-server
**Started:** 2026-06-08T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-08T00:00:00Z
**task-id:** DFR-Q5
**what-done:** Verified live rag_analyses schema via PRAGMA table_info on /app/data/market.db inside running container; confirmed body_text is absent; confirmed ALTER TABLE ADD COLUMN pattern is safe and in use.
**what-considered:**
- Read schema directly from market.db on host (empty — live DB is container-mounted at /app/data/market.db)
- Query via bun:sqlite inside container (used — only path with live data)
**why-decision:** Container has the live DB; host market.db is empty (dev artifact). bun is available in container so bun:sqlite PRAGMA was the correct read-only probe.
**why-change:** No change to design — probe confirms the brief's assumption exactly.

---

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-08T11:53:00Z
**task-id:** DFR-P1-MCP
**what-done:** Implemented FR-6, FR-4, FR-5, and FR-3 (mcp-server portion) per BA spec.
- FR-6: `try { db.exec("ALTER TABLE rag_analyses ADD COLUMN body_text TEXT"); } catch {}` added after data_env line in schema-news.ts. Idempotent try/catch pattern matches EI-P2-2 precedent at line 57.
- FR-4: `rag.decayHalfLifeDays: {news:2, macro:7, filing:30, analysis:14}` added to mcp.config.json (real path: `mcp.config.json`, symlinked). `RagConfig` interface + `RagDecayHalfLifeDaysConfig` added to config.ts; `loadMcpConfig()` reads via `numVal()` with safe defaults.
- FR-5 (pollNews): `ragInsertFn` call site updated to pass `doc_type:"news"`, `depth_tier:"shallow"`, `source_domain` (derived from `entry.sourceUrl` via `new URL().hostname`, guarded), `published_at`, `confidence`, `impact_score`, `ticker` (from `entry.affectedActions[0]`), `sector` (inline lookup via `cfg.market.referenceStocks`). E1 guard: try/catch around `new URL()` parse.
- FR-5 (fetchParseAndStoreBctc): `analysisEntry` updated to pass `doc_type:"filing"`, `depth_tier:"shallow"`, `ticker:actionCode.toUpperCase()`, `sector` (inline lookup), `source_domain:"bctc.ssi.com.vn"`, `published_at:doc.publishedAt ?? ""`, `confidence:report.source.extractionConfidence ?? 0`, `impact_score:0`.
- FR-3 (mcp part): `RagSearchRequest`, `RagSearchResultDTO`, `RagIndexRequest` in ragHttpClient.ts extended with all 8 new optional fields; `AnalysisInput` extended with 8 optional metadata fields. `defaultRagRetriever` now passes `decay_half_life_days: cfg.rag.decayHalfLifeDays.news` (= 2 days from config). Both `getDefaultInsertAnalysis()` and the `ragInsertFn` default pass all new optional fields through.
**what-considered:**
- Sector lookup via `cfg.market.referenceStocks` (config-driven) vs domain/services/stockAliases.ts ticker→sector map (doesn't exist). Config SSOT chosen.
- `AnalysisInput` extension vs separate call-site mapping: extending AnalysisInput keeps the type boundary clean and avoids duplicating field lists.
**why-decision:** All config values read from mcp.config.json via typed `RagConfig` — zero hardcoded numbers. Idempotent migration follows EI-P2-2 precedent exactly.
**why-change:** rag-service now accepts 8 metadata fields (DFR-P1-RAG DONE). mcp-server must pass them to deliver Phase 1 value (filter precision for CHEF/cascadeEngine consumers).
**evidence:** tsc --noEmit CLEAN. Live row count before: 5557. Existing test failures (data_env schema gap in test DBs) all pre-exist; 0 new failures introduced. Rebuild required: targeted mcp-server only (never down&&up).
**dj-gate-1:** DJ-GATE-1 appendend here before flipping DFR-P1-MCP to done-code.

---

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-08T16:35:00Z
**task-id:** DFR-P3-MCP
**what-done:** Added `hybrid?: boolean` optional field to `RagSearchRequest` interface in `ragHttpClient.ts`. Passed `hybrid: true` in three caller sites: `runImpactChain.ts` defaultRagRetriever (Chef synthesis causal cascade), `runPredictionImpactChain.ts` defaultRagRetriever (Chef synthesis prediction chain), `analysis.ts` `search_similar_context` tool (bctc-analyst ticker-exact filing queries). Confirmed `pollNews.ts` defaultRagRetriever has NO `hybrid: true` — added spec comment "hybrid intentionally omitted — contextual enrichment is semantic, not ticker-exact".
**what-considered:**
- Whether `search_similar_context` should opt in: yes — bctc-analyst uses it with `actionCode` for ticker-exact filing queries; BM25 recall is beneficial. The tool passes `actionCode` when provided which is ticker-specific.
- Whether `runImpactChain` / `runPredictionImpactChain` defaultRagRetriever is "Chef synthesis": yes — these are the causal cascade engine retrievers called by `run_impact_chain` and prediction chain tools; Chef agents are the primary callers.
- pollNews stays vector-only: confirmed per spec. The defaultRagRetriever there is semantic context enrichment, not ticker-exact.
**why-decision:** Thin XS change — one interface field + caller opt-in only. rag-service already accepts `hybrid` (DFR-P3-RAG DONE). No new files, no structural changes, DDD layers untouched.
**why-change:** DFR-P3-MCP final task of DEEPFETCH-RAG-REDESIGN sprint. P2-MCP merged at commit 65228a83 (different interface block — RagIndexRequest). This change touches only RagSearchRequest — no collision.
**evidence:** tsc --noEmit EXIT:0. RAG test files (4 files): 39 pass / 0 fail. Full bun test: exit 0 ×2 (Bun WriteFailed crash is post-test coverage write on ENOSPC /tmp — pre-existing Bun v1.3.13 bug, not a test failure). Tool count: 172. Scheduler count: 78 (baseline 76 + 2 from P2-MCP). Rebuild needed: targeted mcp-server rebuild (no down&&up).
**dj-gate-1:** DJ-GATE-1 appended here before flipping DFR-P3-MCP to done-code.

---

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-06-08T16:35:00Z
**task-id:** FIX-BCTC-ENRICHER-PLACEHOLDER-URL
**what-done:** Fixed root cause of 18 pending rows 404-looping forever; changed `backfillBctcQ12026.ts` to insert `source_url = NULL` (removed placeholder VPS URL insert); added 7 regression tests (TC-1/TC-2/TC-3/TC-4) in `FIX-BCTC-ENRICHER-PLACEHOLDER-URL.test.ts`.
**what-considered:**
- Option (a): extend enricher WHERE clause to also match `http://125.212.251.27:8765/bctc-files/...Q1.pdf` pattern (would let existing live rows get enriched, but wires knowledge of VPS URL structure into enricher logic)
- Option (b): change backfill to insert `source_url = NULL` so enricher's existing WHERE arm captures it — simpler, fixes root cause at insertion point, matches the original design intent documented in the code comment
**why-decision:** Option (b) is cleaner: the backfill's own comment says "bctcQueueEnricherJob replaces this with the real VPS-discovered URL" — inserting NULL is the contract the enricher was designed for. Option (a) would widen the enricher WHERE clause with VPS-host-specific knowledge that could drift; option (b) is 1-line change with zero enricher logic change. TC-4 documents that live rows with old placeholder URLs still need a one-time migration (out of scope).
**why-change:** No change from architect brief recommendation (option b preferred by task spec for cleanliness).

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-06-09T01:29:26Z
**task-id:** sau-c283-c09
**what-done:** Root-caused C-09 CRITICAL as auditor probe bug; fixed C-09 query+threshold in docs/agents/system-auditor/flow/main.md. No mcp-server code changed.
**what-considered:**
- Fix real collapse (write multi-country rows): no multi-country writer exists; VPS TE fetcher needs TRADING_ECONOMICS_API_KEY which is absent; not the right fix path
- Fix auditor probe (schema mismatch introduced a95c514a): DISTINCT country→non-null indicator count on vietnam row; threshold ≥8→≥3
**why-decision:** Live DB has exactly 1 row (vietnam) and has never had >1 country. The ≥8 threshold survived from the pre-refactor indicator-keyed design. The probe bug is the root cause; fixing the probe is the correct and only necessary change.
**why-change:** No change from diagnostic path — confirmed auditor false-positive before touching any data writers.

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-06-09T00:00:00Z
**task-id:** CI-NETWORK-GUARDS-POLLNEWS-REFILE
**what-done:** Re-applied 4 CI=true network-skip guards from reverted 9454baad to pollNews.ts; pollNews.ts only, zero test file changes.
**what-considered:**
- only: re-file BATCH-2 guards verbatim from reverted diff — exact same code, no new logic
**why-decision:** BATCH-2 was a verified win (46→15 CI errors, 1345a 6/0); BATCH-1 schema DDL injection was the regression (+219). Clean separation re-files the win without the regression.
**why-change:** Reverted 9454baad bundled both batches; split approved by router's REVERT-then-FIX-FORWARD ruling.
