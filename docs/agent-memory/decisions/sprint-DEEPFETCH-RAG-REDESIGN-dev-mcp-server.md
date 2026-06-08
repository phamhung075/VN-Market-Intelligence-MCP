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
