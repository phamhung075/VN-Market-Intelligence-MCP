/**
 * classifyCheckVerification — pure formatter for quality-audit check
 * `last_verified` staleness (FE-PG-QUALITY-AUDIT-LASTVERIFIED-RENDER-FIX).
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Wraps classifyStaleBadge (stale-badge.ts) with:
 *   - a runtime `typeof` guard: dashboard.quality-audit.tsx's
 *     parseQualityChecklistDto is a pass-through cast (`raw as
 *     QualityChecklist`), so `last_verified` is present at runtime but its
 *     actual JSON type is NOT statically enforced — it could be any JSON
 *     value even though the DTO type says `string`. Passing a non-string to
 *     classifyStaleBadge would throw (`.includes` on a number/object/array),
 *     so anything that is not a string is treated the same as "missing".
 *   - the fixed 7-day (10080 min) D-PAGE re-verification window from
 *     docs/agents/system-auditor/flow/page-freshness.md Step 2
 *     ("not re-probed within the 7-day window").
 *
 * classifyStaleBadge itself already tolerates all four live timestamp
 * shapes (bare date, second/ms/microsecond-precision ISO) because it feeds
 * the raw string straight into `new Date(...)`, which V8 parses leniently
 * for all four without producing NaN.
 */
import { classifyStaleBadge, type StaleBadge } from "./stale-badge";

export type { StaleBadge };

/** 7 days in minutes — D-PAGE re-verification rotation window. */
export const CHECK_VERIFICATION_WINDOW_MINUTES = 7 * 24 * 60;

/**
 * Classify a check's `last_verified` value as "fresh", "stale", or
 * "unknown" relative to `now`, using the 7-day D-PAGE window.
 *
 * `rawLastVerified` is `unknown` on purpose — see module doc above.
 */
export function classifyCheckVerification(
  rawLastVerified: unknown,
  now: Date,
): StaleBadge {
  const timestamp =
    typeof rawLastVerified === "string" ? rawLastVerified : undefined;
  return classifyStaleBadge(timestamp, CHECK_VERIFICATION_WINDOW_MINUTES, now);
}
