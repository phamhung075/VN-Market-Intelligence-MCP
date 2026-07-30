/**
 * CCATO-MCP-T1-DOMAIN-ENGINE — Claim candidate scanner
 *
 * TS port of scripts/narrative-truth-gate.sh's python engine, lines 144-163
 * (ticker extraction + paragraph/sentence split) and 280-323 (Step 1-3:
 * negation-lexicon scan, dimension-keyword anchor, ticker resolution).
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

// ─────────────────────────────────────────────────────────────────────────────
// Public input types — mirror docs/data/claim-tool-map.json's shape
// ─────────────────────────────────────────────────────────────────────────────

/** One entry of claim-tool-map.json's `dimensions[]` array. */
export interface ClaimToolMapDimension {
  id: string;
  keywords: string[];
  tool: string;
  requires_ticker: boolean;
  arg_style: string;
}

/**
 * The subset of docs/data/claim-tool-map.json this scanner needs.
 * Loading/parsing the JSON file is infrastructure's job
 * (infrastructure/fileStore/claimToolMapLoader.ts) — this type is the
 * domain-owned contract that loader must produce.
 */
export interface ClaimToolMap {
  negation_lexicon: string[];
  non_ticker_tokens: string[];
  dimensions: ClaimToolMapDimension[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public output type
// ─────────────────────────────────────────────────────────────────────────────

/** One CCATO candidate claim awaiting live re-probe + verdict classification. */
export interface ClaimCandidate {
  dimension: ClaimToolMapDimension;
  /** Concrete probe ticker (always resolved — candidates with no ticker are dropped). */
  ticker: string;
  /**
   * Claim-side identifier for the signal/report: a specific ticker when
   * `dimension.requires_ticker` is true, otherwise the dimension id
   * (script L306/L312 `ticker_or_dim`).
   */
  ticker_or_dim: string;
  claim_text: string;
  matched_negation: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticker extraction (TS port of script L144-155)
// ─────────────────────────────────────────────────────────────────────────────

const TICKER_PATTERN = /\b([A-Z]{2,4})\b/g;

/**
 * Extract VN-ticker candidates ([A-Z]{2,4}) from free text, first-seen order,
 * excluding the SSOT `non_ticker_tokens` denylist (already-uppercased set).
 */
export function findTickers(text: string, nonTickerTokens: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(TICKER_PATTERN)) {
    const ticker = match[1];
    if (ticker === undefined) continue;
    if (nonTickerTokens.has(ticker)) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paragraph / sentence split (TS port of script L159-163)
// ─────────────────────────────────────────────────────────────────────────────

/** Split a post body into non-blank paragraphs on blank-line boundaries. */
export function splitParagraphs(body: string): string[] {
  return body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
}

/** Split a paragraph into non-blank sentences on [.!?]-then-whitespace boundaries. */
export function splitSentences(paragraph: string): string[] {
  return paragraph
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
}

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
