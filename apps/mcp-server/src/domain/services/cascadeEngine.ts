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
import type { DomainType } from "../../../bctc-schema";
import { classifySentiment } from "./sentimentClassifier.js";
import type { MacroStats } from "./macroThresholds.js";
import { detectStocksInText } from "./stockAliases.js";
import { detectMsciInclusion, detectMsciWatchlist, detectMsciExclusion } from "./msciDetector.js";
import { detectAgricultureWeatherKeywords } from "./agricultureDetector.js";

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

/** A single cascade rule that fired during chain building (Task 247). */
export interface MatchedRule {
  key: string;
  matchedKeyword: string;
  sector: string;
}

export interface CausalChain {
  id: string;
  seedTitle: string;
  createdAt: string;
  entries: CausalChainEntry[];
  watchlistImpacts: WatchlistImpact[];
  matchedRules: MatchedRule[];
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
  // ── new risk-off fields (sprint 188, FR-7) ─────────────────────────────────
  /** CBOE Volatility Index. null = data unavailable, cascade rules skip. */
  vix: number | null;
  /** S&P 500 index level. null = data unavailable, cascade rules skip. */
  sp500: number | null;
  /** US Dollar Index (DXY). null = data unavailable, cascade rules skip. */
  dxy: number | null;
  /** Hang Seng index level. null = data unavailable, cascade rules skip. */
  hangSeng: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Cascade rule tables (FACTORY-DOMAIN-split-cascade-engine, Steps 1-2)
// Rule-data constants + their interfaces live under cascade/rules/*.ts;
// re-exported here via the barrel so the public module surface is unchanged.
// ═══════════════════════════════════════════════════════════════════════════

export * from "./cascade/rules/index.js";
import { SECTOR_RULES, type SectorRule } from "./cascade/rules/index.js";

// ═══════════════════════════════════════════════════════════════════════════
// Macro adjustment orchestration (FACTORY-DOMAIN-split-cascade-engine, Step 3)
// Moved to cascade/macroAdjustments.ts; re-exported to preserve the exact
// pre-split public surface (both were exported from this file before).
// ═══════════════════════════════════════════════════════════════════════════

import {
  applyDynamicMacroAdjustments,
  applyMacroAdjustments,
} from "./cascade/macroAdjustments.js";
export { applyDynamicMacroAdjustments, applyMacroAdjustments };

// ═══════════════════════════════════════════════════════════════════════════
// Combo/keyword detection helpers (FACTORY-DOMAIN-split-cascade-engine, Step 3)
// Moved to cascade/comboDetectors.ts. Only detectPolicyInterventionCombo and
// isPrecededByPlacePrefix were exported from this file before the split —
// re-exported here to preserve that exact surface; the other three
// (direction2sentiment/findKeyword/isMarketWide) stay import-only.
// ═══════════════════════════════════════════════════════════════════════════

import {
  direction2sentiment,
  findKeyword,
  isMarketWide,
  detectPolicyInterventionCombo,
  isPrecededByPlacePrefix,
} from "./cascade/comboDetectors.js";
export { detectPolicyInterventionCombo, isPrecededByPlacePrefix };

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
 * @param broadcastMinImpact - Minimum impactScore required to trigger market-wide broadcast.
 *                             Default: 6. Market-wide events (e.g. "VN-Index drops 5%")
 *                             cascade to ALL watchlist stocks not already covered by domain rules.
 * @returns                  - CausalChain with all levels: seed → domain → action
 */
export function buildCausalChain(
  seedEntry: AnalysisEntry,
  watchlist: WatchlistEntry[],
  ragResults?: SearchResult[],
  macroContext?: MacroContext | null,
  macroStats?: MacroStats[],
  broadcastMinImpact?: number,
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
  // Classify sentiment from seed summary before building domain entries.
  // This allows directional adjustment of confidence per rule.
  const seedSentimentResult = classifySentiment(seedEntry.summary);
  const seedSentimentDirection = seedSentimentResult.direction; // 'bullish' | 'bearish' | 'neutral'

  // Group by domain — keep only the first matching rule per domain.
  const triggeredDomains = new Map<DomainType, { rule: SectorRule; matchedKeyword: string }>();

  for (const rule of SECTOR_RULES) {
    if (triggeredDomains.has(rule.domain)) continue; // first match wins
    const matchedKeyword = findKeyword(summaryLower, rule.keywords);
    if (matchedKeyword !== null) {
      // FIX-1298/1299: excludeKeywords guard — skip rule if any exclusion term present
      if (rule.excludeKeywords && findKeyword(summaryLower, rule.excludeKeywords) !== null) {
        continue;
      }
      // FIX-1298/1299: requireAnyKeyword guard — skip rule unless at least one co-occurrence term present
      if (rule.requireAnyKeyword && findKeyword(summaryLower, rule.requireAnyKeyword) === null) {
        continue;
      }
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
    // Sentiment-direction alignment check:
    //   - rule.direction "up"   ↔ seedSentiment "bullish"  → matching   → +0.05
    //   - rule.direction "down" ↔ seedSentiment "bearish"  → matching   → +0.05
    //   - opposing direction                                → contradicting → -0.10
    //   - rule.direction "neutral" or seedSentiment "neutral" → no adjustment
    let sentimentAdjustment = 0;
    let sentimentNote = "";
    if (seedSentimentDirection !== "neutral" && rule.direction !== "neutral") {
      const ruleIsBullish = rule.direction === "up";
      const seedIsBullish = seedSentimentDirection === "bullish";
      if (ruleIsBullish === seedIsBullish) {
        sentimentAdjustment = +0.05;
        sentimentNote = ` [Sentiment: matches rule direction (${rule.direction}) → +0.05]`;
      } else {
        sentimentAdjustment = -0.10;
        sentimentNote = ` [Sentiment: contradicts rule direction (${rule.direction}) → -0.10]`;
      }
    }

    const adjustedConfidence = Math.min(0.99, Math.max(0.05, rule.confidence + sentimentAdjustment));

    // Derive the effective sentiment from the rule direction, combining with
    // the seed classifier result. For inverse relationships (e.g., oil up → aviation down),
    // the domain sentiment should INVERT the seed sentiment, not inherit it.
    let effectiveSentiment: Sentiment = direction2sentiment(rule.direction);
    if (
      seedSentimentResult.confidence >= 0.6 &&
      seedSentimentDirection !== "neutral"
    ) {
      // If rule direction matches seed direction → keep seed sentiment
      // If rule direction opposes seed direction → invert seed sentiment
      const ruleIsBullish = rule.direction === "up";
      const seedIsBullish = seedSentimentDirection === "bullish";
      if (ruleIsBullish === seedIsBullish) {
        effectiveSentiment = seedSentimentDirection;
      } else {
        // Invert: bullish seed + down rule → bearish domain
        effectiveSentiment = seedIsBullish ? "bearish" : "bullish";
      }
    }

    const domainEntry: CausalChainEntry = {
      level: "domain",
      title: rule.title,
      summary: `${rule.title}. Seed: "${seedEntry.sourceTitle}"`,
      affectedDomains: [domain],
      affectedActions: [],
      sentiment: effectiveSentiment,
      impactScore: Math.round(seedEntry.impactScore * adjustedConfidence),
      confidence: adjustedConfidence,
      reasoning: `Keyword match: "${matchedKeyword}". Domain ${domain} expected to move ${rule.direction}.${sentimentNote}`,
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

  // ── Step 2c: Apply σ-based dynamic adjustments (when stats available) ──
  if (macroStats && macroStats.length > 0) {
    applyDynamicMacroAdjustments(entries, macroStats);
  }

  // ── Step 2d: Policy-intervention combo boost (Task 1004) ──────────────
  // Only applies when ≥ 2 independent government policy categories co-occur.
  // Targets banking + securities (most direct beneficiaries of VN policy combos).
  const comboResult = detectPolicyInterventionCombo(summaryLower);
  if (comboResult.multiplier > 1.0) {
    const comboTargets: DomainType[] = ["banking", "securities"];
    for (const [domain, domainEntry] of domainEntryMap) {
      if (!comboTargets.includes(domain)) continue;
      const boosted = Math.min(0.99, domainEntry.confidence * comboResult.multiplier);
      domainEntry.confidence = boosted;
      domainEntry.reasoning +=
        ` [PolicyCombo: ${comboResult.matchedCategories.join("+")} → ×${comboResult.multiplier.toFixed(2)} ${domain}]`;
    }
  }

  // ── Step 2e: MSCI Inclusion Cascade (Task 1279) ─────────────────────────
  // Detect MSCI index inclusion keywords + create domain-level cascade entry.
  // MSCI inclusion is a cross-sector bullish catalyst affecting large-cap stocks.
  // Application layer (detectMsciCascadePeers) filters watchlist to large-cap only.
  const msciResult = detectMsciInclusion(summaryLower, seedEntry.confidence ?? 0.6);
  if (msciResult.matched) {
    const msciDomainEntry: CausalChainEntry = {
      level: "domain",
      title: "MSCI Inclusion Cascade",
      summary: `${seedEntry.sourceTitle} — MSCI inclusion keywords detected`,
      affectedDomains: [],  // MSCI is cross-sector
      affectedActions: [],  // Populated by application layer via detectMsciCascadePeers()
      sentiment: "bullish",
      impactScore: Math.round(seedEntry.impactScore * msciResult.confidence),
      confidence: msciResult.confidence,
      reasoning: `MSCI inclusion detected: ${msciResult.keywords.join(", ")}. Targets large-cap watchlist stocks.`,
    };
    entries.push(msciDomainEntry);
  }

  // ── Step 2f: MSCI Watchlist Cascade (Task 1329) ────────────────────────
  // Detect MSCI watchlist keywords + create bullish cascade entry.
  // Watchlist = precursor to full inclusion, triggers passive allocation planning.
  const msciWatchlistResult = detectMsciWatchlist(summaryLower, seedEntry.confidence ?? 0.6);
  if (msciWatchlistResult.matched) {
    const msciWatchlistEntry: CausalChainEntry = {
      level: "domain",
      title: "MSCI Watchlist Cascade",
      summary: `${seedEntry.sourceTitle} — MSCI watchlist keywords detected`,
      affectedDomains: [],  // MSCI is cross-sector
      affectedActions: [],  // Populated by application layer
      sentiment: "bullish",
      impactScore: Math.round(seedEntry.impactScore * msciWatchlistResult.confidence),
      confidence: msciWatchlistResult.confidence,
      reasoning: `MSCI watchlist detected: ${msciWatchlistResult.keywords.join(", ")}. Precursor to full inclusion.`,
    };
    entries.push(msciWatchlistEntry);
  }

  // ── Step 2g: MSCI Exclusion Cascade (Task 1329) ────────────────────────
  // Detect MSCI exclusion keywords + create bearish cascade entry.
  // Exclusion = forced selling, large passive fund outflows from Vietnam.
  const msciExclusionResult = detectMsciExclusion(summaryLower, seedEntry.confidence ?? 0.6);
  if (msciExclusionResult.matched) {
    const msciExclusionEntry: CausalChainEntry = {
      level: "domain",
      title: "MSCI Exclusion Cascade",
      summary: `${seedEntry.sourceTitle} — MSCI exclusion keywords detected`,
      affectedDomains: [],  // MSCI is cross-sector
      affectedActions: [],  // Populated by application layer
      sentiment: "bearish",
      impactScore: Math.round(seedEntry.impactScore * msciExclusionResult.confidence),
      confidence: msciExclusionResult.confidence,
      reasoning: `MSCI exclusion detected: ${msciExclusionResult.keywords.join(", ")}. Triggers forced selling.`,
    };
    entries.push(msciExclusionEntry);
  }

  // ── Step 2h: Non-watchlist company event confidence cap (Task 1207) ──────
  // When a news article is about a specific company (affectedActions non-empty)
  // that is NOT in the user's watchlist, cap all domain-level confidence at 0.6.
  // Rationale: non-watchlist company noise should never generate high-confidence alerts.
  //
  // Cap applies when:
  //   1. seedEntry.affectedActions has at least one company code (company-specific event)
  //   2. NONE of those companies appear in the watchlist
  //
  // Cap is skipped when:
  //   - affectedActions is empty (market-wide event)
  //   - At least one affected company is in the watchlist
  const NON_WATCHLIST_CONFIDENCE_CAP = 0.6;
  if (seedEntry.affectedActions.length > 0) {
    const watchlistCodes = new Set(watchlist.map((w) => w.actionCode));
    const anyInWatchlist = seedEntry.affectedActions.some((code) => watchlistCodes.has(code));

    if (!anyInWatchlist) {
      for (const entry of entries) {
        if (entry.level !== "domain") continue;
        const before = entry.confidence;
        if (entry.confidence > NON_WATCHLIST_CONFIDENCE_CAP) {
          entry.confidence = NON_WATCHLIST_CONFIDENCE_CAP;
        }
        // Always annotate — cap was applied (or was already below threshold)
        entry.reasoning += ` [NonWatchlistCap: company not in watchlist → confidence capped at ${NON_WATCHLIST_CONFIDENCE_CAP} (was ${before.toFixed(2)})]`;
      }
    }
  }

  // ── Step 2h: Action entries from rule affected_actions (Task 1264) ──────
  // When a SectorRule has explicit affected_actions (e.g., Hormuz rule directly
  // mapping to VJC, BSR), create direct action entries for those tickers.
  // These bypass the watchlist membership check and create high-confidence alerts.
  const ruleAffectedCodesSeen = new Set<string>();

  for (const [domain, { rule, matchedKeyword }] of triggeredDomains) {
    if (!rule.affected_actions || rule.affected_actions.length === 0) continue;

    const domainEntry = domainEntryMap.get(domain);
    if (!domainEntry) continue;

    for (const affected of rule.affected_actions) {
      if (ruleAffectedCodesSeen.has(affected.code)) continue; // no duplicates
      ruleAffectedCodesSeen.add(affected.code);

      // Find watchlist entry to get domain (needed for action entry)
      const watchlistStock = watchlist.find((w) => w.actionCode === affected.code);
      if (!watchlistStock) continue; // Skip if ticker not in watchlist

      const affectedSentiment: Sentiment = affected.direction === "up" ? "bullish" : affected.direction === "down" ? "bearish" : "neutral";

      const ruleAffectedEntry: CausalChainEntry = {
        level: "action",
        title: `${affected.code} — tác động trực tiếp từ quy tắc ${domain}`,
        summary: `Cổ phiếu ${affected.code} bị ảnh hưởng trực tiếp bởi: ${rule.title}`,
        affectedDomains: [watchlistStock.domain],
        affectedActions: [affected.code],
        sentiment: affectedSentiment,
        impactScore: Math.round(seedEntry.impactScore * domainEntry.confidence),
        confidence: domainEntry.confidence * 0.95,
        reasoning: `[RuleAffected: ${affected.code}] Direct mapping from ${domain} rule: ${rule.title}`,
      };

      entries.push(ruleAffectedEntry);
    }
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

  // Seed text used for alias detection — pre-computed once outside the loop
  const seedText = `${seedEntry.sourceTitle} ${seedEntry.summary}`;
  // Normalised seed text for direct ticker-code NER (Task 1251)
  const seedTextNorm = seedText.toLowerCase();

  /**
   * Task 1251 — Direct ticker-code NER helper.
   *
   * detectStocksInText() only checks company-name aliases. When the raw ticker
   * code appears in the headline (e.g. "TCB bị loại khỏi rổ VNDiamond"), NER
   * fails because "tcb" is not in TCB's alias list.
   *
   * This helper checks whether the raw 2-5 character ticker code appears in the
   * normalised seed text as a whole-word (word-boundary) match. Only codes that
   * are 2-5 characters are eligible to avoid matching very short tokens.
   *
   * Word-boundary: character before must be non-alphanumeric (or start-of-string),
   * character after must be non-alphanumeric (or end-of-string).
   *
   * Task 1266 — False positive guard: Vietnamese stock tickers ALWAYS appear
   * in ALL-CAPS in news articles (e.g. "HUT", "TCB", "VNM"). Common Vietnamese
   * words that happen to spell a ticker when diacritics are removed (e.g. "hụt"
   * from "thiếu hụt" → "hut") are never written all-uppercase. Therefore we
   * require the ticker to match in the ORIGINAL (non-lowercased) seedText as
   * well, ensuring that case-folded common-word matches are rejected.
   */
  function hasUppercaseWordBoundary(text: string, upperCode: string): boolean {
    let startIdx = 0;
    while (true) {
      const idx = text.indexOf(upperCode, startIdx);
      if (idx === -1) return false;

      const beforeOk = idx === 0 || !/[A-Za-z0-9]/.test(text[idx - 1]!);
      const afterIdx = idx + upperCode.length;
      const afterOk = afterIdx >= text.length || !/[A-Za-z0-9]/.test(text[afterIdx]!);

      // FIX NER-PLACE-1: place-name preceding-token guard. An all-caps token
      // collides with a watchlist ticker when it is actually a geographic
      // reference (e.g. "TP HCM" / "TP.HCM" / "Thành phố HCM" = Ho Chi Minh
      // City, not the broker ticker HCM). Reject this occurrence when the
      // immediately-preceding token is a Vietnamese place prefix, and keep
      // scanning for another (genuine) all-caps occurrence. Generalized to the
      // whole place-prefix + all-caps-ticker collision class (not HCM-specific).
      if (beforeOk && afterOk && !isPrecededByPlacePrefix(text, idx)) return true;
      startIdx = idx + 1;
    }
  }

  function isDirectTickerMention(code: string): boolean {
    const upper = code.toUpperCase();
    if (upper.length < 2 || upper.length > 5) return false;

    // Require the ticker to appear ALL-CAPS in the original text (Task 1266).
    // This eliminates false positives from Vietnamese words that match a ticker
    // only after diacritic stripping (e.g. "hụt" → "hut" matching "HUT").
    if (!hasUppercaseWordBoundary(seedText, upper)) return false;

    // Also verify it appears at word boundary in the lowercased text
    // (guards against mid-word uppercase substrings, e.g. "HPGAS" vs "HPG").
    const lower = upper.toLowerCase();
    let startIdx = 0;
    while (true) {
      const idx = seedTextNorm.indexOf(lower, startIdx);
      if (idx === -1) return false;

      const beforeOk = idx === 0 || !/[a-z0-9]/.test(seedTextNorm[idx - 1]!);
      const afterIdx = idx + lower.length;
      const afterOk = afterIdx >= seedTextNorm.length || !/[a-z0-9]/.test(seedTextNorm[afterIdx]!);

      if (beforeOk && afterOk) return true;
      startIdx = idx + 1;
    }
  }

  for (const stock of deduplicatedWatchlist) {
    const domainEntry = domainEntryMap.get(stock.domain);

    // Alias fallback (Task 161): check if seed text mentions this stock by trade name
    const aliasHits = detectStocksInText(seedText, [stock.actionCode]);
    const resolvedViaAlias = aliasHits.length > 0;

    // Task 1251: Direct ticker-code NER — check if the raw ticker (e.g. "TCB")
    // appears as a word-boundary match in the headline/summary.
    // This catches cases where the alias list lacks the 3-letter code itself.
    const resolvedViaDirectCode = !resolvedViaAlias && isDirectTickerMention(stock.actionCode);

    if (!domainEntry && !resolvedViaAlias && !resolvedViaDirectCode) continue; // neither path matched — skip

    let actionEntry: CausalChainEntry;

    if (domainEntry && !resolvedViaDirectCode) {
      // Primary path: domain rule fired — use domain-rule confidence
      actionEntry = {
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
    } else if (resolvedViaDirectCode) {
      // Task 1251: Direct ticker-code NER path — ticker appears explicitly in headline.
      // Use the domain entry's confidence if available (domain rule also matched),
      // otherwise use a higher confidence than alias-only (0.70) since explicit
      // code mention is a strong signal (stronger than company-name alias: 0.55).
      const hasDomainRule = domainEntry !== undefined;
      actionEntry = {
        level: "action",
        title: `${stock.actionCode} — đề cập trực tiếp mã cổ phiếu`,
        summary: `Cổ phiếu ${stock.actionCode} được nhắc đến trực tiếp bằng mã trong bài viết.`,
        affectedDomains: [stock.domain],
        affectedActions: [stock.actionCode],
        sentiment: hasDomainRule ? domainEntry!.sentiment : seedEntry.sentiment,
        impactScore: hasDomainRule
          ? Math.round(domainEntry!.impactScore * 0.9)
          : Math.round(seedEntry.impactScore * 0.7),
        confidence: hasDomainRule ? domainEntry!.confidence * 0.9 : 0.70,
        reasoning: hasDomainRule
          ? `[DirectCodeNER+DomainRule: ${stock.actionCode}] Mã cổ phiếu được nhắc trực tiếp; quy tắc ngành ${stock.domain} cũng khớp. ${domainEntry!.title}`
          : `[DirectCodeNER: ${stock.actionCode}] Mã cổ phiếu được nhắc trực tiếp trong tiêu đề. Không có quy tắc ngành khớp.`,
      };
    } else {
      // Alias fallback path: company trade name found in text, no domain rule fired
      // Use fixed confidence 0.55 (same as uncoveredDomains default)
      actionEntry = {
        level: "action",
        title: `${stock.actionCode} — phát hiện qua tên thương hiệu`,
        summary: `Cổ phiếu ${stock.actionCode} được phát hiện qua tên thương hiệu trong bài viết.`,
        affectedDomains: [stock.domain],
        affectedActions: [stock.actionCode],
        sentiment: seedEntry.sentiment,
        impactScore: Math.round(seedEntry.impactScore * 0.55),
        confidence: 0.55,
        reasoning: `[AliasResolved: ${stock.actionCode}] Cổ phiếu được phát hiện qua tên thương hiệu. Không có quy tắc ngành khớp.`,
      };
    }

    actionEntries.push(actionEntry);
  }

  entries.push(...actionEntries);

  // ── Step 3b: Market-wide broadcast pass (Task 162) ────────────────────
  // If this is a market-wide event (VN-Index, "toàn thị trường", or a
  // country/global article with sufficient impact score), cascade to ALL
  // watchlist stocks not already covered by domain rules or alias resolution.
  const effectiveBroadcastMin = broadcastMinImpact ?? 6;
  const seedTextForBroadcast = `${seedEntry.sourceTitle} ${seedEntry.summary}`;

  // Task 1256: Commodity-source broadcast exclusion.
  // If the article triggered a commodity-specific domain rule (gold_mining, oil_gas),
  // restrict market-wide broadcast to domains already covered by cascade rules.
  // This prevents gold/oil price articles from falsely alerting real_estate, banking, etc.
  // via the generic "global article + high impact score → broadcast all" path.
  // Only applies when domainEntryMap is non-empty (at least one rule matched) AND
  // the article does NOT contain explicit VN market-wide signals (those override).
  // Task 1309a: add "agriculture" — commodity-sector articles (coffee/rice/seafood export)
  // must not broadcast to unrelated sectors (real_estate, banking) via market-wide path.
  // FIX-1299: add "utilities" — coal/minerals articles cascade to utilities (thermal power),
  // not oil_gas. Adding utilities here restricts broadcast so BSR (oil refinery) is not
  // reached when coal/minerals news has no oil/energy context.
  const COMMODITY_TRIGGER_DOMAINS = new Set<string>(["gold_mining", "oil_gas", "agriculture", "utilities"]);
  const matchedDomains = Array.from(domainEntryMap.keys());
  const hasCommodityTrigger =
    matchedDomains.some((d) => COMMODITY_TRIGGER_DOMAINS.has(d));
  // A VN market-wide signal (VN-Index, "toàn thị trường") always broadcasts — don't suppress.
  const seedLowerForVnCheck = seedTextForBroadcast.toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const hasVnMarketWideSignal =
    seedLowerForVnCheck.includes("vn-index") ||
    seedLowerForVnCheck.includes("toan thi truong") ||
    seedLowerForVnCheck.includes("thi truong chung khoan");

  // Domains already covered by cascade rules (broadcast only extends these)
  const alreadyCoveredDomains = new Set<string>(matchedDomains);

  // Task 1334: analyst-warning articles bypass the impactScore gate — they are
  // quality signals regardless of their numeric score (e.g. CEO warnings at score 4).
  // Note: đ (U+0111) survives NFD normalization — use it directly in patterns.
  // Bug 1314: brokerage-outlook patterns added — must stay in sync with ANALYST_WARNING_PATTERNS
  // in isMarketWide() above. Both arrays gate the same bypass logic at different call sites.
  const ANALYST_WARNING_PATTERNS_BROADCAST = [
    "đieu chinh sau",
    "rat sau va đau",
    "canh bao nha đau tu",
    "trien vong nganh moi gioi",   // triển vọng ngành môi giới
    "ap luc canh tranh moi gioi",  // áp lực cạnh tranh môi giới
    "canh tranh moi gioi",         // cạnh tranh môi giới
  ];
  const seedNormForBroadcast = seedTextForBroadcast
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const hasAnalystWarningPattern = ANALYST_WARNING_PATTERNS_BROADCAST.some((p) =>
    seedNormForBroadcast.includes(p),
  );

  if (
    isMarketWide(seedTextForBroadcast.toLowerCase(), seedEntry.level, seedEntry.impactScore, effectiveBroadcastMin) &&
    (seedEntry.impactScore >= effectiveBroadcastMin || hasAnalystWarningPattern)
  ) {
    // Compute the set of action codes already covered — no double broadcast
    const alreadyCoveredCodes = new Set(
      actionEntries.map((ae) => ae.affectedActions[0] ?? ""),
    );

    for (const stock of deduplicatedWatchlist) {
      if (alreadyCoveredCodes.has(stock.actionCode)) continue; // no double broadcast

      // Task 1256: Commodity-source exclusion guard.
      // If a commodity rule fired AND there is no VN market-wide signal,
      // only broadcast to stocks whose domain is already covered by cascade rules.
      // This prevents gold/oil articles from alerting real_estate, banking, etc.
      if (
        hasCommodityTrigger &&
        !hasVnMarketWideSignal &&
        !alreadyCoveredDomains.has(stock.domain)
      ) {
        continue; // Commodity article — skip unrelated sectors
      }

      const broadcastConfidence = Math.min(0.7, seedEntry.impactScore / 10);

      const broadcastEntry: CausalChainEntry = {
        level: "action",
        title: `${stock.actionCode} — ảnh hưởng toàn thị trường`,
        summary: `Cổ phiếu ${stock.actionCode} bị ảnh hưởng theo diễn biến chung của thị trường.`,
        affectedDomains: [stock.domain],
        affectedActions: [stock.actionCode],
        sentiment: seedEntry.sentiment,
        impactScore: Math.round(seedEntry.impactScore * broadcastConfidence),
        confidence: broadcastConfidence,
        reasoning: `market-wide cascade: ${seedEntry.sourceTitle.slice(0, 80)}`,
      };

      actionEntries.push(broadcastEntry);
      entries.push(broadcastEntry);
    }
  }

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
  // Collect all action-level entries (from watchlist, broadcast, and rule affected_actions)
  const allActionEntries = entries.filter((e) => e.level === "action");
  const watchlistImpacts: WatchlistImpact[] = allActionEntries.map((ae) => {
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

  // ── Step 6: Collect matched rules for instrumentation (Task 247) ──────
  const matchedRules: MatchedRule[] = [];
  for (const entry of entries) {
    if (entry.level === "domain" && entry.affectedDomains.length > 0) {
      const direction = entry.sentiment === "bullish" ? "up" : entry.sentiment === "bearish" ? "down" : "neutral";
      for (const domain of entry.affectedDomains) {
        matchedRules.push({
          key: `${domain}_${direction}`,
          matchedKeyword: entry.title.slice(0, 80),
          sector: domain,
        });
      }
    }
  }

  return {
    id: chainId,
    seedTitle: seedEntry.sourceTitle,
    createdAt: new Date().toISOString(),
    entries,
    watchlistImpacts,
    matchedRules,
  };
}

