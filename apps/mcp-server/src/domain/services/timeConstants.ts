/**
 * Time Constants — Shared Duration Values
 *
 * Canonical source for commonly-used time durations to prevent duplication.
 * Pure constants only — no functions, no I/O.
 *
 * Layer: domain/services — pure, immutable constants
 */

/** Milliseconds in one calendar day (24 * 60 * 60 * 1000) */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Milliseconds in one hour (60 * 60 * 1000) */
export const MS_PER_HOUR = 60 * 60 * 1000;

/** Milliseconds in one minute (60 * 1000) */
export const MS_PER_MINUTE = 60 * 1000;

/** Vietnam timezone offset in milliseconds (UTC+7 = 7 * 3600_000) */
export const VN_OFFSET_MS = 7 * 3600_000;

/**
 * VN Index freshness window — 25 hours in milliseconds.
 * An evening report is considered valid if the VN Index data is
 * no older than 25h (covers one trading session + buffer for off-hours restarts).
 * Used by eveningReportIsValid() and isVnIndexFresh().
 */
export const VN_INDEX_FRESHNESS_MS = 25 * MS_PER_HOUR;
