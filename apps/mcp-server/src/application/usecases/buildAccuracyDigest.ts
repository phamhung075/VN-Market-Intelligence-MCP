/**
 * buildAccuracyDigest.ts — Application use-case layer (Task 1941c)
 *
 * Pure function: accepts SystemAccuracyDigestStats + date string, returns
 * a formatted Telegram body for the daily WORK accuracy digest.
 *
 * No DB access, no HTTP calls — pure transformation.
 *
 * AC-11 format:
 *   [YYYY-MM-DD] Signal accuracy digest (30d)
 *   System accuracy: X.X% (N correct / M total)
 *
 *   Top 3 (by accuracy):
 *     1. <signal_type>: X.X% (N samples)
 *     2. ...
 *     3. ...
 *
 *   Bottom 3 (by accuracy):
 *     1. <signal_type>: X.X% (N samples)
 *     ...
 *
 *   New stocks: X stocks with <3 samples
 *
 * AC-8 short digest (all outcomes neutral):
 *   [YYYY-MM-DD] Signal accuracy digest (30d)
 *   System accuracy: n/a (all outcomes neutral — no directional resolution possible today)
 *   New stocks: X stocks with <3 samples
 *
 * DDD layer: application/usecases — pure function, no infrastructure imports.
 */

import type { SystemAccuracyDigestStats } from "../../infrastructure/db/signalOutcomeStore.js";

/**
 * Format a rate (0–1) as percentage with 1 decimal, e.g. 0.634 → "63.4%".
 */
function fmtRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Build the daily accuracy WORK digest Telegram body.
 *
 * @param stats   - SystemAccuracyDigestStats from getSystemAccuracyDigestStats()
 * @param dateStr - Date string in YYYY-MM-DD format (UTC day of the digest)
 */
export function buildAccuracyDigestText(
  stats: SystemAccuracyDigestStats,
  dateStr: string,
): string {
  const lines: string[] = [];

  lines.push(`[${dateStr}] Signal accuracy digest (30d)`);

  // AC-8: All rows exist but all outcomes are neutral → short digest
  if (stats.totalResolved === 0 && stats.neutralOnlyRows > 0) {
    lines.push(
      `System accuracy: n/a (all outcomes neutral — no directional resolution possible today)`,
    );
    lines.push(`New stocks: ${stats.newStocksCount} stocks with <3 samples`);
    return lines.join("\n");
  }

  // AC-4: overall accuracy line
  if (stats.overallRate !== null) {
    lines.push(
      `System accuracy: ${fmtRate(stats.overallRate)} (${stats.totalCorrect} correct / ${stats.totalResolved} total)`,
    );
  } else {
    lines.push(
      `System accuracy: n/a (insufficient data — ${stats.totalResolved} resolved rows, need >=10)`,
    );
  }
  lines.push("");

  // AC-5: Top 3 by accuracy DESC
  const sorted = [...stats.bySignalType].sort((a, b) => b.rate - a.rate);
  const top3 = sorted.slice(0, 3);
  if (top3.length > 0) {
    lines.push(`Top 3 (by accuracy):`);
    top3.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s.signal_type}: ${fmtRate(s.rate)} (${s.total} samples)`);
    });
    lines.push("");
  }

  // AC-6: Bottom 3 by accuracy ASC
  const bottom3 = [...stats.bySignalType].sort((a, b) => a.rate - b.rate).slice(0, 3);
  if (bottom3.length > 0) {
    lines.push(`Bottom 3 (by accuracy):`);
    bottom3.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s.signal_type}: ${fmtRate(s.rate)} (${s.total} samples)`);
    });
    lines.push("");
  }

  // AC-7: New stocks count
  lines.push(`New stocks: ${stats.newStocksCount} stocks with <3 samples`);

  return lines.join("\n").trimEnd();
}
