#!/usr/bin/env bash
# scripts/agents-flow/cowork-guaranteed-slot-firer.sh
#
# F1-LAUNCHD-COWORK-BACKSTOP — OS-level headless firer for ALL cowork
# guaranteed:true slots. Generalizes (and RETIRES) scripts/cowork-fb-daily-
# firer.sh, which hardcoded a per-slot UTC-window if-chain for fb-daily/
# fb-weekend only.
#
# ROOT CAUSE (unchanged from the retired script — see project memory
# project_cowork_guaranteed_slot_needs_live_cli_session, and the 73h-outage
# re-verification in docs/architecture-briefs/2026-07-07-cowork-guaranteed-
# slot-durability.md §1-2): the cowork-team master dispatcher (*/15
# CronCreate) is SESSION-SCOPED. When the CLI session ends, the dispatcher
# evaporates. There is no cloud RemoteTrigger backstop (STANDING:
# feedback_no_remote_trigger_all_local). Every guaranteed slot due during a
# session-down window is silently missed with no recovery path.
#
# WHY GENERALIZED (architecture brief §3, "Recommended shape"): the retired
# script hardcoded ONE if-block per slot (fb-daily, fb-weekend). Adding a
# 5th/6th/Nth guaranteed slot the same way repeats the exact hardcode-
# accretion pattern CLAUDE.md flags ("detect then reduce debt... hardcode")
# and guarantees the *next* new guaranteed slot repeats this outage. This
# script instead:
#   1. Calls the SAME matcher the live */15 dispatcher uses
#      (scripts/agents-flow/cowork-match-slots.js) — one SSOT
#      (docs/data/cowork-schedule.json), zero drift on "what counts as due"
#      between the OS-level backstop and the live dispatcher.
#   2. Filters the returned slots[] to guaranteed===true (deliberately
#      excludes sub-hourly market/offhours slots — those stay Layer-B-only
#      by design, bounding F-GATHERER-OFFHOURS-STALL-0704).
#   3. For each match, invokes `claude --dangerously-skip-permissions -p`
#      with slot.trigger_prompt READ VERBATIM off the matched slot object —
#      never hardcoded per-agent. A brand-new guaranteed:true row added to
#      cowork-schedule.json is covered automatically — ZERO script edits.
#
# DEDUP SAFETY: unchanged from the retired script. Every guaranteed-slot flow
# (chef.md Step 0.5, digest-predict/flow/main.md pre-D gate, fb-market-
# poster/flow/main.md's own gate) already implements the published-marker
# task_claim gate (FR-P2-7 pattern) BEFORE calling send_telegram. Even if
# this firer fires alongside a live cowork dispatcher, only the first
# invocation that wins the marker publishes. No wrapper-level dedup needed.
#
# HARDENING (architecture brief §3.7): each claude -p invocation is bounded
# by FIRE_TIMEOUT_SECONDS (default 1800s) via _bounded_exec() — closes the
# 2026-07-04 fb-weekend ~4.5h unbounded pile-up risk under launchd's 900s
# re-fire cadence. NOTE (verified empirically at implementation time, not
# assumed — brief §3.7 explicitly required this): this macOS host has
# NEITHER a `timeout` NOR a `gtimeout` binary on PATH (stock macOS ships no
# GNU coreutils `timeout`). _bounded_exec() prefers either if present, but
# the ACTUAL code path exercised in production on this machine is the pure-
# bash background-process + watchdog fallback — not a theoretical branch.
#
# USAGE:
#   bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh [--dry-run]
#   CLAUDE_BIN=/path/to/claude bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh
#
# FLAGS:
#   --dry-run   Log what would be invoked for every guaranteed match; never
#               invoke claude, never check the claude binary exists.
#
# ENV OVERRIDES (test seams — cowork-guaranteed-slot-firer.test.sh sources
# this file and overrides these before calling run_firer()/CLAUDE_BIN as a
# real fake-executable stub; production uses the defaults below):
#   FIRER_ROOT            — project root (default: git-relative from this file)
#   SLOT_MATCHER_CMD       — command producing {slots:[...],drift_min:N} JSON
#                            (default: node scripts/agents-flow/cowork-match-slots.js)
#   CLAUDE_BIN              — path to the claude binary
#   LOG_FILE_PATH / LOG_ERR_FILE_PATH — log destinations
#   FIRE_TIMEOUT_SECONDS    — per-slot invocation bound in seconds (default 1800)
#   CURL_BIN                — curl binary used by the BUG-channel escalation
#   ALERT_STATE_FILE        — 2-line (epoch, fingerprint) cooldown state file
#   ALERT_COOLDOWN_SECONDS  — min seconds between alerts for an UNCHANGED
#                             failure fingerprint (default 21600 = 6h)
#   FIRER_ALERT_CHAT_ID     — overrides the resolved BUG chat id
#
# FAILURE ESCALATION (FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION,
# P0): every non-zero outcome — matcher command failure, unparseable matcher
# output, or >=1 failing slot invocation — now POSTs once to the Telegram BUG
# channel via _escalate_failure(). Cooldown is time AND content based, so an
# ongoing outage alerts ~once per 6h while a NEW failure signature alerts
# immediately. --dry-run never escalates. See _escalate_failure()'s own header
# for why curl-direct is the only path that survives the failure it reports.
#
# INVARIANTS:
#   - NEVER hardcodes a slot_id/trigger_prompt pair — always read off the
#     matched slot object returned by the matcher
#   - NEVER posts SLOT CONTENT without going through the flow's own
#     published-marker dedup gate (this script has no gateway/MCP access of
#     its own). The BUG-channel escalation above is NOT slot content — it is
#     an operational failure report about slots that did NOT run, so it has no
#     marker to contend for and cannot double-publish anything.
#   - One slot's claude invocation failing NEVER aborts processing of the
#     remaining matched slots in the same tick, and produces exactly ONE
#     escalation for the whole tick (never one per slot)
#   - log() NEVER writes to stdout on a non-TTY run — launchd's StandardOutPath
#     for this job is $LOG_FILE, so anything on stdout is written to the log a
#     second time
#
# OWNING FLOW:  docs/agents/cowork-team/flow/main.md (Step 5 spawn-fanout.md)
# SCHEDULE SSOT: docs/data/cowork-schedule.json (.slots[] | select(.guaranteed))
# MATCHER:      scripts/agents-flow/cowork-match-slots.js (unchanged, reused)
# PLIST:        launchd/com.vn-market.cowork-guaranteed-slot-firer.plist
# INSTALL:      launchctl load ~/Library/LaunchAgents/com.vn-market.cowork-guaranteed-slot-firer.plist (ops)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT="${FIRER_ROOT:-$DEFAULT_ROOT}"

SLOT_MATCHER_CMD="${SLOT_MATCHER_CMD:-node \"$ROOT/scripts/agents-flow/cowork-match-slots.js\"}"
CLAUDE_BIN="${CLAUDE_BIN:-/Users/admin/.local/bin/claude}"
LOG_FILE="${LOG_FILE_PATH:-$ROOT/docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log}"
LOG_ERR_FILE="${LOG_ERR_FILE_PATH:-$ROOT/docs/agent-memory/sessions/cowork-guaranteed-slot-firer-error.log}"
FIRE_TIMEOUT_SECONDS="${FIRE_TIMEOUT_SECONDS:-1800}"

# ── Failure-escalation seams (FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-
# ESCALATION) — see _escalate_failure() below. ──────────────────────────────
CURL_BIN="${CURL_BIN:-curl}"
ALERT_STATE_FILE="${ALERT_STATE_FILE:-$ROOT/docs/agent-memory/sessions/cowork-guaranteed-slot-firer-alert-state}"
ALERT_COOLDOWN_SECONDS="${ALERT_COOLDOWN_SECONDS:-21600}"   # 6h — one alert per episode, not per 900s tick

# FOLDED item 7a of FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION: this was
# `echo ... | tee -a "$LOG_FILE"`, which wrote every line TWICE in production —
# once by tee, once by launchd, whose StandardOutPath for this job IS
# "$LOG_FILE" (launchd/com.vn-market.cowork-guaranteed-slot-firer.plist).
# Appending directly and echoing to stdout ONLY on an interactive TTY keeps
# manual `bash ... --dry-run` runs readable while giving launchd nothing to
# duplicate. Always returns 0 — `log` is frequently a function's last
# statement and must never become its return value.
log() {
  local line="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  printf '%s\n' "$line" >> "$LOG_FILE"
  if [ -t 1 ]; then printf '%s\n' "$line"; fi
  return 0
}

# Same, but ALSO appended to the error log. Replaces the old
# `log "..." | tee -a "$LOG_ERR_FILE" >&2` idiom, which depended on log()
# writing to stdout (no longer true) and on stderr, which launchd captures
# into $LOG_ERR_FILE — a second duplication of the same line.
log_err() {
  local line="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  printf '%s\n' "$line" >> "$LOG_FILE"
  printf '%s\n' "$line" >> "$LOG_ERR_FILE"
  if [ -t 2 ]; then printf '%s\n' "$line" >&2; fi
  return 0
}

# ── .env loader — Telegram tokens (mirrors the retired fb-daily-firer.sh) ────
_load_env() {
  local envfile="$ROOT/.env"
  if [ -f "$envfile" ]; then
    set +u
    while IFS='=' read -r key value; do
      case "$key" in '#'*|'') continue ;; esac
      export "$key=$value" 2>/dev/null || true
    done < <(grep -v '^#' "$envfile" | grep '=')
    set -u
  fi
}

# ══ FAILURE ESCALATION (FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-
# ESCALATION, P0) ═══════════════════════════════════════════════════════════
#
# ROOT CAUSE CLOSED: run_firer() has always returned non-zero on failure and
# NOTHING consumed that return code. Measured 2026-08-11: 8 guaranteed slots x
# 3 days, 14 consecutive exit_code=1 claude-CLI invocations, ZERO BUG alerts,
# zero signals, zero board rows — while `launchctl list` reported the job
# healthy the whole time (healthy JOB / 100%-failing WORK). The outage was
# ultimately found by a human noticing a missing Facebook post, two days late.
#
# WHY curl-direct AND NOT send_telegram: this script has no gateway/MCP access
# of its own (see INVARIANTS in the header), and the flow-level send_telegram
# escalation never executes — the claude CLI process dies (exit_code=1,
# weekly-limit message) BEFORE Step 0 of any flow runs. A direct POST is the
# only path that survives the failure it is reporting. Pattern reused verbatim
# from scripts/maybe-deploy-vps.sh:35-41 — deliberately not a second mechanism.
#
# BUG-CHANNEL ENV-VAR NAMING DRIFT (verified live 2026-08-23, do not "simplify"
# this away): the real key in .env is TELEGRAM_REPORT_BUG_CHANNEL_ID, but
# docs/data/system-map.json .telegram_channels[] and several docs still name it
# TELEGRAM_BUG_CHAT_ID (as did this row's own architect_review_note and
# handoff). Binding to either name alone would leave the escalation silently
# disabled — the exact defect class this row exists to close, one level up. So
# both are accepted, real key first. The system-map drift itself is out of this
# row's file scope and is reported in the RETURN block, not patched here.
_bug_chat_id() {
  printf '%s' "${FIRER_ALERT_CHAT_ID:-${TELEGRAM_REPORT_BUG_CHANNEL_ID:-${TELEGRAM_BUG_CHAT_ID:-}}}"
}

# ── _alert_cooldown_ok <fingerprint> — returns 0 when this episode should be
# alerted, 1 when it is a repeat inside the cooldown window. State is two lines
# (epoch, fingerprint) so the guard is BOTH time-based AND content-based: an
# unchanged failure re-fires at most once per ALERT_COOLDOWN_SECONDS (a 67h
# outage becomes ~11 alerts, not 268), while a DIFFERENT failure signature
# alerts immediately — a cooldown must never blind the channel to a new
# episode. Writes the new stamp only when it decides to alert. ──────────────
_alert_cooldown_ok() {
  local fp="$1" prev_fp="" prev_ts=0 now
  now=$(date -u +%s)
  if [ -f "$ALERT_STATE_FILE" ]; then
    prev_ts=$(sed -n '1p' "$ALERT_STATE_FILE" 2>/dev/null)
    prev_fp=$(sed -n '2p' "$ALERT_STATE_FILE" 2>/dev/null)
    case "$prev_ts" in ''|*[!0-9]*) prev_ts=0 ;; esac
    if [ "$prev_fp" = "$fp" ] && [ $((now - prev_ts)) -lt "$ALERT_COOLDOWN_SECONDS" ]; then
      return 1
    fi
  fi
  mkdir -p "$(dirname "$ALERT_STATE_FILE")" 2>/dev/null || true
  printf '%s\n%s\n' "$now" "$fp" > "$ALERT_STATE_FILE"
  return 0
}

# ── _escalate_failure <fingerprint> <message> — the ONLY escalation path in
# this script. Never silently swallows: a missing credential and a failed POST
# are both logged loudly to $LOG_ERR_FILE, because a silently-dropped alert is
# indistinguishable from the pre-fix behaviour. ─────────────────────────────
_escalate_failure() {
  local fp="$1" msg="$2" token chat_id send_rc
  _load_env
  token="${TELEGRAM_BOT_TOKEN:-}"
  chat_id="$(_bug_chat_id)"

  if [ -z "$token" ] || [ -z "$chat_id" ]; then
    log_err "ESCALATION-BLOCKED: a guaranteed-slot failure could not be reported — TELEGRAM_BOT_TOKEN and/or the BUG chat id are unset (.env keys TELEGRAM_BOT_TOKEN / TELEGRAM_REPORT_BUG_CHANNEL_ID). Unreported failure: $msg"
    return 1
  fi

  if ! _alert_cooldown_ok "$fp"; then
    log "escalation suppressed by cooldown (${ALERT_COOLDOWN_SECONDS}s, unchanged fingerprint '$fp')"
    return 0
  fi

  "$CURL_BIN" -s -X POST "https://api.telegram.org/bot${token}/sendMessage" \
    -d chat_id="${chat_id}" \
    -d text="$msg" > /dev/null
  send_rc=$?
  if [ $send_rc -ne 0 ]; then
    log_err "ESCALATION-SEND-FAILED: curl exited $send_rc posting to the BUG channel. Unreported failure: $msg"
    return 1
  fi
  log "escalated to BUG channel (fingerprint='$fp')"
  return 0
}

# ── _bounded_exec: run "$@" bounded by <seconds>. Prefers a real `timeout`/
# `gtimeout` binary if present on PATH; falls back to a pure-bash background-
# process + watchdog otherwise (see header note — this IS the production
# path on this host, verified empirically, not theoretical). ────────────────
_bounded_exec() {
  local seconds="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
    return $?
  fi
  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
    return $?
  fi
  "$@" &
  local cmd_pid=$!
  ( sleep "$seconds" && kill -TERM "$cmd_pid" 2>/dev/null ) &
  local watchdog_pid=$!
  wait "$cmd_pid" 2>/dev/null
  local rc=$?
  kill "$watchdog_pid" 2>/dev/null
  wait "$watchdog_pid" 2>/dev/null
  return $rc
}

# ── _fire_one_slot: invoke claude headlessly for ONE matched slot JSON
# object. Returns the invocation's exit code (0 for dry-run/skip). Never
# aborts the caller's loop — the caller decides what to do with a non-zero
# return. ─────────────────────────────────────────────────────────────────
_fire_one_slot() {
  local slot_json="$1" dry_run="$2"
  local slot_id trigger_prompt exit_code

  slot_id=$(printf '%s' "$slot_json" | jq -r '.slot_id // empty' 2>/dev/null)
  trigger_prompt=$(printf '%s' "$slot_json" | jq -r '.trigger_prompt // empty' 2>/dev/null)

  if [ -z "$slot_id" ] || [ -z "$trigger_prompt" ]; then
    log "WARN: matched slot missing slot_id/trigger_prompt — skipped: $(printf '%s' "$slot_json" | tr '\n' ' ' | cut -c1-200)"
    return 1
  fi

  log "--- guaranteed-slot-firer: slot=$slot_id ---"

  if [ "$dry_run" = "true" ]; then
    log "DRY-RUN: would invoke: (bounded ${FIRE_TIMEOUT_SECONDS}s) $CLAUDE_BIN --dangerously-skip-permissions -p '$trigger_prompt'"
    return 0
  fi

  if [ ! -x "$CLAUDE_BIN" ]; then
    log_err "ERROR: claude binary not found or not executable at '$CLAUDE_BIN' (slot=$slot_id)"
    return 1
  fi

  # FOLDED log-fidelity item: this used to print `-p 'slot=$slot_id'` while
  # line below actually executes `-p "$trigger_prompt"`. The log therefore
  # reported a prompt that was never sent, reading as though the firer had
  # dropped the flow path — a plausible and entirely wrong root cause for a
  # triager to chase. Print what is actually executed.
  log "invoking (bounded ${FIRE_TIMEOUT_SECONDS}s): $CLAUDE_BIN --dangerously-skip-permissions -p '$trigger_prompt'"

  ( cd "$ROOT" && _bounded_exec "$FIRE_TIMEOUT_SECONDS" "$CLAUDE_BIN" --dangerously-skip-permissions -p "$trigger_prompt" ) >> "$LOG_FILE" 2>> "$LOG_ERR_FILE"
  exit_code=$?
  log "flow exited (slot=$slot_id exit_code=$exit_code)"
  return $exit_code
}

# ── run_firer: main entry. Queries the matcher, filters to guaranteed===true,
# fires each match in turn. Returns 0 when every matched slot's invocation
# succeeded (or nothing matched — the common ~90%+ no-op tick). Returns
# non-zero when the matcher itself failed/produced unparseable output, OR
# when >=1 matched slot's invocation exited non-zero (still attempts every
# other match first — never aborts the loop early). ─────────────────────────
run_firer() {
  local dry_run="${1:-false}"
  local raw matcher_rc slots_json count i slot slot_id overall_rc=0 rc slot_err
  local failed_list="" failed_n=0

  # stdout (JSON contract) and stderr (diagnostics: cowork-match-slots.js
  # cadence suppress/skip logs via console.error) are captured separately —
  # folding stderr into the parsed buffer (old: `2>&1`) let an in-tick
  # cadence-skip diagnostic corrupt the jq parse below and silently drop a
  # DUE guaranteed slot as a false "non-JSON output" ERROR (see
  # FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION, ported verbatim from
  # cowork-tick-preflight.sh's Step 6 mktemp stderr-separation idiom). The
  # exit!=0 error path still surfaces matcher stderr in the log message.
  slot_err=$(mktemp)
  raw=$(eval "$SLOT_MATCHER_CMD" 2>"$slot_err"); matcher_rc=$?
  if [ $matcher_rc -ne 0 ]; then
    log_err "ERROR: slot matcher command failed (exit=$matcher_rc): $(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-300) stderr: $(printf '%s' "$(cat "$slot_err")" | tr '\n' ' ' | cut -c1-300)"
    rm -f "$slot_err"
    # A matcher failure is strictly WORSE than one slot failing: NO guaranteed
    # slot can fire at all this tick, and (pre-fix) nothing said so.
    [ "$dry_run" = "true" ] || _escalate_failure "matcher-exit-$matcher_rc" \
      "[cowork-guaranteed-slot-firer] BUG: slot matcher command FAILED (exit=$matcher_rc) — NO guaranteed slot can fire this tick. Nothing downstream escalates this (no gateway/MCP in this script). See $LOG_ERR_FILE"
    return 1
  fi
  rm -f "$slot_err"

  slots_json=$(printf '%s' "$raw" | jq -c '[.slots[]? | select(.guaranteed == true)]' 2>/dev/null)
  if [ -z "$slots_json" ]; then
    log_err "ERROR: slot matcher returned non-JSON output: $(printf '%s' "$raw" | tr '\n' ' ' | cut -c1-300)"
    [ "$dry_run" = "true" ] || _escalate_failure "matcher-nonjson" \
      "[cowork-guaranteed-slot-firer] BUG: slot matcher returned unparseable output — NO guaranteed slot can fire this tick. Nothing downstream escalates this (no gateway/MCP in this script). See $LOG_ERR_FILE"
    return 1
  fi

  count=$(printf '%s' "$slots_json" | jq 'length' 2>/dev/null)
  if ! [[ "$count" =~ ^[0-9]+$ ]] || [ "$count" -eq 0 ]; then
    # Silent no-op — most 15-min ticks are this (~0 token cost, per
    # architecture brief §4 "no-op ticks: bash/node gate only").
    return 0
  fi

  _load_env

  for i in $(seq 0 $((count - 1))); do
    slot=$(printf '%s' "$slots_json" | jq -c ".[$i]")
    slot_id=$(printf '%s' "$slot" | jq -r '.slot_id // "unknown"' 2>/dev/null)
    _fire_one_slot "$slot" "$dry_run"
    rc=$?
    if [ $rc -ne 0 ]; then
      overall_rc=$rc
      failed_list="${failed_list}${failed_list:+, }${slot_id}=exit${rc}"
      failed_n=$((failed_n + 1))
    fi
  done

  # ONE escalation for the whole tick, not one per failing slot — the loop
  # above has already attempted every match (AC-4: a failure never aborts a
  # sibling slot), so by here the tick's full failure set is known.
  if [ $overall_rc -ne 0 ] && [ "$dry_run" != "true" ]; then
    _escalate_failure "slots:$failed_list" \
      "[cowork-guaranteed-slot-firer] BUG: $failed_n of $count guaranteed slot invocation(s) FAILED this tick — $failed_list. Nothing downstream escalates these: the claude CLI dies before Step 0 of any flow runs, and this script has no gateway/MCP access. launchctl will still report the job healthy. See $LOG_ERR_FILE"
  fi

  return $overall_rc
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  DRY_RUN=false
  for arg in "$@"; do
    case "$arg" in
      --dry-run) DRY_RUN=true ;;
      *) echo "[cowork-guaranteed-slot-firer] WARN: unknown arg '$arg' — ignored" >&2 ;;
    esac
  done
  run_firer "$DRY_RUN"
  exit $?
fi
