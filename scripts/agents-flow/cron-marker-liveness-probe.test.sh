#!/usr/bin/env bash
# scripts/agents-flow/cron-marker-liveness-probe.test.sh
#
# TASK-CRON-LIVENESS-PROBE-TESTS (P0), parent
# FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE.
# Architect brief §6: docs/architecture-briefs/2026-08-23-cron-rearm-liveness-
# oracle-process-observation.md
#
# ── WHY THIS SUITE EXISTS, AND WHY BOTH F1 AND F2 ARE MANDATORY ──────────────
# The three /cron-* re-arm skills share ONE guard shape with THREE different
# arbitrary thresholds, and that one shape fails in OPPOSITE directions:
#   false-LIVE  at T=7200 (cowork/detect-loop — a renewal hook keeps the
#               heartbeat fresh, so a corpse looks alive) → 8 h 10 m outage,
#               2026-08-23
#   false-DEAD  at T=120  (standalone — NO renewal hook at all, so a live
#               session looks dead) → double-arm, confirmed 2x in memory
#               feedback_cron_standalone_step1b1_presence_absence_false_dead_double_arm
# F1 + F2 passing under ONE spec IS the entire thesis of the parent row. A run
# that proves only one direction re-proves nothing — that is exactly how the
# current spec passed review.
#
# F1's transcript is deliberately FRESH (16 s). F1 therefore FAILS against any
# implementation that ranks O2 (transcript-mtime) above O1 (process-absence).
# If F1 ever starts passing trivially, the fixture is wrong, not the code.
#
# ── HARNESS ─────────────────────────────────────────────────────────────────
# Mirrors scripts/agents-flow/auditor-tier1-probe.test.sh: source the script
# under test (its `[[ BASH_SOURCE == $0 ]]` guard prevents auto-exec), then
# override the shell functions it calls. `ps`, `stat`, `date -j`, `mcp_call` and
# `send_telegram` are ALL mocked — ZERO real process, filesystem-outside-tmp,
# or network invocations (AC-T1).
#
# Run: bash scripts/agents-flow/cron-marker-liveness-probe.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure (AC-T3 — fail-loud, no `|| true`).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROBE_SH="$SCRIPT_DIR/cron-marker-liveness-probe.sh"

if [ ! -f "$PROBE_SH" ]; then
  echo "ERROR: probe script not found at $PROBE_SH" >&2
  exit 1
fi

PASS=0
FAIL=0
check() {
  local label="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — got='$got' want='$want'" >&2
    FAIL=$((FAIL + 1))
  fi
}

TMPDIR_TEST=$(mktemp -d /private/tmp/cron-marker-liveness-probe-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT INT TERM

# ── F4 (locale): the WHOLE suite runs under fr_FR.UTF-8. Every assertion below
# therefore doubles as a locale regression — an unwrapped `ps`/`date -j` would
# make the fingerprint compare unequal for the SAME process (brief R3).
export LC_TIME="fr_FR.UTF-8"

export PROBE_ROOT="$TMPDIR_TEST"
export PROBE_SIGNALS_DIR="$TMPDIR_TEST/signals"
export PROBE_HOME="$TMPDIR_TEST/home"
mkdir -p "$PROBE_SIGNALS_DIR" "$PROBE_HOME/.claude/projects/proj"
export PROBE_TRANSCRIPT_MAX_AGE_S=300
export PROBE_ALARM_COOLDOWN_S=21600
export CLAUDE_CODE_SESSION_ID="probing-session-ffffffff"

# NOW is frozen so every age assertion is deterministic. 2026-08-23T00:41:06Z is
# the exact instant /cron-cowork-team ran during the real incident.
NOW_EPOCH=$(LC_ALL=C date -j -f "%Y-%m-%dT%H:%M:%SZ" "2026-08-23T00:41:06Z" +%s 2>/dev/null)
if [ -z "$NOW_EPOCH" ]; then echo "ERROR: could not build frozen NOW" >&2; exit 1; fi

# shellcheck source=./cron-marker-liveness-probe.sh
source "$PROBE_SH"

# ── Mocks. Every one is table-driven off files in $TMPDIR_TEST so a case can
# reshape the world without redefining functions. ───────────────────────────
MOCK_PS_TABLE="$TMPDIR_TEST/ps-table"     # lines: <pid>|<lstart raw>|<comm>
MOCK_LOCKS="$TMPDIR_TEST/locks.json"
TELEGRAM_LOG="$TMPDIR_TEST/telegram.log"
: > "$MOCK_PS_TABLE"; : > "$TELEGRAM_LOG"

probe_now_epoch() { printf '%s' "$NOW_EPOCH"; }

probe_ps_lstart() {
  local pid="$1" line
  line=$(grep "^${pid}|" "$MOCK_PS_TABLE" 2>/dev/null | head -1)
  [ -n "$line" ] || return 0            # absent from `ps` — EMPTY, as the real wrapper returns
  printf '%s' "$(printf '%s' "$line" | cut -d'|' -f2)"
}

probe_ps_comm() {
  local pid="$1" line
  line=$(grep "^${pid}|" "$MOCK_PS_TABLE" 2>/dev/null | head -1)
  [ -n "$line" ] || return 0
  printf '%s' "$(printf '%s' "$line" | cut -d'|' -f3)"
}

# NOTE: probe_lstart_to_epoch is deliberately NOT mocked — F4 asserts the REAL
# LC_ALL=C-wrapped parse works while the suite runs under LC_TIME=fr_FR.UTF-8.

mcp_call() {
  local tool="$1"
  case "$tool" in
    task_list_held) cat "$MOCK_LOCKS" ;;
    *) return 1 ;;
  esac
}

probe_send_telegram() { printf '%s\n' "$1" >> "$TELEGRAM_LOG"; return 0; }

# make_marker <task_id> <owner> <heartbeat_age_s> <payload_json>
make_marker() {
  local task_id="$1" owner="$2" hb_age="$3" payload="$4"
  jq -n --arg id "$task_id" --arg o "$owner" \
        --argjson hb $((NOW_EPOCH - hb_age)) --arg p "$payload" \
    '{locks:[{task_id:$id, task_kind:"sprint-task", owner_client_session:$o,
              heartbeat_at:$hb, ttl_seconds:691200, payload:$p}]}' > "$MOCK_LOCKS"
}

# make_transcript <session_id> <age_seconds> -> prints the absolute path
make_transcript() {
  # NOTE: separate `local` statements on purpose — bash expands the whole
  # `local a=$1 b=$a` command line BEFORE performing any of its assignments, so
  # a same-statement back-reference reads the OLD (here: unset) value and trips
  # `set -u`.
  local sid="$1" age="$2"
  local p="$PROBE_HOME/.claude/projects/proj/${sid}.jsonl"
  printf '{}\n' > "$p"
  LC_ALL=C touch -t "$(LC_ALL=C date -j -f %s $((NOW_EPOCH - age)) +%Y%m%d%H%M.%S)" "$p"
  printf '%s' "$p"
}

reset_case() {
  : > "$MOCK_PS_TABLE"; : > "$TELEGRAM_LOG"
  rm -rf "$PROBE_SIGNALS_DIR"; mkdir -p "$PROBE_SIGNALS_DIR"
  rm -f "$PROBE_HOME/.claude/projects/proj/"*.jsonl
  export CLAUDE_CODE_SESSION_ID="probing-session-ffffffff"
}

verdict_of()  { printf '%s' "$1" | jq -r '.verdict'; }
action_of()   { printf '%s' "$1" | jq -r '.recommended_action'; }
signal_count(){ find "$PROBE_SIGNALS_DIR" -maxdepth 1 -name '*.json' 2>/dev/null | wc -l | tr -d ' '; }
telegram_count(){ wc -l < "$TELEGRAM_LOG" | tr -d ' '; }

# =============================================================================
# F1 — THE 2026-08-23 CORPSE (false-LIVE direction)
# Marker cron-registration:cowork-team, owner 2eaf4045, heartbeat_age 328 s
# (deep inside T=7200), owner absent from the presence roster, recorded pid
# ABSENT from ps, transcript mtime 16 s old.  → must be DEAD.
# The fresh transcript is the point: this case fails against any design that
# consults O2 before O1.
# =============================================================================
echo ""
echo "F1 — 2026-08-23 corpse: fresh heartbeat + FRESH transcript + dead pid -> DEAD"
reset_case
F1_SID="2eaf4045-4099-4b03-a964-5bde7eb1b3d6"
F1_TRANSCRIPT=$(make_transcript "$F1_SID" 16)
# pid 42648 deliberately NOT in the ps table — the process is gone.
make_marker "cron-registration:cowork-team" "$F1_SID" 328 \
  "$(jq -n --arg t "$F1_TRANSCRIPT" --arg s "$F1_SID" \
     '{jobs:[{identity:"cowork-team master dispatcher",cron_expression:"*/15 * * * *"}],
       registering_process:{fp_version:2, pid:42648, start_epoch:1787445651, comm:"claude",
                            host:"admins-MBP.lan", session_id:$s, transcript:$t}}' | jq -c .)"
OUT=$(run_probe --family cowork-team); RC=$?
check "F1 verdict=DEAD" "$(verdict_of "$OUT")" "DEAD"
check "F1 recommended_action=release_and_register" "$(action_of "$OUT")" "release_and_register"
check "F1 exit=1 (LLM must continue)" "$RC" "1"
check "F1 O1 decided, not O2" "$(printf '%s' "$OUT" | jq -r '.evidence.o1.decides')" "DEAD"
check "F1 the FRESH transcript is recorded but did NOT decide (O1 outranks O2)" \
  "$(printf '%s' "$OUT" | jq -r '.evidence.o2.decides')" "LIVE"
check "F1 transcript age really is 16s in the fixture (else F1 passes trivially)" \
  "$(printf '%s' "$OUT" | jq -r '.evidence.o2.mtime_age_seconds')" "16"
check "F1 heartbeat_age 328s recorded as corroboration only" \
  "$(printf '%s' "$OUT" | jq -r '.evidence.o3.heartbeat_age_seconds')" "328"
check "F1 O3 never decides" "$(printf '%s' "$OUT" | jq -r '.evidence.o3.decides')" "false"
check "F1 DEAD is not an alarm case — no signal written" "$(signal_count)" "0"

# =============================================================================
# F2 — THE LIVE STANDALONE (false-DEAD direction)
# Marker cron-registration:standalone-team, owner 88555d2e, heartbeat_age
# 30948 s (>> T=120), owner absent from the presence roster, recorded pid
# PRESENT with matching start_epoch and comm=claude.  → must be LIVE.
# Captured live during the architect pass; not hypothetical.
# =============================================================================
echo ""
echo "F2 — live standalone: heartbeat 30948s stale, no roster row, pid alive -> LIVE"
reset_case
F2_SID="88555d2e-8fbc-4591-9164-20f6b54d475f"
printf '55501|Sun Aug 23 02:40:51 2026|claude\n' > "$MOCK_PS_TABLE"
make_marker "cron-registration:standalone-team" "$F2_SID" 30948 \
  "$(jq -n --arg s "$F2_SID" \
     '{jobs:[{identity:"standalone-team",cron_expression:"*/30 * * * *"}],
       registering_process:{fp_version:2, pid:55501, start_epoch:1787445651, comm:"claude",
                            host:"admins-MBP.lan", session_id:$s,
                            transcript:"/nonexistent/no-transcript-on-purpose.jsonl"}}' | jq -c .)"
OUT=$(run_probe --family standalone-team); RC=$?
check "F2 verdict=LIVE" "$(verdict_of "$OUT")" "LIVE"
check "F2 recommended_action=no_op" "$(action_of "$OUT")" "no_op"
check "F2 exit=0 (terminal, no LLM read needed)" "$RC" "0"
check "F2 O1 decided LIVE on the full triple" "$(printf '%s' "$OUT" | jq -r '.evidence.o1.decides')" "LIVE"
check "F2 triple_agrees recorded" "$(printf '%s' "$OUT" | jq -r '.evidence.o1.triple_agrees')" "true"
check "F2 a 30948s heartbeat did NOT decide DEAD" \
  "$(printf '%s' "$OUT" | jq -r '.evidence.o3.heartbeat_age_seconds')" "30948"
check "F2 no alarm on a decided verdict" "$(signal_count)" "0"

echo ""
echo "F1+F2 under ONE spec — the parent row's whole thesis"
check "F1 DEAD and F2 LIVE were produced by the same run_probe, no per-family threshold" \
  "$( [ "$(verdict_of "$OUT")" = "LIVE" ] && echo both-directions || echo broken )" "both-directions"

# =============================================================================
# F2b — PID REUSE negative control (brief R2). Recorded pid IS present, but the
# triple disagrees. A pid-only check is a correctness bug, not an optimisation.
# =============================================================================
echo ""
echo "F2b — PID reuse: pid present but start_epoch/comm differ -> DEAD, never LIVE"
reset_case
printf '55501|Sun Aug 23 09:15:00 2026|bash\n' > "$MOCK_PS_TABLE"
make_marker "cron-registration:standalone-team" "$F2_SID" 30948 \
  "$(jq -n '{registering_process:{fp_version:2, pid:55501, start_epoch:1787445651, comm:"claude",
             transcript:"/nonexistent/none.jsonl"}}' | jq -c .)"
OUT=$(run_probe --family standalone-team)
check "F2b verdict=DEAD (start_epoch mismatch)" "$(verdict_of "$OUT")" "DEAD"
check "F2b triple_agrees=false recorded" "$(printf '%s' "$OUT" | jq -r '.evidence.o1.triple_agrees')" "false"

reset_case
printf '55501|Sun Aug 23 02:40:51 2026|bash\n' > "$MOCK_PS_TABLE"
make_marker "cron-registration:standalone-team" "$F2_SID" 30948 \
  "$(jq -n '{registering_process:{fp_version:2, pid:55501, start_epoch:1787445651, comm:"claude",
             transcript:"/nonexistent/none.jsonl"}}' | jq -c .)"
OUT=$(run_probe --family standalone-team)
check "F2b verdict=DEAD (comm mismatch, same start_epoch)" "$(verdict_of "$OUT")" "DEAD"

# =============================================================================
# F3 — pre-v2 marker. registering_process absent, a plain string, or
# fp_version != 2 → UNKNOWN, alarm fired (telegram AND docs/signals row), and
# NO silent STOP. The live broken value is used verbatim as one of the shapes.
# =============================================================================
echo ""
echo "F3 — pre-v2 fingerprint shapes -> UNKNOWN + alarm, never a silent STOP"
for shape in absent string v1; do
  reset_case
  case "$shape" in
    absent) PL='{"jobs":[]}' ;;
    string) PL=$(jq -n '{registering_process:"ppid-42648-start-Dim_23_aoû_02:40:51_2026_-host-admins-MBP.lan"}' | jq -c .) ;;
    v1)     PL=$(jq -n '{registering_process:{fp_version:1, pid:42648, start_epoch:1787445651, comm:"claude"}}' | jq -c .) ;;
  esac
  # stale transcript so O2 cannot rescue it
  make_transcript "peer-f3-session" 99999 >/dev/null
  make_marker "cron-registration:cowork-team" "peer-f3-session" 328 "$PL"
  OUT=$(run_probe --family cowork-team); RC=$?
  check "F3/$shape verdict=UNKNOWN" "$(verdict_of "$OUT")" "UNKNOWN"
  check "F3/$shape exit=1 (never a silent terminal STOP)" "$RC" "1"
  check "F3/$shape O1 reason=pre_v2_fingerprint" "$(printf '%s' "$OUT" | jq -r '.evidence.o1.reason')" "pre_v2_fingerprint"
  check "F3/$shape docs/signals row written" "$(signal_count)" "1"
  check "F3/$shape BUG telegram sent" "$(telegram_count)" "1"
done

echo ""
echo "F3 dedup — the same (family, owner) does not re-alarm while the signal is open"
OUT=$(run_probe --family cowork-team)
check "F3 dedup verdict still UNKNOWN" "$(verdict_of "$OUT")" "UNKNOWN"
check "F3 dedup no second signal file" "$(signal_count)" "1"
check "F3 dedup alarm reports suppression" "$(printf '%s' "$OUT" | jq -r '.evidence.o3.alarm')" "suppressed_open_signal"
check "F3 dedup no second telegram" "$(telegram_count)" "1"

echo ""
echo "F3 dedup — a DIFFERENT owner in the same family DOES alarm (key is the pair)"
make_marker "cron-registration:cowork-team" "a-different-peer-session" 328 '{"jobs":[]}'
OUT=$(run_probe --family cowork-team)
check "F3 different owner re-alarms" "$(signal_count)" "2"

# =============================================================================
# F3b — R1 degrade: transcript unreadable, no usable O1 → UNKNOWN.
# Never LIVE (that is the 8 h outage) and never DEAD (that would steal a live
# peer's marker).
# =============================================================================
echo ""
echo "F3b — unreadable transcript + no O1 -> UNKNOWN, never LIVE and never DEAD"
reset_case
UNREADABLE="$PROBE_HOME/.claude/projects/proj/unreadable-session.jsonl"
printf '{}\n' > "$UNREADABLE"; chmod 000 "$UNREADABLE"
make_marker "cron-registration:cowork-team" "unreadable-session" 10 \
  "$(jq -n --arg t "$UNREADABLE" '{registering_process:{fp_version:1, transcript:$t}}' | jq -c .)"
OUT=$(run_probe --family cowork-team)
check "F3b verdict=UNKNOWN" "$(verdict_of "$OUT")" "UNKNOWN"
check "F3b verdict is not LIVE" "$( [ "$(verdict_of "$OUT")" = "LIVE" ] && echo bad || echo ok )" "ok"
check "F3b verdict is not DEAD" "$( [ "$(verdict_of "$OUT")" = "DEAD" ] && echo bad || echo ok )" "ok"
chmod 644 "$UNREADABLE" 2>/dev/null || true

# =============================================================================
# F4 — locale. The suite already runs under LC_TIME=fr_FR.UTF-8 (set above).
# Assert the REAL, unmocked probe_lstart_to_epoch parses identically to an
# explicit LC_ALL=C run, using the brief's measured positive control.
# =============================================================================
echo ""
echo "F4 — locale: LC_ALL=C-wrapped parse is identical under fr_FR.UTF-8"
check "F4 suite really is running under a non-C LC_TIME" "$LC_TIME" "fr_FR.UTF-8"
F4_GOT=$(probe_lstart_to_epoch "Sun Aug 23 02:40:51 2026")
F4_WANT=$(LC_ALL=C date -j -f "%a %b %d %T %Y" "Sun Aug 23 02:40:51 2026" +%s)
check "F4 positive control pid 42648 -> 1787445651 (brief §4.6)" "$F4_GOT" "1787445651"
check "F4 parse identical to an explicit LC_ALL=C run" "$F4_GOT" "$F4_WANT"
check "F4 1787445651 really is 2026-08-23T00:40:51Z" \
  "$(LC_ALL=C date -u -r 1787445651 +%Y-%m-%dT%H:%M:%SZ)" "2026-08-23T00:40:51Z"

# =============================================================================
# AC-T2 — per-family on_unknown disposition, derived from the probe's own
# has_fire_election_mutex table (never from a per-family threshold).
# =============================================================================
echo ""
echo "AC-T2 — on_unknown derives from has_fire_election_mutex, one table in one script"
check "cowork-team has a cross-session fire-election mutex" "$(probe_family_has_fire_election_mutex cowork-team)" "true"
check "detect-loop has a cross-session fire-election mutex" "$(probe_family_has_fire_election_mutex detect-loop)" "true"
check "standalone-team has NONE" "$(probe_family_has_fire_election_mutex standalone-team)" "false"

for fam in cowork-team detect-loop standalone-team; do
  reset_case
  make_marker "cron-registration:$fam" "peer-$fam" 328 '{"jobs":[]}'
  OUT=$(run_probe --family "$fam")
  case "$fam" in
    standalone-team) WANT="defer" ;;
    *)               WANT="steal" ;;
  esac
  check "AC-T2 $fam UNKNOWN -> $WANT" "$(action_of "$OUT")" "$WANT"
  check "AC-T2 $fam UNKNOWN alarms (defer AND steal both alarm — no branch is silent)" "$(telegram_count)" "1"
done

# =============================================================================
# AC-9 SELF, NO_MARKER, and the bad-family guard
# =============================================================================
echo ""
echo "AC-9 / NO_MARKER / bad-family"
reset_case
make_marker "cron-registration:cowork-team" "$CLAUDE_CODE_SESSION_ID" 328 '{"jobs":[]}'
OUT=$(run_probe --family cowork-team); RC=$?
check "SELF verdict when the probing session owns the marker" "$(verdict_of "$OUT")" "SELF"
check "SELF exit=0 (clean no-op re-arm)" "$RC" "0"
check "SELF never alarms" "$(signal_count)" "0"

reset_case
echo '{"locks":[]}' > "$MOCK_LOCKS"
OUT=$(run_probe --family cowork-team); RC=$?
check "NO_MARKER verdict" "$(verdict_of "$OUT")" "NO_MARKER"
check "NO_MARKER action=register" "$(action_of "$OUT")" "register"
check "NO_MARKER exit=1 (LLM continues to Step 1c)" "$RC" "1"

reset_case
OUT=$(run_probe --family not-a-family 2>/dev/null); RC=$?
check "bad --family verdict=ERROR" "$(verdict_of "$OUT")" "ERROR"
check "bad --family exit=1" "$RC" "1"

# =============================================================================
# Contract shape (AC-1 / AC-8) — every oracle's evidence is always present.
# =============================================================================
echo ""
echo "AC-1/AC-8 — output contract"
reset_case
make_marker "cron-registration:detect-loop" "peer-contract" 328 '{"jobs":[]}'
OUT=$(run_probe --family detect-loop)
check "single line of JSON" "$(printf '%s' "$OUT" | wc -l | tr -d ' ')" "0"
check "parses as JSON" "$(printf '%s' "$OUT" | jq -e . >/dev/null 2>&1 && echo yes || echo no)" "yes"
for k in verdict family marker_owner_session evidence recommended_action; do
  check "top-level key '$k' present" "$(printf '%s' "$OUT" | jq -r "has(\"$k\")")" "true"
done
for k in o1 o2 o3; do
  check "evidence.$k always emitted even when it did not decide" \
    "$(printf '%s' "$OUT" | jq -r ".evidence | has(\"$k\")")" "true"
done

# =============================================================================
# Static proofs — the six measured traps must be handled IN the script, each
# named. A future edit that drops one has to delete the assertion too.
# =============================================================================
echo ""
echo "AC-5 — the six measured traps are handled in the shipped script"
check "TRAP 1a: LC_ALL=C wraps ps" \
  "$(grep -c 'LC_ALL=C ps ' "$PROBE_SH")" "2"
check "TRAP 1b: LC_ALL=C wraps date -j -f" \
  "$([ "$(grep -c 'LC_ALL=C date -j -f' "$PROBE_SH")" -ge 1 ] && echo yes || echo no)" "yes"
check "TRAP 2: no macOS-invalid etimes keyword anywhere" \
  "$(grep -c 'etimes' "$PROBE_SH" | tr -d ' ')" "1"   # the comment naming the trap, nothing else
check "TRAP 2: etimes appears only in a comment" \
  "$(grep 'etimes' "$PROBE_SH" | grep -cv '^#\|^\s*#')" "0"
# Comment lines are stripped before these two greps: the script's own headers
# quote the FORBIDDEN forms verbatim while naming the trap, and asserting on the
# raw file would fail on its own documentation.
CODE_ONLY="$TMPDIR_TEST/probe-code-only.sh"
grep -v '^[[:space:]]*#' "$PROBE_SH" > "$CODE_ONLY"
check "TRAP 3: ps output is captured before any pipe (no 'ps -p ... |' in code)" \
  "$(grep -c 'ps -p [^|]*|' "$CODE_ONLY" | tr -d ' ')" "0"
check "TRAP 4: stat uses %m, never %Sm (in code)" \
  "$(grep -c "stat -f '%Sm'" "$CODE_ONLY" | tr -d ' ')" "0"
check "TRAP 4: stat -f '%m' present" \
  "$([ "$(grep -c "stat -f '%m'" "$PROBE_SH")" -ge 1 ] && echo yes || echo no)" "yes"
check "TRAP 5: the full (pid,start_epoch,comm) triple is compared" \
  "$([ "$(grep -c 'triple_agrees' "$PROBE_SH")" -ge 2 ] && echo yes || echo no)" "yes"
check "TRAP 6: the transcript path encoding is never re-implemented" \
  "$(grep -c "tr '/\._' '-'" "$PROBE_SH" | tr -d ' ')" "0"
check "AC-6: transport is the shared mcp-call.sh, not a bespoke curl" \
  "$(grep -c 'curl ' "$PROBE_SH" | tr -d ' ')" "0"
check "AC-6: mcp-call.sh is sourced" \
  "$([ "$(grep -c 'mcp-call.sh' "$PROBE_SH")" -ge 1 ] && echo yes || echo no)" "yes"
check "AC-3: the has_fire_election_mutex table lives in this script" \
  "$([ "$(grep -c 'probe_family_has_fire_election_mutex' "$PROBE_SH")" -ge 2 ] && echo yes || echo no)" "yes"
check "out-of-zone guard: the probe never edits a cron SKILL.md" \
  "$(grep -cE '^[^#]*\.claude/skills/cron-' "$PROBE_SH" | tr -d ' ')" "0"

# =============================================================================
echo ""
echo "──────────────────────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "OVERALL: FAIL"
  exit 1
fi
echo "OVERALL: PASS"
exit 0
