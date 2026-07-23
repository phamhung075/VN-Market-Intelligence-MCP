#!/usr/bin/env bash
# scripts/agents-flow/auditor-tier1-probe.sh
#
# TOKEN-ECONOMY-TICK-PREFLIGHT WU-3 — deterministic Tier-1 shell pre-gate for
# system-auditor's */30min cron tick. PURE SHELL (R9 — does NOT source
# scripts/agents-flow/mcp-call.sh; this gate needs no MCP calls, only
# docker/curl/df/jq, all READ-ONLY). Replaces the LLM-narrated "always spawn
# system-auditor subagent" step in .claude/skills/cron-detect-loop/SKILL.md
# Job 2 with one bash call on the common ALL_GREEN path.
# Spec: docs/agent-memory/decisions/sprint-TOKEN-ECONOMY-TICK-PREFLIGHT-pm.md
#       § WU-3, docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md (R9/R10/R11)
#
# Checks (thresholds mirror docs/agents/system-auditor/flow/tier1-probe.md
# A-01..A-32, narrowed to the two endpoints named in the WU-3 brief —
# mcp-server:3000 and frontend:3001 — the full 5-endpoint sweep + A-20
# pdf-extractor in-container multi-probe stay in the subagent's own
# probe.sh, unchanged, reached only on a non-ALL_GREEN verdict here):
#   1. docker ps health-state sweep — every service in system-map.json
#      .project.infrastructure.docker.host_runtime_set.services[] must show
#      "Up" in `docker ps -a`.
#   2. curl -m6 http://localhost:3000/health == 200
#   3. curl -m6 http://localhost:3001/       == 200
#      (FIX-AUDITOR-TIER1-PROBE-HEALTH-TIMEOUT-TIGHT 2026-07-12: bumped from
#      -m3 to -m6 — live-measured frontend-1 (:3001) baseline response time
#      is 2.0-2.2s with spikes to 3.4s, all server-side/no network delay; a
#      3s timeout left near-zero margin and randomly false-FAILed on
#      ordinary jitter, recurring 3-4x/session, each requiring a re-verify.
#      6s gives real margin without masking a genuinely hung service.)
#   4. df -h / capacity < 85% (WARN boundary reused from tier1-probe.md A-32
#      as this pre-gate's pass/fail line — anything >= 85% defers to the
#      subagent, which applies the full WARN/CRITICAL severity split)
#   5. mcp-server container mem creep: `docker stats --no-stream` MemPerc
#      < 85% (WARN boundary reused from A-30, same reasoning as #4 — a
#      single-point threshold, since this pure-shell gate has no baseline-
#      diff state store; a true trend/creep detector stays a Tier-2/3 job)
#   6. FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED — vn-market LaunchAgents
#      loaded: every repo-tracked `launchd/*.plist` Label (read off the
#      plist's own <key>Label</key>, never hardcoded — this repo's
#      launchd/ dir IS the SSOT of "what must be loaded") must appear in
#      `launchctl list` output. Closes the gap found in the 2026-07-07
#      cowork-guaranteed-slot-durability brief §2: the OLD fb-daily-firer
#      plist WAS loaded and firing correctly 2026-07-01→07-04, then
#      silently unloaded with nothing detecting it — the ~73h multi-day
#      outage this self-check exists to prevent from recurring.
#
# Verdict JSON (one line, stdout): {verdict, detail, last_healthy_at}.
#   verdict ∈ ALL_GREEN|FAILURE.
# Exit code: 0 = ALL_GREEN (heartbeat written, no subagent spawn needed).
#            1 = FAILURE (cron LLM spawns system-auditor subagent, full
#                Tier-1 flow unchanged from today).
# On FAILURE, last_healthy_at reports the PREVIOUS successful heartbeat
# timestamp (or "never") — NOT updated — so the passive-health-masking
# guard in cron-detect-loop/SKILL.md Job 2 can see exactly how stale things
# are on the very next tick, even if this run's own detail line is generic.
#
# Heartbeat (R10 — dedicated data file, NEVER the auditor notebook, to avoid
# a race with a live subagent's mutex-guarded notebook write): on ALL_GREEN
# only, atomically overwrite docs/data/auditor-tier1-last-healthy.json
# (tmp file + mv rename — never a raw `>` truncate-write). If the write
# itself fails, the run is downgraded to FAILURE (never claim green without
# a verified write — "not just process-up"). On FAILURE the file is left
# untouched, so its `last_healthy_at` age keeps growing — this is what lets
# the passive-health-masking guard detect a silently-dead probe (stale
# "green" is not green).
#
# Env overrides (test seams — auditor-tier1-probe.test.sh mocks docker/
# curl/df/launchctl as functions after sourcing; these path vars point the
# script at fixtures instead of the real repo files):
#   SYSTEM_MAP_PATH     — system-map.json path (default: repo docs/data/system-map.json)
#   HEARTBEAT_FILE_PATH — heartbeat output path (default: repo docs/data/auditor-tier1-last-healthy.json)
#   LAUNCHD_DIR_PATH    — directory of *.plist files to require-loaded (default: repo launchd/)
#
# HARD CONSTRAINT: every probe below is READ-ONLY (docker ps/stats, curl GET,
# df, launchctl list, jq). This script NEVER runs docker restart/stop/rm/
# exec-with-mutation or launchctl load/unload anywhere, including its own
# test suite (auditor-tier1-probe.test.sh mocks docker/curl/df/launchctl —
# zero real container/launchd calls in tests).
#
# P1-IDLE-AUDITOR-TIER23-SCRIPT (2026-07-04) — `--tier=1|2|3` generalization.
# Default (no flag) or `--tier=1`: 100% unchanged — calls run_probe() directly,
# same {verdict,detail,last_healthy_at} JSON, same exit codes, same default
# heartbeat file. This is the exact pre-existing Tier-1 behavior, untouched.
#
# `--tier=2`/`--tier=3`: routes through run_tiered_probe() instead, which
# reuses run_probe()'s SAME 6 checks (against a tier-specific heartbeat file,
# docs/data/auditor-tier<N>-last-healthy.json, same HEARTBEAT_FILE_PATH
# test-seam override — see _heartbeat_file_for_tier) and additionally
# applies, INSIDE the script, the SAME ALL_GREEN + fresh-heartbeat pre-spawn
# gate that today only exists as LLM narration in cron-detect-loop/SKILL.md
# Job 2 (the "passive-health-masking guard"). This makes the skip-spawn
# decision for Tier-2/3 deterministic and testable — evaluated BEFORE the
# cron would ever launch the system-auditor subagent (not merely before
# commit) — so a no-delta re-invocation short-circuits to SKIP-SPAWN and
# launches nothing.
#
# auditor-signal-loop-P1 (2026-07-16): the tier-specific heartbeat file is now
# read-only from this script's point of view — run_probe()'s write is
# suppressed for tier 2/3 (see run_probe()'s "suppress_heartbeat" arg) and
# freshness is computed from the PRE-EXISTING value read before run_probe()
# runs, never from a timestamp this pass is about to mint itself. Authorship
# of docs/data/auditor-tier<N>-last-healthy.json for tier 2/3 belongs solely
# to the system-auditor subagent's own end-of-cycle write on a REAL completed
# audit (docs/agents/system-auditor/flow/main.md) — this was the fix for the
# self-defeating gate where age was always ~0 because it was computed from a
# value this same pre-gate had just written, making SKIP-SPAWN unconditional
# on green and the "ALL_GREEN + stale heartbeat → SPAWN" branch dead code.
# Output contract for tier 2/3 (unchanged):
#   {tier, checks_verdict: ALL_GREEN|FAILURE (raw 5-check result),
#    verdict: SKIP-SPAWN|SPAWN (the cron-facing decision),
#    detail, last_healthy_at, fresh_threshold_minutes, heartbeat_age_minutes}
# Exit 0 = SKIP-SPAWN (checks_verdict=ALL_GREEN AND heartbeat fresh — no
#   subagent needed this tick). Exit 1 = SPAWN (checks_verdict=FAILURE, OR
#   ALL_GREEN but heartbeat stale/unparseable — cron should launch
#   system-auditor AUDIT_TIER=<N>).
# Freshness threshold = 2x each tier's own cron cadence (mirrors the "~2 tick
# periods" heuristic already in cron-detect-loop/SKILL.md Job 2):
#   tier1=60min (2x30min) — reference only, tier1 path never uses this since
#     it calls run_probe() directly and leaves the freshness gate to the LLM,
#     unchanged.
#   tier2=480min (2x4h), tier3=2880min (2x24h).
# Zero orch-state.json / commit interaction anywhere in this script — it only
# ever prints a verdict line; the caller (cron LLM prompt) decides whether to
# spawn a subagent or commit anything.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SYSTEM_MAP="${SYSTEM_MAP_PATH:-$REPO_ROOT/docs/data/system-map.json}"
HEARTBEAT_FILE="${HEARTBEAT_FILE_PATH:-$REPO_ROOT/docs/data/auditor-tier1-last-healthy.json}"
LAUNCHD_DIR="${LAUNCHD_DIR_PATH:-$REPO_ROOT/launchd}"
WARN_PCT=85

_now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# ── Check 1: docker ps health-state sweep (host_runtime_set) ─────────────────
_check_docker_ps() {
  local ps_out services svc line status bad=""
  ps_out=$(docker ps -a --format '{{.Names}}\t{{.Status}}' 2>/dev/null)
  if [ -z "$ps_out" ]; then
    echo "docker ps returned no output (docker unreachable?)"
    return 1
  fi
  services=$(jq -r '.project.infrastructure.docker.host_runtime_set.services[]' "$SYSTEM_MAP" 2>/dev/null)
  if [ -z "$services" ]; then
    echo "host_runtime_set unreadable from $SYSTEM_MAP"
    return 1
  fi
  while IFS= read -r svc; do
    [ -z "$svc" ] && continue
    line=$(printf '%s\n' "$ps_out" | grep -i "$svc" | head -1)
    if [ -z "$line" ]; then
      bad="${bad}${svc}(not-found) "
      continue
    fi
    status="${line#*$'\t'}"
    case "$status" in
      Up*) : ;;
      *) bad="${bad}${svc}(${status}) " ;;
    esac
  done <<< "$services"
  if [ -n "$bad" ]; then
    echo "down/unhealthy: $bad"
    return 1
  fi
  return 0
}

# ── Checks 2/3: health endpoints ──────────────────────────────────────────────
_check_health() {
  local port="$1" path="$2" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://localhost:${port}${path}" 2>/dev/null) || code="CURL_ERR"
  [ -z "$code" ] && code="CURL_ERR"
  if [ "$code" != "200" ]; then
    echo "http://localhost:${port}${path} -> HTTP ${code}"
    return 1
  fi
  return 0
}

# ── Check 4: disk headroom (df -h /, Capacity column) ─────────────────────────
_check_disk() {
  local df_out pct
  df_out=$(df -h / 2>/dev/null)
  if [ -z "$df_out" ]; then
    echo "df returned no output"
    return 1
  fi
  pct=$(printf '%s\n' "$df_out" | awk 'NR==2 {print $5}' | tr -d '%')
  if ! [[ "$pct" =~ ^[0-9]+$ ]]; then
    echo "could not parse Capacity% from df output: $(printf '%s' "$df_out" | tr '\n' ' ')"
    return 1
  fi
  if [ "$pct" -ge "$WARN_PCT" ]; then
    echo "disk ${pct}% >= ${WARN_PCT}% threshold (A-32 WARN boundary)"
    return 1
  fi
  return 0
}

# ── Check 5: mcp-server container mem creep (docker stats MemPerc) ───────────
_check_mem_creep() {
  local ctr pct_raw pct
  ctr=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i 'mcp-server' | head -1)
  if [ -z "$ctr" ]; then
    echo "mcp-server container not found via docker ps"
    return 1
  fi
  pct_raw=$(docker stats --no-stream --format '{{.MemPerc}}' "$ctr" 2>/dev/null)
  if [ -z "$pct_raw" ]; then
    echo "docker stats returned no output for $ctr"
    return 1
  fi
  pct=$(printf '%s' "$pct_raw" | tr -d '%' | tr -d '\n')
  if ! printf '%s' "$pct" | grep -Eq '^[0-9]+(\.[0-9]+)?$'; then
    echo "could not parse MemPerc from docker stats output: $pct_raw"
    return 1
  fi
  if awk -v p="$pct" -v w="$WARN_PCT" 'BEGIN{exit !(p>=w)}'; then
    echo "mcp-server mem ${pct}% >= ${WARN_PCT}% threshold (A-30 WARN boundary, mem-creep gate)"
    return 1
  fi
  return 0
}

# ── Check 6: vn-market LaunchAgents loaded (FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED) ──
# SSOT = this repo's own launchd/ directory: every *.plist file's own
# <key>Label</key> string is the required label, read directly off the
# file (never a hardcoded label list) — a new plist dropped into launchd/
# is covered automatically, zero script edits, same "no hardcode" pattern
# as the guaranteed-slot firer's matcher-driven design.
#
# OBSOLETE agents (kept in launchd/ for rollback reference only, not loaded in live system):
#   - com.vn-market.socat-bridge — RESOLVED 2026-06-06 per OPERATOR-ALERT-SOCAT-FIX.md
#     api-gateway Docker container now owns port :4000; socat band-aid was temporary fix
#
# FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN (2026-07-23): `launchctl list`
# prints three tab-separated columns — PID\tStatus\tLabel — and the OLD
# check only asserted the LABEL substring appeared anywhere in the output,
# discarding the Status column entirely. That let a job that IS loaded but
# crash-looping (non-zero last exit status, e.g. EX_CONFIG=78 for
# com.vn-market.fleet-push, confirmed live for 522 consecutive runs) report
# ALL_GREEN forever — presence != works. Now: match the LABEL column
# EXACTLY (field 3), then require its Status column (field 2) == "0". A
# present-but-unhealthy label fails with BOTH the label and its exit code
# named in the detail line, same as the pre-existing not-loaded failure
# shape. The obsolete-label allow-list below is untouched — those labels
# are skipped before either presence or status is evaluated.
_check_launchd_agents() {
  local dir="$LAUNCHD_DIR" plist label lc_out bad="" match_line status
  local obsolete_labels="com.vn-market.socat-bridge"
  if [ ! -d "$dir" ]; then
    echo "launchd source dir not found: $dir"
    return 1
  fi
  lc_out=$(launchctl list 2>/dev/null)
  if [ -z "$lc_out" ]; then
    echo "launchctl list returned no output"
    return 1
  fi
  for plist in "$dir"/*.plist; do
    [ -e "$plist" ] || continue
    label=$(awk '/<key>Label<\/key>/{getline; gsub(/.*<string>|<\/string>.*/,""); print; exit}' "$plist" 2>/dev/null)
    [ -z "$label" ] && continue
    # Skip obsolete agents (kept in repo for rollback reference, not loaded in live system)
    case "$label" in
      $obsolete_labels) continue ;;
    esac
    match_line=$(printf '%s\n' "$lc_out" | awk -F'\t' -v want="$label" '$3 == want {print; exit}')
    if [ -z "$match_line" ]; then
      bad="${bad}${label}(not-loaded) "
      continue
    fi
    status=$(printf '%s' "$match_line" | awk -F'\t' '{print $2}')
    if [ "$status" != "0" ]; then
      bad="${bad}${label}(exit-status:${status}) "
    fi
  done
  if [ -n "$bad" ]; then
    echo "launchd not loaded/unhealthy: $bad"
    return 1
  fi
  return 0
}

# ── Heartbeat write — atomic tmp-file + mv rename (R10) ───────────────────────
_write_heartbeat() {
  local ts="$1" checks_json="$2" tmp
  tmp="$(mktemp "${HEARTBEAT_FILE}.tmp.XXXXXX" 2>/dev/null)" || tmp="${HEARTBEAT_FILE}.tmp.$$"
  jq -n --arg ts "$ts" --argjson checks "$checks_json" '{last_healthy_at:$ts, checks:$checks}' > "$tmp" 2>/dev/null
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp" 2>/dev/null
    return 1
  fi
  chmod 644 "$tmp" 2>/dev/null
  mv -f "$tmp" "$HEARTBEAT_FILE" 2>/dev/null
}

# auditor-signal-loop-P1 (2026-07-16): optional first positional arg — pass
# the literal string "suppress_heartbeat" to skip the _write_heartbeat call
# below ENTIRELY (no mktemp/jq/mv attempted at all) instead of attempting-
# then-discarding a write. Used exclusively by run_tiered_probe() for tier
# 2/3, where heartbeat AUTHORSHIP belongs solely to the system-auditor
# subagent's own end-of-cycle write on a completed REAL audit (see
# docs/agents/system-auditor/flow/main.md), never to this deterministic shell
# pre-gate. Tier-1's direct callers (cron LLM, this script's own `--tier=1`/
# no-flag path, and every pre-existing test) pass no argument and are
# completely unaffected — identical write-on-green behavior as before.
# Deliberately NOT implemented as HEARTBEAT_FILE=/dev/null: _write_heartbeat's
# mktemp/jq would try to create /dev/null.tmp.* inside /dev, fail for any
# non-root caller, and silently downgrade every green run to FAILURE→SPAWN —
# the OPPOSITE of the intended effect.
run_probe() {
  local suppress_heartbeat="${1:-}"
  local prev_healthy="" out rc failures="" checks_json ts
  local st_docker="PASS" st_h3000="PASS" st_h3001="PASS" st_disk="PASS" st_mem="PASS" st_launchd="PASS"

  [ -f "$HEARTBEAT_FILE" ] && prev_healthy=$(jq -r '.last_healthy_at // empty' "$HEARTBEAT_FILE" 2>/dev/null)

  out=$(_check_docker_ps 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_docker="FAIL"; failures="${failures}docker_ps: ${out}; "; }

  out=$(_check_health 3000 /health 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_h3000="FAIL"; failures="${failures}health_3000: ${out}; "; }

  out=$(_check_health 3001 / 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_h3001="FAIL"; failures="${failures}health_3001: ${out}; "; }

  out=$(_check_disk 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_disk="FAIL"; failures="${failures}disk: ${out}; "; }

  out=$(_check_mem_creep 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_mem="FAIL"; failures="${failures}mem_creep: ${out}; "; }

  out=$(_check_launchd_agents 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_launchd="FAIL"; failures="${failures}launchd_agents: ${out}; "; }

  checks_json=$(jq -n --arg d "$st_docker" --arg h1 "$st_h3000" --arg h2 "$st_h3001" --arg dk "$st_disk" --arg mc "$st_mem" --arg ld "$st_launchd" \
    '{docker_ps:$d, health_3000:$h1, health_3001:$h2, disk:$dk, mem_creep:$mc, launchd_agents:$ld}')

  if [ -z "$failures" ]; then
    ts=$(_now_iso)
    if [ "$suppress_heartbeat" != "suppress_heartbeat" ]; then
      if ! _write_heartbeat "$ts" "$checks_json"; then
        jq -n --arg v "FAILURE" \
          --arg d "all 6 checks passed but heartbeat write FAILED ($HEARTBEAT_FILE) — never claim green without a verified write" \
          --arg lh "${prev_healthy:-never}" \
          '{verdict:$v, detail:$d, last_healthy_at:$lh}'
        return 1
      fi
    fi
    jq -n --arg v "ALL_GREEN" \
      --arg d "all 6 checks passed (docker_ps, health_3000, health_3001, disk, mem_creep, launchd_agents)" \
      --arg lh "$ts" \
      '{verdict:$v, detail:$d, last_healthy_at:$lh}'
    return 0
  fi

  jq -n --arg v "FAILURE" --arg d "$failures" --arg lh "${prev_healthy:-never}" \
    '{verdict:$v, detail:$d, last_healthy_at:$lh}'
  return 1
}

# ── Tier 2/3 generalization (P1-IDLE-AUDITOR-TIER23-SCRIPT) ───────────────────

# Per-tier heartbeat file path. Respects the SAME HEARTBEAT_FILE_PATH
# test-seam override run_probe() already honors (so a caller/test pointing
# HEARTBEAT_FILE_PATH at a fixture affects tier 2/3 exactly like tier 1
# already does); absent an override, each tier gets its own file so Tier-1's
# */30min heartbeat is never confused with Tier-2's 4h or Tier-3's daily one.
_heartbeat_file_for_tier() {
  local tier="$1"
  if [ -n "${HEARTBEAT_FILE_PATH:-}" ]; then
    printf '%s' "$HEARTBEAT_FILE_PATH"
  else
    printf '%s' "$REPO_ROOT/docs/data/auditor-tier${tier}-last-healthy.json"
  fi
}

# 2x each tier's own cron cadence (mirrors the "~2 tick periods" heuristic
# already used for Tier-1 in cron-detect-loop/SKILL.md Job 2).
_fresh_threshold_minutes_for_tier() {
  case "$1" in
    1) echo 60 ;;
    2) echo 480 ;;
    3) echo 2880 ;;
    *) return 1 ;;
  esac
}

# ISO8601 UTC (YYYY-MM-DDTHH:MM:SSZ) -> epoch seconds. Tries GNU `date -d`
# first (Linux/containers), falls back to BSD `date -j -f` (macOS) — same
# GNU/BSD dual-path pattern already used in dev-team-tick-preflight.test.sh.
_iso_to_epoch() {
  local iso="$1" epoch
  [ -z "$iso" ] && return 1
  epoch=$(date -u -d "$iso" +%s 2>/dev/null) && { printf '%s' "$epoch"; return 0; }
  epoch=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null) && { printf '%s' "$epoch"; return 0; }
  return 1
}

# Age of an ISO8601 timestamp in whole minutes vs now. Prints nothing (and
# returns 1) for "never"/empty/unparseable input — caller treats that as
# stale (never claim fresh without a parseable prior heartbeat).
_heartbeat_age_minutes() {
  local iso="$1" epoch now
  if [ -z "$iso" ] || [ "$iso" = "never" ]; then
    return 1
  fi
  epoch=$(_iso_to_epoch "$iso") || return 1
  now=$(date -u +%s)
  echo $(( (now - epoch) / 60 ))
}

# Tier 2/3 entry point: reuses run_probe()'s SAME 6 checks (against a
# tier-specific file — see _heartbeat_file_for_tier), then applies the
# ALL_GREEN + fresh-heartbeat pre-spawn gate INSIDE the script (Tier-1 leaves
# this to the cron LLM narration in cron-detect-loop/SKILL.md Job 2; here it
# is deterministic and testable). `local HEARTBEAT_FILE=` below shadows the
# global for the duration of this call ONLY — bash dynamic scoping means
# run_probe() (called from inside this function) sees the tier-specific
# path, while every other caller of run_probe() (the tier-1 path) is
# completely unaffected.
#
# auditor-signal-loop-P1 (2026-07-16, closes auditor-signal-loop-I1): the
# heartbeat file is READ-ONLY from this function's perspective. Freshness is
# computed from the PRE-EXISTING last_healthy_at read BEFORE run_probe() runs
# (captured into pre_existing_lh below); run_probe() itself is called with
# "suppress_heartbeat" so it never writes this file for tier 2/3 — only the
# system-auditor subagent's own end-of-cycle write (on a REAL completed
# audit) ever updates docs/data/auditor-tier<N>-last-healthy.json. Previously
# run_probe() wrote a fresh timestamp on every green pass AND that same
# just-written value was used to compute age — age was always ~0, making
# SKIP-SPAWN unconditional on green and the "ALL_GREEN + stale heartbeat →
# SPAWN" branch below unreachable dead code. That branch is now reachable:
# real shell checks can be ALL_GREEN while the pre-existing heartbeat is
# stale (no real audit ran recently), correctly forcing SPAWN.
run_tiered_probe() {
  local tier="$1"
  local threshold_min heartbeat_path inner_out inner_rc
  local checks_verdict detail age_min="" spawn_verdict exit_code age_json
  local pre_existing_lh=""

  threshold_min=$(_fresh_threshold_minutes_for_tier "$tier") || {
    jq -n --arg d "invalid --tier value (must be 1, 2, or 3): $tier" \
      '{verdict:"ERROR", detail:$d, last_healthy_at:"never"}'
    return 2
  }

  heartbeat_path="$(_heartbeat_file_for_tier "$tier")"
  local HEARTBEAT_FILE="$heartbeat_path"

  # (a) Read the PRE-EXISTING heartbeat BEFORE calling run_probe() — this is
  # the last REAL audit's timestamp, never a value this pass is about to mint.
  [ -f "$heartbeat_path" ] && pre_existing_lh=$(jq -r '.last_healthy_at // empty' "$heartbeat_path" 2>/dev/null)

  # (b) Shell checks still run in full (checks_verdict reflects them exactly
  # as before); "suppress_heartbeat" stops the inner call from writing
  # $HEARTBEAT_FILE — see run_probe()'s header comment for why this is an
  # explicit flag arg, not HEARTBEAT_FILE=/dev/null.
  inner_out=$(run_probe "suppress_heartbeat"); inner_rc=$?
  checks_verdict=$(printf '%s' "$inner_out" | jq -r '.verdict // empty' 2>/dev/null)
  detail=$(printf '%s' "$inner_out" | jq -r '.detail // empty' 2>/dev/null)

  if [ "$checks_verdict" = "ALL_GREEN" ]; then
    age_min=$(_heartbeat_age_minutes "$pre_existing_lh") || age_min=""
    if [[ "$age_min" =~ ^[0-9]+$ ]] && [ "$age_min" -le "$threshold_min" ]; then
      spawn_verdict="SKIP-SPAWN"; exit_code=0
    else
      spawn_verdict="SPAWN"; exit_code=1
    fi
  else
    spawn_verdict="SPAWN"; exit_code=1
  fi

  if [[ "$age_min" =~ ^[0-9]+$ ]]; then
    age_json="$age_min"
  else
    age_json="null"
  fi

  jq -n --argjson tier "$tier" --arg checks_verdict "${checks_verdict:-FAILURE}" --arg verdict "$spawn_verdict" \
    --arg detail "$detail" --arg lh "${pre_existing_lh:-never}" --argjson threshold "$threshold_min" --argjson age "$age_json" \
    '{tier:$tier, checks_verdict:$checks_verdict, verdict:$verdict, detail:$detail, last_healthy_at:$lh, fresh_threshold_minutes:$threshold, heartbeat_age_minutes:$age}'
  return $exit_code
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  TIER=1
  for arg in "$@"; do
    case "$arg" in
      --tier=*) TIER="${arg#--tier=}" ;;
      *) : ;; # forward-compatible: ignore unrecognized args
    esac
  done

  case "$TIER" in
    1)
      run_probe
      exit $?
      ;;
    2|3)
      run_tiered_probe "$TIER"
      exit $?
      ;;
    *)
      jq -n --arg d "invalid --tier value (must be 1, 2, or 3): $TIER" \
        '{verdict:"ERROR", detail:$d, last_healthy_at:"never"}'
      exit 2
      ;;
  esac
fi
