/**
 * cronLivenessClassifier.ts — Pure domain: cron status classification
 * (DASH-CRON-RECHECK-TABLE Zone 1, TASK-DASH-CRON-1)
 *
 * Implements FR-1.6's 4-branch ladder verbatim
 * (docs/handoffs/BA-DASH-CRON-RECHECK-TABLE.md §4 FR-1.6):
 *
 *   last_fire === null                        → NEVER_FIRED
 *   age_ms <= cadenceMs                       → ON_TIME
 *   age_ms <= cadenceMs × thresholdMultiplier  → LATE
 *   age_ms <= cadenceMs × 3                    → MISSED
 *   else                                       → STALE
 *
 * PARITY mandate (AC-8/AC-9, NFR-6): any job schedulerWatchdogJob.ts would alert
 * on (age > cadenceMs × thresholdMultiplier) MUST classify here as MISSED or
 * STALE — never ON_TIME or LATE. This ladder is a strict refinement of the
 * watchdog's binary healthy/alert split (healthy = age <= cadenceMs ×
 * thresholdMultiplier, alert = age > that same threshold), so parity holds by
 * construction — see risk flag R5/R6 in
 * docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md §5.
 *
 * DDD layer: domain — zero imports, pure function, fully unit-testable in
 * isolation (Fence-A: domain must not import infrastructure/interface/scheduler).
 */

export type CronLivenessStatus = "ON_TIME" | "LATE" | "MISSED" | "STALE" | "NEVER_FIRED";

/**
 * Classify a single cron job's liveness.
 *
 * @param nowMs               Server-side "now" in epoch ms (NEVER client time — NFR-2)
 * @param lastFireMs          Epoch ms of the most recent successful/error run, or
 *                            null when the job has never recorded a run (honest
 *                            NEVER_FIRED — NFR-1, no fabricated timestamp)
 * @param cadenceMs           Declared/derived cadence in ms
 * @param thresholdMultiplier Multiplier applied to cadenceMs for the LATE→MISSED boundary
 */
export function classifyCronLiveness(
  nowMs: number,
  lastFireMs: number | null,
  cadenceMs: number,
  thresholdMultiplier: number,
): CronLivenessStatus {
  if (lastFireMs === null) {
    return "NEVER_FIRED";
  }

  const ageMs = nowMs - lastFireMs;

  if (ageMs <= cadenceMs) {
    return "ON_TIME";
  }
  if (ageMs <= cadenceMs * thresholdMultiplier) {
    return "LATE";
  }
  if (ageMs <= cadenceMs * 3) {
    return "MISSED";
  }
  return "STALE";
}
