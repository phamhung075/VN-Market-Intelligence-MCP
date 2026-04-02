/**
 * Alert Mute Checker — Task 222
 *
 * Pure domain function that checks whether a stock's alerts are currently
 * suppressed (muted).  No I/O — all state is passed in as parameters.
 *
 * @module domain/services/alertMuteChecker
 */

/**
 * Returns `true` when the given stock code has an active (non-expired) mute.
 *
 * @param code  - Stock ticker to check (e.g. "VCB")
 * @param mutes - Map of stock code → mute expiry Date
 * @returns     `true` if muted and expiry is in the future, `false` otherwise
 */
export function isStockMuted(code: string, mutes: Map<string, Date>): boolean {
  const until = mutes.get(code);
  if (!until) return false;
  return until.getTime() > Date.now();
}
