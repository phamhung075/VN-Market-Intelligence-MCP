#!/usr/bin/env bash
# scripts/agents-flow/auditor-tier1-probe.test.sh
#
# Regression test for TOKEN-ECONOMY-TICK-PREFLIGHT WU-3 — exercises the
# ALL_GREEN / FAILURE verdict paths of auditor-tier1-probe.sh via stubbed
# `docker`/`curl`/`df` (function-override after sourcing, same pattern as
# WU-1/WU-2's `mcp_call` stubs), so NO real docker/network/disk calls are
# made. ALL probes in the real script are READ-ONLY (docker ps/stats, curl
# GET, df) — this test never restarts/stops/execs a container, only
# overrides the shell functions the script under test calls.
#
# Run:
#   bash scripts/agents-flow/auditor-tier1-probe.test.sh
#
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: TOKEN-ECONOMY-TICK-PREFLIGHT-WU-3
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROBE_SH="$SCRIPT_DIR/auditor-tier1-probe.sh"

if [ ! -f "$PROBE_SH" ]; then
  echo "ERROR: probe script not found at $PROBE_SH" >&2
  exit 1
fi

PASS=0
FAIL=0

check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

# ── Isolated tmp fixture (fixture system-map.json + heartbeat output path) ───
TMPDIR_TEST=$(mktemp -d /private/tmp/auditor-tier1-probe-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

FIXTURE_MAP="$TMPDIR_TEST/system-map.json"
cat > "$FIXTURE_MAP" <<'EOF'
{
  "project": {
    "infrastructure": {
      "docker": {
        "host_runtime_set": {
          "services": ["mcp-server", "frontend", "api-gateway"]
        }
      }
    }
  }
}
EOF

export SYSTEM_MAP_PATH="$FIXTURE_MAP"
export HEARTBEAT_FILE_PATH="$TMPDIR_TEST/auditor-tier1-last-healthy.json"

# ── Source the script under test (guard prevents auto-exec: $0 != BASH_SOURCE) ──
# shellcheck source=./auditor-tier1-probe.sh
source "$PROBE_SH"

# ── Stub docker/curl/df — override the real commands pulled in by the script ──
# Dispatch controlled by $STUB_DOCKER_PS / $STUB_DOCKER_NAME / $STUB_MEM /
# $STUB_H3000 / $STUB_H3001 / $STUB_DF (set per scenario below).
ALL_UP_PS='vn-market-intelligence-mcp-mcp-server-1\tUp 2 hours (healthy)
vn-market-intelligence-mcp-frontend-1\tUp 21 hours (healthy)
vn-market-intelligence-mcp-api-gateway-1\tUp 2 hours (healthy)'

docker() {
  local sub="$1"
  case "$sub" in
    ps)
      if [ "${2:-}" = "-a" ]; then
        case "${STUB_DOCKER_PS:-ok}" in
          ok) printf '%b\n' "$ALL_UP_PS" ;;
          one_down) printf '%b\n' "vn-market-intelligence-mcp-mcp-server-1\tExited (1) 5 minutes ago
vn-market-intelligence-mcp-frontend-1\tUp 21 hours (healthy)
vn-market-intelligence-mcp-api-gateway-1\tUp 2 hours (healthy)" ;;
          one_missing) printf '%b\n' "vn-market-intelligence-mcp-frontend-1\tUp 21 hours (healthy)
vn-market-intelligence-mcp-api-gateway-1\tUp 2 hours (healthy)" ;;
          empty) printf '' ;;
        esac
        return 0
      else
        case "${STUB_DOCKER_NAME:-ok}" in
          ok) echo "vn-market-intelligence-mcp-mcp-server-1" ;;
          missing) echo "" ;;
        esac
        return 0
      fi
      ;;
    stats)
      case "${STUB_MEM:-ok}" in
        ok) echo "12.34%" ;;
        high) echo "91.00%" ;;
        malformed) echo "n/a" ;;
        empty) echo "" ;;
      esac
      return 0
      ;;
    *) return 1 ;;
  esac
}

curl() {
  local url="${!#}"
  case "$url" in
    *:3000/health)
      [ "${STUB_H3000:-200}" = "TIMEOUT" ] && return 1
      printf '%s' "${STUB_H3000:-200}"
      ;;
    *:3001/)
      [ "${STUB_H3001:-200}" = "TIMEOUT" ] && return 1
      printf '%s' "${STUB_H3001:-200}"
      ;;
    *)
      printf '000'
      ;;
  esac
  return 0
}

df() {
  case "${STUB_DF:-ok}" in
    ok) printf 'Filesystem      Size  Used Avail Capacity iused ifree %%iused  Mounted on\n/dev/disk1s4s1  233Gi  13Gi  16Gi     47%%   393k  165M    0%%   /\n' ;;
    high) printf 'Filesystem      Size  Used Avail Capacity iused ifree %%iused  Mounted on\n/dev/disk1s4s1  233Gi 210Gi   3Gi     90%%   393k  165M    0%%   /\n' ;;
    malformed) printf 'garbage output with no percent column\n' ;;
    empty) printf '' ;;
  esac
  return 0
}

run_case() {
  # Resets scenario knobs to defaults before each test; wipes heartbeat fixture.
  STUB_DOCKER_PS="ok"; STUB_DOCKER_NAME="ok"; STUB_MEM="ok"
  STUB_H3000="200"; STUB_H3001="200"; STUB_DF="ok"
  rm -f "$HEARTBEAT_FILE_PATH"
}

# ── T1: ALL_GREEN — every check passes ────────────────────────────────────────
run_case
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
LAST_HEALTHY=$(printf '%s' "$OUT" | jq -r '.last_healthy_at')
check "T1 ALL_GREEN verdict" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T1 ALL_GREEN exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T1 ALL_GREEN last_healthy_at is ISO8601" "$([[ "$LAST_HEALTHY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] && echo true || echo false)"
check "T1 ALL_GREEN writes heartbeat file" "$([ -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"
check "T1 heartbeat last_healthy_at matches verdict" "$([ "$(jq -r '.last_healthy_at' "$HEARTBEAT_FILE_PATH")" = "$LAST_HEALTHY" ] && echo true || echo false)"
check "T1 heartbeat checks all PASS" "$([ "$(jq -r '[.checks[]] | unique | join(",")' "$HEARTBEAT_FILE_PATH")" = "PASS" ] && echo true || echo false)"

# ── T2: FAILURE — injected fault: docker ps shows mcp-server Exited ──────────
run_case
STUB_DOCKER_PS="one_down"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T2 FAILURE verdict (container Exited)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T2 FAILURE exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T2 FAILURE detail mentions docker_ps" "$([[ "$DETAIL" == *"docker_ps"* ]] && echo true || echo false)"
check "T2 FAILURE does NOT write heartbeat file" "$([ ! -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"

# ── T3: FAILURE — injected fault: docker ps missing a required service ───────
run_case
STUB_DOCKER_PS="one_missing"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T3 FAILURE verdict (service not found in docker ps)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"

# ── T4: FAILURE — injected fault: :3000/health curl times out ────────────────
run_case
STUB_H3000="TIMEOUT"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T4 FAILURE verdict (curl :3000/health timeout)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T4 FAILURE detail mentions health_3000" "$([[ "$DETAIL" == *"health_3000"* ]] && echo true || echo false)"

# ── T5: FAILURE — injected fault: :3000/health returns non-200 ───────────────
run_case
STUB_H3000="503"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T5 FAILURE verdict (curl :3000/health HTTP 503)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"

# ── T6: FAILURE — injected fault: :3001/ curl times out ──────────────────────
run_case
STUB_H3001="TIMEOUT"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T6 FAILURE verdict (curl :3001/ timeout)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T6 FAILURE detail mentions health_3001" "$([[ "$DETAIL" == *"health_3001"* ]] && echo true || echo false)"

# ── T7: FAILURE — injected fault: df shows disk >= 85% ───────────────────────
run_case
STUB_DF="high"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T7 FAILURE verdict (disk 90% >= 85% threshold)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T7 FAILURE detail mentions disk" "$([[ "$DETAIL" == *"disk"* ]] && echo true || echo false)"

# ── T8: FAILURE — injected fault: df output unparseable ──────────────────────
run_case
STUB_DF="malformed"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T8 FAILURE verdict (df output malformed)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"

# ── T9: FAILURE — injected fault: mcp-server container MemPerc >= 85% ────────
run_case
STUB_MEM="high"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T9 FAILURE verdict (mem creep 91%% >= 85%% threshold)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T9 FAILURE detail mentions mem_creep" "$([[ "$DETAIL" == *"mem_creep"* ]] && echo true || echo false)"

# ── T10: FAILURE — injected fault: mcp-server container not found ────────────
run_case
STUB_DOCKER_NAME="missing"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T10 FAILURE verdict (mcp-server container not found for mem check)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"

# ── T11: FAILURE — injected fault: docker stats returns unparseable MemPerc ──
run_case
STUB_MEM="malformed"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T11 FAILURE verdict (docker stats MemPerc unparseable)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"

# ── T12: passive-health-masking — FAILURE reports PREVIOUS last_healthy_at ───
run_case
# Seed a prior ALL_GREEN heartbeat, then inject a fault on the next run.
OUT=$(run_probe)
PREV_TS=$(printf '%s' "$OUT" | jq -r '.last_healthy_at')
STUB_DOCKER_PS="one_down"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
REPORTED_TS=$(printf '%s' "$OUT" | jq -r '.last_healthy_at')
check "T12 FAILURE verdict after prior ALL_GREEN" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T12 FAILURE last_healthy_at == PREVIOUS green timestamp (not updated)" "$([ "$REPORTED_TS" = "$PREV_TS" ] && echo true || echo false)"
check "T12 FAILURE leaves heartbeat file untouched (still holds prior green)" "$([ "$(jq -r '.last_healthy_at' "$HEARTBEAT_FILE_PATH")" = "$PREV_TS" ] && echo true || echo false)"

# ── T13: FAILURE — never-had-a-heartbeat reports "never" ─────────────────────
run_case
STUB_H3000="TIMEOUT"
OUT=$(run_probe)
LAST_HEALTHY=$(printf '%s' "$OUT" | jq -r '.last_healthy_at')
check "T13 FAILURE last_healthy_at == \"never\" (no prior heartbeat file)" "$([ "$LAST_HEALTHY" = "never" ] && echo true || echo false)"

# ── T14: heartbeat write failure downgrades an otherwise-green run to FAILURE ─
run_case
# Point HEARTBEAT_FILE at a path whose parent directory does not exist —
# mktemp/mv both fail, proving the script never claims green without a
# verified write ("not just process-up").
ORIG_HEARTBEAT_PATH="$HEARTBEAT_FILE"
HEARTBEAT_FILE="$TMPDIR_TEST/does-not-exist-dir/heartbeat.json"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T14 FAILURE verdict on heartbeat write failure" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T14 FAILURE exit=1 on heartbeat write failure" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T14 FAILURE detail mentions heartbeat write" "$([[ "$DETAIL" == *"heartbeat write"* ]] && echo true || echo false)"
HEARTBEAT_FILE="$ORIG_HEARTBEAT_PATH"

# ── T15: heartbeat checks object carries per-check PASS/FAIL granularity ─────
run_case
STUB_H3001="TIMEOUT"
run_probe >/dev/null
STUB_H3001="200"
OUT=$(run_probe)
check "T15 heartbeat checks object has 5 keys" "$([ "$(jq -r '.checks | keys | length' "$HEARTBEAT_FILE_PATH")" -eq 5 ] && echo true || echo false)"
check "T15 heartbeat health_3001 == PASS after recovery" "$([ "$(jq -r '.checks.health_3001' "$HEARTBEAT_FILE_PATH")" = "PASS" ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
