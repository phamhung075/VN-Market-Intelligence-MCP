/**
 * Sector Peers — Domain Service
 *
 * Pure mapping of DomainType → top peer stocks per sector.
 * Used to auto-select context stocks when a user adds a stock to their watchlist.
 *
 * The context stocks provide sector-wide price comparison so the system can
 * distinguish "toàn ngành giảm" (sector-wide drop) from "cổ phiếu riêng lẻ giảm"
 * (stock-specific drop).
 *
 * Peer selection criteria: top by market cap / liquidity on Vietnamese exchanges.
 * Max 10 peers per sector (configurable via MAX_PEERS_PER_SECTOR).
 *
 * Layer: domain/services — pure, no I/O.
 */

import type { DomainType } from "../../../bctc-schema";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of peer stocks to auto-select per sector. */
export const MAX_PEERS_PER_SECTOR = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Sector peer mapping — ordered by market cap / importance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top stocks per sector, ordered by market cap / liquidity.
 * The first stock is typically the sector leader.
 */
const SECTOR_PEERS: Record<DomainType, { code: string; exchange: string }[]> = {
  banking: [
    { code: "VCB", exchange: "HOSE" },
    { code: "BID", exchange: "HOSE" },
    { code: "CTG", exchange: "HOSE" },
    { code: "TCB", exchange: "HOSE" },
    { code: "MBB", exchange: "HOSE" },
    { code: "VPB", exchange: "HOSE" },
    { code: "ACB", exchange: "HOSE" },
    { code: "SHB", exchange: "HOSE" },
    { code: "EIB", exchange: "HOSE" },
    { code: "STB", exchange: "HOSE" },
    { code: "HDB", exchange: "HOSE" },
    { code: "TPB", exchange: "HOSE" },
  ],
  tech: [
    { code: "FPT", exchange: "HOSE" },
    { code: "CMG", exchange: "HOSE" },
    { code: "ELC", exchange: "HOSE" },
    { code: "SAM", exchange: "HOSE" },
  ],
  real_estate: [
    { code: "VIC", exchange: "HOSE" },
    { code: "VHM", exchange: "HOSE" },
    { code: "VRE", exchange: "HOSE" },
    { code: "NVL", exchange: "HOSE" },
    { code: "KDH", exchange: "HOSE" },
    { code: "DXG", exchange: "HOSE" },
    { code: "NLG", exchange: "HOSE" },
    { code: "PDR", exchange: "HOSE" },
    { code: "KBC", exchange: "HOSE" },
    { code: "DIG", exchange: "HOSE" },
    { code: "HDG", exchange: "HOSE" },
    { code: "DFF", exchange: "HOSE" },
  ],
  steel: [
    { code: "HPG", exchange: "HOSE" },
    { code: "HSG", exchange: "HOSE" },
    { code: "NKG", exchange: "HOSE" },
    { code: "TIS", exchange: "HOSE" },
    { code: "POM", exchange: "HOSE" },
  ],
  oil_gas: [
    { code: "GAS", exchange: "HOSE" },
    { code: "PLX", exchange: "HOSE" },
    { code: "BSR", exchange: "UPCOM" },
    { code: "PVD", exchange: "HOSE" },
    { code: "PVS", exchange: "HNX" },
    { code: "OIL", exchange: "HOSE" },
  ],
  aviation: [
    { code: "HVN", exchange: "HOSE" },
    { code: "VJC", exchange: "HOSE" },
    { code: "ACV", exchange: "UPCOM" },
    { code: "SCS", exchange: "HOSE" },
  ],
  retail: [
    { code: "MWG", exchange: "HOSE" },
    { code: "VNM", exchange: "HOSE" },  // Vinamilk — dairy FMCG, not agriculture
    { code: "MSN", exchange: "HOSE" },
    { code: "FRT", exchange: "HOSE" },
    { code: "KDC", exchange: "HOSE" },
    { code: "DGW", exchange: "HOSE" },
    { code: "PNJ", exchange: "HOSE" },
    { code: "SAB", exchange: "HOSE" },
  ],
  securities: [
    { code: "SSI", exchange: "HOSE" },
    { code: "VND", exchange: "HOSE" },
    { code: "VIX", exchange: "HOSE" },
    { code: "VCI", exchange: "HOSE" },
    { code: "HCM", exchange: "HOSE" },
    { code: "SHS", exchange: "HNX" },
    { code: "MBS", exchange: "HNX" },
  ],
  utilities: [
    { code: "GEX", exchange: "HOSE" },
    { code: "REE", exchange: "HOSE" },
    { code: "PC1", exchange: "HOSE" },
    { code: "POW", exchange: "HOSE" },
    { code: "GEG", exchange: "HOSE" },
    { code: "BCG", exchange: "HOSE" },
    { code: "NT2", exchange: "HOSE" },
  ],
  agriculture: [
    { code: "DPM", exchange: "HOSE" },
    { code: "VHC", exchange: "HOSE" },
    { code: "ANV", exchange: "HOSE" },
    { code: "HAG", exchange: "HOSE" },
    { code: "HNG", exchange: "HOSE" },
    { code: "ASM", exchange: "HOSE" },
    { code: "DBC", exchange: "HOSE" },
  ],
  insurance: [
    { code: "BVH", exchange: "HOSE" },
    { code: "PVI", exchange: "HNX" },
    { code: "BMI", exchange: "HOSE" },
    { code: "MIG", exchange: "HOSE" },
  ],
  pharma: [
    { code: "DHG", exchange: "HOSE" },
    { code: "IMP", exchange: "HOSE" },
    { code: "DMC", exchange: "HOSE" },
    { code: "TRA", exchange: "HOSE" },
    { code: "DBD", exchange: "HOSE" },
  ],
  logistics: [
    { code: "GMD", exchange: "HOSE" },
    { code: "VTP", exchange: "HOSE" },
    { code: "VOS", exchange: "HOSE" },
    { code: "STG", exchange: "HOSE" },
    { code: "HAH", exchange: "HOSE" },
  ],
  gold_mining: [
    { code: "PNJ", exchange: "HOSE" },
  ],
  automotive: [
    { code: "VEA", exchange: "UPCOM" },
    { code: "HAX", exchange: "HOSE" },  // Hàng Xanh Auto — đại lý ô tô
    { code: "CTF", exchange: "HOSE" },  // City Auto — đại lý ô tô
    { code: "TMT", exchange: "HOSE" },  // Ô tô TMT — sản xuất xe tải
    { code: "SMA", exchange: "HOSE" },  // Phụ tùng Sài Gòn — linh kiện ô tô
  ],
  construction: [
    { code: "HHV", exchange: "HOSE" },
    { code: "CTD", exchange: "HOSE" },
    { code: "VCG", exchange: "HOSE" },
    { code: "HBC", exchange: "HOSE" },
    { code: "FCN", exchange: "HOSE" },
    { code: "HUT", exchange: "HNX" },
  ],
  energy: [
    { code: "GEG", exchange: "HOSE" },
    { code: "REE", exchange: "HOSE" },
    { code: "PC1", exchange: "HOSE" },
    { code: "BCG", exchange: "HOSE" },
  ],
  machinery: [
    { code: "DAG", exchange: "HOSE" },  // Da Nang Rubber Group — máy móc / công nghiệp
  ],
  pharmaceutical: [
    { code: "DHG", exchange: "HOSE" },
    { code: "IMP", exchange: "HOSE" },
    { code: "DMC", exchange: "HOSE" },  // Domesco Medical — previously in pharma only
    { code: "DBD", exchange: "HOSE" },
    { code: "PME", exchange: "HOSE" },
    { code: "TRA", exchange: "HOSE" },
    { code: "OPC", exchange: "HOSE" },
  ],
  chemicals: [
    { code: "DGC", exchange: "HOSE" },  // Duc Giang Chemicals — yellow phosphorus, petrochemicals
    { code: "GVR", exchange: "HOSE" },  // Gem Trading — rubber & petrochemical products
  ],
  other: [
  ],
};

/** Vietnamese sector names for display in alerts. */
export const SECTOR_NAME_VI: Record<DomainType, string> = {
  banking: "Ngân hàng",
  tech: "Công nghệ",
  real_estate: "Bất động sản",
  steel: "Thép",
  oil_gas: "Dầu khí",
  aviation: "Hàng không",
  retail: "Bán lẻ & Tiêu dùng",
  securities: "Chứng khoán",
  utilities: "Điện & Năng lượng",
  agriculture: "Nông nghiệp & Thủy sản",
  insurance: "Bảo hiểm",
  pharma: "Dược phẩm",
  logistics: "Logistics & Vận tải",
  gold_mining: "Vàng & Kim loại quý",
  automotive: "Ô tô & Cơ khí",
  construction: "Xây dựng & Hạ tầng",
  energy: "Năng lượng tái tạo",
  machinery: "Máy móc / Công nghiệp",
  pharmaceutical: "Dược phẩm (mở rộng)",
  chemicals: "Hóa chất & Đạo thải",
  other: "Khác",
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns peer stocks for a given sector, excluding the stock itself.
 *
 * @param domain    - The sector domain type
 * @param exclude   - Stock codes to exclude (typically the user's own watchlist stocks)
 * @param maxPeers  - Max number of peers to return (default: MAX_PEERS_PER_SECTOR)
 * @returns Array of { code, exchange } for the sector's top peer stocks
 */
export function getSectorPeers(
  domain: DomainType,
  exclude: Set<string> = new Set(),
  maxPeers = MAX_PEERS_PER_SECTOR,
): { code: string; exchange: string }[] {
  const allPeers = SECTOR_PEERS[domain] ?? [];
  return allPeers
    .filter((p) => !exclude.has(p.code))
    .slice(0, maxPeers);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reverse index — ticker → { domain, exchange }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lazily-built reverse index from SECTOR_PEERS so every caller that needs
 * "what sector does this ticker belong to?" hits ONE source of truth. Built
 * on first access and cached for the rest of the process.
 */
let _stockProfileCache: Map<string, { domain: DomainType; exchange: string }> | null = null;

function getStockProfileMap(): Map<string, { domain: DomainType; exchange: string }> {
  if (_stockProfileCache !== null) return _stockProfileCache;
  const map = new Map<string, { domain: DomainType; exchange: string }>();
  for (const domain of Object.keys(SECTOR_PEERS) as DomainType[]) {
    for (const entry of SECTOR_PEERS[domain] ?? []) {
      // First domain wins if a code appears in multiple sector lists (it shouldn't,
      // but SECTOR_PEERS is manually maintained).
      if (!map.has(entry.code)) {
        map.set(entry.code, { domain, exchange: entry.exchange });
      }
    }
  }
  _stockProfileCache = map;
  return map;
}

/**
 * Look up the canonical domain + exchange for a ticker code. Returns null
 * when the code is not in any SECTOR_PEERS list — callers should fall back
 * to a safe default (e.g. `domain="other", exchange="HOSE"`) and consider
 * adding the ticker to SECTOR_PEERS if it is expected to be classified.
 */
export function getStockProfile(
  code: string,
): { domain: DomainType; exchange: string } | null {
  return getStockProfileMap().get(code.toUpperCase()) ?? null;
}

/**
 * Given a list of watchlist entries, returns all unique context peer codes
 * that should be fetched for sector comparison.
 *
 * Deduplicates across sectors (e.g., if VCB is both in watchlist AND in banking peers).
 *
 * @param watchlist - User's watchlist entries
 * @returns Array of { code, exchange, domain } for context stocks
 */
export function getContextStocksForWatchlist(
  watchlist: { actionCode: string; domain: DomainType }[],
): { code: string; exchange: string; domain: DomainType }[] {
  const watchlistCodes = new Set(watchlist.map((w) => w.actionCode));
  const seenCodes = new Set<string>();
  const contextStocks: { code: string; exchange: string; domain: DomainType }[] = [];

  // Collect unique domains from watchlist
  const domains = new Set(watchlist.map((w) => w.domain));

  for (const domain of domains) {
    if (domain === "other") continue; // no peers for 'other'
    const peers = getSectorPeers(domain, watchlistCodes);
    for (const peer of peers) {
      if (!seenCodes.has(peer.code)) {
        seenCodes.add(peer.code);
        contextStocks.push({ ...peer, domain });
      }
    }
  }

  return contextStocks;
}

/**
 * Computes the average price change for a sector given price snapshots.
 *
 * @param prices - Array of { code, changePct } for all stocks in the sector
 * @returns Average change % across the sector, or null if no data
 */
export function computeSectorAverage(
  prices: { code: string; changePct: number }[],
): number | null {
  if (prices.length === 0) return null;
  const sum = prices.reduce((acc, p) => acc + p.changePct, 0);
  return Math.round((sum / prices.length) * 100) / 100;
}

/**
 * Determines whether a stock's movement is sector-wide or stock-specific.
 *
 * @param stockChangePct  - The stock's price change %
 * @param sectorAvgPct    - The sector's average change %
 * @returns "sector_wide" if stock moves in same direction as sector (within 2× range),
 *          "stock_specific" if stock diverges significantly from sector
 */
export function classifyMovement(
  stockChangePct: number,
  sectorAvgPct: number | null,
): "sector_wide" | "stock_specific" | "no_sector_data" {
  if (sectorAvgPct === null) return "no_sector_data";

  // Same direction check
  const sameDirection =
    (stockChangePct >= 0 && sectorAvgPct >= 0) ||
    (stockChangePct < 0 && sectorAvgPct < 0);

  if (!sameDirection) return "stock_specific";

  // If stock moves ≤ 2× sector average, it's sector-wide
  const ratio = Math.abs(sectorAvgPct) > 0.01
    ? Math.abs(stockChangePct) / Math.abs(sectorAvgPct)
    : Infinity;

  return ratio <= 2.5 ? "sector_wide" : "stock_specific";
}
