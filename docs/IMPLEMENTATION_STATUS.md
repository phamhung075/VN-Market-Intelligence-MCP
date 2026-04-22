# Implementation Status

> Sprint-by-sprint history lives in `docs/archive/` (split by range).
> Index → `docs/TASKS_ARCHIVE.md`
> Current sprint + stats → `docs/data/project-stats.json`

## Sprint 1289 — Foreign Flow Parse Error Root-Cause Fix + BCTC Historical Strategy (In Progress 2026-04-22)

**Scope:** Root-cause analysis of recurring foreign flow parse cascade (784 errors/24h); design + implement strict validation to eliminate silent filter bug. Phase 2: design 8-quarter historical BCTC downloader strategy.

**Key changes:**
- Task 1289a: Root-cause analysis doc + design (`TECH_1289.md`) — COMPLETE
- Task 1289b: RED test spec for validation error handling — COMPLETE (11 assertions)
- Task 1289c–d: Strict validation integration (fetcher + POST endpoint) — Todo
- Task 1289e: GREEN validation (all tests pass, no regressions) — Todo
- Task 1289f: QA verification + parse error count < 5/day — Todo
- Phase 2: Design 8-quarter historical BCTC downloader (this session)

**Root cause identified:** `isValidForeignFlowItem()` in `foreignFlowFetcher.ts` **silently filters** invalid items instead of failing loudly. When VPS sends 30 items with 3 schema violations, filter discards 3 and returns 27 as "success". Over 10 days, ~30 rows missing. No diagnostic to show why.

**Why prior fixes failed:**
- Sprint 228: Added parse hardening to POST endpoint, but fallback fetcher uses different validation path
- Sprint 1288: Added fallback strategy (primary→cache→SSE→none), which masks the problem instead of fixing it

**Solution:** Unify schema validation across **all entry points** (VPS push endpoint + fallback fetcher). Use domain-layer `validateForeignFlowPayload()` everywhere. Fail loudly with HTTP 400 / throw on validation error. Log diagnostics (item index + field + reason).

**Prevention pattern for future foreign flow changes:**
1. All entry points must use the same validator (no silent filters)
2. Fail loudly on schema errors (reject with HTTP 400 or throw)
3. Log error diagnostics (item index + field name + expected type)
4. Test both valid and invalid payloads
5. No custom type guards that filter silently

**Stats:** toolCount=105, schedulerFileCount=42, totalTasksDone=340, testBaseline=6305 (+11 from 1289b RED tests).

---

## Sprint 1290 — Foreign Flow Fallback Fetcher Integration (Done 2026-04-22)

**Scope:** Integrate `fetchForeignFlowWithFallback()` into scheduler job; graceful degradation (primary→cache→SSE→none) when VPS endpoint unreachable.

**Key changes:**
- Task 1290a: RED test spec for fallback job — COMPLETE (8 test cases, 37 assertions)
- Task 1290b–d: GREEN implementation + QA — COMPLETE (merged 2026-04-22)

**Result:** `foreignFlowFetcherJob.ts` now has graceful fallback chain. Runs every 60 seconds. Logs fallback activation + circuit breaker state.

**Stats:** toolCount=105, schedulerFileCount=42, totalTasksDone=340, testBaseline=6305.

---

## Sprints 209-220 — Modular Monolith Refactor: 3-Phase Module Split (Done 2026-04-20)

**Scope:** Full structural refactor of `src/interface/mcp/tools/`, `src/domain/services/`, and `src/scheduler/` into 10 domain module subfolders. Zero breaking changes to external API surface.

### Phase 1 — Schema Decomposition (Sprint 209)

`src/infrastructure/db/schema.ts` (1,571 lines monolith) split into 8 domain slice files:
- `schema-market-data.ts`, `schema-financial-reports.ts`, `schema-news.ts`, `schema-alerts.ts`
- `schema-portfolio.ts`, `schema-briefings.ts`, `schema-macro.ts`, `schema-system.ts`

`schema.ts` reduced to ~248-line thin orchestrator. All 38+ callers continue importing `getDb / initDatabase / closeDb` from `schema.ts` — no call-site changes. Every slice uses `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` throughout (idempotent).

### Phase 2 — Barrel Index Files (Sprint 210)

`index.ts` barrel files created for all 10 modules across:
- `src/interface/mcp/tools/<module>/index.ts` (10 files)
- `src/domain/services/<module>/index.ts` (where applicable)
- `src/scheduler/<module>/index.ts` (where applicable)

`registry.ts` and `jobs.ts` refactored to import only from module barrels.

### Phase 3 — File Migration into Module Subfolders (Sprints 211-220)

All tool, service, and scheduler files moved into 10 subfolders:

| Sprint | Module migrated | Files moved |
|--------|----------------|-------------|
| 211 | `market-data/` | 10 tool files + 8 scheduler jobs |
| 212 | `financial-reports/` | 3 tool files + 2 scheduler jobs + 8 domain services |
| 213 | `news-analysis/` | 8 tool files + 5 scheduler jobs |
| 214 | `alerts/` | 8 tool files + 3 scheduler jobs |
| 215 | `portfolio/` | 7 tool files + 1 scheduler job |
| 216 | `briefings/` | 5 tool files + 3 scheduler jobs |
| 217 | `macro/` | 6 tool files + 6 scheduler jobs |
| 218 | `kinhdich/` | 1 tool file + kinhDich/ domain subfolder (already existed) |
| 219 | `system/` | 5 tool files + 2 scheduler jobs |
| 220 | `sector/` | 14 tool files (no scheduler) |

**Result:** 100 tools across 10 modules, 38 scheduler files, 0 TypeScript errors, 0 breaking imports.

**Stats:** toolCount=100, schedulerFileCount=38, totalTasksDone=323. TypeScript: 0 errors.

---

## Sprint 080 — Domain Bug Batch: Agent 08 Tools + Sentiment + VND Guard + Keywords (Done 2026-04-14)

**Scope:** 6 tasks closing domain-layer and infrastructure correctness gaps flagged by the system auditor and cowork analysis team.

**Key changes:**
- Task 1215: Added deduplication in `send_telegram` bug-report path — duplicate alert categories are suppressed within a 4-hour window to prevent noise flooding the BUG channel.
- Task 1194: Implemented the 6 missing MCP tools for Agent 08 Prediction Synthesizer (`create_prediction_claim`, `list_prediction_claims`, `resolve_prediction_claim`, `get_prediction_scorecard`, `get_prediction_leaderboard`, `get_pending_predictions`) in `src/interface/tickerIntelligenceTools.ts`.
- Task 1197: Fixed cascade seed sentiment inversion — bullish macro headlines (e.g. Fed rate cut) were being classified BEARISH due to inverted polarity lookup; corrected in `cascadeAnalysisService.ts`.
- Task 1198: Added VND currency guard in `detectStocksInText` — tokens matching "VND", "đồng", and common currency-amount patterns are excluded from ticker extraction to prevent false positives.
- Task 1206: Fixed cascade keyword disambiguation — "đất vàng" now correctly maps to `real_estate` (was missing); "cầu" inside "toàn cầu" / "cầu tiêu dùng" no longer triggers `construction` sector.
- Task 1212: Corrected interest-rate cooling seed sentiment — "hạ lãi suất" (rate cut) seed is now `BULLISH` instead of `NEUTRAL`, aligning with the economic stimulus interpretation used by the rest of the cascade.

**Stats:** toolCount=97, schedulerFileCount=28, totalTasksDone=272. TypeScript: 0 errors.

---

## Sprint 079 — Price Persistence Observability + BCTC Banking Backfill (Done 2026-04-14)

**Scope:** 5 tasks closing infrastructure gaps in the VPS price-push pipeline and BCTC banking data coverage.

**Key changes:**
- Task 1193: Fixed `market_prices` table write path so VPS-pushed prices are persisted correctly; added `vps_push_log` observability rows for each batch.
- Task 1201: Backfilled Q4-2025 BCTC for banking tickers BID, EIB, SHB, VCB after the VPS BCTC fetcher failed to deliver within the SSC deadline window.
- Task 1202: Backfilled Q4-2025 BCTC for FPT and HPG which were missing due to a 14-day VPS fetcher gap.
- Task 1196: Fixed BCTC extraction quarter-detection logic (VNM/VEA PDFs were on disk but `financial_reports` table remained empty due to misclassified quarter label); added banking-sector fallback extraction path.
- Task 1204: Deleted VCB Q1-2025 corrupted row where all financial values = 0 (caused by a prior failed PDF extraction), preventing bad data from polluting ratio calculations.

**Stats:** toolCount=97, schedulerFileCount=28, totalTasksDone=266. TypeScript: 0 errors.

---

## Sprint 078 — Evening Summary Empty-Content Fallback (Done 2026-04-14)

**Scope:** Modified `eveningSummaryJob.ts` to send a Vietnamese fallback message to the Telegram market channel when `hasContent === false`, ensuring a complete data-collection failure is never silently swallowed. Previously the 2026-04-13 evening run produced an empty report and sent nothing.

**Key changes:**
- `src/scheduler/eveningSummaryJob.ts`: added injectable `sendFn` parameter to `runEveningSummary`; in the `hasContent === false` else-branch, calls `sendFn(channel="market")` with a Vietnamese message directing users to run `get_pipeline_health` to diagnose the pipeline gap.
- `src/__tests__/1192-evening-summary-empty-fallback.test.ts`: 4 acceptance-criteria tests — fallback fires when no content, fallback message is Vietnamese, references `get_pipeline_health`, normal path sends regular summary not fallback.

**Stats:** toolCount=97, schedulerFileCount=28, totalTasksDone=261. TypeScript: 0 errors.

---

## Sprint 077 — TE RSS Fallback Chain (Done 2026-04-14)

**Scope:** Replaced the broken session-gated `stream.ashx` endpoint in `tradingEconomicsStream.ts` with a sequential RSS fallback chain restoring Level 1/2 macro news to the intelligence cycle.

**Key changes:**
- `src/infrastructure/fetchers/tradingEconomicsStream.ts`: removed all `stream.ashx` references; defined three named feed constants (MarketWatch Economy RSS, Google News "global economy", Google News "financial markets"); sequential fallback — feed 1 → feed 2 → feed 3 → `[]`; all items tagged `source = "tradingeconomics"`; injectable `httpClient` parameter for test isolation; rate-limiter host key changed from `"tradingeconomics"` to `"tradingeconomics-rss"` (isolated from any legacy key).
- `src/__tests__/1191-te-stream-rss.test.ts`: 8 acceptance-criteria tests — no `stream.ashx` references, three constants defined, fallback chain, source tag, httpClient injection, rate-limiter key, all pass.

**Stats:** toolCount=97, schedulerFileCount=28, totalTasksDone=260. TypeScript: 0 errors.

---

## Sprint 076 — Pipeline Watchdog Job (Done 2026-04-14)

**Scope:** New scheduler `pipelineWatchdogJob.ts` providing automated stale-pipeline detection — fires a Telegram work-channel alert when RAG data has not been refreshed for more than 90 minutes, with a 3-hour cooldown to avoid repeated noise.

**Key changes:**
- `src/scheduler/pipelineWatchdogJob.ts`: cron `*/30 * * * *`, calls `getPipelineHealth()`, compares `staleMins > 90`, sends `send_telegram(channel="work")` alert with ticker staleness info and suppresses repeat alerts for 3 hours via in-memory cooldown timestamp.
- `docs/data/cron-registry.json`: registered `pipelineWatchdogJob` entry; schedulerFileCount 27 → 28.
- `src/__tests__/1190-pipeline-watchdog.test.ts`: test suite covering alert fires when staleMins > 90, suppressed when staleMins <= 90, cooldown blocks second alert within 3h, cooldown expires after 3h.

**Stats:** toolCount=97, schedulerFileCount=28, totalTasksDone=259. TypeScript: 0 errors.

---

## Sprint 075 — Pipeline Health MCP Tool (Done 2026-04-14)

**Scope:** New `get_pipeline_health` MCP tool providing RAG pipeline observability from within Claude Desktop — replaces manual SQL queries to diagnose stale data.

**Key changes:**
- `src/application/usecases/getPipelineHealth.ts`: use case `getPipelineHealth({ db, nowMs, reportsDir })` returning `PipelineHealthResult` with 5 fields: `ragRows` (today/yesterday counts + staleMins clamped >= 0, respecting GMT+7 day boundary at Unix ms), `sources` (per-source_url row counts sorted DESC, null mapped to `"(unknown)"`), `vpsPushLast24h` (null when `vps_push_log` table absent, 0 when table exists but no ok-status rows in last 24h), `eveningReportLastRun` (ISO timestamp of newest `reports/YYYY-MM-DD-evening.json`, null if none), `generatedAt` (ISO timestamp).
- `src/application/usecases/index.ts`: barrel re-export of `getPipelineHealth`.
- `src/interface/mcp/tools/systemTools.ts`: registered `get_pipeline_health` tool after `get_system_status`. Input schema: optional `reportsDir` string.
- `src/__tests__/1189-pipeline-health.test.ts`: 7 test cases covering GMT+7 boundary, stale clamp, null source mapping, absent vps_push_log table, ok vs non-ok row filter, empty reports dir.

**Stats:** toolCount=97, schedulerFileCount=27, totalTasksDone=258. TypeScript: 0 errors.

---

## Sprint 074 — RSS Atom Support + baodautu.vn Fix (Done 2026-04-14)

**Scope:** Extended RSS parser to support Atom 1.0 feeds; resolved 0-item parse results for Google News and baodautu.vn on every intelligence cycle.

**Key changes:**
- `src/infrastructure/fetchers/rss.ts` (`parseRssFeed()`): selector changed from `$("item")` to `$("item, entry")` — union covers RSS 2.0 and Atom 1.0. Added Atom-specific `url` extraction (prefer `<link rel="alternate" href>` → `<link href>` → `<id>`), `publishedAt` (`<published>` → `<updated>`), `content` (`<summary>` → `<content>`).
- `src/__tests__/1188-rss-atom.test.ts`: fixtures for RSS 2.0 and Atom 1.0 (real-shape, not minimal); both return >= 1 item.
- Task 1185 (baodautu.vn 0-item bug) auto-resolved as side-effect: feed is Atom 1.0, now correctly parsed.

**Stats:** toolCount=96, schedulerFileCount=27, totalTasksDone=257. TypeScript: 0 errors.

---

## Sprint 073 — Evening Intelligence Pipeline Fix (Done 2026-04-13)

**Scope:** Fixed timing race between `eveningSummaryJob` and `intelligenceCycleJob` (both 22:00 VN); removed dead scheduler file; stubbed geo-blocked VN RSS fetchers.

**Key changes:**
- `src/scheduler/eveningSummaryJob.ts`: cron rescheduled `0 22 * * 1-5` → `30 22 * * 1-5` (22:30 VN). Eliminates the race where the summary ran ~27ms after 22:00 before `intelligenceCycleJob` finished its ~2-minute write of 100 `rag_analyses` rows.
- `src/scheduler/newsPollerJob.ts`: deleted — file was never registered in `jobs.ts`. The 828 logged runs were historical; `intelligenceCycleJob` has been the sole news poller since its introduction.
- `src/scheduler/intelligenceCycleJob.ts` (`defaultPollNews()`): injected empty fetchers for cafef/vnexpress/vneconomy (geo-blocked from France). Reuters and Trading Economics (non-geo-blocked) unchanged. VN news arrives exclusively via `POST /api/push-news` from Vinahost VPS (`vn-news-fetch.service`).
- `src/__tests__/1187-pollnews-dead-path.test.ts`: 4-test suite added verifying stubbed fetchers return empty arrays.
- Dead test references to newsPollerJob removed from test files 102 and 1101.
- `.claude/knowledge/cron-jobs.md` + `docs/data/cron-registry.json`: updated eveningSummaryJob schedule to 22:30.

**Stats:** toolCount=96, schedulerFileCount=28, totalTasksDone=255. TypeScript: 0 errors.

---

## Sprint 072 — BCTC Pipeline Fix + test hygiene (Done 2026-04-14)

**Scope:** Fixed silent error swallowing in BCTC report persistence path; added WAL checkpoint after successful store; fixed tool registry test count.

**Key changes:**
- `src/application/usecases/parseBctcReport.ts`: `storeReport` call now wrapped with try/catch — errors surface as `"storeReport failed: <msg>"` instead of being silently swallowed. WAL checkpoint (`PRAGMA wal_checkpoint(PASSIVE)`) runs after successful store, guarded by `dbPath !== ':memory:'`.
- `src/infrastructure/logger.js` import added to parseBctcReport.ts.
- `src/__tests__/308-tool-registry.test.ts`: count updated 57 → 59 (accounts for `registerMarketMessageTools` task 1166 and `registerTickerIntelligenceTools` task 1180).
- `src/__tests__/1181-financial-reports-persist.test.ts`: new integration test verifying financial_reports row is persisted after `fetchParseAndStoreBctc()`.

**Stats:** toolCount=96, schedulerFileCount=28, totalTasksDone=253. 10/10 sprint-072 tests pass. 4190/4244 full-suite tests pass (34 pre-existing failures in unrelated sprints, 0 new regressions). TypeScript: 0 errors.
