/**
 * MCP Tool: get_bctc_pending_refine — AC-MCP-OPTY-1
 *
 * Sprint BCTC-AGENTIC-REFINE (Option-Y, §0.7.4)
 * DDD layer: interface (read-only fetch from infra; window computation via application utils)
 *
 * Returns financial reports where text_status='COMPLETE' AND refine_status IN
 * ('PENDING', 'PARTIAL', 'FAILED') AND confirm_status != 'CONFIRMED'. Used by the
 * host-level fleet cron to determine which reports need refine processing. Read-only
 * — always safe to re-run.
 *
 * FAILED is included so the fleet cron can retry reports that previously failed
 * (e.g. due to Option-Y no-spawn path before the fleet cron was operational).
 * The refine_bctc_md flow sets reset=true on the first push, clearing prior FAILED
 * units before re-processing.
 *
 * Output: Array<{ id, filename, page_count, text_status, confirm_status, refine_status, windows[] }>
 *   - filename:       basename of pdf_path (the PDF filename without path)
 *   - page_count:     max page_number from pdf_extracted_text for the report's
 *                     filename (0 if no OCR pages found)
 *   - text_status:    value from financial_reports.text_status (always 'COMPLETE'
 *                     for returned rows, exposed for Phase 0 readiness guard in flow)
 *   - confirm_status: value from financial_reports.confirm_status (null or non-CONFIRMED
 *                     for returned rows; exposed for belt-and-suspenders guard in flow)
 *   - windows:        pre-partitioned window list (server-side), each entry:
 *                     { unit_id, page_numbers, page_type, needs_image }
 *                     Empty array if page texts unavailable (flow L71 gate handles this).
 *
 * @module interface/mcp/tools/financial-reports/getBctcPendingRefineTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { basename } from "node:path";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import { partitionIntoWindows } from "../../../../application/utils/windowPartitioner.js";
import { fetchAllPageTexts, type FetchPageTextsDeps } from "../../../../scheduler/financial-reports/bctcRefineJob.js";

// ── Constants (single SSOT — read from same env var as bctcRefineJob) ─────────

const REFINE_MAX_WINDOW_PAGES = parseInt(Bun.env.REFINE_MAX_WINDOW_PAGES ?? "3", 10);

// ── DB row type ───────────────────────────────────────────────────────────────

interface PendingRefineRow {
  id: string;
  pdf_path: string | null;
  refine_status: string;
  text_status: string;
  confirm_status: string | null;
}

// ── Output types ──────────────────────────────────────────────────────────────

/** A single window entry as consumed by the refine_bctc_md orchestrator flow. */
export interface RefineWindow {
  unit_id: string;
  page_numbers: number[];
  /** Derived from window content: multi-page → "continuation", needsImage → "table", else "prose" */
  page_type: "table" | "prose" | "continuation";
  /** True if any page in the window requires image loading (classifyPageForImageLoad). */
  needs_image: boolean;
}

export interface PendingRefineReport {
  id: string;
  filename: string;
  page_count: number;
  refine_status: string;
  text_status: string;
  confirm_status: string | null;
  windows: RefineWindow[];
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

/**
 * Dep-injectable handler builder.
 *
 * @param dbOverride        Optional in-memory Database for tests.
 * @param fetchPageTextsDeps  Optional dep injection for fetchAllPageTexts (avoids HTTP in tests).
 */
export function buildGetBctcPendingRefineHandler(
  dbOverride?: ReturnType<typeof getDb>,
  fetchPageTextsDeps?: FetchPageTextsDeps,
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
          `SELECT id, pdf_path, refine_status, text_status, confirm_status
           FROM financial_reports
           WHERE text_status = 'COMPLETE'
             AND refine_status IN ('PENDING', 'PARTIAL', 'FAILED')
             AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
           ORDER BY parsed_at ASC
           ${limitClause}`,
        )
        .all();

      const reports: PendingRefineReport[] = await Promise.all(
        rows.map(async (row) => {
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

          // Fetch page texts and partition into windows (server-side, per §0.7.4)
          // Empty page texts → windows: [] (flow L71 gate handles this gracefully)
          let windows: RefineWindow[] = [];
          if (filename) {
            try {
              // Production path: pass db so fetchAllPageTexts uses DB-driven page list
              // (avoids HTTP round-trips to pdf-extractor:5001).
              // Test injection: when fetchPageTextsDeps contains getPageTextFn (but no
              // explicit db override), omit db so Path A (legacy sequential probe) runs,
              // keeping existing tests hermetic and green.
              const mergedDeps =
                fetchPageTextsDeps?.getPageTextFn && !fetchPageTextsDeps?.db
                  ? fetchPageTextsDeps
                  : { db, ...(fetchPageTextsDeps ?? {}) };
              const pageTexts = await fetchAllPageTexts(row.id, filename, mergedDeps);
              if (pageTexts.length > 0) {
                const rawWindows = partitionIntoWindows(pageTexts, {
                  maxWindowPages: REFINE_MAX_WINDOW_PAGES,
                });

                windows = rawWindows.map((w) => {
                  const needsImage = w.needsImage.some(Boolean);
                  let page_type: RefineWindow["page_type"];
                  if (w.page_numbers.length > 1) {
                    page_type = "continuation";
                  } else if (needsImage) {
                    page_type = "table";
                  } else {
                    page_type = "prose";
                  }
                  return {
                    unit_id: w.unit_id,
                    page_numbers: w.page_numbers,
                    page_type,
                    needs_image: needsImage,
                  };
                });
              }
            } catch (err) {
              logger.warn("[get_bctc_pending_refine] window partition failed — returning empty windows", {
                reportId: row.id,
                error: err instanceof Error ? err.message : String(err),
              });
              windows = [];
            }
          }

          return {
            id: row.id,
            filename,
            page_count,
            refine_status: row.refine_status,
            text_status: row.text_status,
            confirm_status: row.confirm_status ?? null,
            windows,
          };
        }),
      );

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
    "Return financial reports pending agentic refine processing, with pre-partitioned windows. " +
      "Queries financial_reports WHERE text_status='COMPLETE' AND refine_status IN ('PENDING','PARTIAL','FAILED') " +
      "AND confirm_status != 'CONFIRMED'. " +
      "FAILED reports are included so the fleet cron can retry them (e.g. Option-Y legacy failures). " +
      "Output: Array<{ id, filename, page_count, text_status, confirm_status, refine_status, windows[] }> " +
      "ordered by parsed_at ASC. " +
      "filename = basename(pdf_path). page_count = max page from pdf_extracted_text (0 if unknown). " +
      "text_status always 'COMPLETE' for returned rows (Phase 0 readiness guard). " +
      "confirm_status is null or non-CONFIRMED (Phase 0 belt-and-suspenders guard). " +
      "windows[] is the server-side pre-partitioned list; each entry: " +
      "{ unit_id, page_numbers, page_type ('table'|'prose'|'continuation'), needs_image }. " +
      "windows is [] if page texts are unavailable (flow handles gracefully). " +
      "Used by the host-level fleet cron (refine_bctc_md flow). " +
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
