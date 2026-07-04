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

# ══════════════════════════════════════════════════════════════════════════════
# P1-IDLE-AUDITOR-TIER23-SCRIPT — Tier 2/3 generalization coverage
# ══════════════════════════════════════════════════════════════════════════════
# Own isolated heartbeat fixtures per tier (never the tier-1 file above) so
# these cases can't cross-contaminate T1-T15's ALREADY-PROVEN tier-1
# assertions (that's the regression evidence for AC3 — untouched, still
# green above, using the exact same run_probe() these new cases don't touch).
TIER2_HEARTBEAT="$TMPDIR_TEST/auditor-tier2-fixture.json"
TIER3_HEARTBEAT="$TMPDIR_TEST/auditor-tier3-fixture.json"

# ── T16: Tier-2 idle steady-state — invoked twice with NO underlying
# DB/heartbeat delta between calls → BOTH calls return SKIP-SPAWN, exit 0
# (no subagent spawn, no commit — this function makes no such calls ever).
run_case
rm -f "$TIER2_HEARTBEAT"
OUT_T16A=$(HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" run_tiered_probe 2); RC_T16A=$?
OUT_T16B=$(HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" run_tiered_probe 2); RC_T16B=$?
V16A=$(printf '%s' "$OUT_T16A" | jq -r '.verdict')
V16B=$(printf '%s' "$OUT_T16B" | jq -r '.verdict')
check "T16 tier2 call A verdict == SKIP-SPAWN" "$([ "$V16A" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T16 tier2 call A exit=0" "$([ "$RC_T16A" -eq 0 ] && echo true || echo false)"
check "T16 tier2 call B (no delta) verdict == SKIP-SPAWN" "$([ "$V16B" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T16 tier2 call B exit=0" "$([ "$RC_T16B" -eq 0 ] && echo true || echo false)"
check "T16 tier2 output carries tier:2" "$([ "$(printf '%s' "$OUT_T16B" | jq -r '.tier')" = "2" ] && echo true || echo false)"
check "T16 tier2 checks_verdict == ALL_GREEN under the hood" "$([ "$(printf '%s' "$OUT_T16B" | jq -r '.checks_verdict')" = "ALL_GREEN" ] && echo true || echo false)"
check "T16 tier2 fresh_threshold_minutes == 480 (2x4h cadence)" "$([ "$(printf '%s' "$OUT_T16B" | jq -r '.fresh_threshold_minutes')" = "480" ] && echo true || echo false)"

# ── T17: Tier-3 idle steady-state — same shape, 2880min (2x24h) threshold ────
run_case
rm -f "$TIER3_HEARTBEAT"
OUT_T17A=$(HEARTBEAT_FILE_PATH="$TIER3_HEARTBEAT" run_tiered_probe 3); RC_T17A=$?
OUT_T17B=$(HEARTBEAT_FILE_PATH="$TIER3_HEARTBEAT" run_tiered_probe 3); RC_T17B=$?
check "T17 tier3 call A verdict == SKIP-SPAWN" "$([ "$(printf '%s' "$OUT_T17A" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T17 tier3 call B (no delta) verdict == SKIP-SPAWN" "$([ "$(printf '%s' "$OUT_T17B" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T17 tier3 call B exit=0" "$([ "$RC_T17B" -eq 0 ] && echo true || echo false)"
check "T17 tier3 fresh_threshold_minutes == 2880 (2x24h cadence)" "$([ "$(printf '%s' "$OUT_T17B" | jq -r '.fresh_threshold_minutes')" = "2880" ] && echo true || echo false)"

# ── T18: Tier-2 FAILURE (a real fault) → verdict SPAWN, exit 1 (cron must
# still launch the subagent when checks actually fail — the gate must not
# mask a real problem) ────────────────────────────────────────────────────
run_case
STUB_DOCKER_PS="one_down"
rm -f "$TIER2_HEARTBEAT"
OUT_T18=$(HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" run_tiered_probe 2); RC_T18=$?
check "T18 tier2 FAILURE (docker down) verdict == SPAWN" "$([ "$(printf '%s' "$OUT_T18" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"
check "T18 tier2 FAILURE exit=1" "$([ "$RC_T18" -eq 1 ] && echo true || echo false)"
check "T18 tier2 FAILURE checks_verdict == FAILURE" "$([ "$(printf '%s' "$OUT_T18" | jq -r '.checks_verdict')" = "FAILURE" ] && echo true || echo false)"
check "T18 tier2 FAILURE detail mentions docker_ps" "$([[ "$(printf '%s' "$OUT_T18" | jq -r '.detail')" == *"docker_ps"* ]] && echo true || echo false)"

# ── T19: invalid --tier value rejected with ERROR verdict, exit 2 ───────────
run_case
OUT_T19=$(run_tiered_probe 9); RC_T19=$?
check "T19 invalid tier verdict == ERROR" "$([ "$(printf '%s' "$OUT_T19" | jq -r '.verdict')" = "ERROR" ] && echo true || echo false)"
check "T19 invalid tier exit=2" "$([ "$RC_T19" -eq 2 ] && echo true || echo false)"

# ── T20: tier isolation — tier2 and tier3 heartbeat fixtures never collide ──
run_case
rm -f "$TIER2_HEARTBEAT" "$TIER3_HEARTBEAT"
HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" run_tiered_probe 2 >/dev/null
check "T20 tier2 writes ONLY its own heartbeat file" "$([ -f "$TIER2_HEARTBEAT" ] && [ ! -f "$TIER3_HEARTBEAT" ] && echo true || echo false)"

# ── T21: AC3 regression proof — tier defaults to 1, --tier=1 explicit path
# calls run_probe() directly (same function T1-T15 already exercise above),
# with NO wrapping/new fields — byte-for-byte the pre-existing 3-field
# contract. This is a structural assertion (function identity), not a
# duplicate of T1-T15's behavioral assertions (already re-confirmed green
# above with zero code changes to run_probe()).
run_case
OUT_T21=$(run_probe)
check "T21 run_probe unchanged: still exactly {verdict,detail,last_healthy_at}" \
  "$([ "$(printf '%s' "$OUT_T21" | jq -r 'keys | sort | join(",")')" = "detail,last_healthy_at,verdict" ] && echo true || echo false)"

# ── T22: CLI-level integration — the EXACT invocation form from the
# acceptance criteria: `bash scripts/agents-flow/auditor-tier1-probe.sh
# --tier=2`, run as a REAL subprocess (not sourced) with docker/curl/df
# stubbed via PATH-shadowing binaries (function-override tricks only work
# when sourced — a real subprocess needs real executables on PATH). Invoked
# TWICE with NO delta (same fixture, same stub binaries, same heartbeat
# file) to directly demonstrate AC1's exact command + verdict both times.
CLI_TMPDIR=$(mktemp -d "$TMPDIR_TEST/cli-XXXXXX")
mkdir -p "$CLI_TMPDIR/bin"
cat > "$CLI_TMPDIR/bin/docker" <<'STUBEOF'
#!/usr/bin/env bash
case "$1" in
  ps)
    if [ "$2" = "-a" ]; then
      printf 'mcp-server\tUp 2 hours (healthy)\nfrontend\tUp 2 hours (healthy)\napi-gateway\tUp 2 hours (healthy)\n'
    else
      echo "mcp-server-container"
    fi
    ;;
  stats) echo "12.34%" ;;
esac
STUBEOF
cat > "$CLI_TMPDIR/bin/curl" <<'STUBEOF'
#!/usr/bin/env bash
printf '200'
STUBEOF
cat > "$CLI_TMPDIR/bin/df" <<'STUBEOF'
#!/usr/bin/env bash
echo 'Filesystem      Size  Used Avail Capacity iused ifree %iused  Mounted on'
echo '/dev/disk1s4s1  233Gi  13Gi  16Gi     47%   393k  165M    0%   /'
STUBEOF
chmod +x "$CLI_TMPDIR/bin/docker" "$CLI_TMPDIR/bin/curl" "$CLI_TMPDIR/bin/df"
CLI_HEARTBEAT="$CLI_TMPDIR/auditor-tier2-cli-fixture.json"
rm -f "$CLI_HEARTBEAT"

CLI_OUT1=$(PATH="$CLI_TMPDIR/bin:$PATH" SYSTEM_MAP_PATH="$FIXTURE_MAP" HEARTBEAT_FILE_PATH="$CLI_HEARTBEAT" bash "$PROBE_SH" --tier=2); CLI_RC1=$?
CLI_OUT2=$(PATH="$CLI_TMPDIR/bin:$PATH" SYSTEM_MAP_PATH="$FIXTURE_MAP" HEARTBEAT_FILE_PATH="$CLI_HEARTBEAT" bash "$PROBE_SH" --tier=2); CLI_RC2=$?
echo ""
echo "--- T22 CLI call 1 raw output ---"
printf '%s\n' "$CLI_OUT1"
echo "--- T22 CLI call 2 raw output (NO delta) ---"
printf '%s\n' "$CLI_OUT2"
check "T22 CLI call 1 verdict == SKIP-SPAWN" "$([ "$(printf '%s' "$CLI_OUT1" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T22 CLI call 1 exit=0" "$([ "$CLI_RC1" -eq 0 ] && echo true || echo false)"
check "T22 CLI call 2 (no delta) verdict == SKIP-SPAWN" "$([ "$(printf '%s' "$CLI_OUT2" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T22 CLI call 2 exit=0" "$([ "$CLI_RC2" -eq 0 ] && echo true || echo false)"

# ── T23: CLI-level AC3 regression — no flag and --tier=1 both produce the
# original 3-field verdict via a REAL subprocess invocation ─────────────────
CLI_OUT_NOFLAG=$(PATH="$CLI_TMPDIR/bin:$PATH" SYSTEM_MAP_PATH="$FIXTURE_MAP" HEARTBEAT_FILE_PATH="$TMPDIR_TEST/cli-tier1-noflag.json" bash "$PROBE_SH"); CLI_RC_NOFLAG=$?
CLI_OUT_TIER1=$(PATH="$CLI_TMPDIR/bin:$PATH" SYSTEM_MAP_PATH="$FIXTURE_MAP" HEARTBEAT_FILE_PATH="$TMPDIR_TEST/cli-tier1-explicit.json" bash "$PROBE_SH" --tier=1); CLI_RC_TIER1=$?
check "T23 CLI no-flag verdict == ALL_GREEN (unchanged contract)" "$([ "$(printf '%s' "$CLI_OUT_NOFLAG" | jq -r '.verdict')" = "ALL_GREEN" ] && echo true || echo false)"
check "T23 CLI no-flag exit=0" "$([ "$CLI_RC_NOFLAG" -eq 0 ] && echo true || echo false)"
check "T23 CLI no-flag keys == {verdict,detail,last_healthy_at} only" "$([ "$(printf '%s' "$CLI_OUT_NOFLAG" | jq -r 'keys | sort | join(",")')" = "detail,last_healthy_at,verdict" ] && echo true || echo false)"
check "T23 CLI --tier=1 verdict == ALL_GREEN (identical to no-flag)" "$([ "$(printf '%s' "$CLI_OUT_TIER1" | jq -r '.verdict')" = "ALL_GREEN" ] && echo true || echo false)"
check "T23 CLI --tier=1 keys == {verdict,detail,last_healthy_at} only" "$([ "$(printf '%s' "$CLI_OUT_TIER1" | jq -r 'keys | sort | join(",")')" = "detail,last_healthy_at,verdict" ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
