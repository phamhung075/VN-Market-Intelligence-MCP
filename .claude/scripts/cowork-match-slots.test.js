#!/usr/bin/env node
// Test harness for cowork-match-slots.js — 8 drift scenarios
// Architecture brief: docs/architecture-briefs/2026-05-18-spike-1951f-fire-drift-fix.md
//
// Run: node .claude/scripts/cowork-match-slots.test.js
// Exit 0 = all pass, Exit 1 = any fail.

'use strict';

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Load schedule (SSOT) and the exported helpers from the script under test.
// ---------------------------------------------------------------------------
const schedPath = path.join(process.cwd(), 'docs/data/cowork-schedule.json');
const sched = JSON.parse(fs.readFileSync(schedPath, 'utf8'));

// This require must succeed — if the script does not export, we fail loud.
const { cronMatches, matchSlots } = require(path.join(process.cwd(), '.claude/scripts/cowork-match-slots.js'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Build a ctx object from a UTC Date.
function ctxFromDate(d) {
  return {
    actualM: d.getUTCMinutes(),
    H:   d.getUTCHours(),
    DOM: d.getUTCDate(),
    MON: d.getUTCMonth() + 1,
    DOW: d.getUTCDay(), // 0=Sun..6=Sat
  };
}

// Monday 2026-05-18 is a known Monday in UTC.
// Sunday 2026-05-17 is the preceding Sunday.
// We construct dates by setting explicit UTC fields.
function utcDate(isoStr) {
  return new Date(isoStr);
}

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
// Slot references from docs/data/cowork-schedule.json
// market-watcher-prepost: "*/30 * * * 1-5"  (Mon-Fri, every 30 min all hours)
// news-scout-market:      "*/15 2-8 * * 1-5" (Mon-Fri market hours, every 15 min)
// ---------------------------------------------------------------------------
const CRON_30  = '*/30 * * * 1-5';  // market-watcher-prepost
const CRON_15  = '*/15 2-8 * * 1-5'; // news-scout-market / market-watcher-market

// ---------------------------------------------------------------------------
// TC-1: Monday 02:00:30Z — */30 slot at :00 matches (on-time fire)
// actualM=0 → nominal M=0, window [-2..2]→[0..2], d=0 → m=0, 0%30=0 ✓
// ---------------------------------------------------------------------------
console.log('\nTC-1: Monday 02:00:30Z — */30 at :00 matches (on-time fire)');
{
  const ctx = ctxFromDate(utcDate('2026-05-18T02:00:30Z')); // Monday
  assert('cronMatches("*/30 * * * 1-5") at 02:00:30Z', cronMatches(CRON_30, ctx), true);
}

// ---------------------------------------------------------------------------
// TC-2: Monday 02:07:30Z — */30 at :00 still matches (7-min drift → nominal :00)
// actualM=7 → nominal M=floor(7/15)*15=0, window [0..2], d=0 → m=0, 0%30=0 ✓
// This is the exact regression case from the architecture brief.
// ---------------------------------------------------------------------------
console.log('\nTC-2: Monday 02:07:30Z — */30 at :00 still matches (7-min drift → nominal :00)');
{
  const ctx = ctxFromDate(utcDate('2026-05-18T02:07:30Z')); // Monday
  assert('cronMatches("*/30 * * * 1-5") at 02:07:30Z', cronMatches(CRON_30, ctx), true);
}

// ---------------------------------------------------------------------------
// TC-3: Monday 02:15:30Z — */30 at :00 does NOT match (nominal :15, different window)
// actualM=15 → nominal M=15, window [13..17], none of 13-17 satisfies x%30==0
// Confirms no adjacent-tick collision: :00-window slots are not picked up at :15 nominal.
// ---------------------------------------------------------------------------
console.log('\nTC-3: Monday 02:15:30Z — */30 at :00 does NOT match (nominal :15, next window)');
{
  const ctx = ctxFromDate(utcDate('2026-05-18T02:15:30Z')); // Monday
  assert('cronMatches("*/30 * * * 1-5") at 02:15:30Z is false', cronMatches(CRON_30, ctx), false);
}

// ---------------------------------------------------------------------------
// TC-4: Monday 02:15:30Z — */15 at :15 DOES match (nominal tick :15 window fires)
// actualM=15 → nominal M=15, window [13..17], d=0 → m=15, 15%15=0 ✓, hour 2 in 2-8 ✓
// Complements TC-3: the :15 window is active, just not for */30.
// ---------------------------------------------------------------------------
console.log('\nTC-4: Monday 02:15:30Z — */15 at :15 DOES match (nominal :15 window active)');
{
  const ctx = ctxFromDate(utcDate('2026-05-18T02:15:30Z')); // Monday
  assert('cronMatches("*/15 2-8 * * 1-5") at 02:15:30Z', cronMatches(CRON_15, ctx), true);
}

// ---------------------------------------------------------------------------
// TC-5: Monday 02:22:30Z — */30 at :15 still matches (7-min drift → nominal :15)
// actualM=22 → nominal M=floor(22/15)*15=15, window [13..17]
// Wait — */30 hits 0 and 30 only; 13-17 none satisfy x%30==0.
// So this test uses */15: actualM=22 → nominal=15, d=0 → m=15, 15%15=0 ✓
// The brief table says "*/30 at :15 still matches (7min drift → nominal :15)".
// Under Option B the */30 slot has no target at :15; the test verifies the
// drift-tolerance mechanism using the */15 slot which DOES target :15.
// ---------------------------------------------------------------------------
console.log('\nTC-5: Monday 02:22:30Z — */15 at :15 still matches (7-min drift → nominal :15)');
{
  const ctx = ctxFromDate(utcDate('2026-05-18T02:22:30Z')); // Monday
  assert('cronMatches("*/15 2-8 * * 1-5") at 02:22:30Z', cronMatches(CRON_15, ctx), true);
}

// ---------------------------------------------------------------------------
// TC-6: Monday 02:30:30Z — */30 at :30 matches (on-time fire)
// actualM=30 → nominal M=floor(30/15)*15=30, window [28..32], d=0 → m=30, 30%30=0 ✓
// ---------------------------------------------------------------------------
console.log('\nTC-6: Monday 02:30:30Z — */30 at :30 matches (on-time fire)');
{
  const ctx = ctxFromDate(utcDate('2026-05-18T02:30:30Z')); // Monday
  assert('cronMatches("*/30 * * * 1-5") at 02:30:30Z', cronMatches(CRON_30, ctx), true);
}

// ---------------------------------------------------------------------------
// TC-7: Monday 02:37:30Z — */30 at :30 still matches (7-min drift → nominal :30)
// actualM=37 → nominal M=floor(37/15)*15=30, window [28..32], d=0 → m=30, 30%30=0 ✓
// ---------------------------------------------------------------------------
console.log('\nTC-7: Monday 02:37:30Z — */30 at :30 still matches (7-min drift → nominal :30)');
{
  const ctx = ctxFromDate(utcDate('2026-05-18T02:37:30Z')); // Monday
  assert('cronMatches("*/30 * * * 1-5") at 02:37:30Z', cronMatches(CRON_30, ctx), true);
}

// ---------------------------------------------------------------------------
// TC-8: Sunday 03:00:30Z — DOW-restricted slot (1-5) does NOT fire on Sunday
// DOW=0 (Sunday). Both CRON_30 and CRON_15 have "1-5" day-of-week restriction.
// Verifies dowMatch correctly excludes Sunday.
// ---------------------------------------------------------------------------
console.log('\nTC-8: Sunday 03:00:30Z — DOW-restricted slot (1-5) does NOT fire on Sunday');
{
  const ctx = ctxFromDate(utcDate('2026-05-17T03:00:30Z')); // Sunday (2026-05-17)
  assert('Sunday DOW=0 is not in 1-5 (DOW check)', ctx.DOW, 0);
  assert('cronMatches("*/30 * * * 1-5") on Sunday is false', cronMatches(CRON_30, ctx), false);
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
