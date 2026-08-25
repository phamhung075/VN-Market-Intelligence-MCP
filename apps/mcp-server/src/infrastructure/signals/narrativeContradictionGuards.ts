// size-justification: 149L — write-boundary guard set for narrative_contradiction rows; the
// four checks + their SSOT loader + the shared quarantine sink are one contract (a caller that
// applies a subset silently re-opens the class), and splitting leaves orphan single-fn files.
/**
 * narrativeContradictionGuards.ts — FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-
 * SANCTIONED-ENGINE-FORGED-WRITER-ID
 *
 * Write-boundary guards for narrative_contradiction rows. Attribution (that
 * row's AC-1) found the emitter was NOT a forger: it was the real production
 * writer driven by CCATO-MCP-T5-USECASE.test.ts against the real
 * DEFAULT_ORCH_STATE_PATH with the suite's injected frozen clock. Stubbing
 * those five tests fixes today's leak; these guards close the class, because
 * "every future test author remembers to stub the writer" is prose, and prose
 * is a known-failed fix for this shape.
 *
 * Fail mode is QUARANTINE + a distinct greppable marker — never a silent drop
 * (AC-3): a validator that discards a genuine contradiction is strictly worse
 * than the noise it removes.
 *
 * DDD layer: infrastructure/signals — pure predicates plus one append-only
 * sidecar sink; no orch-state I/O (that stays in orchStateStore.ts).
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getProjectRoot } from "../projectRoot.js";
import { loadClaimToolMap } from "../fileStore/claimToolMapLoader.js";

/** A refused/quarantined candidate row. `marker` is the greppable operator handle. */
export interface GuardRejection {
  marker: string;
  reason: string;
}

export const MARKER_TEST_HARNESS_LIVE_WRITE = "NTG-GUARD-REFUSED-TEST-HARNESS-LIVE-WRITE";
export const MARKER_CLOCK_SKEW = "NTG-GUARD-QUARANTINED-CLOCK-SKEW";
export const MARKER_NULL_MARKER_CONTRADICTION = "NTG-GUARD-QUARANTINED-NULL-MARKER-CONTRADICTION";

/** AC-7 tolerance, applied in BOTH directions — the observed defect was 31h STALE, not future. */
export const MAX_TS_SKEW_MS = 15 * 60 * 1000;

/** Append-only sidecar for quarantined rows (telemetry/*.jsonl precedent). */
export const DEFAULT_QUARANTINE_PATH = resolve(
  getProjectRoot(),
  "docs/data/telemetry/narrative-contradiction-quarantine.jsonl",
);

// ─────────────────────────────────────────────────────────────────────────────
// Row-content builders
// ─────────────────────────────────────────────────────────────────────────────

/** AC-6 — keyed on the FINDING (so repeat emissions collapse), never on the emission. */
export function buildDedupKey(agentId: string, tool: string, tickerOrDim: string, cycle: string): string {
  return `narrative_contradiction:${agentId}:${tool}:${tickerOrDim}:${cycle}`;
}

/**
 * AC-5 — summary DERIVED from the probe evidence. The prior template asserted
 * "... returned non-null data" unconditionally without ever reading the value,
 * so a row whose own payload said the opposite still read as an accusation.
 * Budgeted to the 120-char HC-2 cap so appendSignalQueueRow never has to
 * truncate the evidence away.
 */
export function buildContradictionSummary(
  agentId: string,
  dimension: string,
  tickerOrDim: string,
  tool: string,
  returnedValue: string,
  maxLen = 120,
): string {
  const head = `CCATO: ${agentId} claimed no ${dimension} for ${tickerOrDim}; ${tool} returned: `;
  const budget = maxLen - head.length;
  if (budget <= 1) return head.slice(0, maxLen);
  return head + (returnedValue.length > budget ? `${returnedValue.slice(0, budget - 1)}…` : returnedValue);
}

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

/** Refuse a write aimed at the LIVE orch-state.json from inside a test runner. */
export function checkTestHarnessLiveWrite(
  targetPath: string,
  livePath: string,
  isTestEnv: boolean,
): GuardRejection | null {
  if (!isTestEnv || targetPath !== livePath) return null;
  return {
    marker: MARKER_TEST_HARNESS_LIVE_WRITE,
    reason: `refused: NODE_ENV=test write aimed at the live orch-state.json (${livePath}) — pass an orchStatePath/writeSignalsFn override`,
  };
}

/** AC-7 — a row whose ts is not a clock read at emission time, either direction. */
export function checkClockSkew(rowTs: string, wallClockMs: number, isLiveTarget: boolean): GuardRejection | null {
  if (!isLiveTarget) return null;
  const rowMs = Date.parse(rowTs);
  if (Number.isNaN(rowMs)) {
    return { marker: MARKER_CLOCK_SKEW, reason: `unparseable ts "${rowTs}"` };
  }
  const skew = rowMs - wallClockMs;
  if (Math.abs(skew) <= MAX_TS_SKEW_MS) return null;
  return {
    marker: MARKER_CLOCK_SKEW,
    reason: `ts "${rowTs}" is ${Math.round(skew / 60000)}min from the wall clock (tolerance +/-${MAX_TS_SKEW_MS / 60000}min) — not a clock read at emission time`,
  };
}

/** AC-4 — a FAIL whose evidence IS an honest-absence marker is structurally impossible. */
export function checkNullMarkerContradiction(
  returnedValue: string,
  markers: readonly string[],
): GuardRejection | null {
  const hay = returnedValue.toLowerCase();
  const hit = markers.find((m) => m.length > 0 && hay.includes(m.toLowerCase()));
  if (hit === undefined) return null;
  return {
    marker: MARKER_NULL_MARKER_CONTRADICTION,
    reason: `returned_value "${returnedValue}" contains tool_null_markers entry "${hit}" — that is an honest NULL, not a contradiction`,
  };
}

/** Read tool_null_markers from the claim-tool-map SSOT; never hardcode the list (AC-4). */
export function loadNullMarkers(loadFn: typeof loadClaimToolMap = loadClaimToolMap): readonly string[] {
  try {
    return loadFn().tool_null_markers ?? [];
  } catch {
    return []; // SSOT unreadable -> fail OPEN; a missing gate must not drop real findings (AC-3)
  }
}

/** AC-3 — persist the rejected candidate before it disappears. Best-effort, never throws. */
export function quarantineRow(
  row: unknown,
  rejection: GuardRejection,
  quarantinePath: string = DEFAULT_QUARANTINE_PATH,
  appendFn: (p: string, d: string) => void = (p, d) => appendFileSync(p, d, "utf8"),
): void {
  try {
    mkdirSync(dirname(quarantinePath), { recursive: true });
    appendFn(
      quarantinePath,
      `${JSON.stringify({ quarantined_at: new Date().toISOString(), marker: rejection.marker, reason: rejection.reason, row })}\n`,
    );
  } catch {
    /* sidecar unavailable — the caller still logs the marker, so the drop is never silent */
  }
}
