/**
 * Task 1941c — Daily accuracy WORK digest (smoke tests)
 *
 * AC-12 coverage:
 *   TC1: Empty signal_outcomes → runAccuracyDigest exits without Telegram send (AC-3)
 *   TC2: All-neutral rows → sends short AC-8 digest (includes "all outcomes neutral")
 *   TC3: Normal case ≥6 eligible signal types → digest includes Top 3 and Bottom 3 sections
 *
 * Additional unit tests:
 *   TC4: buildAccuracyDigestText — n/a when totalResolved < 10 (AC-4)
 *   TC5: buildAccuracyDigestText — overall rate displayed when totalResolved >= 10 (AC-4)
 *
 * Test isolation: in-memory SQLite, sendTelegramWork spy via deps injection.
 */

// ── Env isolation must precede all imports ────────────────────────────────
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[1941c] DB_PATH must be ':memory:' in tests, got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { runAccuracyDigest } from "../scheduler/digest/accuracyDigestJob.js";
import { buildAccuracyDigestText } from "../application/usecases/buildAccuracyDigest.js";
import { getSystemAccuracyDigestStats } from "../infrastructure/db/signalOutcomeStore.js";
import type { SystemAccuracyDigestStats } from "../infrastructure/db/signalOutcomeStore.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Open an in-memory DB, run initDatabase migrations, return the handle. */
async function openDb(): Promise<Database> {
  await initDatabase();
  // Return the internal handle directly for test injection
  const { getDb } = await import("../infrastructure/db/schema.js");
  return getDb();
}

/** Insert a signal_outcomes row directly for test seeding.
 *  Inserts a parent agent_signals row first to satisfy the FK constraint.
 */
function seedOutcome(
  db: Database,
  opts: {
    stock_code: string;
    signal_type: string;
    predicted_direction: string;
    outcome_24h: string;
    daysAgo?: number;
  },
) {
  const daysAgo = opts.daysAgo ?? 1;

  // Insert parent agent_signals row to satisfy FK constraint
  const parentResult = db.prepare(`
    INSERT INTO agent_signals
      (from_agent, to_agent, signal_type, stock_code, payload, status, created_at, expires_at)
    VALUES ('test-agent', 'test', ?, ?, '{}', 'unread', datetime('now', '-${daysAgo} days'), datetime('now', '+1 day'))
  `).run(opts.signal_type, opts.stock_code);

  const signalId = parentResult.lastInsertRowid;

  db.prepare(`
    INSERT INTO signal_outcomes
      (signal_id, stock_code, signal_type, from_agent, predicted_direction, outcome_24h, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-${daysAgo} days'))
  `).run(
    signalId,
    opts.stock_code,
    opts.signal_type,
    "test-agent",
    opts.predicted_direction,
    opts.outcome_24h,
  );
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

beforeEach(async () => {
  await initDatabase();
});

afterEach(async () => {
  closeDb();
});

// ── TC1: Empty signal_outcomes → exits without Telegram send ──────────────

describe("TC1 — empty signal_outcomes (AC-3)", () => {
  it("runAccuracyDigest exits without sending Telegram when table is empty", async () => {
    const db = await openDb();

    let sendCalled = false;
    const sendWorkSpy = async (_text: string) => {
      sendCalled = true;
      return true;
    };

    await runAccuracyDigest({ db, sendWork: sendWorkSpy });

    expect(sendCalled).toBe(false);
  });
});

// ── TC2: All-neutral rows → sends short AC-8 digest ──────────────────────

describe("TC2 — all-neutral outcomes (AC-8)", () => {
  it("sends short digest containing 'all outcomes neutral' when all rows are neutral", async () => {
    const db = await openDb();

    // Seed 5 neutral rows across 3 stocks
    for (let i = 0; i < 5; i++) {
      seedOutcome(db, {
        stock_code: `STK${i % 3}`,
        signal_type: "rsi_oversold",
        predicted_direction: "BULLISH",
        outcome_24h: "neutral",
      });
    }

    let capturedText = "";
    const sendWorkSpy = async (text: string) => {
      capturedText = text;
      return true;
    };

    await runAccuracyDigest({ db, sendWork: sendWorkSpy });

    expect(capturedText).not.toBe("");
    expect(capturedText).toContain("all outcomes neutral");
    expect(capturedText).not.toContain("Top 3");
    expect(capturedText).not.toContain("Bottom 3");
  });
});

// ── TC3: Normal case ≥6 eligible signal types → top-3 and bottom-3 ────────

describe("TC3 — normal case with ≥6 eligible signal types (AC-5/AC-6)", () => {
  it("digest includes Top 3 and Bottom 3 sections", async () => {
    const db = await openDb();

    // Seed 6 distinct signal types with different accuracy rates
    // Each needs ≥3 resolved rows to be eligible
    const types = [
      { type: "rsi_oversold",      correctRate: 0.9, count: 5 },
      { type: "rsi_overbought",    correctRate: 0.8, count: 4 },
      { type: "bb_breakout_up",    correctRate: 0.7, count: 4 },
      { type: "bb_breakout_down",  correctRate: 0.4, count: 5 },
      { type: "volume_spike",      correctRate: 0.3, count: 4 },
      { type: "price_drop",        correctRate: 0.2, count: 5 },
    ];

    for (const t of types) {
      const correctCount = Math.round(t.count * t.correctRate);
      for (let i = 0; i < t.count; i++) {
        seedOutcome(db, {
          stock_code: `STK${i % 3}`,
          signal_type: t.type,
          predicted_direction: "BULLISH",
          outcome_24h: i < correctCount ? "correct" : "incorrect",
        });
      }
    }

    let capturedText = "";
    const sendWorkSpy = async (text: string) => {
      capturedText = text;
      return true;
    };

    await runAccuracyDigest({ db, sendWork: sendWorkSpy });

    expect(capturedText).not.toBe("");
    expect(capturedText).toContain("Top 3 (by accuracy):");
    expect(capturedText).toContain("Bottom 3 (by accuracy):");
    // Should have high-accuracy type in top 3
    expect(capturedText).toMatch(/rsi_oversold.*90\.0%|rsi_overbought.*80\.0%|bb_breakout_up.*75\.0%/);
    // Should have low-accuracy type in bottom 3
    expect(capturedText).toMatch(/price_drop.*20\.0%|volume_spike.*25\.0%/);
    expect(capturedText).toContain("New stocks:");
  });
});

// ── TC4: buildAccuracyDigestText — n/a when totalResolved < 10 ────────────

describe("TC4 — buildAccuracyDigestText unit tests", () => {
  it("shows n/a for system accuracy when totalResolved < 10 (AC-4)", () => {
    const stats: SystemAccuracyDigestStats = {
      totalResolved: 5,
      totalCorrect: 3,
      overallRate: null, // null because < 10
      bySignalType: [],
      newStocksCount: 2,
      neutralOnlyRows: 0,
    };

    const text = buildAccuracyDigestText(stats, "2026-05-18");

    expect(text).toContain("[2026-05-18] Signal accuracy digest (30d)");
    expect(text).toContain("n/a");
    expect(text).toContain("5 resolved rows");
    expect(text).toContain("New stocks: 2 stocks with <3 samples");
  });

  it("shows overall accuracy rate when totalResolved >= 10 (AC-4)", () => {
    const stats: SystemAccuracyDigestStats = {
      totalResolved: 20,
      totalCorrect: 13,
      overallRate: 0.65,
      bySignalType: [
        { signal_type: "rsi_oversold", correct: 8, total: 10, rate: 0.8 },
        { signal_type: "volume_spike", correct: 5, total: 10, rate: 0.5 },
      ],
      newStocksCount: 3,
      neutralOnlyRows: 0,
    };

    const text = buildAccuracyDigestText(stats, "2026-05-18");

    expect(text).toContain("65.0%");
    expect(text).toContain("13 correct / 20 total");
  });
});

// ── getSystemAccuracyDigestStats integration ──────────────────────────────

describe("getSystemAccuracyDigestStats — DB integration", () => {
  it("returns neutralOnlyRows=5 when 5 neutral rows exist (AC-8 discriminator)", async () => {
    const db = await openDb();

    for (let i = 0; i < 5; i++) {
      seedOutcome(db, {
        stock_code: "VNM",
        signal_type: "rsi_oversold",
        predicted_direction: "BULLISH",
        outcome_24h: "neutral",
      });
    }

    const stats = getSystemAccuracyDigestStats(db, 30);

    expect(stats.neutralOnlyRows).toBe(5);
    expect(stats.totalResolved).toBe(0);
  });

  it("returns zero stats for empty table (AC-3 case)", async () => {
    const db = await openDb();
    const stats = getSystemAccuracyDigestStats(db, 30);

    expect(stats.totalResolved).toBe(0);
    expect(stats.neutralOnlyRows).toBe(0);
    expect(stats.bySignalType).toHaveLength(0);
  });
});
