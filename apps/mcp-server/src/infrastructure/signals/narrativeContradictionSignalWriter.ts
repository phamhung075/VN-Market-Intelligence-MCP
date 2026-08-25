// size-justification: 193L — row builder + the guard-screened write loop are one contract; the
// guards themselves already live in narrativeContradictionGuards.ts, and splitting the builder
// from its only caller would leave two orphan files with a shared, undocumented invariant.
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
import {
  buildContradictionSummary,
  buildDedupKey,
  checkClockSkew,
  checkNullMarkerContradiction,
  checkTestHarnessLiveWrite,
  loadNullMarkers,
  quarantineRow,
  DEFAULT_QUARANTINE_PATH,
} from "./narrativeContradictionGuards.js";
import type {
  NarrativeContradictionFinding,
  NarrativeContradictionSignalRow,
} from "./narrativeContradictionSignalTypes.js";

export {
  MARKER_TEST_HARNESS_LIVE_WRITE,
  MARKER_CLOCK_SKEW,
  MARKER_NULL_MARKER_CONTRADICTION,
  MAX_TS_SKEW_MS,
} from "./narrativeContradictionGuards.js";

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
  const cycle = ts.slice(0, 10);
  return {
    id: buildNarrativeContradictionId(finding, ts, randomSuffixFn),
    ts,
    from: agentId,
    to: "po",
    type: "narrative_contradiction",
    // AC-5: derived from the probe evidence, never an unconditional "non-null" assertion.
    summary: buildContradictionSummary(
      agentId,
      finding.dimension,
      finding.ticker_or_dim,
      finding.tool,
      finding.returned_value,
    ),
    severity: "MED",
    status: "NEW",
    payload_ref: null,
    dedup_key: buildDedupKey(agentId, finding.tool, finding.ticker_or_dim, cycle),
    payload: {
      agent_id: agentId,
      claim: finding.claim_text,
      tool: finding.tool,
      ticker: finding.ticker_or_dim,
      probe_ticker: finding.probe_ticker,
      returned_value: finding.returned_value,
      cycle,
      gate_version: GATE_VERSION,
    },
  };
}

/** Guard-plane overrides. All default to the real production environment; tests inject. */
export interface NarrativeContradictionWriteDeps {
  /** Which path counts as the LIVE artifact (test-harness + clock-skew guards key off it). */
  livePath?: string;
  /** Defaults to `process.env.NODE_ENV === "test"` — bun test sets this automatically. */
  isTestEnv?: boolean;
  /** Real wall clock for the AC-7 skew check; distinct from `now`, which is the row's own ts source. */
  wallClockMs?: number;
  /** tool_null_markers; defaults to the claim-tool-map.json SSOT (never hardcoded — AC-4). */
  nullMarkers?: readonly string[];
  quarantinePath?: string;
  logFn?: (msg: string) => void;
}

/**
 * Append one narrative_contradiction row for every FAIL finding, after
 * screening each candidate at the write boundary.
 *
 * Each surviving finding gets its own appendSignalQueueRow() call (own
 * CAS-retry window) — matches the bash engine's loop-and-append-many (script
 * L412-439). Never throws on a dropped row (CAS exhaustion after 3 retries):
 * appendSignalQueueRow only warns — one lost signal must not crash the
 * calling MCP tool's response.
 *
 * Screening (FIX-CCATO-NTG-...), first hit wins, each with its own marker:
 *   1. test-harness live write — refused outright (the row is provably
 *      synthetic; persisting it would be the very pollution being fixed).
 *   2. clock skew on a live target (AC-7)  -> quarantine sidecar.
 *   3. returned_value IS a tool_null_marker (AC-4) -> quarantine sidecar.
 * Never a silent drop (AC-3): every rejection logs `marker` and, for 2/3,
 * writes the full candidate row to the quarantine JSONL.
 *
 * @param findings       - CCATO FAIL findings for this gate run (may be empty — no-op).
 * @param agentId         - Calling agent's kebab-case id (script's `agent_id`).
 * @param orchStatePath   - Absolute path override (test isolation).
 * @param now             - Injectable clock (testability — never read Date.now() directly).
 * @param deps            - Guard-plane overrides; production passes nothing.
 */
export function writeNarrativeContradictionSignals(
  findings: readonly NarrativeContradictionFinding[],
  agentId: string,
  orchStatePath: string = DEFAULT_ORCH_STATE_PATH,
  now: Date = new Date(),
  deps: NarrativeContradictionWriteDeps = {},
): void {
  if (findings.length === 0) return;

  const livePath = deps.livePath ?? DEFAULT_ORCH_STATE_PATH;
  const isTestEnv = deps.isTestEnv ?? process.env["NODE_ENV"] === "test";
  const isLiveTarget = orchStatePath === livePath;
  const wallClockMs = deps.wallClockMs ?? Date.now();
  const quarantinePath = deps.quarantinePath ?? DEFAULT_QUARANTINE_PATH;
  const log = deps.logFn ?? ((msg: string) => console.error(msg));

  const harnessRejection = checkTestHarnessLiveWrite(orchStatePath, livePath, isTestEnv);
  if (harnessRejection) {
    log(`[${harnessRejection.marker}] ${findings.length} narrative_contradiction row(s) ${harnessRejection.reason}`);
    return;
  }

  const markers = deps.nullMarkers ?? loadNullMarkers();

  for (const finding of findings) {
    const row = buildNarrativeContradictionRow(finding, agentId, now);
    const rejection =
      checkClockSkew(row.ts, wallClockMs, isLiveTarget) ??
      checkNullMarkerContradiction(finding.returned_value, markers);
    if (rejection) {
      quarantineRow(row, rejection, quarantinePath);
      log(`[${rejection.marker}] ${row.id} quarantined: ${rejection.reason}`);
      continue;
    }
    appendSignalQueueRow(orchStatePath, row, row.ts, SIGNAL_WRITER_ID);
  }
}
