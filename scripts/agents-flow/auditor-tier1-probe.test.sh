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
# FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-MACHINE-VERDICT (ARM B) —
# isolated scratch path, mirrors HEARTBEAT_FILE_PATH above. NEVER the live
# docs/data/auditor-tier1-last-trigger.json — every run_probe()/CLI
# invocation below inherits this exported override.
export TRIGGER_FILE_PATH="$TMPDIR_TEST/auditor-tier1-last-trigger.json"
# FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT — isolated scratch path,
# same hermeticity discipline as TRIGGER_FILE_PATH/HEARTBEAT_FILE_PATH above.
# NEVER the live docs/data/auditor-tier1-spawn-debounce.json — without this
# override every FAILURE-path test below would silently read/write the real
# repo ledger file (confirmed live: an unguarded run polluted it with 12
# scratch entries before this override was added).
export SPAWN_DEBOUNCE_FILE_PATH="$TMPDIR_TEST/auditor-tier1-spawn-debounce.json"

# FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE: _check_mem_creep() now
# sleeps MEM_CREEP_SAMPLE_INTERVAL_SEC between samples (real default 2s) —
# override to 0 BEFORE sourcing so every one of T1-T53's pre-existing cases
# (which all take the new default MEM_CREEP_SAMPLES=2 sampling path) stays
# instant. Left unset: MEM_CREEP_SAMPLES resolves to the script's own
# default (2).
export MEM_CREEP_SAMPLE_INTERVAL_SEC="0"

# Default LAUNCHD_DIR_PATH → an EXISTING but EMPTY directory. _check_launchd_
# agents() finds zero *.plist files in it and trivially PASSes — this keeps
# every pre-existing T1-T23 assertion below byte-identical (they were all
# written before check 6 existed and stub docker/curl/df only, never
# launchctl). The new launchd-specific tests (T24+) override this per-case
# to a fixture dir containing real plist fixtures.
LAUNCHD_EMPTY_DIR="$TMPDIR_TEST/launchd-empty"
mkdir -p "$LAUNCHD_EMPTY_DIR"
export LAUNCHD_DIR_PATH="$LAUNCHD_EMPTY_DIR"

# Default LAUNCHD_ACK_PATH → a path that deliberately does NOT exist. The
# real repo now ships docs/data/auditor-launchd-ack.json (with live
# docker-events/fleet-push entries) — without this override every T1-T35
# case below would silently pick that file up via the script's own
# LAUNCHD_ACK_PATH:-default fallback and could flip a pre-existing FAILURE
# assertion to ALL_GREEN by coincidence. Pointing at a nonexistent path
# keeps `ack_labels` empty for every case below (byte-identical to
# pre-FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION behavior); the
# new ack-ledger-specific tests (T36+) override $LAUNCHD_ACK per-case, same
# pattern as $LAUNCHD_DIR.
export LAUNCHD_ACK_PATH="$TMPDIR_TEST/no-such-ack-ledger.json"

# Default ORCH_STATE_PATH → a small fixture task_board carrying every
# tracked_by id the pre-existing T36/T40 ack fixtures already reference
# (FIX-LAUNCHD-DOCKER-EVENTS-EXIT1-CRASHLOOP, FIX-FLEET-PUSH-LAUNCHD-
# EXCONFIG-SILENT-DEAD, RAG-FTS-BUILD-MEMORY-BOUND), each at a LIVE
# (non-DONE_VERIFIED) status. FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-
# TRACKEDBY: without this override, _task_status_in_orch_state() would
# silently fall through to the REAL repo docs/data/orch/orch-state.json —
# proven to happen (T36/T40 passed against the LIVE board before this
# fixture existed, purely because those 3 ids happen to be non-terminal
# TODAY) and exactly the hermeticity gap this fixture closes: a real board
# row later reaching DONE_VERIFIED would silently flip these pre-existing
# assertions to FAILURE with zero change to this test file. The new
# staleness-specific tests (T44+) override $ORCH_STATE per-case, same
# pattern as $LAUNCHD_DIR/$LAUNCHD_ACK.
FIXTURE_ORCH_STATE_DEFAULT="$TMPDIR_TEST/orch-state-default.json"
jq -n '{task_board:{
  backlog:[
    {id:"FIX-LAUNCHD-DOCKER-EVENTS-EXIT1-CRASHLOOP", status:"BACKLOG"},
    {id:"FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD", status:"BACKLOG"},
    {id:"RAG-FTS-BUILD-MEMORY-BOUND", status:"BACKLOG"}
  ],
  ready:[], in_progress:[], review:[], qa:[], done:[], done_verified:[], archive:[],
  active_sprints:[], closed_sprints:[]
}}' > "$FIXTURE_ORCH_STATE_DEFAULT"
export ORCH_STATE_PATH="$FIXTURE_ORCH_STATE_DEFAULT"

# ── Source the script under test (guard prevents auto-exec: $0 != BASH_SOURCE) ──
# shellcheck source=./auditor-tier1-probe.sh
source "$PROBE_SH"

# Save the script's resolved default (ORCH_STATE_PATH:-default fallback
# applied) so per-case overrides below (T44+) can restore it afterward,
# same pattern as LAUNCHD_DIR/LAUNCHD_ACK already established.
DEFAULT_ORCH_STATE="$ORCH_STATE"

# ── Stub docker/curl/df — override the real commands pulled in by the script ──
# Dispatch controlled by $STUB_DOCKER_PS / $STUB_MEM_FLEET / $STUB_MEM_MCPSERVER
# / $STUB_MEM_RAG / $STUB_H3000 / $STUB_H3001 / $STUB_DF (set per scenario below).
ALL_UP_PS='vn-market-intelligence-mcp-mcp-server-1\tUp 2 hours (healthy)
vn-market-intelligence-mcp-frontend-1\tUp 21 hours (healthy)
vn-market-intelligence-mcp-api-gateway-1\tUp 2 hours (healthy)'

# FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE (2026-07-25): the mem
# check now drives itself off `docker ps -q` + `docker inspect` instead of a
# single hardcoded name. Default fixture fleet (STUB_MEM_FLEET="ok") is 3
# containers mirroring the real live fleet's shape: mcp-server (capped,
# steady-state via $STUB_MEM_MCPSERVER), rag-service (capped, via
# $STUB_MEM_RAG), mcp-gateway (UNCAPPED — Memory=0, must always be skipped
# regardless of its own MemPerc, proving acceptance (4)).

# FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE: _check_mem_creep() now
# calls `docker stats` MEM_CREEP_SAMPLES (>=2) times per container within
# ONE _check_mem_creep() invocation. STUB_MEM_* values may now be a
# comma-separated SEQUENCE (e.g. "70.00,99.91") — the Nth `docker stats` call
# for that container returns the Nth list entry (clamped to the last entry
# once the list is exhausted, so a plain single value like "93.67" — every
# T1-T53 fixture — behaves EXACTLY as before: same value on every sample).
# Counter is FILE-based (not an in-shell var/array) — `docker stats` is
# invoked as `pct_raw=$(docker stats ...)` inside the script under test,
# and command substitution always forks a subshell, so any in-memory
# counter mutated inside that call would be silently discarded on return
# (each call would see the SAME starting state, never advancing). A file
# under $TMPDIR_TEST survives across forks; reset in run_case() so counts
# never leak across test cases.
_next_mem_stub() {
  local key="$1" list="$2" cfile idx arr n
  cfile="$TMPDIR_TEST/.stats-call-${key}"
  idx=0
  [ -f "$cfile" ] && idx=$(cat "$cfile" 2>/dev/null)
  [[ "$idx" =~ ^[0-9]+$ ]] || idx=0
  IFS=',' read -ra arr <<< "$list"
  n=${#arr[@]}
  [ "$idx" -ge "$n" ] && idx=$((n - 1))
  printf '%s' "${arr[$idx]}"
  echo $((idx + 1)) > "$cfile"
}

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
      elif [ "${2:-}" = "-q" ]; then
        case "${STUB_MEM_FLEET:-ok}" in
          ok) printf 'id-mcp-server\nid-rag-service\nid-gateway\n' ;;
          # FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT (T-DEBOUNCE): a
          # fleet shaped like the LIVE 2026-08-24 incident this row exists
          # to debounce — pdf-extractor (unacked, real container) + the SAME
          # rag-service acked container the "ok" fleet already carries.
          pdfx) printf 'id-pdf-extractor\nid-rag-service\n' ;;
          empty) printf '' ;;
        esac
        return 0
      fi
      return 0
      ;;
    inspect)
      case "${STUB_MEM_FLEET:-ok}" in
        ok)
          printf 'vn-market-intelligence-mcp-mcp-server-1 3221225472\n'
          printf 'vn-market-intelligence-mcp-rag-service-1 805306368\n'
          printf 'mcp-gateway 0\n'
          ;;
        pdfx)
          # 2.5 GiB cap, matches the live incident's own reported cap
          # (docs/architecture-briefs/2026-08-24-fix-auditor-tier1-spawn-debounce.md
          # §0: "anon-rss 2.37 GiB against a 2.5 GiB cap").
          printf 'vn-market-intelligence-mcp-pdf-extractor-1 2684354560\n'
          printf 'vn-market-intelligence-mcp-rag-service-1 805306368\n'
          ;;
        empty) printf '' ;;
      esac
      return 0
      ;;
    stats)
      local name="${!#}" val
      case "$name" in
        *mcp-server*) val=$(_next_mem_stub "mcpserver" "${STUB_MEM_MCPSERVER:-12.34}") ;;
        *rag-service*) val=$(_next_mem_stub "rag" "${STUB_MEM_RAG:-20.00}") ;;
        *gateway*) val=$(_next_mem_stub "gateway" "${STUB_MEM_GATEWAY:-0.28}") ;;
        *pdf-extractor*) val=$(_next_mem_stub "pdfx" "${STUB_MEM_PDFX:-12.00}") ;;
        *) val=$(_next_mem_stub "other" "${STUB_MEM_OTHER:-1.00}") ;;
      esac
      printf '%s%%\n' "$val"
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
  STUB_DOCKER_PS="ok"
  STUB_MEM_FLEET="ok"; STUB_MEM_MCPSERVER="12.34"; STUB_MEM_RAG="20.00"; STUB_MEM_GATEWAY="0.28"
  STUB_H3000="200"; STUB_H3001="200"; STUB_DF="ok"
  rm -f "$HEARTBEAT_FILE_PATH"
  # FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE: wipe the per-container
  # docker-stats sample-sequence counters so each test case's samples start
  # fresh at index 0 (see _next_mem_stub above).
  rm -f "$TMPDIR_TEST"/.stats-call-*
  # FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT: wipe the debounce ledger
  # so each test case's spawn_decision starts fresh (no prior signature).
  # T-DEBOUNCE tests that deliberately want cross-call ledger state call
  # run_probe() twice within the SAME test case (no intervening run_case()).
  rm -f "$SPAWN_DEBOUNCE_FILE_PATH"
  unset SPAWN_DEBOUNCE_WINDOW_MIN
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
# FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-MACHINE-VERDICT (ARM B):
# the trigger file is written on EVERY genuine Tier-1 run, unlike the
# heartbeat (ALL_GREEN-only) — asserted here for the ALL_GREEN branch.
check "T1 ALL_GREEN also writes trigger file" "$([ -f "$TRIGGER_FILE_PATH" ] && echo true || echo false)"
check "T1 trigger file verdict=ALL_GREEN" "$([ "$(jq -r '.verdict' "$TRIGGER_FILE_PATH")" = "ALL_GREEN" ] && echo true || echo false)"
check "T1 trigger file checks all PASS (6 keys)" "$([ "$(jq -r '.checks | keys | length' "$TRIGGER_FILE_PATH")" -eq 6 ] && [ "$(jq -r '[.checks[]] | unique | join(",")' "$TRIGGER_FILE_PATH")" = "PASS" ] && echo true || echo false)"
check "T1 trigger file fire_tick is a */30min UTC boundary" "$([[ "$(jq -r '.fire_tick' "$TRIGGER_FILE_PATH")" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:(00|30)Z$ ]] && echo true || echo false)"

# ── T2: FAILURE — injected fault: docker ps shows mcp-server Exited ──────────
run_case
rm -f "$TRIGGER_FILE_PATH"
STUB_DOCKER_PS="one_down"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T2 FAILURE verdict (container Exited)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T2 FAILURE exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T2 FAILURE detail mentions docker_ps" "$([[ "$DETAIL" == *"docker_ps"* ]] && echo true || echo false)"
check "T2 FAILURE does NOT write heartbeat file" "$([ ! -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"
# ARM B: unlike the heartbeat, the trigger file IS written on FAILURE too —
# this is the whole point (a downstream Arm B check needs to see WHICH check
# failed, even on the common FAILURE-spawns-a-subagent path).
check "T2 FAILURE STILL writes trigger file" "$([ -f "$TRIGGER_FILE_PATH" ] && echo true || echo false)"
check "T2 trigger file verdict=FAILURE" "$([ "$(jq -r '.verdict' "$TRIGGER_FILE_PATH")" = "FAILURE" ] && echo true || echo false)"
check "T2 trigger file checks.docker_ps=FAIL" "$([ "$(jq -r '.checks.docker_ps' "$TRIGGER_FILE_PATH")" = "FAIL" ] && echo true || echo false)"
check "T2 trigger file checks.mem_creep=PASS (only docker_ps injected)" "$([ "$(jq -r '.checks.mem_creep' "$TRIGGER_FILE_PATH")" = "PASS" ] && echo true || echo false)"
check "T2 trigger file detail mentions docker_ps" "$([[ "$(jq -r '.detail' "$TRIGGER_FILE_PATH")" == *"docker_ps"* ]] && echo true || echo false)"

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

# ── T9: FAILURE — injected fault: rag-service container MemPerc >= 85%,
# NOT in the ack ledger (FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
# acceptance (1) — proves the widened scope actually sees a container OTHER
# than mcp-server, and never mislabels the breach as "mcp-server mem") ──────
run_case
STUB_MEM_RAG="93.67"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T9 FAILURE verdict (rag-service mem creep 93.67%% >= 85%% threshold)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T9 FAILURE detail mentions mem_creep" "$([[ "$DETAIL" == *"mem_creep"* ]] && echo true || echo false)"
check "T9 FAILURE detail names rag-service with its own percentage" "$([[ "$DETAIL" == *"rag-service"*"93.67%"* ]] && echo true || echo false)"
check "T9 FAILURE detail NEVER hardcodes mcp-server mem (old single-container string)" "$([[ "$DETAIL" != *"mcp-server mem"* ]] && echo true || echo false)"

# ── T10: FAILURE — injected fault: docker unreachable (docker ps -q returns
# no output) — loop must not crash, must FAIL loud, not silently PASS ──────
run_case
STUB_MEM_FLEET="empty"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T10 FAILURE verdict (docker ps -q unreachable for mem check)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T10 FAILURE detail mentions mem_creep" "$([[ "$DETAIL" == *"mem_creep"* ]] && echo true || echo false)"

# ── T11: FAILURE — injected fault: docker stats returns unparseable MemPerc ──
run_case
STUB_MEM_RAG="n/a"
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
# FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-MACHINE-VERDICT (ARM B):
# the Tier-1 trigger file must NEVER be touched by a tier2/3 call — its inner
# run_probe("suppress_heartbeat") invocation shares the SAME suppress gate as
# the heartbeat write. Wiped here so every tier2/3 case below (T16-T18 etc)
# can assert non-existence cleanly regardless of what T1/T2 above did.
rm -f "$TRIGGER_FILE_PATH"

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
check "T16 tier2 calls do NOT write the Tier-1 trigger file (suppress gate shared with heartbeat)" "$([ ! -f "$TRIGGER_FILE_PATH" ] && echo true || echo false)"

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
check "T17 tier3 calls ALSO do NOT write the Tier-1 trigger file" "$([ ! -f "$TRIGGER_FILE_PATH" ] && echo true || echo false)"

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
    elif [ "$2" = "-q" ]; then
      printf 'id-mcp-server\nid-rag-service\n'
    fi
    ;;
  inspect)
    printf 'mcp-server 3221225472\n'
    printf 'rag-service 805306368\n'
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
check "T23 CLI no-flag ALSO wrote the (inherited env) trigger file" "$([ -f "$TRIGGER_FILE_PATH" ] && [ "$(jq -r '.verdict' "$TRIGGER_FILE_PATH")" = "ALL_GREEN" ] && echo true || echo false)"

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

# ══════════════════════════════════════════════════════════════════════════════
# FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION — ACK LEDGER
# suppression coverage. Reuses the STUB_LAUNCHCTL="ok" scenario (already
# restored to its standard, STUB_LAUNCHCTL-driven definition right after
# T34) that reports the exact live incident this fix closes:
# com.vn-market.docker-events exit-1 + com.vn-market.fleet-push exit-78.
# ══════════════════════════════════════════════════════════════════════════════

FIXTURE_LAUNCHD_DIR_ACK_BOTH="$TMPDIR_TEST/launchd-fixture-ack-both"
mkdir -p "$FIXTURE_LAUNCHD_DIR_ACK_BOTH"
cat > "$FIXTURE_LAUNCHD_DIR_ACK_BOTH/com.vn-market.docker-events.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vn-market.docker-events</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string></array>
</dict>
</plist>
EOF
cp "$FIXTURE_LAUNCHD_DIR_3/com.vn-market.fleet-push.plist" "$FIXTURE_LAUNCHD_DIR_ACK_BOTH/"

FIXTURE_LAUNCHD_DIR_ACK_DOCKEREVENTS_ONLY="$TMPDIR_TEST/launchd-fixture-ack-dockerevents-only"
mkdir -p "$FIXTURE_LAUNCHD_DIR_ACK_DOCKEREVENTS_ONLY"
cp "$FIXTURE_LAUNCHD_DIR_ACK_BOTH/com.vn-market.docker-events.plist" "$FIXTURE_LAUNCHD_DIR_ACK_DOCKEREVENTS_ONLY/"

# Ledger fixtures — same {acked:[{label,tracked_by,acked_at}]} shape as the
# real docs/data/auditor-launchd-ack.json this fix ships.
ACK_FIXTURE_BOTH="$TMPDIR_TEST/ack-ledger-both.json"
jq -n '{acked:[
  {label:"com.vn-market.docker-events", tracked_by:"FIX-LAUNCHD-DOCKER-EVENTS-EXIT1-CRASHLOOP", acked_at:"2026-07-23T18:51:09Z"},
  {label:"com.vn-market.fleet-push", tracked_by:"FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD", acked_at:"2026-07-23T18:51:09Z"}
]}' > "$ACK_FIXTURE_BOTH"

ACK_FIXTURE_FLEETPUSH_ONLY="$TMPDIR_TEST/ack-ledger-fleetpush-only.json"
jq -n '{acked:[
  {label:"com.vn-market.fleet-push", tracked_by:"FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD", acked_at:"2026-07-23T18:51:09Z"}
]}' > "$ACK_FIXTURE_FLEETPUSH_ONLY"

ACK_FIXTURE_UNRELATED="$TMPDIR_TEST/ack-ledger-unrelated.json"
jq -n '{acked:[
  {label:"com.vn-market.some-other-agent", tracked_by:"FIX-SOME-OTHER-AGENT-UNRELATED", acked_at:"2026-07-23T18:51:09Z"}
]}' > "$ACK_FIXTURE_UNRELATED"

# ── T36: acknowledged-ONLY launchd failures (both docker-events exit-1 and
# fleet-push exit-78 are in the ack ledger) -> verdict stays ALL_GREEN, exit
# 0, no auditor spawn eligible, detail names both acknowledged labels for
# transparency, and the heartbeat valve behaves exactly like any other
# ALL_GREEN pass (still writes/refreshes — passive-health freshness gate is
# untouched by this fix, only what counts as "green" changed) ─────────────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_ACK_BOTH"
STUB_LAUNCHCTL="ok"
LAUNCHD_ACK="$ACK_FIXTURE_BOTH"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T36 acked-only launchd failures -> verdict ALL_GREEN" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T36 acked-only launchd failures -> exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T36 acked-only -> detail names docker-events (transparency)" "$([[ "$DETAIL" == *"com.vn-market.docker-events"* ]] && echo true || echo false)"
check "T36 acked-only -> detail names fleet-push (transparency)" "$([[ "$DETAIL" == *"com.vn-market.fleet-push"* ]] && echo true || echo false)"
check "T36 acked-only -> writes heartbeat file (passive-health valve unaffected)" "$([ -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"
check "T36 acked-only -> heartbeat checks.launchd_agents == PASS (enum schema unchanged)" "$([ "$(jq -r '.checks.launchd_agents' "$HEARTBEAT_FILE_PATH")" = "PASS" ] && echo true || echo false)"
check "T36 acked-only -> output is still exactly {verdict,detail,last_healthy_at} (no schema drift)" "$([ "$(printf '%s' "$OUT" | jq -r 'keys | sort | join(",")')" = "detail,last_healthy_at,verdict" ] && echo true || echo false)"

# ── T37: MIXED acked + new unacknowledged failure (fleet-push acked,
# docker-events NOT acked) -> verdict FAILURE, never suppress a genuinely
# new signature just because a sibling failure is acked ──────────────────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_ACK_BOTH"
STUB_LAUNCHCTL="ok"
LAUNCHD_ACK="$ACK_FIXTURE_FLEETPUSH_ONLY"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T37 mixed acked+new -> verdict FAILURE" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T37 mixed acked+new -> exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T37 mixed acked+new -> detail mentions launchd_agents" "$([[ "$DETAIL" == *"launchd_agents"* ]] && echo true || echo false)"
check "T37 mixed acked+new -> detail names the UNACKED docker-events failure" "$([[ "$DETAIL" == *"com.vn-market.docker-events(exit-status:1)"* ]] && echo true || echo false)"
check "T37 mixed acked+new -> does NOT write heartbeat file" "$([ ! -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"

# ── T38: ack ledger PRESENT but does not cover the failing label (docker-
# events fails; ledger only lists an unrelated label) -> verdict FAILURE —
# presence of SOME ledger must never blanket-suppress an uncovered failure ─
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_ACK_DOCKEREVENTS_ONLY"
STUB_LAUNCHCTL="ok"
LAUNCHD_ACK="$ACK_FIXTURE_UNRELATED"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T38 unacknowledged failure (ledger present, uncovered) -> verdict FAILURE" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T38 unacknowledged failure -> exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T38 unacknowledged failure -> detail names docker-events" "$([[ "$DETAIL" == *"com.vn-market.docker-events(exit-status:1)"* ]] && echo true || echo false)"

# ── T39: all-healthy WITH an ack ledger present (both tracked labels
# healthy this run) -> verdict ALL_GREEN, generic detail (no acknowledged
# noise when nothing is actually degraded) — proves the ledger's mere
# presence never manufactures a false note ─────────────────────────────────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_ACK_BOTH"
LAUNCHD_ACK="$ACK_FIXTURE_BOTH"
launchctl() {
  case "${1:-}" in
    list) printf -- '-\t0\tcom.vn-market.docker-events\n-\t0\tcom.vn-market.fleet-push\n' ;;
    *) return 1 ;;
  esac
  return 0
}
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T39 all-healthy + ack ledger present -> verdict ALL_GREEN" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T39 all-healthy + ack ledger present -> exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T39 all-healthy + ack ledger present -> detail carries NO acknowledged-degraded noise" "$([[ "$DETAIL" != *"acknowledged"* ]] && echo true || echo false)"

# Restore the STUB_LAUNCHCTL-driven launchctl() override + default (empty)
# LAUNCHD_ACK for any test appended after this section in the future.
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
LAUNCHD_ACK="$TMPDIR_TEST/no-such-ack-ledger.json"

# ══════════════════════════════════════════════════════════════════════════════
# FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE — acked_memory[] ledger
# coverage for the widened multi-container mem check. Reuses the SAME
# $LAUNCHD_ACK file/variable as the launchd arm above (one ledger, two
# arrays — see auditor-launchd-ack.json's `acked_memory` seed). Each case
# below explicitly resets LAUNCHD_DIR to the empty fixture dir so the
# launchd_agents check stays trivially green and every assertion below is
# isolated to mem_creep, same discipline T29 already established.
# ══════════════════════════════════════════════════════════════════════════════

ACK_FIXTURE_MEM_RAG="$TMPDIR_TEST/ack-ledger-mem-rag.json"
jq -n '{acked_memory:[
  {container:"rag-service", tracked_by:"RAG-FTS-BUILD-MEMORY-BOUND", acked_at:"2026-07-25T15:48:56Z"}
]}' > "$ACK_FIXTURE_MEM_RAG"

# ── T40: rag-service breach ACKED (tracked_by an OPEN row) -> verdict stays
# ALL_GREEN, rag-service named on the acknowledged-degraded line (NOT
# silently dropped), heartbeat still written — acceptance (2) ─────────────
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
STUB_MEM_RAG="93.67"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T40 acked rag-service breach -> verdict ALL_GREEN" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T40 acked rag-service breach -> exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T40 acked rag-service breach -> detail names rag-service (transparency, not silently dropped)" "$([[ "$DETAIL" == *"rag-service"* ]] && echo true || echo false)"
check "T40 acked rag-service breach -> detail carries its own percentage" "$([[ "$DETAIL" == *"93.67%"* ]] && echo true || echo false)"
check "T40 acked rag-service breach -> writes heartbeat file (passive-health valve unaffected)" "$([ -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"
check "T40 acked rag-service breach -> heartbeat checks.mem_creep == PASS (enum schema unchanged)" "$([ "$(jq -r '.checks.mem_creep' "$HEARTBEAT_FILE_PATH")" = "PASS" ] && echo true || echo false)"

# ── T41: MIXED — rag-service acked AND mcp-server forced over 85% (NOT
# acked) -> verdict still FAILURE, names mcp-server (the second, unacked
# container) — acknowledgment never masks a fresh signature — acceptance (3) ─
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
STUB_MEM_RAG="93.67"
STUB_MEM_MCPSERVER="90.00"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T41 MIXED acked-rag + unacked-mcp-server -> verdict FAILURE" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T41 MIXED -> exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T41 MIXED -> detail mentions mem_creep" "$([[ "$DETAIL" == *"mem_creep"* ]] && echo true || echo false)"
check "T41 MIXED -> detail names the UNACKED mcp-server breach with its percentage" "$([[ "$DETAIL" == *"mcp-server"*"90.00%"* ]] && echo true || echo false)"
check "T41 MIXED -> detail also surfaces rag-service as acknowledged-degraded (transparency even on FAILURE)" "$([[ "$DETAIL" == *"acknowledged-degraded"* ]] && [[ "$DETAIL" == *"rag-service"* ]] && echo true || echo false)"
check "T41 MIXED -> does NOT write heartbeat file" "$([ ! -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"

# ── T42: mcp-gateway (HostConfig.Memory == 0, uncapped) forced to a high
# MemPerc reading -> still SKIPPED, never named in breach or acked — proves
# the skip fires on the CAP, not the percentage — acceptance (4) ───────────
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
STUB_MEM_GATEWAY="99.00"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T42 uncapped mcp-gateway forced-high MemPerc -> still ALL_GREEN (skipped, not a headroom signal)" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T42 exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T42 detail never names gateway" "$([[ "$DETAIL" != *"gateway"* ]] && echo true || echo false)"

# ── T43: all-healthy WITH the mem ack ledger present (rag-service healthy
# this run) -> verdict ALL_GREEN, detail carries NO acknowledged-degraded
# noise — the ledger's mere presence never manufactures a false note ───────
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T43 all-healthy + mem ack ledger present -> verdict ALL_GREEN" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T43 all-healthy + mem ack ledger present -> exit=0" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "T43 all-healthy + mem ack ledger present -> detail carries NO acknowledged-degraded noise" "$([[ "$DETAIL" != *"acknowledged-degraded"* ]] && echo true || echo false)"

# ══════════════════════════════════════════════════════════════════════════════
# FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY — HEADROOM FLOOR
# (fix_spec a) + TRACKED_BY LIVENESS (fix_spec b/c) coverage. Reuses the SAME
# ACK_FIXTURE_MEM_RAG / launchd ack fixtures already defined above; adds
# ORCH_STATE-specific fixtures for the staleness/unreadable cases.
# ══════════════════════════════════════════════════════════════════════════════

# STALE tracked_by fixture — RAG-FTS-BUILD-MEMORY-BOUND (the mem arm's
# existing tracked_by) AND FIX-LAUNCHD-DOCKER-EVENTS-EXIT1-CRASHLOOP (the
# launchd arm's) both DONE_VERIFIED; FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-
# DEAD stays live (BACKLOG) so T51 can prove the mixed case — one sibling
# ack disqualified by staleness, the OTHER still suppresses normally.
FIXTURE_ORCH_STATE_STALE="$TMPDIR_TEST/orch-state-stale.json"
jq -n '{task_board:{
  backlog:[{id:"FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD", status:"BACKLOG"}],
  ready:[], in_progress:[], review:[], qa:[],
  done:[], done_verified:[
    {id:"RAG-FTS-BUILD-MEMORY-BOUND", status:"DONE_VERIFIED"},
    {id:"FIX-LAUNCHD-DOCKER-EVENTS-EXIT1-CRASHLOOP", status:"DONE_VERIFIED"}
  ],
  archive:[], active_sprints:[], closed_sprints:[]
}}' > "$FIXTURE_ORCH_STATE_STALE"

# Malformed (invalid JSON) orch-state fixture — distinct failure mode from
# "file not found", proves the jq-parse-error branch of
# _task_status_in_orch_state is ALSO fail-loud, not just the missing-file one.
FIXTURE_ORCH_STATE_MALFORMED="$TMPDIR_TEST/orch-state-malformed.json"
printf 'not valid json {' > "$FIXTURE_ORCH_STATE_MALFORMED"

# tracked_by pointing at an id that exists in NO fixture anywhere — the
# "absent from every lane" half of AC3, reused by both T48 (mem) and T52
# (launchd) against the plain $DEFAULT_ORCH_STATE fixture (which legitimately
# has no such row).
ACK_FIXTURE_MEM_RAG_ABSENT_TRACKEDBY="$TMPDIR_TEST/ack-ledger-mem-rag-absent-trackedby.json"
jq -n '{acked_memory:[
  {container:"rag-service", tracked_by:"FIX-NONEXISTENT-TASK-ID-NOT-ON-BOARD", acked_at:"2026-07-29T11:32:08Z"}
]}' > "$ACK_FIXTURE_MEM_RAG_ABSENT_TRACKEDBY"

ACK_FIXTURE_DOCKEREVENTS_ABSENT_TRACKEDBY="$TMPDIR_TEST/ack-ledger-dockerevents-absent-trackedby.json"
jq -n '{acked:[
  {label:"com.vn-market.docker-events", tracked_by:"FIX-NONEXISTENT-TASK-ID-NOT-ON-BOARD", acked_at:"2026-07-23T18:51:09Z"}
]}' > "$ACK_FIXTURE_DOCKEREVENTS_ABSENT_TRACKEDBY"

# ── T44: AC2 — rag-service ACK'd, forced BELOW MEM_FLOOR_MIB absolute
# headroom (97.11%/22.2MiB-free — the EXACT live-measured PO evidence
# number, po_floor_calibration_20260729T1135) -> verdict FAILURE, detail
# names the container with BOTH its percentage AND its MiB-free — the case
# the pre-fix all-or-nothing predicate could not express ────────────────────
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
ORCH_STATE="$DEFAULT_ORCH_STATE"
STUB_MEM_RAG="97.11"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T44 below-floor rag-service breach -> verdict FAILURE" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T44 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T44 detail names rag-service with its percentage" "$([[ "$DETAIL" == *"rag-service"*"97.11%"* ]] && echo true || echo false)"
check "T44 detail names the MiB-free figure (22.2MiB)" "$([[ "$DETAIL" == *"22.2MiB-free"* ]] && echo true || echo false)"
check "T44 detail names BELOW-FLOOR" "$([[ "$DETAIL" == *"BELOW-FLOOR"* ]] && echo true || echo false)"
check "T44 does NOT write heartbeat file" "$([ ! -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"

# ── T45/T46: floor BOUNDARY — one MiB below vs one MiB above MEM_FLOOR_MIB,
# same tracked_by (live), proving the predicate itself (not a coincidence of
# the specific PO evidence number) drives the verdict flip ─────────────────
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
ORCH_STATE="$DEFAULT_ORCH_STATE"
STUB_MEM_RAG="94.92"  # 768 * (100-94.92)/100 = 39.0 MiB free — just BELOW floor=40
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T45 headroom just BELOW floor (39.0MiB < 40MiB) -> verdict FAILURE" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"

run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
ORCH_STATE="$DEFAULT_ORCH_STATE"
STUB_MEM_RAG="94.66"  # 768 * (100-94.66)/100 = 41.0 MiB free — just ABOVE floor=40
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T46 headroom just ABOVE floor (41.0MiB >= 40MiB) -> verdict ALL_GREEN (AC1 preserved)" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"

# ── T47: AC3 — tracked_by resolves to DONE_VERIFIED -> STALE ACK, verdict
# FAILURE, NOT silent suppression, even though headroom is comfortably above
# the floor (93.67%/48.6MiB-free, same reading T40 proved ALL_GREEN when
# tracked_by was live) — staleness alone must flip the verdict ────────────
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
ORCH_STATE="$FIXTURE_ORCH_STATE_STALE"
STUB_MEM_RAG="93.67"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T47 DONE_VERIFIED tracked_by -> verdict FAILURE (STALE ACK)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T47 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T47 detail names rag-service with its percentage" "$([[ "$DETAIL" == *"rag-service"*"93.67%"* ]] && echo true || echo false)"
check "T47 detail names STALE-ACK with the resolved DONE_VERIFIED status" "$([[ "$DETAIL" == *"STALE-ACK"* ]] && [[ "$DETAIL" == *"DONE_VERIFIED"* ]] && echo true || echo false)"
check "T47 does NOT write heartbeat file" "$([ ! -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"

# ── T48: AC3 — tracked_by absent from EVERY task_board lane -> STALE ACK,
# verdict FAILURE, same as DONE_VERIFIED (a task_id that was never real, or
# was hard-deleted, must never suppress forever either) ────────────────────
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG_ABSENT_TRACKEDBY"
ORCH_STATE="$DEFAULT_ORCH_STATE"
STUB_MEM_RAG="93.67"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T48 ABSENT tracked_by -> verdict FAILURE (STALE ACK)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T48 detail names STALE-ACK with status=ABSENT" "$([[ "$DETAIL" == *"STALE-ACK"* ]] && [[ "$DETAIL" == *"status=ABSENT"* ]] && echo true || echo false)"

# ── T49/T50: FAIL-LOUD on an unreadable/unparseable orch-state.json — the
# ACK must NOT silently suppress just because staleness could not be
# verified; two distinct unreadable shapes (missing file, invalid JSON) ────
run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
ORCH_STATE="$TMPDIR_TEST/no-such-orch-state.json"
STUB_MEM_RAG="93.67"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T49 orch-state file missing -> verdict FAILURE (fail-loud, never silent-suppress)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T49 detail names ORCH-STATE-UNREADABLE" "$([[ "$DETAIL" == *"ORCH-STATE-UNREADABLE"* ]] && echo true || echo false)"

run_case
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
ORCH_STATE="$FIXTURE_ORCH_STATE_MALFORMED"
STUB_MEM_RAG="93.67"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T50 orch-state malformed JSON -> verdict FAILURE (fail-loud, never silent-suppress)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T50 detail names ORCH-STATE-UNREADABLE" "$([[ "$DETAIL" == *"ORCH-STATE-UNREADABLE"* ]] && echo true || echo false)"

# ── T51: fix_spec (c) — SAME tracked_by-liveness fix applied to the acked[]
# launchd arm. docker-events' tracked_by is DONE_VERIFIED (stale, must NOT
# suppress) while fleet-push's stays live (BACKLOG, must STILL suppress) —
# proves the fix is per-entry, not an all-or-nothing ledger-wide flip ──────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_ACK_BOTH"
LAUNCHD_ACK="$ACK_FIXTURE_BOTH"
ORCH_STATE="$FIXTURE_ORCH_STATE_STALE"
STUB_LAUNCHCTL="ok"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T51 DONE_VERIFIED launchd tracked_by -> verdict FAILURE (STALE ACK)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T51 detail names docker-events STALE-ACK with DONE_VERIFIED status" "$([[ "$DETAIL" == *"com.vn-market.docker-events"* ]] && [[ "$DETAIL" == *"STALE-ACK"* ]] && [[ "$DETAIL" == *"DONE_VERIFIED"* ]] && echo true || echo false)"
check "T51 fleet-push (live tracked_by) STILL suppressed (acknowledged-degraded)" "$([[ "$DETAIL" == *"acknowledged-degraded"* ]] && [[ "$DETAIL" == *"com.vn-market.fleet-push"* ]] && echo true || echo false)"

# ── T52: fix_spec (c) — launchd tracked_by absent from every lane -> STALE
# ACK, verdict FAILURE ──────────────────────────────────────────────────────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_ACK_DOCKEREVENTS_ONLY"
LAUNCHD_ACK="$ACK_FIXTURE_DOCKEREVENTS_ABSENT_TRACKEDBY"
ORCH_STATE="$DEFAULT_ORCH_STATE"
STUB_LAUNCHCTL="ok"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T52 ABSENT launchd tracked_by -> verdict FAILURE (STALE ACK)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T52 detail names docker-events STALE-ACK with status=ABSENT" "$([[ "$DETAIL" == *"com.vn-market.docker-events"* ]] && [[ "$DETAIL" == *"STALE-ACK"* ]] && [[ "$DETAIL" == *"status=ABSENT"* ]] && echo true || echo false)"

# ── T53: launchd arm — orch-state unreadable -> fail-loud, never
# silent-suppress (same guarantee as T49, proven at this arm's own call site) ─
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_ACK_DOCKEREVENTS_ONLY"
LAUNCHD_ACK="$ACK_FIXTURE_DOCKEREVENTS_ABSENT_TRACKEDBY"
ORCH_STATE="$TMPDIR_TEST/no-such-orch-state.json"
STUB_LAUNCHCTL="ok"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T53 orch-state unreadable (launchd arm) -> verdict FAILURE (fail-loud)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T53 detail names ORCH-STATE-UNREADABLE" "$([[ "$DETAIL" == *"ORCH-STATE-UNREADABLE"* ]] && echo true || echo false)"

# Restore defaults for any test appended after this section in the future.
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$TMPDIR_TEST/no-such-ack-ledger.json"
ORCH_STATE="$DEFAULT_ORCH_STATE"

# ── T54-T58: FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE regression
# suite. Reproduces the live-verified defect this task fixes: a single
# `docker stats` sample per container could read a quiet instant next to a
# transient peak and manufacture a false ALL_GREEN. STUB_MEM_* now accepts a
# comma-separated SEQUENCE — the Nth `docker stats` call for that container
# returns the Nth entry (see _next_mem_stub above). DISTINCT from
# T9/T40/T44-T48 above (single-value fixtures, unaffected, still GREEN
# through this suite) — this block is the NEW multi-sample mechanism only.

# ── T54: THE decisive reproduction — sample 1 reads 70.00% (well under the
# 85% WARN_PCT threshold, i.e. what a single-point-sample gate would have
# read as GREEN and stopped there), sample 2 (same invocation, short window)
# reads 99.91% (the exact live-incident pdf-extractor figure) — must NOT
# trust the first green sample; overall verdict must be FAILURE ──────────────
run_case
STUB_MEM_RAG="70.00,99.91"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T54 sample1=GREEN(70.00%) then sample2=FAIL(99.91%) -> verdict FAILURE (does not trust first green sample)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T54 exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T54 detail mentions mem_creep" "$([[ "$DETAIL" == *"mem_creep"* ]] && echo true || echo false)"
check "T54 detail names rag-service with the WORST sampled percentage (99.91%%), not the first (70.00%%)" "$([[ "$DETAIL" == *"rag-service"*"99.91%"* ]] && [[ "$DETAIL" != *"70.00%"* ]] && echo true || echo false)"
check "T54 does NOT write heartbeat file" "$([ ! -f "$HEARTBEAT_FILE_PATH" ] && echo true || echo false)"

# ── T55: reverse order — sample 1 reads 99.91% (breach), sample 2 (same
# window) reads 70.00% (would-be GREEN) — verdict must STILL be FAILURE.
# Proves the fix gates off the WORST sample across the window, not merely
# "trust whichever sample came first" (T54 alone would not distinguish a
# real worst-of-N fix from a superficial "always re-check once, keep the
# LAST reading" implementation — this case does) ─────────────────────────────
run_case
STUB_MEM_RAG="99.91,70.00"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T55 sample1=FAIL(99.91%) then sample2=GREEN(70.00%) -> verdict STILL FAILURE (worst-of-window, not last-sample)" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T55 detail names rag-service with the WORST sampled percentage (99.91%%)" "$([[ "$DETAIL" == *"rag-service"*"99.91%"* ]] && echo true || echo false)"

# ── T56: wiring proof — the default (MEM_CREEP_SAMPLES unset -> 2) path
# actually calls `docker stats` twice for the sampled container, not once
# (guards against a fix that reads MEM_CREEP_SAMPLES but never loops) ────────
run_case
STUB_MEM_RAG="20.00,20.00"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T56 all-samples-GREEN stays ALL_GREEN (multi-sample mechanism introduces no false positive)" "$([ "$VERDICT" = "ALL_GREEN" ] && echo true || echo false)"
check "T56 docker stats was actually called 2x for rag-service (default MEM_CREEP_SAMPLES=2, real loop not a no-op)" "$([ "$(cat "$TMPDIR_TEST/.stats-call-rag" 2>/dev/null)" = "2" ] && echo true || echo false)"

# ── T57: MEM_CREEP_SAMPLES honored as a real override (>2) — samples 1-2
# GREEN, sample 3 (still same short window) FAIL -> verdict FAILURE, and the
# call-count file proves all 3 samples were actually taken ───────────────────
run_case
MEM_CREEP_SAMPLES=3
STUB_MEM_RAG="10.00,12.00,90.00"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
DETAIL=$(printf '%s' "$OUT" | jq -r '.detail')
check "T57 MEM_CREEP_SAMPLES=3 override: samples 1-2 GREEN, sample 3 FAIL -> verdict FAILURE" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T57 detail names rag-service with the 3rd sample's percentage (90.00%%)" "$([[ "$DETAIL" == *"rag-service"*"90.00%"* ]] && echo true || echo false)"
check "T57 docker stats was actually called 3x (override honored, not clamped back to 2)" "$([ "$(cat "$TMPDIR_TEST/.stats-call-rag" 2>/dev/null)" = "3" ] && echo true || echo false)"
MEM_CREEP_SAMPLES=2

# ── T58: MEM_CREEP_SAMPLES below the AC's N>=2 floor is defensively clamped
# back up to 2 (a misconfigured "1" must not silently regress to the old
# single-point-sample gate) ───────────────────────────────────────────────────
run_case
MEM_CREEP_SAMPLES=1
STUB_MEM_RAG="70.00,99.91"
OUT=$(run_probe); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
check "T58 MEM_CREEP_SAMPLES=1 (invalid, below AC floor) clamped to 2 -> still catches the 2nd-sample breach" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T58 docker stats was actually called 2x despite the invalid override (clamp, not honor)" "$([ "$(cat "$TMPDIR_TEST/.stats-call-rag" 2>/dev/null)" = "2" ] && echo true || echo false)"
MEM_CREEP_SAMPLES=2

# ══════════════════════════════════════════════════════════════════════════════
# FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT — per-signature spawn
# debounce regression tests. Design:
# docs/architecture-briefs/2026-08-24-fix-auditor-tier1-spawn-debounce.md.
# Field/file contract: docs/policies/dev-standards.md
# CANONICAL:SSOT-AUDITOR-TIER1-SPAWN-DEBOUNCE.
# ══════════════════════════════════════════════════════════════════════════════

# ── T-DEBOUNCE-1: THE decisive reproduction — the exact live coordinator pair
# (07:0xZ 86.90%/91.40% then 07:36Z 86.56%/90.80%, both real 2026-08-24
# ticks). AC-3 (verdict stays FAILURE unconditionally) + AC-4/AC-5 (same
# signature across percentage drift -> tick2 DEBOUNCED, ledger never
# duplicates the entry or bumps spawn_count on a DEBOUNCED tick) ───────────
run_case
STUB_MEM_FLEET="pdfx"
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG"
STUB_MEM_PDFX="86.90"
STUB_MEM_RAG="91.40"
OUT1=$(run_probe); RC1=$?
VERDICT1=$(printf '%s' "$OUT1" | jq -r '.verdict')
DETAIL1=$(printf '%s' "$OUT1" | jq -r '.detail')
SPAWN1=$(printf '%s' "$OUT1" | jq -r '.spawn_decision')
SIG1=$(printf '%s' "$OUT1" | jq -r '.signature')

STUB_MEM_PDFX="86.56"
STUB_MEM_RAG="90.80"
OUT2=$(run_probe); RC2=$?
VERDICT2=$(printf '%s' "$OUT2" | jq -r '.verdict')
SPAWN2=$(printf '%s' "$OUT2" | jq -r '.spawn_decision')
SIG2=$(printf '%s' "$OUT2" | jq -r '.signature')

check "T-DEBOUNCE-1 tick1 verdict FAILURE (AC-3 — true positive, never greened)" "$([ "$VERDICT1" = "FAILURE" ] && echo true || echo false)"
check "T-DEBOUNCE-1 tick1 exit=1" "$([ "$RC1" -eq 1 ] && echo true || echo false)"
check "T-DEBOUNCE-1 tick1 detail names pdf-extractor with its 86.90%% pct" "$([[ "$DETAIL1" == *"pdf-extractor-1(86.90%)"* ]] && echo true || echo false)"
check "T-DEBOUNCE-1 tick1 detail carries the acked-transparency clause naming rag-service (91.40%%)" "$([[ "$DETAIL1" == *"acknowledged-degraded"* ]] && [[ "$DETAIL1" == *"rag-service-1(91.40%)"* ]] && echo true || echo false)"
check "T-DEBOUNCE-1 tick1 signature == mem_creep:<bare pdf-extractor name> (percentages+acked-clause stripped)" "$([ "$SIG1" = "mem_creep:vn-market-intelligence-mcp-pdf-extractor-1" ] && echo true || echo false)"
check "T-DEBOUNCE-1 tick1 signature NEVER names rag-service (acked-transparency clause excluded from signature by design)" "$([[ "$SIG1" != *"rag-service"* ]] && echo true || echo false)"
check "T-DEBOUNCE-1 tick1 spawn_decision SPAWN (first sighting of this signature)" "$([ "$SPAWN1" = "SPAWN" ] && echo true || echo false)"

check "T-DEBOUNCE-1 tick2 verdict STILL FAILURE (AC-3 paramount — the spawn is debounced, never the verdict)" "$([ "$VERDICT2" = "FAILURE" ] && echo true || echo false)"
check "T-DEBOUNCE-1 tick2 exit=1" "$([ "$RC2" -eq 1 ] && echo true || echo false)"
check "T-DEBOUNCE-1 tick2 signature BYTE-IDENTICAL to tick1 despite 86.90->86.56 / 91.40->90.80 drift" "$([ "$SIG2" = "$SIG1" ] && echo true || echo false)"
check "T-DEBOUNCE-1 tick2 spawn_decision DEBOUNCED (same signature, inside the 60min window)" "$([ "$SPAWN2" = "DEBOUNCED" ] && echo true || echo false)"
check "T-DEBOUNCE-1 ledger holds exactly 1 entry (same signature reused, never duplicated)" "$([ "$(jq '.entries | length' "$SPAWN_DEBOUNCE_FILE_PATH")" -eq 1 ] && echo true || echo false)"
check "T-DEBOUNCE-1 ledger spawn_count stays 1 (a DEBOUNCED tick never increments it)" "$([ "$(jq -r '.entries[0].spawn_count' "$SPAWN_DEBOUNCE_FILE_PATH")" = "1" ] && echo true || echo false)"
check "T-DEBOUNCE-1 ledger last_seen_at advanced on the DEBOUNCED tick (still tracks liveness)" "$([ "$(jq -r '.entries[0].last_seen_at' "$SPAWN_DEBOUNCE_FILE_PATH")" != "$(jq -r '.entries[0].first_seen_at' "$SPAWN_DEBOUNCE_FILE_PATH")" ] || echo true)"

# ── T-DEBOUNCE-2: ack-expiry hazard — rag-service's ack going STALE (tracked_by
# no longer resolves live) moves it OUT of the acked-transparency clause and
# INTO the primary breach list, which by construction changes the signature
# and forces an immediate SPAWN under AC-4 — zero special-case code, and this
# fires even though tick2 above is still inside the OLD signature's 60min
# debounce window (architecture brief §1/§3.3, proof by construction) ──────
LAUNCHD_ACK="$ACK_FIXTURE_MEM_RAG_ABSENT_TRACKEDBY"
STUB_MEM_PDFX="87.10"
STUB_MEM_RAG="92.00"
OUT3=$(run_probe); RC3=$?
VERDICT3=$(printf '%s' "$OUT3" | jq -r '.verdict')
DETAIL3=$(printf '%s' "$OUT3" | jq -r '.detail')
SPAWN3=$(printf '%s' "$OUT3" | jq -r '.spawn_decision')
SIG3=$(printf '%s' "$OUT3" | jq -r '.signature')

check "T-DEBOUNCE-2 verdict FAILURE" "$([ "$VERDICT3" = "FAILURE" ] && echo true || echo false)"
check "T-DEBOUNCE-2 exit=1" "$([ "$RC3" -eq 1 ] && echo true || echo false)"
check "T-DEBOUNCE-2 detail shows rag-service as a STALE-ACK primary breach (moved OUT of the transparency clause)" "$([[ "$DETAIL3" == *"rag-service-1(92.00%"* ]] && [[ "$DETAIL3" == *"STALE-ACK"* ]] && echo true || echo false)"
check "T-DEBOUNCE-2 signature now names BOTH containers, sorted+comma-joined" "$([ "$SIG3" = "mem_creep:vn-market-intelligence-mcp-pdf-extractor-1,vn-market-intelligence-mcp-rag-service-1" ] && echo true || echo false)"
check "T-DEBOUNCE-2 signature DIFFERS from the debounced tick1/tick2 signature (proves the container-move is NOT swallowed by normalization)" "$([ "$SIG3" != "$SIG1" ] && echo true || echo false)"
check "T-DEBOUNCE-2 spawn_decision SPAWN — new signature forces immediate spawn under AC-4, even inside the OLD signature's window" "$([ "$SPAWN3" = "SPAWN" ] && echo true || echo false)"
check "T-DEBOUNCE-2 ledger now holds 2 entries (old signature retained untouched, new signature appended)" "$([ "$(jq '.entries | length' "$SPAWN_DEBOUNCE_FILE_PATH")" -eq 2 ] && echo true || echo false)"

# ── T-DEBOUNCE-3: window expiry re-arms SPAWN — a debounce window is NOT a
# permanent suppression (AC-5: a sliding window would never expire — this
# proves the window is fixed at first-sighting, not renewed on each sighting) ─
run_case
STUB_DOCKER_PS="one_down"
OUT1=$(run_probe)
SPAWN1=$(printf '%s' "$OUT1" | jq -r '.spawn_decision')
jq '.entries[0].window_expires_at = "2020-01-01T00:00:00Z"' "$SPAWN_DEBOUNCE_FILE_PATH" > "$TMPDIR_TEST/t-debounce3-ledger.json" && mv "$TMPDIR_TEST/t-debounce3-ledger.json" "$SPAWN_DEBOUNCE_FILE_PATH"
OUT2=$(run_probe)
SPAWN2=$(printf '%s' "$OUT2" | jq -r '.spawn_decision')
SPAWN_COUNT2=$(jq -r '.entries[0].spawn_count' "$SPAWN_DEBOUNCE_FILE_PATH")
check "T-DEBOUNCE-3 tick1 SPAWN (fresh signature)" "$([ "$SPAWN1" = "SPAWN" ] && echo true || echo false)"
check "T-DEBOUNCE-3 tick2 (after window elapsed) SPAWN again — re-adjudicates, never debounces forever" "$([ "$SPAWN2" = "SPAWN" ] && echo true || echo false)"
check "T-DEBOUNCE-3 spawn_count incremented to 2 on the re-armed SPAWN" "$([ "$SPAWN_COUNT2" = "2" ] && echo true || echo false)"

# ── T-DEBOUNCE-4: corrupt ledger content -> FAIL OPEN to SPAWN, never
# silently downgraded to DEBOUNCED on a read/parse fault (Auditability
# Contract) ──────────────────────────────────────────────────────────────
run_case
STUB_DOCKER_PS="one_down"
run_probe >/dev/null
printf 'NOT VALID JSON{{{' > "$SPAWN_DEBOUNCE_FILE_PATH"
OUT2=$(run_probe); RC2=$?
VERDICT2=$(printf '%s' "$OUT2" | jq -r '.verdict')
SPAWN2=$(printf '%s' "$OUT2" | jq -r '.spawn_decision')
check "T-DEBOUNCE-4 corrupt ledger -> verdict still FAILURE" "$([ "$VERDICT2" = "FAILURE" ] && echo true || echo false)"
check "T-DEBOUNCE-4 corrupt ledger -> exit=1" "$([ "$RC2" -eq 1 ] && echo true || echo false)"
check "T-DEBOUNCE-4 corrupt ledger -> spawn_decision fails OPEN to SPAWN (same repeated signature, would otherwise be DEBOUNCED)" "$([ "$SPAWN2" = "SPAWN" ] && echo true || echo false)"
check "T-DEBOUNCE-4 corrupt ledger -> self-heals (a valid ledger is written back after the fault)" "$(jq -e . "$SPAWN_DEBOUNCE_FILE_PATH" >/dev/null 2>&1 && echo true || echo false)"

# ── T-DEBOUNCE-5: suppressed call (Tier-2/3's inner run_probe("suppress_heartbeat")
# invocation) NEVER emits spawn_decision/signature and NEVER touches the
# ledger file — provably unaffected by construction (architecture brief §3.4) ─
run_case
STUB_DOCKER_PS="one_down"
rm -f "$SPAWN_DEBOUNCE_FILE_PATH"
OUT=$(run_probe "suppress_heartbeat"); RC=$?
VERDICT=$(printf '%s' "$OUT" | jq -r '.verdict')
HAS_SD=$(printf '%s' "$OUT" | jq 'has("spawn_decision")')
HAS_SIG=$(printf '%s' "$OUT" | jq 'has("signature")')
check "T-DEBOUNCE-5 suppressed call verdict still FAILURE" "$([ "$VERDICT" = "FAILURE" ] && echo true || echo false)"
check "T-DEBOUNCE-5 suppressed call exit=1" "$([ "$RC" -eq 1 ] && echo true || echo false)"
check "T-DEBOUNCE-5 suppressed call JSON has NO spawn_decision key" "$([ "$HAS_SD" = "false" ] && echo true || echo false)"
check "T-DEBOUNCE-5 suppressed call JSON has NO signature key" "$([ "$HAS_SIG" = "false" ] && echo true || echo false)"
check "T-DEBOUNCE-5 suppressed call NEVER creates the ledger file" "$([ ! -f "$SPAWN_DEBOUNCE_FILE_PATH" ] && echo true || echo false)"

LOCAL_T2_HB="$TMPDIR_TEST/t-debounce5-tier2-hb.json"
rm -f "$LOCAL_T2_HB" "$SPAWN_DEBOUNCE_FILE_PATH"
OUT_T2=$(HEARTBEAT_FILE_PATH="$LOCAL_T2_HB" run_tiered_probe "2")
HAS_SD_T2=$(printf '%s' "$OUT_T2" | jq 'has("spawn_decision")')
check "T-DEBOUNCE-5 Tier-2 run_tiered_probe() JSON has no spawn_decision leak from its suppressed inner run_probe() call" "$([ "$HAS_SD_T2" = "false" ] && echo true || echo false)"
check "T-DEBOUNCE-5 Tier-2 run_tiered_probe() never creates the ledger file either" "$([ ! -f "$SPAWN_DEBOUNCE_FILE_PATH" ] && echo true || echo false)"

# ── T-DEBOUNCE-6: SPAWN_DEBOUNCE_WINDOW_MIN env override honored — retunable
# without a design change (architecture brief §3.2) ────────────────────────
run_case
STUB_DOCKER_PS="one_down"
SPAWN_DEBOUNCE_WINDOW_MIN=120
run_probe >/dev/null
EXP=$(jq -r '.entries[0].window_expires_at' "$SPAWN_DEBOUNCE_FILE_PATH")
FIRST_SEEN=$(jq -r '.entries[0].first_seen_at' "$SPAWN_DEBOUNCE_FILE_PATH")
DIFF_SEC=$(jq -n --arg a "$FIRST_SEEN" --arg b "$EXP" '($b|fromdateiso8601) - ($a|fromdateiso8601)')
check "T-DEBOUNCE-6 SPAWN_DEBOUNCE_WINDOW_MIN=120 override honored (window_expires_at - first_seen_at == 120min)" "$([ "$DIFF_SEC" -eq 7200 ] && echo true || echo false)"
unset SPAWN_DEBOUNCE_WINDOW_MIN

# ── T-DEBOUNCE-7: docker_ps entity signature — end-to-end integration proof
# that the side-channel (not a regex re-parse of `detail`) wires correctly
# for a NON-mem_creep entity-bearing check too ─────────────────────────────
run_case
STUB_DOCKER_PS="one_down"
OUT=$(run_probe)
SIG=$(printf '%s' "$OUT" | jq -r '.signature')
check "T-DEBOUNCE-7 docker_ps FAILURE signature == docker_ps:<bare service name>, no status/paren noise" "$([ "$SIG" = "docker_ps:mcp-server" ] && echo true || echo false)"

# ── T-DEBOUNCE-8: launchd_agents entity signature — end-to-end integration
# proof for the third entity-bearing check (reuses T33's exact fixture) ────
run_case
LAUNCHD_DIR="$FIXTURE_LAUNCHD_DIR_3"
STUB_LAUNCHCTL="ok"
OUT=$(run_probe)
SIG=$(printf '%s' "$OUT" | jq -r '.signature')
check "T-DEBOUNCE-8 launchd_agents FAILURE signature == launchd_agents:<bare label>, no exit-status/paren noise" "$([ "$SIG" = "launchd_agents:com.vn-market.fleet-push" ] && echo true || echo false)"

# Restore the pre-existing "safe ALL_GREEN" LAUNCHD_DIR/LAUNCHD_ACK state (an
# empty dir + a nonexistent ack ledger) for every test appended after this
# section — same restore discipline the file already applies after T39/T53
# (run_case() deliberately never resets these two, by pre-existing design).
LAUNCHD_DIR="$LAUNCHD_EMPTY_DIR"
LAUNCHD_ACK="$TMPDIR_TEST/no-such-ack-ledger.json"


# ══════════════════════════════════════════════════════════════════════════════
# TICK-WU-3: telemetry wiring — tt_capture_and_log at the trailer's TWO
# branches (Tier-1 wraps run_probe, Tier-2/3 wraps run_tiered_probe "$TIER")
# ══════════════════════════════════════════════════════════════════════════════
# Exercises the SAME tt_capture_and_log function the real trailer now calls in
# place of the bare `run_probe; exit $?` / `run_tiered_probe "$TIER"; exit $?`
# branches. run_probe/run_tiered_probe are the same real functions already
# sourced above — TICK_TELEMETRY_LOG_PATH (R2 — auditor has NO PREFLIGHT_ROOT
# override seam, only derived *_PATH vars, unlike cowork/dev-team) is the ONE
# seam every case below MUST set explicitly; omitting it would leak test
# telemetry into the REAL repo docs/data/telemetry/auditor-tier1-probe.jsonl.
# Owning task: TICK-WU-3-AUDITOR-WIRING.

# ── T-LOG: Tier-1 standalone — tt_capture_and_log wraps run_probe (no args),
# same as the trailer's `1) tt_capture_and_log ... run_probe; exit $?` branch ──
run_case
LOG_T_LOG="$TMPDIR_TEST/telemetry-t-log.jsonl"
OUT_TLOG=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG" tt_capture_and_log "auditor-tier1-probe.sh" run_probe); RC_TLOG=$?
check "T-LOG Tier-1 ALL_GREEN verdict still reaches caller via tt_capture_and_log wrapper" \
  "$([ "$(printf '%s' "$OUT_TLOG" | jq -r '.verdict')" = "ALL_GREEN" ] && echo true || echo false)"
check "T-LOG Tier-1 exit=0 (real run_probe rc preserved through the wrapper)" "$([ "$RC_TLOG" -eq 0 ] && echo true || echo false)"
check "T-LOG Tier-1 one telemetry line written" "$([ "$(wc -l < "$LOG_T_LOG" | tr -d ' ')" -eq 1 ] && echo true || echo false)"
check "T-LOG Tier-1 telemetry line script field is auditor-tier1-probe.sh" "$([ "$(jq -r '.script' "$LOG_T_LOG")" = "auditor-tier1-probe.sh" ] && echo true || echo false)"
check "T-LOG Tier-1 telemetry line verdict field is ALL_GREEN (Tier-1 vocabulary)" "$([ "$(jq -r '.verdict' "$LOG_T_LOG")" = "ALL_GREEN" ] && echo true || echo false)"
check "T-LOG Tier-1 telemetry line tick field is null (run_probe's verdict JSON has no tick key, AC-3)" "$([ "$(jq -r '.tick == null' "$LOG_T_LOG")" = "true" ] && echo true || echo false)"
check "T-LOG Tier-1 telemetry line exit_code field == 0" "$([ "$(jq -r '.exit_code' "$LOG_T_LOG")" -eq 0 ] && echo true || echo false)"
check "T-LOG Tier-1 telemetry line has NO CLAUDE_CODE_SESSION_ID-shaped key (hard contract, script header)" \
  "$([ "$(jq -r 'has("session_id") or has("session") or has("claude_code_session_id")' "$LOG_T_LOG")" = "false" ] && echo true || echo false)"

# ── T-LOG2: Tier-1 FAILURE path — non-zero exit code preserved through wrapper ──
run_case
STUB_DOCKER_PS="one_down"
LOG_T_LOG2="$TMPDIR_TEST/telemetry-t-log2.jsonl"
OUT_TLOG2=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG2" tt_capture_and_log "auditor-tier1-probe.sh" run_probe); RC_TLOG2=$?
check "T-LOG2 Tier-1 FAILURE verdict reaches caller via wrapper" "$([ "$(printf '%s' "$OUT_TLOG2" | jq -r '.verdict')" = "FAILURE" ] && echo true || echo false)"
check "T-LOG2 Tier-1 FAILURE exit=1 (real run_probe rc preserved, not swallowed by a successful log write)" "$([ "$RC_TLOG2" -eq 1 ] && echo true || echo false)"
check "T-LOG2 telemetry line exit_code field == 1" "$([ "$(jq -r '.exit_code' "$LOG_T_LOG2")" -eq 1 ] && echo true || echo false)"

# ── T-LOG3: Tier-2/3 wrapper — tt_capture_and_log wraps run_tiered_probe
# "$TIER", same as the trailer's `2|3) tt_capture_and_log ... run_tiered_probe
# "$TIER"; exit $?` branch. Verdict vocabulary is SKIP-SPAWN|SPAWN, NOT
# ALL_GREEN|FAILURE (AC-3's dual-vocabulary requirement). Asserts exactly ONE
# telemetry line — the positive half of the double-log proof: the ONE real
# trailer-shaped invocation produces exactly one entry, not two (see T-LOG4
# for the complementary negative half) ────────────────────────────────────────
run_case
LOG_T_LOG3="$TMPDIR_TEST/telemetry-t-log3.jsonl"
rm -f "$TIER2_HEARTBEAT"
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{last_healthy_at:$ts}' > "$TIER2_HEARTBEAT"
OUT_TLOG3=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG3" HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "2"); RC_TLOG3=$?
check "T-LOG3 Tier-2/3 SKIP-SPAWN verdict reaches caller via wrapper" "$([ "$(printf '%s' "$OUT_TLOG3" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T-LOG3 Tier-2/3 exit=0" "$([ "$RC_TLOG3" -eq 0 ] && echo true || echo false)"
check "T-LOG3 exactly ONE telemetry line written (not two — proves the inner run_probe() capture never logs separately)" \
  "$([ "$(wc -l < "$LOG_T_LOG3" | tr -d ' ')" -eq 1 ] && echo true || echo false)"
check "T-LOG3 telemetry line verdict field is SKIP-SPAWN (Tier-2/3 vocabulary, the OUTER verdict)" "$([ "$(jq -r '.verdict' "$LOG_T_LOG3")" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T-LOG3 telemetry line verdict is NOT ALL_GREEN/FAILURE (Tier-1 vocabulary — would indicate the INNER run_probe() call leaked into the log)" \
  "$([ "$(jq -r '.verdict' "$LOG_T_LOG3")" != "ALL_GREEN" ] && [ "$(jq -r '.verdict' "$LOG_T_LOG3")" != "FAILURE" ] && echo true || echo false)"
check "T-LOG3 telemetry line tick field is null (run_tiered_probe's verdict JSON has no tick key)" "$([ "$(jq -r '.tick == null' "$LOG_T_LOG3")" = "true" ] && echo true || echo false)"

# ── T-LOG4 (CRITICAL — R1/R4, "THE single most important assertion in the
# entire sprint" per architect risk note): a BARE call to run_probe() /
# run_tiered_probe() — NOT routed through tt_capture_and_log at all — must
# produce ZERO telemetry log lines. run_tiered_probe() internally calls
# run_probe("suppress_heartbeat") as inner_out=$(...) (captured into a
# variable, never real stdout); if a naive per-call-site hook had been placed
# INSIDE run_probe()/run_tiered_probe() instead of at the trailer (the design
# this task explicitly rejected per FR-4), a bare call to either function
# would already produce >=1 log line on its own — logging would be a side
# effect of the FUNCTION CALL, not of the explicit trailer-level wrap. Under
# the actual trailer-only design, neither function has any internal
# log_tick_usage reference, so calling them directly (exactly as
# run_tiered_probe's own inner call does) triggers NO log write whatsoever.
# Combined with T-LOG3 above (the wrapped call logs EXACTLY once), this is
# the complete double-log proof: T-LOG3 shows WHERE the one entry comes from
# (the trailer wrap) and T-LOG4 shows the functions themselves are silent. ──
run_case
LOG_T_LOG4="$TMPDIR_TEST/telemetry-t-log4-bare.jsonl"
OUT_TLOG4_INNER=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG4" run_probe "suppress_heartbeat"); RC_TLOG4_INNER=$?
check "T-LOG4 bare run_probe(suppress_heartbeat) call (same signature run_tiered_probe's own inner call uses) writes ZERO log lines" \
  "$([ ! -s "$LOG_T_LOG4" ] && echo true || echo false)"
check "T-LOG4 bare run_probe(suppress_heartbeat) call still returns a real verdict (sanity — the log seam itself broke nothing)" \
  "$([ "$(printf '%s' "$OUT_TLOG4_INNER" | jq -r '.verdict')" = "ALL_GREEN" ] && echo true || echo false)"
check "T-LOG4 bare run_probe(suppress_heartbeat) exit=0 (real rc preserved even though nothing logs it)" \
  "$([ "$RC_TLOG4_INNER" -eq 0 ] && echo true || echo false)"
rm -f "$TIER2_HEARTBEAT"
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{last_healthy_at:$ts}' > "$TIER2_HEARTBEAT"
OUT_TLOG4_OUTER=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG4" HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" run_tiered_probe "2"); RC_TLOG4_OUTER=$?
check "T-LOG4 bare run_tiered_probe() call (unwrapped, not via tt_capture_and_log) ALSO writes ZERO log lines" \
  "$([ ! -s "$LOG_T_LOG4" ] && echo true || echo false)"
check "T-LOG4 bare run_tiered_probe() exit=0 (real rc preserved even though nothing logs it)" \
  "$([ "$RC_TLOG4_OUTER" -eq 0 ] && echo true || echo false)"
check "T-LOG4 bare run_tiered_probe() call still returns a real verdict (sanity check)" \
  "$([ "$(printf '%s' "$OUT_TLOG4_OUTER" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"

# ── T-LOG5: rotation in-situ — over-fill a small-cap log via real Tier-1
# invocations through the wrapper (mirrors WU-1/WU-2's T-LOG3 pattern) ───────
run_case
LOG_T_LOG5="$TMPDIR_TEST/telemetry-t-log5.jsonl"
i=1
while [ "$i" -le 8 ]; do
  TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG5" TICK_TELEMETRY_MAX_LINES=5 \
    tt_capture_and_log "auditor-tier1-probe.sh" run_probe >/dev/null
  i=$((i + 1))
done
check "T-LOG5 rotation caps the file at TICK_TELEMETRY_MAX_LINES (5), not the 8 real invocations" \
  "$([ "$(wc -l < "$LOG_T_LOG5" | tr -d ' ')" -eq 5 ] && echo true || echo false)"

# ── T-LOG6: AC-6 stdout purity + AC-2/AC-3 byte-identity — verified for BOTH
# Tier-1 and Tier-2/3 independently, using a FAILURE-path stub (STUB_DOCKER_PS
# ="one_down") for BOTH so neither call mints a LIVE wall-clock value into its
# own verdict JSON (run_probe()'s ALL_GREEN path writes last_healthy_at=
# _now_iso(); run_tiered_probe()'s ALL_GREEN path can compute a live
# heartbeat_age_minutes) — either would make two SEPARATE real invocations
# only PROBABILISTICALLY byte-identical (a clock-tick-boundary flake), which
# this task's own AC-10 discipline forbids introducing. The FAILURE path's
# last_healthy_at is read from the pre-existing heartbeat/fixture file (fixed,
# never re-minted per call) and its heartbeat_age_minutes is unconditionally
# null (checks_verdict != ALL_GREEN short-circuits the age computation
# entirely — see run_tiered_probe()'s own branch), making the byte-diff fully
# deterministic regardless of how much wall-clock time elapses between calls.
run_case
STUB_DOCKER_PS="one_down"
LOG_T_LOG6A="$TMPDIR_TEST/telemetry-t-log6a.jsonl"
RAW_TLOG6A=$(run_probe)
# FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT: the ledger write from the
# call above just recorded this exact signature (docker_ps:mcp-server) as
# SPAWNed — a second, immediate same-signature call would legitimately
# return spawn_decision=DEBOUNCED (correct new stateful behavior, see
# T-DEBOUNCE below), which would break this test's byte-identity premise for
# a reason unrelated to what it actually verifies (the tt_capture_and_log
# wrapper reprinting stdout unmodified). Reset the ledger so BOTH calls see
# a fresh signature and both legitimately return SPAWN.
rm -f "$SPAWN_DEBOUNCE_FILE_PATH"
WRAPPED_TLOG6A=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG6A" tt_capture_and_log "auditor-tier1-probe.sh" run_probe)
check "T-LOG6 Tier-1 AC-2/AC-3: wrapper reprints stdout BYTE-IDENTICAL to a direct (unwrapped) run_probe() call" \
  "$([ "$WRAPPED_TLOG6A" = "$RAW_TLOG6A" ] && echo true || echo false)"
check "T-LOG6 Tier-1 AC-6: stdout parses as exactly ONE JSON document (no trailing/leading logging noise)" \
  "$(printf '%s' "$WRAPPED_TLOG6A" | jq -e . >/dev/null 2>&1 && echo true || echo false)"

rm -f "$TIER2_HEARTBEAT"
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{last_healthy_at:$ts}' > "$TIER2_HEARTBEAT"
LOG_T_LOG6B="$TMPDIR_TEST/telemetry-t-log6b.jsonl"
RAW_TLOG6B=$(HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" run_tiered_probe "2")
WRAPPED_TLOG6B=$(TICK_TELEMETRY_LOG_PATH="$LOG_T_LOG6B" HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "2")
check "T-LOG6 Tier-2/3 AC-2/AC-3: wrapper reprints stdout BYTE-IDENTICAL to a direct (unwrapped) run_tiered_probe() call" \
  "$([ "$WRAPPED_TLOG6B" = "$RAW_TLOG6B" ] && echo true || echo false)"
check "T-LOG6 Tier-2/3 AC-6: stdout parses as exactly ONE JSON document (no trailing/leading logging noise)" \
  "$(printf '%s' "$WRAPPED_TLOG6B" | jq -e . >/dev/null 2>&1 && echo true || echo false)"
STUB_DOCKER_PS="ok"

# ── T-LOG7: AC-4/AC-5 fault inject — unwritable log destination never changes
# the caller's real verdict or exit code, for BOTH Tier-1 and Tier-2/3 (same
# portable root/non-root-safe technique as tick-telemetry.test.sh T9: a FILE
# occupying a path component that mkdir -p cannot turn into a directory) ─────
run_case
BLOCKER_FILE_TLOG7="$TMPDIR_TEST/t-log7-blocker-not-a-dir"
touch "$BLOCKER_FILE_TLOG7"
UNWRITABLE_LOG_TLOG7="$BLOCKER_FILE_TLOG7/sub/telemetry.jsonl"
OUT_TLOG7A=$(TICK_TELEMETRY_LOG_PATH="$UNWRITABLE_LOG_TLOG7" tt_capture_and_log "auditor-tier1-probe.sh" run_probe); RC_TLOG7A=$?
check "T-LOG7 Tier-1 AC-4/AC-5: unwritable log destination -> verdict still ALL_GREEN (unaffected)" \
  "$([ "$(printf '%s' "$OUT_TLOG7A" | jq -r '.verdict')" = "ALL_GREEN" ] && echo true || echo false)"
check "T-LOG7 Tier-1 AC-4/AC-5: unwritable log destination -> exit code still the real run_probe rc (0)" \
  "$([ "$RC_TLOG7A" -eq 0 ] && echo true || echo false)"
check "T-LOG7 Tier-1 AC-4/AC-5: unwritable log destination -> no file was created at the blocked path" \
  "$([ ! -f "$UNWRITABLE_LOG_TLOG7" ] && echo true || echo false)"

rm -f "$TIER2_HEARTBEAT"
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{last_healthy_at:$ts}' > "$TIER2_HEARTBEAT"
OUT_TLOG7B=$(TICK_TELEMETRY_LOG_PATH="$UNWRITABLE_LOG_TLOG7" HEARTBEAT_FILE_PATH="$TIER2_HEARTBEAT" tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "2"); RC_TLOG7B=$?
check "T-LOG7 Tier-2/3 AC-4/AC-5: unwritable log destination -> verdict still SKIP-SPAWN (unaffected)" \
  "$([ "$(printf '%s' "$OUT_TLOG7B" | jq -r '.verdict')" = "SKIP-SPAWN" ] && echo true || echo false)"
check "T-LOG7 Tier-2/3 AC-4/AC-5: unwritable log destination -> exit code still the real run_tiered_probe rc (0)" \
  "$([ "$RC_TLOG7B" -eq 0 ] && echo true || echo false)"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
