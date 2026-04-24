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
