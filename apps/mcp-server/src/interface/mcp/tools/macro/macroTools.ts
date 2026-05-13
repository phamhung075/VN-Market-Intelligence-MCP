/**
 * Task 089 — Macro MCP Tools
 *
 * Interface layer: registers the `get_macro_snapshot` MCP tool.
 *
 * Tools registered:
 *   1. get_macro_snapshot — fetches commodity prices (Yahoo Finance) and
 *      SBV central bank rates in parallel, formats a macro intelligence
 *      summary with signal cascade indicators.
 *
 * Test injection:
 *   _testCommodityClient and _testSbvClient accept either:
 *     - An HttpClient (object with .get method) → passed to real fetcher
 *     - A CommoditySnapshot/SbvMacroSnapshot directly → used as pre-resolved data
 *     - null → simulates fetch failure (section shows "unavailable")
 *
 * @module interface/mcp/tools/macro
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  fetchYahooFinancePrices,
  type CommoditySnapshot,
} from "../../../../infrastructure/fetchers/yahooFinance.js";
import {
  fetchSbvRates,
  type SbvMacroSnapshot,
} from "../../../../infrastructure/fetchers/sbv.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { computeCarryTradeSignal } from "../../../../domain/services/macro/carryTradeSignal.js";
import { computeYieldSpreadSignal } from "../../../../domain/services/macro/yieldSpreadSignal.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Aggregated macro snapshot returned to the MCP caller. */
export interface MacroSnapshotResponse {
  /** Commodity prices from Yahoo Finance, or null if unavailable. */
  commodity: CommoditySnapshot | null;
  /** SBV central bank rates, or null if unavailable. */
  rates: SbvMacroSnapshot | null;
  /** ISO 8601 timestamp when this snapshot was assembled. */
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers — signal rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the energy sector signal text from Brent crude price.
 *
 * @param brent - Brent crude price in USD/bbl.
 */
function oilSignal(brent: number): string {
  if (brent > 90) {
    return `CAO ($${brent.toFixed(0)}/bbl >$90) — tích cực dầu khí (GAS/PVD), áp lực hàng không (HVN/VJC) & logistics`;
  }
  if (brent < 70) {
    return `THẤP ($${brent.toFixed(0)}/bbl <$70) — tiêu cực dầu khí, tích cực hàng không & logistics`;
  }
  return `bình thường ($${brent.toFixed(0)}/bbl)`;
}

/**
 * Derive the gold sector signal text.
 */
function goldSignal(gold: number): string {
  if (gold > 2000) {
    return `CAO ($${gold.toFixed(0)}/oz) — tích cực vàng (PNJ), tín hiệu risk-off nếu quá cao`;
  }
  return `bình thường ($${gold.toFixed(0)}/oz)`;
}

/**
 * Derive the banking/real estate sector signal from the SBV refinancing rate.
 */
function policySignal(refi: number): string {
  if (refi > 6) {
    return `THẮT CHẶT (${refi.toFixed(1)}% >6%) — áp lực ngân hàng (VCB) & bất động sản`;
  }
  if (refi < 4) {
    return `NỚI LỎNG (${refi.toFixed(1)}% <4%) — tích cực ngân hàng & bất động sản`;
  }
  return `bình thường (${refi.toFixed(1)}%)`;
}

/**
 * Derive the currency pressure signal from USD/VND rate.
 *
 * @param usdVnd - USD/VND exchange rate.
 */
function currencySignal(usdVnd: number): string {
  if (usdVnd > 25500) {
    return `HIGH (USD/VND ${Math.round(usdVnd).toLocaleString("en-US")} — trên 25500) — áp lực: hàng không (HVN/VJC), ô tô nhập khẩu (VEA) | tích cực: thép xuất khẩu (HPG), nông sản (VHC)`;
  }
  return `LOW (USD/VND ${Math.round(usdVnd).toLocaleString("en-US")} — below 25500 threshold)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thien Thoi — Global Liquidity Regime inputs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-computed inputs for the [Thien Thoi] display block.
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

/**
 * Derive the DXY trend label and signal for the Thien Thoi block.
 *
 * @param dxy      - Current DXY level.
 * @param mean30d  - 30-day rolling mean DXY (0 if no history).
 */
function dxyLabel(dxy: number, mean30d: number): string {
  if (mean30d === 0) return "USD STABLE";
  const diffPct = ((dxy - mean30d) / mean30d) * 100;
  if (diffPct > 2) return "USD STRENGTHENING -> EM pressure";
  if (diffPct < -2) return "USD WEAKENING -> EM tailwind";
  return "USD STABLE";
}

/**
 * Derive the US 10Y yield label for the Thien Thoi block.
 *
 * @param yield10y - US 10-year Treasury yield %.
 */
function us10yLabel(yield10y: number): string {
  if (yield10y > 4.5) return "RISK-OFF threshold — PE compression signal";
  if (yield10y < 4.0) return "RISK-ON — equity multiple expansion";
  return "NEUTRAL";
}

/**
 * Majority-vote Global Liquidity label from three sub-signals.
 *
 * Tightening signals: DXY strengthening + US10Y > 4.5% + carry FII_OUTFLOW_RISK
 * Easing signals:     DXY weakening + US10Y < 4.0% + carry HOT_MONEY_INFLOW
 * Otherwise:          NEUTRAL
 */
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

/**
 * Format the [Global Macro Inputs — Thien Thoi] block.
 *
 * Returns an array of lines (no trailing blank line — caller appends).
 * All zero values are shown as "unavailable" per the handoff spec.
 */
export function formatThienThoi(inputs: ThienThoiInputs): string[] {
  const lines: string[] = ["[Global Macro Inputs — Thien Thoi]"];

  // ── DXY ───────────────────────────────────────────────────────────────────
  if (inputs.dxy === 0) {
    lines.push("  DXY:              unavailable");
  } else {
    const dxySig = dxyLabel(inputs.dxy, inputs.dxy30dMean);
    lines.push(`  DXY:              ${inputs.dxy.toFixed(2)} — ${dxySig}`);
  }

  // ── US 10Y Yield ──────────────────────────────────────────────────────────
  if (inputs.us10yYield === 0) {
    lines.push("  US 10Y Yield:     unavailable");
  } else {
    lines.push(
      `  US 10Y Yield:     ${inputs.us10yYield.toFixed(2)}% — ${us10yLabel(inputs.us10yYield)}`,
    );
  }

  // ── Fed Funds Rate ────────────────────────────────────────────────────────
  const fedLabel = inputs.fedFundsRateIsEstimate ? " (est.)" : " (FRED)";
  if (inputs.fedFundsRate === 0) {
    lines.push("  Fed Funds Rate:   unavailable");
  } else {
    lines.push(
      `  Fed Funds Rate:   ${inputs.fedFundsRate.toFixed(2)}%${fedLabel}`,
    );
  }

  // ── VND Carry Spread ──────────────────────────────────────────────────────
  if (inputs.vndDepositRate === 0 || inputs.fedFundsRate === 0) {
    lines.push("  VND Carry Spread: unavailable");
    lines.push("  Global Liquidity: NEUTRAL");
    return lines;
  }

  const carry = computeCarryTradeSignal(inputs.vndDepositRate, inputs.fedFundsRate);
  const spreadSign = carry.carrySpread >= 0 ? "+" : "";
  lines.push(
    `  VND Carry Spread: ${spreadSign}${carry.carrySpread.toFixed(2)}% (VND ${inputs.vndDepositRate}% - Fed ${inputs.fedFundsRate}%) — ${carry.regime}`,
  );

  // ── Global Liquidity ──────────────────────────────────────────────────────
  const dxySig = inputs.dxy === 0 ? "USD STABLE" : dxyLabel(inputs.dxy, inputs.dxy30dMean);
  const liquidity = globalLiquidityLabel(dxySig, inputs.us10yYield, carry.regime);
  lines.push(`  Global Liquidity: ${liquidity}`);

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dinh Gia — Asset Valuation inputs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-computed inputs for the [Dinh Gia — Asset Valuation] display block.
 * All required values must be > 0; callers set them to 0 when unavailable
 * (formatDinhGia will then render "unavailable").
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

/**
 * Format the [Dinh Gia — Asset Valuation] block.
 *
 * Returns an array of lines (no trailing blank line — caller appends).
 * Shows "unavailable" when earningYield or depositRate is 0.
 */
export function formatDinhGia(inputs: DinhGiaInputs): string[] {
  const lines: string[] = ["[Dinh Gia — Asset Valuation]"];

  if (inputs.earningYield === 0 || inputs.depositRate === 0) {
    lines.push("  unavailable");
    return lines;
  }

  const signal = computeYieldSpreadSignal(inputs.earningYield, inputs.depositRate);
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
// Output formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the MacroSnapshotResponse into a human-readable text block.
 *
 * @param snapshot    - Assembled macro snapshot (commodity + rates).
 * @param thienThoi   - Optional pre-computed Thien Thoi inputs; omitted in
 *                      legacy/test paths that do not supply DB data.
 * @param dinhGia     - Optional pre-computed Dinh Gia (asset valuation) inputs;
 *                      section is omitted when undefined.
 * @returns Multi-line text suitable for MCP tool output.
 */
function formatMacroSnapshot(
  snapshot: MacroSnapshotResponse,
  thienThoi?: ThienThoiInputs,
  dinhGia?: DinhGiaInputs,
): string {
  const lines: string[] = [
    "=== Macro Snapshot ===",
    `Generated: ${snapshot.fetchedAt}`,
    "",
  ];

  // ── Thien Thoi block (appears FIRST, before commodity) ───────────────────
  if (thienThoi) {
    lines.push(...formatThienThoi(thienThoi));
    lines.push("");
  }

  // ── Dinh Gia block (after Thien Thoi, before Commodity Prices) ───────────
  if (dinhGia) {
    lines.push(...formatDinhGia(dinhGia));
    lines.push("");
  }

  // ── Commodity Prices ──────────────────────────────────────────────────────
  lines.push("[Commodity Prices]");
  if (snapshot.commodity) {
    const c = snapshot.commodity;
    lines.push(
      `  Brent Crude:  ${c.brentCrudeUSD.toFixed(2)} USD/bbl`,
    );
    lines.push(
      `  Gold:        ${c.goldUSDPerOz.toFixed(2)} USD/oz`,
    );
    lines.push(
      `  USD/VND:   ${c.usdVndRate.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    );
  } else {
    lines.push("  unavailable");
  }

  lines.push("");

  // ── SBV Central Bank Rates ────────────────────────────────────────────────
  lines.push("[SBV Central Bank Rates]");
  if (snapshot.rates) {
    const r = snapshot.rates;
    lines.push(
      `  Overnight Rate:    ${r.overnightRatePct.toFixed(2)}%`,
    );
    lines.push(
      `  Refinancing Rate:  ${r.refinancingRatePct.toFixed(2)}%`,
    );
    lines.push(
      `  Max Deposit Rate:  ${r.maxDepositRatePct.toFixed(2)}%`,
    );
    lines.push(
      `  USD/VND Official: ${r.usdVndOfficial.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    );
  } else {
    lines.push("  unavailable");
  }

  lines.push("");

  // ── Macro Signal Summary ──────────────────────────────────────────────────
  lines.push("[Macro Signal Summary]");

  // Energy signal — derived from commodity data
  if (snapshot.commodity) {
    lines.push(
      `  Energy sector:       ${oilSignal(snapshot.commodity.brentCrudeUSD)}`,
    );
    lines.push(
      `  Gold sector:         ${goldSignal(snapshot.commodity.goldUSDPerOz)}`,
    );
    lines.push(
      `  Currency pressure:   ${currencySignal(snapshot.commodity.usdVndRate)}`,
    );
  } else {
    lines.push("  Energy sector:       unavailable");
    lines.push("  Gold sector:         unavailable");
    lines.push("  Currency pressure:   unavailable");
  }

  // Banking/real estate signal — derived from SBV data
  if (snapshot.rates) {
    lines.push(
      `  Banking/Real Estate: ${policySignal(snapshot.rates.refinancingRatePct)}`,
    );
  } else {
    lines.push("  Banking/Real Estate: unavailable");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guard helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the value looks like a pre-resolved CommoditySnapshot
 * (has brentCrudeUSD) rather than an HttpClient (has .get method).
 */
function isCommoditySnapshot(value: unknown): value is CommoditySnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "brentCrudeUSD" in value
  );
}

/**
 * Returns true if the value looks like a pre-resolved SbvMacroSnapshot
 * (has overnightRatePct) rather than an HttpClient.
 */
function isSbvMacroSnapshot(value: unknown): value is SbvMacroSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "overnightRatePct" in value
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register macro MCP tools: get_macro_snapshot.
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerMacroTools(server: McpServer): void {

  // ── get_macro_snapshot ─────────────────────────────────────────────────────
  server.tool(
    "get_macro_snapshot",
    "Fetch live macro indicators: commodity prices (Brent crude, gold, USD/VND) " +
      "from Yahoo Finance and central bank rates (overnight, refinancing, official FX) " +
      "from the State Bank of Vietnam (SBV). Returns a formatted macro intelligence " +
      "summary with signal cascade indicators for energy, gold, banking, real estate " +
      "and aviation sectors. Each source fetch is independently error-isolated. " +
      "Source tier: 2 (aggregator — Yahoo Finance + Vietcombank XML proxy for SBV rates). " +
      "TODO: upgrade to tier 1 when direct SBV REST API is implemented.",
    {
      /**
       * Test-only: inject a CommoditySnapshot object directly (bypasses HTTP),
       * or inject a mock HttpClient, or pass null to simulate fetch failure.
       */
      _testCommodityClient: z.any().optional(),
      /**
       * Test-only: inject an SbvMacroSnapshot object directly (bypasses HTTP),
       * or inject a mock HttpClient, or pass null to simulate fetch failure.
       */
      _testSbvClient: z.any().optional(),
      /**
       * Test-only: inject a DinhGiaInputs object directly (bypasses DB reads).
       * Pass null to simulate DB read failure (section shows "unavailable").
       */
      _testDinhGiaInputs: z.any().optional(),
    },
    async (args) => {
      const { _testCommodityClient, _testSbvClient, _testDinhGiaInputs } = args as {
        _testCommodityClient?: unknown;
        _testSbvClient?: unknown;
        _testDinhGiaInputs?: unknown;
      };

      const fetchedAt = new Date().toISOString();

      try {
        // ── Resolve commodity data ───────────────────────────────────────────
        const commodityPromise: Promise<CommoditySnapshot | null> = (() => {
          // null explicitly passed → simulate failure
          if (_testCommodityClient === null) {
            return Promise.resolve(null);
          }
          // Pre-resolved snapshot injected (test shortcut)
          if (isCommoditySnapshot(_testCommodityClient)) {
            return Promise.resolve(_testCommodityClient);
          }
          // HttpClient injected (real or mock HTTP) or undefined (production)
          const client = _testCommodityClient as Parameters<typeof fetchYahooFinancePrices>[0];
          return fetchYahooFinancePrices(client).catch((err) => {
            logger.warn("[get_macro_snapshot] Yahoo Finance fetch failed", {
              error: err instanceof Error ? err.message : String(err),
            });
            return null;
          });
        })();

        // ── Resolve SBV data ─────────────────────────────────────────────────
        const sbvPromise: Promise<SbvMacroSnapshot | null> = (() => {
          // null explicitly passed → simulate failure
          if (_testSbvClient === null) {
            return Promise.resolve(null);
          }
          // Pre-resolved snapshot injected (test shortcut)
          if (isSbvMacroSnapshot(_testSbvClient)) {
            return Promise.resolve(_testSbvClient);
          }
          // HttpClient injected or undefined (production)
          const client = _testSbvClient as Parameters<typeof fetchSbvRates>[0];
          return fetchSbvRates(client).catch((err) => {
            logger.warn("[get_macro_snapshot] SBV fetch failed", {
              error: err instanceof Error ? err.message : String(err),
            });
            return null;
          });
        })();

        // ── Fetch in parallel ────────────────────────────────────────────────
        const [commodity, rates] = await Promise.all([
          commodityPromise,
          sbvPromise,
        ]);

        // ── Query DB for Thien Thoi inputs ───────────────────────────────────
        let thienThoi: ThienThoiInputs | undefined;
        try {
          await initDatabase();
          const db = getDb();

          // Fed Funds Rate from tracked_indicators (latest FRED row)
          const fedRow = db
            .query<{ value: number }, []>(
              `SELECT value FROM tracked_indicators
               WHERE indicator = 'fed_funds_rate'
               ORDER BY id DESC LIMIT 1`,
            )
            .get();
          const fedFundsRate = fedRow ? fedRow.value : 5.33;
          const fedFundsRateIsEstimate = !fedRow;

          // DXY 30d mean from commodity_prices_history
          const dxyMeanRow = db
            .query<{ mean30d: number }, []>(
              `SELECT AVG(dxy) AS mean30d FROM commodity_prices_history
               WHERE fetched_at >= datetime('now', '-30 days') AND dxy > 0`,
            )
            .get();
          const dxy30dMean = dxyMeanRow?.mean30d ?? 0;

          thienThoi = {
            dxy: commodity?.dxy ?? 0,
            dxy30dMean,
            us10yYield: commodity?.us10yYield ?? 0,
            vndDepositRate: rates?.maxDepositRatePct ?? 0,
            fedFundsRate,
            fedFundsRateIsEstimate,
          };
        } catch (dbErr) {
          logger.warn("[get_macro_snapshot] Thien Thoi DB query failed — section omitted", {
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
          // thienThoi remains undefined — formatMacroSnapshot skips the block
        }

        // ── Query DB for Dinh Gia inputs (or use test injection) ─────────────
        let dinhGiaInputs: DinhGiaInputs | undefined;

        // null explicitly passed → simulate DB failure (section omitted)
        if (_testDinhGiaInputs === null) {
          // dinhGiaInputs remains undefined
        } else if (
          typeof _testDinhGiaInputs === "object" &&
          _testDinhGiaInputs !== null &&
          "earningYield" in _testDinhGiaInputs
        ) {
          // Pre-resolved DinhGiaInputs injected (test shortcut)
          dinhGiaInputs = _testDinhGiaInputs as DinhGiaInputs;
        } else {
          // Production path — read from DB
          try {
            await initDatabase();
            const db = getDb();

            const eyRow = db
              .query<{ value: number }, []>(
                `SELECT value FROM tracked_indicators
                 WHERE indicator = 'market_earning_yield' AND source = 'bau_phase2'
                 ORDER BY extracted_at DESC LIMIT 1`,
              )
              .get();

            const peRow = db
              .query<{ value: number }, []>(
                `SELECT value FROM tracked_indicators
                 WHERE indicator = 'market_median_pe' AND source = 'bau_phase2'
                 ORDER BY extracted_at DESC LIMIT 1`,
              )
              .get();

            const sbvRow = db
              .query<{ max_deposit_rate_pct: number }, []>(
                `SELECT max_deposit_rate_pct FROM sbv_rates ORDER BY fetched_at DESC LIMIT 1`,
              )
              .get();

            if (eyRow && peRow && sbvRow) {
              dinhGiaInputs = {
                earningYield: eyRow.value,
                medianPE: peRow.value,
                depositRate: sbvRow.max_deposit_rate_pct,
                coverageCount: 0,
                totalWatchlist: 30,
                dataAsOf: "",
              };
            }
          } catch (dbErr) {
            logger.warn("[get_macro_snapshot] Dinh Gia DB query failed — section omitted", {
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
            });
            // dinhGiaInputs remains undefined — formatMacroSnapshot skips the block
          }
        }

        // ── Assemble + format ────────────────────────────────────────────────
        const snapshot: MacroSnapshotResponse = {
          commodity,
          rates,
          fetchedAt,
        };

        const text = formatMacroSnapshot(snapshot, thienThoi, dinhGiaInputs);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            source_tier: 2 as const,
            text,
            fetchedAt,
          }, null, 2) }],
        };
      } catch (err) {
        logger.error("[get_macro_snapshot] Unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 2 as const,
                error: `Error fetching macro snapshot: ${(err as Error).message}`,
              }, null, 2),
            },
          ],
        };
      }
    },
  );
}
