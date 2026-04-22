/**
 * Cascade Executor — Task 1278
 *
 * Post-processing logic to apply insider-dump peer cascade rules.
 * Detects when a news article signals leadership exit at a banking stock,
 * then identifies peer banking stocks that should receive alerts.
 *
 * Pure function — no I/O, no side effects, no async.
 * Layer: application (orchestration layer)
 *
 * Design rationale:
 *   - Domain layer (sentimentClassifier, cascadeEngine) = pure rule definitions
 *   - Application layer (this module) = orchestration + business logic glue
 *   - Infrastructure layer (fetchers, db) = I/O isolation
 */

import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import { INSIDER_DUMP_RULES } from "../domain/services/cascadeEngine.js";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";
import { detectMsciInclusion } from "../domain/services/msciDetector.js";

/**
 * Detect whether a news article describes insider leadership exit selling,
 * then identify peer banking stocks that should receive alerts.
 *
 * Returns peer stock codes (empty array if rule doesn't apply).
 *
 * @param seedSummary - Original news article summary
 * @param affectedActions - Original stock codes mentioned in the article (e.g., ["VCB"])
 * @param watchlist - Full watchlist to find peer banking stocks
 * @returns List of peer banking stock codes (not including original stock)
 *
 * Conditions for firing:
 *   1. seedSummary contains insider dump keyword (xả hàng, bán sạch, thoái sạch)
 *   2. Sentiment classification returns bearish + confidence > 0.6
 *   3. Original stock(s) are in banking sector
 *
 * Example:
 *   seedSummary = "Tổng giám đốc VCB xả hàng cổ phiếu"
 *   affectedActions = ["VCB"]
 *   watchlist = [VCB(banking), BID(banking), CTG(banking), FPT(tech), ...]
 *   return = ["BID", "CTG"]  // Peers, excluding original VCB
 */
export function detectInsiderDumpPeers(
  seedSummary: string,
  affectedActions: string[],
  watchlist: WatchlistEntry[],
): string[] {
  const summaryLower = seedSummary.toLowerCase();

  // ── Step 1: Check if any insider dump keyword is present ────────────────
  const matchedRule = INSIDER_DUMP_RULES.find(rule =>
    summaryLower.includes(rule.keyword)
  );

  if (!matchedRule) {
    return []; // No insider dump keywords found
  }

  // ── Step 2: Verify sentiment classification ───────────────────────────
  // Must be bearish with confidence > 0.6 (unambiguous insider action)
  const sentimentResult = classifySentiment(seedSummary);

  if (sentimentResult.direction !== "bearish" || sentimentResult.confidence <= 0.6) {
    return []; // Insufficient confidence or wrong direction
  }

  // ── Step 3: Verify original stock(s) are banking sector ────────────────
  // Build a set of original banking stocks
  const originalBankingStocks = new Set<string>();

  for (const code of affectedActions) {
    const entry = watchlist.find(w => w.actionCode === code);
    if (entry && entry.domain === "banking") {
      originalBankingStocks.add(code);
    }
  }

  if (originalBankingStocks.size === 0) {
    return []; // No original banking stocks; rule doesn't apply
  }

  // ── Step 4: Find peer banking stocks (exclude originals) ────────────────
  const peers = watchlist
    .filter(
      w =>
        w.domain === "banking" && // Peer must be banking
        !originalBankingStocks.has(w.actionCode), // Exclude original stocks
    )
    .map(w => w.actionCode);

  return peers;
}

/**
 * Annotation helper for causal chain reasoning.
 *
 * @param originalStocks - Stock code(s) where insider dump was detected
 * @param peerStocks - Peer banking stocks affected by cascade
 * @returns Human-readable annotation for chain.reasoning
 *
 * Example: "Insider dump detected at VCB. Cascading to banking peers: BID, CTG, ACB"
 */
export function annotateInsiderDumpCascade(
  originalStocks: string[],
  peerStocks: string[],
): string {
  if (peerStocks.length === 0) {
    return "";
  }

  return `[Insider Dump Cascade] Original stock(s): ${originalStocks.join(", ")}. Cascading to banking peers: ${peerStocks.join(", ")}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MSCI Inclusion Cascade (Task 1279)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of MSCI inclusion detection + large-cap peer filtering.
 */
export interface MsciCascadeResult {
  /** True if MSCI keywords detected + credibility >= 0.7 */
  matched: boolean;
  /** List of detected MSCI keywords (lowercase) */
  detectedKeywords: string[];
  /** Large-cap watchlist stocks affected by cascade */
  targetStocks: string[];
  /** Human-readable explanation of cascade logic */
  reasoning: string;
  /** Confidence score: (credibility × keywordCount / 3.0) capped at 1.0 */
  confidence: number;
}

/**
 * Detect MSCI inclusion keywords + identify large-cap watchlist stocks.
 *
 * Returns target large-cap stocks (empty array if rule doesn't apply).
 *
 * @param seedSummary - Original news article summary
 * @param sourceCredibility - Credibility score [0, 1] (e.g., 0.95 for Reuters)
 * @param watchlist - Full watchlist to find large-cap stocks
 * @param largeCapListOverride - Optional: override the large-cap stock list (for testing)
 * @returns MsciCascadeResult with matched flag and targetStocks list
 *
 * Logic:
 *   1. Call detectMsciInclusion(seedSummary, sourceCredibility)
 *   2. If matched=false, return empty targetStocks + credibility rejection reason
 *   3. If matched=true:
 *      - Use largeCapListOverride if provided, else default hardcoded list
 *      - Filter watchlist to large-cap stocks only
 *      - Return targetStocks + confidence + reasoning
 *
 * Contrast with insider dump cascade:
 *   - Insider dump: sector-specific peers (banking contagion)
 *   - MSCI inclusion: cross-sector large-cap selection (index-level impact)
 *
 * Example:
 *   seedSummary = "Reuters announces Vietnam MSCI nộp danh sách"
 *   sourceCredibility = 0.95
 *   watchlist = [VCB(banking), BID(banking), FPT(tech), MWG(retail), VNM(agriculture)]
 *   return = { matched: true, targetStocks: ["VCB", "BID", "FPT", "MWG"], confidence: 0.60, ... }
 *   (VNM excluded as non-large-cap)
 */
export function detectMsciCascadePeers(
  seedSummary: string,
  sourceCredibility: number,
  watchlist: WatchlistEntry[],
  largeCapListOverride?: string[],
): MsciCascadeResult {
  // ── Step 1: Detect MSCI inclusion keywords ──────────────────────────────
  const msciResult = detectMsciInclusion(seedSummary, sourceCredibility);

  if (!msciResult.matched) {
    return {
      matched: false,
      detectedKeywords: [],
      targetStocks: [],
      reasoning: `MSCI inclusion keywords not detected or credibility < 0.7 (credibility: ${sourceCredibility.toFixed(2)})`,
      confidence: 0,
    };
  }

  // ── Step 2: Use large-cap stock list ──────────────────────────────────
  // Default: hardcoded list of major Vietnamese large-cap stocks
  const LARGE_CAP_FALLBACK = ["MWG", "KDH", "FPT", "MSN", "VCB", "HPG", "BID", "CTG"];
  const largeCapStocks = largeCapListOverride || LARGE_CAP_FALLBACK;

  // ── Step 3: Filter watchlist to large-cap stocks only ──────────────────
  const targetStocks = watchlist
    .filter((entry) => largeCapStocks.includes(entry.actionCode))
    .map((entry) => entry.actionCode);

  // ── Step 4: Build reasoning ────────────────────────────────────────────
  const reasoning = targetStocks.length > 0
    ? `MSCI inclusion detected: ${msciResult.keywords.join(", ")}. Targets large-cap watchlist stocks: ${targetStocks.join(", ")}`
    : `MSCI inclusion detected: ${msciResult.keywords.join(", ")}, but no large-cap stocks in watchlist.`;

  return {
    matched: true,
    detectedKeywords: msciResult.keywords,
    targetStocks,
    reasoning,
    confidence: msciResult.confidence,
  };
}
