/**
 * TASK_2005 — SUBTASK-DAILY-FF-6 (ARCH-DAILY-FOREIGN-FLOW-TABLE, FINAL verification subtask)
 *
 * Integration test + behavioral gate: R-1 elimination proof, end-to-end through
 * the MIGRATED read path (`daily_ohlcv_with_flow` view — the same view TASK_2003
 * pointed all 5 Class-A read sites at). This is deliberately NOT a re-run of the
 * unit-level writer proof already covered by `daily-foreign-flow-table.test.ts`
 * (TASK_2002) or the view-mechanics proof in `daily-foreign-flow-schema.test.ts`
 * (TASK_2000) — it composes writer + view together, the way a live Class-A tool
 * actually would, to verify (or falsify) the end-to-end claim.
 *
 * Depends on (both DONE_VERIFIED going into this task):
 *   - TASK_2002 (commit 3201c86cc): writeForeignFlowToOhlcv() unconditional
 *     upsert into daily_foreign_flow — write side of R-1.
 *   - TASK_2003 (commit 069a15014): 5 Class-A read sites migrated to
 *     `FROM daily_ohlcv_with_flow` — read side of R-1.
 *
 * Acceptance criteria covered (docs/handoffs/TASK_2005-daily-ff-integration-test.md):
 *   - T-3 (view correctness): daily_foreign_flow-only row (no daily_ohlcv row)
 *     read back through the view.
 *   - Behavioral gate (R-1 elimination proof): writeForeignFlowToOhlcv() for a
 *     (code,date) with ZERO daily_ohlcv rows, then read through the migrated
 *     view — this is the literal falsification of "chưa trả số từng mã"
 *     (feedback_foreign_flow_deferred_write_race_ohlcv_row.md).
 *   - View COALESCE precedence: new table wins when both sources exist; legacy
 *     fallback when only daily_ohlcv has data.
 *   - Late-OHLCV join: foreign-flow written first, daily_ohlcv bar arrives
 *     after — view returns correct foreign values via the JOIN, close is the
 *     real price (not 0, T-4 regression proof).
 *
 * ============================================================================
 * FINDING (per task instructions: "if the migrated read path does NOT actually
 * return the per-code value ... STOP — do not paper over it with a passing
 * test; report the failure"): the current `daily_ohlcv_with_flow` view
 * (schema-market-data.ts) is defined as
 *
 *   FROM daily_ohlcv o LEFT JOIN daily_foreign_flow f ON f.code=o.code AND f.date=o.date
 *
 * i.e. anchored on `daily_ohlcv` (the LEFT side is preserved, the RIGHT side is
 * matched-or-null). Standard SQL LEFT JOIN semantics: a row that exists ONLY in
 * `daily_foreign_flow` (no matching `daily_ohlcv` row) is NEVER returned by this
 * view, regardless of COALESCE — COALESCE only resolves *which column value*
 * wins once a row is already present from the anchor table; it cannot
 * manufacture a row the anchor table doesn't have.
 *
 * This means: for a ticker whose OHLCV bar has not landed yet, ALL 5 migrated
 * Class-A read sites (marketWideForeignFlowTool.ts, foreignFlowTools.ts,
 * foreignFlowAlertJob.ts, assembleEveningSummary.ts, franceSummaryJob.ts) still
 * return ZERO rows for that ticker/date — the exact "chưa trả số từng mã"
 * symptom, now reproduced one layer up from where TASK_2002 closed it. The
 * underlying `daily_foreign_flow` table write is genuinely never lost (proven
 * below, and already proven by TASK_2002's own tests) — so the *permanent*
 * data-loss half of R-1 IS closed. But the *transient immediate-read* half of
 * R-1 (the literal AC of this task: "returns foreign_buy_vol=100 ... even
 * though daily_ohlcv itself has no row for X/D yet") is NOT closed by the
 * current view definition. This was already flagged (but not escalated) in
 * daily-foreign-flow-schema.test.ts's own "R-1 view-level proof" test comment
 * (TASK_2000, SUBTASK-DAILY-FF-1) — this task surfaces it as a live, RED,
 * end-to-end failure rather than a passing "documents known behavior" note.
 *
 * Root-cause candidate for a follow-on FIX (NOT implemented here — additive
 * test-only task, no source modified): the view's join needs to be
 * bidirectional (e.g. `FROM daily_foreign_flow f LEFT JOIN daily_ohlcv o` union
 * with the current direction, or an emulated FULL OUTER JOIN) so a
 * daily_foreign_flow-only row is not dropped by the anchor table's absence.
 * ============================================================================
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { writeForeignFlowToOhlcv } from "../infrastructure/db/ohlcvForeignFlowStore.js";

function countDailyOhlcvRows(code: string, date: string): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as cnt FROM daily_ohlcv WHERE code=? AND date=?`)
    .get(code, date) as { cnt: number };
  return row.cnt;
}

function insertRealOhlcv(code: string, date: string, close: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(code, date, close - 5, close + 5, close - 10, close, 1_000_000, new Date().toISOString());
}

function queryViewRow(
  code: string,
  date: string,
): { close: number; foreign_buy_vol: number | null; foreign_sell_vol: number | null; foreign_net_vol: number | null } | null {
  const db = getDb();
  return db
    .prepare(
      `SELECT close, foreign_buy_vol, foreign_sell_vol, foreign_net_vol
       FROM daily_ohlcv_with_flow WHERE code=? AND date=?`,
    )
    .get(code, date) as
    | { close: number; foreign_buy_vol: number | null; foreign_sell_vol: number | null; foreign_net_vol: number | null }
    | null;
}

describe("TASK_2005 — daily-foreign-flow integration test (behavioral gate, R-1 elimination proof)", () => {
  beforeEach(async () => {
    closeDb();
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  it("T-3 (view correctness): daily_foreign_flow-only row (no daily_ohlcv row) is returned by daily_ohlcv_with_flow", () => {
    const db = getDb();
    const code = "T3-VIEW-ONLY";
    const date = "2026-07-12";

    expect(countDailyOhlcvRows(code, date)).toBe(0);

    db.prepare(
      `INSERT INTO daily_foreign_flow (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(code, date, 555, 444, 111, new Date().toISOString());

    // Underlying table has the row — write is never lost (TASK_2002 proof, corroborated).
    const raw = db
      .prepare(`SELECT foreign_buy_vol FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get(code, date) as { foreign_buy_vol: number };
    expect(raw.foreign_buy_vol).toBe(555);

    // AC: "returns correct value (from new table, not NULL from non-existent OHLCV row)"
    // FINDING: the view is anchored on daily_ohlcv (LEFT side) — a row that
    // exists ONLY in daily_foreign_flow is never surfaced by this view. This
    // assertion encodes the AC's intended spec and is expected to be RED,
    // proving the read-side gap documented in the file header.
    const viewRow = queryViewRow(code, date);
    expect(viewRow).not.toBeNull();
    expect(viewRow?.foreign_buy_vol).toBe(555);
  });

  it("Behavioral gate (R-1 elimination proof): writeForeignFlowToOhlcv for zero daily_ohlcv rows, then read through the MIGRATED view", async () => {
    const db = getDb();
    const code = "GATE-NOROW";
    const date = "2026-07-12";

    // Precondition per AC: seed ZERO daily_ohlcv rows for this ticker/date.
    expect(countDailyOhlcvRows(code, date)).toBe(0);

    const result = await writeForeignFlowToOhlcv(
      [
        {
          code,
          date,
          foreignBuyVol: 100,
          foreignSellVol: 80,
          putThroughVol: 10,
        },
      ],
      db,
    );

    // Write-side R-1 elimination (TASK_2002 scope) — this part is genuinely closed:
    // the write always lands, changes is never 0 for a valid row.
    expect(result.changes).toBe(1);

    // Corroborate the write landed in the authoritative table (data is not lost).
    const raw = db
      .prepare(`SELECT foreign_buy_vol, foreign_sell_vol FROM daily_foreign_flow WHERE code=? AND date=?`)
      .get(code, date) as { foreign_buy_vol: number; foreign_sell_vol: number };
    expect(raw.foreign_buy_vol).toBe(100);
    expect(raw.foreign_sell_vol).toBe(80);

    // AC: "Assert daily_ohlcv_with_flow returns foreign_buy_vol=100 for X/D
    // EVEN THOUGH daily_ohlcv itself has no row for X/D yet" — this is the
    // literal read-path falsification of "chưa trả số từng mã". Per the file
    // header FINDING, the view's LEFT JOIN anchored on daily_ohlcv cannot
    // surface a daily_foreign_flow-only row — this is the direct, end-to-end
    // reproduction of the still-open read-side gap. Expected RED.
    const viewRow = queryViewRow(code, date);
    expect(viewRow).not.toBeNull();
    expect(viewRow?.foreign_buy_vol).toBe(100);
  });

  it("View COALESCE precedence: new daily_foreign_flow value wins when both sources exist for the same (code,date)", () => {
    const db = getDb();
    const code = "COALESCE-BOTH";
    const date = "2026-07-12";
    const now = new Date().toISOString();

    // Anchor row exists (daily_ohlcv) with legacy foreign_buy_vol=111.
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at, foreign_buy_vol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(code, date, 10, 12, 9, 11, 1000, now, 111);

    // New table row for the same (code,date): foreign_buy_vol=999.
    db.prepare(
      `INSERT INTO daily_foreign_flow (code, date, foreign_buy_vol, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(code, date, 999, now);

    const viewRow = queryViewRow(code, date);
    expect(viewRow).not.toBeNull();
    expect(viewRow?.foreign_buy_vol).toBe(999); // new table wins over legacy 111
    expect(viewRow?.close).toBe(11); // OHLCV columns pass through unaffected
  });

  it("View COALESCE precedence: falls back to legacy daily_ohlcv value when only legacy exists (no daily_foreign_flow row)", () => {
    const db = getDb();
    const code = "COALESCE-LEGACY-ONLY";
    const date = "2026-07-12";
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at, foreign_buy_vol, foreign_sell_vol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(code, date, 10, 12, 9, 11, 1000, now, 222, 200);

    const viewRow = queryViewRow(code, date);
    expect(viewRow).not.toBeNull();
    expect(viewRow?.foreign_buy_vol).toBe(222); // legacy fallback
    expect(viewRow?.foreign_sell_vol).toBe(200);
  });

  it("Late-OHLCV join (T-4 regression proof): foreign-flow written first (no OHLCV row), daily_ohlcv bar arrives AFTER — view returns correct foreign values via the JOIN and close is the real price (not 0)", async () => {
    const db = getDb();
    const code = "LATE-OHLCV";
    const date = "2026-07-12";

    // Step 1: foreignFlowFetcherJob-style write fires BEFORE the OHLCV bar exists.
    expect(countDailyOhlcvRows(code, date)).toBe(0);
    const result = await writeForeignFlowToOhlcv(
      [{ code, date, foreignBuyVol: 300, foreignSellVol: 250, putThroughVol: 20 }],
      db,
    );
    expect(result.changes).toBe(1);

    // Step 2: pushPricesHandler-style write lands AFTER (simulated real OHLCV bar).
    insertRealOhlcv(code, date, 205);

    // Step 3: the view now resolves the JOIN correctly — anchor row exists,
    // so both the real price and the foreign-flow values (written earlier,
    // never overwritten by the later OHLCV insert) are visible together.
    const viewRow = queryViewRow(code, date);
    expect(viewRow).not.toBeNull();
    expect(viewRow?.close).toBe(205); // real price, not 0 (T-4 regression proof)
    expect(viewRow?.foreign_buy_vol).toBe(300); // foreign values preserved, no overwrite
    expect(viewRow?.foreign_sell_vol).toBe(250);
    expect(viewRow?.foreign_net_vol).toBe(50);
  });
});
