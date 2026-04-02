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

import { SECTOR_NAME_VI } from "./sectorPeers.js";
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
// Static stock catalogue
// Each entry covers: code, exchange, sector (DomainType), display company name,
// plus searchable aliases (English + Vietnamese, accent-stripped versions).
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

/** Build the search catalogue from the static alias table + sector peers. */
const CATALOGUE: CatalogueEntry[] = [
  // ── Watchlist defaults ──────────────────────────────────────────────────
  {
    code: "VNM", exchange: "HOSE", sector: "retail",
    companyName: "Vinamilk",
    aliases: ["vinamilk", "sua viet nam", "viet nam dairy", "vietnam dairy products", "sua vinamilk"],
  },
  {
    code: "FPT", exchange: "HOSE", sector: "tech",
    companyName: "FPT Corporation",
    aliases: ["fpt", "fpt corporation", "tap doan fpt", "fpt software", "fpt telecom", "fpt group"],
  },
  {
    code: "VCB", exchange: "HOSE", sector: "banking",
    companyName: "Vietcombank",
    aliases: ["vietcombank", "ngan hang vietcombank", "bank for foreign trade", "ngan hang ngoai thuong"],
  },
  {
    code: "VEA", exchange: "UPCOM", sector: "automotive",
    companyName: "VEAM",
    aliases: ["veam", "vietnam engine", "may dong luc viet nam", "vietnam engine and agricultural machinery"],
  },
  // ── Banking ─────────────────────────────────────────────────────────────
  {
    code: "BID", exchange: "HOSE", sector: "banking",
    companyName: "BIDV",
    aliases: ["bidv", "ngan hang bidv", "bank for investment and development", "ngan hang dau tu va phat trien"],
  },
  {
    code: "CTG", exchange: "HOSE", sector: "banking",
    companyName: "VietinBank",
    aliases: ["vietinbank", "ngan hang vietinbank", "ngan hang cong thuong", "vietin bank"],
  },
  {
    code: "TCB", exchange: "HOSE", sector: "banking",
    companyName: "Techcombank",
    aliases: ["techcombank", "ngan hang techcombank", "ngan hang ky thuong"],
  },
  {
    code: "MBB", exchange: "HOSE", sector: "banking",
    companyName: "MB Bank",
    aliases: ["mb bank", "ngan hang mb", "military commercial bank", "ngan hang quan doi"],
  },
  {
    code: "VPB", exchange: "HOSE", sector: "banking",
    companyName: "VPBank",
    aliases: ["vpbank", "ngan hang vpbank", "vietnam prosperity bank", "vp bank"],
  },
  {
    code: "ACB", exchange: "HOSE", sector: "banking",
    companyName: "Asia Commercial Bank",
    aliases: ["ngan hang a chau", "asia commercial bank", "ngan hang acb", "a chau bank"],
  },
  {
    code: "HDB", exchange: "HOSE", sector: "banking",
    companyName: "HDBank",
    aliases: ["hdbank", "ngan hang hdbank", "ho chi minh city development bank", "hd bank"],
  },
  {
    code: "STB", exchange: "HOSE", sector: "banking",
    companyName: "Sacombank",
    aliases: ["sacombank", "ngan hang sacombank", "sai gon thuong tin"],
  },
  {
    code: "TPB", exchange: "HOSE", sector: "banking",
    companyName: "TPBank",
    aliases: ["tpbank", "tien phong bank", "ngan hang tien phong", "tp bank"],
  },
  // ── Tech ────────────────────────────────────────────────────────────────
  {
    code: "CMG", exchange: "HOSE", sector: "tech",
    companyName: "CMC Corporation",
    aliases: ["cmc", "cmc corporation", "tap doan cmc", "cong nghe cmc"],
  },
  {
    code: "ELC", exchange: "HOSE", sector: "tech",
    companyName: "Electricsun",
    aliases: ["elcom", "electricsun", "dien tu vien thong"],
  },
  {
    code: "SAM", exchange: "HOSE", sector: "tech",
    companyName: "SAM Holdings",
    aliases: ["sam holdings", "sam cables", "cap quang sam"],
  },
  // ── Real estate ─────────────────────────────────────────────────────────
  {
    code: "VIC", exchange: "HOSE", sector: "real_estate",
    companyName: "Vingroup",
    aliases: ["vingroup", "tap doan vingroup", "vin group"],
  },
  {
    code: "VHM", exchange: "HOSE", sector: "real_estate",
    companyName: "Vinhomes",
    aliases: ["vinhomes", "vinhomes bat dong san", "vin homes"],
  },
  {
    code: "NVL", exchange: "HOSE", sector: "real_estate",
    companyName: "Novaland",
    aliases: ["novaland", "nova land", "dia oc nova"],
  },
  {
    code: "KDH", exchange: "HOSE", sector: "real_estate",
    companyName: "Khang Dien",
    aliases: ["khang dien", "nha khang dien", "khang dien house"],
  },
  {
    code: "DXG", exchange: "HOSE", sector: "real_estate",
    companyName: "Dat Xanh Group",
    aliases: ["dat xanh", "dat xanh group", "dia oc dat xanh"],
  },
  // ── Steel ───────────────────────────────────────────────────────────────
  {
    code: "HPG", exchange: "HOSE", sector: "steel",
    companyName: "Hoa Phat Group",
    aliases: ["hoa phat", "tap doan hoa phat", "hoa phat steel", "thep hoa phat"],
  },
  {
    code: "HSG", exchange: "HOSE", sector: "steel",
    companyName: "Hoa Sen Group",
    aliases: ["hoa sen", "tap doan hoa sen", "ton hoa sen"],
  },
  {
    code: "NKG", exchange: "HOSE", sector: "steel",
    companyName: "Nam Kim Steel",
    aliases: ["nam kim", "thep nam kim", "nam kim steel"],
  },
  {
    code: "TIS", exchange: "HOSE", sector: "steel",
    companyName: "Thai Nguyen Iron & Steel",
    aliases: ["tisco", "thai nguyen steel", "thep thai nguyen"],
  },
  {
    code: "POM", exchange: "HOSE", sector: "steel",
    companyName: "Pomina Steel",
    aliases: ["pomina", "thep pomina"],
  },
  // ── Oil & Gas ────────────────────────────────────────────────────────────
  {
    code: "GAS", exchange: "HOSE", sector: "oil_gas",
    companyName: "PV Gas",
    aliases: ["pv gas", "pvgas", "petrovietnam gas", "khi viet nam"],
  },
  {
    code: "PLX", exchange: "HOSE", sector: "oil_gas",
    companyName: "Petrolimex",
    aliases: ["petrolimex", "xang dau viet nam", "vietnam petroleum", "petrolimex group"],
  },
  {
    code: "PVD", exchange: "HOSE", sector: "oil_gas",
    companyName: "PetroVietnam Drilling",
    aliases: ["pvd", "khoan dau khi", "petrovietnam drilling"],
  },
  {
    code: "PVS", exchange: "HNX", sector: "oil_gas",
    companyName: "PetroVietnam Technical Services",
    aliases: ["pvs", "dich vu ky thuat dau khi", "petrovietnam technical"],
  },
  // ── Aviation ─────────────────────────────────────────────────────────────
  {
    code: "HVN", exchange: "HOSE", sector: "aviation",
    companyName: "Vietnam Airlines",
    aliases: ["vietnam airlines", "hang khong viet nam", "hang hang khong quoc gia"],
  },
  {
    code: "VJC", exchange: "HOSE", sector: "aviation",
    companyName: "VietJet Air",
    aliases: ["vietjet", "vietjet air", "hang khong vietjet"],
  },
  {
    code: "ACV", exchange: "UPCOM", sector: "aviation",
    companyName: "Airports Corporation of Vietnam",
    aliases: ["acv", "cang hang khong viet nam", "airports corporation"],
  },
  // ── Retail ───────────────────────────────────────────────────────────────
  {
    code: "MWG", exchange: "HOSE", sector: "retail",
    companyName: "The Gioi Di Dong (Mobile World)",
    aliases: ["the gioi di dong", "mobile world", "dien may xanh", "bach hoa xanh"],
  },
  {
    code: "MSN", exchange: "HOSE", sector: "retail",
    companyName: "Masan Group",
    aliases: ["masan", "tap doan masan", "masan group", "masan consumer"],
  },
  {
    code: "PNJ", exchange: "HOSE", sector: "retail",
    companyName: "Phu Nhuan Jewelry",
    aliases: ["pnj", "vang bac phu nhuan", "phu nhuan jewelry"],
  },
  // ── Securities ───────────────────────────────────────────────────────────
  {
    code: "SSI", exchange: "HOSE", sector: "securities",
    companyName: "SSI Securities",
    aliases: ["ssi securities", "chung khoan ssi", "saigon securities"],
  },
  {
    code: "VND", exchange: "HOSE", sector: "securities",
    companyName: "VNDirect Securities",
    aliases: ["vndirect", "chung khoan vndirect"],
  },
  {
    code: "HCM", exchange: "HOSE", sector: "securities",
    companyName: "HCM Securities",
    aliases: ["chung khoan ho chi minh", "hcm securities"],
  },
  // ── Utilities ────────────────────────────────────────────────────────────
  {
    code: "REE", exchange: "HOSE", sector: "utilities",
    companyName: "REE Corporation",
    aliases: ["ree", "co dien lanh ree", "ree corporation", "ree refrigeration"],
  },
  {
    code: "POW", exchange: "HOSE", sector: "utilities",
    companyName: "PetroVietnam Power",
    aliases: ["petrovietnam power", "dien luc dau khi", "pv power"],
  },
  // ── Agriculture ──────────────────────────────────────────────────────────
  {
    code: "VHC", exchange: "HOSE", sector: "agriculture",
    companyName: "Vinh Hoan Corporation",
    aliases: ["vinh hoan", "ca tra vinh hoan", "pangasius vinh hoan"],
  },
  {
    code: "HAG", exchange: "HOSE", sector: "agriculture",
    companyName: "Hoang Anh Gia Lai",
    aliases: ["hoang anh gia lai", "hagl", "gia lai"],
  },
  // ── Insurance ────────────────────────────────────────────────────────────
  {
    code: "BVH", exchange: "HOSE", sector: "insurance",
    companyName: "Bao Viet Holdings",
    aliases: ["bao viet", "bao viet holdings", "bao hiem bao viet"],
  },
  // ── Pharma ───────────────────────────────────────────────────────────────
  {
    code: "DHG", exchange: "HOSE", sector: "pharma",
    companyName: "Hau Giang Pharmaceutical",
    aliases: ["duoc hau giang", "hau giang pharmaceutical", "duoc pham hau giang"],
  },
  {
    code: "IMP", exchange: "HOSE", sector: "pharma",
    companyName: "Imexpharm",
    aliases: ["imexpharm", "duoc pham imexpharm"],
  },
  // ── Logistics ────────────────────────────────────────────────────────────
  {
    code: "GMD", exchange: "HOSE", sector: "logistics",
    companyName: "Gemadept",
    aliases: ["gemadept", "cang bien gemadept", "logistics gemadept"],
  },
  {
    code: "VTP", exchange: "HOSE", sector: "logistics",
    companyName: "Viettel Post",
    aliases: ["viettel post", "chuyen phat nhanh viettel", "buu chinh viettel"],
  },
  // ── Automotive ───────────────────────────────────────────────────────────
  {
    code: "HAX", exchange: "HOSE", sector: "automotive",
    companyName: "Hang Xanh Auto",
    aliases: ["hang xanh", "hang xanh auto", "dai ly oto hang xanh"],
  },
  // ── Gold / jewellery (shared PNJ already in retail) ──────────────────────
];

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
