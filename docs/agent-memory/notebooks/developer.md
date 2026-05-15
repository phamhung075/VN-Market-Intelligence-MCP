# Developer — Notebook

**Last updated:** 2026-05-16 | **Sprint:** 1920

## Last session summary (1920d)

Task 1920d — Broker Sanctions Quarterly Sweep + Schema Migration.

**Problem:** `broker_sanctions` table had no UNIQUE constraint on `(broker_name, sanction_start)`. `insertBrokerSanction()` used plain INSERT. A quarterly sweep job running twice (Docker restart mid-window) would insert duplicate rows. No scheduler job existed to fetch SSC broker sanctions.

**What was done:**

- Schema migration in `schema-alerts.ts`: `broker_sanctions` DDL updated with `UNIQUE(broker_name, sanction_start)`. Idempotent legacy-DB migration via recreate-and-rename pattern (SQLite ALTER TABLE ADD CONSTRAINT not supported). Detection: `sqlite_master.sql LIKE '%UNIQUE(broker_name, sanction_start)%'` check.
- `brokerSanctionStore.ts`: Changed plain `INSERT` to `INSERT OR IGNORE`. Fixed `lastInsertRowid` sticky behavior — `bun:sqlite` returns previous rowid (not 0) on OR IGNORE skip; now uses `result.changes > 0` to detect actual inserts.
- Created `brokerSanctionsJob.ts` — `runBrokerSanctionsJob(opts?)` with DI seam (getCurrentMonthFn/fetchFn/sendWorkFn). Quarter-guard `[3,6,9,12].includes(currentMonth)`. Non-quarter: `skipped=true`, no WORK alert. Quarter: fetch → null-sanctionStart rejection → INSERT OR IGNORE per record. Zero-result → WORK alert. Fetch error → WORK alert, `success=false`, no rethrow. Default fetcher: stub returning `[]` (real SSC scraper deferred; zero-result alert fires on first quarterly run to notify operator).
- `cronConfig.ts`: added `brokerSanctionsSweep: '0 8 25-31 * 5'` (FR-5).
- `startScheduler.ts`: import + `cron.schedule(CRONS.brokerSanctionsSweep, jobRunRepo.wrapRun(...))` (FR-6).
- 8 tests in `1920d-broker-sanctions-job.test.ts` — TC-1..TC-8. All GREEN 8/8.

**Key debug:** `INSERT OR IGNORE` in bun:sqlite 1.3.13 returns STICKY `lastInsertRowid` (previous insert's rowid) when a row is ignored — NOT 0. Must check `result.changes > 0` to detect actual insertions. Also Bun in-process test runner may leave `:memory:` singleton partially shared between tests within a file → used timestamped unique broker names in TC-3 to avoid cross-test contamination.

**Commit:** pending (this session)

**Total: 8 pass / 0 fail. tsc 0 errors. cronJobCount: 67.**

## Previous last session summary (1920g)

Task 1920g — Auto-populate prediction_claims from intelligenceCycleJob.

**Problem:** `insertPredictionClaim()` existed in `predictionClaimStore.ts` but had zero callers from the scheduled intelligence cycle. High-conviction chains (conviction >= 0.7) from `runChainSynthesis` were posted as signals but never recorded as prediction claims.

**What was done:**
- Exported two pure helpers from `intelligenceCycleJob.ts`: `mapChainAction()` (BUY→bullish, SELL→bearish, others→neutral) + `isoDatePlusDays(n)` (YYYY-MM-DD n days from now).
- Added `insertClaimFn` to `CycleDeps` + new `ChainSynthesisDeps` interface (with `_db` field for test DB injection).
- `runChainSynthesis(deps: ChainSynthesisDeps = {})` — after `postSignal` for conviction >= 0.7, calls `insertClaimFn` (or real store) with full `PredictionClaimInput`. try/catch non-fatal (console.warn only, AC-6).
- Forwarded `insertClaimFn` from `CycleDeps` → `ChainSynthesisDeps` in `_runCycle` Step G.
- 15/15 tests GREEN: TC-1..TC-7 cover all ACs.

**Key debug:** cycleId format mismatch (`cycle-${ms}` vs `YYYYMMDD-HHMM`). Fixed by replicating `computeCycleId` logic in test. Also needed full `agent_signals` schema with all columns for `postSignal` feature-detection. TC-2 seeded directly (confidence=0.5, no bonus flags) to avoid confirms_direction bonus pushing conviction >= 0.7.

**Commit:** `81efd36a feat(1920/scheduler): 1920g auto-populate prediction_claims from chain synthesis`

**Total: 15 pass / 0 fail. tsc 0 new errors.**

## Previous last session summary (1920c)

Task 1920f — Activate signal_quality_audit writer.

**Problem:** `prepareSignalAuditRecord()` existed in domain but no infrastructure store existed, so `signal_quality_audit` table stayed at zero rows at runtime.

**What was done:**
- Created `apps/mcp-server/src/infrastructure/db/signalQualityAuditStore.ts` — `insertSignalQualityAudit(db, record)` with INSERT OR IGNORE (UNIQUE signal_id dedup). Fire-and-forget: errors caught with `console.warn`, never re-thrown.
- Wired in `agentSignalTools.ts` `post_agent_signal` handler after `postSignal()` call. Gate: `signal_type IN ['price_confirmation', 'urgent_news']` AND `finding_data.confidence` is a number. FR-3/FR-4 mapping: confidence × 100 (agent 0.0–1.0 → audit 0–100), `price_confirmation` → `signal_type='price'`, `urgent_news` → `signal_type='news'`.
- Added imports: `insertSignalQualityAudit`, `prepareSignalAuditRecord`, `SignalAuditContext`.
- Wrote 15 tests in `1920f-signal-quality-audit.test.ts` — AC-1 through AC-6. All GREEN 15/0.

**Commit:** `bdd63efb feat(1920/signals): 1920f activate signal_quality_audit writer`

**Total: 15 pass / 0 fail.**

## Previous last session summary (1920c)

Task 1920c — Commodity Tracker + Shipping Index Refresh Scheduler Job.

**Problem:** `commodity_prices`/`commodity_prices_history` tables (written by `yahooFinance.ts`) and `tracked_indicators` shipping rows (written by `shippingIndex.ts`) had zero scheduler callers. Stale commodity data produces silent regime mis-classification in financial-analyst.

**What was done:**
- Created `apps/mcp-server/src/scheduler/macro/commodityTrackerRefreshJob.ts` — `runCommodityTrackerRefreshJob(opts?)` with full DI seam (`fetchCommodityFn`, `storeCommodityFn`, `fetchShippingFn`, `storeShippingFn`, `sendWorkFn`).
- Block 1 (FR-1): calls `fetchYahooFinancePrices()` + `storeCommoditySnapshot()` — commodity_prices INSERT OR REPLACE + commodity_prices_history append.
- Block 2 (FR-2): calls `fetchShippingIndices()` + `storeShippingIndices()` — tracked_indicators shipping rows.
- Independent try/catch per block (FR-3): commodity failure does NOT abort shipping call and vice-versa.
- Fail-loud WORK channel alert on any block error.
- Added `commodityTrackerRefresh: '0 6 * * *'` to `cronConfig.ts` (FR-5).
- Added `runCommodityTrackerRefreshJob` export to `scheduler/macro/index.ts`.
- Wired `cron.schedule(CRONS.commodityTrackerRefresh, ...)` in `startScheduler.ts` via `jobRunRepo.wrapRun` (FR-6).
- TODO(1920c) comment added for future db injection refactor (NFR-2).
- Wrote 7 tests in `1920c-commodity-tracker-refresh-job.test.ts` — TC-1..TC-7 covering all ACs. All GREEN 7/7.

**Note:** Spec mentions `commodityTracker.ts` as writer but the actual `commodity_prices`/`commodity_prices_history` writer is in `yahooFinance.ts` (`storeCommoditySnapshot`). Used the correct file.

**Commit:** `d72ab005 feat(1920/scheduler): 1920c commodity tracker + shipping index refresh job`

**Total: 7 pass / 0 fail. cronJobCount: 66, schedulerFileCount: 65.**

## Previous last session summary (1920a)

Task 1920a — vnstock Fundamentals + Trading Stats Scheduler Job.

**Problem:** `vnstockStore.ts` has writers for 7 tables but zero scheduler callers. Data only populated on-demand via MCP tool `syncVnstockData.ts`. Tables go stale after initial seed; no periodic refresh.

**What was done:**
- Created `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` — exports `runVnstockFundamentalsJob(opts?)` and `runVnstockTradingStatsJob(opts?)` with DI seam (`tickers`, `syncFn`, `sendWorkFn`, `_resetRunningState`).
- Two cron entry-points: `runVnstockFundamentalsJobCron()` (Mon 01:00 UTC, wrapped in `recordJobRun`) and `runVnstockTradingStatsJobCron()` (weekdays 08:30 UTC).
- `isRunning` concurrency guard (module-level, separate per job) — prevents double-stack on 7-10min sweep.
- Per-ticker try/catch in `runSweep()` — one failure logs warning + appends to `failed[]`, sweep continues.
- `syncVnstockData` called sequentially per ticker (not `Promise.all`) — preserves 2500ms rate-limit delay.
- Fail-loud WORK channel when `failed.length > 0` at sweep completion.
- Watchlist: read from `docs/data/stock-classification.json` (same as bctcBatchSweepJob).
- Added `vnstockFundamentalsRefresh: '0 1 * * 1'` + `vnstockTradingStatsRefresh: '30 8 * * 1-5'` to `cronConfig.ts`.
- Wired import + two `cron.schedule` calls in `startScheduler.ts`.
- Wrote 8 tests in `1920a-vnstock-fundamentals-job.test.ts` covering TC-1 isRunning guard, TC-2 per-ticker isolation, TC-3 sequential calls, TC-4 WORK alert, AC-1 cron expression assertions. All GREEN 8/8.

**Commit:** `bb6015d5 feat(1920/scheduler): 1920a vnstock fundamentals + trading stats jobs`

**Total: 8 pass / 0 fail. cronJobCount: 65, schedulerFileCount: 64.**

## Previous last session summary (1920b)

Task 1920b — Bond Maturity Poller scheduler job.

**Problem:** `bond_maturity` table only populated by manual seed or on-demand MCP calls. Zero scheduler jobs called `upsertBond()`. Silent wrong signals for downstream agents consuming `get_bond_maturity_calendar`.

**What was done:**
- Created `apps/mcp-server/src/scheduler/macro/bondMaturityPollerJob.ts` — `runBondMaturityPollerJob(opts?)` with DI seam (`fetchFn` + `sendWorkFn`). FR-1..FR-4 implemented (upsert, zero-row WORK alert, fail-loud, recordJobRun via `jobRunRepo.wrapRun`).
- AC-0: vnstock domain seed data (direct from France, no VPS). Uses `getUpcomingMaturities(36m)` from `bondMaturityTracker.ts` as production fetchFn until live HTTP fetcher added.
- Added `bondMaturityPoller: '30 2 * * 0'` to `cronConfig.ts`.
- Wired import + `cron.schedule` in `startScheduler.ts`.
- Added export in `scheduler/macro/index.ts`.
- Wrote 4 tests in `1920b-bond-maturity-poller.test.ts` — TC-1 success, TC-2 zero-row alert, TC-3 error no-rethrow, TC-4 upsert idempotency. All GREEN 4/4.

**Commit:** `89c70d04 feat(1920/macro): 1920b bond maturity poller scheduler job`

**Total: 4 pass / 0 fail. cronJobCount: 63.**

## Previous last session summary

Task 1918a — `get_macro_snapshot` shape guard for alert-commander stage-bootstrap.

**Problem:** TNB c55 cycle-2 evidence: `get_macro_snapshot` returns `{"status":"degraded","message":"..."}` (system_status bleed) instead of `{"text":"...","fetchedAt":"...","source_tier":2}`. The retry-once logic in stage-bootstrap.md only handles call failure, not shape mismatch — so wrong-shape response is silently accepted and regime inference fails.

**What was done:**
- Created `apps/mcp-server/src/interface/mcp/tools/macro/macroSnapshotGuard.ts` — exports `isMacroSnapshotValidShape(value: unknown): boolean`. Guard: object must have `text` field of type string. All other shapes (system_status, error, null, primitive) → false.
- Wrote test first (TDD RED): `1918a-macro-snapshot-shape-guard.test.ts` — 10 tests covering normal payload, minimal payload, `{status:degraded}` fixture (core), error payload, edge cases. Confirmed RED (module not found). Then created guard. GREEN: 10/10.
- Updated `.claude/flows/alert-commander/stage-bootstrap.md` Step 0b: added **Shape-validation gate** paragraph. Gate applies to both initial attempt and retry. Shape mismatch → news-fallback, same path as call failure + `[WARN]` log.
- Created `docs/handoffs/TASK_1918a.md`.
- Updated `docs/TASKS.md` — 1918a moved to Review.

**Commit:** `62697623 fix(1918a/flows): 1918a macro snapshot shape guard + stage-bootstrap gate`

**Total: 10 pass / 0 fail. tsc 0 errors.**

## Previous last session summary

Task 1899a-bloomberg-test-split — Split `1899a-bloomberg.test.ts` (491L, untracked) into 4 files ≤200L.

**What was done:**
- Created 4 split files in `apps/news-fetch/__tests__/`:
  - `1899a-bloomberg-dom.test.ts` — 189L, 12 expect(), DOM happy path (8 it) + maxItems (1 it)
  - `1899a-bloomberg-json-fallback.test.ts` — 182L, 8 expect(), JSON __NEXT_DATA__ fallback (5 it)
  - `1899a-bloomberg-perimeterx-lifecycle.test.ts` — 186L, 14 expect(), PX (2 it) + lifecycle close() (3 it) + error handling (2 it), sub-describes flattened to control line count
  - `1899a-bloomberg-normalize-date.test.ts` — 51L, 7 expect(), pure function, no mock.module
- Source file deleted from disk (was never committed to git — untracked)
- Each file carries own `mock.module('playwright', ...)` + `await import(...)` preamble (Bun per-file mock isolation)
- preamble trimmed in dom file to inline the locator logic and shorten helper function bodies to land ≤200L

**Total: 29 pass / 0 fail, 41 expect() = parity. tsc 0 errors.**

**Commit:** `40747a58 refactor(1899a/news-fetch): split bloomberg 491L test into 4 files ≤200L each`

**Branch:** main

**Note on full suite baseline:** `bun test apps/news-fetch/` = 172 pass / 0 fail. `pnpm test:all` (mcp-server) crashes Bun 1.3.13 with OOM — pre-existing issue unrelated to this change.

## Previous last session summary

Task 1914b — Fix `log_agent_work` two-call pattern documentation in all 10 agent package files.

**Root cause:** All 10 `.claude/tools/package/*.md` files documented `log_agent_work` with a fictitious single-call signature (`action/context/signal_ids`). The actual MCP API (`agentWorkLogTools.ts`) requires: Call 1 (`status: "running"` → `{ id }`), Call 2 (`id + status: "completed"|"error"`).

**What was done:** Docs-only. Table rows corrected, two-call recipe block added to each file. Broken example snippets in `report-analyzer.md` and `po.md` also fixed. All 10 files `Last Updated` bumped to 2026-05-15. `TASK_1914b.md` handoff written. 1914b moved to Done in TASKS.md.

**Commit:** `3b68df2c docs(1914b/agent-doc): 1914b fix log_agent_work two-call pattern in all 10 package files`

**Branch:** main

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass.
- Before every commit: `bun tsc --noEmit` must exit 0.
- docs/data/ is gitignored — use `git add -f docs/data/*.json` for stats files.
- Semble search before grep for exploration.
- Worktree sessions: verify CWD and merge from parent main if worktree branch is behind.
- mock.module() must be declared before module import in Bun test files.
- NEVER use `git commit -am` — greedily absorbs staged index content (C2 atomicity violation, c47 incident SHA 8bec73d3).
- `mock.calls[0]` TS type is `[]` (empty tuple) — cast via `as unknown as Array<[T]>` for tsc compliance.
- HEAD.lock from dead Spotlight/Docker process: verify no git process running, then `rm .git/HEAD.lock`. Recurring — permanent policy per head-lock-self-cure.md.
- Bun 1.3.13 OOM-crashes on mcp-server full suite (RAM 2.15GB peak → panic). Not our bug. Use per-service `bun test` for regressions.
- Test split strategy: each split file needs own mock.module + await import preamble (Bun per-file isolation). Trim preamble helpers not needed by the split group to control line count.

## Carry-over for next session

- toolCount in tool-registry.json = 125 (categories sum). Source code has ~137 server.tool() calls — categories list is stale by ~12 tools. Future task should add missing tools to categories.
- Branch `task/1881a-impl-ssot` awaiting QA gate — do NOT merge until QA approves.
- Branch `task/c86-autocure-mw-dedup` awaiting QA gate.
- Branch `task/c87-1903-doc-pair` awaiting QA gate.
- Branch `task/c88-1905a-news-fetch-stealth-fix` awaiting QA gate.
- Branch `task/c89-1906a-headlock-cure-permanent` awaiting QA gate.
- Branch `task/1916a-vps-discover-route` awaiting QA gate (VPS-side of 1916a).
