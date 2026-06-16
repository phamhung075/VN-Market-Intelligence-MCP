/**
 * formatDate.ts — reusable robust date-parse + format helpers.
 *
 * Handles:
 *   - Bare SQLite  "YYYY-MM-DD HH:MM:SS"    (space separator, no T, no offset)
 *   - ISO with T   "YYYY-MM-DDTHH:MM:SSZ"   (already valid ISO 8601)
 *   - ISO with ms  "YYYY-MM-DDTHH:MM:SS.sssZ"
 *   - ISO with offset "YYYY-MM-DDTHH:MM:SS+07:00"
 *   - null, undefined, empty string         → returns null / "—"
 *
 * Output is Vietnamese locale (vi-VN) with Asia/Ho_Chi_Minh timezone.
 * NEVER returns "Invalid Date". Unparseable input → null / "—".
 *
 * Zero calls to Date.now() or new Date() without a checked result.
 */

const LOCALE = "vi-VN";
const TIMEZONE = "Asia/Ho_Chi_Minh";

/**
 * Parse any supported timestamp string into a Date.
 *
 * Normalisation order:
 * 1. null / undefined / empty → null
 * 2. Already contains "T"  → pass to Date() as-is (valid ISO)
 * 3. Bare SQLite "YYYY-MM-DD HH:MM:SS" → replace first space with "T" + append "Z"
 *    (SQLite stores UTC; "+" / offset already handled by path 2)
 *
 * Returns null when the resulting Date is NaN.
 */
export function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;

  let iso: string;
  if (raw.includes("T")) {
    iso = raw; // already ISO; Date() handles offsets / millis
  } else {
    // bare SQLite "YYYY-MM-DD HH:MM:SS" — SQLite stores UTC
    iso = raw.replace(" ", "T") + "Z";
  }

  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a timestamp string as a full Vietnamese locale date+time string.
 *
 * Sample outputs:
 *   "2026-06-10 14:35:22"         → "10 thg 6, 2026, 21:35:22"  (UTC → +7)
 *   "2026-06-10T14:35:22.000Z"    → "10 thg 6, 2026, 21:35:22"
 *   "2026-06-10T14:35:22+07:00"   → "10 thg 6, 2026, 14:35:22"
 *   null / "" / "garbage"         → "—"
 */
export function formatDateVi(raw: string | null | undefined): string {
  const d = parseDate(raw);
  if (!d) return "—";
  return d.toLocaleString(LOCALE, { timeZone: TIMEZONE });
}

/**
 * Format a timestamp string as a Vietnamese locale date-only string.
 *
 * Sample outputs:
 *   "2026-06-10 14:35:22"       → "10 thg 6, 2026"
 *   "2026-06-10T00:00:00Z"      → "10 thg 6, 2026"
 *   null / "" / "garbage"       → "—"
 */
export function formatDateOnlyVi(raw: string | null | undefined): string {
  const d = parseDate(raw);
  if (!d) return "—";
  return d.toLocaleDateString(LOCALE, { timeZone: TIMEZONE });
}

/**
 * Format a signal timestamp for compact display (used in signal tables).
 *
 * Rules (compared against caller's local wall-clock day in Ho Chi Minh time):
 *   - Same day as today → "HH:mm"          e.g. "14:35"
 *   - Different day    → "MM-DD HH:mm"     e.g. "06-10 14:35"
 *   - null / empty / unparseable → "—"
 *
 * This function does call Date.now() once for "today" comparison — acceptable
 * because it is a display helper, not a domain calculation.
 */
export function formatSignalTimestamp(raw: string | null | undefined): string {
  const d = parseDate(raw);
  if (!d) return "—";

  const hhmm = d.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
  });

  // Compare date portions in the same timezone
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE }); // "YYYY-MM-DD"
  const signalDayStr = d.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  if (signalDayStr === todayStr) return hhmm;

  // "MM-DD" from YYYY-MM-DD
  const mmdd = signalDayStr.slice(5); // "MM-DD"
  return `${mmdd} ${hhmm}`;
}
