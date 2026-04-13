# Implementation Status

> Sprint-by-sprint history lives in `docs/archive/` (split by range).
> Index → `docs/TASKS_ARCHIVE.md`
> Current sprint + stats → `docs/data/project-stats.json`

## Sprint 072 — BCTC Pipeline Fix + test hygiene (Done 2026-04-14)

**Scope:** Fixed silent error swallowing in BCTC report persistence path; added WAL checkpoint after successful store; fixed tool registry test count.

**Key changes:**
- `src/application/usecases/parseBctcReport.ts`: `storeReport` call now wrapped with try/catch — errors surface as `"storeReport failed: <msg>"` instead of being silently swallowed. WAL checkpoint (`PRAGMA wal_checkpoint(PASSIVE)`) runs after successful store, guarded by `dbPath !== ':memory:'`.
- `src/infrastructure/logger.js` import added to parseBctcReport.ts.
- `src/__tests__/308-tool-registry.test.ts`: count updated 57 → 59 (accounts for `registerMarketMessageTools` task 1166 and `registerTickerIntelligenceTools` task 1180).
- `src/__tests__/1181-financial-reports-persist.test.ts`: new integration test verifying financial_reports row is persisted after `fetchParseAndStoreBctc()`.

**Stats:** toolCount=96, schedulerFileCount=28, totalTasksDone=253. 10/10 sprint-072 tests pass. 4190/4244 full-suite tests pass (34 pre-existing failures in unrelated sprints, 0 new regressions). TypeScript: 0 errors.
