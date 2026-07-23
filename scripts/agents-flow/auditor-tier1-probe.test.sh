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

# Default LAUNCHD_DIR_PATH → an EXISTING but EMPTY directory. _check_launchd_
# agents() finds zero *.plist files in it and trivially PASSes — this keeps
# every pre-existing T1-T23 assertion below byte-identical (they were all
# written before check 6 existed and stub docker/curl/df only, never
# launchctl). The new launchd-specific tests (T24+) override this per-case
# to a fixture dir containing real plist fixtures.
LAUNCHD_EMPTY_DIR="$TMPDIR_TEST/launchd-empty"
mkdir -p "$LAUNCHD_EMPTY_DIR"
export LAUNCHD_DIR_PATH="$LAUNCHD_EMPTY_DIR"

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
check "T15 heartbeat checks object has 6 keys" "$([ "$(jq -r '.checks | keys | length' "$HEARTBEAT_FILE_PATH")" -eq 6 ] && echo true || echo false)"
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

# ── T16: Tier-2 idle steady-state — auditor-signal-loop-P1: heartbeat
# authorship moved to the system-auditor subagent's own end-of-cycle write,
# so this fixture must be PRE-SEEDED (simulating a real audit that already
# completed) before either call. Invoked twice with NO underlying delta
# between calls → BOTH calls return SKIP-SPAWN, exit 0 (no subagent spawn, no
# commit — this function makes no such calls ever), and the fixture file
# itself is left byte-identical (this script never re-authors it).
run_case
rm -f "$TIER2_HEARTBEAT"
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{last_healthy_at:$ts}' > "$TIER2_HEARTBEAT"
TIER2_SEEDED_LH=$(jq -r '.last_healthy_at' "$TIER2_HEARTBEAT")
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
check "T16 tier2 output last_healthy_at == the SEEDED (real-audit) timestamp, not a self-minted one" "$([ "$(printf '%s' "$OUT_T16B" | jq -r '.last_healthy_at')" = "$TIER2_SEEDED_LH" ] && echo true || echo false)"
check "T16 tier2 fixture file left UNTOUCHED by this script (authorship belongs to subagent only)" "$([ "$(jq -r '.last_healthy_at' "$TIER2_HEARTBEAT")" = "$TIER2_SEEDED_LH" ] && echo true || echo false)"

# ── T17: Tier-3 idle steady-state — same shape, 2880min (2x24h) threshold,
# same pre-seeding requirement as T16 ─────────────────────────────────────────
run_case
rm -f "$TIER3_HEARTBEAT"
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{last_healthy_at:$ts}' > "$TIER3_HEARTBEAT"
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

# ── T20: tier isolation — tier2 and tier3 heartbeat fixtures never collide.
# auditor-signal-loop-P1: this script no longer authors either file (that's
# now the subagent's job), so TIER2_HEARTBEAT is pre-seeded here (simulating
# a real Tier-2 audit already on disk) purely to prove run_tiered_probe(2)
# reads/reports from ITS OWN tier path only and never touches TIER3_HEARTBEAT.
run_case
rm -f "$TIER2_HEARTBEAT" "$TIER3_HEARTBEAT"
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{last_healthy_at:$ts}' > "$TIER2_HEARTBEAT"
HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" run_tiered_probe 2 >/dev/null
check "T20 tier2 reads/reports ONLY its own heartbeat fixture; tier3 fixture never created" "$([ -f "$TIER2_HEARTBEAT" ] && [ ! -f "$TIER3_HEARTBEAT" ] && echo true || echo false)"

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
# auditor-signal-loop-P1: pre-seed the fixture (simulates a real Tier-2 audit
# already recorded by the subagent) — the CLI subprocess no longer authors
# this file itself for tier 2/3.
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{last_healthy_at:$ts}' > "$CLI_HEARTBEAT"
CLI_SEEDED_LH=$(jq -r '.last_healthy_at' "$CLI_HEARTBEAT")

CLI_OUT1=$(PATH="$CLI_TMPDIR/bin:$PATH" SYSTEM_MAP_PATH="$FIXTURE_MAP" LAUNCHD_DIR_PATH="$LAUNCHD_EMPTY_DIR" HEARTBEAT_FILE_PATH="$CLI_HEARTBEAT" bash "$PROBE_SH" --tier=2); CLI_RC1=$?
CLI_OUT2=$(PATH="$CLI_TMPDIR/bin:$PATH" SYSTEM_MAP_PATH="$FIXTURE_MAP" LAUNCHD_DIR_PATH="$LAUNCHD_EMPTY_DIR" HEARTBEAT_FILE_PATH="$CLI_HEARTBEAT" bash "$PROBE_SH" --tier=2); CLI_RC2=$?
echo ""
echo "--- T22 CLI call 1 raw output ---"
printf '%s\n' "$CLI_OUT1"
echo "--- T22 CLI call 2 raw output (NO delta) ---"
printf '%s\n' "$CLI_OUT2"
check "T22 CLI call 1 verdict == SKIP-SPAWN" "$([ "$(printf '%s' "$CLI_OUT1" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T22 CLI call 1 exit=0" "$([ "$CLI_RC1" -eq 0 ] && echo true || echo false)"
check "T22 CLI call 2 (no delta) verdict == SKIP-SPAWN" "$([ "$(printf '%s' "$CLI_OUT2" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T22 CLI call 2 exit=0" "$([ "$CLI_RC2" -eq 0 ] && echo true || echo false)"
check "T22 CLI fixture file left UNTOUCHED across both calls (authorship belongs to subagent only)" "$([ "$(jq -r '.last_healthy_at' "$CLI_HEARTBEAT")" = "$CLI_SEEDED_LH" ] && echo true || echo false)"

# ── T23: CLI-level AC3 regression — no flag and --tier=1 both produce the
# original 3-field verdict via a REAL subprocess invocation ─────────────────
CLI_OUT_NOFLAG=$(PATH="$CLI_TMPDIR/bin:$PATH" SYSTEM_MAP_PATH="$FIXTURE_MAP" LAUNCHD_DIR_PATH="$LAUNCHD_EMPTY_DIR" HEARTBEAT_FILE_PATH="$TMPDIR_TEST/cli-tier1-noflag.json" bash "$PROBE_SH"); CLI_RC_NOFLAG=$?
CLI_OUT_TIER1=$(PATH="$CLI_TMPDIR/bin:$PATH" SYSTEM_MAP_PATH="$FIXTURE_MAP" LAUNCHD_DIR_PATH="$LAUNCHD_EMPTY_DIR" HEARTBEAT_FILE_PATH="$TMPDIR_TEST/cli-tier1-explicit.json" bash "$PROBE_SH" --tier=1); CLI_RC_TIER1=$?
check "T23 CLI no-flag verdict == ALL_GREEN (unchanged contract)" "$([ "$(printf '%s' "$CLI_OUT_NOFLAG" | jq -r '.verdict')" = "ALL_GREEN" ] && echo true || echo false)"
check "T23 CLI no-flag exit=0" "$([ "$CLI_RC_NOFLAG" -eq 0 ] && echo true || echo false)"
check "T23 CLI no-flag keys == {verdict,detail,last_healthy_at} only" "$([ "$(printf '%s' "$CLI_OUT_NOFLAG" | jq -r 'keys | sort | join(",")')" = "detail,last_healthy_at,verdict" ] && echo true || echo false)"
check "T23 CLI --tier=1 verdict == ALL_GREEN (identical to no-flag)" "$([ "$(printf '%s' "$CLI_OUT_TIER1" | jq -r '.verdict')" = "ALL_GREEN" ] && echo true || echo false)"
check "T23 CLI --tier=1 keys == {verdict,detail,last_healthy_at} only" "$([ "$(printf '%s' "$CLI_OUT_TIER1" | jq -r 'keys | sort | join(",")')" = "detail,last_healthy_at,verdict" ] && echo true || echo false)"

# ══════════════════════════════════════════════════════════════════════════════
# FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED — launchd_agents check 6 coverage
# ══════════════════════════════════════════════════════════════════════════════
# Root gap being closed: the OLD fb-daily-firer.plist WAS loaded and firing
# correctly 2026-07-01→07-04, then silently unloaded with nothing detecting
# it — the ~73h multi-day outage this self-check exists to catch before it
# recurs. Stubs `launchctl` (function-override, same pattern as docker/curl/
# df above) — zero real launchctl load/unload calls, read-only `list` only.

launchctl() {
  case "${1:-}" in
    list)
      case "${STUB_LAUNCHCTL:-ok}" in
        ok) printf '8750\t1\tcom.vn-market.docker-events\n-\t78\tcom.vn-market.fleet-push\n-\t0\tcom.vn-market.cowork-guaranteed-slot-firer\n' ;;
        missing_firer) printf '8750\t1\tcom.vn-market.docker-events\n-\t78\tcom.vn-market.fleet-push\n' ;;
        empty) printf '' ;;
      esac
      return 0
      ;;
    *) return 1 ;;
  esac
}

# Fixture launchd/ dir with ONE tracked plist — mirrors the repo's real
# launchd/com.vn-market.cowork-guaranteed-slot-firer.plist shape (Label key
# is the only field the check reads).
FIXTURE_LAUNCHD_DIR="$TMPDIR_TEST/launchd-fixture"
mkdir -p "$FIXTURE_LAUNCHD_DIR"
cat > "$FIXTURE_LAUNCHD_DIR/com.vn-market.cowork-guaranteed-slot-firer.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vn-market.cowork-guaranteed-slot-firer</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string></array>
</dict>
</plist>
EOF

# Second fixture dir with TWO tracked plists — for the "only the missing one
# is named in detail" multi-label assertion (T27).
FIXTURE_LAUNCHD_DIR_2="$TMPDIR_TEST/launchd-fixture-2"
mkdir -p "$FIXTURE_LAUNCHD_DIR_2"
cp "$FIXTURE_LAUNCHD_DIR/com.vn-market.cowork-guaranteed-slot-firer.plist" "$FIXTURE_LAUNCHD_DIR_2/"
cat > "$FIXTURE_LAUNCHD_DIR_2/com.vn-market.fleet-push.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vn-market.fleet-push</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string></array>
</dict>
</plist>
EOF

# ── T24: ALL_GREEN — tracked plist's label IS present in launchctl list ──────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR"
STUB_LAUNCHCTL="ok"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T24 ALL_GREEN — required LaunchAgent present in launchctl list" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T24 ALL_GREEN exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T24 heartbeat launchd_agents == PASS" "$([ "$(jq -r '.checks.launchd_agents' "$HEARTBEAT_FILE_PATH")" = "PASS" ] && echo true || echo false)"
check "T24 heartbeat checks object now has 6 keys (incl. launchd_agents)" "$([ "$(jq -r '.checks | keys | length' "$HEARTBEAT_FILE_PATH")" -eq 6 ] && echo true || echo false)"

# ── T25: INJECTED-FAULT — plist unloaded/hidden (label absent from
# launchctl list) → FAILURE verdict, detail names the missing label (per
# architecture brief §6.7 injected-fault requirement + feedback_fence_false_
# green discipline: prove the FAILURE path, not just the happy path) ────────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR"
STUB_LAUNCHCTL="missing_firer"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T25 INJECTED-FAULT FAILURE verdict (label silently unloaded)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T25 INJECTED-FAULT exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T25 INJECTED-FAULT detail mentions launchd_agents" "$([[ "$DETAIL" == *"launchd_agents"* ]] && echo true || echo false)"
check "T25 INJECTED-FAULT detail names the missing label" "$([[ "$DETAIL" == *"com.vn-market.cowork-guaranteed-slot-firer"* ]] && echo true || echo false)"
check "T25 INJECTED-FAULT does NOT write heartbeat file" "$([ ! -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"

# ── T26: RESTORE — same fixture, launchctl list now shows the label again →
# verdict returns to ALL_GREEN (brief §6.7 "restore and confirm ALL_GREEN") ──
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR"
STUB_LAUNCHCTL="ok"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T26 RESTORE — verdict back to ALL_GREEN after label reappears" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T26 RESTORE exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"

# ── T27: multi-label dir — only the ACTUALLY-missing label is named in
# detail; the still-loaded one is not falsely flagged ───────────────────────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_2"
STUB_LAUNCHCTL="missing_firer"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T27 multi-label FAILURE verdict" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T27 multi-label detail names ONLY the missing label" "$([[ "$DETAIL" == *"com.vn-market.cowork-guaranteed-slot-firer"* ]] && [[ "$DETAIL" != *"com.vn-market.fleet-push(not-loaded)"* ]] && echo true || echo false)"

# ── T28: launchd source dir itself missing (e.g. repo checkout without
# launchd/) — FAILURE, not a silent PASS ─────────────────────────────────────
run_case
LAUNCHD_DIR="$TMPDIR_TEST/does-not-exist-launchd-dir"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T28 missing launchd source dir — FAILURE verdict" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T28 missing launchd source dir — detail mentions launchd_agents" "$([[ "$DETAIL" == *"launchd_agents"* ]] && echo true || echo false)"

# ── T29: empty launchd dir (zero tracked plists) — trivially PASSes, same
# semantics the T1-T23 default fixture already relies on, asserted directly
# here as its own regression case ────────────────────────────────────────────
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T29 empty launchd dir — ALL_GREEN (zero required labels)" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"

# ── T30: CLI-level injected-fault — real subprocess invocation proves the
# EXACT `bash auditor-tier1-probe.sh` entrypoint contract for check 6, not
# just the sourced-function path ─────────────────────────────────────────────
cat > "$CLI_TMPDIR/bin/launchctl" <<'STUBEOF'
#!/usr/bin/env bash
case "$1" in
  list) printf '8750\t1\tcom.vn-market.docker-events\n-\t78\tcom.vn-market.fleet-push\n' ;;
esac
STUBEOF
chmod +x "$CLI_TMPDIR/bin/launchctl"
CLI_LAUNCHD_HEARTBEAT="$TMPDIR_TEST/cli-launchd-fault-heartbeat.json"
CLI_OUT_LAUNCHD_FAULT=$(PATH="$CLI_TMPDIR/bin:$PATH" SYSTEM_MAP_PATH="$FIXTURE_MAP" LAUNCHD_DIR_PATH="$FIXTURE_LAUNCHD_DIR" HEARTBEAT_FILE_PATH="$CLI_LAUNCHD_HEARTBEAT" bash "$PROBE_SH"); CLI_RC_LAUNCHD_FAULT=$?
check "T30 CLI injected-fault (real subprocess) — FAILURE verdict" "$([ "$(printf '%s' "$CLI_OUT_LAUNCHD_FAULT" | jq -r '.verdict')" = "FAILURE" ] && echo true || echo false)"
check "T30 CLI injected-fault (real subprocess) — exit=1" "$([ "$CLI_RC_LAUNCHD_FAULT" -eq 1 ] && echo true || echo false)"
check "T30 CLI injected-fault (real subprocess) — detail names missing label" "$([[ "$(printf '%s' "$CLI_OUT_LAUNCHD_FAULT" | jq -r '.detail')" == *"com.vn-market.cowork-guaranteed-slot-firer"* ]] && echo true || echo false)"

# ══════════════════════════════════════════════════════════════════════════════
# FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN — presence-only was a false
# green: a label could be PRESENT in `launchctl list` (loaded) yet crash-
# looping (non-zero last exit status) and the old check never noticed.
# ══════════════════════════════════════════════════════════════════════════════

# Fixture dir with ONLY the fleet-push plist tracked — isolates the
# loaded+nonzero-status case from every other label so the FAIL assertion
# below can't be satisfied by coincidence (e.g. a different label being
# absent).
FIXTURE_LAUNCHD_DIR_3="$TMPDIR_TEST/launchd-fixture-3"
mkdir -p "$FIXTURE_LAUNCHD_DIR_3"
cat > "$FIXTURE_LAUNCHD_DIR_3/com.vn-market.fleet-push.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vn-market.fleet-push</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string></array>
</dict>
</plist>
EOF

# Fixture dir with ONLY the obsolete socat-bridge plist tracked — proves the
# allow-list skip still applies even though this fix now also inspects
# status: an obsolete label must PASS regardless of presence OR status,
# because the check must `continue` before either is evaluated.
FIXTURE_LAUNCHD_DIR_OBSOLETE="$TMPDIR_TEST/launchd-fixture-obsolete"
mkdir -p "$FIXTURE_LAUNCHD_DIR_OBSOLETE"
cat > "$FIXTURE_LAUNCHD_DIR_OBSOLETE/com.vn-market.socat-bridge.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vn-market.socat-bridge</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string></array>
</dict>
</plist>
EOF

# ── T33: INJECTED-FAULT — label IS present (loaded) in launchctl list, but
# its Status column is non-zero (78 == EX_CONFIG, the live fleet-push
# incident this fix closes) → FAILURE verdict, detail names BOTH the label
# AND the exit code (not just "not-loaded" — presence alone is no longer
# sufficient) ─────────────────────────────────────────────────────────────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_3"
STUB_LAUNCHCTL="ok"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T33 INJECTED-FAULT FAILURE verdict (loaded but non-zero exit status)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T33 INJECTED-FAULT exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T33 INJECTED-FAULT detail mentions launchd_agents" "$([[ "$DETAIL" == *"launchd_agents"* ]] && echo true || echo false)"
check "T33 INJECTED-FAULT detail names the label" "$([[ "$DETAIL" == *"com.vn-market.fleet-push"* ]] && echo true || echo false)"
check "T33 INJECTED-FAULT detail names the exit code (78)" "$([[ "$DETAIL" == *"exit-status:78"* ]] && echo true || echo false)"
check "T33 INJECTED-FAULT does NOT falsely claim not-loaded (it IS loaded)" "$([[ "$DETAIL" != *"com.vn-market.fleet-push(not-loaded)"* ]] && echo true || echo false)"
check "T33 INJECTED-FAULT does NOT write heartbeat file" "$([ ! -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"

# ── T34: RESTORE (loaded+status0) — same fixture, status column back to "0"
# → verdict ALL_GREEN, proving the fix's happy path (loaded AND healthy)
# still passes cleanly ───────────────────────────────────────────────────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_3"
launchctl() {
  case "${1:-}" in
    list) printf -- '-\t0\tcom.vn-market.fleet-push\n' ;;
    *) return 1 ;;
  esac
  return 0
}
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T34 RESTORE — loaded+status0 verdict ALL_GREEN" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T34 RESTORE exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"

# Restore the STUB_LAUNCHCTL-driven launchctl() override for the remaining
# obsolete-allow-list case below.
launchctl() {
  case "${1:-}" in
    list)
      case "${STUB_LAUNCHCTL:-ok}" in
        ok) printf '8750\t1\tcom.vn-market.docker-events\n-\t78\tcom.vn-market.fleet-push\n-\t0\tcom.vn-market.cowork-guaranteed-slot-firer\n' ;;
        missing_firer) printf '8750\t1\tcom.vn-market.docker-events\n-\t78\tcom.vn-market.fleet-push\n' ;;
        empty) printf '' ;;
      esac
      return 0
      ;;
    *) return 1 ;;
  esac
}

# ── T35: obsolete-allow-listed + absent from launchctl list → PASS. The
# socat-bridge label is deliberately absent from every STUB_LAUNCHCTL
# scenario above (never appears in the "ok" fixture) — proves the allow-
# list skip fires BEFORE presence is even checked, so an obsolete label
# being unloaded is correctly a non-event, not a failure ──────────────────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_OBSOLETE"
STUB_LAUNCHCTL="ok"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T35 obsolete-allow-listed label absent from launchctl list — ALL_GREEN" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T35 obsolete-allow-listed exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"

# ══════════════════════════════════════════════════════════════════════════════
# auditor-signal-loop-P1 — the previously-DEAD "ALL_GREEN + stale heartbeat →
# SPAWN" branch is now reachable and meaningful (closes auditor-signal-loop-I1)
# ══════════════════════════════════════════════════════════════════════════════

# ── T31: green checks + a STALE pre-existing heartbeat (older than the
# tier's own freshness threshold) → verdict SPAWN, exit 1. Before this fix,
# run_probe() minted a fresh timestamp on every green pass and age was
# computed from that SAME just-written value — age was always ~0 and this
# branch could never fire. Proves: checks_verdict is genuinely ALL_GREEN
# (the shell checks pass) yet the cron-facing verdict is still SPAWN because
# no REAL Tier-2 audit authored a fresh heartbeat recently.
run_case
STALE_TIER2="$TMPDIR_TEST/auditor-tier2-stale-fixture.json"
jq -n --arg ts "2020-01-01T00:00:00Z" '{last_healthy_at:$ts}' > "$STALE_TIER2"
OUT_T31=$(HEARTBEAT_FILE_PATH="$STALE_TIER2" run_tiered_probe 2); RC_T31=$?
check "T31 tier2 ALL_GREEN checks + STALE heartbeat -> verdict SPAWN (dead branch now reachable)" "$([ "$(printf '%s' "$OUT_T31" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"
check "T31 tier2 ALL_GREEN checks + STALE heartbeat -> exit=1" "$([ "$RC_T31" -eq 1 ] && echo true || echo false)"
check "T31 tier2 ALL_GREEN checks + STALE heartbeat -> checks_verdict still ALL_GREEN (shell checks genuinely pass)" "$([ "$(printf '%s' "$OUT_T31" | jq -r '.checks_verdict')" = "ALL_GREEN" ] && echo true || echo false)"
check "T31 tier2 ALL_GREEN checks + STALE heartbeat -> heartbeat_age_minutes > fresh_threshold_minutes" "$([ "$(printf '%s' "$OUT_T31" | jq -r '.heartbeat_age_minutes')" -gt "$(printf '%s' "$OUT_T31" | jq -r '.fresh_threshold_minutes')" ] && echo true || echo false)"
check "T31 tier2 ALL_GREEN checks + STALE heartbeat -> does NOT rewrite the stale fixture" "$([ "$(jq -r '.last_healthy_at' "$STALE_TIER2")" = "2020-01-01T00:00:00Z" ] && echo true || echo false)"

# ── T32: green checks + NO pre-existing heartbeat at all (bootstrap /
# never-audited case) → treated as stale, verdict SPAWN, exit 1 — a first
# real Tier-3 audit must run before this gate can ever SKIP-SPAWN.
run_case
NEVER_TIER3="$TMPDIR_TEST/auditor-tier3-never-fixture.json"
rm -f "$NEVER_TIER3"
OUT_T32=$(HEARTBEAT_FILE_PATH="$NEVER_TIER3" run_tiered_probe 3); RC_T32=$?
check "T32 tier3 ALL_GREEN checks + NO prior heartbeat -> verdict SPAWN" "$([ "$(printf '%s' "$OUT_T32" | jq -r '.verdict')" = "SPAWN" ] && echo true || echo false)"
check "T32 tier3 ALL_GREEN checks + NO prior heartbeat -> exit=1" "$([ "$RC_T32" -eq 1 ] && echo true || echo false)"
check "T32 tier3 ALL_GREEN checks + NO prior heartbeat -> last_healthy_at == \"never\"" "$([ "$(printf '%s' "$OUT_T32" | jq -r '.last_healthy_at')" = "never" ] && echo true || echo false)"
check "T32 tier3 ALL_GREEN checks + NO prior heartbeat -> does NOT create the fixture file" "$([ ! -f "$NEVER_TIER3" ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
