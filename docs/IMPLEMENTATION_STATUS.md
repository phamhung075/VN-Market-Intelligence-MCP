# Implementation Status

> Sprint-by-sprint history lives in `docs/archive/` (split by range).
> Index → `docs/TASKS_ARCHIVE.md`
> Current sprint + stats → `docs/data/project-stats.json`

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
