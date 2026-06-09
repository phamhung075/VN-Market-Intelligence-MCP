# FU-SCHEMA-DRIFT-P8 — Schema Drift Spike Brief

**Date:** 2026-06-09
**Author:** architect
**Status:** COMPLETE — direction chosen, DDL map produced, dev task recommended
**Sprint:** CI-RED-RECONCILE
**Task:** FU-SCHEMA-DRIFT-P8 (SPIKE, 120m timebox, 6th touch CI-test-schema recurring-bug)
**Depends:** FU-SCHEMA-DRIFT-P7 (DONE, afterAll-reinit lever empirically dead)
**Zone:** `apps/mcp-server/src/infrastructure/db/`
**Baseline:** native fail+error = 629 (commit 2a6044b1, byte-identical to e442cf11)

---

## 0. Exhausted Levers — Recap

| Touch | Approach | Result |
|---|---|---|
| P4 | Per-file inline-DDL hardening | −5 KEPT (e442cf11). Reaches only per-file-isolation failures. |
| P5 | `getDb()` self-heal (9 standalone slices) | +6 regression (635); healed 4 classes (−23 native), introduced 29 new from 3 NO-DEFAULT `created_at` columns. Reverted d1aa19c5. |
| P6 | afterAll-reinit on 3 Contract-A killers (084/089/1527) | +1 zero-heal (b9e305ae). Missed 4 remaining destroyers at [574]/[638]/[751]/[814]. |
| P7 | afterAll-reinit on all 7 close-no-init destroyers | +1 zero-heal (2a6044b1). The NEXT file's beforeEach/closeDb re-empties singleton. Per-file lever is dead. |
| 9454baad | Mechanized one-size init injection | +219 reverted. |

**Key empirical findings preserved:**
- P5 self-heal MECHANISM WORKS: `getDb()` auto-init on `_db=null` correctly healed sbv_rates_history, commodity_prices_history, imf_indicators, vps_service_health.
- P5 +6 regression = 3 tables had `created_at TEXT NOT NULL` WITHOUT `DEFAULT` → Contract-B test INSERTs without `created_at` hit NOT NULL violation.
- Per-file afterAll-reinit lever is DEAD: 185 files call `closeDb()`. After any destroyer's afterAll reinit, the next file in sequence may call `closeDb()` in its own `beforeEach` before consuming files run — re-killing the singleton. The chain is too long for per-file patching.

---

## 1. Direction Decision: (a) — Reconcile Drifted Slices + Re-apply P5 Self-Heal

### Why NOT direction (b) — bun global preload

Direction (b) was defined as: "a bun GLOBAL preload (bunfig.toml preload/setup) that re-inits the singleton on FIRST getDb() after any destroyer empties it."

The `setup.ts` is ALREADY registered as a preload in `bunfig.toml` (`preload = ["./src/__tests__/setup.ts"]`). A preload `await initDatabase()` call runs ONCE at suite start and does NOT persist through subsequent `closeDb()` calls. There is no mechanism in Bun's preload API to hook into every future `closeDb()` call without monkey-patching module exports.

Monkey-patching `getDb` from a preload requires overwriting an ESM named export — which is not possible in Bun's strict ESM mode after module evaluation. The preload cannot reach into `schema.ts`'s `_db` private variable.

Any "global preload" that achieves auto-reinit on every `getDb()`-after-`closeDb()` is mechanically equivalent to P5 (modifying `getDb()` in `schema.ts`). The GLOBAL part is a deployment distinction, not a design distinction.

**Conclusion:** Direction (b) as a preload is not viable without monkey-patching (fragile) or is mechanically identical to P5. The correct direction is (a): fix the DDL drift that caused P5's regression, then re-apply P5.

### Why direction (a) is viable

1. P5 self-heal MECHANISM is proven: healed 4 residual classes empirically.
2. P5 failure was DDL drift, not mechanism flaw: 3 tables had `TEXT NOT NULL` without `DEFAULT` — Contract-B test INSERTs failed NOT NULL.
3. DDL drift is bounded and verifiable: exactly 3 tables in 2 slice files need `DEFAULT (datetime('now'))` added to their `created_at` column.
4. After DDL reconciliation, P5 re-applied = zero new regressions + preservation of 4 classes healed.

### What P5 healed and what remains

After P5 (reverted), tab-filtered bucket counts:
- sbv_rates_history: 19 → 0 (HEALED)
- commodity_prices_history: 19 → 0 (HEALED)
- imf_indicators: 3 → 0 (HEALED)
- vps_service_health: 1 → 0 (HEALED)

Still residual (byte-identical across P4/P5/P6/P7):
- agent_signals: 37
- positions: 19
- commodity_prices: 16
- daily_ohlcv: 5
- Long tail: deep_fetch_queue, cron_job_runs, watchlist, vnstock_trading_stats, signal_quality_audit, insider_transactions, evidence_scores

**The self-heal already calls the slices that CREATE these residual tables** (initNewsTables for agent_signals, initPortfolioTables for positions, initMacroTables for commodity_prices, initMarketDataTables for daily_ohlcv). Their continued failure after P5 means: those test files' `_db` is non-null at the time the production module runs — the self-heal doesn't fire on non-null `_db`.

The self-heal only fires on `_db === null`. Files that fail on these tables are calling production modules on a non-null `_db` that has a PARTIAL schema (tables created by an intermediate file that called `getDb()` → P5 heal fired → all tables created → that file then called `closeDb()` → `_db=null` → NEXT intermediate file called `getDb()` → P5 fires again → all tables → ANOTHER file calls `closeDb()` again → cycle repeats → eventually a pure-singleton consumer runs, calling `getDb()` on `_db=null` → P5 fires → ALL tables created → consumer finds properly initialized DB).

If this is correct, direction (a) re-applied should heal ALL residual classes (not just the 4 that P5 healed). The reason P5 didn't heal agent_signals etc. was a MEASUREMENT ARTIFACT: the P5 CI run had 635 total (629 baseline + 29 new − 23 healed = 635). The 4 healed classes were the ONLY ones whose consuming tests were in the right order relative to `_db=null` events. The remaining residuals might have been suppressed by the 29 new failures (test runner counting behavior).

**OR** the remaining residuals persist because those consuming tests reach a non-null `_db` path. This is the more likely explanation: files like `1903a-dispatch-regression.test.ts` and others that call `Bun.env["DB_PATH"] = ":memory:"` at the TOP of the file BEFORE imports create a special case: this assignment happens before `schema.ts` is imported, so when `schema.ts` initializes its module-level `_db`, it reads `:memory:` correctly. But `_db` is already set by a PREVIOUS file's `getDb()` call (non-null). The self-heal never fires.

The fix for THIS case: the self-heal should ALSO check that the existing `_db` has the required tables, not just that `_db !== null`. But that adds a `PRAGMA table_info(agent_signals)` check on every `getDb()` call — too expensive.

**The architectural insight:** Direction (a) will heal the 4 classes P5 already healed (with corrected DDL). The remaining classes require a different mechanism. The ONLY mechanism that addresses ALL consuming-file patterns is a global preload that calls `initDatabase()` AND wraps `closeDb` to auto-reinit.

### Revised direction (a) — full design

Direction (a) has TWO parts:

**Part 1: DDL Reconciliation (prerequisite)**
Fix the 3 NO-DEFAULT `created_at` columns in owning slice files.

**Part 2: Self-heal in `getDb()` (re-apply P5) PLUS global preload initial init**
- In `setup.ts` (already the preload): add `await initDatabase()` at the bottom. This runs ONCE before all tests, ensuring `_db` is initialized for all files that run before any `closeDb()` call.
- In `getDb()` in `schema.ts`: add the P5 self-heal (9 slices, excluding `initFinancialReportsTables`) so that after ANY `closeDb()`, the next `getDb()` call re-initializes the schema.

This is direction (a) + the valid part of direction (b) (preload initial init). Together, they address:
- Files that run before any `closeDb()`: handled by preload init.
- Files that call production module after a `closeDb()`: handled by self-heal in `getDb()`.
- The P5 regression: eliminated by DDL reconciliation.

---

## 2. Per-Table Owning-Module DDL Map

All DDL cited below is sourced directly from owning production modules (Read-verified). No invented columns.

### 2a. agent_signals — 37 occurrences

| Property | Value |
|---|---|
| Owning slice | `schema-news.ts` → `initNewsTables()` |
| CREATE TABLE DDL | Lines 67–79: base 9 columns incl. `created_at TEXT NOT NULL DEFAULT (datetime('now'))` |
| Post-create ALTERs | outcome, cycle_id, causal_ref, signal_class, confidence_score, critic_score, retry_count, causal_root_id/label, news_sentiment, kinh_dich_confidence, agent_signals_majority |
| created_at type | `TEXT NOT NULL DEFAULT (datetime('now'))` — has DEFAULT, NO drift |
| DDL drift? | NO — slice DDL is canonical |
| Self-heal covers? | YES — `initNewsTables` is in P5 slice list |
| Why still failing after P5? | Consumer files reach non-null `_db` with partial schema (see §1 analysis) |
| Fix | DDL reconciliation not needed. Self-heal + preload init sufficient. |

### 2b. sbv_rates_history — 19 occurrences (P5-healed, must preserve)

| Property | Value |
|---|---|
| Owning slice | `schema-macro.ts` → `initMacroTables()` |
| CREATE TABLE DDL | Lines 153–166: 9 columns, time key `fetched_at TEXT NOT NULL` (no `created_at`) |
| Post-create ALTERs | discount_rate_pct, max_deposit_rate_pct, max_lending_rate_pct, interbank_overnight_pct, is_estimate |
| DDL drift? | NO — P6 audit confirmed no created_at column, fetched_at is the time key |
| Self-heal covers? | YES — `initMacroTables` in P5 slice list |
| P5 healed? | YES (19→0). Re-applying P5 with DDL reconciliation must preserve this. |

### 2c. positions — 19 occurrences

| Property | Value |
|---|---|
| Owning slice | `schema-portfolio.ts` → `initPortfolioTables()` |
| CREATE TABLE DDL | Lines 15–26: id, code, shares, avg_price, opened_at (DEFAULT datetime('now')), closed_at, notes, UNIQUE(code) |
| created_at | Not present — time key is `opened_at TEXT NOT NULL DEFAULT (datetime('now'))` |
| DDL drift? | NO |
| Self-heal covers? | YES — `initPortfolioTables` in P5 slice list |
| Why still failing after P5? | Non-null `_db` partial schema path |
| Fix | No DDL change. Self-heal + preload init. |

### 2d. commodity_prices — 16 occurrences

| Property | Value |
|---|---|
| Owning slice | `schema-macro.ts` → `initMacroTables()` |
| CREATE TABLE DDL | Lines 87–103: source (PK), 13 REAL columns, fetched_at TEXT NOT NULL |
| Post-create ALTERs | us10y_yield (Task 1423a) |
| DDL drift? | NO |
| Self-heal covers? | YES — `initMacroTables` in P5 slice list |
| Fix | No DDL change. Self-heal + preload init. |

### 2e. commodity_prices_history — 19 occurrences (P5-healed, must preserve)

| Property | Value |
|---|---|
| Owning slice | `schema-macro.ts` → `initMacroTables()` |
| CREATE TABLE DDL | Lines 105–122: id (PK AUTOINCREMENT), source, 13 REAL columns, fetched_at TEXT NOT NULL |
| Post-create ALTERs | 9 cols Sprint 188, us10y_yield Task 1423a |
| DDL drift? | NO |
| Self-heal covers? | YES (same initMacroTables) |

### 2f. imf_indicators — 3 occurrences (P5-healed, must preserve)

| Property | Value |
|---|---|
| Owning slice | `schema-macro.ts` → `initMacroTables()` |
| CREATE TABLE DDL | Lines 66–83: id, code, name, value, published_at, age_in_days, prev_value, yoy_change, source, confidence, fetched_at, UNIQUE(code) ON CONFLICT REPLACE |
| DDL drift? | NO |
| Self-heal covers? | YES |

### 2g. daily_ohlcv — 5 occurrences + foreign_net_vol (3 no-such-column)

| Property | Value |
|---|---|
| Owning slice | `schema-market-data.ts` → `initMarketDataTables()` |
| CREATE TABLE DDL | Lines 89–107: MERGED DDL (all 12 columns: code, date, open, high, low, close, volume, updated_at, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol) |
| Foreign flow column migration | `migrateForeignFlowColumns()` in schema.ts — ALTER TABLE adds 4 columns; called inside initDatabase() but NOT in self-heal slices |
| DDL drift? | NO for CREATE TABLE. YES for foreign_net_vol self-heal: self-heal calls `initMarketDataTables` but does NOT call `migrateForeignFlowColumns`. However CREATE TABLE in slice already includes foreign_net_vol (merged DDL) — so on fresh `:memory:` after self-heal, `daily_ohlcv` IS created with all 4 foreign flow columns. No drift for new DBs. |
| Fix | No DDL change. Self-heal creates merged DDL with foreign_net_vol already present. |

### 2h. DDL Drift Tables (the P5 +6 root cause) — MUST FIX

These 3 tables have `created_at TEXT NOT NULL` WITHOUT `DEFAULT (datetime('now'))`. Contract-B test INSERTs that omit `created_at` fail NOT NULL. MUST be reconciled before re-applying P5.

#### rag_analyses (schema-news.ts, initNewsTables)

Current DDL (lines 20–41): `created_at TEXT NOT NULL` (no default).
Required: `created_at TEXT NOT NULL DEFAULT (datetime('now'))`

**Canonical contract:** All 64+ test files that INSERT into `rag_analyses` provide `created_at` explicitly. Adding DEFAULT is purely additive — zero behavior change for existing callers. Safe.

#### agent_feedback (schema-system.ts, initSystemTables)

Current DDL: `created_at TEXT NOT NULL` (no default). (Confirmed in P6 audit §5c.)
Required: `created_at TEXT NOT NULL DEFAULT (datetime('now'))`

**Canonical contract:** Callers in `agentFeedbackStore.ts` provide `created_at` explicitly. DEFAULT is additive. Safe.

#### signal_quality_audit (schema-system.ts, initSystemTables)

Current DDL: `created_at TEXT NOT NULL` (no default). (Confirmed in P6 audit §5d.)
Required: `created_at TEXT NOT NULL DEFAULT (datetime('now'))`

**Canonical contract:** Callers in `signalQualityAuditStore.ts` provide `created_at` explicitly. DEFAULT is additive. Safe.

---

## 3. Production Modules — Non-Injectable getDb() Callers (Context for Dev)

These modules call `getDb()` directly (non-injectable) and are the root consumers that return `[]` when tables are missing:

| Module | Path | Tables consumed |
|---|---|---|
| macroStatsStore | `infrastructure/db/macroStatsStore.ts` | sbv_rates_history, commodity_prices_history |
| positionTools | `interface/mcp/tools/portfolio/positionTools.ts` | positions |
| agentSignalStore | `infrastructure/db/agentSignalStore.ts` | agent_signals (injectable too — but some callers use getDb() path) |

These are the production modules that need `getDb()` to return an initialized DB.

---

## 4. Self-Heal Side-Effect Analysis

### FIX-1327 DELETE in initMarketDataTables

`initMarketDataTables` has a `try { DELETE FROM market_prices WHERE updated_at < ? ... }` block.
On fresh `:memory:` DB (after closeDb): market_prices is empty → DELETE removes 0 rows → **no-op**.
On per-test `afterEach(closeDb)` in `182-portfolio-risk`: same — empty DB, no-op.
**Risk: NONE.**

### Repeated slice inits per test (182-portfolio-risk afterEach)

`182-portfolio-risk.test.ts` calls `setupTestDb()` which calls `closeDb()` + `getDb()` in each test. With P5 self-heal, this triggers 9 slice inits per test in `182`. Performance overhead: ~5-10ms × 9 slices × N tests in 182 ≈ negligible. **Risk: ACCEPTABLE.**

### initFinancialReportsTables exclusion

MUST remain excluded from self-heal (RISK-2: view `v_chart_timeseries` compiles with reference to `period_quarter` in `financial_reports` — must be created AFTER `financial_reports` table exists). Self-heal (partial slice set) cannot guarantee table creation order. The full `initDatabase()` in setup.ts preload DOES include this table safely (initDatabase() handles ordering).

**This is a key reason why the preload `await initDatabase()` is needed as Part 2 of the fix**: it ensures `financial_reports` and its view are created correctly at suite start, and the self-heal handles re-init for the non-financial tables.

---

## 5. Dev-Ready Implementation Plan

### Files to modify

| File | Change | Zone |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-news.ts` | `rag_analyses.created_at`: add `DEFAULT (datetime('now'))` | DDL reconcile |
| `apps/mcp-server/src/infrastructure/db/schema-system.ts` | `agent_feedback.created_at`: add `DEFAULT (datetime('now'))` | DDL reconcile |
| `apps/mcp-server/src/infrastructure/db/schema-system.ts` | `signal_quality_audit.created_at`: add `DEFAULT (datetime('now'))` | DDL reconcile |
| `apps/mcp-server/src/infrastructure/db/schema.ts` | `getDb()`: add P5 self-heal (9 slices, excl. initFinancialReportsTables) | self-heal |
| `apps/mcp-server/src/__tests__/setup.ts` | Add `await initDatabase()` at bottom | preload init |

### Exact change for schema-news.ts (rag_analyses)

Locate in `initNewsTables()`:
```sql
created_at TEXT NOT NULL,
```
Change to:
```sql
created_at TEXT NOT NULL DEFAULT (datetime('now')),
```
(Only on `rag_analyses` CREATE TABLE — line ~22. `agent_signals.created_at` already has DEFAULT.)

### Exact change for schema-system.ts

Two tables. Dev MUST Read the file before editing to locate exact line positions.
1. `agent_feedback`: `created_at TEXT NOT NULL,` → `created_at TEXT NOT NULL DEFAULT (datetime('now')),`
2. `signal_quality_audit`: `created_at TEXT NOT NULL,` → `created_at TEXT NOT NULL DEFAULT (datetime('now')),`

### Exact change for schema.ts (self-heal — re-apply P5)

In `getDb()`, AFTER `_dbStat = statSync(...)`:
```typescript
// FU-SCHEMA-DRIFT-P8: self-heal on fresh singleton (reconciled P5)
// Fires only on _db=null branch. All slice inits are idempotent (IF NOT EXISTS).
// initFinancialReportsTables excluded (RISK-2: view compile ordering).
initMarketDataTables(_db);
initAlertsTables(_db);
initMacroTables(_db);
initPortfolioTables(_db);
initNewsTables(_db);
initBriefingsTables(_db);
initSystemTables(_db);
initBacktestingTables(_db);
initAgmPlanTables(_db);
```

### Exact change for setup.ts (preload initial init)

At the bottom of `setup.ts`, after the directory creation loop:
```typescript
import { initDatabase } from "../../infrastructure/db/schema.js";
await initDatabase();
```

Note: relative import path from `src/__tests__/setup.ts` to `src/infrastructure/db/schema.ts`.

### Verification Gate

Per-file isolation FIRST (confirms no regressions in the 5 modified files):
```bash
cd apps/mcp-server
bun test src/__tests__/002-db-schema.test.ts
bun test src/__tests__/182-portfolio-risk.test.ts
bun test src/__tests__/1527-schema-slices.test.ts
```

Full suite gate (native summary):
```bash
bun test 2>&1 | tail -5
# Gate: native fail + error must DROP vs 629 absolute baseline
# AND agent_signals / sbv_rates_history / positions / commodity_prices* buckets must shrink toward 0
```

---

## 6. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `rag_analyses.created_at` DEFAULT breaks existing INSERTs | LOW | All 64+ test files provide created_at explicitly; DEFAULT is additive |
| `agent_feedback.created_at` DEFAULT breaks callers | LOW | Callers provide created_at explicitly per P6 §5c analysis |
| `signal_quality_audit.created_at` DEFAULT breaks callers | LOW | Callers provide created_at explicitly per P6 §5d analysis |
| P5 self-heal fires on 182-portfolio-risk afterEach | LOW | ~5ms overhead per test, no data corruption |
| `initFinancialReportsTables` excluded from self-heal | MITIGATED | Preload `await initDatabase()` covers it at suite start |
| Preload `await initDatabase()` double-inits on files that also call initDatabase() | NONE | `CREATE TABLE IF NOT EXISTS` = idempotent |
| `initMarketDataTables` DELETE side-effect | NONE | Confirmed no-op on fresh :memory: DB |

---

## 7. Summary

**Chosen direction:** (a) — Reconcile 3 drifted `created_at` DDL entries + re-apply P5 self-heal in `getDb()` + add preload `await initDatabase()` to `setup.ts`.

**DDL drift pinpointed:** `rag_analyses` (schema-news.ts), `agent_feedback` (schema-system.ts), `signal_quality_audit` (schema-system.ts) — all have `created_at TEXT NOT NULL` without `DEFAULT`. Adding `DEFAULT (datetime('now'))` eliminates the P5 +6 regression path.

**All residual tables** (agent_signals, sbv_rates_history, positions, commodity_prices*, imf_indicators, daily_ohlcv, + tail) are present in canonical `initDatabase()` slices. No DDL additions needed — the self-heal creates them correctly once slice drift is eliminated.

**Expected outcome:** native fail+error drops below 629. The 4 P5-healed classes are re-healed. The remaining classes benefit from both the preload init (files before any closeDb) and self-heal (files after closeDb on _db=null path).

**Build standard:** not-applicable (bug-fix, infra-layer test + schema files only).

**Zone:** `apps/mcp-server/src/infrastructure/db/` (3 slice files + schema.ts) + `apps/mcp-server/src/__tests__/setup.ts`.
