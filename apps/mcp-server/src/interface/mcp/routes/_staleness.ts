/**
 * _staleness.ts — Shared staleness-computation utility
 *
 * REAUDIT-002 (NFR-C-1): Each mcp-server endpoint with stored data must signal
 * whether its data is stale, so the frontend can render a stale-data banner.
 *
 * This is a pure interface-layer utility (no DB I/O, no domain rules).
 * DDD layer: interface/mcp/routes — import ONLY from this file within handlers.
 *
 * @module interface/mcp/routes/_staleness
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result of staleness computation — always present on affected response roots. */
export interface StalenessResult {
  /** true when calendar days since asOfDate > thresholdDays */
  stale: boolean;
  /** Calendar days past threshold (0 when not stale) */
  staleByDays: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeStaleness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute whether a stored-data endpoint is stale relative to a threshold.
 *
 * Algorithm:
 *   1. If asOfDate is null/undefined/empty → { stale: false, staleByDays: 0 }.
 *   2. Parse asOfDate (YYYY-MM-DD or ISO 8601) to UTC midnight.
 *   3. Calendar days elapsed = floor((now - asOfDate) / MS_PER_DAY).
 *   4. stale = daysDiff > thresholdDays.
 *   5. staleByDays = stale ? daysDiff - thresholdDays : 0.
 *
 * Uses calendar days (not trading days) — staleness SLA is wall-clock based.
 *
 * @param asOfDate      - Date the data was last updated (YYYY-MM-DD or ISO 8601); null safe
 * @param thresholdDays - Number of calendar days after which data is considered stale
 * @param now           - Reference clock (default: new Date()); injectable for testing
 * @returns StalenessResult
 */
export function computeStaleness(
  asOfDate: string | null | undefined,
  thresholdDays: number,
  now: Date = new Date(),
): StalenessResult {
  // Null / empty guard — no asOf means we cannot determine staleness
  if (!asOfDate) {
    return { stale: false, staleByDays: 0 };
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Parse: take only the YYYY-MM-DD portion to normalise ISO 8601 timestamps
  const datePart = asOfDate.slice(0, 10);
  const asOfMs = Date.parse(datePart);

  // Unparseable date → treat as no asOf
  if (isNaN(asOfMs)) {
    return { stale: false, staleByDays: 0 };
  }

  const daysDiff = Math.floor((now.getTime() - asOfMs) / MS_PER_DAY);

  if (daysDiff > thresholdDays) {
    return { stale: true, staleByDays: daysDiff - thresholdDays };
  }

  return { stale: false, staleByDays: 0 };
}
