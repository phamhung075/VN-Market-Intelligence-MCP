/**
 * Task 1503 — OHLCV foreign flow integration (TDD RED phase)
 *
 * AC1: daily_ohlcv has columns foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol after migration
 * AC2: writeForeignFlowToOhlcv updates existing OHLCV row and computes foreign_net_vol = buy - sell
 * AC3: writeForeignFlowToOhlcv returns 0 when no matching OHLCV row (update-only, no stub rows)
 * AC4: assembleEveningSummary result has foreignFlowMovers field; top entry has largest |foreignNetVol|
 * AC5: eveningSummaryJob formatter includes "Khối ngoại" block when foreignFlowMovers.length > 0
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DB bootstrap helpers (inline — avoids pulling in production schema)
// ─────────────────────────────────────────────────────────────────────────────

function buildBaseDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL DEFAULT 0,
      high       REAL NOT NULL DEFAULT 0,
      low        REAL NOT NULL DEFAULT 0,
      close      REAL NOT NULL DEFAULT 0,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      code     TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code       TEXT PRIMARY KEY,
      price      REAL,
      change_amt REAL,
      change_pct REAL,
      volume     REAL,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      source_title TEXT,
      level        TEXT,
      sentiment    TEXT,
      impact_score REAL,
      created_at   TEXT,
      data_env TEXT
,
    source_url TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS alerts (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      severity              TEXT,
      message               TEXT,
      affected_actions_json TEXT,
      triggered_at          TEXT
    );
    CREATE TABLE IF NOT EXISTS market_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT,
      sent_at    TEXT
    );
    CREATE TABLE IF NOT EXISTS positions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      code      TEXT NOT NULL UNIQUE,
      shares    INTEGER NOT NULL,
      avg_price REAL NOT NULL,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      notes     TEXT
    );
    CREATE TABLE IF NOT EXISTS prediction_signals (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      question   TEXT,
      severity   TEXT,
      created_at TEXT
    );
  `);
  return db;
}

/** Add foreign flow columns to daily_ohlcv (simulates migration already run). */
function addForeignFlowCols(db: Database): void {
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN foreign_buy_vol   REAL`);
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN foreign_sell_vol  REAL`);
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN foreign_net_vol   REAL`);
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN put_through_vol   REAL`);
  // FIX-FOREIGN-FLOW-COVERAGE: VND money-value columns (added 2026-06-16)
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN foreign_buy_value  REAL`);
  db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN foreign_sell_value REAL`);
}

/**
 * ARCH-DAILY-FOREIGN-FLOW-TABLE (TASK_2000/TASK_2002): the writer now targets
 * this table exclusively — daily_ohlcv.foreign_* is frozen/historical-only.
 * This minimal test DB doesn't run the full schema-market-data.ts bootstrap,
 * so the table is created inline here (mirrors the production DDL).
 */
function addDailyForeignFlowTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_foreign_flow (
      code               TEXT NOT NULL,
      date               TEXT NOT NULL,
      foreign_buy_vol    REAL,
      foreign_sell_vol   REAL,
      foreign_net_vol    REAL,
      put_through_vol    REAL,
      foreign_buy_value  REAL,
      foreign_sell_value REAL,
      updated_at         TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    );
  `);
}

/**
 * TASK_2003 (SUBTASK-DAILY-FF-4): assembleEveningSummary's default foreign-flow
 * mover query now reads from daily_ohlcv_with_flow. Mirrors the production
 * view DDL in schema-market-data.ts (kept in sync manually — this file
 * explicitly avoids importing production schema, see file header above).
 */
function addForeignFlowCompatView(db: Database): void {
  const cols = db
    .prepare<{ name: string }, []>("PRAGMA table_info(daily_ohlcv)")
    .all()
    .map((r) => r.name);
  if (!cols.includes("data_env")) {
    db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN data_env TEXT`);
  }
  addDailyForeignFlowTable(db); // idempotent — no-op if already created
  db.exec(`
    CREATE VIEW IF NOT EXISTS daily_ohlcv_with_flow AS
    SELECT
      o.code, o.date, o.open, o.high, o.low, o.close, o.volume, o.updated_at, o.data_env,
      COALESCE(f.foreign_buy_vol,    o.foreign_buy_vol)    AS foreign_buy_vol,
      COALESCE(f.foreign_sell_vol,   o.foreign_sell_vol)   AS foreign_sell_vol,
      COALESCE(f.foreign_net_vol,    o.foreign_net_vol)    AS foreign_net_vol,
      COALESCE(f.put_through_vol,    o.put_through_vol)    AS put_through_vol,
      COALESCE(f.foreign_buy_value,  o.foreign_buy_value)  AS foreign_buy_value,
      COALESCE(f.foreign_sell_value, o.foreign_sell_value) AS foreign_sell_value
    FROM daily_ohlcv o
    LEFT JOIN daily_foreign_flow f ON f.code = o.code AND f.date = o.date;
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve the store module — returns null when module not yet implemented
// ─────────────────────────────────────────────────────────────────────────────

type ForeignFlowRow = {
  code: string;
  date: string;
  foreignBuyVol: number;
  foreignSellVol: number;
  putThroughVol: number;
};

type WriteForeignFlowFn = (
  rows: ForeignFlowRow[],
  db: Database,
) => Promise<{ changes: number }>;

async function resolveWriteFn(): Promise<WriteForeignFlowFn | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import("../infrastructure/db/ohlcvForeignFlowStore.js" as any);
    const fn = (mod as Record<string, unknown>)["writeForeignFlowToOhlcv"];
    return typeof fn === "function" ? (fn as WriteForeignFlowFn) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1: daily_ohlcv has foreign flow columns after migration
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1503 AC1 — daily_ohlcv foreign flow columns", () => {
  it("daily_ohlcv has foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol after migration", async () => {
    const db = buildBaseDb();

    // Import and run the migration that adds foreign flow columns
    const schemaModule = await import("../infrastructure/db/schema.js");
    const migrateFn = (schemaModule as Record<string, unknown>)["migrateForeignFlowColumns"] as
      | ((db: Database) => Promise<void>)
      | undefined;

    if (!migrateFn) throw new Error("migrateForeignFlowColumns not implemented yet");

    await migrateFn(db);

    const cols = db
      .prepare<{ name: string }, []>("PRAGMA table_info(daily_ohlcv)")
      .all()
      .map((r) => r.name);

    expect(cols).toContain("foreign_buy_vol");
    expect(cols).toContain("foreign_sell_vol");
    expect(cols).toContain("foreign_net_vol");
    expect(cols).toContain("put_through_vol");

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2: writeForeignFlowToOhlcv updates row and sets foreign_net_vol = buy - sell
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1503 AC2 (ARCH-DAILY-FOREIGN-FLOW-TABLE cutover, TASK_2002) — writeForeignFlowToOhlcv updates daily_foreign_flow", () => {
  it("updates existing OHLCV row's ticker: changes=1 and foreign_net_vol = buy - sell (in daily_foreign_flow, not daily_ohlcv)", async () => {
    const db = buildBaseDb();
    addForeignFlowCols(db);
    addDailyForeignFlowTable(db);

    // Seed a VCB OHLCV row for the target date
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES ('VCB', '2026-04-19', 80000, 82000, 79000, 81000, 5000000, datetime('now'))`,
    ).run();

    const writeFn = await resolveWriteFn();
    if (!writeFn) throw new Error("writeForeignFlowToOhlcv not implemented yet");

    const result = await writeFn(
      [
        {
          code: "VCB",
          date: "2026-04-19",
          foreignBuyVol: 1000,
          foreignSellVol: 600,
          putThroughVol: 50,
        },
      ],
      db,
    );

    // ARCH-DAILY-FOREIGN-FLOW-TABLE: unconditional upsert — always 1, never deferred.
    expect(result.changes).toBe(1);

    // Authoritative row lands in daily_foreign_flow (SSOT-frozen: daily_ohlcv.foreign_* untouched).
    const row = db
      .prepare<{ foreign_net_vol: number | null }, []>(
        `SELECT foreign_net_vol FROM daily_foreign_flow WHERE code = 'VCB' AND date = '2026-04-19'`,
      )
      .get();

    expect(row).not.toBeNull();
    expect(row!.foreign_net_vol).toBe(400); // 1000 - 600

    // daily_ohlcv.foreign_net_vol stays NULL — writer no longer touches it.
    const legacyRow = db
      .prepare<{ foreign_net_vol: number | null }, []>(
        `SELECT foreign_net_vol FROM daily_ohlcv WHERE code = 'VCB' AND date = '2026-04-19'`,
      )
      .get();
    expect(legacyRow!.foreign_net_vol).toBeNull();

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3: writeForeignFlowToOhlcv returns 0 when no matching OHLCV row
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1503 AC3 (RE-UPDATED per ARCH-DAILY-FOREIGN-FLOW-TABLE cutover, TASK_2002) — writeForeignFlowToOhlcv: unconditional upsert, no daily_ohlcv stub", () => {
  it("ARCH-DAILY-FOREIGN-FLOW-TABLE: returns changes=1 (write always lands in daily_foreign_flow); daily_ohlcv still gets NO stub row", async () => {
    // FIX-OHLCV-WRITER-SSOT-DURABLE (retired): merge-only UPDATE deferred (changes=0)
    // when no OHLCV row existed. ARCH-DAILY-FOREIGN-FLOW-TABLE (TASK_2002) structurally
    // eliminates the deferral: the write now unconditionally upserts into
    // daily_foreign_flow, which has no NOT NULL price coupling. daily_ohlcv itself
    // still never gets a stub row — that invariant is preserved, just via a
    // different mechanism (the writer no longer touches daily_ohlcv at all).
    const db = buildBaseDb();
    addForeignFlowCols(db);
    addDailyForeignFlowTable(db);

    // No OHLCV row seeded for HPG/2026-04-19
    const writeFn = await resolveWriteFn();
    if (!writeFn) throw new Error("writeForeignFlowToOhlcv not implemented yet");

    const result = await writeFn(
      [
        {
          code: "HPG",
          date: "2026-04-19",
          foreignBuyVol: 500,
          foreignSellVol: 300,
          putThroughVol: 0,
        },
      ],
      db,
    );

    // Unconditional upsert: changes=1, never 0 for a valid row.
    expect(result.changes).toBe(1);

    // Still no stub row in daily_ohlcv: COUNT = 0 (invariant preserved).
    const row = db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt FROM daily_ohlcv WHERE code = 'HPG' AND date = '2026-04-19'`,
      )
      .get();
    expect(row!.cnt).toBe(0); // No stub row

    // The row DID land in daily_foreign_flow (the whole point of the cutover).
    const ffRow = db
      .prepare<{ foreign_buy_vol: number }, []>(
        `SELECT foreign_buy_vol FROM daily_foreign_flow WHERE code = 'HPG' AND date = '2026-04-19'`,
      )
      .get();
    expect(ffRow).not.toBeNull();
    expect(ffRow!.foreign_buy_vol).toBe(500);

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4: assembleEveningSummary result has foreignFlowMovers field
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1503 AC4 — assembleEveningSummary includes foreignFlowMovers", () => {
  it("result has foreignFlowMovers field; top entry has largest |foreignNetVol|", async () => {
    const db = buildBaseDb();
    addForeignFlowCols(db);
    addForeignFlowCompatView(db);

    // Seed two OHLCV rows with foreign flow — VCB has bigger |foreignNetVol|
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at,
        foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol)
       VALUES ('VCB', '2026-04-19', 80000, 82000, 79000, 81000, 5000000, datetime('now'),
        2000, 500, 1500, 100)`,
    ).run();
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at,
        foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol)
       VALUES ('HPG', '2026-04-19', 30000, 31000, 29500, 30500, 8000000, datetime('now'),
        300, 800, -500, 0)`,
    ).run();

    const { assembleEveningSummary } = await import(
      "../application/usecases/assembleEveningSummary.js"
    );

    const summary = await assembleEveningSummary({
      db,
      reportsDir: "/tmp/1503-test-reports",
      computeTaFn: () => null,
      getNewsCountFn: () => 0,
      getPredictionSignalsFn: async () => [],
      getPnlFn: async () => null,
    });

    // foreignFlowMovers does not exist yet on EveningSummary (RED)
    const rawSummary = summary as unknown as Record<string, unknown>;
    const movers = rawSummary["foreignFlowMovers"] as
      | { code: string; foreignNetVol: number }[]
      | undefined;

    expect(Array.isArray(movers)).toBe(true);
    // Top entry has largest |foreignNetVol| (VCB=1500 > HPG=500)
    expect(movers![0]!.code).toBe("VCB");
    expect(Math.abs(movers![0]!.foreignNetVol)).toBeGreaterThanOrEqual(
      Math.abs(movers![1]!.foreignNetVol),
    );

    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5: eveningSummaryJob formatter includes "Khối ngoại" block
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1503 AC5 — eveningSummaryJob formatter includes Khoi ngoai block", () => {
  it("formatted message includes 'Khối ngoại' when foreignFlowMovers.length > 0", async () => {
    const jobModule = await import("../scheduler/briefings/eveningSummaryJob.js");
    const formatFn = (jobModule as Record<string, unknown>)["formatForeignFlowSection"] as
      | ((movers: { code: string; foreignNetVol: number; foreignBuyVol: number; foreignSellVol: number }[]) => string[])
      | undefined;

    if (!formatFn) throw new Error("formatForeignFlowSection not implemented yet");

    const movers = [
      { code: "VCB", foreignNetVol: 1500, foreignBuyVol: 2000, foreignSellVol: 500 },
      { code: "HPG", foreignNetVol: -500, foreignBuyVol: 300, foreignSellVol: 800 },
    ];

    const lines = formatFn(movers);

    expect(Array.isArray(lines)).toBe(true);
    const joined = lines.join("\n");
    expect(joined).toContain("Khối ngoại");
    expect(joined).toContain("VCB");

    // When empty → no block
    const emptyLines = formatFn([]);
    expect(emptyLines).toHaveLength(0);
  });
});
