/**
 * MCP Tool: get_bctc_refined — FR-11
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: interface (read-only, no DB writes)
 *
 * Returns all refined markdown units for a given report_id from bctc_refined_units.
 * Used by bctc-analyst narrative passes to access agent-refined structured content.
 *
 * FIX-GET-BCTC-REFINED-NO-PROJECTION-PARAM (2026-08-06): `fields` optional argument
 * ('ids' | 'full', default 'full' — existing callers unaffected). refine_bctc_md's
 * Phase 0 resume step only needs a skip-set of already-pushed unit_ids; before this
 * fix it paid the full SELECT (every column, including `markdown`) for every prior
 * unit on every resume fire, monotonically growing with each completed chunk
 * (measured worst case: report b061d92b = 77 units / 103,606 markdown bytes, ~30k
 * tokens returned to a caller that only wanted a list of ids). `fields:"ids"` skips
 * `markdown`/`page_numbers_json`/`flags`/`confidence`/`refined_at` at the SQL layer
 * (not just at the response-shaping layer) and returns
 * `{ report_id, total_units, units:[{unit_id, window_status}] }` — including an
 * empty `units: []` when the report has zero pushed units yet (a valid resume state,
 * not an error — the `full` path's `{error: ...}` empty-set behavior is unchanged).
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

/** Narrow row shape for the `fields:"ids"` projection — no markdown, no page_numbers_json. */
interface RefinedUnitIdRow {
  unit_id: string;
  window_status: string;
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

/** `fields:"ids"` projection output — no markdown, always structured (never the `full`-path error shape). */
interface RefinedIdsOutput {
  report_id: string;
  total_units: number;
  units: Array<{ unit_id: string; window_status: string }>;
}

interface RefinedError {
  error: string;
}

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().min(1).describe("Financial report ID"),
  fields: z
    .enum(["ids", "full"])
    .optional()
    .default("full")
    .describe(
      "Projection: 'full' (default, unchanged) returns every column including markdown — " +
        "required by bctc-analyst narrative passes and the ESC-5 confidence gate. " +
        "'ids' returns only { report_id, total_units, units:[{unit_id, window_status}] } " +
        "(no markdown read from DB) — for refine_bctc_md's resume skip-set build.",
    ),
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

    const { report_id, fields } = parsed.data;
    const db = dbOverride ?? getDb();

    try {
      // FIX-GET-BCTC-REFINED-NO-PROJECTION-PARAM: `ids` projection never touches the
      // `markdown`/`page_numbers_json`/`flags`/`confidence`/`refined_at` columns at the
      // SQL layer — the read cost this fix removes is at SELECT time, not just at
      // response-shaping time. Always returns the structured shape (never the `full`
      // path's `{error: ...}` empty-set shape) — an empty `units: []` is a valid resume
      // state (fresh report, zero chunks pushed yet), not an error.
      if (fields === "ids") {
        const idRows = db
          .prepare<RefinedUnitIdRow, [string]>(
            `SELECT unit_id, window_status
             FROM bctc_refined_units
             WHERE report_id = ?
             ORDER BY unit_id ASC`,
          )
          .all(report_id);

        const idsOutput: RefinedIdsOutput = {
          report_id,
          total_units: idRows.length,
          units: idRows.map((row) => ({ unit_id: row.unit_id, window_status: row.window_status })),
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(idsOutput, null, 2) }] };
      }

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
    "Return refined units for a BCTC report from bctc_refined_units. " +
      "Default (fields='full', unchanged): { report_id, units: Array<{ unit_id, page_numbers, markdown, flags, confidence, window_status }>, total_units } " +
      "or { error: string } when no refined units exist. Required by bctc-analyst narrative passes and " +
      "the ESC-5 gate (confidence < 0.50 triggers deep-dive-opus) — do not use fields='ids' for these callers. " +
      "fields='ids': { report_id, total_units, units: Array<{ unit_id, window_status }> } — no markdown read from " +
      "DB or returned, always the structured shape (empty units: [] when the report has zero pushed units yet, " +
      "never the 'full' path's error shape). Built for refine_bctc_md's resume skip-set build " +
      "(FIX-GET-BCTC-REFINED-NO-PROJECTION-PARAM) — bounds the read that previously grew with every pushed chunk.",
    {
      report_id: z
        .string()
        .min(1)
        .describe("Financial report ID from financial_reports.id"),
      fields: z
        .enum(["ids", "full"])
        .optional()
        .default("full")
        .describe(
          "Projection: 'full' (default) returns markdown + all columns (bctc-analyst/ESC-5 gate). " +
            "'ids' returns only { report_id, total_units, units:[{unit_id, window_status}] } for resume skip-set building.",
        ),
    },
    async ({ report_id, fields }) => {
      return handler({ report_id, fields });
    },
  );
}
