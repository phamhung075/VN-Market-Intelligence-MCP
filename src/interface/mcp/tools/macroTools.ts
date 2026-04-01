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
} from "../../../infrastructure/fetchers/yahooFinance.js";
import {
  fetchSbvRates,
  type SbvMacroSnapshot,
} from "../../../infrastructure/fetchers/sbv.js";
import { logger } from "../../../infrastructure/logger.js";

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
// Output formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the MacroSnapshotResponse into a human-readable text block.
 *
 * @param snapshot - Assembled macro snapshot (commodity + rates).
 * @returns Multi-line text suitable for MCP tool output.
 */
function formatMacroSnapshot(snapshot: MacroSnapshotResponse): string {
  const lines: string[] = [
    "=== Macro Snapshot ===",
    `Generated: ${snapshot.fetchedAt}`,
    "",
  ];

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
      "and aviation sectors. Each source fetch is independently error-isolated.",
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
    },
    async (args) => {
      const { _testCommodityClient, _testSbvClient } = args as {
        _testCommodityClient?: unknown;
        _testSbvClient?: unknown;
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

        // ── Assemble + format ────────────────────────────────────────────────
        const snapshot: MacroSnapshotResponse = {
          commodity,
          rates,
          fetchedAt,
        };

        const text = formatMacroSnapshot(snapshot);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        logger.error("[get_macro_snapshot] Unexpected error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching macro snapshot: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
