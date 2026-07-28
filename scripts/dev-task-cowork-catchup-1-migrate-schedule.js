#!/usr/bin/env node
// dev-task-cowork-catchup-1-migrate-schedule.js — ONE-TIME additive migration for
// TASK-COWORK-CATCHUP-1 (sprint COWORK-GUARANTEED-SLOT-CATCHUP, FR-1/FR-2).
//
// Architecture brief: docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md §2.2
//
// Adds, purely additively, to docs/data/cowork-schedule.json:
//   1. New top-level `_dish_type_catchup_config` object (per-dish-type catch-up freshness
//      bound + firer timeout).
//   2. `publish_date_basis` field on each of the 8 guaranteed:true slots (re-grep-verified
//      against live flow gate code at TASK-COWORK-CATCHUP-1 implementation time — chef.md:88-92,
//      fb-market-poster/flow/main.md:88-92 + weekly-recap.md:39-40, digest-predict/flow/main.md:
//      20-40,93-98, tran-ngoc-bau/flow/main.md:34-39).
//
// Does NOT touch last_fired, trigger_id, or any other existing field/value. Preserves key
// insertion order of every untouched key (JS object property order = insertion order for
// string keys) — new keys are appended, nothing reordered or reformatted. Atomic tmp+rename,
// mirroring cowork-write-last-fired.js's convention for this same hot file (two prior
// production corruptions came from hand-rolled jq/shell edits of this exact file — see that
// script's header comment).
//
// Usage: node scripts/dev-task-cowork-catchup-1-migrate-schedule.js
// One-time script — idempotent (skips fields that already exist), safe to re-run.

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCHED_FILE = path.join(ROOT, 'docs', 'data', 'cowork-schedule.json');
const TMP_FILE = SCHED_FILE + '.tmp';

const DISH_TYPE_CATCHUP_CONFIG = {
  _default: { catchup_max_lateness_minutes: 60, fire_timeout_seconds: 1800 },
  morning_dish: { catchup_max_lateness_minutes: 180, fire_timeout_seconds: 3000 },
  eod_dish: { catchup_max_lateness_minutes: 180, fire_timeout_seconds: 3000 },
  evening_preview: { catchup_max_lateness_minutes: 360, fire_timeout_seconds: 3000 },
  daily_predict: { catchup_max_lateness_minutes: 360, fire_timeout_seconds: 1800 },
  daily_audit: { catchup_max_lateness_minutes: 360, fire_timeout_seconds: 1800 },
  weekly_digest: { catchup_max_lateness_minutes: 1440, fire_timeout_seconds: 1800 },
  fb_daily_post: { catchup_max_lateness_minutes: 120, fire_timeout_seconds: 2400 },
  fb_weekly_post: { catchup_max_lateness_minutes: 120, fire_timeout_seconds: 2400 },
};

// slot_id -> publish_date_basis (only the 8 guaranteed:true slots; catch-up does not apply
// to non-guaranteed slots, so they are left untouched).
const PUBLISH_DATE_BASIS = {
  'chef-morning': 'vn_date',
  'chef-eod': 'vn_date',
  'chef-evening': 'vn_date',
  'fb-daily': 'vn_date',
  'fb-weekend': 'vn_date_saturday_anchor',
  'digest-sunday': 'iso_week_period',
  'tnb-audit': 'iso_week_period',
  'digest-daily': 'utc_date',
};

let schedule;
try {
  schedule = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
} catch (e) {
  console.error('[migrate] schedule read/parse failed:', e.message);
  process.exit(1);
}

if (!schedule || !Array.isArray(schedule.slots)) {
  console.error('[migrate] schedule has no .slots array — refusing to write');
  process.exit(1);
}

// 1. Add _dish_type_catchup_config (top-level, additive) — idempotent.
let configAdded = false;
if (schedule._dish_type_catchup_config === undefined) {
  schedule._dish_type_catchup_config = DISH_TYPE_CATCHUP_CONFIG;
  configAdded = true;
} else {
  console.error('[migrate] _dish_type_catchup_config already present — leaving unchanged');
}

// 2. Add publish_date_basis per guaranteed slot (additive) — idempotent, fail loud on typo.
const knownSlotIds = new Set(schedule.slots.map((s) => s.slot_id));
const missing = Object.keys(PUBLISH_DATE_BASIS).filter((id) => !knownSlotIds.has(id));
if (missing.length > 0) {
  console.error('[migrate] unknown slot_id(s) in PUBLISH_DATE_BASIS map, not present in schedule:', missing.join(', '));
  process.exit(1);
}

let touched = 0;
for (const slot of schedule.slots) {
  const basis = PUBLISH_DATE_BASIS[slot.slot_id];
  if (basis === undefined) continue;
  if (slot.publish_date_basis !== undefined) continue; // idempotent — already migrated
  slot.publish_date_basis = basis;
  touched++;
}

try {
  const serialized = JSON.stringify(schedule, null, 2) + '\n';
  JSON.parse(serialized); // parse-back guard: never rename a document we cannot re-read
  fs.writeFileSync(TMP_FILE, serialized);
  fs.renameSync(TMP_FILE, SCHED_FILE);
} catch (e) {
  try {
    fs.unlinkSync(TMP_FILE);
  } catch (_) {
    /* best effort */
  }
  console.error('[migrate] atomic write failed:', e.message);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, dish_type_config_added: configAdded, slots_touched: touched }));
