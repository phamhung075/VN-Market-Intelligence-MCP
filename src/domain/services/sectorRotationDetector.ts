/**
 * Sector Rotation Detector — Domain Service
 *
 * Pure domain function that classifies sectors by money flow direction
 * based on 1-day and 5-day returns.
 *
 * Classification rules:
 *   - "DONG_TIEN_VAO" (inflow)  : ALL stocks in sector have 5d return > +2%
 *                                   AND 1d return > +0.5%
 *   - "DONG_TIEN_RA" (outflow)  : ALL stocks in sector have 5d return < -2%
 *                                   AND 1d return < -0.5%
 *   - "NEUTRAL"                 : anything else (mixed, insufficient data, etc.)
 *
 * Layer: domain/services — pure, no I/O.
 */

import type { DomainType } from "../../../bctc-schema.js";
import { SECTOR_NAME_VI } from "./sectorPeers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Sector-code lookup (built from SECTOR_PEERS via sectorPeers.ts)
// We need to know which sector each code belongs to.
// We import getSectorPeers lazily to avoid duplicating the peer list.
// ─────────────────────────────────────────────────────────────────────────────

// All domain types (mirrors bctc-schema DomainType union)
const ALL_DOMAINS: DomainType[] = [
  "banking", "tech", "real_estate", "steel", "oil_gas", "aviation",
  "retail", "securities", "utilities", "agriculture", "insurance",
  "pharma", "logistics", "gold_mining", "automotive", "other",
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Price data for a single stock needed to compute 1d and 5d returns. */
export interface SectorPriceData {
  /** Stock ticker code. */
  code: string;
  /** Current price. */
  priceNow: number;
  /** Price 1 trading day ago, or null if unavailable. */
  price1dAgo: number | null;
  /** Price 5 trading days ago, or null if unavailable. */
  price5dAgo: number | null;
}

/** Classification outcome for a single sector. */
export type SectorClassification = "DONG_TIEN_VAO" | "DONG_TIEN_RA" | "NEUTRAL";

/** Aggregated result for a single sector. */
export interface SectorRotationEntry {
  /** Sector domain key. */
  sector: DomainType;
  /** Vietnamese display name for the sector. */
  sectorNameVi: string;
  /** Classification of money flow direction. */
  classification: SectorClassification;
  /** Average 5d return across all stocks with data, or null. */
  avg5dReturn: number | null;
  /** Average 1d return across all stocks with data, or null. */
  avg1dReturn: number | null;
  /** Stock codes included in this sector computation. */
  stocks: string[];
  /** True if a watchlist stock is in this sector AND sector is DONG_TIEN_RA. */
  watchlistWarning: boolean;
}

/** Top-level result of sector rotation detection. */
export interface SectorRotationResult {
  /** Sectors with data, ranked by avg 5d return descending. */
  sectors: SectorRotationEntry[];
  /** True if any price data was provided. */
  hasData: boolean;
  /**
   * True when price data exists but only 1d history is available
   * (price5dAgo is null for all stocks).
   */
  only1dAvailable: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum 5d return (%) for inflow classification. */
export const INFLOW_5D_THRESHOLD = 2.0;

/** Minimum 1d return (%) for inflow classification. */
export const INFLOW_1D_THRESHOLD = 0.5;

/** Maximum 5d return (%) for outflow classification (must be strictly below). */
export const OUTFLOW_5D_THRESHOLD = -2.0;

/** Maximum 1d return (%) for outflow classification (must be strictly below). */
export const OUTFLOW_1D_THRESHOLD = -0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute percentage return between two prices.
 *
 * @param priceNow   - Current price.
 * @param pricePrior - Prior price (denominator), or null if unavailable.
 * @returns Percentage change (e.g. 5.0 = +5%), or null if pricePrior is missing/zero.
 */
export function computeReturn(
  priceNow: number,
  pricePrior: number | null,
): number | null {
  if (pricePrior === null || pricePrior === 0) return null;
  return ((priceNow - pricePrior) / pricePrior) * 100;
}

/**
 * Classify a sector's money flow based on its stocks' 1d and 5d returns.
 *
 * A sector is classified as DONG_TIEN_VAO only when EVERY stock that has
 * both 1d and 5d price data meets the inflow threshold; similarly for
 * DONG_TIEN_RA. If no stock has prior data, returns NEUTRAL.
 *
 * @param stocks - Array of price data for stocks in the sector.
 * @returns Classification label.
 */
export function classifySector(stocks: SectorPriceData[]): SectorClassification {
  if (stocks.length === 0) return "NEUTRAL";

  // Compute returns for each stock
  const stockReturns = stocks.map((s) => ({
    code: s.code,
    return5d: computeReturn(s.priceNow, s.price5dAgo),
    return1d: computeReturn(s.priceNow, s.price1dAgo),
  }));

  // Filter to stocks that have both 5d and 1d data
  const stocksWithBoth = stockReturns.filter(
    (r) => r.return5d !== null && r.return1d !== null,
  );

  // If no stocks have both data points, cannot classify
  if (stocksWithBoth.length === 0) return "NEUTRAL";

  // DONG_TIEN_VAO: ALL stocks with data must meet inflow thresholds
  const allInflow = stocksWithBoth.every(
    (r) =>
      (r.return5d as number) > INFLOW_5D_THRESHOLD &&
      (r.return1d as number) > INFLOW_1D_THRESHOLD,
  );
  if (allInflow) return "DONG_TIEN_VAO";

  // DONG_TIEN_RA: ALL stocks with data must meet outflow thresholds
  const allOutflow = stocksWithBoth.every(
    (r) =>
      (r.return5d as number) < OUTFLOW_5D_THRESHOLD &&
      (r.return1d as number) < OUTFLOW_1D_THRESHOLD,
  );
  if (allOutflow) return "DONG_TIEN_RA";

  return "NEUTRAL";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sector code assignment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a map from uppercase stock code → DomainType using the SECTOR_PEERS data.
 * Constructed lazily and cached for performance.
 */
function buildSectorCodeMap(): Map<string, DomainType> {
  // Import inline to avoid module-level circular dependency issues
  // sectorPeers.ts is pure domain and safe to import here.
  // We use a local import of the SECTOR_PEERS-equivalent data.
  // Since SECTOR_PEERS is not exported, we reconstruct via getSectorPeers.
  const map = new Map<string, DomainType>();

  for (const domain of ALL_DOMAINS) {
    if (domain === "other") continue;
    // We call getSectorPeers with an empty exclude set and a large max
    // to get all peers for each sector.
    // Lazy import to avoid circular reference issues in the module graph.
    const { getSectorPeers } = _sectorPeersModule();
    const peers = getSectorPeers(domain, new Set(), 100);
    for (const peer of peers) {
      // Do not overwrite — first assignment wins (sector leader priority)
      if (!map.has(peer.code.toUpperCase())) {
        map.set(peer.code.toUpperCase(), domain);
      }
    }
  }

  return map;
}

let _cachedSectorCodeMap: Map<string, DomainType> | null = null;

/** Lazy accessor for the sector code map. */
function getSectorCodeMap(): Map<string, DomainType> {
  if (_cachedSectorCodeMap === null) {
    _cachedSectorCodeMap = buildSectorCodeMap();
  }
  return _cachedSectorCodeMap;
}

/**
 * Returns the domain type for a stock code, or null if not found.
 * Used to assign stocks to sectors based on the SECTOR_PEERS mapping.
 */
export function getSectorForCode(code: string): DomainType | null {
  return getSectorCodeMap().get(code.toUpperCase()) ?? null;
}

// We use a function wrapper to get the sectorPeers module to avoid
// import-time circular initialisation (both files are domain layer).
function _sectorPeersModule(): { getSectorPeers: typeof import("./sectorPeers.js").getSectorPeers } {
  // Static import is resolved at module load; the function is just a
  // façade for the already-loaded module export.
  return { getSectorPeers };
}

// Top-level static import — used inside _sectorPeersModule()
import { getSectorPeers } from "./sectorPeers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect sector rotation across a set of sectors.
 *
 * The function groups stocks from `priceMap` into their respective sectors
 * using the SECTOR_PEERS mapping, then classifies each sector.
 *
 * @param priceMap       - Map from stock code → price data.
 * @param sectors        - List of sector domain keys to analyse. If empty,
 *                         all sectors that have data in priceMap are used.
 * @param watchlistCodes - Stock codes the user is watching (for outflow warnings).
 * @returns SectorRotationResult with classified sectors sorted by 5d return.
 */
export function detectSectorRotation(
  priceMap: Record<string, SectorPriceData>,
  sectors: DomainType[],
  watchlistCodes: string[],
): SectorRotationResult {
  const watchlistSet = new Set(watchlistCodes.map((c) => c.toUpperCase()));
  const allCodes = Object.keys(priceMap);
  const hasData = allCodes.length > 0;

  // Determine which sectors to analyse
  const sectorsToAnalyse: DomainType[] =
    sectors.length > 0 ? sectors : ALL_DOMAINS;

  // Check if only 1d data is available (no stock has price5dAgo)
  const any5d = allCodes.some((c) => priceMap[c]?.price5dAgo !== null);
  const any1d = allCodes.some((c) => priceMap[c]?.price1dAgo !== null);
  const only1dAvailable = hasData && !any5d && any1d;

  const sectorEntries: SectorRotationEntry[] = [];

  for (const sector of sectorsToAnalyse) {
    // Find stocks in priceMap that belong to this sector
    const sectorStocks = allCodes
      .filter((code) => getSectorForCode(code) === sector)
      .map((code) => priceMap[code]!)
      .filter(Boolean);

    if (sectorStocks.length === 0) continue;

    // Compute average returns
    const returns5d = sectorStocks
      .map((s) => computeReturn(s.priceNow, s.price5dAgo))
      .filter((r): r is number => r !== null);
    const returns1d = sectorStocks
      .map((s) => computeReturn(s.priceNow, s.price1dAgo))
      .filter((r): r is number => r !== null);

    const avg5dReturn =
      returns5d.length > 0
        ? returns5d.reduce((a, b) => a + b, 0) / returns5d.length
        : null;
    const avg1dReturn =
      returns1d.length > 0
        ? returns1d.reduce((a, b) => a + b, 0) / returns1d.length
        : null;

    const classification = classifySector(sectorStocks);
    const hasWatchlistStock = sectorStocks.some((s) =>
      watchlistSet.has(s.code.toUpperCase()),
    );
    const watchlistWarning =
      classification === "DONG_TIEN_RA" && hasWatchlistStock;

    sectorEntries.push({
      sector,
      sectorNameVi: SECTOR_NAME_VI[sector] ?? sector,
      classification,
      avg5dReturn,
      avg1dReturn,
      stocks: sectorStocks.map((s) => s.code),
      watchlistWarning,
    });
  }

  // Sort by avg 5d return descending (nulls at end)
  sectorEntries.sort((a, b) => {
    if (a.avg5dReturn === null && b.avg5dReturn === null) return 0;
    if (a.avg5dReturn === null) return 1;
    if (b.avg5dReturn === null) return -1;
    return b.avg5dReturn - a.avg5dReturn;
  });

  return {
    sectors: sectorEntries,
    hasData,
    only1dAvailable,
  };
}
