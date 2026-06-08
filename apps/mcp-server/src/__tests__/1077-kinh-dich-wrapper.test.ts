// src/__tests__/1077-kinh-dich-wrapper.test.ts
// Task 1077 — kinhDichWrapper: appendKinhDich domain service
//
// TDD Red phase: all tests should fail before implementation exists.

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

// ─── Type import for function under test ────────────────────────────────────
// (will fail until kinhDichWrapper.ts is created)
// DEPRECATED-TEST: testing the deprecated wrapper — import path updated post-G5a move
import { appendKinhDich } from "../infrastructure/_deprecated/kinhDichWrapper.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: build an in-memory SQLite DB with kinhdich_readings seed data
// ─────────────────────────────────────────────────────────────────────────────

function buildTestDb(rows?: Array<{
  stock_code: string;
  hexagram_number: number;
  ho_que_number: number;
  bien_que_number: number;
  hao_states: string;
  raw_scores: string;
  ngu_hanh_dynamic: string;
  trading_signal: string;
  confidence: number;
  action_note: string;
  timestamp: string;
}>): Database {
  const db = new Database(":memory:");

  db.run(`
    CREATE TABLE IF NOT EXISTS kinhdich_readings (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code         TEXT    NOT NULL,
      hexagram_number    INTEGER NOT NULL,
      ho_que_number      INTEGER NOT NULL,
      bien_que_number    INTEGER NOT NULL,
      hao_states         TEXT    NOT NULL DEFAULT '[]',
      raw_scores         TEXT    NOT NULL DEFAULT '[]',
      ngu_hanh_dynamic   TEXT    NOT NULL DEFAULT '',
      trading_signal     TEXT,
      confidence         REAL,
      action_note        TEXT,
      timestamp          TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  if (rows && rows.length > 0) {
    const insert = db.prepare(`
      INSERT INTO kinhdich_readings
        (stock_code, hexagram_number, ho_que_number, bien_que_number,
         hao_states, raw_scores, ngu_hanh_dynamic, trading_signal,
         confidence, action_note, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of rows) {
      insert.run(
        r.stock_code, r.hexagram_number, r.ho_que_number, r.bien_que_number,
        r.hao_states, r.raw_scores, r.ngu_hanh_dynamic, r.trading_signal,
        r.confidence, r.action_note, r.timestamp,
      );
    }
  }

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1077 — appendKinhDich", () => {

  // ── AC-E6-1: found data → appended block contains "Kinh Dịch:" and "Biến quẻ:" ──

  it("AC-E6-1: appends Kinh Dich block when hexagram data exists", async () => {
    const db = buildTestDb([{
      stock_code: "VCB",
      hexagram_number: 1,       // Que 1 = Thuan Can
      ho_que_number: 43,
      bien_que_number: 44,
      hao_states: "[]",
      raw_scores: "[0.5,0.3,0.2,0.1,0.4,0.6]",
      ngu_hanh_dynamic: "Kim sinh Thuy",
      trading_signal: "MUA (tich cuc)",
      confidence: 0.82,
      action_note: "KHUYEN NGHI: MUA",
      timestamp: new Date().toISOString(),
    }]);

    const base = "Phan tich co ban VCB: ket qua tot.";
    const result = await appendKinhDich("VCB", base, db);

    expect(result).toContain(base);
    expect(result).toContain("Kinh Dịch:");
    expect(result).toContain("Biến quẻ:");
    expect(result).toContain("---");
  });

  it("AC-E6-1b: appended block shows hexagram name and confidence", async () => {
    const db = buildTestDb([{
      stock_code: "FPT",
      hexagram_number: 11,      // Que 11 = Dia Thien Thai
      ho_que_number: 54,
      bien_que_number: 26,
      hao_states: "[]",
      raw_scores: "[0.2,0.2,0.2,0.2,0.2,0.2]",
      ngu_hanh_dynamic: "Tho",
      trading_signal: "GIU (trung tinh)",
      confidence: 0.65,
      action_note: "KHUYEN NGHI: GIU",
      timestamp: new Date().toISOString(),
    }]);

    const result = await appendKinhDich("FPT", "Base output FPT.", db);

    expect(result).toContain("Kinh Dịch:");
    expect(result).toContain("65%");  // confidence rendered as %
  });

  // ── AC-E6-2: no data → fallback text ────────────────────────────────────────

  it("AC-E6-2: returns fallback when no hexagram data for ticker", async () => {
    const db = buildTestDb([]); // empty table

    const base = "base output";
    const result = await appendKinhDich("XYZ", base, db);

    expect(result).toBe("base output\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ.");
  });

  it("AC-E6-2b: fallback text when ticker is present in DB but no rows match", async () => {
    const db = buildTestDb([{
      stock_code: "VNM",
      hexagram_number: 2,
      ho_que_number: 23,
      bien_que_number: 8,
      hao_states: "[]",
      raw_scores: "[]",
      ngu_hanh_dynamic: "",
      trading_signal: "BAN (tieu cuc)",
      confidence: 0.55,
      action_note: "KHUYEN NGHI: BAN",
      timestamp: new Date().toISOString(),
    }]);

    // "ACB" is NOT in the DB
    const result = await appendKinhDich("ACB", "some base", db);
    expect(result).toBe("some base\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ.");
  });

  // ── AC-E6-3: computeReading / formatting throws → graceful fallback ─────────

  it("AC-E6-3: does not propagate exceptions, returns fallback on error", async () => {
    // Pass a broken db (no tables at all) to force a query error
    const brokenDb = new Database(":memory:");
    initNewsTables(brokenDb);
    initMarketDataTables(brokenDb);
    initSystemTables(brokenDb);
    // No tables created — any query will throw "no such table"

    const base = "base output for error test";
    let result: string;
    let threw = false;

    try {
      result = await appendKinhDich("VCB", base, brokenDb);
    } catch {
      threw = true;
      result = "";
    }

    expect(threw).toBe(false);
    expect(result).toContain(base);
    expect(result).toContain("Kinh Dịch: Chưa đủ dữ liệu để tính quẻ.");
  });

  // ── Preserves original output structure ──────────────────────────────────────

  it("preserves the original base output in the returned string", async () => {
    const db = buildTestDb([]);
    const original = "LINE1\nLINE2\nLINE3";
    const result = await appendKinhDich("UNKNOWN", original, db);

    expect(result.startsWith(original)).toBe(true);
    expect(result).toContain("LINE1");
    expect(result).toContain("LINE2");
    expect(result).toContain("LINE3");
  });

  // ── Empty ticker → skip append, return original ───────────────────────────────

  it("returns original output unchanged when ticker is empty string", async () => {
    const db = buildTestDb([{
      stock_code: "VCB",
      hexagram_number: 1,
      ho_que_number: 43,
      bien_que_number: 44,
      hao_states: "[]",
      raw_scores: "[]",
      ngu_hanh_dynamic: "",
      trading_signal: "MUA",
      confidence: 0.75,
      action_note: "",
      timestamp: new Date().toISOString(),
    }]);

    const base = "some output";
    const result = await appendKinhDich("", base, db);

    expect(result).toBe(base);
  });

  // ── MARKET ticker ────────────────────────────────────────────────────────────

  it("handles MARKET ticker (VN-Index aggregate) with stored VNINDEX data", async () => {
    const db = buildTestDb([{
      stock_code: "VNINDEX",
      hexagram_number: 1,
      ho_que_number: 43,
      bien_que_number: 14,
      hao_states: "[]",
      raw_scores: "[0.1,0.2,0.3,0.4,0.5,0.6]",
      ngu_hanh_dynamic: "Kim",
      trading_signal: "GIU (trung tinh)",
      confidence: 0.70,
      action_note: "KHUYEN NGHI: GIU",
      timestamp: new Date().toISOString(),
    }]);

    const result = await appendKinhDich("MARKET", "Market summary.", db);

    // MARKET maps to VNINDEX internally
    expect(result).toContain("Kinh Dịch:");
    expect(result).toContain("Biến quẻ:");
  });

  it("handles MARKET ticker with no VNINDEX data — returns fallback", async () => {
    const db = buildTestDb([]); // no rows

    const result = await appendKinhDich("MARKET", "Market summary.", db);
    expect(result).toBe("Market summary.\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ.");
  });

  // ── No-throw invariant: appendKinhDich never throws ──────────────────────────

  it("never throws for any combination of inputs", async () => {
    const db = buildTestDb([]);

    const inputs = [
      ["VCB", ""],
      ["", "some text"],
      ["MARKET", "text"],
      ["VNM", "multi\nline\ntext"],
    ] as const;

    for (const [ticker, base] of inputs) {
      let threw = false;
      try {
        await appendKinhDich(ticker, base, db);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    }
  });
});
