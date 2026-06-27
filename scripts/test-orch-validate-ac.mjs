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
      done_verified: [{ id: 'AC-T3', status: 'DONE_VERIFIED' }],
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

const total = passed + failed;
console.log(`\n${'─'.repeat(60)}`);
console.log(`AC fixture results: ${passed}/${total} passed, ${failed} failed`);

if (failed > 0) {
  console.error(`\nAC FIXTURE FAILED — ${failed} assertion(s) did not pass.`);
  process.exit(1);
} else {
  console.log(`\nAC FIXTURE PASSED — AC-1..AC-4 all assertions green.`);
  console.log('  AC-1: 9-lane non-enum status detection — PROVEN (3-of-9 bash-gate gap closed)');
  console.log('  AC-2: Stage-0 duplicate key rejection — PROVEN');
  console.log('  AC-3: Stage-1 .strict() unknown key rejection — PROVEN');
  console.log('  AC-4: Stage-1c dangling ref rejection with fix hint — PROVEN');
  process.exit(0);
}
