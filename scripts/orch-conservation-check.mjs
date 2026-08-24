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
 *   mechanism, so a qa[] collapse must be counted or the guard is blind to it.
 *   `dev_team_idle_chain.pending_triage_inbox[]` was BRIEFLY folded into this metric
 *   (FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE, 2026-08-09) and then REMOVED again
 *   (FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR, 2026-08-14) — see
 *   the dedicated "INBOX ROW-IDENTITY DIMENSION" paragraph below for why and what replaced it):
 *   task_total(doc)   = length(backlog) + length(ready) + length(in_progress)
 *                     + length(review) + length(qa) + length(done) + length(done_verified)
 *                     + Σ active_sprints[].tasks[].length
 *                     + Σ closed_sprints[].tasks[].length
 *   signal_total(doc) = length(signal_queue.rows)
 *
 * INBOX ROW-IDENTITY DIMENSION (FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-
 *   DRAIN-CLEAR, 2026-08-14, supersedes the FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE 2026-08-09
 *   magnitude-metric approach above): `.dev_team_idle_chain.pending_triage_inbox[]`
 *   (FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN, 2026-08-08) is a SECOND durable holding area for
 *   not-yet-triaged signals, structurally identical in kind to `signal_queue.rows[]` — but unlike
 *   `signal_queue.rows[]` (an accumulating log), the inbox is a QUEUE whose entire purpose is to
 *   drain to zero on every legitimate dev-team Step-1 triage pass (main.md § Step 1 — PO Triage
 *   "Durable-inbox CLEAR") — so folding it into the `signal_total` MAGNITUDE ratio was the wrong
 *   invariant: a single large, fully-legitimate clear (REPRODUCED LIVE: 2026-08-11, 29 envelopes;
 *   2026-08-14, 248 envelopes) trips the exact same floor built to catch accidental mass-deletion,
 *   with no sanctioned bypass (`ORCH_APPLY_ALLOW_SHRINK` is explicitly forbidden to every caller
 *   except `orch-cold-evict.sh`/`task-archive.md`) — forcing callers into artificial sequential
 *   sub-batching purely to stay above the ratio, which is self-reinforcing (an unclearable inbox
 *   only grows, making the next clear even harder). Fix: REMOVE the inbox from `signal_total`
 *   entirely (a full clear-to-zero can never trip a magnitude floor it is not part of) and give it
 *   its OWN row-identity guard instead — see `undeclaredInboxDrops()` below — which still catches
 *   an accidental full (or partial) wipe: any `.envelope_id` present in LIVE and absent from
 *   CANDIDATE must be named in the caller-declared `ORCH_APPLY_DECLARED_INBOX_TRIAGED` env var
 *   (the "this id was legitimately triaged" marker), mirroring `undeclaredSignalRowDrops()`'s
 *   existing `ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS` mechanism for `signal_queue.rows[]` one level
 *   down. `docs/agents/dev-team/flow/main.md` § Step 1 "Durable-inbox CLEAR" already computes the
 *   exact consumed-id list this write removes (`consumed_ids`) — it now passes that same list
 *   through verbatim as the declaration, so a full clear-to-zero lands in ONE write with no
 *   artificial sub-batching, while an undeclared drop (accidental wipe, or a stale/buggy candidate)
 *   is still hard-rejected.
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
 * LANE-PLACEMENT DIMENSION (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ, AC-3,
 *   2026-08-24): the magnitude-ratio metric above is ALSO blind to a stale full-document
 *   candidate that silently REVERTS a peer's lane-move while leaving task_total identical
 *   (a row moving backward out of one lane and appearing in an earlier one nets to zero on the
 *   magnitude metric — REPRODUCED LIVE: a pm subagent's unrelated done[]->done_verified[] write
 *   carried a candidate built minutes earlier, wholesale-restoring stale qa[]/review[] arrays;
 *   `git show <that commit> -- docs/data/orch/orch-state.json` never even MENTIONS the 5
 *   clobbered ids — the write's own diff never named them, they moved backward purely because
 *   the candidate was stale). `backwardLaneMoves()` below detects, per FLAT_TASK_LANES id, any
 *   row whose CANDIDATE lane has a lower pipeline rank than its LIVE lane. A SINGLE undeclared
 *   backward move is a normal, sanctioned operation (e.g. qa/flow/main.md's CHANGES_REQUESTED
 *   path moves exactly one row qa[]->review[] by name) and is NOT flagged — every current writer
 *   in the fleet moves at most one row backward per write (grep-verified 2026-08-24: every
 *   `.task_board.<lane> = [...]` backward-lane assignment across scripts jq files and every
 *   dev-agent flow-doc write targets exactly one `.id`; batch multi-row claim scripts — e.g.
 *   the QA_CAP=10 Review-Lane QA-Drain — always move FORWARD, never backward, so this floor does
 *   not affect them). TWO OR MORE undeclared backward moves landing in the SAME write is the
 *   exact reproduced-incident shape (a stale full-doc candidate reverting several rows nobody on
 *   this write named) and is a HARD REJECT, independent of (and NEVER bypassable by)
 *   ORCH_APPLY_ALLOW_SHRINK — same orthogonality rationale as the two row-identity dimensions
 *   above. A caller with a genuine, deliberate reason to revert 2+ rows in one write (no such
 *   caller exists today) can declare them via ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES, mirroring
 *   the existing declared-eviction escape hatches rather than leaving this permanently
 *   fail-closed for a hypothetical future legitimate case.
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
 *   ORCH_APPLY_DECLARED_INBOX_TRIAGED  comma-separated list of
 *                              `dev_team_idle_chain.pending_triage_inbox[].envelope_id`
 *                              values the CALLER explicitly declares it
 *                              legitimately triaged/removed this write (see
 *                              "INBOX ROW-IDENTITY DIMENSION" above). Wired
 *                              ONLY into docs/agents/dev-team/flow/main.md
 *                              § Step 1 "Durable-inbox CLEAR" (the sole
 *                              legitimate remover of inbox entries), which
 *                              already computes this exact id list
 *                              (`consumed_ids`) before the write — passed
 *                              through verbatim, never hand-maintained. Any
 *                              envelope_id NOT in this set that disappears
 *                              between live and candidate is an undeclared
 *                              drop → hard reject. Independent of (does not
 *                              share a name or a bypass path with)
 *                              ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS above —
 *                              the two arrays have no archive-lane equivalent
 *                              in common either.
 *   ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES  comma-separated list of
 *                              `task_board.<FLAT_TASK_LANES>[].id` values the
 *                              CALLER explicitly declares are intentionally
 *                              moving backward (to an earlier-pipeline-rank
 *                              lane) THIS write — see "LANE-PLACEMENT
 *                              DIMENSION" above. No current caller sets this
 *                              (every known backward mover today moves
 *                              exactly one undeclared row, which is already
 *                              permitted without declaration); it exists so a
 *                              future genuine multi-row revert is not
 *                              permanently fail-closed.
 *   CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES  default 1 — the number of
 *                              undeclared backward-lane moves tolerated in a
 *                              single write before the lane-placement guard
 *                              rejects. 1 covers every known single-row
 *                              backward workflow (e.g. QA CHANGES_REQUESTED);
 *                              2+ is the reproduced stale-full-doc-revert
 *                              incident shape.
 *
 * EXIT CODES:
 *   0 = conservation OK (within floor, below MIN_BASELINE, or bypass honored)
 *       AND zero undeclared row-identity drops (signal_queue.rows[] AND
 *       pending_triage_inbox[]) AND undeclared backward-lane-move count is at
 *       or below CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES.
 *   1 = conservation violated (task_total or signal_total dropped below the
 *       floor ratio, no bypass set) OR at least one signal_queue.rows[] id
 *       vanished between live and candidate without being declared/archived
 *       OR at least one pending_triage_inbox[] envelope_id vanished without
 *       being declared OR more than CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES
 *       task rows moved backward (lower pipeline rank) without being declared
 *       (all row-identity/placement violations — never bypassable) — reuses
 *       the caller's existing "validation failed, live file untouched" exit
 *       class.
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
 * signal_total(doc) = length(signal_queue.rows)
 * FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR (2026-08-14):
 * `dev_team_idle_chain.pending_triage_inbox` was REMOVED from this metric (previously added by
 * FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE, 2026-08-09) — see the file-header "INBOX ROW-IDENTITY
 * DIMENSION" paragraph for the full rationale (the inbox is a drain-to-zero QUEUE, not an
 * accumulating log like signal_queue.rows[], so a magnitude-ratio floor was structurally the
 * wrong invariant for it; `undeclaredInboxDrops()` below replaces the protection this metric used
 * to (partially) provide, without blocking a legitimate full clear).
 * @param {unknown} doc
 * @returns {number}
 */
function signalTotal(doc) {
  const d = /** @type {Record<string, unknown>} */ (doc && typeof doc === 'object' ? doc : {});
  const sq = /** @type {Record<string, unknown>} */ (d.signal_queue);
  const rows = sq ? sq.rows : undefined;
  return Array.isArray(rows) ? rows.length : 0;
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
 * Extract the set of `.envelope_id` strings from
 * `dev_team_idle_chain.pending_triage_inbox[]`. Non-string / missing ids are
 * skipped — identity-tracking helper only, not a schema validator.
 * @param {unknown} doc
 * @returns {Set<string>}
 */
function inboxEnvelopeIdSet(doc) {
  const chain = /** @type {Record<string, unknown>} */ (doc && typeof doc === 'object' ? doc.dev_team_idle_chain : undefined);
  const arr = chain ? chain.pending_triage_inbox : undefined;
  const out = new Set();
  if (Array.isArray(arr)) {
    for (const row of arr) {
      const id = row && typeof row === 'object' ? row.envelope_id : undefined;
      if (typeof id === 'string' && id.length > 0) out.add(id);
    }
  }
  return out;
}

/**
 * INBOX row-identity conservation dimension (FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-
 * SANCTIONED-PO-INBOX-DRAIN-CLEAR, 2026-08-14) — see file header "INBOX ROW-IDENTITY DIMENSION"
 * for full rationale. Mirrors undeclaredSignalRowDrops() one level down: returns the list of
 * live `.dev_team_idle_chain.pending_triage_inbox[]` envelope_ids that vanished in the candidate
 * WITHOUT being accounted for. There is no archive-lane equivalent for this array (unlike
 * signal_queue.rows[]/.archive[]) — the caller-declared env var is the ONLY accounting mechanism.
 * @param {unknown} liveDoc
 * @param {unknown} candidateDoc
 * @returns {string[]}
 */
function undeclaredInboxDrops(liveDoc, candidateDoc) {
  const liveIds = inboxEnvelopeIdSet(liveDoc);
  const candidateIds = inboxEnvelopeIdSet(candidateDoc);
  const declared = new Set(
    (process.env.ORCH_APPLY_DECLARED_INBOX_TRIAGED ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );

  const dropped = [];
  for (const id of liveIds) {
    if (candidateIds.has(id)) continue; // still present — not a drop
    if (declared.has(id)) continue; // accounted for — caller declared this as legitimately triaged
    dropped.push(id);
  }
  return dropped;
}

/**
 * LANE_RANK — pipeline order for the lane-placement dimension. Reuses the
 * exact FLAT_TASK_LANES ordering already used for task_total() above (that
 * array is written in pipeline order: backlog -> ready -> in_progress ->
 * review -> qa -> done -> done_verified). Does NOT cover active_sprints[]/
 * closed_sprints[].tasks[] — those have no single flat-lane rank and are out
 * of scope for this dimension (the reproduced incident was entirely within
 * the flat lanes: qa[]/review[]).
 * @type {Record<string, number>}
 */
const LANE_RANK = Object.fromEntries(FLAT_TASK_LANES.map((lane, i) => [lane, i]));

/**
 * Build a Map of task `.id` -> flat lane name, scanning FLAT_TASK_LANES only
 * (in pipeline order; first occurrence wins if a duplicate id somehow spans
 * two lanes — that is itself a coherence bug caught elsewhere, not this
 * dimension's job to adjudicate).
 * @param {unknown} doc
 * @returns {Map<string, string>}
 */
function taskLaneMap(doc) {
  const tb = /** @type {Record<string, unknown>} */ (doc && typeof doc === 'object' ? doc.task_board : undefined);
  const map = new Map();
  if (!tb || typeof tb !== 'object') return map;
  for (const lane of FLAT_TASK_LANES) {
    const arr = tb[lane];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      const id = row && typeof row === 'object' ? row.id : undefined;
      if (typeof id === 'string' && id.length > 0 && !map.has(id)) {
        map.set(id, lane);
      }
    }
  }
  return map;
}

/**
 * Lane-placement conservation dimension (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-
 * AFTER-CALLER-JQ-READ, AC-3) — see file header "LANE-PLACEMENT DIMENSION" for
 * full rationale. Returns every id present in both live and candidate whose
 * candidate lane has a STRICTLY LOWER pipeline rank than its live lane (moved
 * backward), EXCLUDING ids named in ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES.
 * @param {unknown} liveDoc
 * @param {unknown} candidateDoc
 * @returns {Array<{id: string, from: string, to: string}>}
 */
function undeclaredBackwardLaneMoves(liveDoc, candidateDoc) {
  const liveMap = taskLaneMap(liveDoc);
  const candidateMap = taskLaneMap(candidateDoc);
  const declared = new Set(
    (process.env.ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );

  const moves = [];
  for (const [id, liveLane] of liveMap) {
    const candidateLane = candidateMap.get(id);
    if (candidateLane === undefined || candidateLane === liveLane) continue; // absent-elsewhere / same-lane — not this dimension's concern
    if (declared.has(id)) continue; // accounted for — caller declared this backward move
    if (LANE_RANK[candidateLane] < LANE_RANK[liveLane]) {
      moves.push({ id, from: liveLane, to: candidateLane });
    }
  }
  return moves;
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

// Row-identity dimensions — INDEPENDENT of the magnitude check above, and
// NEVER bypassable by ORCH_APPLY_ALLOW_SHRINK (see file header).
const droppedIds = undeclaredSignalRowDrops(liveDoc, candidateDoc);
const droppedInboxIds = undeclaredInboxDrops(liveDoc, candidateDoc);

// Lane-placement dimension (AC-3) — also INDEPENDENT, also NEVER bypassable
// by ORCH_APPLY_ALLOW_SHRINK. A single undeclared backward move is tolerated
// (normal sanctioned single-row workflows, e.g. QA CHANGES_REQUESTED); only
// exceeding the threshold is a violation.
const MAX_UNDECLARED_BACKWARD_MOVES = Number(process.env.CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES ?? '1');
const backwardMoves = undeclaredBackwardLaneMoves(liveDoc, candidateDoc);
const backwardMovesViolated = backwardMoves.length > MAX_UNDECLARED_BACKWARD_MOVES;

if (violations.length === 0 && droppedIds.length === 0 && droppedInboxIds.length === 0 && !backwardMovesViolated) {
  process.stdout.write(
    `[orch-conservation-check] OK — ` +
      metrics.map((m) => `${m.name} live=${m.live} candidate=${m.candidate}`).join(', ') +
      `, signal_row_identity=clean, inbox_row_identity=clean, lane_placement=clean` +
      (backwardMoves.length > 0 ? ` (${backwardMoves.length} tolerated backward move(s): ${backwardMoves.map((m) => m.id).join(', ')})` : '') +
      `\n`
  );
  process.exit(0);
}

// Row-identity violations are reported and enforced FIRST, unconditionally —
// no bypass exists for either of these two dimensions regardless of ORCH_APPLY_ALLOW_SHRINK.
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

if (droppedInboxIds.length > 0) {
  process.stderr.write(
    `\n[orch-conservation-check] ABORTED — inbox row-identity violation: ${droppedInboxIds.length} ` +
      `dev_team_idle_chain.pending_triage_inbox[] envelope_id(s) present in live but absent from ` +
      `candidate WITHOUT being declared (not in ORCH_APPLY_DECLARED_INBOX_TRIAGED):\n`
  );
  for (const id of droppedInboxIds) {
    process.stderr.write(`  ${id}\n`);
  }
  process.stderr.write(
    `  fix: this is NOT a magnitude problem — do NOT set ORCH_APPLY_ALLOW_SHRINK (it is forbidden ` +
      `for this caller anyway, and it does not bypass row-identity checks). Set ` +
      `ORCH_APPLY_DECLARED_INBOX_TRIAGED=<comma-separated envelope_id list> naming exactly the ` +
      `envelope_id(s) this write legitimately triaged/removed — docs/agents/dev-team/flow/main.md ` +
      `§ Step 1 "Durable-inbox CLEAR" already computes this exact list (consumed_ids) and passes it ` +
      `through verbatim. A full clear-to-zero is fully supported in ONE write this way, no artificial ` +
      `sub-batching required. If this drop is unintentional, the candidate was built from a stale ` +
      `read — re-read the live file and re-apply your filter.\n`
  );
  process.exit(1);
}

if (backwardMovesViolated) {
  process.stderr.write(
    `\n[orch-conservation-check] ABORTED — lane-placement violation: ${backwardMoves.length} task row(s) ` +
      `moved BACKWARD (to an earlier-pipeline-rank lane) in one write, exceeding the tolerated ` +
      `${MAX_UNDECLARED_BACKWARD_MOVES} undeclared backward move(s) (not in ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES):\n`
  );
  for (const m of backwardMoves) {
    process.stderr.write(`  ${m.id}: ${m.from} -> ${m.to}\n`);
  }
  process.stderr.write(
    `  fix: this is the reproduced stale-full-doc-revert shape (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-` +
      `AFTER-CALLER-JQ-READ) — the candidate was very likely built from a stale read that predates a ` +
      `peer's lane-move on one or more of the ids above. Re-read the live file and re-apply your ` +
      `filter (ideally with a caller-supplied CAS baseline captured at that re-read — see ` +
      `scripts/orch-apply.sh). If this write genuinely intends to revert multiple rows on purpose, ` +
      `set ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES=<comma-separated id list> naming exactly the ids ` +
      `this write knowingly moves backward — do NOT set ORCH_APPLY_ALLOW_SHRINK, it does not bypass ` +
      `this dimension.\n`
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
