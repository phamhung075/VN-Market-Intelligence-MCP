/**
 * sectorRotationHandler.ts — GET /api/sector-rotation
 *
 * TASK-17 PAGE 9 — "Dòng tiền theo ngành" (Sector Money Flow) analyst page.
 *
 * Key design constraint: STORED DATA ONLY — NO live network fan-out.
 * This endpoint is fast, deterministic, and safe to call at high frequency.
 * The existing MCP tool `get_sector_rotation` does live fan-out; this endpoint
 * is intentionally different (stored snapshot only).
 *
 * Source tables:
 *   - watchlist:              41 codes + their sector (domain column)
 *   - market_prices:          latest snapshot, change_pct = authoritative 1d %
 *   - market_prices_history:  5-day baseline (sparse today; auto-upgrades over time)
 *
 * Domain service reuse:
 *   - detectSectorRotation() from domain/services/sectorRotationDetector
 *   - This handler maps + assembles only — NO SQL here.
 *
 * Live contract (probed 2026-06-11):
 *   - 41 watchlist codes across 14 sectors with price data
 *   - Ground-truth 1d aggregates (avg change_pct per sector, sorted DESC):
 *     agriculture +2.13, chemicals +1.24, other +0.40, utilities +0.18,
 *     machinery 0.0, real_estate -0.06, pharma -0.11, oil_gas -0.25,
 *     banking -0.34, aviation -0.46, steel -0.69, securities -0.88,
 *     tech -1.48, retail -1.66
 *   - only1dAvailable=true (market_prices_history only 2 days deep today)
 *   - classification=NEUTRAL for all sectors under 1d-only mode
 *
 * Display sort:
 *   - only1dAvailable=true (or all avg5dReturn null) → sort by avg1dReturn DESC
 *   - else → sort by avg5dReturn DESC (domain service default)
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt:      string,    // ISO 8601
 *     tradingDate:      string,    // MAX(updated_at) from market_prices, or ""
 *     priceSource:      "stored",
 *     only1dAvailable:  boolean,   // true when no 5d baseline exists
 *     sectors: [
 *       {
 *         sector:          string,  // domain key e.g. "banking"
 *         sectorNameVi:    string,  // Vietnamese display name
 *         classification:  string,  // "DONG_TIEN_VAO" | "DONG_TIEN_RA" | "NEUTRAL"
 *         avg1dReturn:     number|null,
 *         avg5dReturn:     number|null,
 *         stockCount:      number,
 *         stocks:          string[],
 *         watchlistWarning: boolean
 *       }
 *     ],
 *     summary: {
 *       inflow:     number,  // count of DONG_TIEN_VAO sectors
 *       outflow:    number,  // count of DONG_TIEN_RA sectors
 *       neutral:    number,  // count of NEUTRAL sectors
 *       topInflow:  [...],   // up to 5 sectors by avg1dReturn DESC
 *       topOutflow: [...]    // up to 5 sectors by avg1dReturn ASC
 *     },
 *     count: number          // sectors.length
 *   }
 *
 * 200-on-empty (empty sectors[], zeroed summary) when no price data — NO error.
 * 500 JSON on DB error.
 *
 * DDD Layer: interface — db injected by server.ts.
 * No SQL in this file — all DB access via sectorRotationStore (infrastructure).
 * Domain logic via detectSectorRotation (domain/services).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import type { DomainType } from "../../../../bctc-schema.js";
import {
  getWatchlistSectorMap,
  getCurrentPrices,
  getHistoricalBaseline,
} from "../../../infrastructure/db/sectorRotationStore.js";
import {
  detectSectorRotation,
  type SectorPriceData,
  type SectorRotationEntry,
} from "../../../domain/services/sectorRotationDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One sector entry in the response. */
export interface SectorRotationResponseEntry {
  sector: string;
  sectorNameVi: string;
  classification: string;
  avg1dReturn: number | null;
  avg5dReturn: number | null;
  stockCount: number;
  stocks: string[];
  watchlistWarning: boolean;
}

/** Summary block. */
export interface SectorRotationSummary {
  inflow: number;
  outflow: number;
  neutral: number;
  /** Up to 5 sectors by avg1dReturn DESC (best performing). */
  topInflow: SectorRotationResponseEntry[];
  /** Up to 5 sectors by avg1dReturn ASC (worst performing). */
  topOutflow: SectorRotationResponseEntry[];
}

/** Full response body for GET /api/sector-rotation. */
export interface SectorRotationResponse {
  generatedAt: string;
  tradingDate: string;
  priceSource: "stored";
  only1dAvailable: boolean;
  sectors: SectorRotationResponseEntry[];
  summary: SectorRotationSummary;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a SectorRotationEntry from the domain service to the response shape.
 * Exported for unit testing.
 */
export function mapEntry(entry: SectorRotationEntry): SectorRotationResponseEntry {
  return {
    sector: entry.sector,
    sectorNameVi: entry.sectorNameVi,
    classification: entry.classification,
    avg1dReturn: entry.avg1dReturn,
    avg5dReturn: entry.avg5dReturn,
    stockCount: entry.stocks.length,
    stocks: entry.stocks,
    watchlistWarning: entry.watchlistWarning,
  };
}

/**
 * Apply the display sort rule to sectors:
 *   - If only1dAvailable OR all avg5dReturn are null → sort by avg1dReturn DESC
 *   - Otherwise → sort by avg5dReturn DESC (preserving domain-service order)
 *
 * Nulls sort last in both directions.
 * Exported for unit testing.
 */
export function applySortOrder(
  sectors: SectorRotationResponseEntry[],
  only1dAvailable: boolean,
): SectorRotationResponseEntry[] {
  const all5dNull = sectors.every((s) => s.avg5dReturn === null);
  const sortBy1d = only1dAvailable || all5dNull;

  if (sortBy1d) {
    // Sort by avg1dReturn DESC (nulls last)
    return [...sectors].sort((a, b) => {
      if (a.avg1dReturn === null && b.avg1dReturn === null) return 0;
      if (a.avg1dReturn === null) return 1;
      if (b.avg1dReturn === null) return -1;
      return b.avg1dReturn - a.avg1dReturn;
    });
  }

  // Sort by avg5dReturn DESC (nulls last) — matches domain-service default
  return [...sectors].sort((a, b) => {
    if (a.avg5dReturn === null && b.avg5dReturn === null) return 0;
    if (a.avg5dReturn === null) return 1;
    if (b.avg5dReturn === null) return -1;
    return b.avg5dReturn - a.avg5dReturn;
  });
}

/**
 * Build the summary block from the (already sorted) sectors list.
 * topInflow: up to 5 sectors by avg1dReturn DESC (best 1d performers).
 * topOutflow: up to 5 sectors by avg1dReturn ASC (worst 1d performers).
 * Exported for unit testing.
 */
export function buildSummary(
  sectors: SectorRotationResponseEntry[],
): SectorRotationSummary {
  let inflow = 0;
  let outflow = 0;
  let neutral = 0;

  for (const s of sectors) {
    if (s.classification === "DONG_TIEN_VAO") inflow++;
    else if (s.classification === "DONG_TIEN_RA") outflow++;
    else neutral++;
  }

  // topInflow: up to 5, sorted by avg1dReturn DESC (nulls last)
  const byAvg1dDesc = [...sectors].sort((a, b) => {
    if (a.avg1dReturn === null && b.avg1dReturn === null) return 0;
    if (a.avg1dReturn === null) return 1;
    if (b.avg1dReturn === null) return -1;
    return b.avg1dReturn - a.avg1dReturn;
  });
  const topInflow = byAvg1dDesc.slice(0, 5);

  // topOutflow: up to 5, sorted by avg1dReturn ASC (best-to-worst from the bottom)
  const byAvg1dAsc = [...byAvg1dDesc].reverse();
  const topOutflow = byAvg1dAsc.slice(0, 5);

  return { inflow, outflow, neutral, topInflow, topOutflow };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/sector-rotation.
 *
 * @param req - Incoming HTTP request
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 * @param now - Optional clock override for testability (defaults to new Date())
 */
export function handleGetSectorRotation(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    // ── 1. Load watchlist (sector map) ───────────────────────────────────────
    const watchlistRows = getWatchlistSectorMap(db);

    // Build codeSectorOverride: UPPER(code) → DomainType from watchlist.domain
    // This ensures all 41 watchlist codes classify correctly even if not in SECTOR_PEERS.
    const codeSectorOverride: Record<string, DomainType> = {};
    for (const w of watchlistRows) {
      if (w.domain) {
        codeSectorOverride[w.code.toUpperCase()] = w.domain as DomainType;
      }
    }
    const watchlistCodes = watchlistRows.map((w) => w.code);

    // ── 2. Load current prices ───────────────────────────────────────────────
    const priceRows = getCurrentPrices(db);

    // tradingDate = MAX(updated_at) across all price rows; "" when empty
    const tradingDate = priceRows.length > 0
      ? priceRows.reduce(
          (max, r) => (r.updated_at > max ? r.updated_at : max),
          priceRows[0]!.updated_at,
        )
      : "";

    // ── 3. Load historical baseline (5-day-ago prices) ───────────────────────
    const baselineRows = getHistoricalBaseline(db, 5, now);
    const baselineByCode = new Map<string, number | null>();
    for (const b of baselineRows) {
      baselineByCode.set(b.code.toUpperCase(), b.price5dAgo);
    }

    // Build a set of watchlist codes for fast lookup
    const watchlistCodeSet = new Set(watchlistRows.map((w) => w.code.toUpperCase()));

    // ── 4. Build priceMap ────────────────────────────────────────────────────
    // Filter to watchlist codes only so the aggregation matches the ground-truth
    // contract (avg change_pct per watchlist sector). Including non-watchlist
    // reference stocks would dilute sector averages with stocks outside the
    // user's coverage universe.
    //
    // priceNow = market_prices.price
    // changePct = market_prices.change_pct (authoritative 1d % — preferred by domain)
    // price1dAgo = derived from changePct when available, so classifySector()
    //              can evaluate inflow/outflow thresholds using (priceNow, price1dAgo).
    //              Without this, classifySector always returns NEUTRAL even with 5d data.
    // price5dAgo = from historical baseline or null
    const priceMap: Record<string, SectorPriceData> = {};
    for (const row of priceRows) {
      // Only include watchlist codes — matches the ground-truth contract.
      if (!watchlistCodeSet.has(row.code.toUpperCase())) continue;

      const price5dAgo = baselineByCode.get(row.code.toUpperCase()) ?? null;
      // Derive price1dAgo from changePct so the domain classifier has 1d return data.
      // changePct = (priceNow - price1dAgo) / price1dAgo * 100
      // → price1dAgo = priceNow / (1 + changePct/100)
      // Guard: if changePct is null or would cause divide-by-zero, leave null.
      let price1dAgo: number | null = null;
      if (row.change_pct != null) {
        const divisor = 1 + row.change_pct / 100;
        if (divisor !== 0) {
          price1dAgo = row.price / divisor;
        }
      }
      priceMap[row.code] = {
        code: row.code,
        priceNow: row.price,
        price1dAgo,
        price5dAgo,
        changePct: row.change_pct,
      };
    }

    // ── 5. Run domain service ────────────────────────────────────────────────
    // Build explicit sector list from watchlist + priceMap so that sectors like
    // "chemicals" and "machinery" (valid DomainType but not in ALL_DOMAINS) are
    // included. Without this, detectSectorRotation([], ...) only iterates ALL_DOMAINS
    // and drops codeSectorOverride-only sectors.
    const representedSectors = new Set<DomainType>();
    for (const code of Object.keys(priceMap)) {
      const sector = codeSectorOverride[code.toUpperCase()];
      if (sector) representedSectors.add(sector);
    }
    for (const w of watchlistRows) {
      if (w.domain) representedSectors.add(w.domain as DomainType);
    }

    const result = detectSectorRotation(
      priceMap,
      Array.from(representedSectors),
      watchlistCodes,
      codeSectorOverride,
    );

    // ── 5b. Determine only1dAvailable ────────────────────────────────────────
    // The domain service computes only1dAvailable = hasData && !any5d && any1d.
    // Since we now derive price1dAgo from changePct, any1d is true whenever
    // changePct is non-null (the common case). The domain result is correct.
    const only1dAvailable = result.only1dAvailable;

    // ── 6. Map domain entries to response shape ──────────────────────────────
    const rawMapped = result.sectors.map(mapEntry);

    // ── 7. Apply display sort ────────────────────────────────────────────────
    const sectors = applySortOrder(rawMapped, only1dAvailable);

    // ── 8. Build summary ─────────────────────────────────────────────────────
    const summary = buildSummary(sectors);

    const body: SectorRotationResponse = {
      generatedAt: now.toISOString(),
      tradingDate,
      priceSource: "stored",
      only1dAvailable,
      sectors,
      summary,
      count: sectors.length,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
