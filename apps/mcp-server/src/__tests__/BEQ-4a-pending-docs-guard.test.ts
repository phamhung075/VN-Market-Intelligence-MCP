/**
 * BEQ-4a DV — refine_status=PENDING guard in /docs LIST_SQL
 *
 * Sprint: BCTC-EXTRACT-QUALITY
 * Brief: docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § Symptom C
 *
 * Anti-false-green:
 *   RED proof: without the CASE WHEN guard, a PENDING row's net_profit (legacy
 *   OCR-parse garbage: CTG=5, VNM=5.1e-05, DIG=18) is served verbatim in the
 *   /docs listing response.
 *
 *   GREEN proof: with the CASE WHEN guard, PENDING rows appear in the listing
 *   (has_pdf/has_ocr truthful) but net_profit is null. DONE rows still show
 *   the correct refined net_profit value.
 *
 *   Proof method: direct in-memory SQLite — no HTTP echo, no mocked response.
 *   The test calls handleBctcInspectDocs with an injected in-memory DB and parses
 *   the JSON written to the mock ServerResponse.
 */

import { describe, it, expect } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { handleBctcInspectDocs } from "../interface/mcp/routes/bctcInspectHandler.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

interface CapturedResponse {
  statusCode: number;
  body: string;
}

function mockRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 200, body: "" };
  const res = {
    writeHead(code: number) { captured.statusCode = code; },
    end(data?: string) { captured.body = data ?? ""; },
  } as unknown as ServerResponse;
  return { res, captured };
}

function mockReq(): IncomingMessage {
  return { url: "/api/bctc-inspect/docs" } as unknown as IncomingMessage;
}

/** Insert a minimal financial_reports row (satisfies all NOT NULL constraints) */
function insertReport(
  db: Database,
  opts: {
    id: string;
    code: string;
    year: number;
    quarter: number;
    sortKey: string;
    netProfit: number;
    refineStatus: "PENDING" | "DONE" | "PARTIAL";
  },
): void {
  const periodStart = `${opts.year}-01-01`;
  const periodEnd   = `${opts.year}-03-31`;
  // balance_sheet_json/income_stmt_json/cash_flow_json/ratios_json are NOT NULL in DDL
  const emptyJson = "{}";
  db.run(`
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_profit, refine_status, audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, ?, 'HOSE', 'other', ?, ?, ?, ?, ?, ?, ?, ?, 'unaudited', 0.5, datetime('now'),
            ?, ?, ?, ?)
  `, [
    opts.id, opts.code, `${opts.code} Corp`,
    opts.year, opts.quarter, `Q${opts.quarter}`, periodStart, periodEnd,
    opts.sortKey, opts.netProfit, opts.refineStatus,
    emptyJson, emptyJson, emptyJson, emptyJson,
  ]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BEQ-4a — /docs LIST_SQL PENDING guard", () => {
  it("RED→GREEN: PENDING row net_profit is null (not OCR-parse garbage)", () => {
    /**
     * Reproduces the CTG=5, VNM=5.1e-05, DIG=18 symptom.
     *
     * RED (what the bug looks like):
     *   CTG with refine_status=PENDING and net_profit=5 (OCR garbage) is returned
     *   verbatim in the /docs listing, confusing the analyst.
     *
     * GREEN (what the fix produces):
     *   CTG appears in the listing (row preserved — has_pdf/has_ocr truthful),
     *   but net_profit=null (CASE WHEN guard in LIST_SQL fires).
     */
    const db = openTestDb();

    // PENDING row — garbage scalar (CTG 2026-Q1: net_profit=5 from legacy OCR)
    insertReport(db, {
      id: "ctg-2026-q1-pending-xxxx",
      code: "CTG",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      netProfit: 5,              // OCR garbage
      refineStatus: "PENDING",
    });

    const { res, captured } = mockRes();
    handleBctcInspectDocs(mockReq(), res, db);

    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.ok).toBe(true);

    // Row must still appear in listing (PENDING rows kept — has_pdf/has_ocr truthful)
    const ctgItem = body.items.find((i: { action_code: string }) => i.action_code === "CTG");
    expect(ctgItem).toBeDefined();

    // GREEN: net_profit must be null, not the garbage value 5
    expect(ctgItem.net_profit).toBeNull();

    // refine_status surfaced in response (BEQ-4a: UI badge support)
    expect(ctgItem.refine_status).toBe("PENDING");

    // Direct DB proof: the raw DB row still has net_profit=5 (we only nulled the projection)
    const rawRow = db.query<{ net_profit: number; refine_status: string }, [string]>(
      "SELECT net_profit, refine_status FROM financial_reports WHERE action_code = ?",
    ).get("CTG");
    expect(rawRow?.net_profit).toBe(5);           // raw still 5 (untouched)
    expect(rawRow?.refine_status).toBe("PENDING");
  });

  it("DONE row still shows correct refined net_profit (no regression)", () => {
    const db = openTestDb();

    // DONE row — correct value from refine pipeline
    insertReport(db, {
      id: "fpt-2026-q1-done-xxxx",
      code: "FPT",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      netProfit: 2_476_790,    // correct refined value (million VND)
      refineStatus: "DONE",
    });

    const { res, captured } = mockRes();
    handleBctcInspectDocs(mockReq(), res, db);

    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.ok).toBe(true);

    const fptItem = body.items.find((i: { action_code: string }) => i.action_code === "FPT");
    expect(fptItem).toBeDefined();

    // Guard must NOT fire for DONE — real value preserved
    expect(fptItem.net_profit).toBe(2_476_790);
    expect(fptItem.refine_status).toBe("DONE");
  });

  it("BEQ-8b: PARTIAL row net_profit is null (guard extended to PARTIAL in BEQ-8b)", () => {
    /**
     * BEQ-4a original: PARTIAL was pass-through (net_profit served).
     * BEQ-8b update: PARTIAL also nulled — after BEQ-5/6/7, balance-sheet-only
     * tickers transition to PARTIAL and their legacy net_profit is still garbage.
     * The guard now covers IN ('PENDING', 'PARTIAL').
     */
    const db = openTestDb();

    insertReport(db, {
      id: "acb-2026-q1-partial-xx",
      code: "ACB",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      netProfit: 3_100_000,
      refineStatus: "PARTIAL",
    });

    const { res, captured } = mockRes();
    handleBctcInspectDocs(mockReq(), res, db);

    const body = JSON.parse(captured.body);
    const acbItem = body.items.find((i: { action_code: string }) => i.action_code === "ACB");
    expect(acbItem).toBeDefined();

    // BEQ-8b: PARTIAL also nulled (legacy garbage value must not be served)
    expect(acbItem.net_profit).toBeNull();
    expect(acbItem.refine_status).toBe("PARTIAL");
  });

  it("mixed corpus: PENDING rows nulled, DONE rows intact", () => {
    const db = openTestDb();

    // VNM PENDING garbage (VNM 2025-Q4: net_profit=0.000051)
    insertReport(db, {
      id: "vnm-2025-q4-pending-xx",
      code: "VNM",
      year: 2025,
      quarter: 4,
      sortKey: "2025-Q4",
      netProfit: 0.000051,       // OCR garbage
      refineStatus: "PENDING",
    });

    // FPT DONE correct
    insertReport(db, {
      id: "fpt-2026-q1-done-yyyy",
      code: "FPT",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      netProfit: 2_476_790,
      refineStatus: "DONE",
    });

    const { res, captured } = mockRes();
    handleBctcInspectDocs(mockReq(), res, db);

    const body = JSON.parse(captured.body);
    expect(body.count).toBe(2);

    const vnmItem = body.items.find((i: { action_code: string }) => i.action_code === "VNM");
    const fptItem = body.items.find((i: { action_code: string }) => i.action_code === "FPT");

    // VNM PENDING → null
    expect(vnmItem.net_profit).toBeNull();

    // FPT DONE → real value
    expect(fptItem.net_profit).toBe(2_476_790);
  });
});
