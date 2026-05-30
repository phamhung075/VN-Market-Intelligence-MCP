/**
 * MCP Tool: list_flagged_bctc_cells — HC-DEV-4 (#145)
 *
 * Sprint BCTC-HUMAN-CONFIRM
 * DDD layer: interface (thin wrapper — delegates to application service)
 *
 * Enumerates all red and yellow flagged BCTC cells for a report, including
 * OCR/image values and correction status. Returns empty flags list (not error)
 * when no flags are present (AC-FR8-2).
 *
 * Delegates entirely to bctcFlagEnumerationService.enumerateFlaggedCells —
 * same service used by HTTP GET /api/bctc-inspect/flags/{doc_id}.
 * Zero code duplication between HTTP and MCP paths.
 *
 * @module interface/mcp/tools/financial-reports/listFlaggedBctcCellsTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { enumerateFlaggedCells } from "../../../../application/usecases/bctcFlagEnumerationService.js";
import type { FlagEnumerationResult } from "../../../../application/usecases/bctcFlagEnumerationService.js";
import { logger } from "../../../../infrastructure/logger.js";

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().uuid("must be valid UUID").describe("Financial report UUID"),
});

export type ListFlaggedBctcCellsInput = z.infer<typeof InputSchema>;

// ── Handler (testable via dbOverride) ─────────────────────────────────────────

export function buildListFlaggedBctcCellsHandler(
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
      const result: FlagEnumerationResult = enumerateFlaggedCells(db, report_id);

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
      logger.warn("[list_flagged_bctc_cells] error", { error: msg, report_id });
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

export function registerListFlaggedBctcCellsTool(server: McpServer): void {
  const handler = buildListFlaggedBctcCellsHandler();

  server.tool(
    "list_flagged_bctc_cells",
    "Enumerate all red and yellow flagged BCTC cells for a report. " +
      "Returns OCR value, image value, current value, and correction status per cell. " +
      "Red flags have ocr_value and image_value populated (discrepancy detected). " +
      "Yellow flags have ocr_value and image_value null (low confidence). " +
      "Returns { flags: [] } (not error) when no flags exist (AC-FR8-2). " +
      "Returns reason: 'refine_not_complete' if refine_status not in DONE/PARTIAL. " +
      "Same data as HTTP GET /api/bctc-inspect/flags/{doc_id} — same service, zero duplication.",
    {
      report_id: z.string().uuid("must be valid UUID").describe("Financial report UUID"),
    },
    async (input) => {
      return handler(input);
    },
  );
}
