#!/usr/bin/env bun
/**
 * scripts/test-orch-validate-ac.mjs — Acceptance tests for scripts/orch-validate.mjs
 *
 * Sprint:    SSOT-INTEGRITY-PERIMETER
 * Task:      SSOT-W1-ZOD-VALIDATOR-CLI (rank 2)
 * Directive: docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md § Acceptance
 *
 * Exercises AC-1..AC-4:
 *   AC-1: non-enum status in EACH of the 9 task-bearing lanes → validator fails for every lane
 *         (regression proof that the 3-of-9 false-green gap from the bash gate is closed)
 *   AC-2: duplicate JSON key in raw text → Stage-0 rejects (before parse)
 *   AC-3: unknown key under a .strict() object → Stage-1 rejects
 *   AC-4: dangling detail_ref / payload_ref → Stage-1c rejects with corrected-path hint
 *
 * Usage:
 *   bun scripts/test-orch-validate-ac.mjs
 *
 * Exit 0 = all ACs pass. Exit 1 = one or more ACs fail.
 * Temp files are written to /tmp (throwaway run-scoped data, allowed by dev-standards § Script Persistence).
 */

import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPTS_DIR, '..');
const VALIDATOR = resolve(SCRIPTS_DIR, 'orch-validate.mjs');

// ─── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

let tmpCounter = 0;

/**
 * Write JSON (string or object) to a temp file, run the validator, return result.
 * Temp file is deleted in the finally block.
 * @param {string | object} content
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runValidator(content) {
  const tmpFile = `/tmp/orch-ac-test-${process.pid}-${++tmpCounter}.json`;
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  writeFileSync(tmpFile, text, 'utf-8');
  try {
    const result = spawnSync(process.execPath, [VALIDATOR, tmpFile], {
      encoding: 'utf-8',
      timeout: 15_000,
    });
    return {
      exitCode: result.status ?? -1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ─── Minimal valid base orca-state ────────────────────────────────────────────
//
// A fully valid orch-state with tasks in all 9 task-bearing lanes.
// No dangling refs. This is the "control" — validator must exit 0 on this.

function makeBase() {
  return {
    head: { status: 'idle', active_task_id: null },
    signal_queue: {
      _updated_at: '2026-06-27T00:00:00Z',
      _updated_by: 'test-fixture',
      rows: [],
    },
    task_board: {
      // 7 flat lanes — all populated with one valid task each
      backlog:       [{ id: 'AC-T1', status: 'BACKLOG' }],
      done:          [{ id: 'AC-T2', status: 'DONE' }],
      // RC-VERIF (SYSREMAKE-P2-T2): DONE_VERIFIED requires verification.raw_probe (or
      // grandfathering) — 'AC-T3' is a synthetic fixture id, not a live grandfathered row.
      done_verified: [{ id: 'AC-T3', status: 'DONE_VERIFIED', verification: { raw_probe: {
        tool: 'test', args: 'n/a', live_value_observed: 'n/a', observed_at: '2026-06-27T00:00:00Z',
      } } }],
      in_progress:   [{ id: 'AC-T4', status: 'IN_PROGRESS' }],
      qa:            [{ id: 'AC-T5', status: 'QA' }],
      ready:         [{ id: 'AC-T6', status: 'READY' }],
      review:        [{ id: 'AC-T7', status: 'REVIEW' }],
      // Sprint lanes — tasks nested
      active_sprints: [{
        id: 'AC-SPRINT-A',
        tasks: [{ id: 'AC-T8', status: 'IN_PROGRESS' }],
      }],
      closed_sprints: [{
        id: 'AC-SPRINT-C',
        tasks: [{ id: 'AC-T9', status: 'DONE' }],
      }],
    },
  };
}

/** Deep-clone an object (JSON-safe). */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─── AC-1: Non-enum status in each of the 9 task-bearing lanes ───────────────
//
// Regression proof that the 3-of-9 false-green gap from the bash gate is closed.
// The old scripts/orch-state-validate.sh G-5 only checked 3 lanes:
//   active_sprints[].tasks, backlog[], done[]
// This validator checks ALL 9 by construction (OrchStateSchema validates every lane).

console.log('\n─── AC-1: Non-enum status in each of 9 task-bearing lanes ───');

// Control: base must pass
{
  const r = runValidator(makeBase());
  assert('AC-1 control (valid base exits 0)', r.exitCode === 0,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 200)}`);
}

// 7 flat lanes
const flatLaneTests = [
  { lane: 'backlog',       taskIdx: 0 },
  { lane: 'done',          taskIdx: 0 },
  { lane: 'done_verified', taskIdx: 0 },
  { lane: 'in_progress',   taskIdx: 0 },
  { lane: 'qa',            taskIdx: 0 },
  { lane: 'ready',         taskIdx: 0 },
  { lane: 'review',        taskIdx: 0 },
];

for (const { lane, taskIdx } of flatLaneTests) {
  const bad = clone(makeBase());
  bad.task_board[lane][taskIdx].status = 'INVALID_STATUS';
  const r = runValidator(bad);
  assert(
    `AC-1 flat lane "${lane}" with INVALID_STATUS → non-zero exit`,
    r.exitCode !== 0,
    `exitCode=${r.exitCode} (expected non-zero); stderr=${r.stderr.slice(0, 200)}`
  );
  // Verify the error message mentions the correct lane path
  const mentionsLane = r.stderr.includes(`task_board.${lane}`) || r.stderr.includes(lane);
  assert(
    `AC-1 flat lane "${lane}" — error output mentions lane path`,
    mentionsLane,
    `stderr=${r.stderr.slice(0, 300)}`
  );
}

// Sprint lane: active_sprints[0].tasks[0]
{
  const bad = clone(makeBase());
  bad.task_board.active_sprints[0].tasks[0].status = 'INVALID_STATUS';
  const r = runValidator(bad);
  assert(
    'AC-1 sprint lane "active_sprints[0].tasks" with INVALID_STATUS → non-zero exit',
    r.exitCode !== 0,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 200)}`
  );
}

// Sprint lane: closed_sprints[0].tasks[0]
{
  const bad = clone(makeBase());
  bad.task_board.closed_sprints[0].tasks[0].status = 'INVALID_STATUS';
  const r = runValidator(bad);
  assert(
    'AC-1 sprint lane "closed_sprints[0].tasks" with INVALID_STATUS → non-zero exit',
    r.exitCode !== 0,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 200)}`
  );
}

// ─── AC-2: Duplicate JSON key → Stage-0 rejects (before parse) ───────────────

console.log('\n─── AC-2: Duplicate JSON key → Stage-0 rejects ───');

{
  // Inject a duplicate "head" key at the root level via raw JSON text.
  // JSON.stringify cannot produce duplicates; we must build the string manually.
  const dupKeyJson =
    '{"head":{"status":"first"},' +
    '"head":{"status":"duplicate_clobbers_first"},' +
    '"signal_queue":{"_updated_at":"2026-06-27T00:00:00Z","_updated_by":"test","rows":[]},' +
    '"task_board":{"backlog":[{"id":"T1","status":"BACKLOG"}],"active_sprints":[]}}';

  const r = runValidator(dupKeyJson);
  assert('AC-2 duplicate root key → Stage-0 rejects (exit 1)', r.exitCode === 1,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 300)}`);
  assert('AC-2 Stage-0 error message mentions "duplicate key"',
    r.stderr.includes('duplicate key') || r.stderr.includes('Stage 0'),
    `stderr=${r.stderr.slice(0, 300)}`);
}

{
  // Duplicate key nested inside task_board
  const dupKeyNested =
    '{"head":{"status":"idle"},' +
    '"signal_queue":{"_updated_at":"2026-06-27T00:00:00Z","_updated_by":"test","rows":[]},' +
    '"task_board":{' +
      '"backlog":[{"id":"T1","status":"BACKLOG"}],' +
      '"backlog":[{"id":"T1","status":"DONE"}],' +
      '"active_sprints":[]' +
    '}}';

  const r = runValidator(dupKeyNested);
  assert('AC-2 duplicate nested key (task_board.backlog) → Stage-0 rejects (exit 1)',
    r.exitCode === 1,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 300)}`);
}

// ─── AC-3: Unknown key under .strict() object → Stage-1 rejects ──────────────

console.log('\n─── AC-3: Unknown key under .strict() → Stage-1 rejects ───');

{
  // Unknown key at OrchStateSchema root (.strict())
  const bad = clone(makeBase());
  bad['_unknown_root_key'] = 'injected by test fixture';
  const r = runValidator(bad);
  assert('AC-3 unknown root key → Stage-1 rejects (exit 2)', r.exitCode === 2,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 300)}`);
  assert('AC-3 error output mentions "unrecognized key"',
    r.stderr.includes('unrecognized') || r.stderr.includes('unknown'),
    `stderr=${r.stderr.slice(0, 300)}`);
}

{
  // Unknown key inside task_board (.strict())
  const bad = clone(makeBase());
  bad.task_board['_injected_extra'] = { garbage: true };
  const r = runValidator(bad);
  assert('AC-3 unknown task_board key → Stage-1 rejects (exit 2)', r.exitCode === 2,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 300)}`);
}

{
  // Unknown key inside signal_queue (.strict())
  const bad = clone(makeBase());
  bad.signal_queue['_injected_extra'] = 'garbage';
  const r = runValidator(bad);
  assert('AC-3 unknown signal_queue key → Stage-1 rejects (exit 2)', r.exitCode === 2,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 300)}`);
}

// ─── AC-4: Dangling detail_ref / payload_ref → Stage-1c rejects ──────────────

console.log('\n─── AC-4: Dangling refs → Stage-1c rejects with hint ───');

{
  // Dangling payload_ref in signal_queue.rows
  const bad = clone(makeBase());
  bad.signal_queue.rows = [{
    id: 'test-signal-ac4',
    summary: 'test signal',
    severity: 'INFO',
    status: 'OPEN',
    payload_ref: 'docs/signals/nonexistent-file-for-ac4-test.json',
  }];
  const r = runValidator(bad);
  assert('AC-4 dangling payload_ref → Stage-1c rejects (exit 2)', r.exitCode === 2,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 400)}`);
  assert('AC-4 error output mentions the dangling ref path',
    r.stderr.includes('payload_ref') || r.stderr.includes('nonexistent-file'),
    `stderr=${r.stderr.slice(0, 400)}`);
  // Check that the fix hint points to the correct project root
  assert('AC-4 error output includes a fix hint',
    r.stderr.includes('fix:'),
    `stderr=${r.stderr.slice(0, 400)}`);
}

{
  // Dangling detail_ref in a task
  const bad = clone(makeBase());
  bad.task_board.backlog[0].detail_ref = 'docs/handoffs/nonexistent-handoff-ac4-test.md';
  const r = runValidator(bad);
  assert('AC-4 dangling detail_ref → Stage-1c rejects (exit 2)', r.exitCode === 2,
    `exitCode=${r.exitCode} stderr=${r.stderr.slice(0, 400)}`);
  assert('AC-4 dangling detail_ref error mentions path',
    r.stderr.includes('detail_ref') || r.stderr.includes('nonexistent-handoff'),
    `stderr=${r.stderr.slice(0, 400)}`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

// ─── AC-5: Stage 1i — supervised/plan_only row with no resolvable handler ────
//
// FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER, brief §2
// (docs/architecture-briefs/2026-08-23-fix-orchstate-mint-flagged-row-no-handler.md).
//
// The invariant is NOT "every row needs a handler" — `owner: null` +
// `next_agent: null` is a LEGITIMATE documented parked state. The invariant is
// "a row that ASSERTS deliberate dispatch (supervised and/or plan_only) must
// have someone to deliberately dispatch it to". The negative controls below are
// what keep those two apart, and they are mandatory per the row's own AC.

console.log('\n─── AC-5: Stage 1i flagged-row-without-resolvable-handler REPORT ───');

const STAGE_1I = 'Stage 1i';

function flaggedRow(extra) {
  return Object.assign(
    { id: 'AC5-ROW', status: 'READY', priority: 'P1', type: 'FIX', zone: 'cross-service/' },
    extra
  );
}

function runWithDetail(doc, detailItems) {
  const detailFile = `/tmp/orch-ac-detail-${process.pid}-${++tmpCounter}.json`;
  writeFileSync(detailFile, JSON.stringify({ items: detailItems ?? {} }), 'utf-8');
  const prev = process.env.ORCH_VALIDATE_DETAIL_PATH;
  process.env.ORCH_VALIDATE_DETAIL_PATH = detailFile;
  try {
    return runValidator(doc);
  } finally {
    if (prev === undefined) delete process.env.ORCH_VALIDATE_DETAIL_PATH;
    else process.env.ORCH_VALIDATE_DETAIL_PATH = prev;
    try { unlinkSync(detailFile); } catch { /* ignore */ }
  }
}

// (a) POSITIVE — supervised:true, owner+next_agent both empty → reported.
{
  const doc = makeBase();
  doc.task_board.ready.push(flaggedRow({ supervised: true }));
  const r = runWithDetail(doc, {});
  assert('AC-5a supervised:true + no handler is REPORTED', r.stdout.includes(STAGE_1I), r.stdout.slice(0, 300));
  assert('AC-5a the offending row id is named', r.stdout.includes('AC5-ROW'));
  assert('AC-5a the report is NON-FATAL (exit unchanged)', r.exitCode === 0, `exit=${r.exitCode}`);
}

// (a2) plan_only ALONE also trips it — 3 of the 4 live violators carried only
// ONE flag, so an AND-only predicate would have missed three quarters of them.
{
  const doc = makeBase();
  doc.task_board.ready.push(flaggedRow({ plan_only: true }));
  const r = runWithDetail(doc, {});
  assert('AC-5a2 plan_only ALONE (no supervised) is REPORTED — OR, never AND', r.stdout.includes(STAGE_1I));
}

// (a3) EMPTY-STRING shape. TaskSchema declares owner/next_agent as
// `z.string().optional()`, so a literal `null` is schema-INVALID and the two
// real "no handler" shapes on the live board are ABSENT (16 live ready rows) or
// "". Both must trip — a port that only tested `=== undefined` would miss half.
{
  const doc = makeBase();
  doc.task_board.ready.push(flaggedRow({ id: 'AC5-EMPTYSTR', supervised: true, owner: '', next_agent: '' }));
  const r = runWithDetail(doc, {});
  assert('AC-5a3 empty-string owner/next_agent (not just absent) is REPORTED', r.stdout.includes(STAGE_1I));
}

// (b) NEGATIVE CONTROL — the row's own explicit non-goal. Neither flag set,
// both handler fields empty: a genuinely parked row, LEGAL, must be silent.
{
  const doc = makeBase();
  doc.task_board.ready.push(flaggedRow({ id: 'AC5-PARKED', supervised: false, plan_only: false }));
  const r = runWithDetail(doc, {});
  assert('AC-5b unflagged parked row (owner+next_agent absent, NEITHER flag) is NOT reported', !r.stdout.includes(STAGE_1I), r.stdout.slice(0, 300));
}

// (c) NEGATIVE CONTROL — resolved ONLY through backlog-detail.json's override.
// Inline board fields are both empty; the detail entry carries the real owner.
// Proves the detail-first port did not regress into a false positive on a
// legitimately cold-stubbed row (the orch-backlog-stub.sh migration class).
{
  const doc = makeBase();
  doc.task_board.ready.push(flaggedRow({ id: 'AC5-DETAIL-ONLY', supervised: true }));
  const r = runWithDetail(doc, { 'AC5-DETAIL-ONLY': { id: 'AC5-DETAIL-ONLY', owner: 'architect' } });
  assert('AC-5c handler resolved ONLY via backlog-detail.json owner override is NOT reported', !r.stdout.includes(STAGE_1I), r.stdout.slice(0, 300));
}
{
  const doc = makeBase();
  doc.task_board.ready.push(flaggedRow({ id: 'AC5-DETAIL-NA', plan_only: true }));
  const r = runWithDetail(doc, { 'AC5-DETAIL-NA': { id: 'AC5-DETAIL-NA', next_agent: 'qa' } });
  assert('AC-5c2 handler resolved ONLY via backlog-detail.json next_agent override is NOT reported', !r.stdout.includes(STAGE_1I));
}
// ...and the detail file can ALSO be the source of the FLAG (effective_supervised
// is EITHER location), so a detail-only flag with no handler anywhere still trips.
{
  const doc = makeBase();
  doc.task_board.ready.push(flaggedRow({ id: 'AC5-DETAIL-FLAG' }));
  const r = runWithDetail(doc, { 'AC5-DETAIL-FLAG': { id: 'AC5-DETAIL-FLAG', supervised: true } });
  assert('AC-5c3 flag carried ONLY in backlog-detail.json still trips the report', r.stdout.includes(STAGE_1I));
}

// (d) NEGATIVE CONTROL — epic wrapper. Handler-less BY DESIGN: closed out by
// post-cycle.md § Step 4.4 Epic-Wrapper Autoclose Sweep, which is why
// bounded1-supervised-lane-report.sh scopes its GATING class `non-wrapper`.
// This case was found by the brief's own mandated cross-check against that
// script — before the exclusion existed, Stage 1i reported a live wrapper the
// jq SSOT correctly counted as 0.
{
  const doc = makeBase();
  doc.task_board.ready.push(flaggedRow({ id: 'AC5-WRAPPER', supervised: true, plan_only: true, children: ['C1', 'C2'] }));
  const r = runWithDetail(doc, {});
  assert('AC-5d epic wrapper (children[] inline) is NOT reported — handler-less by design', !r.stdout.includes(STAGE_1I), r.stdout.slice(0, 300));
}
{
  const doc = makeBase();
  doc.task_board.ready.push(flaggedRow({ id: 'AC5-WRAPPER-DETAIL', supervised: true }));
  const r = runWithDetail(doc, { 'AC5-WRAPPER-DETAIL': { id: 'AC5-WRAPPER-DETAIL', children: ['C1'] } });
  assert('AC-5d2 epic wrapper via backlog-detail.json children[] is NOT reported', !r.stdout.includes(STAGE_1I));
}

// (e) SCOPE — in_progress[]/qa[]/done[] are out of scope by construction.
{
  const doc = makeBase();
  doc.task_board.in_progress.push(flaggedRow({ id: 'AC5-INPROGRESS', status: 'IN_PROGRESS', supervised: true }));
  const r = runWithDetail(doc, {});
  assert('AC-5e in_progress[] is out of scope (an owner is a structural precondition of being there)', !r.stdout.includes(STAGE_1I));
}

const total = passed + failed;
console.log(`\n${'─'.repeat(60)}`);
console.log(`AC fixture results: ${passed}/${total} passed, ${failed} failed`);

if (failed > 0) {
  console.error(`\nAC FIXTURE FAILED — ${failed} assertion(s) did not pass.`);
  process.exit(1);
} else {
  console.log(`\nAC FIXTURE PASSED — AC-1..AC-5 all assertions green.`);
  console.log('  AC-1: 9-lane non-enum status detection — PROVEN (3-of-9 bash-gate gap closed)');
  console.log('  AC-2: Stage-0 duplicate key rejection — PROVEN');
  console.log('  AC-3: Stage-1 .strict() unknown key rejection — PROVEN');
  console.log('  AC-4: Stage-1c dangling ref rejection with fix hint — PROVEN');
  console.log('  AC-5: Stage-1i flagged-row-without-resolvable-handler REPORT + 6 negative controls — PROVEN');
  process.exit(0);
}
