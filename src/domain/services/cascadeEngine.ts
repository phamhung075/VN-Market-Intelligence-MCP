/**
 * Causal Cascade Engine — Task 062
 *
 * Pure domain function that builds a causal chain from a seed AnalysisEntry,
 * tracing macro events down to specific Vietnamese stocks in the watchlist.
 *
 * Design notes:
 *  - Synchronous, no I/O, no side effects.
 *  - ZERO imports from infrastructure/ or application/.
 *  - RAG results are injected by the application wrapper (runImpactChain.ts)
 *    and passed in as a pre-fetched optional parameter.
 *  - Sector impact rules are hardcoded — first matching rule per domain wins.
 *
 * Layer: domain/services
 */

import type { AnalysisEntry, AnalysisLevel, Sentiment, ImpactDirection } from "./newsNormalizer.js";
import type { DomainType } from "../../../bctc-schema.js";

// ═══════════════════════════════════════════════════════════════════════════
// Exported types
// ═══════════════════════════════════════════════════════════════════════════

export interface WatchlistEntry {
  /** VN stock code, e.g. 'GAS', 'VCB' */
  actionCode: string;
  /** Sector domain, e.g. 'oil_gas', 'banking' */
  domain: DomainType;
  /** Exchange: 'HOSE' | 'HNX' | 'UPCOM' */
  exchange: string;
}

export interface CausalChainEntry {
  level: AnalysisLevel;
  title: string;
  summary: string;
  affectedDomains: DomainType[];
  affectedActions: string[];
  sentiment: Sentiment;
  impactScore: number;
  confidence: number;
  reasoning: string;
}

export interface WatchlistImpact {
  actionCode: string;
  domain: DomainType;
  impactDirection: ImpactDirection;
  confidence: number;
  reasoning: string;
}

export interface CausalChain {
  id: string;
  seedTitle: string;
  createdAt: string;
  entries: CausalChainEntry[];
  watchlistImpacts: WatchlistImpact[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SearchResult type (minimal — mirrors infrastructure/rag/vectorstore.ts)
// This avoids importing from infrastructure while keeping the type safe.
// ═══════════════════════════════════════════════════════════════════════════

export interface SearchResult {
  id: string;
  level: string;
  title: string;
  summary: string;
  distance: number;
  tags: string[];
  actionCode?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sector impact rules
// ═══════════════════════════════════════════════════════════════════════════

interface SectorRule {
  /** Any single keyword match triggers this rule */
  keywords: string[];
  domain: DomainType;
  direction: ImpactDirection;
  confidence: number;
  /** Human-readable rule description, used as CausalChainEntry.title */
  title: string;
}

const SECTOR_RULES: SectorRule[] = [
  {
    keywords: ["giá dầu tăng", "oil price rise", "crude oil up", "giá dầu tăng mạnh", "opec"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.85,
    title: "Giá dầu tăng — tích cực cho ngành dầu khí",
  },
  {
    keywords: ["giá dầu giảm", "oil price fall", "crude oil down"],
    domain: "oil_gas",
    direction: "down",
    confidence: 0.85,
    title: "Giá dầu giảm — tiêu cực cho ngành dầu khí",
  },
  {
    keywords: ["giá dầu tăng", "oil price rise", "fuel cost", "aviation fuel"],
    domain: "aviation",
    direction: "down",
    confidence: 0.75,
    title: "Giá dầu tăng — tăng chi phí nhiên liệu hàng không",
  },
  {
    keywords: ["lãi suất tăng", "interest rate hike", "fed hike", "fed tăng lãi suất"],
    domain: "banking",
    direction: "up",
    confidence: 0.70,
    title: "Lãi suất tăng — ngắn hạn tích cực cho biên lãi suất ngân hàng",
  },
  {
    keywords: ["lãi suất tăng", "interest rate hike", "fed hike"],
    domain: "real_estate",
    direction: "down",
    confidence: 0.80,
    title: "Lãi suất tăng — tiêu cực cho bất động sản (chi phí vốn tăng)",
  },
  {
    keywords: ["lãi suất giảm", "interest rate cut", "rate cut"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.60,
    title: "Lãi suất giảm — áp lực biên lãi suất ngân hàng",
  },
  {
    keywords: ["lãi suất giảm", "interest rate cut"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.75,
    title: "Lãi suất giảm — tích cực cho bất động sản (vay mua nhà rẻ hơn)",
  },
  {
    keywords: ["giá thép tăng", "steel price rise", "steel price up"],
    domain: "steel",
    direction: "up",
    confidence: 0.80,
    title: "Giá thép tăng — tích cực cho doanh nghiệp thép",
  },
  {
    keywords: ["giá thép giảm", "steel price fall", "steel price down"],
    domain: "steel",
    direction: "down",
    confidence: 0.80,
    title: "Giá thép giảm — tiêu cực cho doanh nghiệp thép",
  },
  {
    keywords: ["vn-index tăng", "vn-index tăng điểm", "market rally", "thị trường tăng"],
    domain: "securities",
    direction: "up",
    confidence: 0.85,
    title: "VN-Index tăng — tích cực trực tiếp cho chứng khoán",
  },
  {
    keywords: ["vn-index giảm", "vn-index giảm điểm", "market decline", "thị trường giảm"],
    domain: "securities",
    direction: "down",
    confidence: 0.85,
    title: "VN-Index giảm — tiêu cực trực tiếp cho chứng khoán",
  },
  {
    keywords: ["lạm phát cao", "high inflation", "lạm phát tăng"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.65,
    title: "Lạm phát cao — tác động hỗn hợp lên ngân hàng",
  },
  {
    keywords: ["tỷ giá usd", "usd/vnd tăng", "vnd weakens", "đồng đô la tăng"],
    domain: "aviation",
    direction: "down",
    confidence: 0.70,
    title: "USD/VND tăng — tăng chi phí thuê máy bay và nhiên liệu",
  },
  {
    keywords: ["tỷ giá usd", "usd/vnd tăng", "vnd weakens"],
    domain: "steel",
    direction: "up",
    confidence: 0.60,
    title: "USD/VND tăng — tăng giá trị xuất khẩu thép tính bằng VND",
  },

  // ── CAPEX / Public Investment rules (task 250) ───────────────────────────
  {
    keywords: [
      "cao tốc", "đầu tư công", "giải ngân đầu tư", "hạ tầng giao thông",
      "sân bay long thành", "đường sắt", "cầu", "cảng biển", "capex",
      "public investment", "infrastructure investment",
    ],
    domain: "construction",
    direction: "up",
    confidence: 0.80,
    title: "Đầu tư công tăng — tích cực cho ngành xây dựng hạ tầng",
  },
  {
    keywords: [
      "năng lượng tái tạo", "điện mặt trời", "điện gió", "renewable energy",
      "solar farm", "wind power", "hệ thống điện", "nhà máy điện",
    ],
    domain: "energy",
    direction: "up",
    confidence: 0.75,
    title: "Đầu tư năng lượng tái tạo tăng — tích cực cho cổ phiếu điện",
  },

  // ── CREDIT / NHNN rules (task 250) ───────────────────────────────────────
  {
    keywords: [
      "nới room tín dụng bất động sản", "tín dụng bất động sản tăng",
      "room tín dụng bđs", "tín dụng bds tăng",
    ],
    domain: "real_estate",
    direction: "up",
    confidence: 0.80,
    title: "Nới room tín dụng BĐS — tích cực cho bất động sản",
  },
  {
    keywords: [
      "siết tín dụng bất động sản", "giảm room tín dụng bđs",
      "hạn chế tín dụng bất động sản", "siết tín dụng bds",
    ],
    domain: "real_estate",
    direction: "down",
    confidence: 0.80,
    title: "Siết tín dụng BĐS — tiêu cực cho bất động sản",
  },
  {
    keywords: [
      "tăng room tín dụng cho ngân hàng", "nới room tín dụng ngân hàng",
      "room tín dụng tăng", "tín dụng ngân hàng tăng trưởng",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.70,
    title: "Nới room tín dụng ngân hàng — hỗ trợ tăng trưởng cho vay",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map ImpactDirection to Sentiment.
 */
function direction2sentiment(dir: ImpactDirection): Sentiment {
  if (dir === "up") return "bullish";
  if (dir === "down") return "bearish";
  return "neutral";
}

/**
 * Find the first matching keyword from a list in text.
 * Returns the matched keyword or null.
 */
function findKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main exported function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a causal chain from a seed AnalysisEntry.
 *
 * Traces global/country macro events down to specific Vietnamese stocks
 * in the watchlist via sector impact rules.
 *
 * Pure function — synchronous, no I/O, no side effects.
 *
 * @param seedEntry  - Normalized news entry (from normalizeNews or pre-built)
 * @param watchlist  - User's stock watchlist
 * @param ragResults - Pre-fetched historical context (optional, injected by app layer)
 * @returns          - CausalChain with all levels: seed → domain → action
 */
export function buildCausalChain(
  seedEntry: AnalysisEntry,
  watchlist: WatchlistEntry[],
  ragResults?: SearchResult[],
): CausalChain {
  const chainId = `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const summaryLower = seedEntry.summary.toLowerCase();

  // ── Step 1: Seed entry → first chain entry ────────────────────────────
  const seedChainEntry: CausalChainEntry = {
    level: seedEntry.level,
    title: seedEntry.sourceTitle,
    summary: seedEntry.summary,
    affectedDomains: seedEntry.affectedDomains,
    affectedActions: seedEntry.affectedActions,
    sentiment: seedEntry.sentiment,
    impactScore: seedEntry.impactScore,
    confidence: seedEntry.confidence,
    reasoning: seedEntry.reasoning,
  };

  const entries: CausalChainEntry[] = [seedChainEntry];

  // ── Step 2: Domain entries from SECTOR_RULES ──────────────────────────
  // Group by domain — keep only the first matching rule per domain.
  const triggeredDomains = new Map<DomainType, { rule: SectorRule; matchedKeyword: string }>();

  for (const rule of SECTOR_RULES) {
    if (triggeredDomains.has(rule.domain)) continue; // first match wins
    const matchedKeyword = findKeyword(summaryLower, rule.keywords);
    if (matchedKeyword !== null) {
      triggeredDomains.set(rule.domain, { rule, matchedKeyword });
    }
  }

  // Also add domains from seedEntry.affectedDomains not already covered by rules
  const uncoveredDomains = seedEntry.affectedDomains.filter(
    (d) => !triggeredDomains.has(d),
  );

  // Build domain-level CausalChainEntries
  const domainEntryMap = new Map<DomainType, CausalChainEntry>();

  // From SECTOR_RULES matches
  for (const [domain, { rule, matchedKeyword }] of triggeredDomains) {
    const domainEntry: CausalChainEntry = {
      level: "domain",
      title: rule.title,
      summary: `${rule.title}. Seed: "${seedEntry.sourceTitle}"`,
      affectedDomains: [domain],
      affectedActions: [],
      sentiment: direction2sentiment(rule.direction),
      impactScore: Math.round(seedEntry.impactScore * rule.confidence),
      confidence: rule.confidence,
      reasoning: `Keyword match: "${matchedKeyword}". Domain ${domain} expected to move ${rule.direction}.`,
    };
    entries.push(domainEntry);
    domainEntryMap.set(domain, domainEntry);
  }

  // From seedEntry.affectedDomains not covered by SECTOR_RULES (default confidence 0.55)
  for (const domain of uncoveredDomains) {
    const domainEntry: CausalChainEntry = {
      level: "domain",
      title: `Ngành ${domain} — tác động từ sự kiện nguồn`,
      summary: `Ngành ${domain} bị ảnh hưởng bởi: "${seedEntry.sourceTitle}"`,
      affectedDomains: [domain],
      affectedActions: [],
      sentiment: seedEntry.sentiment,
      impactScore: Math.round(seedEntry.impactScore * 0.55),
      confidence: 0.55,
      reasoning: `Domain ${domain} detected from seed entry affectedDomains. Default confidence applied.`,
    };
    entries.push(domainEntry);
    domainEntryMap.set(domain, domainEntry);
  }

  // ── Step 3: Action entries from watchlist ─────────────────────────────
  // Deduplicate watchlist by actionCode
  const seenStocks = new Set<string>();
  const deduplicatedWatchlist = watchlist.filter((w) => {
    if (seenStocks.has(w.actionCode)) return false;
    seenStocks.add(w.actionCode);
    return true;
  });

  const actionEntries: CausalChainEntry[] = [];

  for (const stock of deduplicatedWatchlist) {
    const domainEntry = domainEntryMap.get(stock.domain);
    if (!domainEntry) continue; // no matching domain triggered — skip

    const actionEntry: CausalChainEntry = {
      level: "action",
      title: `${stock.actionCode} — tác động gián tiếp`,
      summary: `Cổ phiếu ${stock.actionCode} thuộc ngành ${stock.domain}.`,
      affectedDomains: [stock.domain],
      affectedActions: [stock.actionCode],
      sentiment: domainEntry.sentiment,
      impactScore: Math.round(domainEntry.impactScore * 0.9),
      confidence: domainEntry.confidence * 0.9,
      reasoning: `Cổ phiếu ${stock.actionCode} thuộc ngành ${stock.domain}, bị ảnh hưởng bởi: ${domainEntry.title}`,
    };
    actionEntries.push(actionEntry);
  }

  entries.push(...actionEntries);

  // ── Step 4: RAG enrichment ────────────────────────────────────────────
  if (ragResults && ragResults.length > 0) {
    const top3 = ragResults.slice(0, 3);
    for (const rag of top3) {
      // Find most relevant entry by level match; fall back to seed entry
      const matchByLevel = entries.find((e) => e.level === rag.level);
      const target = matchByLevel ?? entries[0];
      if (target === undefined) continue;
      const ragSnippet = ` [Historical: "${rag.title}" — ${rag.summary.slice(0, 120)}]`;
      target.reasoning += ragSnippet;
    }
  }

  // ── Step 5: Build watchlistImpacts from action entries ─────────────────
  const watchlistImpacts: WatchlistImpact[] = actionEntries.map((ae) => {
    const actionCode = ae.affectedActions[0] ?? "";
    const domain = ae.affectedDomains[0] ?? ("other" as DomainType);
    const impactDirection: ImpactDirection =
      ae.sentiment === "bullish"
        ? "up"
        : ae.sentiment === "bearish"
          ? "down"
          : "neutral";

    return {
      actionCode,
      domain,
      impactDirection,
      confidence: ae.confidence,
      reasoning: ae.reasoning,
    };
  });

  return {
    id: chainId,
    seedTitle: seedEntry.sourceTitle,
    createdAt: new Date().toISOString(),
    entries,
    watchlistImpacts,
  };
}
