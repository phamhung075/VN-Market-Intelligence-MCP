/**
 * MCP Tool: get_bctc_refined — FR-11
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: interface (read-only, no DB writes)
 *
 * Returns all refined markdown units for a given report_id from bctc_refined_units.
 * Used by bctc-analyst narrative passes to access agent-refined structured content.
 *
 * @module interface/mcp/tools/financial-reports/getBctcRefinedTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ── DB row type ───────────────────────────────────────────────────────────────

interface RefinedUnitRow {
  unit_id: string;
  page_numbers_json: string;
  markdown: string;
  flags: string | null;
  confidence: number;
  window_status: string;
  refined_at: string;
}

// ── Output types ──────────────────────────────────────────────────────────────

interface RefinedUnit {
  unit_id: string;
  page_numbers: number[];
  markdown: string;
  flags: string[];
  confidence: number;
  window_status: string;
  refined_at: string;
}

interface RefinedOutput {
  units: RefinedUnit[];
  report_id: string;
  total_units: number;
}

interface RefinedError {
  error: string;
}

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().min(1).describe("Financial report ID"),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export function buildGetBctcRefinedHandler(
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

    const { report_id } = parsed.data;
    const db = dbOverride ?? getDb();

    try {
      const rows = db
        .prepare<RefinedUnitRow, [string]>(
          `SELECT unit_id, page_numbers_json, markdown, flags, confidence, window_status, refined_at
           FROM bctc_refined_units
           WHERE report_id = ?
           ORDER BY unit_id ASC`,
        )
        .all(report_id);

      if (rows.length === 0) {
        const err: RefinedError = {
          error: `no refined units found for report_id: ${report_id}`,
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(err) }] };
      }

      const units: RefinedUnit[] = rows.map((row) => ({
        unit_id: row.unit_id,
        page_numbers: (() => {
          try {
            return JSON.parse(row.page_numbers_json) as number[];
          } catch {
            return [];
          }
        })(),
        markdown: row.markdown,
        flags: (() => {
          if (!row.flags) return [];
          try {
            return JSON.parse(row.flags) as string[];
          } catch {
            return [row.flags];
          }
        })(),
        confidence: row.confidence,
        window_status: row.window_status,
        refined_at: row.refined_at,
      }));

      const output: RefinedOutput = {
        report_id,
        units,
        total_units: units.length,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[get_bctc_refined] error", { report_id, error: msg });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: msg }),
          },
        ],
      };
    }
  };
}

// ── MCP tool registration ─────────────────────────────────────────────────────

export function registerGetBctcRefinedTool(server: McpServer): void {
  const handler = buildGetBctcRefinedHandler();

  server.tool(
    "get_bctc_refined",
    "Return all refined markdown units for a BCTC report from bctc_refined_units. " +
      "Output: { report_id, units: Array<{ unit_id, page_numbers, markdown, flags, confidence, window_status }>, total_units } " +
      "or { error: string } when no refined units exist. " +
      "Used by bctc-analyst narrative passes and ESC-5 gate (confidence < 0.50 triggers deep-dive-opus).",
    {
      report_id: z
        .string()
        .min(1)
        .describe("Financial report ID from financial_reports.id"),
    },
    async ({ report_id }) => {
      return handler({ report_id });
    },
  );
}
