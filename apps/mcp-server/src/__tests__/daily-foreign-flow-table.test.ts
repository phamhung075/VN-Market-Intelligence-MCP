/**
 * TASK_2002 — SUBTASK-DAILY-FF-3 (ARCH-DAILY-FOREIGN-FLOW-TABLE, writer cutover)
 *
 * `writeForeignFlowToOhlcv()` rewritten to an UNCONDITIONAL upsert into the
 * authoritative `daily_foreign_flow` table (TASK_2000). No longer writes
 * `daily_ohlcv.foreign_*` at all — those columns are frozen/historical-only
 * (populated once by TASK_2001's backfill).
 *
 * Acceptance criteria covered (docs/handoffs/TASK_2002-daily-ff-writer-cutover.md):
 *   - T-1: zero daily_ohlcv rows => changes=1, row lands in daily_foreign_flow
 *          with correct values (direct R-1-elimination proof)
 *   - T-2: existing daily_ohlcv row (no daily_foreign_flow row yet) => row
 *          created in daily_foreign_flow; daily_ohlcv.foreign_* UNTOUCHED
 *   - T-4: after T-1, `SELECT close FROM daily_ohlcv ...` returns ZERO rows
 *          (no stub INSERT with close=0 — regression proof, direct descendant
 *          of the FIX-OHLCV-WRITER-SSOT-DURABLE T-4)
 *   - T-5: backfill idempotency — full suite already lives in
 *          daily-foreign-flow-backfill.test.ts (TASK_2001); NOT duplicated
 *          here per the handoff's "reference, don't duplicate unnecessarily"
 *          instruction. This file instead adds ONE interaction test proving
 *          the writer's fresh authoritative row survives a subsequent
 *          backfill run untouched (INSERT OR IGNORE never clobbers it).
 *   - changes=0 can no longer occur for any non-empty, valid row (was the
 *     entire point of the retired merge-only strategy's changes=0 contract)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import {
  initDatabase,
  getDb,
  closeDb,
  backfillDailyForeignFlow,
} from "../infrastructure/db/schema.js";
import { writeForeignFlowToOhlcv } from "../infrastructure/db/ohlcvForeignFlowStore.js";

function insertRealOhlcv(
  code: string,
  date: string,
  close = 105,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(code, date, 100, 110, 95, close, 1_000_000, new Date().toISOString());
}

describe("TASK_2002 — writeForeignFlowToOhlcv writer cutover (unconditional upsert)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  it("T-1: zero daily_ohlcv rows => changes=1, correct row lands in daily_foreign_flow (R-1 elimination proof)", async () => {
    const db = getDb();

    // Precondition: zero daily_ohlcv rows for this (code, date).
    const preCount = db
      .prepare(`SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code=? AND date=?`)
      .get("T1-NOROW", "2026-07-12") as { cnt: number };
    expect(preCount.cnt).toBe(0);

    const result = await writeForeignFlowToOhlcv(
      [
        {
          code: "T1-NOROW",
          date: "2026-07-12",
          foreignBuyVol: 1000,
          foreignSellVol: 900,
          putThroughVol: 500,
          foreignBuyValue: 50_000_000,
          foreignSellValue: 45_000_000,
        },
      ],
      db,
    );

    // Direct R-1-elimination proof: changes=1, NOT 0 — the write always lands.
    expect(result.changes).toBe(1);

    const row = db
      .prepare(
        `SELECT foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
                foreign_buy_value, foreign_sell_value
         FROM daily_foreign_flow WHERE code=? AND date=?`,
      )
      .get("T1-NOROW", "2026-07-12") as Record<string, number> | null;

    expect(row).not.toBeNull();
    expect(row!["foreign_buy_vol"]).toBe(1000);
    expect(row!["foreign_sell_vol"]).toBe(900);
    expect(row!["foreign_net_vol"]).toBe(100); // 1000 - 900
    expect(row!["put_through_vol"]).toBe(500);
    expect(row!["foreign_buy_value"]).toBe(50_000_000);
    expect(row!["foreign_sell_value"]).toBe(45_000_000);
  });

  it("T-2: existing daily_ohlcv row (no daily_foreign_flow row yet) => row created in daily_foreign_flow; daily_ohlcv.foreign_* UNTOUCHED", async () => {
    const db = getDb();
    insertRealOhlcv("T2-EXISTS", "2026-07-12", 105);

    const before = db
      .prepare(
        `SELECT open, high, low, close, volume,
                foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol
         FROM daily_ohlcv WHERE code=? AND date=?`,
      )
      .get("T2-EXISTS", "2026-07-12") as Record<string, unknown>;
    // Fresh row inserted with no foreign columns set — all NULL pre-write.
    expect(before["foreign_buy_vol"]).toBeNull();
    expect(before["foreign_sell_vol"]).toBeNull();

    const result = await writeForeignFlowToOhlcv(
      [
        {
          code: "T2-EXISTS",
          date: "2026-07-12",
          foreignBuyVol: 2000,
          foreignSellVol: 1800,
          putThroughVol: 1000,
          foreignBuyValue: 100_000_000,
          foreignSellValue: 90_000_000,
        },
      ],
      db,
    );
    expect(result.changes).toBe(1);

    // daily_foreign_flow row created with the correct values.
    const ffRow = db
      .prepare(
        `SELECT foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol
         FROM daily_foreign_flow WHERE code=? AND date=?`,
      )
      .get("T2-EXISTS", "2026-07-12") as Record<string, number>;
    expect(ffRow["foreign_buy_vol"]).toBe(2000);
    expect(ffRow["foreign_sell_vol"]).toBe(1800);
    expect(ffRow["foreign_net_vol"]).toBe(200);
    expect(ffRow["put_through_vol"]).toBe(1000);

    // daily_ohlcv.foreign_* columns UNTOUCHED (still NULL — writer never touches them).
    const after = db
      .prepare(
        `SELECT open, high, low, close, volume,
                foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol
         FROM daily_ohlcv WHERE code=? AND date=?`,
      )
      .get("T2-EXISTS", "2026-07-12") as Record<string, unknown>;
    expect(after["open"]).toBe(before["open"]);
    expect(after["high"]).toBe(before["high"]);
    expect(after["low"]).toBe(before["low"]);
    expect(after["close"]).toBe(before["close"]); // 105, not 0
    expect(after["volume"]).toBe(before["volume"]);
    expect(after["foreign_buy_vol"]).toBeNull();
    expect(after["foreign_sell_vol"]).toBeNull();
    expect(after["foreign_net_vol"]).toBeNull();
    expect(after["put_through_vol"]).toBeNull();
  });

  it("T-4: REGRESSION PROOF — after T-1-style write, SELECT close FROM daily_ohlcv returns ZERO rows (no close=0 stub)", async () => {
    const db = getDb();

    const result = await writeForeignFlowToOhlcv(
      [
        {
          code: "T4-REGRESSION",
          date: "2026-07-12",
          foreignBuyVol: 500,
          foreignSellVol: 450,
          putThroughVol: 250,
          foreignBuyValue: 25_000_000,
          foreignSellValue: 22_500_000,
        },
      ],
      db,
    );
    expect(result.changes).toBe(1);

    // ZERO rows in daily_ohlcv — write never creates a stub there, ever.
    const rows = db
      .prepare(`SELECT close FROM daily_ohlcv WHERE code=? AND date=?`)
      .all("T4-REGRESSION", "2026-07-12") as { close: number }[];
    expect(rows.length).toBe(0);
    expect(rows.some((r) => r.close === 0)).toBe(false); // belt-and-suspenders

    // Belt-and-suspenders: daily_foreign_flow DID get the row (write succeeded).
    const ffCount = db
      .prepare(`SELECT COUNT(*) as cnt FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get("T4-REGRESSION", "2026-07-12") as { cnt: number };
    expect(ffCount.cnt).toBe(1);
  });

  it("T-5 (interaction, not duplication — full idempotency suite lives in daily-foreign-flow-backfill.test.ts / TASK_2001): a fresh writer row survives a subsequent backfill run untouched", async () => {
    const db = getDb();

    // Writer lands a fresh authoritative row (post-cutover write, no daily_ohlcv row).
    await writeForeignFlowToOhlcv(
      [
        {
          code: "T5-INTERACTION",
          date: "2026-07-12",
          foreignBuyVol: 777,
          foreignSellVol: 111,
          putThroughVol: 10,
          foreignBuyValue: 1,
          foreignSellValue: 2,
        },
      ],
      db,
    );

    // Run the TASK_2001 backfill (safe-on-every-boot, INSERT OR IGNORE) — must
    // be a no-op against this row: PK conflict on (code, date) means the
    // pre-existing authoritative row from the writer is never overwritten.
    expect(() => backfillDailyForeignFlow(db)).not.toThrow();

    const row = db
      .prepare(
        `SELECT foreign_buy_vol, foreign_sell_vol FROM daily_foreign_flow WHERE code=? AND date=?`,
      )
      .get("T5-INTERACTION", "2026-07-12") as { foreign_buy_vol: number; foreign_sell_vol: number };
    expect(row.foreign_buy_vol).toBe(777);
    expect(row.foreign_sell_vol).toBe(111);

    const count = db
      .prepare(`SELECT COUNT(*) as cnt FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get("T5-INTERACTION", "2026-07-12") as { cnt: number };
    expect(count.cnt).toBe(1); // no duplicate row from backfill
  });

  it("changes=0 can no longer occur for a valid (non-empty) row — proven generically across codes with/without a daily_ohlcv row", async () => {
    const db = getDb();
    insertRealOhlcv("GEN-WITH-ROW", "2026-07-12", 50);
    // GEN-NO-ROW deliberately has no daily_ohlcv row.

    const result = await writeForeignFlowToOhlcv(
      [
        { code: "GEN-WITH-ROW", date: "2026-07-12", foreignBuyVol: 10, foreignSellVol: 5, putThroughVol: 1 },
        { code: "GEN-NO-ROW", date: "2026-07-12", foreignBuyVol: 20, foreignSellVol: 15, putThroughVol: 2 },
      ],
      db,
    );

    // Every row counts as a change — 2 rows in, 2 changes out. Never 0.
    expect(result.changes).toBe(2);

    for (const code of ["GEN-WITH-ROW", "GEN-NO-ROW"]) {
      const ffRow = db
        .prepare(`SELECT 1 FROM daily_foreign_flow WHERE code=? AND date=?`)
        .get(code, "2026-07-12");
      expect(ffRow).not.toBeNull();
    }
  });

  it("ON CONFLICT DO UPDATE path: second write for the same (code, date) updates in place (upsert, not duplicate)", async () => {
    const db = getDb();

    const first = await writeForeignFlowToOhlcv(
      [{ code: "UPSERT-TEST", date: "2026-07-12", foreignBuyVol: 100, foreignSellVol: 50, putThroughVol: 10 }],
      db,
    );
    expect(first.changes).toBe(1);

    const second = await writeForeignFlowToOhlcv(
      [{ code: "UPSERT-TEST", date: "2026-07-12", foreignBuyVol: 200, foreignSellVol: 80, putThroughVol: 20 }],
      db,
    );
    expect(second.changes).toBe(1); // still 1 — UPDATE path, not a new row

    const count = db
      .prepare(`SELECT COUNT(*) as cnt FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get("UPSERT-TEST", "2026-07-12") as { cnt: number };
    expect(count.cnt).toBe(1); // no duplicate row

    const row = db
      .prepare(`SELECT foreign_buy_vol, foreign_sell_vol, foreign_net_vol FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get("UPSERT-TEST", "2026-07-12") as { foreign_buy_vol: number; foreign_sell_vol: number; foreign_net_vol: number };
    expect(row.foreign_buy_vol).toBe(200); // latest values win
    expect(row.foreign_sell_vol).toBe(80);
    expect(row.foreign_net_vol).toBe(120);
  });

  it("empty rows array: changes=0, no-op (unchanged from prior strategy — not a regression)", async () => {
    const db = getDb();
    const result = await writeForeignFlowToOhlcv([], db);
    expect(result.changes).toBe(0);
  });
});
