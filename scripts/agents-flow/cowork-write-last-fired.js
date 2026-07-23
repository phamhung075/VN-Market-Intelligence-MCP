#!/usr/bin/env node
// cowork-write-last-fired.js — Step 5b batched last_fired write (DWF-PHASE1 FR-P1-7).
// Owning flow doc: docs/agents/cowork-team/flow/last-fired.md
//
// WHY THIS EXISTS AS A SCRIPT, not an inline shell block:
//   Two confirmed production corruptions came from hand-rolled inline implementations of
//   this exact step, and both were silent:
//     1. jq needle binding — a multi-slot `jq '(.slots[] | select(.slot_id=="a","b")) ...'`
//        evaluated the needle against the wrong scope and clobbered sibling slots.
//     2. zsh loop word-splitting — zsh does not word-split unquoted `$VAR` by default, so a
//        `for s in $SLOT_IDS` loop iterated ONCE over the whole string, matched no slot,
//        wrote an unchanged file, and reported write-OK. False green.
//   Both classes are structurally impossible here: the whole document is parsed once, mutated
//   in memory against a Set, re-serialised, and atomically renamed. Slot ids arrive as argv
//   entries, so the shell never has to split anything.
//
// Usage:  node scripts/agents-flow/cowork-write-last-fired.js <slot_id> [<slot_id> ...]
// Env:    FIRED_AT   optional ISO8601 override (default: now). One stamp for all slots in a tick.
//         SCHED_FILE optional path override (default: docs/data/cowork-schedule.json)
//
// Contract (mirrors last-fired.md):
//   - Only the slot_ids passed in are touched. Suppressed / held / unmatched slots are untouched.
//   - Monotonic forward-only: a slot's last_fired never decreases (sibling-fresher-stamp guard).
//   - Atomic: write .tmp then rename. A crash mid-write can never leave a partial schedule.
//   - Non-fatal by contract, but NOT silent: exits 1 and prints the error so the caller can put
//     it in telemetry .last_fired_write_errors. The caller must NOT roll back spawns (AC-P1-7-3).
//   - Exits 2 on a caller error (no slot ids, unknown slot id) — that is a bug in the caller,
//     not a runtime failure, and must be loud rather than a no-op write.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..', '..');
const SCHED_FILE = process.env.SCHED_FILE || path.join(ROOT, 'docs', 'data', 'cowork-schedule.json');
const TMP_FILE   = SCHED_FILE + '.tmp';
const FIRED_AT   = process.env.FIRED_AT || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const wonIds = process.argv.slice(2).filter(Boolean);

function fail(code, msg) {
  process.stdout.write(JSON.stringify({ ok: false, error: msg, fired_at: null, updated: [] }));
  process.exit(code);
}

if (wonIds.length === 0) {
  // Never write on an empty set — that is the silent-no-op failure mode this script exists to kill.
  fail(2, 'no slot_ids given — refusing to write (caller bug: Step 5b runs only when WON_SLOTS is non-empty)');
}

if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(FIRED_AT)) {
  fail(2, 'FIRED_AT is not ISO8601 UTC (YYYY-MM-DDTHH:MM:SSZ): ' + FIRED_AT);
}

let schedule;
try {
  schedule = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
} catch (e) {
  fail(1, 'schedule read/parse failed: ' + e.message);
}

if (!schedule || !Array.isArray(schedule.slots)) {
  fail(1, 'schedule has no .slots array — refusing to write');
}

const known   = new Set(schedule.slots.map(s => s.slot_id));
const unknown = wonIds.filter(id => !known.has(id));
if (unknown.length > 0) {
  // A typo'd slot id would otherwise write a valid-looking file that updated nothing.
  fail(2, 'unknown slot_id(s), not present in schedule: ' + unknown.join(', '));
}

const wonSet  = new Set(wonIds);
const updated = [];
const skipped = [];

for (const slot of schedule.slots) {
  if (!wonSet.has(slot.slot_id)) continue;
  const current = slot.last_fired != null ? slot.last_fired : null;
  if (current === null || FIRED_AT > current) {
    slot.last_fired = FIRED_AT;
    updated.push(slot.slot_id);
  } else {
    // Sibling/peer already stamped something fresher — leave it. Forward-only, never decrease.
    skipped.push({ slot_id: slot.slot_id, kept: current });
  }
}

try {
  const serialized = JSON.stringify(schedule, null, 2) + '\n';
  JSON.parse(serialized); // parse-back guard: never rename a document we cannot re-read
  fs.writeFileSync(TMP_FILE, serialized);
  fs.renameSync(TMP_FILE, SCHED_FILE);
} catch (e) {
  try { fs.unlinkSync(TMP_FILE); } catch (_) { /* best effort */ }
  fail(1, 'atomic write failed: ' + e.message);
}

process.stdout.write(JSON.stringify({ ok: true, fired_at: FIRED_AT, updated, skipped }));
