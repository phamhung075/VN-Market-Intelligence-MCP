/**
 * CCATO-MCP-T1-DOMAIN-ENGINE — ticker extraction + paragraph/sentence split
 *
 * TS port of scripts/narrative-truth-gate.sh's python engine, lines 144-163
 * (ticker extraction + paragraph/sentence split). Pure functions, zero I/O.
 *
 * Split out of claimCandidateScanner.ts (task FIX-CI-SIZELINT-MCPSERVER-SIX-
 * UNCOVERED-OFFENDERS, AC-5) so each file stays under the 120L size-lint
 * threshold. See claimCandidateScanner.ts for the scanning logic that
 * consumes these helpers.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 */

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
