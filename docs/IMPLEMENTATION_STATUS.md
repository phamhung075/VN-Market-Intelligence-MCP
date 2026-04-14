# Implementation Status

> Sprint-by-sprint history lives in `docs/archive/` (split by range).
> Index → `docs/TASKS_ARCHIVE.md`
> Current sprint + stats → `docs/data/project-stats.json`

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
