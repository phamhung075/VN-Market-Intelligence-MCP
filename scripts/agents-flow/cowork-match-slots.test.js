#!/usr/bin/env node
// Test harness for cowork-match-slots.js — 8 drift scenarios
// Architecture brief: docs/architecture-briefs/2026-05-18-spike-1951f-fire-drift-fix.md
//
// Run: node scripts/agents-flow/cowork-match-slots.test.js
// Exit 0 = all pass, Exit 1 = any fail.

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Load schedule (SSOT) and the exported helpers from the script under test.
// ---------------------------------------------------------------------------
const schedPath = path.join(process.cwd(), 'docs/data/cowork-schedule.json');
const sched = JSON.parse(fs.readFileSync(schedPath, 'utf8'));

// This require must succeed — if the script does not export, we fail loud.
const { cronMatches, matchSlots, snapToCronBoundary, isSuppressedByBoundaryDedup, applyFreshnessDowngrade } = require(path.join(process.cwd(), 'scripts/agents-flow/cowork-match-slots.js'));

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
// TC-15..TC-19: legacy mode last_fired boundary dedup (UC-CDC-P3)
// SSOT: isSuppressedByBoundaryDedup() inside cowork-match-slots.js, applied by
// legacyCandidates() at BOTH legacy return points (pure-legacy branch + the
// cadence-unavailable fallback) — the dispatcher, cowork-tick-preflight.sh, and
// cowork-guaranteed-slot-firer.sh all invoke this same matcher, so they all inherit
// this one dedup (no per-caller copies).
//
// ctx.nowUnix is a TEST-ONLY override (see cowork-match-slots.js matchSlots()) that
// pins "now" so the boundary snap is fully deterministic — production ctx is always
// undefined (real Date.now() used), and no adaptive-mode test/caller sets it, so
// adaptive-mode behaviour is unaffected (confirmed by TC-14 still passing above).
//
// Slot uses CRON_15 ('*/15 2-8 * * 1-5'). At Monday 2026-05-18T02:15:30Z the nominal
// tick boundary (snapToCronBoundary, 900s period) is 2026-05-18T02:15:00Z.
// ---------------------------------------------------------------------------
function legacySlotSched(lastFired) {
  return {
    slots: [{
      slot_id:       'test-legacy-dedup',
      cron:          CRON_15,
      agent:         'test-agent',
      flow_path:     'docs/agents/test/flow/main.md',
      trigger_prompt:'run test',
      guaranteed:    false,
      enabled:       true,
      policy_id:     null,
      last_fired:    lastFired,
    }]
  };
}

const LEGACY_NOW_ISO = '2026-05-18T02:15:30Z'; // Monday, matches CRON_15 window
const legacyCtx = Object.assign(ctxFromDate(utcDate(LEGACY_NOW_ISO)), {
  nowUnix: utcDate(LEGACY_NOW_ISO).getTime() / 1000,
});

console.log('\nTC-15: legacy dedup — last_fired AT nominal tick boundary (02:15:00Z) → SUPPRESSED');
{
  const sched15 = legacySlotSched('2026-05-18T02:15:00Z'); // exact boundary
  const slots = matchSlots(sched15, legacyCtx, { mode: 'legacy' });
  assert('slot suppressed (0 results)', slots.length, 0);
}

console.log('\nTC-16: legacy dedup — last_fired AFTER nominal tick boundary (02:15:20Z, same tick) → SUPPRESSED');
{
  const sched15 = legacySlotSched('2026-05-18T02:15:20Z'); // already fired this tick
  const slots = matchSlots(sched15, legacyCtx, { mode: 'legacy' });
  assert('slot suppressed (0 results)', slots.length, 0);
}

console.log('\nTC-17: legacy dedup — last_fired BEFORE nominal tick boundary (02:00:00Z, previous tick) → FIRES');
{
  const sched15 = legacySlotSched('2026-05-18T02:00:00Z'); // previous */15 boundary
  const slots = matchSlots(sched15, legacyCtx, { mode: 'legacy' });
  assert('slot fires (1 result)', slots.length, 1);
  assert('slot_id matches', slots.length > 0 ? slots[0].slot_id : 'none', 'test-legacy-dedup');
}

console.log('\nTC-18: legacy dedup — last_fired == null (first run, EC-3 backward-compat) → FIRES');
{
  const sched15 = legacySlotSched(null);
  const slots = matchSlots(sched15, legacyCtx, { mode: 'legacy' });
  assert('slot fires (1 result)', slots.length, 1);
}

console.log('\nTC-19: legacy dedup — malformed last_fired ("not-a-date") → FIRES (conservative)');
{
  const sched15 = legacySlotSched('not-a-date');
  const slots = matchSlots(sched15, legacyCtx, { mode: 'legacy' });
  assert('slot fires (1 result)', slots.length, 1);
}

// ---------------------------------------------------------------------------
// TC-20..TC-23: isSuppressedByBoundaryDedup — direct unit tests
// ---------------------------------------------------------------------------
console.log('\nTC-20: isSuppressedByBoundaryDedup — last_fired AT boundary → true (suppressed)');
{
  const nowUnix = utcDate('2026-05-18T02:15:30Z').getTime() / 1000;
  const result = isSuppressedByBoundaryDedup(nowUnix, '2026-05-18T02:15:00Z', CRON_15);
  assert('at boundary => suppressed', result, true);
}

console.log('\nTC-21: isSuppressedByBoundaryDedup — last_fired BEFORE boundary → false (fires)');
{
  const nowUnix = utcDate('2026-05-18T02:15:30Z').getTime() / 1000;
  const result = isSuppressedByBoundaryDedup(nowUnix, '2026-05-18T02:00:00Z', CRON_15);
  assert('before boundary => not suppressed (fires)', result, false);
}

console.log('\nTC-22: isSuppressedByBoundaryDedup — null last_fired → false (fires, EC-3 first-run)');
{
  const nowUnix = utcDate('2026-05-18T02:15:30Z').getTime() / 1000;
  const result = isSuppressedByBoundaryDedup(nowUnix, null, CRON_15);
  assert('null last_fired => not suppressed (fires)', result, false);
}

console.log('\nTC-23: isSuppressedByBoundaryDedup — malformed last_fired → false (fires, conservative)');
{
  const nowUnix = utcDate('2026-05-18T02:15:30Z').getTime() / 1000;
  const result = isSuppressedByBoundaryDedup(nowUnix, 'garbage', CRON_15);
  assert('malformed last_fired => not suppressed (fires)', result, false);
}

// ---------------------------------------------------------------------------
// TC-24..TC-27: CLI entrypoint contract — catchup_raw field (TASK-COWORK-CATCHUP-2, FR-9a)
// Architecture brief: docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md §2.1
//
// The CLI reads docs/data/cowork-schedule.json off process.cwd() at require-time and cannot
// take a ctx override (only matchSlots(), the exported JS function, does — unchanged, NFR-2).
// So these tests spawn the real CLI against an isolated mkdtemp harness (mirrors
// drain-signals.test.js's makeHarness() convention) with a small controlled schedule fixture,
// rather than touching the live production schedule or depending on its (growing) contents.
// ---------------------------------------------------------------------------
const SRC_SCRIPT = path.join(process.cwd(), 'scripts/agents-flow/cowork-match-slots.js');
const SRC_PREDICATE = path.join(process.cwd(), 'scripts/agents-flow/cowork-catchup-predicate.js');
// UC-CDC-P7 Phase 2a: cowork-match-slots.js now requires cowork-chef-mutex.js unconditionally
// (Step 4.5c CHEF mutex must never silently no-op — that is the exact double-publish class
// FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT hardened against), so the CLI harness must carry it too.
const SRC_CHEF_MUTEX = path.join(process.cwd(), 'scripts/agents-flow/cowork-chef-mutex.js');
// FIX-COWORK-SUPERSEDE-MUTEX-SCRIPT-AND-MATCHSLOTS-WIRING (brief §3c): cowork-match-slots.js's
// finish() now ALSO requires cowork-supersede-mutex.js unconditionally (same invariant as the
// CHEF mutex above — must never silently no-op), so the CLI harness must carry this too.
const SRC_SUPERSEDE_MUTEX = path.join(process.cwd(), 'scripts/agents-flow/cowork-supersede-mutex.js');

function makeCliHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-match-slots-cli-test-'));
  fs.mkdirSync(path.join(dir, 'scripts/agents-flow'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/data'), { recursive: true });
  fs.copyFileSync(SRC_SCRIPT, path.join(dir, 'scripts/agents-flow/cowork-match-slots.js'));
  fs.copyFileSync(SRC_PREDICATE, path.join(dir, 'scripts/agents-flow/cowork-catchup-predicate.js'));
  fs.copyFileSync(SRC_CHEF_MUTEX, path.join(dir, 'scripts/agents-flow/cowork-chef-mutex.js'));
  fs.copyFileSync(SRC_SUPERSEDE_MUTEX, path.join(dir, 'scripts/agents-flow/cowork-supersede-mutex.js'));
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// oneMinuteFutureIso: a last_fired timestamp guaranteed to be AFTER "now" at spawn time, so
// isSuppressedByBoundaryDedup keeps the fixture slot OUT of the live `slots`/hits array even
// though its cron ("* * * * *") always cron-matches — deterministic regardless of wall clock.
function oneHourFutureIso() {
  return new Date(Date.now() + 3600 * 1000).toISOString();
}

console.log('\nTC-24: CLI stdout JSON contract gains a top-level catchup_raw array field');
{
  const h = makeCliHarness();
  const sched = {
    slots: [{
      slot_id: 'cli-test-guaranteed-eligible', cron: '* * * * *', agent: 'test-agent',
      flow_path: 'docs/agents/test/flow/main.md', trigger_prompt: 'run test',
      guaranteed: true, enabled: true, dish_type: 'test_dish_eligible',
      publish_date_basis: 'vn_date', policy_id: null, last_fired: oneHourFutureIso(),
    }],
    _dish_type_catchup_config: {
      _default: { catchup_max_lateness_minutes: 60, fire_timeout_seconds: 1800 },
      test_dish_eligible: { catchup_max_lateness_minutes: 999999, fire_timeout_seconds: 1800 },
    },
  };
  fs.writeFileSync(path.join(h, 'docs/data/cowork-schedule.json'), JSON.stringify(sched));
  const run = spawnSync('node', [path.join(h, 'scripts/agents-flow/cowork-match-slots.js')], { cwd: h, encoding: 'utf8' });
  assert('CLI exits 0', run.status, 0);
  let out;
  try { out = JSON.parse(run.stdout); } catch (e) { out = null; }
  assert('stdout parses as JSON', out !== null, true);
  assert('catchup_raw key is an Array', Array.isArray(out && out.catchup_raw), true);
  assert('slots key still present (NFR-2, unchanged CLI contract)', Array.isArray(out && out.slots), true);
  assert('drift_min key still present (NFR-2, unchanged CLI contract)', typeof (out && out.drift_min), 'number');
  cleanup(h);
}

console.log('\nTC-25: catchup_raw surfaces a real eligible candidate the live cron-match suppressed (positive-path wiring)');
{
  const h = makeCliHarness();
  const sched = {
    slots: [{
      slot_id: 'cli-test-guaranteed-eligible', cron: '* * * * *', agent: 'test-agent',
      flow_path: 'docs/agents/test/flow/main.md', trigger_prompt: 'run test',
      guaranteed: true, enabled: true, dish_type: 'test_dish_eligible',
      publish_date_basis: 'vn_date', policy_id: null, last_fired: oneHourFutureIso(),
    }],
    _dish_type_catchup_config: {
      _default: { catchup_max_lateness_minutes: 60, fire_timeout_seconds: 1800 },
      test_dish_eligible: { catchup_max_lateness_minutes: 999999, fire_timeout_seconds: 1800 },
    },
  };
  fs.writeFileSync(path.join(h, 'docs/data/cowork-schedule.json'), JSON.stringify(sched));
  const run = spawnSync('node', [path.join(h, 'scripts/agents-flow/cowork-match-slots.js')], { cwd: h, encoding: 'utf8' });
  const out = JSON.parse(run.stdout);
  assert('live slots does NOT contain the future-last_fired slot (boundary dedup unaffected)',
    out.slots.some(sl => sl.slot_id === 'cli-test-guaranteed-eligible'), false);
  const entry = out.catchup_raw.find(c => c.slot_id === 'cli-test-guaranteed-eligible');
  assert('catchup_raw contains the eligible candidate', entry !== undefined, true);
  assert('catchup_eligible is true', entry && entry.catchup_eligible, true);
  assert('reason is null when eligible', entry && entry.reason, null);
  assert('expected_publish_task_id is prefixed correctly', /^published:cli-test-guaranteed-eligible:/.test((entry || {}).expected_publish_task_id || ''), true);
  cleanup(h);
}

console.log('\nTC-26: catchup_raw marks a candidate ineligible (freshness_window_exceeded) when its dish_type bound is exceeded');
{
  const h = makeCliHarness();
  const sched = {
    slots: [{
      slot_id: 'cli-test-guaranteed-ineligible', cron: '* * * * *', agent: 'test-agent',
      flow_path: 'docs/agents/test/flow/main.md', trigger_prompt: 'run test',
      guaranteed: true, enabled: true, dish_type: 'test_dish_ineligible',
      publish_date_basis: 'vn_date', policy_id: null, last_fired: oneHourFutureIso(),
    }],
    _dish_type_catchup_config: {
      _default: { catchup_max_lateness_minutes: 60, fire_timeout_seconds: 1800 },
      // Negative bound → elapsedMinutes (always >= 0) is deterministically > bound.
      test_dish_ineligible: { catchup_max_lateness_minutes: -1, fire_timeout_seconds: 1800 },
    },
  };
  fs.writeFileSync(path.join(h, 'docs/data/cowork-schedule.json'), JSON.stringify(sched));
  const run = spawnSync('node', [path.join(h, 'scripts/agents-flow/cowork-match-slots.js')], { cwd: h, encoding: 'utf8' });
  const out = JSON.parse(run.stdout);
  const entry = out.catchup_raw.find(c => c.slot_id === 'cli-test-guaranteed-ineligible');
  assert('catchup_raw contains the ineligible candidate', entry !== undefined, true);
  assert('catchup_eligible is false', entry && entry.catchup_eligible, false);
  assert('reason is freshness_window_exceeded', entry && entry.reason, 'freshness_window_exceeded');
  cleanup(h);
}

console.log('\nTC-27: catchup_raw falls back to [] (not a crash) when cowork-catchup-predicate.js is unavailable');
{
  const h = makeCliHarness();
  fs.rmSync(path.join(h, 'scripts/agents-flow/cowork-catchup-predicate.js'));
  const sched = { slots: [] };
  fs.writeFileSync(path.join(h, 'docs/data/cowork-schedule.json'), JSON.stringify(sched));
  const run = spawnSync('node', [path.join(h, 'scripts/agents-flow/cowork-match-slots.js')], { cwd: h, encoding: 'utf8' });
  assert('CLI still exits 0 with module unavailable', run.status, 0);
  const out = JSON.parse(run.stdout);
  assert('catchup_raw falls back to an empty array (Array type)', Array.isArray(out.catchup_raw), true);
  assert('catchup_raw falls back to an empty array (length 0)', out.catchup_raw.length, 0);
  assert('stderr carries a WARN for the missing module', /cowork-catchup-predicate\.js unavailable/.test(run.stderr), true);
  cleanup(h);
}

// ---------------------------------------------------------------------------
// TC-28..TC-35: UC-CDC-P7 Phase 2a — Step 4.5 freshness-downgrade + Step 4.5c CHEF
// mutex moved in-script (previously LLM-narrated inline in pressure-cadence.md).
// ---------------------------------------------------------------------------

const GATHERER_SCHED_SLOTS = [
  { slot_id: 'news-scout-offhours', parallel_group: 'gatherers', guaranteed: false },
  { slot_id: 'market-watcher-eod', parallel_group: 'gatherers', guaranteed: false },
  { slot_id: 'alert-commander-market', parallel_group: 'alerts', guaranteed: false },
];

console.log('\nTC-28: applyFreshnessDowngrade — all 3 conditions hold, gatherer slot present -> downgraded');
{
  const matches = [{ slot_id: 'news-scout-offhours', due_reason: 'cadence', cadence_minutes: 240 }];
  const pressureState = { last_regime: 'unknown', signal_backlog: 0, calendar_status: 'weekend' };
  const result = applyFreshnessDowngrade(matches, pressureState, GATHERER_SCHED_SLOTS);
  assert('gatherer slot removed from matches', result.matches.length, 0);
  assert('downgraded lists the slot_id', JSON.stringify(result.downgraded), JSON.stringify(['news-scout-offhours']));
}

console.log('\nTC-29: applyFreshnessDowngrade — AND gate: only 2 of 3 conditions hold -> NOT downgraded (AC-P1-5-1)');
{
  const matches = [{ slot_id: 'news-scout-offhours', due_reason: 'cadence', cadence_minutes: 240 }];
  const pressureState = { last_regime: 'bull', signal_backlog: 0, calendar_status: 'weekend' }; // regime known
  const result = applyFreshnessDowngrade(matches, pressureState, GATHERER_SCHED_SLOTS);
  assert('slot survives (regime known)', result.matches.length, 1);
  assert('downgraded stays empty', result.downgraded.length, 0);
}

console.log('\nTC-30: applyFreshnessDowngrade — non-gatherer slot (parallel_group != "gatherers") never touched');
{
  const matches = [{ slot_id: 'alert-commander-market', due_reason: 'cron', cadence_minutes: null }];
  const pressureState = { last_regime: 'unknown', signal_backlog: 0, calendar_status: 'holiday' };
  const result = applyFreshnessDowngrade(matches, pressureState, GATHERER_SCHED_SLOTS);
  assert('non-gatherer slot survives', result.matches.length, 1);
}

console.log('\nTC-31: applyFreshnessDowngrade — pressureState null (legacy) -> pure passthrough, no-op');
{
  const matches = [{ slot_id: 'news-scout-offhours', due_reason: 'cron', cadence_minutes: null }];
  const result = applyFreshnessDowngrade(matches, null, GATHERER_SCHED_SLOTS);
  assert('matches unchanged when pressureState is null', result.matches.length, 1);
  assert('downgraded stays empty', result.downgraded.length, 0);
}

console.log('\nTC-32: matchSlots adaptive — freshness downgrade runs in-pipeline, meta.downgraded populated');
{
  const sched = {
    slots: [{
      slot_id: 'news-scout-offhours', cron: '* * * * *', agent: 'news-scout',
      flow_path: 'docs/agents/news-scout/flow/main.md', trigger_prompt: 'run test',
      guaranteed: false, enabled: true, parallel_group: 'gatherers',
      policy_id: 'gatherer-standard', last_fired: null,
    }]
  };
  const ctx = { actualM: 0, H: 8, DOM: 6, MON: 6, DOW: 6 };
  const pressureState = { last_regime: 'unknown', signal_backlog: 0, calendar_status: 'weekend' };
  const policyObj = { _staleness_threshold_minutes: 20, policies: [{ policy_id: 'gatherer-standard', calendar_status: '*', signal_backlog_tier: '*', volatility_tier: '*', interval_minutes: 240, _cron_fallback: false }] };
  const meta = {};
  const slots = matchSlots(sched, ctx, { mode: 'adaptive', pressureState, policyObj, meta });
  assert('slot suppressed by in-pipeline downgrade (0 results)', slots.length, 0);
  assert('meta.downgraded carries the slot_id', JSON.stringify(meta.downgraded), JSON.stringify(['news-scout-offhours']));
  assert('meta.pressure_mode is adaptive', meta.pressure_mode, 'adaptive');
}

console.log('\nTC-33: matchSlots adaptive — CHEF mutex runs in-pipeline: guaranteed + non-guaranteed same tick -> only guaranteed survives');
{
  const sched = {
    slots: [
      { slot_id: 'chef-morning', cron: '* * * * *', agent: 'unified-agent', flow_path: 'docs/agents/unified-agent/flow/chef.md', trigger_prompt: 'run test', guaranteed: true, enabled: true, parallel_group: 'chef', policy_id: null, last_fired: null },
      { slot_id: 'chef-intraday', cron: '* * * * *', agent: 'unified-agent', flow_path: 'docs/agents/unified-agent/flow/chef.md', trigger_prompt: 'run test', guaranteed: false, enabled: true, parallel_group: 'chef', policy_id: null, last_fired: null },
    ]
  };
  const ctx = { actualM: 0, H: 8, DOM: 6, MON: 6, DOW: 6 };
  const pressureState = { last_regime: 'bull', signal_backlog: 5, calendar_status: 'open' };
  const policyObj = { _staleness_threshold_minutes: 20, policies: [] };
  const meta = {};
  const slots = matchSlots(sched, ctx, { mode: 'adaptive', pressureState, policyObj, meta });
  assert('exactly one CHEF slot survives', slots.length, 1);
  assert('the guaranteed slot is the survivor', slots[0].slot_id, 'chef-morning');
  assert('meta.chef_mutex_applied is true', meta.chef_mutex_applied, true);
}

console.log('\nTC-34: matchSlots legacy — CHEF mutex applies UNCONDITIONALLY in legacy mode too (invariant: both modes)');
{
  const sched = {
    slots: [
      { slot_id: 'chef-morning', cron: '* * * * *', agent: 'unified-agent', flow_path: 'docs/agents/unified-agent/flow/chef.md', trigger_prompt: 'run test', guaranteed: true, enabled: true, parallel_group: 'chef', policy_id: null, last_fired: null },
      { slot_id: 'chef-intraday', cron: '* * * * *', agent: 'unified-agent', flow_path: 'docs/agents/unified-agent/flow/chef.md', trigger_prompt: 'run test', guaranteed: false, enabled: true, parallel_group: 'chef', policy_id: 'chef-intraday', last_fired: null },
    ]
  };
  const ctx = { actualM: 0, H: 8, DOM: 6, MON: 6, DOW: 6 };
  const meta = {};
  const slots = matchSlots(sched, ctx, { mode: 'legacy', meta });
  assert('legacy mode: exactly one CHEF slot survives', slots.length, 1);
  assert('legacy mode: the guaranteed slot is the survivor', slots[0].slot_id, 'chef-morning');
  assert('legacy mode: meta.chef_mutex_applied is true', meta.chef_mutex_applied, true);
  assert('legacy mode: meta.pressure_mode is legacy', meta.pressure_mode, 'legacy');
}

console.log('\nTC-35: matchSlots adaptive — meta.suppressed_cadence captures a not-yet-due slot (Step 4.4)');
{
  const sched = {
    slots: [{
      slot_id: 'test-not-due', cron: '* * * * *', agent: 'test-agent',
      flow_path: 'docs/agents/test/flow/main.md', trigger_prompt: 'run test',
      guaranteed: false, enabled: true, parallel_group: 'gatherers',
      policy_id: 'gatherer-standard', last_fired: '2026-06-06T07:59:00Z',
    }]
  };
  const ctx = { actualM: 0, H: 8, DOM: 6, MON: 6, DOW: 6, nowUnix: new Date('2026-06-06T08:00:05Z').getTime() / 1000 };
  const pressureState = { last_regime: 'bull', signal_backlog: 5, calendar_status: 'open' };
  const policyObj = { _staleness_threshold_minutes: 20, policies: [{ policy_id: 'gatherer-standard', calendar_status: '*', signal_backlog_tier: '*', volatility_tier: '*', interval_minutes: 240, _cron_fallback: false }] };
  const meta = {};
  const slots = matchSlots(sched, ctx, { mode: 'adaptive', pressureState, policyObj, meta });
  assert('slot not yet due -> excluded from results', slots.length, 0);
  assert('meta.suppressed_cadence carries the slot_id', JSON.stringify(meta.suppressed_cadence), JSON.stringify(['test-not-due']));
}

console.log('\nTC-36: CLI stdout JSON contract gains pressure_mode/downgraded/suppressed_cadence/chef_mutex_applied/due_reasons/cadence_minutes fields');
{
  const h = makeCliHarness();
  const sched = {
    slots: [{
      slot_id: 'cli-test-legacy', cron: '* * * * *', agent: 'test-agent',
      flow_path: 'docs/agents/test/flow/main.md', trigger_prompt: 'run test',
      guaranteed: false, enabled: true, policy_id: null, last_fired: null,
    }]
  };
  fs.writeFileSync(path.join(h, 'docs/data/cowork-schedule.json'), JSON.stringify(sched));
  const run = spawnSync('node', [path.join(h, 'scripts/agents-flow/cowork-match-slots.js')], { cwd: h, encoding: 'utf8' });
  assert('CLI exits 0', run.status, 0);
  const out = JSON.parse(run.stdout);
  assert('pressure_mode key present', typeof out.pressure_mode, 'string');
  assert('downgraded key is an Array', Array.isArray(out.downgraded), true);
  assert('suppressed_cadence key is an Array', Array.isArray(out.suppressed_cadence), true);
  assert('chef_mutex_applied key is a boolean', typeof out.chef_mutex_applied, 'boolean');
  assert('due_reasons key is an object', typeof out.due_reasons, 'object');
  assert('cadence_minutes key is an object', typeof out.cadence_minutes, 'object');
  cleanup(h);
}

// ---------------------------------------------------------------------------
// TC-28..TC-34: window-anchor field on live MATCHES
// FIX-CHEF-MARKER-KEY-ANCHOR-1 (P0), parent FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR.
// Architecture brief: docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-
// and-release.md §2 Component A, bullet 1.
//
// ROOT CAUSE UNDER TEST: every guaranteed-slot flow derives its published-marker dedup key
// from a `date` call the EXECUTING AGENT makes at whatever instant it happens to run. Two
// peers executing the SAME scheduled window therefore derive DIFFERENT keys, and one late
// retry re-targets an entirely different day. Confirmed live twice: 2026-07-22 chef-evening
// double-published on keys :2026-07-22 and :2026-07-23 derived from one instant; 2026-08-05
// chef-evening was retried after a 10h42m host sleep and keyed :2026-08-06, permanently
// missing the 08-05 dish and mislabelling a degraded one. `catchup_raw` entries already carry
// the correct anchor (`scheduled_utc_time`), live `slots[]` entries did not — so the live
// path and the catch-up path could never agree on a key. This exposes the SAME field, from
// the SAME derivation, on the live path.
// ---------------------------------------------------------------------------
const { annotateScheduledUtc, field: mField, dowMatch: mDowMatch } =
  require(path.join(process.cwd(), 'scripts/agents-flow/cowork-match-slots.js'));
const { mostRecentCronFireBefore } =
  require(path.join(process.cwd(), 'scripts/agents-flow/cowork-catchup-predicate.js'));

console.log('\nTC-28: annotateScheduledUtc is exported as a pure, injectable helper');
{
  assert('annotateScheduledUtc exported', typeof annotateScheduledUtc, 'function');
}

console.log('\nTC-29: the nominal fire instant is the CRON window, not the run instant');
{
  // The real 2026-08-05 chef-evening incident: cron 45 19 * * *, run started 19:55:41Z.
  const runInstant = Date.parse('2026-08-05T19:55:41Z') / 1000;
  const out = annotateScheduledUtc(
    [{ slot_id: 'chef-evening', cron: '45 19 * * *', agent: 'unified-agent' }], runInstant, {});
  assert('scheduled_utc_time is the 19:45Z window, not the 19:55Z run instant',
    out[0].scheduled_utc_time, '2026-08-05T19:45:00.000Z');
  assert('pre-existing fields survive untouched', out[0].slot_id, 'chef-evening');
  assert('pre-existing fields survive untouched (agent)', out[0].agent, 'unified-agent');
}

console.log('\nTC-30: KEY AGREEMENT — two peers in the SAME window derive the SAME anchor');
{
  // The exact 2026-07-22 double-publish pair: 19:55:41Z and 20:01:30Z straddle VN midnight
  // and produced keys :2026-07-22 vs :2026-07-23 from a wall-clock read. Anchored on the
  // window they must be byte-identical.
  const slot = [{ slot_id: 'chef-evening', cron: '45 19 * * *' }];
  const peerA = annotateScheduledUtc(slot, Date.parse('2026-07-22T19:55:41Z') / 1000, {});
  const peerB = annotateScheduledUtc(slot, Date.parse('2026-07-22T20:01:30Z') / 1000, {});
  assert('two peers, one window, byte-identical anchor',
    peerA[0].scheduled_utc_time === peerB[0].scheduled_utc_time, true);
  assert('and the anchor is the scheduled window itself',
    peerA[0].scheduled_utc_time, '2026-07-22T19:45:00.000Z');

  // A retry arriving 10h42m late after host sleep (the 2026-08-06T06:34Z MAGICWAKE) must
  // still anchor on the MISSED window, never on the day it woke up.
  const lateRetry = annotateScheduledUtc(
    [{ slot_id: 'chef-evening', cron: '45 19 * * *' }],
    Date.parse('2026-08-06T06:37:39Z') / 1000, {});
  assert('a post-sleep retry anchors on the missed window, not the wake day',
    lateRetry[0].scheduled_utc_time, '2026-08-05T19:45:00.000Z');
}

console.log('\nTC-31: live path and catch-up path share ONE derivation, not two copies');
{
  const nowUnix = Date.parse('2026-08-05T19:55:41Z') / 1000;
  const cron = '45 19 * * *';
  const viaMatcher = annotateScheduledUtc([{ slot_id: 'chef-evening', cron }], nowUnix, {})[0].scheduled_utc_time;
  const viaPredicate = new Date(
    mostRecentCronFireBefore(cron, nowUnix, { field: mField, dowMatch: mDowMatch }) * 1000).toISOString();
  assert('matcher anchor === cowork-catchup-predicate.mostRecentCronFireBefore anchor',
    viaMatcher, viaPredicate);
}

console.log('\nTC-32: unresolvable / malformed cron degrades to null, never throws');
{
  let threw = false;
  let out = [];
  try {
    out = annotateScheduledUtc([
      { slot_id: 'malformed', cron: 'not a cron' },
      { slot_id: 'missing-cron' },
      { slot_id: 'ok', cron: '45 19 * * *' }
    ], Date.parse('2026-08-05T19:55:41Z') / 1000, {});
  } catch (e) { threw = true; }
  assert('no throw on malformed input', threw, false);
  assert('malformed cron -> null anchor', out[0].scheduled_utc_time, null);
  assert('absent cron -> null anchor', out[1].scheduled_utc_time, null);
  assert('a good sibling in the same batch is still anchored', out[2].scheduled_utc_time, '2026-08-05T19:45:00.000Z');
}

console.log('\nTC-33: CLI stdout contract — every live slots[] entry carries the anchor');
{
  const h = makeCliHarness();
  const sched = {
    slots: [{
      slot_id: 'cli-test-anchor-live', cron: '* * * * *', agent: 'test-agent',
      flow_path: 'docs/agents/test/flow/main.md', trigger_prompt: 'run test  slot=cli-test-anchor-live',
      guaranteed: true, enabled: true, last_fired: null
    }]
  };
  fs.writeFileSync(path.join(h, 'docs/data/cowork-schedule.json'), JSON.stringify(sched));
  const run = spawnSync('node', [path.join(h, 'scripts/agents-flow/cowork-match-slots.js')], { cwd: h, encoding: 'utf8' });
  assert('CLI exits 0', run.status, 0);
  const out = JSON.parse(run.stdout);
  assert('the fixture slot is live-matched', out.slots.length >= 1, true);
  assert('slots[0] carries scheduled_utc_time', typeof out.slots[0].scheduled_utc_time, 'string');
  assert('anchor is ISO8601 Zulu',
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(out.slots[0].scheduled_utc_time), true);
  assert('pre-existing per-slot fields still present (NFR-2 superset)', out.slots[0].slot_id, 'cli-test-anchor-live');
  assert('trigger_prompt still present', typeof out.slots[0].trigger_prompt, 'string');
  cleanup(h);
}

console.log('\nTC-34: CLI degrades gracefully when the predicate module is unavailable');
{
  const h = makeCliHarness();
  fs.rmSync(path.join(h, 'scripts/agents-flow/cowork-catchup-predicate.js'), { force: true });
  const sched = {
    slots: [{
      slot_id: 'cli-test-anchor-nopredicate', cron: '* * * * *', agent: 'test-agent',
      flow_path: 'docs/agents/test/flow/main.md', trigger_prompt: 'run test',
      guaranteed: true, enabled: true, last_fired: null
    }]
  };
  fs.writeFileSync(path.join(h, 'docs/data/cowork-schedule.json'), JSON.stringify(sched));
  const run = spawnSync('node', [path.join(h, 'scripts/agents-flow/cowork-match-slots.js')], { cwd: h, encoding: 'utf8' });
  assert('CLI still exits 0 with the predicate module missing', run.status, 0);
  const out = JSON.parse(run.stdout);
  assert('slots[] still emitted', Array.isArray(out.slots), true);
  assert('anchor degrades to null rather than crashing the tick',
    out.slots.length > 0 ? out.slots[0].scheduled_utc_time : null, null);
  cleanup(h);
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
