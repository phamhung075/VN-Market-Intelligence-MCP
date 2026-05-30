'use strict';
// cadence-policy.js — DWF-PHASE1 Adaptive Cadence Evaluator Module
//
// CommonJS module. Zero npm dependencies (fs, path only).
// Exports: loadCadencePolicy, evaluateCadence, computeTiers, isStale
//
// _cron_fallback semantics:
//   When interval_minutes=null AND _cron_fallback=true → treat slot as legacy cron (not suppress).
//   When interval_minutes=null AND _cron_fallback=false/absent → suppress (do not dispatch).
//   Evaluator always checks _cron_fallback before treating null as suppress.

const fs   = require('fs');
const path = require('path');

const DEFAULT_POLICY_PATH = path.join(__dirname, '..', '..', 'docs', 'data', 'cadence-policy.json');

/**
 * loadCadencePolicy([filePath]) → policy object
 *
 * Reads the cadence-policy.json SSOT from disk.
 * On file missing or malformed JSON: logs WARN and returns empty structure {policies:[]}
 * so the evaluator degrades to the 240-min safe default for all lookups.
 *
 * @param {string} [filePath] - Absolute or relative path (default: docs/data/cadence-policy.json)
 * @returns {{ policies: object[], _staleness_threshold_minutes: number }}
 */
function loadCadencePolicy(filePath) {
  const fp = filePath || DEFAULT_POLICY_PATH;
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[cadence-policy] WARN: could not load policy file:', fp, '—', e.message);
    return { policies: [] };
  }
}

/**
 * evaluateCadence(policy_id, calendar_status, signal_backlog_tier, volatility_tier, policy_obj)
 *   → { interval_minutes: number|null, _cron_fallback: boolean }
 *
 * First-match wins (array order). Wildcard "*" matches any value.
 * No match → safe default { interval_minutes: 240, _cron_fallback: false } (AC-P1-1-3).
 *
 * @param {string} policy_id
 * @param {string} calendar_status      - "open"|"half_day"|"holiday"|"weekend"|"unknown"
 * @param {string} signal_backlog_tier  - "low"|"medium"|"high"|"*"
 * @param {string} volatility_tier      - "low"|"high"|"*"
 * @param {object} policy_obj           - policy object from loadCadencePolicy()
 * @returns {{ interval_minutes: number|null, _cron_fallback: boolean }}
 */
function evaluateCadence(policy_id, calendar_status, signal_backlog_tier, volatility_tier, policy_obj) {
  const rules = (policy_obj && policy_obj.policies) ? policy_obj.policies : [];

  for (const rule of rules) {
    if (rule.policy_id !== policy_id) continue;

    const calendarMatch  = rule.calendar_status === '*'       || rule.calendar_status === calendar_status;
    const backlogMatch   = rule.signal_backlog_tier === '*'   || rule.signal_backlog_tier === signal_backlog_tier;
    const volatilityMatch= rule.volatility_tier === '*'       || rule.volatility_tier === volatility_tier;

    if (calendarMatch && backlogMatch && volatilityMatch) {
      return {
        interval_minutes: rule.interval_minutes,
        _cron_fallback:   rule._cron_fallback ?? false
      };
    }
  }

  // No matching rule → safe default (AC-P1-1-3: never null for unmatched)
  return { interval_minutes: 240, _cron_fallback: false };
}

/**
 * computeTiers(pressure_state) → { signal_backlog_tier, volatility_tier }
 *
 * Deterministic tier computation from pressure_state fields. No LLM. No side-effects.
 *
 * signal_backlog_tier:
 *   low    = signal_backlog 0–2
 *   medium = signal_backlog 3–9
 *   high   = signal_backlog ≥10
 *
 * volatility_tier:
 *   low  = last_volatility_level in ["unknown", "low"]
 *   high = anything else
 *
 * @param {object} pressure_state
 * @returns {{ signal_backlog_tier: "low"|"medium"|"high", volatility_tier: "low"|"high" }}
 */
function computeTiers(pressure_state) {
  const backlog = (pressure_state && typeof pressure_state.signal_backlog === 'number')
    ? pressure_state.signal_backlog
    : 0;

  let signal_backlog_tier;
  if (backlog >= 10)     signal_backlog_tier = 'high';
  else if (backlog >= 3) signal_backlog_tier = 'medium';
  else                   signal_backlog_tier = 'low';

  const vol = (pressure_state && pressure_state.last_volatility_level) || 'unknown';
  const volatility_tier = (vol === 'unknown' || vol === 'low') ? 'low' : 'high';

  return { signal_backlog_tier, volatility_tier };
}

/**
 * isStale(pressure_state, threshold_minutes) → boolean
 *
 * Returns true (stale) if EITHER:
 *   1. pressure_state.stale_warning === true  (self-reported stale — overrides age, AC-P1-6-3)
 *   2. (now_unix - parse(emitted_at).unix()) / 60 > threshold_minutes  (age-based, AC-P1-6-2)
 *
 * Otherwise returns false.
 *
 * @param {object} pressure_state  - object with emitted_at (ISO8601) and stale_warning (bool)
 * @param {number} threshold_minutes
 * @returns {boolean}
 */
function isStale(pressure_state, threshold_minutes) {
  if (!pressure_state) return true;

  // Gate 1: self-reported stale flag (AC-P1-6-3)
  if (pressure_state.stale_warning === true) return true;

  // Gate 2: age-based staleness (AC-P1-6-2)
  if (pressure_state.emitted_at) {
    const emittedMs = new Date(pressure_state.emitted_at).getTime();
    if (isNaN(emittedMs)) return true; // malformed timestamp → conservative stale
    const nowMs      = Date.now();
    const ageMinutes = (nowMs - emittedMs) / 1000 / 60;
    if (ageMinutes > threshold_minutes) return true;
  } else {
    // No emitted_at → conservative stale
    return true;
  }

  return false;
}

module.exports = { loadCadencePolicy, evaluateCadence, computeTiers, isStale };
