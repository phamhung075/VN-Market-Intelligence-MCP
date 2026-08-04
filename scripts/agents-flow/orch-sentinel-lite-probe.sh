#!/usr/bin/env bash
# scripts/agents-flow/orch-sentinel-lite-probe.sh
#
# CADRAT-6 — deterministic SKIP-SPAWN/SPAWN pre-gate for orch-sentinel's daily
# MODE=LITE run (OH-1 plumbing check), matching system-auditor Tier-1/2/3's
# EXACT ALL_GREEN + fresh-heartbeat pre-spawn shape (docs/architecture-briefs/
# 2026-08-04-cadence-rationalization.md §8 item 7). CONSISTENCY row, no
# concrete waste claimed by the owning brief: the live scorecard's own
# run_ts is already stale relative to "today" as of this row landing, so
# this gate SPAWNs on its first real invocations — it starts mattering once
# orch-sentinel resumes a live daily cadence, not before. Do not manufacture
# a saving that was not measured.
#
# ALL_GREEN — reuses auditor-tier1-probe.sh's OWN run_probe() infra checks
# VERBATIM (sourced below, called with "suppress_heartbeat" so Tier-1's own
# docs/data/auditor-tier1-last-healthy.json is NEVER touched by this script —
# the SAME non-interference contract Tier-2/3 already use for their own
# tiered heartbeat files). Same predicate, zero drift risk — AC-3: "not a
# re-invented predicate".
#
# HEARTBEAT — orch-sentinel already writes ONE durable freshness marker on
# every REAL cycle (LITE or FULL alike — FULL's own Mode Dispatch runs OH-1
# first, so a recent FULL run confirms OH-1 exactly like a LITE run does):
# docs/data/orch-sentinel-scorecard.md's own trailing
# `<!-- OH-STATE: {"run_ts": "<ISO-UTC>", ...} -->` block (docs/agents/
# orch-sentinel/flow/main.md Step 0b: "the ONLY history mechanism"). Reused
# AS-IS, read-only — no new write path added to orch-sentinel's own flow
# files (out of this row's scope; the scorecard's existing run_ts is already
# exactly the signal this gate needs).
#
# Verdict/exit contract (mirrors Tier-2/3's --tier=N SKIP-SPAWN/SPAWN shape):
#   stdout: ONE line of valid JSON, FIRST thing printed:
#     {"verdict":"SKIP-SPAWN"|"SPAWN","checks_verdict":"ALL_GREEN"|"FAILURE",
#      "detail":"...","last_run_ts":"<ISO-UTC>"|null,
#      "fresh_threshold_minutes":2880,"run_age_minutes":N|null}
#   Exit 0 = SKIP-SPAWN: checks_verdict=ALL_GREEN AND last_run_ts parses AND
#     run_age_minutes <= fresh_threshold_minutes.
#   Exit 1 = SPAWN (FAIL-OPEN — never suppress a legitimate run on a probe
#     fault) on ANY of: checks_verdict=FAILURE, scorecard file missing, the
#     OH-STATE block missing/malformed, run_ts missing/unparseable, or
#     run_age_minutes > fresh_threshold_minutes.
#
# MODE=FULL is NEVER gated by this script (or anything else) — orch-sentinel's
# own Mode Dispatch (docs/agents/orch-sentinel/flow/main.md) is the only
# caller wired to invoke this probe, from the LITE branch only; the weekly
# FULL sweep runs unconditionally, unchanged (AC-4).
#
# fresh_threshold_minutes=2880 (2x LITE's own daily cadence) matches Tier-3's
# OWN threshold for its own identical daily cadence
# (auditor-tier1-probe.sh's _fresh_threshold_minutes_for_tier, tier=3 -> 2880)
# — reused directly, not re-derived from scratch.
#
# Env overrides (test seam — orch-sentinel-lite-probe.test.sh overrides
# run_probe() directly after sourcing this file, the SAME minimal-surface
# pattern every *-probe.test.sh in this directory uses for its own
# dependencies):
#   AUDITOR_TIER1_PROBE_SH — path to auditor-tier1-probe.sh (default: sibling
#     file in this same directory).
#   SCORECARD_PATH         — orch-sentinel-scorecard.md path (default: repo
#     docs/data/orch-sentinel-scorecard.md).
#
# HARD CONSTRAINT: read-only. Never writes any file — no heartbeat, no
# scorecard mutation. All checks are the SAME read-only probes
# auditor-tier1-probe.sh already uses (docker ps/stats, curl GET, df,
# launchctl list) plus a plain file read of the scorecard.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUDITOR_TIER1_PROBE_SH="${AUDITOR_TIER1_PROBE_SH:-$SCRIPT_DIR/auditor-tier1-probe.sh}"
SCORECARD_PATH="${SCORECARD_PATH:-$REPO_ROOT/docs/data/orch-sentinel-scorecard.md}"
FRESH_THRESHOLD_MINUTES=2880

# shellcheck source=./auditor-tier1-probe.sh
source "$AUDITOR_TIER1_PROBE_SH"

# ── Read orch-sentinel's OWN existing freshness marker — the trailing
# OH-STATE comment block's run_ts field. Prints the ISO timestamp on success
# (rc=0); prints nothing and returns 1 on file-missing / block-missing /
# field-missing-or-empty (all treated identically by the caller — fail open).
_scorecard_run_ts() {
  local block ts
  [ -f "$SCORECARD_PATH" ] || return 1
  block=$(grep -o '<!-- OH-STATE: {.*} -->' "$SCORECARD_PATH" 2>/dev/null | tail -1)
  [ -z "$block" ] && return 1
  ts=$(printf '%s' "$block" | sed -e 's/^<!-- OH-STATE: //' -e 's/ -->$//' | jq -r '.run_ts // empty' 2>/dev/null)
  [ -z "$ts" ] && return 1
  printf '%s' "$ts"
  return 0
}

run_orch_sentinel_lite_probe() {
  local infra_out checks_verdict detail_infra last_run_ts age_min verdict detail

  infra_out=$(run_probe "suppress_heartbeat")
  checks_verdict=$(printf '%s' "$infra_out" | jq -r '.verdict // empty' 2>/dev/null)
  detail_infra=$(printf '%s' "$infra_out" | jq -r '.detail // empty' 2>/dev/null)

  if [ "$checks_verdict" != "ALL_GREEN" ]; then
    jq -nc --arg v "SPAWN" --arg cv "${checks_verdict:-FAILURE}" \
      --arg d "infra checks not ALL_GREEN: ${detail_infra:-unreadable}" --argjson th "$FRESH_THRESHOLD_MINUTES" \
      '{verdict:$v, checks_verdict:$cv, detail:$d, last_run_ts:null, fresh_threshold_minutes:$th, run_age_minutes:null}'
    return 1
  fi

  last_run_ts=$(_scorecard_run_ts) || {
    jq -nc --arg v "SPAWN" --arg cv "ALL_GREEN" \
      --arg d "orch-sentinel-scorecard.md missing/unreadable or OH-STATE run_ts absent/malformed -- no freshness signal, fail-open" \
      --argjson th "$FRESH_THRESHOLD_MINUTES" \
      '{verdict:$v, checks_verdict:$cv, detail:$d, last_run_ts:null, fresh_threshold_minutes:$th, run_age_minutes:null}'
    return 1
  }

  age_min=$(_heartbeat_age_minutes "$last_run_ts") || {
    jq -nc --arg v "SPAWN" --arg cv "ALL_GREEN" \
      --arg d "OH-STATE run_ts unparseable: ${last_run_ts} -- fail-open" \
      --arg lrt "$last_run_ts" --argjson th "$FRESH_THRESHOLD_MINUTES" \
      '{verdict:$v, checks_verdict:$cv, detail:$d, last_run_ts:$lrt, fresh_threshold_minutes:$th, run_age_minutes:null}'
    return 1
  }

  if [ "$age_min" -le "$FRESH_THRESHOLD_MINUTES" ]; then
    verdict="SKIP-SPAWN"
  else
    verdict="SPAWN"
  fi
  detail="infra ALL_GREEN, OH-STATE run_ts age=${age_min}min vs threshold=${FRESH_THRESHOLD_MINUTES}min"

  jq -nc --arg v "$verdict" --arg cv "ALL_GREEN" --arg d "$detail" \
    --arg lrt "$last_run_ts" --argjson th "$FRESH_THRESHOLD_MINUTES" --argjson age "$age_min" \
    '{verdict:$v, checks_verdict:$cv, detail:$d, last_run_ts:$lrt, fresh_threshold_minutes:$th, run_age_minutes:$age}'
  [ "$verdict" = "SKIP-SPAWN" ] && return 0 || return 1
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_orch_sentinel_lite_probe
  exit $?
fi
