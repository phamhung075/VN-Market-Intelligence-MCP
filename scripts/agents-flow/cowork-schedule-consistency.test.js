#!/usr/bin/env node
// Test harness for the cowork-schedule.json entry-point consistency invariant.
// Mirrors scripts/agents-flow/cowork-match-slots.test.js conventions (plain-assert, no framework).
//
// Root cause this guards: FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE
// (2026-07-29) — docs/agents/cowork-team/flow/spawn-fanout.md Step 5.2 now dispatches
// slot.trigger_prompt (falling back to a composed slot.flow_path prompt only when
// trigger_prompt is absent). A slot whose trigger_prompt names a DIFFERENT file than its
// flow_path is therefore a schedule-config defect: flow_path is used for the pre-spawn
// file-existence check, so a divergent pair would validate the wrong file while dispatching
// the un-validated one. digest-daily was the sole live violation before this fix (flow_path
// pointed at daily-predict.md — bypassing main.md's Step pre-D DAILY-PREDICT DEDUP GATE —
// while trigger_prompt correctly named main.md).
//
// Run: node scripts/agents-flow/cowork-schedule-consistency.test.js
// Exit 0 = all pass, Exit 1 = any fail.

'use strict';

const path = require('path');
const fs = require('fs');

const schedPath = path.join(process.cwd(), 'docs/data/cowork-schedule.json');
const sched = JSON.parse(fs.readFileSync(schedPath, 'utf8'));

const { extractPromptFlowPath, slotEntryPathsAgree } = require(
  path.join(process.cwd(), 'scripts/agents-flow/cowork-match-slots.js')
);

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    console.log(`        expected: ${expected}`);
    console.log(`        actual:   ${actual}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Unit coverage of the detector itself (proves it actually flags a divergence,
// not just that today's live schedule happens to be clean)
// ---------------------------------------------------------------------------
console.log('\nTC-1: extractPromptFlowPath — bare "run <path>  slot=<id>" form');
{
  const got = extractPromptFlowPath('run docs/agents/foo/flow/main.md  slot=foo-slot');
  assert('extracts the file path on the first line', got, 'docs/agents/foo/flow/main.md');
}

console.log('\nTC-2: extractPromptFlowPath — multi-line trigger_prompt (refine-bctc-slot-* shape)');
{
  const got = extractPromptFlowPath(
    'run docs/agents/refine_bctc_md/flow/main.md  slot=refine-bctc-slot-1\nCall get_bctc_pending_refine (limit:1)...'
  );
  assert('extracts only the first-line file path, ignores later instruction lines', got, 'docs/agents/refine_bctc_md/flow/main.md');
}

console.log('\nTC-3: extractPromptFlowPath — null/missing trigger_prompt');
{
  assert('null input -> null', extractPromptFlowPath(null), null);
  assert('undefined input -> null', extractPromptFlowPath(undefined), null);
  assert('empty string -> null', extractPromptFlowPath(''), null);
}

console.log('\nTC-4: slotEntryPathsAgree — matching pair passes');
{
  const slot = { flow_path: 'docs/agents/foo/flow/main.md', trigger_prompt: 'run docs/agents/foo/flow/main.md  slot=foo' };
  assert('same file on both fields -> agree', slotEntryPathsAgree(slot), true);
}

console.log('\nTC-5: slotEntryPathsAgree — divergent pair fails (the digest-daily shape, pre-fix)');
{
  const slot = {
    flow_path: 'docs/agents/digest-predict/flow/daily-predict.md',
    trigger_prompt: 'run docs/agents/digest-predict/flow/main.md  slot=digest-daily',
  };
  assert('different files on the two fields -> DISAGREE (detector catches the real pre-fix shape)', slotEntryPathsAgree(slot), false);
}

console.log('\nTC-6: slotEntryPathsAgree — trigger_prompt absent is not a violation (fallback path, defensive)');
{
  const slot = { flow_path: 'docs/agents/foo/flow/main.md', trigger_prompt: null };
  assert('no trigger_prompt to compare -> agree (nothing to contradict)', slotEntryPathsAgree(slot), true);
}

// ---------------------------------------------------------------------------
// The live static assertion — every slot in the real, checked-in schedule.
// This is the AC's "asserted by a test that reads the live schedule" gate.
// ---------------------------------------------------------------------------
console.log('\nTC-7: every slot in the live docs/data/cowork-schedule.json has trigger_prompt and flow_path naming the same file');
{
  const violations = sched.slots.filter(sl => !slotEntryPathsAgree(sl));
  if (violations.length === 0) {
    console.log(`  PASS  all ${sched.slots.length} live slots agree`);
    passed++;
  } else {
    console.log('  FAIL  live schedule has trigger_prompt/flow_path mismatches:');
    for (const sl of violations) {
      console.log(`        ${sl.slot_id}: trigger_prompt names '${extractPromptFlowPath(sl.trigger_prompt)}' but flow_path is '${sl.flow_path}'`);
    }
    failed++;
  }
}

// ---------------------------------------------------------------------------
// AC-6 (FIX-COWORK-SUPERSEDE-MUTEX-SCRIPT-AND-MATCHSLOTS-WIRING, optional per brief §3e):
// every `.supersedes` entry must name a real `slot_id` present elsewhere in the same file —
// same spirit as the trigger_prompt/flow_path check above, prevents a future typo'd
// `supersedes` value from silently no-op'ing (cowork-supersede-mutex.js can only drop a
// slot_id it can actually find in `matches`; a typo'd victim id is indistinguishable from
// "victim not due this tick" and the mutex silently never fires for that pair).
//
// findInvalidSupersedesEntries — local to this test file (not exported production code: this
// is a schedule-authoring static check, not runtime behaviour). Exercised first against
// synthetic fixtures (proves the detector actually flags a bad entry, not just that today's
// live schedule happens to be clean), then against the live schedule.
// ---------------------------------------------------------------------------
function findInvalidSupersedesEntries(slots) {
  const allSlotIds = new Set(slots.map(sl => sl.slot_id));
  const violations = [];
  for (const sl of slots) {
    if (!Array.isArray(sl.supersedes) || sl.supersedes.length === 0) continue;
    for (const victimId of sl.supersedes) {
      if (victimId === sl.slot_id) {
        violations.push(`${sl.slot_id}: supersedes names itself ('${victimId}')`);
      } else if (!allSlotIds.has(victimId)) {
        violations.push(`${sl.slot_id}: supersedes names unknown slot_id '${victimId}' (typo? not present anywhere in the file)`);
      }
    }
  }
  return violations;
}

console.log('\nTC-8: findInvalidSupersedesEntries — typo\'d victim slot_id is flagged');
{
  const fixture = [
    { slot_id: 'market-watcher-eod', supersedes: ['market-watcher-offhors'] }, // typo: missing 'u'
    { slot_id: 'market-watcher-offhours' },
  ];
  const violations = findInvalidSupersedesEntries(fixture);
  assert('typo\'d supersedes entry is flagged', violations.length, 1);
}

console.log('\nTC-9: findInvalidSupersedesEntries — valid pair passes clean');
{
  const fixture = [
    { slot_id: 'market-watcher-eod', supersedes: ['market-watcher-offhours'] },
    { slot_id: 'market-watcher-offhours' },
  ];
  assert('valid supersedes entry -> zero violations', findInvalidSupersedesEntries(fixture).length, 0);
}

console.log('\nTC-10: findInvalidSupersedesEntries — self-referencing entry is flagged');
{
  const fixture = [{ slot_id: 'self-ref-slot', supersedes: ['self-ref-slot'] }];
  const violations = findInvalidSupersedesEntries(fixture);
  assert('self-referencing supersedes entry is flagged', violations.length, 1);
}

console.log('\nTC-11: every `.supersedes` entry in the live docs/data/cowork-schedule.json names a real slot_id present elsewhere in the same file');
{
  const violations = findInvalidSupersedesEntries(sched.slots);
  if (violations.length === 0) {
    const declaredCount = sched.slots.filter(sl => Array.isArray(sl.supersedes) && sl.supersedes.length > 0).length;
    console.log(`  PASS  all declared .supersedes entries (${declaredCount} slot(s) with a non-empty .supersedes array) name real slot_ids`);
    passed++;
  } else {
    console.log('  FAIL  live schedule has invalid .supersedes entries:');
    for (const v of violations) {
      console.log(`        ${v}`);
    }
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const total = passed + failed;
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
if (failed > 0) {
  console.log('OVERALL: FAIL');
  process.exit(1);
} else {
  console.log('OVERALL: PASS');
  process.exit(0);
}
