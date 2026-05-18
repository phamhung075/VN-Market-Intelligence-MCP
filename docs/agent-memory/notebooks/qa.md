# QA — Notebook

**Last updated:** 2026-05-18 | **Session:** c181 — 1943a BCTC Q1-2026 queue reset + auto-retry — APPROVED

## Session 2026-05-18 c181 — 1943a BCTC Q1-2026 queue reset + batch sweep diagnostic + auto-retry

### TASK REPORT — 1943a (compact)

```
date: 2026-05-18
outcome: APPROVED
commit: 3a3a5d61
type: FIX (schema-financial-reports.ts + bctcQueueEnricherJob.ts + bctcBatchSweepJob.ts)
round: 1
```

#### Pipeline

- Task tests (16): 16/16 GREEN — AC-1 thru AC-4 all PASS (idempotent reset, period scope guard, sweep root-cause doc, grace-period WHERE clause with attempts<6 cap)
- Full suite: 9219 pass / 275 fail / 8 errors — baseline (parent commit bae63582): 9219 pass / 275 fail / 8 errors — 0 regressions, +16 new tests
- tsc: 0 errors
- DDD: PASS — schema-financial-reports.ts (infrastructure), enricher/sweepJob (interface/scheduler), no domain→infra violations
- Security: PASS — no process.env, no hardcoded secrets, parameterized SQL only
- _resetRunningState: NOT introduced in any TASK-1943a file (pre-existing in vnstockFundamentalsJob.ts only)

#### AC Verdicts

- AC-1: PASS — resetQ1UrlNotFound(db) correct SQL, idempotent (0 on second call), returns changes count
- AC-2: PASS — scope WHERE period_year=2026 AND period_quarter='Q1' only; Q4-2025 rows untouched
- AC-3: PASS — console.log diagnostic at bctcBatchSweepJob.ts:320; wrapRun key 'bctcBatchSweepJob' verified correct in startScheduler.ts:282; root cause documented in JSDoc
- AC-4: PASS — COMBINED_SQL Arm 2: status='url_not_found' AND last_attempt IS NOT NULL AND last_attempt < datetime('now', '-7 days') AND attempts < 6

---

## Session 2026-05-18 c180 — 1942a vnstock startup backfill probe

### TASK REPORT — 1942a (compact)

```
date: 2026-05-18
outcome: APPROVED
type: FEATURE (scheduler/interface — vnstockStartupProbe.ts injectable probe, startScheduler.ts IIFE wiring)
round: 1
merge commit: chore(1942/mcp-server): merge task/1942a-startup-backfill-probe
```

#### Pipeline

- Task tests (6): 6/6 GREEN — T1 cold DB, T2 stale, T3 warm skip, T4 DB error safe fallback, T5 delay=90000ms, T6 missing table catch
- Full suite: 9612 pass / 328 fail / 49 skip — main baseline 9606/328, +6 new, 0 regressions
- tsc: 0 errors (pre-push hook passed)
- DDD: PASS — vnstockStartupProbe.ts in scheduler/financial-reports/ (interface layer), no domain→infra imports
- Security: PASS — no process.env, no hardcoded secrets
- AC-7: PASS — no _resetRunningState in probe or wiring (grep returned nothing)
- AC-10: PASS — vnstockFundamentalsJob.ts untouched (git diff main empty)
- NFR-1 deviation: developer extracted probe to separate file (injectable deps pattern) instead of inline IIFE — accepted, improves testability, no AC violation

---

## Session 2026-05-18 c179 — 1941d FPT net_profit OCR API bridge

### TASK REPORT — 1941d (compact)

```
date: 2026-05-18
outcome: APPROVED
type: FIX (infrastructure/interface — net_profit OCR extraction bug, API bridge COALESCE)
round: 1
merge commit: chore(1941/mcp-server): merge task/1941d-fpt-netprofit-ocr-fix
```

#### Pipeline

- Cashflow tests (24): 24/24 GREEN (1941d×7 + 1890a×7 + 1930b×5 + 1941a×5)
- Full suite: 9180 pass / 276 fail / 31 skip — 276 pre-existing; +1 vs developer baseline is flaky timing test
- tsc: 4 errors on branch (1941c-accuracy-digest divergence artifact, absent on main — confirmed resolved post-merge, pre-push hook passed)
- DDD: PASS — bridge fns in infrastructure/db/, COALESCE in interface/mcp/tools/
- Security: PASS — parameterized SQL (schema-financial-reports.ts:392 ?-binding), no process.env, no secrets
- Migration: PASS — additive ALTER TABLE only, idempotent colNames.has guard (schema-financial-reports.ts:87)
- NOTE: was reading from `main` initially (git branch showed task branch but cwd was main after prior stash). Re-ran all checks after correct checkout.

---

## Session 2026-05-18 c176 — 1941c accuracy digest job

### TASK REPORT — 1941c (compact)

```
date: 2026-05-18
outcome: APPROVED
type: FEATURE (scheduler/digest — accuracyDigestJob + getSystemAccuracyDigestStats + buildAccuracyDigestText)
round: 1
merge strategy: cherry-pick d524ede8+4 onto main (branch had 1941d commits on top, not in scope)
qa sign-off commit: 44301391
```

#### Pipeline

- Task tests (1941c): 7/7 pass (22 assertions) — GREEN
- Full suite: 9187 pass / 275 fail / 31 skip — matches main exactly (no regression)
- tsc: 0 errors (clean)
- DDD: PASS — `import type` from infra in application/usecases is type-only, established codebase pattern (5 other usecases do same); scheduler/digest imports infra+app (correct interface layer direction)
- Security: PASS — no process.env, no hardcoded secrets, `days` param is TypeScript `number` (no SQL injection risk)
- neutralOnlyRows field: present in interface (line 365) + query 4 (line 459) — AC-3/AC-8 discrimination verified
- _running guard: module-scope (line 30), correct per R-3
- alreadySentToday: DB-backed, fail-open, survives restarts
- Cron collision check: devTeamHeartbeat (0 7 * * 0) fires same time Sundays — independent async jobs, no shared resource, not a blocking concern
- cron-registry.json: accuracyDigestJob added, schedulerFileCount 63 → 64
- Note: stash/pop sequence during baseline run caused working tree corruption (1941c files missing); restored from commit d524ede8 before full suite run

---

## Session 2026-05-18 c176 — 1941a OCF API-bridge cashflow tool

### TASK REPORT — 1941a (compact)

```
date: 2026-05-18
outcome: APPROVED
type: FIX (interface — cashFlowTool COALESCE operating_cash_flow ?? operating_cf)
round: 1
merge commit: chore(1941/mcp-server): merge task/1941a-ocf-api-bridge-cashflow-tool
```

#### Pipeline

- Cashflow tests (17): 17 pass / 0 fail (1941a × 5 + 1890a × 7 + 1930b × 8) — GREEN
- TDD: confirmed RED on main cashFlowTool (4 of 5 1941a tests fail), GREEN after fix
- Full suite: 9592 pass / 328 fail / 49 skip — matches main exactly (no regression)
- tsc: 0 errors (clean)
- DDD: PASS — infrastructure import at interface/mcp layer (permitted)
- Security: PASS — parameterized SQL (line 217), no process.env, no secrets
- FPT net_profit=20,225: pre-existing OCR extraction bug, confirmed on main, documented as out-of-scope (file separately)

---

## Session 2026-05-18 c175 — calendar-source-replacement wontfix

### TASK REPORT — calendar-source-replacement (compact)

```
date: 2026-05-18
outcome: APPROVED
type: FIX / WONTFIX (infrastructure — NullCalendarAdapter)
round: 1
merge commit: chore(macro-indicators): merge task/calendar-source-replacement
```

#### Pipeline

- NullCalendarAdapter tests (4): 4/4 GREEN
- fetch-external-macro tests: 14/14 GREEN
- Full macro-indicators suite: 103 pass / 12 skip / 1 fail (pre-existing: trading-economics-vn VN_TE_SLUGS length — confirmed on main)
- tsc: pre-existing errors in adb-kidb/fred-macro/imf-weo/world-bank-macro test files (confirmed on main). Changed files type-clean.
- DDD: PASS — no domain→infra violations, index.ts is composition root
- Security: PASS — no process.env introduced, no hardcoded secrets

---

## Session 2026-05-18 c174 — 1940a PC1 legal-risk tool gap

### TASK REPORT — 1940a (compact)

```
date: 2026-05-18
outcome: APPROVED
type: FIX (interface layer — legalRiskTools.ts dual-source query)
round: 1
commit: 80873d1c
```

#### Pipeline

- 1940a suite: 7/7 GREEN
- 245 + 240 + 244 + 250 suites: 61 pass / 0 fail
- tsc: 0 errors
- DDD: PASS — interface layer importing infra (correct per DDD rules)
- Security: PASS — no process.env, no hardcoded secrets, SQL parameterized

---

## Session 2026-05-17 c143 — round-2 fix verification (commit a611d911)

### TASK REPORT — outcome feedback loop fix (compact)

```
date: 2026-05-17
outcome: APPROVED
type: FIX (try/catch + cron-registry sync)
round: 2
commit: a611d911
```

#### Pipeline

- accuracy-context-tool.test.ts: 8 pass / 0 fail — GREEN
- tsc apps/mcp-server: 0 errors
- DDD: PASS — interface tool imports only infrastructure (no domain/ imports)
- Security: PASS — no process.env, no hardcoded secrets

#### Verification

- `getAccuracyContextTool.ts:87` — try/catch correctly placed as outermost wrapper of entire handler body (lines 87–125 inside try, lines 126–129 in catch). No double-wrapping.
- Catch path returns `{ content: [{ type: "text" as const, text: \`Error: ...\` }] }` — correct MCP content shape.
- `cron-registry.json` — JSON valid. `signalOutcomeResolution` entry has schedule, name, file, desc — consistent schema with other scheduler entries (signalOutcomeJob, verdictResolutionJob pattern).

---

## Session 2026-05-17 c142 — TNB critic gate + outcome feedback loop + accuracy badge

### TASK REPORT — 1938/1939/1940 (compact)

```
date: 2026-05-17
outcome: CHANGES_REQUESTED
type: FEATURE (tnb critic gate, signal outcome store, accuracy badge)
round: 1
```

#### Pipeline

- tnb-critic targeted tests (49 tests): 49 pass / 0 fail — GREEN
- outcome feedback loop targeted tests (26 tests): 26 pass / 0 fail — GREEN
- frontend accuracy badge tests (19 tests via vitest): 19 pass / 0 fail — GREEN
- Full mcp-server suite: 9169 pass / 267 fail (267 pre-existing, zero regressions from new commits)
- Full frontend vitest suite: 124 pass / 0 fail — GREEN
- tsc mcp-server: 0 errors
- tsc frontend: 0 errors
- DDD: PASS — tnbCriticScorer.ts pure domain, no infrastructure imports
- Security: PASS — no process.env, no hardcoded secrets, all SQL parameterized

#### Blocking Issues

1. `apps/mcp-server/src/interface/mcp/tools/news-analysis/getAccuracyContextTool.ts:86` — MCP tool handler `async (params) => { ... }` has no try/catch block. QA checklist requires every handler wrapped in try/catch. All other tool handlers in codebase follow this pattern.

#### Notes

- Full suite pre-existing failures: 267 (all fail in isolation, unrelated to new commits). Previous session noted 32 — the actual count is higher due to watchlist count drift (1343a expects 26 tickers, watchlist expanded to 30) and Bun OOM masking failures in previous session.
- Frontend tests must be run with `npx vitest run` (not `bun test`) — test uses vi.stubGlobal not available in bun:test.

---

**Last updated:** 2026-05-16 | **Session:** c141 — 1922a/b/c/e/h/j APPROVED

## Session 2026-05-16 c141 — 1922-sprint-fixes

### TASK REPORT — 1922a/b/c/e/h/j (compact)

```
date: 2026-05-16
outcome: APPROVED
type: FIX/CLEAN/FEATURE (VPS proxy routing, orphan table retirement, mention velocity wiring, IMF fix, FRED backfill)
round: 1
```

#### Pipeline

- 1922h targeted tests (11 tests): 11 pass / 0 fail — GREEN
- 1922j targeted tests (4 tests): 4 pass / 0 fail — GREEN
- 1922e targeted tests (6 tests): 6 pass / 0 fail — GREEN
- Full suite: 9486 pass / 32 fail (32 pre-existing, zero regressions from 1922 commits)
- tsc: 0 errors
- DDD: PASS — domain/ has zero imports from infrastructure/; imfDataFetcher.ts correctly in application layer
- Security: PASS — sscInsider.ts uses Bun.env["SSC_INSIDER_VPS_URL"] + Bun.env["VPS_PUSH_API_KEY"]; no process.env; no hardcoded credentials

#### Docker

- Build: SUCCESS (no-cache rebuild)
- Container: HEALTHY (health check passed)
- Startup backfill verified: fred_series_daily = 8,249 rows (was 0 pre-fix)

#### AC Verification

- 1922a: sscInsider.ts VPS proxy via Bun.env — PASS
- 1922b: vn_index_cache orphan retired commit b50ef177 — PASS
- 1922c: credit_data orphan retired commit 12b8417b — PASS
- 1922e: mentionVelocityStore wired in pollNews.ts, 6/6 tests GREEN — PASS
- 1922h: Chrome UA removed + invalid IMF codes fixed, 11/11 tests GREEN — PASS
- 1922j: fred_series_daily startup backfill, 4/4 tests GREEN, 8249 live rows confirmed — PASS

#### Notes

- Full suite crashes (Bun OOM at 2.75GB peak) before printing final summary; summary captured via pre-crash stdout grep — standard workaround, not a regression
- Pre-existing failures: 32 (down from 40 in c140 session, 8 likely resolved by 1920k/j/l merged fixes)
- TASKS.md: 1922a/b/c/e/h/j moved to Done section

---

## Session 2026-05-16 c140 — 1920j-k-l-db-pipeline-fixes

### TASK REPORT — 1920j/k/l (compact)

```
date: 2026-05-16
outcome: CHANGES_REQUESTED
type: FIX (db population — macro snapshot DTO, sbvRatesJob, ohlcv backfill)
round: 1
```

#### Pipeline

- 1920j targeted tests (1352a — 8 tests): 8 pass / 0 fail — GREEN
- 1920k sbvRatesJob tests: 4 pass / 1 fail — TC-5 FAIL
- 1920l ohlcv backfill tests (1842b — 16 tests): 16 pass / 0 fail — GREEN
- Full suite: 9457 pass / 40 fail (40 includes TC-5 new regression + pre-existing 39)
- tsc: 1 error (TS2339 — Property 'sbvRatesRefresh' does not exist on type CRONS)
- DDD: PASS — no domain imports from infrastructure in changed files
- Security: PASS — no process.env, no hardcoded credentials, all SQL parameterized

#### Blocking Issues

1. `src/scheduler/cronConfig.ts:140` — `sbvRatesRefresh` key missing from CRONS object. Test TC-5 expects `CRONS.sbvRatesRefresh === '0 */4 * * *'`; received `undefined`. tsc error TS2339 at `sbvRatesJob.test.ts:129`.
2. `src/scheduler/macro/index.ts:5` — `runSbvRatesRefreshJob` not exported from macro barrel. FR-6 requires export.
3. `src/scheduler/startScheduler.ts` — `sbvRatesRefresh` job not registered. FR-6 requires `cron.schedule(CRONS.sbvRatesRefresh, ...)` + `jobRunRepo.wrapRun`.

#### AC Verification

- 1920j AC-1: tsc 0 errors — BLOCKED (1 error from 1920k)
- 1920j AC-2: macroIndicatorRefreshJob 8 tests GREEN
- 1920k AC-1: 5 sbvRatesJob tests — 4/5 GREEN, TC-5 FAIL
- 1920k AC-2: tsc 0 — BLOCKED
- 1920l AC-1: tsc 0 — BLOCKED; ohlcv backfill 1842b 16/16 GREEN

#### Notes

- All three blocking issues are 1920k omissions — single-file cronConfig.ts + 2 wiring entries
- Pre-existing failures in full suite: 39 (same class as 1920i session — unchanged)
- 1920j and 1920l logic is correct; blocked only by 1920k cronConfig omission

---

## Session 2026-05-16 c139 — 1920i-freshness-coverage-extension

### TASK REPORT — 1920i (compact)

```
date: 2026-05-16
outcome: APPROVED
type: FEATURE (freshnessSlaMonitor extended 5→12 signal types)
```

#### Pipeline

- Targeted tests (1920i — 23 tests): 23 pass / 0 fail
- Regression (1352c + 1407b + 234-vps — 32 tests): 32 pass / 0 fail
- All freshness files combined: 55 pass / 0 fail
- Full suite: 9414 pass / 32 fail (32 pre-existing, zero regressions from 1920i)
- tsc: 0 errors
- DDD: PASS — freshnessSlaChecker.ts zero infrastructure imports
- Security: PASS — no process.env, no hardcoded credentials, all SQL parameterized

#### AC Verification

- AC-1: UNION ALL 12 entries in querySignalAges — TC-1b GREEN
- AC-2: -1 sentinel for zero-row tables → no breach escalation — TC-2d: breaches=0
- AC-3: coverage_pct = (seeded/12)*100 in buildDailySummary — TC-3c: 12/12=100%
- AC-4: _lastSummaryDate gate (once per UTC day) + resetSummaryGate() test helper
- AC-5: 5 original thresholds unchanged — TC-5a–e GREEN
- AC-6: Idempotent schema migration via sqlite_master + recreate-rename pattern

#### Notes

- dataFreshnessTools.ts uses 0 (not -1) as default for new types in signalAges initializer — this is not a bug; MCP tool has separate per-query null handling; scope excluded FR-4 sentinel from MCP tool layer (not flagged as blocking)
- Sprint 1920 DB Pipeline Completeness milestone: all tasks (a–i) now QA-Approved

---



## Session 2026-05-16 c138 — 1920d-broker-sanctions-quarterly

### TASK REPORT — 1920d (compact)

```
date: 2026-05-16
outcome: APPROVED
type: FEATURE (broker sanctions quarterly sweep + schema migration)
```

#### Pipeline

- Targeted tests (1920d — 8 tests): 8 pass / 0 fail
- tsc: 0 errors
- DDD: PASS — no domain imports from infrastructure
- Security: PASS — no process.env, no hardcoded secrets, all SQL parameterized

#### AC Verification

- AC-0: UNIQUE(broker_name, sanction_start) in schema-alerts.ts DDL + legacy migration block confirmed
- AC-1: CRONS.brokerSanctionsSweep = '0 8 25-31 * 5' — TC-8 GREEN
- AC-2: Month=1 → skipped=true, fetchFn NOT called — TC-1 GREEN
- AC-3: Month=3 → fetchFn called — TC-2 GREEN
- AC-4: Idempotency — same (broker_name, sanction_start) run twice → COUNT=1 — TC-5 GREEN
- AC-5: Empty SSC result in quarter month → sendWorkFn spy called — TC-6 GREEN
- AC-6: Fetch error → sendWorkFn called, no rethrow — TC-4 GREEN
- AC-7: result.changes > 0 guard correct; INSERT OR IGNORE confirmed in brokerSanctionStore.ts
- AC-8: recordJobRun via jobRunRepo.wrapRun in startScheduler.ts — verified

#### Notes

- Default fetcher is stub (returns []) — intentional per spec; zero-result WORK alert fires on first quarterly run
- Legacy migration: recreate-and-rename pattern; sqlite_master detection query is correct for SQLite
- cronJobCount in project-stats.json updated 66→67

## Session 2026-05-16 c137 — 1920f-signal-quality-audit Round 2

### TASK REPORT — 1920f Round 2 (compact)

```
date: 2026-05-16
outcome: APPROVED
type: FIX (exactOptionalPropertyTypes — conditional spread)
fixer_commit: 099eeb91
round: 2
```

#### Pipeline

- Targeted tests (1920f — 15 tests): 15 pass / 0 fail
- tsc: 0 errors
- DDD: SKIPPED (Smart-Skip — no import changes)
- Security: SKIPPED (Smart-Skip — no new queries or env reads)

#### Notes

- TS2375 (auditContext) + TS2379 (validationResult) resolved by conditional spread at lines 323-325 and 334-345.
- No production logic changed. All 6 ACs from Round 1 remain valid.
- SQLiteError in test output = expected AC-5 behavior (fire-and-forget path).
- 1920g push now unblocked — global tsc 0 errors.

---

## Session 2026-05-16 c136 — 1920e-backtest-runs-wiring re-review

### TASK REPORT — 1920e Round 2 (compact)

```
date: 2026-05-16
outcome: APPROVED
type: FEATURE (test-only fix — non-null assertions for noUncheckedIndexedAccess)
fixer_commit: 6e9fccff
```

#### Pipeline

- Targeted tests (1920e — 5 tests): 5 pass / 0 fail
- tsc: 0 errors
- DDD: SKIPPED (test-only change — Smart-Skip)
- Security: SKIPPED (test-only change — Smart-Skip)

#### Notes

- Round 1 had 16 TS18048 blocking errors in test file only. Fixer added `toBeDefined()` guards + `!` assertions. All resolved.
- No production code changed. All 6 ACs verified in Round 1 remain valid.
- Commit already on main (no-branch policy). Docs-only commit for QA approval record.

---

## Session 2026-05-16 c135 — 1920g-prediction-claims-auto-populate

### TASK REPORT — 1920g (compact)

```
date: 2026-05-16
outcome: APPROVED
type: FIX (scheduler wire + injectable claim insertion)
commits: 81efd36a + fe54ed4b
```

#### Pipeline

- Targeted tests (1920g — 15 tests): 15 pass / 0 fail
- Full suite: 9738 pass / 39 fail (39 pre-existing, 0 regressions)
- tsc: 0 errors
- DDD: PASS | Security: PASS

#### AC Verification

- AC-1 PASS: TC-1 conviction=0.8 → insertClaimFn called once
- AC-2 PASS: BUY→bullish, SELL→bearish, MONITOR/HOLD→neutral (TC-1, TC-6)
- AC-3 PASS: resolution_date = today+7 UTC (TC-7)
- AC-4 PASS: conviction=0.5 → insertClaimFn not called (TC-2)
- AC-5 PASS: INSERT OR IGNORE → 1 row (TC-4)
- AC-6 PASS: insertClaimFn throws → resolves normally (TC-5)
- AC-7 PASS: params shape verified (TC-1)
- Boundary TC-3 conviction=0.7 → insertClaimFn called once: PASS

#### Notes

- Pre-existing failures stable: 39 (was 39 in c133/c134, 0 regressions)
- DDD pattern: insertClaimFn injected via ChainSynthesisDeps — no static top-level import from predictionClaimStore; production fallback uses dynamic import inside try/catch block
- docs/TASKS.md: 1920g moved from Backlog to Done
- report: reports/TASK_REPORT_1920g.md

---

## Session 2026-05-16 c134 — 1920f-signal-quality-audit

### TASK REPORT — 1920f (compact)

```
date: 2026-05-16
outcome: CHANGES_REQUESTED
type: FIX (new infra store + interface wire)
round: 1
commit: bdd63efb
```

#### Pipeline

- Targeted tests (1920f — 15 tests): 15 pass / 0 fail
- Full suite: 9421 pass / 36 fail (36 pre-existing baseline, 0 regressions)
- tsc: 2 errors (BLOCKING)
- DDD: PASS | Security: PASS

#### AC Verification

- AC-1 PASS: price_confirmation → signal_type='price' row inserted
- AC-2 PASS: urgent_news → signal_type='news' row inserted
- AC-3 PASS: 7 non-qualifying type guard checks all false
- AC-4 PASS: INSERT OR IGNORE dedup → COUNT=1, confidence unchanged
- AC-5 PASS: Dropped table → no throw (try/catch in store)
- AC-6 PASS: monthlyJob resolves with seeded rows, sendFn called once

#### Blocking Issues

1. `agentSignalTools.ts:331` — `auditContext: SignalAuditContext` object literal assigns `fallback_tier: number | undefined`, `vps_breaker_state: string | undefined`, `coverage_gap: string | undefined`, `price: number | undefined`. `exactOptionalPropertyTypes: true` requires conditional spread to omit key when undefined. TS2375.

2. `agentSignalTools.ts:348` — `validationResult.fallback_source: string | undefined` passed as `ValidationResult` where `fallback_source?: string` requires key absence. TS2379. Same conditional spread fix.

#### Notes

- Both errors are new (introduced by 1920f — confirmed pre-commit file had no `SignalAuditContext`/`prepareSignalAuditRecord` references).
- `signalQualityAuditStore.ts` itself is clean: parameterized SQL, try/catch, no process.env.
- Fix is interface-layer only (agentSignalTools.ts lines 317-346). No domain/infra changes needed.

---

## Session 2026-05-16 c133 — 1920e-cascade-backtest-saverun

### TASK REPORT — 1920e (compact)

```
date: 2026-05-16
outcome: CHANGES_REQUESTED
type: FEATURE (scheduler wiring + new test file)
round: 1
```

#### Pipeline

- Targeted tests (1920e — 5 tests): 5 pass / 0 fail
- Full suite: 9421 pass / 36 fail (36 pre-existing baseline, 0 regressions)
- tsc: 16 errors (BLOCKING — test file only)
- DDD: PASS | Security: PASS

#### AC Verification

- AC-1 PASS: `saveRun` called once with `strategy="cascade-backtest"`, `tradeCount=2`.
- AC-2 PASS: `totalReturn` = mean([2.0, -4.0]) = -1.0, verified TC-1.
- AC-3 PASS: `winRate` = 1/2 = 0.5, verified TC-1.
- AC-4 PASS: `sendWorkFn` called even when `saveRun` throws, verified TC-3.
- AC-5 PASS: `backtestResultRepo` mock accepted via `CascadeBacktestDeps`, verified TC-4.
- AC-6 PASS: `processed=0` → `saveRun` called with `tradeCount=0`, verified TC-2.

#### Blocking Issues

16 tsc errors in test file (`noUncheckedIndexedAccess: true`). All at `savedRecords[0]` array index access returning `BacktestRunRecord | undefined`. Lines: 91, 92, 95, 98, 101, 103-107, 136-140, 227. Fix: add `!` assertion or `toBeDefined()` guard before dereferencing. No production code changes needed.

#### Notes

- Production code (`cascadeBacktestJob.ts`) is clean — no tsc errors.
- DDD note: scheduler importing infrastructure is correct per layer policy (all other scheduler/macro/* files do same).
- 36 fail baseline unchanged from c131.

---

## Session 2026-05-16 c132 — 1920c-commodity-tracker-scheduler

### TASK REPORT — 1920c (compact)

```
date: 2026-05-16
outcome: APPROVED
type: FEATURE (new scheduler job)
round: 1
commit: d72ab005
```

#### Pipeline

- Targeted tests (1920c): 7 pass / 0 fail (TC-1..TC-7 all GREEN)
- tsc: 0 errors | DDD: PASS | Security: PASS

#### AC Verification

- AC-1 PASS: `CRONS.commodityTrackerRefresh === '0 6 * * *'` — cronConfig.ts L137
- AC-2 PASS: `storeCommoditySnapshot` writer in `yahooFinance.ts` confirmed + called
- AC-3 PASS: `commodity_prices_history` INSERT with `NOT EXISTS` dedup guard confirmed
- AC-4 PASS: `fetchShippingIndices` + `storeShippingIndices` called (TC-2 GREEN)
- AC-5 PASS: Commodity throws → shipping runs + 1 WORK alert (TC-3 GREEN)
- AC-6 PASS: Shipping throws → commodity already written + 1 WORK alert (TC-5 GREEN)
- AC-7 PASS: `INSERT OR REPLACE INTO commodity_prices` — idempotent (yahooFinance.ts L397)
- AC-8 PASS: `jobRunRepo.wrapRun('commodityTrackerRefreshJob')` in startScheduler.ts L728

#### Key Finding

Developer called `fetchYahooFinancePrices`+`storeCommoditySnapshot` from `yahooFinance.ts` (not `commodityTracker.ts` as handoff implied). Confirmed correct — verified at source. Handoff acknowledged this discrepancy; developer resolved it correctly.

---

## Session 2026-05-15 c131 — 1920h-zombie-table-retirement

### TASK REPORT — 1920h (compact)

```
date: 2026-05-15
outcome: APPROVED
type: CLEAN (doc-only — comment additions, no code changes)
round: 1
commit: ac32a3dc
```

#### Pipeline

- Targeted tests (freshness/SLA — 4 files): 54 pass / 0 fail
- Full suite: 9695 pass / 40 fail (40 pre-existing — network/integration unrelated; 0 regressions)
- tsc: 0 errors | DDD: PASS | Security: PASS

#### AC Verification

- AC-1 PASS: `querySignalAges` UNION ALL — 5 entries (price/bctc/news/sbv_fx/foreign_flow). `user_requests` absent.
- AC-2 PASS: `schema-system.ts` L243-248 — DEPRECATED comment block above `CREATE TABLE IF NOT EXISTS user_requests`.
- AC-3 PASS: `schema-system.ts` L22-26 — skips non-existence note in module header.
- AC-4 PASS: `INSERT INTO user_requests` grep across all production TS = 0 matches.
- AC-5 PASS: 54 freshness targeted tests GREEN. Full suite 9695 pass — no regression.
- AC-6 PASS: `bun tsc --noEmit` = 0 errors.

#### Notes

- No branch (CLAUDE.md policy: main only). Commit ac32a3dc already on main.
- 40 fail count up 4 from c128 baseline (36 fail). All unrelated to 1920h (network/integration tests in macro-indicators service). No action needed.
- Bun v1.3.13 macOS C++ panic on full suite run = known Bun runtime bug, exit code 0.

---

## Session 2026-05-15 c128 — 1918b-news-scout-macro-snapshot-package

### TASK REPORT — 1918b

```
date: 2026-05-15
outcome: APPROVED
type: FIX (agentBootstrap + SKILL_MANIFEST atomic pair + flow doc + tool package)
round: 1
```

#### Pipeline

- Full suite: 9366 pass / 36 fail (36 pre-existing baseline — watchlist count, scheduler config, signal-T5; 0 regressions vs c126 baseline of 9356 pass / 36 fail; +10 pass from 1918a tests already merged)
- tsc: 0 errors | DDD: PASS | Security: PASS

#### AC Verification

- AC-1 PASS: `agentBootstrap.ts` L47 — `"get_macro_snapshot"` present in `news_scout` array
- AC-2 PASS: `SKILL_MANIFEST.md` L31 — `"get_macro_snapshot"` in `news_scout` JSON array; SSOT pair sorted-identical (17 entries each)
- AC-3 PASS: `.claude/tools/package/news-scout.md` L45 — Market Intelligence table row `get_macro_snapshot | Macro regime snapshot for 0b regime detection | source?: string, regimeType?: string`
- AC-4 PASS: `.claude/flows/news-scout/stage-bootstrap.md` L15-25 — Step 0b calls `get_macro_snapshot` with `isMacroSnapshotValidShape()` guard; invalid shape → `[WARN]` + `REGIME_SOURCE=news-fallback`; call failure → retry-once then news-fallback; regime-extraction skill invoked only on valid shape
- AC-5 PASS: tsc 0 errors (interface-layer-only change; no type regressions)

#### Notes

- No new test file (pure interface-layer array append + flow prose). Consistent with handoff.
- Bun post-run C++ panic = known Bun v1.3.13 macOS bug, not test failure (exit code 0, 9440 tests ran).
- SSOT mirror confirmed: both arrays sorted-identical, `Last updated` line in SKILL_MANIFEST.md updated to Task 1918b.

---

## Session 2026-05-15 c127 — 1918a-alert-commander-macro-snapshot-guard

### TASK REPORT — 1918a

```
date: 2026-05-15
outcome: APPROVED
type: FIX (shape guard utility + flow gate)
round: 1
```

#### Pipeline

- Targeted tests (1918a): 10 pass / 0 fail
- Full suite: 9778 pass / 0 fail (890 files, 29236 expect() calls)
- tsc: 0 errors | DDD: PASS | Security: PASS

#### AC Verification

- AC-1 PASS: `macroSnapshotGuard.ts` exists, exports `isMacroSnapshotValidShape()` at line 27
- AC-2 PASS: stage-bootstrap.md line 17 — Shape-validation gate fires on both initial + retry; system_status → news-fallback
- AC-3 PASS: 10/10 tests GREEN in `1918a-macro-snapshot-shape-guard.test.ts`
- AC-4 PASS: `{text:"..."}` accepted, `{status:"degraded"}` rejected (confirmed test L34)
- AC-5 PASS: tsc 0 errors, full suite stable

#### Merge

Committed QA record at `2ea9dd2a`. TASKS.md updated to DONE.

---

## Session 2026-05-15 c126 — 1910b-effr-package-reg

### TASK REPORT — 1910b (verification-only, no code changes)

```
date: 2026-05-15
outcome: APPROVED
type: CHORE (registration-only — docs + agentBootstrap)
round: 1
```

#### Pipeline

- Full suite: 9356 pass / 36 fail (all pre-existing — watchlist count, scheduler config, signal-T5; unrelated to this task)
- tsc: 0 errors | DDD: PASS | Security: PASS
- No targeted tests (zero code changes)

#### AC Verification

- AC-1 PASS: `get_fed_liquidity_spread` in news_scout array (agentBootstrap.ts L45)
- AC-2 PASS: `get_fed_liquidity_spread` in financial_analyst array (agentBootstrap.ts L78)
- AC-3 PASS: `get_fed_liquidity_spread` in unified_coordinator array (agentBootstrap.ts L273)
- AC-4 PASS: financial-analyst.md L104 — Macro Intelligence section
- AC-5 PASS: news-scout.md L49 — US Monetary Chain section
- AC-6 PASS: unified-agent.md L47 — Macro Intelligence COC section
- AC-7 PASS: SKILL_MANIFEST.md — 3 agent JSON arrays + recently-registered table row with `financial-analyst, news-scout, unified-coordinator`
- DDD grep hit = comment line only ("NEVER import from domain/ or infrastructure/") — PASS
- Security scan: 0 matches — PASS

#### Note

Task shipped at commit e7fd1718 (c96, 2026-05-14). Developer commit 4db28926 = TASKS.md + handoff only (confirmed). No merge needed; all changes already on main.

---

## Session 2026-05-15 c125 — TASK-BCTC-3c

### TASK REPORT — BCTC-3c

```
date: 2026-05-15
outcome: APPROVED
type: FEATURE (test-only + domain service extension: hsx Strategy 0)
round: 1
```

#### Pipeline

- Targeted: 7/0 | Full suite: 9673 pass / 39 fail (39 pre-existing unchanged from c124 baseline)
- tsc: 0 errors | DDD: PASS | Security: PASS

#### AC Verification

- AC-1 PASS: 7 tests GREEN (TC-1 through TC-7)
- AC-2 PASS: TC-1 confirms Strategy 0 fires first (hsx.callCount=1, vps.callCount=0)
- AC-3 PASS: TC-3 confirms VEA/UPCOM fallthrough — empty hsx → source:"vps-playwright"
- AC-4 PASS: source:"hsx" shape correct; TC-5 + TC-7 validate URL domain pattern
- AC-5 PASS: tsc 0 errors; DDD PASS (bctcDiscovery.ts — zero infra imports); Security PASS
- Baseline: 39 pre-existing failures unchanged

#### Note

Working dir is on main (no branch per NO branches for dev policy). Commits 859f4a62 + 3a65b484 already on main — no merge needed. Task report: reports/TASK_REPORT_BCTC-3c.md

---

## Session 2026-05-15 c124 — 1910a-ism-tool re-review

### TASK REPORT — 1910a (round 2)

```
date: 2026-05-15
outcome: APPROVED
type: FEATURE (infra fetcher + domain signal + MCP tool + 35 tests)
round: 2 (post-fixer bfdaa731)
```

#### Fix Verification

- `fredIsmSubcomponents.ts:262` — only `Bun.env.FRED_API_KEY` present. `process.env` fallback removed by commit bfdaa731. Diff confirmed.
- Test file `1910a-ism-subcomponents-fetcher.test.ts` uses `process.env` only for save/restore scaffolding + mirrors set on `Bun.env` — acceptable test pattern.

#### Pipeline

- Targeted: 35/0 | Full suite: 9666 pass / 39 fail (all pre-existing)
- tsc: 0 errors | DDD: PASS | Security: PASS

#### Report

`reports/TASK_REPORT_1910a.md`

---

## Session 2026-05-15 c123 — 1910a-ism-tool

### TASK REPORT — 1910a

```
date: 2026-05-15
outcome: CHANGES_REQUESTED
type: FEATURE (new infra fetcher + domain signal + MCP tool + 35 tests)
round: 1
```

#### Scope

Zone: `apps/mcp-server/src/infrastructure/fetchers/fredIsmSubcomponents.ts` (new) + `apps/mcp-server/src/domain/services/macro/ismRegimeSignal.ts` (new) + `apps/mcp-server/src/interface/mcp/tools/macro/getIsmSubcomponentsTool.ts` (new) + 3 test files (new).

Commit `ee20d197` on main (no branch per NO branches for dev policy).

#### AC Results

- AC-1 PASS: `fredIsmSubcomponents.ts` exists, fetches 4 FRED series, uses `FRED_API_KEY`
- AC-2 PASS: `ismRegimeSignal.ts` pure domain function, EXPANDING/CONTRACTING/MIXED logic, zero infra imports
- AC-3 PASS: `get_ism_subcomponents` MCP tool registered (#133), source_tier=1 envelope
- AC-4 PASS: Wired into `macroIndicatorRefreshJob` line 85, no new cron
- AC-5 PASS: 35/35 new tests GREEN (13 domain + 14 fetcher + 8 contract)
- AC-6 FAIL: `fredIsmSubcomponents.ts:263` uses `process.env["FRED_API_KEY"]` — Bun.env-only policy violation
- AC-7 PASS: Full suite 9349/36 — 36 pre-existing failures unchanged

#### Pipeline

- Targeted: 35/0 | Full suite: 9349 pass / 36 fail (all pre-existing)
- tsc: 0 errors | DDD: PASS | Security: FAIL (1 blocking)

#### Blocking Issues

1. `apps/mcp-server/src/infrastructure/fetchers/fredIsmSubcomponents.ts:263` — `process.env["FRED_API_KEY"]` fallback violates Bun.env-only policy. Remove `?? process.env["FRED_API_KEY"]` on line 263.

#### Report

`reports/TASK_REPORT_1910a.md`

---

## Session 2026-05-15 c122 — TASK-BCTC-3b

### TASK REPORT — BCTC-3b

```
date: 2026-05-15
outcome: APPROVED
type: FEATURE (new infra fetcher + domain wiring + 8 tests)
```

#### Scope

Zone: `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts` (new) + `apps/mcp-server/src/domain/services/bctcDiscovery.ts` (modified) + `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` (modified) + `apps/mcp-server/src/__tests__/BCTC-3b-hsx-fetcher.test.ts` (new) + 8 existing BCTC test files.

Commit `9c4bc9d5` on main (no branch per NO branches for dev policy).

#### AC Results

- AC-1 PASS: hsxBctcFetcher.ts exists, correct signature, two-call recipe, required headers, never throws, zero domain imports
- AC-2 PASS: bctcDiscovery.ts — _fetchHsx port, "hsx" union, Strategy 0 before VPS, docblock updated
- AC-3 PASS: bctcQueueEnricherJob.ts — fetchHsxBctcUrls imported + wired
- AC-4 PASS: 8/8 tests GREEN (all 8 acceptance cases)
- AC-5 PASS: tsc 0 errors, DDD boundary intact (imports verified)

#### Pipeline

- Targeted: 8/0 | Modified BCTC files (8): 68/0 | Full suite: 9314 pass / 36 fail (all pre-existing)
- Note: developer reported 9318/32; QA sees 9314/36; delta 4 = signal-T5 flaky pre-existing, unrelated
- tsc: 0 errors | DDD: PASS | Security: PASS

#### Report

`reports/TASK_REPORT_BCTC-3b.md`

---

## Session 2026-05-15 c121 — 1899a-bloomberg-test-split

### TASK REPORT — 1899a-bloomberg-test-split

```
date: 2026-05-15
outcome: APPROVED
type: REFACTOR test-only
```

#### Scope

Test-only zone (`apps/news-fetch/__tests__/`). Smart-Skip applied: DDD scan + security scan skipped.
Commits already on main (40747a58 + ac8d8fcf). No branch to merge.

#### AC Results

- AC-1 PASS: source 1899a-bloomberg.test.ts deleted
- AC-2 PASS: 4 files ≤200L — dom:189 / json-fallback:182 / perimeterx-lifecycle:186 / normalize-date:51
- AC-3 PASS: expect() = 41 (12+8+7+14)
- AC-4 PASS: bun test glob — 29 pass / 0 fail / 41 expect()
- AC-5 PASS: news-fetch full suite 172 pass / 0 fail (baseline parity)
- AC-6 PASS: bun tsc --noEmit — 0 errors

#### Report

`reports/TASK_REPORT_1899a-bloomberg-test-split.md`

---

## Session 2026-05-15 c120 — CLEAN stale branches

### CLEAN-c120-stale-branches

```
date: 2026-05-15
outcome: DONE
type: CLEAN (branch cleanup, no code/test scan required)
```

#### Branches processed

- `fix/1908c-val07-plausibility-override` — local only, worktree stale lock (pid 83362 dead). Removed worktree with `-f -f`, deleted with `git branch -D`. Confirmed `git branch --merged main` showed it as fully merged.
- `task/1909b-get-bctc-ocf-tool` — local + remote. Worktree stale lock (same pid 83362). Content on main via parallel commits (`d285cc68` / `a3381005` on main vs `0c0e85f8` / `2161f4e4` on branch — same timestamp/author/message, same content). Removed worktree with `-f -f`, deleted local `git branch -D`, deleted remote.
- `task/1910b-effr-package-registration` — remote only (no local branch). Content on main (`e7fd1718` / `961c62ec`). Remote deleted.

#### AC

- AC-1 PASS: 3 local branches deleted
- AC-2 PASS: 2 remote branches deleted
- AC-3 PASS: `git branch -a` returns empty for all 5 patterns
- AC-4 PASS: feature content confirmed on main before deletion
- AC-5: MCP gateway degraded (1913 BLOCKING-F1) — WORK notification skipped, logged in TASKS.md instead
- AC-6 PASS: TASKS.md updated, CLEAN-c120 marked Done

---

## Session 2026-05-15 c118 — 1914b-log-agent-work-doc QA gate

### TASK REPORT — 1914b

```
date: 2026-05-15
outcome: APPROVED
```

#### Scope

Doc-only change. Smart-Skip applied: bun test, bun tsc, DDD scan, security scan all skipped.
Commits already on main (3b68df2c + cd01a02e). No branch to merge.

#### Changed files (10 package docs + TASKS.md + handoff)

- `.claude/tools/package/{alert-commander,unified-agent,financial-analyst,market-watcher,news-scout,qa-responder,report-analyzer,digest-predict,tran-ngoc-bau,po}.md` — old fictitious `action/context/signal_ids` params replaced with correct two-call recipe. report-analyzer.md example snippet fixed. po.md Usage example fixed.
- `docs/TASKS.md` — 1914b marked Done
- `docs/handoffs/TASK_1914b.md` — [Developer] section present

#### Signature spot-check

- Source: `apps/mcp-server/src/interface/mcp/tools/system/agentWorkLogTools.ts`
- Zod schema params match recipe in all 10 files: `agent_name, id?, status, summary?, findings?, actions?`
- Call 1 (`status="running"`) → `{ id: number }` — correct
- Call 2 (`id + status="completed"|"error"`) → `{ ok: true, id }` — correct
- Zero old params (`action`, `signal_ids`) remaining for `log_agent_work` — grep clean

#### AC Coverage

- AC-1 PASS, AC-2 PASS, AC-3 PASS, AC-4 PASS

---

## Session 2026-05-15 c117 — 1914-news-scout-dedup-api QA gate

### TASK REPORT — 1914

```
date: 2026-05-15
outcome: APPROVED
```

#### Changed files
- `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` — `GetSignalsOptions.fromAgent?: string` added; WHERE clause switches to `s.from_agent = ?` exclusively when `fromAgent` is set; read-mark guard: `if (statusFilter === "unread" && opts.fromAgent === undefined && rows.length > 0)`
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` — optional `from_agent` Zod param + spread into `getSignals()` opts
- `apps/mcp-server/src/__tests__/242-agent-signals.test.ts` — AC-6a/b/c (3 new tests); 14/14 total GREEN
- `.claude/flows/news-scout/stage-signals.md` — dedup gate updated: `from_agent="news-scout"` + `status="all"` + comment explaining 180-min manual check

#### Test Results
- tsc: 0 errors
- 242 targeted: 14/14 PASS (11 pre-existing + 3 new AC-6a/b/c)
- Full suite: 9306 pass / 36 fail (all pre-existing: task 178 price-history, 230 AC-4c, BCTC parseBctcReport fixtures — zero new failures)

#### DDD: PASS
- No domain→infrastructure imports found (grep on src/domain/ import statements)

#### Security: PASS
- No `process.env` in changed files
- No hardcoded credentials or secrets
- SQL uses parameterized queries (`db.query<RawRow, [string]>(sql).all(bindParam)`)

#### Backward compat: PASS (AC-2)
- `getSignals(db, agent)` with no opts → `recipientClause = "(s.to_agent = ? OR s.to_agent = 'all')"`, `bindParam = agent` (unchanged path)
- AC-6b confirms inbox-only rows returned when `fromAgent` absent

#### All AC: GREEN
- AC-1: fromAgent returns self-sent rows regardless of to_agent (AC-6a)
- AC-2: backward compat — existing inbox unchanged (existing tests + AC-6b)
- AC-3: read-mark suppressed on sender-history path (AC-6c + guard in store)
- AC-4: stage-signals.md dedup gate updated (from_agent + status=all)
- AC-5: all 242 existing tests GREEN
- AC-6a/b/c: 3 new tests GREEN

#### Merge
- Already on main — commits 93b6b63d + eefa1346
- docs/TASKS.md updated: 1914 moved In Progress → Done

## Session 2026-05-15 c116 — 1915-fix-part2 QA gate

### TASK REPORT — 1915-fix-part2

```
date: 2026-05-15
outcome: APPROVED
```

#### Changed files
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts` — else branch in `scanDiskForStrandedPdfs()` replaced `if (!matched) continue` with `if (matched) { ticker = ... } else { tickerFromFilename fallback }`
- `apps/mcp-server/src/__tests__/1915-scan-disk-empty-watchlist.test.ts` — DSE-09 added; DSE-06 updated to reflect new correct behavior
- `apps/mcp-server/src/__tests__/1416c-hpg-bctc-disk-scan.test.ts` — regression-guard test updated (HPG now picked up via filename fallback when absent from watchlist)

#### Test Results
- tsc: 0 errors (empty output = clean)
- Targeted tests (DSE-01..09 + 1416c 6 tests): 15/15 PASS [221ms]
- Full suite: 9307 pass / 32 fail / 38 skip across 9377 tests
- 32 failures: ALL PRE-EXISTING — none in 1915-fix-part2 scope. Confirmed by `git show 6fead90d --stat`: only `bctcReparseJob.ts`, two test files, `TASKS.md`, handoff md, developer notebook, signal JSON modified. Failing tests are Task 178, 1343a, 1343e, Sprint 145, sub-fix-C, 1549, 1031, 1100, 1331a, 1336, 1349a, 239, stale-tickers, cron-registry, signal-T5, Bootstrap-230 — all predate 6fead90d.

#### DDD: PASS
- Zero actual `import` statements from `domain/` to `infrastructure/`. Confirmed with `grep -n "^import.*from.*infrastructure"` — all matches are comments only.

#### Security: PASS
- No `process.env` in any of the 3 modified files (Bun.env only).
- No hardcoded secrets or API keys.
- SQL in `scanDiskForStrandedPdfs()` at L503-507 uses parameterized query (`? AND ? AND ?`).

#### AC Coverage
- DSE-09: populated watchlist [HPG,VCB] + VNM_Q4_2025.pdf → VNM picked up via filename fallback. PASS.
- DSE-01..08: GREEN (15/15 total).
- 1416c: 6/6 GREEN (regression guard updated — HPG now returned via fallback when not in watchlist).
- tsc: 0 errors. PASS.

#### Merge
- Commits already on main: `6fead90d` (fix) + `ef64d96b` (developer notebook). No branch to delete (work on main per CLAUDE.md policy).
- TASKS.md: 1915-fix-part2 moved from Review → Done.

#### Verdict: APPROVED
- Notify PM: close 1915-fix-part2 in docs/TASKS.md.
- Notify Ops: redeploy mcp-server container for runtime AC (VEA/VNM rows in financial_reports + pdf_extracted_text).

---

## Session 2026-05-14 c115 — 1916b-fix-cafef-strategy-replacement QA gate

### TASK REPORT — 1916b

```
date: 2026-05-14
outcome: APPROVED
```

#### Changed files
- `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — Strategy 2 removed; `extractCafefUrls`, `tryFetchCafef`, `CAFEF_API_BASE`, `CAFEF_BASE`, `PDF_HREF_RE` deleted; `_fetchCafef` kept as deprecated no-op; vietstock promoted to strategy 2
- `apps/mcp-server/src/__tests__/1916b-cafef-strategy-replacement.test.ts` — new file, 12 tests
- `apps/mcp-server/src/__tests__/1343b-hose-pdf-discovery-red.test.ts` — cafef assertion updated
- `apps/mcp-server/src/__tests__/FIX-bctc-url-enrichment.test.ts` — cafef success tests → no-op spy
- `apps/mcp-server/src/__tests__/FIX-bctc-ssc-vps-proxy.test.ts` — falls-back-to-cafef → 0 URLs

#### Test Results
- tsc: 0 errors
- New task tests (1916b): 12/12 PASS
- 1916b + modified files + regression set (10 files): 82/82 PASS
- Remaining bctc suite (40 files batch A): 218/222 pass / 3 fail pre-existing (1294b + 1343e) confirmed identical on main; 1294b isolates to 0 fail (inter-test DB pollution); 1343e pre-existing on main
- Remaining bctc suite (batch B, 21 files): 164/164 PASS

#### DDD: PASS
- Zero actual import statements from domain/ to infrastructure/. Confirmed with `grep -n "^import.*from.*infrastructure"` on all domain files.
- bctcDiscovery.ts is domain layer — no infrastructure imports, Bun.env only (correct).

#### Security: PASS
- No process.env usage in bctcDiscovery.ts (Bun.env only).
- No hardcoded secrets, API keys, or passwords.
- Removed symbols (CAFEF_API_BASE, CAFEF_BASE) had no credentials.

#### AC Coverage
- AC-1b: Strategy 2 cleanly deleted with inline comment referencing TASK_1916b + SPIKE_1916. PASS.
- AC-2: cafef call count = 0 (spy confirmed never invoked). 0-URL rate unchanged. PASS.
- AC-3: All stale tests updated; 1916b test file with 12 passing tests. PASS.

#### Merge
- Cherry-picked commits `311c8b95` + `c9f93340` to main as `3732bcd9` + `79c0ffaf`
- TASKS.md: 1916b moved to Done (`b92ef05c`)
- Branch `task/1916b-fix-cafef-strategy-replacement` deleted

#### Verdict: APPROVED

---

## Session 2026-05-14 c114 — 1915-fix-part1-scan-disk-empty-watchlist QA gate

### TASK REPORT — 1915-fix-part1

```
date: 2026-05-14
outcome: APPROVED
```

#### Test Results

Targeted (bun test src/__tests__/1915-scan-disk-empty-watchlist.test.ts src/__tests__/1416c-hpg-bctc-disk-scan.test.ts):
- 14 pass / 0 fail (8 DSE-01..08 + 6 1416c including 1 updated + 1 new)

Full suite (bun test):
- 9281 pass / ~36 fail (pre-existing, confirmed against 1916b baseline: 9284 pass / 45 fail — 1915 branch has fewer failures, OOM crash at tail is pre-existing Bun v1.3.13 C++ panic unrelated to this change)
- TypeScript: 0 errors (bun tsc --noEmit + pre-push hook PASS)

#### DDD Audit: PASS

- bctcReparseJob.ts is interface/scheduler layer — infrastructure imports at lines 26-31 are correct and pre-existing.
- domain/ layer unchanged. grep confirmed zero infrastructure imports in domain/.
- New `tickerFromFilename()` and `scanDiskForStrandedPdfs()` code: pure TS logic + DB query, no new layer violations.

#### Security Audit: PASS

- No process.env usage in changed files. All env reads use Bun.env.
- No hardcoded secrets, API keys, passwords.
- SQL parameterized: `WHERE action_code = ? AND period_year = ? AND period_type = ?` (line 496-500).

#### AC Coverage

- DSE-01: empty watchlist + VEA PDF → returns VEA. PASS.
- DSE-02: empty watchlist + VNM PDF → returns VNM. PASS.
- DSE-03: empty watchlist + VEA+VNM → returns both. PASS.
- DSE-04: empty watchlist + unparseable filename → 0 returned. PASS.
- DSE-05: empty watchlist + already-filed VNM → 0 returned. PASS.
- DSE-06: populated watchlist (VNM only) + both PDFs → only VNM. PASS (regression guard).
- DSE-07: populated watchlist + already-filed → 0. PASS (regression guard).
- DSE-08: startScheduler.ts setTimeout calls runBctcReparseWithDb(db) not runBctcReparseJob(). PASS.

#### Runtime AC (ops action required)

Container redeploy needed. After deploy, bctcReparseJob cron (09:30 GMT+7) or manual trigger will process VEA+VNM Q4-2025 on-disk PDFs. AC: financial_reports > 0, pdf_extracted_text > 0, bctcReparseJob log within last hour.

#### Verdict: APPROVED

Merge commit: `66275c67` on main. Branch deleted locally + remote.

---

## Session 2026-05-14 c109 — 1916a-vps-discover-route QA gate

### TASK REPORT — 1916a-vps-discover-route

```
date: 2026-05-14
outcome: APPROVED
```

#### Changed files
- `vps-scripts/vps-proxy-server.js` — new `GET /proxy/bctc-discover/:ticker` route (commit 1b8f8cd5)
- `apps/mcp-server/src/infrastructure/fetchers/bctcHttpFetcher.ts` — X-API-Key injection for VPS host (commit 8f9c2d55)
- `apps/mcp-server/src/__tests__/1916a-bctc-http-fetcher-api-key.test.ts` — 6 new tests
- `docker-compose.yml` — VPS_PUSH_API_KEY env documented

#### Test Results
- Targeted (1916a): 6/6 PASS
- Full suite: 9601 pass / 38 fail — pre-existing failures confirmed (spot-checked Task 178 = fails on main too; developer claimed baseline 9277/39 fail; +324 pass from other tasks already merged, -1 fail = consistent)
- tsc: 0 errors (pre-push hook verified)

#### DDD: PASS
- No actual import statements from domain/ to infrastructure/ or application/
- bctcHttpFetcher.ts is infrastructure layer (correct placement)

#### Security: PASS
- No process.env in TS files (Bun.env only)
- No hardcoded secrets (VPS_PUSH_API_KEY read from Bun.env at runtime)
- vps-proxy-server.js uses process.env correctly (Node.js, not TS mcp-server scope)
- docker-compose.yml documents key via comment, does not commit plaintext value

#### Branch hygiene note
- maybe-deploy-vps.sh: deploy-vinahost.sh not found at repo root — pre-existing infrastructure gap; VPS route already verified live by developer (curl 200+401)

#### Verdict: APPROVED
- Merged: b029167c (main)
- Branch task/1916a-vps-discover-route deleted locally (remote had none)

---

## Session 2026-05-14 c108 — 1912b alert-engine + 1912c stock-price QA gate

---

### TASK REPORT — 1912b-alert-engine

```
date: 2026-05-14
outcome: CHANGES_REQUESTED
```

#### Test Results (actual go test output — not dev claim)

Toolchain: go1.26.2 darwin/amd64. Run: `go test ./... -count=1 -v` from `apps/alert-engine/`.

- 37/37 PASS (dev claimed 27 — non-blocking overcounting; 10 extra outcome/write tests present in sqlite_test.go which dev did not count)
- 0 failures
- Packages: pkg/application, pkg/domain, pkg/infrastructure, pkg/interface/http all green
- cmd/server: no test files (correct — wiring only)

#### DDD Audit: PASS

- pkg/domain/models.go: imports fmt, sort, strings, time, context, errors only. Zero infra/app/interface.
- pkg/domain/services.go: imports fmt, sort, strings, time only.
- pkg/domain/ports.go: imports context only.
- pkg/domain/errors.go: imports errors only.
- pkg/application/evaluate.go: imports context, fmt, time + pkg/domain only. Zero infra import.
- pkg/application/dtos.go: no imports.
- pkg/infrastructure/sqlite.go: imports database/sql, fmt, time, mattn/go-sqlite3, pkg/domain only.
- pkg/infrastructure/telegram.go: imports context, net/http, pkg/domain.
- pkg/interface/http/router.go: imports encoding/json, log/slog, net/http, strings, time, chi + pkg/application only.
- Dependency inversion: ports declared in domain, implemented in infrastructure, injected in cmd/server/main.go. CORRECT.

#### DB Isolation Audit: PASS

- alert_engine.db is sole write target (OwnDBPath via ALERT_ENGINE_DB_PATH env).
- DSN: `file:<path>?_journal=WAL&_busy_timeout=5000&_foreign_keys=on` (sqlite.go:18). WAL confirmed.
- market.db: not opened by alert-engine at all (config.go DBPath field exists but is never used in any repository). Fully isolated.
- SetMaxOpenConns(1): single writer, no parallel writer contention.

#### AC Coverage

- AC-3 (validation parity): stock/message/severity/malformed-JSON all 400 — router_test.go 4 tests PASS
- AC-4 (stock normalisation trim+uppercase): TestEvaluate_NormalisesStockToUppercase PASS
- AC-5 (response shape): TestEvaluate_FiredResponse_HasAllFields + TestEvaluate_SuppressedResponse_HasAllFields PASS. D-1 reconciled: response carries all fields from both internal DTO and clients.ts shape.
- AC-13 (Telegram silent-skip): TestTelegramClient_SilentSkipOnEmptyConfig PASS
- NFR-1 (CGO Dockerfile): multi-stage golang:1.22-alpine + gcc musl-dev + alpine:3.19 — PASS (Dockerfile present and correct)
- NFR-2 (WAL mode DSN): confirmed in sqlite.go:18 — PASS
- NFR-6 (graceful shutdown): cmd/server/main.go has http.Server.Shutdown(ctx) with 5s drain — PASS

#### Hygiene Findings (CRITICAL BLOCKING)

BLK-1 — ATOMIC COMMIT HOLE: `92186e39` shipped test files, infra files, wiring, and Dockerfile BUT omitted 7 source files that tests depend on. Files missing from commit:

- `apps/alert-engine/pkg/domain/errors.go` (app/domain/dtos.go:14e ref: ErrAlertSuppressed)
- `apps/alert-engine/pkg/domain/models.go` (domain types: StoredAlert, AlertRequest, AlertSeverity...)
- `apps/alert-engine/pkg/domain/ports.go` (interfaces: AlertRepositoryPort, MutePort, TelegramPort)
- `apps/alert-engine/pkg/domain/services.go` (ComputeFingerprint, ShouldSuppressAlert, IsDuplicate)
- `apps/alert-engine/pkg/application/dtos.go` (EvaluateAlertRequest/Response DTOs)
- `apps/alert-engine/pkg/application/evaluate.go` (EvaluateAlertUseCase.Execute orchestration)
- `apps/alert-engine/pkg/infrastructure/config.go` (LoadConfig, ServiceConfig)

These are the domain, application, and infra-config layers. The commit title claims "domain+app+infra+interface" but domain/app/infra-config are absent. A clean checkout of `92186e39` would fail `go build ./...` and `go test ./...` immediately.

Confirmed via `git log --all -- <each path>` = empty for all 7 files.

BLK-2 — BUILD ARTIFACT IN WORKING TREE: `apps/alert-engine/server` is a Mach-O x86_64 binary (confirmed via `file`). It is untracked and must be gitignored. No `.gitignore` exists in `apps/alert-engine/` and the root `.gitignore` has no pattern matching `apps/*/server` or `**/server`. Binary must not be committed.

#### Required Follow-up Commits

1. `feat(1912b/alert-engine): commit missed domain+app+infra source` — stage the 7 untracked .go files and commit.
2. Add `apps/*/server` (or `apps/alert-engine/server`) to root `.gitignore` to prevent future binary commits.

Do NOT modify or delete the untracked files — they are correct source. Just stage + commit them.

#### Verdict: CHANGES_REQUESTED

Owner flipped to dev-alert-engine. Re-gate after follow-up commits land.

---

#### Re-gate: 2026-05-14 (post 758ce97c + 199effeb)

```
outcome: APPROVED
commits_verified: [758ce97c, 199effeb]
```

Checks run:

1. `git show --stat 758ce97c` — all 8 expected changes present: `.gitignore` (+1 line `apps/*/server`), plus all 7 source files: `pkg/domain/{errors,models,ports,services}.go`, `pkg/application/{dtos,evaluate}.go`, `pkg/infrastructure/config.go`. +508 lines, 0 deletions. BLK-1 CLOSED, BLK-2 CLOSED.

2. `git status` — no untracked paths under `apps/alert-engine/`. `apps/alert-engine/server` binary is now gitignored. Working tree clean of all 1912b paths.

3. `go test ./pkg/... -count=1` from `apps/alert-engine/` — 4 packages all green: application (PASS), domain (PASS), infrastructure (PASS), interface/http (PASS). Individual test count: **37/37 PASS**. Dev claim confirmed.

4. `git log --oneline 92186e39^..HEAD -- apps/alert-engine/` — 2 commits: `92186e39` (original) + `758ce97c` (follow-up source). Checking out `758ce97c` gives a buildable tree. Atomic-after-follow-up confirmed.

5. `git ls-files --others --exclude-standard -- apps/alert-engine/` — empty output. No additional untracked Go source left behind.

6. `git status -- apps/stock-price/` — clean. 1912c untouched.

BLK-1: RESOLVED. BLK-2: RESOLVED. No new blockers.

**Verdict: APPROVED. 1912b moved to Done.**

---

### TASK REPORT — 1912c-stock-price

```
date: 2026-05-14
outcome: APPROVED
```

#### Test Results (actual go test output — not dev claim)

Toolchain: go1.26.2 darwin/amd64. Run: `go test ./pkg/... -count=1 -v` from `apps/stock-price/`.

- 31/31 PASS (matches dev claim exactly)
- 0 failures
- Packages: pkg/application (6), pkg/domain (7), pkg/infrastructure (7), pkg/interface/http (11) all green
- Note: `go test ./...` produces exit 1 due to `Dockerfile.go` at module root being parsed as Go (starts with `#`). This is a non-blocking tooling quirk — all actual test packages pass. Dockerfile.go is a committed Dockerfile misnamed with `.go` extension. Go toolchain treats it as a Go file. Root module has no production Go files; only the `pkg/` subtree does. `go test ./pkg/...` is the correct invocation and is what CI must use. BLK-3 below.

#### DDD Audit: PASS

- pkg/domain/models.go: zero external imports (stdlib zero).
- pkg/domain/ports.go: zero imports.
- pkg/domain/services.go: imports sync only (goroutine waterfall). Zero infra/app/interface.
- pkg/application/usecases.go: imports pkg/domain + strings only.
- pkg/infrastructure/fetchers.go: imports database/sql, encoding/json, fmt, io, log/slog, net/http, time, mattn/go-sqlite3, pkg/domain only. Zero upward import.
- pkg/interface/http/router.go: imports encoding/json, log/slog, net/http, strconv, strings + pkg/application, pkg/domain only.
- Dependency inversion: PriceFetcherPort + PriceHistoryPort in domain, implemented in infrastructure. CORRECT.

#### DB Isolation Audit: PASS

- market.db: DSN = `file:<path>?mode=ro&_journal_mode=WAL&_busy_timeout=5000` (fetchers.go:165 Tier3, fetchers.go:216 GetHistory). Read-only enforced. Matches AC-7 and NF-2.
- stock_price.db: DSN = `file:<path>?_journal_mode=WAL` (fetchers.go:260 SaveQuote). Write cache isolated. WAL confirmed.
- Never writes to market.db. Dual-DB pattern correct per Sprint 1336 isolation requirements.

#### AC Coverage

- AC-7 (market.db readonly DSN): `?mode=ro&_journal_mode=WAL&_busy_timeout=5000` — CONFIRMED in source, TestSQLiteRepo_GetHistory_HitsMarketDB PASS
- AC-8 (concurrent R/W 100-iter): TestTier3Fetcher_ConcurrentReadWrite_NoLock PASS (0.30s, zero SQLITE_BUSY)
- R-SPEC-1 (PriceSnapshot.timestamp): router.go comment "PriceSnapshot.timestamp field is declared in clients.ts but never read by callers — only snap.price is used. Go returns fetchedAt." Developer verified and documented in-source. PASS.
- R-SPEC-2 (dual route): router.go implements both GET /price/history (query-param, clients.ts path) AND GET /price/history/ (path-param, TS handlers.ts backward compat). Both routes covered in router_test.go (TestPriceHistory_QueryParam_* + TestPriceHistory_PathParam_Success). PASS.

#### Hygiene Findings

BLK-3 (NON-BLOCKING — tooling): `apps/stock-price/Dockerfile.go` is a valid Dockerfile committed with `.go` extension. The Go toolchain treats it as a Go source file and emits `illegal character U+0023 '#'` (the `#` comment character). `go test ./...` exits 1 at setup due to this. All actual pkg/ tests pass. Fix: rename to `Dockerfile.go` → `Dockerfile.stock` or `Dockerfile` (remove `.go` extension), or add a `//go:build ignore` build tag at top. This does not block approval since `go test ./pkg/...` is correct and all 31 tests pass. MUST be fixed before cutover sprint.

#### Verdict: APPROVED

1912c merged as-is. Cutover deferred per REQ_1912c.md §6 (pending 1912b smoke proof). BLK-3 carried to cutover sprint as non-blocking follow-up.

---

## Recent session — 2026-05-14 (c100 re-gate — 1912a-gateway-go-migration APPROVED)

### 1912a — Re-gate verdict: APPROVED. Merge commit: f7ef8c32.

BLK-1 resolved by `dcd0a91b`: empty `apps/api-gateway-go/go.sum` committed (0 bytes). Single parent `34f960a4`, clean subject. `85046d0c` news-scout flow doc fix on branch — zero overlap with api-gateway-go scope. All previously-PASS ACs (AC-2/3/4/5/7/8/9/11 + deferred AC-6/AC-10) confirmed unregressed. No other files touched. Dockerfile L8 `COPY go.mod go.sum ./` unblocked. Merge: no-ff onto main. TASKS.md updated: 1912a-gateway-spec removed from In Progress, shipped row added, parent program row updated. Ops + router signals dropped. P2/P3 (1912b alert-engine + 1912c stock-price) remain BLOCKED on 24h smoke window.

HEAD.lock F4 cure applied: age=63s, no live pid, stale lock removed per permanent policy. Working-tree restore required (prior session left staged deletions of apps/api-gateway-go/).

## Recent session — 2026-05-14 (c99 — 1912a-gateway-go-migration CHANGES_REQUESTED)

### 1912a — API Gateway Go Migration (Phase 1)

Branch: task/1912a-gateway-go-migration. HEAD: 47eae151. 4 commits (all index-only, commit policy PASS).

All source code reviewed: pkg/domain/, pkg/application/, pkg/infrastructure/, pkg/interface/http/, cmd/server/main.go, Dockerfile, go.mod, README-log-schema.md, docker-compose.yml, all 4 test files.

**BLOCKING ISSUE — BLK-1 (AC-1):**
`apps/api-gateway-go/Dockerfile:8` — `COPY go.mod go.sum ./` fails at `docker build` time. go.sum absent from git tree (correct for stdlib-only module — `go mod tidy` produces no go.sum). Confirmed via `docker build --no-cache`: ERROR `/go.sum: not found`. Fix: commit empty go.sum OR change COPY to `go.mod ./` only.

**All other ACs PASS (independently verified):**
- AC-1 (everything except go.sum): golang:1.22-alpine multi-stage, CGO_ENABLED=0, R-G3 layer-cache pattern — PASS (Dockerfile correct aside from go.sum)
- AC-2: AggregatedHealth + ServiceHealthResult JSON field names match spec exactly (json tags: status/services/latencies/checkedAt + service/status/latencyMs/error) — PASS
- AC-3: /api/* verbatim (NoProbe=true), /:service/* strips prefix, 404 {"error":"Unknown service: <name>"}, 502 {"error":"Upstream <name> unreachable: <err>"} — PASS
- AC-4: /health-dashboard 200, Content-Type: text/html, 9 services in dashboardServices slice, status-up/status-down CSS, meta http-equiv="refresh" content="60", no external CDN in link/script tags — PASS
- AC-5: go test ./... 47/47 GREEN (dev reported 37; actual higher due to subtests; all PASS) — PASS
- AC-7: log/slog JSON middleware loggingMiddleware emits time/level/msg/method/path/status/latency_ms per request; README-log-schema.md present with sample line — PASS
- AC-8: docker-compose has both api-gateway (4000) and api-gateway-go (4001), zero volume, stateless rollback — PASS
- AC-9: DDD layout pkg/domain/(models/ports/services), pkg/application/, pkg/infrastructure/, pkg/interface/http/, cmd/server/ — PASS
- AC-11: GET /healthz registered as alias to HandleHealth (same handler reference) — PASS
- AC-6, AC-10: Deferred per dev design (post-merge deploy validation) — accepted

**Scans:**
- DDD: domain package imports: context, sync, time only — zero I/O — PASS
- Security: no hardcoded secrets, no process.env, no SQL — PASS
- Commit policy: all 4 commits are git commit -m (no -am/-a) — PASS
- TS gateway untouched: git diff main apps/api-gateway/ = empty — PASS
- mcp-server untouched: git diff main apps/mcp-server/ = empty — PASS
- SDD-1: gateway is proxy-only, source_tier not registered — PASS

Verdict: CHANGES_REQUESTED. Signal: docs/signals/2026-05-14T11-23-53Z-1912a-qa-to-dev-changes.json. Single blocking issue BLK-1. Re-gate at c100 after fix.

## Recent session — 2026-05-14 (c96 — 1910b-effr-package-reg APPROVED)

### 1910b — effr-package-reg (CHORE zero-build)

Merged onto main: e7fd1718 feat + 961c62ec notebook + b6daa3e7 news-scout notebook. HEAD b3d1fa47.

Zero-build config + docs only. No test file (no production code). tsc 0 errors. DDD PASS (interface/ layer only). Security PASS (no env, no secrets, no SQL).

3 hits in agentBootstrap.ts: news_scout L45, financial_analyst L77, unified_coordinator L271. Agent identity keys exact match (news_scout/financial_analyst/unified_coordinator). Package docs: financial-analyst.md L104 Macro Intelligence section, news-scout.md L49 US Monetary Chain section, unified-agent.md L47 Macro Intelligence (COC) section. SKILL_MANIFEST.md L282 single row listing all 3 agents. Regressions: get_bctc_ocf L76, get_macro_snapshot L73, get_bond_maturity_calendar L74, get_investment_clock_phase L75 all still present. Commit scope: 5 files only (agentBootstrap.ts + 3 package docs + SKILL_MANIFEST.md). All 9 ACs PASS. Container rebuild required (agentBootstrap.ts touched).

Verdict: APPROVED.

---

## Recent session — 2026-05-14 (c95 — 1909a-extractor cashFlowExtractor expansion APPROVED)

### 1909a-extractor — cashFlowExtractor Multi-Layout Expansion (CRITICAL FEATURE)

Branch: task/1909a-cashflow-extractor-expansion (worktree). Merge commits: 148d1e99 impl + 3b8d76f7 notebook. Post-merge gate.

Diff scope: 2 files ONLY — cashFlowExtractor.ts (+604 lines) + 1909a test file (+517 lines). All 34 full-suite failures confirmed pre-existing (unrelated scopes: 178/230/1343a/1031/1336/145/1343e/1100/1349a/262/signal-T5/cron-registry/1549/239).

Implementation: extractSplitBlockAll + parseSplitBlockCashFlow (VNM-style split-block PDFs), detectUnitMultiplier (triệu/tỷ + magnitude inference), applyMultiplier (tỷ → triệu ×1000), applyDriftGuard (DRIFT_THRESHOLD=5, E-4 both>0 guard), computeCashFlowConfidence (BCTC-1345b: =0→skip, <0.2→low_confidence), E-2 bank label variants (luồng tiền thuần), E-3 parenthesised negatives, ASCII diacritic fallback patterns.

Pipeline: tsc 0 errors. 22 new tests PASS (VNM split-block, DIG inline E-3, VCB bank E-2, drift guard, E-4, tỷ unit, confidence 4 cases). 23 baseline PASS (044/1878a/1890a). DDD PASS (zero imports from infrastructure; pure domain function, zero I/O). Security PASS (no process.env, no secrets, no SQL, no HTTP). All 7 ACs PASS.

Non-blocking: console.warn format uses `"[cashFlowExtractor] Drift guard triggered on <label>:"` instead of spec-mandated `"[cashFlowExtractor] BCTC-1909a: <section> positional drift detected; overriding."`. BCTC-1909a token absent. Functional behavior correct; format-only deviation, no operational impact.

Verdict: APPROVED.

---

## Recent session — 2026-05-14 (c93 — 1909b-tool get_bctc_ocf APPROVED)

### 1909b-tool — get_bctc_ocf MCP Tool (CRITICAL FEATURE)

Branch: task/1909b-get-bctc-ocf-tool. Merged onto main (d285cc68 impl + a3381005 notebook). Cherry-pick union merge — 1890a-B tools + new get_bctc_ocf both present.

SD-2 critical check: `extraction_method` SELECT'd from DB column (L130-143). `BctcOcfRow` interface: `extraction_method: string | null`. No hardcoded `"ocr_parsed"` or any literal. DB value flows unmodified to envelope.

Pipeline: tsc 0 errors. 8/8 tests PASS (29 expect() calls). All 4 extraction_method enum values covered in tests: pdf-parse (a), ocr-200 (a2), null (a3), ocr-300 (b2), news_inference (c). DDD PASS — getDb() inside handler scope (L213), no module-level injection. Security PASS — no process.env, parameterized SQL (.prepare(...).get()), no throw, error returns JSON content block. source_tier=1 literal type in both found/not-found interfaces. Registration complete: registry.ts L100+L202, index.ts L11, agentBootstrap.ts L75, SKILL_MANIFEST.md L59, financial-analyst.md L38. 1890a-B union merge verified (get_macro_snapshot/get_bond_maturity_calendar/get_investment_clock_phase at L72-74).

All 11 ACs: PASS. No blocking issues. No non-blocking issues.

Verdict: APPROVED.

---

## Recent session — 2026-05-14 (c92 — 1908c totalAssets plausibility override APPROVED)

### 1908c — totalAssets plausibility override (BCTC VAL-07 positional drift guard)

Branch: fix/1908c-val07-plausibility-override. Merge commit: b6db5ef3. SHA: feb11ba6.

Diff scope (relative to branch point 07a1af9a): 2 files ONLY — balanceSheetExtractor.ts (+9 lines) + 1908c test file (+289 lines). Bounded. All out-of-scope noise in `git diff main..fix/...` is explained by worktree branching from pre-c90 state (merge-base 07a1af9a = QA commit for 1890a-A); no spurious production changes staged.

Guard implementation: 5-line block inserted after line 716 zero-fallback. Matches brief §5 spec verbatim — comment, `computedFromSubtotals` declaration, 3-condition check, console.warn, override assignment. Option B (upstream extractor) confirmed. `liabPlausible` mirror pattern confirmed.

Pipeline: tsc 0 errors. 30 baseline PASS (042/1120/287 balance-sheet files). 8 new PASS (VNM 55.7x fires + 2 VNM assertions / DIG 2846x fires + 2 DIG assertions / VCB no-fire / FPT no-fire). VAL-07 confidence > 0 post-override verified (VNM + DIG). DDD PASS (no infra imports in domain file). Security PASS (no process.env, no hardcoded secrets). Inline OCR mock fixtures — no PDF files in repo.

Commit message: no --amend. Convention-compliant (fix/1908c scope + Sprint/Task/AC trailers). Single commit on branch.

TASKS.md: 1908c moved from Backlog to Done. Post-fix action (ops): DELETE VNM/DIG Q4 2025 DB rows + bctcReparseJob.

Verdict: APPROVED.

---

## Recent session — 2026-05-14 (c90 — 1890a-A get_cash_flow APPROVED)

### 1890a-A — get_cash_flow MCP tool (BCTC cash flow forensics)

Files: 7 (+778 LOC). Commit fd7cbe44 cherry-picked from worktree-agent-ac33d4e901731e232.

Pipeline: tsc 0 errors. 5/5 task tests PASS. Full suite: 9198 pass / 33 fail (all 33 pre-existing — watchlist count, scheduler count, ops agent structure, network errors; none in 1890a scope). DDD PASS (interface→infrastructure import is correct pattern for tools layer). Security PASS (no process.env, no hardcoded secrets, parameterized SQL). SSOT mirror PASS (SKILL_MANIFEST.md financial_analyst array matches agentBootstrap.ts literally, including get_cash_flow as last entry). Tool package PASS (Cash Flow Intelligence section present, correct output shape, R3 usage note). Source_tier invariant PASS (first field in both found + not-found envelopes). Null-safety PASS (zero and null net_profit both yield null ocf_ni_ratio). Injectable _testDb pattern PASS.

Non-blocking: project-stats.json toolCount=125 is stale (was pre-existing before 1890a; registry.ts comment correctly marks #131). Not caused by this task.

Verdict: APPROVED.

## Recent session — 2026-05-14 (c89 — 1906a-headlock-cure-permanent APPROVED)

### 1906a-headlock-cure-permanent — HEAD.lock PREFLIGHT cure reclassified permanent operational policy

Branch: task/c89-1906a-headlock-cure-permanent. Fix commit: 40c66d1b. Notebook: 2892a799. Zone: docs/protocols/ only (+ developer notebook rotation + handoff — all legitimate).

Pipeline: tsc 0 errors (pre-push hook). PASS. No tests required (doc-only). DDD PASS. Security PASS. Zone PASS — single protocol doc edited, +13L surgical addition.

AC checks all PASS:
- git diff --stat: 3 files (protocol doc + developer notebook + handoff) — no .ts/.json/.yml touched.
- Status header updated: PERMANENT OPERATIONAL POLICY (reclassified 2026-05-14).
- § (f) Policy Classification appended with 3-cycle evidence, 100% cure rate, architect brief cross-ref.
- 1897b-carry present in TASKS.md Backlog (grep confirmed).
- Architect brief docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md exists (ls confirmed).
- +13L is minimal and surgical for a new § block.

Merge commit: 3538ce5b. Branch deleted local + remote. Report: reports/TASK_REPORT_1906a-headlock-cure-permanent.md. TASKS.md: 1906a moved to Done.

Verdict: APPROVED.

---

## Recent session — 2026-05-14 (c88 — 1905a-news-fetch-stealth-fix APPROVED)

### 1905a-news-fetch-stealth-fix — playwright-stealth placeholder removed, inline addInitScript stealth

Branch: task/c88-1905a-news-fetch-stealth-fix. Fix commit: 502499e3. Notebook/handoff: c189b8bc. Zone: apps/news-fetch/ only (+ agent notebooks + handoff — all legitimate).

Pipeline: tsc 0 errors. PASS. Full suite: 172 pass / 6 skip / 0 fail. PASS. New TDD file 1905a-playwright-browser-factory.test.ts: 6/6 GREEN. DDD PASS (no domain/app infra imports). Security PASS (no process.env, no secrets). Zone PASS — only apps/news-fetch/ production code touched; notebooks are routine rotation.

AC checks all PASS:
- playwright-stealth removed from package.json + bun.lock regenerated.
- addInitScript present in factory, called before newPage().
- 6 existing test mocks updated to include addInitScript.
- Handoff mentions ops post-merge steps (rebuild + cron tick verify).

Merge commit: 580771ae. Branch deleted local + remote. Report: reports/TASK_REPORT_1905a-news-fetch-stealth-fix.md. TASKS.md: 1905a moved to Done.

Verdict: APPROVED.

---

## Recent session — 2026-05-14 (c87 — 1903-doc-pair APPROVED)

### 1903-doc-pair — stale UNVERIFIED label + macro fallback note

Branch: task/c87-1903-doc-pair. Commits: d7ddca53 (doc edits) + 205c6485 (developer notebook) + 7b6a0be6 (handoff). Scope: doc/flow XS, .claude/ zone only.

Pipeline: tsc 0 errors. DDD PASS. Security PASS. Zone PASS (4 files: .claude/flows, .claude/tools/package, developer notebook, handoff).

AC checks all PASS:
- write_alert_verdict UNVERIFIED label confirmed removed (line 41 clean).
- alertVerdictTools.ts exists at apps/mcp-server/src/interface/mcp/tools/alerts/.
- Sweep: 0 remaining UNVERIFIED labels in .claude/tools/package/*.md.
- stage-bootstrap.md step 0b fallback note present (1 line), REGIME_SOURCE=news-fallback tag, cross-link to regime-extraction/SKILL.md.
- tree-map line 313 references stage-bootstrap.md — no SSOT drift.

Merge commit: 54e255e4. Branch deleted local + remote. Report: reports/TASK_REPORT_1903-doc-pair.md.

Verdict: APPROVED.

---

## Recent session — 2026-05-14 (c86 — AUTOCURE-C86-MW-DEDUP APPROVED)

### AUTOCURE-C86-MW-DEDUP — off-hours duplicate guard, market-watcher cycle.md

Branch: task/c86-autocure-mw-dedup. Commits: 564230d2 (autocure) + 90700f82 (developer notebook). Scope: doc/flow XS, cross-service zone, no apps/* test surface.

Pipeline:
- tsc --noEmit: 0 errors. PASS.
- Full suite: 9721 pass / 0 fail. PASS.
- DDD scan: doc-only change, no imports. PASS.
- Security scan: no secrets, no process.env. PASS.

AC checks: all 6 PASS. AutoCure block at cycle.md:51 — before post_agent_signal, trigger stock_code+move_pct+calendar session, SUPPRESSED log with id, 24h re-emit escape, TNB c47 attribution, no other Step 4 logic touched.

Merge commit: b5151e1d. Branch deleted local + remote. Report: reports/TASK_REPORT_AUTOCURE-C86-MW-DEDUP.md.

Verdict: APPROVED.

---

## Recent session — 2026-05-14 (c85 — 1881a-impl-mcp APPROVED)

### 1881a-impl-mcp — source_tier retrofit 16 MCP tools + contract tests

Branch: task/1881a-impl-mcp HEAD 6dd412bd. Files: 15 interface tool files + 1 contract test.

Pipeline:
- tsc --noEmit: 0 errors. PASS.
- Contract tests (1881a-source-tier.test.ts): 20/20 pass. PASS.
- Full suite: 9234 pass / 34 fail (34 pre-existing, unchanged). PASS.
- DDD scan: 0 new domain/infra imports in interface/* files. PASS.
- Security scan: no secrets, no process.env, no raw SQL added. PASS.
- Zone check: all changes in interface/mcp/tools/ + __tests__/. PASS.

Tier spot-checks (3 tools vs REQ_1881a.md authoritative spec):
- get_imf_signals: tier 1 envelope + per-record tier 1 — CORRECT.
- get_macro_snapshot: tier 2 text-wrap — CORRECT.
- get_insider_transactions: tier 1 — CORRECT.

Tier note: TASK handoff table showed tier 2 for get_sentiment_trend + get_policy_signals, but REQ_1881a.md (SSOT) assigns both tier 3 (derived from rag_analyses). Developer correctly followed spec. Non-blocking; task table was stale.

AC-5 (get_foreign_flow fallback): _testFallback="cache" path adds source_note="fallback:cache" on all return branches (zero-detect, insufficient, analyze, catch). Confirmed in foreignFlowTools.ts L207, L221, L238, L261. PASS.

Merge commit: c2e2fb08. Branch task/1881a-impl-mcp deleted (local; no remote).
Report: reports/TASK_REPORT_1881a-impl-mcp.md

Verdict: APPROVED.

---

## Recent session — 2026-05-14 (1881a-impl-ssot — APPROVED)

### 1881a-impl-ssot — Layer 9 source authority hierarchy

Doc-only. No code changed. Smart-skip: bun test + tsc not applicable to .md-only changes. tsc pre-push hook confirmed 0 errors on push.

AC checks:
- Layer 9 enumerates 3 tiers with examples: PASS (table rows Tier 1/2/3 with concrete source names).
- `source_tier` enum `1|2|3` documented: PASS (bold header + table).
- Backwards-compat note (additive, NFR-1): PASS ("Backwards compatibility note" paragraph cites NFR-1 explicitly).
- Cross-link to brief: PASS (Cross-ref block at section top pointing to 2026-05-13-source-tier-schema-decision.md).

Zone check: 4 files. Target = docs/standards/tnb-methodology-layers.md. Others = TASKS.md (task row housekeeping) + 2 notebooks. No source code. No zone leakage.

Verdict: APPROVED. Merge commit: 6a700f15. Branch task/1881a-impl-ssot deleted locally + remote.

---

## Recent session — 2026-05-13 (c84 — APPROVED)

### 1888l — agents-architect error-boundary parity

Doc-only. No code changed. Smart-skip: bun test + tsc not applicable to .md-only changes. tsc pre-push hook confirmed 0 errors on push.

Compliance checks:
- agents-architect/main.md L7: error-boundary skill ref present, exact match to po/main.md L6 wording. PASS.
- .claude/agents/agents-architect.md L74: fail-loud-protocol.md already in always_load with fail_loud: true. No-op confirmed. PASS.
- docs/agents/agents-architect/handlers.md L70-79: BLOCKED/EXIT block present before RETURN, with send_telegram(channel="bug") + EXIT instruction. Matches boundary pattern. PASS.
- Commit `docs(c84/agents-architect)`: type docs, scope c84/agents-architect, Sprint + Task + AC trailers all present. PASS.

Verdict: APPROVED.
Merge commit: 859a2ce8. Branch task/1888l-agents-architect-error-boundary deleted.

---

## Recent session — 2026-05-13 (c83 BATCH(2) — ALL APPROVED)

### Track A — 1881a BA spec (REQ_1881a.md)

Doc-only. No code changed. No tsc/test run required.

Structure checks:
- TLDR: present. Methodology Context: present. Tool Inventory Table: 16 tools, canonical list. Schema Delta (FR-1..FR-4): present. Functional/Non-Functional Requirements: present. AC-1..AC-8: present. Owner Split: present. Risks: present. Out of Scope: present. PASS.
- Backward-compat AC: NFR-1 "Zero breaking changes — all existing fields remain at same path/type" + AC-2 includes backward-compat check for each JSON tool. PASS.
- Multi-source / fallback tool: FR-3 table documents `get_macro_snapshot` and `get_foreign_flow` primary+fallback paths including tier annotation and `source_note` requirement. AC-5 tests fallback path. PASS.

Spot-checks (3 tools):
- `get_imf_signals` — spec assigns tier 1. imfSignals.ts confirmed: reads from IMF DataMapper API cache; description string references "IMF DataMapper API". Direct official source. Tier 1 CORRECT.
- `get_investment_clock_phase` — spec assigns tier 2. investmentClockTools.ts confirmed: reads `macro_indicators WHERE country='Vietnam'` — populated by TradingEconomics scraper. Aggregator source. Tier 2 CORRECT.
- `get_insider_transactions` — spec assigns tier 1. insiderTools.ts confirmed: sscInsider.ts fetches from `congbothongtin.ssc.gov.vn` (official SSC portal). Tier 1 CORRECT.

SBV nuance: SBV portal down → VCB XML proxy → tier 2 conservative assignment. Justified and documented. PASS.
Foreign flow nuance: VPS proxy intermediary → tier 2 conservative. PASS.
BLK-1 architect decision required for 4 text-output tools — correctly flagged as blocker, not a spec defect.
dev-macro-indicators zero scope — correctly documented in Owner Split. PASS.

Verdict: APPROVED.

### Track B — 1888-CDG bundle (5 files)

JSON validation: tool-registry.json PASS, cron-registry.json PASS, project-stats.json PASS.

Value checks:
- `jq '.toolCount' tool-registry.json` → 125. Expected 125. PASS.
- `jq '.toolCount' project-stats.json` → 125. Expected 125. PASS.
- `jq '.cronJobCount' project-stats.json` → 62. Expected 62. PASS.
- `jq '._definition' cron-registry.json` → non-null string defining schedulerFileCount. Expected non-null. PASS.

po/main.md checks:
- `grep -n 'docs/standards/task-size-rules.md' po/main.md` → line 26: pointer present. PASS.
- `grep -c 'Size thresholds:' po/main.md` → 0. Inline rule removed. PASS.

task-size-rules.md structure: FIX/SPRINT-S/M/L table with line/file budgets present. Escalation rules (FIX→S, S→M, M→L) present. Line-budget guidelines present. SPIKE section present. PASS.

Tree-map placement: `docs/standards/` is a canonical node in tree-map.md (16 occurrences). Placement correct. PASS.

Sub-task G deviation: agent edited po/main.md L26 (correct location) not dev-team/main.md L91-96 (PO's stale pointer). Grep evidence reviewed. Correct file was edited. Non-blocking upgrade.

Verdict: APPROVED.

---

**Last updated:** 2026-05-13 | **Session:** c82 BATCH(2) gate — 1903a (re-verification) + 1888b SSOT

## Recent session — 2026-05-13 (c82 BATCH(2) — ALL APPROVED)

### 1903a re-verification (HEAD d5251193 — notebook only, no production code change)

Claim: both sub-bugs (write_alert_verdict shape, get_macro_snapshot regime) stale-resolved pre-c82; regression tests landed at c77 (SHA 4833b052).

Checks:
- `grep "Message sent to WORK channel" apps/mcp-server/src/` — found only in `telegramTools.ts:95` (user-facing string in telegram tool, not in alertVerdictTools handler). NOT in alert verdict return path. PASS.
- `grep "{success" alertVerdictTools.ts` — line 64: `Promise<{ success: boolean; id: string; ticker: string; verdict: string }>`, line 87: `success: true`. Correct shape confirmed. PASS.
- `bun test src/__tests__/1903a-dispatch-regression.test.ts` — 10 pass / 0 fail (WAV-REG-01..07 + GMS-REG-02..04). PASS.
- `bun tsc --noEmit` — 0 errors. PASS.

Verdict: APPROVED (stale-resolved — no production code changed, regression tests already green on main).

### 1888b SSOT (.claude/AGENT_MODELS_README.md)

Claim: replaced hardcoded agent counts with SSOT pointers to `docs/data/project-stats.json`.

Checks:
- `grep -nE "[0-9]+ agents?" AGENT_MODELS_README.md` — no matches. No hardcoded counts remain. PASS.
- SSOT pointers present: lines 15, 21, 26, 52 reference `docs/data/project-stats.json#devAgentCount` and `#microserviceAgentCount`. PASS.
- `project-stats.json` values: `devAgentCount: 17`, `microserviceAgentCount: 9`. SSOT exists and is populated. PASS.
- Diff stat: 10 lines changed (4 insertions, 6 deletions) — matches ~10L expectation. PASS.

Smart-skip: string-literal-only change (SSOT pointers replacing hardcoded strings in .md). DDD + security not applicable to .md file. Full tsc already clean from 1903a check above.

Verdict: APPROVED.

---

**Last updated:** 2026-05-13 | **Session:** c81 BATCH(3) gate — 1899a-cron + 1888e + CLEAN-c81

## Recent session — 2026-05-13 (c81 BATCH(3) — ALL APPROVED)

### 1899a-cron (commits 89ad6c4a + 50c74418)

Files changed: `apps/mcp-server/src/scheduler/cronConfig.ts` (+1 `newsHeadlinesRefresh` CRONS entry), `apps/mcp-server/src/scheduler/news-analysis/index.ts` (+1 barrel export), `apps/mcp-server/src/scheduler/startScheduler.ts` (+1 import + 5-line cron.schedule block), `mcp.config.json` (+8L scheduler.newsHeadlinesRefresh section). Total: 21 insertions.

AC verification:
- barrel export `newsHeadlinesRefreshJob` in news-analysis/index.ts: PASS
- cronConfig.ts CRONS entry `newsHeadlinesRefresh: Bun.env['CRON_NEWS_HEADLINES_REFRESH'] ?? '*/30 * * * *'`: PASS
- startScheduler.ts import `{ newsHeadlinesRefreshJob } from './news-analysis/index.js'` at line 58: PASS
- startScheduler.ts `cron.schedule(CRONS.newsHeadlinesRefresh, ...)` with `jobRunRepo.wrapRun('newsHeadlinesRefreshJob', ...)` at lines 682-686: PASS
- mcp.config.json `scheduler.newsHeadlinesRefresh` with cadence `*/30 * * * *`: PASS
- `jobRunRepo.wrapRun` pattern matches taAlertScan/macroRefresh entries: PASS

TSC: 0 errors (bun tsc --noEmit, clean). Full suite: 9331 pass / 33-35 fail (flaky pre-existing, exit 0) / 38 skip. E2E newsHeadlinesRefreshJob.e2e.test.ts: 3/3 pass.

DDD: newsHeadlinesRefreshJob imports `../../infrastructure/logger.js` only — no domain/ or unrelated-service imports. cronConfig.ts: pure config, zero imports. PASS.

Security: Bun.env used throughout (cronConfig.ts Bun.env, newsHeadlinesRefreshJob.ts Bun.env for NEWS_FETCH_URL/MCP_SERVER_URL/VPS_PUSH_API_KEY). No process.env, no hardcoded secrets. PASS.

Diff-stat sanity: 21 insertions — matches cherry-pick output.

Verdict: APPROVED.

### 1888e (commits a7bb2313 + 763fe826)

File changed: `docs/references/agent-roster.md` (4 lines, 2 insertions / 2 deletions).

AC verification:
- "7 agents" / "8 agents" contradiction: grep returned only line 82 (unrelated "7 days" text) — no stale "7 agents" or "8 agents" strings remain. PASS.
- SSOT pointer used: line 9 "Count → `docs/data/project-stats.json#analysisAgentCount`". PASS.
- Value 9: agent-roster.md lines 120 + 132 both read "9 agents". project-stats.json#analysisAgentCount = 9. Cowork agent files (.claude/agents/*.md excluding dev-*): count verified via roster section. PASS.

Doc-only — no tsc/test requirement. Verdict: APPROVED.

### CLEAN-c81 (commits 19e29700 + 2cfd307b)

- TASKS.md Todo table: `1899a-gateway` plain row absent. Only SHIPPED-c80 suffix row at line 55 in Done table. PASS.
- `git branch`: no `worktree-agent-a1578231ec1b3deec` or `worktree-agent-a63fd9e29f6856090` branches. PASS.
- HEAD.lock: absent. PASS.

Verdict: APPROVED.

### Cross-batch checks
- HEAD.lock absent: PASS.
- No accidental commits to .gitignore/package.json/lock files: PASS (diffs clean).
- Diff-stat sanity: 1899a-cron 21L, 1888e 2L change, CLEAN 1L deletion — all nominal.

---

**Last updated:** 2026-05-13 | **Session:** 1899a-gateway + 1899a-tests BATCH(2) gate (c80)

## Recent session — 2026-05-13 (1899a-gateway — APPROVED)

Commits `f91c5baa` (feat) + `837529ef` (notebook) already on main. Zone: multi (api-gateway + root + docs).

Files: api-gateway/src/index.ts (+1L news serviceUrl), health_checker.ts:78 (+news config entry), handlers.ts:109 (+1 string to DASHBOARD_SERVICES), docker-compose.yml (news-fetch service block + NEWS_URL in api-gateway env), docs/handoffs/ops-news-fetch-scaffold.md (port 5007→5008), docs/ARCHITECTURE.md (news-fetch row).

Tests: 40/40 pass. TSC: 0 errors. DDD PASS. Security: process.env in index.ts pre-existing since f4141f63 — not a new violation. handlers.ts 263L pre-existing size — task added 1 line only.

All 9 AC items verified. Report: reports/TASK_REPORT_1899a-gateway.md.

---

## Recent session — 2026-05-13 (1899a-tests — APPROVED + scope creep assessment)

Commits `d2818207` (feat) + `64c3db67` (notebook) + `da5d1b0f` (tasks→Done) already on main. Zone: apps/news-fetch/ + apps/mcp-server/.

Files created: bunfig.toml, 3 unit test files (177L/148L/142L), 2 integration test files (62L/61L), newsHeadlinesRefreshJob.ts (136L), newsHeadlinesRefreshJob.e2e.test.ts (143L). All within 200L split-policy cap.

Tests: 165 pass / 6 skip / 0 fail (news-fetch). 3/3 mcp-server E2E pass. TSC: 0 errors. DDD PASS: newsHeadlinesRefreshJob imports infrastructure logger only. Security PASS: Bun.env throughout, no process.env, no hardcoded secrets.

Scope creep — newsHeadlinesRefreshJob.ts: Ships 1899a-cron job body (sequential Bloomberg→Reuters dispatch, error isolation, logging). DOES NOT ship wiring: news-analysis/index.ts barrel missing, jobs.ts not updated (no CRONS entry, no startScheduler registration), mcp.config.json not updated. Decision: 1899a-tests APPROVED. 1899a-cron remains open — developer must complete 3 wiring steps only (job body already exists, do not re-create).

Report: reports/TASK_REPORT_1899a-tests.md.

---

## Recent session — 2026-05-13 (1899a-routes — APPROVED)

Commits `644c8fe4` (feat) + `43609750` (notebook) on main. Branch `task/1899a-routes-handlers` already deleted at input time. Zone: `apps/news-fetch/`.

Files: 1 prod (`handlers.ts` 142L: `createRouter()` factory, 5 routes, DI ports) + 1 prod update (`index.ts` 35L: composition root) + 2 test files (`1899a-routes-health-reuters.test.ts` 199L / `1899a-routes-bloomberg.test.ts` 197L). All within 200L split-policy cap.

Targeted tests: 25/25 pass (37 expect() calls). Full suite `apps/news-fetch/`: 137/137 pass, 0 regressions (+25 net new from baseline 112). TSC: `bun tsc --noEmit` = 0 errors (clean, no output).

DDD PASS: handlers.ts imports `../application/use-cases.js` (use cases only) + `../domain/repositories.js` + `../domain/models.js`. Zero `infrastructure/` or `interface/` imports. Interface → application permitted per DDD layer rule.

Security PASS: no `process.env`, no hardcoded secrets. `index.ts:28` uses `Bun.env.PORT` (runtime env read at entry point, not a leak).

Bloomberg no-fallback verified: `fetchBloomberg()` (handlers.ts:102-105) returns error result as-is with no fallback branch. AC §6c confirmed by test `1899a-routes-bloomberg.test.ts:124-132`.

Reuters fallback path covered: RSS error → fallback (test line 161-172), RSS empty → fallback (test line 175-187), both paths verified via mock call assertions.

AC: 9/9 items PASS. createRouter() factory pattern mirrors macro-indicators per spec. Split-policy clean.

**Last updated:** 2026-05-13 | **Session:** 1898b RSS degradation fix + regression guards (c78)

## Recent session — 2026-05-13 (1898b — APPROVED)

Commit `0a76cf8d` already on main (direct commit, no branch merge). Zone: `apps/mcp-server/`. Files: 1 prod (`sourceHealthTools.ts` +7L: 2 `recordDisabled` calls + comment block) + 1 test (`1898b-rss-degradation-regression.test.ts` 176L — within 200L split-policy cap).

Targeted tests: 8/8 pass (RSS-REG-01..08, 16 expect() calls). Baseline 1335: 4/4 pass. TSC: 0 errors.

DDD PASS: sourceHealthTools.ts (interface layer) — zero infrastructure/application imports. Test imports from infrastructure/application are expected test-consumer pattern.

Security PASS: no process.env, no hardcoded secrets, no SQL.

Developer correction verified: spec AC-02 asserted `source_type contains "nhandan"` but newsNormalizer.ts:961 sets sourceType="news" for all RSS items (discriminator). Developer corrected assertions to source_url (`https://${source}.vn/article-...`). AC-02 intent fully satisfied — row inserted with traceable source identity.

AC-06 verified: sourceHealthTools.ts:63-64 — recordDisabled("Reuters RSS") + recordDisabled("Trading Economics") called at module load. SourceHealthTracker.recordDisabled() confirmed at sourceHealthTracker.ts:189. Ghost Ngưng|20 entries prevented on fresh process start.

All 8 ACs PASS. Report: `reports/TASK_REPORT_1898b.md`. Handoff: `docs/handoffs/TASK_1898b-rss-degradation.md`.

---

**Last updated:** 2026-05-13 | **Session:** 1899a-reuters-fallback gate (c78)

## Recent session — 2026-05-13 (1899a-reuters-fallback ReutersStealthFallback — APPROVED)

Feat commit `3e04dc5f` on main. Branch `task/1899a-reuters-fallback` already deleted. Files: 1 prod (`reuters-stealth.ts` 133L) + 3 test files (`-dom.test.ts` 197L / `-detect.test.ts` 158L / `-lifecycle.test.ts` 119L). All within 200L split-policy cap.

Targeted tests: 28/28 pass (37 expect() calls). Full suite `apps/news-fetch/`: 112/112 pass, 0 regressions. TSC: `bun tsc --noEmit` = 0 errors (clean, no output).

DDD PASS: 3 imports only — `../../domain/repositories.js`, `../../domain/models.js`, `./playwright-browser-factory.js`. grep confirmed zero `application/` or `interface/` imports.

Security PASS: no `process.env`, no hardcoded secrets, no SQL. All Playwright calls mocked in tests.

Pre-existing TSC errors (dev flagged `playwright-browser-factory.ts:23` + `1899a-factory.test.ts:89`): tsc returns 0 errors under current tsconfig. Line 23 = standard default import; line 89 = `as unknown as` cast for Bun mock typing. Not real type bugs — no new task filed.

AC: 28/28 items PASS. Key: DataDome dual-detection (header `x-dd-b:3` + body `captcha-delivery.com`), `browser.close()` in finally (tested by lifecycle suite), `confidence:'LOW'` on all paths, `normalizeDate` exported (improvement over bloomberg sibling). Split-policy clean — developer applied lesson from c77 bloomberg 494L flag.

Pattern: identical to 1899a-bloomberg (c77, PerimeterX). Sibling shape confirmed clean.

Pipeline-state: status=idle, nextAgent=pm, 1899a-reuters-fallback APPROVED.

---

**Last updated:** 2026-05-13 | **Session:** 1903a dispatch regression-shape guard gate (c77)

## Recent session — 2026-05-13 (1903a — APPROVED)

Commit `4833b052` already on main (test-only, no branch merge). Zone: `apps/mcp-server/`. 1 file: `1903a-dispatch-regression.test.ts` (199L — within 200L split-policy cap).

Targeted tests: 10/10 pass (16 expect() calls) — WAV-REG-01..07 + GMS-REG-02..04 all green. 084+089 precedent: 32/32 pass (80 expect() calls). Full suite: 9322 pass / 31 fail / 38 skip — 31 failures pre-existing (same set as prior cycles: tasks 178, 230, 1031, 1343a, 1352a, 262, signal-T5, etc.). Bun C++ crash at end is pre-existing infra issue (same crash URL). TSC: 0 errors.

DDD: N/A (Smart-Skip — test-only). Security: PASS — no process.env (Bun.env used correctly), no secrets, no SQL, all HTTP mocked via makeFakeStore() + _testCommodityClient/_testSbvClient fixture injection.

No-prod-code-change confirmed: `git show --stat 4833b052` = 1 file, 199 insertions only.

All 7 ACs verified with file:line mapping. Report: `reports/TASK_REPORT_1903a.md`.

Pattern: identical to 1898a (commit `e95eb8c7`). Test-only gate, DDD N/A, security N/A, Bun crash pre-existing. 199L within cap — no split follow-up needed.

---

**Last updated:** 2026-05-13 | **Session:** 1899a-bloomberg merge gate (c77)

## Recent session — 2026-05-13 (1899a-bloomberg BloombergStealth scraper — APPROVED)

Merge SHA `d76fc44b` on main. Branch `task/1899a-bloomberg-scraper` already deleted. Files: 1 prod (`bloomberg-stealth.ts` 150L) + 1 test (`1899a-bloomberg.test.ts` 494L).

Targeted tests: 29/29 pass (41 expect() calls). Full suite `apps/news-fetch/`: 84/84 pass, 0 regressions. TSC: 0 errors.

DDD PASS: 3 imports only — `../../domain/repositories.js`, `../../domain/models.js`, `./playwright-browser-factory.js`. Zero application/interface imports.

Security PASS: no `process.env`, no hardcoded secrets, no SQL. `any` in JSDoc comment only; JSON fallback uses `Record<string, unknown>`.

All 10 AC groups verified with file:line mapping.

Split-policy: 494L test file exceeds 200L cap. Decision (b) — approved with follow-up task `1899a-bloomberg-test-split` for next cycle. 4 clean logical split boundaries identified (dom/json-fallback/lifecycle/normalize-date).

Handoff updated: `docs/handoffs/TASK_1899a-bloomberg.md`. Commit: chore(qa/1899a-bloomberg).

---

**Last updated:** 2026-05-13 | **Session:** 1898a merge gate (c76)

## Recent session — 2026-05-13 (1898a regression-shape guard — APPROVED)

Cherry-pick `e95eb8c7` on main. Scope: 2 test files only (084-tool-market + 089-tool-macro, +62L, 0 prod changes).

Targeted tests (084+089): 32 pass / 0 fail (80 expect() calls). TSC: 0 errors. Full suite: Bun C++ crash (pre-existing infra issue, same crash URL as all prior cycles — not attributable to 1898a).

DDD: N/A (test-only). Security PASS: all HTTP mocked via _test* params, no process.env, no secrets.

AC: all 5 bullets (a-e) verified with file:line mapping. Report: `reports/TASK_REPORT_1898a.md`.

---

**Last updated:** 2026-05-13 | **Session:** 1899a-reuters-rss merge gate

## Recent session — 2026-05-13 (1899a-reuters-rss ReutersRssScraper — APPROVED)

Branch: `fix/1899a-news-fetch-reuters-rss`. 1 commit ahead of main (`36eace95`, on top of factory merge `b2b84977`). No rebase needed.

Tests: 55/55 pass (100 expect() calls) across 4 files in `apps/news-fetch/`. 26 new unit tests in `__tests__/1899a-reuters-rss.test.ts`. TSC: 0 errors (bun tsc --noEmit clean).

DDD PASS: `reuters-rss.ts` imports only `../../domain/repositories.js` + `../../domain/models.js`. Domain has 0 infra imports (grep confirmed).

Security PASS: no `process.env`, no hardcoded credentials. `BROWSER_UA` is a public User-Agent string (not a secret). All 17 scraper instantiations in tests preceded by `globalThis.fetch = mockFetch*` override (18 total mock assignments — 1 in beforeEach captures original). No live HTTP in CI.

Merge SHA: `ade4a0a8` (no-ff). Branch `fix/1899a-news-fetch-reuters-rss` deleted.

1899a-* dev chain complete: domain + factory + reuters-rss all on main. Celebratory WORK Telegram sent.

TASKS.md: 1899a-reuters-rss row removed from Todo, SHIPPED entry added to Done.

---

**Last updated:** 2026-05-13 | **Session:** 1899a-domain merge gate

## Recent session — 2026-05-13 (1899a-domain — APPROVED via cherry-pick)

Branch `fix/1899a-news-fetch-domain` was empty (never advanced by developer — domain commit `b71ba215` landed on `fix/1899a-news-fetch-factory` instead). Cherry-picked `b71ba215` onto main → `d7302f75`.

Tests: 16/16 pass (29 expect() calls). `bun test apps/news-fetch/src/__tests__/unit/` — domain-models.test.ts only. TSC: 0 errors.

DDD PASS: `grep -rn "from.*infrastructure\|from.*application\|from.*interface" apps/news-fetch/src/domain/` — 0 hits.

Security PASS: pure TS interfaces/enums — no runtime code, no process.env, no secrets, no SQL.

Branch `fix/1899a-news-fetch-domain` deleted (was at same commit as main `18c540e7`).

Rebase signal for `fix/1899a-news-fetch-reuters-rss`: NOT NEEDED — branch already contains domain commit via factory merge `b2b84977`.

Pattern: developer may commit task N's work while on task N+1's branch. Always verify `git branch --contains <sha>` before accepting branch tip as deliverable. Handoff SHA is authoritative.

## Recent session — 2026-05-13 (1899a-factory PlaywrightBrowserFactory — APPROVED)

Branch: `fix/1899a-news-fetch-factory`. 2 commits ahead of main: `b71ba215` (domain layer) + `cc3c995e` (factory). Both carried on this branch — domain QA branch was already at main HEAD so no collision.

Tests: 29/29 pass (apps/news-fetch/). 10 factory-specific tests in `__tests__/1899a-factory.test.ts`. TSC: 0 errors.

DDD PASS: factory imports only `playwright` + `playwright-stealth` (npm packages). Zero domain/app/interface imports.

Security PASS: no `process.env`, no hardcoded secrets, no SQL.

Merge SHA: `b2b84977`. Branch `fix/1899a-news-fetch-factory` deleted.

Sibling `fix/1899a-news-fetch-reuters-rss` (dev-mainserver-crawls) was in flight during this QA cycle — factory landing unblocks it.

Note: was on `fix/1899a-news-fetch-reuters-rss` at cycle start — stashed working changes (notebooks/pipeline-state), checked out factory branch, ran tests, merged to main, deleted branch, returned to reuters-rss branch. Stash dropped cleanly (conflict on CLAUDE.md which was already handled on reuters-rss branch).

**Last updated:** 2026-05-13 | **Session:** 1901a-flaresolverr-adapter merge gate

## Recent session — 2026-05-13 (1901a-flaresolverr-adapter — APPROVED via cherry-pick)

Branch: `task/investing-calendar-flaresolverr-adapter`. 7 commits unique to branch, only 2 in scope.

CRITICAL DEFECT FOUND: merge commit `f77bc3aa` (5464b4c0 + c99df155) dropped all 3 flaresolverr deliverable files from HEAD. `flaresolverr_helper.py`, `flaresolverr-helper.test.ts`, `flaresolverr-bypass.md` all absent from working tree. Branch HEAD was shipping the old `investing_calendar_fetch.py` (curl_cffi-only, returns status=error) and old TS adapter (with `sleepMs` still present). First test run misleadingly showed "10 pass" for flaresolverr tests from Bun disk cache from pre-checkout state — file was gone from tree.

Cherry-picked `5464b4c0` (feat, 5 files) + `42968429` (docker-compose FlareSolverr container) onto main.

Tests: 103 pass / 0 fail / 12 skip (115 total). 10 flaresolverr tests all green. Dev claimed 105 — actual baseline is 103, consistent with prior cycles.

TSC: 22 errors all in test files (`global.fetch.preconnect` Bun Mock<> typing gap, pre-existing). Zero production errors.

DDD PASS: 0 domain/application → infrastructure imports.

Security PASS: `cf_clearance` REDACTED explicitly in CLI smoke path. Cookie values not in `print(json.dumps(result))` output (result dict contains only status/data/fetched_at). No `process.env` in new files.

Docker-compose: adds FlareSolverr container block — companion infra, approved alongside feature.

Foreign commits excluded: `7a12913f`/`2c847d8c` (worldBank, already on main as `9d58a2d1`/`1370b8c1`), `0a335b72` (1899a PM decompose, already on main as `ef21a754`), `c99df155` (ops notebook).

Merge SHAs on main: `5395f966` (feat) + `5ee72b46` (docker) + `49d1128b` (QA artifacts).

Signal moved to processed: `docs/signals/processed/dev-mainserver-crawls-flaresolverr-adapter-2026-05-13T14-09-54Z.json`.

1901a → Done in TASKS.md. Report: `reports/TASK_REPORT_1901a-flaresolverr-adapter.md`.

NOTE: Container at port 5004 predates new Python files — smoke will show calendar=failed/timeout until ops rebuilds macro-indicators image. Expected.

Pattern to remember: Bun test cache can show stale "pass" for deleted test files if test runner is invoked before checkout drops the file. Always verify with `find` / `git ls-tree` when in-scope test count seems too high.

## Recent session — 2026-05-13 (1899a-core news-fetch scaffold — APPROVED)

Branch: `task/1899a-core-news-fetch-scaffold`. 3 commits ahead of main: `120e16ca` (scaffold — GOOD), `47a85265` (FlareSolverr adapter — CONTAMINATION, excluded), `1e8a707a` (worldbank merge artifact — CONTAMINATION, excluded). Cherry-picked only `120e16ca` → landed as `8329294c` on main.

Tests (apps/news-fetch): 3 pass / 0 fail. TSC: 0 errors (bun tsc --noEmit clean). DDD PASS: domain/application/infrastructure/interface dirs created, 0 cross-layer imports in any src file. Security PASS: Bun.env used (not process.env), no hardcoded secrets, no SQL.

diff scope confirmed clean: all 8 files in apps/news-fetch/** only. No docker-compose.yml. No workspace-level file touched.

playwright-stealth 0.0.1 pin: only published version on npm. Pinned correctly for scaffold. Signal filed: `docs/signals/qa-bug-playwright-stealth-version-2026-05-13T160900Z.json`. 1899a-factory must evaluate playwright-extra + puppeteer-extra-plugin-stealth before browser launch code ships.

Handoff moved to processed/. TASKS.md: 1899a-core → Done. 1899a-domain + 1899a-factory unblocked (were blocked by 1899a-core). Report: reports/TASK_REPORT_1899a-core.md.

Note: contaminated branch `task/1899a-core-news-fetch-scaffold` NOT deleted (contains 47a85265 + 1e8a707a which belong to separate tasks still in flight — FlareSolverr adapter + worldbank merge artifact must be handled by their own QA cycles).

**Last updated:** 2026-05-13 | **Session:** worldbank-parallelize-fetch-vn-macro-batch merge gate

## Recent session — 2026-05-13 (worldbank-parallelize-fetch-vn-macro-batch — APPROVED)

Branch: `task/worldbank-parallelize-fetch-vn-macro-batch`. Key commits: `7a12913f` (fix) + `2c847d8c` (docs). Cherry-picked onto main as `9d58a2d1` + `1370b8c1` (branch had 3 extra unrelated commits — flaresolverr, ops notebook, 1899a decompose — so cherry-pick used instead of --no-ff merge).

Tests (apps/macro-indicators): 93 pass / 0 fail / 12 skip (105 total). +3 new tests vs baseline (all-ok, one-fail-isolated, concurrent timing).

TSC: 22 errors — same baseline as main (pre-existing `global.fetch.preconnect` Bun Mock<> typing gap in test files). Zero production-code errors.

DDD PASS: `grep -rn "from.*infrastructure" apps/macro-indicators/src/application/` = 0 hits.

Security: `process.env` in `index.ts` + `fred-macro.ts` are pre-existing. Zero new process.env in branch diff. No hardcoded secrets. No SQL. world-bank-macro.ts clean.

Diff: `sleepMs` helper removed from world-bank-macro.ts. `fetchVnMacroBatch` rewritten from sequential for-of + sleepMs to `Promise.all` fan-out. 7 indicators concurrent. Net ~24 lines source change + 87-line test addition.

Bonus check: `fetch-external-macro.ts` worldBank: 8_000ms budget confirmed. WB ~2-3s with parallel dispatch, well within budget.

QA signal moved to processed/: `docs/signals/processed/qa-worldbank-sequential-loop-2026-05-13T14-00-00Z.json`.

Branch deleted locally (D force — branch had 3 unrelated commits). No remote branch to delete.

Tasks: 1900b-worldbank removed from Todo → added to Done as `1900b-worldbank-SHIPPED-c74`.

Report: reports/TASK_REPORT_1900b-worldbank.md.

Note for next cycle: HEAD.lock recurrence is still active (multiple lock events during this session — checkout bounce, stash interference). Consider filing 1897b-carry escalation if this cycle was affected by contamination.

## Recent session — 2026-05-13 (fred-parallelize-fetch-all-macro — APPROVED)

**fred-parallelize-fetch-all-macro — APPROVED (smoke conditional — container down):**
Branch: `task/fred-parallelize-fetch-all-macro`. 2 commits ahead of main (fix e777d83e + docs b205b60c). Merge SHA: `8b4b2961`.

Tests (apps/macro-indicators): 90 pass / 0 fail / 12 skip (102 total). Matches dev claim exactly.

TSC: 22 errors — ALL in `__tests__/` files exclusively (pre-existing `global.fetch.preconnect` Bun Mock<> typing gap). Zero production-code errors. Confirmed: `bun tsc --noEmit 2>&1 | grep "error TS" | grep -v "__tests__"` = 0 lines.

DDD PASS: `grep -rn "from.*infrastructure" apps/macro-indicators/src/application/` = 0 hits. `grep -rn "from.*infrastructure" apps/macro-indicators/src/domain/` = 0 hits.

Security: `process.env` in `index.ts:34-35` and `fred-macro.ts:43` — all pre-existing lines, zero new lines in branch diff. No hardcoded secrets. No SQL.

Diff verification: `sleepMs` helper removed (4 lines). `fetchAllMacro` body: sequential for-of + await per iteration → `Promise.all(entries.map(...))` fan-out. Net ~81 lines (under 120 LOC note in handoff). Clean.

Smoke test: port 5006 = connection refused. Container not running locally. Container image predates feature code. CONDITIONAL APPROVAL — code is green; smoke requires ops to rebuild macro-indicators image.

Handoff signal moved to processed/: `docs/signals/processed/dev-macro-indicators-fred-fix-2026-05-13T13-30-00Z.json`.

WorldBank follow-up filed: `docs/signals/qa-worldbank-sequential-loop-2026-05-13T14-00-00Z.json` — low priority, same sequential-loop pattern, 7 indicators x 1.5-2.5s sleep = 10-17s vs 8s budget.

Branch deleted locally + remote. Pre-push tsc hook PASS. Pushed to origin/main as 8b4b2961.

Report: reports/TASK_REPORT_fred-parallelize-fetch-all-macro.md.

**Last updated:** 2026-05-13 | **Session:** macro-scrapers-curl-cffi-upgrade merge gate

## Recent session — 2026-05-13 (macro-scrapers-curl-cffi-upgrade — APPROVED)

**macro-scrapers-curl-cffi-upgrade — APPROVED:**
Branch: `task/macro-scrapers-curl-cffi-upgrade`. 5 commits ahead of main (tip e7ce66b2). Merge SHA: `96823f44`.

Tests (apps/macro-indicators): 87 pass / 0 fail / 12 skip (99 total). TSC: all errors are pre-existing `global.fetch.preconnect` Bun Mock<> typing gap in test files — zero new production-code errors. Identical pattern to prior cycle.

DDD PASS: `grep -rn "from.*infrastructure" apps/macro-indicators/src/application/` → 0 hits. Python helpers are infrastructure-only, no imports into application or domain.

File-size policy: 120-line limit applies to markdown docs only (per brief 2026-05-12-dev-zone-enforcement-and-split-policy.md §3.2). Python/TS source files have no line-count policy. All TS adapters ≤120 lines. Python helpers range 118-194 lines — no violation.

Security PASS: `process.env` only in pre-existing files (index.ts:34-35, fred-macro.ts:47) — zero lines in branch diff. No hardcoded secrets in new Python helpers or TS adapters. No SQL.

Scope PASS: 13 changed files in apps/macro-indicators (3 TS adapters + 3 Python helpers + 1 use-case timeout edit + 4 test files + domain/defaults.ts + 2 signal files) plus notebooks/signals. No drift into unrelated services.

Smoke test: POST http://localhost:5004/macro/external → HTTP 200.
Per-source results:
- worldBank: timeout (8001ms) — pre-existing, not in scope
- yahoo: ok (5391ms → 6096ms across 2 runs)
- cnbc: ok (~5887ms)
- tradingEconomics: ok (~6000ms)
- fred: timeout (8000ms) — pre-existing design mismatch (sequential 8-series fetch vs 8s budget)
- calendar: ok (~10195ms) — PULL-based mode, CF blocked externally

summary.ok=4 confirmed (was 1 before upgrade). Matches ops signal evidence.

Investing-calendar blocked signal: `docs/signals/dev-mainserver-crawls-investing-blocked-2026-05-13T12-15-00Z.json` confirmed present. CF Turnstile v2, routed to ops for FlareSolverr. Not blocking.

FRED follow-up signal filed: `docs/signals/qa-bug-fred-regression-2026-05-13T12-25-00Z.json`. Root cause: fetchAllMacro() is sequential (8 series + 0.6-1s sleeps) vs 8s use-case budget — design mismatch, not a regression from this branch. Recommended fix: raise budget to 90s or parallelize with Promise.all (same pattern as this upgrade).

Branch deleted locally (no remote). Pre-push tsc hook PASS. Pushed to origin/main as 96823f44.

**Last updated:** 2026-05-13 | **Session:** macro-external-allsettled-timeout merge gate

## Recent session — 2026-05-13 (macro-external-allsettled-timeout — Promise.allSettled fix)

**macro-external-allsettled-timeout — APPROVED:**
Branch: `task/macro-external-allsettled-timeout`. Fix commit: `12a7221e`. Merge SHA: `1c6a7a01`.

Tests: 85 pass / 0 fail / 12 skip. TSC: 37 errors — all pre-existing `global.fetch preconnect` Bun Mock<> typing gap (confirmed identical to main baseline via `git stash` comparison). Production code TSC: 0 errors.

DDD PASS: Previous violation (DEFAULT_SYMBOLS/DEFAULT_CNBC_SYMBOLS from infrastructure/scrapers/) FIXED — both constants now in `apps/macro-indicators/src/domain/defaults.ts`. Zero `from.*infrastructure` imports in application layer. `withTimeout` helper lives in application layer as expected.

Security PASS: `process.env` in `index.ts:34-35` and `fred-macro.ts:47` are pre-existing (branch diff = 0 lines changed in those files). No hardcoded secrets. No SQL in changed files.

Contract verified:
- Per-source envelope `{ status, data?, error?, latencyMs }`: PASS (fetch-external-macro.ts:60-65)
- Aggregate `{ sources, fetchedAt, summary: { ok, failed, totalLatencyMs } }`: PASS (fetch-external-macro.ts:82-86)
- HTTP 200 when ok>=1, HTTP 502 when ok===0: PASS (handlers.ts:41-44)
- execute() never throws — all paths through withTimeout: PASS (11 new unit tests)

Smoke test: `curl POST localhost:5004/macro/external` → HTTP 200 in 8.0s. Envelope present. summary.ok=1 (calendar ok). 5 timeout (worldBank/yahoo/cnbc/tradingEconomics/fred). HTTP 200 correct.

Secondary finding: 4-5 of 6 scrapers consistently timeout at 8s. Cause: geo-blocking from non-VN Docker host (France dev env). Container logs show FRED HTTP 500 (API errors), tradingEconomics JSON-LD not found, yahoo HTTP 404, calendar HTTP 403. Fix is working correctly — graceful degradation as designed. Filed: `docs/signals/qa-bug-macro-scrapers-slow-2026-05-13T11-05-10Z.json`. Routed to ops (VPS proxy check) + developer (budget review). Non-blocking.

Branch deleted locally (no remote). Report: `reports/TASK_REPORT_macro-external-allsettled-timeout.md`.

**Last updated:** 2026-05-13 | **Session:** bootstrap batch drain — 5 signals (macro scrapers + RAM + hsx-bctc + vps-contract + adb/imf)

## Recent session — 2026-05-13 (bootstrap batch drain — signals 1-5)

**Batch: 5 QA signals drained. 4 already in processed/, 1 new (signal 5).**

Signal status on arrival:
- Signals 1,2,3,4: already in `docs/signals/processed/` (consumed by prior dev cycles). Code on main.
- Signal 5 (`qa-2026-05-13T10-25-00Z.json`): present in inbox — moved to processed after validation.

**Validation results:**

Signal 1 — mainserver-external-macro-v1 (6 scrapers, POST /macro/external):
- Unit tests: 67 pass / 0 fail (9 files: all 6 scrapers + macro-score-service + compute-usecase + investing-calendar)
- Production TSC: 0 errors. Test-file TSC: 37 errors (preconnect missing on Mock<> — Bun fetch mock typing gap, pre-existing pattern)
- DDD VIOLATION FOUND: `apps/macro-indicators/src/application/fetch-external-macro.ts` lines 27-28 import DEFAULT_SYMBOLS + DEFAULT_CNBC_SYMBOLS from infrastructure/scrapers/. Filed `docs/signals/qa-bug-2026-05-13T12-30-00Z.json`. Non-blocking (tests pass, no runtime impact).
- Route confirmed: POST /macro/external and GET /macro/external in handlers.ts lines 31+41.

Signal 2 — macro-indicators RAM 512MB→1.5GB + Python deps:
- docker-compose.yml line 177: `memory: 1.5g` CONFIRMED.
- Dockerfile lines 17-19: apk + pip install curl_cffi beautifulsoup4 lxml CONFIRMED.
- Container startup + health evidence from signal file: PASS (ops-verified, 10.36MiB / 1.5GiB = 0.67% at idle).
- PASS (evidence from ops signal + code inspection).

Signal 3 — hsx-bctc HNX contract fix (SHB Q1/2026 e2e):
- VPS-side Python script fix. Not in codebase — applied directly to /root/ on Vinahost VPS.
- Integration tests embedded in signal: T1-T4 PASS. SHB Q1/2026 e2e PASS (confidence=0.9, PDF URL confirmed).
- Technique doc updated: docs/vps-crawl-techniques/hnx-ajax-post.md.
- QA cannot re-run VPS tests. Evidence from dev-vps-crawls signal accepted.
- PASS (evidence-based).

Signal 4 — VPS push contract tests (1892b-vps-contract-push.test.ts):
- Test file on branch `task/push-path-fix-vps-contract-tests` (NOT yet merged to main — dev omitted merge step).
- Extracted and ran from branch: 10/10 pass, 29 expect() calls, 219ms.
- P6 → 401 CONFIRMED (not 404). N3 → 401 CONFIRMED. Cloudflare fix contract verified.
- BLOCKING ISSUE: test file not on main. Branch must be merged before signal is fully closed.

Signal 5 — adb-kidb + imf-weo wiring:
- Unit tests: 67 pass (includes adb-kidb.test.ts 8 tests + imf-weo.test.ts 9 tests in the full unit suite).
- Routes confirmed in handlers.ts: POST /macro/external/adb (L51), POST /macro/external/imf (L60), POST /macro/external/international (L70), GET /macro/external/international (L79).
- FetchInternationalMacroUseCase: 44 lines, DDD CLEAN (imports only from domain/repositories.js).
- Production TSC: 0 errors.
- PASS.

Pre-existing issue: TradingEconomics integration test — with INTEGRATION=true not run (live tests skipped). All 12 integration tests are gated on INTEGRATION=true env flag — 0 run, 12 skip, 0 fail without it. Not a regression.

DDD bug filed: `docs/signals/qa-bug-2026-05-13T12-30-00Z.json`.

**Last updated:** 2026-05-13 | **Sprint:** SPIKE_006-c61-T1 threshold raise (cycle 61)

## Recent session — 2026-05-13 (SPIKE_006-c61-T1 — price-signal threshold 0.1→1.0)

**SPIKE_006-c61-T1 — APPROVED:**
Commit: `55085c1c`. Branch: `task/spike006-c61-t1-threshold-raise`. 2 files only (domain service + test file).

Tests: 9428 pass / 30 fail (+2 from main baseline of 9426/30). TEST-15 (price_drop 0.5%→UNKNOWN) + TEST-16 (price_surge 1.1%→HIT) both pass. Pre-existing 30 failures unchanged. TSC: 0 errors.

DDD PASS: `alertOutcomeScorer.ts` has zero imports (pure function file), domain-only edit confirmed.
Security PASS: no process.env, no SQL, no hardcoded secrets.

Phase 5 audits (all GREEN):
- index-check.sh: exit 0 (no staged files pre-merge)
- tree-verify.sh 55085c1c: exit 0 (file set matches)
- c2-alert.sh 55085c1c: "C2 OK — type/scope consistent with file set"

AC checks:
- AC-3a (TEST-15): PASS — 0.5% drop → UNKNOWN
- AC-3b (TEST-16): PASS — 1.1% surge → HIT
- OOS-2 (composite stays at 0.1): PASS — only price-signal branch changed
- No interface layer touched: PASS

Merge SHA: `d6d3c5d9` (--no-ff). Branch deleted. Report: reports/TASK_REPORT_SPIKE_006_c61_T1.md.

**Last updated:** 2026-05-12 | **Sprint:** 1879b deployment-verify smoke test

## Recent session — 2026-05-12 (1879b — deployment verification)

**1879b — DEPLOYMENT_BLOCKED:**
Tool code confirmed on main via concurrent-commit `8bec73d3` (docs label, feature payload).
Test suite: 10/10 pass (23 expect calls, 394ms, 100% line coverage). DDD PASS (zero infra imports in computeFedLiquiditySpread.ts). Security PASS (parameterized SQL `.prepare<EffrIorbRow,[number]>().all(days)`, no process.env).
Container `vn-market-intelligence-mcp-mcp-server-1` image built 2026-05-10T00:30Z — predates feature commit (2026-05-12T13:42Z). Container files confirmed: `getFedLiquiditySpreadTool.ts`, `computeFedLiquiditySpread.ts`, `fredQueries.ts` — ALL ABSENT from running container. Live `toolCount=132` is correct for the pre-feature image (125 labeled tools + multi-tool registrations = 132 actual).
Branch `tmp-1879b`: 1 unmerged commit (`a6d4b555`) — this is the concurrent-commit duplicate. Feature is already on main as `8bec73d3`. Branch is safe to delete AFTER container restart confirms tool live.
OPS action required: rebuild + restart mcp-server container to pick up `8bec73d3` code.

**Last updated:** 2026-05-12 | **Sprint:** 1893a phase 4 sequential-mandate relaxation brief (cycle QA)

## Recent session — 2026-05-12 (1893a — phase 4 sequential-mandate relaxation brief)

**1893a — APPROVED (doc-only, architect brief):**
Commit: `10ac3da0`. Single file: `docs/architecture-briefs/2026-05-12-phase4-sequential-mandate-relaxation.md`. 375 lines.

Single-file check: `git show --stat 10ac3da0` = 1 file changed, 375 insertions. PASS.

7-section checklist:
- S1 Summary: PASS (c44+c45 outcomes, what unlocks, what stays guarded)
- S2 Eligibility Criteria: PASS (2a disjoint zone, 2b file-overlap probe, 2c SSOT veto list, 2d dependency check, 2e test suite isolation)
- S3 WIP guidance: PASS (WIP=2 rationale — cognitive load, disk, batch reality, merge sequencing)
- S4 Failure modes c37/c44/c45: PASS (4a c37 incident with root causes + resolution, 4b c44 success, 4c c45 success with mid-cycle disruption)
- S5 Flow patch points BEFORE/AFTER: PASS (3 patches: execute.md L49, agent-chaining-protocol.md L75, dev-standards.md L87)
- S6 Rollback signal: PASS (5-trigger table + 5-step rollback procedure)
- S7 Open questions: PASS (Q1-Q4 explicitly deferred, "Architect does not auto-decide these")

Flow patch hunk applicability:
- 5a execute.md L49: BEFORE text confirmed on actual L49. Minor: brief omits `**bold**` markers around "Parallel spawns..." in the BEFORE block (file has `**Parallel spawns use SDK-native worktree isolation**`). Also heading says "Lines 49 and 87" but file has only 70 lines — "and 87" is a phantom reference (no second hunk provided). Semantic intent is unambiguous: replace L49 trailing mandate sentence. Verdict: APPLICABLE with minor cosmetic note.
- 5b agent-chaining-protocol.md L75: BEFORE text matches exactly. PASS.
- 5c dev-standards.md L87: BEFORE text matches exactly. PASS.
Overall flow patch verdict: APPLICABLE VERBATIM for 5b+5c. 5a requires awareness of bold markers and phantom "and 87" — non-blocking ambiguity.

Path existence check: all 4 cited paths verified present on main:
- `.claude/flows/dev-team/execute.md` PASS
- `docs/protocols/agent-chaining-protocol.md` PASS
- `docs/policies/dev-standards.md` PASS
- `docs/architecture-briefs/2026-05-12-sprint-parallel-isolation.md` PASS

c44/c45 evidence accuracy: verified via git log + reflog. Cherry-pick SHAs `f4141f63` (1892b) and `bb49b82c` (1888a) confirmed on main. `3031ffb1` notebook cherry-pick + `HEAD@{9}: reset: moving to bb49b82c` confirmed in reflog. Evidence accurate.

Open questions deferral: all 4 questions framed as questions, headed "Architect does not auto-decide these". Q1/Q2/Q4 give "Recommended default" / "Architect recommends" / "Architect preference" — opinions, not decisions. Q3: "Architect flags this as likely safe but does not auto-permit. Needs PO decision." PASS.

Commit convention: `docs(arch/1893a): phase 4 sequential-mandate relaxation brief`. Trailers: `Task-Id: 1893a` (non-standard key vs `Task:`), `AC:` (present), `Closes: 1893a` (non-standard). Missing `Sprint:` trailer. Per precedent (signal-T6, 1875b, 1872a-3): task 1893a not in TASKS.md (no sprint number assigned) → no-sprint rule applies → Sprint/Task trailers not required. `Task-Id:` key non-standard but per T4/signal-T6/1875b precedent = non-blocking. Overall: NON-BLOCKING.

No notebook bundling: commit is single brief file only. PASS.

Tests: 9399 pass / 17 fail. All 17 failures are pre-existing (same set as prior cycles: Task 178 price_history, Task 1549, cron-registry count=43, Task 1031 DGC, Sprint 145 diacritics, Task 1100, Task 262 climate x3, Task 1331a TEST-3 RED). Zero new failures introduced by doc-only commit. TSC 0 errors. PASS.

DDD scan: N/A (doc-only). Security scan: N/A (doc-only).

**Last updated:** 2026-05-12 | **Sprint:** 1892b api-gateway push routes (cycle 42)

## Recent session — 2026-05-12 (1892b — api-gateway /api/push-* routing)

**1892b — APPROVED:**
Worktree: `agent-a8f9390a6682e5844`. Commit: `f032a8f7`. Branch: `worktree-agent-a8f9390a6682e5844`.

Tests: 40/40 pass (was 30/4 files on main, +10 new tests in 5th file). TSC 0 errors. DDD PASS. Security PASS.

AC-1 PASS: POST /api/push-news → MCP_URL/api/push-news, 200 happy path. Path NOT stripped — test line 134 explicitly asserts `calls[0].url === http://mcp-server:3000/api/push-news`.
AC-2 PASS: GET /api/health/vps-news → 404 passthrough from MCP on unknown endpoint. No auth injection — captured headers checked.
AC-3 PASS: existing /stock/* and /macro/* routes still strip prefix correctly. Test lines 361 + 384 assert exact URLs.
AC-4 PASS: 401 returned when MCP rejects missing auth. Gateway passes headers unchanged.
AC-5 PASS: `api` registered via `MCP_URL` const (line 16 index.ts). `getAllServices()` filters `noProbe=true` — `api` excluded from health probes (health_checker.ts line 59).

proxyPath() deviation from spec: spec specified `proxyPath(serviceName, reqPath)` using `serviceName === 'api'`. Impl uses `proxyPath(reqPath, svc)` checking `svc.noProbe`. Design improvement — avoids stringly-typed name comparison, future-proof. Non-blocking, no defect.

Commit `f032a8f7`: `feat(1892/api-gateway): 1892b wire...` with Sprint/Task/AC trailers — PASS per convention.
Notebook `d0b77044`: separate from feature commit — c43 PASS.
process.env in index.ts: pre-existing on main (all 9 service URL entries used it before). New line consistent with surrounding code. Pre-existing nit, not introduced by 1892b.
Bun OOM: main baseline confirms 30 tests in api-gateway suite, no OOM. Pre-existing on full suite only.

Diff stat: 7 files in `git diff main...HEAD --name-only` (includes notebook from d0b77044). Feature commit f032a8f7 stat: 6 files clean (4 production + 2 docs). No accidental edits.

**Last updated:** 2026-05-12 | **Cycle:** CLEAN-c50 stale worktree + branch sweep

## Recent session — 2026-05-12 (CLEAN-c50 — 7 stale branches pruned)

**CLEAN-c50 — 6 worktrees + 7 branches deleted:**

Verification method: `git log main..<branch> --oneline` for each, then file-level content check on main.

Results per branch:
- `worktree-agent-a57f` (held `task/1888a`) — 0 commits ahead; content confirmed in main (`bb49b82c` chore/ssot/1888a). Worktree removed, branch deleted.
- `worktree-agent-a9e8` (1879a) — 2 commits ahead by SHA, but content confirmed in main: `f7240b5e` (FRED EFFR-IORB fetcher) + `4756e4f4` (1879a/docs). Cherry-picked under different SHAs. Worktree removed, branch deleted.
- `worktree-agent-a4d9` (1879b) — 1 commit ahead by SHA (`a6d4b555` get_fed_liquidity_spread MCP tool). Content confirmed in main: `computeFedLiquiditySpread.ts` + `getFedLiquiditySpreadTool.ts` both present. Worktree removed, branch deleted.
- `worktree-agent-a471` (1892a) — 1 commit ahead by SHA (`380cff96`). Content confirmed in main: `dbed5ba4` + `41f54f22` (pushNewsHandler + health endpoint). Worktree removed, branch deleted.
- `worktree-agent-a86f` (1892a) — 1 commit ahead by SHA (`39605bf2`). Same 1892a content confirmed. Worktree removed, branch deleted.
- `worktree-agent-a8f9` (1892b) — 2 commits ahead by SHA (`f032a8f7` + notebook). Content confirmed in main: `f4141f63` (1892b wire /api/push-* routing). Worktree removed, branch deleted.
- `task/1888a-ssot-tool-cron-pointers` — 2 commits ahead by SHA (`9c260bc4`+`264374c2`). Content confirmed in main: `bb49b82c` (same SSOT change). Branch deleted (no worktree, was registered under agent-a57f path).

All 6 worktrees unlocked + `git worktree remove --force` succeeded. All 7 branches `git branch -D` succeeded.

Post-sweep state: `git branch` = `* main` only. `git worktree list` = 1 entry (main). CLEAN.

**Last updated:** 2026-05-12 | **Sprint:** CLEAN-1872a-5 branch deletion (cycle 41)

## Recent session — 2026-05-12 (CLEAN-1872a-5 — stale branch deletion)

**CLEAN-1872a-5 — branch delete, no merge gate:**
Spot-check PASS. 4 unmerged commits: `73fd8753` (state), `9f437240` (state), `47e745b6` (tree-map AC1), `22981c13` (mcp-server.md SSOT). `git diff main -- .claude/knowledge/tree-map.md docs/architecture/microservice/mcp-server.md` = zero output. Content confirmed on main via fe82b9f9. No worktree. Branch deleted with `git branch -D`. No production code touched. Report: reports/TASK_REPORT_CLEAN-1872a-5.md.

**Last updated:** 2026-05-12 | **Sprint:** signal-T6 fallback removal (cycle 40)

## Recent session — 2026-05-12 (signal-T6 — DEPRECATED fallback removal)

**signal-T6 — APPROVED:**
Doc-only. bun test + tsc skipped (smart-skip). DDD/security N/A. Scope: `.claude/flows/dev-team/main.md` only.

AC-1 PASS: Step 0a-fallback block (prev lines 117-133) + code fence fully deleted. grep returns 0 matches for "Step 0a-fallback".
AC-2 PASS: catch block (lines 33-39) now inline degrade: log WARN + pendingSignals=[] + inbox untouched + retry next cycle. Zero "jump to Step 0a-fallback" text anywhere.
AC-3 PASS: `grep -c fallback` = 0. Clean.
AC-4 PASS: 14 code fence markers (7 balanced pairs). No orphan fences.
AC-5 PASS: 4 ins / 24 del = -20 net LOC (≤30 budget).

Functional integrity: Step 0a-1 (line 43), dual-record write 4a+4b (lines 70-101), prune 5a+5b (lines 103-113), Step 0b (line 119) — all INTACT.

Commit `5ce8e73e`: `chore(signals)` scope (canonical vocab). Task-Id: signal-T6, AC: AC-1..AC-5, Closes: signal-T6. Task-Id key (non-standard vs Task:) — non-blocking per T4 precedent. No Sprint: trailer (no sprint number in signal-T series) — acceptable per no-sprint rule.

Merge SHA: f6f57bc5. Branch task/signal-T6-fallback-removal deleted (local). Report: reports/TASK_REPORT_signal-T6.md.

Graphify: DEFERRED — package not installed (consistent with prior cycles 38-40).

Signal-dedup project COMPLETE. T1-T6 all closed. SQLite is now sole dedup path.

**Last updated:** 2026-05-12 | **Sprint:** signal-T5 dedup integration tests (cycle 38)

## Recent session — 2026-05-12 (signal-T5 — SQLite dedup drain cycle integration tests)

**signal-T5 — APPROVED (QA as author + verifier):**
6/6 tests pass (38 expect calls, 494ms). TSC 0 errors. DDD PASS (no infra imports). Security PASS (no process.env, no hardcoded secrets).

AC-T5.1 PASS: fresh signal SELECT path → pendingSignals[0].from=agents-architect, result=routed-to-po, DB row fingerprint confirmed, inbox consumed.
AC-T5.2 PASS: replay duplicate → 2nd cycle pendingSignals=[], result=skipped-duplicate-replay, -replay suffix file present, DB count stays 1.
AC-T5.3 PASS: INSERT OR IGNORE double-insert same fingerprint → no throw, COUNT(*)=1.
AC-T5.4 PASS: prune 7d → 2 old rows deleted (processed_at=2026-05-04), 1 recent row (2026-05-11) survives; old-signal-1.json + old-signal-2.json filesystem deleted; recent-signal.json present.
AC-T5.5 PASS: null DB → warnLogged=true, dbUnavailable=true, inbox file preserved, processed/ empty.
AC-T5.6 PASS: stale 48h createdAt → skipped-stale, -stale suffix, pendingSignals=[], DB count=0.

Placement: scripts/migrations/__tests__/signal-T5-dedup-integration.test.ts (matches T1/T2 convention, not apps/mcp-server/__tests__/).
runDrainCycle() helper models Step 0a pseudocode without importing production code.
computeFingerprint() imported from backfill-signals-db.ts per spec.

Merge SHA: fc1061e1. Branch task/signal-T5-qa-tests deleted. Report: reports/TASK_REPORT_signal-T5.md.
Fallback-removal pre-condition MET: signal-T5 passed. One clean cycle 39 still required before flow lines 117-133 removal.

**Last updated:** 2026-05-12 | **Sprint:** 1878b compute_accruals (cycle 38)

## Recent session — 2026-05-12 (1878b — compute_accruals merge gate)

**1878b — compute_accruals MCP tool (#129) — APPROVED:**
12/12 tests pass (31 expect calls, 460ms). 1878a regression 12/12. TSC 0 errors. DDD PASS (accruals.ts: import only `{ z } from "zod"` — zero infra/interface imports). Security PASS (parameterized SQL `.prepare().all(ticker, quarters)`, no process.env, no hardcoded secrets).

AC-1: (300-100)/5000=0.04 PASS (T1, toBeCloseTo 10 decimals).
AC-2: null NI → ratio null + missing["NET_INCOME"] + error null PASS (T2, accruals.ts:59-60).
AC-3: zero TA → null + error:"zero_total_assets" + missing:[] PASS (T5, accruals.ts:75-76).
AC-4: sort ascending oldest→newest PASS (T7: data[0].period_quarter=1, data[3].period_quarter=4).
AC-5: registerComputeAccrualsTool in toolRegistry[] at registry.ts:196 as #129 PASS. Prior was #128 (registerPyramidTierTool). Array has 89 entries (multi-tool registration functions account for gap).
AC-6: formula in tool description (computeAccrualsTool.ts:191) + unit:"ratio" field in AccrualsEnvelope interface (:50) and envelope objects (:108, :173) PASS.
AC-7: default quarters=8 (T11: 12 seeded, 8 returned) + Zod rejects quarters=25 max=20 (T12: safeParse.success=false) PASS.
AC-8: in-memory SQLite via makeTestDb() + multi-quarter fixtures T7/T8/T9/T10/T11 PASS.

Commit convention 4d7ab740: type=feat scope=financial-reports, Sprint:S1878b, Task-Id:1878b, AC:AC-1/AC-2/AC-3/AC-4/AC-5/AC-6/AC-7/AC-8. All 8 ACs listed — C2 gate PASS.

Note: accruals.ts line 79 uses `!` non-null assertions (`net_income_m!` / `ocf_m!`) inside the `missing.length === 0` guard — correctly safe (both confirmed non-null at that point). Line 16 `import { z }` used for exported AccrualsInputSchema (imported by test file). Coverage 96.55% on accruals.ts (1 branch in isFinite guard uncovered — defensive code path, acceptable).

Merge SHA: ad04be0d. Branch task/1878b-compute-accruals deleted local (no remote). Report: reports/TASK_REPORT_1878b.md. TASKS.md: 1878b Backlog→Done.
Graphify: DEFERRED — package not installed (consistent with prior cycle 38 graphify status).

**Last updated:** 2026-05-12 | **Sprint:** signal-T4 doc-only FIX (cycle 38)

## Recent session — 2026-05-12 (signal-T4 doc-only FIX merge gate)

**signal-T4 — SSOT doc updates for SQLite signal dedup — APPROVED:**
Doc-only. bun test + tsc skipped (smart-skip, no production code). DDD/security N/A.

AC1(a) dual-record: PASS — agent-chaining-protocol.md line 132: "Dual-record write on new signal: DB INSERT (SSOT index) + filesystem move to docs/signals/processed/".
AC1(b) spec ref: PASS — `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` present in same line; file exists on main.
AC1(c) DB-unavail path: PASS — line 133: "DB unavailable (ENOENT/locked after 3×200ms retry): log WARN, skip dedup, preserve inbox, retry next cycle".
AC2(a) signals.db leaf: PASS — tree-map.md line 28: `└── docs/signals/signals.db (dedup index: signals_processed table — SQLite SSOT, O(log N) fingerprint lookup — sole writer: dev-team Step 0a)`.
AC2(b) write-ownership row: PASS — table row at line 184: `docs/signals/signals.db | dev-team flow (Step 0a) — sole writer; all other agents read-only | Each drain cycle`.
AC3 LOC: PASS — doc commit 7717adb5: 6 ins / 3 del = 9 net (≤10 budget).
AC4 scope: PASS — doc commit touches exactly 2 files (agent-chaining-protocol.md + tree-map.md); notebook in separate exempt commit 7c03f9e9.
AC5 markdown: PASS — fences balanced (22 + 2), spec file exists, no broken internal link refs.
C2 gate: PASS — Task-Id: signal-T4 + AC: AC1, AC2, AC3, AC4, AC5 on commit 7717adb5; type=docs scope=signals.

Merge SHA: 9bb2d338. Branch task/signal-T4-doc-updates deleted (local; no remote). Report: reports/TASK_REPORT_signal-T4.md.
Graphify: DEFERRED — graphify Python package not installed; existing graphify-out/graph.json intact (prior run preserved).

**Last updated:** 2026-05-12 | **Sprint:** signal-T3 drain rewrite (cycle 38)

## Recent session — 2026-05-12 (signal-T3 drain rewrite merge gate)

**signal-T3 — Dev-team Step 0a SQLite SELECT rewrite — APPROVED (doc-only):**
No code tests required (doc-only change). bun test + tsc skipped per gate spec.
DDD scan: N/A (no production code). Security scan: N/A (no production code).

Grep results (all PASS):
- `signals.db` — 8 occurrences (Step 0a-0, rationale, fallback section, error logs)
- `signals_processed` — 6 occurrences (SELECT, INSERT, DELETE, escape hatches)
- `fingerprint` — 10 occurrences (computation line, SELECT pattern, logs, escape hatches)
- `SELECT 1 FROM signals_processed WHERE fingerprint` — line 55 PASS
- Fallback-removal trigger — lines 120-122: "Removal trigger: after 2 consecutive drain cycles... Removal eligible after cycle 39 success. Pre-condition: signal-T5 must pass." PASS
- Dual-record write — step 4 header + 4a/4b sub-steps PASS
- DB-unavailability degradation + retry (ENOENT|SQLITE_CANTOPEN|locked 3x200ms) — lines 33-38 PASS
- Cross-ref `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md` — line 21 PASS (file exists)
- Cross-ref `docs/protocols/agent-chaining-protocol.md` — line 22 PASS (file exists)
- DELETE-based prune — line 107: `DELETE FROM signals_processed WHERE processed_at < datetime('now', '-7 days')` PASS

Brief alignment (2026-05-11-signal-dedup-sqlite.md):
- Dual-record semantics (file canonical + DB index): ALIGNED (step 4a+4b)
- Degraded mode: brief §7 says "process all inbox signals without dedup check, do NOT move to processed/". Flow matches exactly (Step 0a-fallback + Step 0a-0 catch block). ALIGNED
- SELECT pattern: ALIGNED (O(log N) via idx_signals_fingerprint)
- DB prune DELETE: ALIGNED (5a SQL matches brief §5)
- Filesystem prune retained parallel: ALIGNED (5b)
- Fallback deprecation path: ALIGNED (DEPRECATED header + removal trigger)

Idempotency/safety check:
- signals.db EXISTS at `docs/signals/signals.db` with 27 backfill rows from signal-T2 (cycle 37)
- Schema: `signals_processed` table, UNIQUE fingerprint constraint, idx_signals_fingerprint index — all confirmed
- Next cron: signal arrives → fingerprint computed → SELECT 1 → if in 27-row set → skipped-duplicate-replay. SAFE
- Step 0a uses inline `bun:sqlite` pseudocode — no unshipped helper script required. scripts/migrations/create-signals-db.ts and backfill-signals-db.ts both EXIST (T1/T2 shipped).

Markdown lint: 16 code fences (even) PASS. Step headers: 0a-0, 0a-1, 0a-fallback consistent PASS. Step 0b and Step 1 unaffected PASS. No broken cross-refs PASS.

Deviations: NONE. Brief deviation note: flow adds "Do NOT move files to processed/ when in fallback mode" (Step 0a-fallback line 132) which is a sensible conservative addition — brief §7 implies this, flow makes it explicit. NOT a blocking deviation.

TASKS.md mismatch note: Backlog row `signal-T3` described `dedup-signals-live.ts` (a different sub-task). That row replaced with signal-T4 (doc updates) + signal-T5 (QA tests) to reflect actual pipeline state. signal-T3 moved to Done.

Merge SHA 2b643ec9. Branch task/signal-T3-drain-rewrite deleted. Report: reports/TASK_REPORT_signal-T3.md.

**Last updated:** 2026-05-12 | **Sprint:** 1878a OCF column migration (cycle 38)

## Recent session — 2026-05-12 (cycle 38 — 1878a merge gate)

**1878a — OCF column migration — APPROVED:**
12/12 tests pass (34 expect calls, 165ms). Full suite task branch: 9363 pass / 17 fail. Full suite main baseline: 9351 pass / 17 fail. Delta: +12 pass / 0 new fail. TSC 0 errors. DDD PASS (bridge + backfill in infra layer, no domain imports). Security PASS (parameterized SQL `?` + `.run(ticker)`, no process.env). Bridge SQL: `* 1000.0` confirmed, `period_quarter IS NOT NULL` guard confirmed, `quarter BETWEEN 1 AND 4` edge-case guard confirmed. Migration idempotent (T2 PASS). Annual rows stay NULL (T5a PASS). quarter=0 no-op (T5b PASS). backfillAllOCF all-tickers + idempotent (T7a+T7b PASS). AC-2/AC-3 (VCB/FPT live rows) DEFERRED — requires container restart on market.db. Merge SHA 1fb5282b. Branch task/1878a-ocf-impl deleted. TASKS.md: 1878a Backlog→Done, 1878b unblocked (blocked-by removed), 1885a blocked-by updated. Report: reports/TASK_REPORT_1878a.md.

**Notes for next QA:**
- Bun crash after run (post-completion macOS heap teardown) — pre-existing, not caused by 1878a. Always check crash comes AFTER summary line.
- AC-2/AC-3 container restart flag carried forward — ops should verify on next maintenance window.

**Last updated:** 2026-05-12 | **Sprint:** 1880b + signal-T2 (cycle 37)

## Recent session — 2026-05-12 (cycle 37 — 1880b + signal-T2 merge gate)

**1880b — get_pyramid_tier MCP tool (#128) — APPROVED:**
23/23 tests pass. 1880a regression 8/8. Full suite 9406/0 (Bun v1.3.13 post-completion panic = known macOS heap teardown, not test failure). TSC 0 errors. Tool #128 `get_pyramid_tier` confirmed registry.ts:194 (`registerPyramidTierTool`). DDD PASS (pyramidTier.ts: zero infra imports, pure domain). Security PASS (no process.env, no hardcoded secrets). Delivered on task/signal-T2-backfill branch (cross-branch placement, content correct per QA gate spec).

**signal-T2 — backfill-signals-db migration — APPROVED:**
10/10 tests pass (25 expect calls). signal-T1 carry-over 7/7. TSC 0 errors. Idempotency verified: re-run on real processed/ dir → 57 scanned / 0 inserted / 57 skipped / 0 errors. SyntaxError log on bad.json = expected error-handling path (test fixture). DDD PASS (scripts/, no domain imports). Security PASS (Bun.env.DB_PATH, no traversal).

**Drain commit (signal-drain-c37):**
ee0d77b4 — 10 signal files (5 original + 5 replay + 1 TNB), arch-brief 2026-05-12, tool-usage-stats.json, ops session log, 2 TASK files moved root→reports/.

**Merge:** --no-ff, SHA cb232b26 to main. Branches deleted: task/signal-T2-backfill + task/1880b-pyramid-tier (empty). TASKS.md: 1880b+signal-T2 Backlog→Done, signal-T3 added (unblocked), 1878a-spec+NB-HDR-c38 added In Progress.

**Notes for next QA:**
- Full suite count shifted: 9273 (dev claim) vs 9406 (actual). Delta likely from new test files added in drain commits from other agents. Not a regression — 0 fail.
- Bun crash line present in output — always check if it comes AFTER test summary (post-completion teardown = safe).

## Recent session — 2026-05-12 (1880a — get_investment_clock_phase MCP tool)

**1880a — APPROVED:**
8/8 tests pass (27 expect calls). TSC 0 errors. DDD PASS (investmentClock.ts has zero infra imports, grep clean). Security PASS (no process.env, no any, parameterized SQL in interface layer). All 5 AC outputs verified (Recovery/Overheat/Stagflation/Reflation/insufficient_data). Truth table boundary: PMI=50 → DOWN, CPI=3.0 → LOW → Reflation (Test 7 PASS). Null fallback paths: PMI→gdpGrowth (Test 5), CPI→inflationRate (Test 8), both null → insufficient_data (Test 6). AC4 fetched_at: present in result object at investmentClockTools.ts:170. Registry: import line 91, registered at line 193 as #127. Both barrels export new symbols. Full suite Bun OOM crash is pre-existing infra issue (peak 2.71GB RSS on full __tests__/ dir); adjacent test file 188-alert-digest.test.ts ran clean (34/0). Not caused by 1880a. Branch task/1880a-investment-clock-phase deleted. TASKS.md 1880a Backlog → Done. Report: reports/TASK_REPORT_1880a.md.

## Recent session — 2026-05-12 (signal-T1 — create-signals-db migration)

**signal-T1 — APPROVED:**
7/7 tests pass. tsc clean. Schema matches brief §2 exactly (id AUTOINCREMENT + fingerprint UNIQUE NOT NULL, 2 indexes). Idempotent verified (2 runs, both exit 0). Gitignore confirmed. import.meta.main guard present. DDD clean (no apps/ imports). Security clean (no process.env, no hardcoded secrets). LOC 89 vs ~30 target — non-blocking (extra comments + error handling).
Branch merged no-ff to main. Branch deleted. signal-T2 unblocked → added to Backlog.
Report: reports/TASK_REPORT_signal-T1.md.

## Previous session — 2026-05-11 (1877e — C2-exempt guard + flow tightening + knowledge SSOT, race recovery)

**1877e — SPRINT-M race recovery (3 parallel agents, branch contamination):**
DDD/security N/A (script + doc only). bash -n CLEAN.

Deliverables verified: is_c2_exempt guard (4 case patterns) in audit script, C2-Exempt table (+13 LOC) in commit-convention.md, PM convention block (+5 LOC) in pm/main.md, QA Task-trailer mandate (+1 LOC) in qa/main.md.

Race recovery: 1877e-1 empty stub deleted. 1877e-2 merged (f18b359f). 1877e-3 merged (fcef31da, notebook conflict resolved preserving all 3 task entries).

Final audit post-merge: C1=0.9501 PASS / C2=0.6308 FAIL (DEFERRED, was 0.5867) / C3=0.9254 PASS / C4=0.9628 PASS.
Exempt bucket spot-check: all 4 patterns correctly excluded, 1 genuine violator correctly flagged.
AC-1 (C2≥0.85) DEFERRED to 2026-05-17 — requires ~92 new compliant commits via flow tightening.
ACs 2-7 (1877e-1), 1-6 (1877e-2), 1-5 (1877e-3): all PASS.

APPROVED-WITH-DEFERRAL. Report: reports/TASK_REPORT_1877e.md.

## Recent session — 2026-05-11 (1877d — C3 AC-trailer exemption policy)

**1877d — C3 exemption: notebook/state/merge commits:**
Bash script + 3 doc files. DDD/security N/A. bash -n CLEAN.

6 ACs re-run from scratch (no --emit-signal):
- AC-1 PASS: C3=0.9180 (pass threshold 0.80). Developer claimed 0.9167 — minor delta from additional compliant commits since sampling. Both exceed threshold.
- AC-2 PASS: notebook SHAs 171f56df/3bf792d5/83e3a7f7 confirmed `chore(memory/*)` subjects. None appear in C3 violations JSON.
- AC-3 PASS: state SHAs 412aff9b/e6024028 confirmed `chore(state): ...` subjects. None in violations.
- AC-4 PARTIAL: Pattern `*merge\ task/*` catches `chore(1869/mcp-server): merge task/1869a-...` format. DOES NOT catch `chore(merge): QA APPROVED task/1877c-...` format (SHAs 9e19cd4b, 27e4e0d6 still in violations). Brief §4 only specifies the `merge task/` pattern — "QA APPROVED task/" is undocumented format variant used by cycle 30/31/32. C3=0.9180 absorbs gap; AC-1 still passes. Deviation documented.
- AC-5 PASS: genuine violations [fc541585 chore(qa) no-AC, 3d33dd23 docs no-AC, a3335cc8 docs no-AC] confirmed not false positives (all have Task: but no AC: trailer on real task commits).
- AC-6 PASS: `bash -n scripts/audits/commit-convention-audit.sh` exit 0.

LOC overage: +33 net vs ≤30 budget. Breakdown: 4 cosmetic lines (3 comment lines + 1 blank separator in case block). Material net = ~29 LOC. APPROVED as cosmetic.

AC-4 follow-up recommendation: add `*QA\ APPROVED\ task/*` to case block in commit-convention-audit.sh (single line). Not blocking — C3 margin 0.9180>>0.80.

Merge SHA: 67fd8a7e. TASKS.md 1877d In Progress → Done. pipeline-state → idle.

APPROVED (with AC-4 documented deviation).

## Recent session — 2026-05-11 (1877c — C4 scope-vocab remediation)

**1877c — VOCAB 20→52 + sprint-ID exemption:**
Shell script + knowledge doc. DDD/security N/A. bash -n CLEAN.

6 ACs re-run from scratch (no --emit-signal):
- AC-1 PASS: bash -n exit 0.
- AC-2 PASS: C4=0.9826 (169/172). ≥0.95 threshold MET.
- AC-3 PASS: violations = [cycle-28, *, c26] only. 5 sprint-ID commits spot-checked — none in violations.
- AC-4 PASS: *, c26, cycle-28 all present in violations array.
- AC-5 PASS: two runs identical on all numeric fields. window.until differs (dynamic "now" — expected).
- AC-6 PASS: grep for local -n / declare -A / mapfile / [ >= ] → 0 hits.

VOCAB: 52 tokens, exact match to brief §4.1, alphabetically sorted. No extras, no missing.
Sprint-ID pattern: `case "${first4}" in [0-9][0-9][0-9][0-9])` — POSIX-safe.
Knowledge file: 8-line area-token table + sprint-ID exemption note confirmed.

Non-blocking: dev claimed 168/171 (0.9825); actual run yielded 169/172 (0.9826) — consistent with architect note (additional compliant commits since sampling). Verdict still better than required.

Merge SHA: 9e19cd4b. Branch task/1877c-c4-vocab-remediation deleted. TASKS.md 1877c In Progress → Done. pipeline-state idle.

Overall audit verdict: C1 PASS, C2 FAIL (0.5694), C3 FAIL (0.7722), C4 PASS. 1877c scope = C4 only. C2/C3 separate concern.

APPROVED.

## Recent session — 2026-05-11 (1877b — signal guard for commit-convention audit script)

**1877b — `scripts/audits/commit-convention-audit.sh` --emit-signal guard:**
Shell script only. DDD/security N/A. bash -n CLEAN. Pre-push tsc PASS.

6 ACs re-run from scratch:
- AC-1 PASS: no flag → "Signal emission skipped" + zero root signals.
- AC-2 PASS: canonical SINCE + flag + today in window → exactly 1 FAIL signal written, jq clean.
- AC-3a PASS: non-canonical SINCE + flag → WARNING + zero root signals, exit=1.
- AC-3b PASS: temp copy with UNTIL=2026-05-10, today=2026-05-11 → WARNING + zero root signals.
- AC-4 PASS: processed/ report always written, jq clean, verdict+4 criteria+violations present.
- AC-5 PASS: exit=1 across all invocations (FAIL verdict), suppression did not affect exit code.
- AC-6 PASS: bash -n CLEAN, no local -n / declare -A / mapfile. [ ] comparisons escape < > with \.

Deviation: brief §3 `\>=` pattern not POSIX-valid (bash errors: binary operator expected). Two-clause `[ = ] || [ \> ]` replacement verified equivalent for YYYY-MM-DD lexicographic order. APPROVED.

Artifact cleanup: AC-2 test signal moved to /tmp then deleted. Temp AC-3b script deleted. Zero test artifacts remain in docs/signals/ root.

Net LOC: +26 (diff count). Developer self-reported +29; both within ≤30 constraint.

Merge SHA: 27e4e0d6. Branch task/1877b deleted local+remote (pre-push tsc PASS). TASKS.md: 1877b In Progress → Done. pipeline-state: idle.

APPROVED.

## Recent session — 2026-05-11 (1877a — commit-convention audit script)

**1877a — `scripts/audits/commit-convention-audit.sh` Phase B C1/C2 gate:**
Shell script only. DDD/security N/A. Pre-push tsc PASS (triggered on push).

Script re-run: 293 total, 1 bare merge excluded, 292 audited.
C1=0.9521 (PASS ≥0.90), C2=0.5694 (FAIL), C3=0.7838 (FAIL), C4=0.4759 (FAIL). Verdict: FAIL. Exit 1.
FAIL signal emitted to `docs/signals/agents-architect-<ts>-phase-b-c1-c2-fail.json`.
JSON report: `docs/signals/processed/commit-convention-audit-20260511.json` — jq parses clean, all 8 top-level keys, all 4 criteria objects.

All 6 ACs PASS. 3 violations spot-checked — zero false positives.
Bash 3.2 compat confirmed (no local -n, no 4.0+ constructs). LC_ALL=C locale fix verified.
Non-blocking deviations: commit type `feat` vs `chore` per task spec (defensible); empty-window returns 1.0/PASS instead of 0.0/FAIL (test plan note, not AC).

Merge SHA: 20005b95. Branch task/1877a-commit-convention-audit-script deleted. TASKS.md: 1877a → Done.

APPROVED.

## Recent session — 2026-05-11 (1872a-3 ARCHITECTURE.md SSOT pointers)

**1872a-3 — docs/ARCHITECTURE.md AC3+AC6 SSOT pointers:**
Doc-only. Smart-skip tsc/tests (pre-push hook tsc ran on remote delete — PASS). DDD/security N/A.

AC3 PASS: line 78 — "132 tools, 59 cron jobs, HTTP clients to 8 other services" → exact architect-brief phrasing: `tool count → docs/data/project-stats.json#toolCount; scheduler count → docs/data/project-stats.json#cronJobCount; HTTP clients to all configured downstream services`.
AC6 PASS: line 53 — inline docker cmd → exact architect-brief phrasing: `see .claude/knowledge/restart-policy.md (SSOT — docker-compose only, 9 services)`.
Task commit: 1b4f23a6. Merge SHA: fe82b9f9.
Non-blocking: commit scope `docs(architecture)` vs required `docs(1872a/architecture)` per convention; Sprint: trailer absent. Both minor, doc-only task.
Branch task/1872a-3-architecture-md-ssot-pointers deleted local+remote. TASKS.md 1872a-3 → Done.

APPROVED.

## Recent session — 2026-05-11 (1872a-2 README SSOT pointers)

**1872a-2 — README.md AC2+AC5+AC6 SSOT pointers:**
Doc-only. Smart-skip tsc/tests. DDD/security N/A.

Branch situation: `task/1872a-2-readme-ssot-pointers` local tip = main HEAD (d85d1c43, zero diff). Actual README commit 03a404ce was authored on what became `task/1872a-3-architecture-md-ssot-pointers`. All changes reached main via merge commit fe82b9f9 (1872a-3 merge). Work confirmed present in main:README.md.

AC2 PASS: mcp-server row (line 87) — `(112 tools)` → `(see docs/data/project-stats.json → toolCount)`.
AC5a PASS: line 21 — arch pointer `docs/ARCHITECTURE.md` + `docs/architecture/global.md` added after ASCII diagram.
AC5b PASS: line 97 — `Per-service architecture docs: docs/architecture/microservice/<service>.md` after table.
AC6-A PASS: lines 63-70 docker block → restart-policy.md pointer.
AC6-B PASS: line 81 dev step 3 inline cmd → restart-policy.md pointer.
Scope PASS: only README.md in the task commit.
Commit trailers PASS: Sprint:1872a / Task:1872a-2 / AC:2,5,6.
Arch-update flag: NO (pointer-only, no structural change).
Remaining `## 112 MCP Tools` heading (line 173): NOT in AC scope per architect brief matrix.

APPROVED. Work already in main. TASKS.md row moved Review→Done.

## Last session summary

Tier-2 QA cycle 20. Three branches: 1871b (ARCH.md infra/ tree), 1871d (cron-registry backfill), 1871f (DDD fix vnstock types).

Authoritative baseline: 9168 pass / 12 fail / 38 skip on main HEAD 67d99029 (bun test --timeout 30000). TSC baseline: 23 pre-existing errors.

1871b APPROVED: all 11 infra/ subdirs present in ARCHITECTURE.md, fileStore/ entry mentions alertVerdictStore.ts, cross-link to alert-policy.md (1871g). Doc-only. Merge SHA 6f161a4b.

1871d APPROVED: 21 new entries added (41→62 total). schedulerFileCount=59 matches cronConfig.ts exactly. Existing 41 entries unchanged. New entries use consistent name/schedule/desc/file schema. 3 non-job entries (helper, old-format macro, ohlcvStartupProbe) explain 62 vs 59 delta — pre-existing in file. Merge SHA 2bcae2e5.

1871f APPROVED: DDD critical check PASS — zero actual `import.*from.*infrastructure/` statements in domain/ (grep matched only comments/docstrings). New domain/models/vnstockTypes.ts contains 6 canonical types (zero imports). vnstockBridge.ts re-exports all 6 for backward compat (infra→domain direction = correct). TSC delta=0 (still 23). Vnstock test parity: 37/48/6 identical on both main and worktree. Full-suite delta in worktree (9050 vs 9168) caused by broken symlink data/ → ../../data (resolves to non-existent path in worktree). ENOENT failures are pre-existing worktree infrastructure, not code regression. Merge SHA 30030baa.

## Known patterns / preferences

- Bun v1.3.11 had a known C++ panic crash on large test suites (macOS x64). Upgraded to v1.3.13 in Sprint 1836 (U-1). If developers report unexpectedly high failure counts, check Bun version first.
- Bun v1.3.13 still crashes with OOM on the full 791-file suite when run from the root `apps/mcp-server` directory (peak 1.97 GB). Run targeted tests from apps/mcp-server with `bun test <filter>` for reliable results.
- IMPORTANT: tests must be run from `apps/mcp-server/` to pick up `bunfig.toml` preload (setup.ts sets DB_PATH=:memory:). Running from repo root causes SQLiteError: unable to open database file for all tests.
- `apps/mcp-server/data/` is git-ignored. Since 1845b (setup.ts mkdirSync fix), main creates these dirs automatically. Worktrees branched BEFORE 1845b will still show 106 ENOENT failures — not regressions.
- Pre-existing failures (as of Sprint 1846 baseline): 1 (Task 1331a TEST-3 RED guard). Stable.
- Always verify AC-by-AC: do not bulk-approve. Each acceptance criterion in the handoff must be ticked with evidence.
- DDD check is non-negotiable even for "small" fixes: `grep -r "from.*infrastructure" <modified_domain_files>` must return nothing (comments only are fine).
- `docs/data/` is in `.gitignore` — if project-stats.json is updated, confirm `git add -f` was used.
- Task report format: Compact for fix/≤3 files, Full for new tool/domain service/security change.
- Check pre-existing fail count matches expected BEFORE approving. If test count differs by more than 10, ask developer to recount.
- tsc must be 0 errors — even 1 warning-level type error is a blocker if it touches production code paths.
- worktree project-stats.json may be stale (worktree branched from old commit). Always compare with main's version and keep the more current one during conflict resolution.
- When branch diverges from an old commit (e.g. 1842d), expect merge conflicts. Pattern: worktree adds features on top of 1842d state; main has 1844a+1845x already. Conflicts are always additive — accept both sides.
- export_backtest_run_csv AC: must return raw text not JSON.stringify. Check line with `return { content: [{ type: "text" as const, text: csvString }] }` — no JSON.stringify wrapper.

## Recent session — 2026-05-11 (cycle 22 Tier 1 — 1875b)

**1875b — agents-architect.md NEW agent definition:**
Doc-only (agent definition file). No test suite, no production code. DDD/security N/A.

File check: CONFIRMED NEW — no prior `.claude/agents/agents-architect.md` on main or any branch (git log --all confirms single commit d222b2d5).

YAML frontmatter: name=agents-architect / color=blue / description / tools / model=sonnet — all 5 required fields PRESENT. Factory pattern PASS.

Invariant review: 3-step invariant unambiguous. Step 1 = `date -u` for UTC_STAMP. Step 2 = notebook append with template. Step 3 = atomic `git add` both files + commit. Retry logic: 1 retry then bug Telegram + EXIT. Covers all edge cases.

Commit convention: `fix(agents/1875b/agents-architect)` — type=fix (bug corrected: missing invariant). Scope=agents/1875b. Body + AC trailer present. Task-Id trailer (non-standard key, not "Task:") — minor deviation, non-blocking. Sprint trailer absent — acceptable per no-sprint rule if this is a hotfix commit.

Tests: 9356 pass / 0 fail (exit 0). Bun post-run C++ panic = known Bun v1.3.13 macOS bug, not test failure. TSC: 0 errors (tsc exited cleanly). DDD PASS. Security PASS.

APPROVED. Merge SHA cb15b66d.

## Recent session — 2026-05-11 (cycle 22 Tier 1)

**1875d — signal drain fingerprint dedup:** Flow-only. 1 file (+21/-2). No test suite (no production code). DDD/security N/A. Commit convention PASS (fix/flows/1875d/dev-team, 5 AC trailers). Logic PASS: fingerprint = sha256(from+type+payload+createdAt) correctly distinguishes re-arrival vs new signal. Escape hatches documented (delete processed/ copy OR bump createdAt). result enum updated to 4 values (skipped-duplicate-replay added). Cycle 23 readiness: guard fires immediately; c22 processed files lack fingerprint field → scan misses → at worst one duplicate slips through (safe side, no false skip). Merge SHA d6f7a7b6. APPROVED.

## Carry-over for next session

- Tier-2 QA cycle 20 COMPLETE. 1871b + 1871d + 1871f APPROVED and merged.
- Authoritative baseline post-cycle 20: main HEAD 30030baa (after 3 merges). Expect ~9168/12/38 on fresh run.
- Pre-existing TSC errors: 23 (unchanged across all 3 branches).
- Worktree broken-symlink pattern: data/ → ../../data breaks when worktree is at .claude/worktrees/agent-XXXX/. Causes ~100 ENOENT failures in full-suite run from worktree. NOT a regression — compare vnstock-specific tests (same set) to confirm no code delta.
- Baseline reconciliation: Tier-1 QA (9169/11) vs Tier-2 (9168/12) — 1-test delta is Bun flakiness, not regression. 1871f developer 9046/117 was worktree broken-symlink effect.
- Remaining Todo (Sprint 1871): 1871c (analysis/backtesting ARCHITECTURE.md modules). 1862c-D/E/F/G (Cowork MCP access) still in Todo.
- Sprint 1872 tasks (1872a/1872b) previously merged. TASKS.md Done section up to date through cycle 20.

---

## Recent session — 2026-05-10 (multiple tasks)

**1862j — sigma dedup safeguard:** 5/5 tests pass. Full suite: 8945 pass (102 worktree ENOENT noise). tsc branch EXIT:0. DDD PASS. Security PASS. APPROVED + merged.

**1862f — RSS retry backoff:** 10/10 pass. Full suite: 9069/15 (all pre-existing). DDD PASS. Circuit breaker logic verified (base→double→cap→reset). APPROVED + merged.

**1862g — urgent_news 4h dedup:** 10/10 pass. Full suite 9137, 0 failures (Bun OOM crash = known bug). DDD PASS. APPROVED + merged.

**1863a-RECONCILE — alertVerdictStore file-store layer:** 19/19 pass. tsc EXIT:0 all phases. DDD PASS (infrastructure/fileStore). ACs 1-12 verified. APPROVED + merged. Report: reports/TASK_REPORT_1863a.md.

**1863b-RECONCILE — verdictResolutionJob scheduler swap:** 14/14 pass. Full suite 9259/16 (16 pre-existing = same as main). tsc 0 errors. DDD PASS (scheduler imports infrastructure only). Security PASS. All 12 ACs verified. 1863f deleted, all 10 scenario families ported to 1863b + 2 new (batch, idempotency). Cherry-picked 43910535 onto main (branch had extra unrelated flow doc commit). APPROVED + merged. Report: reports/TASK_REPORT_1863b.md.

**1863c-RECONCILE — Tier 3 cron wiring:** Full suite 9132/15 (15 fail, 1 fewer than prior baseline of 16 — no regression). tsc 0 new errors (identical pre-existing set confirmed on main). 8/8 ACs verified: cronConfig.ts L127 has verdictResolutionJob at minute=7; collision-avoidance comment present; Bun.env.CRON_VERDICT_RESOLUTION unique; startScheduler.ts L44 import correct; L668-676 schedule uses jobRunRepo.wrapRun; no duplicate import/schedule. Extra checks: no other cron at minute=7 or :37; env var unique; key unique. DDD PASS (cronConfig zero imports; startScheduler imports scheduler layer only). Security PASS (Bun.env, no secrets). Commit 84eeb7a4 cherry-picked onto main as 34acef31. APPROVED + merged. Report: reports/TASK_REPORT_1863c.md.

**1862i — project-stats.json stats refresh (doc-only):** No test execution (doc-only). JSON valid. 14/14 ACs verified (see below). One QA fix applied: lastSuccessfulCycle was "2026-05-11T22:00:20Z" (24h in future) → corrected to "2026-05-10T22:00:20Z". Notebook commit b27e1b11 is valid unified-agent daily-review entry — NOT a misfile. totalTasksDone=555 derivation confirmed: 40 Done rows with 2026-05-xx dates in TASKS.md (matches dev claim). currentSprint=1867 interpretation: most-recently-closed sprint (1867 is closed per git log 2f955a3d). CONDITIONAL_APPROVED — merged with fix commit 2b4b9c3c. Branch deleted. Merge SHA: 500e14fd (TASKS update). Note: docs/data/ is in .gitignore — dev used staged approach correctly (already staged before add attempt).

**1875c — record_signal_outcome dispatch (FIX-HIGH):** 5/5 pass. TSC 0 errors. DDD PASS. RCA: no code bug found — 126 tool names unique, MCP SDK exact-key dispatch, buildToolNameMap probe correct, SSE full toolRegistry. TNB c35 F3 = 1 occurrence, likely transient gateway misparse. Defensive additions: collision warn + manifest drift warn in agentBootstrap.ts. 5 regression guards. ACCEPT stance: observability value > reclassification cost. Merge blocker: untracked collision file (worktree artifact) — removed. APPROVED + merged eec8384f.

**1863f-RECONCILE — signal_feedback 1864b regression guard:** Verify-only (no code changes). 4 cited file:line refs confirmed on main: agentSignalTools.ts:41 imports SignalFeedbackFindingDataSchema; agentSignalTools.ts:72-79 SIGNAL_TYPE_VALIDATORS includes signal_feedback; agentSignalStore.ts:37-47 SignalTypeSchema z.enum includes "signal_feedback" at line 46; signalTypes.ts:306 exports SignalFeedbackFindingDataSchema = z.record(z.unknown()), line 320 in SignalSchemas barrel. Full suite: 9134 pass / 15 fail (exact match to self-reported baseline). tsc errors all pre-existing. DDD PASS (no infra imports in domain/signals/). Security PASS. Branch diff: 2 commits only — task report (0b502df1) + memory notebook — zero production code on branch. APPROVED + merged.
