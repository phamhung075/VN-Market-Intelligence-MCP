/**
 * MCP Tool: get_bctc_pending_refine — AC-MCP-OPTY-1
 *
 * Sprint BCTC-AGENTIC-REFINE (Option-Y, §0.7.4)
 * DDD layer: interface (read-only fetch from infra)
 *
 * Returns financial reports where text_status='COMPLETE' AND refine_status IN
 * ('PENDING', 'PARTIAL'). Used by the host-level fleet cron to determine which
 * reports need refine processing. Read-only — always safe to re-run.
 *
 * Output: Array<{ id, filename, page_count, refine_status }> where:
 *   - filename: basename of pdf_path (the PDF filename without path)
 *   - page_count: max page_number from pdf_extracted_text for the report's
 *     filename (0 if no OCR pages found, which triggers fetch-all-pages logic
 *     in the fleet cron)
 *
 * @module interface/mcp/tools/financial-reports/getBctcPendingRefineTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { basename } from "node:path";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ── DB row type ───────────────────────────────────────────────────────────────

interface PendingRefineRow {
  id: string;
  pdf_path: string | null;
  refine_status: string;
}

// ── Output types ──────────────────────────────────────────────────────────────

interface PendingRefineReport {
  id: string;
  filename: string;
  page_count: number;
  refine_status: string;
}

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum reports to return (default: no limit, max 100)"),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export function buildGetBctcPendingRefineHandler(
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

    const { limit } = parsed.data;
    const db = dbOverride ?? getDb();

    try {
      // Build query with optional LIMIT
      const limitClause = limit ? `LIMIT ${limit}` : "";
      const rows = db
        .prepare<PendingRefineRow, []>(
          `SELECT id, pdf_path, refine_status
           FROM financial_reports
           WHERE text_status = 'COMPLETE'
             AND refine_status IN ('PENDING', 'PARTIAL')
           ORDER BY parsed_at ASC
           ${limitClause}`,
        )
        .all();

      const reports: PendingRefineReport[] = rows.map((row) => {
        // Derive filename from pdf_path (basename)
        const filename = row.pdf_path ? basename(row.pdf_path) : "";

        // Derive page_count from pdf_extracted_text (max page_number for this filename)
        let page_count = 0;
        if (filename) {
          try {
            const pageRow = db
              .prepare<{ max_page: number | null }, [string]>(
                "SELECT MAX(page_number) as max_page FROM pdf_extracted_text WHERE filename = ?",
              )
              .get(filename);
            page_count = pageRow?.max_page ?? 0;
          } catch {
            page_count = 0;
          }
        }

        return {
          id: row.id,
          filename,
          page_count,
          refine_status: row.refine_status,
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(reports, null, 2),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[get_bctc_pending_refine] error", { error: msg });
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

export function registerGetBctcPendingRefineTool(server: McpServer): void {
  const handler = buildGetBctcPendingRefineHandler();

  server.tool(
    "get_bctc_pending_refine",
    "Return financial reports pending agentic refine processing. " +
      "Queries financial_reports WHERE text_status='COMPLETE' AND refine_status IN ('PENDING','PARTIAL'). " +
      "Output: Array<{ id, filename, page_count, refine_status }> ordered by parsed_at ASC. " +
      "filename = basename(pdf_path). page_count = max page from pdf_extracted_text (0 if unknown). " +
      "Used by the host-level fleet cron to determine which reports need refine. " +
      "Read-only — idempotent, safe to re-run. " +
      "Optional limit parameter caps results (default: all pending, max 100).",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum reports to return (omit for all pending, max 100)"),
    },
    async (input) => {
      return handler(input);
    },
  );
}
