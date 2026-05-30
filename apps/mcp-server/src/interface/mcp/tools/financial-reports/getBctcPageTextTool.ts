/**
 * MCP Tool: get_bctc_page_text — FR-3
 *
 * Sprint BCTC-AGENTIC-REFINE
 * DDD layer: interface (zero DB writes, read-only query + HTTP delegation)
 *
 * Returns OCR text for a single page of a BCTC financial report.
 * Chain: report_id → filename (financial_reports) → GET /api/page-text (pdf-extractor).
 *
 * @module interface/mcp/tools/financial-reports/getBctcPageTextTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { basename } from "node:path";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { getPageText } from "../../../../infrastructure/fetchers/pdfExtractorClient.js";
import { logger } from "../../../../infrastructure/logger.js";

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  report_id: z.string().min(1).describe("Financial report ID (financial_reports.id)"),
  page_number: z
    .number()
    .int()
    .min(1)
    .describe("1-indexed page number to retrieve OCR text for"),
});

// ── Output types ──────────────────────────────────────────────────────────────

interface PageTextResult {
  text: string;
  source: "sqlite_ocr" | "mistral_ocr";
}

interface PageTextError {
  error: string;
}

export type GetBctcPageTextOutput = PageTextResult | PageTextError;

// ── Handler (testable with injected DB) ───────────────────────────────────────

export function buildGetBctcPageTextHandler(
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

    const { report_id, page_number } = parsed.data;
    const db = dbOverride ?? getDb();

    try {
      // Resolve report_id → pdf_path → filename (basename)
      const row = db
        .prepare<{ pdf_path: string | null }, [string]>(
          "SELECT pdf_path FROM financial_reports WHERE id = ? LIMIT 1",
        )
        .get(report_id);

      if (!row) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `report_id not found: ${report_id}` }),
            },
          ],
        };
      }

      if (!row.pdf_path) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `no pdf_path for report_id: ${report_id}` }),
            },
          ],
        };
      }

      const filename = basename(row.pdf_path);

      // Delegate to pdf-extractor
      const result = await getPageText(filename, page_number);

      if (!result) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "page_text_not_found", report_id, page_number }),
            },
          ],
        };
      }

      const output: PageTextResult = {
        text: result.text,
        source: result.source,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[get_bctc_page_text] error", { report_id, page_number, error: msg });
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

export function registerGetBctcPageTextTool(server: McpServer): void {
  const handler = buildGetBctcPageTextHandler();

  server.tool(
    "get_bctc_page_text",
    "Return OCR text for a specific page of a BCTC financial report. " +
      "Resolves report_id to filename via financial_reports table, then calls " +
      "pdf-extractor /api/page-text. " +
      "Output: { text: string, source: 'sqlite_ocr' | 'mistral_ocr' } or { error: string }. " +
      "Used by the refine orchestrator (Phase 1 window partition) and by refine_bctc_md subagents.",
    {
      report_id: z
        .string()
        .min(1)
        .describe("Financial report ID from financial_reports.id"),
      page_number: z
        .number()
        .int()
        .min(1)
        .describe("1-indexed page number"),
    },
    async ({ report_id, page_number }) => {
      return handler({ report_id, page_number });
    },
  );
}
