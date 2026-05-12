/**
 * Domain Service — Fed Liquidity Spread
 *
 * Computes the spread between the Effective Federal Funds Rate (EFFR) and
 * the Interest on Reserve Balances (IORB). A widening spread signals excess
 * reserves flowing toward riskier assets (risk-on); narrowing signals
 * tightening liquidity conditions.
 *
 * This is a PURE domain function — zero infrastructure imports, zero DB access,
 * zero Date.now() calls. The caller is responsible for supplying pre-loaded
 * time-series samples.
 *
 * Trend classification (OLS slope of spread vs day-index over last 30 samples):
 *   slope > +0.01  → 'widening'
 *   slope < -0.01  → 'narrowing'
 *   else           → 'stable'
 *
 * Task: 1879b — Fed Liquidity Spread MCP Tool
 *
 * @module domain/services/macro/computeFedLiquiditySpread
 */

// ─────────────────────────────────────────────────────────────────────────────
// Error types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when the samples array is empty — computation is impossible
 * with zero data points.
 */
export class InsufficientDataError extends Error {
  constructor(message = "No samples provided: at least 1 row required") {
    super(message);
    this.name = "InsufficientDataError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A single daily observation of EFFR and IORB rates (in percent). */
export interface FedSpreadSample {
  date: string;  // ISO 8601 date string, e.g. "2026-01-15"
  effr: number;  // Effective Fed Funds Rate (%)
  iorb: number;  // Interest on Reserve Balances (%)
}

/** Trend direction of the EFFR–IORB spread over the last 30 samples. */
export type SpreadTrend = "widening" | "narrowing" | "stable";

/** Output of computeFedLiquiditySpread. */
export interface FedLiquiditySpreadResult {
  /** Latest EFFR value (%) */
  effr: number;
  /** Latest IORB value (%) */
  iorb: number;
  /** Latest spread = effr − iorb (%) */
  spread: number;
  /** Date of the latest sample (ISO 8601 date string) */
  asOf: string;
  /** 30-day trend via OLS slope; null when fewer than 30 samples provided */
  trend30d: SpreadTrend | null;
  /** Total number of samples passed in (for auditability) */
  samples: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// OLS helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the OLS (ordinary least squares) slope of a numeric series
 * against its index (0, 1, 2, …, n-1).
 *
 * Returns 0 for single-element series (slope is undefined, treated as stable).
 */
function olsSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  // x̄ = (n-1) / 2
  const xMean = (n - 1) / 2;
  // ȳ
  let ySum = 0;
  for (let i = 0; i < n; i++) ySum += values[i] ?? 0;
  const yMean = ySum / n;

  let ssXY = 0;
  let ssXX = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    const yi = values[i] ?? 0;
    ssXY += dx * (yi - yMean);
    ssXX += dx * dx;
  }

  return ssXX === 0 ? 0 : ssXY / ssXX;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core domain function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the Fed Liquidity Spread from a pre-loaded time-series of EFFR/IORB.
 *
 * @param samples  Array of daily observations, sorted ASC by date.
 *                 Must be non-empty; otherwise throws InsufficientDataError.
 * @returns        FedLiquiditySpreadResult — pure output, no side effects.
 * @throws         InsufficientDataError if samples.length < 1.
 */
export function computeFedLiquiditySpread(
  samples: FedSpreadSample[],
): FedLiquiditySpreadResult {
  if (samples.length < 1) {
    throw new InsufficientDataError();
  }

  // ── Latest values ──────────────────────────────────────────────────────────
  // Safety: we know samples.length >= 1 after the guard above
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const latest = samples[samples.length - 1]!;
  const effr = latest.effr;
  const iorb = latest.iorb;
  const spread = effr - iorb;

  // ── Trend: OLS slope over last 30 samples ──────────────────────────────────
  let trend30d: SpreadTrend | null = null;

  if (samples.length >= 30) {
    const window30 = samples.slice(-30);
    const spreads = window30.map((s) => s.effr - s.iorb);
    const slope = olsSlope(spreads);

    if (slope > 0.01) {
      trend30d = "widening";
    } else if (slope < -0.01) {
      trend30d = "narrowing";
    } else {
      trend30d = "stable";
    }
  }

  return {
    effr,
    iorb,
    spread,
    asOf: latest.date,
    trend30d,
    samples: samples.length,
  };
}
