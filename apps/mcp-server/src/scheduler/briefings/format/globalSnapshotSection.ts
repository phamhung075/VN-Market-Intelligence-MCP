/**
 * Global market snapshot formatter — extracted from morningBriefingJob.ts
 * (FACTORY-SCHEDULER-dedup-briefing-formatters).
 *
 * Verbatim move — no logic change. Was cross-imported by eveningSummaryJob.ts
 * and franceSummaryJob.ts, creating a job→job dependency; now all three jobs
 * import from this shared module instead.
 *
 * `deltaArrow` is a leaf pure helper also used by morningBriefingJob.ts's
 * formatCommoditiesSection (which stays there — commodities are morning-only).
 * It is intentionally duplicated (not re-exported) rather than reached back
 * across a job file, to keep this module dependency-free.
 *
 * Layer: interface/scheduler — no imports (pure formatter).
 */

/**
 * Returns " ↑" / " ↓" / "" depending on direction vs previous value.
 * Returns "" when prev is undefined or zero (no baseline to compare).
 */
function deltaArrow(current: number, prev: number | undefined): string {
  if (prev === undefined || prev === 0) return "";
  return current > prev ? " ↑" : current < prev ? " ↓" : "";
}

/**
 * Format a global market snapshot as an array of Telegram lines.
 * Returns [] only when snap is null/undefined (guard at call sites).
 * Exported for unit testing (task 1511b).
 */
export function formatGlobalSnapshotSection(
  snap: { vix: number; dxy: number; sp500: number; hangSeng: number; fetchedAt: string; prevVix?: number; prevDxy?: number; prevSp500?: number; prevHangSeng?: number }
): string[] {
  if (!snap) return [];
  return [
    "🌐 Thị trường toàn cầu:",
    `  VIX: ${snap.vix.toFixed(2)}${deltaArrow(snap.vix, snap.prevVix)}`,
    `  DXY: ${snap.dxy.toFixed(2)}${deltaArrow(snap.dxy, snap.prevDxy)}`,
    `  S&P500: ${Math.round(snap.sp500)}${deltaArrow(snap.sp500, snap.prevSp500)}`,
    `  Hang Seng: ${Math.round(snap.hangSeng)}${deltaArrow(snap.hangSeng, snap.prevHangSeng)}`,
  ];
}
