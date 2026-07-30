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
import { detectAgricultureWeatherKeywords } from "../domain/services/agricultureDetector.js";

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

  const originalDisplay = originalStocks.length <= 5
    ? originalStocks.join(", ")
    : `${originalStocks.slice(0, 5).join(", ")} +${originalStocks.length - 5} more`;
  const peersDisplay = peerStocks.length <= 5
    ? peerStocks.join(", ")
    : `${peerStocks.slice(0, 5).join(", ")} +${peerStocks.length - 5} more`;

  return `[Insider Dump Cascade] Original stock(s): ${originalDisplay}. Cascading to banking peers: ${peersDisplay}`;
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
  // hardcode-scan-allow: JANITOR-034 — pending generalization decision, tracked in docs/data/code-janitor-known-findings.json
  const LARGE_CAP_FALLBACK = ["MWG", "KDH", "FPT", "MSN", "VCB", "HPG", "BID", "CTG"];
  const largeCapStocks = largeCapListOverride || LARGE_CAP_FALLBACK;

  // ── Step 3: Filter watchlist to large-cap stocks only ──────────────────
  const targetStocks = watchlist
    .filter((entry) => largeCapStocks.includes(entry.actionCode))
    .map((entry) => entry.actionCode);

  // ── Step 4: Build reasoning ────────────────────────────────────────────
  const keywordsDisplay = msciResult.keywords.length <= 5
    ? msciResult.keywords.join(", ")
    : `${msciResult.keywords.slice(0, 5).join(", ")} +${msciResult.keywords.length - 5} more`;
  const targetDisplay = targetStocks.length <= 5
    ? targetStocks.join(", ")
    : `${targetStocks.slice(0, 5).join(", ")} +${targetStocks.length - 5} more`;

  const reasoning = targetStocks.length > 0
    ? `MSCI inclusion detected: ${keywordsDisplay}. Targets large-cap watchlist stocks: ${targetDisplay}`
    : `MSCI inclusion detected: ${keywordsDisplay}, but no large-cap stocks in watchlist.`;

  return {
    matched: true,
    detectedKeywords: msciResult.keywords,
    targetStocks,
    reasoning,
    confidence: msciResult.confidence,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Agriculture Weather Cascade (Task 1281)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of agriculture weather detection + agricultural stock filtering.
 */
export interface AgricultureCascadeResult {
  /** True if weather keywords detected + credibility >= 0.6 */
  matched: boolean;
  /** List of detected weather keywords (lowercase) */
  detectedKeywords: string[];
  /** Weather impact type: "rainfall" | "drought" | "storm" | "cold_snap" | null */
  impactType: string | null;
  /** Agricultural watchlist stocks affected by cascade */
  targetStocks: string[];
  /** Human-readable explanation of cascade logic */
  reasoning: string;
  /** Confidence score: min(1.0, sourceCredibility × keywordCount / 3.0) */
  confidence: number;
}

/**
 * Detect agriculture weather keywords + identify agricultural watchlist stocks.
 *
 * Returns target agricultural stocks (empty array if rule doesn't apply).
 *
 * @param seedSummary - Original news article summary
 * @param sourceCredibility - Credibility score [0, 1] (e.g., 0.95 for Reuters, 0.8 for VnExpress)
 * @param watchlist - Full watchlist to find agricultural stocks
 * @returns AgricultureCascadeResult with matched flag and targetStocks list
 *
 * Logic:
 *   1. Call detectAgricultureWeatherKeywords(seedSummary, sourceCredibility)
 *   2. If matched=false, return empty targetStocks + credibility rejection reason
 *   3. If matched=true:
 *      - Filter watchlist to domain="agriculture" stocks only
 *      - Return targetStocks + confidence + impactType + reasoning
 *
 * Agricultural stock list (from watchlist.domain="agriculture"):
 *   Core: VNR (agritech), BFC (agritech), QNT (aquaculture)
 *   Extended: ANV (aquaculture), MPC (seafood), ASM (aquaculture)
 *
 * Example:
 *   seedSummary = "VnExpress: Mưa lớn kéo dài 5 ngày ở Mekong Delta gây lũ lụt"
 *   sourceCredibility = 0.8
 *   watchlist = [VNR(agriculture), BFC(agriculture), QNT(agriculture), FPT(tech), VCB(banking)]
 *   return = { matched: true, impactType: "rainfall", targetStocks: ["VNR", "BFC", "QNT"], confidence: 0.53, ... }
 */
export function detectAgricultureCascadePeers(
  seedSummary: string,
  sourceCredibility: number,
  watchlist: WatchlistEntry[],
): AgricultureCascadeResult {
  // ── Step 1: Detect agriculture weather keywords ─────────────────────────
  const weatherResult = detectAgricultureWeatherKeywords(seedSummary, sourceCredibility);

  if (!weatherResult.matched) {
    return {
      matched: false,
      detectedKeywords: [],
      impactType: null,
      targetStocks: [],
      reasoning: `Agriculture weather keywords not detected or credibility < 0.6 (credibility: ${sourceCredibility.toFixed(2)})`,
      confidence: 0,
    };
  }

  // ── Step 2: Filter watchlist to agriculture-domain stocks ───────────────
  const agricultureStocks = watchlist
    .filter(w => w.domain === "agriculture")
    .map(w => w.actionCode);

  // ── Step 3: Build reasoning string ─────────────────────────────────────
  const impactLabel = weatherResult.impactType || "weather";
  const keywordsDisplay = weatherResult.keywords.length <= 5
    ? weatherResult.keywords.join(", ")
    : `${weatherResult.keywords.slice(0, 5).join(", ")} +${weatherResult.keywords.length - 5} more`;
  const stocksDisplay = agricultureStocks.length <= 5
    ? agricultureStocks.join(", ")
    : `${agricultureStocks.slice(0, 5).join(", ")} +${agricultureStocks.length - 5} more`;

  const reasoning = `[Agriculture Weather] ${impactLabel} event detected (confidence: ${weatherResult.confidence.toFixed(2)}). Keywords: ${keywordsDisplay}. Affected: ${stocksDisplay}`;

  return {
    matched: true,
    detectedKeywords: weatherResult.keywords,
    impactType: weatherResult.impactType,
    targetStocks: agricultureStocks,
    reasoning,
    confidence: weatherResult.confidence,
  };
}

/**
 * Annotation helper for causal chain reasoning.
 *
 * @param impactType - Weather impact type (rainfall, drought, storm, cold_snap)
 * @param affectedStocks - Agricultural stocks affected by cascade
 * @returns Human-readable annotation for chain.reasoning
 *
 * Example: "[Agriculture Weather] Rainfall event. Affecting: QNT, ANV, MPC (aquaculture +), VNR, BFC (crops ~)"
 */
export function annotateAgricultureWeatherCascade(
  impactType: string | null,
  affectedStocks: string[],
): string {
  if (affectedStocks.length === 0) {
    return "";
  }
  const impactLabel = impactType || "weather";
  const stocksDisplay = affectedStocks.length <= 5
    ? affectedStocks.join(", ")
    : `${affectedStocks.slice(0, 5).join(", ")} +${affectedStocks.length - 5} more`;
  return `[Agriculture Weather] ${impactLabel} event. Affecting: ${stocksDisplay}`;
}
