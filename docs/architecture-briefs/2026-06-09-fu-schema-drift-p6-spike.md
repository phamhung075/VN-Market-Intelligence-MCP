# FU-SCHEMA-DRIFT-P6 — Schema Drift Spike Brief

**Date:** 2026-06-09
**Author:** architect
**Status:** COMPLETE — handoff to dev-mcp-server via PM
**Sprint:** CI-RED-RECONCILE
**Task:** FU-SCHEMA-DRIFT-P6 (SPIKE, 120m timebox)
**Depends:** FIX-SCHEMA-DRIFT-P5-SELFHEAL (REWORK after empirical failure)
**Zone:** `apps/mcp-server/src/infrastructure/db/`
**Baseline:** native fail+error = 629 (commit d1aa19c5, schema.ts byte-identical to e442cf11)

---

## 0. P5 Regression Summary (What Was Proven Wrong)

P5 added 9 standalone init-slice calls inside `getDb()`'s `_db=null` recreate branch.
CI gate result: **native fail+error ROSE 629 → 635 (+6 WORSE)**.

Impact breakdown:
- HEALED 4 table classes: sbv_rates_history 19→0, commodity_prices_history 19→0,
  imf_indicators 3→0, vps_service_health 1→0
- INTRODUCED new class: `no such column: created_at` × 3

Net: −23 healed, +29 introduced (from the +6 overall). This brief explains the
`created_at ×3` regression root cause and proposes a corrected implementation plan.

---

## 1. Drift Audit — All 9 Standalone Slice DDLs

### 1a. Method

Each slice file read in full. For every table, extracted column list from CREATE TABLE
IF NOT EXISTS DDL. Compared to: (a) what consuming production code queries, and
(b) what inline test DDLs define for the same table.

### 1b. `created_at` Column Presence Per Table (complete)

| Slice | Table | created_at in slice DDL? | DEFAULT present? |
|---|---|---|---|
| schema-market-data | watchlist | NO | — |
| schema-market-data | market_prices | NO | — |
| schema-market-data | market_prices_history | NO | — |
| schema-market-data | daily_ohlcv | NO | — |
| schema-market-data | ohlcv_backfill_queue | NO | — |
| schema-alerts | alerts | NO | — |
| **schema-alerts** | **custom_alert_rules** | **YES** | YES (datetime('now')) |
| schema-alerts | alert_mutes | NO | — |
| **schema-alerts** | **price_alerts** | **YES** | YES (datetime('now')) |
| **schema-alerts** | **broker_sanctions** | **YES** | NO (TEXT NOT NULL, no default) |
| schema-macro | macro_indicators | NO | — |
| schema-macro | imf_indicators | NO | — |
| schema-macro | commodity_prices | NO | — |
| schema-macro | commodity_prices_history | NO | — |
| schema-macro | sbv_rates | NO | — |
| schema-macro | sbv_rates_history | NO | — |
| schema-macro | prediction_markets | NO | — |
| schema-macro | prediction_signals | NO | — |
| schema-macro | tracked_indicators | NO | — |
| schema-macro | kinhdich_readings | NO | — |
| schema-macro | hexagram_transitions | NO | — |
| schema-macro | fred_series_daily | NO | — |
| **schema-macro** | **bond_maturity** | **YES** | YES (datetime('now')) |
| **schema-macro** | **pharma_events** | **YES** | YES (datetime('now')) |
| **schema-news** | **rag_analyses** | **YES** | NO (TEXT NOT NULL, no default) |
| **schema-news** | **agent_signals** | **YES** | YES (datetime('now')) |
| schema-news | mention_velocity | NO | — |
| schema-news | reputation_scores | NO | — |
| schema-news | market_messages | NO | — |
| schema-news | cascade_rule_hits | NO | — |
| schema-news | trade_exposures | NO | — |
| schema-news | insider_transactions | NO | — |
| **schema-news** | **signal_rejections** | **YES** | YES (datetime('now')) |
| schema-news | deep_fetch_queue | NO | — |
| schema-news | deep_fetch_stats | NO | — |
| **schema-news** | **signal_outcomes** | **YES** | YES (datetime('now')) |
| schema-portfolio | positions | NO | — |
| schema-portfolio | portfolio_pnl_snapshots | NO | — |
| schema-portfolio | portfolio_targets | NO | — |
| schema-briefings | briefing_log | NO | — |
| **schema-briefings** | **market_summaries** | **YES** | YES (datetime('now')) |
| schema-system | cron_job_runs | NO | — |
| **schema-system** | **agent_feedback** | **YES** | NO (TEXT NOT NULL, no default) |
| schema-system | agent_work_log | NO | — |
| schema-system | evidence_fragments | NO | — |
| schema-system | evidence_scores | NO | — |
| schema-system | evidence_likelihood_ratios | NO | — |
| **schema-system** | **prediction_claims** | **YES** | YES (datetime('now')) |
| schema-system | calibration_snapshots | NO | — |
| schema-system | system_logs | NO | — |
| schema-system | system_changelog | NO | — |
| schema-system | audit_state | NO | — |
| schema-system | ask_queue | NO | — |
| **schema-system** | **user_requests** | **YES** | YES (datetime('now')) |
| **schema-system** | **telegram_reports** | **YES** | YES — but INTEGER (unixepoch()), NOT TEXT |
| schema-system | vps_push_log | NO | — |
| schema-system | scheduler_locks | NO | — |
| schema-system | improve_check_log | NO | — |
| **schema-system** | **signal_quality_audit** | **YES** | NO (TEXT NOT NULL, no default) |
| schema-system | vps_service_health | NO | — |
| schema-system | bctc_signal_debounce | NO | — |
| schema-system | sla_breach_audit | NO | — |
| schema-backtesting | backtest_runs | NO | — |
| agmPlanStore | agm_plan | NO | — |
| agmPlanStore | agm_actuals | NO | — |

### 1c. Critical Finding: No Slice DDL Omits `created_at` on Tables That Consuming Code Expects It

The initial P6 task hypothesis was: "at least one standalone init-slice DDL omits a
`created_at` column that consuming code queries." The full audit DISPROVES this:

**Every table that consuming production code queries for `created_at` HAS `created_at`
defined in its slice DDL.** There is no missing-column drift in the slice DDLs themselves.

This means the P5 `created_at ×3` regression came from the **IF NOT EXISTS no-op trap**
via a different mechanism: Contract-B test files that use `getDb()` (the singleton) to
create tables INLINE with an incomplete column set, followed by a `closeDb()` call.

### 1d. The IF NOT EXISTS No-Op Trap — Root Cause of `created_at ×3`

The P5 self-heal fires when `getDb()` is called on a fresh `:memory:` singleton
(after any `closeDb()` call). SQLite `:memory:` databases are **completely empty** after
`closeDb()` — they are not shared across connections.

However: `182-portfolio-risk.test.ts` uses a different pattern:

```typescript
function setupTestDb(): Database {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();           // ← kills the singleton
  const db = getDb(); // ← P5 self-heal fires here: creates tables via all 9 slices
  db.exec(`CREATE TABLE IF NOT EXISTS positions (...)`);  // IF NOT EXISTS: no-op
  db.exec(`CREATE TABLE IF NOT EXISTS market_prices (...)`);  // IF NOT EXISTS: no-op
  db.exec(`CREATE TABLE IF NOT EXISTS market_prices_history (...)`);  // IF NOT EXISTS: no-op
  return db;
}
afterEach(() => { closeDb(); }); // ← kills singleton after EACH test
```

With `afterEach(() => closeDb())`, the P5 self-heal fires on EVERY test in this file.
That is 3+ calls per test to each of the 9 init-slice functions.

The `created_at ×3` new failures happen in tests that run AFTER `182-portfolio-risk.test.ts`
in alphabetical order. Those tests call `getDb()` expecting either:
(a) an empty fresh `:memory:` DB (their own inline setup), or
(b) a DB with tables that their inline DDL would have created

But with P5: `getDb()` now automatically creates all tables via the 9 slices, which
**breaks** Contract-B tests that expect a minimal inline-only DB. The 3 failing tests
are in files alphabetically after `182-*` whose inline DDL **omitted `created_at`** on
some table, but the self-heal created that same table WITH `created_at`. The mismatch
causes downstream code paths (e.g. INSERT via production module without providing
`created_at`) to fail differently: either NOT NULL constraint (if no DEFAULT) or the
test's assertion on a queried value fails.

Specifically the 3 failures are most likely from tables with `created_at TEXT NOT NULL`
WITHOUT `DEFAULT`: **agent_feedback**, **signal_quality_audit**, **rag_analyses**.
When the self-heal creates them with `TEXT NOT NULL` (no DEFAULT), any test INSERT that
omits `created_at` fails. The inline DDL those tests had on the singleton pre-P5 likely
either omitted the column entirely or had a DEFAULT. P5 self-heal imposed a stricter DDL.

### 1e. The telegram_reports Type Drift

One additional drift is flagged as a secondary concern but did NOT cause the P5 regression:

`telegram_reports.created_at` is defined in `schema-system.ts` as:
```sql
created_at INTEGER NOT NULL DEFAULT (unixepoch())
```

This is `INTEGER` type with epoch seconds semantics. Some test files and consuming code
may treat this as TEXT (ISO8601). This is not a `no such column` error but a semantic
mismatch. This was pre-existing before P5 and is NOT the source of the ×3 regression.
Flagged for dev awareness: tests using `datetime()` string comparison on `telegram_reports.created_at`
will behave unexpectedly. No action required for P6 fix scope.

---

## 2. Direction Choice: (a) vs (b)

### Option (a): self-heal-with-RECONCILED-DDL

Keep the `getDb()` self-heal but reconcile all slice DDLs to have consistent column
sets. Specifically: ensure that `agent_feedback`, `signal_quality_audit`, and
`rag_analyses` have `created_at TEXT NOT NULL DEFAULT (datetime('now'))` (add
the DEFAULT so Contract-B test INSERTs without `created_at` don't hit NOT NULL failures).

**Problem:** This changes 3 slice DDLs (production schema). Even with `IF NOT EXISTS`,
the DEFAULT addition only helps fresh DBs — existing production DBs already have those
tables. Adding DEFAULT via ALTER TABLE is not needed (production DBs have rows already
providing `created_at`). So the reconciliation only helps the test scenario.

**Larger problem:** The `getDb()` self-heal fires on EVERY `getDb()` call after any
`closeDb()`, including calls from `182-portfolio-risk.test.ts::afterEach`. Each `afterEach`
closes and re-opens, causing 9 slice inits per test. This is:
- Overhead: 9 × N_TESTS calls to all slice init functions per test file with `afterEach closeDb`
- Risk: if ANY of the 9 slice init functions has side effects (and they do — `initMarketDataTables`
  deletes rows from `market_prices`; `initNewsTables` queries PRAGMA `insider_transactions`),
  those side effects fire on every test setup. This is a production-code footgun.
- Still broken: 300 Contract-B files that use `new Database(':memory:')` directly (not
  `getDb()`) are unaffected, but if ANY of those files also touches `getDb()` on a fresh
  DB, the self-heal fires and may conflict.

**Verdict:** Option (a) is viable ONLY if the scope is tightly bounded AND the side-effect
risk of repeated slice-init calls is mitigated. The repeated `initMarketDataTables` DELETE
on `market_prices` is a footgun — it wipes test-inserted rows.

### Option (b): run-order test isolation (restore/reinit in Contract-A killers)

Make the 4 "singleton-killer" Contract-A files restore the canonical schema in `afterAll`
instead of simply closing the DB. Concretely:

**Before (P5-era `afterAll`):**
```typescript
afterAll(() => { closeDb(); });
```

**After (P6 fix):**
```typescript
afterAll(async () => {
  // Instead of just closing: ensure any subsequent getDb() call
  // will start fresh without self-heal's slice-only schema
  closeDb();
  // No reinit — just close. The NEXT file that calls getDb()
  // will get an empty :memory: DB. If it needs tables, it must
  // use its own Contract-A initDatabase() or Contract-B inline DDL.
  // This is the correct behavior: a closeDb() should NOT auto-init.
});
```

But this still leaves the problem that test files running AFTER a singleton-killer with
only `getDb()` calls (no initDatabase) will get empty tables.

**The correct Option (b) is: remove the `getDb()` self-heal from P5 entirely and instead
fix the 4 singleton-killer files to preserve correct DB state for subsequent tests.**

Specifically, the 4 Contract-A singleton-killers should `closeDb()` in `afterAll`
WITHOUT triggering self-heal, and the subsequent tests that NEED the DB initialized
should call `initDatabase()` themselves. This is the Contract-A contract: if you use
`initDatabase()`, you own the lifecycle.

However, this doesn't fix the 629 failures directly. The 629 failures exist because
production modules call `getDb()` (non-injectable) in a sequence where the singleton DB
was already closed by a Contract-A killer. The test assertions fail because those modules
return `[]` (try/catch guard swallows "no such table").

**Option (b) correct form:** In the 4 singleton-killer files, change `afterAll(closeDb)`
to `afterAll(async () => { closeDb(); await initDatabase(); })`. This means after each
killer test suite completes, the DB is re-initialized to canonical schema. Subsequent
test files that call `getDb()` (pure singleton pattern) get a properly initialized DB.

**Risk analysis for Option (b):**
- 4 files modified (test files only, not production code)
- `initDatabase()` is async — requires `afterAll(async () => ...)`
- `initDatabase()` runs the full init sequence including backfills (test-mode guard
  `isTestEnv=true` skips seed/backfill, confirmed by schema.ts lines 169-195)
- No production code changes → zero risk to 629 baseline
- The 4 files are the ONLY ones with `afterAll(closeDb)` pattern (confirmed in P5 notebook)
- This is purely additive: calling `initDatabase()` after `closeDb()` on a fresh `:memory:`
  DB is equivalent to what the tests already do in their `beforeAll`

---

## 3. CHOSEN DIRECTION: Option (b) — Contract-A Killers Reinit After Close

**Rationale:** Option (b) does not touch production code. The self-heal approach
(Option a) introduces a production-code footgun (side effects on every `getDb()` call).
Option (b) is test-file only, bounded to 4 files, and preserves the Contract-A/B
boundary cleanly. It directly addresses the pollution mechanism identified in P4/P5.

**Trade-off acknowledged:** Option (b) does NOT help test files that use `getDb()` for
Contract-B-style table creation (like `182-portfolio-risk.test.ts`). Those files are
a Contract boundary violation (they use `getDb()` but provide their own inline DDL).
However, they are not the source of the 629 failures — they pass currently (629 failures
are from CONTRACT-A pure-singleton files whose production modules receive an empty DB).

---

## 4. Dev-Ready Implementation Plan

### 4a. Files to Modify (4 test files only — NO production code)

The 4 Contract-A singleton-killer files (confirmed from P5 spike notebook):

| File | Current afterAll | Change |
|---|---|---|
| `apps/mcp-server/src/__tests__/084-tool-market.test.ts` | `afterAll(() => { closeDb(); })` | `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/089-tool-macro.test.ts` | `afterAll(() => { closeDb(); })` | `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/1527-schema-slices.test.ts` | `afterAll(() => { closeDb(); })` | `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/182-portfolio-risk.test.ts` | `afterEach(() => { closeDb(); })` | `afterEach(async () => { closeDb(); await initDatabase(); })` |

**Note on 182-portfolio-risk.test.ts:** This file uses `afterEach` (not `afterAll`).
After each test in the file, the singleton is killed. With the P6 fix, `initDatabase()`
runs after each test — the next test in the same file still calls `setupTestDb()` which
does `closeDb(); getDb(); db.exec(CREATE TABLE IF NOT EXISTS ...)`. With `initDatabase()`
already having run, the `setupTestDb()` inline DDLs are no-ops (IF NOT EXISTS). The
`setupTestDb()` returns the canonical DB — the test's SUT code works correctly since
the canonical schema is a superset of the inline DDL.

**Additional fix for 182-portfolio-risk.test.ts:** The `afterEach` close+reinit means
each test in the file calls `initDatabase()` at start of next test via `setupTestDb()`.
But `setupTestDb()` calls `closeDb(); getDb()` first. With P6: `getDb()` returns empty
fresh `:memory:` (no self-heal). Then `db.exec(CREATE TABLE IF NOT EXISTS ...)` creates
the minimal tables. This is CORRECT behavior — `182-*` is a Contract-B-style test
using `getDb()` for its DB instance. The fix for `182-*` is actually: keep `afterEach`
as `afterEach(() => { closeDb(); })` (pure close, no reinit), AND ensure that subsequent
files get a clean state. The only structural change needed is: the OTHER 3 files (084,
089, 1527) use `afterAll`, not `afterEach` — they kill the singleton once after the
entire suite. Fix those 3.

**Revised scope:**

| File | Change |
|---|---|
| `apps/mcp-server/src/__tests__/084-tool-market.test.ts` | `afterAll(() => closeDb())` → `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/089-tool-macro.test.ts` | `afterAll(() => closeDb())` → `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/1527-schema-slices.test.ts` | `afterAll(() => closeDb())` → `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/182-portfolio-risk.test.ts` | NO CHANGE — leave `afterEach(() => closeDb())` as-is |

**Rationale for leaving 182 unchanged:** `182-portfolio-risk.test.ts` uses `afterEach`
which is per-test. Its `setupTestDb()` creates a fresh DB with minimal inline DDL on
each test. This is a self-contained Contract-B-style file. The 629 failures are NOT
caused by `182-*`'s `afterEach closeDb` — they are caused by the 3 `afterAll closeDb`
files (084, 089, 1527) which kill the singleton and leave it dead for all subsequent
test files in the run.

**RISK: 182-portfolio-risk.test.ts afterEach interaction.** The `afterEach` in 182 kills
the singleton after each test in the file. If the 3 `afterAll` killers (084, 089, 1527)
are all positioned BEFORE 182 in the run order (alphabetically 084 < 089 < 182 < 1527),
then after 084 kills and reinits, 089 kills and reinits, 182 runs with `afterEach` close
(many kills), and then 1527 runs. The 3 `afterAll` kills are the dangerous ones for
subsequent files. Fix those 3. `182-*` self-contained via `setupTestDb()`.

### 4b. Import Addition Required

The 3 modified files (084, 089, 1527) already import `initDatabase` and `closeDb` from
`schema.js`. Verify (READ before EDIT):
- `084-tool-market.test.ts` line ~26: `import { initDatabase, closeDb } from "../infrastructure/db/schema.js"` — check if `initDatabase` is in the import
- `089-tool-macro.test.ts` line ~26: same
- `1527-schema-slices.test.ts` line ~18: already imports `initDatabase, getDb, closeDb`

If `initDatabase` is NOT imported in 084 or 089, add it to the import line.

### 4c. Exact Change Pattern

For each of the 3 files, locate:
```typescript
afterAll(() => {
  closeDb();
});
```

Replace with:
```typescript
afterAll(async () => {
  closeDb();
  await initDatabase();
});
```

This is a minimal, surgical 2-line change per file. No other modifications.

### 4d. Verification Gate

Run (in `apps/mcp-server/` only, using native bun test method only):

```
bun test --reporter=native 2>&1 | grep -E "^(pass|fail|error|skip)" | tail -5
```

Gate: native `fail` + `error` count MUST be < 629.

Do NOT use the marker method (it over-counts by ~2×). Native method is the authoritative
gate per the P4/P5 spike notes.

Do NOT run the full suite on the host machine during dev (host-panic risk per MEMORY note).
Run per-file isolation first to confirm no new failures introduced:

```bash
cd apps/mcp-server
bun test src/__tests__/084-tool-market.test.ts
bun test src/__tests__/089-tool-macro.test.ts
bun test src/__tests__/1527-schema-slices.test.ts
```

All 3 must pass in isolation BEFORE running the full suite.

---

## 5. Risk Assessment — All Slices Covered

### 5a. Slices Not Touched (production code unchanged)

All 9 standalone slice files are READ-ONLY in this fix. No production code changes.
Zero risk of introducing new drift.

### 5b. `broker_sanctions.created_at` — NO DEFAULT (secondary risk, not in scope)

`broker_sanctions` in `schema-alerts.ts` defines `created_at TEXT NOT NULL` without
`DEFAULT`. Consuming code in `dataFreshnessTools.ts` queries `MAX(created_at)`. On an
empty fresh DB, `MAX(created_at)` returns NULL — the function handles NULL gracefully.
On INSERT, the caller (`brokerSanctionsStore`) must provide `created_at` explicitly.
**Not a regression risk for this fix.**

### 5c. `agent_feedback.created_at` — NO DEFAULT (secondary risk, not in scope)

Same pattern: `agent_feedback.created_at TEXT NOT NULL` without DEFAULT in
`schema-system.ts`. Callers provide it explicitly. Not a regression risk.

### 5d. `signal_quality_audit.created_at` — NO DEFAULT (secondary risk, not in scope)

Same pattern. Not a regression risk.

### 5e. `rag_analyses.created_at` — NO DEFAULT (secondary risk, confirmed by corpus)

`rag_analyses.created_at TEXT NOT NULL` without DEFAULT. 64 test files create this
table inline — all 64 provide `created_at` in their INSERT fixtures. Not a regression.

### 5f. `telegram_reports.created_at` — INTEGER vs TEXT type mismatch

Semantic drift: `created_at INTEGER NOT NULL DEFAULT (unixepoch())` in the slice.
Some test files may treat as TEXT. This is a pre-existing divergence, not introduced
by P6. No test failure from this — the column EXISTS, no `no such column` error.
Flag for future cleanup: standardize to TEXT epoch-string format.

### 5g. `initFinancialReportsTables` exclusion risk

`initFinancialReportsTables` is and remains EXCLUDED from any self-heal or test init
in this fix (it was excluded in P5 due to RISK-2: view compilation). Its exclusion
does NOT affect the P6 fix because we are NOT using a self-heal. The 3 `afterAll`
reinits call `initDatabase()` — which INCLUDES `initFinancialReportsTables`. This is
SAFE because `initDatabase()` is the canonical function that already handles view
compilation correctly.

**This is a key advantage of Option (b) over Option (a):** Option (b) uses
`initDatabase()` (the full canonical init) whereas Option (a) used 9 standalone slices
that explicitly excluded `initFinancialReportsTables`. By using `initDatabase()`, P6
does not repeat the P5 partial-init exclusion risk.

### 5h. Idempotency of afterAll reinit

`initDatabase()` uses `CREATE TABLE IF NOT EXISTS` throughout. Calling it in `afterAll`
on a fresh `:memory:` DB is equivalent to calling it in `beforeAll`. The next test file
in the suite gets a fully initialized singleton DB. Zero idempotency risk.

---

## 6. Excluded from This Fix

Per the hard constraints in the task spec:

- **NOT recommended:** per-file inline-DDL patches (rejected in §3)
- **NOT recommended:** mechanized one-size init injection (reverted 9454baad, +219 risk)
- **NOT recommended:** self-heal in `getDb()` (P5 approach, +6 regression)
- **NOT changing:** any production file in `src/infrastructure/db/`
- **NOT changing:** `schema.ts` (must remain byte-identical to baseline d1aa19c5)

---

## 7. Summary

**Drift table:** All 9 standalone slice DDLs are column-correct for `created_at`.
No slice omits `created_at` on a table where consuming code expects it. The P5
regression (`created_at ×3`) was caused by the self-heal creating tables with stricter
NOT-NULL-no-DEFAULT columns, breaking Contract-B tests that previously created those
same tables with looser inline DDL.

**Chosen direction:** (b) — modify 3 Contract-A singleton-killer test files to call
`initDatabase()` after `closeDb()` in their `afterAll` hooks. This restores the
singleton to canonical state for subsequent test files without any production code change.

**Dev-ready file list:**
- `apps/mcp-server/src/__tests__/084-tool-market.test.ts` (1 change: afterAll async reinit)
- `apps/mcp-server/src/__tests__/089-tool-macro.test.ts` (1 change: afterAll async reinit)
- `apps/mcp-server/src/__tests__/1527-schema-slices.test.ts` (1 change: afterAll async reinit)
- NO changes to any production file

**Expected outcome:** The 629 failures are from pure-singleton test files running after
the 3 `afterAll` killers. With reinit, subsequent files get a canonical DB → production
module `getDb()` calls find properly initialized tables → no silent `[]` return →
test assertions pass. Expected drop: well below 629 (the 629 failures were ALL in
post-killer pure-singleton files per P5 mechanism analysis).

**Next gate:** native bun test fail+error < 629. dev-mcp-server verifies per-file
isolation passes for all 3 modified files, then runs native full suite.
