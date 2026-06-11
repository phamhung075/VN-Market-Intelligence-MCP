/**
 * REAUDIT-002 — computeStaleness utility + stale fields on all 5 handlers
 *
 * AC-1: computeStaleness returns {stale:false, staleByDays:0} for null asOf
 * AC-2: computeStaleness returns {stale:false, staleByDays:0} when within threshold
 * AC-3: computeStaleness returns {stale:true, staleByDays>0} when over threshold
 * AC-4: computeStaleness exact-threshold edge case: daysDiff === threshold → not stale
 * AC-5: computeStaleness unparseable date → {stale:false, staleByDays:0}
 * AC-6: convictionHistoryHandler includes stale/staleByDays in response
 * AC-7: reputationHandler includes stale/staleByDays in response
 * AC-8: shareholdersHandler includes stale/staleByDays in response
 * AC-9: financialsHandler includes stale/staleByDays in response
 * AC-10: corporateEventsHandler includes stale/staleByDays in response
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { computeStaleness } from "../interface/mcp/routes/_staleness.js";
import {
  handleGetConvictionHistory,
  CONVICTION_STALENESS_THRESHOLD_DAYS,
} from "../interface/mcp/routes/convictionHistoryHandler.js";
import {
  handleGetReputation,
  REPUTATION_STALENESS_THRESHOLD_DAYS,
} from "../interface/mcp/routes/reputationHandler.js";
import {
  handleGetShareholders,
  SHAREHOLDERS_STALENESS_THRESHOLD_DAYS,
} from "../interface/mcp/routes/shareholdersHandler.js";
import {
  handleGetFinancials,
  FINANCIALS_STALENESS_THRESHOLD_DAYS,
} from "../interface/mcp/routes/financialsHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a Date that is `days` days after `asOf` — simulates a "just-fresh" clock. */
function clockAfter(asOf: string, days: number): Date {
  const d = new Date(asOf + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 to AC-5: computeStaleness unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("REAUDIT-002 — computeStaleness: null/empty asOf", () => {
  it("AC-1a: null asOf → not stale", () => {
    const r = computeStaleness(null, 3, new Date());
    expect(r.stale).toBe(false);
    expect(r.staleByDays).toBe(0);
  });

  it("AC-1b: undefined asOf → not stale", () => {
    const r = computeStaleness(undefined, 3, new Date());
    expect(r.stale).toBe(false);
    expect(r.staleByDays).toBe(0);
  });

  it("AC-1c: empty string asOf → not stale", () => {
    const r = computeStaleness("", 3, new Date());
    expect(r.stale).toBe(false);
    expect(r.staleByDays).toBe(0);
  });
});

describe("REAUDIT-002 — computeStaleness: within threshold", () => {
  it("AC-2a: 1 day old, threshold=2 → not stale", () => {
    const asOf = "2026-06-10";
    const now = clockAfter(asOf, 1); // 1 day later
    const r = computeStaleness(asOf, 2, now);
    expect(r.stale).toBe(false);
    expect(r.staleByDays).toBe(0);
  });

  it("AC-2b: ISO 8601 timestamp asOf normalised to date part", () => {
    const asOf = "2026-06-09T08:30:00.000Z";
    const now = clockAfter("2026-06-09", 2); // exactly threshold
    const r = computeStaleness(asOf, 2, now);
    // daysDiff=2 is NOT > threshold=2 → not stale
    expect(r.stale).toBe(false);
  });
});

describe("REAUDIT-002 — computeStaleness: over threshold", () => {
  it("AC-3a: 5 days old, threshold=3 → stale, staleByDays=2", () => {
    const asOf = "2026-06-06";
    const now = clockAfter(asOf, 5);
    const r = computeStaleness(asOf, 3, now);
    expect(r.stale).toBe(true);
    expect(r.staleByDays).toBe(2);
  });

  it("AC-3b: 58 days old, threshold=55 → stale, staleByDays=3 (current shareholders case)", () => {
    const asOf = "2026-04-14";
    const now = clockAfter(asOf, 58);
    const r = computeStaleness(asOf, 55, now);
    expect(r.stale).toBe(true);
    expect(r.staleByDays).toBe(3);
  });
});

describe("REAUDIT-002 — computeStaleness: exact threshold edge case", () => {
  it("AC-4: daysDiff === threshold → NOT stale (stale only when strictly greater)", () => {
    const asOf = "2026-06-08";
    const now = clockAfter(asOf, 3); // daysDiff === threshold=3
    const r = computeStaleness(asOf, 3, now);
    expect(r.stale).toBe(false);
    expect(r.staleByDays).toBe(0);
  });
});

describe("REAUDIT-002 — computeStaleness: unparseable date", () => {
  it("AC-5: unparseable asOf → not stale", () => {
    const r = computeStaleness("not-a-date", 3, new Date());
    expect(r.stale).toBe(false);
    expect(r.staleByDays).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Handler DDL helpers for in-memory DBs
// ─────────────────────────────────────────────────────────────────────────────

function buildConvictionDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS conviction_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      peak_score REAL NOT NULL,
      dominant_signal TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(symbol, date)
    );
  `);
  return db;
}

function buildReputationDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS reputation_scores (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      score REAL NOT NULL,
      trend TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      computed_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );
  `);
  return db;
}

function buildShareholdersDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_shareholders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER,
      own_percent REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function buildFinancialsDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_financials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      year_report INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      revenue_bn REAL,
      revenue_yoy REAL,
      net_profit_bn REAL,
      net_profit_yoy REAL,
      eps REAL,
      pe REAL,
      pb REAL,
      roe REAL,
      roa REAL,
      debt_to_equity REAL,
      net_profit_margin REAL,
      nim REAL,
      npl REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: convictionHistoryHandler — stale/staleByDays fields present
// ─────────────────────────────────────────────────────────────────────────────

describe("REAUDIT-002 — convictionHistoryHandler: stale fields", () => {
  it("AC-6a: fresh data → stale=false, staleByDays=0", () => {
    const db = buildConvictionDb();
    const asOf = "2026-06-10";
    db.prepare(
      `INSERT INTO conviction_history (symbol, date, peak_score, dominant_signal) VALUES ('VCB', ?, 0.6, 'bullish')`
    ).run(asOf);

    // now = 1 day after asOf → daysDiff=1 < threshold=2 → fresh
    const now = clockAfter(asOf, 1);
    const req = { url: "/api/conviction-history", method: "GET" } as any;
    let capturedBody: any = null;
    const res = {
      writeHead: () => {},
      end: (s: string) => { capturedBody = JSON.parse(s); },
    } as any;

    handleGetConvictionHistory(req, res, db, now);
    expect(capturedBody.stale).toBe(false);
    expect(capturedBody.staleByDays).toBe(0);
    db.close();
  });

  it("AC-6b: stale data → stale=true, staleByDays>0", () => {
    const db = buildConvictionDb();
    const asOf = "2026-06-08";
    db.prepare(
      `INSERT INTO conviction_history (symbol, date, peak_score, dominant_signal) VALUES ('VCB', ?, 0.6, 'bullish')`
    ).run(asOf);

    // now = 4 days after asOf → daysDiff=4 > threshold=2 → stale by 2
    const now = clockAfter(asOf, 4);
    const req = { url: "/api/conviction-history", method: "GET" } as any;
    let capturedBody: any = null;
    const res = {
      writeHead: () => {},
      end: (s: string) => { capturedBody = JSON.parse(s); },
    } as any;

    handleGetConvictionHistory(req, res, db, now);
    expect(capturedBody.stale).toBe(true);
    expect(capturedBody.staleByDays).toBe(2);
    db.close();
  });

  it("AC-6c: empty table → stale=false, staleByDays=0 (no asOf)", () => {
    const db = buildConvictionDb();
    const req = { url: "/api/conviction-history", method: "GET" } as any;
    let capturedBody: any = null;
    const res = {
      writeHead: () => {},
      end: (s: string) => { capturedBody = JSON.parse(s); },
    } as any;

    handleGetConvictionHistory(req, res, db, new Date());
    expect(capturedBody.stale).toBe(false);
    expect(capturedBody.staleByDays).toBe(0);
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7: reputationHandler — stale/staleByDays fields present
// ─────────────────────────────────────────────────────────────────────────────

describe("REAUDIT-002 — reputationHandler: stale fields", () => {
  it("AC-7a: fresh data → stale=false, staleByDays=0", () => {
    const db = buildReputationDb();
    const asOf = "2026-06-10";
    db.prepare(
      `INSERT INTO reputation_scores (code, date, score, trend, risk_level, computed_at) VALUES ('VCB', ?, 60.0, 'stable', 'safe', datetime('now'))`
    ).run(asOf);

    const now = clockAfter(asOf, 2); // daysDiff=2 === threshold=3 → NOT stale
    const result = handleGetReputation(db, now);
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
    db.close();
  });

  it("AC-7b: stale data (4 days old, threshold=3) → stale=true, staleByDays=1", () => {
    const db = buildReputationDb();
    const asOf = "2026-06-07";
    db.prepare(
      `INSERT INTO reputation_scores (code, date, score, trend, risk_level, computed_at) VALUES ('VCB', ?, 60.0, 'stable', 'safe', datetime('now'))`
    ).run(asOf);

    const now = clockAfter(asOf, 4);
    const result = handleGetReputation(db, now);
    expect(result.stale).toBe(true);
    expect(result.staleByDays).toBe(1);
    db.close();
  });

  it("AC-7c: empty table → stale=false (no asOf)", () => {
    const db = buildReputationDb();
    const result = handleGetReputation(db, new Date());
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8: shareholdersHandler — stale/staleByDays fields present
// ─────────────────────────────────────────────────────────────────────────────

describe("REAUDIT-002 — shareholdersHandler: stale fields", () => {
  it("AC-8a: fresh data (30 days old, threshold=55) → stale=false", () => {
    const db = buildShareholdersDb();
    const asOf = "2026-05-12"; // 30 days before 2026-06-11
    db.prepare(
      `INSERT INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at) VALUES ('VCB', 'Test Holder', 1000, 5.5, ?)`
    ).run(asOf + "T00:00:00.000Z");

    const now = clockAfter(asOf, 30);
    const result = handleGetShareholders(db, new URLSearchParams(), now);
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
    db.close();
  });

  it("AC-8b: stale data (58 days old, threshold=55) → stale=true, staleByDays=3", () => {
    const db = buildShareholdersDb();
    const asOf = "2026-04-14";
    db.prepare(
      `INSERT INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at) VALUES ('VCB', 'Test Holder', 1000, 5.5, ?)`
    ).run(asOf + "T00:00:00.000Z");

    const now = clockAfter(asOf, 58);
    const result = handleGetShareholders(db, new URLSearchParams(), now);
    expect(result.stale).toBe(true);
    expect(result.staleByDays).toBe(3);
    db.close();
  });

  it("AC-8c: empty table → stale=false (no asOf)", () => {
    const db = buildShareholdersDb();
    const result = handleGetShareholders(db, new URLSearchParams(), new Date());
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9: financialsHandler — stale/staleByDays fields present
// ─────────────────────────────────────────────────────────────────────────────

describe("REAUDIT-002 — financialsHandler: stale fields", () => {
  it("AC-9a: fresh data (10 days old, threshold=14) → stale=false", () => {
    const db = buildFinancialsDb();
    const asOf = "2026-06-01";
    db.prepare(`
      INSERT INTO vnstock_financials (code, year_report, quarter, revenue_bn, fetched_at)
      VALUES ('VCB', 2024, 4, 100.0, ?)
    `).run(asOf + "T00:00:00.000Z");

    const now = clockAfter(asOf, 10);
    const result = handleGetFinancials(db, now);
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
    db.close();
  });

  it("AC-9b: stale data (57 days old, threshold=14) → stale=true, staleByDays=43", () => {
    const db = buildFinancialsDb();
    const asOf = "2026-04-15";
    db.prepare(`
      INSERT INTO vnstock_financials (code, year_report, quarter, revenue_bn, fetched_at)
      VALUES ('VCB', 2024, 4, 100.0, ?)
    `).run(asOf + "T00:00:00.000Z");

    const now = clockAfter(asOf, 57);
    const result = handleGetFinancials(db, now);
    expect(result.stale).toBe(true);
    expect(result.staleByDays).toBe(43);
    db.close();
  });

  it("AC-9c: empty table → stale=false (no asOf)", () => {
    const db = buildFinancialsDb();
    const result = handleGetFinancials(db, new Date());
    expect(result.stale).toBe(false);
    expect(result.staleByDays).toBe(0);
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10: corporateEventsHandler — stale/staleByDays fields present
// Uses handleGetCorporateEvents(req, res, db, now) with mock req/res
// ─────────────────────────────────────────────────────────────────────────────

function buildCorporateEventsDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_name TEXT NOT NULL,
      description TEXT,
      event_date TEXT NOT NULL
    );
  `);
  return db;
}

import { handleGetCorporateEvents } from "../interface/mcp/routes/corporateEventsHandler.js";

describe("REAUDIT-002 — corporateEventsHandler: stale fields", () => {
  it("AC-10a: fresh data (2 days old, threshold=3) → stale=false", () => {
    const db = buildCorporateEventsDb();
    const eventDate = "2026-06-09";
    db.prepare(
      `INSERT INTO vnstock_events (code, event_type, event_name, event_date) VALUES ('VCB', 'DIV', 'Dividend', ?)`
    ).run(eventDate);

    const now = clockAfter(eventDate, 2); // daysDiff=2 === threshold=3 → NOT stale
    const req = { url: "/api/corporate-events", method: "GET" } as any;
    let capturedBody: any = null;
    const res = {
      writeHead: () => {},
      end: (s: string) => { capturedBody = JSON.parse(s); },
    } as any;

    handleGetCorporateEvents(req, res, db, now);
    expect(capturedBody.stale).toBe(false);
    expect(capturedBody.staleByDays).toBe(0);
    db.close();
  });

  it("AC-10b: stale data (5 days old, threshold=3) → stale=true, staleByDays=2", () => {
    const db = buildCorporateEventsDb();
    const eventDate = "2026-06-06";
    db.prepare(
      `INSERT INTO vnstock_events (code, event_type, event_name, event_date) VALUES ('VCB', 'DIV', 'Dividend', ?)`
    ).run(eventDate);

    const now = clockAfter(eventDate, 5);
    const req = { url: "/api/corporate-events", method: "GET" } as any;
    let capturedBody: any = null;
    const res = {
      writeHead: () => {},
      end: (s: string) => { capturedBody = JSON.parse(s); },
    } as any;

    handleGetCorporateEvents(req, res, db, now);
    expect(capturedBody.stale).toBe(true);
    expect(capturedBody.staleByDays).toBe(2);
    db.close();
  });

  it("AC-10c: empty table → stale=false (no asOf)", () => {
    const db = buildCorporateEventsDb();
    const req = { url: "/api/corporate-events", method: "GET" } as any;
    let capturedBody: any = null;
    const res = {
      writeHead: () => {},
      end: (s: string) => { capturedBody = JSON.parse(s); },
    } as any;

    handleGetCorporateEvents(req, res, db, new Date());
    expect(capturedBody.stale).toBe(false);
    expect(capturedBody.staleByDays).toBe(0);
    db.close();
  });
});
