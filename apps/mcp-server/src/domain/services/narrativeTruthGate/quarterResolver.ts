/**
 * CCATO-MCP-T1-DOMAIN-ENGINE — Quarter resolver
 *
 * TS port of scripts/narrative-truth-gate.sh's python engine, lines 236-247
 * (`build_arguments`'s `ticker_actionCode_yoy` branch) — resolves the latest
 * FULLY-ELAPSED fiscal quarter and its year-over-year comparison period, for
 * the `financials` dimension's `compare_financials` tool call
 * (docs/data/claim-tool-map.json `arg_style: "ticker_actionCode_yoy"`).
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 *
 * Pure function, zero I/O. Injectable `now: Date` — never reads Date.now()
 * directly, so callers/tests can pin a deterministic date (mandatory per the
 * brief; also matches this codebase's existing injected-clock convention,
 * e.g. alertOutcomeJob.ts's readPendingOutcomeAlerts window).
 */

export type FiscalQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface FiscalPeriod {
  year: number;
  quarter: FiscalQuarter;
}

export interface YoyPeriodPair {
  period1: FiscalPeriod;
  period2: FiscalPeriod;
}

/**
 * Resolve the latest fully-elapsed quarter (`period1`) and the same quarter
 * one year prior (`period2`), as of `now` (UTC).
 *
 * A quarter is "fully elapsed" only once the calendar has moved past its
 * last month — e.g. Q1 (Jan-Mar) is fully elapsed only from April 1 onward.
 * Byte-faithful port of the script's `(month - 1) // 3` integer-division
 * index: `q === 0` (Jan-Mar, no quarter fully elapsed yet this calendar
 * year) rolls back to the PRIOR year's Q4.
 *
 * @param now Injectable clock (UTC month/year read via getUTCMonth/getUTCFullYear).
 */
export function resolveLatestElapsedYoyPeriods(now: Date): YoyPeriodPair {
  const month = now.getUTCMonth() + 1; // JS getUTCMonth() is 0-indexed; align to python's 1-indexed .month
  const year = now.getUTCFullYear();
  const q = Math.floor((month - 1) / 3); // index of the latest fully-elapsed quarter

  let year1: number;
  let quarter1: FiscalQuarter;
  if (q === 0) {
    year1 = year - 1;
    quarter1 = "Q4";
  } else {
    year1 = year;
    quarter1 = `Q${q}` as FiscalQuarter;
  }
  const year2 = year1 - 1;

  return {
    period1: { year: year1, quarter: quarter1 },
    period2: { year: year2, quarter: quarter1 },
  };
}
