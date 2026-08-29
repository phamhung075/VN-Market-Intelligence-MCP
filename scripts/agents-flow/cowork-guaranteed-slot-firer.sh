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
# IDENTITY PREAMBLE + ARTIFACT-DELTA WRITEBACK GATE (FIX-COWORK-LAYERC-NO-
# IDENTITY-PREAMBLE, architect brief 2026-08-28): this plane previously
# spawned raw `claude -p <trigger_prompt>` with NO identity preamble — the
# measured exit-0 null fire (pid 70235, 2026-08-26: zero artifacts, the
# spawned session latched onto the project-root CLAUDE.md router protocol and
# self-suppressed via its own ps-grep). _fire_one_slot now composes the SAME
# ENTRY_PROMPT shape as spawn-fanout.md Step 5.2 — shared identity preamble
# (scripts/agents-flow/cowork-identity-preamble.sh, ONE source for both
# planes) + slot.trigger_prompt + SESSION_ID_LINE (synthetic namespaced
# `owner_client_session=cowork-layerc:<slot>:<fire_epoch>`, per-fire unique;
# the leaf flows hard-require a non-empty session id to claim their published
# markers) + SCHEDULED_UTC_LINE (slot.scheduled_utc_time, omitted when null).
# Writeback of last_fired (TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK) is gated
# on ARTIFACT-DELTA PROOF — notebook mtime > fire start (filesystem-only;
# this script has no gateway/MCP access) — NEVER on exit-0 alone. No-delta
# exit-0 is discriminated by re-reading the schedule: a peer-stamped
# redundant dual-plane fire is silent; a genuinely un-stamped null fire
# raises ONE cooldown-bounded BUG alert (fingerprint `nullfire:<slot_id>`).
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
#   WRITE_LAST_FIRED_CMD    — command performing the last_fired writeback, called
#                             with the slot_id as sole argument on artifact-delta
#                             proof only (default: node
#                             scripts/agents-flow/cowork-write-last-fired.js)
#   COWORK_SCHED_FILE        — schedule path re-read by the artifact-delta gate
#                             for peer-stamp discrimination
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

# FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE (architect brief
# docs/architecture-briefs/2026-08-28-fix-cowork-layerc-no-identity-preamble.md §3/§5):
#   WRITE_LAST_FIRED_CMD — command producing the last_fired writeback. Called with the
#                          slot_id as its sole argument, ONLY on artifact-delta proof
#                          (never on exit-0 alone — PO ruling 2).
#   COWORK_SCHED_FILE    — schedule path re-read by the artifact-delta gate to
#                          discriminate a peer-stamped redundant fire from a genuine
#                          null fire.
WRITE_LAST_FIRED_CMD="${WRITE_LAST_FIRED_CMD:-node \"$ROOT/scripts/agents-flow/cowork-write-last-fired.js\"}"
COWORK_SCHED_FILE="${COWORK_SCHED_FILE:-$ROOT/docs/data/cowork-schedule.json}"

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

# ── _compose_entry_prompt <slot_json> <fire_epoch> — FIX-COWORK-LAYERC-NO-IDENTITY-
# PREAMBLE §3: composes the SAME ENTRY_PROMPT shape as spawn-fanout.md Step 5.2 —
# PREAMBLE + slot.trigger_prompt + SESSION_ID_LINE + SCHEDULED_UTC_LINE. Prints the
# composed prompt to stdout. Returns non-zero on preamble-emission failure (missing/
# empty agent — fail loud, never invoke claude with a degraded preamble). The
# synthetic session id `cowork-layerc:<slot_id>:<fire_epoch>` is a namespaced,
# per-fire-unique identity FOR THE LAYER C PLANE (launchd has no coordination session
# of its own; the leaf flows hard-require a non-empty owner_client_session to claim
# their published markers — chef-dish.md / digest-predict / fb-market-poster /
# tran-ngoc-bau Phase-2 claims, verified at source). R1 in the brief §7 is flagged
# for PO: this is an interpretation beyond the literal PO wording, structurally
# required — never a claim of being a real CLI session, never reused across fires
# (<fire_epoch> guarantees per-fire uniqueness), marker claims are TTL-only by
# design. ────────────────────────────────────────────────────────────────────────
_compose_entry_prompt() {
  local slot_json="$1" fire_epoch="$2"
  local slot_id agent trigger_prompt scheduled_utc_time
  local preamble preamble_rc session_id_line scheduled_utc_line

  slot_id=$(printf '%s' "$slot_json" | jq -r '.slot_id // empty' 2>/dev/null)
  agent=$(printf '%s' "$slot_json" | jq -r '.agent // empty' 2>/dev/null)
  trigger_prompt=$(printf '%s' "$slot_json" | jq -r '.trigger_prompt // empty' 2>/dev/null)

  if [ -z "$agent" ]; then
    log_err "ERROR: matched slot missing agent field (slot=$slot_id) — cannot compose identity preamble"
    return 1
  fi

  # ONE shared preamble source — the same script spawn-fanout.md Step 5.2 consumes.
  preamble=$(bash "$ROOT/scripts/agents-flow/cowork-identity-preamble.sh" "$agent")
  preamble_rc=$?
  if [ $preamble_rc -ne 0 ]; then
    log_err "ERROR: identity preamble emission failed (exit=$preamble_rc, slot=$slot_id agent=$agent)"
    return 1
  fi

  scheduled_utc_time=$(printf '%s' "$slot_json" | jq -r '.scheduled_utc_time // empty' 2>/dev/null)
  session_id_line=$'\n\nCoordination: owner_client_session=cowork-layerc:'"$slot_id"':'"$fire_epoch"
  scheduled_utc_line=""
  if [ -n "$scheduled_utc_time" ]; then
    # same rule as Step 5.2 — never emit "scheduled_utc=null" when the producer degrades
    scheduled_utc_line=$'\nscheduled_utc='"$scheduled_utc_time"
  fi

  printf '%s' "${preamble}${trigger_prompt}${session_id_line}${scheduled_utc_line}"
  return 0
}

# ── _artifact_delta_gate <slot_json> <fire_start_epoch> <exit_code> — PO ruling 2
# (FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE §5): TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK
# is gated on ARTIFACT-DELTA PROOF, NEVER exit-0 alone. Proof is filesystem-only (the
# firer has NO gateway/MCP access, per the header INVARIANTS):
#   ARTIFACT_DELTA = notebook exists AND (notebook mtime) > FIRE_START_EPOCH
# where FIRE_START_EPOCH is captured BEFORE the claude invocation and NOTEBOOK is
# docs/agent-memory/notebooks/<slot.agent>.md — every guaranteed-slot flow writes its
# agent notebook as a settled terminal step (chef Step 8b, digest-predict P-6,
# fb-market-poster STEP 8, tran-ngoc-bau notebook), derivable from slot.agent alone
# (no per-agent hardcoded artifact table). macOS-only `stat -f %m` (BSD form) — the
# production host is macOS (launchd plist), same host assumption the script already
# carries for the missing-`timeout` fallback (brief R3).
#
# On PROOF -> stamp via cowork-write-last-fired.js (monotonic forward-only; the
# sibling-fresher-stamp guard inside it makes a peer double-write safe by
# construction). On NO delta -> re-read the schedule to discriminate the two exit-0
# shapes: a peer-stamped redundant dual-plane fire (Layer B published the same slot
# this window) is SILENT; a genuinely un-stamped, artifact-less exit-0 is the measured
# NULL-FIRE defect class — ONE cooldown-bounded BUG alert (fingerprint
# `nullfire:<slot_id>`), never a stamp. Non-zero outcomes are left to the existing
# `slots:<failed_list>` escalation in run_firer(), unchanged. Returns 0 always — the
# caller's return value stays the claude invocation's exit code. ──────────────────
_artifact_delta_gate() {
  local slot_json="$1" fire_start_epoch="$2" exit_code="$3"
  local slot_id agent notebook pre_last_fired post_last_fired
  local write_rc

  slot_id=$(printf '%s' "$slot_json" | jq -r '.slot_id // empty' 2>/dev/null)
  agent=$(printf '%s' "$slot_json" | jq -r '.agent // empty' 2>/dev/null)
  notebook="$ROOT/docs/agent-memory/notebooks/${agent}.md"
  pre_last_fired=$(printf '%s' "$slot_json" | jq -r '.last_fired // empty' 2>/dev/null)

  if [ -f "$notebook" ] && [ "$(stat -f %m "$notebook")" -gt "$fire_start_epoch" ]; then
    # PROOF -> stamp (monotonic, forward-only; sibling-fresher-stamp guard in
    # cowork-write-last-fired.js makes a peer double-write safe by construction).
    log "artifact-delta PROOF: notebook mtime > fire start (slot=$slot_id) — stamping last_fired"
    eval "$WRITE_LAST_FIRED_CMD" "$slot_id"
    write_rc=$?
    if [ $write_rc -ne 0 ]; then
      log_err "ERROR: last_fired writeback failed (exit=$write_rc, slot=$slot_id) — slot stays due, re-fires next tick (AC-P1-7-3 under-suppress posture)"
    fi
    return 0
  fi

  # no notebook delta — discriminate the two exit-0 shapes by re-reading the schedule
  post_last_fired=$(jq -r --arg s "$slot_id" '.slots[] | select(.slot_id == $s) | .last_fired // empty' "$COWORK_SCHED_FILE" 2>/dev/null)
  if [ "$exit_code" -eq 0 ] && { [ -z "$pre_last_fired" ] || [ "$post_last_fired" = "$pre_last_fired" ]; }; then
    # exit-0 null fire on THIS plane (or peer-blocked with NO peer stamp) — the
    # measured defect class: pid 70235 exited 0 with zero artifacts.
    log_err "NULL-FIRE: slot=$slot_id exit=$exit_code NO notebook delta — NOT stamping last_fired"
    _escalate_failure "nullfire:$slot_id" \
      "[cowork-guaranteed-slot-firer] BUG: slot=$slot_id exited 0 with NO artifact delta (notebook $notebook unchanged) — null fire, last_fired NOT stamped. The spawn either latched onto the router protocol or delivered nothing; it will retry next due tick. See $LOG_ERR_FILE"
  else
    # peer stamped meanwhile (redundant dual-plane fire) — peer's stamp stands;
    # nothing to write, nothing to alert. (Non-zero outcomes fall through here too —
    # the existing slots: escalation in run_firer() covers them.)
    log "peer-stamped or non-zero: slot=$slot_id exit=$exit_code no delta — leaving last_fired to the peer"
  fi
  return 0
}

# ── _fire_one_slot: invoke claude headlessly for ONE matched slot JSON
# object. Returns the invocation's exit code (0 for dry-run/skip). Never
# aborts the caller's loop — the caller decides what to do with a non-zero
# return. ─────────────────────────────────────────────────────────────────
_fire_one_slot() {
  local slot_json="$1" dry_run="$2"
  local slot_id trigger_prompt exit_code
  local fire_epoch entry_prompt compose_rc

  slot_id=$(printf '%s' "$slot_json" | jq -r '.slot_id // empty' 2>/dev/null)
  trigger_prompt=$(printf '%s' "$slot_json" | jq -r '.trigger_prompt // empty' 2>/dev/null)

  if [ -z "$slot_id" ] || [ -z "$trigger_prompt" ]; then
    log "WARN: matched slot missing slot_id/trigger_prompt — skipped: $(printf '%s' "$slot_json" | tr '\n' ' ' | cut -c1-200)"
    return 1
  fi

  log "--- guaranteed-slot-firer: slot=$slot_id ---"

  # FIRE_START_EPOCH — captured BEFORE the claude invocation (the artifact-delta
  # gate compares the notebook mtime against it).
  fire_epoch=$(date +%s)
  entry_prompt=$(_compose_entry_prompt "$slot_json" "$fire_epoch")
  compose_rc=$?
  if [ $compose_rc -ne 0 ]; then
    return 1
  fi

  if [ "$dry_run" = "true" ]; then
    log "DRY-RUN: would invoke: (bounded ${FIRE_TIMEOUT_SECONDS}s) $CLAUDE_BIN --dangerously-skip-permissions -p '$entry_prompt'"
    return 0
  fi

  if [ ! -x "$CLAUDE_BIN" ]; then
    log_err "ERROR: claude binary not found or not executable at '$CLAUDE_BIN' (slot=$slot_id)"
    return 1
  fi

  # FOLDED log-fidelity item: this used to print `-p 'slot=$slot_id'` while line
  # below actually executes `-p "$trigger_prompt"`. The log therefore reported a
  # prompt that was never sent, reading as though the firer had dropped the flow
  # path — a plausible and entirely wrong root cause for a triager to chase.
  # Print what is actually executed (now the full composed ENTRY_PROMPT).
  log "invoking (bounded ${FIRE_TIMEOUT_SECONDS}s): $CLAUDE_BIN --dangerously-skip-permissions -p '$entry_prompt'"

  ( cd "$ROOT" && _bounded_exec "$FIRE_TIMEOUT_SECONDS" "$CLAUDE_BIN" --dangerously-skip-permissions -p "$entry_prompt" ) >> "$LOG_FILE" 2>> "$LOG_ERR_FILE"
  exit_code=$?
  log "flow exited (slot=$slot_id exit_code=$exit_code)"

  # FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE §5: artifact-delta writeback gate —
  # NEVER stamp on exit-0 alone.
  _artifact_delta_gate "$slot_json" "$fire_epoch" "$exit_code"

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
