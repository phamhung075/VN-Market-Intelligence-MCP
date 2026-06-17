/**
 * 2026-ohlcv-foreign-flow-merge.test.ts
 *
 * SUBTASK-3: Unit tests T-1 through T-4 + integration behavioral gate
 * for the FIX-OHLCV-WRITER-SSOT-DURABLE producer-root fix.
 *
 * Tests:
 *   T-1: No existing row => changes=0, zero rows inserted (no stub)
 *   T-2: Existing row => changes=1, foreign-flow updated, OHLCV UNTOUCHED
 *   T-3: Deferred write + real OHLCV insert + repopulation workflow
 *   T-4: REGRESSION PROOF -- no close=0 stub row created on absent row
 *   T-INT: Integration behavioral gate -- full merge-only workflow
 *   T-GEN: Generic across multiple codes (not per-ticker special-case)
 *   T-COALESCE: COALESCE preserves existing value when arg is null
 *
 * Dependency: writeForeignFlowToOhlcv must use UPDATE-only (SUBTASK-1).
 */

// Use in-memory DB per test -- no DB_PATH env needed (db passed directly)
import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { writeForeignFlowToOhlcv } from "../infrastructure/db/ohlcvForeignFlowStore.js";

// ---------------------------------------------------------------------------
// Test DB factory -- creates a minimal daily_ohlcv schema with foreign-flow
// columns, mirroring production (schema-market-data.ts + migrateForeignFlowColumns).
// ---------------------------------------------------------------------------

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code              TEXT NOT NULL,
      date              TEXT NOT NULL,
      open              REAL NOT NULL DEFAULT 0,
      high              REAL NOT NULL DEFAULT 0,
      low               REAL NOT NULL DEFAULT 0,
      close             REAL NOT NULL,
      volume            REAL NOT NULL DEFAULT 0,
      updated_at        TEXT NOT NULL DEFAULT '',
      foreign_buy_vol   REAL,
      foreign_sell_vol  REAL,
      foreign_net_vol   REAL,
      put_through_vol   REAL,
      foreign_buy_value  REAL,
      foreign_sell_value REAL,
      PRIMARY KEY (code, date)
    )
  `);
  return db;
}

/** Insert a real OHLCV row (simulating pushPricesHandler). */
function insertRealOhlcv(
  db: Database,
  code: string,
  date: string,
  open = 100,
  high = 110,
  low = 95,
  close = 105,
  volume = 1_000_000,
): void {
  db.run(
    `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, date, open, high, low, close, volume, new Date().toISOString()],
  );
}

// ---------------------------------------------------------------------------
// T-1: No existing row -> changes=0, zero rows inserted
// ---------------------------------------------------------------------------

describe("writeForeignFlowToOhlcv — T-1: no OHLCV row => deferred write", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  test("T-1: returns changes=0 and inserts ZERO rows when no OHLCV row exists", async () => {
    const result = await writeForeignFlowToOhlcv(
      [
        {
          code: "TEST-T1",
          date: "2026-06-17",
          foreignBuyVol: 1000,
          foreignSellVol: 900,
          putThroughVol: 500,
          foreignBuyValue: 50_000_000,
          foreignSellValue: 45_000_000,
        },
      ],
      db,
    );

    // changes=0: no row was updated (no OHLCV row existed)
    expect(result.changes).toBe(0);

    // Zero rows in daily_ohlcv: no stub was created
    const rows = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = ? AND date = ?",
      )
      .get("TEST-T1", "2026-06-17") as { cnt: number };
    expect(rows.cnt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T-2: Existing row -> changes=1, foreign-flow updated, OHLCV UNTOUCHED
// ---------------------------------------------------------------------------

describe("writeForeignFlowToOhlcv — T-2: existing OHLCV row => UPDATE, OHLCV immutable", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  test("T-2: returns changes=1 and updates foreign-flow cols; OHLCV cols UNTOUCHED", async () => {
    // Setup: insert a real OHLCV row
    insertRealOhlcv(db, "TEST-T2", "2026-06-17", 100, 110, 95, 105, 1_000_000);

    // Capture OHLCV values before
    const before = db
      .prepare(
        "SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code = ? AND date = ?",
      )
      .get("TEST-T2", "2026-06-17") as {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    };

    // Call writeForeignFlowToOhlcv
    const result = await writeForeignFlowToOhlcv(
      [
        {
          code: "TEST-T2",
          date: "2026-06-17",
          foreignBuyVol: 2000,
          foreignSellVol: 1800,
          putThroughVol: 1000,
          foreignBuyValue: 100_000_000,
          foreignSellValue: 90_000_000,
        },
      ],
      db,
    );

    // changes=1: one row was updated
    expect(result.changes).toBe(1);

    // OHLCV columns UNTOUCHED
    const after = db
      .prepare(
        "SELECT open, high, low, close, volume FROM daily_ohlcv WHERE code = ? AND date = ?",
      )
      .get("TEST-T2", "2026-06-17") as {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    };
    expect(after.open).toBe(before.open);       // 100
    expect(after.high).toBe(before.high);       // 110
    expect(after.low).toBe(before.low);         // 95
    expect(after.close).toBe(before.close);     // 105 (not 0)
    expect(after.volume).toBe(before.volume);   // 1_000_000

    // Foreign-flow columns updated
    const ff = db
      .prepare(
        "SELECT foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol FROM daily_ohlcv WHERE code = ? AND date = ?",
      )
      .get("TEST-T2", "2026-06-17") as {
      foreign_buy_vol: number;
      foreign_sell_vol: number;
      foreign_net_vol: number;
      put_through_vol: number;
    };
    expect(ff.foreign_buy_vol).toBe(2000);
    expect(ff.foreign_sell_vol).toBe(1800);
    expect(ff.foreign_net_vol).toBe(200); // 2000 - 1800
    expect(ff.put_through_vol).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// T-3: Deferred + real bar insertion + repopulation workflow
// ---------------------------------------------------------------------------

describe("writeForeignFlowToOhlcv — T-3: deferred then repopulated after real OHLCV arrives", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  test("T-3: deferred (changes=0) + real OHLCV insert + 2nd foreign-flow call = populated", async () => {
    // Step 1: Call when no OHLCV row exists -- deferred
    const step1 = await writeForeignFlowToOhlcv(
      [
        {
          code: "TEST-T3",
          date: "2026-06-17",
          foreignBuyVol: 1000,
          foreignSellVol: 900,
          putThroughVol: 500,
          foreignBuyValue: 50_000_000,
          foreignSellValue: 45_000_000,
        },
      ],
      db,
    );
    expect(step1.changes).toBe(0); // deferred

    // Assert: still 0 rows (no stub)
    const countAfterStep1 = (
      db
        .prepare(
          "SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = ? AND date = ?",
        )
        .get("TEST-T3", "2026-06-17") as { cnt: number }
    ).cnt;
    expect(countAfterStep1).toBe(0);

    // Step 2: Simulate pushPricesHandler inserting the real OHLCV row
    insertRealOhlcv(db, "TEST-T3", "2026-06-17", 100, 110, 95, 105, 1_000_000);

    // Step 3: Call writeForeignFlowToOhlcv again (simulating next 60s re-fetch)
    const step3 = await writeForeignFlowToOhlcv(
      [
        {
          code: "TEST-T3",
          date: "2026-06-17",
          foreignBuyVol: 1500,
          foreignSellVol: 1400,
          putThroughVol: 750,
          foreignBuyValue: 75_000_000,
          foreignSellValue: 70_000_000,
        },
      ],
      db,
    );
    expect(step3.changes).toBe(1); // updated

    // Step 4: Verify final row has real close (not 0) AND updated foreign-flow
    const final = db
      .prepare(
        "SELECT open, close, volume, foreign_buy_vol FROM daily_ohlcv WHERE code = ? AND date = ?",
      )
      .get("TEST-T3", "2026-06-17") as {
      open: number;
      close: number;
      volume: number;
      foreign_buy_vol: number;
    };
    expect(final.close).toBe(105);          // Real value, not 0
    expect(final.volume).toBe(1_000_000);   // Real value
    expect(final.foreign_buy_vol).toBe(1500); // Updated in step 3
  });
});

// ---------------------------------------------------------------------------
// T-4: REGRESSION PROOF -- no close=0 stub row on absent OHLCV row
// ---------------------------------------------------------------------------

describe("writeForeignFlowToOhlcv — T-4: REGRESSION PROOF", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  test("T-4: REGRESSION -- no stub row with close=0 created when OHLCV row absent", async () => {
    // Ensure empty
    db.run(
      "DELETE FROM daily_ohlcv WHERE code = ? AND date = ?",
      ["REGRESSION-TEST", "2026-06-18"],
    );

    // This used to INSERT a stub with close=0 (the bug)
    const result = await writeForeignFlowToOhlcv(
      [
        {
          code: "REGRESSION-TEST",
          date: "2026-06-18",
          foreignBuyVol: 500,
          foreignSellVol: 450,
          putThroughVol: 250,
          foreignBuyValue: 25_000_000,
          foreignSellValue: 22_500_000,
        },
      ],
      db,
    );

    // changes=0 (no row updated -- nothing existed)
    expect(result.changes).toBe(0);

    // DIRECT REGRESSION PROOF:
    // OLD (buggy) behavior: returns 1 row with close=0
    // NEW (fixed) behavior: returns 0 rows (no row created)
    const rows = db
      .prepare(
        "SELECT close FROM daily_ohlcv WHERE code = ? AND date = ?",
      )
      .all("REGRESSION-TEST", "2026-06-18") as { close: number }[];

    expect(rows.length).toBe(0);                            // No row at all
    expect(rows.some((r) => r.close === 0)).toBe(false);    // Belt-and-suspenders
  });
});

// ---------------------------------------------------------------------------
// T-INT: Integration behavioral gate
// ---------------------------------------------------------------------------

describe("writeForeignFlowToOhlcv — T-INT: integration behavioral gate", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  test("T-INT: empty DB => no insert; real OHLCV => foreign-flow populates; close never 0", async () => {
    const testCode = `INTEGRATION-TEST-${Date.now()}`;
    const testDate = "2026-06-17";

    // Step 1: Call on empty DB
    const write1 = await writeForeignFlowToOhlcv(
      [
        {
          code: testCode,
          date: testDate,
          foreignBuyVol: 1000,
          foreignSellVol: 900,
          putThroughVol: 500,
          foreignBuyValue: 50_000_000,
          foreignSellValue: 45_000_000,
        },
      ],
      db,
    );
    expect(write1.changes).toBe(0);

    // Assert: COUNT=0 (no stub row)
    const count1 = (
      db
        .prepare("SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = ? AND date = ?")
        .get(testCode, testDate) as { cnt: number }
    ).cnt;
    expect(count1).toBe(0);

    // Step 2: Insert real OHLCV row (simulate pushPricesHandler at ~03:00Z)
    insertRealOhlcv(db, testCode, testDate, 100, 110, 95, 105, 1_000_000);

    // Assert: close is real (not 0)
    const row1 = db
      .prepare("SELECT close FROM daily_ohlcv WHERE code = ? AND date = ?")
      .get(testCode, testDate) as { close: number };
    expect(row1.close).toBe(105); // Real value

    // Step 3: Call writeForeignFlowToOhlcv again (simulate 60s re-fetch)
    const write2 = await writeForeignFlowToOhlcv(
      [
        {
          code: testCode,
          date: testDate,
          foreignBuyVol: 1500,
          foreignSellVol: 1400,
          putThroughVol: 750,
          foreignBuyValue: 75_000_000,
          foreignSellValue: 70_000_000,
        },
      ],
      db,
    );
    expect(write2.changes).toBe(1);

    // Assert: foreign-flow populated, close still real
    const row2 = db
      .prepare(
        "SELECT close, foreign_buy_vol, foreign_sell_vol FROM daily_ohlcv WHERE code = ? AND date = ?",
      )
      .get(testCode, testDate) as {
      close: number;
      foreign_buy_vol: number;
      foreign_sell_vol: number;
    };
    expect(row2.close).toBe(105);               // Still real, never became 0
    expect(row2.foreign_buy_vol).toBe(1500);    // Populated
    expect(row2.foreign_sell_vol).toBe(1400);   // Populated

    // Final: still only 1 row (no stub clones)
    const count2 = (
      db
        .prepare("SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code = ? AND date = ?")
        .get(testCode, testDate) as { cnt: number }
    ).cnt;
    expect(count2).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T-GEN: Generic across codes -- behavior applies to any code, not per-ticker
// ---------------------------------------------------------------------------

describe("writeForeignFlowToOhlcv — T-GEN: generic across all codes", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  test("T-GEN: merge-only behavior is generic -- applies uniformly to different codes", async () => {
    const codes = ["HPG", "VIC", "FPT", "MWG", "SSI"];

    // Insert real OHLCV rows for all codes
    for (const code of codes) {
      insertRealOhlcv(db, code, "2026-06-17", 100, 110, 95, 105, 500_000);
    }

    // Write foreign-flow for all codes in a single call
    const result = await writeForeignFlowToOhlcv(
      codes.map((code) => ({
        code,
        date: "2026-06-17",
        foreignBuyVol: 1000,
        foreignSellVol: 800,
        putThroughVol: 300,
        foreignBuyValue: 50_000_000,
        foreignSellValue: 40_000_000,
      })),
      db,
    );

    // All 5 codes updated
    expect(result.changes).toBe(codes.length);

    // Verify no code has close=0
    for (const code of codes) {
      const row = db
        .prepare("SELECT close FROM daily_ohlcv WHERE code = ? AND date = ?")
        .get(code, "2026-06-17") as { close: number };
      expect(row.close).not.toBe(0); // Never zero
      expect(row.close).toBe(105);   // Still the original real value
    }
  });
});

// ---------------------------------------------------------------------------
// T-COALESCE: COALESCE preserves existing foreign_buy_value when arg is null
// ---------------------------------------------------------------------------

describe("writeForeignFlowToOhlcv — T-COALESCE: COALESCE preserves existing values on null arg", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  test("T-COALESCE: null foreignBuyValue does not overwrite existing foreign_buy_value", async () => {
    // Setup: real OHLCV row + existing foreign-flow values
    insertRealOhlcv(db, "COALESCE-TEST", "2026-06-17");
    db.run(
      `UPDATE daily_ohlcv SET foreign_buy_value = 999, foreign_sell_value = 888
       WHERE code = ? AND date = ?`,
      ["COALESCE-TEST", "2026-06-17"],
    );

    // Call with null values (e.g., upstream API omitted the field)
    const result = await writeForeignFlowToOhlcv(
      [
        {
          code: "COALESCE-TEST",
          date: "2026-06-17",
          foreignBuyVol: 1000,
          foreignSellVol: 800,
          putThroughVol: 300,
          foreignBuyValue: null,     // Null -> COALESCE should preserve existing
          foreignSellValue: null,    // Null -> COALESCE should preserve existing
        },
      ],
      db,
    );

    expect(result.changes).toBe(1); // Row was updated

    // COALESCE: existing values preserved (not overwritten with null)
    const row = db
      .prepare(
        "SELECT foreign_buy_value, foreign_sell_value FROM daily_ohlcv WHERE code = ? AND date = ?",
      )
      .get("COALESCE-TEST", "2026-06-17") as {
      foreign_buy_value: number;
      foreign_sell_value: number;
    };
    expect(row.foreign_buy_value).toBe(999);   // Preserved
    expect(row.foreign_sell_value).toBe(888);  // Preserved
  });
});
