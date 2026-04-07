/**
 * Stock Search — Domain Service (Task 184)
 *
 * Pure search logic over the static alias dictionary and sector peer map.
 * Zero I/O, zero side-effects.
 *
 * Search priority order:
 *   1. Exact code match         (matchType: "code")
 *   2. Code prefix match        (matchType: "code")
 *   3. Company name / alias match (matchType: "name")
 *   4. Sector keyword match     (matchType: "sector")
 *
 * Within each priority tier results are further sorted alphabetically by code.
 *
 * Layer: domain/services — no imports from infrastructure.
 */

import { SECTOR_NAME_VI, getStockProfile } from "./sectorPeers.js";
import { STOCK_CATALOG } from "./stockAliases.js";
import type { DomainType } from "../../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** A single stock search result returned by searchStocks(). */
export interface StockSearchResult {
  /** Ticker code, e.g. "VCB" */
  code: string;
  /** Primary English company name */
  companyName: string;
  /** Exchange: HOSE | HNX | UPCOM */
  exchange: string;
  /** DomainType sector key, e.g. "banking" */
  sector: string;
  /** True if the stock is in the caller's watchlist */
  inWatchlist: boolean;
  /** How this result was matched */
  matchType: "code" | "name" | "sector";
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock catalogue
// Unique data per code ({ companyName, aliases }) lives in stockAliases.ts
// under STOCK_CATALOG — single source of truth shared with the news-text
// detector. Sector + exchange are derived from SECTOR_PEERS via
// getStockProfile(). Three files total to add a new ticker end-to-end:
//   1. SECTOR_PEERS  (sectorPeers.ts)   — classification + exchange
//   2. STOCK_CATALOG (stockAliases.ts)  — display name + aliases
//   3. market.watchlist (mcp.config.json) if it should be a default.
// ─────────────────────────────────────────────────────────────────────────────

interface CatalogueEntry {
  code: string;
  exchange: string;
  sector: DomainType;
  companyName: string;
  /** All searchable text fragments (lowercase, diacritics stripped) */
  aliases: string[];
}

/** Strip Vietnamese diacritics and lowercase. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Build the full catalogue at module load by merging STOCK_CATALOG (canonical
 * ticker → {companyName, aliases}, owned by stockAliases.ts) with
 * SECTOR_PEERS-derived sector + exchange (via getStockProfile). Any catalog
 * entry whose code has no SECTOR_PEERS profile is dropped with a warning so
 * the type contract stays honest.
 */
const CATALOGUE: CatalogueEntry[] = Object.entries(STOCK_CATALOG)
  .map(([code, meta]): CatalogueEntry | null => {
    const profile = getStockProfile(code);
    if (!profile) {
      // Visible in dev but never thrown — this is a catalogue-build warning.
      // Using console.warn rather than the structured logger because this
      // file is in the domain layer and cannot depend on infrastructure.
      // eslint-disable-next-line no-console
      console.warn(
        `[stockSearch] ${code} in STOCK_CATALOG but not in SECTOR_PEERS — dropping from search catalogue.`,
      );
      return null;
    }
    return {
      code,
      exchange: profile.exchange,
      sector: profile.domain,
      companyName: meta.companyName,
      aliases: meta.aliases,
    };
  })
  .filter((e): e is CatalogueEntry => e !== null);

// Pre-compute normalised alias lookups for performance
const NORMALISED_CATALOGUE: (CatalogueEntry & { normAliases: string[] })[] =
  CATALOGUE.map((entry) => ({
    ...entry,
    normAliases: entry.aliases.map(normalize),
  }));

// Build a reverse lookup: sector keyword (EN + VI, normalised) → sector key
const SECTOR_NORM_NAME: { norm: string; sector: DomainType }[] = [];
for (const [key, displayName] of Object.entries(SECTOR_NAME_VI) as [DomainType, string][]) {
  SECTOR_NORM_NAME.push({ norm: normalize(displayName), sector: key });
  // Also add the raw English sector key itself
  SECTOR_NORM_NAME.push({ norm: normalize(key.replace(/_/g, " ")), sector: key });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core search function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search for Vietnamese stocks by code, company name, or sector keyword.
 *
 * @param query          - Free text query (case-insensitive, diacritics-tolerant)
 * @param watchlistCodes - Codes the user is currently watching
 * @param limit          - Maximum results to return (default: 10)
 * @returns Sorted StockSearchResult[] — exact code match first, then name, then sector
 */
export function searchStocks(
  query: string,
  watchlistCodes: string[],
  limit = 10,
): StockSearchResult[] {
  if (!query || query.trim().length === 0) return [];

  const normQuery = normalize(query.trim());
  const watchSet = new Set(watchlistCodes.map((c) => c.toUpperCase()));

  const codeExact: StockSearchResult[] = [];
  const codePrefix: StockSearchResult[] = [];
  const nameMatch: StockSearchResult[] = [];
  const sectorMatch: StockSearchResult[] = [];
  const seenCodes = new Set<string>();

  // 1. Code exact and prefix matches
  for (const entry of NORMALISED_CATALOGUE) {
    const normCode = entry.code.toLowerCase();
    if (normCode === normQuery) {
      codeExact.push(toResult(entry, "code", watchSet));
      seenCodes.add(entry.code);
    } else if (normCode.startsWith(normQuery) || normQuery.startsWith(normCode)) {
      codePrefix.push(toResult(entry, "code", watchSet));
      seenCodes.add(entry.code);
    }
  }

  // 2. Company name / alias substring matches (skip already matched by code)
  for (const entry of NORMALISED_CATALOGUE) {
    if (seenCodes.has(entry.code)) continue;
    if (
      normalize(entry.companyName).includes(normQuery) ||
      entry.normAliases.some((a) => a.includes(normQuery))
    ) {
      nameMatch.push(toResult(entry, "name", watchSet));
      seenCodes.add(entry.code);
    }
  }

  // 3. Sector keyword matches
  // Determine which sectors the query maps to
  const matchedSectors = new Set<DomainType>();
  for (const { norm, sector } of SECTOR_NORM_NAME) {
    if (norm.includes(normQuery) || normQuery.includes(norm)) {
      matchedSectors.add(sector);
    }
  }
  if (matchedSectors.size > 0) {
    for (const entry of NORMALISED_CATALOGUE) {
      if (seenCodes.has(entry.code)) continue;
      if (matchedSectors.has(entry.sector as DomainType)) {
        sectorMatch.push(toResult(entry, "sector", watchSet));
        seenCodes.add(entry.code);
      }
    }
  }

  // Merge tiers, sort alphabetically within each tier, apply limit
  const merged = [
    ...codeExact.sort(byCode),
    ...codePrefix.sort(byCode),
    ...nameMatch.sort(byCode),
    ...sectorMatch.sort(byCode),
  ];

  return merged.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Output formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format search results as a plain-text table (no Markdown).
 * Vietnamese display, no emojis.
 *
 * @param query   - Original query string (for header)
 * @param results - Results from searchStocks()
 */
export function formatSearchResults(
  query: string,
  results: StockSearchResult[],
): string {
  if (results.length === 0) {
    return `Khong tim thay ket qua nao cho "${query}".`;
  }

  const lines: string[] = [
    `Ket qua tim kiem "${query}" (${results.length} ket qua)`,
    "",
    `Ma    | Ten cong ty                     | San   | Nganh               | Theo doi`,
    `------+---------------------------------+-------+---------------------+---------`,
  ];

  for (const r of results) {
    const sectorLabel = SECTOR_NAME_VI[r.sector as DomainType] ?? r.sector;
    const watchMark = r.inWatchlist ? "v" : "-";
    const code = r.code.padEnd(5);
    const name = r.companyName.substring(0, 31).padEnd(31);
    const exch = r.exchange.padEnd(5);
    const sect = sectorLabel.substring(0, 19).padEnd(19);
    lines.push(`${code} | ${name} | ${exch} | ${sect} | ${watchMark}`);
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function toResult(
  entry: CatalogueEntry,
  matchType: StockSearchResult["matchType"],
  watchSet: Set<string>,
): StockSearchResult {
  return {
    code: entry.code,
    companyName: entry.companyName,
    exchange: entry.exchange,
    sector: entry.sector,
    inWatchlist: watchSet.has(entry.code),
    matchType,
  };
}

function byCode(a: StockSearchResult, b: StockSearchResult): number {
  return a.code.localeCompare(b.code);
}
