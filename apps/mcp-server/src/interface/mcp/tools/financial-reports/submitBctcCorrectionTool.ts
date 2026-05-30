/**
 * MCP Tool: submit_bctc_correction — HC-DEV-4 (#146)
 *
 * Sprint BCTC-HUMAN-CONFIRM
 * DDD layer: interface (thin wrapper — delegates to application service)
 *
 * Submits a human-confirmed correction for a flagged BCTC cell.
 * Persists the correction to bctc_human_corrections, updates
 * bctc_table_rows.value_current and source_confidence = 1.0 atomically.
 *
 * Delegates entirely to bctcCorrectionService.submitCorrection —
 * the SAME service used by HTTP POST /api/bctc-inspect/correct/{doc_id}.
 * Single source of correctness: HTTP and MCP paths both flow through the
 * application service. Zero code duplication.
 *
 * @module interface/mcp/tools/financial-reports/submitBctcCorrectionTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { submitCorrection } from "../../../../application/usecases/bctcCorrectionService.js";
import type { CorrectionResult } from "../../../../application/usecases/bctcCorrectionService.js";
import { logger } from "../../../../infrastructure/logger.js";

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().uuid("must be valid UUID").describe("Financial report UUID"),
  row_id: z.number().int("must be integer").describe("bctc_table_rows.id — the row to correct"),
  new_value: z.number().describe("The corrected numeric value"),
  correction_source: z
    .string()
    .optional()
    .default("human_ui")
    .describe("Source of correction (default: 'human_ui')"),
});

export type SubmitBctcCorrectionInput = z.infer<typeof InputSchema>;

// ── Handler (testable via dbOverride) ─────────────────────────────────────────

export function buildSubmitBctcCorrectionHandler(
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

    const { report_id, row_id, new_value, correction_source } = parsed.data;
    const db = dbOverride ?? getDb();

    try {
      const result: CorrectionResult = submitCorrection(db, {
        report_id,
        row_id,
        new_value,
        correction_source,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[submit_bctc_correction] error", { error: msg, report_id, row_id });
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

export function registerSubmitBctcCorrectionTool(server: McpServer): void {
  const handler = buildSubmitBctcCorrectionHandler();

  server.tool(
    "submit_bctc_correction",
    "Submit a human-confirmed correction for a flagged BCTC cell. " +
      "Updates bctc_table_rows.value_current and source_confidence = 1.0 atomically. " +
      "Writes an audit record to bctc_human_corrections. " +
      "Returns 409 (ok: false, error: 'report_confirmed') if report is already CONFIRMED. " +
      "Returns 400 (ok: false, error: 'row_not_found') if row_id does not belong to report_id. " +
      "Idempotent: correcting the same cell multiple times replaces the previous correction. " +
      "Same write path as HTTP POST /api/bctc-inspect/correct/{doc_id} — same service, zero duplication.",
    {
      report_id: z.string().uuid("must be valid UUID").describe("Financial report UUID"),
      row_id: z.number().int("must be integer").describe("bctc_table_rows.id — the row to correct"),
      new_value: z.number().describe("The corrected numeric value"),
      correction_source: z
        .string()
        .optional()
        .default("human_ui")
        .describe("Source of correction (default: 'human_ui')"),
    },
    async (input) => {
      return handler(input);
    },
  );
}
