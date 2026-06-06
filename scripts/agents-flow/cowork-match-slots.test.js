#!/usr/bin/env node
// Test harness for cowork-match-slots.js — 8 drift scenarios
// Architecture brief: docs/architecture-briefs/2026-05-18-spike-1951f-fire-drift-fix.md
//
// Run: node scripts/agents-flow/cowork-match-slots.test.js
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
const { cronMatches, matchSlots, snapToCronBoundary } = require(path.join(process.cwd(), 'scripts/agents-flow/cowork-match-slots.js'));

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
// TC-9..TC-14: snapToCronBoundary unit tests (FIX-COWORK-CADENCE-DRIFT-SNAP)
// ---------------------------------------------------------------------------
console.log('\nTC-9: snapToCronBoundary — "0 */4 * * *", last_fired 04:04:30Z → snaps to 04:00:00Z');
{
  // 2026-06-06T04:04:30Z = 1749182670s  → 4h boundary = floor(1749182670/14400)*14400
  const lastFiredUnix = new Date('2026-06-06T04:04:30Z').getTime() / 1000; // 1749182670
  const snapped = snapToCronBoundary(lastFiredUnix, '0 */4 * * *');
  const expectedSnap = new Date('2026-06-06T04:00:00Z').getTime() / 1000;
  assert('snapped == 04:00:00Z unix', snapped, expectedSnap);
}

console.log('\nTC-10: snapToCronBoundary — "0 */4 * * *" last_fired 04:04:30Z, now 08:00:xxZ → elapsedSeconds >= 14400 (slot IS due)');
{
  // This is the core regression case.
  // Before fix: elapsed = 08:00:00 - 04:04:30 = 14370s < 14400s → skipped (BUG).
  // After fix:  elapsed = 08:00:00 - 04:00:00 = 14400s >= 14400s → due (CORRECT).
  const lastFiredUnix = new Date('2026-06-06T04:04:30Z').getTime() / 1000;
  const nowUnix       = new Date('2026-06-06T08:00:05Z').getTime() / 1000; // ~5s into the tick
  const cadenceSeconds = 240 * 60; // 14400
  const snappedLastFired = snapToCronBoundary(lastFiredUnix, '0 */4 * * *');
  const elapsed = nowUnix - snappedLastFired;
  assert('elapsed >= cadenceSeconds (due)', elapsed >= cadenceSeconds, true);
}

console.log('\nTC-11: snapToCronBoundary — no over-fire: within-cadence slot still skipped after snap');
{
  // last_fired 07:59:00Z, now 08:00:05Z → elapsed after snap = 08:00:05 - 04:00:00 = 14405s → due.
  // But last_fired 07:00:00Z (real, 1h ago) → snap still = 04:00:00Z, elapsed = 4h+5s → due.
  // We want: last_fired 04:30:00Z, now 04:35:00Z → snap = 04:00:00Z, elapsed = 35min < 240min → skip.
  const lastFiredUnix = new Date('2026-06-06T04:30:00Z').getTime() / 1000;
  const nowUnix       = new Date('2026-06-06T04:35:00Z').getTime() / 1000;
  const cadenceSeconds = 240 * 60;
  const snapped = snapToCronBoundary(lastFiredUnix, '0 */4 * * *');
  const elapsed = nowUnix - snapped;
  assert('within-cadence slot is still skipped (no over-fire)', elapsed >= cadenceSeconds, false);
}

console.log('\nTC-12: snapToCronBoundary — "*/15 * * * *" last_fired 08:17:45Z → snaps to 08:15:00Z');
{
  const lastFiredUnix = new Date('2026-06-06T08:17:45Z').getTime() / 1000;
  const snapped = snapToCronBoundary(lastFiredUnix, '*/15 * * * *');
  const expectedSnap = new Date('2026-06-06T08:15:00Z').getTime() / 1000;
  assert('*/15 snapped to 08:15:00Z', snapped, expectedSnap);
}

console.log('\nTC-13: snapToCronBoundary — unrecognised pattern passthrough (no snap)');
{
  const lastFiredUnix = new Date('2026-06-06T10:07:00Z').getTime() / 1000;
  const snapped = snapToCronBoundary(lastFiredUnix, '5 10 * * 1-5'); // fixed minute+hour, no period
  assert('unrecognised cron snaps to lastFiredUnix unchanged', snapped, lastFiredUnix);
}

console.log('\nTC-14: matchSlots adaptive — 04:04:30Z last_fired, now 08:00:05Z → slot IS returned as due');
{
  // Build a minimal schedule with one offhours-style slot.
  const minimalSched = {
    slots: [{
      slot_id:       'test-offhours',
      cron:          '0 */4 * * *',
      agent:         'test-agent',
      flow_path:     'docs/agents/test/flow/main.md',
      trigger_prompt:'run test',
      guaranteed:    false,
      enabled:       true,
      policy_id:     'gatherer-standard',
      last_fired:    '2026-06-06T04:04:30Z',
    }]
  };
  // ctx: 08:00:05Z → actualM=0, H=8, DOM=6, MON=6, DOW=6 (Saturday)
  // cron "0 */4 * * *" has DOW=*, so Saturday matches.
  const ctx = { actualM: 0, H: 8, DOM: 6, MON: 6, DOW: 6 };
  // Minimal pressure-state + policy so adaptive mode engages.
  const pressureState = {
    emitted_at: '2026-06-06T07:55:00Z',
    stale_warning: false,
    signal_backlog: 0,
    last_volatility_level: 'low',
    calendar_status: 'weekend'
  };
  // gatherer-standard policy: supply a rule that returns 240min for weekend/*/*
  const policyObj = {
    _staleness_threshold_minutes: 20,
    policies: [{
      policy_id: 'gatherer-standard',
      calendar_status: '*',
      signal_backlog_tier: '*',
      volatility_tier: '*',
      interval_minutes: 240,
      _cron_fallback: false
    }]
  };
  const slots = matchSlots(minimalSched, ctx, { mode: 'adaptive', pressureState, policyObj });
  assert('slot IS in adaptive results (due via snap)', slots.length > 0, true);
  assert('due_reason is cadence', slots.length > 0 ? slots[0].due_reason : 'none', 'cadence');
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
