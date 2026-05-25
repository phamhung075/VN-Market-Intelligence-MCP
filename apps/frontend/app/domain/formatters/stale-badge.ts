/**
 * classifyStaleBadge — pure formatter for stale price detection.
 * Domain layer: zero imports from lib/api/, routes/, or components/.
 *
 * Takes a timestamp string and threshold, returns a badge classification.
 * Accepts `now: Date` as a parameter — never calls Date.now() or new Date()
 * internally, making it fully deterministic and testable.
 *
 * New for P1-B4 (not previously in route file — tests the stale-price concept).
 */

export type StaleBadge = "fresh" | "stale" | "unknown";

/**
 * Classify a price timestamp as fresh, stale, or unknown.
 * "unknown" when timestamp is absent or cannot be parsed.
 * "stale"   when age > thresholdMinutes.
 * "fresh"   otherwise.
 *
 * @param timestamp - ISO 8601 or SQLite "YYYY-MM-DD HH:MM:SS" datetime string
 * @param thresholdMinutes - age threshold in minutes
 * @param now - current time (injected for determinism — never calls Date.now internally)
 */
export function classifyStaleBadge(
  timestamp: string | undefined,
  thresholdMinutes: number,
  now: Date
): StaleBadge {
  if (timestamp === undefined || timestamp === null || timestamp === "") {
    return "unknown";
  }

  // Normalise SQLite "YYYY-MM-DD HH:MM:SS" to a valid ISO string
  const iso = timestamp.includes("T") ? timestamp : timestamp.replace(" ", "T") + "Z";

  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return "unknown";
  }

  const ageMs = now.getTime() - d.getTime();
  const ageMinutes = ageMs / 60_000;

  if (ageMinutes > thresholdMinutes) {
    return "stale";
  }
  return "fresh";
}
