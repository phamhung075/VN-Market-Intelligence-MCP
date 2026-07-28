'use strict';
// cowork-catchup-predicate.js — FR-1/FR-2 pure domain module for cowork guaranteed-slot
// catch-up (sprint COWORK-GUARANTEED-SLOT-CATCHUP, TASK-COWORK-CATCHUP-1).
//
// Architecture brief: docs/architecture-briefs/2026-07-22-cowork-guaranteed-slot-catchup-design.md §2.1
//
// CommonJS module. Zero npm dependencies, ZERO I/O (no fs/path/require of infrastructure) —
// DDD golden rule (docs/policies/dev-standards.md § DDD Layer Rules): domain has zero imports
// from infrastructure. Mirrors the `cadence-policy.js` sibling-module pattern: pure, ctx/now
// injectable, `require`'d one-way by `cowork-match-slots.js`'s CLI entrypoint (never the
// reverse — avoids circularity).
//
// Dependency-injected, NOT require-coupled to cowork-match-slots.js: field()/dowMatch() are
// accepted as parameters (the SAME functions cowork-match-slots.js already exports) rather
// than this module requiring that sibling file itself, so the dependency edge stays strictly
// one-directional (cowork-match-slots.js -> cowork-catchup-predicate.js).
//
// This module does NOT call task_list_held (or any MCP/gateway tool) — that is FR-3's
// infrastructure-layer half, wired in separately by each of the 3 callers (dispatcher
// catchup-check.md, cowork-tick-preflight.sh, cowork-guaranteed-slot-firer.sh). See design
// brief §2.3/§2.6 and DDD layer map §6.
//
// Exports: computeCatchupCandidates, mostRecentCronFireBefore, toVnDateString

const VN_OFFSET_SECONDS = 7 * 3600; // Asia/Ho_Chi_Minh = UTC+7, no DST.
const LOOKBACK_MINUTES = 8 * 24 * 60; // 8-day bounded reverse-cron walk (design brief §2.1).

// ---------------------------------------------------------------------------
// mostRecentCronFireBefore
// ---------------------------------------------------------------------------

/**
 * mostRecentCronFireBefore(cron, nowUnix, { field, dowMatch }) → unixSeconds | null
 *
 * Generic reverse-cron walker: returns the most recent nominal cron-scheduled fire time
 * at-or-before nowUnix, bounded to an 8-day lookback (conservative — if no match is found
 * within 8 days, returns null so the caller treats the slot as having no catch-up candidate
 * rather than walking back unboundedly).
 *
 * Genuinely generic (NFR-4): works for any 5-field cron expression using minute/hour/DOM/MON/DOW
 * fields supported by the injected field()/dowMatch() — not special-cased to the 8 guaranteed
 * slots' "MM H * * *"/"MM H * * DOW-list" shape, though that is the only shape currently in
 * production use for guaranteed:true slots.
 *
 * Does NOT read slot.last_fired — this is the SCHEDULED fire time per the cron definition
 * alone, independent of whether/when the flow actually last ran. Catch-up eligibility
 * (elapsed-since-scheduled vs freshness bound) is computed separately by the caller.
 *
 * @param {string} cron - 5-field cron expression ("M H DOM MON DOW")
 * @param {number} nowUnix - seconds since Unix epoch (UTC)
 * @param {{field: Function, dowMatch: Function}} deps - injected from cowork-match-slots.js
 * @returns {number|null} unix seconds of the most recent scheduled fire at-or-before nowUnix,
 *                          or null if none found within the bounded lookback / cron malformed.
 */
function mostRecentCronFireBefore(cron, nowUnix, deps) {
  if (!cron || typeof cron !== 'string') return null;
  const { field, dowMatch } = deps || {};
  if (typeof field !== 'function' || typeof dowMatch !== 'function') {
    throw new TypeError('mostRecentCronFireBefore requires { field, dowMatch } functions');
  }

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null; // malformed — conservative, no candidate
  const [cm, ch, cdom, cmon, cdow] = parts;

  // Walk backward one minute at a time from the most recent whole-minute boundary
  // at-or-before nowUnix, until a field match is found or the lookback is exhausted.
  const nowMinuteUnix = Math.floor(nowUnix / 60) * 60;

  for (let i = 0; i <= LOOKBACK_MINUTES; i++) {
    const candidateUnix = nowMinuteUnix - i * 60;
    const d = new Date(candidateUnix * 1000);
    const m = d.getUTCMinutes();
    const h = d.getUTCHours();
    const dom = d.getUTCDate();
    const mon = d.getUTCMonth() + 1;
    const dow = d.getUTCDay();

    if (field(cm, m) && field(ch, h) && field(cdom, dom) && field(cmon, mon) && dowMatch(cdow, dow)) {
      return candidateUnix;
    }
  }
  return null; // no scheduled fire found within the bounded lookback
}

// ---------------------------------------------------------------------------
// Date-basis key-part helpers
// ---------------------------------------------------------------------------

// ymd: format a Date's UTC calendar fields as YYYY-MM-DD.
function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * toVnDateString(unixSeconds) → "YYYY-MM-DD"
 *
 * Asia/Ho_Chi_Minh (UTC+7, no DST) calendar date for the given unix instant. Standard
 * fixed-offset trick: shift the instant by +7h then read its UTC calendar fields.
 *
 * @param {number} unixSeconds
 * @returns {string}
 */
function toVnDateString(unixSeconds) {
  return ymd(new Date((unixSeconds + VN_OFFSET_SECONDS) * 1000));
}

// toUtcDateString: UTC calendar date — mirrors digest-daily's existing (deliberately NOT
// VN-date) UTC_DATE basis (docs/agents/digest-predict/flow/main.md:31-38). Mirrored, not
// "corrected" — see architecture brief §1/§9 risk flag 2.
function toUtcDateString(unixSeconds) {
  return ymd(new Date(unixSeconds * 1000));
}

// toVnSaturdayAnchorDateString: fb-weekend's PERIOD_SAT basis (docs/agents/fb-market-poster/
// flow/weekly-recap.md:39-40): "if VN_DOW==0 (Sunday) then VN_DATE - 1 day (Saturday) else
// VN_DATE" — both Saturday's and Sunday's fire of the same weekend collapse onto the same key.
function toVnSaturdayAnchorDateString(unixSeconds) {
  const shiftedMs = (unixSeconds + VN_OFFSET_SECONDS) * 1000;
  const vnDow = new Date(shiftedMs).getUTCDay(); // 0=Sun..6=Sat, VN-local terms (fixed offset)
  const satMs = vnDow === 0 ? shiftedMs - 86400000 : shiftedMs;
  return ymd(new Date(satMs));
}

// getIsoWeekPeriodKey: mirrors apps/mcp-server/src/domain/services/isoWeek.ts's
// getISOWeekPeriod().periodKey algorithm exactly (pure UTC arithmetic, no VN-shift — the
// canonical get_week_period MCP tool operates on the raw UTC instant). digest-sunday and
// tnb-audit both key their published-marker on this periodKey (date-range "YYYY-MM-DD/YYYY-MM-DD").
function getIsoWeekPeriodKey(unixSeconds) {
  const ref = new Date(unixSeconds * 1000);
  const utcDay = ref.getUTCDay(); // 0=Sun..6=Sat
  const isoOffset = (utcDay === 0 ? 7 : utcDay) - 1; // 0=Mon..6=Sun
  const refMidnightMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  const mondayMs = refMidnightMs - isoOffset * 86400000;
  const sundayMs = mondayMs + 6 * 86400000;
  return `${ymd(new Date(mondayMs))}/${ymd(new Date(sundayMs))}`;
}

// computeKeyPart: dispatch to the correct basis helper. Unknown/missing basis conservatively
// falls back to vn_date (the most common basis among the 8 guaranteed slots).
function computeKeyPart(basis, unixSeconds) {
  switch (basis) {
    case 'utc_date':
      return toUtcDateString(unixSeconds);
    case 'iso_week_period':
      return getIsoWeekPeriodKey(unixSeconds);
    case 'vn_date_saturday_anchor':
      return toVnSaturdayAnchorDateString(unixSeconds);
    case 'vn_date':
    default:
      return toVnDateString(unixSeconds);
  }
}

// ---------------------------------------------------------------------------
// computeCatchupCandidates
// ---------------------------------------------------------------------------

/**
 * computeCatchupCandidates(schedule, nowUnix, ctx, { field, dowMatch }) → array
 *
 * For each guaranteed:true, enabled, !_disabled_by slot (skipping any slot_id present in
 * ctx.excludeSlotIds — a caller-supplied set of slots already live-matched this tick, so a
 * slot currently firing on-time is never double-counted as its own catch-up candidate):
 *
 *   1. scheduledFireUnix = mostRecentCronFireBefore(slot.cron, nowUnix, {field, dowMatch})
 *      → slot has no fire within the bounded lookback: skip (nothing to catch up).
 *   2. basis = slot.publish_date_basis; scheduledKeyPart / nowKeyPart computed via the same
 *      basis (FR-4 rollover check MUST compare like-for-like).
 *   3. scheduledKeyPart !== nowKeyPart → rolled past the missed slot's own scheduled period
 *      → catchup_eligible:false, reason:"rolled_past_vn_date" (checked BEFORE the freshness
 *      bound — a slot that rolled over is never eligible regardless of elapsed time).
 *   4. else elapsedMinutes = (nowUnix - scheduledFireUnix) / 60; per-dish_type
 *      catchup_max_lateness_minutes (schedule._dish_type_catchup_config, "_default" fallback)
 *      — elapsedMinutes > bound → catchup_eligible:false, reason:"freshness_window_exceeded".
 *   5. else → catchup_eligible:true, reason:null.
 *
 * Pure — does NOT check task_list_held (FR-3's infrastructure-layer half, out of scope here).
 *
 * @param {object} schedule - parsed docs/data/cowork-schedule.json (must include .slots[] and,
 *   after this task's migration, ._dish_type_catchup_config)
 * @param {number} nowUnix - seconds since Unix epoch (UTC) — ctx-injectable for deterministic tests
 * @param {{excludeSlotIds?: (string[]|Set<string>)}} [ctx] - optional; slot_ids to skip (already
 *   live cron-matched this tick by the caller — reserved hook for the FR-3 wiring task)
 * @param {{field: Function, dowMatch: Function}} deps - injected from cowork-match-slots.js
 * @returns {Array<object>} one record per considered guaranteed slot: {slot_id, dish_type,
 *   agent, flow_path, trigger_prompt, guaranteed, scheduled_utc_time, scheduled_key_part,
 *   expected_publish_task_id, catchup_eligible, reason}
 */
function computeCatchupCandidates(schedule, nowUnix, ctx, deps) {
  const { field, dowMatch } = deps || {};
  if (typeof field !== 'function' || typeof dowMatch !== 'function') {
    throw new TypeError('computeCatchupCandidates requires { field, dowMatch } functions');
  }

  const excludeRaw = (ctx && ctx.excludeSlotIds) || [];
  const excludeSlotIds = excludeRaw instanceof Set ? excludeRaw : new Set(excludeRaw);

  const dishConfig = (schedule && schedule._dish_type_catchup_config) || {};
  const defaultConfig = dishConfig._default || { catchup_max_lateness_minutes: 60, fire_timeout_seconds: 1800 };

  const slots = (schedule && Array.isArray(schedule.slots)) ? schedule.slots : [];

  const results = [];
  for (const sl of slots) {
    if (!sl.guaranteed) continue;
    if (!sl.enabled) continue;
    if (sl._disabled_by) continue;
    if (excludeSlotIds.has(sl.slot_id)) continue;

    const scheduledFireUnix = mostRecentCronFireBefore(sl.cron, nowUnix, { field, dowMatch });
    if (scheduledFireUnix == null) continue; // no scheduled fire in bounded lookback

    const basis = sl.publish_date_basis || 'vn_date'; // conservative default, matches computeKeyPart
    const scheduledKeyPart = computeKeyPart(basis, scheduledFireUnix);
    const nowKeyPart = computeKeyPart(basis, nowUnix);

    const base = {
      slot_id: sl.slot_id,
      dish_type: sl.dish_type != null ? sl.dish_type : null,
      agent: sl.agent,
      flow_path: sl.flow_path,
      trigger_prompt: sl.trigger_prompt,
      guaranteed: true,
      scheduled_utc_time: new Date(scheduledFireUnix * 1000).toISOString(),
      scheduled_key_part: scheduledKeyPart,
      expected_publish_task_id: `published:${sl.slot_id}:${scheduledKeyPart}`,
    };

    if (scheduledKeyPart !== nowKeyPart) {
      results.push(Object.assign({}, base, { catchup_eligible: false, reason: 'rolled_past_vn_date' }));
      continue;
    }

    const dishCfg = (sl.dish_type && dishConfig[sl.dish_type]) || defaultConfig;
    const maxLatenessMinutes = typeof dishCfg.catchup_max_lateness_minutes === 'number'
      ? dishCfg.catchup_max_lateness_minutes
      : defaultConfig.catchup_max_lateness_minutes;

    const elapsedMinutes = (nowUnix - scheduledFireUnix) / 60;
    if (elapsedMinutes > maxLatenessMinutes) {
      results.push(Object.assign({}, base, { catchup_eligible: false, reason: 'freshness_window_exceeded' }));
      continue;
    }

    results.push(Object.assign({}, base, { catchup_eligible: true, reason: null }));
  }

  return results;
}

module.exports = { computeCatchupCandidates, mostRecentCronFireBefore, toVnDateString };
