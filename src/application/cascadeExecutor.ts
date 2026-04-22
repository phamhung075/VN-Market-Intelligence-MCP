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
