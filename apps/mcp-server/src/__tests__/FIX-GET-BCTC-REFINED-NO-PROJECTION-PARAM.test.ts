/**
 * FIX-GET-BCTC-REFINED-NO-PROJECTION-PARAM.test.ts
 *
 * Regression test for the SERVED get_bctc_refined MCP tool path — the tool is
 * registered via registerGetBctcRefinedTool() onto a REAL McpServer instance and
 * invoked through the server's own internal tool registry (same `_registeredTools`
 * convention already used by FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW.test.ts,
 * 082-tool-watchlist.test.ts, 084-tool-market.test.ts). Served path, not a
 * hand-copied helper (ref feedback_factory_testfirst_primitive_tests_copy_not_served_path).
 *
 * Defect fixed: get_bctc_refined had no projection argument — every call SELECTed
 * `markdown` (+ every other column) for EVERY unit of the report and returned it
 * inline, even though refine_bctc_md's Phase 0 resume step only needs a skip-set of
 * unit_ids. The read grew monotonically with each completed chunk (measured worst
 * case: report b061d92b = 77 units / 103,606 markdown bytes, ~30k tokens returned to
 * a caller that wanted a list of ids).
 *
 * Fix: optional `fields` argument ('ids' | 'full', default 'full' — AC-1). 'full' is
 * byte-for-byte the pre-fix default response shape (bctc-analyst / ESC-5 gate
 * unaffected — out of scope for this task). 'ids' SELECTs only `unit_id,
 * window_status` (no markdown read from the DB at all, not just omitted from the
 * response) and always returns the structured
 * `{ report_id, total_units, units:[{unit_id, window_status}] }` shape — including
 * an empty `units: []` when the report has zero pushed units yet, never the 'full'
 * path's `{ error }` shape.
 *
 * Proves:
 *   AC-1a: fields='ids' on a >=12-unit report returns only
 *          { report_id, total_units, units:[{unit_id, window_status}] } — no markdown,
 *          no page_numbers_json, no flags, no confidence, no refined_at anywhere in
 *          the payload.
 *   AC-1b: default (fields omitted) is byte-identical in shape to the pre-fix
 *          behavior — full columns present, markdown included.
 *   AC-1c: fields='ids' on a report with zero pushed units returns the structured
 *          empty shape ({ total_units: 0, units: [] }), not the 'full' path's
 *          { error } shape — the actual state refine_bctc_md's first resume fire
 *          hits on a fresh report.
 *   AC-3:  the fields='ids' response for a >=12-unit report is under 4KB.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerGetBctcRefinedTool } from "../interface/mcp/tools/financial-reports/getBctcRefinedTool.js";

const REPORT_ID = "a3a41225-0000-4000-8000-000000000001";
const EMPTY_REPORT_ID = "a3a41225-0000-4000-8000-000000000002";

// AC-3 ceiling — task requires "under 4KB" for the ids projection on a >=12-unit report.
const AC3_CEILING_BYTES = 4096;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Invoke a registered MCP tool via the McpServer's internal registry (bypasses
 *  SSE transport) — same convention as FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW.test.ts. */
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

function parseJson(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("No text content in tool response");
  return JSON.parse(first.text) as Record<string, unknown>;
}

/** Insert `count` deterministic DONE bctc_refined_units rows with realistic markdown
 *  bulk (mirrors the live-measured worst case: sizeable per-unit markdown so a
 *  regression back to the unbounded 'full'-shaped payload would clearly overflow
 *  the AC-3 4KB ceiling). */
function insertRefinedUnits(reportId: string, count: number): void {
  const db = getDb();
  const bulkMarkdown = "| Code | Label | Value |\n|---|---|---|\n" + "| 100 | Some line item label | 1,000,000 |\n".repeat(40);
  for (let n = 0; n < count; n++) {
    const unitId = `unit-${String(n).padStart(3, "0")}`;
    db.run(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, window_status, refined_at)
       VALUES (?, ?, ?, ?, 40, 0.9, NULL, 'DONE', datetime('now'))`,
      [reportId, unitId, JSON.stringify([n + 1]), bulkMarkdown],
    );
  }
}

// ── Setup — in-memory DB, fresh McpServer per suite ────────────────────────────

let server: McpServer;

beforeAll(async () => {
  await initDatabase();
  server = new McpServer({ name: "test-get-bctc-refined", version: "0.0.1" }, { capabilities: { tools: {} } });
  registerGetBctcRefinedTool(server);
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

beforeEach(() => {
  getDb().exec("DELETE FROM bctc_refined_units");
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FIX-GET-BCTC-REFINED-NO-PROJECTION-PARAM — get_bctc_refined fields projection (served path)", () => {
  it("tool is registered on the McpServer (served-path precondition)", () => {
    const registry = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    expect(registry["get_bctc_refined"]).toBeDefined();
  });

  // ── AC-1a: 'ids' projection shape — no markdown anywhere ────────────────────

  it("AC-1a: fields='ids' on a 12-unit report returns only { report_id, total_units, units:[{unit_id, window_status}] } — no markdown", async () => {
    insertRefinedUnits(REPORT_ID, 12);

    const result = await callTool(server, "get_bctc_refined", { report_id: REPORT_ID, fields: "ids" });
    const rawText = result.content[0]!.text;
    const parsed = parseJson(result);

    expect(parsed["report_id"]).toBe(REPORT_ID);
    expect(parsed["total_units"]).toBe(12);
    const units = parsed["units"] as Array<Record<string, unknown>>;
    expect(units.length).toBe(12);

    for (const u of units) {
      expect(Object.keys(u).sort()).toEqual(["unit_id", "window_status"]);
      expect(u["window_status"]).toBe("DONE");
    }
    // Top-level shape has exactly the 3 documented keys, nothing else.
    expect(Object.keys(parsed).sort()).toEqual(["report_id", "total_units", "units"]);

    // Belt-and-suspenders: the raw serialized payload must never contain the
    // markdown bulk text inserted by the fixture, anywhere.
    expect(rawText).not.toContain("Some line item label");
    expect(rawText).not.toContain("markdown");
    expect(rawText).not.toContain("page_numbers");
    expect(rawText).not.toContain("confidence");
    expect(rawText).not.toContain("refined_at");
    expect(rawText).not.toContain("flags");
  });

  // ── AC-1b: default ('full') shape unchanged — out of scope to alter ─────────

  it("AC-1b: default (fields omitted) is unchanged — full columns present, markdown included", async () => {
    insertRefinedUnits(REPORT_ID, 3);

    const result = await callTool(server, "get_bctc_refined", { report_id: REPORT_ID });
    const parsed = parseJson(result);

    expect(parsed["report_id"]).toBe(REPORT_ID);
    expect(parsed["total_units"]).toBe(3);
    const units = parsed["units"] as Array<Record<string, unknown>>;
    expect(units.length).toBe(3);
    expect(Object.keys(units[0]!).sort()).toEqual(
      ["confidence", "flags", "markdown", "page_numbers", "refined_at", "unit_id", "window_status"].sort(),
    );
    expect(units[0]!["markdown"]).toContain("Some line item label");

    // Explicit fields='full' behaves identically to omitted.
    const explicit = parseJson(await callTool(server, "get_bctc_refined", { report_id: REPORT_ID, fields: "full" }));
    expect(explicit).toEqual(parsed);
  });

  it("AC-1b (unchanged): default path still returns { error } for a report with zero refined units", async () => {
    const result = await callTool(server, "get_bctc_refined", { report_id: EMPTY_REPORT_ID });
    const parsed = parseJson(result);
    expect(parsed["error"]).toBeDefined();
    expect(parsed["units"]).toBeUndefined();
  });

  // ── AC-1c: 'ids' on zero-unit report → structured empty shape, not { error } ─

  it("AC-1c: fields='ids' on a report with zero pushed units returns structured empty shape, not { error }", async () => {
    const result = await callTool(server, "get_bctc_refined", { report_id: EMPTY_REPORT_ID, fields: "ids" });
    const parsed = parseJson(result);

    expect(parsed["error"]).toBeUndefined();
    expect(parsed["report_id"]).toBe(EMPTY_REPORT_ID);
    expect(parsed["total_units"]).toBe(0);
    expect(parsed["units"]).toEqual([]);
  });

  // ── AC-3: 'ids' payload for a >=12-unit report is under 4KB ─────────────────

  it("AC-3: fields='ids' response for a 12-unit report is under 4KB", async () => {
    insertRefinedUnits(REPORT_ID, 12);

    const result = await callTool(server, "get_bctc_refined", { report_id: REPORT_ID, fields: "ids" });
    const byteLength = Buffer.byteLength(result.content[0]!.text, "utf8");

    expect(byteLength).toBeLessThan(AC3_CEILING_BYTES);
  });

  it("AC-3 (larger set): fields='ids' response for a 77-unit report (live-measured worst-case unit count) is dramatically smaller than the equivalent 'full' response", async () => {
    insertRefinedUnits(REPORT_ID, 77);

    const idsResult = await callTool(server, "get_bctc_refined", { report_id: REPORT_ID, fields: "ids" });
    const fullResult = await callTool(server, "get_bctc_refined", { report_id: REPORT_ID, fields: "full" });

    const idsBytes = Buffer.byteLength(idsResult.content[0]!.text, "utf8");
    const fullBytes = Buffer.byteLength(fullResult.content[0]!.text, "utf8");

    const idsParsed = parseJson(idsResult);
    expect(idsParsed["total_units"]).toBe(77);

    // The projection must cut payload size by at least an order of magnitude —
    // proves the SQL-layer fix (no markdown read) at the live-measured worst-case
    // unit count, without hardcoding an absolute ceiling that doesn't scale with
    // report size (that's what the fixed-count AC-3 test above already covers).
    expect(idsBytes).toBeLessThan(fullBytes / 10);
  });
});
