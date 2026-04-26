# TASK 1331a — RED: Failing Tests Proving Multi-Writer Contention

**Sprint:** 1331 | **Phase:** RED | **Size:** S
**Design:** `docs/TECH_1307.md`
**Blocks:** TASK_1331b (GREEN implementation)

---

## Objective

Write 4 failing tests that prove the multi-writer SQLite contention problem and define the
contracts the GREEN phase must satisfy. No production code changes in this task.

Tests 2, 3, 4 MUST be RED (failing) when committed. Test 1 is structural/passing by design —
it proves SQLite BUSY is detectable, validating the test harness.

---

## Test File to Create

`apps/mcp-server/src/__tests__/1331a-single-writer-guard.test.ts`

---

## Test 1 — Concurrent Write Contention Is Detectable (structural, passes)

Proves that two `Database` instances on the same file with `busy_timeout=0` produce
`SQLITE_BUSY`. This validates the test harness and proves the failure mode is real.

```typescript
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Task 1331a — Single-Writer Guard", () => {
  it("TEST-1 (structural): two writers to same file cause SQLITE_BUSY", () => {
    const dir = mkdtempSync(join(tmpdir(), "1331a-"));
    const dbPath = join(dir, "contention.db");

    const db1 = new Database(dbPath);
    db1.exec("PRAGMA journal_mode = WAL");
    db1.exec("CREATE TABLE IF NOT EXISTS rows (id INTEGER PRIMARY KEY, val TEXT)");

    const db2 = new Database(dbPath);
    db2.exec("PRAGMA journal_mode = WAL");
    db2.exec("PRAGMA busy_timeout = 0"); // fail immediately

    db1.exec("BEGIN EXCLUSIVE");
    db1.exec("INSERT INTO rows (val) VALUES ('db1')");

    let caught = false;
    try {
      db2.exec("BEGIN EXCLUSIVE");
    } catch (err) {
      caught = true;
      expect(String(err)).toMatch(/SQLITE_BUSY|database is locked/i);
    }

    db1.exec("ROLLBACK");
    db1.close();
    db2.close();
    rmSync(dir, { recursive: true });

    expect(caught).toBe(true); // proves BUSY is detectable
  });
```

**Expected result BEFORE fix:** PASS (structural test, no prod code dependency).

---

## Test 2 — Alert-Engine Config Must Expose `ownDbPath` Field (RED)

```typescript
  it("TEST-2 (RED): alert-engine ServiceConfig must have ownDbPath !== market.db", () => {
    // RED: 'ownDbPath' does not exist on ServiceConfig before task 1331b
    // Dynamically require to avoid TS compile errors in test run
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const configModule = require("../../../../../apps/alert-engine/src/infrastructure/config");
    const config = configModule.loadConfig();

    // FAILS before fix: config.ownDbPath is undefined
    expect(config).toHaveProperty("ownDbPath");
    expect(config.ownDbPath).toBeDefined();
    expect(config.ownDbPath).not.toContain("market.db");
    expect(config.ownDbPath).toContain("alert_engine");
  });
```

**Expected result BEFORE fix:** FAIL — `ownDbPath` property missing from `ServiceConfig`.

---

## Test 3 — Stock-Price Write Must Target Isolated DB (RED)

```typescript
  it("TEST-3 (RED): STOCK_PRICE_DB_PATH env must differ from DB_PATH", () => {
    // RED: STOCK_PRICE_DB_PATH is not defined before task 1331b
    // After fix: stock-price index.ts exports OWN_DB_PATH constant driven by this env var

    // Simulate what the fixed index.ts will export
    const stockPriceOwnDb = Bun.env["STOCK_PRICE_DB_PATH"];
    const marketDb = Bun.env["DB_PATH"] ?? "/app/data/market.db";

    // FAILS before fix: STOCK_PRICE_DB_PATH is undefined
    expect(stockPriceOwnDb).toBeDefined();
    expect(stockPriceOwnDb).not.toBe(marketDb);
    expect(stockPriceOwnDb).toMatch(/stock_price\.db$/);
  });
```

**Expected result BEFORE fix:** FAIL — `STOCK_PRICE_DB_PATH` env var is undefined in test env.

Note: In task 1331b, the test setup file `apps/mcp-server/src/__tests__/setup.ts` gets a line
`Bun.env["STOCK_PRICE_DB_PATH"] = "/tmp/test_stock_price.db"` so test 3 turns GREEN.

---

## Test 4 — WriterGuard Module Must Exist and Export `assertSingleWriter` (RED)

```typescript
  it("TEST-4 (RED): writerGuard.assertSingleWriter must exist and return { contested: boolean }", async () => {
    // RED: writerGuard.ts does not exist before task 1331b — import throws MODULE_NOT_FOUND
    const { assertSingleWriter } = await import(
      "../infrastructure/db/writerGuard.js"
    );

    expect(typeof assertSingleWriter).toBe("function");

    // On :memory: DB (used in all tests) there is no lock contention
    const db = new Database(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    const result = assertSingleWriter(db);
    expect(result).toHaveProperty("contested");
    expect(result.contested).toBe(false);
    db.close();
  });
});
```

**Expected result BEFORE fix:** FAIL — dynamic import throws `Cannot find module`.

---

## Acceptance Criteria — RED Phase

- [ ] Test 1: PASS
- [ ] Test 2: FAIL (`ownDbPath` not on ServiceConfig)
- [ ] Test 3: FAIL (`STOCK_PRICE_DB_PATH` env not set)
- [ ] Test 4: FAIL (`writerGuard.ts` module not found)
- [ ] All 6927 baseline tests still pass (no regressions from adding this test file)
- [ ] No production code changed

---

## Files to Create in This Task

- `apps/mcp-server/src/__tests__/1331a-single-writer-guard.test.ts` — the 4 tests above

## Files NOT to Touch

- Any `src/` production file in any service
- `docker-compose.yml`
- `apps/alert-engine/`
- `apps/stock-price/`

---

## Handoff to 1331b

Commit `1331a-single-writer-guard.test.ts` with all 4 tests (3 failing). Task 1331b receives
this as the failing baseline and implements production changes until all 4 pass.

Reference design: `docs/TECH_1307.md` section 4.
