/**
 * Intelligence Cycle — Market Hours Check
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Re-exported from intelligenceCycleJob.ts for
 * backward-compatible import paths (existing tests import `isMarketHours`
 * from there directly, unchanged — zero call-site churn).
 *
 * Note: VN_OFFSET_MS is imported from the shared timeConstants module, NOT
 * redefined locally here.
 */

import { VN_OFFSET_MS } from "../../../domain/services/timeConstants.js";

/**
 * Returns true when the given time (defaulting to now) falls within Vietnamese
 * stock market trading hours: Monday–Friday, 09:00–15:30 GMT+7.
 *
 * Implementation uses UTC offset arithmetic to avoid timezone library dependency.
 *
 * @param now - Optional Date to check (defaults to current time)
 */
export function isMarketHours(now?: Date): boolean {
  const date = now ?? new Date();
  // Shift to GMT+7 using UTC arithmetic
  const gmt7 = new Date(date.getTime() + VN_OFFSET_MS);
  const dayOfWeek = gmt7.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hour = gmt7.getUTCHours();
  const minute = gmt7.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;

  // Monday=1 through Friday=5
  if (dayOfWeek < 1 || dayOfWeek > 5) return false;
  // 09:00 = 540 min, 15:30 = 930 min
  return totalMinutes >= 540 && totalMinutes <= 930;
}
