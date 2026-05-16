# Developer — Notebook

**Last updated:** 2026-05-17 | **Sprint:** 1924

## Last session summary (1924a/b/c/d)

Task 1924 — Wire live VN CPI into macro_indicators from /macro/external.

**Problem:** Investment clock showed Recovery (CPI=2.84 — 14 months stale). Live VN CPI is 5.46% (April 2026) from TradingEconomics text. With CPI=5.46 > 3.0, correct phase is Overheat (UP growth + HIGH inflation).

**What was done:**
- `clients.ts`: Added `getMacroExternalResponse` interface + `getMacroExternal()` function — calls `POST /macro/external`, never throws (returns null on error), used for CPI/GDP parsing.
- `macroIndicatorRefreshJob.ts`: Exported `parseCpiFromText(text)` — regex `(\d+\.?\d*)\s*percent/i`, first match → float, empty/no-match → null. Added `parseCpiFromExternal()` helper. Job now calls `getMacroExternal()` after `getMacroSnapshot()`; `parsedCpi` passed to upsert (replaces hardcoded null). COALESCE preserves existing DB value if parse returns null.
- `trading-economics-vn.ts` + `trading_economics_fetch.py`: Added `manufacturing_pmi: 'manufacturing-pmi'` slug to both `VN_TE_SLUGS` / `VN_SLUGS` dicts.
- 1924b DB patch: `docker exec ... UPDATE macro_indicators SET cpi=5.46` → 1 row updated, confirmed live.
- New test `1924a-vn-cpi-wiring.test.ts`: TC1 (5.46%), TC2 (4.65%), TC3 (empty→null), TC4 (investment clock CPI=5.46→HIGH→Overheat), TC5 (upsert cpi=5.46 persists, gdp_growth preserved via COALESCE). 5/5 GREEN. tsc 0 errors.
- TASKS.md: 1924a/b/c/d DONE row added.
- pipeline-state.json: status=idle.

## Last session summary (1923a)

Task 1923a — Investment clock case-mismatch fix + macroIndicatorRefreshJob full-field upsert.

**Problem:** `get_investment_clock_phase` always returned `insufficient_data`. Two bugs:
1. `investmentClockTools.ts` queried `WHERE country = 'Vietnam'` (capital V); DB has `'vietnam'` (lowercase) — SQLite `=` is case-sensitive.
2. `macroIndicatorRefreshJob.ts` upserted with `country='Vietnam'` creating a SECOND row instead of updating the existing one. Also only wrote `interest_rate`, leaving PMI/CPI/GDP/inflation_rate untouched.

**What was done:**
- `investmentClockTools.ts` L68: `"Vietnam"` → `"vietnam"`.
- `macroIndicatorRefreshJob.ts` upsert: country key `"Vietnam"` → `"vietnam"`. INSERT columns expanded to include `manufacturing_pmi`, `cpi`, `gdp_growth`, `inflation_rate`. ON CONFLICT SET uses `COALESCE(excluded.X, X)` for all macro fields — null-safe (snapshot doesn't provide these; existing DB values are preserved when snapshot sends null).
- New test file `1923a-investment-clock-case-fix.test.ts`: TC1 (row found with lowercase key), TC2 (uppercase returns null / lowercase finds row), TC3 (RECOVERY phase: gdpGrowth=7.4 UP, CPI=2.84 LOW), TC4 (upsert creates single row, no duplicate). 4/4 GREEN.
- TASKS.md: 1913 CLOSED STALE-RESOLVED, 1923a DONE.
- pipeline-state.json: status=idle, c143.

**Commit:** `7a0adfdc fix(1923a): investment clock — lowercase country key + refresh all macro fields`

**Full suite: 9533 pass / 37 fail (37 pre-existing baseline — all BCTC fixture failures, 0 regressions). tsc 0 errors.**

## Previous last session summary (1920i)


Task 1920i — Extend freshnessSlaMonitor to cover all Sprint 1920 tables.

**Problem:** `freshnessSlaMonitorJob` only monitored 5 original signal types. After Sprint 1920a–g landed, 7 new tables (`vnstock_financials`, `bond_maturity`, `commodity_prices`, `broker_sanctions`, `backtest_runs`, `signal_quality_audit`, `prediction_claims`) were actively written but unmonitored. Zero-row tables (not yet seeded) would produce NULL ages causing false breach alerts.

**What was done:**

- `freshnessSlaChecker.ts` (domain): Extended `SignalType` union from 5 → 12 types. Added 7 entries to `DEFAULT_SLA_CONFIG`: vnstock_fundamentals (72h), bond_maturity (168h), commodity_prices (36h), broker_sanctions (2160h), backtest_runs (36h), signal_quality_audit (48h), prediction_claims (168h). Updated `checkDataFreshnessSla` to iterate all 12 types with FR-4 sentinel skip guard (`ageMinutes === -1` → debug log + skip, no breach).
- `freshnessSlaMonitorJob.ts` (scheduler): Extended `querySignalAges` UNION ALL to 12 entries. FR-4 null guard: if `row.age_minutes === null`, set to `-1` sentinel instead of `Math.max(0, null)=0`. Defaults for original 5 changed from `0` to `-1` in initial `result` object (all empty tables return -1 now). Added `buildDailySummary()` exported function + `_lastSummaryDate` daily gate. Added `resetSummaryGate()` for test isolation. Added `sendWorkFn` 5th DI parameter to `runFreshnessSlaMonitor` (default: `sendTelegramWork`). Added `sendTelegramWork` import.
- `schema-system.ts`: Updated `sla_breach_audit` DDL CHECK constraint from 5 → 12 signal types. Added idempotent migration for existing production DBs (recreate-and-rename pattern, detects old constraint via `sqlite_master.sql`).
- `dataFreshnessTools.ts`: Updated `SIGNAL_QUERIES` and `signalAges` initializer with 7 new types.
- Updated 3 existing test files (1352c, 1407b, 234) to add 7 new keys at -1 to `signalAges` objects + inject `noopSendWork` to avoid real Telegram calls.

**Key debug:**
- `sla_breach_audit` had a CHECK constraint `signal_type IN ('price','bctc','news','sbv_fx','foreign_flow')` — needed idempotent migration (SQLite can't ALTER TABLE ADD CONSTRAINT). Used recreate-and-rename same as 1920d.
- `sendTelegramWork` default in `runFreshnessSlaMonitor` causes test timeout (5s) when the daily gate fires. Fix: `noopSendWork` injected in all tests that call `runFreshnessSlaMonitor`.
- A-5 in 1352c needed update: old behavior was `Math.max(0, NULL) = 0`; new behavior is `-1` sentinel for all empty tables.

**Commit:** `a4eac02c feat(1920/scheduler): 1920i extend freshnessSlaMonitor to cover all Sprint 1920 tables`

**Total: 23 new pass / 0 fail. tsc 0 errors. 63/63 total freshness SLA tests pass.**

## Previous last session summary (1920d)

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

**Commit:** `81efd36a feat(1920/scheduler): 1920g auto-populate prediction_claims from chain synthesis`

**Total: 15 pass / 0 fail. tsc 0 new errors.**

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
- Null guard / sentinel: when extending UNION ALL queries for new tables, always set default to -1 for new types in result object. Empty table → NULL from SQLite → -1 sentinel. Callers must skip -1 entries.
- sendWorkFn DI in runFreshnessSlaMonitor: always inject noopSendWork in tests to avoid 5s Telegram timeout. Never rely on default in test context.
- sla_breach_audit CHECK constraint migration: recreate-and-rename pattern (same as broker_sanctions in 1920d). Detect old constraint via `sqlite_master.sql.includes(...)`.

## Carry-over for next session

- toolCount in tool-registry.json = 125 (categories sum). Source code has ~137 server.tool() calls — categories list is stale by ~12 tools. Future task should add missing tools to categories.
- Branch `task/1881a-impl-ssot` awaiting QA gate — do NOT merge until QA approves.
- Branch `task/c86-autocure-mw-dedup` awaiting QA gate.
- Branch `task/c87-1903-doc-pair` awaiting QA gate.
- Branch `task/c88-1905a-news-fetch-stealth-fix` awaiting QA gate.
- Branch `task/c89-1906a-headlock-cure-permanent` awaiting QA gate.
- Branch `task/1916a-vps-discover-route` awaiting QA gate (VPS-side of 1916a).
- 1920b TC-4 pre-existing failure (upsert idempotency) — not caused by 1920i. Pre-dates this session.
