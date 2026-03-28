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
// MacroContext — real-time commodity + central bank data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Real-time macro indicators injected by the application layer.
 * All fields are nullable — null means "data unavailable, skip rule".
 * This interface is pure domain: no imports from infrastructure.
 */
export interface MacroContext {
  /** Brent crude oil in USD per barrel (e.g. 95 means $95/bbl). */
  brentCrudeUSD: number | null;
  /** Gold futures in USD per troy ounce (e.g. 2100 means $2,100/oz). */
  goldUSDPerOz: number | null;
  /** Market USD/VND exchange rate (e.g. 25500 means 25,500 VND per 1 USD). */
  usdVndMarket: number | null;
  /** SBV refinancing rate in percent per year (e.g. 6 means 6%/year). */
  refinancingRatePct: number | null;
  /** SBV overnight rate in percent per year. */
  overnightRatePct: number | null;
  /** SBV official USD/VND exchange rate. */
  usdVndOfficial: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Macro adjustment rules
// ═══════════════════════════════════════════════════════════════════════════

interface MacroRule {
  /** Human-readable label for annotation (e.g. "brentCrudeUSD>90"). */
  label: string;
  /** Returns true when macro condition is active. null values always return false. */
  condition: (ctx: MacroContext) => boolean;
  /** Domain to adjust. */
  domain: DomainType;
  /** Signed delta applied to confidence (e.g. +0.10 or -0.08). */
  delta: number;
}

/**
 * 11 macro adjustment rules.
 * Multiple rules can fire simultaneously — all deltas accumulate.
 * Confidence is clamped to [0.05, 0.99] after applying all rules.
 */
const MACRO_ADJUSTMENTS: MacroRule[] = [
  // Brent crude > 90
  {
    label: "brentCrudeUSD>90",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 90,
    domain: "oil_gas",
    delta: +0.10,
  },
  {
    label: "brentCrudeUSD>90",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 90,
    domain: "logistics",
    delta: +0.10,
  },
  {
    label: "brentCrudeUSD>90",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 90,
    domain: "aviation",
    delta: -0.08,
  },
  // Brent crude < 70
  {
    label: "brentCrudeUSD<70",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD < 70,
    domain: "oil_gas",
    delta: -0.10,
  },
  {
    label: "brentCrudeUSD<70",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD < 70,
    domain: "aviation",
    delta: +0.06,
  },
  // Gold > 2000
  {
    label: "goldUSDPerOz>2000",
    condition: (ctx) => ctx.goldUSDPerOz !== null && ctx.goldUSDPerOz > 2000,
    domain: "gold_mining",
    delta: +0.05,
  },
  // Refinancing rate > 6
  {
    label: "refinancingRatePct>6",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct > 6,
    domain: "banking",
    delta: -0.08,
  },
  {
    label: "refinancingRatePct>6",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct > 6,
    domain: "real_estate",
    delta: -0.10,
  },
  // Refinancing rate < 4
  {
    label: "refinancingRatePct<4",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct < 4,
    domain: "banking",
    delta: +0.06,
  },
  {
    label: "refinancingRatePct<4",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct < 4,
    domain: "real_estate",
    delta: +0.08,
  },
  // USD/VND > 25500 (using market rate; official rate is secondary)
  {
    label: "usdVnd>25500",
    condition: (ctx) => ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "aviation",
    delta: -0.07,
  },
  {
    label: "usdVnd>25500",
    condition: (ctx) => ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "steel",
    delta: +0.05,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Macro adjustment helper
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply macro adjustment rules to domain-level CausalChainEntries in-place.
 *
 * For each rule whose condition fires, every domain-level entry with the
 * matching domain gets its confidence adjusted by the rule's delta and its
 * reasoning annotated with "[Macro: label=VALUE → DELTA domain]".
 *
 * Confidence is clamped to [0.05, 0.99] after all deltas are applied.
 *
 * @param entries      - All chain entries (only "domain" level are modified)
 * @param macroContext - Live macro indicators
 */
export function applyMacroAdjustments(
  entries: CausalChainEntry[],
  macroContext: MacroContext,
): void {
  for (const rule of MACRO_ADJUSTMENTS) {
    if (!rule.condition(macroContext)) continue;

    // Derive the display value for annotation
    const displayValue = deriveDisplayValue(rule.label, macroContext);

    for (const entry of entries) {
      if (entry.level !== "domain") continue;
      if (!entry.affectedDomains.includes(rule.domain)) continue;

      // Apply delta
      const newConf = Math.min(0.99, Math.max(0.05, entry.confidence + rule.delta));
      const deltaStr = rule.delta >= 0 ? `+${rule.delta.toFixed(2)}` : rule.delta.toFixed(2);
      entry.reasoning +=
        ` [Macro: ${rule.label}=${displayValue} → ${deltaStr} ${rule.domain}]`;
      entry.confidence = newConf;
    }
  }
}

/**
 * Extract a human-readable numeric value from macroContext for the given label.
 */
function deriveDisplayValue(label: string, ctx: MacroContext): string {
  if (label.startsWith("brentCrudeUSD")) return String(ctx.brentCrudeUSD ?? "?");
  if (label.startsWith("goldUSDPerOz")) return String(ctx.goldUSDPerOz ?? "?");
  if (label.startsWith("usdVnd")) return String(ctx.usdVndMarket ?? ctx.usdVndOfficial ?? "?");
  if (label.startsWith("refinancingRatePct")) return String(ctx.refinancingRatePct ?? "?");
  if (label.startsWith("overnightRatePct")) return String(ctx.overnightRatePct ?? "?");
  return "?";
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
 * @param seedEntry    - Normalized news entry (from normalizeNews or pre-built)
 * @param watchlist    - User's stock watchlist
 * @param ragResults   - Pre-fetched historical context (optional, injected by app layer)
 * @param macroContext - Real-time macro indicators for confidence adjustments (optional).
 *                       When omitted or null, behavior is identical to pre-Sprint-008.
 * @returns            - CausalChain with all levels: seed → domain → action
 */
export function buildCausalChain(
  seedEntry: AnalysisEntry,
  watchlist: WatchlistEntry[],
  ragResults?: SearchResult[],
  macroContext?: MacroContext | null,
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

  // ── Step 2b: Apply macro adjustments to domain entries ───────────────
  // Only runs when macroContext is provided and non-null.
  // Modifies domain entries in-place; adjusts confidence + annotates reasoning.
  if (macroContext != null) {
    applyMacroAdjustments(entries, macroContext);
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
