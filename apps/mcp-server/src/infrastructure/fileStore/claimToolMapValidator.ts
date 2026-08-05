/**
 * claimToolMapValidator.ts — Shape validation for the parsed claim-tool-map.json body
 *
 * CCATO-MCP-T2-CLAIM-MAP-LOADER (split out of claimToolMapLoader.ts, same
 * size-lint rationale T1 used for claimToolMapTypes.ts: a brand-new file,
 * not legacy — prefer a split to <=120L over a justification header).
 *
 * Pure, zero fs/network I/O — only string/shape checks against an already-
 * parsed JSON value. Exported separately from claimToolMapLoader.ts so the
 * loader itself stays a thin "read file -> parse JSON -> validate -> return"
 * pipeline; re-exported from claimToolMapLoader.ts so existing/future
 * callers importing from that module path are unaffected.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 */

import type {
  ClaimToolMap,
  ClaimToolMapDimension,
} from "../../domain/services/narrativeTruthGate/claimToolMapTypes.js";

/**
 * Thrown when the SSOT file is missing, unreadable, unparsable, or missing
 * a field the domain layer requires. `.message` is caller-safe to surface
 * verbatim as `GATE_VERDICT: CONFIG_ERROR: <message>` (brief §3.1).
 */
export class ClaimToolMapLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimToolMapLoadError";
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isDimension(v: unknown): v is ClaimToolMapDimension {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.id === "string" &&
    isStringArray(d.keywords) &&
    typeof d.tool === "string" &&
    typeof d.requires_ticker === "boolean" &&
    typeof d.arg_style === "string"
  );
}

/**
 * Validate the parsed JSON body against the minimal shape the domain layer
 * (ClaimToolMap, claimCandidateScanner.ts) requires. Extra top-level fields
 * (e.g. `tool_null_markers`, `_meta`, `version`) are ignored — this only
 * asserts presence/shape of the fields ClaimToolMap declares; it does not
 * fail closed on additive SSOT extensions other consumers may read directly
 * from the same file.
 *
 * @throws ClaimToolMapLoadError - shape mismatch, with `sourcePath` in the message.
 */
export function assertClaimToolMapShape(body: unknown, sourcePath: string): ClaimToolMap {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ClaimToolMapLoadError(
      `claim-tool-map.json at ${sourcePath} did not parse to a JSON object`,
    );
  }
  const b = body as Record<string, unknown>;

  if (!isStringArray(b.negation_lexicon)) {
    throw new ClaimToolMapLoadError(
      `claim-tool-map.json at ${sourcePath} is missing a valid "negation_lexicon" string[] field`,
    );
  }
  if (!isStringArray(b.non_ticker_tokens)) {
    throw new ClaimToolMapLoadError(
      `claim-tool-map.json at ${sourcePath} is missing a valid "non_ticker_tokens" string[] field`,
    );
  }
  if (!Array.isArray(b.dimensions) || b.dimensions.length === 0 || !b.dimensions.every(isDimension)) {
    throw new ClaimToolMapLoadError(
      `claim-tool-map.json at ${sourcePath} is missing a valid non-empty "dimensions" array ` +
        `(each entry needs id/keywords[]/tool/requires_ticker/arg_style)`,
    );
  }

  return {
    negation_lexicon: b.negation_lexicon,
    non_ticker_tokens: b.non_ticker_tokens,
    dimensions: b.dimensions,
  };
}
