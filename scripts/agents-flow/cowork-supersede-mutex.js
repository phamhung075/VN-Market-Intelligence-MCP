#!/usr/bin/env node
'use strict';
// cowork-supersede-mutex.js — declarative same-tick supersede mutex, generalizing
// cowork-chef-mutex.js (FIX-COWORK-CHEF-SAMETICK-MUTEX) for slot pairs that cannot use the
// guaranteed-boolean tie-break (both sides guaranteed:false, e.g. market-watcher-eod /
// market-watcher-offhours). FIX-COWORK-SUPERSEDE-MUTEX-SCRIPT-AND-MATCHSLOTS-WIRING.
// Owning brief: docs/architecture-briefs/2026-08-14-market-watcher-eod-offhours-notebook-collision.md §3b/§3c
// Owning flow doc: docs/agents/cowork-team/flow/pressure-cadence.md § Step 4.5d
//
// REQUIRED-READING PRECEDENT (per this row's own status_note): scripts/agents-flow/cowork-chef-mutex.js
// — this script mirrors its shape and error contract exactly. That script was hardened once
// already against a real regression (FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT: `echo "$VAR" | jq`
// mangles a literal `\n` inside a JSON string value, silently producing empty arrays instead of
// failing loud). This script does not reproduce either defeat mode:
//   (a) malformed input FAILS LOUD (error envelope + exit 1), never silent-empty — AC-2.
//   (b) the live call site (cowork-match-slots.js finish()) invokes it IN-PROCESS via require(),
//       never through a shell echo/printf pipe — AC-5, sidesteps the echo-mangles-backslash class
//       by construction, not by discipline. A CLI entry point still exists below for
//       symmetry/testability only (mirrors cowork-chef-mutex.js's own CLI shape), matching its
//       `printf '%s' | node ...` usage convention if ever invoked from shell directly.
//
// Env:   SCHED_FILE  optional path override (default: docs/data/cowork-schedule.json).
//        Read file-direct (fs.readFileSync) — never shelled through cat/echo.
// Stdin: MATCHES — JSON array of slot objects, each with at least a `slot_id` field.
//        Empty/absent stdin ([] equivalent) is valid — the mutex is then a no-op.
//
// Contract:
//   - For every slot S in `matches` whose schedule row (looked up in `scheduleSlots` by
//     slot_id) declares a non-empty `.supersedes` array: any slot_id S names that is ALSO
//     present in `matches` is dropped. S itself always survives (a slot can never supersede
//     itself out of the result, even if `.supersedes` mistakenly names its own slot_id).
//   - Deliberately opt-in/declarative — priority is read ONLY from the schedule row's own
//     `.supersedes` field, never inferred from cron frequency or the `guaranteed` flag (brief §6).
//     A slot pair has zero effect on each other unless a schedule author explicitly opts in.
//   - Order-preserving: surviving slots keep their original relative order in `matches`.
//   - Fails LOUD, not silent-empty, on malformed input: invalid MATCHES JSON or a schedule
//     missing `.slots` writes an error envelope to stdout and exits 1 — same posture as
//     applyChefMutex, for the same reason (a silently-empty result here would let the same-tick
//     market-watcher-eod/offhours collision this mutex exists to close continue unnoticed).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCHED_FILE = process.env.SCHED_FILE || path.join(ROOT, 'docs', 'data', 'cowork-schedule.json');

/**
 * applySupersedeMutex(matches, scheduleSlots) → { matches, supersede_mutex_applied, dropped }
 *
 * Pure function — no I/O. Exported for unit testing.
 *
 * @param {Array<{slot_id: string}>} matches       candidate slots for this tick (any shape,
 *                                                  only `.slot_id` is read)
 * @param {Array<{slot_id: string, supersedes?: string[]}>} scheduleSlots
 *                                                  the full `.slots` array from cowork-schedule.json
 */
function applySupersedeMutex(matches, scheduleSlots) {
  if (!Array.isArray(matches)) {
    throw new Error('applySupersedeMutex: matches must be an array, got ' + typeof matches);
  }
  if (!Array.isArray(scheduleSlots)) {
    throw new Error('applySupersedeMutex: scheduleSlots must be an array, got ' + typeof scheduleSlots);
  }

  const matchedIds = new Set(matches.filter((m) => m && m.slot_id).map((m) => m.slot_id));

  // Union of every victim slot_id named by a superseding slot that is ITSELF present this
  // tick and whose named victim is ALSO present this tick — both sides of the pair must
  // actually co-appear in `matches` for the mutex to fire.
  const victimIds = new Set();
  for (const slot of scheduleSlots) {
    if (!slot || !Array.isArray(slot.supersedes) || slot.supersedes.length === 0) continue;
    if (!matchedIds.has(slot.slot_id)) continue; // superseding slot must be due this tick
    for (const victimId of slot.supersedes) {
      if (victimId === slot.slot_id) continue; // a slot can never drop itself
      if (matchedIds.has(victimId)) {
        victimIds.add(victimId);
      }
    }
  }

  if (victimIds.size === 0) {
    return { matches, supersede_mutex_applied: false, dropped: [] };
  }

  const dropped = matches.filter((m) => m && victimIds.has(m.slot_id)).map((m) => m.slot_id);
  const filtered = matches.filter((m) => !(m && victimIds.has(m.slot_id)));
  return { matches: filtered, supersede_mutex_applied: true, dropped };
}

function fail(msg) {
  process.stdout.write(JSON.stringify({ ok: false, error: msg, matches: [], supersede_mutex_applied: false, dropped: [] }));
  process.exit(1);
}

if (require.main === module) {
  let stdinRaw;
  try {
    stdinRaw = fs.readFileSync(0, 'utf8');
  } catch (e) {
    stdinRaw = '';
  }
  const trimmed = stdinRaw.trim();

  let matches;
  try {
    matches = trimmed === '' ? [] : JSON.parse(trimmed);
  } catch (e) {
    fail('MATCHES stdin is not valid JSON: ' + e.message);
  }

  let schedule;
  try {
    schedule = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
  } catch (e) {
    fail('schedule read/parse failed (' + SCHED_FILE + '): ' + e.message);
  }
  if (!schedule || !Array.isArray(schedule.slots)) {
    fail('schedule has no .slots array: ' + SCHED_FILE);
  }

  let result;
  try {
    result = applySupersedeMutex(matches, schedule.slots);
  } catch (e) {
    fail(e.message);
  }

  process.stdout.write(JSON.stringify(Object.assign({ ok: true }, result)));
}

module.exports = { applySupersedeMutex };
