/**
 * claimToolMapLoader.ts — Infrastructure adapter: CCATO claim-tool-map SSOT loader
 *
 * CCATO-MCP-T2-CLAIM-MAP-LOADER
 *
 * Reads + parses docs/data/claim-tool-map.json — the CCATO Tier-1 SSOT for
 * negation lexicon, dimension->tool routing, arg_style, non_ticker_tokens,
 * tool_null_markers. Both the bash/python engine (scripts/narrative-truth-
 * gate.sh) and this new TS runtime read the SAME file — §3.3 of the brief
 * below: this is a DATA file, not code, so dual-runtime consumption does
 * not violate the "SSOT — do not duplicate" rule.
 *
 * Fail-loud (shape validation delegated to claimToolMapValidator.ts — split
 * out for size-lint, see that file's header): throws ClaimToolMapLoadError
 * on a missing file, unreadable file, unparsable JSON, or a JSON body
 * missing/mistyping any field the domain layer requires. The caller
 * (application/usecases/runNarrativeTruthGate.ts, CCATO-MCP-T5) is
 * responsible for catching this and surfacing it as the tool's
 * `GATE_VERDICT: CONFIG_ERROR: <reason>` response — this module never
 * formats that protocol string itself (infrastructure has no protocol
 * concerns, per the DDD layer map below).
 *
 * REPO_ROOT-resolve: the brief's spec text points at
 * infrastructure/signals/improvementSignalWriter.ts's module-level
 * `resolve(__dirname, "../../../../../../")` constant as the pattern to
 * follow. Verified empirically (bun -e probe) before copying it: that
 * literal "../../../../../../" hop-count resolves ONE LEVEL ABOVE the
 * actual monorepo root in a local checkout (lands on the parent of
 * `VN-Market-Intelligence-MCP/`), and in the deployed container — where
 * the Dockerfile `COPY apps/mcp-server/src/ ./src/` puts this file at
 * `/app/src/infrastructure/fileStore/`, not under the 6-level-deep local
 * dev path — the same fixed hop-count would resolve above `/` entirely.
 * That pre-existing constant is therefore not a safe pattern to replicate
 * verbatim; `getProjectRoot()` (infrastructure/projectRoot.ts) already
 * solves exactly this dual-context problem generically (repo-root-marker
 * filesystem walk-up in a checkout, `process.cwd()` fallback = `/app` in
 * the container) and is reused here instead. The loader function itself
 * still takes an injectable path override parameter for test isolation —
 * same convention as every other fileStore/ reader in this codebase (e.g.
 * analysisBriefReader.ts's `projectRoot` param).
 *
 * DDD layer: infrastructure/fileStore — pure filesystem adapter. Only
 * imports the `ClaimToolMap` TYPE from domain (type-only import, erased at
 * compile time — this is the normal DDD dependency direction: outer layers
 * depend on domain, domain depends on nothing). No fs/network I/O happens
 * outside this module's own functions.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getProjectRoot } from "../projectRoot.js";
import { assertClaimToolMapShape, ClaimToolMapLoadError } from "./claimToolMapValidator.js";
import type { ClaimToolMap } from "../../domain/services/narrativeTruthGate/claimToolMapTypes.js";

export { ClaimToolMapLoadError } from "./claimToolMapValidator.js";
export type { ClaimToolMap, ClaimToolMapDimension } from "../../domain/services/narrativeTruthGate/claimToolMapTypes.js";

// ─────────────────────────────────────────────────────────────────────────────
// Path resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Default on-disk location of the CCATO SSOT (docs/data/claim-tool-map.json). */
export const CLAIM_TOOL_MAP_PATH = resolve(getProjectRoot(), "docs/data/claim-tool-map.json");

// ─────────────────────────────────────────────────────────────────────────────
// loadClaimToolMap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load and validate docs/data/claim-tool-map.json.
 *
 * @param filePath - Absolute path override (test isolation). Defaults to
 *                    CLAIM_TOOL_MAP_PATH (the real repo-root SSOT).
 * @returns The validated ClaimToolMap the domain layer expects.
 * @throws ClaimToolMapLoadError - missing file, unreadable, unparsable
 *                                 JSON, or a body missing a required field.
 */
export function loadClaimToolMap(filePath: string = CLAIM_TOOL_MAP_PATH): ClaimToolMap {
  if (!existsSync(filePath)) {
    throw new ClaimToolMapLoadError(`claim-tool-map.json not found at ${filePath}`);
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new ClaimToolMapLoadError(
      `claim-tool-map.json at ${filePath} could not be read: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ClaimToolMapLoadError(
      `claim-tool-map.json at ${filePath} is not valid JSON: ${(err as Error).message}`,
    );
  }

  return assertClaimToolMapShape(parsed, filePath);
}
