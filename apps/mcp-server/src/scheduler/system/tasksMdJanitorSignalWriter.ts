/**
 * tasksMdJanitorJob — Step R-5: orch-state.json signal_queue writer
 * (OSC-2 — replaces DASHBOARD.md appendDashboardRow).
 *
 * Split out of tasksMdJanitorJob.ts (FIX-SIZELINT-TASKSMDJANITORJOB-1012L,
 * 2026-08-24).
 */

import {
  appendSignalQueueRow,
  writeOrchStateAtomic,
  type OrchStateSignalRow,
} from "../../infrastructure/orchStateStore.js";
import type { DivergenceRow } from "./tasksMdJanitorTypes.js";

/**
 * Sanitize a per-finding discriminator (e.g. taskId) for embedding in a
 * signal_queue row id. Lowercases, collapses any run of non [a-z0-9]
 * characters to a single hyphen, and trims leading/trailing hyphens.
 *
 * FU-AUDITOR-D4-SIGNAL-ID: id-safe encoding so arbitrary taskId values
 * (e.g. "orch-state.json", task ids with colons/slashes) never break the
 * `sau-d4-{entity}-{check}-{YYYYMMDD}` id shape or introduce accidental
 * collisions from divergent-but-similar raw strings.
 */
export function sanitizeSignalIdSegment(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "unknown";
}

/**
 * Append a system_issue row to orch-state.json .signal_queue.rows[] atomically.
 *
 * OSC-2 replacement for the old appendDashboardRow(DASHBOARD.md) pattern.
 * Uses appendSignalQueueRow() from orchStateStore (temp-file-then-rename).
 *
 * Summary is capped at 120 chars (HC-2). Severity is always LOW for D4 divergences
 * unless it is a concurrent_commit (MED).
 *
 * FU-AUDITOR-D4-SIGNAL-ID: id is now a per-finding discriminator
 * `sau-d4-{entityId}-{checkId}-{YYYYMMDD}` instead of a batch id keyed only
 * on minute-truncated timestamp (`sau-d4-{YYYYMMDDHHMM}`). The batch id
 * collided whenever R-5 emitted more than one divergence in the same job
 * run (same minute) — up to 8 distinct per-task findings landed on ONE
 * signal_queue row id. `entityId` is the per-finding subject (D4's
 * `DivergenceRow.taskId` — the "ticker" slot in the id contract);
 * `kind` is the check discriminator (the "check_id" slot).
 */
export function appendOrchStateSignalRow(
  orchStatePath: string,
  summary: string,
  nowIso: string,
  kind: DivergenceRow["kind"],
  entityId: string,
  readFile: (p: string) => string,
  writeFile: (p: string, s: string) => void,
  fileExists: (p: string) => boolean,
): void {
  const ts = nowIso.replace(/\.\d{3}Z$/, "Z").replace(/:\d{2}Z$/, "Z");
  const dateOnly = nowIso.slice(0, 10).replace(/-/g, "");
  const safeEntityId = sanitizeSignalIdSegment(entityId);
  const id = `sau-d4-${safeEntityId}-${kind}-${dateOnly}`;

  const severity: OrchStateSignalRow["severity"] =
    kind === "concurrent_commit" ? "MED" : "LOW";

  const row: OrchStateSignalRow = {
    id,
    ts,
    from: "system-auditor",
    to: "po",
    type: "system_issue",
    summary,
    severity,
    status: "NEW",
    payload_ref: null,
  };

  appendSignalQueueRow(
    orchStatePath,
    row,
    nowIso,
    "system-auditor",
    readFile,
    (p, d) => writeOrchStateAtomic(p, d),
    fileExists,
  );
}
