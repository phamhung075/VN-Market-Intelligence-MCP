#!/usr/bin/env bun
/**
 * scripts/orch-conservation-check.mjs — magnitude-bounded conservation
 * circuit-breaker for orch-state.json writes.
 *
 * Task:      FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER
 * Parent:    FIX-AUDITOR-ORCHSTATE-FULLDOC-OVERWRITE-CLOBBERS-SSOT
 * Brief:     docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md §4.1
 *
 * PURPOSE:
 *   Compares a CANDIDATE orch-state document against the LIVE file's current
 *   whole-board totals (task_total, signal_total). Aborts (non-zero exit) if
 *   either total drops below FLOOR_RATIO of its live value, once the live
 *   value is >= MIN_BASELINE. Catches catastrophic full-document collapse
 *   (empirically reproduced: commit de595a44 — 320 backlog rows -> 0, 100
 *   signal rows -> 1) while NEVER blocking a normal single-task lane move,
 *   which nets to zero on task_total (item moves between lanes, does not
 *   leave the document) — see brief §4.2 for the rejected-design proof
 *   against the naive "no lane may ever decrease" wording.
 *
 * METRICS (brief §4.1 formula, EXTENDED FIX-ORCHSTATE-CONSERVATION-GUARD-QA-LANE-BLIND
 *   to include the 'qa' lane — see that task for why the original brief's lane
 *   set went stale: 'qa' is now actively populated by the Review-Lane QA-Drain
 *   mechanism, so a qa[] collapse must be counted or the guard is blind to it):
 *   task_total(doc)   = length(backlog) + length(ready) + length(in_progress)
 *                     + length(review) + length(qa) + length(done) + length(done_verified)
 *                     + Σ active_sprints[].tasks[].length
 *                     + Σ closed_sprints[].tasks[].length
 *   signal_total(doc) = length(signal_queue.rows)
 *
 * INVOCATION:
 *   bun scripts/orch-conservation-check.mjs <liveFilePath> <candidateFilePath>
 *
 * ENV:
 *   CONSERVATION_FLOOR_RATIO   default 0.5 — candidate must retain >= this
 *                              fraction of the live total for each metric.
 *   CONSERVATION_MIN_BASELINE default 10  — skip the guard entirely when the
 *                              live total is below this size (no false alarms
 *                              on legitimately-small/early/test boards).
 *   ORCH_APPLY_ALLOW_SHRINK   if set to a non-empty string — bypass: logs
 *                              SHRINK-ALLOWED and exits 0 even on violation.
 *                              NARROW NAMED BYPASS — mirrors the existing
 *                              ORCH_APPLY_LIVE_FILE_OVERRIDE test-only
 *                              precedent (scripts/orch-apply.sh). Wired ONLY
 *                              into the 2 legitimate bulk-eviction writers:
 *                              scripts/orch-cold-evict.sh and
 *                              docs/agents/pm/flow/task-archive.md. NEVER set
 *                              this anywhere else (in particular, never from
 *                              system-auditor / signal-dashboard WRITE).
 *
 * EXIT CODES:
 *   0 = conservation OK (within floor, below MIN_BASELINE, or bypass honored)
 *   1 = conservation violated (task_total or signal_total dropped below the
 *       floor ratio) and no bypass set — reuses the caller's existing
 *       "validation failed, live file untouched" exit class.
 *   3 = usage error (missing args, file not found / unreadable / unparseable)
 *
 * HARD CONSTRAINTS:
 *   - Whole-board MAGNITUDE-RATIO design, NOT naive per-lane never-decrease.
 *   - Shared by scripts/orch-apply.sh (Stage 2 gate) AND
 *     scripts/agents-flow/orch-state-hook-prewrite.mjs (PreToolUse parity) —
 *     do NOT duplicate this logic in either caller.
 */

import { existsSync, readFileSync } from 'node:fs';

const FLOOR_RATIO = Number(process.env.CONSERVATION_FLOOR_RATIO ?? '0.5');
const MIN_BASELINE = Number(process.env.CONSERVATION_MIN_BASELINE ?? '10');

const FLAT_TASK_LANES = ['backlog', 'ready', 'in_progress', 'review', 'qa', 'done', 'done_verified'];

/**
 * task_total(doc) per brief §4.1 — whole-board task magnitude, immune to
 * normal lane moves (a single task moving backlog[]->ready[] nets to zero).
 * @param {unknown} doc
 * @returns {number}
 */
function taskTotal(doc) {
  const tb = /** @type {Record<string, unknown>} */ (doc && typeof doc === 'object' ? doc.task_board : undefined) ?? {};
  let total = 0;

  for (const lane of FLAT_TASK_LANES) {
    const arr = tb[lane];
    total += Array.isArray(arr) ? arr.length : 0;
  }

  for (const sprint of Array.isArray(tb.active_sprints) ? tb.active_sprints : []) {
    const tasks = sprint && typeof sprint === 'object' ? sprint.tasks : undefined;
    total += Array.isArray(tasks) ? tasks.length : 0;
  }

  for (const sprint of Array.isArray(tb.closed_sprints) ? tb.closed_sprints : []) {
    const tasks = sprint && typeof sprint === 'object' ? sprint.tasks : undefined;
    total += Array.isArray(tasks) ? tasks.length : 0;
  }

  return total;
}

/**
 * signal_total(doc) = length(signal_queue.rows)
 * @param {unknown} doc
 * @returns {number}
 */
function signalTotal(doc) {
  const sq = /** @type {Record<string, unknown>} */ (doc && typeof doc === 'object' ? doc.signal_queue : undefined);
  const rows = sq ? sq.rows : undefined;
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Load + parse a JSON document, exiting 3 on any failure (usage error class —
 * matches orch-validate.mjs's file-not-found/unreadable exit code).
 * @param {string} path
 * @param {string} label
 * @returns {unknown}
 */
function loadDoc(path, label) {
  if (!existsSync(path)) {
    process.stderr.write(`[orch-conservation-check] ERROR: ${label} file not found: ${path}\n`);
    process.exit(3);
  }
  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    process.stderr.write(
      `[orch-conservation-check] ERROR: cannot read ${label} file: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(3);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    process.stderr.write(
      `[orch-conservation-check] ERROR: ${label} file is not valid JSON: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(3);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

const [, , liveArg, candidateArg] = process.argv;

if (!liveArg || !candidateArg) {
  process.stderr.write(
    '[orch-conservation-check] USAGE: bun scripts/orch-conservation-check.mjs <liveFilePath> <candidateFilePath>\n'
  );
  process.exit(3);
}

const liveDoc = loadDoc(liveArg, 'live');
const candidateDoc = loadDoc(candidateArg, 'candidate');

const metrics = [
  { name: 'task_total', live: taskTotal(liveDoc), candidate: taskTotal(candidateDoc) },
  { name: 'signal_total', live: signalTotal(liveDoc), candidate: signalTotal(candidateDoc) },
];

const violations = metrics.filter((m) => m.live >= MIN_BASELINE && m.candidate < m.live * FLOOR_RATIO);

if (violations.length === 0) {
  process.stdout.write(
    `[orch-conservation-check] OK — ` +
      metrics.map((m) => `${m.name} live=${m.live} candidate=${m.candidate}`).join(', ') +
      `\n`
  );
  process.exit(0);
}

const bypassReason = (process.env.ORCH_APPLY_ALLOW_SHRINK ?? '').trim();

if (bypassReason !== '') {
  for (const v of violations) {
    process.stderr.write(
      `[orch-conservation-check] SHRINK-ALLOWED (${bypassReason}): ${v.name} live=${v.live} candidate=${v.candidate} ` +
        `(< ${FLOOR_RATIO} floor of live) — bypass honored\n`
    );
  }
  process.exit(0);
}

process.stderr.write(
  `\n[orch-conservation-check] ABORTED — conservation check failed (${violations.length} metric${
    violations.length !== 1 ? 's' : ''
  }):\n`
);
for (const v of violations) {
  process.stderr.write(
    `  ${v.name}: live=${v.live} candidate=${v.candidate} (< ${FLOOR_RATIO} floor of live, live >= ${MIN_BASELINE} baseline)\n`
  );
}
process.stderr.write(
  `  fix: set ORCH_APPLY_ALLOW_SHRINK=<reason> if this is an intentional bulk eviction/archival write ` +
    `(scripts/orch-cold-evict.sh / docs/agents/pm/flow/task-archive.md only) — every other caller must ` +
    `re-read the live file and re-apply a targeted (append/lane-move) filter instead of a full-doc replace.\n`
);
process.exit(1);
