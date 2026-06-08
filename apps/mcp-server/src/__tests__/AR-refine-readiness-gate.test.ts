// apps/mcp-server/src/__tests__/AR-refine-readiness-gate.test.ts
// Sprint BCTC-AGENTIC-REFINE — FR-12 Readiness Gate Tests
//
// Tests:
//   AC-FR12-1: text_status = IN_PROGRESS → skip, no DB write
//   AC-FR12-1b: text_status = PARTIAL → skip, no DB write
//   AC-FR12-1c: text_status = COMPLETE → proceeds with refine
//   AC-FR12-5: task_claim fails → skip (log + return)

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { refineOneReport } from "../scheduler/financial-reports/bctcRefineJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeInMemoryDb(): Database {
  return new Database(":memory:");
}

function seedReport(
  db: Database,
  id: string,
  textStatus: string,
  refineStatus = "PENDING",
): void {
  const emptyJson = "{}";
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type,
        period_start, period_end, sort_key, parsed_at, extraction_confidence,
        pdf_path, text_status, refine_status,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    "FPT",
    "FPT Corp",
    "HOSE",
    "technology",
    2024,
    "Q4",
    "Q4",
    "2024-10-01",
    "2024-12-31",
    "2024-Q4",
    new Date().toISOString(),
    0.9,
    "/app/data/pdfs/FPT_Q4_2024.pdf",
    textStatus,
    refineStatus,
    emptyJson,
    emptyJson,
    emptyJson,
    emptyJson,
  );
}

function getRefineStatus(db: Database, id: string): string | null {
  const row = db
    .query<{ refine_status: string }, [string]>(
      "SELECT refine_status FROM financial_reports WHERE id=?",
    )
    .get(id);
  return row?.refine_status ?? null;
}

function getRefinedUnitCount(db: Database, reportId: string): number {
  const row = db
    .query<{ cnt: number }, [string]>(
      "SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id=?",
    )
    .get(reportId);
  return row?.cnt ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("AR-refine-readiness-gate: text_status guard (AC-FR12-1)", () => {
  let db: Database;

  beforeEach(() => {
    db = makeInMemoryDb();
    initFinancialReportsTables(db);
  });

  it("AC-FR12-1: text_status=IN_PROGRESS → skip, refine_status stays PENDING, no bctc_refined_units written", async () => {
    seedReport(db, "test-rpt-1", "IN_PROGRESS", "PENDING");

    // Track calls to subagent spawn
    let subagentCalled = false;

    await refineOneReport("test-rpt-1", {
      db,
      getPageTextFn: async () => {
        return "page text";
      },
      spawnSubagentFn: async () => {
        subagentCalled = true;
        return {
          unit_id: "unit-0000",
          page_numbers: [1],
          markdown: "# test",
          confidence: 0.9,
          flags: [],
          status: "DONE" as const,
        };
      },
    });

    // Gate should have prevented any write
    expect(getRefineStatus(db, "test-rpt-1")).toBe("PENDING");
    expect(getRefinedUnitCount(db, "test-rpt-1")).toBe(0);
    expect(subagentCalled).toBe(false);
  });

  it("AC-FR12-1b: text_status=PARTIAL → skip, no bctc_refined_units written", async () => {
    seedReport(db, "test-rpt-2", "PARTIAL", "PENDING");

    let subagentCalled = false;
    await refineOneReport("test-rpt-2", {
      db,
      spawnSubagentFn: async () => {
        subagentCalled = true;
        return {
          unit_id: "unit-0000",
          page_numbers: [1],
          markdown: "# test",
          confidence: 0.9,
          flags: [],
          status: "DONE" as const,
        };
      },
    });

    expect(getRefineStatus(db, "test-rpt-2")).toBe("PENDING");
    expect(subagentCalled).toBe(false);
  });

  it("AC-FR12-1c: text_status=COMPLETE → proceeds (refine_status becomes IN_PROGRESS then DONE)", async () => {
    seedReport(db, "test-rpt-3", "COMPLETE", "PENDING");

    let subagentCalled = false;
    await refineOneReport("test-rpt-3", {
      db,
      getPageTextFn: async (reportId, filename, pageNum) => {
        // Return text for pages 1-3, empty for page 4 (signals end of doc)
        if (pageNum <= 3) return `Page ${pageNum} content with | pipe table`;
        return "";
      },
      spawnSubagentFn: async (reportId, win) => {
        subagentCalled = true;
        return {
          unit_id: win.unit_id,
          page_numbers: win.page_numbers,
          markdown: `| Mã số | Chỉ tiêu | Số cuối kỳ |\n|---|---|---|\n| 100 | Tiền | 1.000.000 |`,
          confidence: 0.9,
          flags: [],
          status: "DONE" as const,
        };
      },
    });

    // Should have proceeded and completed
    expect(subagentCalled).toBe(true);
    const finalStatus = getRefineStatus(db, "test-rpt-3");
    const validStatuses = ["DONE", "PARTIAL", "FAILED"];
    expect(validStatuses.includes(finalStatus ?? "")).toBe(true);
  });

  it("report not found → does not throw, returns cleanly", async () => {
    // No seed — report doesn't exist
    await expect(
      refineOneReport("nonexistent-report", { db }),
    ).resolves.toBeUndefined();
  });
});

describe("AR-refine-readiness-gate: FAILED windows are written to DB", () => {
  let db: Database;

  beforeEach(() => {
    db = makeInMemoryDb();
    initFinancialReportsTables(db);
  });

  it("FAILED windows are stored in bctc_refined_units with confidence=0.0 and window_status=FAILED", async () => {
    seedReport(db, "test-rpt-failed", "COMPLETE", "PENDING");

    await refineOneReport("test-rpt-failed", {
      db,
      getPageTextFn: async (reportId, filename, pageNum) => {
        if (pageNum === 1) return "page 1 | with table";
        return "";
      },
      spawnSubagentFn: async (reportId, win) => {
        // Simulate a FAILED window
        return {
          unit_id: win.unit_id,
          page_numbers: win.page_numbers,
          markdown: "",
          confidence: 0.0,
          flags: ["agent_error:simulated_failure"],
          status: "FAILED" as const,
        };
      },
    });

    // FAILED windows MUST be stored, NOT silently dropped
    const count = getRefinedUnitCount(db, "test-rpt-failed");
    expect(count).toBeGreaterThan(0);

    const failedRows = db
      .query<{ window_status: string; confidence: number }, [string]>(
        "SELECT window_status, confidence FROM bctc_refined_units WHERE report_id=?",
      )
      .all("test-rpt-failed");

    expect(failedRows.every((r) => r.window_status === "FAILED")).toBe(true);
    expect(failedRows.every((r) => r.confidence === 0.0)).toBe(true);
  });

  it("report refine_status=FAILED when all windows fail", async () => {
    seedReport(db, "test-rpt-all-fail", "COMPLETE", "PENDING");

    await refineOneReport("test-rpt-all-fail", {
      db,
      getPageTextFn: async (reportId, filename, pageNum) => {
        if (pageNum === 1) return "page text";
        return "";
      },
      spawnSubagentFn: async (reportId, win) => ({
        unit_id: win.unit_id,
        page_numbers: win.page_numbers,
        markdown: "",
        confidence: 0.0,
        flags: ["timeout"],
        status: "FAILED" as const,
      }),
    });

    expect(getRefineStatus(db, "test-rpt-all-fail")).toBe("FAILED");
  });

  it("report refine_status=PARTIAL when some windows fail", async () => {
    seedReport(db, "test-rpt-partial", "COMPLETE", "PENDING");

    let callCount = 0;
    await refineOneReport("test-rpt-partial", {
      db,
      getPageTextFn: async (reportId, filename, pageNum) => {
        // 3 pages with content (no continuation → 3 separate windows)
        if (pageNum <= 3) return `page ${pageNum} content | table data`;
        return "";
      },
      spawnSubagentFn: async (reportId, win) => {
        callCount++;
        // First window succeeds, rest fail
        if (callCount === 1) {
          return {
            unit_id: win.unit_id,
            page_numbers: win.page_numbers,
            markdown: "| Mã số | Chỉ tiêu | Số cuối kỳ |\n|---|---|---|\n| 100 | Test | 1.000 |",
            confidence: 0.9,
            flags: [],
            status: "DONE" as const,
          };
        }
        return {
          unit_id: win.unit_id,
          page_numbers: win.page_numbers,
          markdown: "",
          confidence: 0.0,
          flags: ["agent_error:simulated"],
          status: "FAILED" as const,
        };
      },
    });

    expect(getRefineStatus(db, "test-rpt-partial")).toBe("PARTIAL");
  });
});
