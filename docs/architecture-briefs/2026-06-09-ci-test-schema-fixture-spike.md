# CI-TEST-SCHEMA-FIXTURE-SPIKE — Architecture Brief

**Date:** 2026-06-09
**Author:** agents-architect
**Status:** COMPLETE — handoff to PM
**Sprint:** CI-RED-RECONCILE
**Task:** CI-TEST-SCHEMA-FIXTURE-SPIKE
**Scope:** `apps/mcp-server/src/__tests__/` (1033 test files, schema-fixture subsystem)
**Timebox:** 120 min — DESIGN ONLY

---

## 0. Context: What the Reverted Batch Did Wrong

Commit `9454baad` (reverted at `a42d0835`) attempted a mechanized sweep that injected
`initNewsTables(db)` / `initMarketDataTables(db)` / `initSystemTables(db)` before every
`return db` in 464 test setup functions. This produced +219 new failures (702 → 921).

The three failure signatures from CI run `27171666087` reveal exactly why a one-size
injection cannot work on a heterogeneous test corpus:

| Class | Count | Signature | Root Mechanism |
|---|---|---|---|
| E1 — Collision | ~32 | `table X already exists` | Test has bare `CREATE TABLE table_name` (no `IF NOT EXISTS`); injected init fn also CREATEs same table → SQLite error |
| E2 — Schema divergence | ~200 | `no such column`, `no such table`, `N columns but M values` | Injected canonical schema ADDS tables or columns the test was not designed against; or test inlines a SUBSET schema missing columns the production code queries |
| E3 — NOT NULL violation | ~32 | `NOT NULL constraint failed: watchlist.exchange`, `agent_signals.expires_at` | Canonical init creates tables with NOT NULL columns that test INSERTs omit |

**Core invariant violated:** 176 test files carry their own partial inline DDL for shared
tables. These files are self-contained by design — they declare only the columns their SUT
needs. Injecting a canonical full-schema init on top either collides (E1) or contradicts (E2, E3).

---

## 1. Inventory of the Divergent Inline Schema Corpus

### 1a. Test isolation modes (1033 files, excluding `setup.ts`)

| Mode | Count | Description |
|---|---|---|
| Pure singleton (no DB init in file) | 494 (47%) | Relies entirely on `Bun.env["DB_PATH"]=":memory:"` from `setup.ts` preload; these tests do NOT call `initDatabase` and do NOT create `new Database` — they import production modules that call `getDb()` internally |
| Isolated inline only | 300 (29%) | `new Database(":memory:")` + inline DDL; never calls `initDatabase`; self-contained |
| Singleton + initDatabase | 181 (17%) | `Bun.env["DB_PATH"]=":memory:"` + `initDatabase()` call; correct idiomatic pattern |
| Hybrid (both) | 58 (5%) | `new Database(":memory:")` as explicit arg AND calls `initDatabase`/`initXxxTables`; transitional files |

### 1b. Tables with the most inline DDL copies (top 6 by collision risk)

| Table | Files with inline CREATE TABLE | Bare (no IF NOT EXISTS) | Missing key column |
|---|---|---|---|
| `watchlist` | 116 | 28 files | 28 missing `exchange`; 17 have `exchange` but without `NOT NULL` |
| `market_prices` | 80 | ~20 files | several missing `exchange TEXT` column added in migration |
| `daily_ohlcv` | 73 | ~10 files | 40 missing `foreign_buy_vol/sell_vol/net_vol/put_through_vol`; 30 missing `updated_at` |
| `rag_analyses` | 64 | ~15 files | 24 missing `source_url`; all miss `data_env` (migration-added column) |
| `market_prices_history` | 50 | ~8 files | several missing `exchange` column |
| `vps_push_log` | 12 | ~3 files | missing 8 observability columns added by Task 1566 |

### 1c. Tables that tests reference but NEVER create inline (causes `no such table`)

These tables exist only via `initDatabase()` and were not present in test DBs when injected:

- `sbv_rates_history` (18 test failures) — defined in `schema-macro.ts`
- `commodity_prices_history` (18) — defined in `schema-macro.ts`
- `positions` (16) — defined in `schema-portfolio.ts`
- `commodity_prices` (5) — defined in `schema-macro.ts`
- `imf_indicators` (3) — defined in `schema-macro.ts`

These tests assume the SUT will only touch tables the test explicitly creates. When the injected
init fn adds these tables, they appear in the schema but the test's INSERT fixtures do not
populate them, causing SUT queries to return unexpected results.

### 1d. The `data_env` migration-column problem (original B2 trigger)

`pollNews.ts::tryInsertEntry` unconditionally INSERTs `data_env` into `rag_analyses`.
The canonical DDL in `schema-news.ts` adds this via a post-CREATE guarded `ALTER TABLE`:

```typescript
try { db.exec("ALTER TABLE rag_analyses ADD COLUMN data_env TEXT"); } catch { }
```

64 test files create `rag_analyses` inline without replicating the ALTER → 
`SQLiteError: table rag_analyses has no column named data_env` on ~93 failures.

This is the original trigger that caused the mechanized injection attempt. The injection
fixed this class but broke two larger classes (E1, E3) in return.

---

## 2. Canonical Fixture Contract

### 2a. Design principle: two-layer fixture model

The schema subsystem must present exactly **two fixture contracts** to test authors.
There must be no third hybrid mode.

**Contract A — Full canonical fixture (for integration-style tests)**

Use when: the test exercises production code paths that call `getDb()` internally (the
494 "pure singleton" files PLUS the 181 "singleton + initDatabase" files).

```typescript
// Pattern (already correct in 181 files):
Bun.env["DB_PATH"] = ":memory:";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

beforeAll(async () => {
  closeDb();
  await initDatabase();
});
afterAll(() => closeDb());
```

`initDatabase()` already uses `CREATE TABLE IF NOT EXISTS` throughout — calling it twice
is safe (test `002-db-schema.test.ts` verifies idempotency). The full canonical schema
including migration guards runs once, all columns present, no divergence.

**Contract B — Minimal explicit fixture (for unit-style tests)**

Use when: the test passes a `db` argument directly to the SUT function (the 300
"isolated inline only" files and most of the 58 "hybrid" files).

```typescript
// Pattern — self-contained, no canonical schema import:
import { Database } from "bun:sqlite";

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = OFF"); // relax FKs for isolation
  // Only the tables/columns this test's SUT actually needs
  db.exec(`CREATE TABLE IF NOT EXISTS watchlist (
    code TEXT PRIMARY KEY,
    exchange TEXT NOT NULL DEFAULT 'HOSE',
    -- ... only the columns the SUT reads/writes
  )`);
  return db;
}
```

**The key invariant:** Contract B files MUST use `CREATE TABLE IF NOT EXISTS` (never
bare `CREATE TABLE`) and MUST include every column that the SUT's INSERT/SELECT touches
for the test's code path. The "minimal" means: minimal surface, not missing columns.

### 2b. Single Source of Truth for canonical schema

The canonical schema is already correctly structured as a composable set of init functions
in `apps/mcp-server/src/infrastructure/db/`:

```
schema.ts                  — public API: initDatabase(), getDb(), closeDb()
schema-market-data.ts      — initMarketDataTables()
schema-financial-reports.ts — initFinancialReportsTables()
schema-news.ts             — initNewsTables()
schema-alerts.ts           — initAlertsTables()
schema-portfolio.ts        — initPortfolioTables()
schema-briefings.ts        — initBriefingsTables()
schema-macro.ts            — initMacroTables()
schema-system.ts           — initSystemTables()
```

The SSOT is `schema.ts::initDatabase()` — the one function that calls all slices in
order, idempotent, migration-safe. Tests wanting the full canonical schema import ONLY
from `schema.ts` (Contract A). Tests wanting isolation never import from any schema file
(Contract B).

**No per-slice injection pattern.** The reverted commit's "safe targeted guards"
(`initNewsTables` + `initMarketDataTables` + `initSystemTables` only) failed because
even these safe guards collide with inline DDLs that are NOT IF NOT EXISTS or are
deliberately narrower than the canonical slice.

### 2c. Idempotency guarantee

`initDatabase()` is already idempotent (verified by `002-db-schema.test.ts` lines 36-41).
Contract A tests that call it in `beforeAll` and again in `beforeEach` are safe. The one
known non-idempotent risk is the `v_chart_timeseries` / `v_yoy_comparison` VIEW that
references `period_quarter` from `financial_reports`. The view uses `CREATE VIEW IF NOT
EXISTS` — it is safe. No regression from calling `initDatabase()` multiple times per
test process.

---

## 3. Migration / Rollout Plan

This plan is ordered to produce CI improvement in each phase without breaking currently
passing tests.

### Phase 1 — Fix the original B2 trigger (data_env) without injection

**Target:** the 64 test files with inline `rag_analyses` DDL missing `data_env`.

**Approach:** Add `data_env TEXT` to the inline `CREATE TABLE IF NOT EXISTS rag_analyses`
block in each of the 64 files. Do NOT replace inline DDL with `initNewsTables(db)` calls
(that would be a Contract A/B boundary violation for unit-style tests).

Also: first verify that `pollNews.ts::tryInsertEntry` has a fallback guard for
`data_env` absence (the `fredApi.ts` pattern already shows the correct `try/catch` fallback).
If `pollNews.ts` lacks this guard, add it — this is the production-side fix that breaks
the tight coupling between production INSERT and test DDL exhaustively.

**Expected impact:** ~93 failures resolved.

**Files to modify:** 64 test files (enumerated below in §4) + potentially `pollNews.ts`
for the production-side guard.

**Constraint:** Do NOT touch the 40 files that already have `data_env` in their inline DDL.

### Phase 2 — Harden inline DDLs to IF NOT EXISTS

**Target:** 33 test files with bare `CREATE TABLE table_name` (no `IF NOT EXISTS`).

**Approach:** Mechanical search-replace: `CREATE TABLE watchlist` → `CREATE TABLE IF NOT
EXISTS watchlist` (and same for each of the 5 collision tables). This makes the file
resilient to future schema guard injections without requiring a broader refactor.

**Expected impact:** Eliminates the E1 "already exists" class (~32 failures) for any future
injection attempt.

**Files to modify:** 33 test files.

### Phase 3 — Fill missing columns in Contract B inline DDLs

**Target:** Test files where the SUT function reads a column the inline DDL omits.

**Approach:** Per-failure-class, targeted column additions:

a. **`watchlist.exchange NOT NULL`** (27 failures): Add `exchange TEXT NOT NULL DEFAULT 'HOSE'`
   to 28 test files that create `watchlist` without `exchange`.

b. **`agent_signals.expires_at NOT NULL`** (5 failures): Add `expires_at TEXT NOT NULL
   DEFAULT (datetime('now', '+1 hour'))` to all inline `agent_signals` DDLs missing it.

c. **`daily_ohlcv` column mismatch** (9 "has N columns but M values" failures): These are
   tests that INSERT with positional columns (no explicit column list) against a narrow
   inline DDL. Fix: add explicit column list to the INSERT statements in these tests, or
   add the missing columns to the inline DDL. Prefer explicit column lists — they are
   future-proof against canonical schema additions.

d. **`source_url` in `rag_analyses`** (63 failures): Add `source_url TEXT` to the 24 inline
   `rag_analyses` DDLs missing it.

**Expected impact:** ~104 failures resolved.

### Phase 4 — Migrate "pure singleton" tests to Contract A

**Target:** The 494 pure-singleton files that rely on `Bun.env["DB_PATH"]=":memory:"` from
`setup.ts` preload but do NOT call `initDatabase()`.

**Current state:** These tests work IFF the production module they import internally calls
`getDb()` after DB_PATH is set AND the module also calls some init function. If the module
does NOT call init, the singleton DB has no tables — these tests are silently relying on
import side-effects.

**Approach:** Audit by running the pure-singleton files in isolation (without the full suite's
shared process state). Files that fail in isolation need `initDatabase()` added to their
`beforeAll`. Files that pass in isolation already call init via their imported module.

**This is Phase 4 because it requires per-file verification, not a mechanical sweep.** It
is NOT a blocker for the other three phases. Include in a separate FIX task scoped to
`dev-infrastructure`.

### Phase 5 — Migrate high-risk Contract B files to Contract A (OPTIONAL / low-priority)

For the 58 hybrid files: verify whether the test would pass under full Contract A. If yes,
migrate. This is cosmetic debt reduction, not a blocker. Defer unless a specific test fails.

---

## 4. Per-Failure-Class Dev-Actionable Spec

### FIX-CLASS-E1: "table X already exists" (~32 failures)

**Cause:** Bare `CREATE TABLE table_name` (no `IF NOT EXISTS`) in 33 test setup functions.
When any future schema guard injection adds the same table, SQLite throws.

**Dev action:** Mechanical search-replace in 33 files.

**Enumerate with:**
```bash
python3 -c "
import re, os
test_dir = 'apps/mcp-server/src/__tests__'
for f in sorted(os.listdir(test_dir)):
    if not f.endswith('.ts') or f == 'setup.ts': continue
    content = open(os.path.join(test_dir, f)).read()
    for t in ['watchlist', 'rag_analyses', 'market_prices', 'vps_push_log', 'market_prices_history', 'daily_ohlcv']:
        if re.search(r'CREATE TABLE\s+' + t + r'\b', content, re.IGNORECASE):
            if not re.search(r'CREATE TABLE\s+IF\s+NOT\s+EXISTS\s+' + t + r'\b', content, re.IGNORECASE):
                print(f, '->', t); break
"
```

**Pattern fix:** `s/CREATE TABLE (watchlist|rag_analyses|market_prices|vps_push_log|market_prices_history|daily_ohlcv)/CREATE TABLE IF NOT EXISTS \1/g`

**Owner:** `dev-infrastructure`
**Risk:** Minimal — pure test-file change, no production code.
**Rollback:** Revert single file if a test relies on the error being thrown (unlikely).

---

### FIX-CLASS-E2a: "no such column: data_env" (~93 failures)

**Cause:** 64 test files create `rag_analyses` inline without `data_env`. Production
`pollNews.ts::tryInsertEntry` always INSERTs `data_env`.

**Dev action — Two-part fix:**

Part 1 (production-side, prevents future recurrence): Add a `try/catch` fallback to
`pollNews.ts::tryInsertEntry` identical to the existing pattern in `fredApi.ts:189-202`:

```typescript
// In pollNews.ts — tryInsertEntry:
try {
  db.prepare(`INSERT INTO rag_analyses (..., data_env) VALUES (..., ?)`).run(..., dataEnv);
} catch (err: any) {
  if (!String(err?.message ?? "").includes("data_env")) throw err;
  // Fallback: insert without data_env for test DBs and older schemas
  db.prepare(`INSERT INTO rag_analyses (...) VALUES (...)`).run(...);
}
```

Part 2 (test-side, cleanup): Add `data_env TEXT` to the `CREATE TABLE IF NOT EXISTS
rag_analyses` block in all 64 inline-DDL test files.

**Enumerate with:**
```bash
grep -rl "CREATE TABLE.*rag_analyses\|IF NOT EXISTS.*rag_analyses" \
  apps/mcp-server/src/__tests__/ | xargs grep -L "data_env"
```

**Owner:** `dev-infrastructure`
**Risk:** Low for Part 2 (additive column). Medium for Part 1 (production code path — verify
the fallback INSERT is column-list explicit and matches the actual rag_analyses schema).

---

### FIX-CLASS-E2b: "no such column: source_url" (63 failures) / "no such column: level" (90 failures)

**Cause:** 24 test files create `rag_analyses` without `source_url`. The canonical schema
has `source_url TEXT` and a `CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url ON
rag_analyses(source_url)`. The SUT queries this column.

**Dev action:** Add `source_url TEXT UNIQUE` to the inline `CREATE TABLE IF NOT EXISTS
rag_analyses` in the 24 files.

**Enumerate with:**
```bash
python3 -c "
import re, os
test_dir = 'apps/mcp-server/src/__tests__'
for f in sorted(os.listdir(test_dir)):
    if not f.endswith('.ts') or f == 'setup.ts': continue
    content = open(os.path.join(test_dir, f)).read()
    blocks = re.findall(r'CREATE TABLE[^;]+?rag_analyses[^;]+?;', content, re.DOTALL|re.IGNORECASE)
    for b in blocks:
        if 'source_url' not in b: print(f); break
"
```

Note: `level` failures (90) may be the same files if the test DDL also omits `level`. The
canonical `rag_analyses` has `level TEXT NOT NULL`. Verify per-file whether `level` is in
the inline DDL; if not, add both `source_url TEXT UNIQUE` and ensure `level TEXT NOT NULL
DEFAULT 'action'`.

**Owner:** `dev-infrastructure`
**Risk:** Low — additive column in inline DDL.

---

### FIX-CLASS-E2c: "daily_ohlcv has N columns but M values" (9 failures)

**Cause:** Test INSERTs use positional syntax (no explicit column list) against a narrow
inline DDL that has fewer columns than the canonical schema. When production code calls
the same INSERT pattern (or when init adds columns later), the position count mismatches.

**Dev action:** Replace positional INSERT syntax with named-column explicit syntax in all
9 affected tests:

```typescript
// Before (fragile — position-dependent):
db.prepare("INSERT INTO daily_ohlcv VALUES (?, ?, ?, ?, ?, ?)").run(...)

// After (robust — order-independent):
db.prepare(`INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...)
```

**Enumerate with:** search CI log run `27171666087` for `"has N columns but M values"` errors,
or grep: `grep -rn "INSERT INTO daily_ohlcv VALUES" apps/mcp-server/src/__tests__/`

**Owner:** `dev-infrastructure`
**Risk:** Low — test-only change. Explicit column lists are also more readable.

---

### FIX-CLASS-E3a: "NOT NULL constraint: watchlist.exchange" (27 failures)

**Cause:** 28 test files create `watchlist` without `exchange` column. Canonical schema:
`exchange TEXT NOT NULL`. When production code INSERTs a watchlist row without providing
`exchange`, the NOT NULL constraint fails.

**Dev action:** Add `exchange TEXT NOT NULL DEFAULT 'HOSE'` to all 28 inline `watchlist`
DDL blocks missing the column.

**Enumerate with:**
```bash
python3 -c "
import re, os
test_dir = 'apps/mcp-server/src/__tests__'
for f in sorted(os.listdir(test_dir)):
    if not f.endswith('.ts') or f == 'setup.ts': continue
    content = open(os.path.join(test_dir, f)).read()
    blocks = re.findall(r'CREATE TABLE[^;]+?watchlist[^;]+?;', content, re.DOTALL|re.IGNORECASE)
    for b in blocks:
        if 'exchange' not in b: print(f); break
"
```

**Owner:** `dev-infrastructure`
**Risk:** Low — adding a column with DEFAULT. Verify no test explicitly asserts the
watchlist DDL structure (only `002-db-schema.test.ts` does this, and it uses `initDatabase()`
not inline DDL).

---

### FIX-CLASS-E3b: "NOT NULL constraint: agent_signals.expires_at" (5 failures)

**Cause:** Inline `agent_signals` DDL in some test files omits `expires_at TEXT NOT NULL`.
Production writes to `agent_signals` always provide `expires_at`.

**Dev action:** Add `expires_at TEXT NOT NULL DEFAULT (datetime('now', '+1 hour'))` to
inline `agent_signals` DDL in the affected test files.

**Enumerate with:**
```bash
python3 -c "
import re, os
test_dir = 'apps/mcp-server/src/__tests__'
for f in sorted(os.listdir(test_dir)):
    if not f.endswith('.ts') or f == 'setup.ts': continue
    content = open(os.path.join(test_dir, f)).read()
    blocks = re.findall(r'CREATE TABLE[^;]+?agent_signals[^;]+?;', content, re.DOTALL|re.IGNORECASE)
    for b in blocks:
        if 'expires_at' not in b: print(f); break
"
```

**Owner:** `dev-infrastructure`

---

### FIX-CLASS-E2d: "no such table: sbv_rates_history / commodity_prices_history / positions" (52 failures)

**Cause:** Tests that import production modules which join across macro/portfolio tables.
The SUT calls these tables but the test only creates the "primary" table inline.

**Dev action:** Per affected test file, identify which missing table the SUT queries and
add a minimal DDL for it. Use `CREATE TABLE IF NOT EXISTS` with only the columns the
SUT's query path touches.

**This is NOT a case for injecting `initMacroTables()` wholesale** — that would add 15+
tables and all their migration guards into a unit test context.

**Enumerate with:**
```bash
# Run individual test files and capture "no such table" errors:
for f in apps/mcp-server/src/__tests__/*.test.ts; do
  bun test "$f" 2>&1 | grep "no such table" | sed "s|^|$f: |"
done 2>/dev/null | head -60
```

**Owner:** `dev-infrastructure`
**Risk:** Medium — requires per-file understanding of what the SUT queries.

---

## 5. DDD Risk Flags

**RISK-1 — Inline DDL as structural debt (HIGH — recurring pattern)**

The root cause of all three failure classes is structural: 176 test files maintain a
parallel, manually-curated copy of production schema. Each schema migration (new column,
new table, new NOT NULL constraint) has a non-zero probability of breaking these files.
The 9454baad injection attempt was a symptom of this debt accumulating to a breaking point.

**Durable fix:** After completing Phases 1-3, enforce a linting rule:
```
// scripts/lint/no-inline-ddl.ts (new)
// Rule: test files must not contain CREATE TABLE statements for tables that exist
// in apps/mcp-server/src/infrastructure/db/schema*.ts
// Exception: tables declared ONLY in that test file (true test-local tables)
```

This lint rule makes the debt visible at the point of introduction rather than at CI failure time.

**RISK-2 — `initDatabase()` view compile risk (MEDIUM — known, mitigated)**

The reverted commit's "safe targeted guards" pattern (avoiding full `initDatabase()`) was
a response to a real concern: `v_chart_timeseries` and `v_yoy_comparison` reference
`period_quarter` from `financial_reports`. If a test creates `financial_reports` with a
narrow DDL missing `period_quarter`, calling `initFinancialReportsTables()` would fail on
the VIEW creation.

However, this concern does NOT apply when using Contract A (`initDatabase()` exclusively)
because: (a) `initDatabase()` creates `financial_reports` with the full canonical DDL
first, then creates the views; (b) tests using Contract A do not create their own
`financial_reports` DDL.

The concern DOES apply to any future attempt to inject `initFinancialReportsTables()` into
Contract B tests. Document explicitly: **never inject `initFinancialReportsTables()` into
a test that has its own inline `financial_reports` DDL.**

**RISK-3 — `pure_singleton` mode hidden dependency (MEDIUM)**

494 pure-singleton files depend on production module imports calling `getDb()` internally,
which in turn uses the `Bun.env["DB_PATH"]=":memory:"` singleton. If ANY module these tests
import does NOT call `initDatabase()` before the test's first DB operation, the tables will
be absent. This is currently masked by the order in which Bun loads modules across the test
suite (process-level module cache shares the singleton DB state).

**Action (Phase 4):** Run each pure-singleton file in strict isolation (`bun test --bail
<single-file>`) to verify it passes. Files that fail in isolation need `initDatabase()` added.

**RISK-4 — Future column additions break Contract B tests (ONGOING)**

Every schema migration that adds a new column with `NOT NULL` and no DEFAULT is a potential
E3-class failure waiting to happen in Contract B test files. The structural fix is:

1. Prefer `NOT NULL DEFAULT <safe-value>` over plain `NOT NULL` for new columns unless the
   domain invariant strictly requires it.
2. When `NOT NULL` without DEFAULT is truly required, update ALL inline DDLs for that table
   in the same commit (use the enumeration patterns above). The CI gate must block if
   `bun tsc --noEmit` fails on the test files.

---

## 6. BUILD-STANDARD Classification

**BUG-FIX / STRUCTURAL DEBT REDUCTION** — no new interfaces, no new tables, no new services.

```
BUILD-STANDARD: not-applicable
```

All changes are confined to `apps/mcp-server/src/__tests__/` (test files) and two
production-side defensive guards (`pollNews.ts` fallback). No new DDD layer boundaries crossed.

---

## 7. Files Summary

### To create (new)
| File | Purpose |
|---|---|
| `scripts/lint/no-inline-ddl.ts` | Lint rule to detect new inline DDL for canonical tables |

### To modify (test files — existing)
| Set | Count | Change |
|---|---|---|
| 33 files with bare `CREATE TABLE` (no IF NOT EXISTS) | 33 | Add `IF NOT EXISTS` (Phase 2) |
| `rag_analyses` inline DDL missing `data_env` | 64 | Add `data_env TEXT` (Phase 1) |
| `rag_analyses` inline DDL missing `source_url` | 24 | Add `source_url TEXT UNIQUE` (Phase 3) |
| `watchlist` inline DDL missing `exchange` | 28 | Add `exchange TEXT NOT NULL DEFAULT 'HOSE'` (Phase 3) |
| `daily_ohlcv` positional INSERT | ~9 | Replace with named-column INSERT (Phase 3) |
| `agent_signals` missing `expires_at` | ~5 | Add `expires_at TEXT NOT NULL DEFAULT ...` (Phase 3) |
| "no such table" macro/portfolio tables | ~15 files | Add minimal inline DDL for the specific missing table (Phase 3) |

### To modify (production code — minimal)
| File | Change |
|---|---|
| `apps/mcp-server/src/interface/mcp/tools/news-analysis/pollNews.ts` (or equivalent insertion path) | Add `try/catch` fallback guard for `data_env` column absence (Phase 1, Part 1) |

### Zero changes to
- All files in `apps/mcp-server/src/infrastructure/db/schema*.ts` — canonical schema is correct
- All files in `apps/mcp-server/src/infrastructure/` (except `pollNews.ts` guard)
- `apps/mcp-server/src/__tests__/setup.ts` — preload is correct
- `.github/workflows/ci.yml` — CI config is separate concern

---

## 8. Rollout Safety Checklist

Before each phase ships:

1. Run `bun tsc --noEmit` — must be clean
2. Run the specific test files being modified in isolation (`bun test <file>`) — must pass
3. Run the full suite in a CI-like environment and verify fail count does not INCREASE
4. Record before/after fail counts in the commit message

**NEVER ship a phase that increases total CI failure count.** The 9454baad lesson: local
per-file verification is insufficient — the injection fixed the targeted files but broke
176 other files in the same process run.

---

## 9. PO Task Scoping Recommendation

Recommend three separate FIX tasks for PM decomposition:

| Task ID (proposed) | Phase | Size | Owner | Expected Delta |
|---|---|---|---|---|
| `FIX-SCHEMA-DRIFT-P1` | Phase 1 — data_env fix (64 files + pollNews guard) | M | dev-infrastructure | ~93 failures → 0 |
| `FIX-SCHEMA-DRIFT-P2` | Phase 2 + 3 — IF NOT EXISTS + missing columns | L | dev-infrastructure | ~104 failures → 0 |
| `FIX-SCHEMA-DRIFT-P4` | Phase 4 — pure-singleton isolation audit | M | dev-infrastructure | unknown count |

All three are test-only or minimal production defensive guards. None require DDD layer
changes. All are safe to run in parallel with other CI-RED-RECONCILE tasks.

---

*Brief authored by: agents-architect*
*Task: CI-TEST-SCHEMA-FIXTURE-SPIKE*
*Handoff: PO (brief_complete signal) → PM for task decomposition*
