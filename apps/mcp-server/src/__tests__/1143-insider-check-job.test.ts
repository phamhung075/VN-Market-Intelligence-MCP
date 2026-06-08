/**
 * Task 1143 — insiderCheckJob refactor test
 *
 * Verifies:
 *   1. sendTelegramMarket is NOT called (Alert Commander exclusivity)
 *   2. Alert rows are inserted via INSERT OR IGNORE into alerts table
 *   3. Evidence fragments are inserted for accumulation streaks
 *   4. recordJobRun is used for observability
 *   5. No duplicate alert rows on same-day re-run
 *   6. Sell transactions do not trigger streak alerts
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a fresh in-memory DB with the minimum schema required by the job.
 */
function makeDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS insider_transactions (
      id                  TEXT PRIMARY KEY,
      code                TEXT NOT NULL,
      insider_name        TEXT NOT NULL,
      position            TEXT NOT NULL,
      type                TEXT NOT NULL CHECK(type IN ('buy','sell','other')),
      registered_volume   INTEGER NOT NULL DEFAULT 0,
      executed_volume     INTEGER NOT NULL DEFAULT 0,
      price               REAL NOT NULL DEFAULT 0,
      from_date           TEXT NOT NULL,
      to_date             TEXT NOT NULL,
      fetched_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT NOT NULL,
      affected_actions_json TEXT NOT NULL,
      analysis_ids_json     TEXT,
      message               TEXT NOT NULL,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      sent_by               TEXT NOT NULL DEFAULT 'server'
    );

    CREATE TABLE IF NOT EXISTS evidence_fragments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      stock        TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      direction    TEXT NOT NULL,
      magnitude    REAL NOT NULL,
      confidence   REAL NOT NULL,
      source_agent TEXT NOT NULL,
      timestamp    TEXT NOT NULL,
      ttl_days     INTEGER NOT NULL DEFAULT 30,
      expires_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT NOT NULL CHECK(status IN ('running','success','error')),
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    );
  `);

  return db;
}

/**
 * Seed insider_transactions with N buy rows for the given code/position on
 * distinct from_date values. executed_volume > 0 unless overridden.
 */
function seedBuyRows(
  db: Database,
  code: string,
  position: string,
  daysBack: number[],
  opts: { type?: "buy" | "sell" | "other"; executedVolume?: number } = {},
): void {
  const type = opts.type ?? "buy";
  const vol  = opts.executedVolume ?? 500_000;
  for (const d of daysBack) {
    const date = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
    db.prepare(`
      INSERT OR IGNORE INTO insider_transactions
        (id, code, insider_name, position, type,
         registered_volume, executed_volume, price,
         from_date, to_date, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `${code}-test-${d}`,
      code,
      "Nguyen Van A",
      position,
      type,
      vol,
      vol,
      50000,
      date,
      date,
      new Date().toISOString(),
    );
  }
}

// ── Module under test (loaded dynamically so mocks can be injected) ───────────

// We import the refactored job directly. The test verifies behaviour via DB
// state, not by spying on module internals (black-box approach).
// The job must accept an injected db + fetchInsiderTransactions override.

describe("Task 1143 — insiderCheckJob refactor", () => {
  it("runInsiderCheck does NOT call sendTelegramMarket", async () => {
    // Arrange: track whether sendTelegramMarket was invoked
    let marketCalled = false;
    const fakeSendMarket = async (_msg: string) => {
      marketCalled = true;
      return true;
    };

    const db = makeDb();
    // Seed 3 distinct buy days → streak >= 3
    seedBuyRows(db, "VCB", "chu tich hoi dong quan tri", [5, 10, 15]);

    const { runInsiderCheck } = await import("../scheduler/market-data/insiderCheckJob.js");

    // Call with an empty fetcher (no new raw rows) and injected market override
    await runInsiderCheck(db, async () => [], {
      sendMarket: fakeSendMarket,
    });

    expect(marketCalled).toBe(false);
  });

  it("runInsiderCheck inserts alert row when streak >= 3 buy days", async () => {
    const db = makeDb();
    seedBuyRows(db, "VNM", "giam doc dieu hanh", [2, 7, 14]);

    const { runInsiderCheck } = await import("../scheduler/market-data/insiderCheckJob.js");
    await runInsiderCheck(db, async () => []);

    const row = db.prepare(
      "SELECT id FROM alerts WHERE id LIKE 'insider-streak-VNM-%'",
    ).get() as { id: string } | undefined;

    expect(row).not.toBeUndefined();
    expect(row!.id).toMatch(/^insider-streak-VNM-/);
  });

  it("runInsiderCheck inserts evidence fragment when streak >= 3 buy days", async () => {
    const db = makeDb();
    seedBuyRows(db, "HPG", "pho tong giam doc", [3, 8, 20]);

    const { runInsiderCheck } = await import("../scheduler/market-data/insiderCheckJob.js");
    await runInsiderCheck(db, async () => []);

    type Row = { stock: string; evidence_type: string; direction: string };
    const frag = db.prepare(
      "SELECT stock, evidence_type, direction FROM evidence_fragments WHERE stock = 'HPG'",
    ).get() as Row | undefined;

    expect(frag).not.toBeUndefined();
    expect(frag!.stock).toBe("HPG");
    expect(frag!.evidence_type).toBe("insider_accumulation");
    expect(frag!.direction).toBe("bullish");
  });

  it("runInsiderCheck does NOT insert streak alert for sell transactions", async () => {
    const db = makeDb();
    // 5 sell days — should NOT trigger streak alert
    seedBuyRows(db, "FPT", "giam doc", [1, 5, 10, 15, 20], { type: "sell" });

    const { runInsiderCheck } = await import("../scheduler/market-data/insiderCheckJob.js");
    await runInsiderCheck(db, async () => []);

    const row = db.prepare(
      "SELECT id FROM alerts WHERE id LIKE 'insider-streak-FPT-%'",
    ).get() as { id: string } | undefined;

    // bun:sqlite .get() returns null (not undefined) when no row found
    expect(row == null).toBe(true);
  });

  it("runInsiderCheck deduplicates: second run same day does not insert duplicate alert", async () => {
    const db = makeDb();
    seedBuyRows(db, "VCB", "chu tich", [4, 9, 18]);

    const { runInsiderCheck } = await import("../scheduler/market-data/insiderCheckJob.js");
    await runInsiderCheck(db, async () => []);
    await runInsiderCheck(db, async () => []);

    type CountRow = { cnt: number };
    const result = db.prepare(
      "SELECT COUNT(*) as cnt FROM alerts WHERE id LIKE 'insider-streak-VCB-%'",
    ).get() as CountRow;

    expect(result.cnt).toBe(1);
  });

  it("runInsiderCheck uses recordJobRun (cron_job_runs row is written)", async () => {
    const db = makeDb();
    seedBuyRows(db, "VPB", "thanh vien hoi dong quan tri", [6, 11, 16]);

    const { runInsiderCheck } = await import("../scheduler/market-data/insiderCheckJob.js");
    await runInsiderCheck(db, async () => []);

    type RunRow = { job_name: string; status: string };
    const runRow = db.prepare(
      "SELECT job_name, status FROM cron_job_runs WHERE job_name = 'insiderCheckJob' LIMIT 1",
    ).get() as RunRow | undefined;

    expect(runRow).not.toBeUndefined();
    expect(runRow!.job_name).toBe("insiderCheckJob");
    expect(runRow!.status).toBe("success");
  });

  it("runInsiderCheck stores new raw transactions passed via fetcher override", async () => {
    const db = makeDb();

    const { runInsiderCheck } = await import("../scheduler/market-data/insiderCheckJob.js");
    await runInsiderCheck(db, async () => [
      {
        code: "TCB",
        insiderName: "Nguyen Thi B",
        position: "giam doc",
        type: "buy",
        registeredVolume: 1_000_000,
        executedVolume: 800_000,
        price: 35000,
        fromDate: "2026-04-01",
        toDate: "2026-04-10",
      },
    ]);

    type CountRow = { cnt: number };
    const result = db.prepare(
      "SELECT COUNT(*) as cnt FROM insider_transactions WHERE code = 'TCB'",
    ).get() as CountRow;

    expect(result.cnt).toBe(1);
  });
});
