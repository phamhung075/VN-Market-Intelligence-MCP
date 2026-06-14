/**
 * isoWeek.ts — Canonical ISO-8601 week helper
 *
 * FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (2026-06-14)
 *
 * ROOT CAUSE: divergent ISO-week calculations across two dispatch paths produced
 * different week labels for the same Sunday (2026-06-14 → W24 correct, W25 wrong).
 * Any divergence defeats the published-marker dedup gate because the coordinator
 * key becomes `published:digest-sunday:2026-W25` vs `published:digest-sunday:2026-W24`
 * — two distinct keys → double-publish.
 *
 * FIX (A): ONE canonical helper for every digest-predict publish-gate path.
 *   - Implements ISO-8601 / `date +%G-W%V` semantics: week starts Monday, Sunday
 *     belongs to the PREVIOUS week.
 *   - Pure TypeScript, no library dependency, fully injectable clock (testable).
 *   - Exported as the single source of truth for all weekly slot mutex keys.
 *
 * FIX (B) — GENERIC MANDATE: key the guaranteed-weekly slot mutex on the
 *   calendar PERIOD DATE-RANGE (`periodStart`/`periodEnd` in YYYY-MM-DD format),
 *   NOT the derived week-label string.  A one-label divergence cannot defeat
 *   dedup when both paths compute the same period boundaries (they are determined
 *   solely by arithmetic, not by any locale/format variant).
 *
 * Usage:
 *   const period = getISOWeekPeriod();              // now
 *   const period = getISOWeekPeriod(someDate);      // specific date
 *   // periodKey = "2026-06-08/2026-06-14"  ← mutex key; stable across label variants
 *   // weekLabel = "2026-W24"               ← human-readable only; do NOT use as key
 *
 * Verification (must hold):
 *   getISOWeekPeriod(new Date("2026-06-14T00:00:00Z")).weekLabel === "2026-W24"
 *   getISOWeekPeriod(new Date("2026-06-14T00:00:00Z")).periodKey === "2026-06-08/2026-06-14"
 *   getISOWeekPeriod(new Date("2026-06-15T00:00:00Z")).weekLabel === "2026-W25"
 *
 * @module domain/services/isoWeek
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ISOWeekPeriod {
  /** ISO-8601 week label: "YYYY-WNN" (zero-padded).  e.g. "2026-W24"
   *  Uses ISO week-year (%G), not calendar year, for year-boundary correctness.
   *  HUMAN-READABLE ONLY — do NOT use as a mutex key (label variants cause dedup failure). */
  weekLabel: string;

  /** Monday of the ISO week in YYYY-MM-DD (UTC).  e.g. "2026-06-08" */
  periodStart: string;

  /** Sunday of the ISO week in YYYY-MM-DD (UTC).  e.g. "2026-06-14" */
  periodEnd: string;

  /** Canonical mutex key: "YYYY-MM-DD/YYYY-MM-DD" (periodStart/periodEnd).
   *  Use THIS as the publish-marker key for all guaranteed weekly slots.
   *  Two sessions computing different week-labels for the same Sunday still
   *  derive the same periodStart/periodEnd → same mutex key → dedup holds. */
  periodKey: string;

  /** ISO week number (1–53). */
  weekNumber: number;

  /** ISO week-year (differs from calendar year near Jan 1). */
  weekYear: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the ISO-8601 week period for a given Date (defaults to now).
 *
 * Algorithm (pure arithmetic — no library):
 *   1. Find the nearest Monday on-or-before the given date (ISO week start).
 *      Monday = UTC weekday 1.  Sunday = UTC weekday 0, which maps to the
 *      previous Monday (−6 days in ISO-8601 terms).
 *   2. The ISO week's Sunday = Monday + 6 days.
 *   3. ISO week number: Thursday of the same week always belongs to the same
 *      calendar year in ISO-8601.  Week 1 is the week that contains the first
 *      Thursday of the year.  We compute the ISO week number by finding the
 *      Thursday of the week (Monday + 3 days) and calculating its ordinal
 *      position from Jan 1 of its own calendar year.
 *
 * @param date  The reference date.  If omitted, uses the current UTC instant.
 *              Injectable for deterministic unit tests — pass `new Date(fixedMs)`.
 * @returns     ISOWeekPeriod with weekLabel, periodStart, periodEnd, periodKey.
 *
 * @example
 *   // Sunday 2026-06-14 belongs to W24, not W25
 *   getISOWeekPeriod(new Date("2026-06-14T13:47:00Z"))
 *   // → { weekLabel: "2026-W24", periodStart: "2026-06-08", periodEnd: "2026-06-14",
 *   //     periodKey: "2026-06-08/2026-06-14", weekNumber: 24, weekYear: 2026 }
 *
 *   // Monday 2026-06-15 starts W25
 *   getISOWeekPeriod(new Date("2026-06-15T00:00:00Z"))
 *   // → { weekLabel: "2026-W25", periodStart: "2026-06-15", periodEnd: "2026-06-21", ... }
 */
export function getISOWeekPeriod(date?: Date): ISOWeekPeriod {
  const ref = date ?? new Date();

  // ── Step 1: find the Monday of this ISO week ─────────────────────────────
  // UTC day-of-week: 0=Sun, 1=Mon, ..., 6=Sat
  // ISO-8601 day-of-week: 1=Mon, ..., 7=Sun
  // Shift Sunday (0) to 7 so that `(utcDay || 7) - 1` gives 0-based ISO offset
  // from Monday.
  const utcDay = ref.getUTCDay();                    // 0 (Sun) … 6 (Sat)
  const isoOffset = (utcDay === 0 ? 7 : utcDay) - 1; // 0 (Mon) … 6 (Sun)

  // Truncate to UTC midnight of the reference date
  const refMidnightMs =
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());

  const mondayMs = refMidnightMs - isoOffset * 86_400_000;
  const sundayMs = mondayMs + 6 * 86_400_000;

  const monday = new Date(mondayMs);
  const sunday = new Date(sundayMs);

  // ── Step 2: ISO week number via Jan-4 anchor (Thursday rule) ─────────────
  //
  // ISO week 1 is the week containing the first Thursday of the year.
  // Equivalently, Jan 4 is ALWAYS in W01 (since the first Thursday can be no
  // later than Jan 7, and W01 contains at least Jan 4).
  //
  // Algorithm (avoids the off-by-one in the dayOfYear+jan1Offset approach):
  //   a. Thursday of this week = Monday + 3 days.
  //   b. weekYear = Thursday's calendar year.
  //   c. Find Jan 4 of weekYear → get its Monday (= Monday of W01).
  //   d. weekNumber = (monday - mondayOfW01) / 7 days + 1.
  //
  const thursdayMs = mondayMs + 3 * 86_400_000;
  const thursday   = new Date(thursdayMs);
  const weekYear   = thursday.getUTCFullYear();

  // Monday of W01: find Jan 4 of weekYear, then back up to its Monday.
  const jan4Ms = Date.UTC(weekYear, 0, 4); // Jan 4 is always in W01
  const jan4Day = new Date(jan4Ms).getUTCDay();
  const jan4IsoOffset = (jan4Day === 0 ? 7 : jan4Day) - 1; // 0=Mon .. 6=Sun
  const mondayOfW01Ms = jan4Ms - jan4IsoOffset * 86_400_000;

  // Number of full 7-day blocks from W01 Monday to this Monday (0-based).
  const weekNumber = Math.round((mondayMs - mondayOfW01Ms) / (7 * 86_400_000)) + 1;

  // ── Step 3: format ───────────────────────────────────────────────────────
  const paddedWeek = String(weekNumber).padStart(2, "0");
  const weekLabel  = `${weekYear}-W${paddedWeek}`;

  const periodStart = toYMD(monday);
  const periodEnd   = toYMD(sunday);
  const periodKey   = `${periodStart}/${periodEnd}`;

  return { weekLabel, periodStart, periodEnd, periodKey, weekNumber, weekYear };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: format a Date as YYYY-MM-DD (UTC)
// ─────────────────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Published-marker key builder (belt-and-suspenders convenience)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the canonical published-marker task_id for a guaranteed weekly slot.
 *
 * Format: `published:<slotId>:<periodStart>/<periodEnd>`
 * e.g.    `published:digest-sunday:2026-06-08/2026-06-14`
 *
 * Using the period date-range (not the week label) as the key prevents dedup
 * failure when two dispatch paths compute different week-label strings for the
 * same Sunday — both paths derive the same periodStart/periodEnd.
 *
 * @param slotId  Slot identifier, e.g. "digest-sunday" or "tnb-audit".
 * @param date    Reference date (defaults to now).  Pass the same Date to both
 *                paths to guarantee an identical key.
 */
export function buildWeeklyPublishMarkerKey(slotId: string, date?: Date): string {
  const { periodKey } = getISOWeekPeriod(date);
  return `published:${slotId}:${periodKey}`;
}
