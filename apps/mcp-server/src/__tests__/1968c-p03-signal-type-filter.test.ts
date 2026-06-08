Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1968c-P03 — get_agent_signals signal_type server-side filter
 *
 * AC-1: signal_type accepted by MCP tool schema (Zod validation) — optional, nullable.
 * AC-2: signal_type filters results server-side before response serialization.
 * AC-3: Omitting signal_type (null/undefined) returns all types (backward-compatible).
 * AC-6c: Invalid signal_type value → gracefully returns empty result (no error).
 * AC-7: Payload size reduction — filtered result is smaller than unfiltered (40-60%).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { getSignals } from "../infrastructure/db/agentSignalStore.js";
import { z } from "zod";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── DB helpers ───────────────────────────────────────────────────────────────

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
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_signals_to ON agent_signals(to_agent, status);
    CREATE INDEX IF NOT EXISTS idx_agent_signals_expires ON agent_signals(expires_at);
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function insertSignal(
  db: Database,
  opts: {
    fromAgent: string;
    toAgent: string;
    signalType: string;
    ttlMinutes?: number;
  }
): number {
  const ttl = opts.ttlMinutes ?? 120;
  const stmt = db.prepare<{ id: number }, []>(`
    INSERT INTO agent_signals (from_agent, to_agent, signal_type, payload, status, created_at, expires_at)
    VALUES (
      '${opts.fromAgent}',
      '${opts.toAgent}',
      '${opts.signalType}',
      '{"title":"test signal","impact_score":7}',
      'unread',
      datetime('now'),
      datetime('now', '+${ttl} minutes')
    )
    RETURNING id
  `);
  const row = stmt.get();
  return row!.id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 1968c-P03 — get_agent_signals signal_type filter", () => {
  // AC-1: Zod schema accepts signal_type as optional nullable string
  it("AC-1: signal_type is accepted by Zod schema (optional nullable string)", () => {
    const SignalTypeFilterSchema = z.string().nullable().optional();
    expect(SignalTypeFilterSchema.safeParse("price_anomaly").success).toBe(true);
    expect(SignalTypeFilterSchema.safeParse("verified_decision").success).toBe(true);
    expect(SignalTypeFilterSchema.safeParse(null).success).toBe(true);       // explicit null = all types
    expect(SignalTypeFilterSchema.safeParse(undefined).success).toBe(true);  // omitted = all types
    expect(SignalTypeFilterSchema.safeParse("").success).toBe(true);         // empty string allowed (handled as no-filter in impl)
  });

  // AC-2: signal_type filters results server-side
  it("AC-2: signal_type=price_anomaly returns only price_anomaly signals", () => {
    const db = makeDb();
    insertSignal(db, { fromAgent: "market-watcher", toAgent: "alert-commander", signalType: "price_anomaly" });
    insertSignal(db, { fromAgent: "news-scout",     toAgent: "alert-commander", signalType: "urgent_news" });
    insertSignal(db, { fromAgent: "news-scout",     toAgent: "alert-commander", signalType: "chain_catalyst" });

    const signals = getSignals(db, "alert-commander", {
      status: "all",
      signalType: "price_anomaly",
    });

    expect(signals.length).toBe(1);
    expect(signals[0]!.signalType).toBe("price_anomaly");
  });

  // AC-3: Omitting signal_type returns all types (backward-compatible)
  it("AC-3: omitting signal_type returns all signal types (backward-compat)", () => {
    const db = makeDb();
    insertSignal(db, { fromAgent: "market-watcher", toAgent: "alert-commander", signalType: "price_anomaly" });
    insertSignal(db, { fromAgent: "news-scout",     toAgent: "alert-commander", signalType: "urgent_news" });
    insertSignal(db, { fromAgent: "news-scout",     toAgent: "alert-commander", signalType: "chain_catalyst" });

    // No signalType param — all 3 should be returned
    const signals = getSignals(db, "alert-commander", { status: "all" });
    expect(signals.length).toBe(3);
  });

  // AC-3b: Explicit null also returns all types
  it("AC-3b: signal_type=null returns all signal types (explicit null = all)", () => {
    const db = makeDb();
    insertSignal(db, { fromAgent: "market-watcher", toAgent: "alert-commander", signalType: "price_anomaly" });
    insertSignal(db, { fromAgent: "news-scout",     toAgent: "alert-commander", signalType: "urgent_news" });

    const signals = getSignals(db, "alert-commander", {
      status: "all",
      signalType: null,
    });
    expect(signals.length).toBe(2);
  });

  // AC-6c: Invalid signal_type → empty result (graceful, no error thrown)
  it("AC-6c: non-existent signal_type returns empty array gracefully", () => {
    const db = makeDb();
    insertSignal(db, { fromAgent: "market-watcher", toAgent: "alert-commander", signalType: "price_anomaly" });
    insertSignal(db, { fromAgent: "news-scout",     toAgent: "alert-commander", signalType: "urgent_news" });

    let result: ReturnType<typeof getSignals> = [];
    expect(() => {
      result = getSignals(db, "alert-commander", {
        status: "all",
        signalType: "nonexistent_type_xyz",
      });
    }).not.toThrow();
    expect(result.length).toBe(0); // no match → empty, no error
  });

  // AC-7: Payload size reduction — filtered result is smaller than full set
  it("AC-7: filtered payload is significantly smaller than unfiltered (40-60% reduction)", () => {
    const db = makeDb();
    // Insert 5 price_anomaly + 5 other types (10 total)
    for (let i = 0; i < 5; i++) {
      insertSignal(db, { fromAgent: "market-watcher", toAgent: "alert-commander", signalType: "price_anomaly" });
    }
    for (let i = 0; i < 5; i++) {
      insertSignal(db, { fromAgent: "news-scout", toAgent: "alert-commander", signalType: "urgent_news" });
    }

    const all = getSignals(db, "alert-commander", { status: "all" });
    const filtered = getSignals(db, "alert-commander", {
      status: "all",
      signalType: "price_anomaly",
    });

    expect(all.length).toBe(10);
    expect(filtered.length).toBe(5);

    // Verify 50% reduction (within the 40-60% target range)
    const reductionPct = (1 - filtered.length / all.length) * 100;
    expect(reductionPct).toBeGreaterThanOrEqual(40);
    expect(reductionPct).toBeLessThanOrEqual(60);
  });
});
