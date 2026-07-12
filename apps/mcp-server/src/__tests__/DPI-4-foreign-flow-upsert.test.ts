// src/__tests__/DPI-4-foreign-flow-upsert.test.ts
// Sprint DATA-PIPELINE-INTEGRITY — DPI-4
// Unit tests for writeForeignFlowToOhlcv() behavior.
//
// FIX-OHLCV-WRITER-SSOT-DURABLE (2026-06-17, retired): the original DPI-4 UPSERT
// strategy (INSERT stub row with close=0 when no OHLCV row exists) was replaced
// with a merge-only UPDATE against daily_ohlcv (changes=0 = deferred).
//
// ARCH-DAILY-FOREIGN-FLOW-TABLE / TASK_2002 (2026-07-12, current): the merge-only
// strategy is itself retired. The writer now performs an UNCONDITIONAL upsert into
// the authoritative daily_foreign_flow table (TASK_2000) — no NOT NULL price
// coupling, so the write can never be deferred. daily_ohlcv.foreign_* columns are
// frozen/historical-only (backfilled once by TASK_2001) and are no longer written
// by this function in ANY mode.
//
// AC-1 (RE-UPDATED): no stub row created in daily_ohlcv when OHLCV row absent
//                     (unchanged invariant) -- but changes=1 now (write lands in
//                     daily_foreign_flow instead of being deferred)
// AC-7 (RE-UPDATED): foreign-flow lands immediately in daily_foreign_flow
//                     regardless of daily_ohlcv row presence -- no more deferral

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

describe("DPI-4 AC-1 (RE-UPDATED, ARCH-DAILY-FOREIGN-FLOW-TABLE/TASK_2002): unconditional upsert -- no daily_ohlcv stub, ever", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("ARCH-DAILY-FOREIGN-FLOW-TABLE: returns changes=1 (lands in daily_foreign_flow) and creates NO row in daily_ohlcv", async () => {
    // Verify empty before test
    const db = getDb();
    db.prepare("DELETE FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'").run();
    db.prepare("DELETE FROM daily_foreign_flow WHERE code = 'HPG' AND date = '2026-05-29'").run();

    const result = await writeForeignFlowToOhlcv(
      [{ code: "HPG", date: "2026-05-29", foreignBuyVol: 1000, foreignSellVol: 500, putThroughVol: 0 }],
      db,
    );

    // Unconditional upsert: changes=1 -- the write always lands, no deferral.
    expect(result.changes).toBe(1);

    // No stub row in daily_ohlcv: SELECT returns null (0 rows) -- invariant preserved.
    const row = db.prepare(
      `SELECT close FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as { close: number } | null;
    expect(row).toBeNull(); // No stub row

    // The row DID land in daily_foreign_flow.
    const ffRow = db.prepare(
      `SELECT foreign_buy_vol, foreign_sell_vol FROM daily_foreign_flow WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as { foreign_buy_vol: number; foreign_sell_vol: number } | null;
    expect(ffRow).not.toBeNull();
    expect(ffRow!.foreign_buy_vol).toBe(1000);
    expect(ffRow!.foreign_sell_vol).toBe(500);
  });

  it("writes foreign flow columns into daily_foreign_flow (not daily_ohlcv) without overwriting daily_ohlcv OHLCV columns", async () => {
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

    // daily_ohlcv OHLCV columns preserved; foreign_* columns UNTOUCHED (still NULL).
    const ohlcvRow = db.prepare(
      `SELECT open, high, low, close, volume, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol
       FROM daily_ohlcv WHERE code = 'VIC' AND date = '2026-05-29'`,
    ).get() as {
      open: number; high: number; low: number; close: number; volume: number;
      foreign_buy_vol: number | null; foreign_sell_vol: number | null;
      foreign_net_vol: number | null; put_through_vol: number | null;
    } | null;

    expect(ohlcvRow).not.toBeNull();
    // OHLCV preserved
    expect(ohlcvRow!.open).toBe(45.0);
    expect(ohlcvRow!.close).toBe(45.5);
    expect(ohlcvRow!.volume).toBe(1200000);
    // Foreign flow columns on daily_ohlcv UNTOUCHED -- SSOT freeze.
    expect(ohlcvRow!.foreign_buy_vol).toBeNull();
    expect(ohlcvRow!.foreign_sell_vol).toBeNull();
    expect(ohlcvRow!.foreign_net_vol).toBeNull();
    expect(ohlcvRow!.put_through_vol).toBeNull();

    // Foreign flow updated in the authoritative table instead.
    const ffRow = db.prepare(
      `SELECT foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol
       FROM daily_foreign_flow WHERE code = 'VIC' AND date = '2026-05-29'`,
    ).get() as {
      foreign_buy_vol: number; foreign_sell_vol: number;
      foreign_net_vol: number; put_through_vol: number;
    } | null;
    expect(ffRow).not.toBeNull();
    expect(ffRow!.foreign_buy_vol).toBe(300000);
    expect(ffRow!.foreign_sell_vol).toBe(200000);
    expect(ffRow!.foreign_net_vol).toBe(100000);
    expect(ffRow!.put_through_vol).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// AC-7: R-1 race — stub-row foreign flow values survive a subsequent OHLCV push
// ---------------------------------------------------------------------------

describe("DPI-4 AC-7 (RE-UPDATED, ARCH-DAILY-FOREIGN-FLOW-TABLE/TASK_2002): no more deferral -- lands immediately, real OHLCV insert independent", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });
  afterEach(() => { closeDb(); });

  it("ARCH-DAILY-FOREIGN-FLOW-TABLE: lands immediately (changes=1, not deferred), then real OHLCV arrives independently, both stay correct", async () => {
    const db = getDb();
    db.prepare("DELETE FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'").run();
    db.prepare("DELETE FROM daily_foreign_flow WHERE code = 'HPG' AND date = '2026-05-29'").run();

    // Step 1: foreign-flow lands immediately -- no OHLCV row yet, no deferral any more.
    const firstWrite = await writeForeignFlowToOhlcv(
      [{ code: "HPG", date: "2026-05-29", foreignBuyVol: 5000000, foreignSellVol: 2000000, putThroughVol: 0 }],
      db,
    );
    expect(firstWrite.changes).toBe(1); // Lands immediately -- R-1 structurally closed

    // Still no stub row in daily_ohlcv (invariant preserved via a different mechanism).
    const noRow = db.prepare(
      `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as { cnt: number };
    expect(noRow.cnt).toBe(0);

    // Step 2: Real OHLCV row arrives (simulate pushPricesHandler) -- independent of foreign-flow.
    insertOhlcv(db, "HPG", "2026-05-29", 62.5);

    // Step 3: Next 60s foreign-flow re-fetch -- upserts (updates in place, same row).
    const secondWrite = await writeForeignFlowToOhlcv(
      [{ code: "HPG", date: "2026-05-29", foreignBuyVol: 5500000, foreignSellVol: 2200000, putThroughVol: 10 }],
      db,
    );
    expect(secondWrite.changes).toBe(1); // Update path, same authoritative row

    // Step 4: Final state -- real OHLCV in daily_ohlcv, latest foreign flow in daily_foreign_flow.
    const ohlcvAfter = db.prepare(
      `SELECT close FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as { close: number } | null;
    expect(ohlcvAfter).not.toBeNull();
    expect(ohlcvAfter!.close).toBe(62.5); // Real OHLCV, untouched by the foreign-flow writer

    const ffAfter = db.prepare(
      `SELECT foreign_buy_vol, foreign_sell_vol, foreign_net_vol
       FROM daily_foreign_flow WHERE code = 'HPG' AND date = '2026-05-29'`,
    ).get() as {
      foreign_buy_vol: number;
      foreign_sell_vol: number;
      foreign_net_vol: number;
    } | null;
    expect(ffAfter).not.toBeNull();
    expect(ffAfter!.foreign_buy_vol).toBe(5500000);  // Latest write wins (upsert)
    expect(ffAfter!.foreign_sell_vol).toBe(2200000);
    expect(ffAfter!.foreign_net_vol).toBe(3300000);
  });

  it("ARCH-DAILY-FOREIGN-FLOW-TABLE: COUNT(*) = 0 in daily_ohlcv after write on empty DB (no stubs there); rows DO land in daily_foreign_flow", async () => {
    const db = getDb();
    db.prepare("DELETE FROM daily_ohlcv WHERE code IN ('HPG', 'VHM') AND date = '2026-05-29'").run();
    db.prepare("DELETE FROM daily_foreign_flow WHERE code IN ('HPG', 'VHM') AND date = '2026-05-29'").run();

    const result = await writeForeignFlowToOhlcv(
      [
        { code: "HPG", date: "2026-05-29", foreignBuyVol: 1000, foreignSellVol: 500, putThroughVol: 0 },
        { code: "VHM", date: "2026-05-29", foreignBuyVol: 2000, foreignSellVol: 1500, putThroughVol: 100 },
      ],
      db,
    );
    expect(result.changes).toBe(2); // Both rows land, never 0

    // Still no stub rows in daily_ohlcv.
    const count = db.prepare(
      `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code IN ('HPG', 'VHM') AND date = '2026-05-29'`,
    ).get() as { cnt: number } | null;
    expect(count).not.toBeNull();
    expect(count!.cnt).toBe(0); // No stub rows in daily_ohlcv

    // Both DID land in daily_foreign_flow.
    const ffCount = db.prepare(
      `SELECT COUNT(*) AS cnt FROM daily_foreign_flow WHERE code IN ('HPG', 'VHM') AND date = '2026-05-29'`,
    ).get() as { cnt: number };
    expect(ffCount.cnt).toBe(2);
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
