Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 244 — Signal Outcome Tracking
 *
 * Tests for recordOutcome and getSignalEffectiveness in agentSignalStore.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  postSignal,
  recordOutcome,
  getSignalEffectiveness,
} from "../infrastructure/db/agentSignalStore.js";

/** Create an isolated in-memory database with the agent_signals table + outcome columns. */
function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      outcome TEXT,
      outcome_at TEXT,
      outcome_detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_signals_to ON agent_signals(to_agent, status);
    CREATE INDEX IF NOT EXISTS idx_agent_signals_expires ON agent_signals(expires_at);
  `);
  return db;
}

/** Post a signal with a long TTL for convenience. */
function post(
  db: Database,
  fromAgent: string,
  signalType: "urgent_news" | "price_anomaly" | "cross_validate" | "suppress" = "urgent_news",
): number {
  return postSignal(db, {
    fromAgent,
    toAgent: "alert_commander",
    signalType,
    payload: { title: "Test", detail: "Detail" },
    ttlMinutes: 60,
  });
}

describe("Task 244 — Signal Outcome Tracking", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  // ── recordOutcome ──────────────────────────────────────────────────────────

  it("recordOutcome updates the outcome column on the correct row", () => {
    const id = post(db, "market_watcher");

    recordOutcome(db, id, "fired");

    const row = db
      .query<{ outcome: string | null }, [number]>(
        "SELECT outcome FROM agent_signals WHERE id = ?",
      )
      .get(id);

    expect(row).not.toBeNull();
    expect(row!.outcome).toBe("fired");
  });

  it("recordOutcome sets outcome_at to a non-null datetime", () => {
    const id = post(db, "market_watcher");

    recordOutcome(db, id, "confirmed");

    const row = db
      .query<{ outcome_at: string | null }, [number]>(
        "SELECT outcome_at FROM agent_signals WHERE id = ?",
      )
      .get(id);

    expect(row!.outcome_at).not.toBeNull();
    // Should look like a datetime string
    expect(row!.outcome_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("recordOutcome stores the optional detail text", () => {
    const id = post(db, "market_watcher");

    recordOutcome(db, id, "false_positive", "Price recovered — no real impact");

    const row = db
      .query<{ outcome_detail: string | null }, [number]>(
        "SELECT outcome_detail FROM agent_signals WHERE id = ?",
      )
      .get(id);

    expect(row!.outcome_detail).toBe("Price recovered — no real impact");
  });

  it("recordOutcome with no detail stores NULL for outcome_detail", () => {
    const id = post(db, "news_scout");

    recordOutcome(db, id, "suppressed");

    const row = db
      .query<{ outcome_detail: string | null }, [number]>(
        "SELECT outcome_detail FROM agent_signals WHERE id = ?",
      )
      .get(id);

    expect(row!.outcome_detail).toBeNull();
  });

  // ── getSignalEffectiveness ─────────────────────────────────────────────────

  it("getSignalEffectiveness computes precision correctly", () => {
    // 2 confirmed + 1 false_positive → precision = 2/3 ≈ 0.6667
    const id1 = post(db, "market_watcher", "price_anomaly");
    const id2 = post(db, "market_watcher", "price_anomaly");
    const id3 = post(db, "market_watcher", "price_anomaly");

    recordOutcome(db, id1, "confirmed");
    recordOutcome(db, id2, "confirmed");
    recordOutcome(db, id3, "false_positive");

    const results = getSignalEffectiveness(db, { days: 30 });

    expect(results.length).toBe(1);
    const r = results[0]!;
    expect(r.fromAgent).toBe("market_watcher");
    expect(r.signalType).toBe("price_anomaly");
    expect(r.total).toBe(3);
    expect(r.confirmed).toBe(2);
    expect(r.false_positive).toBe(1);
    expect(r.precision).toBeCloseTo(2 / 3, 5);
  });

  it("getSignalEffectiveness returns null precision when no confirmed/false_positive rows", () => {
    const id1 = post(db, "news_scout", "urgent_news");
    const id2 = post(db, "news_scout", "urgent_news");

    recordOutcome(db, id1, "fired");
    recordOutcome(db, id2, "suppressed");

    const results = getSignalEffectiveness(db, { days: 30 });

    expect(results.length).toBe(1);
    expect(results[0]!.precision).toBeNull();
    // fired=1, suppressed=1 — total=2 but fired column only counts 'fired' outcome
    expect(results[0]!.total).toBe(2);
    expect(results[0]!.fired).toBe(1);
  });

  it("getSignalEffectiveness excludes rows with null outcome", () => {
    const id1 = post(db, "market_watcher", "price_anomaly");
    post(db, "market_watcher", "price_anomaly"); // no outcome recorded

    recordOutcome(db, id1, "confirmed");

    const results = getSignalEffectiveness(db, { days: 30 });

    // Only 1 row in the result (the unresolved one is excluded)
    expect(results.length).toBe(1);
    expect(results[0]!.total).toBe(1);
  });

  it("getSignalEffectiveness filters by fromAgent", () => {
    const id1 = post(db, "market_watcher", "price_anomaly");
    const id2 = post(db, "news_scout", "urgent_news");

    recordOutcome(db, id1, "confirmed");
    recordOutcome(db, id2, "fired");

    const results = getSignalEffectiveness(db, {
      fromAgent: "market_watcher",
      days: 30,
    });

    expect(results.length).toBe(1);
    expect(results[0]!.fromAgent).toBe("market_watcher");
  });

  it("getSignalEffectiveness filters by signalType", () => {
    const id1 = post(db, "market_watcher", "price_anomaly");
    const id2 = post(db, "news_scout", "urgent_news");

    recordOutcome(db, id1, "confirmed");
    recordOutcome(db, id2, "fired");

    const results = getSignalEffectiveness(db, {
      signalType: "urgent_news",
      days: 30,
    });

    expect(results.length).toBe(1);
    expect(results[0]!.signalType).toBe("urgent_news");
  });

  it("getSignalEffectiveness groups multiple agents separately", () => {
    const id1 = post(db, "agent_a", "cross_validate");
    const id2 = post(db, "agent_b", "cross_validate");

    recordOutcome(db, id1, "confirmed");
    recordOutcome(db, id2, "false_positive");

    const results = getSignalEffectiveness(db, { days: 30 });

    expect(results.length).toBe(2);
    const agents = results.map((r) => r.fromAgent).sort();
    expect(agents).toEqual(["agent_a", "agent_b"]);
  });
});
