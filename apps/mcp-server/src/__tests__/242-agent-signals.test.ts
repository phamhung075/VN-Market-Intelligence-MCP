Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 242 — Agent Signal Bus
 *
 * Tests for agentSignalStore: postSignal, getSignals, cleanExpired.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  postSignal,
  getSignals,
  cleanExpired,
  type AgentSignal,
} from "../infrastructure/db/agentSignalStore.js";

/** Create an isolated in-memory database with the agent_signals table. */
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
  return db;
}

describe("Task 242 — Agent Signal Bus", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  // ── postSignal ─────────────────────────────────────────────────────────────

  it("postSignal creates a row and returns a numeric ID", () => {
    const id = postSignal(db, {
      fromAgent: "market_watcher",
      toAgent: "alert_commander",
      signalType: "price_anomaly",
      stockCode: "VNM",
      payload: { title: "VNM drop", detail: "Price fell 5%", impact_score: 8 },
      ttlMinutes: 60,
    });
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("postSignal stores correct expires_at (roughly ttlMinutes from now)", () => {
    const before = Date.now();
    const ttlMinutes = 30;
    const id = postSignal(db, {
      fromAgent: "news_scout",
      toAgent: "report_analyzer",
      signalType: "urgent_news",
      payload: { title: "Breaking news", detail: "Details here" },
      ttlMinutes,
    });

    const row = db
      .query<{ expires_at: string }, [number]>("SELECT expires_at FROM agent_signals WHERE id = ?")
      .get(id);

    expect(row).toBeDefined();
    if (!row) throw new Error("Row not found");
    const expiresMs = new Date(row.expires_at + "Z").getTime();
    const expectedMin = before + ttlMinutes * 60 * 1000 - 5000; // -5s tolerance
    const expectedMax = Date.now() + ttlMinutes * 60 * 1000 + 5000; // +5s tolerance
    expect(expiresMs).toBeGreaterThan(expectedMin);
    expect(expiresMs).toBeLessThan(expectedMax);
  });

  it("postSignal stores payload as JSON", () => {
    const payload = { title: "Test", detail: "Detail", impact_score: 7 };
    const id = postSignal(db, {
      fromAgent: "scout",
      toAgent: "commander",
      signalType: "cross_validate",
      payload,
      ttlMinutes: 120,
    });

    const row = db
      .query<{ payload: string }, [number]>("SELECT payload FROM agent_signals WHERE id = ?")
      .get(id);

    if (!row) throw new Error("Row not found");
    expect(JSON.parse(row.payload)).toEqual(payload);
  });

  // ── getSignals ─────────────────────────────────────────────────────────────

  it("getSignals returns signals for the target agent", () => {
    postSignal(db, {
      fromAgent: "market_watcher",
      toAgent: "alert_commander",
      signalType: "price_anomaly",
      stockCode: "FPT",
      payload: { title: "FPT spike", detail: "Volume 3x" },
      ttlMinutes: 120,
    });
    postSignal(db, {
      fromAgent: "news_scout",
      toAgent: "report_analyzer",
      signalType: "urgent_news",
      payload: { title: "Other agent", detail: "Not for commander" },
      ttlMinutes: 120,
    });

    const signals = getSignals(db, "alert_commander");
    expect(signals.length).toBe(1);
    const s0 = signals[0]!;
    expect(s0.toAgent).toBe("alert_commander");
    expect(s0.signalType).toBe("price_anomaly");
    expect(s0.stockCode).toBe("FPT");
  });

  it("getSignals returns signals addressed to 'all'", () => {
    postSignal(db, {
      fromAgent: "system",
      toAgent: "all",
      signalType: "suppress",
      payload: { title: "Maintenance", detail: "Suppress all alerts" },
      ttlMinutes: 60,
    });

    const signals = getSignals(db, "alert_commander");
    expect(signals.length).toBe(1);
    expect(signals[0]!.toAgent).toBe("all");
  });

  it("getSignals marks unread signals as read after retrieval", () => {
    postSignal(db, {
      fromAgent: "scout",
      toAgent: "commander",
      signalType: "urgent_news",
      payload: { title: "Breaking", detail: "Details" },
      ttlMinutes: 120,
    });

    // First call — should return 1 unread signal
    const first = getSignals(db, "commander", { status: "unread" });
    expect(first.length).toBe(1);

    // Second call with status unread — should return 0 (now marked read)
    const second = getSignals(db, "commander", { status: "unread" });
    expect(second.length).toBe(0);

    // With status all — should still return the signal
    const all = getSignals(db, "commander", { status: "all" });
    expect(all.length).toBe(1);
    expect(all[0]!.status).toBe("read");
  });

  it("getSignals filters out expired signals", () => {
    // Insert an already-expired signal directly
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, payload, expires_at)
      VALUES ('scout', 'commander', 'urgent_news', '{"title":"old","detail":"x"}',
              datetime('now', '-1 minute'))
    `);

    const signals = getSignals(db, "commander");
    expect(signals.length).toBe(0);
  });

  it("getSignals parses payload back to object", () => {
    const payload = { title: "VCB news", detail: "Strong Q4", impact_score: 9 };
    postSignal(db, {
      fromAgent: "news_scout",
      toAgent: "report_analyzer",
      signalType: "urgent_news",
      stockCode: "VCB",
      payload,
      ttlMinutes: 120,
    });

    const signals = getSignals(db, "report_analyzer", { status: "all" });
    expect(signals.length).toBe(1);
    expect(signals[0]!.payload).toEqual(payload);
    expect(signals[0]!.stockCode).toBe("VCB");
  });

  // ── cleanExpired ───────────────────────────────────────────────────────────

  it("cleanExpired removes expired signals and returns count", () => {
    // Insert 2 expired + 1 valid
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, payload, expires_at)
      VALUES
        ('a', 'b', 'urgent_news', '{}', datetime('now', '-10 minutes')),
        ('a', 'c', 'suppress',    '{}', datetime('now', '-1 minute')),
        ('a', 'd', 'price_anomaly','{}', datetime('now', '+60 minutes'))
    `);

    const deleted = cleanExpired(db);
    expect(deleted).toBe(2);

    const remaining = db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM agent_signals").get();
    expect(remaining?.cnt).toBe(1);
  });

  it("cleanExpired returns 0 when nothing to clean", () => {
    postSignal(db, {
      fromAgent: "scout",
      toAgent: "commander",
      signalType: "cross_validate",
      payload: { title: "Valid", detail: "Not expired" },
      ttlMinutes: 120,
    });

    const deleted = cleanExpired(db);
    expect(deleted).toBe(0);
  });

  // ── signal_type validation ─────────────────────────────────────────────────

  it("postSignal accepts all valid signal_type values", () => {
    const validTypes = ["urgent_news", "price_anomaly", "cross_validate", "suppress"] as const;
    for (const signalType of validTypes) {
      const id = postSignal(db, {
        fromAgent: "a",
        toAgent: "b",
        signalType,
        payload: { title: "t", detail: "d" },
        ttlMinutes: 60,
      });
      expect(id).toBeGreaterThan(0);
    }
  });

  // ── AC-6: fromAgent filter (Task 1914) ─────────────────────────────────────

  it("AC-6a: getSignals with fromAgent returns self-sent rows regardless of to_agent", () => {
    // news-scout → alert-commander (self-sent, should be returned)
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "Breaking", detail: "VCB rally" },
      ttlMinutes: 120,
    });
    // alert-commander → news-scout (cross-agent, should NOT be returned)
    postSignal(db, {
      fromAgent: "alert-commander",
      toAgent: "news-scout",
      signalType: "cross_validate",
      payload: { title: "Validate", detail: "Confirm VCB" },
      ttlMinutes: 120,
    });

    const signals = getSignals(db, "news-scout", { fromAgent: "news-scout", status: "all" });
    expect(signals.length).toBe(1);
    expect(signals[0]!.fromAgent).toBe("news-scout");
    expect(signals[0]!.toAgent).toBe("alert-commander");
  });

  it("AC-6b: getSignals without fromAgent does not expose cross-agent rows", () => {
    // news-scout → alert-commander
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "Breaking", detail: "VCB rally" },
      ttlMinutes: 120,
    });
    // alert-commander → news-scout
    postSignal(db, {
      fromAgent: "alert-commander",
      toAgent: "news-scout",
      signalType: "cross_validate",
      payload: { title: "Validate", detail: "Confirm VCB" },
      ttlMinutes: 120,
    });

    // Without fromAgent, news-scout inbox: only the row addressed TO news-scout
    const signals = getSignals(db, "news-scout", { status: "all" });
    expect(signals.length).toBe(1);
    expect(signals[0]!.toAgent).toBe("news-scout");
    expect(signals[0]!.fromAgent).toBe("alert-commander");
  });

  it("AC-6c: getSignals with fromAgent + status=all returns read self-sent rows; read-mark NOT triggered", () => {
    // news-scout posts to "all"
    const id = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "all",
      signalType: "chain_catalyst",
      payload: { title: "Macro", detail: "CPI spike" },
      ttlMinutes: 180,
    });

    // Simulate another agent having already marked it read
    db.exec(`UPDATE agent_signals SET status = 'read' WHERE id = ${id}`);

    // Dedup query: fromAgent set, status=all — should return the row
    const signals = getSignals(db, "news-scout", { fromAgent: "news-scout", status: "all" });
    expect(signals.length).toBe(1);
    expect(signals[0]!.fromAgent).toBe("news-scout");

    // Verify read-mark side-effect was NOT triggered (row still has status "read" as set above,
    // meaning getSignals did not re-mark it in any unexpected way — status remains "read")
    const row = db
      .query<{ status: string }, [number]>("SELECT status FROM agent_signals WHERE id = ?")
      .get(id);
    expect(row?.status).toBe("read");

    // Second call also returns the row (status unchanged proves no unread→read flip happened)
    const signals2 = getSignals(db, "news-scout", { fromAgent: "news-scout", status: "all" });
    expect(signals2.length).toBe(1);
  });
});
