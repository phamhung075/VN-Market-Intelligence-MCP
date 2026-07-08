/**
 * MCP Tool: finalize_bctc_refine — AC-MCP-OPTY-3
 *
 * Sprint BCTC-AGENTIC-REFINE (Option-Y, §0.7.4)
 * DDD layer: interface (thin orchestration — FACTORY-INTERFACE-extract-finalizeBctc-usecase)
 *
 * Phase 4 collect-then-write: called by the fleet cron ONCE after all
 * push_bctc_refined_unit calls complete for a report.
 *
 * This file owns ONLY: the Zod input schema, the `server.tool` registration,
 * and a thin orchestration call into the application-layer use case. All
 * business logic (parse/insert transaction, DT-2..4/BEQ-7 guards, BLOCK-1..5
 * scalar/ratio/validation/confidence/eval recompute) lives in
 * `application/usecases/finalizeBctcRefine/` — see finalizeBctcRefine.ts for
 * the full step-by-step doc. This split is a pure relocation: every response
 * shape below is byte-identical to the original inline implementation.
 *
 * @module interface/mcp/tools/financial-reports/finalizeBctcRefineTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import {
  runFinalizeBctcRefine,
  resolveSourceConfidence,
} from "../../../../application/usecases/finalizeBctcRefine/finalizeBctcRefine.js";

// Re-exported for backward compatibility — existing tests import
// `resolveSourceConfidence` directly from this interface path.
export { resolveSourceConfidence };

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().min(1).describe("Financial report ID"),
  report_status: z
    .enum(["DONE", "PARTIAL", "FAILED"])
    .describe("Report-level status determined by the fleet cron after aggregating window results"),
});

// ── Handler (thin orchestration) ──────────────────────────────────────────────

export function buildFinalizeBctcRefineHandler(
  dbOverride?: ReturnType<typeof getDb>,
): (input: z.input<typeof InputSchema>) => Promise<{ content: [{ type: "text"; text: string }] }> {
  return async (rawInput) => {
    const parsed = InputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "validation_error", details: parsed.error.issues }),
          },
        ],
      };
    }

    const db = dbOverride ?? getDb();
    const result = await runFinalizeBctcRefine(db, parsed.data.report_id, parsed.data.report_status);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
    };
  };
}

// ── MCP tool registration ─────────────────────────────────────────────────────

export function registerFinalizeBctcRefineTool(server: McpServer): void {
  const handler = buildFinalizeBctcRefineHandler();

  server.tool(
    "finalize_bctc_refine",
    "Phase 4 collect-then-write: called by fleet cron after all push_bctc_refined_unit calls complete. " +
      "Atomically: DELETE bctc_table_rows for report → parse all DONE windows via refinedMarkdownParser → " +
      "INSERT rows → UPDATE financial_reports.refine_status. " +
      "FAILED windows contribute NO rows (isolation invariant). " +
      "report_status must be determined by the caller (DONE/PARTIAL/FAILED) based on window aggregation. " +
      "BEQ-7 server-side guard: if caller supplies DONE but parsed rows are section-incomplete, " +
      "effective status is overridden to PARTIAL (server owns completeness invariant). " +
      "Output: { ok: true, rows_parsed: number, effective_status: 'DONE'|'PARTIAL'|'FAILED', " +
      "beg7_override: boolean } — beg7_override=true when BEQ-7 fired. " +
      "Response is additive; callers reading only ok+rows_parsed continue to work unchanged. " +
      "Error: { error: string }.",
    {
      report_id: z.string().min(1).describe("Financial report ID"),
      report_status: z
        .enum(["DONE", "PARTIAL", "FAILED"])
        .describe("Report-level status: DONE (all windows OK), PARTIAL (some failed), FAILED (all failed)"),
    },
    async (input) => {
      return handler(input);
    },
  );
}
