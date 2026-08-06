/**
 * Foreign investor flow ("Khối ngoại") formatter — extracted from
 * eveningSummaryJob.ts (FACTORY-SCHEDULER-dedup-briefing-formatters, task 1503
 * originally).
 *
 * Verbatim move — no logic change. Was cross-imported by franceSummaryJob.ts,
 * creating a job→job dependency; now both jobs import from this shared module.
 *
 * Layer: interface/scheduler — no imports (pure formatter).
 */

/**
 * Format the "Khối ngoại" (foreign investor flow) block for a Telegram message.
 *
 * @param movers - Array of ForeignFlowMover entries ordered by |foreignNetVol| DESC.
 * @returns string[] — ready to push onto the message lines array. Empty when movers is empty.
 */
export function formatForeignFlowSection(
  movers: { code: string; foreignNetVol: number; foreignBuyVol: number; foreignSellVol: number }[],
): string[] {
  if (movers.length === 0) return [];

  // Filter to nonzero net-vol entries only — SQL already excludes zeros, but
  // this defensive guard also covers the injected-fn path and edge cases where
  // a partial-zero set slips through (e.g. getForeignFlowMoversFn returns raw DB rows).
  const nonZeroMovers = movers.filter((m) => m.foreignNetVol !== 0);
  if (nonZeroMovers.length === 0) {
    return ["", "Khối ngoại: Dữ liệu không khả dụng (pipeline tạm dừng)"];
  }

  // Sort by |net_flow| descending — biggest movers first.
  const sorted = [...nonZeroMovers].sort(
    (a, b) => Math.abs(b.foreignNetVol) - Math.abs(a.foreignNetVol),
  );

  const lines: string[] = ["", `Khối ngoại (top ${sorted.length}):`];
  for (const m of sorted) {
    const direction = m.foreignNetVol >= 0 ? "mua ròng" : "bán ròng";
    const netK = (Math.abs(m.foreignNetVol) / 1000).toFixed(3);
    const buyK = (m.foreignBuyVol / 1000).toFixed(3);
    const sellK = (m.foreignSellVol / 1000).toFixed(3);
    lines.push(`  ${m.code}: ${direction} ${netK}k (mua ${buyK}k / bán ${sellK}k)`);
  }
  return lines;
}

/**
 * Same as {@link formatForeignFlowSection}, except a totally empty `movers`
 * array is treated as "no data available" and renders the canonical
 * unavailable line instead of silently returning `[]`
 * (FIX-FFLOW-BULLETIN-OUTAGE-SILENT-OMISSION).
 *
 * Root cause this closes: the default SQL path (assembleEveningSummary.ts /
 * franceSummaryJob.ts) filters to `foreign_net_vol <> 0` before this module
 * ever sees the rows, so a genuine pipeline outage or DB error (caught,
 * movers=[]) is byte-identical to that empty shape — both used to vanish
 * from the bulletin with zero indication anything was wrong (mirror of the
 * already-fixed FIX-FOREIGN-FLOW-BULLETIN-UNAVAIL-STRING, whose canonical
 * copy lived one branch lower and was unreachable by the real query).
 *
 * `formatForeignFlowSection` itself is intentionally left unchanged — its
 * own internal all-zero branch stays reachable for callers that inject raw,
 * unfiltered rows via `getForeignFlowMoversFn` — this wrapper is what
 * production call sites should use instead of calling the pure formatter
 * directly on a possibly-empty array.
 *
 * @param movers - Same shape as formatForeignFlowSection's input.
 * @returns string[] — never silently empty for a truly empty input.
 */
export function formatForeignFlowSectionOrUnavailable(
  movers: { code: string; foreignNetVol: number; foreignBuyVol: number; foreignSellVol: number }[],
): string[] {
  if (movers.length === 0) {
    return ["", "Khối ngoại: Dữ liệu không khả dụng (pipeline tạm dừng)"];
  }
  return formatForeignFlowSection(movers);
}
