---
id: SUBTASK-OHLCV-WRITER-3-UNIT-TESTS
task_id: SUBTASK-OHLCV-WRITER-3-UNIT-TESTS
parent_task: ARCH-OHLCV-WRITER-SSOT-DURABLE
version: "2026-06-17"
zone: apps/mcp-server/
owner: dev-mcp-server
priority: P0
status: READY
type: TEST
size: S
---

# SUBTASK-3: Unit + integration tests T-1 through T-4 (regression + behavioral gate)

---

## Context

This task implements the **test strategy** from the architect's design (brief §5). It validates SUBTASK-1's SQL rewrite and provides the **direct regression proof** that the fix closes the bug.

The tests are the BEHAVIORAL GATE for the entire fix: without them passing, the change is unverified and cannot be merged.

---

## Test Suite Overview

**4 unit tests (T-1 through T-4) + 1 integration behavioral gate**

All tests must be in `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.test.ts` or a dedicated test file.

### Test T-1: No existing row → deferred write

```typescript
describe("writeForeignFlowToOhlcv", () => {
  test("T-1: no existing daily_ohlcv row → returns changes=0, zero new rows inserted, debug log emitted", async () => {
    // Setup: ensure daily_ohlcv is empty for (code='TEST-T1', date='2026-06-17')
    await db.exec("DELETE FROM daily_ohlcv WHERE code = 'TEST-T1' AND date = '2026-06-17'");

    // Call writeForeignFlowToOhlcv with test data
    const result = await writeForeignFlowToOhlcv([{
      code: 'TEST-T1',
      date: '2026-06-17',
      foreign_buy_vol: 1000,
      foreign_sell_vol: 900,
      foreign_net_vol: 100,
      put_through_vol: 500,
      foreign_buy_value: 50000000,
      foreign_sell_value: 45000000,
    }]);

    // Assert: changes=0
    expect(result.changes).toBe(0);

    // Assert: zero new rows inserted (no stub)
    const count = await db.selectOne("SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = 'TEST-T1' AND date = '2026-06-17'");
    expect(count.cnt).toBe(0);

    // Assert: debug log was emitted (check logger.debug mock or real output)
    // expect(debugLogSpy).toHaveBeenCalledWith(expect.stringMatching(/no OHLCV row yet/));
  });
});
```

**Rationale:** Proves the UPDATE finds no row and returns 0 changes. No stub is inserted (the fix).

---

### Test T-2: Existing row → updates foreign-flow columns

```typescript
describe("writeForeignFlowToOhlcv", () => {
  test("T-2: existing daily_ohlcv row → returns changes=1, foreign-flow cols updated, OHLCV cols UNTOUCHED", async () => {
    // Setup: insert a real OHLCV row with OHLCV data
    await db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['TEST-T2', '2026-06-17', 100, 110, 95, 105, 1000000, new Date().toISOString()]
    );

    // Capture original OHLCV values
    const before = await db.selectOne(
      "SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code = 'TEST-T2' AND date = '2026-06-17'"
    );

    // Call writeForeignFlowToOhlcv
    const result = await writeForeignFlowToOhlcv([{
      code: 'TEST-T2',
      date: '2026-06-17',
      foreign_buy_vol: 2000,
      foreign_sell_vol: 1800,
      foreign_net_vol: 200,
      put_through_vol: 1000,
      foreign_buy_value: 100000000,
      foreign_sell_value: 90000000,
    }]);

    // Assert: changes=1
    expect(result.changes).toBe(1);

    // Assert: OHLCV columns UNTOUCHED
    const after = await db.selectOne(
      "SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code = 'TEST-T2' AND date = '2026-06-17'"
    );
    expect(after.open).toBe(before.open); // 100
    expect(after.high).toBe(before.high); // 110
    expect(after.low).toBe(before.low);   // 95
    expect(after.close).toBe(before.close); // 105
    expect(after.volume).toBe(before.volume); // 1000000

    // Assert: foreign-flow columns updated
    const foreign = await db.selectOne(
      "SELECT foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol FROM daily_ohlcv WHERE code = 'TEST-T2' AND date = '2026-06-17'"
    );
    expect(foreign.foreign_buy_vol).toBe(2000);
    expect(foreign.foreign_sell_vol).toBe(1800);
  });
});
```

**Rationale:** Proves that UPDATE on an existing row works, changes=1 is returned, and OHLCV columns are NOT touched (immutable).

---

### Test T-3: Deferred + real bar insertion + repopulation

```typescript
describe("writeForeignFlowToOhlcv", () => {
  test("T-3: foreign-flow deferred (T-1 scenario) + real OHLCV insert + foreign-flow repopulation works", async () => {
    // Step 1: Call writeForeignFlowToOhlcv when no row exists (deferred, changes=0)
    const step1Result = await writeForeignFlowToOhlcv([{
      code: 'TEST-T3',
      date: '2026-06-17',
      foreign_buy_vol: 1000,
      foreign_sell_vol: 900,
      foreign_net_vol: 100,
      put_through_vol: 500,
      foreign_buy_value: 50000000,
      foreign_sell_value: 45000000,
    }]);
    expect(step1Result.changes).toBe(0); // Deferred

    // Step 2: Simulate pushPricesHandler — insert the real OHLCV row
    await db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['TEST-T3', '2026-06-17', 100, 110, 95, 105, 1000000, new Date().toISOString()]
    );

    // Step 3: Call writeForeignFlowToOhlcv again (should now find the row)
    const step3Result = await writeForeignFlowToOhlcv([{
      code: 'TEST-T3',
      date: '2026-06-17',
      foreign_buy_vol: 1500,
      foreign_sell_vol: 1400,
      foreign_net_vol: 100,
      put_through_vol: 750,
      foreign_buy_value: 75000000,
      foreign_sell_value: 70000000,
    }]);
    expect(step3Result.changes).toBe(1); // Updated

    // Step 4: Verify foreign-flow columns are populated + OHLCV columns are real
    const final = await db.selectOne(
      "SELECT open, close, volume, foreign_buy_vol FROM daily_ohlcv WHERE code = 'TEST-T3' AND date = '2026-06-17'"
    );
    expect(final.close).toBe(105); // Real value, not 0
    expect(final.volume).toBe(1000000); // Real value
    expect(final.foreign_buy_vol).toBe(1500); // Updated in step 3
  });
});
```

**Rationale:** Proves the end-to-end scenario from the architect's design: foreign-flow data is deferred until the real OHLCV row arrives, then immediately populated on the next fetch.

---

### Test T-4: REGRESSION PROOF — No stub row created

```typescript
describe("writeForeignFlowToOhlcv (REGRESSION GATE)", () => {
  test("T-4: REGRESSION PROOF — no stub row with close=0 created when OHLCV row absent", async () => {
    // Setup: ensure daily_ohlcv is empty for (code='REGRESSION-TEST', date='2026-06-18')
    await db.exec("DELETE FROM daily_ohlcv WHERE code = 'REGRESSION-TEST' AND date = '2026-06-18'");

    // Call writeForeignFlowToOhlcv (this used to INSERT a stub with close=0 — the bug)
    const result = await writeForeignFlowToOhlcv([{
      code: 'REGRESSION-TEST',
      date: '2026-06-18',
      foreign_buy_vol: 500,
      foreign_sell_vol: 450,
      foreign_net_vol: 50,
      put_through_vol: 250,
      foreign_buy_value: 25000000,
      foreign_sell_value: 22500000,
    }]);

    // Assert: changes=0 (no row updated)
    expect(result.changes).toBe(0);

    // DIRECT REGRESSION PROOF:
    // Query: SELECT close FROM daily_ohlcv WHERE code='REGRESSION-TEST' AND date='2026-06-18'
    // OLD (buggy) behavior: returns 1 row with close=0
    // NEW (fixed) behavior: returns 0 rows (no row created)
    const rows = await db.selectAll(
      "SELECT close FROM daily_ohlcv WHERE code = 'REGRESSION-TEST' AND date = '2026-06-18'"
    );
    
    // The fix: ZERO rows, not a row with close=0
    expect(rows.length).toBe(0);
    expect(rows.some(r => r.close === 0)).toBe(false); // Belt-and-suspenders
  });
});
```

**Rationale:** This is the **smoking gun test**. It directly validates that the bug is fixed: no `close=0` stub row is created. This is the exact regression proof from the architect's test strategy.

---

## Integration Behavioral Gate

**Purpose:** End-to-end validation of the entire merge-only workflow.

```typescript
describe("writeForeignFlowToOhlcv (integration behavioral gate)", () => {
  test("Integration: empty DB → foreign-flow write → no insert; real OHLCV insert → foreign-flow populate; assert no close=0 stub at any point", async () => {
    // Setup: fresh test DB, empty for test ticker
    const testCode = 'INTEGRATION-TEST-' + Date.now();
    const testDate = '2026-06-17';
    await db.exec(`DELETE FROM daily_ohlcv WHERE code = ?`, [testCode]);

    // Step 1: Call writeForeignFlowToOhlcv on empty DB
    const writeResult1 = await writeForeignFlowToOhlcv([{
      code: testCode,
      date: testDate,
      foreign_buy_vol: 1000,
      foreign_sell_vol: 900,
      foreign_net_vol: 100,
      put_through_vol: 500,
      foreign_buy_value: 50000000,
      foreign_sell_value: 45000000,
    }]);

    // Assert: COUNT=0 (no row created)
    let count = await db.selectOne(
      `SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = ? AND date = ?`,
      [testCode, testDate]
    );
    expect(count.cnt).toBe(0);

    // Step 2: Insert real OHLCV row (simulate pushPricesHandler)
    await db.run(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [testCode, testDate, 100, 110, 95, 105, 1000000, new Date().toISOString()]
    );

    // Assert: real close (not 0)
    let row = await db.selectOne(
      `SELECT close FROM daily_ohlcv WHERE code = ? AND date = ?`,
      [testCode, testDate]
    );
    expect(row.close).toBe(105); // Real value

    // Step 3: Call writeForeignFlowToOhlcv again
    const writeResult2 = await writeForeignFlowToOhlcv([{
      code: testCode,
      date: testDate,
      foreign_buy_vol: 1500,
      foreign_sell_vol: 1400,
      foreign_net_vol: 100,
      put_through_vol: 750,
      foreign_buy_value: 75000000,
      foreign_sell_value: 70000000,
    }]);

    // Assert: foreign-flow cols populated, close still real
    row = await db.selectOne(
      `SELECT close, foreign_buy_vol, foreign_sell_vol FROM daily_ohlcv WHERE code = ? AND date = ?`,
      [testCode, testDate]
    );
    expect(row.close).toBe(105); // Still real, never became 0
    expect(row.foreign_buy_vol).toBe(1500); // Populated
    expect(row.foreign_sell_vol).toBe(1400); // Populated

    // Final assert: COUNT=1 (still only one row, no stub clones)
    count = await db.selectOne(
      `SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = ? AND date = ?`,
      [testCode, testDate]
    );
    expect(count.cnt).toBe(1);
  });
});
```

**Rationale:** Full end-to-end validation that the merge-only semantic works correctly: no stub at any point, foreign-flow data deferred then populated, real OHLCV never corrupted.

---

## Acceptance Criteria

- [ ] **T-1 test:** passes (deferred write, no stub)
- [ ] **T-2 test:** passes (UPDATE on existing row, OHLCV immutable)
- [ ] **T-3 test:** passes (deferred + real insert + repopulation workflow)
- [ ] **T-4 test (REGRESSION PROOF):** passes (no `close=0` stub created)
- [ ] **Integration behavioral gate:** passes (end-to-end merge-only workflow validated)
- [ ] All tests in `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.test.ts` (or equivalent)
- [ ] `bun test` — ALL tests green before merge
- [ ] **REBUILD_REQUIRED: YES** — mcp-server image rebuild needed before live gate

---

## Test Infrastructure

- **Test framework:** Use the project's existing test setup (e.g., Jest, Vitest, Bun test)
- **Database:** Use the project's test DB fixture (e.g., in-memory SQLite or test named-volume)
- **Isolation:** Each test should clean up after itself (DELETE test rows) so tests are independent

---

## Architecture Justification

- **Zone:** `apps/mcp-server/` — single zone, no conflicts
- **DDD Layer:** test layer (infrastructure/db tests)
- **Blocking:** This task BLOCKS the shared verification gate (cannot verify the fix without these tests passing)

---

## Knowledge Load

Read before starting:
- `docs/handoffs/ARCH-OHLCV-WRITER-SSOT-DURABLE-architect-design.md` — §5 "Test Strategy" (exact test definitions)
- `docs/architecture-briefs/2026-06-17-ohlcv-writer-ssot-durable.md` — overall fix rationale
- `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` — the function being tested (after SUBTASK-1 merge)

---

## Dependency: SUBTASK-1

This task **depends on SUBTASK-1** (SQL rewrite). You can start writing tests in parallel with SUBTASK-1 development, but tests will only PASS after SUBTASK-1 is merged.

---

## Shared Verification Gate

After all 3 subtasks merge + rebuild, the shared verification gate fires at NEXT VN market open (2026-06-18):
- These unit/integration tests validate the producer-side fix
- RSI + BB alerts must match canonical at market open (consumer-side validation gate)
- No `close=0` stubs on live DB (live-probe validation)

**Verify at 02:15Z, NOT at 04:30Z** (self-heal masks stubs after real OHLCV lands).

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/__tests__/2026-ohlcv-foreign-flow-merge.test.ts` — NEW: 7 tests (T-1 deferred write, T-2 existing row update, T-3 deferred+repopulate workflow, T-4 REGRESSION PROOF, T-INT integration gate, T-GEN generic across codes, T-COALESCE null preservation)
  - `apps/mcp-server/src/__tests__/DPI-4-foreign-flow-upsert.test.ts` — UPDATED: AC-1 and AC-7 tests match merge-only behavior
  - `apps/mcp-server/src/__tests__/1503-ohlcv-foreign-flow.test.ts` — UPDATED: AC3 matches merge-only behavior
- **Tests written:** 7 new tests GREEN; 4 legacy tests updated GREEN
- **Git commits:**
  - `e5461ad7` test(mcp-server/ohlcv-writer-ssot-durable): SUBTASK-3 unit tests T-1..T-4 + integration gate
  - `e96571ac` test(mcp-server/ohlcv-writer-ssot-durable): update DPI-4 + 1503 legacy tests to match merge-only behavior
- **Type check:** clean (bun tsc --noEmit, exit 0)
- **bun test:** 13275 run / 13185 pass / 48 fail (baseline was 51 fail — net -3; 0 new failures)
- **Tool count:** 165 — unchanged
- **Scheduler count:** 3 cron.schedule — unchanged
- **REBUILD_REQUIRED:** YES
