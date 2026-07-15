#!/usr/bin/env node
// cowork-team slot matcher — reads docs/data/cowork-schedule.json, returns slots
// whose cron matches current UTC ±2min window.
//
// Usage: node scripts/agents-flow/cowork-match-slots.js
//   No args — reads system clock. Output: JSON object {slots: [...], drift_min: N}.
//   Empty slots → silent exit per flow Step 4.
//
// Modes:
//   legacy   (default): cron-match + last_fired boundary dedup (UC-CDC-P3 — SSOT for the
//            dispatcher, cowork-tick-preflight.sh, and cowork-guaranteed-slot-firer.sh: all
//            three invoke this script/module and inherit the same suppression, no per-caller
//            copies). A slot already fired at/after the current nominal cron-tick boundary
//            is suppressed; null/malformed last_fired always fires (EC-3, conservative).
//   adaptive (DWF-PHASE1): also evaluates cadence due-check per slot.policy_id; slots with
//            policy_id=null fall through to legacy cron-match path unchanged.
//
// options parameter (for adaptive mode, passed to matchSlots()):
//   options.mode         — 'legacy' (default) | 'adaptive'
//   options.pressureState — pressure-state.json object (required for adaptive)
//   options.policyObj     — cadence-policy.json object (required for adaptive)

const fs = require('fs');
const path = require('path');

const schedPath = path.join(process.cwd(), 'docs/data/cowork-schedule.json');
const sched = JSON.parse(fs.readFileSync(schedPath, 'utf8'));

function field(expr, val) {
  if (expr === '*') return true;
  if (expr.includes(',')) return expr.split(',').map(Number).includes(val);
  if (expr.startsWith('*/')) return val % parseInt(expr.slice(2)) === 0;
  if (expr.includes('-')) {
    const [a, b] = expr.split('-').map(Number);
    return val >= a && val <= b;
  }
  return parseInt(expr) === val;
}

function dowMatch(expr, dow) {
  if (expr === '*') return true;
  return field(expr, dow) || (dow === 0 && field(expr, 7));
}

// snapToCronBoundary: given lastFiredUnix (seconds) and a cron expression, return the
// most recent nominal cron-tick boundary at-or-before lastFiredUnix, measured in seconds
// since Unix epoch (UTC-aligned). This eliminates spawn-latency drift for slots where
// cadence_minutes == cron period (e.g. "0 */4 * * *" with cadence 240min).
//
// Supported cron patterns (minute and hour fields only; DOM/MON/DOW ignored for snapping):
//   "0 */H * * *"   → period = H*3600s   (e.g. "0 */4 * * *" → 14400s)
//   "*/M * * * *"   → period = M*60s     (e.g. "*/15 * * * *" → 900s)
//   "*/M H * * *"   → period = M*60s     (minute field governs period for <1h slots)
//   "0 H * * *"     → period = 86400s    (daily; snap to midnight)
//   anything else   → no snap (returns lastFiredUnix unchanged)
//
// exported for testing.
function snapToCronBoundary(lastFiredUnix, cron) {
  if (!cron || typeof cron !== 'string') return lastFiredUnix;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 2) return lastFiredUnix;
  const [mf, hf] = parts; // minute-field, hour-field

  let periodSeconds = null;

  if (mf === '0' && hf && hf.startsWith('*/')) {
    // "0 */H * * *" — hourly-multiple boundary
    const h = parseInt(hf.slice(2), 10);
    if (!isNaN(h) && h > 0) periodSeconds = h * 3600;
  } else if (mf.startsWith('*/')) {
    // "*/M ... * * *" — minute-multiple boundary
    const m = parseInt(mf.slice(2), 10);
    if (!isNaN(m) && m > 0) periodSeconds = m * 60;
  } else if (mf === '0' && hf !== '*' && !hf.includes('/') && !hf.includes(',') && !hf.includes('-')) {
    // "0 H * * *" — fixed hour daily; snap to midnight UTC (86400s boundary)
    periodSeconds = 86400;
  }

  if (periodSeconds === null) return lastFiredUnix;

  // Floor to the most recent period boundary on the Unix epoch grid (UTC-aligned)
  return Math.floor(lastFiredUnix / periodSeconds) * periodSeconds;
}

// isSuppressedByBoundaryDedup: UC-CDC-P3 — SSOT last_fired boundary dedup, shared by the
// legacy cron-match path (both the pure-legacy branch and the cadence-unavailable fallback
// below) so dispatcher/preflight/firer all inherit ONE suppression rule instead of three
// divergent copies. Reuses snapToCronBoundary (no second boundary implementation).
//
// A slot is suppressed when it already fired at/after the current nominal cron-tick
// boundary — i.e. snapToCronBoundary(nowUnix, cron) <= parsed(lastFired). This guards the
// re-entrant-election double-spawn window (same tick, 2+ callers) without affecting
// cross-boundary re-offer (next tick always re-qualifies).
//
// Backward-compat (matches adaptive EC-3 first-run precedent, lines ~215-226 below):
//   lastFired == null        → never suppressed (first run always fires)
//   lastFired unparseable    → never suppressed (conservative — fires)
// exported for testing.
function isSuppressedByBoundaryDedup(nowUnix, lastFired, cron) {
  if (lastFired == null) return false;
  const lastFiredUnix = new Date(lastFired).getTime() / 1000;
  if (isNaN(lastFiredUnix)) return false; // malformed → conservative, still fires
  const nominalTick = snapToCronBoundary(nowUnix, cron);
  return lastFiredUnix >= nominalTick;
}

// legacyCandidates: builds the plain legacy slot-object shape with the boundary dedup
// applied. Shared by both legacy return points in matchSlots() below (true legacy mode +
// adaptive-mode's cadence-unavailable fallback) — one implementation, not two copies.
function legacyCandidates(candidates, nowUnix) {
  return candidates
    .filter(sl => !isSuppressedByBoundaryDedup(nowUnix, sl.last_fired, sl.cron))
    .map(sl => ({
      slot_id:       sl.slot_id,
      agent:         sl.agent,
      flow_path:     sl.flow_path,
      cron:          sl.cron,
      trigger_prompt:sl.trigger_prompt,
      guaranteed:    sl.guaranteed,
      policy_id:     sl.policy_id != null ? sl.policy_id : null,
      last_fired:    sl.last_fired != null ? sl.last_fired : null
    }));
}

// cronMatches: exported for testing. Accepts cron string + optional time context object.
// When ctx is omitted the function reads the system clock (production path).
// ctx shape: { actualM, H, DOM, MON, DOW }  (all UTC, DOW 0=Sun..6=Sat)
function cronMatches(cron, ctx) {
  let actualM, H, DOM, MON, DOW;
  if (ctx) {
    ({ actualM, H, DOM, MON, DOW } = ctx);
  } else {
    const now = new Date();
    actualM = now.getUTCMinutes();
    H       = now.getUTCHours();
    DOM     = now.getUTCDate();
    MON     = now.getUTCMonth() + 1;
    DOW     = now.getUTCDay();
  }
  const M = Math.floor(actualM / 15) * 15; // nominal tick: round down to nearest 15-min boundary

  const [cm, ch, cdom, cmon, cdow] = cron.split(' ');
  for (let d = -2; d <= 2; d++) {
    let m = M + d, h = H;
    if (m < 0)  { m += 60; h--; }
    if (m >= 60) { m -= 60; h++; }
    if (h < 0 || h >= 24) continue;
    if (field(cm, m) && field(ch, h) && field(cdom, DOM) && field(cmon, MON) && dowMatch(cdow, DOW))
      return true;
  }
  return false;
}

// matchSlots: exported for testing. Accepts schedule object + optional time context + options.
//
// options = {
//   mode: 'legacy' | 'adaptive',   // default: 'legacy'
//   pressureState: object | null,  // required for adaptive mode
//   policyObj: object | null        // required for adaptive mode
// }
//
// In legacy mode: cron-match + last_fired boundary dedup, returns plain slot objects
//   (backward compatible: same shape as before UC-CDC-P3, only the filtered set changed).
// In adaptive mode: for each cron-matched slot, additionally evaluates cadence due-check.
//   Slots with policy_id=null → treated as legacy cron match; due_reason="cron".
//   Slots with _cron_fallback result → treated as legacy cron match; due_reason="cron".
//   Slots not yet due → excluded from output.
//   All output slots in adaptive mode get: due_reason ("cadence"|"cron"|"first_run") + cadence_minutes (N|null).
function matchSlots(schedule, ctx, options) {
  const opts         = options || {};
  const mode         = opts.mode || 'legacy';
  const pressureState= opts.pressureState || null;
  const policyObj    = opts.policyObj || null;

  // nowUnix: real wall-clock seconds-since-epoch, aligned with how the CLI entrypoint (and
  // therefore all 3 callers — dispatcher/preflight/firer, which all invoke this script with
  // no ctx) derive "now". ctx.nowUnix is a TEST-ONLY override (production ctx is undefined,
  // or — for adaptive-mode tests — never sets nowUnix, so behaviour there is unchanged).
  const nowUnix = (ctx && typeof ctx.nowUnix === 'number') ? ctx.nowUnix : Date.now() / 1000;

  // Cron-matched candidate slots (always the first gate)
  const candidates = schedule.slots
    .filter(sl => sl.enabled && !sl._disabled_by && cronMatches(sl.cron, ctx));

  if (mode !== 'adaptive' || !pressureState || !policyObj) {
    // Legacy mode: cron-matched slots with last_fired boundary dedup applied (UC-CDC-P3).
    return legacyCandidates(candidates, nowUnix);
  }

  // Adaptive mode: require cadence-policy.js evaluator
  let evaluateCadence, computeTiers;
  try {
    const cadenceModule = require('./cadence-policy.js');
    evaluateCadence = cadenceModule.evaluateCadence;
    computeTiers    = cadenceModule.computeTiers;
  } catch (e) {
    // Evaluator unavailable → fall back to legacy (same boundary dedup applies)
    console.warn('[cowork-match-slots] WARN: cadence-policy.js unavailable, falling back to legacy mode:', e.message);
    return legacyCandidates(candidates, nowUnix);
  }

  const { signal_backlog_tier, volatility_tier } = computeTiers(pressureState);
  const calendar_status = (pressureState && pressureState.calendar_status) || 'unknown';

  const results = [];

  for (const sl of candidates) {
    const base = {
      slot_id:       sl.slot_id,
      agent:         sl.agent,
      flow_path:     sl.flow_path,
      cron:          sl.cron,
      trigger_prompt:sl.trigger_prompt,
      guaranteed:    sl.guaranteed,
      policy_id:     sl.policy_id != null ? sl.policy_id : null,
      last_fired:    sl.last_fired != null ? sl.last_fired : null
    };

    // null policy_id → legacy cron (already passed cron filter)
    if (sl.policy_id == null) {
      results.push(Object.assign({}, base, { due_reason: 'cron', cadence_minutes: null }));
      continue;
    }

    const evalResult = evaluateCadence(sl.policy_id, calendar_status, signal_backlog_tier, volatility_tier, policyObj);

    // _cron_fallback → cron governs (bctc-offmarket on open/half_day/unknown)
    if (evalResult._cron_fallback === true) {
      results.push(Object.assign({}, base, { due_reason: 'cron', cadence_minutes: null }));
      continue;
    }

    // interval_minutes=null → suppress (calendar or policy says no)
    if (evalResult.interval_minutes === null) {
      console.error('[cowork-match-slots] cadence suppress:', sl.slot_id, 'policy=' + sl.policy_id, 'calendar=' + calendar_status);
      continue;
    }

    // Cadence due-check
    const cadenceSeconds = evalResult.interval_minutes * 60;

    if (sl.last_fired == null) {
      // EC-3: first-run semantics — always due when last_fired is null
      results.push(Object.assign({}, base, { due_reason: 'first_run', cadence_minutes: evalResult.interval_minutes }));
      continue;
    }

    const lastFiredUnix = new Date(sl.last_fired).getTime() / 1000;
    if (isNaN(lastFiredUnix)) {
      // Malformed last_fired → treat as first-run (conservative: always due)
      results.push(Object.assign({}, base, { due_reason: 'first_run', cadence_minutes: evalResult.interval_minutes }));
      continue;
    }

    const snappedLastFired = snapToCronBoundary(lastFiredUnix, sl.cron);
    const elapsedSeconds = nowUnix - snappedLastFired;
    if (elapsedSeconds >= cadenceSeconds) {
      results.push(Object.assign({}, base, { due_reason: 'cadence', cadence_minutes: evalResult.interval_minutes }));
    } else {
      console.error('[cowork-match-slots] cadence skip:', sl.slot_id,
        'elapsed=' + Math.floor(elapsedSeconds) + 's cadence=' + cadenceSeconds + 's',
        '(snapped_last_fired=' + new Date(snappedLastFired * 1000).toISOString() + ')');
    }
  }

  return results;
}

// Run directly (not required as a module)
if (require.main === module) {
  const now = new Date();
  const actualM = now.getUTCMinutes();
  const M = Math.floor(actualM / 15) * 15; // nominal tick: round down to nearest 15-min boundary

  let mode = 'legacy';
  let pressureState = null;
  let policyObj = null;

  const policyPath  = path.join(__dirname, '..', '..', 'docs', 'data', 'cadence-policy.json');
  const pressurePath= path.join(__dirname, '..', '..', 'docs', 'data', 'pressure-state.json');

  if (fs.existsSync(policyPath) && fs.existsSync(pressurePath)) {
    try {
      policyObj     = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
      pressureState = JSON.parse(fs.readFileSync(pressurePath, 'utf8'));
      const { isStale } = require('./cadence-policy.js');
      const threshold = (policyObj && policyObj._staleness_threshold_minutes) || 20;
      if (!isStale(pressureState, threshold)) {
        mode = 'adaptive';
      }
      // else: stale pressure-state → fallback to legacy (NFR-P1-3)
    } catch (e) {
      // Any parse or require error → legacy (conservative)
    }
  }

  const hits     = matchSlots(sched, undefined, { mode, pressureState, policyObj });
  const driftMin = actualM - M; // always 0–14; negative drift impossible given floor()
  process.stdout.write(JSON.stringify({ slots: hits, drift_min: driftMin }));
}

module.exports = { cronMatches, matchSlots, field, dowMatch, snapToCronBoundary, isSuppressedByBoundaryDedup };
