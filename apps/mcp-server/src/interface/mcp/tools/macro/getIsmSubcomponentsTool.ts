/**
 * Task 1910a — get_ism_subcomponents MCP Tool
 *
 * Interface layer: registers the `get_ism_subcomponents` MCP tool.
 *
 * Tool: get_ism_subcomponents
 *   Input:  none (latest available data is returned)
 *   Output: JSON envelope with source_tier=1
 *     {
 *       source_tier: 1,
 *       new_orders: number | null,
 *       employment: number | null,
 *       prices_paid: number | null,
 *       backlog: number | null,
 *       regime_signal: "EXPANDING" | "CONTRACTING" | "MIXED",
 *       fetchedAt: string,   // ISO-8601 datetime of last fetch
 *       asOf: string,        // YYYY-MM-DD of latest observation month
 *     }
 *
 * Data flow:
 *   1. Reads latest value per ISM series from fred_series_daily (infra)
 *   2. Passes to computeIsmRegimeSignal (domain)
 *   3. Returns source_tier=1 envelope
 *
 * Source tier: 1 — FRED is the Federal Reserve's official data repository,
 * hosting ISM Manufacturing PMI sub-components from the Institute for Supply
 * Management.
 *
 * @module interface/mcp/tools/macro/getIsmSubcomponentsTool
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  computeIsmRegimeSignal,
  type IsmSubcomponentInput,
} from "../../../../domain/services/macro/ismRegimeSignal.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB query helper
// ─────────────────────────────────────────────────────────────────────────────

interface IsmLatestRow {
  value: number;
  date: string;
  fetched_at: string;
}

/**
 * Queries the latest observation for a given ISM series from fred_series_daily.
 *
 * Returns null if the series has no data.
 */
function fetchLatestIsmSeries(
  seriesId: string,
): IsmLatestRow | null {
  const db = getDb();
  const row = db
    .prepare<IsmLatestRow, [string]>(
      `SELECT value, date, fetched_at
       FROM fred_series_daily
       WHERE series = ?
       ORDER BY date DESC
       LIMIT 1`,
    )
    .get(seriesId);
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_ism_subcomponents` MCP tool.
 *
 * @param server The McpServer instance to register the tool on.
 */
export function registerGetIsmSubcomponentsTool(server: McpServer): void {
  server.tool(
    "get_ism_subcomponents",
    "Returns the latest ISM Manufacturing PMI sub-component readings from FRED: " +
      "New Orders (NAPMNO), Employment (NAPMEMP), Prices Paid (NAPMPI), and Backlog (NAPMBI). " +
      "Includes a regime signal: " +
      "'EXPANDING' (new_orders > 50 AND new_orders > prices_paid — demand-led growth), " +
      "'CONTRACTING' (new_orders < 50 AND employment < 50 — broad contraction confirmed), " +
      "'MIXED' (boundary or conflicting signals). " +
      "ISM is a monthly series; data is refreshed daily via macroIndicatorRefreshJob. " +
      "Source tier: 1 (primary official — FRED hosts ISM data from the Institute for Supply Management).",
    {},
    () => {
      try {
        // Ensure schema tables exist
        initDatabase();

        // Query latest value per ISM series
        const napmnoRow = fetchLatestIsmSeries("NAPMNO");
        const napmempRow = fetchLatestIsmSeries("NAPMEMP");
        const napmpiRow = fetchLatestIsmSeries("NAPMPI");
        const napmbiRow = fetchLatestIsmSeries("NAPMBI");

        // No data at all → return informative no_data response
        if (!napmnoRow && !napmempRow && !napmpiRow && !napmbiRow) {
          logger.warn("[get_ism_subcomponents] no ISM data in fred_series_daily");
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  source_tier: 1 as const,
                  error: "no_data",
                  message:
                    "fred_series_daily has no ISM sub-component rows. " +
                    "Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY).",
                }),
              },
            ],
          };
        }

        const input: IsmSubcomponentInput = {
          new_orders: napmnoRow?.value ?? null,
          employment: napmempRow?.value ?? null,
          prices_paid: napmpiRow?.value ?? null,
          backlog: napmbiRow?.value ?? null,
        };

        const regimeResult = computeIsmRegimeSignal(input);

        // Determine asOf: latest date across all series that have data
        const dates = [napmnoRow, napmempRow, napmpiRow, napmbiRow]
          .filter((r): r is IsmLatestRow => r !== null)
          .map((r) => r.date);
        const asOf = dates.sort().reverse()[0] ?? "unknown";

        // fetchedAt: latest fetched_at across all series
        const fetchedAts = [napmnoRow, napmempRow, napmpiRow, napmbiRow]
          .filter((r): r is IsmLatestRow => r !== null)
          .map((r) => r.fetched_at);
        const fetchedAt = fetchedAts.sort().reverse()[0] ?? new Date().toISOString();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  source_tier: 1 as const,
                  new_orders: regimeResult.new_orders,
                  employment: regimeResult.employment,
                  prices_paid: regimeResult.prices_paid,
                  backlog: regimeResult.backlog,
                  regime_signal: regimeResult.regime_signal,
                  fetchedAt,
                  asOf,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("[get_ism_subcomponents] unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 1 as const,
                error: `Error fetching ISM sub-components: ${(err as Error).message}`,
              }),
            },
          ],
        };
      }
    },
  );
}
