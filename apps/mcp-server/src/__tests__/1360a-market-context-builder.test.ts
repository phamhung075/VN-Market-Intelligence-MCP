// apps/mcp-server/src/__tests__/1360a-market-context-builder.test.ts
// Task 1360a — marketContextBuilder unit tests (16 tests, in-memory SQLite)
// No mock.module, no initDatabase, no production changes.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  buildMarketContextText,
  buildSystemStatusText,
} from "../domain/services/marketContextBuilder.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB fixture
// ─────────────────────────────────────────────────────────────────────────────

function buildMcbDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE watchlist (
      code TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain TEXT NOT NULL DEFAULT 'banking',
      notes TEXT,
      alert_drop_pct REAL NOT NULL DEFAULT 5.0,
      alert_rise_pct REAL NOT NULL DEFAULT 5.0,
      alert_impact_min REAL NOT NULL DEFAULT 0.5
    );
    CREATE TABLE market_prices (
      code TEXT PRIMARY KEY,
      price REAL,
      change_pct REAL,
      updated_at TEXT
    );
    CREATE TABLE alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      signals_json TEXT,
      affected_actions_json TEXT,
      message TEXT,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE rag_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'market',
      source_title TEXT,
      sentiment TEXT,
      impact_score REAL,
      impact_direction TEXT,
      summary TEXT,
      data_env TEXT
);
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section A — buildMarketContextText: empty-DB smoke (MCB-1 through MCB-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360a — marketContextBuilder: empty-DB smoke", () => {
  let db: Database;
  let text: string;

  // Shared setup: one empty DB, one call
  (() => {
    db = buildMcbDb();
    text = buildMarketContextText(db, 24);
  })();

  it("MCB-1: empty DB — watchlist section contains fallback message", () => {
    expect(text).toContain("=== WATCHLIST & PRICES ===");
    expect(text).toContain("Watchlist is empty");
  });

  it("MCB-2: empty DB — macro section contains fallback message", () => {
    expect(text).toContain("=== MACRO ===");
    expect(text).toContain("No macro data available");
  });

  it("MCB-3: empty DB — alerts section contains no-alerts message", () => {
    expect(text).toContain("=== OPEN ALERTS (24h) ===");
    expect(text).toContain("No open alerts in this window");
  });

  it("MCB-4: empty DB — analysis section contains no-analysis message", () => {
    expect(text).toContain("=== RECENT ANALYSIS (24h) ===");
    expect(text).toContain("No analysis entries in this window");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section B — buildMarketContextText: stale-price logic (MCB-5 through MCB-7)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360a — marketContextBuilder: stale-price logic", () => {
  it("MCB-5: price updated 25h ago — row gets [STALE] flag and stale warning line", () => {
    const db = buildMcbDb();
    const stalePriceTs = new Date(Date.now() - 25 * 3_600_000).toISOString();
    db.exec(`INSERT INTO watchlist (code, exchange, domain) VALUES ('VCB', 'HOSE', 'banking')`);
    db.exec(`INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES ('VCB', 85000, 1.2, '${stalePriceTs}')`);

    const text = buildMarketContextText(db, 24);

    expect(text).toContain("[STALE]");
    expect(text).toContain("1 price(s) are stale (>24h)");
  });

  it("MCB-6: price updated 23h ago — no [STALE] flag", () => {
    const db = buildMcbDb();
    const freshTs = new Date(Date.now() - 23 * 3_600_000).toISOString();
    db.exec(`INSERT INTO watchlist (code, exchange, domain) VALUES ('VCB', 'HOSE', 'banking')`);
    db.exec(`INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES ('VCB', 85000, 1.2, '${freshTs}')`);

    const text = buildMarketContextText(db, 24);

    expect(text).not.toContain("[STALE]");
    expect(text).not.toContain("stale");
  });

  it("MCB-7: two stale prices — warning line says '2 price(s)'", () => {
    const db = buildMcbDb();
    const staleTs = new Date(Date.now() - 48 * 3_600_000).toISOString();
    db.exec(`INSERT INTO watchlist (code, exchange, domain) VALUES ('VCB', 'HOSE', 'banking'), ('TCB', 'HOSE', 'banking')`);
    db.exec(`INSERT INTO market_prices (code, price, change_pct, updated_at) VALUES ('VCB', 85000, 1.2, '${staleTs}'), ('TCB', 50000, -0.5, '${staleTs}')`);

    const text = buildMarketContextText(db, 24);

    expect(text).toContain("2 price(s) are stale (>24h)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section C — buildMarketContextText: hoursBack boundary (MCB-8 through MCB-10)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360a — marketContextBuilder: hoursBack boundary", () => {
  it("MCB-8: alert older than hoursBack window is excluded", () => {
    const db = buildMcbDb();
    const oldTs = new Date(Date.now() - 25 * 3_600_000).toISOString();
    db.exec(`INSERT INTO alerts (id, triggered_at, severity, read) VALUES ('a1', '${oldTs}', 'medium', 0)`);

    const text = buildMarketContextText(db, 24);

    expect(text).toContain("No open alerts in this window");
  });

  it("MCB-9: alert within window is included and formatted correctly", () => {
    const db = buildMcbDb();
    const recentTs = new Date(Date.now() - 1 * 3_600_000).toISOString();
    db.exec(`INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message, read)
             VALUES ('a1', '${recentTs}', 'high', '["price_drop","volume_spike"]', '["VCB","TCB"]', 'Cảnh báo giảm mạnh', 0)`);

    const text = buildMarketContextText(db, 24);

    expect(text).toContain("1 open alert");
    expect(text).toContain("[HIGH]");
    expect(text).toContain("VCB");
    expect(text).toContain("price_drop");
    expect(text).toContain("Cảnh báo giảm mạnh");
  });

  it("MCB-10: read=1 alert is excluded from open alerts section", () => {
    const db = buildMcbDb();
    const recentTs = new Date(Date.now() - 1 * 3_600_000).toISOString();
    db.exec(`INSERT INTO alerts (id, triggered_at, severity, read) VALUES ('a1', '${recentTs}', 'high', 1)`);

    const text = buildMarketContextText(db, 24);

    expect(text).toContain("No open alerts in this window");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section D — buildMarketContextText: analysis section (MCB-11 through MCB-12)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360a — marketContextBuilder: analysis section", () => {
  it("MCB-11: analysis entry within window is rendered with all fields", () => {
    const db = buildMcbDb();
    const recentTs = new Date(Date.now() - 30 * 60_000).toISOString();
    db.exec(`INSERT INTO rag_analyses (id, created_at, level, source_title, sentiment, impact_score, impact_direction, summary)
             VALUES ('r1', '${recentTs}', 'market', 'VCB tăng trưởng tín dụng Q1', 'bullish', 0.8, 'positive', 'Ngân hàng VCB ghi nhận lợi nhuận tăng 20% YoY')`);

    const text = buildMarketContextText(db, 24);

    expect(text).toContain("[bullish]");
    expect(text).toContain("VCB tăng trưởng tín dụng Q1");
    expect(text).toContain("0.8");
    expect(text).toContain("positive");
    expect(text).toContain("Ngân hàng VCB");
  });

  it("MCB-12: long source_title (>80 chars) is truncated with ellipsis", () => {
    const db = buildMcbDb();
    const recentTs = new Date(Date.now() - 30 * 60_000).toISOString();
    const longTitle = "A".repeat(100);
    db.exec(`INSERT INTO rag_analyses (id, created_at, level, source_title, sentiment, impact_score, impact_direction, summary)
             VALUES ('r1', '${recentTs}', 'market', '${longTitle}', 'neutral', 0.5, 'neutral', 'Summary text')`);

    const text = buildMarketContextText(db, 24);

    expect(text).toContain(longTitle.slice(0, 80) + "…");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section E — buildSystemStatusText (MCB-13 through MCB-16)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1360a — buildSystemStatusText", () => {
  it("MCB-13: empty DB — system status shows '0 alerts pending' and 'unknown' for timestamps", () => {
    const db = buildMcbDb();
    const text = buildSystemStatusText(db);

    expect(text).toContain("=== SYSTEM STATUS ===");
    expect(text).toContain("0 alerts pending");
    expect(text).toContain("last alert: unknown");
    expect(text).toContain("last analysis: unknown");
  });

  it("MCB-14: one unread alert — pending count is 1 (singular)", () => {
    const db = buildMcbDb();
    const ts = new Date(Date.now() - 1 * 3_600_000).toISOString();
    db.exec(`INSERT INTO alerts (id, triggered_at, severity, read) VALUES ('a1', '${ts}', 'medium', 0)`);

    const text = buildSystemStatusText(db);

    expect(text).toContain("1 alert pending");
    expect(text).not.toContain("1 alerts pending");
  });

  it("MCB-15: multiple unread alerts — pending count is correct", () => {
    const db = buildMcbDb();
    const ts = new Date(Date.now() - 1 * 3_600_000).toISOString();
    db.exec(`INSERT INTO alerts (id, triggered_at, severity, read) VALUES
             ('a1', '${ts}', 'medium', 0),
             ('a2', '${ts}', 'low', 0),
             ('a3', '${ts}', 'high', 0)`);

    const text = buildSystemStatusText(db);

    expect(text).toContain("3 alerts pending");
  });

  it("MCB-16: last alert timestamp is formatted as 'YYYY-MM-DD HH:MM'", () => {
    const db = buildMcbDb();
    db.exec(`INSERT INTO alerts (id, triggered_at, severity, read) VALUES ('a1', '2026-04-28T09:30:00.000Z', 'medium', 0)`);

    const text = buildSystemStatusText(db);

    expect(text).toContain("last alert: 2026-04-28 09:30");
  });
});
