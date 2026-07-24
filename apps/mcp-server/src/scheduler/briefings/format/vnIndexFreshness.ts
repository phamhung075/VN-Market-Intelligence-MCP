/**
 * VN-Index freshness formatter — extracted from eveningSummaryJob.ts
 * (FACTORY-SCHEDULER-dedup-briefing-formatters).
 *
 * Verbatim move — no logic change. Was cross-imported by morningBriefingJob.ts
 * and franceSummaryJob.ts, creating a job→job dependency; now all three jobs
 * import from this shared module instead.
 *
 * Layer: interface/scheduler — imports from domain/services only.
 */

import { VN_INDEX_FRESHNESS_MS } from "../../../domain/services/timeConstants.js";

// ─────────────────────────────────────────────────────────────────────────────
// Freshness guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when a vnIndex fetchedAt timestamp is within the last 25 hours.
 * A stale index (e.g. VPS down for >25h) must not trigger a send on its own.
 */
export function isVnIndexFresh(
  fetchedAt: string,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - new Date(fetchedAt).getTime() < VN_INDEX_FRESHNESS_MS;
}
