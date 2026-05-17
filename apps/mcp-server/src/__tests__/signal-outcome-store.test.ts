/**
 * signal-outcome-store.test.ts — Unit tests for signalOutcomeStore.ts
 *
 * Covers:
 *   - seedSignalOutcome: NEUTRAL direction skips insert
 *   - seedSignalOutcome: BULLISH inserts pending row
 *   - resolveSignalOutcomes: correct/incorrect/neutral classification at boundaries
 *   - resolveSignalOutcomes: pending when no price data found
 *   - getAccuracyStats: null when sample_count < 3
 *   - getAccuracyStats: calculates accuracy_rate correctly
 *   - NEUTRAL signal → neutral outcome
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import {
  seedSignalOutcome,
  resolveSignalOutcomes,
  getAccuracyStats,
  type SeedSignalOutcomeInput,
} from "../infrastructure/db/signalOutcomeStore.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  initNewsTables(db);
  return db;
}

/** Insert a minimal agent_signals row and return its ID. */
function insertSignal(
  db: Database,
  opts: {
    stockCode?: string | null;
    signalType?: string;
    fromAgent?: string;
    direction?: string;
    createdAt?: string;
    confidenceScore?: number;
  } = {},
): number {
  const now = opts.createdAt ?? "2026-05-01 10:00:00";
  const result = db
    .prepare(
      `INSERT INTO agent_signals
         (from_agent, to_agent, signal_type, stock_code, payload, status, expires_at,
          created_at, cycle_id, finding_data, causal_ref, chain_depth,
          causal_root_id, causal_root_label, signal_class,
          confidence_score, validated_at,
          news_sentiment, kinh_dich_confidence, agent_signals_majority,
          critic_score, critic_notes, retry_count)
       VALUES (?, ?, ?, ?, '{}', 'unread', datetime('now','+2 hours'),
               ?, NULL, ?, NULL, 0, NULL, NULL, NULL, ?, ?,
               NULL, NULL, NULL, NULL, NULL, 0)`,
    )
    .run(
      opts.fromAgent ?? "news-scout",
      "alert-commander",
      opts.signalType ?? "chain_catalyst",
      opts.stockCode ?? "VNM",
      now,
      JSON.stringify({ direction: opts.direction ?? "BULLISH" }),
      opts.confidenceScore ?? 70,
      now,
    );
  return Number(result.lastInsertRowid);
}

/** Insert a market_prices_history row for a given code at a given timestamp. */
function insertPrice(
  db: Database,
  code: string,
  price: number,
  fetchedAt: string,
): void {
  // Ensure table exists — create a minimal one if absent (for isolated tests)
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      price REAL NOT NULL,
      fetched_at TEXT NOT NULL
    )
  `);
  db.prepare(
    `INSERT INTO market_prices_history (code, price, fetched_at) VALUES (?, ?, ?)`,
  ).run(code, price, fetchedAt);
}

// ── seedSignalOutcome ─────────────────────────────────────────────────────────

describe("seedSignalOutcome", () => {
  it("NEUTRAL direction: does NOT insert a row", () => {
    const db = makeDb();
    const signalId = insertSignal(db, { direction: "NEUTRAL" });

    seedSignalOutcome(db, signalId, {
      stockCode: "VNM",
      signalType: "chain_catalyst",
      fromAgent: "news-scout",
      predictedDirection: "NEUTRAL",
      createdAt: "2026-05-01 10:00:00",
    });

    const rows = db.prepare("SELECT * FROM signal_outcomes WHERE signal_id = ?").all(signalId);
    expect(rows).toHaveLength(0);
  });

  it("BULLISH direction: inserts a pending row", () => {
    const db = makeDb();
    const signalId = insertSignal(db, { direction: "BULLISH" });

    seedSignalOutcome(db, signalId, {
      stockCode: "VNM",
      signalType: "chain_catalyst",
      fromAgent: "news-scout",
      predictedDirection: "BULLISH",
      createdAt: "2026-05-01 10:00:00",
    });

    type Row = {
      signal_id: number;
      stock_code: string;
      predicted_direction: string;
      outcome_24h: string;
      outcome_48h: string;
    };
    const rows = db
      .prepare<Row, [number]>("SELECT signal_id, stock_code, predicted_direction, outcome_24h, outcome_48h FROM signal_outcomes WHERE signal_id = ?")
      .all(signalId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.predicted_direction).toBe("BULLISH");
    expect(rows[0]?.outcome_24h).toBe("pending");
    expect(rows[0]?.outcome_48h).toBe("pending");
    expect(rows[0]?.stock_code).toBe("VNM");
  });

  it("BEARISH direction: inserts a pending row with correct direction", () => {
    const db = makeDb();
    const signalId = insertSignal(db, { direction: "BEARISH" });

    seedSignalOutcome(db, signalId, {
      stockCode: "VCB",
      signalType: "urgent_news",
      fromAgent: "financial-analyst",
      predictedDirection: "BEARISH",
      createdAt: "2026-05-01 10:00:00",
    });

    type Row = { predicted_direction: string; stock_code: string };
    const row = db
      .prepare<Row, [number]>("SELECT predicted_direction, stock_code FROM signal_outcomes WHERE signal_id = ?")
      .get(signalId);
    expect(row?.predicted_direction).toBe("BEARISH");
    expect(row?.stock_code).toBe("VCB");
  });

  it("null stockCode: does NOT insert a row", () => {
    const db = makeDb();
    const signalId = insertSignal(db, { stockCode: null });

    seedSignalOutcome(db, signalId, {
      stockCode: "",
      signalType: "chain_catalyst",
      fromAgent: "news-scout",
      predictedDirection: "BULLISH",
      createdAt: "2026-05-01 10:00:00",
    });

    const rows = db.prepare("SELECT * FROM signal_outcomes WHERE signal_id = ?").all(signalId);
    expect(rows).toHaveLength(0);
  });

  it("'down'/'up' direction aliases: normalised to BEARISH/BULLISH", () => {
    const db = makeDb();
    const s1 = insertSignal(db, { stockCode: "VNM" });
    const s2 = insertSignal(db, { stockCode: "VCB" });

    seedSignalOutcome(db, s1, {
      stockCode: "VNM",
      signalType: "price_anomaly",
      fromAgent: "news-scout",
      predictedDirection: "down",
      createdAt: "2026-05-01 10:00:00",
    });
    seedSignalOutcome(db, s2, {
      stockCode: "VCB",
      signalType: "chain_catalyst",
      fromAgent: "news-scout",
      predictedDirection: "up",
      createdAt: "2026-05-01 10:00:00",
    });

    type Row = { predicted_direction: string };
    const r1 = db.prepare<Row, [number]>("SELECT predicted_direction FROM signal_outcomes WHERE signal_id = ?").get(s1);
    const r2 = db.prepare<Row, [number]>("SELECT predicted_direction FROM signal_outcomes WHERE signal_id = ?").get(s2);
    expect(r1?.predicted_direction).toBe("BEARISH");
    expect(r2?.predicted_direction).toBe("BULLISH");
  });
});

// ── resolveSignalOutcomes ─────────────────────────────────────────────────────

describe("resolveSignalOutcomes", () => {
  /** Insert a signal_outcomes pending row directly (bypasses seedSignalOutcome) */
  function insertPendingOutcome(
    db: Database,
    opts: {
      signalId: number;
      stockCode: string;
      direction: string;
      createdAt: string;
    },
  ): number {
    const result = db
      .prepare(
        `INSERT INTO signal_outcomes
           (signal_id, stock_code, signal_type, from_agent, predicted_direction, created_at)
         VALUES (?, ?, 'chain_catalyst', 'news-scout', ?, ?)`,
      )
      .run(opts.signalId, opts.stockCode, opts.direction, opts.createdAt);
    return Number(result.lastInsertRowid);
  }

  it("BULLISH: +2% move → correct", async () => {
    const db = makeDb();
    const signalId = insertSignal(db, { stockCode: "VNM", createdAt: "2026-04-01 10:00:00" });
    insertPendingOutcome(db, {
      signalId,
      stockCode: "VNM",
      direction: "BULLISH",
      createdAt: "2026-04-01 10:00:00",
    });

    // Insert baseline price (signal time)
    insertPrice(db, "VNM", 100_000, "2026-04-01 10:05:00");
    // Insert T+24h price: 102k = +2%
    insertPrice(db, "VNM", 102_000, "2026-04-02 10:05:00");

    await resolveSignalOutcomes(db, 24);

    type Row = { outcome_24h: string; price_at_24h: number };
    const row = db
      .prepare<Row, [number]>("SELECT outcome_24h, price_at_24h FROM signal_outcomes WHERE signal_id = ?")
      .get(signalId);
    expect(row?.outcome_24h).toBe("correct");
    expect(row?.price_at_24h).toBeCloseTo(102_000, 0);
  });

  it("BULLISH: -2% move → incorrect", async () => {
    const db = makeDb();
    const signalId = insertSignal(db, { stockCode: "VCB", createdAt: "2026-04-01 10:00:00" });
    insertPendingOutcome(db, {
      signalId,
      stockCode: "VCB",
      direction: "BULLISH",
      createdAt: "2026-04-01 10:00:00",
    });

    insertPrice(db, "VCB", 100_000, "2026-04-01 10:05:00");
    insertPrice(db, "VCB", 98_000, "2026-04-02 10:05:00"); // -2%

    await resolveSignalOutcomes(db, 24);

    type Row = { outcome_24h: string };
    const row = db.prepare<Row, [number]>("SELECT outcome_24h FROM signal_outcomes WHERE signal_id = ?").get(signalId);
    expect(row?.outcome_24h).toBe("incorrect");
  });

  it("BEARISH: -2% move → correct", async () => {
    const db = makeDb();
    const signalId = insertSignal(db, { stockCode: "HPG", createdAt: "2026-04-01 10:00:00" });
    insertPendingOutcome(db, {
      signalId,
      stockCode: "HPG",
      direction: "BEARISH",
      createdAt: "2026-04-01 10:00:00",
    });

    insertPrice(db, "HPG", 100_000, "2026-04-01 10:05:00");
    insertPrice(db, "HPG", 98_000, "2026-04-02 10:05:00"); // -2%

    await resolveSignalOutcomes(db, 24);

    type Row = { outcome_24h: string };
    const row = db.prepare<Row, [number]>("SELECT outcome_24h FROM signal_outcomes WHERE signal_id = ?").get(signalId);
    expect(row?.outcome_24h).toBe("correct");
  });

  it("BEARISH: +2% move → incorrect", async () => {
    const db = makeDb();
    const signalId = insertSignal(db, { stockCode: "MSN", createdAt: "2026-04-01 10:00:00" });
    insertPendingOutcome(db, {
      signalId,
      stockCode: "MSN",
      direction: "BEARISH",
      createdAt: "2026-04-01 10:00:00",
    });

    insertPrice(db, "MSN", 100_000, "2026-04-01 10:05:00");
    insertPrice(db, "MSN", 102_000, "2026-04-02 10:05:00"); // +2%

    await resolveSignalOutcomes(db, 24);

    type Row = { outcome_24h: string };
    const row = db.prepare<Row, [number]>("SELECT outcome_24h FROM signal_outcomes WHERE signal_id = ?").get(signalId);
    expect(row?.outcome_24h).toBe("incorrect");
  });

  it("flat move (<1%) → neutral outcome", async () => {
    const db = makeDb();
    const signalId = insertSignal(db, { stockCode: "VHM", createdAt: "2026-04-01 10:00:00" });
    insertPendingOutcome(db, {
      signalId,
      stockCode: "VHM",
      direction: "BULLISH",
      createdAt: "2026-04-01 10:00:00",
    });

    insertPrice(db, "VHM", 100_000, "2026-04-01 10:05:00");
    insertPrice(db, "VHM", 100_500, "2026-04-02 10:05:00"); // +0.5% → neutral

    await resolveSignalOutcomes(db, 24);

    type Row = { outcome_24h: string };
    const row = db.prepare<Row, [number]>("SELECT outcome_24h FROM signal_outcomes WHERE signal_id = ?").get(signalId);
    expect(row?.outcome_24h).toBe("neutral");
  });

  it("no price data → remains pending", async () => {
    const db = makeDb();
    // Ensure market_prices_history exists but has no data for this stock
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_prices_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        price REAL NOT NULL,
        fetched_at TEXT NOT NULL
      )
    `);

    const signalId = insertSignal(db, { stockCode: "TCB", createdAt: "2026-04-01 10:00:00" });
    insertPendingOutcome(db, {
      signalId,
      stockCode: "TCB",
      direction: "BULLISH",
      createdAt: "2026-04-01 10:00:00",
    });

    await resolveSignalOutcomes(db, 24);

    type Row = { outcome_24h: string };
    const row = db.prepare<Row, [number]>("SELECT outcome_24h FROM signal_outcomes WHERE signal_id = ?").get(signalId);
    expect(row?.outcome_24h).toBe("pending");
  });

  it("resolves T+48h window independently", async () => {
    const db = makeDb();
    const signalId = insertSignal(db, { stockCode: "MWG", createdAt: "2026-04-01 10:00:00" });
    insertPendingOutcome(db, {
      signalId,
      stockCode: "MWG",
      direction: "BULLISH",
      createdAt: "2026-04-01 10:00:00",
    });

    insertPrice(db, "MWG", 100_000, "2026-04-01 10:05:00");
    insertPrice(db, "MWG", 103_000, "2026-04-03 10:05:00"); // T+48h +3%

    await resolveSignalOutcomes(db, 48);

    type Row = { outcome_48h: string; outcome_24h: string };
    const row = db.prepare<Row, [number]>("SELECT outcome_24h, outcome_48h FROM signal_outcomes WHERE signal_id = ?").get(signalId);
    // 24h still pending (we only ran 48h resolution)
    expect(row?.outcome_24h).toBe("pending");
    expect(row?.outcome_48h).toBe("correct");
  });
});

// ── getAccuracyStats ──────────────────────────────────────────────────────────

describe("getAccuracyStats", () => {
  /** Insert a resolved signal_outcomes row directly for accuracy stat tests. */
  function insertResolvedOutcome(
    db: Database,
    opts: {
      signalId: number;
      stockCode: string;
      signalType?: string;
      outcome24h: "correct" | "incorrect" | "neutral";
      direction?: string;
    },
  ): void {
    db.prepare(
      `INSERT INTO signal_outcomes
         (signal_id, stock_code, signal_type, from_agent, predicted_direction,
          outcome_24h, checked_at, created_at)
       VALUES (?, ?, ?, 'news-scout', ?, ?, datetime('now'), datetime('now', '-1 day'))`,
    ).run(
      opts.signalId,
      opts.stockCode,
      opts.signalType ?? "chain_catalyst",
      opts.direction ?? "BULLISH",
      opts.outcome24h,
    );
  }

  it("returns null accuracy_rate when sample_count < 3", () => {
    const db = makeDb();
    // Insert 2 resolved outcomes — below minimum sample threshold
    for (let i = 0; i < 2; i++) {
      const sid = insertSignal(db, { stockCode: "VNM", confidenceScore: 70 });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "VNM", outcome24h: "correct" });
    }

    const stats = getAccuracyStats(db, { stockCode: "VNM" });
    // HAVING sample_count >= 3 means no rows returned when only 2 samples
    expect(stats).toHaveLength(0);
  });

  it("calculates accuracy_rate correctly with 3+ samples", () => {
    const db = makeDb();
    // 3 correct + 2 incorrect = 60% accuracy
    for (let i = 0; i < 3; i++) {
      const sid = insertSignal(db, { stockCode: "VCB", confidenceScore: 75 });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "VCB", outcome24h: "correct" });
    }
    for (let i = 0; i < 2; i++) {
      const sid = insertSignal(db, { stockCode: "VCB", confidenceScore: 60 });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "VCB", outcome24h: "incorrect" });
    }

    const stats = getAccuracyStats(db, { stockCode: "VCB" });
    expect(stats).toHaveLength(1);
    const stat = stats[0]!;
    expect(stat.sample_count).toBe(5); // 3 correct + 2 incorrect
    expect(stat.accuracy_rate).toBeCloseTo(0.6, 4);
  });

  it("neutral outcomes excluded from sample_count", () => {
    const db = makeDb();
    // 4 correct + 1 neutral (neutral excluded from denominator)
    for (let i = 0; i < 4; i++) {
      const sid = insertSignal(db, { stockCode: "HPG", confidenceScore: 80 });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "HPG", outcome24h: "correct" });
    }
    // Neutral row: insert a NEUTRAL predicted_direction row
    const sid = insertSignal(db, { stockCode: "HPG", confidenceScore: 50 });
    db.prepare(
      `INSERT INTO signal_outcomes
         (signal_id, stock_code, signal_type, from_agent, predicted_direction,
          outcome_24h, checked_at, created_at)
       VALUES (?, 'HPG', 'chain_catalyst', 'news-scout', 'NEUTRAL', 'neutral', datetime('now'), datetime('now', '-1 day'))`,
    ).run(sid);

    const stats = getAccuracyStats(db, { stockCode: "HPG" });
    // NEUTRAL predicted_direction excluded from WHERE clause
    // So only 4 correct rows count → sample_count = 4
    expect(stats).toHaveLength(1);
    const stat = stats[0]!;
    expect(stat.sample_count).toBe(4);
    expect(stat.accuracy_rate).toBeCloseTo(1.0, 4); // 4/4 = 100%
  });

  it("filters by signal_type when provided", () => {
    const db = makeDb();
    // 3 correct for chain_catalyst, 4 correct for urgent_news
    for (let i = 0; i < 3; i++) {
      const sid = insertSignal(db, { stockCode: "MSN", signalType: "chain_catalyst", confidenceScore: 70 });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "MSN", signalType: "chain_catalyst", outcome24h: "correct" });
    }
    for (let i = 0; i < 4; i++) {
      const sid = insertSignal(db, { stockCode: "MSN", signalType: "urgent_news", confidenceScore: 70 });
      insertResolvedOutcome(db, { signalId: sid, stockCode: "MSN", signalType: "urgent_news", outcome24h: "correct" });
    }

    const stats = getAccuracyStats(db, { stockCode: "MSN", signalType: "urgent_news" });
    expect(stats).toHaveLength(1);
    expect(stats[0]?.signal_type).toBe("urgent_news");
    expect(stats[0]?.sample_count).toBe(4);
  });

  it("returns empty array when signal_outcomes table absent", () => {
    // Create a DB without initNewsTables to simulate missing table
    const db = new Database(":memory:");
    const stats = getAccuracyStats(db, { stockCode: "VNM" });
    expect(stats).toHaveLength(0);
  });
});

// ── Integration: seedSignalOutcome + getAccuracyStats ─────────────────────────

describe("Integration: seed → resolve → stats", () => {
  it("NEUTRAL signal produces no outcome row and is excluded from stats", () => {
    const db = makeDb();
    const sid = insertSignal(db, { stockCode: "VNM", direction: "NEUTRAL" });

    const input: SeedSignalOutcomeInput = {
      stockCode: "VNM",
      signalType: "chain_catalyst",
      fromAgent: "news-scout",
      predictedDirection: "NEUTRAL",
      createdAt: "2026-05-01 10:00:00",
    };
    seedSignalOutcome(db, sid, input);

    const rows = db.prepare("SELECT * FROM signal_outcomes WHERE signal_id = ?").all(sid);
    expect(rows).toHaveLength(0);

    const stats = getAccuracyStats(db, { stockCode: "VNM" });
    expect(stats).toHaveLength(0);
  });
});
