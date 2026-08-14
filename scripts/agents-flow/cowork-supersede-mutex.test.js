#!/usr/bin/env node
// Test harness for cowork-supersede-mutex.js — FIX-COWORK-SUPERSEDE-MUTEX-SCRIPT-AND-MATCHSLOTS-WIRING.
//
// Run: node scripts/agents-flow/cowork-supersede-mutex.test.js
// Exit 0 = all pass, Exit 1 = any fail.
//
// Fixtures ONLY — never reads/writes the live docs/data/cowork-schedule.json (that file is
// hot: the cowork dispatcher writes last_fired into it every 15 minutes). Every scenario
// that needs a schedule file builds its own fixture under an mkdtemp() root, isolated per
// scenario (pattern mirrors cowork-chef-mutex.test.js).
//
// Covers the brief's 5 named cases (docs/architecture-briefs/2026-08-14-market-watcher-eod-
// offhours-notebook-collision.md §3b): (1) both present -> offhours dropped, eod survives;
// (2) only offhours present -> no-op; (3) only eod present -> no-op; (4) no `supersedes`
// field anywhere -> no-op, supersede_mutex_applied:false; (5) malformed input -> fail loud.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/agents-flow/cowork-supersede-mutex.js');
const { applySupersedeMutex } = require(SCRIPT_PATH);

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    console.log(`        expected: ${JSON.stringify(expected)}`);
    console.log(`        actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function mkFixtureDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// The live shape, mirrored from docs/data/cowork-schedule.json (market-watcher-eod /
// market-watcher-offhours, both parallel_group="gatherers", both guaranteed:false — the
// exact shape applyChefMutex's guaranteed-boolean tie-break structurally cannot resolve).
function fixtureSchedule() {
  return {
    slots: [
      {
        slot_id: 'market-watcher-offhours', cron: '0 */4 * * *', agent: 'market-watcher',
        parallel_group: 'gatherers', guaranteed: false,
        trigger_prompt: 'run docs/agents/market-watcher/flow/main.md  slot=market-watcher-offhours',
      },
      {
        slot_id: 'market-watcher-eod', cron: '0 16 * * 1-5', agent: 'market-watcher',
        parallel_group: 'gatherers', guaranteed: false,
        supersedes: ['market-watcher-offhours'],
        trigger_prompt: 'run docs/agents/market-watcher/flow/main.md  slot=market-watcher-eod',
      },
      {
        slot_id: 'news-scout-market', cron: '*/15 2-8 * * 1-5', agent: 'news-scout',
        parallel_group: null, guaranteed: true,
        trigger_prompt: 'run docs/agents/news-scout/flow/main.md  slot=news-scout-market',
      },
    ],
  };
}

// A schedule with no `.supersedes` field anywhere — TC-4's fixture (distinct from
// fixtureSchedule() so TC-4 cannot accidentally pass via a mutation of another case's data).
function fixtureScheduleNoSupersedes() {
  return {
    slots: [
      {
        slot_id: 'market-watcher-offhours', cron: '0 */4 * * *', agent: 'market-watcher',
        parallel_group: 'gatherers', guaranteed: false,
        trigger_prompt: 'run docs/agents/market-watcher/flow/main.md  slot=market-watcher-offhours',
      },
      {
        slot_id: 'market-watcher-eod', cron: '0 16 * * 1-5', agent: 'market-watcher',
        parallel_group: 'gatherers', guaranteed: false,
        trigger_prompt: 'run docs/agents/market-watcher/flow/main.md  slot=market-watcher-eod',
      },
      {
        slot_id: 'news-scout-market', cron: '*/15 2-8 * * 1-5', agent: 'news-scout',
        parallel_group: null, guaranteed: true,
        trigger_prompt: 'run docs/agents/news-scout/flow/main.md  slot=news-scout-market',
      },
    ],
  };
}

// =============================================================================
// Brief §3b case 1 — both present: offhours dropped, eod survives
// =============================================================================
console.log('\nTC-1: both eod + offhours present in same tick — offhours dropped, eod survives');
{
  const sched = fixtureSchedule();
  const matches = [
    { slot_id: 'market-watcher-offhours' },
    { slot_id: 'market-watcher-eod' },
    { slot_id: 'news-scout-market' },
  ];
  const result = applySupersedeMutex(matches, sched.slots);
  assert('TC-1: offhours dropped', result.matches.some((m) => m.slot_id === 'market-watcher-offhours'), false);
  assert('TC-1: eod survives', result.matches.some((m) => m.slot_id === 'market-watcher-eod'), true);
  assert('TC-1: unrelated slot untouched', result.matches.some((m) => m.slot_id === 'news-scout-market'), true);
  assert('TC-1: order-preserving on survivors', result.matches.map((m) => m.slot_id), ['market-watcher-eod', 'news-scout-market']);
  assert('TC-1: supersede_mutex_applied=true', result.supersede_mutex_applied, true);
  assert('TC-1: dropped=[market-watcher-offhours]', result.dropped, ['market-watcher-offhours']);
}

// =============================================================================
// Brief §3b case 2 — only offhours present: no-op
// =============================================================================
console.log('\nTC-2: only offhours present (fires alone at 00:00/04:00/08:00/12:00/20:00 UTC) — no-op');
{
  const sched = fixtureSchedule();
  const matches = [{ slot_id: 'market-watcher-offhours' }, { slot_id: 'news-scout-market' }];
  const result = applySupersedeMutex(matches, sched.slots);
  assert('TC-2: matches unchanged (same length)', result.matches.length, 2);
  assert('TC-2: offhours survives alone', result.matches.some((m) => m.slot_id === 'market-watcher-offhours'), true);
  assert('TC-2: supersede_mutex_applied=false', result.supersede_mutex_applied, false);
  assert('TC-2: dropped=[]', result.dropped, []);
}

// =============================================================================
// Brief §3b case 3 — only eod present: no-op
// =============================================================================
console.log('\nTC-3: only eod present (offhours not due this tick) — no-op, nothing to supersede');
{
  const sched = fixtureSchedule();
  const matches = [{ slot_id: 'market-watcher-eod' }];
  const result = applySupersedeMutex(matches, sched.slots);
  assert('TC-3: eod survives alone', result.matches.some((m) => m.slot_id === 'market-watcher-eod'), true);
  assert('TC-3: matches unchanged (same length)', result.matches.length, 1);
  assert('TC-3: supersede_mutex_applied=false', result.supersede_mutex_applied, false);
  assert('TC-3: dropped=[]', result.dropped, []);
}

// =============================================================================
// Brief §3b case 4 — no `supersedes` field anywhere in the schedule: no-op
// =============================================================================
console.log('\nTC-4: no `.supersedes` field anywhere in the schedule — no-op, supersede_mutex_applied:false');
{
  const sched = fixtureScheduleNoSupersedes();
  const matches = [{ slot_id: 'market-watcher-offhours' }, { slot_id: 'market-watcher-eod' }];
  const result = applySupersedeMutex(matches, sched.slots);
  assert('TC-4: passthrough identical', result.matches, matches);
  assert('TC-4: supersede_mutex_applied=false', result.supersede_mutex_applied, false);
  assert('TC-4: dropped=[]', result.dropped, []);
}

// =============================================================================
// Brief §3b case 5 — malformed input: fail loud, never silent-empty
// (same failure class FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT documents — do not reproduce it)
// =============================================================================
console.log('\nTC-5: malformed input types throw loud (caller bug), never silently return empty');
{
  const sched = fixtureSchedule();
  let threw = false;
  try {
    applySupersedeMutex('not-an-array', sched.slots);
  } catch (e) {
    threw = true;
  }
  assert('TC-5: non-array matches throws', threw, true);

  threw = false;
  try {
    applySupersedeMutex([], { slots: 'not-an-array' });
  } catch (e) {
    threw = true;
  }
  assert('TC-5: non-array scheduleSlots throws', threw, true);
}

// =============================================================================
// TC-6: a slot cannot supersede itself, even if `.supersedes` mistakenly names its own
// slot_id — S always survives, per the pure-function's own contract comment.
// =============================================================================
console.log('\nTC-6: a slot naming itself in .supersedes cannot drop itself');
{
  const sched = {
    slots: [
      { slot_id: 'self-ref-slot', supersedes: ['self-ref-slot'] },
    ],
  };
  const matches = [{ slot_id: 'self-ref-slot' }];
  const result = applySupersedeMutex(matches, sched.slots);
  assert('TC-6: self-referencing slot survives', result.matches.some((m) => m.slot_id === 'self-ref-slot'), true);
  assert('TC-6: supersede_mutex_applied=false (nothing else to drop)', result.supersede_mutex_applied, false);
}

// =============================================================================
// TC-7: empty MATCHES — no-op, never throws
// =============================================================================
console.log('\nTC-7: empty MATCHES — no-op, never throws');
{
  const sched = fixtureSchedule();
  const result = applySupersedeMutex([], sched.slots);
  assert('TC-7: empty matches stays empty', result.matches, []);
  assert('TC-7: supersede_mutex_applied=false', result.supersede_mutex_applied, false);
}

// =============================================================================
// TC-8: CLI integration — the actual invocation shape available for symmetry/testability
// (AC-5) — proves the CLI entry point round-trips correctly end-to-end, even though the LIVE
// call site (cowork-match-slots.js finish()) never shells out to it.
// =============================================================================
console.log('\nTC-8: CLI stdin integration — both present, offhours dropped');
{
  const dir = mkFixtureDir('cowork-supersede-mutex-test-');
  const schedPath = path.join(dir, 'cowork-schedule.json');
  fs.writeFileSync(schedPath, JSON.stringify(fixtureSchedule()));

  const matches = [{ slot_id: 'market-watcher-offhours' }, { slot_id: 'market-watcher-eod' }];

  const run = spawnSync('node', [SCRIPT_PATH], {
    input: JSON.stringify(matches),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { SCHED_FILE: schedPath }),
  });

  assert('TC-8: script exits 0', run.status, 0);
  let out = null;
  let parseOk = true;
  try { out = JSON.parse(run.stdout); } catch (e) { parseOk = false; }
  assert('TC-8: stdout is valid JSON', parseOk, true);
  assert('TC-8: ok=true', out && out.ok, true);
  assert('TC-8: supersede_mutex_applied=true', out && out.supersede_mutex_applied, true);
  assert('TC-8: only eod survives', out && out.matches.map((m) => m.slot_id), ['market-watcher-eod']);

  fs.rmSync(dir, { recursive: true, force: true });
}

// =============================================================================
// TC-9: CLI malformed-input error envelope — AC-2's "error envelope + exit 1" at the CLI
// boundary, not just the pure-function boundary.
// =============================================================================
console.log('\nTC-9: CLI malformed MATCHES JSON — error envelope + exit 1, never silent-empty');
{
  const dir = mkFixtureDir('cowork-supersede-mutex-badinput-');
  const schedPath = path.join(dir, 'cowork-schedule.json');
  fs.writeFileSync(schedPath, JSON.stringify(fixtureSchedule()));

  const run = spawnSync('node', [SCRIPT_PATH], {
    input: '{not valid json',
    encoding: 'utf8',
    env: Object.assign({}, process.env, { SCHED_FILE: schedPath }),
  });

  assert('TC-9: script exits 1', run.status, 1);
  let out = null;
  let parseOk = true;
  try { out = JSON.parse(run.stdout); } catch (e) { parseOk = false; }
  assert('TC-9: stdout is valid JSON error envelope', parseOk, true);
  assert('TC-9: ok=false', out && out.ok, false);
  assert('TC-9: error message present', typeof (out && out.error), 'string');

  fs.rmSync(dir, { recursive: true, force: true });
}

// =============================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
