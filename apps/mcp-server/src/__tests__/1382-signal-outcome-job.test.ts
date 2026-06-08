// apps/mcp-server/src/__tests__/1382-signal-outcome-job.test.ts
// Task 1382d — signalOutcomeJob daily post-close outcome resolver
// AC-1 through AC-8 (AC-9 added by 1382c)
//
// Uses in-memory SQLite with minimal DDL — no HTTP calls, no cron wiring.

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runSignalOutcomeJob } from "../scheduler/alerts/signalOutcomeJob.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Minimal DDL ────────────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT NOT NULL,
      to_agent     TEXT NOT NULL,
      signal_type  TEXT NOT NULL,
      stock_code   TEXT,
      payload      TEXT NOT NULL DEFAULT '{}',
      status       TEXT NOT NULL DEFAULT 'unread',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL DEFAULT (datetime('now', '+120 minutes')),
      outcome      TEXT,
      outcome_at   TEXT,
      outcome_detail TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      fetched_at TEXT NOT NULL
    )
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Insert a signal row with controlled created_at. Returns the inserted id. */
function insertSignal(
  db: Database,
  opts: {
    signal_type: string;
    stock_code?: string | null;
    payload?: string;
    outcome?: string | null;
    created_at?: string; // SQLite datetime string, e.g. "2026-04-28 05:00:00"
  },
): number {
  const created_at = opts.created_at ?? "2026-04-28 05:00:00";
  const result = db
    .prepare(
      `INSERT INTO agent_signals
         (from_agent, to_agent, signal_type, stock_code, payload, outcome, created_at, expires_at)
       VALUES ('test-agent', 'all', ?, ?, ?, ?, ?, datetime(?, '+120 minutes'))`,
    )
    .run(
      opts.signal_type,
      opts.stock_code ?? null,
      opts.payload ?? "{}",
      opts.outcome ?? null,
      created_at,
      created_at,
    );
  return Number(result.lastInsertRowid);
}

/** Insert price rows for a stock code at a specific fetched_at timestamp. */
function insertPrice(db: Database, code: string, price: number, fetchedAt: string): void {
  db.prepare(
    `INSERT INTO market_prices_history (code, price, fetched_at) VALUES (?, ?, ?)`,
  ).run(code, price, fetchedAt);
}

/** Read the outcome field for a given signal id. */
function getOutcome(db: Database, id: number): string | null {
  const row = db
    .query<{ outcome: string | null }, [number]>(
      "SELECT outcome FROM agent_signals WHERE id = ?",
    )
    .get(id);
  return row?.outcome ?? null;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Task 1382d — signalOutcomeJob", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  // AC-1: No NULL/fired rows → all zeros
  it("AC-1: no pending rows → returns all zeros", async () => {
    const result = await runSignalOutcomeJob({ db });
    expect(result).toEqual({ evaluated: 0, confirmed: 0, false_positive: 0, skipped: 0 });
  });

  // AC-2: Signal with no stock_code → skipped, outcome stays NULL
  it("AC-2: market-wide signal (no stock_code) → skipped, outcome unchanged", async () => {
    const id = insertSignal(db, { signal_type: "urgent_news", stock_code: null });
    const result = await runSignalOutcomeJob({ db });
    expect(result.evaluated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.confirmed).toBe(0);
    expect(result.false_positive).toBe(0);
    expect(getOutcome(db, id)).toBeNull();
  });

  // AC-3: Signal with stock_code but no price history → skipped
  it("AC-3: stock_code present but no price data → skipped", async () => {
    const id = insertSignal(db, { signal_type: "ta_oversold", stock_code: "VIC" });
    const result = await runSignalOutcomeJob({ db });
    expect(result.evaluated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(getOutcome(db, id)).toBeNull();
  });

  // AC-4: Price rose ≥1% for bullish signal → confirmed
  it("AC-4: bullish signal + price rose ≥1% → confirmed", async () => {
    const createdAt = "2026-04-28 05:00:00";
    const id = insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: "VIC",
      created_at: createdAt,
    });
    // Baseline: price 100 at created_at
    insertPrice(db, "VIC", 100, "2026-04-28 04:55:00");
    insertPrice(db, "VIC", 100, "2026-04-28 05:05:00");
    // Resolution: price 102 at +4h
    insertPrice(db, "VIC", 102, "2026-04-28 09:05:00");
    insertPrice(db, "VIC", 102, "2026-04-28 09:25:00");

    const result = await runSignalOutcomeJob({ db });
    expect(result.confirmed).toBe(1);
    expect(result.false_positive).toBe(0);
    expect(getOutcome(db, id)).toBe("confirmed");
  });

  // AC-5: Price fell ≥1% for bullish signal → false_positive
  it("AC-5: bullish signal + price fell ≥1% → false_positive", async () => {
    const createdAt = "2026-04-28 05:00:00";
    const id = insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: "VIC",
      created_at: createdAt,
    });
    // Baseline: 100
    insertPrice(db, "VIC", 100, "2026-04-28 04:55:00");
    insertPrice(db, "VIC", 100, "2026-04-28 05:05:00");
    // Resolution: 98 (−2%)
    insertPrice(db, "VIC", 98, "2026-04-28 09:05:00");
    insertPrice(db, "VIC", 98, "2026-04-28 09:25:00");

    const result = await runSignalOutcomeJob({ db });
    expect(result.false_positive).toBe(1);
    expect(result.confirmed).toBe(0);
    expect(getOutcome(db, id)).toBe("false_positive");
  });

  // AC-6: Price flat (<1% move) → confirmed
  it("AC-6: flat price movement (<1%) → confirmed regardless of direction", async () => {
    const createdAt = "2026-04-28 05:00:00";
    const id = insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: "HPG",
      created_at: createdAt,
    });
    // Baseline: 100
    insertPrice(db, "HPG", 100, "2026-04-28 04:55:00");
    // Resolution: 100.5 (+0.5% → flat)
    insertPrice(db, "HPG", 100.5, "2026-04-28 09:05:00");

    const result = await runSignalOutcomeJob({ db });
    expect(result.confirmed).toBe(1);
    expect(result.false_positive).toBe(0);
    expect(getOutcome(db, id)).toBe("confirmed");
  });

  // AC-7: Signal already outcome='confirmed' → NOT re-evaluated
  it("AC-7: already confirmed signal → not touched", async () => {
    const id = insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: "VIC",
      outcome: "confirmed",
    });
    const result = await runSignalOutcomeJob({ db });
    expect(result.evaluated).toBe(0);
    // outcome untouched
    expect(getOutcome(db, id)).toBe("confirmed");
  });

  // AC-8: Signal outcome='fired' → IS re-evaluated and upgraded
  it("AC-8: fired signal → re-evaluated and upgraded", async () => {
    const createdAt = "2026-04-28 05:00:00";
    const id = insertSignal(db, {
      signal_type: "chain_catalyst",
      stock_code: "VHM",
      outcome: "fired",
      created_at: createdAt,
    });
    // Price rose 2% → confirmed
    insertPrice(db, "VHM", 50, "2026-04-28 04:55:00");
    insertPrice(db, "VHM", 51, "2026-04-28 09:05:00");

    const result = await runSignalOutcomeJob({ db });
    expect(result.evaluated).toBe(1);
    expect(result.confirmed).toBe(1);
    expect(getOutcome(db, id)).toBe("confirmed");
  });

  // AC-9: CRONS.signalOutcomeJob key present in jobs.ts (task 1382c)
  it("AC-9: CRONS.signalOutcomeJob key present in jobs.ts", async () => {
    const { CRONS } = await import('../scheduler/jobs.js');
    expect(CRONS.signalOutcomeJob).toBeDefined();
    expect(typeof CRONS.signalOutcomeJob).toBe('string');
  });
});
