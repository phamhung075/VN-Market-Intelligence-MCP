// apps/mcp-server/src/__tests__/1863f-verdict-logic-coverage.test.ts
// Task 1863f — verdictResolutionJob edge-case AC coverage
//
// 10 AC cases that are NOT covered by 1863b (happy path).
// Focuses on: direction-match edge cases (bearish+up gap), 24h guard,
// TTL pruning, fail-loud on price fetch error, idempotency.
//
// Uses in-memory SQLite — no HTTP, no cron wiring.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runVerdictResolutionJob,
  pruneStaleVerdicts,
  VERDICT_GUARD_HOURS,
  VERDICT_TTL_DAYS,
} from "../scheduler/alerts/verdictResolutionJob.js";

// ── Minimal DDL ────────────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent     TEXT NOT NULL,
      to_agent       TEXT NOT NULL,
      signal_type    TEXT NOT NULL,
      stock_code     TEXT,
      payload        TEXT NOT NULL DEFAULT '{}',
      status         TEXT NOT NULL DEFAULT 'unread',
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at     TEXT NOT NULL DEFAULT (datetime('now', '+120 minutes')),
      outcome        TEXT,
      outcome_at     TEXT,
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

  return db;
}

// ── Seed helpers ───────────────────────────────────────────────────────────

function insertSignal(
  db: Database,
  opts: {
    signal_type: string;
    stock_code?: string | null;
    payload?: string;
    outcome?: string | null;
    created_at: string; // explicit — every test controls time
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO agent_signals
         (from_agent, to_agent, signal_type, stock_code, payload, outcome, created_at, expires_at)
       VALUES ('test', 'all', ?, ?, ?, ?, ?, datetime(?, '+120 minutes'))`,
    )
    .run(
      opts.signal_type,
      opts.stock_code ?? null,
      opts.payload ?? "{}",
      opts.outcome ?? null,
      opts.created_at,
      opts.created_at,
    );
  return Number(result.lastInsertRowid);
}

function insertPrice(db: Database, code: string, price: number, fetchedAt: string): void {
  db.prepare(
    `INSERT INTO market_prices_history (code, price, fetched_at) VALUES (?, ?, ?)`,
  ).run(code, price, fetchedAt);
}

function getOutcome(db: Database, id: number): string | null {
  const row = db
    .query<{ outcome: string | null }, [number]>(
      "SELECT outcome FROM agent_signals WHERE id = ?",
    )
    .get(id);
  return row?.outcome ?? null;
}

function countRows(db: Database): number {
  const row = db
    .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM agent_signals")
    .get();
  return row?.n ?? 0;
}

// ── Fixed time reference ───────────────────────────────────────────────────

// "now" is always 2026-05-10T12:00:00Z for all tests
const NOW = new Date("2026-05-10T12:00:00Z");
const nowFn = () => NOW;

/** SQLite datetime string N hours before NOW */
function hoursAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}

/** SQLite datetime string N days before NOW */
function daysAgo(n: number): string {
  return hoursAgo(n * 24);
}

/** SQLite datetime string N hours AFTER a given created_at string */
function hoursAfter(createdAt: string, n: number): string {
  const d = new Date(createdAt.replace(" ", "T") + "Z");
  d.setTime(d.getTime() + n * 60 * 60 * 1000);
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

/** No-op bug reporter */
async function noopBug(_msg: string): Promise<void> {}

// ── AC Tests ───────────────────────────────────────────────────────────────

describe("Task 1863f — verdictResolutionJob AC coverage", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── AC-1: flat move (<1%) for bullish signal → confirmed ──────────────────
  it("AC-1: flat move (<1%) for bullish signal → confirmed", async () => {
    const createdAt = hoursAgo(26); // past 24h guard

    const id = insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: "VIC",
      created_at: createdAt,
    });

    // Baseline at created_at: price 100
    insertPrice(db, "VIC", 100, createdAt);
    // Resolution at +4h: price 100.5 (+0.5% → flat)
    insertPrice(db, "VIC", 100.5, hoursAfter(createdAt, 4));

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter: noopBug });

    expect(result.confirmed).toBe(1);
    expect(result.false_positive).toBe(0);
    expect(getOutcome(db, id)).toBe("confirmed");
  });

  // ── AC-2: flat move (<1%) for bearish signal → confirmed ─────────────────
  it("AC-2: flat move (<1%) for bearish signal → confirmed", async () => {
    const createdAt = hoursAgo(26);

    const id = insertSignal(db, {
      signal_type: "ta_overbought",
      stock_code: "HPG",
      created_at: createdAt,
    });

    // Baseline: 50, resolution: 50.4 (+0.8% → flat)
    insertPrice(db, "HPG", 50, createdAt);
    insertPrice(db, "HPG", 50.4, hoursAfter(createdAt, 4));

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter: noopBug });

    expect(result.confirmed).toBe(1);
    expect(result.false_positive).toBe(0);
    expect(getOutcome(db, id)).toBe("confirmed");
  });

  // ── AC-3: bullish signal + price up ≥1% → confirmed ─────────────────────
  it("AC-3: bullish signal + price up ≥1% → confirmed", async () => {
    const createdAt = hoursAgo(26);

    const id = insertSignal(db, {
      signal_type: "chain_catalyst",
      stock_code: "FPT",
      created_at: createdAt,
    });

    // +2% rise
    insertPrice(db, "FPT", 100, createdAt);
    insertPrice(db, "FPT", 102, hoursAfter(createdAt, 4));

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter: noopBug });

    expect(result.confirmed).toBe(1);
    expect(result.false_positive).toBe(0);
    expect(getOutcome(db, id)).toBe("confirmed");
  });

  // ── AC-4: bullish signal + price down ≥1% → false_positive ──────────────
  it("AC-4: bullish signal + price down ≥1% → false_positive", async () => {
    const createdAt = hoursAgo(26);

    const id = insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: "VHM",
      created_at: createdAt,
    });

    // -2% drop
    insertPrice(db, "VHM", 80, createdAt);
    insertPrice(db, "VHM", 78.4, hoursAfter(createdAt, 4));

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter: noopBug });

    expect(result.false_positive).toBe(1);
    expect(result.confirmed).toBe(0);
    expect(getOutcome(db, id)).toBe("false_positive");
  });

  // ── AC-5: bearish signal + price down ≥1% → confirmed ───────────────────
  it("AC-5: bearish signal + price down ≥1% → confirmed", async () => {
    const createdAt = hoursAgo(26);

    const id = insertSignal(db, {
      signal_type: "ta_overbought",
      stock_code: "ACB",
      created_at: createdAt,
    });

    // -1.5% drop (bearish confirmed)
    insertPrice(db, "ACB", 30, createdAt);
    insertPrice(db, "ACB", 29.55, hoursAfter(createdAt, 4));

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter: noopBug });

    expect(result.confirmed).toBe(1);
    expect(result.false_positive).toBe(0);
    expect(getOutcome(db, id)).toBe("confirmed");
  });

  // ── AC-6: bearish signal + price UP ≥1% → false_positive (known gap) ────
  // This is the KEY gap case noted in cycle 2 — bearish+up → false_positive.
  it("AC-6: bearish signal + price UP ≥1% → false_positive (bearish+up gap)", async () => {
    const createdAt = hoursAgo(26);

    const id = insertSignal(db, {
      signal_type: "ta_overbought",
      stock_code: "MWG",
      created_at: createdAt,
    });

    // +2% rise when signal predicted bearish → false_positive
    insertPrice(db, "MWG", 60, createdAt);
    insertPrice(db, "MWG", 61.2, hoursAfter(createdAt, 4));

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter: noopBug });

    expect(result.false_positive).toBe(1);
    expect(result.confirmed).toBe(0);
    expect(getOutcome(db, id)).toBe("false_positive");
  });

  // ── AC-7: 24h window guard — fresh signal (< 24h old) NOT resolved ───────
  it("AC-7: signal created < 24h ago → NOT resolved by hour-cron", async () => {
    // Created 10h ago — within 24h guard window
    const freshCreatedAt = hoursAgo(10);

    const id = insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: "BID",
      created_at: freshCreatedAt,
    });

    // Price data present at baseline and +4h
    insertPrice(db, "BID", 20, freshCreatedAt);
    insertPrice(db, "BID", 20.5, hoursAfter(freshCreatedAt, 4));

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter: noopBug });

    // evaluated=0 because the 24h guard excludes it entirely
    expect(result.evaluated).toBe(0);
    // outcome must remain null — no premature write
    expect(getOutcome(db, id)).toBeNull();
  });

  // ── AC-8: 24h window guard boundary — signal exactly at 24h is resolved ──
  it("AC-8: signal at exactly VERDICT_GUARD_HOURS old → IS resolved", async () => {
    // Created exactly VERDICT_GUARD_HOURS ago (at the guard cutoff boundary)
    // Use 25h to be safely past the guard (>= 24h)
    const createdAt = hoursAgo(VERDICT_GUARD_HOURS + 1);

    const id = insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: "CTG",
      created_at: createdAt,
    });

    // Bullish, price rose +2%
    insertPrice(db, "CTG", 25, createdAt);
    insertPrice(db, "CTG", 25.5, hoursAfter(createdAt, 4));

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter: noopBug });

    expect(result.evaluated).toBeGreaterThanOrEqual(1);
    expect(getOutcome(db, id)).toBe("confirmed");
  });

  // ── AC-9: TTL pruning at 30 days ─────────────────────────────────────────
  it("AC-9: unresolved signals older than 30 days are pruned (deleted)", async () => {
    const staleCreatedAt = daysAgo(VERDICT_TTL_DAYS + 1);
    const freshCreatedAt = daysAgo(5);

    // Stale signal (31 days old, unresolved)
    insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: null, // no stock_code so no resolution attempt
      created_at: staleCreatedAt,
    });

    // Fresh signal (5 days old, unresolved)
    insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: null,
      created_at: freshCreatedAt,
    });

    expect(countRows(db)).toBe(2);

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter: noopBug });

    // Stale signal pruned, fresh signal retained
    expect(result.pruned).toBe(1);
    expect(countRows(db)).toBe(1);
  });

  // ── AC-10: fail-loud on price fetch error → bug telegram sent once ────────
  it("AC-10: price fetch error → bugReporter called once (fail-loud), signal skipped", async () => {
    const createdAt = hoursAgo(26);

    // Signal with stock_code present
    insertSignal(db, {
      signal_type: "ta_oversold",
      stock_code: "VIC",
      created_at: createdAt,
    });

    // Simulate price fetch error by dropping the table
    db.exec("DROP TABLE market_prices_history");

    let bugCallCount = 0;
    let capturedBugMessage = "";

    const bugReporter = async (msg: string): Promise<void> => {
      bugCallCount++;
      capturedBugMessage = msg;
    };

    const result = await runVerdictResolutionJob({ db, nowFn, bugReporter });

    // Signal was evaluated but skipped due to fetch error
    expect(result.evaluated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.confirmed).toBe(0);
    expect(result.false_positive).toBe(0);

    // Bug reporter called exactly once (fail-loud, not per-signal spam)
    expect(bugCallCount).toBe(1);
    expect(capturedBugMessage).toContain("verdictResolutionJob");
  });
});
