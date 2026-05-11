/**
 * Domain utility — ANSI / box-drawing regex and strip helpers
 *
 * Pure functions, no side effects, no imports from infrastructure.
 * Single source of truth for ANSI junk detection used by:
 *   - infrastructure/fetchers/vnstockBridge.ts
 *   - domain/services/bctcDiscovery.ts
 *
 * Layer: domain/utils
 */

/**
 * Matches ANSI escape sequences (colors, cursor moves) AND Unicode
 * box-drawing / Braille ranges emitted by the vnstock `rich` progress bar.
 *
 * Ranges covered:
 *   \x1b[…m/G/K/H/F — standard SGR + cursor control sequences
 *   U+2500–U+257F   — Box Drawing block (─ │ ╭ ╮ ╰ ╯ and variants)
 *   U+2800–U+28FF   — Braille patterns (rich spinner dots)
 *   U+256A–U+2593   — overlaps with Box Drawing (shade/intersection chars)
 */
export const ANSI_JUNK_RE =
  /\x1b\[[0-9;]*[mGKHF]|[\u2500-\u257F\u2800-\u28FF\u256A-\u2593]/g;

/**
 * Matches ANSI escape sequences only (colors, cursor moves).
 * Does NOT strip box-drawing characters — used when the caller needs to
 * strip color codes but still detect box-drawing presence afterwards.
 */
export const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[mGKHF]/g;

/**
 * Box-drawing Unicode range only (U+2500–U+257F).
 * Used by isRateLimitResponse to detect vnstock rate-limit UI output.
 */
export const BOX_DRAWING_RE = /[\u2500-\u257F]/;

/** Shape returned by stripAnsiJunk. */
export interface JunkCheckResult {
  /** True when the cleaned output cannot be JSON. */
  junk: boolean;
  /** True when the value is empty or "null" — treat as no-result. */
  isNull: boolean;
  /** ANSI-stripped string ready for JSON.parse. Empty when junk/isNull. */
  cleaned: string;
}

/**
 * Strip ANSI escape sequences and Unicode box-drawing characters, then
 * validate that what remains looks like JSON before passing to JSON.parse.
 *
 * Pure function — no logging, no side effects.
 */
export function stripAnsiJunk(raw: string): JunkCheckResult {
  const cleaned = raw.replace(ANSI_JUNK_RE, "").trim();

  if (!cleaned || cleaned === "null") {
    return { junk: false, isNull: true, cleaned: "" };
  }

  if (cleaned[0] !== "{" && cleaned[0] !== "[") {
    return { junk: true, isNull: false, cleaned: "" };
  }

  return { junk: false, isNull: false, cleaned };
}
