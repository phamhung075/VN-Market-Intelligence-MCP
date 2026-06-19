/**
 * FIX-SIGNALS-STOCK-FULL-DETAIL — INFOCARD-EXPAND-FETCH epic
 *
 * Tests for GET /mcp/api/signals/stock/:code endpoint shape changes:
 *
 * AC-1: Response includes full structured `finding_data` object (not just flattened `detail` string)
 * AC-2: `detail` field is still present for back-compat (existing consumers unbroken)
 * AC-3: `source` field surfaced in response (from finding_data.source or payload.source)
 * AC-4: `created_at` normalized to ISO-8601 UTC (YYYY-MM-DDTHH:MM:SS.000Z) — not raw SQLite format
 * AC-5: `finding_data` is generic across all signal types (chain_catalyst, urgent_news, price_anomaly,
 *        cross_validate, price_confirmation, and unknown types)
 * AC-6: `payload` field exposed (raw stored payload object) for full transparency
 * AC-7: Absent/null stored fields → omit or null in finding_data (never fabricated)
 * AC-8: chain_catalyst finding_data exposes full schema fields
 *        (event_type, direction, confidence, affected_stocks, affected_sectors, headline, source,
 *         optional imfSentiment, newsSentiment, kinhDichConfidence, agentSignalsMajority, etc.)
 * AC-9: created_at ISO normalization handles both 'YYYY-MM-DD HH:MM:SS' (SQLite) and already-ISO inputs
 *
 * DDD layer: interface — tests drive the endpoint shape via the internal query helper.
 * Isolation: in-memory SQLite, no live DB.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  querySignalsForStock,
  normalizeCreatedAt,
  type StockSignalItem,
} from "../interface/mcp/routes/stockSignalsHandler.js";

// ── DB setup helper ──────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL DEFAULT 'test-agent',
      to_agent TEXT NOT NULL DEFAULT 'test-consumer',
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL DEFAULT (datetime('now', '+2 hours')),
      confidence_score REAL,
      finding_data TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_signals_stock ON agent_signals(stock_code);
  `);
  return db;
}

type InsertSignalParams = {
  signalType: string;
  stockCode?: string | null;
  payload?: Record<string, unknown>;
  confidenceScore?: number | null;
  findingData?: Record<string, unknown> | null;
  createdAt?: string;
};

function insertSignal(db: Database, params: InsertSignalParams): number {
  const stmt = db.prepare<{ id: number }, [string, string | null, string, number | null, string | null, string]>(`
    INSERT INTO agent_signals
      (signal_type, stock_code, payload, confidence_score, finding_data, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+2 hours'))
    RETURNING id
  `);
  const result = stmt.get(
    params.signalType,
    params.stockCode ?? null,
    JSON.stringify(params.payload ?? {}),
    params.confidenceScore ?? null,
    params.findingData != null ? JSON.stringify(params.findingData) : null,
    params.createdAt ?? "2026-06-16 10:30:00",
  ) as { id: number };
  return result.id;
}

// ── AC-9: normalizeCreatedAt unit tests ─────────────────────────────────────

describe("normalizeCreatedAt", () => {
  it("AC-9: converts SQLite 'YYYY-MM-DD HH:MM:SS' to ISO-8601 UTC", () => {
    const result = normalizeCreatedAt("2026-06-16 10:30:00");
    expect(result).toBe("2026-06-16T10:30:00.000Z");
  });

  it("AC-9: already-ISO input (with T and Z) passes through unchanged", () => {
    const result = normalizeCreatedAt("2026-06-16T10:30:00.000Z");
    expect(result).toBe("2026-06-16T10:30:00.000Z");
  });

  it("AC-9: already-ISO with T but no Z is treated as UTC and gets Z appended", () => {
    const result = normalizeCreatedAt("2026-06-16T10:30:00");
    // Must end with Z for unambiguous UTC
    expect(result).toMatch(/Z$/);
  });

  it("AC-9: handles null/undefined gracefully (returns null)", () => {
    expect(normalizeCreatedAt(null)).toBeNull();
    expect(normalizeCreatedAt(undefined)).toBeNull();
  });

  it("AC-9: date-only string '2026-06-16' is treated as midnight UTC", () => {
    const result = normalizeCreatedAt("2026-06-16");
    expect(result).toBe("2026-06-16T00:00:00.000Z");
  });
});

// ── AC-1/AC-2/AC-3/AC-4: main response shape tests ──────────────────────────

describe("querySignalsForStock — chain_catalyst full detail", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  const CHAIN_CATALYST_FINDING: Record<string, unknown> = {
    event_type: "macro",
    direction: "bullish",
    confidence: 0.82,
    affected_stocks: ["FPT", "VCB", "VHM"],
    affected_sectors: ["technology", "banking"],
    headline: "FED rate cut signals VN macro tailwind",
    source: "https://cafef.vn/article/fed-rate-cut-2026",
    newsSentiment: 0.65,
    kinhDichConfidence: 72,
    agentSignalsMajority: "BUY",
    catalyst_stock_code: "FPT",
    time_to_price_move: 4,
  };

  it("AC-1: finding_data is a structured object (not a string)", () => {
    insertSignal(db, {
      signalType: "chain_catalyst",
      stockCode: "FPT",
      findingData: CHAIN_CATALYST_FINDING,
      confidenceScore: 82,
    });

    const items = querySignalsForStock(db, "FPT", 10);
    expect(items).toHaveLength(1);
    expect(typeof items[0]!.finding_data).toBe("object");
    expect(items[0]!.finding_data).not.toBeNull();
  });

  it("AC-2: `detail` string still present for back-compat", () => {
    insertSignal(db, {
      signalType: "chain_catalyst",
      stockCode: "FPT",
      payload: { detail: "FED rate cut — bullish for VN market" },
      findingData: CHAIN_CATALYST_FINDING,
    });

    const items = querySignalsForStock(db, "FPT", 10);
    expect(typeof items[0]!.detail).toBe("string");
  });

  it("AC-3: source field surfaced from finding_data.source", () => {
    insertSignal(db, {
      signalType: "chain_catalyst",
      stockCode: "FPT",
      findingData: CHAIN_CATALYST_FINDING,
    });

    const items = querySignalsForStock(db, "FPT", 10);
    expect(items[0]!.source).toBe("https://cafef.vn/article/fed-rate-cut-2026");
  });

  it("AC-4: created_at is ISO-8601 UTC (contains T and Z)", () => {
    insertSignal(db, {
      signalType: "chain_catalyst",
      stockCode: "FPT",
      createdAt: "2026-06-16 08:15:30",
      findingData: CHAIN_CATALYST_FINDING,
    });

    const items = querySignalsForStock(db, "FPT", 10);
    const createdAt = items[0]!.created_at;
    expect(createdAt).toBe("2026-06-16T08:15:30.000Z");
  });

  it("AC-6: payload field exposed as parsed object", () => {
    insertSignal(db, {
      signalType: "chain_catalyst",
      stockCode: "FPT",
      payload: { detail: "test", extra_context: "macro shift" },
      findingData: CHAIN_CATALYST_FINDING,
    });

    const items = querySignalsForStock(db, "FPT", 10);
    expect(typeof items[0]!.payload).toBe("object");
    expect((items[0]!.payload as Record<string, unknown>)["extra_context"]).toBe("macro shift");
  });

  it("AC-8: chain_catalyst finding_data carries full schema fields", () => {
    insertSignal(db, {
      signalType: "chain_catalyst",
      stockCode: "FPT",
      findingData: CHAIN_CATALYST_FINDING,
      confidenceScore: 82,
    });

    const items = querySignalsForStock(db, "FPT", 10);
    const fd = items[0]!.finding_data as Record<string, unknown>;
    expect(fd["event_type"]).toBe("macro");
    expect(fd["direction"]).toBe("bullish");
    expect(fd["confidence"]).toBe(0.82);
    expect(Array.isArray(fd["affected_stocks"])).toBe(true);
    expect((fd["affected_stocks"] as string[])).toContain("FPT");
    expect(Array.isArray(fd["affected_sectors"])).toBe(true);
    expect(fd["headline"]).toBe("FED rate cut signals VN macro tailwind");
    expect(fd["source"]).toBe("https://cafef.vn/article/fed-rate-cut-2026");
    expect(fd["newsSentiment"]).toBe(0.65);
    expect(fd["kinhDichConfidence"]).toBe(72);
    expect(fd["agentSignalsMajority"]).toBe("BUY");
    expect(fd["catalyst_stock_code"]).toBe("FPT");
    expect(fd["time_to_price_move"]).toBe(4);
  });
});

// ── AC-5: generic across all signal types ────────────────────────────────────

describe("querySignalsForStock — generic across signal types (AC-5)", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("urgent_news: finding_data exposes headline + source + severity", () => {
    insertSignal(db, {
      signalType: "urgent_news",
      stockCode: "VCB",
      findingData: {
        headline: "SBV emergency rate decision",
        source: "https://sbv.gov.vn/notice/123",
        severity: "critical",
        confidence: 0.9,
      },
    });

    const items = querySignalsForStock(db, "VCB", 10);
    expect(items).toHaveLength(1);
    const fd = items[0]!.finding_data as Record<string, unknown>;
    expect(fd["headline"]).toBe("SBV emergency rate decision");
    expect(fd["severity"]).toBe("critical");
    expect(items[0]!.source).toBe("https://sbv.gov.vn/notice/123");
  });

  it("price_confirmation: finding_data exposes price_change_pct + volume_ratio", () => {
    insertSignal(db, {
      signalType: "price_confirmation",
      stockCode: "VHM",
      findingData: {
        price_change_pct: 4.2,
        volume_ratio: 2.8,
        confirms_direction: true,
        fully_priced: false,
        confidence: 0.75,
      },
    });

    const items = querySignalsForStock(db, "VHM", 10);
    const fd = items[0]!.finding_data as Record<string, unknown>;
    expect(fd["price_change_pct"]).toBe(4.2);
    expect(fd["volume_ratio"]).toBe(2.8);
    expect(fd["confirms_direction"]).toBe(true);
  });

  it("price_anomaly: finding_data exposes move_pct + move_sigma", () => {
    insertSignal(db, {
      signalType: "price_anomaly",
      stockCode: "MBB",
      findingData: {
        move_pct: -6.3,
        move_sigma: 3.1,
        regime: "TIGHTENING",
        adjusted_threshold: "2.5σ",
      },
    });

    const items = querySignalsForStock(db, "MBB", 10);
    const fd = items[0]!.finding_data as Record<string, unknown>;
    expect(fd["move_pct"]).toBe(-6.3);
    expect(fd["move_sigma"]).toBe(3.1);
    expect(fd["regime"]).toBe("TIGHTENING");
  });

  it("cross_validate: finding_data exposes direction + confidence + summary", () => {
    insertSignal(db, {
      signalType: "cross_validate",
      stockCode: "TCB",
      findingData: {
        direction: "bearish",
        confidence: 0.68,
        summary: "Multi-source bearish consensus on TCB",
      },
    });

    const items = querySignalsForStock(db, "TCB", 10);
    const fd = items[0]!.finding_data as Record<string, unknown>;
    expect(fd["direction"]).toBe("bearish");
    expect(fd["summary"]).toBe("Multi-source bearish consensus on TCB");
  });

  it("unknown signal type: finding_data still returned as-is (generic passthrough)", () => {
    insertSignal(db, {
      signalType: "custom_signal_v99",
      stockCode: "ACB",
      findingData: {
        custom_key: "custom_value",
        numeric_field: 42,
        nested: { deep: true },
      },
    });

    const items = querySignalsForStock(db, "ACB", 10);
    const fd = items[0]!.finding_data as Record<string, unknown>;
    expect(fd["custom_key"]).toBe("custom_value");
    expect(fd["numeric_field"]).toBe(42);
    expect((fd["nested"] as Record<string, unknown>)["deep"]).toBe(true);
  });
});

// ── AC-7: absent/null stored fields → honest empty ───────────────────────────

describe("querySignalsForStock — absent/null field handling (AC-7)", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("null finding_data → finding_data: null, source: null", () => {
    insertSignal(db, {
      signalType: "urgent_news",
      stockCode: "HPG",
      findingData: null,
      payload: { detail: "urgent news no finding_data" },
    });

    const items = querySignalsForStock(db, "HPG", 10);
    expect(items[0]!.finding_data).toBeNull();
    expect(items[0]!.source).toBeNull();
  });

  it("finding_data without source → source: null", () => {
    insertSignal(db, {
      signalType: "cross_validate",
      stockCode: "VPB",
      findingData: { direction: "neutral", confidence: 0.5, summary: "inconclusive" },
    });

    const items = querySignalsForStock(db, "VPB", 10);
    expect(items[0]!.finding_data).not.toBeNull();
    expect(items[0]!.source).toBeNull();
  });

  it("no rows for stock → empty array", () => {
    const items = querySignalsForStock(db, "NONEXISTENT", 10);
    expect(items).toHaveLength(0);
  });

  it("limit param respected", () => {
    for (let i = 0; i < 5; i++) {
      insertSignal(db, {
        signalType: "chain_catalyst",
        stockCode: "FPT",
        findingData: { event_type: "macro", direction: "bullish", confidence: 0.7,
          affected_stocks: ["FPT"], affected_sectors: ["tech"], headline: `h${i}`, source: "cafef" },
        createdAt: `2026-06-16 10:${String(i).padStart(2, "0")}:00`,
      });
    }

    const items = querySignalsForStock(db, "FPT", 3);
    expect(items).toHaveLength(3);
  });

  it("source falls back to payload.source when finding_data.source is absent", () => {
    insertSignal(db, {
      signalType: "urgent_news",
      stockCode: "VIC",
      payload: { source: "https://vnexpress.net/vn-market/abc", detail: "Breaking: VIC news" },
      findingData: { headline: "Breaking: VIC news", severity: "high" },
    });

    const items = querySignalsForStock(db, "VIC", 10);
    // finding_data has no source, but payload does
    expect(items[0]!.source).toBe("https://vnexpress.net/vn-market/abc");
  });
});

// ── AC-10/AC-11/AC-12: FIX-CASCADE-MACRO-CARD-REAL-DETAIL type filter + stub exclusion ──

describe("querySignalsForStock — type filter and stub exclusion (AC-10/AC-11/AC-12)", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("AC-10: type filter ['chain_catalyst'] returns chain_catalyst + urgent_news, excludes verified_decision", () => {
    insertSignal(db, {
      signalType: "chain_catalyst",
      stockCode: "FPT",
      findingData: { headline: "macro event", source: "cafef", event_type: "macro", direction: "bullish", confidence: 0.8, affected_stocks: ["FPT"], affected_sectors: ["tech"] },
    });
    insertSignal(db, {
      signalType: "urgent_news",
      stockCode: "FPT",
      findingData: { headline: "SBV decision", source: "sbv.gov.vn", severity: "high", confidence: 0.7 },
    });
    insertSignal(db, {
      signalType: "verified_decision",
      stockCode: "FPT",
      payload: { detail: "some decision" },
    });

    const items = querySignalsForStock(db, "FPT", 10, ["chain_catalyst"]);
    expect(items).toHaveLength(2);
    const types = items.map((i) => i.signal_type);
    expect(types).toContain("chain_catalyst");
    expect(types).toContain("urgent_news");
    expect(types).not.toContain("verified_decision");
  });

  it("AC-11: no type filter returns all non-stub rows (excludes is_correlation_stub=1)", () => {
    // Schema with is_correlation_stub column
    db.exec("ALTER TABLE agent_signals ADD COLUMN is_correlation_stub INTEGER DEFAULT 0");

    insertSignal(db, {
      signalType: "chain_catalyst",
      stockCode: "FPT",
      findingData: { headline: "h1", source: "s1", event_type: "macro", direction: "bullish", confidence: 0.8, affected_stocks: ["FPT"], affected_sectors: ["tech"] },
    });
    insertSignal(db, {
      signalType: "urgent_news",
      stockCode: "FPT",
      findingData: { headline: "h2", source: "s2", severity: "high", confidence: 0.7 },
    });
    insertSignal(db, {
      signalType: "price_anomaly",
      stockCode: "FPT",
      findingData: { move_pct: 3.1, move_sigma: 2.1, regime: "TIGHTENING" },
    });
    // Insert a stub row directly (simulating what storeAlerts writes)
    db.prepare(`
      INSERT INTO agent_signals
        (signal_type, stock_code, payload, status, created_at, expires_at, is_correlation_stub)
      VALUES ('verified_decision', 'FPT', '{}', 'unread', '2026-06-16 10:00:00', datetime('now', '+2 hours'), 1)
    `).run();

    const items = querySignalsForStock(db, "FPT", 10, undefined);
    // Should return 3 real rows, not the stub
    expect(items).toHaveLength(3);
    const types = items.map((i) => i.signal_type);
    expect(types).not.toContain("verified_decision");
  });

  it("AC-12: belt-and-suspenders — empty verified_decision excluded even without is_correlation_stub column", () => {
    // Schema WITHOUT is_correlation_stub column (pre-migration state)
    // makeDb() creates schema without this column, so this tests the fallback filter

    // Insert empty verified_decision (the stub pattern)
    db.prepare(`
      INSERT INTO agent_signals
        (signal_type, stock_code, payload, status, created_at, expires_at)
      VALUES ('verified_decision', 'STUBONLY', '{}', 'unread', '2026-06-16 10:00:00', datetime('now', '+2 hours'))
    `).run();
    // finding_data is NULL by default in makeDb schema (no value inserted)

    const items = querySignalsForStock(db, "STUBONLY", 10);
    // Fallback filter must exclude the empty verified_decision row
    expect(items).toHaveLength(0);
  });
});

// ── Response shape type guard ─────────────────────────────────────────────────

describe("StockSignalItem shape invariants", () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  it("all required shape fields present on every row", () => {
    insertSignal(db, {
      signalType: "chain_catalyst",
      stockCode: "FPT",
      confidenceScore: 75,
      findingData: {
        event_type: "macro", direction: "bullish", confidence: 0.75,
        affected_stocks: ["FPT"], affected_sectors: ["tech"],
        headline: "test", source: "cafef",
      },
      payload: { detail: "test detail" },
      createdAt: "2026-06-16 09:00:00",
    });

    const items = querySignalsForStock(db, "FPT", 10);
    expect(items).toHaveLength(1);
    const item: StockSignalItem = items[0]!;

    // Required fields
    expect(typeof item.id).toBe("number");
    expect(typeof item.signal_type).toBe("string");
    expect(typeof item.direction).toBe("string");
    expect(typeof item.detail).toBe("string");
    expect(typeof item.confidence_score).toBe("number");
    // ISO-8601 created_at
    expect(item.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // New fields
    expect(typeof item.finding_data === "object").toBe(true); // null or object
    expect(typeof item.payload === "object").toBe(true);
    // source is string or null
    expect(item.source === null || typeof item.source === "string").toBe(true);
  });
});
