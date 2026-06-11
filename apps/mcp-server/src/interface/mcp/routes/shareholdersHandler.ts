/**
 * shareholdersHandler.ts — GET /api/shareholders
 *
 * TASK17-PAGE14 endpoint:
 * Serve "Cơ cấu cổ đông tại thời điểm công bố" (Ownership Structure Snapshot).
 * Inherently snapshot-based capability — ownership doesn't change daily.
 * Frame as: data tại thời điểm công bố, NOT real-time.
 *
 * Source table: vnstock_shareholders (stored-data-only; NO live network calls).
 * Read path: shareholdersStore (infrastructure) — NO SQL in this handler.
 * This handler ONLY maps + aggregates — db injected by server.ts.
 *
 * Live contract (probed 2026-06-11 against named-volume DB):
 *   1593 rows, 32 distinct codes, 15–107 holders per code.
 *   own_percent on 0–100 scale (e.g. FPT: "Trương Gia Bình" 6.89%).
 *   Per-code SUM(own_percent) CAN exceed 100 (overlapping disclosures).
 *   asOf = MAX(fetched_at) ≈ 2026-04-14.
 *   Robust metrics: top-1 / top-5 concentration + holder roster.
 *
 * Query params:
 *   ?code=XXX  — optional ticker (case-insensitive); invalid/absent → first code
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt:     string,               // ISO 8601 server clock
 *     asOf:            string | null,        // MAX(fetched_at) across entire table
 *     codes:           string[],             // all distinct codes A-Z
 *     selectedCode:    string,               // resolved selected code
 *     holders:         HolderItem[],         // holders for selectedCode (capped 200)
 *     selectedSummary: CodeMetrics | null,   // metrics for selectedCode
 *     ranking:         RankingItem[],        // all codes ranked by top1Pct DESC
 *     count:           number                // holders.length
 *   }
 *
 * 200 + empty state when table has no rows (NO error).
 * 500 JSON {error:"db_error"} on DB error.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from shareholdersStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getDistinctCodes,
  getAllShareholders,
  getAsOf,
  type ShareholderRow,
} from "../../../infrastructure/db/shareholdersStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const HOLDERS_ROW_CAP = 200;
export const TOP_N = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Concentration tier. */
export type ConcentrationTier = "high" | "medium" | "low";

/** Concentration classification result. */
export interface ConcentrationInfo {
  concentration: ConcentrationTier;
  label: string;
}

/** One holder item in the holders array. */
export interface HolderItem {
  rank: number;
  name: string;
  quantity: number | null;
  ownPercent: number | null;
}

/** Per-code computed metrics — includes concentrationLabel for the response. */
export interface CodeMetrics {
  code: string;
  holderCount: number;
  top1Name: string;
  top1Pct: number | null;
  top5Pct: number;
  disclosedPct: number;
  concentration: ConcentrationTier;
  concentrationLabel: string;
}

/** Ranking item — omits top1Name (not needed in the cross-company list). */
export interface RankingItem {
  code: string;
  holderCount: number;
  top1Pct: number | null;
  top5Pct: number;
  disclosedPct: number;
  concentration: ConcentrationTier;
  concentrationLabel: string;
}

/** Full response body for GET /api/shareholders. */
export interface ShareholdersResponse {
  generatedAt: string;
  asOf: string | null;
  codes: string[];
  selectedCode: string;
  holders: HolderItem[];
  selectedSummary: CodeMetrics | null;
  ranking: RankingItem[];
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify top-1 holder percentage into a concentration tier.
 *   top1Pct >= 50  → high,   "Tập trung cao"
 *   top1Pct >= 15  → medium, "Tập trung vừa"
 *   else           → low,    "Phân tán"
 *   null / NaN     → low,    "Phân tán"
 *
 * @param top1Pct - Percentage held by the top-1 shareholder (0–100 scale)
 * @returns ConcentrationInfo with concentration tier + Vietnamese label
 */
export function classifyConcentration(top1Pct: number | null | undefined): ConcentrationInfo {
  if (top1Pct === null || top1Pct === undefined || isNaN(top1Pct as number)) {
    return { concentration: "low", label: "Phân tán" };
  }
  if (top1Pct >= 50) {
    return { concentration: "high", label: "Tập trung cao" };
  }
  if (top1Pct >= 15) {
    return { concentration: "medium", label: "Tập trung vừa" };
  }
  return { concentration: "low", label: "Phân tán" };
}

/**
 * Compute per-code summary metrics from a slice of rows for ONE code.
 * Rows MUST already be sorted by own_percent DESC (store guarantees this).
 *
 * @param rowsForOneCode - All ShareholderRows for a single code, sorted own_percent DESC
 * @returns CodeMetrics for that code
 */
export function computeCodeMetrics(rowsForOneCode: ShareholderRow[]): CodeMetrics {
  const code = rowsForOneCode[0]?.code ?? "";
  const holderCount = rowsForOneCode.length;

  // top-1
  const top1Row = rowsForOneCode[0];
  const top1Name = top1Row?.name ?? "";
  const top1Pct = top1Row?.own_percent != null
    ? Math.round(top1Row.own_percent * 100) / 100
    : null;

  // top-5: sum first TOP_N own_percent values (treat null as 0)
  const top5Rows = rowsForOneCode.slice(0, TOP_N);
  const top5PctRaw = top5Rows.reduce((sum, r) => sum + (r.own_percent ?? 0), 0);
  const top5Pct = Math.round(top5PctRaw * 100) / 100;

  // disclosedPct: sum all own_percent (treat null as 0)
  const disclosedPctRaw = rowsForOneCode.reduce((sum, r) => sum + (r.own_percent ?? 0), 0);
  const disclosedPct = Math.round(disclosedPctRaw * 100) / 100;

  const { concentration, label: concentrationLabel } = classifyConcentration(top1Pct);

  return {
    code,
    holderCount,
    top1Name,
    top1Pct,
    top5Pct,
    disclosedPct,
    concentration,
    concentrationLabel,
  };
}

/**
 * Build the cross-company ranking from all rows.
 * Groups rows by code, computes metrics per code, sorts by top1Pct DESC.
 * Tie-break: code ASC (deterministic).
 *
 * @param allRows - All ShareholderRows from the store (sorted code ASC, own_percent DESC)
 * @returns RankingItem[] sorted by top1Pct DESC, tie-break code ASC
 */
export function buildRanking(allRows: ShareholderRow[]): RankingItem[] {
  // Group by code — store returns code ASC so rows for each code are contiguous
  const codeMap = new Map<string, ShareholderRow[]>();
  for (const row of allRows) {
    const bucket = codeMap.get(row.code);
    if (bucket) {
      bucket.push(row);
    } else {
      codeMap.set(row.code, [row]);
    }
  }

  const metrics: RankingItem[] = Array.from(codeMap.values()).map((rows) => {
    const m = computeCodeMetrics(rows);
    return {
      code:              m.code,
      holderCount:       m.holderCount,
      top1Pct:           m.top1Pct,
      top5Pct:           m.top5Pct,
      disclosedPct:      m.disclosedPct,
      concentration:     m.concentration,
      concentrationLabel: m.concentrationLabel,
    };
  });

  // Sort by top1Pct DESC; tie-break by code ASC (deterministic)
  metrics.sort((a, b) => {
    const aPct = a.top1Pct ?? -1;
    const bPct = b.top1Pct ?? -1;
    return (bPct - aPct) || a.code.localeCompare(b.code);
  });

  return metrics;
}

/**
 * Map a ShareholderRow to a HolderItem.
 *
 * @param row       - ShareholderRow from the store
 * @param rankIndex - 0-based index position in the holder list
 * @returns HolderItem ready for the response
 */
export function mapHolder(row: ShareholderRow, rankIndex: number): HolderItem {
  return {
    rank:       rankIndex + 1,
    name:       row.name,
    quantity:   row.quantity,
    ownPercent: row.own_percent != null
      ? Math.round(row.own_percent * 100) / 100
      : null,
  };
}

/**
 * Resolve the selected code from the ?code= query parameter.
 * Uppercases the requested code; if it is present in codes[], uses it.
 * Otherwise falls back to codes[0] (first code alphabetically) or "".
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
 * Orchestrate the GET /api/shareholders response.
 * Called by the HTTP handler with an injected DB instance.
 * Pure-ish (deterministic given same DB state) — can be called directly in tests.
 *
 * @param db    - SQLite database instance (injected)
 * @param query - Parsed URL query params (expects optional ?code=)
 * @returns ShareholdersResponse object (caller serialises to JSON)
 */
export function handleGetShareholders(
  db: Database,
  query: URLSearchParams,
): ShareholdersResponse {
  const codes = getDistinctCodes(db);
  const allRows = getAllShareholders(db);
  const asOf = getAsOf(db);

  const requestedCode = query.get("code");
  const selectedCode = resolveSelectedCode(requestedCode, codes);

  if (codes.length === 0 || allRows.length === 0) {
    return {
      generatedAt:     new Date().toISOString(),
      asOf:            null,
      codes:           [],
      selectedCode:    "",
      holders:         [],
      selectedSummary: null,
      ranking:         [],
      count:           0,
    };
  }

  // Rows for the selected code (store returns code ASC, own_percent DESC)
  const selectedRows = allRows
    .filter((r) => r.code === selectedCode)
    .slice(0, HOLDERS_ROW_CAP);

  const holders: HolderItem[] = selectedRows.map((r, idx) => mapHolder(r, idx));

  // Compute summary for selected code (use full un-capped slice for metrics)
  const allRowsForSelected = allRows.filter((r) => r.code === selectedCode);
  const selectedSummary: CodeMetrics | null =
    allRowsForSelected.length > 0 ? computeCodeMetrics(allRowsForSelected) : null;

  // Build cross-company ranking
  const ranking = buildRanking(allRows);

  return {
    generatedAt:     new Date().toISOString(),
    asOf,
    codes,
    selectedCode,
    holders,
    selectedSummary,
    ranking,
    count: holders.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/shareholders.
 *
 * @param req - Incoming HTTP request (reads optional ?code= query param)
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 */
export function handleGetShareholdersHttp(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const body = handleGetShareholders(db, url.searchParams);
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
