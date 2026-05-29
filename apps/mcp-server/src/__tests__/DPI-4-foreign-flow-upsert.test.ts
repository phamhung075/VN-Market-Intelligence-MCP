// src/__tests__/DPI-4-foreign-flow-upsert.test.ts
// Sprint DATA-PIPELINE-INTEGRITY — DPI-4
// Unit tests for writeForeignFlowToOhlcv() UPSERT and R-1 race preservation.
//
// AC-1: UPSERT creates stub row (close=0) when no (code, date) row exists
// AC-1: ON CONFLICT updates four foreign flow columns when row exists
// AC-5: close=0 satisfies NOT NULL constraint on stub rows
// AC-7: stub-row race — foreign flow values survive a subsequent OHLCV push
//       (server.ts secondary path fixed from INSERT OR REPLACE → ON CONFLICT)

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

describe("DPI-4 AC-1: UPSERT creates stub row when absent", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("creates stub row with close=0 and foreign flow values", async () => {
    const db = getDb();

    const result = await writeForeignFlowToOhlcv(
      [{ code: "HPG", date: "2026-05-29", foreignBuyVol: 1000, foreignSellVol: 500, putThroughVol: 0 }],
      db,
    );

    expect(result.changes).toBe(1);

    const row = db.prepare(
      `SELECT close, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol
       FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as {
      close: number;
      foreign_buy_vol: number;
      foreign_sell_vol: number;
      foreign_net_vol: number;
      put_through_vol: number;
    } | null;

    expect(row).not.toBeNull();
    expect(row!.close).toBe(0);
    expect(row!.foreign_buy_vol).toBe(1000);
    expect(row!.foreign_sell_vol).toBe(500);
    expect(row!.foreign_net_vol).toBe(500);   // 1000 - 500
    expect(row!.put_through_vol).toBe(0);
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

describe("DPI-4 AC-7: stub-row race — foreign flow survives OHLCV push", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("foreign flow values remain after real OHLCV push to same (code, date)", async () => {
    const db = getDb();

    // Step 1: storeForeignFlow creates stub row (close=0, foreign flow populated)
    await writeForeignFlowToOhlcv(
      [{ code: "HPG", date: "2026-05-29", foreignBuyVol: 5000000, foreignSellVol: 2000000, putThroughVol: 0 }],
      db,
    );

    // Verify stub row has foreign flow
    const stub = db.prepare(
      `SELECT close, foreign_buy_vol FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as { close: number; foreign_buy_vol: number } | null;
    expect(stub).not.toBeNull();
    expect(stub!.close).toBe(0);
    expect(stub!.foreign_buy_vol).toBe(5000000);

    // Step 2: Real OHLCV push via server.ts fixed path (ON CONFLICT DO UPDATE SET)
    insertOhlcv(db, "HPG", "2026-05-29", 62.5);

    // Step 3: Verify OHLCV updated AND foreign flow preserved
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
    expect(after!.close).toBe(62.5);            // OHLCV updated
    expect(after!.foreign_buy_vol).toBe(5000000);  // foreign flow preserved
    expect(after!.foreign_sell_vol).toBe(2000000);
    expect(after!.foreign_net_vol).toBe(3000000);
  });

  it("DB COUNT(*) WHERE foreign_buy_vol > 0 returns > 0 after stub inserts", async () => {
    const db = getDb();

    await writeForeignFlowToOhlcv(
      [
        { code: "HPG", date: "2026-05-29", foreignBuyVol: 1000, foreignSellVol: 500, putThroughVol: 0 },
        { code: "VHM", date: "2026-05-29", foreignBuyVol: 2000, foreignSellVol: 1500, putThroughVol: 100 },
      ],
      db,
    );

    const count = db.prepare(
      `SELECT COUNT(*) AS cnt FROM daily_ohlcv
       WHERE foreign_buy_vol > 0 OR foreign_sell_vol > 0 OR foreign_net_vol > 0 OR put_through_vol > 0`,
    ).get() as { cnt: number } | null;

    expect(count).not.toBeNull();
    expect(count!.cnt).toBeGreaterThan(0);
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
