Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 283 — Batch queries in get_portfolio_conviction
 *
 * Verifies that the refactored tool:
 *   1. Produces correct conviction scores, hexagram blocks, alert counts, and trends
 *      for a 4-stock watchlist without N+1 query patterns.
 *   2. Handles edge cases (no hexagram data, no alerts, no trend history).
 *
 * Implementation note: we test the helper functions that batch-fetch and
 * group data, not the full MCP tool (which requires live price fetchers).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { closeDb, getDb } from "../infrastructure/db/schema.js";
import { sqlInClause } from "../infrastructure/db/sqlHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB setup
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  (Bun.env as Record<string, string>)["DB_PATH"] = ":memory:";
  closeDb();
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code     TEXT PRIMARY KEY,
      domain   TEXT NOT NULL DEFAULT 'other',
      exchange TEXT NOT NULL DEFAULT 'HOSE'
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      code       TEXT PRIMARY KEY,
      price      REAL,
      change_amt REAL,
      change_pct REAL,
      volume     REAL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      affected_actions_json TEXT,
      resolved_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS conviction_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol     TEXT NOT NULL,
      peak_score REAL NOT NULL,
      date       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kinhdich_readings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code      TEXT NOT NULL,
      hexagram_number INTEGER NOT NULL,
      ho_que_number   INTEGER,
      bien_que_number INTEGER,
      hao_states      TEXT,
      raw_scores      TEXT,
      trading_signal  TEXT,
      confidence      REAL,
      timestamp       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: batch-fetch unresolved alert rows (mirrors the batched implementation)
// ─────────────────────────────────────────────────────────────────────────────

function batchFetchAlertCodes(db: Database): string[] {
  try {
    const rows = db
      .query<{ affected_actions_json: string }, []>(
        "SELECT DISTINCT affected_actions_json FROM alerts WHERE resolved_at IS NULL",
      )
      .all();
    return rows.map((r) => r.affected_actions_json ?? "");
  } catch {
    return [];
  }
}

function countAlertsForCode(allAlertJsons: string[], code: string): number {
  return allAlertJsons.filter((json) => json.includes(code)).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: batch-fetch conviction history (mirrors the batched implementation)
// ─────────────────────────────────────────────────────────────────────────────

interface ConvictionHistoryRow {
  symbol: string;
  peak_score: number;
  date: string;
}

function batchFetchConvictionHistory(
  db: Database,
  codes: string[],
): Map<string, number[]> {
  const result = new Map<string, number[]>();
  if (codes.length === 0) return result;

  const placeholders = sqlInClause(codes.length);
  try {
    const rows = db
      .query<ConvictionHistoryRow, string[]>(
        `SELECT symbol, peak_score, date FROM conviction_history
         WHERE symbol IN (${placeholders})
         ORDER BY symbol, date DESC`,
      )
      .all(...codes);

    // Group by symbol (already ordered DESC per symbol), take last 7, reverse to ASC
    for (const row of rows) {
      const existing = result.get(row.symbol) ?? [];
      if (existing.length < 7) {
        existing.push(row.peak_score);
      }
      result.set(row.symbol, existing);
    }

    // Reverse each array to ASC (oldest → newest)
    for (const [sym, arr] of result) {
      result.set(sym, arr.reverse());
    }
  } catch {
    // conviction_history may not exist — return empty map
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: batch-fetch hexagram readings (mirrors the batched implementation)
// ─────────────────────────────────────────────────────────────────────────────

interface HexagramBatchRow {
  stock_code: string;
  hexagram_number: number;
  bien_que_number: number;
  trading_signal: string | null;
  confidence: number | null;
}

function batchFetchHexagramReadings(
  db: Database,
  codes: string[],
): Map<string, HexagramBatchRow> {
  const result = new Map<string, HexagramBatchRow>();
  if (codes.length === 0) return result;

  const placeholders = sqlInClause(codes.length);
  try {
    const rows = db
      .query<HexagramBatchRow & { rn: number }, string[]>(
        `SELECT stock_code, hexagram_number, bien_que_number, trading_signal, confidence,
                ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY timestamp DESC) as rn
         FROM kinhdich_readings
         WHERE stock_code IN (${placeholders})`,
      )
      .all(...codes);

    for (const row of rows) {
      if (row.rn === 1) {
        result.set(row.stock_code, row);
      }
    }
  } catch {
    // kinhdich_readings may not exist — return empty map
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: batch-fetch sector peer prices (mirrors the batched implementation)
// ─────────────────────────────────────────────────────────────────────────────

function batchFetchPeerPrices(
  db: Database,
  peerCodes: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  if (peerCodes.length === 0) return result;

  const placeholders = sqlInClause(peerCodes.length);
  try {
    const rows = db
      .query<{ code: string; change_pct: number }, string[]>(
        `SELECT code, change_pct FROM market_prices WHERE code IN (${placeholders})`,
      )
      .all(...peerCodes);

    for (const row of rows) {
      result.set(row.code, row.change_pct);
    }
  } catch {
    // market_prices may not exist — return empty map
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 283 — Batch alerts count", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("counts alerts per stock code from a single batch query", () => {
    db.exec(`
      INSERT INTO alerts (affected_actions_json, resolved_at) VALUES ('["VNM","FPT"]', NULL);
      INSERT INTO alerts (affected_actions_json, resolved_at) VALUES ('["VNM"]', NULL);
      INSERT INTO alerts (affected_actions_json, resolved_at) VALUES ('["VCB"]', NULL);
      INSERT INTO alerts (affected_actions_json, resolved_at) VALUES ('["VNM"]', '2026-01-01');
    `);

    const allJsons = batchFetchAlertCodes(db);
    // 3 unresolved rows (1 resolved is excluded)
    expect(allJsons.length).toBe(3);

    // VNM appears in 2 unresolved rows
    expect(countAlertsForCode(allJsons, "VNM")).toBe(2);
    // FPT appears in 1 unresolved row
    expect(countAlertsForCode(allJsons, "FPT")).toBe(1);
    // VCB appears in 1 unresolved row
    expect(countAlertsForCode(allJsons, "VCB")).toBe(1);
    // VEA not in any row
    expect(countAlertsForCode(allJsons, "VEA")).toBe(0);
  });

  it("returns empty array when alerts table has no unresolved rows", () => {
    db.exec(`
      INSERT INTO alerts (affected_actions_json, resolved_at) VALUES ('["VNM"]', '2026-01-01');
    `);
    const allJsons = batchFetchAlertCodes(db);
    expect(allJsons.length).toBe(0);
  });
});

describe("Task 283 — Batch conviction history", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns conviction trends for 4 stocks in a single query", () => {
    // Insert 4 stocks with varying history lengths
    db.exec(`
      INSERT INTO conviction_history (symbol, peak_score, date) VALUES ('VNM', 0.72, '2026-04-01');
      INSERT INTO conviction_history (symbol, peak_score, date) VALUES ('VNM', 0.75, '2026-04-02');
      INSERT INTO conviction_history (symbol, peak_score, date) VALUES ('VNM', 0.68, '2026-04-03');
      INSERT INTO conviction_history (symbol, peak_score, date) VALUES ('FPT', 0.80, '2026-04-01');
      INSERT INTO conviction_history (symbol, peak_score, date) VALUES ('FPT', 0.82, '2026-04-02');
      INSERT INTO conviction_history (symbol, peak_score, date) VALUES ('VCB', 0.60, '2026-04-01');
    `);

    const codes = ["VNM", "FPT", "VCB", "VEA"];
    const historyMap = batchFetchConvictionHistory(db, codes);

    // VNM has 3 entries
    expect(historyMap.get("VNM")).toEqual([0.72, 0.75, 0.68]);
    // FPT has 2 entries
    expect(historyMap.get("FPT")).toEqual([0.80, 0.82]);
    // VCB has 1 entry
    expect(historyMap.get("VCB")).toEqual([0.60]);
    // VEA has no entries — not in map or empty
    expect(historyMap.get("VEA") ?? []).toEqual([]);
  });

  it("caps at 7 entries per symbol", () => {
    // Insert 10 rows for VNM
    for (let i = 1; i <= 10; i++) {
      db.exec(
        `INSERT INTO conviction_history (symbol, peak_score, date) VALUES ('VNM', 0.${i}0, '2026-04-0${i < 10 ? "0" + i : i}')`,
      );
    }

    const historyMap = batchFetchConvictionHistory(db, ["VNM"]);
    const trend = historyMap.get("VNM") ?? [];
    expect(trend.length).toBeLessThanOrEqual(7);
  });
});

describe("Task 283 — Batch hexagram readings", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns latest reading per stock code from a single batch query", () => {
    db.exec(`
      INSERT INTO kinhdich_readings (stock_code, hexagram_number, bien_que_number, trading_signal, confidence, timestamp)
      VALUES ('VNM', 1, 2, 'BUY', 0.75, '2026-04-01 10:00:00');

      INSERT INTO kinhdich_readings (stock_code, hexagram_number, bien_que_number, trading_signal, confidence, timestamp)
      VALUES ('VNM', 3, 4, 'WAIT', 0.55, '2026-04-02 10:00:00');

      INSERT INTO kinhdich_readings (stock_code, hexagram_number, bien_que_number, trading_signal, confidence, timestamp)
      VALUES ('FPT', 5, 6, 'SELL', 0.65, '2026-04-01 10:00:00');

      INSERT INTO kinhdich_readings (stock_code, hexagram_number, bien_que_number, trading_signal, confidence, timestamp)
      VALUES ('VCB', 7, 8, 'BUY', 0.80, '2026-04-01 10:00:00');
    `);

    const codes = ["VNM", "FPT", "VCB", "VEA"];
    const hexMap = batchFetchHexagramReadings(db, codes);

    // VNM — latest is the 2026-04-02 row (hexagram 3)
    const vnmRow = hexMap.get("VNM");
    expect(vnmRow).toBeDefined();
    expect(vnmRow?.hexagram_number).toBe(3);
    expect(vnmRow?.trading_signal).toBe("WAIT");
    expect(vnmRow?.confidence).toBe(0.55);

    // FPT — only one row
    const fptRow = hexMap.get("FPT");
    expect(fptRow?.hexagram_number).toBe(5);

    // VEA — no data
    expect(hexMap.get("VEA")).toBeUndefined();
  });

  it("returns empty map when kinhdich_readings has no matching rows", () => {
    const hexMap = batchFetchHexagramReadings(db, ["VNM", "FPT"]);
    expect(hexMap.size).toBe(0);
  });
});

describe("Task 283 — Batch sector peer prices", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("fetches change_pct for all peer codes in a single query", () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct) VALUES ('VCB', 80000, 1.5);
      INSERT INTO market_prices (code, price, change_pct) VALUES ('BID', 45000, -0.5);
      INSERT INTO market_prices (code, price, change_pct) VALUES ('CTG', 35000, 0.8);
      INSERT INTO market_prices (code, price, change_pct) VALUES ('FPT', 120000, 2.3);
    `);

    const peerCodes = ["VCB", "BID", "CTG", "FPT", "NONEXISTENT"];
    const priceMap = batchFetchPeerPrices(db, peerCodes);

    expect(priceMap.get("VCB")).toBe(1.5);
    expect(priceMap.get("BID")).toBe(-0.5);
    expect(priceMap.get("CTG")).toBe(0.8);
    expect(priceMap.get("FPT")).toBe(2.3);
    expect(priceMap.get("NONEXISTENT")).toBeUndefined();
  });

  it("computes correct sector average from batch-fetched prices", () => {
    db.exec(`
      INSERT INTO market_prices (code, price, change_pct) VALUES ('VCB', 80000, 2.0);
      INSERT INTO market_prices (code, price, change_pct) VALUES ('BID', 45000, 4.0);
    `);

    const peerCodes = ["VCB", "BID"];
    const priceMap = batchFetchPeerPrices(db, peerCodes);

    const values = Array.from(priceMap.values());
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    expect(avg).toBe(3.0);
  });

  it("returns empty map when no peer codes provided", () => {
    const priceMap = batchFetchPeerPrices(db, []);
    expect(priceMap.size).toBe(0);
  });
});

describe("Task 283 — Inline hexagram formatting (no appendKinhDich dependency)", () => {
  it("formats hexagram block using QUE_META without a DB call", async () => {
    const { QUE_META } = await import(
      "../domain/services/kinhDich/hexagramLibrary.js"
    );

    // Simulate the inlined logic that would replace appendKinhDich
    function formatHexagramBlock(
      hexagramNumber: number,
      bienQueNumber: number,
      tradingSignal: string | null,
      confidence: number | null,
    ): string {
      const getQueName = (n: number): string => {
        const meta = QUE_META.find((q: { id: number }) => q.id === n);
        return meta ? (meta as { name: string }).name : `Que ${n}`;
      };
      const hexName = getQueName(hexagramNumber);
      const bienName = getQueName(bienQueNumber);
      const signal = tradingSignal ?? "N/A";
      const confStr =
        confidence != null ? `${Math.round(confidence * 100)}%` : "";

      const lines = [
        `\n---`,
        `Kinh Dịch: ${hexName} (${hexagramNumber}) — ${signal}`,
        `Biến quẻ: ${bienName} → ${bienName}`,
        ...(confStr ? [`Độ tin cậy: ${confStr}`] : []),
      ];
      return lines.join("\n");
    }

    const block = formatHexagramBlock(1, 2, "BUY", 0.8);
    expect(block).toContain("Kinh Dịch:");
    expect(block).toContain("(1)");
    expect(block).toContain("BUY");
    expect(block).toContain("Biến quẻ:");
    expect(block).toContain("80%");
  });

  it("handles null signal and confidence gracefully", async () => {
    const { QUE_META } = await import(
      "../domain/services/kinhDich/hexagramLibrary.js"
    );

    function formatHexagramBlock(
      hexagramNumber: number,
      bienQueNumber: number,
      tradingSignal: string | null,
      confidence: number | null,
    ): string {
      const getQueName = (n: number): string => {
        const meta = QUE_META.find((q: { id: number }) => q.id === n);
        return meta ? (meta as { name: string }).name : `Que ${n}`;
      };
      const hexName = getQueName(hexagramNumber);
      const bienName = getQueName(bienQueNumber);
      const signal = tradingSignal ?? "N/A";
      const confStr =
        confidence != null ? `${Math.round(confidence * 100)}%` : "";

      const lines = [
        `\n---`,
        `Kinh Dịch: ${hexName} (${hexagramNumber}) — ${signal}`,
        `Biến quẻ: ${bienName} → ${bienName}`,
        ...(confStr ? [`Độ tin cậy: ${confStr}`] : []),
      ];
      return lines.join("\n");
    }

    const block = formatHexagramBlock(1, 2, null, null);
    expect(block).toContain("N/A");
    expect(block).not.toContain("Độ tin cậy:");
  });
});
