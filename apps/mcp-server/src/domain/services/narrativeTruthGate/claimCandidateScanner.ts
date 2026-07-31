/**
 * CCATO-MCP-T1-DOMAIN-ENGINE — Claim candidate scanner
 *
 * TS port of scripts/narrative-truth-gate.sh's python engine, lines 280-323
 * (Step 1-3: negation-lexicon scan, dimension-keyword anchor, ticker
 * resolution). Ticker extraction and paragraph/sentence split moved to
 * ./tickerExtraction.ts; input/output types moved to ./claimToolMapTypes.ts
 * (task FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS, AC-5 — split to
 * <=120L/file instead of a justification header since this file is 3 days
 * old, not legacy). Both are re-exported below so existing callers/tests
 * importing from this module path are unaffected.
 *
 * CCATO = Claim Contradicts Authorized Tool Output: an agent asserts
 * absence/unavailability of a data dimension its own authorized tools would
 * populate. This module identifies CANDIDATE claims (a negation phrase +
 * a dimension keyword co-occurring in the same sentence) — it does NOT
 * perform the live re-probe or verdict classification (see
 * verdictClassifier.ts) and does NOT do any fs/network I/O.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 * SSOT for negation_lexicon / dimensions / non_ticker_tokens (passed in by
 * the caller, never hardcoded here — see docs/data/claim-tool-map.json):
 * docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md S4.2-4.4
 *
 * Pure functions, zero I/O. Domain layer only.
 */

import type { ClaimToolMap, ClaimCandidate } from "./claimToolMapTypes.js";
import { findTickers, splitParagraphs, splitSentences } from "./tickerExtraction.js";

export type { ClaimToolMapDimension, ClaimToolMap, ClaimCandidate } from "./claimToolMapTypes.js";
export { findTickers, splitParagraphs, splitSentences } from "./tickerExtraction.js";

// ─────────────────────────────────────────────────────────────────────────────
// scanClaimCandidates — Step 1-3 (TS port of script L280-323)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan a post body for CCATO candidate claims: sentences containing a
 * negation-lexicon phrase co-occurring with a dimension's keyword.
 *
 * Dedup rule (byte-faithful port of script L294-300): at most ONE candidate
 * per (paragraph, dimension) pair — the FIRST matching sentence in a
 * paragraph claims that dimension slot for the whole paragraph, even if a
 * later sentence in the same paragraph would have resolved a ticker where
 * the first one could not (script marks the slot "seen" before the
 * ticker-resolution check, not after).
 *
 * Ticker resolution (script L302-312):
 *   - `requires_ticker: true`  → first ticker in the enclosing paragraph,
 *     falling back to the first ticker anywhere in the whole post.
 *   - `requires_ticker: false` → first ticker anywhere in the whole post
 *     (the tool call still needs a concrete probe ticker even though the
 *     claim-side identifier is the dimension id).
 *   - No ticker resolvable anywhere → candidate is dropped (cannot verify).
 *
 * @param postBody  Composed narrative text.
 * @param claimMap  SSOT (docs/data/claim-tool-map.json), loaded by the caller.
 */
export function scanClaimCandidates(postBody: string, claimMap: ClaimToolMap): ClaimCandidate[] {
  const nonTickerTokens = new Set(claimMap.non_ticker_tokens.map((t) => t.toUpperCase()));
  const wholePostTickers = findTickers(postBody, nonTickerTokens);
  const paragraphs = splitParagraphs(postBody);

  const candidates: ClaimCandidate[] = [];
  const seenParaDim = new Set<string>();

  paragraphs.forEach((paragraph, pIdx) => {
    const paraTickers = findTickers(paragraph, nonTickerTokens);

    for (const sentence of splitSentences(paragraph)) {
      const sentLower = sentence.toLowerCase();
      const matchedNegations = claimMap.negation_lexicon.filter((n) => sentLower.includes(n.toLowerCase()));
      const matchedNegation = matchedNegations[0];
      if (matchedNegation === undefined) continue;

      for (const dim of claimMap.dimensions) {
        const key = `${pIdx}::${dim.id}`;
        if (seenParaDim.has(key)) continue;

        const keywords = dim.keywords ?? [];
        if (!keywords.some((kw) => sentLower.includes(kw.toLowerCase()))) continue;
        seenParaDim.add(key);

        const requiresTicker = dim.requires_ticker ?? true;
        let ticker: string | undefined;
        let tickerOrDim: string;
        if (requiresTicker) {
          ticker = paraTickers[0] ?? wholePostTickers[0];
          tickerOrDim = ticker ?? dim.id;
        } else {
          ticker = wholePostTickers[0];
          tickerOrDim = dim.id;
        }

        if (ticker === undefined) {
          // No ticker anywhere to probe — cannot verify. Mirrors the bash
          // engine's [WARN]+continue (script L314-318); this pure layer
          // silently drops the candidate (no I/O), matching the "Output:
          // candidates[]" contract in the architecture brief §3.2.
          continue;
        }

        candidates.push({
          dimension: dim,
          ticker,
          ticker_or_dim: tickerOrDim,
          claim_text: sentence.trim(),
          matched_negation: matchedNegation,
        });
      }
    }
  });

  return candidates;
}
