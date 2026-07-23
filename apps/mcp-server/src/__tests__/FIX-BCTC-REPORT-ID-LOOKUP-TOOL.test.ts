/**
 * FIX-BCTC-REPORT-ID-LOOKUP-TOOL — get_bctc_report_id
 *
 * Root cause (RECURRING dark-escalation, src signal
 * cowork-20260722T151600Z-bctc-esc5-report-id-gap): no MCP tool mapped
 * ticker+period -> financial_reports.id, so bctc-analyst's ESC-5 gate
 * (deep-dive-opus.md / flow/main.md) could never call
 * get_bctc_refined(report_id) — 30 cycles of silent-disable.
 *
 * Anti-false-green:
 *   RED proof: a report with refine_status='DONE' for VNM/2026/Q1 must
 *   resolve to its exact id via get_bctc_report_id — proves the lookup
 *   is real (queries live financial_reports), not a stub.
 *   GREEN proof: a report with refine_status='PENDING' for the SAME
 *   ticker/period is excluded — report_id stays null (typed-absent, not
 *   an error) and existing_refine_status surfaces 'PENDING' as a
 *   diagnostic, matching ESC-5's own graceful "not yet refined" handling.
 *
 * Verification: pure in-memory SQLite — no HTTP, no echo.
 */

import { describe, it, expect } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerGetBctcReportIdTool } from "../interface/mcp/tools/financial-reports/getBctcReportIdTool.js";

// ── Schema setup (mirrors BEQ-4b-pending-comparison-guard.test.ts) ────────────

function makeDb(): Database {
  const db = new Database(":memory:");

  db.run(`CREATE TABLE IF NOT EXISTS financial_reports (
    id TEXT PRIMARY KEY,
    action_code TEXT NOT NULL,
    period_year INTEGER NOT NULL,
    period_quarter INTEGER,
    period_type TEXT NOT NULL,
    sort_key TEXT NOT NULL,
    refine_status TEXT NOT NULL DEFAULT 'PENDING',
    published_at TEXT NOT NULL DEFAULT ''
  )`);

  return db;
}

function makeServer(db: Database): McpServer {
  const server = new McpServer(
    { name: "test", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  registerGetBctcReportIdTool(server, db);
  return server;
}

async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
      handler?: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
    }>;
  })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${name}`);
  const result = await fn(args);
  return JSON.parse(result.content[0]?.text ?? "{}");
}

function insertReport(
  db: Database,
  opts: {
    id: string;
    code: string;
    year: number;
    quarter: number;
    sortKey: string;
    refineStatus: "PENDING" | "DONE" | "PARTIAL" | "IN_PROGRESS" | "FAILED";
    publishedAt?: string;
  },
): void {
  db.run(
    `INSERT INTO financial_reports
       (id, action_code, period_year, period_quarter, period_type, sort_key, refine_status, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.id,
      opts.code,
      opts.year,
      opts.quarter,
      `Q${opts.quarter}`,
      opts.sortKey,
      opts.refineStatus,
      opts.publishedAt ?? "2026-01-01",
    ],
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("get_bctc_report_id — BCTC-REPORT-ID-LOOKUP-TOOL", () => {
  it("resolves the exact report_id for a known ticker+period with refine_status=DONE", async () => {
    const db = makeDb();
    const doneId = "vnm-2026-q1-done-report-uuid";

    insertReport(db, {
      id: doneId,
      code: "VNM",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      refineStatus: "DONE",
    });

    const server = makeServer(db);
    const out = await callTool(server, "get_bctc_report_id", { code: "VNM", year: 2026, quarter: "Q1" });

    expect(out.action_code).toBe("VNM");
    expect(out.refine_status_filter).toBe("DONE");
    expect(out.report_id).toBe(doneId);
    expect(out.report_ids).toEqual([doneId]);
    expect(out.count).toBe(1);
    expect((out.matches as unknown[]).length).toBe(1);
  });

  it("returns typed-absent report_id (null, not an error) for a not-yet-refined report, with diagnostic existing_refine_status", async () => {
    const db = makeDb();

    // Same ticker+period as the DONE case above, but PENDING — must be excluded.
    insertReport(db, {
      id: "vnm-2026-q2-pending-report-uuid",
      code: "VNM",
      year: 2026,
      quarter: 2,
      sortKey: "2026-Q2",
      refineStatus: "PENDING",
    });

    const server = makeServer(db);
    const out = await callTool(server, "get_bctc_report_id", { code: "VNM", year: 2026, quarter: "Q2" });

    expect(out.report_id).toBeNull();
    expect(out.report_ids).toEqual([]);
    expect(out.count).toBe(0);
    expect(out.matches).toEqual([]);
    // Not an error shape — no `error` key present.
    expect(out.error).toBeUndefined();
    // Diagnostic: tells the caller a report EXISTS but isn't refined yet.
    expect(out.existing_refine_status).toBe("PENDING");
  });

  it("returns typed-absent report_id with existing_refine_status=null when no report exists at all", async () => {
    const db = makeDb();
    const server = makeServer(db);
    const out = await callTool(server, "get_bctc_report_id", { code: "ZZZZ", year: 2026, quarter: "Q1" });

    expect(out.report_id).toBeNull();
    expect(out.count).toBe(0);
    expect(out.existing_refine_status).toBeNull();
  });

  it("excludes non-DONE statuses (PARTIAL, IN_PROGRESS, FAILED) even when a DONE row exists for a different period", async () => {
    const db = makeDb();
    insertReport(db, {
      id: "hpg-2026-q1-partial",
      code: "HPG",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      refineStatus: "PARTIAL",
    });
    insertReport(db, {
      id: "hpg-2025-q4-done",
      code: "HPG",
      year: 2025,
      quarter: 4,
      sortKey: "2025-Q4",
      refineStatus: "DONE",
    });

    const server = makeServer(db);

    // Q1-2026 is PARTIAL, not DONE — excluded.
    const q1 = await callTool(server, "get_bctc_report_id", { code: "HPG", year: 2026, quarter: "Q1" });
    expect(q1.report_id).toBeNull();
    expect(q1.existing_refine_status).toBe("PARTIAL");

    // Q4-2025 is DONE — resolves.
    const q4 = await callTool(server, "get_bctc_report_id", { code: "HPG", year: 2025, quarter: "Q4" });
    expect(q4.report_id).toBe("hpg-2025-q4-done");
  });

  it("without year/quarter filters, returns all DONE reports for the ticker ordered most-recent-first", async () => {
    const db = makeDb();
    insertReport(db, {
      id: "vcb-2025-q3-done",
      code: "VCB",
      year: 2025,
      quarter: 3,
      sortKey: "2025-Q3",
      refineStatus: "DONE",
    });
    insertReport(db, {
      id: "vcb-2025-q4-done",
      code: "VCB",
      year: 2025,
      quarter: 4,
      sortKey: "2025-Q4",
      refineStatus: "DONE",
    });
    insertReport(db, {
      id: "vcb-2026-q1-pending",
      code: "VCB",
      year: 2026,
      quarter: 1,
      sortKey: "2026-Q1",
      refineStatus: "PENDING",
    });

    const server = makeServer(db);
    const out = await callTool(server, "get_bctc_report_id", { code: "vcb" }); // lowercase input — uppercased internally

    expect(out.action_code).toBe("VCB");
    expect(out.count).toBe(2);
    expect(out.report_id).toBe("vcb-2025-q4-done"); // most recent DONE by sort_key
    expect(out.report_ids).toEqual(["vcb-2025-q4-done", "vcb-2025-q3-done"]);
  });
});
