/**
 * officersHandler.ts — GET /api/officers
 *
 * TASK17-PAGE15 endpoint:
 * Serve "Ban lãnh đạo & quản trị" (Board of Directors & Management).
 * Governance counterpart to the shareholders endpoint (TASK17-PAGE14).
 * Inherently snapshot-based capability — board composition doesn't change daily.
 * Frame as: data tại thời điểm công bố, NOT real-time.
 *
 * Source table: vnstock_officers (stored-data-only; NO live network calls).
 * Read path: officersStore (infrastructure) — NO SQL in this handler.
 * This handler ONLY maps + aggregates — db injected by server.ts.
 *
 * Live contract (probed 2026-06-11 against named-volume DB):
 *   493 rows, 32 distinct codes, fresh through 2026-06-10.
 *   Default selectedCode = BID (MIN code ASC): 24 officers, totalInsiderPct = 0.0.
 *   FPT: 17 officers, totalInsiderPct = 10.45, boardSeats = 7,
 *        top = "Trương Gia Bình" / "Chủ tịch Hội đồng Quản trị" / own_percent 6.89.
 *   Ranking head (totalInsiderPct DESC): HPG 34.04, PDR 28.46, GEX 26.09.
 *
 * Query params:
 *   ?code=XXX  — optional ticker (case-insensitive); invalid/absent → first code
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt:      string,                   // ISO 8601 server clock
 *     asOf:             string | null,            // MAX(fetched_at) across entire table
 *     codes:            string[],                 // all distinct codes A-Z
 *     selectedCode:     string,                   // resolved selected code
 *     officers:         OfficerItem[],            // officers for selectedCode (capped 200)
 *     selectedSummary:  OfficerCodeMetrics | null, // metrics for selectedCode
 *     ranking:          OfficerRankingItem[],     // all codes ranked by totalInsiderPct DESC
 *     count:            number                    // officers.length
 *   }
 *
 * 200 + empty state when table has no rows (NO error).
 * 500 JSON {error:"db_error"} on DB error.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from officersStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getDistinctCodes,
  getAllOfficers,
  getAsOf,
  type OfficerRow,
} from "../../../infrastructure/db/officersStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const OFFICERS_ROW_CAP = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One officer item in the officers array. */
export interface OfficerItem {
  rank: number;
  name: string;
  position: string;
  ownPercent: number | null;
  quantity: number | null;
  appointmentYear: number | null;
}

/** Per-code computed metrics for officers. */
export interface OfficerCodeMetrics {
  code: string;
  officerCount: number;
  boardSeats: number;
  totalInsiderPct: number;
  topName: string | null;
  topPosition: string | null;
  topPct: number | null;
}

/** Ranking item — cross-company officer governance summary. */
export interface OfficerRankingItem {
  code: string;
  officerCount: number;
  boardSeats: number;
  totalInsiderPct: number;
}

/** Full response body for GET /api/officers. */
export interface OfficersResponse {
  generatedAt: string;
  asOf: string | null;
  codes: string[];
  selectedCode: string;
  officers: OfficerItem[];
  selectedSummary: OfficerCodeMetrics | null;
  ranking: OfficerRankingItem[];
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine whether a position string represents a board seat.
 * A board seat is any position that contains "Hội đồng Quản trị".
 *
 * @param position - The position string from vnstock_officers
 * @returns true if the position contains "Hội đồng Quản trị"
 */
export function isBoardSeat(position: string): boolean {
  return position.includes("Hội đồng Quản trị");
}

/**
 * Compute per-code summary metrics from a slice of rows for ONE code.
 * Rows MUST already be sorted by own_percent DESC (store guarantees this).
 * Null own_percent values are sorted last by the store; treat null as 0 for sums.
 *
 * @param rowsForOneCode - All OfficerRows for a single code, sorted own_percent DESC
 * @returns OfficerCodeMetrics for that code
 */
export function computeCodeMetrics(rowsForOneCode: OfficerRow[]): OfficerCodeMetrics {
  const code = rowsForOneCode[0]?.code ?? "";
  const officerCount = rowsForOneCode.length;

  // boardSeats: count rows where isBoardSeat(position) is true
  const boardSeats = rowsForOneCode.filter((r) => isBoardSeat(r.position)).length;

  // totalInsiderPct: sum all own_percent (null → 0), rounded to 2dp
  const totalInsiderPctRaw = rowsForOneCode.reduce(
    (sum, r) => sum + (r.own_percent ?? 0),
    0,
  );
  const totalInsiderPct = Math.round(totalInsiderPctRaw * 100) / 100;

  // top*: the row with the highest own_percent (null treated as lowest; tie-break name ASC)
  // Store sorts own_percent DESC, name ASC already — so first non-null wins.
  // If ALL rows have null own_percent, topPct stays null.
  const topRow =
    rowsForOneCode.find((r) => r.own_percent != null) ?? null;

  const topName = topRow?.name ?? null;
  const topPosition = topRow?.position ?? null;
  const topPct =
    topRow?.own_percent != null
      ? Math.round(topRow.own_percent * 100) / 100
      : null;

  return {
    code,
    officerCount,
    boardSeats,
    totalInsiderPct,
    topName,
    topPosition,
    topPct,
  };
}

/**
 * Build the cross-company ranking from all rows.
 * Groups rows by code, computes metrics per code,
 * sorts by totalInsiderPct DESC; tie-break: code ASC (deterministic).
 *
 * @param allRows - All OfficerRows from the store (sorted code ASC, own_percent DESC, name ASC)
 * @returns OfficerRankingItem[] sorted by totalInsiderPct DESC, tie-break code ASC
 */
export function buildRanking(allRows: OfficerRow[]): OfficerRankingItem[] {
  // Group by code — store returns code ASC so rows for each code are contiguous
  const codeMap = new Map<string, OfficerRow[]>();
  for (const row of allRows) {
    const bucket = codeMap.get(row.code);
    if (bucket) {
      bucket.push(row);
    } else {
      codeMap.set(row.code, [row]);
    }
  }

  const metrics: OfficerRankingItem[] = Array.from(codeMap.values()).map((rows) => {
    const m = computeCodeMetrics(rows);
    return {
      code:            m.code,
      officerCount:    m.officerCount,
      boardSeats:      m.boardSeats,
      totalInsiderPct: m.totalInsiderPct,
    };
  });

  // Sort by totalInsiderPct DESC; tie-break by code ASC (deterministic)
  metrics.sort(
    (a, b) =>
      b.totalInsiderPct - a.totalInsiderPct ||
      a.code.localeCompare(b.code),
  );

  return metrics;
}

/**
 * Map an OfficerRow to an OfficerItem.
 *
 * @param row       - OfficerRow from the store
 * @param rankIndex - 0-based index position in the officer list
 * @returns OfficerItem ready for the response
 */
export function mapOfficer(row: OfficerRow, rankIndex: number): OfficerItem {
  return {
    rank:            rankIndex + 1,
    name:            row.name,
    position:        row.position,
    ownPercent:
      row.own_percent != null
        ? Math.round(row.own_percent * 100) / 100
        : null,
    quantity:        row.quantity,
    appointmentYear: row.appointment_year,
  };
}

/**
 * Resolve the selected code from the ?code= query parameter.
 * Uppercases the requested code; if it is present in codes[], uses it.
 * Otherwise falls back to codes[0] (first code alphabetically) or "".
 * NO hardcoded default — the actual first code in the DB drives the fallback.
 *
 * @param requested - Raw ?code= param value (may be null/empty)
 * @param codes     - List of valid codes (sorted ASC)
 * @returns Resolved selected code string
 */
export function resolveSelectedCode(requested: string | null, codes: string[]): string {
  if (requested !== null && requested !== "") {
    const upper = requested.toUpperCase();
    if (codes.includes(upper)) {
      return upper;
    }
  }
  return codes[0] ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrate the GET /api/officers response.
 * Called by the HTTP handler with an injected DB instance.
 * Pure-ish (deterministic given same DB state) — can be called directly in tests.
 *
 * @param db    - SQLite database instance (injected by server.ts — NO getDb() here)
 * @param query - Parsed URL query params (expects optional ?code=)
 * @returns OfficersResponse object (caller serialises to JSON)
 */
export function handleGetOfficers(
  db: Database,
  query: URLSearchParams,
): OfficersResponse {
  const codes = getDistinctCodes(db);
  const allRows = getAllOfficers(db);
  const asOf = getAsOf(db);

  const requestedCode = query.get("code");
  const selectedCode = resolveSelectedCode(requestedCode, codes);

  if (codes.length === 0 || allRows.length === 0) {
    return {
      generatedAt:     new Date().toISOString(),
      asOf:            null,
      codes:           [],
      selectedCode:    "",
      officers:        [],
      selectedSummary: null,
      ranking:         [],
      count:           0,
    };
  }

  // Officers for the selected code — sorted own_percent DESC NULLS LAST then name ASC
  // (store already orders: own_percent DESC, name ASC — nulls sort last in SQLite DESC)
  const selectedRows = allRows
    .filter((r) => r.code === selectedCode)
    .slice(0, OFFICERS_ROW_CAP);

  const officers: OfficerItem[] = selectedRows.map((r, idx) => mapOfficer(r, idx));

  // Compute summary for selected code (use full un-capped slice for metrics)
  const allRowsForSelected = allRows.filter((r) => r.code === selectedCode);
  const selectedSummary: OfficerCodeMetrics | null =
    allRowsForSelected.length > 0 ? computeCodeMetrics(allRowsForSelected) : null;

  // Build cross-company ranking
  const ranking = buildRanking(allRows);

  return {
    generatedAt:     new Date().toISOString(),
    asOf,
    codes,
    selectedCode,
    officers,
    selectedSummary,
    ranking,
    count: officers.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/officers.
 *
 * @param req - Incoming HTTP request (reads optional ?code= query param)
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 */
export function handleGetOfficersHttp(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const body = handleGetOfficers(db, url.searchParams);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
