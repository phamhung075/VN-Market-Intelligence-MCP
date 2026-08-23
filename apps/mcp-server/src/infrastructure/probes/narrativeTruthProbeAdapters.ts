/**
 * narrativeTruthProbeAdapters.ts — CCATO-MCP-T3-PROBE-ADAPTERS
 *
 * size-justification: 265L — 5 real business-logic adapters
 * (technical_indicators, foreign_flow, macro, financials, market_snapshot)
 * share one cohesive "probe surface" per the architecture brief's DDD layer
 * map — splitting them into separate files would fragment a single dispatch
 * table across files for no factoring benefit (same rationale
 * foreignFlowStore.ts's own header uses).
 *
 * 5 adapter fns, each wrapping an ALREADY-EXPORTED function from the
 * architecture brief's §2.2 reuse map, normalized to a common
 * `ProbeResult = { raw: unknown; isError: boolean }` shape — the exact input
 * shape `verdictClassifier.classifyVerdict()` (T1) expects. Per-adapter
 * try/catch isolation (R-2): a transient TA/macro microservice outage must
 * classify WARN for that candidate only, never abort the whole scan — on
 * catch, adapters return `{ raw: { _probe_error: <message> }, isError: true }`,
 * the exact convention `classifyVerdict()`'s `isProbeErrorWrapper()` already
 * recognizes (byte-faithful parity, not a second error convention).
 *
 * Calls the SAME domain/infrastructure functions the existing 5 production
 * MCP tools call, in-process — zero self-loopback HTTP call to the gateway,
 * zero reliance on the MCP SDK's private `_registeredTools` map (both
 * rejected in §4). Argument shapes mirror `docs/data/claim-tool-map.json`'s
 * `arg_style` values (ticker_code / no_ticker / ticker_actionCode_yoy /
 * ticker_codes_array) — see scripts/narrative-truth-gate.sh's
 * `build_arguments()` for the byte-faithful bash-engine precedent this ports.
 *
 * R-3 (accepted, non-regression): the technical_indicators adapter does NOT
 * replicate get_technical_indicators's Go-service-then-local-DB-fallback dual
 * path — a single computeTAIndicators() call, WARN on failure. Matches the
 * bash engine's own single live call with no fallback (not a new gap).
 *
 * Each `probeXxx` fn takes its real dependency as a trailing optional param
 * (defaults to the real import) — same injectable-dependency convention T1
 * (`now: Date`) and T4 (`orchStatePath`, `randomSuffixFn`) already use, so
 * tests inject stubs directly with no `mock.module()` global-fetch mocking.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2, §2.2, R-2, R-3, R-4
 */

import { getDb } from "../db/schema.js";
import { computeTAIndicators, type ComputeTAResponse } from "../microservices/clients.js";
import { getForeignFlowHistory } from "../db/vnstockStore.js";
import {
  analyzeForeignFlow,
  type DailyForeignFlow,
  type ForeignFlowSignal,
} from "../../domain/services/foreignFlowAnalyzer.js";
import { macroFetch, type DegradeEnvelope } from "../fetchers/fetchDeadline.js";
import { getMacroBaseUrl } from "../../interface/mcp/tools/macro/macroHttpClient.js";
import { fetchFinancialReportRow, rowToMetrics } from "../../interface/mcp/tools/financial-reports/reports.js";
import { computePeriodDelta } from "../../domain/services/financial-reports/periodDeltaComputer.js";
import { resolveLatestElapsedYoyPeriods } from "../../domain/services/narrativeTruthGate/quarterResolver.js";
import { fetchHosePrices, type MarketPrice } from "../fetchers/hose.js";
import { fetchHnxPrices, fetchUpcomPrices } from "../fetchers/hnx.js";
import type { ClaimCandidate } from "../../domain/services/narrativeTruthGate/claimToolMapTypes.js";

/** Normalized probe outcome — the input shape verdictClassifier.classifyVerdict() expects. */
export interface ProbeResult {
  raw: unknown;
  isError: boolean;
}

/** Wrap a caught error into the classifier's `{_probe_error}` convention (R-2). */
function probeError(err: unknown): ProbeResult {
  return { raw: { _probe_error: err instanceof Error ? err.message : String(err) }, isError: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// technical_indicators — get_technical_indicators / computeTAIndicators (R-3)
// ─────────────────────────────────────────────────────────────────────────────

export async function probeTechnicalIndicators(
  ticker: string,
  computeFn: (req: { code: string; closes?: number[] }) => Promise<ComputeTAResponse> = computeTAIndicators,
): Promise<ProbeResult> {
  try {
    const result = await computeFn({ code: ticker });
    return { raw: result, isError: false };
  } catch (err) {
    return probeError(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// foreign_flow — get_foreign_flow / getForeignFlowHistory + analyzeForeignFlow
// Guard messages mirror foreignFlowTools.ts's own wording so tool_null_markers
// substring matches ("no data available" / "insufficient data") stay aligned.
// ─────────────────────────────────────────────────────────────────────────────

export async function probeForeignFlow(
  ticker: string,
  historyFn: (code: string, days?: number) => DailyForeignFlow[] = getForeignFlowHistory,
  analyzeFn: (history: DailyForeignFlow[]) => ForeignFlowSignal | null = analyzeForeignFlow,
): Promise<ProbeResult> {
  try {
    const history = historyFn(ticker, 10);
    if (history.length === 0 || history.every((r) => r.foreignVolume === 0)) {
      return {
        raw: { note: `No data available for ${ticker}: foreign investor volume has not been collected yet.` },
        isError: false,
      };
    }
    if (history.length < 2) {
      return {
        raw: { note: `Insufficient foreign flow data for ${ticker}: only ${history.length} row(s) found.` },
        isError: false,
      };
    }
    const signal = analyzeFn(history);
    if (signal === null) {
      return {
        raw: { note: `Insufficient foreign flow data for ${ticker}: analysis returned null.` },
        isError: false,
      };
    }
    return { raw: signal, isError: false };
  } catch (err) {
    return probeError(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// macro — get_macro_snapshot / macroFetch (no_ticker arg_style)
// ─────────────────────────────────────────────────────────────────────────────

type MacroFetchFn = (
  baseUrl: string,
  path: string,
  body: unknown,
  opts: { deadlineMs: number },
) => Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; degrade: DegradeEnvelope }>;

export async function probeMacro(
  fetchFn: MacroFetchFn = macroFetch,
  baseUrlFn: () => string = getMacroBaseUrl,
): Promise<ProbeResult> {
  try {
    const result = await fetchFn(baseUrlFn(), "/snapshot", {}, { deadlineMs: 15_000 });
    if (!result.ok) {
      return { raw: { _probe_error: `macro-indicators unavailable: ${result.degrade.reason}` }, isError: true };
    }
    return { raw: result.data, isError: false };
  } catch (err) {
    return probeError(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// financials — compare_financials / fetchFinancialReportRow (R-4 extraction)
//   + computePeriodDelta. Period pair from quarterResolver (T1). "Period(s)
//   not found" message matches tool_null_markers' literal substring.
// ─────────────────────────────────────────────────────────────────────────────

export async function probeFinancials(
  ticker: string,
  now: Date = new Date(),
  fetchRowFn: typeof fetchFinancialReportRow = fetchFinancialReportRow,
): Promise<ProbeResult> {
  try {
    const { period1, period2 } = resolveLatestElapsedYoyPeriods(now);
    const row1 = fetchRowFn(ticker, period1.year, period1.quarter);
    const row2 = fetchRowFn(ticker, period2.year, period2.quarter);

    if (!row1 || !row2) {
      const missing: string[] = [];
      if (!row1) missing.push(`${period1.year}-${period1.quarter}`);
      if (!row2) missing.push(`${period2.year}-${period2.quarter}`);
      return {
        raw: { note: `Period(s) not found in database for ${ticker}: ${missing.join(", ")}.` },
        isError: false,
      };
    }

    const deltaType = period1.year !== period2.year ? "YoY" : "QoQ";
    const delta = computePeriodDelta(rowToMetrics(row1), rowToMetrics(row2), deltaType);
    return { raw: delta, isError: false };
  } catch (err) {
    return probeError(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// market_snapshot — get_market_snapshot / fetchHosePrices|fetchHnxPrices|
//   fetchUpcomPrices (ticker_codes_array arg_style). Exchange classification
//   mirrors marketTools.ts's own market_prices lookup, defaulting unknown
//   codes to HOSE (same try/catch-and-default idiom — market_prices may lack
//   the `exchange` column on a fresh DB).
// ─────────────────────────────────────────────────────────────────────────────

function resolveExchange(ticker: string): "HOSE" | "HNX" | "UPCOM" {
  try {
    const row = getDb()
      .query<{ exchange: string }, [string]>("SELECT exchange FROM market_prices WHERE code = ?")
      .get(ticker.toUpperCase());
    if (row?.exchange === "HNX") return "HNX";
    if (row?.exchange === "UPCOM") return "UPCOM";
  } catch {
    // market_prices may not have the exchange column yet — treat as HOSE.
  }
  return "HOSE";
}

export async function probeMarketSnapshot(
  ticker: string,
  fetchHoseFn: typeof fetchHosePrices = fetchHosePrices,
  fetchHnxFn: typeof fetchHnxPrices = fetchHnxPrices,
  fetchUpcomFn: typeof fetchUpcomPrices = fetchUpcomPrices,
): Promise<ProbeResult> {
  try {
    const exchange = resolveExchange(ticker);
    const opts = { force: true };
    let prices: MarketPrice[];
    if (exchange === "HNX") prices = await fetchHnxFn([ticker], undefined, opts);
    else if (exchange === "UPCOM") prices = await fetchUpcomFn([ticker], undefined, opts);
    else prices = await fetchHoseFn([ticker], undefined, opts);
    return { raw: prices, isError: false };
  } catch (err) {
    return probeError(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher — keyed by claim-tool-map.json's `dimensions[].tool` field, the
// same identifier ClaimCandidate.dimension.tool carries (T1). T5's use case
// calls this single entry point, never the individual probeXxx fns directly.
//
// `adapters` is injectable (defaults to DEFAULT_PROBE_ADAPTERS, the real
// production probes) — same DI convention as every probeXxx fn above, so
// callers/tests can exercise dispatch routing with zero network I/O.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProbeAdapterMap {
  get_technical_indicators: (ticker: string) => Promise<ProbeResult>;
  get_foreign_flow: (ticker: string) => Promise<ProbeResult>;
  get_macro_snapshot: (ticker: string) => Promise<ProbeResult>;
  compare_financials: (ticker: string, now: Date) => Promise<ProbeResult>;
  get_market_snapshot: (ticker: string) => Promise<ProbeResult>;
}

export const DEFAULT_PROBE_ADAPTERS: ProbeAdapterMap = {
  get_technical_indicators: (ticker) => probeTechnicalIndicators(ticker),
  get_foreign_flow: (ticker) => probeForeignFlow(ticker),
  get_macro_snapshot: () => probeMacro(),
  compare_financials: (ticker, now) => probeFinancials(ticker, now),
  get_market_snapshot: (ticker) => probeMarketSnapshot(ticker),
};

export function probeDimension(
  candidate: ClaimCandidate,
  now: Date = new Date(),
  adapters: ProbeAdapterMap = DEFAULT_PROBE_ADAPTERS,
): Promise<ProbeResult> {
  const tool = candidate.dimension.tool;
  if (tool === "get_technical_indicators") return adapters.get_technical_indicators(candidate.ticker);
  if (tool === "get_foreign_flow") return adapters.get_foreign_flow(candidate.ticker);
  if (tool === "get_macro_snapshot") return adapters.get_macro_snapshot(candidate.ticker);
  if (tool === "compare_financials") return adapters.compare_financials(candidate.ticker, now);
  if (tool === "get_market_snapshot") return adapters.get_market_snapshot(candidate.ticker);
  return Promise.resolve({
    raw: { _probe_error: `no probe adapter registered for tool "${tool}"` },
    isError: true,
  });
}
