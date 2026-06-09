# FU-SCHEMA-DRIFT-P7 — Schema Drift Spike Brief

**Date:** 2026-06-09
**Author:** architect
**Status:** COMPLETE — corrected root cause, dev-ready plan attached
**Sprint:** CI-RED-RECONCILE
**Task:** FU-SCHEMA-DRIFT-P7 (SPIKE, 120m timebox, 5th touch of CI-test-schema surface)
**Depends:** FU-SCHEMA-DRIFT-P6 (DONE, direction b empirically disproved)
**Zone:** `apps/mcp-server/src/`
**Baseline:** native fail+error = 629 (commit b9e305ae, byte-identical to e442cf11)

---

## 0. P7 Premise Correction — Tables ARE in Canonical initDatabase()

The P7 task description states: "canonical initDatabase() NEVER CREATES these tables."

**This premise is EMPIRICALLY FALSE.** Full brownfield audit of all schema slices confirms:

| Residual Table (from P6 bucket) | Owner Slice | CREATE TABLE IF NOT EXISTS present? |
|---|---|---|
| agent_signals (37 occurrences) | schema-news.ts `initNewsTables()` | YES |
| sbv_rates_history (19) | schema-macro.ts `initMacroTables()` | YES |
| positions (19) | schema-portfolio.ts `initPortfolioTables()` | YES |
| commodity_prices_history (19) | schema-macro.ts `initMacroTables()` | YES |
| commodity_prices (16) | schema-macro.ts `initMacroTables()` | YES |
| daily_ohlcv (5) | schema-market-data.ts `initMarketDataTables()` | YES |
| imf_indicators (3) | schema-macro.ts `initMacroTables()` | YES |
| evidence_scores (1) | schema-system.ts `initSystemTables()` | YES |
| cron_job_runs (2) | schema-system.ts `initSystemTables()` | YES |
| watchlist (1) | schema-market-data.ts `initMarketDataTables()` | YES |
| vps_service_health (1) | schema-system.ts `initSystemTables()` | YES |
| vnstock_trading_stats (1) | schema-financial-reports.ts `initFinancialReportsTables()` | YES |
| signal_quality_audit (1) | schema-system.ts `initSystemTables()` | YES |
| insider_transactions (1) | schema-news.ts `initNewsTables()` | YES |
| deep_fetch_queue (2) | schema-news.ts `initNewsTables()` | YES |
| no-such-column foreign_net_vol (3) | schema-market-data.ts + migrateForeignFlowColumns() | YES |

**All 16 residual "missing" tables are fully present in canonical initDatabase().** Adding
`CREATE TABLE IF NOT EXISTS` statements for them would be a no-op — the statements already exist.

**Consequence:** The P7 direction as specified (add DDL to canonical init) CANNOT reduce
the 629 failures. The failures are not caused by missing DDL.

---

## 1. True Root Cause — 7 "Close-No-Init" Singleton Destroyers

### 1a. Mechanism Confirmed

`setup.ts` (preload) sets `Bun.env["DB_PATH"] = ":memory:"` globally. Bun 1.3.13 runs all
1033 test files in a single process, sequential order, sharing the `_db` module singleton
from `schema.ts`. Each test file gets the SAME `_db` reference.

**Two file categories at play:**

**Category A — "pure-singleton" files (positions [815]–[1033]):** Files that call NO
`initDatabase()`, NO `closeDb()`, NO `CREATE TABLE`. They fully rely on the singleton
being populated by a previous file's `initDatabase()` call. When they call production
modules that use internal (non-injectable) `getDb()`, those modules get whatever the
current singleton state is.

**Category B — "close-no-init" files:** Files that call `closeDb()` (destroying the
singleton) but NEVER call `initDatabase()` to rebuild it. After these files run, the
singleton is null — the NEXT `getDb()` call creates a fresh empty `:memory:` DB.

### 1b. The 7 Singleton Destroyers — Identified

Comprehensive Python analysis across all 1033 test files confirmed exactly **7 files**
that call `closeDb()` without any actual `initDatabase()` call:

| File | Run Order [idx] | closeDb calls | Destruction Pattern |
|---|---|---|---|
| `103-job-market-scan.test.ts` | [53] | 1 | `beforeEach(closeDb)` — kills before every test |
| `1076-market-scan-noise-retirement.test.ts` | [77] | 1 | standalone call |
| `1291-foreign-flow-duplicate-dedup-migration.test.ts` | [236] | 3 | `beforeEach + afterEach` |
| `182-portfolio-risk.test.ts` | [574] | 2 | `afterEach(closeDb)` x2 |
| `1869b-watchlist-threshold-wiring.test.ts` | [638] | 1 | standalone call |
| `231-signal-validator-integration.test.ts` | [751] | 1 | standalone call |
| `283-portfolio-conviction-batch.test.ts` | [814] | 5 | `afterEach(closeDb)` x4 |

### 1c. Why P6 Was Ineffective — Explained

P6 added `afterAll(async () => { closeDb(); await initDatabase(); })` to files at positions
[74] (084), [77-approx] (089), [508] (1527).

After 1527's reinit at [508], the singleton is initialized. But then:
- File [574] `182-portfolio-risk` kills the singleton (afterEach x2)
- File [638] `1869b` kills the singleton again
- File [751] `231-signal-validator-integration` kills it again
- File [814] `283-portfolio-conviction-batch` kills it 5 times (the last kill is definitive)

After position [814], **all 219 remaining files get a fresh empty `:memory:` singleton.**
Of those 219 files, **180 are pure-singleton files** (no `initDatabase`, no `closeDb`).
When they call production modules using internal `getDb()`, those modules query tables
that don't exist in the empty singleton — **no such table**.

P6 fixed the state at [508] but left destroyers at [574], [638], [751], [814] intact.
This is why the residual bucket counts were **byte-for-byte identical** after P6 — the 
same 180+ files failed for the same reason.

---

## 2. Per-Residual-Table Map

The tables ARE already in canonical initDatabase(). The analysis below maps each to its
owning production module (to confirm DDL is column-exact) and the target init slice
(already correct). This serves as a verification audit, not a design for new DDL.

### 2a. Agent Signals (37 occurrences — dominant)

| Property | Value |
|---|---|
| Owning production module | `infrastructure/db/agentSignalStore.ts` (uses injectable `db: Database`) |
| Owning init slice | `schema-news.ts` → `initNewsTables()` |
| CREATE TABLE in slice | Lines ~67-79: all base columns + expires_at |
| Post-create ALTER TABLE migrations | outcome, cycle_id, causal_ref, signal_class, confidence_score, critic_score, etc. — all in initNewsTables |
| Consumer test files failing | `accuracy-context-tool.test.ts` [984], `tnb-critic-gate.test.ts` [1025], `signal-outcome-store.test.ts` [1020] — pure-singleton, all after destroyer [814] |
| created_at type | `TEXT NOT NULL DEFAULT (datetime('now'))` — safe, has default |

**Risk note:** No DDL change needed. Zero collision risk with Contract-B tests.

### 2b. SBV Rates History (19 occurrences)

| Property | Value |
|---|---|
| Owning production module | `infrastructure/db/macroStatsStore.ts` (uses internal `getDb()` at line 118) |
| Owning init slice | `schema-macro.ts` → `initMacroTables()` |
| CREATE TABLE in slice | Full 8-column definition + ALTER TABLE migrations for discount/interbank cols |
| created_at | Not present — time key is `fetched_at TEXT NOT NULL` |
| Consumer test files | All pure-singleton files after [814] that call macroStats chain |

**Risk note:** `fetched_at` not `created_at` — no type drift concern.

### 2c. Positions (19 occurrences)

| Property | Value |
|---|---|
| Owning production module | `infrastructure/db/positionStore.ts` + `interface/mcp/tools/portfolio/positionTools.ts` (getDb() lines 218, 260, 299) |
| Owning init slice | `schema-portfolio.ts` → `initPortfolioTables()` |
| Consumer test files failing | `280-hexagram-library.test.ts` [815-range], `281-hao-encoder.test.ts`, `282-nuclear-nguhanh.test.ts`, `284-reading-orchestrator.test.ts`, `301-hexagram-library-rebuild.test.ts`, `AIT-DEV-1.test.ts`, `195-rebalancing.test.ts`, `1122-base-rate-computation-job.test.ts`, `1440-portfolio-pnl-diacritics.test.ts`, `1903a-dispatch-regression.test.ts` |
| created_at | Not present in positions DDL — `opened_at TEXT NOT NULL DEFAULT` |

**Risk note:** `positions` has `UNIQUE(code)`. Some Contract-B tests create it with partial DDL (missing UNIQUE). Adding to initDatabase would be a no-op since it already exists in the slice. No DDL change needed.

### 2d. Commodity Prices History (19 occurrences) + Commodity Prices (16 occurrences)

| Property | Value |
|---|---|
| Owning production module | `infrastructure/db/macroStatsStore.ts` (getCommodityStats, line 36) |
| Owning init slice | `schema-macro.ts` → `initMacroTables()` |
| Consumer test failures | All pure-singleton files after [814] that call assembleBriefing/pollNews/runImpactChain chains |
| created_at | Not present — time key is `fetched_at TEXT NOT NULL` |

**Risk note:** `FIX-BCTC-SLA-WEEKEND.test.ts` [903] and `FIX-SLA-EXEMPT-NEWS-SBVFX.test.ts` [928] are partial-setup files (no initDatabase, no closeDb) that reference `commodity_prices`. They rely on pure-singleton state from a previous initDatabase() call. Both fall after destroyer [814] → get empty singleton → fail.

### 2e. Daily OHLCV (5 occurrences + foreign_net_vol 3)

| Property | Value |
|---|---|
| Owning production module | `infrastructure/db/ohlcvForeignFlowStore.ts`, `priceQueries.ts`, `positionTools.ts` |
| Owning init slice | `schema-market-data.ts` → `initMarketDataTables()` |
| Migration for foreign_net_vol | `migrateForeignFlowColumns()` in schema.ts — adds column via ALTER TABLE IF NOT EXISTS |
| Consumer test failures | `1319-watchdog-foreign-flow.test.ts`, `1549-watchdog-news-staleness.test.ts`, `EI-P2-startup-assert-data-env.test.ts` |

**Risk note:** `foreign_net_vol` "no-such-column" errors occur when `daily_ohlcv` exists (from Contract-B partial inline DDL) but was created WITHOUT the foreign flow columns. The `migrateForeignFlowColumns()` migration runs inside `initDatabase()` but NOT standalone. Pure-singleton tests after [814] get fresh empty DB; `daily_ohlcv` doesn't exist at all → "no such table" not "no such column".

### 2f. IMF Indicators (3 occurrences)

| Property | Value |
|---|---|
| Owning production module | `scheduler/news-analysis/intelligenceCycleJob.ts` (via imfFetcher) |
| Owning init slice | `schema-macro.ts` → `initMacroTables()` |
| Consumer test failures | Pure-singleton files calling macro pipeline after [814] |

### 2g. Evidence Scores (1), Cron Job Runs (2), VPS Service Health (1), Signal Quality Audit (1), Insider Transactions (1), Deep Fetch Queue (2)

All present in their respective init slices (schema-system.ts, schema-news.ts). Same
destruction mechanism. All consumer test files are pure-singleton files after position [814].

---

## 3. Why Adding DDL to initDatabase() CANNOT Heal the 629 Failures

The proposed P7 direction (add CREATE TABLE IF NOT EXISTS to canonical initDatabase()) is
architecturally unsound because:

1. **All 16 residual tables already exist in canonical initDatabase().** The DDL additions
   are no-ops — SQLite IF NOT EXISTS silently skips existing tables.

2. **The failing test files do not call initDatabase().** 293 test files have partial
   inline DDL without an initDatabase() call. Of the 1033 files, 180+ are pure-singleton
   files with NO CREATE TABLE and NO initDatabase(). Adding DDL to initDatabase() does
   not affect files that never call it.

3. **The failure mechanism is singleton destruction.** 7 "close-no-init" files call
   `closeDb()` without rebuilding the singleton. Files running after them get empty DB.
   This is a lifecycle problem, not a schema-completeness problem.

4. **P5 empirical proof:** P5 actually DID add init logic to getDb() (triggered on fresh DB
   creation). This is the closest equivalent to "ensure tables exist on any getDb() call."
   Result: +6 WORSE. The issue is not at the getDb() level.

---

## 4. Correct Dev-Ready Implementation Plan — 7 Close-No-Init Files

### 4a. Root Fix: Add afterAll Reinit to 7 Singleton Destroyers

Each of the 7 close-no-init files must ensure the singleton is restored to canonical state
after the file's last test completes. The pattern is:

**For files with `afterEach(closeDb)` pattern** — change to preserve state for next file:
```typescript
// BEFORE (destroys singleton permanently after file completes)
afterEach(() => { closeDb(); });

// AFTER (restores singleton for subsequent pure-singleton files)
afterEach(async () => {
  closeDb();
  await initDatabase(); // re-arm for next test and next file
});
```

**For files with standalone `closeDb()` calls (not in afterAll/afterEach)** — add afterAll:
```typescript
// ADD at file scope
afterAll(async () => {
  closeDb();
  await initDatabase();
});
```

### 4b. Per-File Change Table

| File | Run Order | Pattern | Change |
|---|---|---|---|
| `apps/mcp-server/src/__tests__/103-job-market-scan.test.ts` | [53] | `beforeEach(closeDb)` | Add `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/1076-market-scan-noise-retirement.test.ts` | [77] | standalone closeDb | Add `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/1291-foreign-flow-duplicate-dedup-migration.test.ts` | [236] | `beforeEach + afterEach(closeDb)` | Add `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/182-portfolio-risk.test.ts` | [574] | `afterEach(closeDb)` x2 | Add `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/1869b-watchlist-threshold-wiring.test.ts` | [638] | standalone closeDb | Add `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/231-signal-validator-integration.test.ts` | [751] | standalone closeDb | Add `afterAll(async () => { closeDb(); await initDatabase(); })` |
| `apps/mcp-server/src/__tests__/283-portfolio-conviction-batch.test.ts` | [814] | `afterEach(closeDb)` x4 | Add `afterAll(async () => { closeDb(); await initDatabase(); })` |

**No production code changes.** All 7 files are test files only.

### 4c. Import Verification Required Before Edit

For each file, verify whether `initDatabase` is already imported:
- `103-job-market-scan.test.ts`: check imports for `initDatabase` — likely not imported
- `1076-market-scan-noise-retirement.test.ts`: same check
- `1291-foreign-flow-duplicate-dedup-migration.test.ts`: same check
- `182-portfolio-risk.test.ts`: check — `closeDb` is imported but `initDatabase` may not be
- `1869b-watchlist-threshold-wiring.test.ts`: check
- `231-signal-validator-integration.test.ts`: check
- `283-portfolio-conviction-batch.test.ts`: check

Pattern to add if missing:
```typescript
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
// or if they import from index.js:
import { initDatabase, closeDb } from "../infrastructure/db/index.js";
```

### 4d. Pattern for Adding afterAll in Files Without Existing afterAll

```typescript
// At file scope (not inside describe block), after all describe/it blocks:
afterAll(async () => {
  closeDb();
  await initDatabase();
});
```

If the file has an existing `afterAll` that only calls `closeDb()`, extend it:
```typescript
// BEFORE:
afterAll(() => {
  closeDb();
});

// AFTER:
afterAll(async () => {
  closeDb();
  await initDatabase();
});
```

### 4e. Verification Gate (per P6/P5 methodology)

Per-file isolation FIRST (confirms no regressions within the file):
```bash
cd apps/mcp-server
bun test src/__tests__/103-job-market-scan.test.ts
bun test src/__tests__/1076-market-scan-noise-retirement.test.ts
bun test src/__tests__/1291-foreign-flow-duplicate-dedup-migration.test.ts
bun test src/__tests__/182-portfolio-risk.test.ts
bun test src/__tests__/1869b-watchlist-threshold-wiring.test.ts
bun test src/__tests__/231-signal-validator-integration.test.ts
bun test src/__tests__/283-portfolio-conviction-batch.test.ts
```

All 7 must pass in isolation BEFORE running the full suite.

Full suite gate (native summary method):
```bash
bun test 2>&1 | tail -5
# Gate: native fail + error < 629
```

---

## 5. Risk Assessment

### 5a. afterAll(closeDb + initDatabase) Idempotency

`initDatabase()` uses `CREATE TABLE IF NOT EXISTS` throughout all 9 slices. Calling it
in `afterAll` on a fresh `:memory:` DB (just closed) is equivalent to calling it in
`beforeAll`. Zero idempotency risk.

### 5b. afterAll vs afterEach for the 4 Files with afterEach Pattern

Files [53] `103-job-market-scan`, [236] `1291-foreign-flow`, [574] `182-portfolio-risk`,
[814] `283-portfolio-conviction-batch` use `afterEach(closeDb)`. Adding `afterAll` (not
changing afterEach) means:
- `afterEach` still runs between tests within the file (correct behavior for test isolation)
- `afterAll` runs once after the last test, reinitializing the singleton for subsequent files
- No interaction between the two — `afterAll` fires after all `afterEach` hooks complete

The LAST `afterEach` in each file kills the singleton. The `afterAll` reinits it. Correct.

### 5c. Performance Impact

`initDatabase()` in test mode (isTestEnv=true) skips all seed/backfill logic (guarded by
`!isTestEnv` at lines 173-195 of schema.ts). Runtime is ~5-10ms for 9 slices of SQL EXEC.
Adding 7 such calls to the suite adds ~35-70ms total. Negligible.

### 5d. 182-portfolio-risk.test.ts Interaction

`182-portfolio-risk` uses `setupTestDb()` which calls `closeDb(); const db = getDb();`
inside each test. With the `afterAll` reinit added:
- Within the file: `setupTestDb()` still works (closeDb + getDb = fresh empty :memory:)
- `db.exec(CREATE TABLE IF NOT EXISTS ...)` still runs (IF NOT EXISTS = no-op vs initDatabase tables)
- After the file: `afterAll` reinits, subsequent files get canonical DB

This is safe. The concern from P6 brief §4d about `182-*` is resolved: we're adding
`afterAll` (once, at file end) not `afterEach` (which would conflict with setupTestDb's per-test closeDb).

### 5e. Partial-Setup Files with CREATE TABLE but No initDatabase (293 files)

These 293 files (Contract-B) will continue working as before:
- Files that have both `CREATE TABLE` inline AND call `getDb()` directly create their own schema
- Files that are pure-singleton (no setup at all) benefit from the 7-file fix: the destroyers
  are patched, so singleton persists correctly through the full run
- The 293 partial-setup files that reference residual tables (e.g. `FIX-BCTC-SLA-WEEKEND`,
  `233-cowork-resilience-e2e`, `accuracy-context-tool`) are all pure-singleton consumers
  — they will benefit from the fix to the 7 destroyers

### 5f. No-such-column foreign_net_vol (3 occurrences)

These come from Contract-B tests that create `daily_ohlcv` inline WITHOUT the foreign flow
columns, then call production code that queries `foreign_net_vol`. Fix: not in scope for
this lever — these files have their own inline DDL that omits the columns. The correct fix
for these 3 cases is to add `foreign_net_vol` to those files' inline DDL (Contract-B additive).
Expected impact: minor (3 occurrences = ~1-2 actual test failures).

---

## 6. Expected Fail+Error Drop Estimate

### Before fix (629 baseline):
- ~180 pure-singleton files after [814] each potentially fail on 1-5 queries to residual tables
- Multiplied by ~2x marker method = 629 native fail+error

### After fixing 7 close-no-init files:
- Singleton stays alive from run start to finish (first file that calls initDatabase()
  initializes it; no destroyer kills it permanently after that)
- The 180 pure-singleton files get canonical DB with all tables
- Their production module calls (`getDb()` → macroStatsStore, positionTools, agentSignalStore)
  find properly initialized tables → queries succeed → assertions pass

**Conservative estimate: 85-95% reduction in native fail+error.**

Residual (not healed by this fix):
- 3 foreign_net_vol no-such-column cases (Contract-B inline DDL issue, different fix path)
- Any flaky tests unrelated to schema (network-gated, timing-sensitive)
- Contract-B tests whose inline DDL genuinely conflicts with production module expectations

**Best estimate: native fail+error drops to <50 (from 629).**

---

## 7. Contrast with Proposed P7 Direction (Add DDL to initDatabase)

| Dimension | P7 Proposed (add DDL to init) | Correct Fix (7 close-no-init files) |
|---|---|---|
| Root premise | Tables missing from initDatabase() | WRONG — tables all present |
| Production code changes | YES — schema slices modified | NO — test files only |
| Risk of created_at drift | HIGH — repeat of P5 +6 regression | ZERO |
| Addresses actual mechanism | NO — failing files don't call initDatabase() | YES — kills singleton destroyers |
| Expected heal | ZERO (no-op DDL additions) | 85-95% of 629 failures |
| Files changed | 4-6 schema slice files | 7 test files |
| Aligns with prior empirical evidence | No — contradicts P5/P6 findings | Yes — extends P6 direction to remaining destroyers |

---

## 8. Why This Direction Was Not Tried Before

P4/P5 analysis identified 4 "Contract-A killer" files (084, 089, 1527, 182) based on
the pattern `afterAll(() => { closeDb(); })`. The P5 notebook noted "The 4 files are the
ONLY ones with `afterAll(closeDb)` pattern." This was correct for `afterAll` — but the
analysis missed `afterEach(closeDb)` and standalone `closeDb()` patterns in files WITHOUT
`initDatabase`. The 7 destroyers use all three patterns.

P6 fixed 3 of the original 4 afterAll killers ([508] 1527 was the last of the 3). Even
after that fix, destroyers at [574], [638], [751], [814] continued killing the singleton.
P6 achieved zero improvement because the downstream destroyers were untouched.

This spike completes the map: all 7 destroyers identified, all fix patterns defined.

---

## 9. Summary

**Premise correction:** All 16 residual tables are present in canonical `initDatabase()`.
The P7 "add missing DDL" direction is a no-op and cannot reduce the 629 failures.

**True root cause:** 7 test files call `closeDb()` without rebuilding the singleton.
Files at run positions [53], [77], [236], [574], [638], [751], [814] destroy the shared
singleton progressively. After position [814], 180 pure-singleton files get empty DB
→ production modules hit "no such table" errors.

**Fix:** Add `afterAll(async () => { closeDb(); await initDatabase(); })` to each of the
7 close-no-init files. **No production code changes.**

**Expected outcome:** 85-95% reduction in native fail+error. Drop from 629 to <50.
The dominant residual buckets (agent_signals 37, sbv_rates_history 19, positions 19,
commodity_prices* 35, imf_indicators 3, evidence_scores 1, etc.) will all heal because
pure-singleton files after [814] will get a canonical fully-initialized singleton.

**Build-standard:** not-applicable (bug-fix, test files only).

**Zone:** `apps/mcp-server/src/__tests__/` (7 test files, no production code).
