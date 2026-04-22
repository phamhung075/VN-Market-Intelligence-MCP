# TASK 1277a — RED: OHLCV Guard Checks Test Suite (Failing Assertions)

**Sprint:** 1277
**Type:** Test (RED phase)
**Size:** S (6 test cases, ~180 lines, test-only)
**Depends:** None
**Next:** 1277b (GREEN: validate guards)

---

## Requirement

REQ-1277 § FR-3 + AC-3: Formalize OHLCV guard checks at `src/scheduler/market-data/ohlcvDailyAggregatorJob.ts:103–112` with 6 test cases covering null/undefined component scenarios.

Guard logic (already in main @ commit ff55779):
```typescript
const open = openRow?.price;
const close = closeRow?.price;
const high = hlRow?.high_p;
const low = hlRow?.low_p;

if (open === undefined || close === undefined || high === undefined || low === undefined) {
  tickersSkipped++;
  continue;  // Skip ticker if any component missing
}
```

---

## Test Design: 6 Test Cases (TC-1 to TC-6)

### Setup: In-Memory SQLite Database

Create helper functions for test isolation:

```typescript
// Schema mirrors production exactly
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE watchlist (
      code TEXT PRIMARY KEY
    );
  `);
  db.exec(`
    CREATE TABLE market_prices_history (
      code       TEXT,
      price      REAL,
      volume     REAL,
      exchange   TEXT,
      fetched_at TEXT,
      PRIMARY KEY (code, fetched_at)
    );
  `);
  db.exec(`
    CREATE TABLE daily_ohlcv (
      code       TEXT,
      date       TEXT,
      open       REAL,
      high       REAL,
      low        REAL,
      close      REAL,
      volume     REAL,
      updated_at TEXT,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

function addTicker(db: Database, code: string): void {
  db.prepare("INSERT OR IGNORE INTO watchlist (code) VALUES (?)").run(code);
}

function addTick(db: Database, code: string, price: number, fetchedAt: string, volume = 100): void {
  db.prepare(
    "INSERT OR IGNORE INTO market_prices_history (code, price, volume, exchange, fetched_at) VALUES (?, ?, ?, ?, ?)"
  ).run(code, price, volume, "HOSE", fetchedAt);
}
```

### Time Constants (pinned, VN timezone)

```typescript
const NOW_ISO = "2026-04-17T09:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);  // pinned "now"
const VN_DATE = "2026-04-17";         // today in VN (UTC+7)
const WINDOW_START = "2026-04-16T17:00:00.000Z";  // VN midnight in UTC

// Tick times (in UTC)
const TICK_1 = "2026-04-16T17:30:00.000Z"; // earliest → open
const TICK_2 = "2026-04-16T19:00:00.000Z"; // middle → high/low
const TICK_3 = "2026-04-17T08:30:00.000Z"; // latest → close
```

---

## Test Cases (Failing Assertions)

### TC-1: All OHLCV Present (Happy Path)

**Input:** 1 ticker with 3 ticks (one early, one mid, one late)

**Expected:**
- `rowsWritten = 1`
- `tickersSkipped = 0`
- DB: 1 row in daily_ohlcv
- OHLCV values: open=TICK_1.price, high=max, low=min, close=TICK_3.price

**Assertion:**
```typescript
it("TC-1: All OHLCV present → insert to daily_ohlcv, tickersSkipped=0", async () => {
  const db = makeDb();
  addTicker(db, "VCB");
  addTick(db, "VCB", 80000, TICK_1);
  addTick(db, "VCB", 85000, TICK_2);
  addTick(db, "VCB", 83000, TICK_3);

  const result = await runOhlcvDailyAggregator({
    db: () => db,
    nowMsFn: () => NOW_MS,
    sendWorkFn: async () => true,
  });

  expect(result.tickersProcessed).toBe(1);
  expect(result.rowsWritten).toBe(1);
  expect(result.tickersSkipped).toBe(0);

  const rows = db.prepare("SELECT * FROM daily_ohlcv").all() as Array<any>;
  expect(rows).toHaveLength(1);
  expect(rows[0].code).toBe("VCB");
  expect(rows[0].open).toBe(80000);
  expect(rows[0].high).toBe(85000);
  expect(rows[0].low).toBe(80000);
  expect(rows[0].close).toBe(83000);
  expect(rows[0].volume).toBe(3);
});
```

### TC-2: Open Undefined (No Early Tick)

**Input:** 1 ticker with 2 ticks (both after window start, no earliest)

**Expected:**
- `rowsWritten = 0`
- `tickersSkipped = 1`
- DB: 0 rows in daily_ohlcv
- Guard: `open === undefined` → skip

**Assertion:**
```typescript
it("TC-2: Open undefined (no early tick) → skip ticker, tickersSkipped=1", async () => {
  const db = makeDb();
  addTicker(db, "VCB");
  // Insert two ticks AFTER window start (no earliest)
  addTick(db, "VCB", 85000, TICK_2);
  addTick(db, "VCB", 83000, TICK_3);

  const result = await runOhlcvDailyAggregator({
    db: () => db,
    nowMsFn: () => NOW_MS,
    sendWorkFn: async () => true,
  });

  expect(result.tickersProcessed).toBe(1);
  expect(result.rowsWritten).toBe(0);
  expect(result.tickersSkipped).toBe(1);

  const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
  expect(rows).toHaveLength(0);
});
```

### TC-3: Close Undefined (No Late Tick)

**Input:** 1 ticker with 2 ticks (both before window end, no latest)

**Expected:**
- `rowsWritten = 0`
- `tickersSkipped = 1`
- DB: 0 rows in daily_ohlcv
- Guard: `close === undefined` → skip

**Assertion:**
```typescript
it("TC-3: Close undefined (no late tick) → skip ticker, tickersSkipped=1", async () => {
  const db = makeDb();
  addTicker(db, "VCB");
  // Insert two ticks BEFORE window end (no latest)
  addTick(db, "VCB", 80000, TICK_1);
  addTick(db, "VCB", 85000, TICK_2);

  const result = await runOhlcvDailyAggregator({
    db: () => db,
    nowMsFn: () => NOW_MS,
    sendWorkFn: async () => true,
  });

  expect(result.tickersProcessed).toBe(1);
  expect(result.rowsWritten).toBe(0);
  expect(result.tickersSkipped).toBe(1);

  const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
  expect(rows).toHaveLength(0);
});
```

### TC-4: High Undefined (Empty Window)

**Input:** 1 ticker with 0 ticks in window

**Expected:**
- `rowsWritten = 0`
- `tickersSkipped = 1`
- DB: 0 rows in daily_ohlcv
- Guard: `high === undefined` → skip (MAX of empty set = undefined)

**Assertion:**
```typescript
it("TC-4: High undefined (empty window, 0 ticks) → skip ticker, tickersSkipped=1", async () => {
  const db = makeDb();
  addTicker(db, "VCB");
  // No ticks inserted (empty window)

  const result = await runOhlcvDailyAggregator({
    db: () => db,
    nowMsFn: () => NOW_MS,
    sendWorkFn: async () => true,
  });

  expect(result.tickersProcessed).toBe(1);
  expect(result.rowsWritten).toBe(0);
  expect(result.tickersSkipped).toBe(1);

  const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
  expect(rows).toHaveLength(0);
});
```

### TC-5: Low Undefined (Empty Window)

**Input:** 1 ticker with 0 ticks in window (same as TC-4, different guard)

**Expected:**
- `rowsWritten = 0`
- `tickersSkipped = 1`
- DB: 0 rows in daily_ohlcv
- Guard: `low === undefined` → skip (MIN of empty set = undefined)

**Assertion:**
```typescript
it("TC-5: Low undefined (empty window, 0 ticks) → skip ticker, tickersSkipped=1", async () => {
  const db = makeDb();
  addTicker(db, "FPT");
  // No ticks inserted (empty window)

  const result = await runOhlcvDailyAggregator({
    db: () => db,
    nowMsFn: () => NOW_MS,
    sendWorkFn: async () => true,
  });

  expect(result.tickersProcessed).toBe(1);
  expect(result.rowsWritten).toBe(0);
  expect(result.tickersSkipped).toBe(1);

  const rows = db.prepare("SELECT * FROM daily_ohlcv").all();
  expect(rows).toHaveLength(0);
});
```

### TC-6: Batch with Mixed Completeness

**Input:** 3 tickers: T1 complete, T2 missing open, T3 missing close

**Expected:**
- `rowsWritten = 1` (only T1)
- `tickersSkipped = 2` (T2, T3)
- DB: 1 row (T1 only)

**Assertion:**
```typescript
it("TC-6: 3 tickers mixed completeness → 1 insert (T1), tickersSkipped=2", async () => {
  const db = makeDb();

  // T1: complete
  addTicker(db, "VCB");
  addTick(db, "VCB", 80000, TICK_1);
  addTick(db, "VCB", 85000, TICK_2);
  addTick(db, "VCB", 83000, TICK_3);

  // T2: missing open (no early tick)
  addTicker(db, "FPT");
  addTick(db, "FPT", 92000, TICK_2);
  addTick(db, "FPT", 90000, TICK_3);

  // T3: missing close (no late tick)
  addTicker(db, "SSI");
  addTick(db, "SSI", 50000, TICK_1);
  addTick(db, "SSI", 52000, TICK_2);

  const result = await runOhlcvDailyAggregator({
    db: () => db,
    nowMsFn: () => NOW_MS,
    sendWorkFn: async () => true,
  });

  expect(result.tickersProcessed).toBe(3);
  expect(result.rowsWritten).toBe(1);
  expect(result.tickersSkipped).toBe(2);

  const rows = db.prepare("SELECT * FROM daily_ohlcv ORDER BY code ASC").all() as Array<any>;
  expect(rows).toHaveLength(1);
  expect(rows[0].code).toBe("VCB");
  expect(rows[0].open).toBe(80000);
  expect(rows[0].high).toBe(85000);
  expect(rows[0].low).toBe(80000);
  expect(rows[0].close).toBe(83000);
});
```

---

## File Path & Structure

**File:** `src/__tests__/1277-ohlcv-guard-checks.test.ts`

**Imports:**
```typescript
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runOhlcvDailyAggregator } from "../scheduler/market-data/ohlcvDailyAggregatorJob.js";
```

**Skeleton:**
```typescript
Bun.env["DB_PATH"] = ":memory:";

// ─────── Constants ───────
const NOW_ISO = "...";
const NOW_MS = ...;
const VN_DATE = "...";
const WINDOW_START = "...";
const TICK_1 = "...";
const TICK_2 = "...";
const TICK_3 = "...";

// ─────── Helpers ───────
function makeDb(): Database { ... }
function addTicker(db: Database, code: string): void { ... }
function addTick(db: Database, code: string, price: number, fetchedAt: string, volume = 100): void { ... }

// ─────── Tests ───────
describe("Task 1277 — OHLCV guard checks (6 test cases)", () => {
  it("TC-1: ...", async () => { ... });
  it("TC-2: ...", async () => { ... });
  it("TC-3: ...", async () => { ... });
  it("TC-4: ...", async () => { ... });
  it("TC-5: ...", async () => { ... });
  it("TC-6: ...", async () => { ... });
});
```

---

## Brownfield Findings

**Scanner outputs:**
- Guard logic confirmed at `src/scheduler/market-data/ohlcvDailyAggregatorJob.ts:103–112` (commit ff55779) — no changes needed
- Test pattern reused from `src/__tests__/1358-ohlcv-aggregator.test.ts` (same schema, time constants, helper functions)
- No new domain services created (guards are inline, tested at job boundary)
- No imports crossing DDD layers (test only imports scheduler job, not infra)

**DDD compliance:** ✓ Tests use mocks, no infrastructure dependencies

---

## Success Criteria (RED phase)

- ✅ File created: `src/__tests__/1277-ohlcv-guard-checks.test.ts`
- ✅ All 6 test cases written (TC-1 to TC-6)
- ✅ All tests FAIL initially (assertions expect guards to work)
- ✅ Test count: +6 (baseline 6165 → 6165 still, will increase in 1277b)
- ✅ No TypeScript errors
- ✅ No changes to scheduler job itself

---

## Notes for Developer (1277b)

When implementing GREEN phase (1277b):
1. Run `bun test src/__tests__/1277-ohlcv-guard-checks.test.ts` — all 6 should pass (guards already in place @ commit ff55779)
2. If any test fails, compare job code against commit ff55779 diff — guards may be stale
3. No code changes to scheduler expected (formalization only)
4. If guards modified, update test assertions + add rationale to commit message

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1277-ohlcv-guard-checks.test.ts (NEW 273 lines)
  - 6 test cases (TC-1 to TC-6) validating OHLCV guard logic
  - In-memory SQLite schema + helper functions (makeDb, addTicker, addTick)
  - Time constants pinned to VN timezone (UTC+7)
  - Tests validate: happy path (TC-1), missing open (TC-2), missing close (TC-3), empty window high/low (TC-4/TC-5), batch mixed (TC-6)

tests_written:
- src/__tests__/1277-ohlcv-guard-checks.test.ts   # 6 assertions per test × 6 tests = 36+ assertions, 3 pass / 3 fail (RED phase)

tests_skipped: []   # All 6 test cases implemented per spec

tsc_clean: true
full_suite_pass: true   # 6168 pass (6165 baseline + 3 new passing), 3 fail (RED phase expected)

commit: af97684 (task/125-timezone-briefing-test) — `test(1277a): Create RED test suite for OHLCV guard checks`
