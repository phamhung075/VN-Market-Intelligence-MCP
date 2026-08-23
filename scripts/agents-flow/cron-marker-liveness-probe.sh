#!/usr/bin/env bash
# scripts/agents-flow/cron-marker-liveness-probe.sh
#
# TASK-CRON-LIVENESS-PROBE-SCRIPT (P0), parent
# FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE.
# Architect brief (read in full before editing):
#   docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md
#
# ONE script, THREE cron families. Decides whether a cron-registration marker's
# owning session is DEAD / LIVE / UNKNOWN by OBSERVING THE OPERATING SYSTEM,
# never by reading bookkeeping the dying session wrote about itself.
#
# ── ROOT CAUSE THIS CLOSES (brief §2) ────────────────────────────────────────
# The three `/cron-*` re-arm skills each carry a byte-identical Step 1b.1 guard
# with three DIFFERENT arbitrary thresholds, and BOTH of its oracles are
# self-reported:
#   - PRIMARY  `task_list_held(kind=session-presence)` is a PARTICIPATION signal,
#     not a liveness signal. Measured 2026-08-23T09:18Z: 2 roster rows against
#     5 live `claude` PIDs. Yields false-DEAD.
#   - FALLBACK `task_force_release_orphan` reads `heartbeat_at` on the SAME
#     marker row — renewed only by the now-dead owner. It answers "was alive T
#     ago", never "is alive". Yields false-LIVE for up to T seconds.
# One defect, two faces: false-LIVE at T=7200 (cowork / detect-loop, which have
# a renewal hook) and false-DEAD at T=120 (standalone, which has none). The two
# families fail in OPPOSITE directions from the SAME spec — that is the proof it
# is a spec bug in the shared guard shape, not per-family operator error.
# NO THRESHOLD VALUE FIXES THIS. Do not "fix" this by tuning a number.
#
# Measured cost, 2026-08-23: the cowork dispatcher died at 00:36Z with a
# maximally-FRESH heartbeat (age 328 s, deep inside T=7200), `/cron-cowork-team`
# ran 15 s after the replacement CLI started, got released:false, and STOPped.
# Dispatcher dead 00:36Z → 08:47Z = 8 h 10 m. pressure-state.json frozen at
# 00:36Z; zero unified-agent syntheses; all sub-hourly slots silent. The marker
# ttl is 691200 s (8 days) and nothing renews it post-mortem, so absent manual
# intervention the stale lock would have blocked re-arm until 2026-08-31.
# It fires exactly when it matters: operators run `/cron-*` seconds after
# relaunching the CLI, i.e. when the predecessor's heartbeat is FRESHEST. Modal
# path, not edge case.
#
# ── ORACLE RANKING — DO NOT REORDER (brief §3) ───────────────────────────────
#   O1  recorded PID absent from `ps`, or present with a different
#       (pid, start_epoch, comm) triple          → soundly proves DEAD, no blind window
#   O2  transcript .jsonl mtime within window W  → soundly proves LIVE
#   O3  heartbeat_age / presence-roster row      → proves NEITHER, corroboration only
#
# O1 is FIRST. At the incident instant the dead session's transcript was 16 s
# old, so ANY mtime threshold above 16 s also returns LIVE — an O2-primary
# design reproduces the same outage with a smaller constant. O3 never decides.
#
# ── VERDICTS ─────────────────────────────────────────────────────────────────
#   DEAD       O1 proves dead                     → release + register
#   LIVE       O2 proves live, OR O1's full triple agrees
#   UNKNOWN    everything else — no v2 fingerprint / transcript unreadable /
#              transport error. THE THIRD BRANCH IS MANDATORY: the pre-existing
#              two-branch LIVE/DEAD shape MUST guess on ambiguity, and it guesses
#              "conservatively as LIVE", which is the branch that cost 8 h 10 m.
#   SELF       the marker is owned by the probing session — clean no-op re-arm
#   NO_MARKER  no marker row for this family      → register
#   ERROR      the probe itself could not run
#
# ── EXIT CODE (mirrors scripts/agents-flow/cowork-tick-preflight.sh) ─────────
#   0 = terminal, the caller may stop and no LLM read is needed (LIVE / SELF)
#   1 = the LLM continues (DEAD / UNKNOWN / NO_MARKER / ERROR)
#
# ── OUTPUT ───────────────────────────────────────────────────────────────────
# Exactly ONE line of JSON on stdout:
#   {verdict, family, marker_owner_session, evidence:{o1,o2,o3}, recommended_action}
# EVERY oracle's raw evidence is emitted even when it did not decide, so a wrong
# verdict is diagnosable from the log alone (AC-8).
#
# ── USAGE ────────────────────────────────────────────────────────────────────
#   bash scripts/agents-flow/cron-marker-liveness-probe.sh \
#        --family cowork-team|detect-loop|standalone-team
#
# ── ENV SEAMS (tests override these; production uses the defaults) ───────────
#   PROBE_ROOT                    project root (default: git-relative from this file)
#   CLAUDE_CODE_SESSION_ID        the probing session's own id (SELF branch, AC-9)
#   PROBE_TRANSCRIPT_MAX_AGE_S    O2 window W in seconds (default 300)
#   PROBE_ALARM_COOLDOWN_S        alarm re-fire cooldown in seconds (default 21600)
#   PROBE_SIGNALS_DIR             docs/signals dir (default: $PROBE_ROOT/docs/signals)
#   PROBE_HOME                    home dir for the pre-v2 transcript glob (default: $HOME)
#   MCP_HTTP_URL / MCP_CALL_TIMEOUT_S   see mcp-call.sh
# Tests additionally override the shell FUNCTIONS `probe_ps_lstart`,
# `probe_ps_comm`, `probe_stat_mtime`, `probe_now_epoch`, `probe_send_telegram`
# and `mcp_call` after sourcing this file — the same function-override harness
# convention as scripts/agents-flow/auditor-tier1-probe.test.sh. Zero real
# ps / stat / network invocations in the test suite.
#
# Gate: bash scripts/agents-flow/cron-marker-liveness-probe.test.sh
#
# OUT OF SCOPE (do not add here): editing any .claude/skills/cron-*/SKILL.md —
# that is TASK-CRON-SKILLMD-PROBE-WIRING, owner agent-father, and those files
# are inside its exclusive commit_zone.

set -uo pipefail

PROBE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE_DEFAULT_ROOT="$(cd "$PROBE_SCRIPT_DIR/../.." && pwd)"
PROBE_ROOT="${PROBE_ROOT:-$PROBE_DEFAULT_ROOT}"

PROBE_TRANSCRIPT_MAX_AGE_S="${PROBE_TRANSCRIPT_MAX_AGE_S:-300}"
PROBE_ALARM_COOLDOWN_S="${PROBE_ALARM_COOLDOWN_S:-21600}"
PROBE_SIGNALS_DIR="${PROBE_SIGNALS_DIR:-$PROBE_ROOT/docs/signals}"
PROBE_HOME="${PROBE_HOME:-$HOME}"

# Transport: reuse the ONE shared helper. Its own header says "Built ONCE per
# architect risk note R1 — do not reinvent this transport per script" (AC-6).
# shellcheck source=./mcp-call.sh
if [ -f "$PROBE_SCRIPT_DIR/mcp-call.sh" ]; then
  # shellcheck disable=SC1091
  . "$PROBE_SCRIPT_DIR/mcp-call.sh"
fi

# =============================================================================
# has_fire_election_mutex — ONE table, in THIS script, not three numbers in
# three docs (AC-3 / brief §4.2).
#
# "Is a second armed copy harmful?" has a different answer per family, but it is
# a CHECKABLE PROPERTY, not a tuning constant: does the family hold a
# cross-session per-tick fire-election mutex? If it does, a second dispatcher
# simply loses the election and fans out nothing, so stealing an UNKNOWN marker
# is safe. If it does not, two concurrent real runs happen, so UNKNOWN must
# defer AND alarm.
#
#   cowork-team      true   scripts/agents-flow/cowork-tick-preflight.sh Step 3
#                           claims cron:cowork:<tick> (ttl 600) + Step 2.5
#                           pressure-state tombstone
#   detect-loop      true   scripts/agents-flow/dev-team-tick-preflight.sh
#                           _step_fire_election() claims cron:dev-team:<tick>
#   standalone-team  false  verified: no cross-session task_claim/cron: mutex in
#                           cron-agent-father.md, cron-claude-manager-helper.md
#                           or cron-db-data-integrity.md; cron-code-janitor.md
#                           has a LOCAL SKIP/SPAWN preflight only, which is not
#                           a cross-session mutex
#
# standalone's `defer` is explicitly TEMPORARY and NARROWING, not a resting
# state: today it is wrong in both directions; after this probe it is wrong in
# at most one, and loudly. The durable fix is to give it the missing per-tick
# mutex — FOLLOWUP-CRON-STANDALONE-PER-TICK-FIRE-ELECTION-MUTEX (brief §4.2 R6),
# deliberately NOT a blocker for this row.
# =============================================================================
probe_family_marker_task_id() {
  case "$1" in
    cowork-team)     printf 'cron-registration:cowork-team' ;;
    detect-loop)     printf 'cron-registration:detect-loop' ;;
    standalone-team) printf 'cron-registration:standalone-team' ;;
    *)               return 1 ;;
  esac
}

probe_family_has_fire_election_mutex() {
  case "$1" in
    cowork-team|detect-loop) printf 'true' ;;
    standalone-team)         printf 'false' ;;
    *)                       return 1 ;;
  esac
}

# =============================================================================
# Mockable OS wrappers. Every measured trap is handled HERE, once, with the trap
# named in a comment (AC-5) — so no caller can reintroduce one by writing its
# own `ps`/`stat` line.
# =============================================================================

# probe_ps_lstart <pid> — raw `lstart` string for a running pid, or EMPTY.
#
# TRAP 1: LC_ALL=C is mandatory. This host runs CEST with LC_TIME=fr_FR.UTF-8;
#   unwrapped, `ps` prints "Dim 23 aoû 02:40:51 2026" and the date parse fails.
# TRAP 3: NEVER test `ps` by exit code through a pipe. `ps -p 99999 -o lstart= |
#   sed …` reports rc=0 because $? came from `sed`, and `ps -p 999999` prints
#   "process id too large" to stderr instead of a clean not-found. Capture
#   stdout BEFORE any pipe and test for EMPTY.
# TRAP 2: macOS `ps` has NO `etimes` keyword (verified: "ps: etimes: keyword not
#   found"). Only `etime` and `lstart` exist. Do not port the Linux idiom.
probe_ps_lstart() {
  local pid="$1" raw
  raw=$(LC_ALL=C ps -p "$pid" -o lstart= 2>/dev/null)
  printf '%s' "$raw"
}

# probe_ps_comm <pid> — the executable name for a running pid, or EMPTY.
# Same capture-before-pipe discipline as probe_ps_lstart (TRAP 3).
probe_ps_comm() {
  local pid="$1" raw
  raw=$(LC_ALL=C ps -p "$pid" -o comm= 2>/dev/null)
  printf '%s' "${raw##*/}"
}

# probe_stat_mtime <path> — file mtime as a UNIX EPOCH, or EMPTY.
#
# TRAP 4: `stat -f '%m'` (epoch), NEVER `stat -f '%Sm'`. Verified on this host,
#   `%Sm` prints "23 aoû 11:03" for a file whose UTC mtime is 09:03Z — a locale
#   trap and a UTC-offset trap in the same field.
probe_stat_mtime() {
  local p="$1" raw
  [ -r "$p" ] || return 0
  raw=$(LC_ALL=C stat -f '%m' "$p" 2>/dev/null)
  printf '%s' "$raw"
}

probe_now_epoch() { LC_ALL=C date -u +%s; }

# probe_lstart_to_epoch "<raw lstart>" — epoch seconds, or EMPTY.
# TRAP 1 again: LC_ALL=C on `date -j -f` too. R3 in the brief's risk register is
#   exactly "one missed wrapper reintroduces the locale defect".
# Positive control (brief §4.6, measured): pid 42648 → "Sun Aug 23 02:40:51 2026"
#   → 1787445651 → 2026-08-23T00:40:51Z.
probe_lstart_to_epoch() {
  local raw="$1" out
  [ -n "$raw" ] || return 0
  out=$(LC_ALL=C date -j -f "%a %b %d %T %Y" "$raw" +%s 2>/dev/null)
  printf '%s' "$out"
}

# probe_send_telegram <message> — BUG-channel alarm. Overridden in tests.
probe_send_telegram() {
  local msg="$1" args
  command -v mcp_call >/dev/null 2>&1 || return 1
  args=$(jq -n --arg m "$msg" '{channel:"bug", message:$m}' 2>/dev/null) || return 1
  mcp_call "send_telegram" "$args" >/dev/null 2>&1
}

# =============================================================================
# Alarm — AC-7 / brief §4.3: NO branch of this guard may terminate silently.
# The 8 h 10 m cost was not caused by the wrong answer alone; it was caused by
# the wrong answer being UNOBSERVABLE. Even a perfect oracle is occasionally
# wrong, so the system must notice.
#
# Dedup key is (family, marker_owner_session), reusing the EXISTING docs/signals
# convention verbatim — an open (undrained) signal with the same stem suppresses
# a duplicate, exactly as scripts/agents-flow/context-bloat-backstop.sh does;
# additionally an ALREADY-PROCESSED signal with the same stem suppresses for
# PROBE_ALARM_COOLDOWN_S, which is the cooldown half of the AC. No new
# suppression mechanism is invented (R5: this host runs several terminals).
# =============================================================================
probe_alarm() {
  local family="$1" owner="$2" verdict="$3" reason="$4" action="$5"
  local stem_key stem_prefix now stamp signal_file existing processed_recent proc_dir

  stem_key=$(printf '%s-%s' "$family" "$owner" | tr -c 'A-Za-z0-9-' '-')
  stem_prefix="cron-marker-liveness-${stem_key}"
  now=$(probe_now_epoch)

  mkdir -p "$PROBE_SIGNALS_DIR" 2>/dev/null || true
  proc_dir="$PROBE_SIGNALS_DIR/processed"

  existing=$(find "$PROBE_SIGNALS_DIR" -maxdepth 1 -name "${stem_prefix}-*.json" 2>/dev/null | head -1)
  if [ -n "$existing" ]; then
    printf 'suppressed_open_signal'
    return 0
  fi

  if [ -d "$proc_dir" ]; then
    processed_recent=""
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      local m
      m=$(probe_stat_mtime "$f")
      case "$m" in ''|*[!0-9]*) continue ;; esac
      if [ $((now - m)) -lt "$PROBE_ALARM_COOLDOWN_S" ]; then processed_recent="$f"; break; fi
    done <<EOF
$(find "$proc_dir" -maxdepth 1 -name "${stem_prefix}-*.json" 2>/dev/null)
EOF
    if [ -n "$processed_recent" ]; then
      printf 'suppressed_cooldown'
      return 0
    fi
  fi

  stamp=$(LC_ALL=C date -u -r "$now" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
  [ -n "$stamp" ] || stamp=$(LC_ALL=C date -u +%Y-%m-%dT%H:%M:%SZ)
  signal_file="$PROBE_SIGNALS_DIR/${stem_prefix}-$(printf '%s' "$stamp" | tr -d ':').json"

  jq -n \
    --arg family "$family" --arg owner "$owner" --arg verdict "$verdict" \
    --arg reason "$reason" --arg action "$action" --arg ts "$stamp" \
    --arg dedup "cron-marker-liveness:${family}:${owner}" \
    '{from:"cron-marker-liveness-probe", to:"claude-manager-helper",
      type:"cron_marker_liveness_unknown", priority:"high", createdAt:$ts,
      payload:{family:$family, marker_owner_session:$owner, verdict:$verdict,
               reason:$reason, recommended_action:$action, dedup_key:$dedup,
               action_required:"resolve_cron_marker_liveness_by_hand"}}' \
    > "$signal_file" 2>/dev/null || { printf 'signal_write_failed'; return 1; }

  probe_send_telegram "[cron-marker-liveness-probe] $verdict family=$family owner=$owner — $reason. Recommended: $action. Signal: ${signal_file#$PROBE_ROOT/}" \
    && printf 'alarmed' || printf 'alarmed_signal_only'
  return 0
}

# =============================================================================
# probe_emit <verdict> <family> <owner> <o1> <o2> <o3> <action>
# One line of JSON on stdout. o1/o2/o3 are pre-built JSON objects.
# =============================================================================
probe_emit() {
  jq -n -c \
    --arg verdict "$1" --arg family "$2" --arg owner "$3" \
    --argjson o1 "$4" --argjson o2 "$5" --argjson o3 "$6" \
    --arg action "$7" \
    '{verdict:$verdict, family:$family, marker_owner_session:$owner,
      evidence:{o1:$o1, o2:$o2, o3:$o3}, recommended_action:$action}'
}

# =============================================================================
# run_probe --family <cowork-team|detect-loop|standalone-team>
# =============================================================================
run_probe() {
  local family="" arg
  while [ $# -gt 0 ]; do
    arg="$1"
    case "$arg" in
      --family) shift; family="${1:-}" ;;
      --family=*) family="${arg#--family=}" ;;
      *) echo "[cron-marker-liveness-probe] WARN: unknown arg '$arg' — ignored" >&2 ;;
    esac
    shift || true
  done

  local o1='{"available":false,"reason":"not_evaluated"}'
  local o2='{"available":false,"reason":"not_evaluated"}'
  local o3='{"available":false,"reason":"not_evaluated"}'

  local marker_task_id has_mutex
  marker_task_id=$(probe_family_marker_task_id "$family") || {
    probe_emit "ERROR" "${family:-unset}" "" "$o1" "$o2" "$o3" "abort_bad_family"
    echo "[cron-marker-liveness-probe] ERROR: --family must be one of cowork-team|detect-loop|standalone-team (got '${family:-<empty>}')" >&2
    return 1
  }
  has_mutex=$(probe_family_has_fire_election_mutex "$family")

  # on_unknown derives from the measured property, never from a per-family number.
  local on_unknown="defer"
  [ "$has_mutex" = "true" ] && on_unknown="steal"

  # ── Read the marker (AC-6: shared transport, never a bespoke curl) ─────────
  if ! command -v mcp_call >/dev/null 2>&1; then
    probe_emit "ERROR" "$family" "" "$o1" "$o2" "$o3" "$on_unknown"
    echo "[cron-marker-liveness-probe] ERROR: mcp-call.sh not loadable — transport unavailable" >&2
    return 1
  fi

  local locks_raw
  locks_raw=$(mcp_call "task_list_held" '{"kind":"sprint-task"}' 2>/dev/null)
  if [ -z "$locks_raw" ]; then
    o3='{"available":false,"reason":"transport_error"}'
    probe_emit "ERROR" "$family" "" "$o1" "$o2" "$o3" "$on_unknown"
    echo "[cron-marker-liveness-probe] ERROR: task_list_held returned nothing (transport)" >&2
    return 1
  fi

  # `task_list_held` has no task_id filter — filter client-side.
  local marker
  marker=$(printf '%s' "$locks_raw" \
    | jq -c --arg id "$marker_task_id" 'first(.locks[]? | select(.task_id == $id)) // empty' 2>/dev/null)

  if [ -z "$marker" ]; then
    o3='{"available":true,"marker_present":false}'
    probe_emit "NO_MARKER" "$family" "" "$o1" "$o2" "$o3" "register"
    return 1
  fi

  local owner heartbeat_at now heartbeat_age payload
  owner=$(printf '%s' "$marker" | jq -r '.owner_client_session // ""')
  heartbeat_at=$(printf '%s' "$marker" | jq -r '.heartbeat_at // empty')
  now=$(probe_now_epoch)
  heartbeat_age="null"
  case "$heartbeat_at" in
    ''|*[!0-9]*) ;;
    *) heartbeat_age=$((now - heartbeat_at)) ;;
  esac

  # `payload` arrives as a JSON *string*, not an object — parse it defensively.
  payload=$(printf '%s' "$marker" | jq -c '(.payload // "{}") | if type=="string" then (try fromjson catch {}) else . end' 2>/dev/null)
  [ -n "$payload" ] || payload='{}'

  # O3 — corroboration ONLY. Recorded in the evidence, never allowed to decide.
  o3=$(jq -n --argjson age "$heartbeat_age" --arg owner "$owner" \
    '{available:true, heartbeat_age_seconds:$age, marker_owner_session:$owner,
      decides:false,
      note:"heartbeat_at is renewed only by the marker owner itself, so it proves neither LIVE nor DEAD; corroboration only (brief S3)"}')

  # ── AC-9 SELF: a re-arm inside the owning session is a clean no-op ─────────
  local self_sid="${CLAUDE_CODE_SESSION_ID:-}"
  if [ -n "$self_sid" ] && [ "$owner" = "$self_sid" ]; then
    o1='{"available":false,"reason":"self_owned_no_fingerprint_check_needed"}'
    o2='{"available":false,"reason":"self_owned_no_transcript_check_needed"}'
    probe_emit "SELF" "$family" "$owner" "$o1" "$o2" "$o3" "no_op_self"
    return 0
  fi

  # ── AC-4: v2 fingerprint reader, with strict backward compat ──────────────
  # `registering_process` absent, a plain string (the live pre-v2 value
  # "ppid-42648-start-Dim_23_aoû_02:40:51_2026_-host-admins-MBP.lan"), or
  # fp_version != 2 → O1 UNAVAILABLE → UNKNOWN, never a guess. This probe only
  # READS the field; TASK-CRON-SKILLMD-PROBE-WIRING makes the skills WRITE it.
  local fp fp_type fp_version fp_pid fp_start fp_comm fp_transcript
  fp=$(printf '%s' "$payload" | jq -c '.registering_process // null' 2>/dev/null)
  fp_type=$(printf '%s' "$fp" | jq -r 'type' 2>/dev/null)
  fp_version=""
  if [ "$fp_type" = "object" ]; then
    fp_version=$(printf '%s' "$fp" | jq -r '.fp_version // ""')
  fi

  local o1_state="unavailable"
  if [ "$fp_type" != "object" ] || [ "$fp_version" != "2" ]; then
    o1=$(jq -n --arg t "$fp_type" --arg v "$fp_version" \
      '{available:false, reason:"pre_v2_fingerprint", fingerprint_type:$t, fp_version:(if $v=="" then null else $v end),
        note:"registering_process is absent, a string, or fp_version!=2 — O1 cannot run. UNKNOWN, never a guess (AC-4)."}')
  else
    fp_pid=$(printf '%s' "$fp" | jq -r '.pid // ""')
    fp_start=$(printf '%s' "$fp" | jq -r '.start_epoch // ""')
    fp_comm=$(printf '%s' "$fp" | jq -r '.comm // ""')
    fp_transcript=$(printf '%s' "$fp" | jq -r '.transcript // ""')

    case "$fp_pid" in
      ''|*[!0-9]*)
        o1='{"available":false,"reason":"fingerprint_missing_pid"}'
        ;;
      *)
        local live_lstart live_start live_comm
        live_lstart=$(probe_ps_lstart "$fp_pid")
        if [ -z "$live_lstart" ]; then
          # TRAP 3 honoured: emptiness of captured stdout, not a piped exit code.
          o1=$(jq -n --arg pid "$fp_pid" \
            '{available:true, decides:"DEAD", pid:($pid|tonumber), pid_present:false,
              note:"recorded pid absent from the process table — a process cannot be running and absent. No threshold, no blind window (brief S3 O1)."}')
          o1_state="dead"
        else
          live_start=$(probe_lstart_to_epoch "$live_lstart")
          live_comm=$(probe_ps_comm "$fp_pid")
          # TRAP 5 (R2): PID REUSE. Never check pid alone — the full
          # (pid, start_epoch, comm) triple must agree. A pid-only check is a
          # correctness bug, not an optimisation.
          if [ "$live_start" = "$fp_start" ] && [ "$live_comm" = "$fp_comm" ]; then
            o1=$(jq -n --arg pid "$fp_pid" --arg s "$live_start" --arg c "$live_comm" \
              '{available:true, decides:"LIVE", pid:($pid|tonumber), pid_present:true,
                start_epoch:$s, comm:$c, triple_agrees:true}')
            o1_state="live"
          else
            o1=$(jq -n --arg pid "$fp_pid" --arg ls "$live_start" --arg lc "$live_comm" \
              --arg rs "$fp_start" --arg rc "$fp_comm" \
              '{available:true, decides:"DEAD", pid:($pid|tonumber), pid_present:true,
                triple_agrees:false, observed:{start_epoch:$ls, comm:$lc},
                recorded:{start_epoch:$rs, comm:$rc},
                note:"pid is present but the (pid,start_epoch,comm) triple disagrees — PID REUSE, the owner is dead (brief R2)."}')
            o1_state="dead"
          fi
        fi
        ;;
    esac
  fi

  # ── O2: transcript mtime. Proves LIVE only. ───────────────────────────────
  # TRAP 6: read the transcript path FROM THE MARKER — never re-derive it. The
  # cwd encoding (/→-, _→-, .→-) is fragile; the arming session already knows
  # its own absolute path. Pre-v2 markers fall back to a bounded glob, which is
  # immune to the encoding rules changing.
  local tpath="" tmtime="" tage="null"
  if [ -n "${fp_transcript:-}" ]; then
    tpath="$fp_transcript"
  elif [ -n "$owner" ]; then
    tpath=$(find "$PROBE_HOME/.claude/projects" -maxdepth 2 -name "${owner}.jsonl" 2>/dev/null | head -1)
  fi

  if [ -z "$tpath" ]; then
    o2='{"available":false,"reason":"no_transcript_path"}'
  elif [ ! -r "$tpath" ]; then
    # R1: an unreadable peer transcript (other macOS user / sandboxed path)
    # degrades to UNAVAILABLE — never to LIVE and never to DEAD (AC-10).
    o2=$(jq -n --arg p "$tpath" '{available:false, reason:"transcript_unreadable", path:$p,
      note:"R1 degrade — unreadable transcript proves nothing in either direction (AC-10)."}')
  else
    tmtime=$(probe_stat_mtime "$tpath")
    case "$tmtime" in
      ''|*[!0-9]*)
        o2=$(jq -n --arg p "$tpath" '{available:false, reason:"transcript_mtime_unreadable", path:$p}')
        ;;
      *)
        tage=$((now - tmtime))
        if [ "$tage" -le "$PROBE_TRANSCRIPT_MAX_AGE_S" ]; then
          o2=$(jq -n --arg p "$tpath" --argjson a "$tage" --argjson w "$PROBE_TRANSCRIPT_MAX_AGE_S" \
            '{available:true, decides:"LIVE", path:$p, mtime_age_seconds:$a, window_seconds:$w}')
        else
          o2=$(jq -n --arg p "$tpath" --argjson a "$tage" --argjson w "$PROBE_TRANSCRIPT_MAX_AGE_S" \
            '{available:true, decides:null, path:$p, mtime_age_seconds:$a, window_seconds:$w,
              note:"stale transcript proves nothing — idle is not dead (brief S3 O2 cannot prove DEAD)."}')
        fi
        ;;
    esac
  fi

  # ── Verdict. ORDER IS LOAD-BEARING: O1 outranks O2. ───────────────────────
  # At the 2026-08-23 incident instant the dead session's transcript was 16 s
  # old, so ANY design consulting O2 first returns LIVE and reproduces the
  # 8 h 10 m outage with a smaller constant. This is exactly what fixture F1 in
  # cron-marker-liveness-probe.test.sh proves.
  if [ "$o1_state" = "dead" ]; then
    probe_emit "DEAD" "$family" "$owner" "$o1" "$o2" "$o3" "release_and_register"
    return 1
  fi

  if [ "$o1_state" = "live" ]; then
    probe_emit "LIVE" "$family" "$owner" "$o1" "$o2" "$o3" "no_op"
    return 0
  fi

  # O1 unavailable → O2 may still prove LIVE.
  local o2_decides
  o2_decides=$(printf '%s' "$o2" | jq -r '.decides // ""' 2>/dev/null)
  if [ "$o2_decides" = "LIVE" ]; then
    probe_emit "LIVE" "$family" "$owner" "$o1" "$o2" "$o3" "no_op"
    return 0
  fi

  # ── UNKNOWN — the mandatory third branch. Never silent (AC-7). ────────────
  local reason alarm_result
  reason=$(printf '%s' "$o1" | jq -r '.reason // "o1_unavailable"' 2>/dev/null)
  alarm_result=$(probe_alarm "$family" "$owner" "UNKNOWN" \
    "O1 unavailable ($reason) and O2 did not prove LIVE — liveness is genuinely undetermined" \
    "$on_unknown")
  o3=$(printf '%s' "$o3" | jq -c --arg a "${alarm_result:-alarm_failed}" '. + {alarm:$a}')
  probe_emit "UNKNOWN" "$family" "$owner" "$o1" "$o2" "$o3" "$on_unknown"
  return 1
}

# ── Standalone execution only (never when sourced by the test harness) ───────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_probe "$@"
  exit $?
fi
