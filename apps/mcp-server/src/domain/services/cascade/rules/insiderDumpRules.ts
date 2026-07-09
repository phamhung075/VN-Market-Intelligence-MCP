/**
 * INSIDER_DUMP_RULES — insider-dump cascade rule table
 *
 * Extracted from cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 1).
 * Pure data move, no behavior change. Consumed via the cascade/rules barrel.
 *
 * Layer: domain/services
 */

import type { CascadeKeywordRule } from "./cascadeKeywordRule.js";

/**
 * Insider dump cascade rules: CEO/leadership exit selling (xả hàng, bán sạch, thoái sạch)
 * signals systemic banking sector distress.
 *
 * Business logic:
 *   - Insider dumps represent loss of leadership confidence in company fundamentals
 *   - In banking sector (VN's systemic hub), confidence loss at one bank cascades
 *     to peer banks via deposit flight + investor reputational contagion
 *   - Rule fires when:
 *       1. News contains insider dump keyword (already classified BEARISH in sentimentClassifier.ts)
 *       2. Original stock is banking sector
 *       3. Confidence threshold >0.6 (insider action is unambiguous)
 *
 * Peer impact: Generate HIGH-severity alerts on PEER banking stocks (not original).
 *
 * Why this pattern? (same as LEGAL_RISK_RULES)
 *   - Mirrors existing legal/policy keyword-based cascade rules
 *   - Pure domain function, no I/O, testable in isolation
 *   - Flexible: can extend to other sectors (e.g., retail founder exit → consumer contagion)
 *
 * Task 1272: Sentiment classification (keywords added)
 * Task 1278: Cascade rule + peer alert generation (this task)
 */
export const INSIDER_DUMP_RULES: CascadeKeywordRule[] = [
  { key: "insider_dump_banking_peers", keyword: "xả hàng", sector: "banking" },
  { key: "insider_dump_banking_peers", keyword: "bán sạch", sector: "banking" },
  { key: "insider_dump_banking_peers", keyword: "thoái sạch", sector: "banking" },
];
