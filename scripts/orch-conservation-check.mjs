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
 *   mechanism, so a qa[] collapse must be counted or the guard is blind to it;
 *   FURTHER EXTENDED FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE 2026-08-09, §3.4 of
 *   docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md
 *   — see the dedicated paragraph below signal_total(doc) for why):
 *   task_total(doc)   = length(backlog) + length(ready) + length(in_progress)
 *                     + length(review) + length(qa) + length(done) + length(done_verified)
 *                     + Σ active_sprints[].tasks[].length
 *                     + Σ closed_sprints[].tasks[].length
 *   signal_total(doc) = length(signal_queue.rows)
 *                     + length(dev_team_idle_chain.pending_triage_inbox)
 *
 * DURABLE PENDING-TRIAGE-INBOX DIMENSION (FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE, 2026-08-09):
 *   `.dev_team_idle_chain.pending_triage_inbox[]` (FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN,
 *   2026-08-08) is a SECOND durable holding area for not-yet-triaged signals, structurally
 *   identical in kind to `signal_queue.rows[]` (both hold un-consumed signal envelopes awaiting
 *   PO/Step-1 action) but was invisible to the pre-2026-08-09 formula above — a bug in the
 *   inbox's own append/clear logic (main.md § Step 1 — PO Triage "Durable-inbox CLEAR", or
 *   drain-signals.js's appendDurableBatch()) that silently wiped the whole array (e.g. a
 *   mis-scoped `= []` instead of the mandated subtractive-by-envelope_id filter) would sail
 *   through this circuit-breaker undetected as long as `signal_queue.rows[]` itself stayed
 *   intact — the EXACT same blind spot the original FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-
 *   BREAKER task closed for `signal_queue.rows[]` collapse, now closed for its durable-inbox
 *   sibling too. Summed into ONE `signal_total` (not a third independent metric) because both
 *   arrays are the same conceptual "signals not yet delivered/consumed" quantity — a signal
 *   moving from `signal_queue.rows[]` accounting into the inbox (or vice versa) must not itself
 *   look like a collapse.
 *
 * ROW-IDENTITY DIMENSION (FIX-ORCHSTATE-SIGNALQUEUE-UNCOMMITTED-ROWS-LOST-TO-
 *   PEER-FULLDOC-WRITE, 2026-08-08): the magnitude-ratio metric above is
 *   BLIND to a small, targeted row loss — a candidate that drops 2 of 133
 *   signal_queue.rows[] (131/133 = 98.5%) sails through FLOOR_RATIO=0.5
 *   trivially, by design (it is a whole-board circuit-breaker, not a
 *   per-row guard — see brief §4.2). This is a SEPARATE, INDEPENDENT check:
 *   any `.signal_queue.rows[]` id present in LIVE and absent from CANDIDATE
 *   must be accounted for, either (a) present in candidate's
 *   `.signal_queue.archive[]` (kept for defense-in-depth even though every
 *   current writer always empties that inline lane to `[]` post-HSC-7 —
 *   see orch-cold-evict.sh's own "RC-1 root cause" comment), or (b) named
 *   in the caller-declared `ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS` env var
 *   (see below). An id dropped WITHOUT either form of accounting is a HARD
 *   REJECT — unlike the magnitude check, this is NEVER honored by
 *   ORCH_APPLY_ALLOW_SHRINK: that bypass says "the TOTAL is allowed to
 *   shrink a lot" (legitimate bulk eviction), it does NOT say "any
 *   individual row may vanish unaccounted for" — those are orthogonal
 *   claims. This closes the class where a candidate is built from a stale
 *   pre-read snapshot (predates a peer's concurrent append) and silently
 *   clobbers that peer's row on rename — the CAS-mtime guard in
 *   orch-apply.sh only proves "no writer intervened during MY OWN process
 *   lifetime," it has zero visibility into whether the candidate it
 *   received was already stale relative to live BEFORE its own process
 *   even started (see docs/policies/dev-standards.md § Orch-state row-
 *   identity signal conservation for the full incident writeup + the
 *   verified-innocent finding for the specific incident that motivated
 *   this task).
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
 *                              SHRINK-ALLOWED and exits 0 even on a
 *                              MAGNITUDE violation. Does NOT bypass a
 *                              row-identity violation (see above — orthogonal
 *                              axis, never bypassable). NARROW NAMED BYPASS —
 *                              mirrors the existing ORCH_APPLY_LIVE_FILE_OVERRIDE
 *                              test-only precedent (scripts/orch-apply.sh).
 *                              Wired ONLY into the 2 legitimate bulk-eviction
 *                              writers: scripts/orch-cold-evict.sh and
 *                              docs/agents/pm/flow/task-archive.md. NEVER set
 *                              this anywhere else (in particular, never from
 *                              system-auditor / signal-dashboard WRITE).
 *   ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS  comma-separated list of
 *                              `signal_queue.rows[].id` values the CALLER
 *                              explicitly declares it is intentionally
 *                              removing this write (e.g. a genuine cold-evict
 *                              pass moving rows to docs/data/orch/archive/
 *                              YYYY-MM.json). Wired ONLY into
 *                              scripts/orch-cold-evict.sh (the sole writer
 *                              that legitimately removes signal_queue.rows[]
 *                              entries — pm/task-archive.md delegates its own
 *                              signal-row eviction to the same script, see
 *                              that flow doc §Step 4). Any id NOT in this set
 *                              (and not in candidate's `.signal_queue.archive[]`)
 *                              that disappears between live and candidate is
 *                              an undeclared drop → hard reject.
 *
 * EXIT CODES:
 *   0 = conservation OK (within floor, below MIN_BASELINE, or bypass honored)
 *       AND zero undeclared row-identity drops.
 *   1 = conservation violated (task_total or signal_total dropped below the
 *       floor ratio, no bypass set) OR at least one signal_queue.rows[] id
 *       vanished between live and candidate without being declared/archived
 *       (row-identity violation — never bypassable) — reuses the caller's
 *       existing "validation failed, live file untouched" exit class.
 *   3 = usage error (missing args, file not found / unreadable / unparseable)
 *
 * HARD CONSTRAINTS:
 *   - Whole-board MAGNITUDE-RATIO design, NOT naive per-lane never-decrease.
 *     The row-identity dimension is ADDITIVE alongside it, not a replacement —
 *     do not fold the two into one predicate.
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
 * signal_total(doc) = length(signal_queue.rows) + length(dev_team_idle_chain.pending_triage_inbox)
 * FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE (2026-08-09): the durable pending-triage inbox is a
 * second not-yet-triaged-signal holding area, structurally identical in kind to
 * signal_queue.rows[] — see the file-header "DURABLE PENDING-TRIAGE-INBOX DIMENSION" paragraph
 * for the full rationale (circuit-breaker guard against a silent whole-inbox wipe bug).
 * @param {unknown} doc
 * @returns {number}
 */
function signalTotal(doc) {
  const d = /** @type {Record<string, unknown>} */ (doc && typeof doc === 'object' ? doc : {});
  const sq = /** @type {Record<string, unknown>} */ (d.signal_queue);
  const rows = sq ? sq.rows : undefined;
  const idleChain = /** @type {Record<string, unknown>} */ (d.dev_team_idle_chain);
  const inbox = idleChain ? idleChain.pending_triage_inbox : undefined;
  return (Array.isArray(rows) ? rows.length : 0) + (Array.isArray(inbox) ? inbox.length : 0);
}

/**
 * Extract the set of `.id` strings from a signal_queue sub-array
 * (`rows` or `archive`). Non-string / missing ids are skipped — this is an
 * identity-tracking helper, not a schema validator (orch-validate.mjs owns
 * schema enforcement upstream of this script).
 * @param {unknown} doc
 * @param {'rows'|'archive'} field
 * @returns {Set<string>}
 */
function signalIdSet(doc, field) {
  const sq = /** @type {Record<string, unknown>} */ (doc && typeof doc === 'object' ? doc.signal_queue : undefined);
  const arr = sq ? sq[field] : undefined;
  const out = new Set();
  if (Array.isArray(arr)) {
    for (const row of arr) {
      const id = row && typeof row === 'object' ? row.id : undefined;
      if (typeof id === 'string' && id.length > 0) out.add(id);
    }
  }
  return out;
}

/**
 * Row-identity conservation dimension (FIX-ORCHSTATE-SIGNALQUEUE-UNCOMMITTED-
 * ROWS-LOST-TO-PEER-FULLDOC-WRITE) — see file header for full rationale.
 * Returns the list of live `.signal_queue.rows[]` ids that vanished in the
 * candidate WITHOUT being accounted for (present in candidate's
 * `.signal_queue.archive[]`, or named in the declared-eviction env var).
 * @param {unknown} liveDoc
 * @param {unknown} candidateDoc
 * @returns {string[]}
 */
function undeclaredSignalRowDrops(liveDoc, candidateDoc) {
  const liveRowIds = signalIdSet(liveDoc, 'rows');
  const candidateRowIds = signalIdSet(candidateDoc, 'rows');
  const candidateArchiveIds = signalIdSet(candidateDoc, 'archive');
  const declared = new Set(
    (process.env.ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );

  const dropped = [];
  for (const id of liveRowIds) {
    if (candidateRowIds.has(id)) continue; // still present — not a drop
    if (candidateArchiveIds.has(id)) continue; // accounted for — moved to inline archive
    if (declared.has(id)) continue; // accounted for — caller declared this eviction
    dropped.push(id);
  }
  return dropped;
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

// Row-identity dimension — INDEPENDENT of the magnitude check above, and
// NEVER bypassable by ORCH_APPLY_ALLOW_SHRINK (see file header).
const droppedIds = undeclaredSignalRowDrops(liveDoc, candidateDoc);

if (violations.length === 0 && droppedIds.length === 0) {
  process.stdout.write(
    `[orch-conservation-check] OK — ` +
      metrics.map((m) => `${m.name} live=${m.live} candidate=${m.candidate}`).join(', ') +
      `, signal_row_identity=clean\n`
  );
  process.exit(0);
}

// Row-identity violations are reported and enforced FIRST, unconditionally —
// no bypass exists for this dimension regardless of ORCH_APPLY_ALLOW_SHRINK.
if (droppedIds.length > 0) {
  process.stderr.write(
    `\n[orch-conservation-check] ABORTED — row-identity violation: ${droppedIds.length} ` +
      `signal_queue.rows[] id(s) present in live but absent from candidate WITHOUT being ` +
      `accounted for (not in candidate .signal_queue.archive[], not in ` +
      `ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS):\n`
  );
  for (const id of droppedIds) {
    process.stderr.write(`  ${id}\n`);
  }
  process.stderr.write(
    `  fix: if this is a genuine eviction, route it through scripts/orch-cold-evict.sh (the sole ` +
      `writer that sets ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS for its own removals) — do NOT set ` +
      `ORCH_APPLY_ALLOW_SHRINK to work around this, it does not bypass row-identity checks. If this ` +
      `is unintentional, the candidate was built from a stale read — re-read the live file and ` +
      `re-apply your filter.\n`
  );
  process.exit(1);
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
