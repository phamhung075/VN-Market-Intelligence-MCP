#!/usr/bin/env node
// Test harness for cowork-catchup-predicate.js — AC-1/AC-2/AC-3 scenarios (TASK-COWORK-CATCHUP-1)
// Mirrors scripts/agents-flow/cowork-match-slots.test.js conventions (plain-assert, no framework).
//
// Architecture brief: docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md §8
//
// Run: node scripts/agents-flow/cowork-catchup-predicate.test.js
// Exit 0 = all pass, Exit 1 = any fail.

'use strict';

const path = require('path');

// field()/dowMatch() reused verbatim from cowork-match-slots.js (design brief §2.1 — "reuses
// the SAME field()/dowMatch() already exported by cowork-match-slots.js, no reimplementation").
const { field, dowMatch } = require(path.join(process.cwd(), 'scripts/agents-flow/cowork-match-slots.js'));

const {
  computeCatchupCandidates,
  mostRecentCronFireBefore,
  toVnDateString,
} = require(path.join(process.cwd(), 'scripts/agents-flow/cowork-catchup-predicate.js'));

const DEPS = { field, dowMatch };

function utcUnix(isoStr) {
  return new Date(isoStr).getTime() / 1000;
}

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

// ---------------------------------------------------------------------------
// Fixture: a minimal schedule carrying the real _dish_type_catchup_config values
// (docs/data/cowork-schedule.json, per architect brief §2.2) plus 2 guaranteed slots
// (chef-eod, fb-daily) shaped exactly like the live schedule.
// ---------------------------------------------------------------------------
const DISH_TYPE_CATCHUP_CONFIG = {
  _default:        { catchup_max_lateness_minutes: 60, fire_timeout_seconds: 1800 },
  eod_dish:        { catchup_max_lateness_minutes: 180, fire_timeout_seconds: 3000 },
  fb_daily_post:   { catchup_max_lateness_minutes: 120, fire_timeout_seconds: 2400 },
};

function baseSchedule() {
  return {
    _dish_type_catchup_config: DISH_TYPE_CATCHUP_CONFIG,
    slots: [
      {
        slot_id: 'chef-eod',
        cron: '45 8 * * 1-5',
        agent: 'unified-agent',
        flow_path: 'docs/agents/unified-agent/flow/chef.md',
        trigger_prompt: 'run docs/agents/unified-agent/flow/chef.md  slot=chef-eod',
        dish_type: 'eod_dish',
        guaranteed: true,
        enabled: true,
        publish_date_basis: 'vn_date',
        last_fired: '2026-05-15T08:51:00Z',
      },
      {
        slot_id: 'fb-daily',
        cron: '15 9 * * 1-5',
        agent: 'fb-market-poster',
        flow_path: 'docs/agents/fb-market-poster/flow/main.md',
        trigger_prompt: 'run docs/agents/fb-market-poster/flow/main.md  slot=fb-daily',
        dish_type: 'fb_daily_post',
        guaranteed: true,
        enabled: true,
        publish_date_basis: 'vn_date',
        last_fired: '2026-05-15T09:21:00Z',
      },
    ],
  };
}

// Monday 2026-05-18 (same Monday used by cowork-match-slots.test.js).

// ---------------------------------------------------------------------------
// AC-1: due=true for a 07-22-shaped scenario — chef-eod missed its window, now is
// within the eod_dish freshness bound (180min), same VN-date (no rollover).
// ---------------------------------------------------------------------------
console.log('\nTC-1 (AC-1): chef-eod missed 08:45Z Monday, now 09:30Z same day (45min elapsed, <=180min bound) → catchup_eligible=true');
{
  const sched = baseSchedule();
  const nowUnix = utcUnix('2026-05-18T09:30:00Z');
  const out = computeCatchupCandidates(sched, nowUnix, null, DEPS);
  const rec = out.find(r => r.slot_id === 'chef-eod');
  assert('chef-eod present', !!rec, true);
  assert('chef-eod catchup_eligible', rec && rec.catchup_eligible, true);
  assert('chef-eod reason', rec && rec.reason, null);
  assert('chef-eod scheduled_utc_time', rec && rec.scheduled_utc_time, '2026-05-18T08:45:00.000Z');
  assert('chef-eod scheduled_key_part', rec && rec.scheduled_key_part, '2026-05-18');
  assert('chef-eod expected_publish_task_id', rec && rec.expected_publish_task_id, 'published:chef-eod:2026-05-18');
}

// ---------------------------------------------------------------------------
// AC-1 (second slot): fb-daily missed 09:15Z Monday, now 10:30Z same day (75min
// elapsed, <=120min bound), same VN-date → catchup_eligible=true.
// ---------------------------------------------------------------------------
console.log('\nTC-2 (AC-1): fb-daily missed 09:15Z Monday, now 10:30Z same day (75min elapsed, <=120min bound) → catchup_eligible=true');
{
  const sched = baseSchedule();
  const nowUnix = utcUnix('2026-05-18T10:30:00Z');
  const out = computeCatchupCandidates(sched, nowUnix, null, DEPS);
  const rec = out.find(r => r.slot_id === 'fb-daily');
  assert('fb-daily present', !!rec, true);
  assert('fb-daily catchup_eligible', rec && rec.catchup_eligible, true);
  assert('fb-daily reason', rec && rec.reason, null);
}

// ---------------------------------------------------------------------------
// AC-2: due=false + reason="rolled_past_vn_date" once VN-date has rolled past the
// missed slot's own scheduled date — even though this would ALSO exceed the
// freshness bound, the rollover check must win (checked first, per design §2.1 step 4).
// chef-eod missed Monday 08:45Z; "now" is Tuesday 08:00Z (before Tuesday's own 08:45Z
// fire, so the most recent SCHEDULED fire is still Monday's) — VN-date has rolled
// from Monday to Tuesday.
// ---------------------------------------------------------------------------
console.log('\nTC-3 (AC-2): chef-eod missed Monday 08:45Z, now is Tuesday 08:00Z (VN-date rolled) → catchup_eligible=false, reason=rolled_past_vn_date');
{
  const sched = baseSchedule();
  const nowUnix = utcUnix('2026-05-19T08:00:00Z'); // Tuesday, before Tuesday's own 08:45Z fire
  const out = computeCatchupCandidates(sched, nowUnix, null, DEPS);
  const rec = out.find(r => r.slot_id === 'chef-eod');
  assert('chef-eod present', !!rec, true);
  assert('chef-eod catchup_eligible', rec && rec.catchup_eligible, false);
  assert('chef-eod reason', rec && rec.reason, 'rolled_past_vn_date');
  assert('chef-eod scheduled_key_part (still Monday)', rec && rec.scheduled_key_part, '2026-05-18');
}

// ---------------------------------------------------------------------------
// AC-3: per-dish-type freshness bound rejects catch-up once elapsed-since-scheduled
// exceeds max-lateness, SAME VN-date (no rollover — VN date only rolls at 17:00 UTC
// for a UTC+7, no-DST zone, so 12:05Z same Monday is still VN-date 2026-05-18).
// eod_dish bound = 180min; elapsed = 200min > 180min.
// ---------------------------------------------------------------------------
console.log('\nTC-4 (AC-3): chef-eod missed 08:45Z Monday, now 12:05Z same day (200min elapsed, >180min bound, same VN-date) → catchup_eligible=false, reason=freshness_window_exceeded');
{
  const sched = baseSchedule();
  const nowUnix = utcUnix('2026-05-18T12:05:00Z');
  const out = computeCatchupCandidates(sched, nowUnix, null, DEPS);
  const rec = out.find(r => r.slot_id === 'chef-eod');
  assert('chef-eod present', !!rec, true);
  assert('chef-eod catchup_eligible', rec && rec.catchup_eligible, false);
  assert('chef-eod reason', rec && rec.reason, 'freshness_window_exceeded');
  assert('chef-eod scheduled_key_part (same VN-date, no rollover)', rec && rec.scheduled_key_part, '2026-05-18');
}

// ---------------------------------------------------------------------------
// TC-5: _default fallback — dish_type absent from _dish_type_catchup_config uses
// _default's bound (60min), not an unbounded/undefined lateness.
// ---------------------------------------------------------------------------
console.log('\nTC-5: unknown dish_type falls back to _default.catchup_max_lateness_minutes (60min)');
{
  const sched = baseSchedule();
  sched.slots.push({
    slot_id: 'test-unknown-dish',
    cron: '0 10 * * 1-5',
    agent: 'test-agent',
    flow_path: 'docs/agents/test/flow/main.md',
    trigger_prompt: 'run test',
    dish_type: 'not_in_config',
    guaranteed: true,
    enabled: true,
    publish_date_basis: 'vn_date',
    last_fired: null,
  });
  // 10:00Z + 70min = 11:10Z → 70min > 60min _default bound → not eligible
  const nowUnix = utcUnix('2026-05-18T11:10:00Z');
  const out = computeCatchupCandidates(sched, nowUnix, null, DEPS);
  const rec = out.find(r => r.slot_id === 'test-unknown-dish');
  assert('test-unknown-dish catchup_eligible (over _default bound)', rec && rec.catchup_eligible, false);
  assert('test-unknown-dish reason', rec && rec.reason, 'freshness_window_exceeded');
}

// ---------------------------------------------------------------------------
// TC-6: excludeSlotIds ctx hook — a slot already live-matched this tick is skipped
// entirely (never emitted as its own catch-up candidate).
// ---------------------------------------------------------------------------
console.log('\nTC-6: ctx.excludeSlotIds skips an already-live-matched slot (selective, not blanket)');
{
  const sched = baseSchedule();
  const nowUnix = utcUnix('2026-05-18T09:30:00Z');
  const out = computeCatchupCandidates(sched, nowUnix, { excludeSlotIds: ['chef-eod'] }, DEPS);
  assert('chef-eod excluded', out.some(r => r.slot_id === 'chef-eod'), false);
  assert('fb-daily NOT excluded (only chef-eod was named)', out.some(r => r.slot_id === 'fb-daily'), true);
}

// ---------------------------------------------------------------------------
// TC-7: guaranteed=false / enabled=false / _disabled_by slots are never candidates.
// ---------------------------------------------------------------------------
console.log('\nTC-7: non-guaranteed / disabled slots are excluded from candidates');
{
  const sched = baseSchedule();
  sched.slots.push(
    { slot_id: 'not-guaranteed', cron: '0 10 * * 1-5', guaranteed: false, enabled: true, dish_type: 'eod_dish', publish_date_basis: 'vn_date' },
    { slot_id: 'not-enabled', cron: '0 10 * * 1-5', guaranteed: true, enabled: false, dish_type: 'eod_dish', publish_date_basis: 'vn_date' },
    { slot_id: 'disabled-by', cron: '0 10 * * 1-5', guaranteed: true, enabled: true, _disabled_by: 'some-flag', dish_type: 'eod_dish', publish_date_basis: 'vn_date' },
  );
  const nowUnix = utcUnix('2026-05-18T10:05:00Z');
  const out = computeCatchupCandidates(sched, nowUnix, null, DEPS);
  assert('not-guaranteed excluded', out.some(r => r.slot_id === 'not-guaranteed'), false);
  assert('not-enabled excluded', out.some(r => r.slot_id === 'not-enabled'), false);
  assert('disabled-by excluded', out.some(r => r.slot_id === 'disabled-by'), false);
}

// ---------------------------------------------------------------------------
// TC-8..TC-11: mostRecentCronFireBefore — direct unit tests.
// ---------------------------------------------------------------------------
console.log('\nTC-8: mostRecentCronFireBefore("45 8 * * 1-5", Monday 09:30Z) → Monday 08:45Z');
{
  const nowUnix = utcUnix('2026-05-18T09:30:00Z');
  const result = mostRecentCronFireBefore('45 8 * * 1-5', nowUnix, DEPS);
  assert('found Monday 08:45Z', result, utcUnix('2026-05-18T08:45:00Z'));
}

console.log('\nTC-9: mostRecentCronFireBefore weekday-only cron skips weekend — Monday result found from Tuesday 00:00Z lookback');
{
  const nowUnix = utcUnix('2026-05-19T00:00:00Z'); // Tuesday midnight, before Tuesday 08:45Z
  const result = mostRecentCronFireBefore('45 8 * * 1-5', nowUnix, DEPS);
  assert('found Monday 08:45Z (Sun/Sat skipped)', result, utcUnix('2026-05-18T08:45:00Z'));
}

console.log('\nTC-10: mostRecentCronFireBefore malformed cron (wrong field count) → null');
{
  const result = mostRecentCronFireBefore('45 8 * *', utcUnix('2026-05-18T09:30:00Z'), DEPS);
  assert('malformed cron → null', result, null);
}

console.log('\nTC-11: mostRecentCronFireBefore — exact-now match is included (at-or-before)');
{
  const nowUnix = utcUnix('2026-05-18T08:45:00Z');
  const result = mostRecentCronFireBefore('45 8 * * 1-5', nowUnix, DEPS);
  assert('now itself counts as most recent fire', result, nowUnix);
}

// ---------------------------------------------------------------------------
// TC-12: toVnDateString — direct unit test (VN = UTC+7, no DST).
// ---------------------------------------------------------------------------
console.log('\nTC-12: toVnDateString(2026-05-18T20:00:00Z) → 2026-05-19 (crossed VN midnight, 20:00Z+7h=03:00 next day)');
{
  const result = toVnDateString(utcUnix('2026-05-18T20:00:00Z'));
  assert('VN date rolled to next day', result, '2026-05-19');
}

console.log('\nTC-13: toVnDateString(2026-05-18T09:00:00Z) → 2026-05-18 (well before VN midnight cutover at 17:00Z)');
{
  const result = toVnDateString(utcUnix('2026-05-18T09:00:00Z'));
  assert('VN date same day', result, '2026-05-18');
}

// ---------------------------------------------------------------------------
// TC-14: iso_week_period basis — digest-sunday/tnb-audit key format, mirrors
// apps/mcp-server/src/domain/services/isoWeek.ts's getISOWeekPeriod().periodKey exactly.
// ---------------------------------------------------------------------------
console.log('\nTC-14: iso_week_period basis — Sunday 2026-06-14 belongs to periodKey 2026-06-08/2026-06-14 (not the following week)');
{
  const sched = {
    _dish_type_catchup_config: { _default: { catchup_max_lateness_minutes: 1440, fire_timeout_seconds: 1800 } },
    slots: [{
      slot_id: 'digest-sunday',
      cron: '47 13 * * 0',
      agent: 'digest-predict',
      flow_path: 'docs/agents/digest-predict/flow/main.md',
      trigger_prompt: 'run test',
      dish_type: 'weekly_digest',
      guaranteed: true,
      enabled: true,
      publish_date_basis: 'iso_week_period',
      last_fired: null,
    }],
  };
  // now = Sunday 2026-06-14T14:00:00Z, 13min after the 13:47Z scheduled fire, same period.
  const nowUnix = utcUnix('2026-06-14T14:00:00Z');
  const out = computeCatchupCandidates(sched, nowUnix, null, DEPS);
  const rec = out.find(r => r.slot_id === 'digest-sunday');
  assert('digest-sunday scheduled_key_part is periodKey range', rec && rec.scheduled_key_part, '2026-06-08/2026-06-14');
  assert('digest-sunday catchup_eligible', rec && rec.catchup_eligible, true);
}

// ---------------------------------------------------------------------------
// TC-15: utc_date basis — digest-daily mirrors its existing UTC_DATE key (NOT VN-date;
// deliberate, per architect brief §1/§9 — not "corrected" in this sprint).
// ---------------------------------------------------------------------------
console.log('\nTC-15: utc_date basis — digest-daily key uses UTC calendar date, not VN calendar date');
{
  const sched = {
    _dish_type_catchup_config: { _default: { catchup_max_lateness_minutes: 360, fire_timeout_seconds: 1800 } },
    slots: [{
      slot_id: 'digest-daily',
      cron: '30 17 * * *',
      agent: 'digest-predict',
      flow_path: 'docs/agents/digest-predict/flow/daily-predict.md',
      trigger_prompt: 'run test',
      dish_type: 'daily_predict',
      guaranteed: true,
      enabled: true,
      publish_date_basis: 'utc_date',
      last_fired: null,
    }],
  };
  // 17:30Z scheduled fire on 2026-05-18; VN-date at that instant is already 2026-05-19
  // (17:30Z+7h=00:30 next day) — proving the basis genuinely uses UTC, not VN, calendar date.
  const nowUnix = utcUnix('2026-05-18T18:00:00Z');
  const out = computeCatchupCandidates(sched, nowUnix, null, DEPS);
  const rec = out.find(r => r.slot_id === 'digest-daily');
  assert('digest-daily scheduled_key_part is UTC date (not VN date)', rec && rec.scheduled_key_part, '2026-05-18');
}

// ---------------------------------------------------------------------------
// TC-16: vn_date_saturday_anchor basis — fb-weekend fired on Sunday still keys on
// Saturday's VN date (docs/agents/fb-market-poster/flow/weekly-recap.md:39-40).
// ---------------------------------------------------------------------------
console.log('\nTC-16: vn_date_saturday_anchor basis — Sunday fire keys on the preceding Saturday VN-date');
{
  const sched = {
    _dish_type_catchup_config: { _default: { catchup_max_lateness_minutes: 120, fire_timeout_seconds: 2400 } },
    slots: [{
      slot_id: 'fb-weekend',
      cron: '13 13 * * 6,0',
      agent: 'fb-market-poster',
      flow_path: 'docs/agents/fb-market-poster/flow/main.md',
      trigger_prompt: 'run test',
      dish_type: 'fb_weekly_post',
      guaranteed: true,
      enabled: true,
      publish_date_basis: 'vn_date_saturday_anchor',
      last_fired: null,
    }],
  };
  // Sunday 2026-05-17T13:13:00Z is the scheduled fire (13:13Z Sun = 20:13 VN Sun, VN_DOW=0)
  // → PERIOD_SAT must be Saturday 2026-05-16, not Sunday 2026-05-17.
  const nowUnix = utcUnix('2026-05-17T13:20:00Z');
  const out = computeCatchupCandidates(sched, nowUnix, null, DEPS);
  const rec = out.find(r => r.slot_id === 'fb-weekend');
  assert('fb-weekend scheduled_key_part anchors to Saturday', rec && rec.scheduled_key_part, '2026-05-16');
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
