/**
 * FIX-C — get_bctc_series MCP Tool
 *
 * Returns a structured JSON ARRAY of financial metrics across multiple periods
 * for a given stock code. One object per period, ordered newest → oldest.
 *
 * Design:
 *   - Serves refine_status='DONE' periods ONLY (PUB-1 DONE gate reused from bctcFullTools).
 *   - Sparse history is HONEST: only periods that exist in the DB are returned.
 *     No padding, no fabrication of missing periods.
 *   - Fields are filtered to the requested subset. Unknown fields are silently ignored
 *     (caller gets back only what exists in the allowed set).
 *   - Numeric values are million VND as stored (same contract as get_bctc_full structured_data).
 *   - Injected _testDb for in-memory test isolation (same pattern as bctcFullTools.ts).
 *
 * Allowed fields: pe, pb, roe, debt_to_equity, operating_cf, net_profit, eps,
 *                 total_assets, net_revenue, equity_total
 *
 * @module interface/mcp/tools/financial-reports/bctcSeriesTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Database } from "bun:sqlite";

import { getDb } from "../../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** All fields the caller is permitted to request. */
export const ALLOWED_SERIES_FIELDS = [
  "pe",
  "pb",
  "roe",
  "debt_to_equity",
  "operating_cf",
  "net_profit",
  "eps",
  "total_assets",
  "net_revenue",
  "equity_total",
] as const;

export type SeriesField = (typeof ALLOWED_SERIES_FIELDS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// DB row type (only the columns we ever SELECT)
// ─────────────────────────────────────────────────────────────────────────────

interface SeriesRow {
  sort_key: string;
  period_year: number;
  period_quarter: number | null;
  period_type: string;
  refine_status: string;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  debt_to_equity: number | null;
  operating_cf: number;
  net_profit: number;
  eps: number;
  total_assets: number;
  net_revenue: number;
  equity_total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One period's data point in the series. Always includes the period identifier;
 * financial fields are present only when included in the requested `fields` list.
 * Values are null when the field is null in the DB (honest-absent).
 */
export interface SeriesDataPoint {
  sort_key: string;
  period_year: number;
  period_quarter: number | null;
  period_type: string;
  [field: string]: string | number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query + field-filter logic (exported for testability)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildSeriesData — queries financial_reports for a given code, returns
 * up to `limit` periods with `refine_status = 'DONE'` (PUB-1 DONE gate),
 * newest → oldest. Each returned object contains only the requested subset
 * of the allowed fields. Fields absent from `requestedFields` are omitted.
 *
 * Honest-absent contract: a field value that is NULL in the DB is returned as
 * null in the output. The caller should treat null as "not available for this
 * period" — never interpolate or fabricate.
 */
export function buildSeriesData(
  db: Database,
  code: string,
  requestedFields: SeriesField[],
  limit: number,
): SeriesDataPoint[] {
  const upperCode = code.toUpperCase().trim();

  const rows = db
    .query<SeriesRow, [string, number]>(
      `SELECT sort_key, period_year, period_quarter, period_type, refine_status,
              pe, pb, roe, debt_to_equity, operating_cf, net_profit, eps,
              total_assets, net_revenue, equity_total
         FROM financial_reports
        WHERE action_code = ?
          AND refine_status = 'DONE'
        ORDER BY sort_key DESC
        LIMIT ?`,
    )
    .all(upperCode, limit);

  return rows.map((row) => {
    const point: SeriesDataPoint = {
      sort_key: row.sort_key,
      period_year: row.period_year,
      period_quarter: row.period_quarter ?? null,
      period_type: row.period_type,
    };

    for (const field of requestedFields) {
      switch (field) {
        case "pe":
          point[field] = row.pe ?? null;
          break;
        case "pb":
          point[field] = row.pb ?? null;
          break;
        case "roe":
          point[field] = row.roe ?? null;
          break;
        case "debt_to_equity":
          point[field] = row.debt_to_equity ?? null;
          break;
        case "operating_cf":
          point[field] = row.operating_cf;
          break;
        case "net_profit":
          point[field] = row.net_profit;
          break;
        case "eps":
          point[field] = row.eps;
          break;
        case "total_assets":
          point[field] = row.total_assets;
          break;
        case "net_revenue":
          point[field] = row.net_revenue;
          break;
        case "equity_total":
          point[field] = row.equity_total;
          break;
      }
    }

    return point;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers the `get_bctc_series` MCP tool on `server`.
 *
 * @param server  - The McpServer instance.
 * @param _testDb - Optional injected Database for unit tests.
 */
export function registerBctcSeriesTools(
  server: McpServer,
  _testDb?: Database,
): void {
  server.tool(
    "get_bctc_series",
    "Returns a structured JSON array of financial metrics across multiple reporting periods " +
    "for a stock. One object per period, ordered newest→oldest. " +
    "Only DONE-refined periods are served (OCR-garbage / non-DONE periods are excluded). " +
    "Sparse history is honest — only periods that exist in the DB are returned; missing periods " +
    "are not padded or fabricated. " +
    "Allowed fields: pe, pb, roe, debt_to_equity, operating_cf, net_profit, eps, total_assets, net_revenue, equity_total. " +
    "All monetary values are in million VND.",
    {
      code: z
        .string()
        .min(2)
        .max(10)
        .describe("Stock ticker code, e.g. VCB"),
      fields: z
        .array(
          z.enum([
            "pe",
            "pb",
            "roe",
            "debt_to_equity",
            "operating_cf",
            "net_profit",
            "eps",
            "total_assets",
            "net_revenue",
            "equity_total",
          ]),
        )
        .min(1)
        .describe(
          "List of fields to include in each period object. " +
          "Allowed: pe, pb, roe, debt_to_equity, operating_cf, net_profit, eps, total_assets, net_revenue, equity_total",
        ),
      periods: z.coerce
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(4)
        .describe("Maximum number of periods to return (default 4, max 20)"),
    },
    async ({ code, fields, periods }) => {
      const db = _testDb ?? getDb();
      const upperCode = code.toUpperCase().trim();
      const limit = Math.min(Math.max(1, periods ?? 4), 20);

      try {
        const seriesData = buildSeriesData(db, upperCode, fields as SeriesField[], limit);

        if (seriesData.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  code: upperCode,
                  fields,
                  periods_requested: limit,
                  data: [],
                  note: `No DONE-refined periods found for ${upperCode}. Run the refine pipeline first.`,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                code: upperCode,
                fields,
                periods_returned: seriesData.length,
                unit_note: "Monetary values in million VND (triệu đồng)",
                data: seriesData,
              }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving BCTC series for ${upperCode}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
