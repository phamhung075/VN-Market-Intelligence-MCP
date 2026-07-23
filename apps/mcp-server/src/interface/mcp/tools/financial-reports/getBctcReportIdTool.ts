/**
 * MCP Tool: get_bctc_report_id — BCTC-REPORT-ID-LOOKUP-TOOL
 *
 * Root cause (RECURRING dark-escalation — src signal
 * cowork-20260722T151600Z-bctc-esc5-report-id-gap, backlog row
 * BCTC-REPORT-ID-LOOKUP-TOOL): get_bctc_full(code) never surfaces the
 * financial_reports.id UUID in its output, yet get_bctc_full's OWN JSON
 * output (structured_data block) does NOT include report_id either — no
 * tool anywhere maps ticker+period -> report_id. That report_id is a
 * REQUIRED input to get_bctc_full-adjacent tools: get_bctc_page_text,
 * get_bctc_page_image, get_bctc_refined, list_flagged_bctc_cells,
 * submit_bctc_correction. Without a lookup path, bctc-analyst's
 * ESC-5 gate (deep-dive-opus.md, flow/main.md) could never call
 * get_bctc_refined(report_id) — 30 cycles of ESC-5 silently reading
 * as structurally FALSE ("skipping") instead of ever actually
 * evaluating the refine-confidence bar.
 *
 * This tool closes the gap: ticker (+ optional year/quarter) -> report_id(s),
 * restricted to refine_status = 'DONE' (the only status the four downstream
 * tools above expect — PENDING/IN_PROGRESS/FAILED/PARTIAL/REJECTED_SANITY
 * rows either have no bctc_refined_units yet or are not safe to serve).
 *
 * DDD layer: interface (read-only, zero DB writes).
 *
 * @module interface/mcp/tools/financial-reports/getBctcReportIdTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ── DB row types ────────────────────────────────────────────────────────────

interface ReportIdRow {
  id: string;
  period_year: number;
  period_quarter: number | null;
  period_type: string;
  sort_key: string;
  refine_status: string;
  published_at: string;
}

interface ExistingStatusRow {
  refine_status: string;
}

// ── Output types ──────────────────────────────────────────────────────────

interface ReportIdMatch {
  report_id: string;
  period_year: number;
  period_quarter: number | null;
  period_type: string;
  sort_key: string;
  refine_status: string;
  published_at: string;
}

interface ReportIdOutput {
  action_code: string;
  refine_status_filter: "DONE";
  /** Most recent (highest sort_key) matching report_id. Typed null — not an error — when absent. */
  report_id: string | null;
  report_ids: string[];
  count: number;
  matches: ReportIdMatch[];
  /**
   * Diagnostic only, populated when count === 0: the refine_status of the
   * most recent report for this ticker/period across ALL statuses (not just
   * DONE), so a caller like ESC-5 can tell "not yet refined" apart from
   * "no report filed at all". Null when no report exists at all.
   */
  existing_refine_status: string | null;
}

// ── Zod input schema ──────────────────────────────────────────────────────────

const InputSchema = z.object({
  code: z.string().min(2).max(10).describe("Stock ticker code, e.g. VCB"),
  year: z.coerce
    .number()
    .int()
    .min(2010)
    .max(2030)
    .optional()
    .describe("Fiscal year filter (optional — omit to search all years)"),
  quarter: z
    .enum(["Q1", "Q2", "Q3", "Q4"])
    .optional()
    .describe("Quarter filter: Q1 | Q2 | Q3 | Q4 (optional — omit to search all quarters)"),
});

// ── Handler (testable with injected DB) ───────────────────────────────────────

export function buildGetBctcReportIdHandler(
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

    const { code, year, quarter } = parsed.data;
    const db = dbOverride ?? getDb();
    const upperCode = code.toUpperCase().trim();

    try {
      const conditions: string[] = ["action_code = $code", "refine_status = 'DONE'"];
      const params: Record<string, string | number> = { $code: upperCode };
      if (year !== undefined) {
        conditions.push("period_year = $year");
        params["$year"] = year;
      }
      if (quarter !== undefined) {
        conditions.push("period_type = $quarter");
        params["$quarter"] = quarter;
      }

      const rows = db
        .query<ReportIdRow, typeof params>(
          `SELECT id, period_year, period_quarter, period_type, sort_key, refine_status, published_at
           FROM financial_reports
           WHERE ${conditions.join(" AND ")}
           ORDER BY sort_key DESC`,
        )
        .all(params);

      if (rows.length === 0) {
        // Diagnostic: most recent report for this ticker/period regardless of
        // refine_status, so the caller can distinguish "not yet refined" from
        // "no report filed at all" — mirrors ESC-5's graceful no-rows handling.
        let existingRefineStatus: string | null = null;
        try {
          const anyConditions: string[] = ["action_code = $code"];
          const anyParams: Record<string, string | number> = { $code: upperCode };
          if (year !== undefined) {
            anyConditions.push("period_year = $year");
            anyParams["$year"] = year;
          }
          if (quarter !== undefined) {
            anyConditions.push("period_type = $quarter");
            anyParams["$quarter"] = quarter;
          }
          const anyRow = db
            .query<ExistingStatusRow, typeof anyParams>(
              `SELECT refine_status FROM financial_reports
               WHERE ${anyConditions.join(" AND ")}
               ORDER BY sort_key DESC LIMIT 1`,
            )
            .get(anyParams);
          existingRefineStatus = anyRow?.refine_status ?? null;
        } catch {
          existingRefineStatus = null;
        }

        const output: ReportIdOutput = {
          action_code: upperCode,
          refine_status_filter: "DONE",
          report_id: null,
          report_ids: [],
          count: 0,
          matches: [],
          existing_refine_status: existingRefineStatus,
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
      }

      const matches: ReportIdMatch[] = rows.map((row) => ({
        report_id: row.id,
        period_year: row.period_year,
        period_quarter: row.period_quarter,
        period_type: row.period_type,
        sort_key: row.sort_key,
        refine_status: row.refine_status,
        published_at: row.published_at,
      }));

      const output: ReportIdOutput = {
        action_code: upperCode,
        refine_status_filter: "DONE",
        report_id: matches[0]!.report_id,
        report_ids: matches.map((m) => m.report_id),
        count: matches.length,
        matches,
        existing_refine_status: null,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("[get_bctc_report_id] error", { code: upperCode, year, quarter, error: msg });
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

export function registerGetBctcReportIdTool(server: McpServer, _testDb?: ReturnType<typeof getDb>): void {
  const handler = buildGetBctcReportIdHandler(_testDb);

  server.tool(
    "get_bctc_report_id",
    "Look up financial_reports.id (report_id) for a ticker + optional year/quarter, " +
      "restricted to refine_status='DONE'. Closes the ESC-5 / deep-dive gap: " +
      "get_bctc_full(code) never returns report_id, so get_bctc_page_text / " +
      "get_bctc_page_image / get_bctc_refined / list_flagged_bctc_cells / " +
      "submit_bctc_correction — all of which REQUIRE report_id as input — were " +
      "otherwise unreachable. Output: { action_code, refine_status_filter: 'DONE', " +
      "report_id: string|null (most recent match), report_ids: string[], count, " +
      "matches: Array<{report_id, period_year, period_quarter, period_type, sort_key, " +
      "refine_status, published_at}>, existing_refine_status: string|null (diagnostic — " +
      "populated only when count=0, shows the most recent report's ACTUAL refine_status " +
      "so a caller can tell 'not yet refined' apart from 'no report filed at all') }. " +
      "Never errors on zero matches — typed-absent (report_id: null), not { error }.",
    {
      code: z.string().min(2).max(10).describe("Stock ticker code, e.g. VCB"),
      year: z.coerce
        .number()
        .int()
        .min(2010)
        .max(2030)
        .optional()
        .describe("Fiscal year filter (optional — omit to search all years)"),
      quarter: z
        .enum(["Q1", "Q2", "Q3", "Q4"])
        .optional()
        .describe("Quarter filter: Q1 | Q2 | Q3 | Q4 (optional — omit to search all quarters)"),
    },
    async ({ code, year, quarter }) => {
      return handler({ code, year, quarter });
    },
  );
}
