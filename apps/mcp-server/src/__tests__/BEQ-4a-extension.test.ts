/**
 * BEQ-8b DV — Extend BEQ-4a guard to null net_profit for PARTIAL (not just PENDING)
 *
 * Sprint: BCTC-EXTRACT-QUALITY Phase-2
 * Brief: docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md §8 Risk R-3
 *
 * Context:
 *   BEQ-4a (commit 0523b435) nulled net_profit for PENDING in /docs LIST_SQL.
 *   After BEQ-5/6/7/8, balance-sheet-only tickers transition from PENDING to PARTIAL.
 *   PARTIAL still has garbage legacy net_profit values → must be withheld like PENDING.
 *
 * Anti-false-green:
 *   RED: before patch, PARTIAL row with net_profit=999 is served verbatim (only
 *   PENDING is nulled by the CASE WHEN guard).
 *   GREEN: after patch, PARTIAL row also returns net_profit=null.
 *
 * DV-GUARD-4a-EXT-1: refine_status=PARTIAL → net_profit=null
 * DV-GUARD-4a-EXT-2: refine_status=DONE    → net_profit=actual value (not null)
 * DV-GUARD-4a-EXT-3: refine_status=PENDING → net_profit=null (existing guard preserved)
 */

import { describe, it, expect } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { handleBctcInspectDocs } from "../interface/mcp/routes/bctcInspectHandler.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
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

function insertReport(
  db: Database,
  opts: {
    id: string;
    code: string;
    netProfit: number;
    refineStatus: "PENDING" | "DONE" | "PARTIAL";
  },
): void {
  db.run(`
    INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_profit, refine_status, audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, ?, 'HOSE', 'other', 2025, 4, 'Q4', '2025-10-01', '2025-12-31', '2025-Q4',
            ?, ?, 'unaudited', 0.5, datetime('now'), '{}', '{}', '{}', '{}')
  `, [opts.id, opts.code, `${opts.code} Corp`, opts.netProfit, opts.refineStatus]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BEQ-8b — extend BEQ-4a guard: net_profit=NULL for PARTIAL in /docs", () => {
  it("DV-GUARD-4a-EXT-1: refine_status=PARTIAL → net_profit=null (garbage withheld)", () => {
    /**
     * RED: PARTIAL row with net_profit=999 is served verbatim
     *      (only PENDING was guarded by BEQ-4a).
     * GREEN: PARTIAL also nulled after extending IN ('PENDING','PARTIAL').
     *
     * Use case: VNM/FPT after BEQ-6 transitions from PENDING to PARTIAL.
     * The legacy net_profit value is still garbage (e.g. 0.000051 for VNM).
     * Must not be served as if authoritative.
     */
    const db = openTestDb();
    insertReport(db, {
      id: "beq8b00-0000-8b00-8000-000000000001",
      code: "VNM",
      netProfit: 999,           // garbage legacy value
      refineStatus: "PARTIAL",
    });

    const { res, captured } = mockRes();
    handleBctcInspectDocs(mockReq(), res, db);

    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.ok).toBe(true);

    const item = body.items.find((i: { action_code: string }) => i.action_code === "VNM");
    expect(item).toBeDefined();

    // PARTIAL must be nulled (same as PENDING)
    expect(item.net_profit).toBeNull();
    // refine_status badge still surfaced
    expect(item.refine_status).toBe("PARTIAL");

    // Prove raw DB still has the garbage value (we only null the projection)
    const rawRow = db.query<{ net_profit: number }, [string]>(
      "SELECT net_profit FROM financial_reports WHERE id = ?",
    ).get("beq8b00-0000-8b00-8000-000000000001");
    expect(rawRow?.net_profit).toBe(999); // raw untouched
  });

  it("DV-GUARD-4a-EXT-2: refine_status=DONE → net_profit=actual value (guard does not fire)", () => {
    const db = openTestDb();
    insertReport(db, {
      id: "beq8b00-0000-8b00-8000-000000000002",
      code: "FPT",
      netProfit: 2_476_790,     // correct refined value
      refineStatus: "DONE",
    });

    const { res, captured } = mockRes();
    handleBctcInspectDocs(mockReq(), res, db);

    const body = JSON.parse(captured.body);
    const item = body.items.find((i: { action_code: string }) => i.action_code === "FPT");
    expect(item).toBeDefined();

    // DONE must NOT be nulled
    expect(item.net_profit).toBe(2_476_790);
    expect(item.refine_status).toBe("DONE");
  });

  it("DV-GUARD-4a-EXT-3: refine_status=PENDING → net_profit=null (BEQ-4a guard preserved)", () => {
    const db = openTestDb();
    insertReport(db, {
      id: "beq8b00-0000-8b00-8000-000000000003",
      code: "CTG",
      netProfit: 5,             // garbage OCR value
      refineStatus: "PENDING",
    });

    const { res, captured } = mockRes();
    handleBctcInspectDocs(mockReq(), res, db);

    const body = JSON.parse(captured.body);
    const item = body.items.find((i: { action_code: string }) => i.action_code === "CTG");
    expect(item).toBeDefined();

    // PENDING still nulled (BEQ-4a not regressed)
    expect(item.net_profit).toBeNull();
    expect(item.refine_status).toBe("PENDING");
  });
});
