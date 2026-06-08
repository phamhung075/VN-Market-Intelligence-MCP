/**
 * Task 1862g — Signal dedup: 4h time-window suppression for urgent_news
 *
 * When the same stock_code + signal_type + direction are posted within a 4-hour
 * window, the second call to postSignal() must return -1 (suppressed) instead
 * of inserting a duplicate row.
 *
 * The dedup key is: (stock_code, signal_type, direction from finding_data).
 * Direction is read from finding_data.direction or finding_data.catalyst_direction.
 * If no direction is present in finding_data, no dedup is applied (unique key
 * cannot be formed — we allow the signal through).
 *
 * Window: 4 hours (240 minutes). Configurable via optional dedupWindowMinutes
 * parameter in PostSignalInput (default = 240).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { postSignal } from "../infrastructure/db/agentSignalStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Minimal in-memory DB with all columns needed by postSignal().
 * We add finding_data and cycle_id so the chain column path is taken.
 */
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
      cycle_id TEXT,
      finding_data TEXT,
      causal_ref INTEGER,
      chain_depth INTEGER NOT NULL DEFAULT 0,
      causal_root_id TEXT,
      causal_root_label TEXT,
      signal_class TEXT,
      confidence_score INTEGER NOT NULL DEFAULT 50,
      validated_at TEXT,
      news_sentiment REAL,
      kinh_dich_confidence REAL,
      agent_signals_majority TEXT
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe("1862g — urgent_news 4h dedup", () => {
  it("first signal inserts and returns a positive id", () => {
    const db = makeDb();
    const id = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC bullish news" },
      ttlMinutes: 120,
      findingData: { headline: "VIC up", source: "cafef", severity: "high", direction: "bullish" },
    });
    expect(id).toBeGreaterThan(0);
  });

  it("second signal — same stock + same direction within 4h — is suppressed (returns -1)", () => {
    const db = makeDb();
    // First post — should succeed
    const id1 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC bullish news first" },
      ttlMinutes: 120,
      findingData: { headline: "VIC up", source: "cafef", severity: "high", direction: "bullish" },
    });
    expect(id1).toBeGreaterThan(0);

    // Second post — same stock, same type, same direction → must be suppressed
    const id2 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC bullish news second" },
      ttlMinutes: 120,
      findingData: { headline: "VIC up again", source: "cafef", severity: "medium", direction: "bullish" },
    });
    expect(id2).toBe(-1);
  });

  it("different direction — bearish after bullish — is NOT suppressed", () => {
    const db = makeDb();
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC bullish" },
      ttlMinutes: 120,
      findingData: { headline: "VIC up", source: "cafef", severity: "high", direction: "bullish" },
    });

    const id2 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC bearish" },
      ttlMinutes: 120,
      findingData: { headline: "VIC down", source: "cafef", severity: "high", direction: "bearish" },
    });
    expect(id2).toBeGreaterThan(0);
  });

  it("different ticker — VHM after VIC — is NOT suppressed", () => {
    const db = makeDb();
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC bullish" },
      ttlMinutes: 120,
      findingData: { headline: "VIC up", source: "cafef", severity: "high", direction: "bullish" },
    });

    const id2 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VHM",
      payload: { title: "VHM bullish" },
      ttlMinutes: 120,
      findingData: { headline: "VHM up", source: "cafef", severity: "high", direction: "bullish" },
    });
    expect(id2).toBeGreaterThan(0);
  });

  it("different signal_type — chain_catalyst after urgent_news — is NOT suppressed", () => {
    const db = makeDb();
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC bullish" },
      ttlMinutes: 120,
      findingData: { headline: "VIC up", source: "cafef", severity: "high", direction: "bullish" },
    });

    const id2 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VIC",
      payload: { title: "VIC chain catalyst" },
      ttlMinutes: 120,
      findingData: {
        event_type: "macro",
        direction: "bullish",
        confidence: 0.75,
        affected_stocks: ["VIC"],
        affected_sectors: ["real_estate"],
        headline: "VIC macro event",
        source: "cafef",
      },
    });
    expect(id2).toBeGreaterThan(0);
  });

  it("no direction in finding_data — no dedup applied, both inserts succeed", () => {
    const db = makeDb();
    const id1 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC news 1" },
      ttlMinutes: 120,
      findingData: { headline: "VIC news", source: "cafef", severity: "high" },
      // no direction field
    });
    const id2 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC news 2" },
      ttlMinutes: 120,
      findingData: { headline: "VIC news again", source: "cafef", severity: "medium" },
      // no direction field
    });
    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(0);
  });

  it("no stock_code — no dedup applied, both inserts succeed", () => {
    const db = makeDb();
    const id1 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "Market news 1" },
      ttlMinutes: 120,
      findingData: { headline: "Market news", source: "cafef", severity: "high", direction: "bullish" },
    });
    const id2 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      payload: { title: "Market news 2" },
      ttlMinutes: 120,
      findingData: { headline: "Market news again", source: "cafef", severity: "medium", direction: "bullish" },
    });
    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(0);
  });

  it("signal after 4h window expires — allowed (using dedupWindowMinutes=0 to simulate expiry)", () => {
    const db = makeDb();
    // First signal
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC old news" },
      ttlMinutes: 120,
      findingData: { headline: "VIC up", source: "cafef", severity: "high", direction: "bullish" },
    });

    // Second signal with a 0-minute dedup window (window has "already expired")
    const id2 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC new news" },
      ttlMinutes: 120,
      findingData: { headline: "VIC up again", source: "cafef", severity: "high", direction: "bullish" },
      dedupWindowMinutes: 0, // window = 0 means no prior signals count
    });
    expect(id2).toBeGreaterThan(0);
  });

  it("custom dedupWindowMinutes=30 — still suppresses within 30 min", () => {
    const db = makeDb();
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VCB",
      payload: { title: "VCB bullish" },
      ttlMinutes: 120,
      findingData: { headline: "VCB up", source: "cafef", severity: "high", direction: "bullish" },
      dedupWindowMinutes: 30,
    });

    const id2 = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VCB",
      payload: { title: "VCB bullish again" },
      ttlMinutes: 120,
      findingData: { headline: "VCB up again", source: "cafef", severity: "medium", direction: "bullish" },
      dedupWindowMinutes: 30,
    });
    expect(id2).toBe(-1);
  });

  it("returns correct row count — only 1 row in DB after suppressed duplicate", () => {
    const db = makeDb();
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "HPG",
      payload: { title: "HPG bullish" },
      ttlMinutes: 120,
      findingData: { headline: "HPG up", source: "cafef", severity: "high", direction: "bullish" },
    });
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "HPG",
      payload: { title: "HPG bullish again" },
      ttlMinutes: 120,
      findingData: { headline: "HPG up again", source: "cafef", severity: "high", direction: "bullish" },
    });

    const count = db.query<{ n: number }, []>(
      "SELECT COUNT(*) as n FROM agent_signals WHERE stock_code = 'HPG'"
    ).get();
    expect(count!.n).toBe(1);
  });
});
