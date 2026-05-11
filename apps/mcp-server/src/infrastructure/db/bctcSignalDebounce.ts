/**
 * bctcSignalDebounce.ts — Task 1792
 *
 * DB-backed per-ticker+quarter cooldown for the [BCTC-1345b] low-confidence
 * conviction signal alert.
 *
 * Problem: when a BCTC parse job retries rapidly (e.g. 10 calls in 3 min),
 * `parseBctcReport` fires a Telegram bug alert on every call because it has
 * no memory of prior sends.  Reports 2683–2692 showed VCB 2025-Q4 repeated
 * 10× in the bug channel within one minute.
 *
 * Solution: before sending the alert, check `bctc_signal_debounce` for a
 * recent entry with the same (action_code, period_key).  If one exists within
 * the cooldown window, skip the send.  After a successful send, write a new
 * row so subsequent calls are suppressed.
 *
 * Infrastructure layer: DB access only — no HTTP, no Telegram.
 * Callers (`parseBctcReport`) handle Telegram side.
 */

import type { Database } from "bun:sqlite";

/** Default cooldown window: 1 hour (in hours). */
export const BCTC_SIGNAL_DEBOUNCE_HOURS = 1;

/**
 * Check whether a low-confidence signal for this ticker+quarter was already
 * sent within the last `cooldownHours` hours.
 *
 * @param db            - Open SQLite database instance.
 * @param actionCode    - Stock ticker, e.g. "VCB".
 * @param periodKey     - Period identifier, e.g. "2025-Q4".
 * @param cooldownHours - Cooldown window in hours (default: 1).
 * @returns true if the signal was already sent within the window → skip send.
 */
export function isBctcSignalDebounced(
  db: Database,
  actionCode: string,
  periodKey: string,
  cooldownHours = BCTC_SIGNAL_DEBOUNCE_HOURS,
): boolean {
  const row = db
    .query<{ cnt: number }, [string, string, number]>(
      `SELECT COUNT(*) AS cnt
         FROM bctc_signal_debounce
        WHERE action_code = ?
          AND period_key  = ?
          AND sent_at >= datetime('now', ? || ' hours')`,
    )
    .get(actionCode, periodKey, -cooldownHours);

  return (row?.cnt ?? 0) > 0;
}

/**
 * Record that a low-confidence signal was just sent for this ticker+quarter.
 *
 * Uses INSERT OR REPLACE so repeated calls within a session are idempotent
 * (they refresh `sent_at` which is the correct behaviour — it extends the
 * debounce window from the most recent send rather than the first).
 *
 * @param db         - Open SQLite database instance.
 * @param actionCode - Stock ticker, e.g. "VCB".
 * @param periodKey  - Period identifier, e.g. "2025-Q4".
 */
export function recordBctcSignalSent(
  db: Database,
  actionCode: string,
  periodKey: string,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO bctc_signal_debounce (action_code, period_key, sent_at)
     VALUES (?, ?, datetime('now'))`,
  ).run(actionCode, periodKey);
}
