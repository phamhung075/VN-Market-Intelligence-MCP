#!/usr/bin/env node
'use strict';
// cowork-chef-mutex.js — Step 4.5c same-tick CHEF mutual-exclusion (FIX-COWORK-CHEF-SAMETICK-MUTEX,
// hardened by FIX-COWORK-CHEF-MUTEX-ECHO-JQ-DEFEAT).
// Owning flow doc: docs/agents/cowork-team/flow/pressure-cadence.md § Step 4.5c
//
// WHY THIS EXISTS AS A SCRIPT, not an inline shell block (2nd occurrence, 07-14 + 07-16T05:15Z):
//   The prior inline implementation did `SCHEDULE=$(cat cowork-schedule.json)` then
//   `echo "$SCHEDULE" | jq ...` and `echo "$MATCHES" | jq ...`. Under zsh, the `echo` builtin
//   interprets backslash escape sequences BY DEFAULT (unlike bash, which needs `-e`). The
//   chef-intraday slot's `trigger_prompt` field contains a literal `\n` (two characters,
//   backslash + n) inside its JSON string value:
//     "run docs/agents/unified-agent/flow/chef.md  slot=chef-intraday\nMCP: https://..."
//   Re-emitting that JSON text through `echo` turns the escaped `\n` into a REAL newline
//   byte, which is illegal unescaped inside a JSON string — jq then fails with
//   "Invalid string: control characters ... must be escaped", G_ARR/NG_ARR come back EMPTY,
//   CHEF_MUTEX_APPLIED silently stays false, and BOTH chef-morning + chef-intraday spawn on
//   the 05:15Z coincidence tick — a double market publish, failing silently (no non-zero
//   exit, no error surfaced to the dispatcher).
//   A prior lesson (feedback_cowork_chef_mutex_echo_jq_mangles_escaped_newline) documented
//   this, but the fix landed only as prose/memory, never in the doc or code — so it
//   regressed. This script is the durable fix: it is testable (see .test.js), and it never
//   round-trips a JSON payload through `echo`.
//
// Usage (from the flow doc):
//   RESULT=$(printf '%s' "$MATCHES" | node scripts/agents-flow/cowork-chef-mutex.js)
//   MATCHES=$(jq -n --argjson r "$RESULT" -c '$r.matches')
//   CHEF_MUTEX_APPLIED=$(jq -n --argjson r "$RESULT" '$r.chef_mutex_applied')
//   NOTE: `printf '%s'` (not `echo`) feeds stdin — printf never interprets backslash escapes
//   in its %s argument, so the raw JSON text survives byte-for-byte. `jq -n --argjson`
//   consumes $RESULT as a shell command-line argument (execve argv), never through a pipe
//   an interpreter could re-read/re-escape — this is the "jq -n --argjson bound params"
//   pattern the incident row prescribes, used symmetrically at both ends of this script.
//
// Env:   SCHED_FILE  optional path override (default: docs/data/cowork-schedule.json).
//        Read file-direct (fs.readFileSync) — never shelled through cat/echo.
// Stdin: MATCHES — JSON array of slot objects, each with at least a `slot_id` field.
//        Empty/absent stdin ([] equivalent) is valid — the mutex is then a no-op.
//
// Contract:
//   - Exactly one CHEF dish per tick: when MATCHES contains both a guaranteed CHEF slot
//     (parallel_group="chef", guaranteed=true) and a non-guaranteed one (guaranteed=false),
//     drop ALL non-guaranteed CHEF slots and keep everything else unchanged.
//   - Order-preserving: surviving slots keep their original relative order in MATCHES.
//   - Fails LOUD, not silent-empty, on malformed input: invalid MATCHES JSON or a schedule
//     missing `.slots` writes an error envelope to stdout and exits 1 — this is the exact
//     failure mode (silent-empty-arrays masking as CHEF_MUTEX_APPLIED=false) that caused the
//     original double-publish, so this script refuses to reproduce it quietly.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCHED_FILE = process.env.SCHED_FILE || path.join(ROOT, 'docs', 'data', 'cowork-schedule.json');

/**
 * applyChefMutex(matches, scheduleSlots) → { matches, chef_mutex_applied, dropped }
 *
 * Pure function — no I/O. Exported for unit testing.
 *
 * @param {Array<{slot_id: string}>} matches       candidate slots for this tick (any shape,
 *                                                  only `.slot_id` is read)
 * @param {Array<{slot_id: string, parallel_group?: string, guaranteed?: boolean}>} scheduleSlots
 *                                                  the full `.slots` array from cowork-schedule.json
 */
function applyChefMutex(matches, scheduleSlots) {
  if (!Array.isArray(matches)) {
    throw new Error('applyChefMutex: matches must be an array, got ' + typeof matches);
  }
  if (!Array.isArray(scheduleSlots)) {
    throw new Error('applyChefMutex: scheduleSlots must be an array, got ' + typeof scheduleSlots);
  }

  const chefSlots = scheduleSlots.filter((s) => s && s.parallel_group === 'chef');
  const guaranteedIds = new Set(chefSlots.filter((s) => s.guaranteed === true).map((s) => s.slot_id));
  const nonGuaranteedIds = new Set(chefSlots.filter((s) => s.guaranteed === false).map((s) => s.slot_id));

  const hasGuaranteed = matches.some((m) => m && guaranteedIds.has(m.slot_id));
  const hasNonGuaranteed = matches.some((m) => m && nonGuaranteedIds.has(m.slot_id));

  if (hasGuaranteed && hasNonGuaranteed) {
    const dropped = matches.filter((m) => m && nonGuaranteedIds.has(m.slot_id)).map((m) => m.slot_id);
    const filtered = matches.filter((m) => !(m && nonGuaranteedIds.has(m.slot_id)));
    return { matches: filtered, chef_mutex_applied: true, dropped };
  }

  return { matches, chef_mutex_applied: false, dropped: [] };
}

function fail(msg) {
  process.stdout.write(JSON.stringify({ ok: false, error: msg, matches: [], chef_mutex_applied: false, dropped: [] }));
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
    result = applyChefMutex(matches, schedule.slots);
  } catch (e) {
    fail(e.message);
  }

  process.stdout.write(JSON.stringify(Object.assign({ ok: true }, result)));
}

module.exports = { applyChefMutex };
