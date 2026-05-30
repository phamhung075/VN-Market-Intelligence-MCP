/**
 * MCP Tool: push_bctc_refined_unit — AC-MCP-OPTY-2
 *
 * Sprint BCTC-AGENTIC-REFINE (Option-Y, §0.7.4)
 * DDD layer: interface (write to infra via DB)
 *
 * Upserts one window's result into bctc_refined_units. Called by the host-level
 * fleet cron after each Haiku subagent completes its window refine.
 *
 * Idempotency: INSERT OR REPLACE on UNIQUE(report_id, unit_id) ensures re-run
 * with same data produces stable state (no duplicates — FPT-42-dupes guard).
 *
 * reset flag: when true, DELETE all prior units for the report BEFORE the first
 * push. The fleet cron passes reset=true on the first window of each cron run
 * to clean prior partial data.
 *
 * @module interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ── Row count helper ───────────────────────────────────────────────────────────

/**
 * Count pipe-table data rows in markdown (exclude header + separator rows).
 * Used to populate bctc_refined_units.row_count.
 */
function countTableRows(markdown: string): number {
  let count = 0;
  let pastSeparator = false;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^[-:\s]*$/.test(c))) {
      pastSeparator = true;
      continue;
    }
    if (pastSeparator) count++;
  }
  return count;
}

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().min(1).describe("Financial report ID"),
  unit_id: z.string().min(1).describe("Window unit ID (e.g. 'unit-0000')"),
  page_numbers: z.array(z.number().int().min(1)).min(1).describe("Page numbers in this window"),
  markdown: z.string().describe("Refined markdown output from the Haiku subagent"),
  confidence: z.number().min(0).max(1).describe("Confidence score 0.0-1.0"),
  flags: z.array(z.string()).describe("Flags from the subagent (e.g. ['timeout', 'agent_error:...'])"),
  window_status: z.enum(["DONE", "FAILED"]).describe("Window processing status"),
  reset: z
    .boolean()
    .optional()
    .describe("If true, DELETE all prior refined_units for this report before push (clean re-run)"),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export function buildPushBctcRefinedUnitHandler(
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

    const {
      report_id,
      unit_id,
      page_numbers,
      markdown,
      confidence,
      flags,
      window_status,
      reset,
    } = parsed.data;

    const db = dbOverride ?? getDb();

    try {
      // If reset=true: DELETE all prior units for this report (idempotent clean re-run)
      if (reset === true) {
        db.prepare("DELETE FROM bctc_refined_units WHERE report_id = ?").run(report_id);
        logger.info("[push_bctc_refined_unit] reset — deleted prior units", { report_id });
      }

      // Compute row_count from markdown
      const row_count = markdown ? countTableRows(markdown) : 0;

      // INSERT OR REPLACE — idempotent via UNIQUE(report_id, unit_id)
      db.prepare(
        `INSERT OR REPLACE INTO bctc_refined_units
           (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, window_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        report_id,
        unit_id,
        JSON.stringify(page_numbers),
        markdown,
        row_count,
        confidence,
        JSON.stringify(flags),
        window_status,
      );

      logger.info("[push_bctc_refined_unit] upserted", {
        report_id,
        unit_id,
        window_status,
        row_count,
        confidence,
        reset: reset ?? false,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, unit_id }),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[push_bctc_refined_unit] error", { report_id, unit_id, error: msg });
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

export function registerPushBctcRefinedUnitTool(server: McpServer): void {
  const handler = buildPushBctcRefinedUnitHandler();

  server.tool(
    "push_bctc_refined_unit",
    "Push one window's refined result into bctc_refined_units. " +
      "Called by the host-level fleet cron after each Haiku subagent completes. " +
      "Idempotent: INSERT OR REPLACE on UNIQUE(report_id, unit_id). " +
      "reset=true DELETEs all prior units for the report before the first push (clean re-run). " +
      "Output: { ok: true, unit_id } on success or { error: string } on failure.",
    {
      report_id: z.string().min(1).describe("Financial report ID"),
      unit_id: z.string().min(1).describe("Window unit ID (e.g. 'unit-0000')"),
      page_numbers: z.array(z.number().int().min(1)).min(1).describe("Page numbers in this window"),
      markdown: z.string().describe("Refined markdown output from the Haiku subagent"),
      confidence: z.number().min(0).max(1).describe("Confidence score 0.0-1.0"),
      flags: z.array(z.string()).describe("Flags from the subagent (e.g. ['timeout', 'agent_error:...'])"),
      window_status: z.enum(["DONE", "FAILED"]).describe("Window processing status"),
      reset: z
        .boolean()
        .optional()
        .describe("If true, DELETE all prior refined_units for this report before push"),
    },
    async (input) => {
      return handler(input);
    },
  );
}
