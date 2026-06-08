/**
 * Task 1178 — TDD Red Phase: failing tests for get_ticker_intelligence tool
 *
 * Tests cover AC-1 through AC-8 from REQ-071 and TECH-071.
 *
 * These tests MUST fail until Task 1179 implements tickerIntelligenceTools.ts.
 *
 * Tables required by buildDb():
 *   market_prices_history, evidence_scores, insider_transactions,
 *   vnstock_trading_stats, financial_reports, prediction_claims
 *
 * DB injection pattern: handleGetTickerIntelligence(code, db) called directly.
 * Bun.env["DB_PATH"] set to ":memory:" to prevent getDb() from opening
 * the production database if the fallback path is invoked.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  handleGetTickerIntelligence,
  formatTickerIntelligence,
} from "../interface/mcp/tools/market-data/tickerIntelligenceTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB setup
// ─────────────────────────────────────────────────────────────────────────────

function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE market_prices_history (
      code       TEXT    NOT NULL,
      price      REAL    NOT NULL,
      volume     INTEGER NOT NULL,
      fetched_at TEXT    NOT NULL
    );

    CREATE TABLE evidence_scores (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT    NOT NULL,
      score_date     TEXT    NOT NULL,
      bullish_score  REAL    NOT NULL,
      bearish_score  REAL    NOT NULL,
      neutral_score  REAL    NOT NULL,
      fragment_count INTEGER NOT NULL,
      computed_at    TEXT    NOT NULL
    );

    CREATE TABLE insider_transactions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      code              TEXT    NOT NULL,
      insider_name      TEXT    NOT NULL,
      position          TEXT    NOT NULL,
      type              TEXT    NOT NULL,
      executed_volume   INTEGER NOT NULL DEFAULT 0,
      registered_volume INTEGER NOT NULL DEFAULT 0,
      price             REAL    NOT NULL DEFAULT 0,
      from_date         TEXT    NOT NULL,
      to_date           TEXT    NOT NULL,
      fetched_at        TEXT    NOT NULL
    );

    CREATE TABLE vnstock_trading_stats (
      code                   TEXT    NOT NULL,
      foreign_volume         INTEGER NOT NULL,
      foreign_room           INTEGER NOT NULL,
      current_holding_ratio  REAL    NOT NULL,
      fetched_at             TEXT    NOT NULL
    );

    CREATE TABLE financial_reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      sort_key        TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  INTEGER NOT NULL,
      ai_analysis     TEXT
    );

    CREATE TABLE prediction_claims (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock              TEXT    NOT NULL,
      agent_id           TEXT    NOT NULL,
      claim_text         TEXT    NOT NULL,
      direction          TEXT    NOT NULL,
      target_price       REAL,
      creation_price     REAL,
      resolution_date    TEXT    NOT NULL,
      confidence         REAL    NOT NULL,
      resolution_outcome INTEGER,
      brier_score        REAL,
      resolved_at        TEXT,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers — parameterized SQL only (no string interpolation)
// ─────────────────────────────────────────────────────────────────────────────

function seedPrice(
  db: Database,
  code: string,
  price: number,
  volume: number,
  fetchedAt: string,
): void {
  db.prepare(
    `INSERT INTO market_prices_history (code, price, volume, fetched_at) VALUES (?, ?, ?, ?)`,
  ).run(code, price, volume, fetchedAt);
}

function seedEvidenceScore(
  db: Database,
  stock: string,
  opts: {
    bullish: number;
    bearish: number;
    neutral: number;
    fragmentCount: number;
    scoreDate: string;
  },
): void {
  db.prepare(
    `INSERT INTO evidence_scores (stock, score_date, bullish_score, bearish_score, neutral_score, fragment_count, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    stock,
    opts.scoreDate,
    opts.bullish,
    opts.bearish,
    opts.neutral,
    opts.fragmentCount,
    opts.scoreDate + "T00:00:00Z",
  );
}

function seedInsider(
  db: Database,
  opts: {
    code: string;
    insiderName: string;
    position: string;
    type: "buy" | "sell";
    executedVolume: number;
    fromDate: string;
  },
): void {
  db.prepare(
    `INSERT INTO insider_transactions (code, insider_name, position, type, executed_volume, registered_volume, price, from_date, to_date, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.code,
    opts.insiderName,
    opts.position,
    opts.type,
    opts.executedVolume,
    opts.executedVolume,
    0,
    opts.fromDate,
    opts.fromDate,
    opts.fromDate + "T08:00:00Z",
  );
}

function seedForeignFlow(
  db: Database,
  code: string,
  opts: {
    foreignVolume: number;
    foreignRoom: number;
    holdingRatio: number;
    fetchedAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO vnstock_trading_stats (code, foreign_volume, foreign_room, current_holding_ratio, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    code,
    opts.foreignVolume,
    opts.foreignRoom,
    opts.holdingRatio,
    opts.fetchedAt,
  );
}

function seedFinancialReport(
  db: Database,
  actionCode: string,
  opts: {
    sortKey: string;
    periodYear: number;
    periodQuarter: number;
    aiAnalysis: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO financial_reports (action_code, sort_key, period_year, period_quarter, ai_analysis)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    actionCode,
    opts.sortKey,
    opts.periodYear,
    opts.periodQuarter,
    opts.aiAnalysis,
  );
}

function seedPredictionClaim(
  db: Database,
  opts: {
    stock: string;
    resolutionOutcome: number | null;
    brierScore: number | null;
    confidence?: number;
  },
): void {
  db.prepare(
    `INSERT INTO prediction_claims (stock, agent_id, claim_text, direction, resolution_date, confidence, resolution_outcome, brier_score, resolved_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.stock,
    "04-market-watcher",
    "test claim",
    "bullish",
    "2026-04-01",
    opts.confidence ?? 0.7,
    opts.resolutionOutcome,
    opts.brierScore,
    opts.resolutionOutcome !== null ? "2026-04-01T10:00:00Z" : null,
    "2026-03-01T08:00:00Z",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: Full brief with all 6 sections populated
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1178 — AC-1: full brief with all data present", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();

    // Section 1 — price
    seedPrice(db, "VCB", 85000, 1500000, "2026-04-13T08:00:00Z");

    // Section 2 — evidence score
    seedEvidenceScore(db, "VCB", {
      bullish: 0.72,
      bearish: 0.15,
      neutral: 0.13,
      fragmentCount: 12,
      scoreDate: "2026-04-12",
    });

    // Section 3 — insider (2 buy transactions within last 7 days)
    const today = new Date().toISOString().slice(0, 10);
    seedInsider(db, {
      code: "VCB",
      insiderName: "Nguyen Van A",
      position: "Chairman",
      type: "buy",
      executedVolume: 50000,
      fromDate: today,
    });
    seedInsider(db, {
      code: "VCB",
      insiderName: "Tran Thi B",
      position: "CFO",
      type: "buy",
      executedVolume: 30000,
      fromDate: today,
    });

    // Section 4 — foreign flow
    seedForeignFlow(db, "VCB", {
      foreignVolume: 800000,
      foreignRoom: 5000000,
      holdingRatio: 0.275,
      fetchedAt: "2026-04-12T16:00:00Z",
    });

    // Section 5 — BCTC AI
    seedFinancialReport(db, "VCB", {
      sortKey: "2025Q4",
      periodYear: 2025,
      periodQuarter: 4,
      aiAnalysis: JSON.stringify({
        outlook: "positive",
        summary: "Doanh thu tang truong manh",
        signals: [],
      }),
    });

    // Section 6 — prediction calibration (2 correct claims)
    seedPredictionClaim(db, { stock: "VCB", resolutionOutcome: 1, brierScore: 0.1 });
    seedPredictionClaim(db, { stock: "VCB", resolutionOutcome: 1, brierScore: 0.1 });
  });

  it("response contains the VCB intelligence brief header", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    expect(result).toContain("=== INTELLIGENCE BRIEF: VCB ===");
  });

  it("response contains [1] GIA section with price 85,000 VND", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    expect(result).toContain("[1] GIÁ");
    expect(result).toContain("85,000 VND");
  });

  it("response contains [2] EVIDENCE SCORE section with Bullish 0.7200", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    expect(result).toContain("[2] EVIDENCE SCORE");
    expect(result).toContain("Bullish 0.7200");
  });

  it("response contains [3] INSIDER (7 NGAY) section with 2 transaction lines", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    expect(result).toContain("[3] INSIDER (7 NGÀY)");
    // Two insider lines (Nguyen Van A and Tran Thi B)
    expect(result).toContain("Nguyen Van A");
    expect(result).toContain("Tran Thi B");
  });

  it("response contains [4] KHOI NGOAI section with foreign volume", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    expect(result).toContain("[4] KHỐI NGOẠI");
    // 800000 formatted as abbreviated volume
    expect(result).toMatch(/800\.(0+)?K|0\.80M|800\.0K/);
  });

  it("response contains [5] BCTC AI section with TICH CUC outlook", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    expect(result).toContain("[5] BCTC AI");
    expect(result).toContain("TICH CUC");
    expect(result).toContain("Doanh thu tang truong manh");
  });

  it("response contains [6] DU DOAN section with 100.0% accuracy", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    expect(result).toContain("[6] DỰ ĐOÁN");
    expect(result).toContain("Chính xác 2/2 (100.0%)");
  });

  it("response ends with the 35-equals footer", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    expect(result).toContain("===================================");
    // Verify exactly 35 = characters
    expect(result).toMatch(/={35}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: Clean brief when all data is missing (empty DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1178 — AC-2: empty DB returns no-data strings per section", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
    // No rows inserted — all tables empty
  });

  it("header shows HPG", async () => {
    const result = await handleGetTickerIntelligence("HPG", db);
    expect(result).toContain("=== INTELLIGENCE BRIEF: HPG ===");
  });

  it("section 1 shows (khong co du lieu)", async () => {
    const result = await handleGetTickerIntelligence("HPG", db);
    expect(result).toContain("[1] GIÁ");
    expect(result).toContain("(không có dữ liệu)");
  });

  it("section 2 shows (khong co du lieu)", async () => {
    const result = await handleGetTickerIntelligence("HPG", db);
    expect(result).toContain("[2] EVIDENCE SCORE");
    // At least one section shows the no-data string
    const lines = result.split("\n");
    const evidenceIdx = lines.findIndex((l: string) => l.includes("[2] EVIDENCE SCORE"));
    expect(evidenceIdx).toBeGreaterThanOrEqual(0);
    expect(lines.slice(evidenceIdx, evidenceIdx + 3).join("\n")).toContain("(không có dữ liệu)");
  });

  it("section 3 shows (khong co giao dich insider trong 7 ngay qua)", async () => {
    const result = await handleGetTickerIntelligence("HPG", db);
    expect(result).toContain("[3] INSIDER (7 NGÀY)");
    expect(result).toContain("(không có giao dịch insider trong 7 ngày qua)");
  });

  it("section 4 shows (khong co du lieu khoi ngoai)", async () => {
    const result = await handleGetTickerIntelligence("HPG", db);
    expect(result).toContain("[4] KHỐI NGOẠI");
    expect(result).toContain("(không có dữ liệu khối ngoại)");
  });

  it("section 5 shows (chua co phan tich BCTC)", async () => {
    const result = await handleGetTickerIntelligence("HPG", db);
    expect(result).toContain("[5] BCTC AI");
    expect(result).toContain("(chưa có phân tích BCTC)");
  });

  it("section 6 shows (chua co du doan da giai quyet)", async () => {
    const result = await handleGetTickerIntelligence("HPG", db);
    expect(result).toContain("[6] DỰ ĐOÁN");
    expect(result).toContain("(chưa có dự đoán đã giải quyết)");
  });

  it("does not throw an exception", async () => {
    // Bun quirk: .resolves.not.toThrow() misidentifies the resolved string as a
    // thrown value. Use await-and-resolve pattern instead — semantically identical.
    const result = await handleGetTickerIntelligence("HPG", db);
    expect(typeof result).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: Ticker normalised to uppercase
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1178 — AC-3: ticker normalisation to uppercase", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
    seedPrice(db, "FPT", 120000, 500000, "2026-04-13T08:00:00Z");
  });

  it("header shows FPT when called with 'fpt'", async () => {
    const result = await handleGetTickerIntelligence("fpt", db);
    expect(result).toContain("INTELLIGENCE BRIEF: FPT");
  });

  it("section 1 returns price data (not no-data) proving uppercased query", async () => {
    const result = await handleGetTickerIntelligence("fpt", db);
    expect(result).toContain("120,000 VND");
  });

  it("header shows FPT when called with '  FPT  ' (with spaces)", async () => {
    const result = await handleGetTickerIntelligence("  FPT  ", db);
    expect(result).toContain("INTELLIGENCE BRIEF: FPT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: Malformed ai_analysis JSON in section 5
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1178 — AC-4: malformed ai_analysis JSON handled gracefully", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
    seedFinancialReport(db, "VNM", {
      sortKey: "2025Q3",
      periodYear: 2025,
      periodQuarter: 3,
      aiAnalysis: "not-valid-json",
    });
  });

  it("section 5 shows (lỗi phân tích BCTC) when JSON is malformed", async () => {
    const result = await handleGetTickerIntelligence("VNM", db);
    expect(result).toContain("[5] BCTC AI");
    expect(result).toContain("(lỗi phân tích BCTC)");
  });

  it("all 6 section labels are still present despite JSON parse failure", async () => {
    const result = await handleGetTickerIntelligence("VNM", db);
    expect(result).toContain("[1] GIÁ");
    expect(result).toContain("[2] EVIDENCE SCORE");
    expect(result).toContain("[3] INSIDER (7 NGÀY)");
    expect(result).toContain("[4] KHỐI NGOẠI");
    expect(result).toContain("[5] BCTC AI");
    expect(result).toContain("[6] DỰ ĐOÁN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: Section 3 caps at 3 transactions and shows overflow count
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1178 — AC-5: insider section caps at 3, shows overflow", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
    const today = new Date().toISOString().slice(0, 10);

    // Seed 5 insider transactions within the last 7 days
    for (let i = 1; i <= 5; i++) {
      seedInsider(db, {
        code: "VCB",
        insiderName: `Insider Person ${i}`,
        position: "Director",
        type: "buy",
        executedVolume: i * 10000,
        fromDate: today,
      });
    }
  });

  it("section 3 contains exactly 3 transaction lines (not all 5)", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    // Count "Insider (" occurrences — each transaction line starts with this
    const transactionLineCount = (result.match(/Insider \(/g) ?? []).length;
    expect(transactionLineCount).toBe(3);
  });

  it("section 3 ends with (+2 giao dich khac trong 7 ngay) overflow line", async () => {
    const result = await handleGetTickerIntelligence("VCB", db);
    expect(result).toContain("(+2 giao dịch khác trong 7 ngày)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: Section 6 shows N/A for Brier when all brier_scores are null
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1178 — AC-6: section 6 shows N/A Brier when all scores null", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
    // 2 resolved claims with NULL brier_score
    seedPredictionClaim(db, { stock: "TCB", resolutionOutcome: 1, brierScore: null });
    seedPredictionClaim(db, { stock: "TCB", resolutionOutcome: 1, brierScore: null });
  });

  it("section 6 shows Chinh xac 2/2 (100.0%) | Brier TB: N/A", async () => {
    const result = await handleGetTickerIntelligence("TCB", db);
    expect(result).toContain("[6] DỰ ĐOÁN");
    expect(result).toContain("Chính xác 2/2 (100.0%) | Brier TB: N/A");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7 / AC-8: formatTickerIntelligence output structure (unit test formatter)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1178 — AC-7/AC-8: formatTickerIntelligence output structure", () => {
  it("header uses exactly 35 = characters on the opening line", () => {
    const sections: [string, string, string, string, string, string] = [
      "s1", "s2", "s3", "s4", "s5", "s6",
    ];
    const result = formatTickerIntelligence("VCB", sections, "2026-04-13T08:00:00.000Z");
    const firstLine = result.split("\n")[0]!;
    expect(firstLine.startsWith("===")).toBe(true);
    // Count = characters in the separator portions of the header
    // Header is: === INTELLIGENCE BRIEF: VCB ===
    // Footer is: ===================================  (35 =)
    expect(result).toMatch(/={35}/);
  });

  it("all 6 section labels are present", () => {
    const sections: [string, string, string, string, string, string] = [
      "s1", "s2", "s3", "s4", "s5", "s6",
    ];
    const result = formatTickerIntelligence("VCB", sections, "2026-04-13T08:00:00.000Z");
    expect(result).toContain("[1] GIÁ");
    expect(result).toContain("[2] EVIDENCE SCORE");
    expect(result).toContain("[3] INSIDER (7 NGÀY)");
    expect(result).toContain("[4] KHỐI NGOẠI");
    expect(result).toContain("[5] BCTC AI");
    expect(result).toContain("[6] DỰ ĐOÁN");
  });

  it("each section content appears in the correct position", () => {
    const sections: [string, string, string, string, string, string] = [
      "price-content",
      "evidence-content",
      "insider-content",
      "foreign-content",
      "bctc-content",
      "prediction-content",
    ];
    const result = formatTickerIntelligence("TCB", sections, "2026-04-13T08:00:00.000Z");
    expect(result).toContain("price-content");
    expect(result).toContain("evidence-content");
    expect(result).toContain("insider-content");
    expect(result).toContain("foreign-content");
    expect(result).toContain("bctc-content");
    expect(result).toContain("prediction-content");
  });

  it("header shows the correct ticker code", () => {
    const sections: [string, string, string, string, string, string] = [
      "s1", "s2", "s3", "s4", "s5", "s6",
    ];
    const result = formatTickerIntelligence("FPT", sections, "2026-04-13T08:00:00.000Z");
    expect(result).toContain("INTELLIGENCE BRIEF: FPT");
  });

  it("timestamp line contains Thoi gian:", () => {
    const sections: [string, string, string, string, string, string] = [
      "s1", "s2", "s3", "s4", "s5", "s6",
    ];
    const ts = "2026-04-13T08:00:00.000Z";
    const result = formatTickerIntelligence("VCB", sections, ts);
    expect(result).toContain(`Thoi gian: ${ts}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge: section 5 shows (loi phan tich BCTC) when ai_analysis is valid JSON
// but missing required outlook/summary fields
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1178 — Edge: section 5 missing ai_analysis fields", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
    // Valid JSON but missing 'outlook' and 'summary' fields
    seedFinancialReport(db, "MSN", {
      sortKey: "2025Q4",
      periodYear: 2025,
      periodQuarter: 4,
      aiAnalysis: JSON.stringify({ signals: [] }),
    });
  });

  it("section 5 shows (loi phan tich BCTC) when outlook field is missing", async () => {
    const result = await handleGetTickerIntelligence("MSN", db);
    expect(result).toContain("[5] BCTC AI");
    expect(result).toContain("(lỗi phân tích BCTC)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge: section 4 zero foreign_volume treated as no data
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1178 — Edge: section 4 zero foreign_volume treated as no data", () => {
  let db: Database;

  beforeEach(() => {
    db = buildDb();
    // A row exists but foreign_volume is 0
    seedForeignFlow(db, "VNM", {
      foreignVolume: 0,
      foreignRoom: 5000000,
      holdingRatio: 0.2,
      fetchedAt: "2026-04-12T16:00:00Z",
    });
  });

  it("section 4 shows (khong co du lieu khoi ngoai) when foreign_volume is 0", async () => {
    const result = await handleGetTickerIntelligence("VNM", db);
    expect(result).toContain("[4] KHỐI NGOẠI");
    expect(result).toContain("(không có dữ liệu khối ngoại)");
  });
});
