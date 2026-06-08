/**
 * BCTC-HIST-SEED — backfillBctcHistorical() tests
 *
 * Sprint: BCTC-ANALYTICS-LAYER
 * Root cause: bctc_vps_queue only ever held Q4-2025 and Q1-2026 rows because
 * the seeding pipeline was forward-only. backfillBctcHistorical() seeds the
 * last N quarters (default 8) before Q4-2025 so the VPS fetch loop can drain
 * them over time.
 *
 * Tests:
 *   1. Seeds the correct 8 quarter labels for a single ticker.
 *   2. Seeds rows for every watchlist ticker (34-ticker fleet test).
 *   3. Idempotency: a second call inserts 0 new rows.
 *   4. Existing rows (any status) are not overwritten (INSERT OR IGNORE semantics).
 *   5. periodsBack=2 seeds exactly 2 quarters (Q3-2025 + Q2-2025).
 *   6. backfillBctcHistorical is exported from seedWatchlist (compilation guard).
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { backfillBctcHistorical } from "../infrastructure/db/seedWatchlist.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMinimalDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT
    );
    CREATE TABLE bctc_vps_queue (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code    TEXT    NOT NULL,
      period_year    INTEGER NOT NULL,
      period_quarter TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'pending',
      source_url     TEXT,
      attempts       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Expected 8 quarters before Q4-2025 (the forward-seed baseline)
// ─────────────────────────────────────────────────────────────────────────────
const EXPECTED_8_QUARTERS = [
  { period_year: 2025, period_quarter: "Q3" },
  { period_year: 2025, period_quarter: "Q2" },
  { period_year: 2025, period_quarter: "Q1" },
  { period_year: 2024, period_quarter: "Q4" },
  { period_year: 2024, period_quarter: "Q3" },
  { period_year: 2024, period_quarter: "Q2" },
  { period_year: 2024, period_quarter: "Q1" },
  { period_year: 2023, period_quarter: "Q4" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Suite — backfillBctcHistorical()
// ─────────────────────────────────────────────────────────────────────────────

describe("BCTC-HIST-SEED — backfillBctcHistorical()", () => {
  it("seeds the correct 8 quarter labels for a single ticker", () => {
    const db = makeMinimalDb();
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("FPT");

    backfillBctcHistorical(db);

    const rows = db
      .prepare(
        `SELECT period_year, period_quarter, status, attempts
         FROM bctc_vps_queue
         WHERE action_code = 'FPT'
         ORDER BY period_year DESC, period_quarter DESC`,
      )
      .all() as Array<{
        period_year: number;
        period_quarter: string;
        status: string;
        attempts: number;
      }>;

    expect(rows.length).toBe(8);

    // Verify exact quarter labels in descending order
    const actual = rows.map((r) => ({
      period_year: r.period_year,
      period_quarter: r.period_quarter,
    }));
    expect(actual).toEqual(EXPECTED_8_QUARTERS);

    // All rows seeded as pending with 0 attempts
    for (const r of rows) {
      expect(r.status).toBe("pending");
      expect(r.attempts).toBe(0);
    }
  });

  it("seeds rows for all watchlist tickers (34-ticker fleet)", () => {
    const db = makeMinimalDb();

    // Seed all 34 watchlist tickers
    const TICKERS_34 = [
      "GAS", "PLX", "GVR", "VCB", "BID", "EIB", "MBB", "ACB", "CTG", "VPB",
      "VRE", "VIC", "VHM", "D2D", "HPG", "HSG", "NKG", "HVN", "ACV", "FPT",
      "VCI", "SSI", "HCM", "DAG", "DHG", "POW", "PPC", "NVL", "KBC", "TCH",
      "VNH", "DPM", "REE", "MWG",
    ];
    const ins = db.prepare("INSERT INTO watchlist (code) VALUES (?)");
    for (const code of TICKERS_34) {
      ins.run(code);
    }

    backfillBctcHistorical(db);

    const totalRows = (
      db.prepare("SELECT COUNT(*) AS n FROM bctc_vps_queue").get() as {
        n: number;
      }
    ).n;

    // 34 tickers × 8 quarters = 272 rows
    expect(totalRows).toBe(34 * 8);

    // Each ticker has exactly 8 rows
    const perTicker = db
      .prepare(
        "SELECT action_code, COUNT(*) AS n FROM bctc_vps_queue GROUP BY action_code ORDER BY action_code",
      )
      .all() as Array<{ action_code: string; n: number }>;
    expect(perTicker.length).toBe(34);
    for (const row of perTicker) {
      expect(row.n).toBe(8);
    }
  });

  it("is idempotent: calling twice inserts 0 additional rows", () => {
    const db = makeMinimalDb();
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("FPT");
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("VCB");

    backfillBctcHistorical(db);
    const countAfterFirst = (
      db.prepare("SELECT COUNT(*) AS n FROM bctc_vps_queue").get() as {
        n: number;
      }
    ).n;

    backfillBctcHistorical(db); // second call — must be no-op
    const countAfterSecond = (
      db.prepare("SELECT COUNT(*) AS n FROM bctc_vps_queue").get() as {
        n: number;
      }
    ).n;

    expect(countAfterFirst).toBe(2 * 8); // 2 tickers × 8 quarters
    expect(countAfterSecond).toBe(countAfterFirst); // no change
  });

  it("does not overwrite existing rows — INSERT OR IGNORE semantics", () => {
    const db = makeMinimalDb();
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("ACB");

    // Pre-seed Q3-2025 with a non-default status and attempts count
    db.prepare(
      `INSERT INTO bctc_vps_queue
         (action_code, period_year, period_quarter, status, attempts)
       VALUES ('ACB', 2025, 'Q3', 'done', 7)`,
    ).run();

    backfillBctcHistorical(db);

    // The pre-existing row must be untouched
    const row = db
      .prepare(
        `SELECT status, attempts FROM bctc_vps_queue
         WHERE action_code = 'ACB' AND period_year = 2025 AND period_quarter = 'Q3'`,
      )
      .get() as { status: string; attempts: number } | null;

    expect(row).not.toBeNull();
    expect(row!.status).toBe("done"); // not overwritten to 'pending'
    expect(row!.attempts).toBe(7); // not reset to 0

    // All 8 historical quarters are present (7 new + 1 pre-existing)
    const total = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM bctc_vps_queue WHERE action_code = 'ACB'",
        )
        .get() as { n: number }
    ).n;
    expect(total).toBe(8);
  });

  it("periodsBack=2 seeds exactly Q3-2025 and Q2-2025", () => {
    const db = makeMinimalDb();
    db.prepare("INSERT INTO watchlist (code) VALUES (?)").run("HPG");

    backfillBctcHistorical(db, 2);

    const rows = db
      .prepare(
        `SELECT period_year, period_quarter FROM bctc_vps_queue
         WHERE action_code = 'HPG'
         ORDER BY period_year DESC, period_quarter DESC`,
      )
      .all() as Array<{ period_year: number; period_quarter: string }>;

    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({ period_year: 2025, period_quarter: "Q3" });
    expect(rows[1]).toEqual({ period_year: 2025, period_quarter: "Q2" });
  });

  it("backfillBctcHistorical is exported from seedWatchlist (compilation guard)", async () => {
    const mod = await import("../infrastructure/db/seedWatchlist.js");
    expect(typeof mod.backfillBctcHistorical).toBe("function");
  });
});
