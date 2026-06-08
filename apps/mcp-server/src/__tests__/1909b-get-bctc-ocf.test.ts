/**
 * Task 1909b — get_bctc_ocf TDD test suite
 *
 * AC:
 *   (a) Happy path — all 5 fields returned, source_tier=1, extraction_method from DB (not hardcoded)
 *   (b) No-row-found — returns found:false envelope with source_tier=1
 *   (c) Confidence field present in response
 *   (d) Validation error — bad input returns error envelope (no throw)
 *
 * Critical (SD-2): extraction_method is a REAL DB column. Tests assert it reads the actual
 * value ("pdf-parse"|"ocr-200"|"ocr-300"|"news_inference") — NOT a hardcoded constant.
 */

import { describe, it, expect } from "bun:test";
import Database from "bun:sqlite";

import { buildGetBctcOcfHandler } from "../interface/mcp/tools/financial-reports/getBctcOcfTool.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── DB helper ─────────────────────────────────────────────────────────────────

function makeTestDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE financial_reports (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code       TEXT    NOT NULL,
      period_year       INTEGER NOT NULL,
      period_quarter    INTEGER,
      ocf_operating     REAL,
      ocf_investing     REAL,
      ocf_financing     REAL,
      confidence        REAL    NOT NULL DEFAULT 0.0,
      extraction_method TEXT
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

interface SeedRow {
  action_code: string;
  period_year: number;
  period_quarter: number;
  ocf_operating: number | null;
  ocf_investing: number | null;
  ocf_financing: number | null;
  confidence: number;
  extraction_method: string | null;
}

function insertRow(db: InstanceType<typeof Database>, row: SeedRow): void {
  db.prepare(`
    INSERT INTO financial_reports
      (action_code, period_year, period_quarter,
       ocf_operating, ocf_investing, ocf_financing,
       confidence, extraction_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.action_code,
    row.period_year,
    row.period_quarter,
    row.ocf_operating,
    row.ocf_investing,
    row.ocf_financing,
    row.confidence,
    row.extraction_method,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("1909b — get_bctc_ocf tool", () => {

  // ── (a) Happy path — all fields + extraction_method from DB ───────────────

  it("(a) happy path — all 5 fields returned; source_tier=1 const; extraction_method from DB", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "VNM",
      period_year: 2025,
      period_quarter: 1,
      ocf_operating: 1200000,
      ocf_investing: -300000,
      ocf_financing: -100000,
      confidence: 0.95,
      extraction_method: "pdf-parse",
    });

    const handler = buildGetBctcOcfHandler(db);
    const result = await handler({ code: "VNM", period_year: 2025, period_quarter: 1 });
    const envelope = JSON.parse(result.content[0].text);

    // source_tier must be literal 1 (compile-time const per 1881a SSOT)
    expect(envelope.source_tier).toBe(1);

    // found flag
    expect(envelope.found).toBe(true);

    // identifier fields
    expect(envelope.code).toBe("VNM");
    expect(envelope.period_year).toBe(2025);
    expect(envelope.period_quarter).toBe(1);

    // OCF fields
    expect(envelope.ocf_operating).toBe(1200000);
    expect(envelope.ocf_investing).toBe(-300000);
    expect(envelope.ocf_financing).toBe(-100000);

    // confidence field present
    expect(envelope.confidence).toBe(0.95);

    // extraction_method from DB — NOT hardcoded constant (SD-2 critical)
    expect(envelope.extraction_method).toBe("pdf-parse");
  });

  it("(a2) extraction_method 'ocr-200' from DB — different enum value read correctly", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "VCB",
      period_year: 2025,
      period_quarter: 2,
      ocf_operating: 8000000,
      ocf_investing: -1000000,
      ocf_financing: -500000,
      confidence: 0.80,
      extraction_method: "ocr-200",
    });

    const handler = buildGetBctcOcfHandler(db);
    const result = await handler({ code: "VCB", period_year: 2025, period_quarter: 2 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.source_tier).toBe(1);
    expect(envelope.extraction_method).toBe("ocr-200");
  });

  it("(a3) extraction_method null — returns null (not a hardcoded fallback string)", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "FPT",
      period_year: 2025,
      period_quarter: 3,
      ocf_operating: 500000,
      ocf_investing: -200000,
      ocf_financing: -50000,
      confidence: 0.70,
      extraction_method: null,
    });

    const handler = buildGetBctcOcfHandler(db);
    const result = await handler({ code: "FPT", period_year: 2025, period_quarter: 3 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.source_tier).toBe(1);
    // null DB value → null in response (not "ocr_parsed" or any fallback constant)
    expect(envelope.extraction_method).toBeNull();
  });

  // ── (b) No-row-found envelope ──────────────────────────────────────────────

  it("(b) missing ticker — returns found:false envelope with source_tier=1", async () => {
    const db = makeTestDb();
    // Empty DB — no rows

    const handler = buildGetBctcOcfHandler(db);
    const result = await handler({ code: "ZZZNONE", period_year: 2025, period_quarter: 1 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.source_tier).toBe(1);
    expect(envelope.found).toBe(false);
    expect(envelope.code).toBe("ZZZNONE");
    expect(envelope.period_year).toBe(2025);
    expect(envelope.period_quarter).toBe(1);
  });

  it("(b2) existing ticker but wrong quarter — returns found:false", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "ACB",
      period_year: 2025,
      period_quarter: 1,
      ocf_operating: 3000000,
      ocf_investing: -500000,
      ocf_financing: -200000,
      confidence: 0.90,
      extraction_method: "ocr-300",
    });

    const handler = buildGetBctcOcfHandler(db);
    const result = await handler({ code: "ACB", period_year: 2025, period_quarter: 4 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.source_tier).toBe(1);
    expect(envelope.found).toBe(false);
    expect(envelope.code).toBe("ACB");
  });

  // ── (c) Confidence field ───────────────────────────────────────────────────

  it("(c) confidence field present and reflects DB value", async () => {
    const db = makeTestDb();
    insertRow(db, {
      action_code: "MBB",
      period_year: 2025,
      period_quarter: 1,
      ocf_operating: 2000000,
      ocf_investing: -400000,
      ocf_financing: -150000,
      confidence: 0.15,  // low confidence case
      extraction_method: "news_inference",
    });

    const handler = buildGetBctcOcfHandler(db);
    const result = await handler({ code: "MBB", period_year: 2025, period_quarter: 1 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope.found).toBe(true);
    expect(envelope.confidence).toBe(0.15);
    // extraction_method from DB (news_inference enum value)
    expect(envelope.extraction_method).toBe("news_inference");
  });

  // ── (d) Validation error — no throw ───────────────────────────────────────

  it("(d) missing code — returns error envelope (no throw)", async () => {
    const db = makeTestDb();
    const handler = buildGetBctcOcfHandler(db);

    // Pass empty string for code (fails min(1) validation)
    const result = await handler({ code: "", period_year: 2025, period_quarter: 1 });
    const envelope = JSON.parse(result.content[0].text);

    // Must return error JSON, not throw
    expect(envelope).toHaveProperty("error");
    // source_tier still present in error envelope
    expect(envelope.source_tier).toBe(1);
  });

  it("(d2) invalid period_quarter (out of 1–4) — returns error envelope (no throw)", async () => {
    const db = makeTestDb();
    const handler = buildGetBctcOcfHandler(db);

    const result = await handler({ code: "VNM", period_year: 2025, period_quarter: 5 });
    const envelope = JSON.parse(result.content[0].text);

    expect(envelope).toHaveProperty("error");
    expect(envelope.source_tier).toBe(1);
  });
});
