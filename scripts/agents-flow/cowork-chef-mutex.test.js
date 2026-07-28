#!/usr/bin/env node
// Test harness for cowork-chef-mutex.js — FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT.
//
// Run: node scripts/agents-flow/cowork-chef-mutex.test.js
// Exit 0 = all pass, Exit 1 = any fail.
//
// Fixtures ONLY — never reads/writes the live docs/data/cowork-schedule.json (that file is
// hot: the cowork dispatcher writes last_fired into it every 15 minutes). Every scenario
// that needs a schedule file builds its own fixture under an mkdtemp() root, isolated per
// scenario (pattern mirrors drain-signals.test.js).

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.join(process.cwd(), 'scripts/agents-flow/cowork-chef-mutex.js');
const { applyChefMutex } = require(SCRIPT_PATH);

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

// The EXACT live shape that broke the inline shell (docs/data/cowork-schedule.json today):
// chef-intraday's trigger_prompt carries a literal `\n` (backslash + n, two characters)
// inside the JSON string value. This is the fixture that must survive.
const CHEF_INTRADAY_TRIGGER_PROMPT =
  'run docs/agents/unified-agent/flow/chef.md  slot=chef-intraday\nMCP: https://zenmidi.com/vn-market/mcp';

function fixtureSchedule() {
  return {
    slots: [
      {
        slot_id: 'chef-morning', cron: '15 5 * * 1-5', agent: 'unified-agent',
        parallel_group: 'chef', guaranteed: true, policy_id: null,
        trigger_prompt: 'run docs/agents/unified-agent/flow/chef.md  slot=chef-morning',
      },
      {
        slot_id: 'chef-intraday', cron: '13 2-8 * * 1-5', agent: 'unified-agent',
        parallel_group: 'chef', guaranteed: false, policy_id: 'chef-intraday',
        trigger_prompt: CHEF_INTRADAY_TRIGGER_PROMPT,
      },
      {
        slot_id: 'chef-eod', cron: '45 8 * * 1-5', agent: 'unified-agent',
        parallel_group: 'chef', guaranteed: true, policy_id: null,
        trigger_prompt: 'run docs/agents/unified-agent/flow/chef.md  slot=chef-eod',
      },
      {
        slot_id: 'chef-evening', cron: '45 19 * * *', agent: 'unified-agent',
        parallel_group: 'chef', guaranteed: true, policy_id: null,
        trigger_prompt: 'run docs/agents/unified-agent/flow/chef.md  slot=chef-evening',
      },
      {
        slot_id: 'news-scout-market', cron: '*/15 2-8 * * 1-5', agent: 'news-scout',
        parallel_group: null, guaranteed: true, policy_id: null,
        trigger_prompt: 'run docs/agents/news-scout/flow/main.md  slot=news-scout-market',
      },
    ],
  };
}

// =============================================================================
// TC-1..5: applyChefMutex — pure function, unit-level (no I/O)
// =============================================================================

console.log('\nTC-1: coincidence tick — guaranteed + non-guaranteed CHEF both present');
{
  const sched = fixtureSchedule();
  const matches = [
    { slot_id: 'chef-morning', trigger_prompt: sched.slots[0].trigger_prompt },
    { slot_id: 'chef-intraday', trigger_prompt: CHEF_INTRADAY_TRIGGER_PROMPT },
    { slot_id: 'news-scout-market' },
  ];
  const result = applyChefMutex(matches, sched.slots);
  assert('TC-1: exactly one CHEF dish survives', result.matches.filter((m) => m.slot_id.startsWith('chef-')).length, 1);
  assert('TC-1: surviving CHEF dish is the guaranteed one', result.matches.some((m) => m.slot_id === 'chef-morning'), true);
  assert('TC-1: non-guaranteed CHEF dish dropped', result.matches.some((m) => m.slot_id === 'chef-intraday'), false);
  assert('TC-1: unrelated slot untouched', result.matches.some((m) => m.slot_id === 'news-scout-market'), true);
  assert('TC-1: chef_mutex_applied=true', result.chef_mutex_applied, true);
  assert('TC-1: dropped=[chef-intraday]', result.dropped, ['chef-intraday']);
}

console.log('\nTC-2: only guaranteed CHEF slot due — no-op (mutex not triggered, nothing to drop)');
{
  const sched = fixtureSchedule();
  const matches = [{ slot_id: 'chef-morning' }, { slot_id: 'news-scout-market' }];
  const result = applyChefMutex(matches, sched.slots);
  assert('TC-2: matches unchanged (same length)', result.matches.length, 2);
  assert('TC-2: chef_mutex_applied=false', result.chef_mutex_applied, false);
  assert('TC-2: dropped=[]', result.dropped, []);
}

console.log('\nTC-3: only non-guaranteed CHEF slot due (off-hours intraday alone) — no-op, it fires');
{
  const sched = fixtureSchedule();
  const matches = [{ slot_id: 'chef-intraday' }];
  const result = applyChefMutex(matches, sched.slots);
  assert('TC-3: chef-intraday survives alone', result.matches.some((m) => m.slot_id === 'chef-intraday'), true);
  assert('TC-3: chef_mutex_applied=false', result.chef_mutex_applied, false);
}

console.log('\nTC-4: no CHEF slots in MATCHES at all — passthrough unchanged');
{
  const sched = fixtureSchedule();
  const matches = [{ slot_id: 'news-scout-market' }];
  const result = applyChefMutex(matches, sched.slots);
  assert('TC-4: passthrough identical', result.matches, matches);
  assert('TC-4: chef_mutex_applied=false', result.chef_mutex_applied, false);
}

console.log('\nTC-5: empty MATCHES — no-op, never throws');
{
  const sched = fixtureSchedule();
  const result = applyChefMutex([], sched.slots);
  assert('TC-5: empty matches stays empty', result.matches, []);
  assert('TC-5: chef_mutex_applied=false', result.chef_mutex_applied, false);
}

console.log('\nTC-6: malformed input types throw loud (caller bug), never silently return empty');
{
  const sched = fixtureSchedule();
  let threw = false;
  try {
    applyChefMutex('not-an-array', sched.slots);
  } catch (e) {
    threw = true;
  }
  assert('TC-6: non-array matches throws', threw, true);

  threw = false;
  try {
    applyChefMutex([], { slots: 'not-an-array' });
  } catch (e) {
    threw = true;
  }
  assert('TC-6: non-array scheduleSlots throws', threw, true);
}

// =============================================================================
// TC-7: CLI integration — the actual invocation shape used by pressure-cadence.md,
// fed via spawnSync's `input` (direct pipe write, no shell involved) — proves the
// script itself parses the escaped-\n fixture correctly end-to-end.
// =============================================================================

console.log('\nTC-7: CLI stdin integration — chef-intraday trigger_prompt with embedded \\n survives');
{
  const dir = mkFixtureDir('cowork-chef-mutex-test-');
  const schedPath = path.join(dir, 'cowork-schedule.json');
  fs.writeFileSync(schedPath, JSON.stringify(fixtureSchedule()));

  const matches = [
    { slot_id: 'chef-morning', trigger_prompt: 'run docs/agents/unified-agent/flow/chef.md  slot=chef-morning' },
    { slot_id: 'chef-intraday', trigger_prompt: CHEF_INTRADAY_TRIGGER_PROMPT },
  ];

  const run = spawnSync('node', [SCRIPT_PATH], {
    input: JSON.stringify(matches),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { SCHED_FILE: schedPath }),
  });

  assert('TC-7: script exits 0', run.status, 0);
  let out = null;
  let parseOk = true;
  try { out = JSON.parse(run.stdout); } catch (e) { parseOk = false; }
  assert('TC-7: stdout is valid JSON (no control-char corruption)', parseOk, true);
  assert('TC-7: ok=true', out && out.ok, true);
  assert('TC-7: chef_mutex_applied=true', out && out.chef_mutex_applied, true);
  assert('TC-7: exactly one CHEF dish (chef-morning) in result', out && out.matches.map((m) => m.slot_id), ['chef-morning']);

  fs.rmSync(dir, { recursive: true, force: true });
}

// =============================================================================
// TC-8: REGRESSION GUARD — the exact old defeat mode (`echo "$VAR" | jq`) reproduces
// the historical parse error on this fixture, while the documented replacement
// (`printf '%s' "$VAR" | jq` / this script) does not. This is the "round-trips through
// the mutex membership check without echo corruption" AC from the incident row —
// proven against the real fixture, under the real shell (zsh), not just asserted in prose.
// =============================================================================

console.log('\nTC-8: regression guard — echo|jq corrupts the embedded-\\n fixture; printf|jq does not');
{
  const schedJson = JSON.stringify(fixtureSchedule());

  const oldBuggyScript =
    'SCHEDULE=$(cat "$1"); ' +
    'echo "$SCHEDULE" | jq -c \'[.slots[] | select(.parallel_group=="chef" and .guaranteed==true) | .slot_id]\'';
  const dir = mkFixtureDir('cowork-chef-mutex-regress-');
  const schedPath = path.join(dir, 'cowork-schedule.json');
  fs.writeFileSync(schedPath, schedJson);

  const buggyRun = spawnSync('zsh', ['-c', oldBuggyScript, '_', schedPath], { encoding: 'utf8' });
  assert('TC-8: OLD echo|jq pattern fails on this fixture (proves the defect is real, not theoretical)',
    buggyRun.status !== 0 || /control characters/.test(buggyRun.stderr), true);

  const fixedScript =
    'SCHEDULE=$(cat "$1"); ' +
    'printf "%s" "$SCHEDULE" | jq -c \'[.slots[] | select(.parallel_group=="chef" and .guaranteed==true) | .slot_id]\'';
  const fixedRun = spawnSync('zsh', ['-c', fixedScript, '_', schedPath], { encoding: 'utf8' });
  assert('TC-8: NEW printf|jq pattern survives the same fixture', fixedRun.status, 0);
  let fixedArr = null;
  try { fixedArr = JSON.parse(fixedRun.stdout); } catch (e) { /* leave null, next assert fails */ }
  assert('TC-8: NEW pattern returns the correct guaranteed-slot array', fixedArr, ['chef-morning', 'chef-eod', 'chef-evening']);

  fs.rmSync(dir, { recursive: true, force: true });
}

// =============================================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
