Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1786 — Earnings Source Conflict Detection
 *
 * When two news signals for the same ticker+quarter report different
 * earnings growth figures, the second signal's payload.detail must include
 * a conflict warning so the user can see the discrepancy.
 *
 * Rules:
 *   - Only triggers for chain_catalyst signals with event_type = "earnings"
 *   - Looks back 24 h for a prior signal on the same stock_code
 *   - Extracts growth % from payload.detail (pattern: "tăng X%" or "X%")
 *   - If prior and current differ → appends warning to payload.detail
 *   - Does NOT block posting — conflict is informational only
 *   - Non-earnings signals are unaffected
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { postSignal } from "../infrastructure/db/agentSignalStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  extractEarningsGrowthPct,
  detectEarningsConflict,
} from "../domain/services/earningsConflictDetector.js";

// ── Minimal schema helper ─────────────────────────────────────────────────────

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
      finding_data TEXT NOT NULL DEFAULT '{}',
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

// ── Unit: extractEarningsGrowthPct ────────────────────────────────────────────

describe("Task 1786 — extractEarningsGrowthPct", () => {
  it("extracts percentage from 'tăng 17 lần (1.700%)'", () => {
    const result = extractEarningsGrowthPct("lãi quý I tăng 17 lần (1.700%)");
    expect(result).toBe(1700);
  });

  it("extracts percentage from 'tăng 150%'", () => {
    const result = extractEarningsGrowthPct("lãi quý I/2026 tăng 150%");
    expect(result).toBe(150);
  });

  it("extracts percentage from 'tăng 25.5%'", () => {
    const result = extractEarningsGrowthPct("lợi nhuận tăng 25.5% so với cùng kỳ");
    expect(result).toBe(25.5);
  });

  it("returns null when no percentage pattern found", () => {
    const result = extractEarningsGrowthPct("VIC báo cáo kết quả kinh doanh Q1");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractEarningsGrowthPct("")).toBeNull();
  });

  it("extracts the parenthesised value preferentially over plain tăng X lần", () => {
    // "tăng 17 lần (1.700%)" — the % in parens is the actual growth, prefer it
    const result = extractEarningsGrowthPct("VIC tăng 17 lần (1.700%)");
    expect(result).toBe(1700);
  });
});

// ── Unit: detectEarningsConflict ──────────────────────────────────────────────

describe("Task 1786 — detectEarningsConflict (domain)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("returns null when no prior earnings signal exists for ticker", () => {
    const warning = detectEarningsConflict(db, "VIC", "lãi quý I tăng 150%");
    expect(warning).toBeNull();
  });

  it("returns null when prior signal has the same growth %", () => {
    // Insert a prior signal with same figure
    db.exec(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, expires_at, finding_data)
      VALUES
        ('news-scout', 'alert-commander', 'chain_catalyst', 'VIC',
         '{"detail":"lãi quý I tăng 150%"}',
         datetime('now', '+2 hours'),
         '{"event_type":"earnings"}')
    `);
    const warning = detectEarningsConflict(db, "VIC", "lãi quý I tăng 150%");
    expect(warning).toBeNull();
  });

  it("returns conflict warning when prior signal has different growth %", () => {
    // Prior signal: 1700%
    db.exec(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, expires_at, finding_data)
      VALUES
        ('news-scout', 'alert-commander', 'chain_catalyst', 'VIC',
         '{"detail":"lãi quý I tăng 17 lần (1.700%)"}',
         datetime('now', '+2 hours'),
         '{"event_type":"earnings"}')
    `);
    const warning = detectEarningsConflict(db, "VIC", "lãi quý I/2026 tăng 150%");
    expect(warning).not.toBeNull();
    expect(warning).toContain("Conflict");
    expect(warning).toContain("1700%");
    expect(warning).toContain("150%");
  });

  it("returns null for non-earnings chain_catalyst prior signal", () => {
    db.exec(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, expires_at, finding_data)
      VALUES
        ('news-scout', 'alert-commander', 'chain_catalyst', 'VIC',
         '{"detail":"VIC tăng 150% nhờ chính sách tín dụng"}',
         datetime('now', '+2 hours'),
         '{"event_type":"credit_policy"}')
    `);
    const warning = detectEarningsConflict(db, "VIC", "lãi quý I tăng 120%");
    expect(warning).toBeNull();
  });

  it("returns null when prior signal is expired", () => {
    db.exec(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, expires_at, finding_data)
      VALUES
        ('news-scout', 'alert-commander', 'chain_catalyst', 'VIC',
         '{"detail":"lãi quý I tăng 17 lần (1.700%)"}',
         datetime('now', '-1 hour'),
         '{"event_type":"earnings"}')
    `);
    const warning = detectEarningsConflict(db, "VIC", "lãi quý I/2026 tăng 150%");
    expect(warning).toBeNull();
  });

  it("returns null when current detail has no extractable growth %", () => {
    db.exec(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, expires_at, finding_data)
      VALUES
        ('news-scout', 'alert-commander', 'chain_catalyst', 'VIC',
         '{"detail":"lãi quý I tăng 17 lần (1.700%)"}',
         datetime('now', '+2 hours'),
         '{"event_type":"earnings"}')
    `);
    const warning = detectEarningsConflict(db, "VIC", "VIC công bố KQKD Q1");
    expect(warning).toBeNull();
  });
});

// ── Integration: postSignal injects conflict warning ──────────────────────────

describe("Task 1786 — postSignal conflict warning (integration)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("second earnings signal for same ticker with different % includes conflict warning in detail", () => {
    // First signal: 1700%
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VIC",
      payload: {
        title: "VIC Q1 earnings",
        detail: "lãi quý I tăng 17 lần (1.700%)",
      },
      findingData: { event_type: "earnings", direction: "bullish", confidence: 0.8, affected_stocks: ["VIC"], affected_sectors: ["real_estate"], headline: "VIC Q1", source: "cafef" },
      ttlMinutes: 120,
    });

    // Second signal: 150% (different)
    const secondId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VIC",
      payload: {
        title: "VIC Q1 earnings update",
        detail: "lãi quý I/2026 tăng 150%",
      },
      findingData: { event_type: "earnings", direction: "bullish", confidence: 0.8, affected_stocks: ["VIC"], affected_sectors: ["real_estate"], headline: "VIC Q1 update", source: "vnexpress" },
      ttlMinutes: 120,
    });

    // Read the second signal's stored payload
    const row = db.prepare("SELECT payload FROM agent_signals WHERE id = ?").get(secondId) as { payload: string };
    const payload = JSON.parse(row.payload) as { detail: string };

    expect(payload.detail).toContain("Conflict");
    expect(payload.detail).toContain("1700%");
    expect(payload.detail).toContain("150%");
  });

  it("second earnings signal with SAME % does NOT include conflict warning", () => {
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VIC",
      payload: { title: "VIC Q1", detail: "lãi quý I tăng 150%" },
      findingData: { event_type: "earnings", direction: "bullish", confidence: 0.8, affected_stocks: ["VIC"], affected_sectors: ["real_estate"], headline: "VIC Q1", source: "cafef" },
      ttlMinutes: 120,
    });

    const secondId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VIC",
      payload: { title: "VIC Q1 update", detail: "lãi quý I/2026 tăng 150%" },
      findingData: { event_type: "earnings", direction: "bullish", confidence: 0.8, affected_stocks: ["VIC"], affected_sectors: ["real_estate"], headline: "VIC Q1 update", source: "vnexpress" },
      ttlMinutes: 120,
    });

    const row = db.prepare("SELECT payload FROM agent_signals WHERE id = ?").get(secondId) as { payload: string };
    const payload = JSON.parse(row.payload) as { detail: string };

    expect(payload.detail).not.toContain("Conflict");
  });

  it("non-earnings chain_catalyst signal is never flagged", () => {
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VCB",
      payload: { title: "VCB credit policy", detail: "lãi suất tăng 150%" },
      findingData: { event_type: "credit_policy", direction: "bearish", confidence: 0.7, affected_stocks: ["VCB"], affected_sectors: ["banking"], headline: "VCB credit", source: "cafef" },
      ttlMinutes: 120,
    });

    const secondId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VCB",
      payload: { title: "VCB update", detail: "lãi suất tăng 200%" },
      findingData: { event_type: "credit_policy", direction: "bearish", confidence: 0.7, affected_stocks: ["VCB"], affected_sectors: ["banking"], headline: "VCB credit update", source: "vnexpress" },
      ttlMinutes: 120,
    });

    const row = db.prepare("SELECT payload FROM agent_signals WHERE id = ?").get(secondId) as { payload: string };
    const payload = JSON.parse(row.payload) as { detail: string };

    expect(payload.detail).not.toContain("Conflict");
  });

  it("urgent_news signal is never flagged (only chain_catalyst earnings)", () => {
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC Q1", detail: "lãi quý I tăng 1700%" },
      ttlMinutes: 120,
    });

    const secondId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { title: "VIC Q1 update", detail: "lãi quý I tăng 150%" },
      ttlMinutes: 120,
    });

    const row = db.prepare("SELECT payload FROM agent_signals WHERE id = ?").get(secondId) as { payload: string };
    const payload = JSON.parse(row.payload) as { detail: string };

    expect(payload.detail).not.toContain("Conflict");
  });
});
