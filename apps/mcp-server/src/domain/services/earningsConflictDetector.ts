/**
 * Earnings Conflict Detector — Task 1786
 *
 * Domain service that detects contradictory earnings growth figures across
 * news signals for the same stock ticker.
 *
 * Problem: two news sources may report VIC Q1 earnings as "tăng 17 lần (1.700%)"
 * and "tăng 150%" in separate signals. The user sees both without any indication
 * of the contradiction.
 *
 * Solution:
 *   - extractEarningsGrowthPct(text) — parse a growth % from free-text Vietnamese
 *   - detectEarningsConflict(db, stockCode, newDetail) — query recent earnings
 *     signals for the same ticker; return a warning string if a prior signal
 *     carries a materially different growth figure, null otherwise.
 *
 * Layer: domain/services — pure business logic.
 * Imports: only bun:sqlite (type-only for the Database parameter).
 * No infrastructure imports allowed.
 */

import type { Database } from "bun:sqlite";

// ── normaliseVnNumber ─────────────────────────────────────────────────────────

/**
 * Parse a Vietnamese-formatted number string into a float.
 *
 * Vietnamese financial text uses "." as a thousands separator and "," as
 * a decimal separator, but many sources mix styles (e.g. "1.700" = 1700,
 * "25.5" = 25.5, "1,700" = 1700).
 *
 * Heuristic:
 *   1. If the string contains a comma, treat it as a decimal separator
 *      (strip dots first, then replace comma with dot).
 *   2. Otherwise, if a dot is followed by exactly 3 digits at end-of-string,
 *      treat it as a thousands separator (strip the dot).
 *   3. Otherwise parse as-is (dot is a decimal point).
 *
 * @returns Parsed number or null when NaN.
 */
function normaliseVnNumber(raw: string): number | null {
  let s = raw.trim();

  if (s.includes(",")) {
    // "1.700,5" or "1,700" style — strip dots, replace comma with dot
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}$/.test(s)) {
    // "1.700" — dot followed by exactly 3 trailing digits → thousands separator
    s = s.replace(/\./g, "");
  }
  // else: "25.5" — dot is decimal point, parse as-is

  const val = parseFloat(s);
  return isNaN(val) ? null : val;
}

// ── extractEarningsGrowthPct ──────────────────────────────────────────────────

/**
 * Extract a numeric earnings growth percentage from a Vietnamese news headline.
 *
 * Patterns recognised (in priority order):
 *   1. Parenthesised percentage: "(1.700%)" → 1700
 *      Used when a source writes "tăng 17 lần (1.700%)" — the parenthesised
 *      value is the actual percentage growth, more precise than the multiplier.
 *   2. Plain percentage after "tăng": "tăng 150%" → 150
 *   3. Any trailing percentage in the text: "giảm 25.5%" → 25.5
 *
 * Numbers may use either "." or "," as thousands separators (Vietnamese style).
 * Decimal separator is always ".".
 *
 * @param text - Free-text detail string from a signal payload
 * @returns Numeric growth percentage (may be > 100), or null if not found
 */
export function extractEarningsGrowthPct(text: string): number | null {
  if (!text) return null;

  // Priority 1: parenthesised percentage "(1.700%)" or "(1,700%)"
  const parenMatch = text.match(/\(\s*([\d][.,\d]*)\s*%\s*\)/);
  if (parenMatch?.[1]) {
    const val = normaliseVnNumber(parenMatch[1]);
    if (val !== null) return val;
  }

  // Priority 2: "tăng X%" or "giảm X%" (with optional thousands separator)
  const tangMatch = text.match(/(?:tăng|giảm)\s+([\d][.,\d]*)\s*%/);
  if (tangMatch?.[1]) {
    const val = normaliseVnNumber(tangMatch[1]);
    if (val !== null) return val;
  }

  // Priority 3: any percentage in the text
  const anyMatch = text.match(/([\d][.,\d]*)\s*%/);
  if (anyMatch?.[1]) {
    const val = normaliseVnNumber(anyMatch[1]);
    if (val !== null) return val;
  }

  return null;
}

// ── Row type for SQLite query ─────────────────────────────────────────────────

interface EarningsSignalRow {
  payload: string;
  finding_data: string;
}

// ── detectEarningsConflict ────────────────────────────────────────────────────

/**
 * Check whether a prior earnings signal for the same stock carries a
 * materially different growth figure than the incoming signal.
 *
 * Only inspects `chain_catalyst` signals whose `finding_data.event_type`
 * is `"earnings"`. Non-expired signals within 24 h are candidates.
 *
 * @param db        - Active bun:sqlite Database connection
 * @param stockCode - Ticker code of the incoming signal (e.g. "VIC")
 * @param newDetail - payload.detail of the incoming signal
 * @returns Warning string if a conflict is detected, null otherwise
 */
export function detectEarningsConflict(
  db: Database,
  stockCode: string | null | undefined,
  newDetail: string | undefined,
): string | null {
  // Only run when we have a ticker and a detail with an extractable figure
  if (!stockCode || !newDetail) return null;

  const newPct = extractEarningsGrowthPct(newDetail);
  if (newPct === null) return null;

  // Query recent non-expired chain_catalyst signals for this ticker
  let rows: EarningsSignalRow[];
  try {
    rows = db
      .prepare(
        `SELECT payload, finding_data
         FROM agent_signals
         WHERE signal_type = 'chain_catalyst'
           AND stock_code = ?
           AND expires_at > datetime('now')
         ORDER BY id DESC
         LIMIT 20`,
      )
      .all(stockCode) as EarningsSignalRow[];
  } catch {
    // Table may not have finding_data column in legacy schema — skip silently
    return null;
  }

  for (const row of rows) {
    // Only check earnings-typed findings
    let findingData: Record<string, unknown> = {};
    try {
      findingData = JSON.parse(row.finding_data ?? "{}") as Record<string, unknown>;
    } catch {
      continue;
    }
    if (findingData["event_type"] !== "earnings") continue;

    // Extract the prior signal's growth figure
    let payload: { detail?: string } = {};
    try {
      payload = JSON.parse(row.payload ?? "{}") as { detail?: string };
    } catch {
      continue;
    }
    const priorPct = extractEarningsGrowthPct(payload.detail ?? "");
    if (priorPct === null) continue;

    // Conflict: figures differ by more than 0.01% (floating-point tolerance)
    if (Math.abs(priorPct - newPct) > 0.01) {
      return (
        `[WARNING] Conflict: prior signal shows ${priorPct}%, ` +
        `this signal shows ${newPct}% — verify source`
      );
    }
  }

  return null;
}
