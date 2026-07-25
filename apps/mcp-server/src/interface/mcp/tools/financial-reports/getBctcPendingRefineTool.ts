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
 * FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW: a FAILED report is excluded once
 * it has ZERO remaining (non-DONE/non-FAILED) bctc_refined_units windows — there is
 * no work left to retry, and leaving it in the queue head-of-line-blocks every
 * genuinely-pending report behind it (ORDER BY parsed_at ASC). FAILED reports that
 * still have remaining windows stay in the queue and are retried as before.
 *
 * Paginated (FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW): `limit` defaults to
 * DEFAULT_LIMIT (20, max MAX_LIMIT=100) so the inline JSON payload never overflows
 * the MCP response limit. `offset` pages through the full queue: offset=0, then
 * offset += limit each call, until a call returns fewer than `limit` rows. Both
 * are ignored when `report_id` is supplied (single-row fetch).
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

// FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW: bound the inline MCP payload.
// Mirrors the DEFAULT_LIMIT/MAX_LIMIT clamped-limit convention already used across
// this codebase's large-output list endpoints (e.g. foreignFlowHandler.ts,
// marketSummaryHandler.ts, predictionClaimsHandler.ts, agmPlanActualHandler.ts) —
// no new pagination convention invented. Paired with `offset` (native SQL
// LIMIT/OFFSET, same mechanism the query already used for `limit`) so ALL
// pending-refine rows remain reachable by paging (offset += limit) even though a
// single unbounded call is no longer served. Previously an omitted `limit` meant
// NO SQL LIMIT clause at all — unbounded rows × pre-partitioned windows[] per row
// is what produced the 235K-char inline overflow (bridge file-path fallback).
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
    .coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    // NOTE: `.optional().default(N)` — order matters. `.default(N).optional()` would
    // let `undefined` pass straight through ZodOptional without ever reaching the
    // default (verified live: z.number().default(20).optional().parse(undefined)
    // -> undefined). `.optional().default(N)` is the correct order: ZodDefault
    // intercepts `undefined` first and substitutes DEFAULT_LIMIT.
    .optional()
    .default(DEFAULT_LIMIT)
    .describe(`Max reports per page (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}). Pair with offset to page through all pending rows.`),
  offset: z
    .coerce
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Row offset for pagination (default 0). Page through all rows: offset=0, then offset+=limit until fewer than `limit` rows are returned."),
  ticker: z
    .string()
    .optional()
    .describe("Filter by ticker symbol (action_code). Ignored when report_id is supplied."),
  report_id: z
    .string()
    .optional()
    .describe(
      "Fetch a specific report by ID (returns array of 0 or 1). " +
        "Takes precedence over ticker. " +
        "RF-3: bypasses text_status/refine_status queue-eligibility filters — intentional for force-re-verify; " +
        "confirm_status guard (CONFIRMED exclusion) is still enforced.",
    ),
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

    const { limit, offset, ticker, report_id } = parsed.data;
    const db = dbOverride ?? getDb();

    try {
      // Build query based on supplied parameters.
      //
      // Branch 1 — report_id supplied:
      //   Fetch the single report by primary key. Skips text_status / refine_status
      //   queue-eligibility filters (RF-3: intentional — caller knows exactly which report
      //   they want; enables force-re-verify on any status). confirm_status guard is retained.
      //
      // Branch 2 — ticker supplied (no report_id):
      //   Standard queue query + AND action_code = ? filter.
      //
      // Branch 3 — default (no ticker, no report_id):
      //   Standard queue query unchanged.
      //   FIX-FINALIZE-STATUS-STUCK-PARTIAL (Fix A):
      //   Exclude PARTIAL reports where ALL bctc_refined_units rows are window_status='DONE'
      //   AND at least one unit exists. These are data-quality PARTIALs (BEQ-7 section guard
      //   fired at finalize but all windows are processed) — there is no refine work remaining.
      //   Index: idx_bctc_refined_units_report_status (report_id, window_status) — O(log n).

      let rows: PendingRefineRow[];

      if (report_id !== undefined) {
        // Branch 1: direct fetch by report_id — bypasses queue-eligibility filters (RF-3)
        rows = db
          .prepare<PendingRefineRow, [string]>(
            `SELECT id, pdf_path, refine_status, text_status, confirm_status
             FROM financial_reports
             WHERE id = ?
               AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')`,
          )
          .all(report_id);
      } else if (ticker !== undefined) {
        // Branch 2: ticker-filtered queue query
        // `limit` always defined (zod default DEFAULT_LIMIT) — LIMIT/OFFSET is the
        // native SQL pagination pair; paging offset += limit reaches every row.
        // FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW: exclusion extended from
        // PARTIAL-only to PARTIAL|FAILED — see Branch 3 comment below for rationale.
        const limitClause = `LIMIT ${limit} OFFSET ${offset}`;
        rows = db
          .prepare<PendingRefineRow, [string]>(
            `SELECT id, pdf_path, refine_status, text_status, confirm_status
             FROM financial_reports
             WHERE text_status = 'COMPLETE'
               AND refine_status IN ('PENDING', 'PARTIAL', 'FAILED')
               AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
               AND NOT (
                 refine_status IN ('PARTIAL', 'FAILED')
                 AND (
                   SELECT COUNT(*) FROM bctc_refined_units u
                   WHERE u.report_id = financial_reports.id
                     AND u.window_status NOT IN ('DONE', 'FAILED')
                 ) = 0
                 AND (
                   SELECT COUNT(*) FROM bctc_refined_units u
                   WHERE u.report_id = financial_reports.id
                 ) > 0
               )
               AND action_code = ?
             ORDER BY parsed_at ASC
             ${limitClause}`,
          )
          .all(ticker);
      } else {
        // Branch 3: default queue query
        // FIX-REFINE-QUEUE-TERMINAL-FAILED-UNIT-HEADPOISON:
        // Extend Fix-A exclusion: PARTIAL reports where ALL bctc_refined_units rows are
        // window_status IN ('DONE','FAILED') AND at least one unit exists are excluded —
        // no refinable work remains (DONE=processed, FAILED=terminal for this run).
        // REJECTED_SANITY is NOT in the exclusion set — those docs stay visible for investigation.
        //
        // FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW (PO-ratified option b):
        // The same exclusion now ALSO applies when refine_status='FAILED' (whole-report
        // terminal failure), not only 'PARTIAL'. Without this, a report that finalized
        // FAILED with zero remaining (non-DONE/FAILED) windows sat at the head of the
        // ORDER BY parsed_at ASC queue forever — every fleet-cron fire re-picked it,
        // found an empty remaining-window set, and exited as a silent no-op, starving
        // every genuinely-PENDING report behind it. A FAILED report that STILL has
        // remaining (non-terminal) windows is NOT excluded — it stays retryable, which
        // is the whole reason FAILED is in the IN(...) allowlist above (see module
        // docstring). Zero-unit FAILED reports (units not pushed yet) also stay
        // eligible — same "at least one unit exists" guard as the PARTIAL case.
        // Index: idx_bctc_refined_units_report_status (report_id, window_status) — O(log n).
        // `limit` always defined (zod default DEFAULT_LIMIT) — LIMIT/OFFSET is the
        // native SQL pagination pair; paging offset += limit reaches every row.
        const limitClause = `LIMIT ${limit} OFFSET ${offset}`;
        rows = db
          .prepare<PendingRefineRow, []>(
            `SELECT id, pdf_path, refine_status, text_status, confirm_status
             FROM financial_reports
             WHERE text_status = 'COMPLETE'
               AND refine_status IN ('PENDING', 'PARTIAL', 'FAILED')
               AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
               AND NOT (
                 refine_status IN ('PARTIAL', 'FAILED')
                 AND (
                   SELECT COUNT(*) FROM bctc_refined_units u
                   WHERE u.report_id = financial_reports.id
                     AND u.window_status NOT IN ('DONE', 'FAILED')
                 ) = 0
                 AND (
                   SELECT COUNT(*) FROM bctc_refined_units u
                   WHERE u.report_id = financial_reports.id
                 ) > 0
               )
             ORDER BY parsed_at ASC
             ${limitClause}`,
          )
          .all();
      }

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
      "Default: queries financial_reports WHERE text_status='COMPLETE' AND refine_status IN ('PENDING','PARTIAL','FAILED') " +
      "AND confirm_status != 'CONFIRMED'. " +
      "PARTIAL or FAILED reports where ALL bctc_refined_units rows are window_status IN ('DONE','FAILED') are excluded — " +
      "these have no refinable work remaining (DONE=processed, FAILED=terminal for this run; " +
      "REJECTED_SANITY units keep the doc visible for investigation; zero-unit reports stay eligible). " +
      "FAILED reports (whole-report refine_status='FAILED', not unit-level) are included so the fleet cron can retry them, " +
      "as long as at least one window is still unprocessed (see exclusion above). " +
      "Optional ticker parameter (action_code) filters results to a specific stock. " +
      "Optional report_id parameter fetches one specific report by primary key regardless of queue status " +
      "(bypasses text_status/refine_status filters — intentional for force-re-verify; confirm_status guard retained). " +
      "report_id takes precedence over ticker when both are supplied. " +
      "Output: Array<{ id, filename, page_count, text_status, confirm_status, refine_status, windows[] }> " +
      "ordered by parsed_at ASC. " +
      "filename = basename(pdf_path). page_count = max page from pdf_extracted_text (0 if unknown). " +
      "text_status always 'COMPLETE' for default/ticker rows (Phase 0 readiness guard). " +
      "confirm_status is null or non-CONFIRMED for all branches (Phase 0 belt-and-suspenders guard). " +
      "windows[] is the server-side pre-partitioned list; each entry: " +
      "{ unit_id, page_numbers, page_type ('table'|'prose'|'continuation'), needs_image }. " +
      "windows is [] if page texts are unavailable (flow handles gracefully). " +
      "Used by the host-level fleet cron (refine_bctc_md flow). " +
      "Read-only — idempotent, safe to re-run. " +
      `Paginated (FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW): limit defaults to ${DEFAULT_LIMIT} (max ${MAX_LIMIT}) so the ` +
      "inline payload never overflows the MCP response limit. Page through ALL pending rows with offset: " +
      "call with offset=0, then offset += limit on each subsequent call, until a call returns fewer than `limit` " +
      "rows (that page is the last one — no rows are skipped or lost). limit/offset are ignored when report_id is supplied.",
    {
      limit: z
        .coerce
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .optional()
        .default(DEFAULT_LIMIT)
        .describe(`Max reports per page (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}). Pair with offset to page through all pending rows. Ignored when report_id is supplied.`),
      offset: z
        .coerce
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Row offset for pagination (default 0): offset=0, then offset+=limit until fewer than `limit` rows come back. Ignored when report_id is supplied."),
      ticker: z
        .string()
        .optional()
        .describe("Filter by ticker symbol (action_code). Ignored when report_id is supplied."),
      report_id: z
        .string()
        .optional()
        .describe(
          "Fetch a specific report by ID (returns array of 0 or 1). " +
            "Takes precedence over ticker. " +
            "Bypasses queue-eligibility filters (text_status/refine_status) — for force-re-verify; " +
            "confirm_status guard (CONFIRMED exclusion) is still enforced.",
        ),
    },
    async (input) => {
      return handler(input);
    },
  );
}
