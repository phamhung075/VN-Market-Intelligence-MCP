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
#   2. curl -m3 http://localhost:3000/health == 200
#   3. curl -m3 http://localhost:3001/       == 200
#   4. df -h / capacity < 85% (WARN boundary reused from tier1-probe.md A-32
#      as this pre-gate's pass/fail line — anything >= 85% defers to the
#      subagent, which applies the full WARN/CRITICAL severity split)
#   5. mcp-server container mem creep: `docker stats --no-stream` MemPerc
#      < 85% (WARN boundary reused from A-30, same reasoning as #4 — a
#      single-point threshold, since this pure-shell gate has no baseline-
#      diff state store; a true trend/creep detector stays a Tier-2/3 job)
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
# curl/df as functions after sourcing; these path vars point the script at
# fixtures instead of the real repo files):
#   SYSTEM_MAP_PATH     — system-map.json path (default: repo docs/data/system-map.json)
#   HEARTBEAT_FILE_PATH — heartbeat output path (default: repo docs/data/auditor-tier1-last-healthy.json)
#
# HARD CONSTRAINT: every probe below is READ-ONLY (docker ps/stats, curl GET,
# df, jq). This script NEVER runs docker restart/stop/rm/exec-with-mutation
# anywhere, including its own test suite (auditor-tier1-probe.test.sh mocks
# docker/curl/df — zero real container calls in tests).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SYSTEM_MAP="${SYSTEM_MAP_PATH:-$REPO_ROOT/docs/data/system-map.json}"
HEARTBEAT_FILE="${HEARTBEAT_FILE_PATH:-$REPO_ROOT/docs/data/auditor-tier1-last-healthy.json}"
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
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${port}${path}" 2>/dev/null) || code="CURL_ERR"
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

run_probe() {
  local prev_healthy="" out rc failures="" checks_json ts
  local st_docker="PASS" st_h3000="PASS" st_h3001="PASS" st_disk="PASS" st_mem="PASS"

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

  checks_json=$(jq -n --arg d "$st_docker" --arg h1 "$st_h3000" --arg h2 "$st_h3001" --arg dk "$st_disk" --arg mc "$st_mem" \
    '{docker_ps:$d, health_3000:$h1, health_3001:$h2, disk:$dk, mem_creep:$mc}')

  if [ -z "$failures" ]; then
    ts=$(_now_iso)
    if ! _write_heartbeat "$ts" "$checks_json"; then
      jq -n --arg v "FAILURE" \
        --arg d "all 5 checks passed but heartbeat write FAILED ($HEARTBEAT_FILE) — never claim green without a verified write" \
        --arg lh "${prev_healthy:-never}" \
        '{verdict:$v, detail:$d, last_healthy_at:$lh}'
      return 1
    fi
    jq -n --arg v "ALL_GREEN" \
      --arg d "all 5 checks passed (docker_ps, health_3000, health_3001, disk, mem_creep)" \
      --arg lh "$ts" \
      '{verdict:$v, detail:$d, last_healthy_at:$lh}'
    return 0
  fi

  jq -n --arg v "FAILURE" --arg d "$failures" --arg lh "${prev_healthy:-never}" \
    '{verdict:$v, detail:$d, last_healthy_at:$lh}'
  return 1
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_probe
  exit $?
fi
