/**
 * Domain — Sector Valuation Comparator
 *
 * Pure domain service: no I/O, no infrastructure imports.
 * Compares a stock's PE/PB/ROE against the sector peer median.
 *
 * Classification thresholds (±15% tolerance):
 *   premium  → stock value > median × 1.15
 *   discount → stock value < median × 0.85
 *   inline   → within ±15% of median
 *
 * Layer: domain/services
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValuationTier = "premium" | "discount" | "inline";

export interface ValuationComparison {
  code: string;
  pe: number;
  sectorMedianPe: number;
  peVsSector: ValuationTier;
  pb: number;
  sectorMedianPb: number;
  pbVsSector: ValuationTier;
  roe: number;
  sectorMedianRoe: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Compute the median of a sorted or unsorted array of numbers.
 * For an even-length array, returns the average of the two middle values.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Classify a value vs a reference median with ±TOLERANCE_PCT tolerance.
 */
const TOLERANCE_PCT = 0.15;

export function classifyVsMedian(value: number, med: number): ValuationTier {
  if (med === 0) return "inline";
  const ratio = value / med;
  if (ratio > 1 + TOLERANCE_PCT) return "premium";
  if (ratio < 1 - TOLERANCE_PCT) return "discount";
  return "inline";
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compare a target stock's valuation multiples against a sector peer list.
 *
 * @param target - The stock to evaluate
 * @param sectorPeers - Array of peer stocks (including or excluding target)
 * @returns ValuationComparison with median benchmarks and tier classifications
 *
 * @example
 * const result = compareToSector(
 *   { code: "HDB", pe: 12.0, pb: 1.5, roe: 16.0 },
 *   [{ code: "VCB", pe: 9.0, pb: 2.0, roe: 18.0 }, ...]
 * );
 * // result.peVsSector === "premium" (12 > 9 × 1.15 = 10.35)
 */
export function compareToSector(
  target: { code: string; pe: number; pb: number; roe: number },
  sectorPeers: Array<{ code: string; pe: number; pb: number; roe: number }>,
): ValuationComparison {
  const peerPes = sectorPeers.map((p) => p.pe);
  const peerPbs = sectorPeers.map((p) => p.pb);
  const peerRoes = sectorPeers.map((p) => p.roe);

  const medPe = median(peerPes);
  const medPb = median(peerPbs);
  const medRoe = median(peerRoes);

  return {
    code: target.code,
    pe: target.pe,
    sectorMedianPe: medPe,
    peVsSector: classifyVsMedian(target.pe, medPe),
    pb: target.pb,
    sectorMedianPb: medPb,
    pbVsSector: classifyVsMedian(target.pb, medPb),
    roe: target.roe,
    sectorMedianRoe: medRoe,
  };
}
