/**
 * FIX-A + FIX-I-B — get_company_profile MCP Tool
 *
 * Returns structured ownership + officers JSON for a single stock ticker.
 * Reads from EXISTING tables: vnstock_shareholders, vnstock_officers, vnstock_trading_stats.
 * No new fetch, no new DB tables, no migration (migration in schema-financial-reports.ts).
 *
 * Output contract:
 *   {
 *     code: string,
 *     shareholders: [{ name, quantity, own_percent }],  top-10 by own_percent DESC
 *     officers: [{ name, position, own_percent, quantity, appointment_year, ceo_tenure_years }],
 *     foreign_holding_ratio: number | null,             null when not fetched
 *     free_float_approx: number,                        100 - sum(top-10 own_percent)
 *     data_as_of: string | null                         from shareholders fetched_at
 *   }
 *
 * Honest-null discipline:
 *   - foreign_holding_ratio: null when no trading_stats row for code
 *   - data_as_of: null when no shareholders synced yet
 *   - free_float_approx: 0 when no shareholders (no fake negatives)
 *   - appointment_year: null when not yet fetched or VPS returned N/A
 *   - ceo_tenure_years: null when appointment_year is null (no fabrication)
 *
 * Layer: interface/mcp/tools — may import infrastructure and domain.
 *
 * @module interface/mcp/tools/market-data/companyProfileTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB row types
// ─────────────────────────────────────────────────────────────────────────────

interface ShareholderRow {
  name: string;
  quantity: number | null;
  own_percent: number | null;
  fetched_at: string;
}

interface OfficerRow {
  name: string;
  position: string;
  own_percent: number | null;
  quantity: number | null;
  appointment_year: number | null;
}

interface TradingStatsRow {
  current_holding_ratio: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output types (exported for test consumers)
// ─────────────────────────────────────────────────────────────────────────────

export interface ShareholderEntry {
  name: string;
  quantity: number | null;
  own_percent: number;
}

export interface OfficerEntry {
  name: string;
  position: string;
  own_percent: number | null;
  quantity: number | null;
  /** Year the officer was appointed; null when not yet fetched or VPS returned N/A */
  appointment_year: number | null;
  /** Years in current role = currentYear - appointment_year; null when appointment_year is null */
  ceo_tenure_years: number | null;
}

export interface CompanyProfileResult {
  code: string;
  shareholders: ShareholderEntry[];
  officers: OfficerEntry[];
  foreign_holding_ratio: number | null;
  free_float_approx: number;
  data_as_of: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query logic — injectable DB for unit tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query company profile data for a single ticker.
 *
 * Returns empty shareholders/officers arrays when the ticker is unknown.
 * Returns null foreign_holding_ratio when no trading_stats row exists.
 * Returns null data_as_of when no shareholders have been synced.
 * Never fabricates start_date (FIX-I scope).
 *
 * free_float_approx = 100 - sum(own_percent of top 10 shareholders).
 * If fewer than 10 shareholders exist, sum what exists.
 * If own_percent is null on a row, it is treated as 0 (defensive floor).
 */
export function queryCompanyProfile(db: Database, code: string): CompanyProfileResult {
  const upperCode = code.toUpperCase().trim();

  // 1. Top-10 shareholders by own_percent DESC
  const shareholderRows = db
    .prepare<ShareholderRow, [string]>(
      `SELECT name, quantity, own_percent, fetched_at
       FROM vnstock_shareholders
       WHERE code = ?
       ORDER BY own_percent DESC
       LIMIT 10`,
    )
    .all(upperCode);

  // 2. All officers for this code (FIX-I-B: include appointment_year)
  const officerRows = db
    .prepare<OfficerRow, [string]>(
      `SELECT name, position, own_percent, quantity, appointment_year
       FROM vnstock_officers
       WHERE code = ?`,
    )
    .all(upperCode);

  // 3. Latest foreign holding ratio from trading_stats
  const statsRow = db
    .prepare<TradingStatsRow, [string]>(
      `SELECT current_holding_ratio
       FROM vnstock_trading_stats
       WHERE code = ?
       ORDER BY fetched_at DESC
       LIMIT 1`,
    )
    .get(upperCode);

  // ── Build shareholders array ──────────────────────────────────────────────
  const shareholders: ShareholderEntry[] = shareholderRows.map((r) => ({
    name: r.name,
    quantity: r.quantity,
    own_percent: r.own_percent ?? 0,
  }));

  // ── Compute free_float_approx ─────────────────────────────────────────────
  // = 100 - sum(own_percent of top-10); floor at 0 (no negative free-float published)
  const sumTop10 = shareholders.reduce((acc, s) => acc + s.own_percent, 0);
  const freeFloatApprox = shareholders.length > 0 ? Math.max(0, 100 - sumTop10) : 0;

  // ── Build officers array ──────────────────────────────────────────────────
  // FIX-I-B: appointment_year + ceo_tenure_years derived inline.
  // ceo_tenure_years = currentYear - appointment_year (null when appointment_year null).
  // No fabrication: null propagates honestly.
  const currentYear = new Date().getFullYear();
  const officers: OfficerEntry[] = officerRows.map((r) => ({
    name: r.name,
    position: r.position,
    own_percent: r.own_percent,
    quantity: r.quantity,
    appointment_year: r.appointment_year ?? null,
    ceo_tenure_years:
      r.appointment_year != null ? currentYear - r.appointment_year : null,
  }));

  // ── data_as_of: from most-recently-fetched shareholder row ───────────────
  const dataAsOf = shareholderRows.length > 0
    ? (shareholderRows[0]!.fetched_at ?? null)
    : null;

  // ── foreign_holding_ratio: null if no row, null if column null or 0 ────────
  // DSI invariant: emit null when value is 0 (fabricated — VPS API does not return
  // holding_ratio; ?? 0 fallback in vnstockStore.ts produces fabricated zeros).
  const foreignHoldingRatio: number | null =
    statsRow != null &&
    statsRow.current_holding_ratio != null &&
    statsRow.current_holding_ratio > 0
      ? statsRow.current_holding_ratio
      : null;

  return {
    code: upperCode,
    shareholders,
    officers,
    foreign_holding_ratio: foreignHoldingRatio,
    free_float_approx: freeFloatApprox,
    data_as_of: dataAsOf,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_company_profile MCP tool.
 *
 * @param server    - The McpServer instance to register tools on.
 * @param resolveDb - Optional DB resolver (defaults to getDb for production;
 *                    inject an in-memory DB in tests).
 */
export function registerCompanyProfileTools(
  server: McpServer,
  resolveDb: () => Database = getDb,
): void {
  server.tool(
    "get_company_profile",
    "Return structured ownership and officers data for a single Vietnamese stock ticker. " +
      "Returns { code, shareholders[], officers[], foreign_holding_ratio, free_float_approx, data_as_of }. " +
      "shareholders: top-10 by own_percent DESC (from vnstock_shareholders). " +
      "officers: all officers (name, position, own_percent, quantity, appointment_year, ceo_tenure_years). " +
      "appointment_year: calendar year the officer was appointed (null if not yet fetched or VPS returned N/A). " +
      "ceo_tenure_years: currentYear - appointment_year (null when appointment_year is null — no fabrication). " +
      "foreign_holding_ratio: aggregate foreign holding % from vnstock_trading_stats.current_holding_ratio (null if not yet fetched). " +
      "free_float_approx: 100 - sum(top-10 shareholders own_percent) — simple approximation, not institutional-filtered. " +
      "data_as_of: ISO timestamp of most recent shareholders fetch (null if never synced). " +
      "Source: vnstock_shareholders, vnstock_officers (appointment_year from boardDetailsJob), vnstock_trading_stats. " +
      "Unblocks SKILL-4 ownership-governance-screen (free-float, controlling-stake, skin-in-the-game, tenure).",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker, e.g. 'FPT' or 'VNM'."),
    },
    async ({ code }) => {
      try {
        const db = resolveDb();
        const result = queryCompanyProfile(db, code);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                code: code.toUpperCase().trim(),
                shareholders: [],
                officers: [],
                foreign_holding_ratio: null,
                free_float_approx: 0,
                data_as_of: null,
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
        };
      }
    },
  );
}
