/**
 * Orchestration staleness predicate — STALE-AMBER BADGE threshold logic for
 * /dashboard/orchestration.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * FACTORY-FRONTEND-split-orchestration (behavior-preserving refactor): moved
 * verbatim from dashboard.orchestration.tsx's loader (STALE_THRESHOLD_MS +
 * the inline `age > STALE_THRESHOLD_MS` check). Pure move, no behavior change
 * — the loader still owns `fetchedAt` assignment, only the boolean predicate
 * moved here.
 */

/** Staleness threshold: 2 hours. */
export const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/**
 * isStale — true when `tsField` (an ISO-8601 timestamp, typically
 * `head.updated_at ?? last_updated_iso`) is older than STALE_THRESHOLD_MS
 * relative to `now`.
 *
 * A missing/empty `tsField` is NOT stale (mirrors the original loader guard:
 * the `if (tsField)` branch never ran, so `isStale` stayed at its `false`
 * default when the timestamp field was absent).
 *
 * `now` is injectable for testability (defaults to `Date.now()`).
 */
export function isStale(tsField: string | null | undefined, now: number = Date.now()): boolean {
  if (!tsField) return false;
  const age = now - new Date(tsField).getTime();
  return age > STALE_THRESHOLD_MS;
}
