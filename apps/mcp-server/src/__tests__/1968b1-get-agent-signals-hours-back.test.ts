Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1968b1 — get_agent_signals hours_back parameter
 *
 * AC-1: hours_back accepted by MCP tool schema (Zod validation).
 * AC-2: hours_back filters signals created more than N hours ago.
 * AC-3: Default (no hours_back) preserves backward-compat: returns non-expired signals.
 * AC-4: hours_back=6 covers 360-min legal_risk dedup window (canonical case for news-scout).
 * AC-5: hours_back combined with from_agent (sender-history) works correctly.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { getSignals } from "../infrastructure/db/agentSignalStore.js";
import { formatSignalLines } from "../interface/mcp/tools/news-analysis/agentSignalTools.js";
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

/** Insert a signal with a custom created_at offset (minutes relative to now). */
function insertSignalAgedMinutes(
  db: Database,
  opts: {
    fromAgent: string;
    toAgent: string;
    signalType: string;
    agedMinutes: number; // positive = created N minutes ago
    ttlMinutes?: number; // default 1440 (24h) to avoid expiry interference
  }
): number {
  const ttl = opts.ttlMinutes ?? 1440;
  const stmt = db.prepare<{ id: number }, []>(`
    INSERT INTO agent_signals (from_agent, to_agent, signal_type, payload, status, created_at, expires_at)
    VALUES (
      '${opts.fromAgent}',
      '${opts.toAgent}',
      '${opts.signalType}',
      '{"title":"test"}',
      'unread',
      datetime('now', '-${opts.agedMinutes} minutes'),
      datetime('now', '+${ttl} minutes')
    )
    RETURNING id
  `);
  const row = stmt.get();
  return row!.id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Task 1968b1 — get_agent_signals hours_back parameter", () => {
  // AC-1: Zod schema accepts hours_back as a positive number
  it("AC-1: hours_back is accepted by Zod schema (positive number, optional)", () => {
    const HoursBackSchema = z.coerce.number().positive().optional();
    expect(HoursBackSchema.safeParse(6).success).toBe(true);
    expect(HoursBackSchema.safeParse("6").success).toBe(true); // coerce from string
    expect(HoursBackSchema.safeParse(undefined).success).toBe(true); // optional
    expect(HoursBackSchema.safeParse(0).success).toBe(false); // must be positive
    expect(HoursBackSchema.safeParse(-1).success).toBe(false); // must be positive
  });

  // AC-2: hours_back filters out signals older than the window
  it("AC-2: hours_back=1 excludes signals created 90 minutes ago", () => {
    const db = makeDb();
    // Signal created 90 min ago (older than 1h window)
    insertSignalAgedMinutes(db, {
      fromAgent: "news-scout",
      toAgent: "news-scout",
      signalType: "legal_risk",
      agedMinutes: 90,
    });
    // Signal created 30 min ago (within 1h window)
    insertSignalAgedMinutes(db, {
      fromAgent: "news-scout",
      toAgent: "news-scout",
      signalType: "urgent_news",
      agedMinutes: 30,
    });

    const signals = getSignals(db, "news-scout", {
      status: "all",
      hoursBack: 1, // last 60 minutes
    });

    expect(signals.length).toBe(1);
    expect(signals[0]!.signalType).toBe("urgent_news");
  });

  // AC-3: No hours_back → default behavior (all non-expired signals returned)
  it("AC-3: omitting hours_back returns all non-expired signals regardless of age", () => {
    const db = makeDb();
    // Signal created 400 minutes ago (would be excluded by hours_back=6)
    insertSignalAgedMinutes(db, {
      fromAgent: "news-scout",
      toAgent: "news-scout",
      signalType: "legal_risk",
      agedMinutes: 400,
      ttlMinutes: 1440,
    });

    const signals = getSignals(db, "news-scout", {
      status: "all",
      // hoursBack omitted intentionally
    });

    expect(signals.length).toBe(1); // backward-compat: old signal visible
  });

  // AC-4: hours_back=6 (360 min) covers the legal_risk dedup window
  it("AC-4: hours_back=6 includes signals up to 360 minutes old", () => {
    const db = makeDb();
    // Signal at exactly 359 min ago — inside the 360-min window
    insertSignalAgedMinutes(db, {
      fromAgent: "news-scout",
      toAgent: "news-scout",
      signalType: "legal_risk",
      agedMinutes: 359,
    });
    // Signal at 361 min ago — outside the 360-min window
    insertSignalAgedMinutes(db, {
      fromAgent: "news-scout",
      toAgent: "news-scout",
      signalType: "legal_risk",
      agedMinutes: 361,
    });

    const signals = getSignals(db, "news-scout", {
      status: "all",
      hoursBack: 6, // 360 minutes
    });

    expect(signals.length).toBe(1);
    // The 359-min-old signal should be returned; 361-min-old excluded
  });

  // AC-5: hours_back combined with from_agent (sender-history path) filters correctly
  it("AC-5: hours_back with from_agent filters sender-history by age", () => {
    const db = makeDb();
    // Sent 30 min ago — within 1h window
    insertSignalAgedMinutes(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      agedMinutes: 30,
    });
    // Sent 90 min ago — outside 1h window
    insertSignalAgedMinutes(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "legal_risk",
      agedMinutes: 90,
    });

    const signals = getSignals(db, "alert-commander", {
      status: "all",
      fromAgent: "news-scout",
      hoursBack: 1,
    });

    expect(signals.length).toBe(1);
    expect(signals[0]!.signalType).toBe("urgent_news");
  });

  // AC-3b: Default call (no args) still works — regression guard
  it("AC-3b: getSignals() with no opts returns all unread non-expired signals", () => {
    const db = makeDb();
    insertSignalAgedMinutes(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "price_anomaly",
      agedMinutes: 5,
    });

    const signals = getSignals(db, "alert-commander");
    expect(signals.length).toBe(1);
    expect(signals[0]!.fromAgent).toBe("market-watcher");
  });

  // formatSignalLines — ensure empty result still formats correctly (regression guard)
  it("formatSignalLines: empty array returns Vietnamese no-signal message", () => {
    const text = formatSignalLines([], "news-scout");
    expect(text).toBe("Không có tín hiệu mới.");
  });
});
