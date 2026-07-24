/**
 * FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW.test.ts
 *
 * Regression test for the SERVED get_bctc_pending_refine MCP tool path — the tool
 * is registered via registerGetBctcPendingRefineTool() onto a REAL McpServer
 * instance and invoked through the server's own internal tool registry (same
 * `_registeredTools` convention already used by 082-tool-watchlist.test.ts and
 * 084-tool-market.test.ts). This is the served path, not a hand-copied helper
 * (ref feedback_factory_testfirst_primitive_tests_copy_not_served_path).
 *
 * Defect fixed: get_bctc_pending_refine's default query had NO SQL LIMIT clause
 * when the `limit` argument was omitted — unbounded rows × pre-partitioned
 * windows[] per row produced a 235K-char inline JSON payload, exceeding the MCP
 * inline response limit and forcing the bridge to spill to a file path (callers
 * received a path string, not data). Fix: `limit` now defaults to DEFAULT_LIMIT
 * (mirrors the DEFAULT_LIMIT/MAX_LIMIT clamped-limit convention already used by
 * this codebase's other large-output list endpoints), and a new `offset`
 * parameter pairs with the existing SQL LIMIT to page through every row.
 *
 * Proves:
 *   AC-a: a large pending-refine set (> DEFAULT_LIMIT rows) returns paginated
 *         inline rows well under the MCP inline-response limit — no file-path
 *         fallback (content stays structured "text" JSON, payload bytes bounded).
 *   AC-b: paging through with offset retrieves ALL rows — no loss, no duplicates.
 *   AC-c: default page size (DEFAULT_LIMIT) is applied when no `limit` arg is given.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerGetBctcPendingRefineTool } from "../interface/mcp/tools/financial-reports/getBctcPendingRefineTool.js";

// Must match DEFAULT_LIMIT in getBctcPendingRefineTool.ts (no shared export —
// mirrors the same not-exported-constant pattern already used by that module).
const DEFAULT_LIMIT = 20;

// Conservative inline-payload safety ceiling for this regression test — far below
// the 235K-char overflow this task fixes, proving the fix, not just re-measuring
// whatever the current per-row size happens to be.
const SAFE_INLINE_CHAR_CEILING = 50_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Invoke a registered MCP tool via the McpServer's internal registry (bypasses
 *  SSE transport) — same convention as 082-tool-watchlist.test.ts / 084-tool-market.test.ts. */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<
      string,
      { handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }> }
    >;
  })._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args);
}

function parseReports(result: { content: Array<{ type: string; text: string }> }): Array<Record<string, unknown>> {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("No text content in tool response");
  return JSON.parse(first.text) as Array<Record<string, unknown>>;
}

/**
 * Insert `count` deterministic PENDING reports with distinct parsed_at seconds
 * (stable ORDER BY parsed_at ASC across separate paged queries — ties on an
 * unindexed secondary column are NOT guaranteed stable by SQLite, so distinct
 * timestamps are required for a reliable no-loss/no-duplicate paging assertion).
 * pdf_path=NULL -> filename="" -> windows computation short-circuits at the
 * `if (filename)` guard in getBctcPendingRefineTool.ts, keeping this test
 * focused on pagination (window-partition logic is already covered by
 * FIX-REFINE-PENDING-SCHEMA.test.ts).
 */
function insertPendingReports(count: number): string[] {
  if (count > 59) throw new Error("insertPendingReports supports up to 59 rows (distinct seconds 00-59)");
  const db = getDb();
  const ids: string[] = [];
  for (let n = 0; n < count; n++) {
    const id = `aaaa0000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    const actionCode = `TST${String(n).padStart(4, "0")}`;
    db.run(
      `INSERT INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          net_profit, refine_status, text_status, confirm_status, audit_status,
          extraction_confidence, parsed_at,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          pdf_path)
       VALUES (?, ?, 'Test Co', 'HOSE', 'other',
               2025, 1, 'Q1', '2025-01-01', '2025-03-31', ?,
               5.0, 'PENDING', 'COMPLETE', 'PENDING', 'unaudited', 0.5,
               ?,
               '{}', '{}', '{}', '{}',
               NULL)`,
      [id, actionCode, `2025-Q1-${actionCode}`, `2025-01-01T00:00:${String(n).padStart(2, "0")}Z`],
    );
    ids.push(id);
  }
  return ids;
}

// ── Setup — in-memory DB, fresh McpServer per suite ────────────────────────────

let server: McpServer;

beforeAll(async () => {
  await initDatabase();
  server = new McpServer({ name: "test-pending-refine", version: "0.0.1" }, { capabilities: { tools: {} } });
  registerGetBctcPendingRefineTool(server);
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

beforeEach(() => {
  getDb().exec("DELETE FROM financial_reports");
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW — get_bctc_pending_refine pagination (served path)", () => {
  it("tool is registered on the McpServer (served-path precondition)", () => {
    const registry = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(registry["get_bctc_pending_refine"]).toBeDefined();
  });

  // ── AC-a: large set -> bounded inline payload, no file-path fallback ────────

  it("AC-a: a large pending-refine set (45 rows, > DEFAULT_LIMIT) returns paginated inline rows well under the MCP inline limit", async () => {
    insertPendingReports(45);

    const result = await callTool(server, "get_bctc_pending_refine", {});
    const firstContent = result.content[0];

    // No file-path fallback: content stays structured text JSON.
    expect(firstContent?.type).toBe("text");
    expect(firstContent?.text.startsWith("/")).toBe(false); // not a bare filesystem path

    const reports = parseReports(result);
    expect(reports.length).toBe(DEFAULT_LIMIT);
    expect(firstContent!.text.length).toBeLessThan(SAFE_INLINE_CHAR_CEILING);
  });

  // ── AC-c: default page size applied when no `limit` arg given ───────────────

  it("AC-c: default page size (DEFAULT_LIMIT) is applied when no limit arg is given", async () => {
    insertPendingReports(45);

    const noArgs = parseReports(await callTool(server, "get_bctc_pending_refine", {}));
    expect(noArgs.length).toBe(DEFAULT_LIMIT);

    // offset supplied but limit still omitted -> default limit still applies
    const offsetOnly = parseReports(await callTool(server, "get_bctc_pending_refine", { offset: 10 }));
    expect(offsetOnly.length).toBe(DEFAULT_LIMIT);

    // Fewer rows than DEFAULT_LIMIT exist -> default returns all of them, no padding
    getDb().exec("DELETE FROM financial_reports");
    insertPendingReports(5);
    const small = parseReports(await callTool(server, "get_bctc_pending_refine", {}));
    expect(small.length).toBe(5);
  });

  // ── AC-b: paging through offset retrieves ALL rows — no loss, no duplicates ─

  it("AC-b: paging with offset retrieves ALL 45 rows exactly once, no loss, no duplicates, correct final short page", async () => {
    const insertedIds = insertPendingReports(45);

    const seen: string[] = [];
    let offset = 0;
    let pageCount = 0;
    const MAX_PAGES = 10; // guard against an infinite loop if the fix regresses

    for (;;) {
      pageCount++;
      if (pageCount > MAX_PAGES) throw new Error("paging did not terminate — regression guard tripped");

      const page = parseReports(await callTool(server, "get_bctc_pending_refine", { limit: DEFAULT_LIMIT, offset }));
      for (const r of page) seen.push(r["id"] as string);

      if (page.length < DEFAULT_LIMIT) break; // last page (documented termination condition)
      offset += DEFAULT_LIMIT;
    }

    // Exactly 3 pages for 45 rows at page size 20: [20, 20, 5]
    expect(pageCount).toBe(3);

    // No loss, no duplicates — the paged set is exactly the inserted set.
    expect(seen.length).toBe(45);
    expect(new Set(seen).size).toBe(45);
    expect(new Set(seen)).toEqual(new Set(insertedIds));
  });

  it("AC-b (ticker branch): offset also pages a ticker-filtered query without loss", async () => {
    const db = getDb();
    // 25 rows, all same ticker (action_code), for the Branch-2 ticker-filter query.
    for (let n = 0; n < 25; n++) {
      const id = `bbbb0000-0000-0000-0000-${String(n).padStart(12, "0")}`;
      db.run(
        `INSERT INTO financial_reports
           (id, action_code, company_name, exchange, domain,
            period_year, period_quarter, period_type, period_start, period_end, sort_key,
            net_profit, refine_status, text_status, confirm_status, audit_status,
            extraction_confidence, parsed_at,
            balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
            pdf_path)
         VALUES (?, 'CTG', 'Test Co', 'HOSE', 'other',
                 2025, 1, 'Q1', '2025-01-01', '2025-03-31', ?,
                 5.0, 'PENDING', 'COMPLETE', 'PENDING', 'unaudited', 0.5,
                 ?,
                 '{}', '{}', '{}', '{}',
                 NULL)`,
        [id, `2025-Q1-CTG-${n}`, `2025-01-01T00:00:${String(n).padStart(2, "0")}Z`],
      );
    }

    const page1 = parseReports(await callTool(server, "get_bctc_pending_refine", { ticker: "CTG", limit: 20, offset: 0 }));
    const page2 = parseReports(await callTool(server, "get_bctc_pending_refine", { ticker: "CTG", limit: 20, offset: 20 }));

    expect(page1.length).toBe(20);
    expect(page2.length).toBe(5);
    const allIds = new Set([...page1, ...page2].map((r) => r["id"]));
    expect(allIds.size).toBe(25);
  });
});
