/**
 * CCATO-MCP-T1-DOMAIN-ENGINE — Claim-tool-map input/output types
 *
 * Public type contracts for the CCATO domain layer scanner. Split out of
 * claimCandidateScanner.ts (task FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-
 * OFFENDERS, AC-5 — the 190L file was a NEW size-lint offender; preferred a
 * split to <=120L per file over a justification header since the file is
 * 3 days old, not legacy) so each file stays under the 120L size-lint
 * threshold. See claimCandidateScanner.ts for the scanning logic itself.
 *
 * Mirrors docs/data/claim-tool-map.json's shape — SSOT loaded by
 * infrastructure/fileStore/claimToolMapLoader.ts, never hardcoded here.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 */

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
