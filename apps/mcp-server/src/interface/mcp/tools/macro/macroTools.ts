/**
 * Task P2-B1 — MCP Tool Handler HTTP Rewire (R-3 Unblock)
 *
 * Interface layer: registers the `get_macro_snapshot` MCP tool.
 * Previously imported domain services directly; now routes through HTTP to
 * the macro-indicators microservice (port 5004).
 *
 * Tools registered:
 *   1. get_macro_snapshot — HTTP POST to macro-indicators /snapshot endpoint.
 *
 * HTTP base URL: read from env var MACRO_INDICATORS_URL (see macroHttpClient.ts).
 * Graceful failure: returns { error: "macro-indicators service unavailable" } on any
 * HTTP error or network failure.
 *
 * NOTE: formatThienThoi() and formatDinhGia() are kept as exported pure helpers
 * for backward compatibility with existing tests (1423d, 1570c). Signal computation
 * is inlined directly so domain service imports are no longer required.
 *
 * @module interface/mcp/tools/macro
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../../../infrastructure/logger.js";
import { getMacroBaseUrl } from "./macroHttpClient.js";
import { macroFetch } from "../../../../infrastructure/fetchers/fetchDeadline.js";
import { buildMacroSnapshotText } from "./macroSnapshotText.js";
import { applyVnIndexPlausibilityGate } from "./macroVnIndexGate.js";

// Re-exported for backward compatibility with existing test imports
// (FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT.test.ts imports buildMacroSnapshotText
// from macroTools.js) — implementation now lives in macroSnapshotText.ts
// (FIX-CI-SIZELINT-MACROTOOLS-HUMANIZE-618L extraction, zero behaviour change).
export { buildMacroSnapshotText } from "./macroSnapshotText.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types (kept for test compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** Aggregated macro snapshot (legacy type, kept for backward compat). */
export interface MacroSnapshotResponse {
  commodity: unknown | null;
  rates: unknown | null;
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thien Thoi — Global Liquidity Regime inputs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-computed inputs for the [Global Macro Inputs — Thien Thoi] display block.
 * All values are 0 when the underlying data is unavailable.
 */
export interface ThienThoiInputs {
  /** Current DXY level (0 = unavailable). */
  dxy: number;
  /** 30-day mean DXY from commodity_prices_history (0 = no history). */
  dxy30dMean: number;
  /** US 10-year Treasury yield % (0 = unavailable). */
  us10yYield: number;
  /** VND max deposit rate % — used as vndRate in carry computation. */
  vndDepositRate: number;
  /** US Fed Funds rate % — from tracked_indicators or 5.33 fallback. */
  fedFundsRate: number;
  /** True when fedFundsRate is the static fallback (no DB row found). */
  fedFundsRateIsEstimate: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dinh Gia — Asset Valuation inputs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-computed inputs for the [Dinh Gia — Asset Valuation] display block.
 * All required values must be > 0; callers set them to 0 when unavailable.
 */
export interface DinhGiaInputs {
  /** Market earnings yield (%) — e.g. 7.32 means 7.32% p.a. */
  earningYield: number;
  /** Median P/E across watchlist tickers — e.g. 13.65 */
  medianPE: number;
  /** SBV max deposit rate (%) — e.g. 5.50 means 5.50% p.a. */
  depositRate: number;
  /** Number of tickers with valid PE — e.g. 28 */
  coverageCount: number;
  /** Total watchlist size used as denominator — e.g. 30 */
  totalWatchlist: number;
  /** "YYYY-QN" string of the latest financial period seen — e.g. "2024-Q4" */
  dataAsOf: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers — signal rules (presentation layer, inlined)
//
// TASK-USDVND-TS-STATIC-RETIRE (Plane 1, 2026-08-23): oilSignal()/goldSignal()/
// policySignal()/currencySignal() DELETED — confirmed zero callers repo-wide
// (each was a single occurrence = its own definition). Pure debt removal per
// docs/architecture-briefs/2026-08-23-fix-usdvnd-threshold-ssot.md §0 Finding A
// / §2 Plane 1. currencySignal() was also the dead-code twin of the static
// `usdVnd>25500`/`<25500` narrative label this brief's Plane 2 retires from
// the LIVE cascade rule set (macroAdjustments.ts) — deleting both closes the
// SSOT conflict's dead-code third of the story, not just the live two-thirds.
// dxyLabel()/us10yLabel() below ARE live (3/2 real callers) — kept unchanged.
// ─────────────────────────────────────────────────────────────────────────────

function dxyLabel(dxy: number, mean30d: number): string {
  if (mean30d === 0) return "USD STABLE";
  const diffPct = ((dxy - mean30d) / mean30d) * 100;
  if (diffPct > 2) return "USD STRENGTHENING -> EM pressure";
  if (diffPct < -2) return "USD WEAKENING -> EM tailwind";
  return "USD STABLE";
}

function us10yLabel(yield10y: number): string {
  if (yield10y > 4.5) return "RISK-OFF threshold — PE compression signal";
  if (yield10y < 4.0) return "RISK-ON — equity multiple expansion";
  return "NEUTRAL";
}

// ─────────────────────────────────────────────────────────────────────────────
// Inlined carry trade signal computation (no domain import required)
// Thresholds: spread >2.5% → HOT_MONEY_INFLOW, <0.5% → FII_OUTFLOW_RISK
// ─────────────────────────────────────────────────────────────────────────────

interface InlineCarryResult {
  carrySpread: number;
  regime: "HOT_MONEY_INFLOW" | "NEUTRAL" | "FII_OUTFLOW_RISK";
}

function computeCarryInline(vndRate: number, fedRate: number): InlineCarryResult {
  const rawSpread = vndRate - fedRate;
  const carrySpread = Math.round(rawSpread * 100) / 100;
  let regime: InlineCarryResult["regime"];
  if (carrySpread > 2.5) {
    regime = "HOT_MONEY_INFLOW";
  } else if (carrySpread >= 0.5) {
    regime = "NEUTRAL";
  } else {
    regime = "FII_OUTFLOW_RISK";
  }
  return { carrySpread, regime };
}

// ─────────────────────────────────────────────────────────────────────────────
// DSI-S1-MACRO: Carry provenance — FR-MAC-3 / FR-MAC-4
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured carry provenance metadata (DSI-INV-1 compliant).
 * Returned by buildCarryProvenance() alongside the inline carry result.
 */
export interface CarryProvenance {
  /** Carry spread in pp, or null when inputs are estimated. */
  carrySpread: number | null;
  /** Regime label, or null when inputs are estimated. */
  regime: "HOT_MONEY_INFLOW" | "NEUTRAL" | "FII_OUTFLOW_RISK" | null;
  /** True when either fedFunds or vndDeposit is from a hardcoded estimate. */
  is_estimate: boolean;
  /** Source tier — 4 (fixture/estimate) when is_estimate=true, 2 (aggregator) otherwise. */
  source_tier: 1 | 2 | 3 | 4;
  /** True timestamp of the last real EFFR fetch from fred_series_daily MAX(date).
   *  Null if no EFFR row exists in the DB. */
  fedFundsFetchedAt: string | null;
}

/**
 * Build carry provenance metadata for DSI-INV-1 compliance.
 *
 * FR-MAC-3: when fedFundsRateIsEstimate=true, carry result is null + is_estimate=true.
 * FR-MAC-4: fedFundsFetchedAt comes from MAX(date) in fred_series_daily, never time.Now().
 *
 * @param vndRate            SBV max deposit rate (%)
 * @param fedRate            Fed Funds rate (%)
 * @param fedFundsIsEstimate True when fedRate is from hardcoded fixture
 * @param vndDepositIsEstimate True when vndRate is from hardcoded SBV fallback
 * @param effrMaxDate        MAX(date) from fred_series_daily WHERE series='EFFR' — null if absent
 */
export function buildCarryProvenance(
  vndRate: number,
  fedRate: number,
  fedFundsIsEstimate: boolean,
  vndDepositIsEstimate: boolean,
  effrMaxDate: string | null,
): CarryProvenance {
  const anyEstimate = fedFundsIsEstimate || vndDepositIsEstimate;

  if (anyEstimate) {
    return {
      carrySpread: null,
      regime: null,
      is_estimate: true,
      source_tier: 4,
      fedFundsFetchedAt: effrMaxDate,
    };
  }

  const carry = computeCarryInline(vndRate, fedRate);
  return {
    carrySpread: carry.carrySpread,
    regime: carry.regime,
    is_estimate: false,
    source_tier: 2,
    fedFundsFetchedAt: effrMaxDate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DSI-S1-MACRO: dataSource downgrade — FR-MAC-6
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Component fields that can each have an estimate/stale state.
 * Used to compute the overall dataSource for the macro snapshot.
 */
export interface MacroDataSourceInputs {
  fedFundsIsEstimate: boolean;
  vndDepositIsEstimate: boolean;
  oilIsEstimate?: boolean;
  goldIsEstimate?: boolean;
  usdVndIsEstimate?: boolean;
}

/**
 * Compute the top-level dataSource for a macro snapshot response.
 * FR-MAC-6: `dataSource` MUST be "live" ONLY when ALL component fields are
 * fresh within their SLA window AND is_estimate=false. Otherwise: "estimate"
 * (either input is a fixture), "stale" (data is old), or "fixture" (hardcoded).
 *
 * Conservative: any estimate component → "estimate". All live → "live".
 */
export function computeMacroDataSource(
  inputs: MacroDataSourceInputs,
): "live" | "fixture" | "stale" | "estimate" {
  const anyEstimate = inputs.fedFundsIsEstimate
    || inputs.vndDepositIsEstimate
    || (inputs.oilIsEstimate ?? false)
    || (inputs.goldIsEstimate ?? false)
    || (inputs.usdVndIsEstimate ?? false);

  if (anyEstimate) {
    // Both carry inputs are from hardcoded constants → "estimate"
    // (could be "fixture" if ALL are hardcoded, but "estimate" is the correct DSI term
    //  per the spec: source_tier:4 + is_estimate:true → "estimate")
    return "estimate";
  }
  return "live";
}

function globalLiquidityLabel(
  dxySig: string,
  yield10y: number,
  carryRegime: string,
): string {
  let tight = 0;
  let ease = 0;

  if (dxySig.includes("STRENGTHENING")) tight++;
  if (dxySig.includes("WEAKENING")) ease++;

  if (yield10y > 4.5) tight++;
  else if (yield10y < 4.0) ease++;

  if (carryRegime === "FII_OUTFLOW_RISK") tight++;
  else if (carryRegime === "HOT_MONEY_INFLOW") ease++;

  if (tight > ease && tight >= 2) return "TIGHTENING";
  if (ease > tight && ease >= 2) return "EASING";
  return "NEUTRAL";
}

// ─────────────────────────────────────────────────────────────────────────────
// Inlined yield spread signal computation (no domain import required)
// Thresholds: spread >2pp → CHEAP, >0 → FAIRLY_VALUED, ≤0 → EXPENSIVE
// ─────────────────────────────────────────────────────────────────────────────

interface InlineYieldResult {
  spread: number;
  label: "CHEAP" | "FAIRLY_VALUED" | "EXPENSIVE" | "UNKNOWN";
}

function computeYieldInline(earningYield: number, depositRate: number): InlineYieldResult {
  if (earningYield === 0 || depositRate === 0) {
    return { spread: 0, label: "UNKNOWN" };
  }
  const rawSpread = earningYield - depositRate;
  const spread = Math.round(rawSpread * 100) / 100;
  let label: InlineYieldResult["label"];
  if (spread > 2) {
    label = "CHEAP";
  } else if (spread > 0) {
    label = "FAIRLY_VALUED";
  } else {
    label = "EXPENSIVE";
  }
  return { spread, label };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported pure helpers — kept for test backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the [Global Macro Inputs — Thien Thoi] block.
 * Returns an array of lines (no trailing blank line — caller appends).
 * All zero values are shown as "unavailable".
 */
export function formatThienThoi(inputs: ThienThoiInputs): string[] {
  const lines: string[] = ["[Global Macro Inputs — Thien Thoi]"];

  if (inputs.dxy === 0) {
    lines.push("  DXY:              unavailable");
  } else {
    const dxySig = dxyLabel(inputs.dxy, inputs.dxy30dMean);
    lines.push(`  DXY:              ${inputs.dxy.toFixed(2)} — ${dxySig}`);
  }

  if (inputs.us10yYield === 0) {
    lines.push("  US 10Y Yield:     unavailable");
  } else {
    lines.push(
      `  US 10Y Yield:     ${inputs.us10yYield.toFixed(2)}% — ${us10yLabel(inputs.us10yYield)}`,
    );
  }

  const fedLabel = inputs.fedFundsRateIsEstimate ? " (est.)" : " (FRED)";
  if (inputs.fedFundsRate === 0) {
    lines.push("  Fed Funds Rate:   unavailable");
  } else {
    lines.push(
      `  Fed Funds Rate:   ${inputs.fedFundsRate.toFixed(2)}%${fedLabel}`,
    );
  }

  // FR-MAC-1 (DSI-S1-MACRO): gate carry on fedFundsRateIsEstimate.
  // When isEstimate=true, the fedFunds value is a hardcoded fixture (e.g. 5.33).
  // We MUST NOT compute or emit a carry spread or FII_OUTFLOW_RISK regime from
  // fixture arithmetic — doing so produces false regime signals (cf. FB posts 06-01..06-04).
  if (inputs.fedFundsRateIsEstimate) {
    lines.push("  VND Carry Spread: unavailable — est. rate");
    lines.push("  Global Liquidity: NEUTRAL");
    return lines;
  }

  if (inputs.vndDepositRate === 0 || inputs.fedFundsRate === 0) {
    lines.push("  VND Carry Spread: unavailable");
    lines.push("  Global Liquidity: NEUTRAL");
    return lines;
  }

  const carry = computeCarryInline(inputs.vndDepositRate, inputs.fedFundsRate);
  const spreadSign = carry.carrySpread >= 0 ? "+" : "";
  lines.push(
    `  VND Carry Spread: ${spreadSign}${carry.carrySpread.toFixed(2)}% (VND ${inputs.vndDepositRate}% - Fed ${inputs.fedFundsRate}%) — ${carry.regime}`,
  );

  const dxySig = inputs.dxy === 0 ? "USD STABLE" : dxyLabel(inputs.dxy, inputs.dxy30dMean);
  const liquidity = globalLiquidityLabel(dxySig, inputs.us10yYield, carry.regime);
  lines.push(`  Global Liquidity: ${liquidity}`);

  return lines;
}

/**
 * Format the [Dinh Gia — Asset Valuation] block.
 * Returns an array of lines (no trailing blank line — caller appends).
 * Shows "unavailable" when earningYield or depositRate is 0.
 */
export function formatDinhGia(inputs: DinhGiaInputs): string[] {
  const lines: string[] = ["[Dinh Gia — Asset Valuation]"];

  if (inputs.earningYield === 0 || inputs.depositRate === 0) {
    lines.push("  unavailable");
    return lines;
  }

  const signal = computeYieldInline(inputs.earningYield, inputs.depositRate);
  const spreadSign = signal.spread >= 0 ? "+" : "";

  const coverageSuffix =
    inputs.coverageCount > 0 && inputs.totalWatchlist > 0
      ? `, coverage: ${inputs.coverageCount}/${inputs.totalWatchlist}`
      : "";

  lines.push(
    `  Market Earning Yield:  ${inputs.earningYield.toFixed(2)}% (median P/E: ${inputs.medianPE.toFixed(2)}${coverageSuffix})`,
  );
  lines.push(`  Max Deposit Rate:      ${inputs.depositRate.toFixed(2)}%`);
  lines.push(
    `  Yield Spread:          ${spreadSign}${signal.spread.toFixed(2)}% — ${signal.label}`,
  );

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// DSI-S1-MACRO: FR-MAC-6 — dataSource honest downgrade
// ─────────────────────────────────────────────────────────────────────────────

// FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT generic human-readable text renderer
// (humanizeKey/formatScalar/renderSection/buildMacroSnapshotText) now lives
// in ./macroSnapshotText.ts — extracted by FIX-CI-SIZELINT-MACROTOOLS-
// HUMANIZE-618L (self-contained renderer, no coupling to tool registration
// below; zero behaviour change). Imported + re-exported above.

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register macro MCP tools: get_macro_snapshot.
 * Routes exclusively via HTTP to macro-indicators service (port 5004).
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerMacroTools(server: McpServer): void {
  const baseUrl = getMacroBaseUrl();

  // ── get_macro_snapshot ─────────────────────────────────────────────────────
  server.tool(
    "get_macro_snapshot",
    "Fetch live macro indicators via the macro-indicators microservice. " +
      "Returns a formatted macro intelligence summary including commodity prices, " +
      "SBV central bank rates, carry trade regime, yield spread signal, and sector signals. " +
      "Routes through HTTP POST to the macro-indicators service (port 5004). " +
      "Source tier: worst-of every present signal component (baseline 2 for the " +
      "aggregator; higher, e.g. 4, if any present component is an estimate/fixture).",
    {
      /** Optional request body fields forwarded to the Go service. */
      _params: z.record(z.unknown()).optional(),
    },
    async (args) => {
      const { _params } = args as { _params?: Record<string, unknown> };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await macroFetch<Record<string, any>>(
        baseUrl,
        "/snapshot",
        _params ?? {},
        { deadlineMs: 15_000 },
      );

      if (!result.ok) {
        logger.warn("[get_macro_snapshot] macro-indicators unavailable", {
          degrade: result.degrade,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 2 as const,
                error: "macro-indicators service unavailable",
              }, null, 2),
            },
          ],
        };
      }

      const data = result.data;

      // FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE: MUST run before both
      // downstream reads of `data` below — buildMacroSnapshotText (prose) and
      // the raw `data` field in the returned JSON envelope — see
      // macroVnIndexGate.ts for the full incident context, guard wiring, and
      // gap-token contract (extracted per the FIX-CI-SIZELINT-MACROTOOLS-
      // HUMANIZE-618L precedent — this file's own established convention for
      // self-contained blocks that push it over the size-lint baseline).
      applyVnIndexPlausibilityGate(data);

      // DSI-INV-1 (FU-MACRO-SNAPSHOT-TIER-WORSTOF): derive source_tier honestly as the
      // WORST (max) tier across every signal component actually PRESENT in the response
      // — not carry-only. A component that is ABSENT never enters the max (it is NOT
      // treated as tier 0/best-case); only present components' source_tier values count.
      // Generic over data.signals so any future component (beyond today's carry + yield)
      // is picked up automatically, without a future edit here.
      // FDA-7: if no present component carries a tier annotation (older Go build that
      // omits provenance entirely, or signals entirely absent), default CONSERVATIVELY
      // to 4 (unknown/worst tier) rather than optimistically to 2 (aggregator tier) —
      // an omitted tier is unknown provenance, not a confirmed-live aggregator response.
      const isSourceTier = (v: unknown): v is 1 | 2 | 3 | 4 =>
        v === 1 || v === 2 || v === 3 || v === 4;
      const presentTiers = Object.values(
        (data?.signals ?? {}) as Record<string, { source_tier?: unknown } | undefined>,
      )
        .map((component) => component?.source_tier)
        .filter(isSourceTier);
      const sourceTier: 1 | 2 | 3 | 4 =
        presentTiers.length > 0 ? (Math.max(...presentTiers) as 1 | 2 | 3 | 4) : 4;

      // fetchedAt: use the true source timestamp from the Go service response, never
      // re-stamp now on omission (FDA-7) — a fresh stamp would make a stale/older-build
      // snapshot masquerade as freshly fetched. If the Go service omits fetchedAt, surface
      // the absence explicitly as null (fail-loud provenance) rather than fabricating one.
      const fetchedAt: string | null = (data?.fetchedAt as string | undefined) ?? null;

      // text: human-readable Vietnamese-market-friendly section block, built
      // generically from `data` (FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT — no
      // per-field/per-ticker hardcode; see buildMacroSnapshotText above).
      const text = buildMacroSnapshotText(data, fetchedAt);

      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          source_tier: sourceTier,
          text,
          fetchedAt,
          // Raw upstream payload, passed through verbatim alongside the prose
          // `text` above — synthesizing agents that need typed values (e.g.
          // signals.carry.regime) read `data` directly instead of parsing
          // prose. Envelope-level contract otherwise unchanged.
          data,
        }, null, 2) }],
      };
    },
  );
}
