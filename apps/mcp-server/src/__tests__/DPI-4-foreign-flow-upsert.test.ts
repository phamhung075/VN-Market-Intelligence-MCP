// src/__tests__/DPI-4-foreign-flow-upsert.test.ts
// Sprint DATA-PIPELINE-INTEGRITY — DPI-4
// Unit tests for writeForeignFlowToOhlcv() merge-only UPDATE behavior.
//
// FIX-OHLCV-WRITER-SSOT-DURABLE (2026-06-17): The original DPI-4 UPSERT strategy
// (INSERT stub row with close=0 when no OHLCV row exists) has been replaced with
// a merge-only UPDATE. This file is updated to test the new behavior:
//
// AC-1 (UPDATED): no stub row created when OHLCV row absent -- changes=0, no insert
// AC-1: UPDATE updates four foreign flow columns when row exists (unchanged)
// AC-7 (UPDATED): foreign-flow is deferred (not in stub) until real OHLCV arrives;
//                 subsequent UPDATE populates columns correctly

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { writeForeignFlowToOhlcv } from "../infrastructure/db/ohlcvForeignFlowStore.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertOhlcv(
  db: ReturnType<typeof getDb>,
  code: string,
  date: string,
  close: number,
) {
  // Mimics the DPI-4-fixed server.ts secondary OHLCV write path
  db.prepare(`
    INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
    VALUES (?, ?, 0, 0, 0, ?, 0, datetime('now'))
    ON CONFLICT(code, date) DO UPDATE SET
      open       = excluded.open,
      high       = excluded.high,
      low        = excluded.low,
      close      = excluded.close,
      volume     = excluded.volume,
      updated_at = excluded.updated_at
  `).run(code, date, close);
}

// ---------------------------------------------------------------------------
// AC-1: INSERT stub row when no (code, date) exists
// ---------------------------------------------------------------------------

describe("DPI-4 AC-1 (UPDATED): merge-only -- no stub row on absent OHLCV", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("FIX-OHLCV-WRITER-SSOT-DURABLE: returns changes=0 and creates NO row when OHLCV absent", async () => {
    // Verify empty before test
    const db = getDb();
    db.prepare("DELETE FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'").run();

    const result = await writeForeignFlowToOhlcv(
      [{ code: "HPG", date: "2026-05-29", foreignBuyVol: 1000, foreignSellVol: 500, putThroughVol: 0 }],
      db,
    );

    // MERGE-ONLY: changes=0 (no OHLCV row to update), no stub created
    expect(result.changes).toBe(0);

    // No stub row: SELECT returns null (0 rows)
    const row = db.prepare(
      `SELECT close FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as { close: number } | null;

    expect(row).toBeNull(); // No stub row
  });

  it("updates foreign flow columns on existing row without overwriting OHLCV", async () => {
    const db = getDb();

    // Pre-insert a real OHLCV row
    db.prepare(`
      INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
      VALUES ('VIC', '2026-05-29', 45.0, 46.0, 44.5, 45.5, 1200000, '2026-05-29T08:00:00Z')
    `).run();

    const result = await writeForeignFlowToOhlcv(
      [{ code: "VIC", date: "2026-05-29", foreignBuyVol: 300000, foreignSellVol: 200000, putThroughVol: 50000 }],
      db,
    );

    expect(result.changes).toBe(1);

    const row = db.prepare(
      `SELECT open, high, low, close, volume, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol
       FROM daily_ohlcv WHERE code = 'VIC' AND date = '2026-05-29'`,
    ).get() as {
      open: number; high: number; low: number; close: number; volume: number;
      foreign_buy_vol: number; foreign_sell_vol: number;
      foreign_net_vol: number; put_through_vol: number;
    } | null;

    expect(row).not.toBeNull();
    // OHLCV preserved
    expect(row!.open).toBe(45.0);
    expect(row!.close).toBe(45.5);
    expect(row!.volume).toBe(1200000);
    // Foreign flow updated
    expect(row!.foreign_buy_vol).toBe(300000);
    expect(row!.foreign_sell_vol).toBe(200000);
    expect(row!.foreign_net_vol).toBe(100000);
    expect(row!.put_through_vol).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// AC-7: R-1 race — stub-row foreign flow values survive a subsequent OHLCV push
// ---------------------------------------------------------------------------

describe("DPI-4 AC-7 (UPDATED): merge-only deferred flow + real OHLCV insert => subsequent UPDATE works", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("FIX-OHLCV-WRITER-SSOT-DURABLE: deferred (changes=0), then real OHLCV, then flow populates correctly", async () => {
    const db = getDb();
    db.prepare("DELETE FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'").run();

    // Step 1: foreignFlow deferred -- no OHLCV row yet (merge-only: changes=0, no stub)
    const deferred = await writeForeignFlowToOhlcv(
      [{ code: "HPG", date: "2026-05-29", foreignBuyVol: 5000000, foreignSellVol: 2000000, putThroughVol: 0 }],
      db,
    );
    expect(deferred.changes).toBe(0); // Deferred, not an error

    // No stub row
    const noRow = db.prepare(
      `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as { cnt: number };
    expect(noRow.cnt).toBe(0);

    // Step 2: Real OHLCV row arrives (simulate pushPricesHandler)
    insertOhlcv(db, "HPG", "2026-05-29", 62.5);

    // Step 3: Next 60s foreign-flow re-fetch -- now finds the row and UPDATEs it
    const updated = await writeForeignFlowToOhlcv(
      [{ code: "HPG", date: "2026-05-29", foreignBuyVol: 5000000, foreignSellVol: 2000000, putThroughVol: 0 }],
      db,
    );
    expect(updated.changes).toBe(1); // Now updated successfully

    // Step 4: Final state: real OHLCV + populated foreign flow
    const after = db.prepare(
      `SELECT close, foreign_buy_vol, foreign_sell_vol, foreign_net_vol
       FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as {
      close: number;
      foreign_buy_vol: number;
      foreign_sell_vol: number;
      foreign_net_vol: number;
    } | null;

    expect(after).not.toBeNull();
    expect(after!.close).toBe(62.5);              // Real OHLCV
    expect(after!.foreign_buy_vol).toBe(5000000); // Populated
    expect(after!.foreign_sell_vol).toBe(2000000);
    expect(after!.foreign_net_vol).toBe(3000000);
  });

  it("FIX-OHLCV-WRITER-SSOT-DURABLE: COUNT(*) = 0 after deferred write on empty DB (no stubs)", async () => {
    const db = getDb();
    db.prepare("DELETE FROM daily_ohlcv WHERE code IN ('HPG', 'VHM') AND date = '2026-05-29'").run();

    await writeForeignFlowToOhlcv(
      [
        { code: "HPG", date: "2026-05-29", foreignBuyVol: 1000, foreignSellVol: 500, putThroughVol: 0 },
        { code: "VHM", date: "2026-05-29", foreignBuyVol: 2000, foreignSellVol: 1500, putThroughVol: 100 },
      ],
      db,
    );

    // Merge-only: no stubs created, COUNT = 0
    const count = db.prepare(
      `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code IN ('HPG', 'VHM') AND date = '2026-05-29'`,
    ).get() as { cnt: number } | null;

    expect(count).not.toBeNull();
    expect(count!.cnt).toBe(0); // No stub rows
  });
});

// ---------------------------------------------------------------------------
// Empty input — should return changes = 0 without error
// ---------------------------------------------------------------------------

describe("DPI-4: empty input handled gracefully", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("returns changes = 0 for empty rows array", async () => {
    const db = getDb();
    const result = await writeForeignFlowToOhlcv([], db);
    expect(result.changes).toBe(0);
  });
});
