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

---

## 🔍 REVIEW

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| — | — | — | Empty |

---

## 🚧 IN PROGRESS

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| — | — | — | Empty |

---

## 📋 TODO
*(Dependencies cleared — ready to assign)*

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

## Kanban Summary

| Column | Count | Tasks |
|--------|-------|-------|
| ✅ Done | 55 | 000-DOC-001 + 025, 028, FIX-081, 126, 089 (Sprint 008 complete) |
| 🔍 Review | 2 | 034, 106 |
| 🚧 In Progress | 0 | — |
| 📋 Todo | 8 | 127, 031, 032, 033 (SSC Puppeteer) + 128 (Telegram) + 129 (15-min cycle tests) |
| 🗂 Backlog | 0 | — |
| **Total** | **65** | |

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
