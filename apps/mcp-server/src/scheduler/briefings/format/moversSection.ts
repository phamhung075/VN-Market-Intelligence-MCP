/**
 * Watchlist movers (sector-grouped) formatter — extracted from
 * eveningSummaryJob.ts (FACTORY-SCHEDULER-dedup-briefing-formatters, tasks
 * 1424/1425/1794 originally).
 *
 * Verbatim move — no logic change. Consolidated alongside the other briefing
 * formatters into `format/` even though it was not previously cross-imported
 * by another job file, per the ticket's shared-formatters grouping.
 *
 * Layer: interface/scheduler — imports from domain/services only.
 */

import {
  computeSectorAverage,
  getStockProfile,
  SECTOR_NAME_VI,
} from "../../../domain/services/sectorPeers.js";

/**
 * Format a trading volume as a compact human-readable string.
 * >= 1_000_000 → "X.XM", >= 1_000 → "X.XK", otherwise raw rounded number.
 * Examples: 7_000_000 → "7.0M", 500_000 → "500.0K", 1_200 → "1.2K"
 */
function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

/** Mover entry accepted by formatMoversSection. volume and rsi14 are optional. */
type MoverEntry = {
  code: string;
  changePct: number;
  volume?: number;
  rsi14?: number | null;
};

/**
 * Format a single mover ticker line: "CODE: +X.XX% | Vol: Y | RSI: Z"
 * Vol is "N/A" when volume is undefined. RSI is "N/A" when rsi14 is null/undefined.
 */
function fmtMoverLine(prefix: string, m: MoverEntry): string {
  const sign = m.changePct >= 0 ? "+" : "";
  const volStr = m.volume != null ? fmtVolume(m.volume) : "N/A";
  const rsiStr = m.rsi14 != null ? m.rsi14.toFixed(1) : "N/A";
  return `${prefix}${m.code}: ${sign}${m.changePct.toFixed(2)}% | Vol: ${volStr} | RSI: ${rsiStr}`;
}

/**
 * Formats watchlistMovers into sector-grouped + flat lines.
 * Exported for unit-test isolation (Task 1424 / 1425).
 *
 * @param movers - MoverEntry[] sorted |changePct| DESC (from assembleEveningSummary)
 * @returns string[] — ready to push onto the message lines array
 */
export function formatMoversSection(
  movers: MoverEntry[],
): string[] {
  if (movers.length === 0) return [];

  // Group by domain
  const sectorMap = new Map<string, MoverEntry[]>();
  for (const m of movers) {
    const profile = getStockProfile(m.code);
    const domain = profile?.domain ?? "other";
    if (!sectorMap.has(domain)) sectorMap.set(domain, []);
    sectorMap.get(domain)!.push(m);
  }

  // Split: multi-mover sectors (>=2, not "other") vs single-mover
  const multiSectors: { domain: string; movers: MoverEntry[]; avgPct: number }[] = [];
  const singleMovers: MoverEntry[] = [];

  for (const [domain, domainMovers] of sectorMap.entries()) {
    if (domain !== "other" && domainMovers.length >= 2) {
      const avgPct = computeSectorAverage(domainMovers) ?? 0;
      multiSectors.push({ domain, movers: domainMovers, avgPct });
    } else {
      singleMovers.push(...domainMovers);
    }
  }

  // No multi-mover sector → flat block only (backward-compat)
  if (multiSectors.length === 0) {
    const lines: string[] = ["", "Biến động giá:"];
    for (const m of singleMovers) {
      lines.push(fmtMoverLine("  ", m));
    }
    return lines;
  }

  // Sort sectors by |avgPct| DESC
  multiSectors.sort((a, b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));

  const lines: string[] = ["", "Biến động theo ngành:"];
  for (const sector of multiSectors) {
    const sectorLabel = (SECTOR_NAME_VI as Record<string, string>)[sector.domain] ?? sector.domain;
    const sign = sector.avgPct >= 0 ? "+" : "";
    lines.push(`  ${sectorLabel} (+${sector.movers.length} cp): avg ${sign}${sector.avgPct.toFixed(2)}%`);
    for (const m of sector.movers.slice(0, 5)) {
      lines.push(fmtMoverLine("    ", m));
    }
  }

  // Flat block for single-mover tickers
  if (singleMovers.length > 0) {
    lines.push("", "Biến động giá:");
    for (const m of singleMovers) {
      lines.push(fmtMoverLine("  ", m));
    }
  }

  return lines;
}
