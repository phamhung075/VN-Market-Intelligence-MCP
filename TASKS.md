# TASKS — VN Market Intelligence MCP
# Kanban Board | Agile/Kanban | DDD + TDD | Bun + TypeScript

> **WIP Limit**: max 2 tasks In Progress simultaneously
> **Workflow**: Backlog → Todo → In Progress → Review → Done
> **Branch**: `task/NNN-kebab-name`
> **Report**: `reports/TASK_REPORT_NNN.md` generated after every Review

---

## ✅ DONE

| # | Title | Branch | Merged | Report |
|---|-------|--------|--------|--------|
| 000 | Initial project structure | `main` | 2026-03-24 | — |
| 001 | Project setup & DDD folder structure | `task/001-project-setup` | 2026-03-25 | [TASK_REPORT_001](reports/TASK_REPORT_001.md) |
| 002 | SQLite schema + migrations | `task/002-db-schema` | 2026-03-25 | [TASK_REPORT_002](reports/TASK_REPORT_002.md) |
| 003 | Env config + structured logging | `task/003-env-config` | 2026-03-25 | [TASK_REPORT_003](reports/TASK_REPORT_003.md) |
| 011 | Embedding pipeline (HuggingFace local ONNX) | `task/011-rag-embeddings` | 2026-03-25 | [TASK_REPORT_011](reports/TASK_REPORT_011.md) |
| 012 | LanceDB vector store (read/write/search) | `task/012-lancedb-store` | 2026-03-25 | [TASK_REPORT_012](reports/TASK_REPORT_012.md) |
| 041 | Vietnamese number parser | `task/041-vn-number-parser` | 2026-03-25 | [TASK_REPORT_041](reports/TASK_REPORT_041.md) |
| 042 | Balance sheet extractor | `task/042-bctc-balance-sheet` | 2026-03-25 | [TASK_REPORT_042](reports/TASK_REPORT_042.md) |
| 014 | Embedding text builder (domain) | `task/014-embedding-text-builder` | 2026-03-26 | [TASK_REPORT_014](reports/TASK_REPORT_014.md) |
| 043 | Income statement extractor | `task/043-bctc-income-stmt` | 2026-03-26 | [TASK_REPORT_043](reports/TASK_REPORT_043.md) |
| 044 | Cash flow extractor | `task/044-bctc-cashflow` | 2026-03-26 | [TASK_REPORT_044](reports/TASK_REPORT_044.md) |
| 013 | RAG multi-level retriever | `task/013-rag-retriever` | 2026-03-26 | [TASK_REPORT_013](reports/TASK_REPORT_013.md) |
| 045 | Ratio computation | `task/045-bctc-ratios` | 2026-03-26 | [TASK_REPORT_045](reports/TASK_REPORT_045.md) |
| 046 | Period delta (QoQ / YoY) | `task/046-period-delta` | 2026-03-26 | [TASK_REPORT_046](reports/TASK_REPORT_046.md) |
| 047 | BCTC orchestrator (full parse pipeline) | `task/047-bctc-orchestrator` | 2026-03-26 | [TASK_REPORT_047](reports/TASK_REPORT_047.md) |
| 029 | SSC portal scraper | `task/029-ssc-scraper` | 2026-03-26 | [TASK_REPORT_029](reports/TASK_REPORT_029.md) |
| 081 | Bun HTTP server + SSE transport | `task/081-bun-mcp-server` | 2026-03-26 | [TASK_REPORT_081](reports/TASK_REPORT_081.md) |
| 030 | PDF downloader + pdf-parse text extractor | `task/030-pdf-extractor` | 2026-03-26 | [TASK_REPORT_030](reports/TASK_REPORT_030.md) |
| 048 | SSC fetch → parse → store pipeline | `task/048-ssc-pipeline` | 2026-03-26 | [TASK_REPORT_048](reports/TASK_REPORT_048.md) |
| 085 | SSC report MCP tools (fetch/summary/compare) | `task/085-tool-reports` | 2026-03-26 | [TASK_REPORT_085](reports/TASK_REPORT_085.md) |
| 021 | RSS base fetcher + CafeF news | `task/021-rss-cafef` | 2026-03-26 | [TASK_REPORT_021](reports/TASK_REPORT_021.md) |
| 082 | Watchlist MCP tools (add/remove/get/update) | `task/082-tool-watchlist` | 2026-03-26 | [TASK_REPORT_082](reports/TASK_REPORT_082.md) |
| 063 | Signal detector (price + news + report) | `task/063-signal-detector` | 2026-03-27 | [TASK_REPORT_063](reports/TASK_REPORT_063.md) |
| 064 | Multi-signal alert generator | `task/064-alert-generator` | 2026-03-27 | [TASK_REPORT_064](reports/TASK_REPORT_064.md) |
| 086 | Alert MCP tools (get_alerts, briefing, history) | `task/086-tool-alerts` | 2026-03-27 | [TASK_REPORT_086](reports/TASK_REPORT_086.md) |
| 087 | Server tool wiring (register all tools in createBunServer) | `task/087-server-wiring` | 2026-03-27 | [TASK_REPORT_087](reports/TASK_REPORT_087.md) |
| 022 | VnExpress Finance RSS fetcher | `task/022-rss-vnexpress` | 2026-03-27 | [TASK_REPORT_022](reports/TASK_REPORT_022.md) |
| 023 | Reuters / AP News RSS fetcher | `task/023-rss-reuters` | 2026-03-27 | [TASK_REPORT_023](reports/TASK_REPORT_023.md) |
| 061 | News normalizer → AnalysisEntry | `task/061-news-normalizer` | 2026-03-27 | [TASK_REPORT_061](reports/TASK_REPORT_061.md) |
| 062 | Causal cascade engine + runImpactChain use case | `task/062-cascade-engine` | 2026-03-27 | [TASK_REPORT_062](reports/TASK_REPORT_062.md) |
| 083 | Analysis MCP tools (fetch_and_analyze, run_impact_chain, search_similar_context) | `task/083-tool-analysis` | 2026-03-27 | [TASK_REPORT_083](reports/TASK_REPORT_083.md) |
| 088 | Legacy cleanup — delete src/server.ts + src/tools/ stubs | `task/088-legacy-cleanup` | 2026-03-27 | [TASK_REPORT_088](reports/TASK_REPORT_088.md) |
| 026 | HOSE market data fetcher (VnDirect API) | `task/026-hose-prices` | 2026-03-27 | [TASK_REPORT_026](reports/TASK_REPORT_026.md) |
| 102 | News polling job (every 30 min) | `task/102-job-news-poll` | 2026-03-28 | [TASK_REPORT_102](reports/TASK_REPORT_102.md) |
| 104 | SSC nightly report check (20:00 GMT+7) | `task/104-job-ssc-check` | 2026-03-28 | [TASK_REPORT_104](reports/TASK_REPORT_104.md) |
| 103 | Market open/close scan (09:00 + 15:30 GMT+7) | `task/103-job-market-scan` | 2026-03-28 | [TASK_REPORT_103](reports/TASK_REPORT_103.md) |
| 101 | Morning briefing job (08:00 GMT+7) | `task/101-job-morning-briefing` | 2026-03-28 | [TASK_REPORT_101](reports/TASK_REPORT_101.md) |
| 066 | AI summary generator (rule-based BCTC) | `task/066-ai-summary` | 2026-03-28 | [TASK_REPORT_066](reports/TASK_REPORT_066.md) |
| 065 | Historical pattern matcher | `task/065-pattern-matcher` | 2026-03-28 | [TASK_REPORT_065](reports/TASK_REPORT_065.md) |
| 084 | Market MCP tools (get_market_snapshot, get_patterns) | `task/084-tool-market` | 2026-03-28 | [TASK_REPORT_084](reports/TASK_REPORT_084.md) |
| 123 | Integration tests — MCP tools with real SQLite | `task/123-test-integration-mcp` | 2026-03-28 | [TASK_REPORT_123](reports/TASK_REPORT_123.md) |
| DOC-001 | Update CLAUDE.md architecture section | `task/doc-001-claude-md-update` | 2026-03-28 | [TASK_REPORT_DOC-001](reports/TASK_REPORT_DOC-001.md) |
| 024 | Trading Economics macro indicator scraper | `task/024-scraper-trading-economics` | 2026-03-28 | [TASK_REPORT_024](reports/TASK_REPORT_024.md) |
| 122 | Unit tests — domain services branch coverage | `task/122-domain-services` | 2026-03-28 | [TASK_REPORT_122](reports/TASK_REPORT_122.md) |
| 124 | Integration tests — SSC pipeline mock HTTP | `task/124-test-ssc-pipeline` | 2026-03-28 | [TASK_REPORT_124](reports/TASK_REPORT_124.md) |
| 125 | E2E test — daily briefing flow | `task/125-test-e2e-briefing` | 2026-03-28 | [TASK_REPORT_125](reports/TASK_REPORT_125.md) |
| 025 | Yahoo Finance commodity fetcher | `task/025-yahoo-finance` | 2026-03-29 | [TASK_REPORT_025](reports/TASK_REPORT_025.md) |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | 2026-03-29 | [TASK_REPORT_028](reports/TASK_REPORT_028.md) |
| FIX-081 | Fix SSE test timeout flakiness | `task/fix-081-sse-timeout` | 2026-03-29 | [TASK_REPORT_FIX-081](reports/TASK_REPORT_FIX-081.md) |
| 126 | Macro cascade integration | `task/126-macro-cascade` | 2026-03-29 | — |
| 089 | `get_macro_snapshot` MCP tool | `task/089-tool-macro` | 2026-03-29 | — |
| 134 | Sentiment classifier + cascade directional signals | `task/134-sentiment-classifier` | 2026-03-29 | — |

> **Sprint 003 COMPLETE** — All 5 tasks merged: 021, 082, 063, 064, 086. PO sign-off: APPROVED 2026-03-27.
> **Sprint 004 Wave 1** — Tasks 087, 022, 023 merged: 2026-03-27.
> **Sprint 004 Wave 2** — Task 061 merged: 2026-03-27. Task 062 unblocked.
> **Sprint 004 Wave 3** — Task 062 merged: 2026-03-27. Task 083 now unblocked (Wave 4).
> **Sprint 004 COMPLETE** — All 6 tasks merged: 087, 022, 023, 061, 062, 083. QA approved: 2026-03-27.
> **Sprint 005 Wave 1** — Task 088 merged: 2026-03-27. Wave 2 (026, 102, 104) now unblocked.
> **Sprint 005 Wave 2** — Task 026 merged: 2026-03-27. Task 103 (market scan jobs) now unblocked.
> **Sprint 005 Wave 2** — Task 104 merged: 2026-03-28. SSC nightly check live at 20:00 GMT+7.
> **Sprint 005 COMPLETE** — All 6 tasks merged: 088, 026, 102, 104, 103, 101. QA approved: 2026-03-28.
> **Sprint 006 PLANNING** — Tasks 065, 066, 027, 084, 105, 123 promoted to Todo. See SPRINT_GOAL.md sprint_id: 006.
> **Sprint 006 ACTIVE** — 2026-03-28. Wave 1 (065, 066, 027, 105) ready to assign. WIP limit: 2. TECH_006.md approved by Architect.
> **Sprint 006 Wave 1** — Task 066 completed: 2026-03-28. Rule-based AI summary generator with 40 tests.
> **Sprint 006 Wave 1** — Task 065 completed: 2026-03-28. Historical pattern matcher, 15 tests pass.
> **Sprint 006 Wave 2** — Task 084 merged: 2026-03-28. Market MCP tools (get_market_snapshot, get_patterns), 14/14 tests pass, toolCount 14→16. Task 123 now unblocked (Wave 3).
> **Sprint 006 COMPLETE** — All 6 tasks merged: 065, 066, 027, 105, 084, 123. QA approved: 2026-03-28. 28-test integration harness covers all 16 MCP tools across 5 end-to-end roundtrip chains with real SQLite.
> **Sprint 008 Wave 1** — All 3 tasks merged: FIX-081, 025, 028. QA approved: 2026-03-29. Full suite: 842 pass, 0 fail. Yahoo Finance commodity fetcher (13 tests), SBV macro fetcher (14 tests), SSE timeout fix (8 tests hardened).
> **Sprint 008 Wave 2** — All 2 tasks merged: 126, 089. QA approved: 2026-03-29. Macro cascade integration (15 tests), get_macro_snapshot MCP tool (16 tests). toolCount 16 → 17.
> **Sprint 008 COMPLETE** — All 5 tasks merged: FIX-081, 025, 028, 126, 089. Sprint 008 delivers the macro intelligence layer: commodity prices, SBV central bank rates, causal chain macro adjustments, and get_macro_snapshot MCP tool. 66 new tests added.
> **Sprint 010-011 QA batch** — Tasks 131, 132, 133, 137 merged: 2026-04-01. Alert quality (35 tests), BCTC validator (26 tests), adaptive thresholds (25 tests), Step E fix (18 tests). tsc: 0 errors.
> **Sprint 017 COMPLETE** — All 5 tasks merged: 152, 153, 154, 155, 156. Production Hardening: noise filter, SSC dedup, LanceDB silence, log rotation, off-hours interval. 16 new tests.
> **Sprint 018 COMPLETE** — All 3 tasks merged: 157, 158, 159. Data audit engine, scheduler wiring, health tool enhancement. 2026-04-01.
> **Sprint 019 ACTIVE** — started 2026-04-01. Task 160 merged 2026-04-01 (34 tests, 100% coverage). Task 161 unblocked.

---

## 🔍 REVIEW

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| 161 | Wire aliases into cascade engine + pollNews Gate 3 | `task/161-alias-wiring` | 19 tests, AC-7/AC-8/AC-12 pass, tsc clean |

---

## 🚧 IN PROGRESS

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| — | — | — | Empty |

---

## 📋 TODO
*(Dependencies cleared — ready to assign)*

### Sprint 017 — Production Hardening

> Sprint 017 COMPLETE — 2026-04-01. All 5 tasks done.
> Tasks 152, 154, 156 merged in earlier sessions. Tasks 153, 155 merged 2026-04-01.

| # | Title | Priority | Status |
|---|-------|----------|--------|
| 152 | News-mention alert noise filter | P0 | Done |
| 153 | SSC scan deduplication | P0 | Done — merged 2026-04-01 |
| 154 | Silence LanceDB TRACE logging | P1 | Done |
| 155 | Log file rotation | P1 | Done — merged 2026-04-01 |
| 156 | Off-hours cycle interval increase | P2 | Done |

### Sprint 018 — Data Integrity First

> Sprint 018 COMPLETE — 2026-04-01. PO sign-off pending (smoke test required before final sign-off).
> All 3 tasks merged: 157 (data audit engine), 158 (scheduler wiring), 159 (get_system_health db_audit section).
> Design refs: docs/REQ_018.md (BA) + docs/TECH_018.md (Architect).
> Full suite at merge: 1171 pass, 3 fail (all pre-existing), 0 TypeScript errors.

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| REQ-018 | BA: Requirement Spec for Sprint 018 | `task/doc-001-claude-md-update` | BA | docs/ | P0 | — | Done — docs/REQ_018.md |
| TECH-018 | Architect: Technical Design for Sprint 018 | `task/doc-001-claude-md-update` | Architect | docs/ | P0 | REQ-018 | Done — docs/TECH_018.md |
| 157 | Data audit engine: `dataAuditJob.ts` + schema migration + `getCount()` | `task/157-data-audit-job` | Developer | scheduler + infrastructure/db + infrastructure/rag | P0 | TECH-018 ✓ | Done — merged 2026-04-01 |
| 158 | Scheduler wiring: `CRONS.dataAuditDaily` + `CRONS.dataAuditWeekly` in `jobs.ts` | `task/158-audit-scheduler-wiring` | Developer | scheduler | P1 | 157 ✓ | Done — merged 2026-04-01 |
| 159 | `get_system_health` db_audit section: `audit_state` reads + live `agent_feedback` counts | `task/159-health-db-audit` | Developer | interface/mcp/tools + infrastructure/db | P2 | 157 ✓ | Done — merged 2026-04-01 |

---

### Sprint 020 — Prediction Market Intelligence

> Sprint 020 PLANNING — started 2026-04-01. BA spec complete. Architect design complete.
> Design refs: docs/REQ_020.md (BA — READY_FOR_ARCHITECT) + docs/TECH_020.md (Architect — APPROVED_BY_ARCHITECT).
> Dependency order: 163 (schema) + 169 (config) + 165 (mapper) in parallel → 164 (fetcher, needs 163+169) → 166 (detector, needs 163+165) → 167 (scheduler job, needs 164+165+166) → 168 (MCP tool, needs 163+167).

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| REQ-020 | BA: Requirement Spec for Sprint 020 | `task/doc-001-claude-md-update` | BA | docs/ | P0 | — | Done — docs/REQ_020.md |
| TECH-020 | Architect: Technical Design for Sprint 020 | `task/doc-001-claude-md-update` | Architect | docs/ | P0 | REQ-020 | Done — docs/TECH_020.md |
| 163 | SQLite schema: `prediction_markets` + `prediction_signals` tables | `task/163-prediction-schema` | Developer | infrastructure/db | P0 | TECH-020 ✓ | **Todo** |
| 169 | `mcp.config.json` predictionMarkets section + config.ts type extension | `task/169-prediction-config` | Developer | infrastructure/config | P0 | TECH-020 ✓ | **Todo** |
| 165 | Prediction cascade mapper (`predictionCascadeMapper.ts`) | `task/165-prediction-cascade-mapper` | Developer | domain/services | P0 | TECH-020 ✓ | **Todo** |
| 164 | Polymarket REST fetcher (`polymarket.ts`) | `task/164-polymarket-fetcher` | Developer | infrastructure/fetchers | P0 | 163 ✓, 169 ✓ | Backlog |
| 166 | Prediction signal detector (`predictionSignalDetector.ts`) + SignalType extension | `task/166-prediction-signal-detector` | Developer | domain/services | P0 | 163 ✓, 165 ✓ | Backlog |
| 167 | Prediction market scheduler job + cron wiring | `task/167-prediction-market-job` | Developer | scheduler | P0 | 164 ✓, 165 ✓, 166 ✓ | Backlog |
| 168 | `get_prediction_markets` MCP tool + server.ts + index.ts registration | `task/168-prediction-mcp-tool` | Developer | interface/mcp | P1 | 163 ✓, 167 ✓ | Backlog |

---

#### Task 163 — SQLite schema: `prediction_markets` + `prediction_signals` tables

**Branch**: `task/163-prediction-schema`
**Layer**: infrastructure/db
**Priority**: P0
**Depends on**: TECH-020 ✓ (approved 2026-04-01)
**Estimated effort**: ~1 hour

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts` — existing `initDatabase()` + `CREATE TABLE IF NOT EXISTS` pattern; insert new DDL after the `sbv_rates_history` block
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_020.md` — Section 6 "SQLite schema additions": exact DDL for `prediction_markets`, `prediction_signals`, and three indexes

**Files to modify**:
- MODIFY: `src/infrastructure/db/schema.ts` — add `prediction_markets` table (upsert target, PK = `id`) and `prediction_signals` table (append-only, FK → `prediction_markets.id`) plus three indexes: `idx_prediction_signals_detected_at DESC`, `idx_prediction_signals_market`, `idx_prediction_signals_severity`

**Files to create**:
- CREATE: `src/__tests__/163-prediction-schema.test.ts`

**Acceptance Criteria**:

**Given** `initDatabase()` is called on a fresh `:memory:` SQLite instance
**When** the schema initialises
**Then**
- `SELECT name FROM sqlite_master WHERE type='table' AND name='prediction_markets'` returns one row
- `SELECT name FROM sqlite_master WHERE type='table' AND name='prediction_signals'` returns one row
- `prediction_markets` columns: `id TEXT PRIMARY KEY`, `question TEXT NOT NULL`, `end_date TEXT NOT NULL`, `yes_price REAL NOT NULL`, `no_price REAL NOT NULL`, `volume_24h REAL NOT NULL DEFAULT 0`, `volume_total REAL NOT NULL DEFAULT 0`, `liquidity REAL NOT NULL DEFAULT 0`, `last_trade_price REAL NOT NULL DEFAULT 0`, `unique_wallets INTEGER NOT NULL DEFAULT 0`, `tags TEXT NOT NULL DEFAULT '[]'`, `fetched_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`
- `prediction_signals` columns: `id TEXT PRIMARY KEY`, `market_id TEXT NOT NULL`, `signal_type TEXT NOT NULL`, `severity TEXT NOT NULL`, `yes_price_prev REAL`, `yes_price_curr REAL NOT NULL`, `volume_24h REAL NOT NULL DEFAULT 0`, `unique_wallets INTEGER NOT NULL DEFAULT 0`, `confidence REAL NOT NULL`, `mapped_sectors TEXT NOT NULL DEFAULT '[]'`, `mapped_stocks TEXT NOT NULL DEFAULT '[]'`, `reasoning TEXT NOT NULL`, `detected_at TEXT NOT NULL`; foreign key references `prediction_markets(id)`
- Three indexes exist: `idx_prediction_signals_detected_at`, `idx_prediction_signals_market`, `idx_prediction_signals_severity`
- `INSERT OR REPLACE INTO prediction_markets` succeeds for an upsert (same `id`, different `yes_price`)
- `INSERT INTO prediction_signals` succeeds and is FK-safe when referencing an existing `prediction_markets` row
- `bun test src/__tests__/163-prediction-schema.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

**TDD test location**: `src/__tests__/163-prediction-schema.test.ts`
- Use `process.env.DB_PATH = ":memory:"` — call `initDatabase()` fresh in `beforeEach`
- Test table existence, column names via `PRAGMA table_info()`, upsert behaviour, and FK constraint on `prediction_signals`

---

#### Task 169 — `mcp.config.json` predictionMarkets section + `config.ts` type extension

**Branch**: `task/169-prediction-config`
**Layer**: infrastructure/config
**Priority**: P0
**Depends on**: TECH-020 ✓
**Estimated effort**: ~1 hour

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/config.ts` — `McpConfig`, `SchedulerConfig` interfaces and `loadConfig()` with `str()` / `num()` / `bool()` helpers; look for the `get(file, path)` pattern used for nested objects (e.g. `alerts.newsMention`)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/mcp.config.json` — existing top-level keys and `scheduler` object to see where to insert new fields
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_020.md` — Section 5 "PredictionMarketsConfig" interface, `loadConfig()` additions block, and "mcp.config.json additions" block (exact JSON to insert)

**Files to modify**:
- MODIFY: `src/infrastructure/config.ts` — add `PredictionMarketsConfig` interface; add `predictionMarkets: PredictionMarketsConfig` field to `McpConfig`; add `predictionMarketPoll: string` field to `SchedulerConfig`; add `boolVal` and `arrVal` helper functions alongside existing `str()` / `num()` helpers; add `predictionMarkets` block to `loadConfig()` using the `get(file, "predictionMarkets")` pattern; add `predictionMarketPoll` to the scheduler sub-object read
- MODIFY: `mcp.config.json` — add `"predictionMarkets"` top-level section with all 10 fields (enabled, pollingIntervalMinutes, volumeSpikeThresholdUsd, probabilityShiftPct, minUniqueWallets, whaleTradeThresholdUsd, maxMarketsPerPoll, rateLimitDelayMs, relevantKeywords array, curatedMarketIds array); add `"predictionMarketPoll": "*/30 * * * *"` inside the existing `"scheduler"` object

**Files to create**:
- No dedicated test file — config correctness is verified by TypeScript compile + the loader reading defaults

**Acceptance Criteria**:

**Given** `mcp.config.json` contains the `predictionMarkets` section
**When** `loadConfig()` is called
**Then**
- `config.predictionMarkets.enabled` is `true`
- `config.predictionMarkets.pollingIntervalMinutes` is `30`
- `config.predictionMarkets.volumeSpikeThresholdUsd` is `50000`
- `config.predictionMarkets.probabilityShiftPct` is `5`
- `config.predictionMarkets.minUniqueWallets` is `10`
- `config.predictionMarkets.maxMarketsPerPoll` is `50` (default; overridable by `Bun.env`)
- `config.predictionMarkets.rateLimitDelayMs` is `500`
- `config.predictionMarkets.relevantKeywords` is a non-empty string array containing at least `"fed"`, `"oil"`, `"vietnam"`
- `config.predictionMarkets.curatedMarketIds` is an empty array `[]`
- `config.scheduler.predictionMarketPoll` equals `"*/30 * * * *"`
- `bun tsc --noEmit` reports 0 errors (all new interface fields are typed correctly)

**Key implementation notes**:
- `boolVal(obj, key, fallback)` — returns `obj[key] === true || obj[key] === "true"` falling back to the provided default
- `arrVal(obj, key, fallback)` — returns `Array.isArray(obj[key]) ? obj[key] as string[] : fallback`
- `DEFAULT_PREDICTION_KEYWORDS` — const string array defined at module level in `config.ts`, mirrors the `relevantKeywords` list from `mcp.config.json`
- Do not break existing `loadConfig()` return shape — all existing fields must remain unchanged

---

#### Task 165 — Prediction cascade mapper (`predictionCascadeMapper.ts`)

**Branch**: `task/165-prediction-cascade-mapper`
**Layer**: domain/services
**Priority**: P0
**Depends on**: TECH-020 ✓
**Estimated effort**: ~1.5 hours

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_020.md` — Section 2 "CascadeMapping and predictionCascadeMapper": `KeywordRule` interface with `keywordGroups: string[][]`, `CascadeMapping` interface, `mapPredictionToCascade()` signature, keyword matching algorithm (AND-across-groups / OR-within-group), 14 built-in rules R01–R14
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/bctc-schema.ts` — `DomainType` union (need `"banking"`, `"manufacturing"`, `"steel"`, `"oil_gas"`, `"tech"`, `"retail"` values)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/cascadeEngine.ts` — reference for how SECTOR_RULES are structured (for style consistency only; do not import)

**Files to create**:
- CREATE: `src/domain/services/predictionCascadeMapper.ts`
- CREATE: `src/__tests__/165-prediction-cascade-mapper.test.ts`

**Acceptance Criteria**:

**Given** the question `"Will the Fed cut rates in June 2026?"`
**When** `mapPredictionToCascade(question, ["VNM","FPT","VCB","VEA"])` is called
**Then**
- `result.matched` is `true`
- `result.domains` contains `"banking"`
- `result.stocks` contains `"VCB"`, `"TCB"`, `"BID"`, `"CTG"`
- `result.direction` is `"bullish"` (R01 matches: "fed" + "cut rates")
- `result.reasoning` is a non-empty string

**Given** the question `"Will China impose new tariffs on US goods in 2026?"`
**When** `mapPredictionToCascade(question, ["VNM","FPT","VCB","VEA"])` is called
**Then**
- `result.matched` is `true`
- `result.domains` contains `"manufacturing"` or `"steel"`
- `result.stocks` contains `"HPG"` and/or `"GAS"`
- `result.direction` is `"bearish"`

**Given** the question `"Will Vietnam's GDP exceed 7% in 2026?"`
**When** `mapPredictionToCascade(question, ["VNM","FPT","VCB","VEA"])` is called
**Then**
- `result.matched` is `true`
- `result.stocks` contains all injected watchlist codes (`"VNM"`, `"FPT"`, `"VCB"`, `"VEA"`) because R06 uses `stocks: []` (all watchlist fallback)
- `result.direction` is `"bullish"`

**Given** the question `"Will Arsenal win the Premier League 2026?"`
**When** `mapPredictionToCascade(question, ["VNM"])` is called
**Then**
- `result.matched` is `false`
- `result.domains` is `[]`
- `result.stocks` is `[]`
- `result.reasoning` equals `"No Vietnam-relevant keywords found"`

**Given** a question matching both R08 (`"war"`) and R07 (`"asean"`)
**When** `mapPredictionToCascade(question, ["VNM","FPT"])` is called
**Then**
- `result.domains` is the union of both rules' domains (deduplicated)
- `result.stocks` includes the injected watchlist codes from both rules (deduplicated)
- `result.direction` is the direction of the first matching rule (R07 or R08 by rule order)

**Given** a `customRules` parameter is passed
**When** `mapPredictionToCascade(question, watchlist, customRules)` is called
**Then** custom rules are evaluated in addition to the 14 built-in rules (custom rules appended, not replacing)

- `bun test src/__tests__/165-prediction-cascade-mapper.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors
- File has zero imports from `infrastructure/` or `application/` layers

**TDD test location**: `src/__tests__/165-prediction-cascade-mapper.test.ts`
- Pure unit tests, no mocks needed
- One describe block per rule group (Fed rules, trade war rules, oil rules, Vietnam/ASEAN rules, geopolitical rules)
- Include a no-match test and a multi-rule union test

**Key implementation notes**:
- `KeywordRule.keywordGroups: string[][]` — AND across groups, OR within each group: `groups.every(group => group.some(kw => q.includes(kw)))`
- Direction: first matching rule wins for `direction`; reasoning: all matching rules' `reasoning` joined with `"; "`
- Stocks from rules with `stocks: []` receive the full `watchlistCodes` array; deduplication via `Set`
- Zero domain imports — only import `DomainType` from `bctc-schema.js`

---

#### Task 164 — Polymarket REST fetcher (`polymarket.ts`)

**Branch**: `task/164-polymarket-fetcher`
**Layer**: infrastructure/fetchers
**Priority**: P0
**Depends on**: 163 ✓ (schema exists for test fixtures), 169 ✓ (`PredictionMarketsConfig` type available)
**Estimated effort**: ~1.5 hours

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_020.md` — Section 1 "PredictionMarket interface + fetchPolymarkets()", implementation notes (two-call sequence, CLOB/Gamma response shapes, enrichment strategy, relevance filter), Polymarket API Research section (exact endpoint URLs, response JSON, key extraction)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/tradingEconomicsStream.ts` — reference for the never-throw, empty-array-on-error pattern
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/config.ts` — `PredictionMarketsConfig` interface (added by task 169)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/predictionSignalDetector.ts` — `PredictionMarket` domain interface (added by task 166 — wait for 166 to merge, OR define the interface here and import it in the domain file; align with TECH-020 DDD Compliance Note)

**Files to create**:
- CREATE: `src/infrastructure/fetchers/polymarket.ts`
- CREATE: `src/__tests__/164-polymarket-fetcher.test.ts`

**Acceptance Criteria**:

**Given** the CLOB API returns a list of markets and Gamma API enriches them
**When** `fetchPolymarkets(config)` is called with valid config
**Then**
- Returns `PredictionMarket[]` (non-empty)
- Each item has `id`, `question`, `endDate`, `yesPrice` (0.0–1.0), `noPrice`, `volume24h`, `volumeTotal`, `liquidity`, `lastTradePrice`, `uniqueWalletsCount`, `tags: string[]`, `fetchedAt`
- `yesPrice` is derived from `tokens[outcome="Yes"].price` (float, not percentage)
- `uniqueWalletsCount` is sourced from Gamma API enrichment (default `0` when Gamma has no match)
- `tags` is normalized to `string[]` (from `{id, label}` objects if Gamma returns that shape)

**Given** a market question does not contain any keyword from `config.relevantKeywords` and its `id` is not in `config.curatedMarketIds`
**When** the relevance filter is applied
**Then** that market is excluded from the returned array

**Given** a market's `id` appears in `config.curatedMarketIds`
**When** the relevance filter is applied
**Then** that market is included regardless of keyword match

**Given** the CLOB API returns an HTTP 500 error
**When** `fetchPolymarkets(config)` is called
**Then**
- Returns `[]` (empty array)
- No exception propagates to the caller
- A `warn`-level log entry is emitted

**Given** the Gamma API is unreachable (timeout)
**When** `fetchPolymarkets(config)` is called
**Then**
- Returns the CLOB-only results (Gamma enrichment degrades gracefully)
- `uniqueWalletsCount` defaults to `0` for all markets
- No exception propagates

- `bun test src/__tests__/164-polymarket-fetcher.test.ts` passes with 0 failures (tests use `fetch` mock — no real network calls)
- `bun tsc --noEmit` reports 0 errors
- File has zero imports from `domain/` or `application/` layers

**TDD test location**: `src/__tests__/164-polymarket-fetcher.test.ts`
- Mock `fetch` globally using `jest.spyOn` / `mock.module` for Bun
- Provide fixture JSON matching the CLOB and Gamma shapes documented in TECH-020
- Test: happy path, CLOB-only (Gamma 500), keyword relevance filter, curated ID override, never-throw guarantee

**Key implementation notes**:
- `PredictionMarket` interface ownership: define in `src/domain/services/predictionSignalDetector.ts` (domain layer) per the DDD Compliance Note in TECH-020; the fetcher imports and returns that domain type
- Two sequential `fetch` calls: CLOB first, then `await new Promise(r => setTimeout(r, config.rateLimitDelayMs))`, then Gamma
- Gamma enrichment: build `Map<string, GammaMarket>` keyed on both `id` and `conditionId` for safe matching
- 15-second `AbortController` timeout per fetch call
- `volume` field in CLOB response is a string — use `parseFloat()`
- `fetchedAt` = `new Date().toISOString()` at call time, same value for all markets in one batch

---

#### Task 166 — Prediction signal detector (`predictionSignalDetector.ts`) + SignalType extension

**Branch**: `task/166-prediction-signal-detector`
**Layer**: domain/services
**Priority**: P0
**Depends on**: 163 ✓ (schema exists so test helpers can use SQLite fixtures), 165 ✓ (`CascadeMapping` types available for reference)
**Estimated effort**: ~2 hours

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_020.md` — Section 3 "PredictionSignal and detectPredictionSignals": full interface definitions (`PredictionMarket`, `PredictionSignal`, `PredictionSignalConfig`, `RecentSentimentEntry`), `detectPredictionSignals()` signature, confidence formula, signal severity mapping table
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_020.md` — Section 4 "SignalType extension": exact one-line union change
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/signalDetector.ts` — current `SignalType` union definition to confirm exact location of the one-line change

**Files to create**:
- CREATE: `src/domain/services/predictionSignalDetector.ts` — defines `PredictionMarket` interface (canonical owner), `PredictionSignal`, `PredictionSignalType`, `PredictionSignalConfig`, `RecentSentimentEntry`, `detectPredictionSignals()`
- CREATE: `src/__tests__/166-prediction-signal-detector.test.ts`

**Files to modify**:
- MODIFY: `src/domain/services/signalDetector.ts` — add `"prediction_market"` to `SignalType` union

**Acceptance Criteria**:

**Given** `current` has a market with `volume24h = 75000` and `config.volumeSpikeThresholdUsd = 50000`
**When** `detectPredictionSignals(current, [], config, new Set(), [])` is called
**Then**
- Returns at least one `PredictionSignal` with `signalType = "volume_spike"`
- Signal `severity` is `"low"` (base severity for volume_spike)
- Signal `confidence` equals `min(1.0, uniqueWalletsCount / 100) * 0.5` (shiftMagnitude = 0, no prev)

**Given** `current` has `yesPrice = 0.72` and `previous` has the same market with `yesPrice = 0.65` and `config.probabilityShiftPct = 5`
**When** `detectPredictionSignals(current, previous, config, new Set(), [])` is called
**Then**
- Returns a `PredictionSignal` with `signalType = "probability_shift"`, `severity = "medium"`
- `yesPricePrev = 0.65`, `yesPriceCurr = 0.72`
- `confidence` computed as `clamp(walletQuality * 0.5 + shiftMagnitude * 0.5, 0.1, 0.95)` where `shiftMagnitude = min(1.0, 0.07 / 0.20) = 0.35`

**Given** a `probability_shift` is detected AND `uniqueWalletsCount` increased by >= 3 AND the market `id` is NOT in `hasRecentNews`
**When** `detectPredictionSignals()` is called
**Then** returns an additional `PredictionSignal` with `signalType = "insider_timing"`, `severity = "high"`

**Given** a market has `yesPrice >= 0.65` (risk event at 65%+) AND `recentSentiments` contains a matching stock with `sentiment = "bullish"` and `confidence >= 0.6`
**When** `detectPredictionSignals()` is called
**Then** returns a `PredictionSignal` with `signalType = "sentiment_divergence"`, `severity = "medium"` or `"high"` based on confidence

**Given** a market has `uniqueWalletsCount = 5` (below `config.minUniqueWallets = 10`) and would otherwise be `"medium"` severity
**When** any signal is detected for this market
**Then** all signals for that market are downgraded to `severity = "low"` (wash trading filter)

**Given** `current` and `previous` have identical prices and `volume24h < volumeSpikeThresholdUsd`
**When** `detectPredictionSignals()` is called
**Then** returns `[]` (no false signals)

**Given** `"prediction_market"` is added to the `SignalType` union in `signalDetector.ts`
**When** `bun tsc --noEmit` is run
**Then** 0 TypeScript errors (no exhaustiveness breakage in downstream files)

- `bun test src/__tests__/166-prediction-signal-detector.test.ts` passes with 0 failures
- File has zero imports from `infrastructure/` or `application/` layers (pure domain)

**TDD test location**: `src/__tests__/166-prediction-signal-detector.test.ts`
- All tests are pure — pass market arrays directly, no DB or HTTP
- One describe block per signal type (volume_spike, probability_shift, insider_timing, sentiment_divergence)
- Include boundary tests: shift exactly at threshold (4.99pp → no signal, 5.00pp → signal), wallet count at boundary (9 → downgraded, 10 → not downgraded)

**Key implementation notes**:
- `PredictionMarket` is defined and exported from this file — the fetcher imports it from here
- `insider_timing` requires THREE conditions simultaneously: probability_shift detected AND wallet count increased AND market NOT in `hasRecentNews`; check previous `uniqueWalletsCount` by looking up the previous snapshot map
- Confidence formula: `walletQuality = min(1.0, uniqueWalletsCount / 100)`, `shiftMagnitude = min(1.0, Math.abs(curr - prev) / 0.20)`, `confidence = Math.max(0.1, Math.min(0.95, walletQuality * 0.5 + shiftMagnitude * 0.5))`
- For `volume_spike` with no previous snapshot, `shiftMagnitude = 0`
- Build a `Map<string, PredictionMarket>` from `previous` array for O(1) lookup

---

#### Task 167 — Prediction market scheduler job + cron wiring

**Branch**: `task/167-prediction-market-job`
**Layer**: scheduler
**Priority**: P0
**Depends on**: 164 ✓ (`fetchPolymarkets` available), 165 ✓ (`mapPredictionToCascade` available), 166 ✓ (`detectPredictionSignals` + `PredictionMarket` type available)
**Estimated effort**: ~2 hours

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_020.md` — Section 7 "predictionMarketJob.ts": `PredictionJobDeps` interface, `runPredictionMarketJob()` signature, 19-step job execution flow, helper functions list, `formatVietnamesePredictionAlert()` format
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/intelligenceCycleJob.ts` — reference for concurrency guard pattern (`_isRunning` flag, `try/finally` release)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/jobs.ts` — `CRONS` constant and `startScheduler()` structure; add `predictionMarketPoll` cron entry and `cron.schedule()` call
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/alertGenerator.ts` — `generateAlerts()` signature
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/alertStore.ts` — `storeAlerts()` signature
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/notifiers/telegram.ts` — `sendTelegramMessage()` signature

**Files to create**:
- CREATE: `src/scheduler/predictionMarketJob.ts`
- CREATE: `src/__tests__/167-prediction-market-job.test.ts`

**Files to modify**:
- MODIFY: `src/scheduler/jobs.ts` — add `import { runPredictionMarketJob } from './predictionMarketJob.js'`; add `predictionMarketPoll: Bun.env.CRON_PREDICTION_MARKET ?? cfg.scheduler.predictionMarketPoll` to `CRONS`; add `cron.schedule(CRONS.predictionMarketPoll, async () => { await runPredictionMarketJob() }, { timezone: 'Asia/Ho_Chi_Minh' })` inside `startScheduler()`

**Acceptance Criteria**:

**Given** `config.predictionMarkets.enabled = false`
**When** `runPredictionMarketJob()` is called
**Then**
- Function returns immediately without calling `fetchPolymarkets`
- A `debug`-level log entry is emitted

**Given** the job is already running (lock set)
**When** `runPredictionMarketJob()` is called again concurrently
**Then**
- Second call returns immediately with a `warn`-level log entry
- Lock is NOT double-set

**Given** `fetchPolymarkets()` returns `[]`
**When** `runPredictionMarketJob()` runs
**Then**
- A `warn`-level log is emitted
- No `storeAlerts()` or `sendTelegramMessage()` calls are made
- Lock is released (`_isRunning = false`) before function returns

**Given** `fetchPolymarkets()` returns 3 markets, one with a `probability_shift` signal, `severity = "high"`, mapped to `VCB`
**When** `runPredictionMarketJob()` runs end-to-end
**Then**
- `upsertMarkets` inserts/replaces those 3 markets in `prediction_markets` table
- `detectPredictionSignals` is called with current + previous markets
- The signal is persisted to `prediction_signals` table
- `generateAlerts()` is called with a `Signal` of `type = "prediction_market"`
- `storeAlerts()` is called with the resulting alert
- `sendTelegramMessage()` is called exactly once with a string containing `"VCB"` and `"QUAN TRONG"` (Vietnamese format for HIGH)

**Given** an alert has `severity = "medium"` (below HIGH threshold)
**When** `runPredictionMarketJob()` runs
**Then** `sendTelegramMessage()` is NOT called

**Given** `runPredictionMarketJob()` throws mid-execution (e.g. DB error)
**When** the error propagates
**Then** `_isRunning` is reset to `false` (finally block)

- `CRONS.predictionMarketPoll` equals `"*/30 * * * *"` after `startScheduler()` reads config
- `bun test src/__tests__/167-prediction-market-job.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

**TDD test location**: `src/__tests__/167-prediction-market-job.test.ts`
- Use `process.env.DB_PATH = ":memory:"` and call `initDatabase()` in `beforeEach`
- Inject all external deps via `PredictionJobDeps`: mock `fetchMarketsFn`, `detectSignalsFn`, `mapCascadeFn`, `sendTelegramFn`
- Test: enabled=false early exit, concurrency lock, empty API response, happy path end-to-end, telegram called only for HIGH+, lock released on error

**Key implementation notes**:
- Module-level `let _isRunning = false` — guard with `if (_isRunning) { logger.warn(...); return; }` at the very start of the try block; release in `finally { _isRunning = false; }`
- `queryRecentNewsMarketIds(db)`: `SELECT source_title, source_url FROM rag_analyses WHERE created_at > datetime('now', '-2 hours')` — build `Set<string>` of market IDs that share >= 2 words with any recent `source_title`
- `queryRecentSentiments(db)`: `SELECT affected_actions, direction, confidence FROM rag_analyses ORDER BY created_at DESC LIMIT 50` — map to `RecentSentimentEntry[]`
- `formatVietnamesePredictionAlert()` format: see TECH-020 "Telegram Alert Format" section — plain text, no Markdown
- `Signal` conversion from `PredictionSignal`: `{ type: "prediction_market", severity: signal.severity, actionCode: stock, message: formatPredictionMessage(...), confidence: signal.confidence, detectedAt: signal.detectedAt }`

---

#### Task 168 — `get_prediction_markets` MCP tool + server.ts + index.ts registration

**Branch**: `task/168-prediction-mcp-tool`
**Layer**: interface/mcp
**Priority**: P1
**Depends on**: 163 ✓ (`prediction_markets` + `prediction_signals` tables exist), 167 ✓ (job populates those tables)
**Estimated effort**: ~1.5 hours

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_020.md` — Section 8 "get_prediction_markets MCP tool": `registerPredictionTools()` signature, Zod input schema, SQL query (JOIN with `prediction_signals`, `signals_only` HAVING clause), output shape matching REQ-020 FR-6
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/summaryTools.ts` — reference for `registerXxxTools(server: McpServer)` pattern
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/index.ts` — existing barrel exports; add `export { registerPredictionTools } from './predictionTools.js'`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/server.ts` — existing `createBunServer()` and tool registration calls; add `registerPredictionTools(server)` alongside other `registerXxx` calls

**Files to create**:
- CREATE: `src/interface/mcp/tools/predictionTools.ts`
- CREATE: `src/__tests__/168-prediction-mcp-tool.test.ts`

**Files to modify**:
- MODIFY: `src/interface/mcp/tools/index.ts` — add barrel export for `registerPredictionTools`
- MODIFY: `src/interface/mcp/server.ts` — call `registerPredictionTools(server)` (tool count 20 → 21)

**Acceptance Criteria**:

**Given** `prediction_markets` table has 3 rows and `prediction_signals` has 2 rows for 2 of those markets (detected within the last hour)
**When** the `get_prediction_markets` MCP tool is called with `{ filter: "all", limit: 20 }`
**Then**
- Returns JSON with `markets` array containing all 3 markets
- Each market object has: `id`, `question`, `yesPrice`, `noPrice`, `volume24h`, `uniqueWalletsCount`, `fetchedAt`, `activeSignals` (array, may be empty), `mappedSectors` (array), `mappedStocks` (array)
- `totalRelevantMarkets` equals `3`
- `lastPollAt` equals the most recent `fetched_at` value
- `signalCount` equals `2`

**Given** `filter = "signals_only"`
**When** the tool is called
**Then**
- `markets` contains only the 2 markets that have active signals (detected within the last hour)
- The third market (no recent signals) is excluded

**Given** `limit = 2`
**When** the tool is called with `filter = "all"`
**Then** `markets` contains at most 2 items

**Given** both `prediction_markets` and `prediction_signals` tables are empty
**When** the tool is called
**Then**
- Returns `{ markets: [], totalRelevantMarkets: 0, lastPollAt: null, signalCount: 0 }`
- No exception is thrown

**Given** `registerPredictionTools(server)` is called in `server.ts`
**When** the MCP server initialises
**Then** total registered tool count is 21 (was 20 before this task)

- `bun test src/__tests__/168-prediction-mcp-tool.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

**TDD test location**: `src/__tests__/168-prediction-mcp-tool.test.ts`
- Use `process.env.DB_PATH = ":memory:"`, call `initDatabase()` in `beforeEach`, seed fixture rows directly
- Test: empty DB, all-markets filter, signals-only filter, limit parameter, active-signals aggregation from GROUP_CONCAT

**Key implementation notes**:
- SQL query: `SELECT pm.*, GROUP_CONCAT(ps.signal_type) as active_signal_types, GROUP_CONCAT(ps.mapped_stocks) as all_mapped_stocks, GROUP_CONCAT(ps.mapped_sectors) as all_mapped_sectors FROM prediction_markets pm LEFT JOIN prediction_signals ps ON ps.market_id = pm.id AND ps.detected_at >= datetime('now', '-1 hour') GROUP BY pm.id ORDER BY pm.fetched_at DESC LIMIT ?`
- For `signals_only`: append `HAVING active_signal_types IS NOT NULL`
- Parse `GROUP_CONCAT` results: split on `,`, flatten, deduplicate via `[...new Set()]`
- `tags` is stored as JSON string in SQLite — parse with `JSON.parse(row.tags)`
- Tool description string: `"Returns current Polymarket prediction markets relevant to Vietnamese stocks, with detected probability shift and volume spike signals."`

---

### Sprint 019 — Know What You're Watching

> Sprint 019 ACTIVE — started 2026-04-01. Task 160 Review.
> Design refs: docs/REQ_019.md (BA) + docs/TECH_019.md (Architect — approved).
> Dependency order: 160 first → 161 depends on 160 → 162 can run in parallel with 161 after 160 merges.

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| REQ-019 | BA: Requirement Spec for Sprint 019 | `task/doc-001-claude-md-update` | BA | docs/ | P0 | — | Done — docs/REQ_019.md |
| TECH-019 | Architect: Technical Design for Sprint 019 | `task/doc-001-claude-md-update` | Architect | docs/ | P0 | REQ-019 | Done — docs/TECH_019.md |
| 160 | Company name alias dictionary (`stockAliases.ts`) | `task/160-stock-aliases` | Developer | domain/services | P0 | TECH-019 | Done — merged 2026-04-01 |
| 161 | Wire aliases into cascade engine + pollNews Gate 3 | `task/161-alias-wiring` | Developer | domain/services + application/usecases | P0 | 160 ✓ | **Review** |
| 162 | Market-wide pattern cascade to all watchlist stocks | `task/162-market-wide-broadcast` | Developer | domain/services + application/usecases + mcp.config.json | P1 | 160 ✓ | **Review** |

---

#### Task 157 — Data audit engine

**Branch**: `task/157-data-audit-engine`
**Layer**: scheduler + infrastructure/db + infrastructure/rag
**Priority**: P0
**Depends on**: TECH-018 ✓ (approved 2026-04-01)
**Estimated effort**: ~2 hours (implement checks in catalogue order D-1 → D-10 then W-1 → W-7; write a matching test for each AC before moving on)

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_018.md` — full design: interface contracts, DDL blocks, check catalogues, risk notes
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/REQ_018.md` — AC-1 through AC-12, FR-4 through FR-11 check tables
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts` — existing `initDatabase()` + ALTER TABLE pattern to copy for `market_prices_history`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/rag/vectorstore.ts` — existing exports; add `getCount()` here
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/notifiers/telegram.ts` — `sendTelegramMessage` signature
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts` — `getDb()` import pattern
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/intelligenceCycleJob.ts` — reference for scheduler-layer module structure
- `/Users/admin/Documents/Hung/__works__/__PROJETO/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/feedbackTools.ts` — `agent_feedback` INSERT pattern (for reference only — do NOT import from here)

**Files to create**:
- CREATE: `src/scheduler/dataAuditJob.ts`
- CREATE: `src/__tests__/157-data-audit-job.test.ts`

**Files to modify**:
- MODIFY: `src/infrastructure/db/schema.ts` — add `market_prices_history` canonical DDL block (after `sbv_rates_history`, before `market_summaries`) + `exchange` column ALTER TABLE migration (try/catch pattern)
- MODIFY: `src/infrastructure/rag/vectorstore.ts` — add `export async function getCount(): Promise<number>` (uses `(await getTable()).countRows()`, wraps in try/catch, returns 0 on any error)

**Acceptance Criteria**:

**Given** a `market_prices` row with `price = 0` exists (AC-1)
**When** `runDailyAudit()` is called
**Then**
- The zero-price row is deleted from `market_prices`
- Returned array contains a finding with `table = "market_prices"`, `check = "zero_price_rows"`, `action = "auto_cleaned"`, `rowsAffected >= 1`
- A `system_logs` row with `source = "data-auditor"` is inserted

**Given** an alert with `read = 0` and `triggered_at = 35 days ago` exists (AC-2)
**When** `runDailyAudit()` is called
**Then**
- The alert's `read` column is updated to `1`
- A finding with `check = "stale_unread_alerts"`, `action = "auto_cleaned"` is returned

**Given** an `agent_feedback` row with `status = 'new'`, `priority = 'medium'`, `created_at = 15 days ago` (AC-3)
**When** `runDailyAudit()` is called
**Then**
- The row's `priority` is updated to `'high'`
- A finding with `check = "stale_new_feedback"`, `action = "escalated"` is returned
- A new `agent_feedback` row with `agent = 'data-auditor'`, title containing `"stale_new_feedback"` is inserted

**Given** a `tracked_indicators` row with `indicator = 'brent_crude_usd'`, `value = 5.0` (AC-4)
**When** `runWeeklyAudit()` is called
**Then**
- An `agent_feedback` row is inserted with `agent = 'data-auditor'`, `category = 'data_extraction_error'`, `priority = 'critical'`
- Finding has `severity = "critical"`, `check = "outlier_indicator_values"`
- Original `tracked_indicators` row is NOT deleted

**Given** `commodity_prices_history` rows with `fetched_at = 200 days ago` exist (AC-5)
**When** `runWeeklyAudit()` is called
**Then**
- Those rows are deleted
- Finding with `check = "old_commodity_history"`, `action = "auto_cleaned"`, `rowsAffected >= 1`

**Given** all tables are clean and `telegram.enabled = true` (AC-6)
**When** `runDailyAudit()` is called
**Then**
- No Telegram message is sent
- Function still returns non-empty `AuditFinding[]` (row count snapshots from D-10)

**Given** at least one finding with `rowsAffected > 0` and `telegram.enabled = true` (AC-7)
**When** `runDailyAudit()` or `runWeeklyAudit()` completes
**Then**
- Exactly one Telegram message is sent
- Message contains "Cleaned:", "Flagged:", and "Feedback queue:" lines

**Given** `vectorstore.getCount()` throws (LanceDB unavailable) (AC-8)
**When** `runWeeklyAudit()` is called
**Then**
- Audit run completes without throwing
- Finding with `check = "lancedb_rag_count_drift"`, `severity = "warning"`, `action = "none"` is returned
- Error message is in `detail`

**Given** `runDailyAudit()` is called twice on the same calendar day with the same findings (AC-11)
**When** the second run completes
**Then**
- No additional `agent_feedback` rows with `agent = 'data-auditor'` and same title are inserted

**All checks**: `bun test src/__tests__/157-data-audit-job.test.ts` passes with 0 failures (AC-12)
**TypeScript**: `bun tsc --noEmit` reports 0 errors

**TDD test location**: `src/__tests__/157-data-audit-job.test.ts`
- Use `process.env.DB_PATH = ":memory:"` for in-process SQLite
- Mock `sendTelegramMessage` to capture calls without network I/O
- Write one `describe` block per AC, implement tests in order AC-1 → AC-12 before moving to the next

**Key implementation notes**:
- `dataAuditJob.ts` lives in `src/scheduler/` — imports `getDb()`, `sendTelegramMessage`, and `getCount()` only; never imports from `application/` or `interface/`
- Call `ensureAuditDependencies(db)` at the top of both exported functions (creates `audit_state` and `agent_feedback` tables using `CREATE TABLE IF NOT EXISTS`)
- `runWeeklyAudit()` calls `runDailyAudit()` internally and merges the findings array before running W-1 → W-7
- Every check is wrapped in its own `try/catch` — a failing check logs to `system_logs` and continues; the audit run never aborts
- Dedup guard before every `agent_feedback` insert: `SELECT COUNT(*) FROM agent_feedback WHERE agent = 'data-auditor' AND title = ? AND created_at >= date('now')` — skip if > 0
- `getCount()` in `vectorstore.ts`: call `(await getTable()).countRows()`, wrap in `try/catch`, return `0` on any error
- `market_prices_history` DDL in `schema.ts`: insert after the `sbv_rates_history` block, before `market_summaries`, using the exact DDL from TECH_018.md (CREATE TABLE IF NOT EXISTS + idx + try/catch ALTER TABLE for `exchange` column)
- Timestamp display in Telegram: GMT+7 via `new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') + ' GMT+7'`
- W-3 duplicate dedup uses `MAX(rowid)` per `(code, DATE(fetched_at))` — see exact SQL in REQ_018.md FR-5
- W-6 orphan check uses `json_each(analysis_ids_json)` — guard with `WHERE analysis_ids_json IS NOT NULL AND analysis_ids_json != '[]'`

---

#### Task 158 — Scheduler wiring for audit crons

**Branch**: `task/158-audit-scheduler-wiring`
**Layer**: scheduler
**Priority**: P1
**Depends on**: 157 (exported `runDailyAudit` and `runWeeklyAudit` API must be stable)
**Status**: Backlog — move to Todo when task 157 reaches Review

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/jobs.ts` — existing `CRONS` constant and `startScheduler()` structure
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/dataAuditJob.ts` — (created by task 157) confirm exported function names

**Files to modify**:
- MODIFY: `src/scheduler/jobs.ts` — append `dataAuditDaily` and `dataAuditWeekly` to the `CRONS` constant; add two `cron.schedule(...)` calls inside `startScheduler()` after `registerSummaryJobs()`; add `import { runDailyAudit, runWeeklyAudit } from './dataAuditJob.js'`

**Acceptance Criteria**:

**Given** `startScheduler()` is called (AC-10)
**When** the scheduler initialises
**Then**
- `CRONS.dataAuditDaily` equals `'0 23 * * *'` (or `Bun.env.CRON_DATA_AUDIT_DAILY` if set)
- `CRONS.dataAuditWeekly` equals `'0 1 * * 0'` (or `Bun.env.CRON_DATA_AUDIT_WEEKLY` if set)
- Both cron entries are registered with `timezone: 'Asia/Ho_Chi_Minh'`
- `Object.keys(CRONS).length` increases from 6 to 8 — the log line at the end of `startScheduler()` automatically prints the correct count (no hardcoded `8`)
- `bun tsc --noEmit` reports 0 errors

**Key implementation notes**:
- Registration must come after the existing `registerSummaryJobs()` call
- The log line at the end of `startScheduler()` uses `Object.keys(CRONS).length` — no hardcoded count to update
- Both crons use `async () => { await runDailyAudit() }` / `async () => { await runWeeklyAudit() }` wrappers (same pattern as other jobs)
- No test file needed for this task — AC-10 is verified by reading `CRONS` keys and checking the cron registration call (TypeScript compile check is sufficient; runtime cron trigger is tested via task 157 unit tests)

---

#### Task 159 — `get_system_health` db_audit section

**Branch**: `task/159-health-db-audit`
**Layer**: interface/mcp/tools + infrastructure/db
**Priority**: P2
**Depends on**: 157 (needs `audit_state` table schema + `agent_feedback` table to exist)
**Status**: Backlog — move to Todo when task 157 reaches Review

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/systemTools.ts` — existing `get_system_health` tool, find the `--- Alert Stats ---` section and the lines just after it
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/dataAuditJob.ts` — (created by task 157) `audit_state` table schema (column names: `last_daily_audit_at`, `last_weekly_audit_at`)

**Files to modify**:
- MODIFY: `src/interface/mcp/tools/systemTools.ts` — insert the `--- DB Audit ---` section after the `--- Alert Stats ---` section and before the `--- Summary ---` section

**Acceptance Criteria**:

**Given** at least one daily audit has run (task 157 has executed) (AC-9)
**When** the `get_system_health` MCP tool is called
**Then**
- The response text contains a `--- DB Audit ---` section
- `last_daily_audit` shows a valid ISO timestamp (not "never")
- `last_weekly_audit` shows an ISO timestamp or "never"
- `pending_feedback` shows current live count from `agent_feedback WHERE status = 'new'`
- `open_warnings` shows current live count from `agent_feedback WHERE status = 'new' AND priority IN ('high', 'critical')`

**Given** the `audit_state` table does not yet exist (first startup before any audit has run)
**When** `get_system_health` is called
**Then**
- The `--- DB Audit ---` section still renders
- All timestamps show `"never"`, counts show `0`
- No exception is thrown (wrapped in try/catch)

**TypeScript**: `bun tsc --noEmit` reports 0 errors

**Key implementation notes**:
- Use the exact code block from TECH_018.md "get_system_health db_audit section addition"
- Insert after `--- Alert Stats ---` section, before `--- Summary ---` section
- `pending_feedback` and `open_warnings` are always live queries against `agent_feedback` (not read from cached `audit_state`)
- Full try/catch: if `audit_state` table is missing, emit `"(audit_state table not yet created — no audit has run)"` and push empty line
- No new MCP tool signature change — this is a pure text-output extension of the existing tool

---

### Sprint 017 — Production Hardening

> Sprint 017 ACTIVE — 2026-03-30. PO sign-off: 2026-03-30.
> Dependency order: 152 + 153 + 154 + 155 can start in parallel → 156 unblocks after 152 + 153.

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| 152 | News-mention alert noise filter | `task/152-news-alert-filter` | BA → Developer | domain/services + mcp.config.json | P0 | — | Review |
| 153 | SSC scan deduplication (skip already-processed docs) | `task/153-ssc-scan-dedup` | BA → Developer | infrastructure/db + application/usecases | P0 | — | Backlog |
| 154 | Silence LanceDB TRACE logging | `task/154-lancedb-log-silence` | BA → Developer | infrastructure (index.ts + logger) | P1 | — | Backlog |
| 155 | Log file rotation (size-based, 3 rolling files) | `task/155-log-rotation` | BA → Developer | infrastructure/logger | P1 | — | Backlog |
| 156 | Off-hours cycle interval increase (15 min → 60 min) | `task/156-offhours-interval` | BA → Developer | scheduler/intelligenceCycleJob | P2 | 152, 153 | Backlog |

---

### Sprint 016 — The Analyst's Dashboard

> Sprint 016 COMPLETE — all 5 tasks done. PO sign-off: 2026-03-30.
> Tasks 147, 148, 149, 150, 151 — all merged. Sprint 017 is now ACTIVE.

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| 147 | Morning briefing Telegram delivery | `task/147-briefing-telegram` | BA → Developer | scheduler + infrastructure/notifiers + infrastructure/db | P0 | — | Done |
| 148 | Alert resolution lifecycle + resolve_alert MCP tool | `task/148-alert-resolution` | BA → Developer | infrastructure/db + interface/mcp/tools | P0 | — | Done |
| 149 | get_portfolio_conviction MCP tool | `task/149-portfolio-conviction` | BA → Developer | interface/mcp/tools + infrastructure/db | P1 | 148 | Done |
| 150 | Conviction score history (conviction_history table) | `task/150-conviction-history` | BA → Developer | infrastructure/db + domain/services + interface/mcp/tools | P1 | 149 | Done |
| 151 | Sigma data sufficiency health check | `task/151-sigma-readiness` | BA → Developer | interface/mcp/tools + application/usecases | P2 | — | Done |

---

### Sprint 015 — Know Before the Market Does

> Sprint 015 COMPLETE — all 5 tasks done. PO sign-off: 2026-03-30.
> Tasks 142, 143, 144, 145, 146 — all merged. Sprint 016 is now ACTIVE.

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| 142 | Cross-signal conviction scorer | `task/142-conviction-scorer` | BA → Architect → Developer | domain/services + infrastructure/db | P0 | — | Done |
| 143 | Sector peer wiring into Telegram alert body | `task/143-sector-peer-alerts` | BA → Developer | domain/services + infrastructure | P1 | 142 | Done |
| 144 | Historical parallel in Telegram alert body | `task/144-historical-parallel-alert` | BA → Developer | application/usecases + infrastructure | P1 | — | Done |
| 145 | Morning briefing upgrade — conviction + unresolved alerts | `task/145-briefing-upgrade` | BA → Developer | application/usecases + scheduler | P2 | 142 | Done |
| 146 | Proactive weekly pattern watch (Sunday 22:30 Telegram) | `task/146-weekly-pattern-watch` | BA → Developer | scheduler + infrastructure/notifiers | P3 | 144 | Done |

---

### Sprint 014 — Alert Pipeline Fix, VN-Index Feed, WAL Checkpoint, Circuit Breaker, System Health

> Sprint 014 COMPLETE — all 6 tasks done. REQ_014.md approved. TECH_014.md approved by Architect 2026-03-29.
> Tasks 137, 138, 139, 140, 136, 141 — all merged. Sprint 015 is now ACTIVE.

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| 137 | Fix alert pipeline — read DB alerts in Step E of intelligence cycle | `task/137-fix-alert-pipeline` | Developer | interface/scheduler + infrastructure/db | P0 | — | Done |
| 138 | Fix impact chain — replace Step D placeholder with real runImpactChain call | `task/138-fix-impact-chain` | Developer | application + interface/scheduler | P0 | — | Done |
| 139 | VN-Index live feed via CafeF index endpoint | `task/139-vnindex-cafef` | Developer | infrastructure/fetchers | P1 | — | Done |
| 140 | SQLite WAL checkpoint — daily cron + SIGTERM hook | `task/140-wal-checkpoint` | Developer | infrastructure/db + scheduler | P2 | — | Done |
| 136 | Wire circuit breaker into hose.ts + ssc.ts fetchers | `task/136-circuit-breaker` | Developer | infrastructure/fetchers | P3 | — | Done |
| 141 | Enhance get_system_health — WAL size, alert stats, last cycle result | `task/141-system-health-tool` | Developer | interface/mcp | P4 | 136 ✓ | Done |

---

#### Task 137 — Fix alert pipeline (Step E read from DB + `notified_telegram` migration)

**Branch**: `task/137-fix-alert-pipeline`
**Layer**: infrastructure/db + interface/scheduler
**Priority**: P0 — production is deaf without this fix
**Depends on**: none

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/intelligenceCycleJob.ts` (lines 290–310 — current Step E bug)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/alertStore.ts` (existing `storeAlerts`)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts` (existing `initDatabase`, find `ALTER TABLE` block for task 132)

**Files to create**:
- none

**Files to modify**:
- MODIFY: `src/infrastructure/db/schema.ts` — add `ALTER TABLE alerts ADD COLUMN notified_telegram INTEGER NOT NULL DEFAULT 0` (try/catch) + `CREATE INDEX IF NOT EXISTS idx_alerts_notified ON alerts(notified_telegram, severity)` after the task 132 block
- MODIFY: `src/infrastructure/db/alertStore.ts` — add `markAlertNotified(id, db)` and `readUnnotifiedAlerts(windowMs, db)` functions after `storeAlerts`
- MODIFY: `src/scheduler/intelligenceCycleJob.ts` — (1) add `readUnnotifiedAlertsFn?: (windowMs: number) => Promise<Alert[]>` to `CycleDeps`, (2) add `defaultReadUnnotifiedAlerts()` above `_runCycle`, (3) replace the hardcoded `const alerts: Alert[] = []` in Step E with a real DB query + per-alert Telegram send + `markAlertNotified` update

**Test file**: `src/__tests__/137-fix-alert-pipeline.test.ts`

**Acceptance Criteria**:

**Given** the `alerts` table contains two rows with `severity = 'high'`, `notified_telegram = 0`, and `triggered_at = now - 5 minutes`
**When** `runIntelligenceCycle()` is called with a mocked `sendAlertsFn` that counts invocations and `isMarketHoursFn` returning `true`
**Then**
- `telegramAlertsSent === 2`
- The mocked `sendAlertsFn` receives exactly those two `Alert` objects
- Both `alerts` rows have `notified_telegram = 1` after the call
- A second call to `runIntelligenceCycle()` sends 0 alerts (idempotency)
- When `sendAlertsFn` returns `0` (Telegram not configured), alert rows still have `notified_telegram = 0` (retry on next cycle)
- `bun test src/__tests__/137-fix-alert-pipeline.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

**Key implementation notes**:
- Step E window is hardcoded `WINDOW_MS = 16 * 60 * 1000` in default; injectable via `CycleDeps.readUnnotifiedAlertsFn` for tests
- `markAlertNotified` is called only after a successful Telegram send (return value `true`); a failed send leaves the flag at 0
- `ALTER TABLE` try/catch must swallow the error silently when the column already exists (second server start)
- SQLite window expression uses `'-' || ? || ' minutes'` pattern (safe — `windowMinutes` is a `Math.round()` result, not user input)
- Critical alerts are never suppressed by existing cooldown rules (`alertQuality.neverSuppressSeverity = ["critical"]` is preserved)

---

#### Task 138 — Fix impact chain (Step D real runImpactChain + `insertedIds` plumbing)

**Branch**: `task/138-fix-impact-chain`
**Layer**: application + interface/scheduler
**Priority**: P0 — `impactEventsRan` is always 0 without this fix
**Depends on**: none (touches different lines of `intelligenceCycleJob.ts` than 137)

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/intelligenceCycleJob.ts` (lines 150–165 — `defaultRunImpactChain` placeholder; line 282 — call site)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/pollNews.ts` (current `PollNewsResult` type + `tryInsertEntry` loop)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/runImpactChain.ts` (signature to call correctly)

**Files to create**:
- none

**Files to modify**:
- MODIFY: `src/application/usecases/pollNews.ts` — add `insertedIds: string[]` field to `PollNewsResult` interface; populate it inside the `tryInsertEntry` loop whenever `tryInsertEntry()` returns `true`
- MODIFY: `src/scheduler/intelligenceCycleJob.ts` — (1) update `CycleDeps.runImpactChainFn` signature to `(insertedIds: string[]) => Promise<number>`, (2) capture `insertedIds` from Step A result, (3) replace `defaultRunImpactChain` stub with a real implementation that loads watchlist from SQLite, reads each `rag_analyses` row by ID, calls `runImpactChain`, counts successful calls, and isolates per-entry errors

**Test file**: `src/__tests__/138-fix-impact-chain.test.ts`

**Acceptance Criteria**:

**Given** `pollNewsFn` returns `PollNewsResult` with `insertedIds = ["id-1", "id-2"]` and two matching rows in `rag_analyses`
**When** `runIntelligenceCycle()` runs with `isMarketHoursFn = () => true`
**Then**
- `impactEventsRan === 2` (one call per inserted ID)
- `PollNewsResult` type includes `insertedIds: string[]`
- `pollNews()` in a test with 3 newly inserted entries populates `insertedIds` with 3 IDs
- When `runImpactChain` throws on the second ID: `impactEventsRan === 1`; error is logged but does not propagate
- When `insertedIds` is empty: `impactEventsRan === 0`; no DB queries are made
- `bun test src/__tests__/138-fix-impact-chain.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

**Key implementation notes**:
- `defaultRunImpactChain(ids)` must be error-isolated per entry (one failure does not abort the rest)
- The injectable `CycleDeps.runImpactChainFn` signature change is backward-compatible (optional field)
- `PollNewsResult.insertedIds` is additive — existing callers that do not read it are unaffected
- Empty `insertedIds` short-circuits immediately with `return 0`, no watchlist DB query

---

#### Task 139 — VN-Index live feed via CafeF index endpoint

**Branch**: `task/139-vnindex-cafef`
**Layer**: infrastructure/fetchers
**Priority**: P1 — geo-blocked VnDirect means VNINDEX is always N/A
**Depends on**: none

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/hose.ts` (full file — find existing `CafefStockRecord` shape, `fetchFromCafef`, and `fetchHosePrices` routing logic)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/marketTools.ts` (lines ~140–200 — how `fetchHosePrices(["VNINDEX"])` and `storeMarketPrices` are already called)

**Files to create**:
- none

**Files to modify**:
- MODIFY: `src/infrastructure/fetchers/hose.ts` — (1) add `VnIndexSnapshot` interface export, (2) add `fetchVnIndex()` function that GETs `https://banggia.cafef.vn/stockhandler.ashx?index=0`, finds the `a === "VNINDEX"` record, computes `changePct`, returns `VnIndexSnapshot`, (3) add routing branch in `fetchHosePrices`: if the only requested code is `"VNINDEX"`, call `fetchVnIndex()` and return a `MarketPrice[]` with one element (`exchange = "INDEX"`, `price = snapshot.value`, no ×1000 conversion)

**Test file**: `src/__tests__/139-vnindex-cafef.test.ts`

**Acceptance Criteria**:

**Given** a mocked CafeF response: `[{"a":"VNINDEX","b":1240.5,"l":1247.35,"k":6.85,"totalvolume":350000000}]`
**When** `fetchVnIndex()` is called with the mock
**Then**
- Returns `VnIndexSnapshot` with `value === 1247.35`, `previousValue === 1240.5`, `changePct ≈ 0.55`, `code === "VNINDEX"`
- No ×1000 multiplication is applied (value is stored as-is: `1247.35`)
- `fetchHosePrices(["VNINDEX"])` returns `MarketPrice[]` with `price === 1247.35`
- After `storeMarketPrices()`, `market_prices` has a row with `code = "VNINDEX"` and `price = 1247.35`
- `get_market_snapshot` renders `VN-Index: 1,247.35  +0.55%` (not `N/A`)
- When the CafeF response is empty or lacks `a === "VNINDEX"`: `fetchVnIndex()` returns `null` / `fetchHosePrices(["VNINDEX"])` returns `[]`; a WARN is logged; no exception thrown
- Timeout: 10 seconds (same as existing `fetchFromCafef`)
- `bun test src/__tests__/139-vnindex-cafef.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

**Key implementation notes**:
- CafeF index values are floating-point points (e.g. `1247.35`), NOT multiplied by 1000 — the ×1000 multiplier only applies to stock prices in `fetchFromCafef`
- The `VnIndexSnapshot` interface must be exported from `hose.ts` for use by `systemTools.ts` (task 141)
- `marketTools.ts` requires no changes — the existing code at line ~188 already handles `code === "VNINDEX"` in the stored `market_prices` row
- Endpoint: `https://banggia.cafef.vn/stockhandler.ashx?index=0`

---

#### Task 140 — SQLite WAL checkpoint (daily cron at 03:00 GMT+7 + SIGTERM/SIGINT hook)

**Branch**: `task/140-wal-checkpoint`
**Layer**: infrastructure/db + scheduler + interface
**Priority**: P2 — WAL file is 2.5x main DB size
**Depends on**: none

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts` (find `getDb()` and confirm `journal_mode = WAL` pragma location)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/jobs.ts` (find `startScheduler` and how existing cron jobs are registered)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/index.ts` (find existing shutdown handling and server bootstrap)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/mcp.config.json` (find `scheduler` section to add `walCheckpoint` cron key)

**Files to create**:
- CREATE: `src/infrastructure/db/checkpoint.ts` — export `runWalCheckpoint(db?: Database): void` that calls `db.pragma('wal_checkpoint(PASSIVE)')` then `db.pragma('optimize')` then logs at INFO level
- CREATE: `src/scheduler/walCheckpointJob.ts` — import `runWalCheckpoint`, export `runWalCheckpointJob()` function

**Files to modify**:
- MODIFY: `mcp.config.json` — add `"walCheckpoint": "0 20 * * *"` to the `scheduler` section (= 03:00 GMT+7 expressed as UTC)
- MODIFY: `src/scheduler/jobs.ts` — import `walCheckpointJob` and register it with the cron expression from config
- MODIFY: `src/index.ts` — call `runWalCheckpoint()` inside the existing `shutdown()` function (before `process.exit(0)`), covering both SIGTERM and SIGINT paths

**Test file**: `src/__tests__/140-wal-checkpoint.test.ts`

**Acceptance Criteria**:

**Given** `runWalCheckpoint()` is called with a real SQLite database (WAL mode, at least 100 writes)
**When** the function returns
**Then**
- The WAL file size drops to near-zero bytes
- A log line at INFO level containing `WAL checkpoint + optimize complete` is emitted
- `bun test` full suite passes (tests use `:memory:` DBs — no side effects on test DBs)

**Given** the server is running with a live WAL
**When** SIGTERM is sent
**Then**
- `runWalCheckpoint()` is called before `process.exit(0)`
- The process exits with code 0

**Key implementation notes**:
- Use `PASSIVE` mode only — `PASSIVE` does not block readers/writers. Never use `FULL` or `RESTART` mode
- The default `db` parameter resolves via `getDb()` (singleton) if no explicit DB is passed
- The cron expression `"0 20 * * *"` = 20:00 UTC = 03:00 next day GMT+7

---

#### Task 136 — Wire circuit breaker into hose.ts + ssc.ts (WIRING TASK — class already exists)

**Branch**: `task/136-circuit-breaker`
**Layer**: infrastructure/fetchers
**Priority**: P3 — VnDirect geo-block stalls the full cycle for 30-50s
**Depends on**: none
**Architect note**: `src/infrastructure/circuitBreaker.ts` and `src/infrastructure/circuitBreakerRegistry.ts` ALREADY EXIST with singletons `breakers.cafef`, `breakers.hose`, `breakers.ssc` and `getAllBreakerStats()`. This task ONLY wires the existing singletons into the fetchers. The error class is `CircuitOpenError` (not `CircuitBreakerOpenError`). State strings are lowercase: `"closed"/"open"/"half-open"`.

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/circuitBreaker.ts` (full API: `execute()`, `getState()`, `getStats()`, `CircuitOpenError`)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/circuitBreakerRegistry.ts` (singleton exports: `breakers.hose`, `breakers.cafef`, `breakers.ssc`, `getAllBreakerStats()`)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/hose.ts` (find VnDirect HTTP call + CafeF fallback — wrap both with breakers)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/fetchers/ssc.ts` (find Puppeteer `defaultBrowserFactory` or equivalent — wrap with `breakers.ssc.execute()`)

**Files to create**:
- none (class and registry already exist)

**Files to modify**:
- MODIFY: `src/infrastructure/fetchers/hose.ts` — wrap the VnDirect HTTP call with `breakers.hose.execute()` and the CafeF fallback `fetchFromCafef` call with `breakers.cafef.execute()`; catch `CircuitOpenError`, log WARN, return `[]`
- MODIFY: `src/infrastructure/fetchers/ssc.ts` — wrap the Puppeteer browser launch (`defaultBrowserFactory`) with `breakers.ssc.execute()`; catch `CircuitOpenError`, log WARN, return safe default

**Test file**: `src/__tests__/136-circuit-breaker.test.ts`

**Acceptance Criteria**:

**Given** `CircuitBreaker` configured with `failureThreshold: 5, resetTimeoutMs: 1000`
**When** `execute()` is called 5 times with a function that always throws
**Then**
- After 5 failures: `getState() === 'open'` (lowercase, as per existing implementation)
- The 6th `execute()` throws `CircuitOpenError` immediately (no `fn` invoked)
- After 1001ms: `getState() === 'half-open'`
- A probe call that succeeds transitions state to `'closed'`

**Given** `breakers.hose` is in `'open'` state
**When** `fetchHosePrices(["VCB"])` is called
**Then**
- Returns `[]` immediately (no HTTP call made)
- A WARN log entry is emitted referencing the breaker name
- `CycleResult.pricesFetched === 0`

**Key implementation notes**:
- The existing exponential backoff in `hose.ts` (`_consecutiveFailures`, `_backoffUntil`) is RETAINED alongside the circuit breaker — they are complementary
- When `breakers.hose` is open, catch `CircuitOpenError` and return `[]` — never rethrow
- When `breakers.ssc` is open, catch `CircuitOpenError` and return the safe default (empty document list)
- State strings in the existing implementation are lowercase: `"closed"/"open"/"half-open"` — do not change them
- `getAllBreakerStats()` from the registry is what task 141 will use — do not remove or rename it

---

#### Task 141 — Enhance `get_system_health` with WAL size, alert stats, last cycle result (ENHANCEMENT TASK — tool already exists)

**Branch**: `task/141-system-health-tool`
**Layer**: interface/mcp + interface/scheduler
**Priority**: P4 — observability
**Depends on**: 136 (needs `getAllBreakerStats()` wired into fetchers first)
**Architect note**: `src/interface/mcp/tools/systemTools.ts` ALREADY EXISTS and already registers `get_system_health`, `get_global_log`, `get_tool_log`, `get_error_summary`. Task 141 ENHANCES `get_system_health` only — it adds new fields to the response; it does NOT register a new tool. The server already has this tool registered. Tool count stays at 21+ (no increment needed).

**Files to read first**:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/systemTools.ts` (full file — find current `get_system_health` response shape)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/circuitBreakerRegistry.ts` (confirm `getAllBreakerStats()` export shape)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/intelligenceCycleJob.ts` (find `CycleResult` type; identify where to add `getLastCycleResult()` export)
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/config.ts` (find DB_PATH and LanceDB path config keys)

**Files to create**:
- none

**Files to modify**:
- MODIFY: `src/scheduler/intelligenceCycleJob.ts` — add module-level `let _lastCycleResult: CycleResult | null = null`; set it at the end of `_runCycle`; export `getLastCycleResult(): CycleResult | null`
- MODIFY: `src/interface/mcp/tools/systemTools.ts` — extend `get_system_health` response to include: `walSizeBytes` (`fs.statSync(DB_PATH + '-wal').size`, 0 if absent), `lancedbSizeBytes` (recursive dir sum, 0 if absent), `lastTelegramSentAt` (query `MAX(triggered_at) WHERE notified_telegram=1`), `circuitBreakers` (from `getAllBreakerStats()`), `alertStats` (`totalLast24h`, `highCriticalLast24h`, `unnotified` counts from SQLite), `lastCycleResult` (from `getLastCycleResult()`)

**Test file**: `src/__tests__/141-system-health-tool.test.ts`

**Acceptance Criteria**:

**Given** the server has completed at least one cycle and sent at least one Telegram alert
**When** `get_system_health` MCP tool is called
**Then**
- Response JSON contains keys: `uptimeSeconds`, `dbSizeBytes`, `walSizeBytes`, `lancedbSizeBytes`, `lastTelegramSentAt`, `circuitBreakers`, `alertStats`, `lastCycleResult`
- `circuitBreakers` has entries for `hose`, `cafef`, `ssc` (keyed by breaker name from registry)
- `uptimeSeconds > 0`
- All values are non-null

**Given** a fresh server with no completed cycles and no WAL file
**When** `get_system_health` is called
**Then**
- `lastCycleResult === null`
- `walSizeBytes === 0`
- `lancedbSizeBytes === 0`
- No exception is thrown; all numeric fields return 0

**Key implementation notes**:
- File size operations use `fs.statSync` (sync); wrap in try/catch; return 0 if file/dir absent — never throw
- LanceDB directory size: sum of all file sizes under the LanceDB path via recursive walk
- `getLastCycleResult()` import from `intelligenceCycleJob.ts` must use `.js` extension (Bun ESM requirement)
- `alertStats.unnotified` counts `WHERE notified_telegram = 0 AND severity IN ('high', 'critical')` — depends on task 137 schema migration having run
- `bun test src/__tests__/141-system-health-tool.test.ts` passes with 0 failures
- `bun tsc --noEmit` reports 0 errors

### Sprint 005
<!-- Execution waves per TECH_005.md:
  Wave 1 — 088 (independent cleanup, no deps beyond already-done 087)
  Wave 2 — 026 + 102 + 104 in parallel (all independent of each other)
  Wave 3 — 103 (after 026 done)
  Wave 4 — 101 (after 102 done)
-->

> REQ-005 written — TECH-005 approved by Architect. See docs/TECH_005.md. Status: ACTIVE.

#### Wave 1 — COMPLETE

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 088 | Legacy cleanup — delete src/server.ts + src/tools/ stubs | `task/088-legacy-cleanup` | Developer | interface | 087 ✅ | Done ✅ |

**Task 088 — Acceptance Criteria**

**Given** `src/server.ts` and `src/tools/` exist as dead stubs (no live imports confirmed by Architect)
**When** task 088 is implemented and merged
**Then**
- `src/server.ts` file does not exist on disk
- `src/tools/` directory does not exist on disk
- `grep -r "from.*src/server" src/` returns zero matches in production code
- `bun tsc --noEmit` reports 0 errors
- `bun test` full suite passes with 0 failures

**Files to delete**: `src/server.ts`, `src/tools/watchlist.ts`, `src/tools/analysis.ts`, `src/tools/reports.ts`, `src/tools/alerts.ts`
**Pre-deletion check**: `grep -r "from.*['\"].*src/server\|from.*['\"]../tools/\|from.*['\"]./tools/" src/` must return empty before deleting
**Note**: `src/db/schema.ts` (legacy, different path) — do NOT delete; check if test files import it first.

---

#### Wave 2 — Run in parallel after Wave 1 (all three are independent of each other)

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 026 | HOSE market data fetcher (VnDirect primary, CafeF fallback) | `task/026-hose-prices` | Developer | infrastructure | 003 ✅ | Todo |
| 102 | News polling job (every 30 min) | `task/102-job-news-poll` | Developer | interface/scheduler | 061 ✅, 062 ✅, 064 ✅ | Done ✅ |
| 104 | SSC nightly report check (20:00 GMT+7) | `task/104-job-ssc-check` | Developer | interface/scheduler | 048 ✅, 086 ✅ | Done ✅ |

**Task 026 — Acceptance Criteria**

**Given** a list of HOSE ticker codes e.g. `["VCB", "HPG"]`
**When** `fetchHosePrices(codes)` is called
**Then**
- Returns `MarketPrice[]` with `code`, `price`, `previousPrice`, `changeAmt`, `changePct`, `volume`, `updatedAt`
- Primary source: VnDirect JSON API (`https://finfo-api.vndirect.com.vn/v4/stocks?q=code:...`)
- Fallback to CafeF HTML scraper if VnDirect returns 0 rows or HTTP error
- Returns `[]` (never throws) on total failure; logs warning
- `storePrices(prices)` upserts into `market_prices` (INSERT OR REPLACE) and appends to `market_prices_history`
- `fetchVnIndex()` returns `VnIndexSnapshot | null`
- Schema: `market_prices` gains `previous_price REAL` column; `market_prices_history` table created
- `bun test src/__tests__/026-*.test.ts` passes with mocked HTTP (no real network calls)
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/infrastructure/fetchers/hose.ts`
- MODIFY: `src/infrastructure/db/schema.ts` (add `previous_price` column to `market_prices`; add `market_prices_history` table + index)

---

**Task 102 — Acceptance Criteria**

**Given** RSS sources (CafeF, VnExpress, Reuters) have articles not yet in `rag_analyses`
**When** `pollNews()` is called
**Then**
- Returns `PollNewsResult` with `fetched`, `inserted`, `duplicates`, `alerts`, `errors` counts
- New articles stored via `INSERT OR IGNORE INTO rag_analyses` using UNIQUE index on `source_url`
- Second call with same articles increments `duplicates`, does NOT create duplicate rows
- Each source failure increments `errors` but does not abort remaining sources
- Impact chain (`runImpactChain`) runs on each new entry; resulting alerts stored via `INSERT OR IGNORE INTO alerts`
- Schema: `CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url ON rag_analyses(source_url) WHERE source_url IS NOT NULL AND source_url != ''` added in `initDatabase()`
- `runNewsPoller()` in `newsPollerJob.ts` has concurrency guard (skips if previous cycle still running)
- `bun test src/__tests__/102-*.test.ts` passes with mocked fetchers
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/application/usecases/pollNews.ts`
- CREATE: `src/scheduler/newsPollerJob.ts`
- MODIFY: `src/infrastructure/db/schema.ts` (add UNIQUE index on `rag_analyses.source_url`)

---

**Task 104 — Acceptance Criteria**

**Given** watchlist stocks exist in SQLite and SSC portal is reachable
**When** `runSscCheck()` is called
**Then**
- Queries SSC for new BCTC documents for each watchlist stock
- Skips documents whose `source_url` already exists in `financial_reports`
- Calls `fetchParseAndStoreBctc({ url, actionCode })` for each new document
- 2-second delay between documents per stock to avoid rate-limiting
- 3-retry exponential backoff (2 s → 4 s → 8 s) on SSC HTTP errors
- If `financial_reports` lacks `source_url` column, adds it via `ALTER TABLE`
- No crash on empty watchlist or SSC unreachable (logs warning, returns gracefully)
- `bun test src/__tests__/104-*.test.ts` passes with mocked HTTP
- `bun tsc --noEmit` 0 errors

**Files to create**:
- CREATE: `src/scheduler/sscCheckerJob.ts`

---

#### Wave 3 — After task 026 is merged

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 103 | Market open/close scan (09:00 + 15:30 GMT+7) | `task/103-job-market-scan` | Developer | interface/scheduler | 026, 063 ✅, 064 ✅ | In Progress (changes requested) |

**Task 103 — Acceptance Criteria**

**Given** watchlist stocks have HOSE price data and `market_prices_history` table exists
**When** `runMarketScan("open")` or `runMarketScan("close")` is called
**Then**
- Calls `fetchHosePrices` for all watchlist stock codes
- Inserts fetched prices into `market_prices_history` (in addition to upsert in `market_prices`)
- Assembles `MarketSnapshot` per stock: `{ actionCode, price, previousPrice, volume, avgVolume }`
- `avgVolume` = AVG of last 20 rows in `market_prices_history`; if < 5 rows exist, returns `0` (suppresses `volume_spike`)
- Passes snapshots through `detectSignals` filtering for `price_drop`, `price_surge`, `volume_spike` only
- Calls `generateAlerts` and stores resulting alerts via `INSERT OR IGNORE INTO alerts`
- No crash on empty watchlist or HOSE fetch failure
- `bun test src/__tests__/103-*.test.ts` passes with mocked fetcher
- `bun tsc --noEmit` 0 errors

**Files to create**:
- CREATE: `src/scheduler/marketScanJob.ts`

---

#### Wave 4 — After task 102 is merged

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 101 | Morning briefing job (08:00 GMT+7) | `task/101-job-morning-briefing` | Developer | interface/scheduler | 102 ✅, 086 ✅ | Done ✅ |

**Task 101 — Acceptance Criteria**

**Given** SQLite contains recent `rag_analyses`, `alerts`, `watchlist`, `market_prices`, and `financial_reports` rows
**When** `runMorningBriefing()` is called (or cron fires at 08:00 Asia/Ho_Chi_Minh)
**Then**
- Runs `pollNews()` as best-effort pre-fetch (failure does not abort briefing)
- Fetches VnIndex via `fetchVnIndex()` (best-effort; null on failure)
- `assembleBriefing(vnIndex)` returns `DailyBriefing` with:
  - `topStories`: up to 5 `rag_analyses` rows since midnight Vietnam time, sorted by `impact_score DESC`
  - `alerts`: unread alerts from last 12 hours
  - `watchlistSummary`: one entry per watchlist stock with price + changePct from `market_prices`
  - `newReports`: stock codes with new `financial_reports` since midnight Vietnam time
- `persistBriefing(briefing)` writes to `./data/briefings/YYYY-MM-DD.json` (creates dir if absent, overwrites if re-run)
- `jobs.ts` updated: imports all four job modules; `eveningSummary` cron entry removed
- `src/index.ts` updated: calls `startScheduler()` as step 3 of bootstrap
- `bun run src/index.ts` logs `[scheduler] jobs registered` at startup (manual verify)
- `bun test src/__tests__/101-*.test.ts` passes with mocked DB + file system
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/application/usecases/assembleBriefing.ts`
- CREATE: `src/scheduler/morningBriefingJob.ts`
- MODIFY: `src/scheduler/jobs.ts` (import + wire all 4 job modules; remove `eveningSummary` cron entry)
- MODIFY: `src/index.ts` (add `startScheduler()` call as step 3 of bootstrap)

---

## 🔍 REVIEW (historical — Sprint 006 Wave 1)

### Sprint 006 — Wave 1

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| ~~027~~ | ~~HNX + UPCOM market data fetcher~~ | ~~`task/027-hnx-prices`~~ | ~~Developer~~ | ~~infrastructure~~ | ~~026 ✅, 003 ✅~~ | ~~Done~~ |
| ~~065~~ | ~~Historical pattern matcher~~ | ~~`task/065-pattern-matcher`~~ | ~~Developer~~ | ~~application~~ | ~~013 ✅, 046 ✅~~ | ~~Done~~ |
| ~~084~~ | ~~Market MCP tools (get_market_snapshot, get_patterns)~~ | ~~`task/084-tool-market`~~ | ~~Developer~~ | ~~interface~~ | ~~081 ✅, 013 ✅, 065 ✅~~ | ~~Done~~ |

---

### Deferred to Sprint 006+

| # | Title | Branch | Layer | Depends on |
|---|-------|--------|-------|------------|
| ~~024~~ | ~~Trading Economics scraper~~ | ~~`task/024-scraper-trading-economics`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~025~~ | ~~Yahoo Finance commodity fetcher~~ | ~~`task/025-yahoo-finance`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~026~~ | ~~HOSE market data fetcher~~ | ~~`task/026-hose-prices`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~027~~ | ~~HNX + UPCOM market data fetcher~~ | ~~`task/027-hnx-prices`~~ | ~~infra~~ | ~~003 ✅~~ |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | infra | 003 ✅ |

### Sprint 004 — DONE (historical)

| # | Title | Branch | Layer | Depends on |
|---|-------|--------|-------|------------|
| ~~021~~ | ~~RSS base fetcher + CafeF news~~ | ~~`task/021-rss-cafef`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~082~~ | ~~Watchlist MCP tools (add/remove/get/update)~~ | ~~`task/082-tool-watchlist`~~ | ~~interface~~ | ~~081 ✅, 002 ✅~~ |
| ~~063~~ | ~~Signal detector (price + news + report)~~ | ~~`task/063-signal-detector`~~ | ~~domain~~ | ~~021, 082~~ |
| ~~064~~ | ~~Multi-signal alert generator~~ | ~~`task/064-alert-generator`~~ | ~~domain~~ | ~~063 ✅~~ |
| ~~086~~ | ~~Alert MCP tools (get_alerts, briefing, history)~~ | ~~`task/086-tool-alerts`~~ | ~~interface~~ | ~~064 ✅, 081 ✅~~ |

---

## 🗂 BACKLOG
*(Ordered by priority — move to Todo when dependencies are Done)*

### 📡 Infrastructure Fetchers (021–039)

*(022, 023 promoted to Sprint 004; 026 promoted to Sprint 005 Todo)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~024~~ | ~~Trading Economics scraper~~ | ~~`task/024-scraper-trading-economics`~~ | ~~infra~~ | ~~003 ✅~~ | ~~Done — merged 2026-03-28~~ |
| ~~025~~ | ~~Yahoo Finance commodity fetcher~~ | ~~`task/025-yahoo-finance`~~ | ~~infra~~ | ~~003 ✅~~ | ~~Done — ready for review 2026-03-28~~ |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | infra | 003 ✅ | Returns SBV interest rate, FX rate; deferred Sprint 006 |

---

### ⚙️ Domain: Analysis Engine (061–079)

*(061, 062 promoted to Sprint 004)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~065~~ | ~~Historical pattern matcher~~ | ~~`task/065-pattern-matcher`~~ | ~~application~~ | ~~013 ✅, 046 ✅~~ | ~~Done ✅~~ |
| ~~066~~ | ~~AI summary generator~~ | ~~`task/066-ai-summary`~~ | ~~application~~ | ~~061 ✅, 047 ✅~~ | ~~Done ✅~~ |

---

### 🔌 Interface: MCP Server + Tools (081–099)

*(083 promoted to Sprint 004; 088 promoted to Sprint 005 Todo)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~084~~ | ~~Market tools (get_market_snapshot, get_patterns)~~ | ~~`task/084-tool-market`~~ | ~~interface~~ | ~~081 ✅, 013 ✅, 065 ✅~~ | ~~Done ✅~~ |

---

### ⏰ Interface: Scheduler (101–119)

*(101, 102, 103, 104 promoted to Sprint 005 Todo)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 105 | Evening summary job (22:00) | `task/105-job-evening-summary` | interface | 086 ✅ | **Done** — merged to main 2026-03-28; 14 tests pass, tsc 0 errors |

---

### 🧪 Tests (121–139)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 121 | Unit tests — BCTC parser (Vietnamese edge cases) | `task/121-test-bctc-edge-cases` | test | 042-047 | 20+ edge cases: parentheses negatives, missing fields, image-only PDF, corrupt PDF | **Done** — merged to main 2026-03-28; 36 tests pass (P-01–P-15, B-01–B-08, I-01–I-08, C-01–C-05), tsc 0 errors |
| ~~122~~ | ~~Unit tests — domain services~~ | ~~`task/122-test-domain-services`~~ | ~~test~~ | ~~061-066~~ | ~~Done — 78 tests, 4 services ≥90% branch coverage; merged 2026-03-28~~ |
| 123 | Integration tests — MCP tools with real SQLite | `task/123-test-integration-mcp` | test | 082-086, 084 ✅ | Full tool call roundtrip: add watchlist → fetch news → generate alert → get alert. **UNBLOCKED — ready for Wave 3** |
| 124 | Integration tests — SSC pipeline (mock HTTP) | `task/124-test-ssc-pipeline` | test | 048 | Mock SSC HTML + PDF; verify full parse → store → embed pipeline — **Done** — 17 tests pass (SSC-01–SSC-12 + 5 extra); tsc 0 errors; merged 2026-03-28 |
| 125 | E2E test — daily briefing flow | `task/125-test-e2e-briefing` | test | 101-105 | Full daily briefing: trigger → fetch → analyze → alert → report; assert final output structure | **Done** — 39 tests pass (13 sections: DailyBriefing structure, full pipeline, topStories, alerts, watchlistSummary, newReports, vnIndex, macro indicators Task-024, graceful degradation, file persistence, evening summary, bookend E2E, concurrency guards); tsc 0 errors; merged 2026-03-28 |

---

---

## 📋 TODO — Sprint 009

*(Sprint 009 active — TECH-009 approved by Architect 2026-03-29 — ready for PM sprint planning)*

> **PM action required**: Read `docs/TECH_009.md` and assign tasks per dependency chain. See Task Breakdown table in TECH-009 for recommended order (127 → 128 → 129 → 031 → 034 → 032 → 033 → 106). Brief for each chain:
> - Chain A: fix 4 broken test files + fetchParseAndStoreBctc.ts compile error before implementing 031/032/033
> - Chain B: telegram.ts uses plain fetch(), no SDK; hook lives in application/scheduler layer only
> - Chain C: intelligenceCycleJob.ts absorbs newsPollerJob; jobs.ts is the single cron registry

### Chain A — SSC Puppeteer scraper

| # | Title | Branch | Agent | Layer | Depends on |
|---|-------|--------|-------|-------|------------|
| 127 | Unit + integration tests — Puppeteer SSC fetcher (mock browser API) | `task/127-test-ssc-puppeteer` | QA | test | — (write first, TDD Red) |
| 031 | Puppeteer-based SSC browser fetcher (replaces ssc.ts plain-HTTP) | `task/031-ssc-puppeteer` | Developer | infrastructure | 127 |
| 032 | Multi-category document listing + dedup (BCTC + 3 other categories) | `task/032-ssc-multi-category` | Developer | infrastructure | 031 |
| 033 | Wire Puppeteer fetcher into sscCheckerJob (replace plain-HTTP call) | `task/033-ssc-checker-wiring` | Developer | interface/scheduler | 032 |

**Task 127 — Acceptance Criteria**

**Given** a mock Puppeteer `page` object that simulates the SSC portal ADF form
**When** the test suite runs
**Then**
- `listSscDocuments('VCB', 'quarterly', 2025)` with mock page returns at least 1 `SscDocument` with `url`, `title`, `publishedAt`, `reportType`
- Search form uses CSS attribute-suffix selector `input[id$="it8112::content"]` for stock code; search button found by visible text "Tìm kiếm"
- Results table parser correctly extracts STT, Exchange, Stock Code, Title, Company, Description, Date, Download URL from `tr[_afrRK]` rows (8 cells)
- Empty results table returns `[]` without throwing
- Portal timeout (page never settles) returns `[]` after 10 s and closes browser
- All four disclosure categories (BCTC, Dinh ky khac, Bat thuong 24h, Chao ban) are tested
- Dedup: two calls for the same stock produce no duplicate URLs in merged output
- Min 20 test cases; `bun tsc --noEmit` 0 errors

**Task 031 — Acceptance Criteria**

**Given** Chrome is installed at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` and `puppeteer-core@24.40.0` is installed
**When** `listSscDocuments('VCB', 'quarterly', 2025)` is called (production path)
**Then**
- Puppeteer launches Chrome headless (`headless: 'new'`) with `--no-sandbox`, `--disable-dev-shm-usage`
- Navigates to `https://congbothongtin.ssc.gov.vn/faces/NewsSearch`
- Types stock code into `input[id$="it8112::content"]`, clicks button with text "Tìm kiếm", waits for `tr[_afrRK]` row selector
- Returns `SscDocument[]` matching the existing interface (title, url, publishedAt, reportType)
- Browser is closed via `browser.close()` in ALL code paths (try/finally)
- Returns `[]` (never throws) on navigation failure, selector timeout, or parse error; logs warning
- `SscDocument.url` is absolute (`https://congbothongtin.ssc.gov.vn/...`)
- `bun tsc --noEmit` 0 errors; existing 127 tests pass

**Files to create/modify**:
- MODIFY: `src/infrastructure/fetchers/ssc.ts` (replace plain-HTTP implementation with Puppeteer driver; preserve `SscDocument` interface and `listSscDocuments` signature)

**Task 032 — Acceptance Criteria**

**Given** the Puppeteer fetcher from task 031 is available
**When** `listAllSscDocuments(actionCode)` is called
**Then**
- Queries all four categories in sequence: BCTC, Dinh ky khac, Bat thuong 24h, Chao ban / phat hanh
- Merges results into a single `SscDocument[]` deduplicated by `url`
- Category label is stored in a new optional `category` field on `SscDocument` (non-breaking addition)
- Total result count logged at INFO level
- `bun tsc --noEmit` 0 errors; all 127 tests still pass

**Files to create/modify**:
- MODIFY: `src/infrastructure/fetchers/ssc.ts` (add `listAllSscDocuments` export)

**Task 033 — Acceptance Criteria**

**Given** `listAllSscDocuments` from task 032 is available
**When** `runSscCheck()` fires (20:00 GMT+7 cron or manual call)
**Then**
- Calls `listAllSscDocuments(code)` instead of the old `listSscDocuments(code, 'quarterly', year)` for each watchlist stock
- Skips documents whose URL already exists in `financial_reports.source_url`
- Passes new documents to `fetchParseAndStoreBctc({ url, actionCode })` unchanged
- Rate-limit delay (2 s between stocks) and 3-retry exponential backoff preserved from task 104
- No crash on empty watchlist, Puppeteer launch failure, or network timeout
- `bun test src/__tests__/104-*.test.ts` (existing SSC checker tests) still pass
- `bun tsc --noEmit` 0 errors

**Files to modify**:
- MODIFY: `src/scheduler/sscCheckerJob.ts` (replace import + call site)

---

### Chain B — Telegram Bot alerts

| # | Title | Branch | Agent | Layer | Depends on |
|---|-------|--------|-------|-------|------------|
| 128 | Unit tests — Telegram notifier (mock Telegram API) | `task/128-test-telegram` | QA | test | — (write first, TDD Red) |
| 034 | Telegram notifier + alert hook + send_test_telegram MCP tool | `task/034-telegram-notifier` | Developer | infrastructure + interface | 128 |

**Task 128 — Acceptance Criteria**

**Given** a mock HTTPS server that stubs `https://api.telegram.org/bot<TOKEN>/sendMessage`
**When** the test suite runs
**Then**
- `notifyTelegram(alert)` with severity HIGH posts to `sendMessage` with `chat_id` and markdown message body
- `notifyTelegram(alert)` with severity LOW does NOT call the API (filtered out)
- Message body contains: stock code(s), signal type, severity label, one-line summary, ISO timestamp
- Returns gracefully (does not throw) when the API returns a non-200 status
- Returns gracefully when the network is unreachable (connection refused)
- `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` missing from env → logs warning, skips send, returns `false`
- `send_test_telegram` MCP tool (schema: `{ message: string }`) calls `notifyTelegram` and returns `{ sent: boolean, error?: string }`
- Min 15 test cases; `bun tsc --noEmit` 0 errors

**Task 034 — Acceptance Criteria**

**Given** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set in `.env`
**When** a HIGH or CRITICAL severity alert is generated by `alertGenerator.ts`
**Then**
- `notifyTelegram(alert)` is called; sends HTTPS POST to `https://api.telegram.org/bot${TOKEN}/sendMessage`
- Payload: `{ chat_id, parse_mode: 'Markdown', text: <formatted message> }`
- Message format: `*[SEVERITY] STOCK_CODE*\nSignal: <type>\nSummary: <one line>\nTime: <ISO>`
- Also triggered when SSC discovers a new document (called from `sscCheckerJob.ts` after task 033)
- `send_test_telegram` MCP tool registered in `src/interface/mcp/server.ts`; increments `toolCount` to 18
- Does NOT throw on Telegram API failure — logs warning, continues
- `bun tsc --noEmit` 0 errors; 128 tests pass

**Files to create/modify**:
- CREATE: `src/infrastructure/notifiers/telegram.ts`
- CREATE: `src/infrastructure/notifiers/index.ts`
- MODIFY: `src/infrastructure/config.ts` (add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` env vars)
- MODIFY: `src/scheduler/sscCheckerJob.ts` (call `notifyTelegram` for new documents)
- MODIFY: `src/interface/mcp/tools/alerts.ts` (add `send_test_telegram` tool)
- MODIFY: `src/interface/mcp/server.ts` (register new tool; toolCount 17 → 18)

---

### Chain C — 15-minute intelligence cycle

| # | Title | Branch | Agent | Layer | Depends on |
|---|-------|--------|-------|-------|------------|
| 129 | Unit tests — 15-min intelligence cycle (mock sub-jobs) | `task/129-test-intelligence-cycle` | QA | test | — (write first, TDD Red) |
| 106 | 15-min intelligence cycle job (replaces ad-hoc cron slots during market hours) | `task/106-job-intelligence-cycle` | Developer | interface/scheduler | 033, 034, 129 |

**Task 129 — Acceptance Criteria**

**Given** mocked `pollNews`, `runSscCheck`, `fetchHosePrices`, `runImpactChain`, and `notifyTelegram`
**When** the test suite runs
**Then**
- `runIntelligenceCycle()` calls each sub-job in correct sequence: news → SSC list → prices → impact chain → Telegram
- Concurrency guard: second call while first is running logs warning and returns early without calling sub-jobs
- Cycle duration is measured; a mocked slow cycle (> 12 min) logs a warning
- Outside market hours (09:00–15:30 GMT+7 weekdays): SSC and price fetch are skipped; news poll still runs
- Sub-job failure (throws) is caught, logged, and does NOT abort the remaining sub-jobs in the cycle
- Min 15 test cases; `bun tsc --noEmit` 0 errors

**Task 106 — Acceptance Criteria**

**Given** the server is running and market hours are 09:00–15:30 GMT+7 weekdays
**When** the intelligence cycle fires (every 15 min during market hours; every 60 min outside)
**Then**
- `runIntelligenceCycle()` executes: `pollNews()` → `runSscCheck()` (list only, no full PDF parse if no new docs) → `fetchHosePrices(watchlistCodes)` → `runImpactChain(newEntries)` → `notifyTelegram(alerts)` for HIGH/CRITICAL
- Concurrency guard: overlapping cycles are skipped with `[scheduler] intelligence cycle already running — skipping` log
- Cycle wall-clock duration logged at INFO; > 12 min logs WARN
- Outside market hours (or weekends): SSC list + price fetch skipped; news poll runs at 60-min interval
- `startScheduler()` in `src/interface/scheduler/index.ts` registers the 15-min cron and removes the now-redundant `newsPollerJob` cron (news poll is absorbed into the cycle)
- `bun test src/__tests__/106-*.test.ts` passes with mocked sub-jobs
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/scheduler/intelligenceCycleJob.ts`
- MODIFY: `src/interface/scheduler/index.ts` (register 15-min cycle; decommission standalone `newsPollerJob` cron entry)
- MODIFY: `src/scheduler/jobs.ts` (add cycle cron definition)

---

---

## Sprint 020 — Prediction Market Intelligence
*(PLANNING — 2026-04-01. Blocked on human answers to BLOCKER-020-A through D.)*
*(See SPRINT_GOAL.md sprint_id: 020 for full vision, scope, and blocker details.)*

| # | Title | Agent | Layer | Priority | Status |
|---|-------|-------|-------|----------|--------|
| REQ-020 | BA: Requirement Spec for Sprint 020 — Polymarket intelligence feed | BA | docs/ | P0 | BLOCKED — awaiting BLOCKER-020-A through D |
| TECH-020 | Architect: Technical Design for Sprint 020 | Architect | docs/ | P0 | BLOCKED — awaiting REQ-020 |

---

## Kanban Summary

| Column | Count | Tasks |
|--------|-------|-------|
| ✅ Done | 55 | 000-DOC-001 + 025, 028, FIX-081, 126, 089 (Sprint 008 complete) |
| 🔍 Review | 3 | 034, 106, 135 |
| 🚧 In Progress | 0 | — |
| 📋 Todo | 8 | 127, 031, 032, 033 (SSC Puppeteer) + 128 (Telegram) + 129 (15-min cycle tests) |
| 🗂 Backlog | 0 | — |
| **Total** | **66** | |

---

## DDD Layer Summary

| Layer | Tasks | Description |
|-------|-------|-------------|
| **Domain** | 041-048, 061-066, 014 | Pure business logic, no I/O |
| **Infrastructure** | 002, 003, 011-013, 021-030 | SQLite, LanceDB, HTTP, scrapers |
| **Application** | 047, 048, 065, 066 | Use case orchestration |
| **Interface** | 081-105 | MCP tools, Bun server, scheduler |
| **Test** | 121-125 | Cross-cutting |

---

## Definition of Done (DoD)

A task is **Done** when ALL of the following are true:

- [ ] Code is on `task/NNN` branch
- [ ] `bun test src/__tests__/NNN-*.test.ts` → all pass
- [ ] `bun tsc --noEmit` → 0 errors
- [ ] QA checklist: 100% ✅
- [ ] Zero BLOCKING issues in Task Report
- [ ] Merged to `main` via `--no-ff`
- [ ] `reports/TASK_REPORT_NNN.md` generated
- [ ] Kanban card moved to Done
- [ ] TASKS.md updated (move row to Done table)
