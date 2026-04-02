/**
 * Domain service — Pearson correlation matrix for stock return series.
 *
 * Pure business logic: no I/O, no database, no HTTP.
 *
 * Exports:
 *   pearsonCorrelation       — r for two equal-length number arrays
 *   computeCorrelationMatrix — all C(n,2) pairs from a Map of return series
 *   diversificationScore     — portfolio diversification metric: 1 - avg|r|
 *
 * All numbers represent daily log-return or simple-return percentages.
 * The caller is responsible for computing returns from price series before
 * passing them to these functions.
 *
 * @module domain/services/correlationCalculator
 */

// ---------------------------------------------------------------------------
// pearsonCorrelation
// ---------------------------------------------------------------------------

/**
 * Computes the Pearson product-moment correlation coefficient r for two
 * equal-length numeric arrays.
 *
 * r = Σ[(xᵢ - x̄)(yᵢ - ȳ)] / sqrt[Σ(xᵢ - x̄)² · Σ(yᵢ - ȳ)²]
 *
 * @param xs - Array of values for variable X (e.g. daily returns of stock A).
 * @param ys - Array of values for variable Y (e.g. daily returns of stock B).
 * @returns r ∈ [-1, 1], or NaN when either series has zero variance.
 * @throws Error when arrays are empty or have different lengths.
 */
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length === 0 || ys.length === 0) {
    throw new Error("pearsonCorrelation: arrays must not be empty");
  }
  if (xs.length !== ys.length) {
    throw new Error(
      `pearsonCorrelation: arrays must have the same length (got ${xs.length} vs ${ys.length})`,
    );
  }

  const n = xs.length;

  // Compute means
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  // Compute numerator and denominators
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);

  // Zero denominator means at least one series is constant → undefined
  if (denominator === 0) return NaN;

  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// computeCorrelationMatrix
// ---------------------------------------------------------------------------

/**
 * Represents a single pair result from the correlation matrix.
 */
export interface CorrelationPair {
  /** The two stock codes being correlated, e.g. ["VCB", "FPT"]. */
  pair: [string, string];
  /** Pearson r coefficient ∈ [-1, 1]. */
  r: number;
}

/**
 * Computes all C(n, 2) pairwise Pearson correlations for a set of stock
 * return series.
 *
 * Pairs where r is NaN (constant return series) are excluded from the result.
 * Pairs are emitted in lexicographic order by stock code.
 *
 * @param stockReturns - Map from stock code → array of daily returns.
 *   All arrays should ideally have the same length. If lengths differ, only
 *   the minimum-length prefix is used.
 * @returns Array of CorrelationPair, one per valid stock pair.
 */
export function computeCorrelationMatrix(
  stockReturns: Map<string, number[]>,
): CorrelationPair[] {
  const codes = Array.from(stockReturns.keys()).sort();

  if (codes.length < 2) return [];

  const result: CorrelationPair[] = [];

  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const codeA = codes[i] as string;
      const codeB = codes[j] as string;
      const seriesA = stockReturns.get(codeA);
      const seriesB = stockReturns.get(codeB);
      if (!seriesA || !seriesB) continue;

      // Use the minimum length to keep arrays aligned
      const len = Math.min(seriesA.length, seriesB.length);
      if (len < 2) continue;

      const slicedA = len === seriesA.length ? seriesA : seriesA.slice(0, len);
      const slicedB = len === seriesB.length ? seriesB : seriesB.slice(0, len);

      try {
        const r = pearsonCorrelation(slicedA, slicedB);
        if (!Number.isNaN(r)) {
          result.push({ pair: [codeA, codeB], r });
        }
      } catch {
        // Skip any pair that throws (empty arrays, etc.)
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// diversificationScore
// ---------------------------------------------------------------------------

/**
 * Computes a portfolio diversification score in [0, 1].
 *
 * Score = 1 - mean(|rᵢ|)  for all pairs.
 *
 * Interpretation:
 *   1.00 — All pairs uncorrelated (maximum diversification).
 *   0.00 — All pairs perfectly correlated (no diversification benefit).
 *   0.50 — Moderate diversification.
 *
 * Returns 1.0 when the correlations array is empty (vacuously maximally
 * diversified — no pairs to contradict it).
 *
 * @param correlations - Array of objects with an `r` field.
 * @returns Diversification score ∈ [0, 1].
 */
export function diversificationScore(correlations: { r: number }[]): number {
  if (correlations.length === 0) return 1.0;

  const sumAbsR = correlations.reduce((acc, c) => acc + Math.abs(c.r), 0);
  const avgAbsR = sumAbsR / correlations.length;

  // Clamp to [0, 1] to guard against floating-point overshoot
  return Math.max(0, Math.min(1, 1 - avgAbsR));
}

// ---------------------------------------------------------------------------
// Label helpers (used by MCP tool for Vietnamese output)
// ---------------------------------------------------------------------------

/**
 * Maps an r value to a Vietnamese correlation level label.
 *
 * |r| range → label
 *   [0.00, 0.20) → "Rat thap"   (very low)
 *   [0.20, 0.40) → "Thap"       (low)
 *   [0.40, 0.60) → "Trung binh" (moderate)
 *   [0.60, 0.80) → "Cao"        (high)  + warning emoji indicator
 *   [0.80, 1.00] → "Rat cao"    (very high) + warning emoji indicator
 */
export function correlationLabel(r: number): { label: string; warn: boolean } {
  const abs = Math.abs(r);
  if (abs < 0.2) return { label: "Rat thap", warn: false };
  if (abs < 0.4) return { label: "Thap", warn: false };
  if (abs < 0.6) return { label: "Trung binh", warn: false };
  if (abs < 0.8) return { label: "Cao", warn: true };
  return { label: "Rat cao", warn: true };
}

/**
 * Maps a diversification score to a Vietnamese grade string.
 *
 * score range → grade
 *   [0.80, 1.00] → "Tot"        (good)
 *   [0.60, 0.80) → "Trung binh" (average)
 *   [0.40, 0.60) → "Kem"        (below average)
 *   [0.00, 0.40) → "Rat kem"    (poor)
 */
export function diversificationGrade(score: number): string {
  if (score >= 0.8) return "Tot";
  if (score >= 0.6) return "Trung binh";
  if (score >= 0.4) return "Kem";
  return "Rat kem";
}
