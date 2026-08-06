/**
 * narrativeContradictionSignalWriter.ts — CCATO-MCP-T4-SIGNAL-WRITER
 *
 * Thin wrapper over orchStateStore.appendSignalQueueRow(); builds a
 * narrative_contradiction row byte-faithful to scripts/narrative-truth-
 * gate.sh's FAIL-path signal-emit block (script L397-453, row dict at
 * L417-437). Server-side write is REQUIRED per architecture brief §2.1 —
 * cowork agents cannot write orch-state.json themselves
 * (.claude/skills/cowork-boundary/SKILL.md); T5's use case calls this
 * module in-process instead of shelling out to orch-apply.sh.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.2
 * DDD layer: infrastructure/signals — output adapter, no bespoke fs I/O
 * (delegates all read-modify-write/CAS/atomic-rename to orchStateStore.ts,
 * the improvementSignalWriter.ts precedent). Types split out to
 * narrativeContradictionSignalTypes.ts (size-lint <=120L) and re-exported.
 */

import { randomUUID } from "node:crypto";
import { getProjectRoot } from "../projectRoot.js";
import { appendSignalQueueRow, getOrchStatePath } from "../orchStateStore.js";
import type {
  NarrativeContradictionFinding,
  NarrativeContradictionSignalRow,
} from "./narrativeContradictionSignalTypes.js";

export type {
  NarrativeContradictionPayload,
  NarrativeContradictionFinding,
  NarrativeContradictionSignalRow,
} from "./narrativeContradictionSignalTypes.js";

/** Gate engine version tag — byte-faithful port of script L435 literal "1". */
export const GATE_VERSION = "1";
/** `.signal_queue._updated_by` writer identity — matches script L445 `--arg who "narrative-truth-gate"` (the tool, not the calling agent). */
export const SIGNAL_WRITER_ID = "narrative-truth-gate";
/** Default on-disk orch-state.json (real repo-root; test callers override). */
export const DEFAULT_ORCH_STATE_PATH = getOrchStatePath(getProjectRoot());

/** Strip milliseconds from Date#toISOString() — byte-faithful to python's `%Y-%m-%dT%H:%M:%SZ`. */
function toIsoNoMillis(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Compact ISO (no `:`/`-`) — port of script L410 `now_iso.replace(":", "").replace("-", "")`. */
function toCompactIso(iso: string): string {
  return iso.replace(/[:-]/g, "");
}

/** Build a row id — port of script L416 `ntg-{now_compact}-{dimension}-{ticker_or_dim}-{uuid4[:6]}`. */
export function buildNarrativeContradictionId(
  finding: Pick<NarrativeContradictionFinding, "dimension" | "ticker_or_dim">,
  nowIso: string,
  randomSuffixFn: () => string = () => randomUUID().replace(/-/g, "").slice(0, 6),
): string {
  return `ntg-${toCompactIso(nowIso)}-${finding.dimension}-${finding.ticker_or_dim}-${randomSuffixFn()}`;
}

/** Build the full row — port of script L417-437's row dict. */
export function buildNarrativeContradictionRow(
  finding: NarrativeContradictionFinding,
  agentId: string,
  now: Date = new Date(),
  randomSuffixFn?: () => string,
): NarrativeContradictionSignalRow {
  const ts = toIsoNoMillis(now);
  return {
    id: buildNarrativeContradictionId(finding, ts, randomSuffixFn),
    ts,
    from: agentId,
    to: "po",
    type: "narrative_contradiction",
    summary: `CCATO: ${agentId} claimed absence of ${finding.dimension} data for ${finding.ticker_or_dim} but ${finding.tool} returned non-null data`,
    severity: "MED",
    status: "NEW",
    payload_ref: null,
    payload: {
      agent_id: agentId,
      claim: finding.claim_text,
      tool: finding.tool,
      ticker: finding.ticker_or_dim,
      probe_ticker: finding.probe_ticker,
      returned_value: finding.returned_value,
      cycle: ts.slice(0, 10),
      gate_version: GATE_VERSION,
    },
  };
}

/**
 * Append one narrative_contradiction row for every FAIL finding.
 *
 * Each finding gets its own appendSignalQueueRow() call (own CAS-retry
 * window) — matches the bash engine's loop-and-append-many (script
 * L412-439). Never throws on a dropped row (CAS exhaustion after 3
 * retries): appendSignalQueueRow only warns — one lost signal must not
 * crash the calling MCP tool's response.
 *
 * @param findings       - CCATO FAIL findings for this gate run (may be empty — no-op).
 * @param agentId         - Calling agent's kebab-case id (script's `agent_id`).
 * @param orchStatePath   - Absolute path override (test isolation).
 * @param now             - Injectable clock (testability — never read Date.now() directly).
 */
export function writeNarrativeContradictionSignals(
  findings: readonly NarrativeContradictionFinding[],
  agentId: string,
  orchStatePath: string = DEFAULT_ORCH_STATE_PATH,
  now: Date = new Date(),
): void {
  for (const finding of findings) {
    const row = buildNarrativeContradictionRow(finding, agentId, now);
    appendSignalQueueRow(orchStatePath, row, row.ts, SIGNAL_WRITER_ID);
  }
}
