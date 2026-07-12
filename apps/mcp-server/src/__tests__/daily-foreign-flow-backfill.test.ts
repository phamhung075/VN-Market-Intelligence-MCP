/**
 * TASK_2001 — SUBTASK-DAILY-FF-2 (ARCH-DAILY-FOREIGN-FLOW-TABLE)
 *
 * One-time idempotent backfill of legacy `daily_ohlcv.foreign_*` history into the
 * new authoritative `daily_foreign_flow` table (SUBTASK-DAILY-FF-1 / TASK_2000).
 *
 * Acceptance criteria covered (docs/handoffs/TASK_2001-daily-ff-backfill.md):
 *   - `INSERT OR IGNORE ... SELECT ...` backfill copies all 8 columns + (code,date) PK
 *   - Wired into the boot sequence (`initDatabase()`), same idempotent pattern as
 *     `migrateForeignFlowColumns()`
 *   - T-5: idempotency — running the backfill twice against a pre-seeded DB is a
 *     no-op on the second run (row count unchanged, no duplicates/errors)
 *   - Correctness: every `daily_ohlcv` row with foreign_* data ends up in
 *     `daily_foreign_flow` with identical values
 *   - Additive-only: a pre-existing `daily_foreign_flow` row is never overwritten
 *   - Rows with `foreign_buy_vol` AND `foreign_sell_vol` both NULL are not backfilled
 *   - Performance checkpoint: backfill of a few thousand rows completes well under 5s
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb, backfillDailyForeignFlow } from "../infrastructure/db/schema.js";

function seedLegacyOhlcvRow(
  code: string,
  date: string,
  opts: Partial<{
    foreign_buy_vol: number | null;
    foreign_sell_vol: number | null;
    foreign_net_vol: number | null;
    put_through_vol: number | null;
    foreign_buy_value: number | null;
    foreign_sell_value: number | null;
    updated_at: string;
  }> = {},
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO daily_ohlcv
      (code, date, open, high, low, close, volume, updated_at,
       foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
       foreign_buy_value, foreign_sell_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code,
    date,
    10,
    12,
    9,
    11,
    1000,
    opts.updated_at ?? now,
    opts.foreign_buy_vol ?? null,
    opts.foreign_sell_vol ?? null,
    opts.foreign_net_vol ?? null,
    opts.put_through_vol ?? null,
    opts.foreign_buy_value ?? null,
    opts.foreign_sell_value ?? null,
  );
}

describe("TASK_2001 — daily_foreign_flow backfill", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  it("T-5: backfill run twice against a pre-seeded DB is idempotent (no dup/error, row count unchanged)", () => {
    const db = getDb();
    seedLegacyOhlcvRow("BACKFILL-T5", "2026-01-05", {
      foreign_buy_vol: 1000,
      foreign_sell_vol: 900,
      foreign_net_vol: 100,
      put_through_vol: 50,
      foreign_buy_value: 5000,
      foreign_sell_value: 4500,
      updated_at: "2026-01-05T00:00:00.000Z",
    });

    expect(() => backfillDailyForeignFlow(db)).not.toThrow();
    const afterFirst = db
      .prepare(`SELECT COUNT(*) as cnt FROM daily_foreign_flow WHERE code=?`)
      .get("BACKFILL-T5") as { cnt: number };
    expect(afterFirst.cnt).toBe(1);

    // Second run — must be a no-op: no exception, no duplicate row.
    expect(() => backfillDailyForeignFlow(db)).not.toThrow();
    const afterSecond = db
      .prepare(`SELECT COUNT(*) as cnt FROM daily_foreign_flow WHERE code=?`)
      .get("BACKFILL-T5") as { cnt: number };
    expect(afterSecond.cnt).toBe(1);

    const row = db
      .prepare(
        `SELECT foreign_buy_vol, foreign_sell_vol, updated_at FROM daily_foreign_flow WHERE code=? AND date=?`,
      )
      .get("BACKFILL-T5", "2026-01-05") as { foreign_buy_vol: number; foreign_sell_vol: number; updated_at: string };
    expect(row.foreign_buy_vol).toBe(1000);
    expect(row.foreign_sell_vol).toBe(900);
    expect(row.updated_at).toBe("2026-01-05T00:00:00.000Z");
  });

  it("correctness: all 8 columns + PK copied identically from daily_ohlcv", () => {
    const db = getDb();
    seedLegacyOhlcvRow("BACKFILL-COLS", "2026-02-10", {
      foreign_buy_vol: 2000,
      foreign_sell_vol: 1800,
      foreign_net_vol: 200,
      put_through_vol: 75,
      foreign_buy_value: 9000,
      foreign_sell_value: 8100,
      updated_at: "2026-02-10T03:00:00.000Z",
    });

    backfillDailyForeignFlow(db);

    const row = db
      .prepare(
        `SELECT code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol,
                put_through_vol, foreign_buy_value, foreign_sell_value, updated_at
         FROM daily_foreign_flow WHERE code=? AND date=?`,
      )
      .get("BACKFILL-COLS", "2026-02-10") as Record<string, unknown>;

    expect(row).toEqual({
      code: "BACKFILL-COLS",
      date: "2026-02-10",
      foreign_buy_vol: 2000,
      foreign_sell_vol: 1800,
      foreign_net_vol: 200,
      put_through_vol: 75,
      foreign_buy_value: 9000,
      foreign_sell_value: 8100,
      updated_at: "2026-02-10T03:00:00.000Z",
    });
  });

  it("skips daily_ohlcv rows with both foreign_buy_vol and foreign_sell_vol NULL (per WHERE clause)", () => {
    const db = getDb();
    seedLegacyOhlcvRow("NO-FOREIGN-DATA", "2026-03-01"); // both null, no foreign fields set

    backfillDailyForeignFlow(db);

    const row = db
      .prepare(`SELECT * FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get("NO-FOREIGN-DATA", "2026-03-01");
    expect(row).toBeNull();
  });

  it("additive-only: a pre-existing daily_foreign_flow row is never overwritten by the backfill", () => {
    const db = getDb();
    // Pre-existing authoritative row (simulates writer-cutover-era data already present).
    db.prepare(
      `INSERT INTO daily_foreign_flow (code, date, foreign_buy_vol, foreign_sell_vol, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("PRE-EXISTING", "2026-04-01", 999, 888, "authoritative-value");

    // Legacy daily_ohlcv row for the SAME (code,date) with DIFFERENT (stale) values.
    seedLegacyOhlcvRow("PRE-EXISTING", "2026-04-01", {
      foreign_buy_vol: 1,
      foreign_sell_vol: 2,
      updated_at: "stale-legacy-value",
    });

    backfillDailyForeignFlow(db);

    const row = db
      .prepare(
        `SELECT foreign_buy_vol, foreign_sell_vol, updated_at FROM daily_foreign_flow WHERE code=? AND date=?`,
      )
      .get("PRE-EXISTING", "2026-04-01") as { foreign_buy_vol: number; foreign_sell_vol: number; updated_at: string };
    // INSERT OR IGNORE: PK conflict → row untouched, authoritative value preserved.
    expect(row.foreign_buy_vol).toBe(999);
    expect(row.foreign_sell_vol).toBe(888);
    expect(row.updated_at).toBe("authoritative-value");

    const count = db
      .prepare(`SELECT COUNT(*) as cnt FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get("PRE-EXISTING", "2026-04-01") as { cnt: number };
    expect(count.cnt).toBe(1); // no duplicate row created
  });

  it("wired into boot sequence: initDatabase() backfills legacy rows without a direct backfillDailyForeignFlow() call", async () => {
    const db = getDb();
    seedLegacyOhlcvRow("BOOT-WIRED", "2026-05-15", {
      foreign_buy_vol: 300,
      foreign_sell_vol: 250,
      updated_at: "2026-05-15T01:00:00.000Z",
    });

    // Pre-check: not yet in daily_foreign_flow (backfill has not run for this row yet).
    const before = db
      .prepare(`SELECT * FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get("BOOT-WIRED", "2026-05-15");
    expect(before).toBeNull();

    // Re-run the boot sequence (same in-memory connection — simulates a container
    // restart against the same DB file) WITHOUT calling backfillDailyForeignFlow directly.
    await initDatabase();

    const after = db
      .prepare(`SELECT foreign_buy_vol, foreign_sell_vol FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get("BOOT-WIRED", "2026-05-15") as { foreign_buy_vol: number; foreign_sell_vol: number };
    expect(after.foreign_buy_vol).toBe(300);
    expect(after.foreign_sell_vol).toBe(250);
  });

  it("performance checkpoint: backfill of 3000 legacy rows completes well under 5s", () => {
    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO daily_ohlcv
        (code, date, open, high, low, close, volume, updated_at, foreign_buy_vol, foreign_sell_vol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();
    for (let i = 0; i < 3000; i++) {
      insert.run(`PERF${i % 50}`, `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}-${i}`, 10, 12, 9, 11, 1000, now, 100 + i, 90 + i);
    }

    const start = Date.now();
    backfillDailyForeignFlow(db);
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(5000);
    const count = db.prepare(`SELECT COUNT(*) as cnt FROM daily_foreign_flow`).get() as { cnt: number };
    expect(count.cnt).toBe(3000);
  });
});
