#!/usr/bin/env bash
# scripts/agents-flow/dev-team-tick-preflight.sh
#
# TOKEN-ECONOMY-TICK-PREFLIGHT WU-2 — deterministic dev-team cron-tick
# preflight. Replaces the LLM-narrated presence/SF-1/fire-election chain of
# docs/agents/dev-team/flow/main.md Step 0-PREFLIGHT with one bash+jq+curl
# call on the common RUN/SKIP path.
# Spec: docs/agent-memory/decisions/sprint-TOKEN-ECONOMY-TICK-PREFLIGHT-pm.md
#       § WU-2, docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md (R6/R7/R8)
#
# Steps (mirrors main.md Step 0-PREFLIGHT, minus self-arm — see R6 below):
#   1. Compute TICK (largest scheduled minute in {07,37} <= current minute)
#   2. Presence claim/heartbeat (session-presence:<sid>, TTL=1800) — main.md
#      says explicitly "Presence result is NEVER a gate — always proceed to
#      SF-1", so this step is best-effort: any failure (transport OR
#      malformed JSON) is logged to stderr and swallowed, never blocks.
#   3. SF-1 claim (dev-team-cron-singleton, task_kind=sprint-task, TTL=5400)
#      — THIS gates. Re-entrant self-hold (current_holder.owner_client_session
#      == self) renews + proceeds (FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT, mirrors
#      Step 4's self-hold branch below). Not-claimed by a REAL peer => SKIP
#      path (a): nothing released (never held it). Transport/malformed-JSON
#      => ERROR (R8), lock state undefined, fallback repairs via re-claim.
#   4. Fire-election claim (cron:dev-team:<TICK>, task_kind=sprint-task,
#      TTL=600) — re-entrant self-hold renews + proceeds (matches main.md's
#      RE-ENTRANT branch). Lost-to-peer => SKIP path (b): SF-1 (just claimed
#      in Step 3) is released before SKIP (R7 — two DISTINCT skip paths with
#      different release obligations, must not be collapsed into one).
#      Transport/malformed-JSON => SF-1 is released too (see decision journal
#      — main.md's fallback SF-1 claim step has NO re-entrant self-hold
#      check, so leaving SF-1 held across an ERROR would strand it for the
#      full 90min TTL once the fallback pseudocode re-runs the SF-1 claim
#      and finds it "not claimed" (held by self) and exits — releasing first
#      avoids that self-inflicted deadlock) then ERROR.
#   5. Idle check (RUN path only, evaluated AFTER the fire-election win and
#      BEFORE main.md's Step 0a drain-signals.md ever runs) — P1-IDLE-DEVTEAM-
#      PREFLIGHT-SCRIPT. Mirrors cowork-tick-preflight.sh's SILENT-gate
#      pattern (§_step8_silent_release / Step 7). Reuses the exact fields
#      drain-signals.md's own MANDATORY PERSIST GUARD reads: signal file
#      count (docs/signals/*.json), signals.db mtime freshness, signal_queue
#      NEW-row count, and task_board.active_sprints emptiness. All four empty/
#      fresh => verdict RUN-IDLE — the LLM continuation skips Step 0a drain
#      entirely (drain-signals.md branch lives in main.md, out of this
#      script's scope — P1-IDLE-DEVTEAM-FLOW-BRANCH wires the read side).
#   5.5. Board-hygiene / cold-eviction backstop (dev-team-loop-P2, sprint
#      ULTRACODE-AUDIT-FIXALL task UC-DTL-P2). Runs unconditionally on every
#      LOCK-WINNING tick — i.e. both the RUN and RUN-IDLE verdict branches
#      below, evaluated right after Step 5's idle check and BEFORE either
#      _emit_verdict call. This is a deterministic relocation of
#      docs/agents/dev-team/flow/post-cycle.md's old Step 4.2 (CANON-SCRIPT:
#      that doc section is now the SSOT spec, not the runtime path — see
#      docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
#      #dev-team-loop-P2). Root cause fixed: post-cycle.md Step 4.2 was only
#      reachable via Step 3 dispatch execution, so every "JUMP TO end" shortcut
#      main.md takes (Session Gate, orphan-adoption, RUN-IDLE's own drain-skip,
#      monitoring-only guard) bypassed it — done[]/done_verified[]/terminal
#      sprints re-accumulated unchecked between busy ticks (dev-team-loop-I2).
#      Placing the check here, before either verdict is emitted, guarantees it
#      fires exactly once per lock-winning tick regardless of what the LLM
#      continuation does afterward.
#      Deliberately does NOT run on SKIP or ERROR (both `return` above this
#      point in run_preflight): SKIP means a peer session holds SF-1 and is
#      running its OWN full tick (including its own Step 5.5); re-running
#      hygiene here would duplicate work and blow the SKIP-tick "<=2 tool
#      calls" DoD referenced above. ERROR means lock state is undefined
#      (transport/malformed-JSON on SF-1 or fire-election) — starting a
#      second commit-mutex-guarded write while lock state is unknown is
#      unsafe. See docs/agent-memory/decisions/sprint-UC-DTL-P2-developer.md
#      for the full reasoning (this deviates from a literal "all 4 verdict
#      paths" reading of the dispatch brief, in favor of the architecture
#      brief's own verifier-vetted "every LOCK-WINNING tick" scope).
#
# Verdict JSON (one line, stdout): {verdict, tick, detail}.
#   verdict ∈ RUN|RUN-IDLE|SKIP|ERROR.
# Exit code: 0 = SKIP (no LLM read needed — script already sent the telegram
#   and settled lock state). 1 = RUN|RUN-IDLE|ERROR (LLM continues: RUN reads
#   main.md at `gcc-preflight` onward; RUN-IDLE does the same but skips Step
#   0a drain-signals.md entirely; ERROR falls back to the full original
#   inline pseudocode at `preflight-fallback`).
#
# NOT part of this script (R6 — CronCreate/CronList/CronDelete are Claude
# Code CLI-native tools, unreachable from a curl-based script): self-arm of
# the cron-detect-loop skill. That instruction moved to the CronCreate
# `prompt:` text itself in .claude/skills/cron-detect-loop/SKILL.md Job 1 —
# it now runs FIRST, before this script, on every tick (RUN and SKIP alike).
#
# NOT part of this script (token-economy tradeoff, documented in decision
# journal): the "[dev-team] cron START" telegram main.md used to send before
# any lock step. Sending it unconditionally would push the SKIP-path (a)
# call count from 2 to 3, violating the PM spec's explicit "Skip tick <= 2
# tool calls" DoD. It remains only in the ERROR-fallback pseudocode body.
#
# Env overrides (test seam — CLAUDE_CODE_SESSION_ID is the only one this
# script itself reads beyond mcp-call.sh's MCP_HTTP_URL/MCP_CALL_TIMEOUT_S):
#   CLAUDE_CODE_SESSION_ID — REQUIRED. Coordination parameter, never
#     echoed/logged by this script beyond its use as a bound task_claim/
#     task_heartbeat/task_release arg.
#   PREFLIGHT_ROOT   — project root (default: git-relative from this file).
#   SIGNALS_DIR      — docs/signals/ dir (default: $PREFLIGHT_ROOT/docs/signals).
#   SIGNALS_DB_PATH  — signals.db path (default: $SIGNALS_DIR/signals.db).
#   ORCH_STATE_PATH  — orch-state.json path (default: $PREFLIGHT_ROOT/docs/data/orch/orch-state.json).
#     All four are Step 5 idle-check test seams — see dev-team-tick-preflight.test.sh.
#     ORCH_STATE_PATH is ALSO read by Step 5.5 board-hygiene (same file, same SSOT
#     path — no separate env var). Step 5.5's actual side-effecting calls
#     (orch-cold-evict.sh / orch-state-validate.sh / git commit) are wrapped in the
#     small overridable functions _step55_run_cold_evict / _step55_run_validate /
#     _step55_git_commit_evict — the test harness replaces these wholesale so it
#     NEVER shells out to the real scripts or touches the real git index.
#
# HARD CONSTRAINT: NEVER live-claim dev-team-cron-singleton or
# cron:dev-team:* outside a real cron tick — these are PRODUCTION mutexes.
# Tests for this script MUST mock mcp_call (see
# dev-team-tick-preflight.test.sh) — zero real side-effecting calls.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT="${PREFLIGHT_ROOT:-$DEFAULT_ROOT}"

# shellcheck source=./mcp-call.sh
source "$SCRIPT_DIR/mcp-call.sh"

# ── Step 5 idle-check paths (env-overridable test seams) ─────────────────────
SIGNALS_DIR="${SIGNALS_DIR:-$ROOT/docs/signals}"
SIGNALS_DB_PATH="${SIGNALS_DB_PATH:-$SIGNALS_DIR/signals.db}"
ORCH_STATE_PATH="${ORCH_STATE_PATH:-$ROOT/docs/data/orch/orch-state.json}"
IDLE_STALE_HOURS=24

_trunc() { printf '%s' "$1" | tr '\n' ' ' | cut -c1-200; }

_is_json() {
  if printf '%s' "$1" | jq -e . >/dev/null 2>&1; then
    echo true
  else
    echo false
  fi
}

_emit_verdict() {
  local verdict="$1" tick="$2" detail="$3"
  jq -n --arg verdict "$verdict" --arg tick "$tick" --arg detail "$detail" \
    '{verdict:$verdict, tick:$tick, detail:$detail}'
}

# ── Step 2: presence claim/heartbeat — best-effort, NEVER a gate ─────────────
_step_presence() {
  local session_id="$1" ts="$2"
  local payload_str claim_args claim_result claim_rc claimed holder_session

  payload_str=$(jq -cn --arg agent "dev-team" --arg host "$(hostname)" --arg started "$ts" \
    '{agent_id:$agent, host:$host, started_at:$started, current_task:"preflight"}')
  claim_args=$(jq -n --arg tid "session-presence:$session_id" --arg sess "$session_id" \
    --arg payload "$payload_str" \
    '{task_id:$tid, task_kind:"session-presence", owner_agent:"dev-team", owner_client_session:$sess, ttl_seconds:1800, payload:$payload}')

  claim_result=$(mcp_call "task_claim" "$claim_args" 2>&1); claim_rc=$?
  if [ $claim_rc -ne 0 ]; then
    echo "[dev-team-preflight] WARN: presence claim transport error (non-fatal, never a gate): $(_trunc "$claim_result")" >&2
    return 0
  fi
  if [ "$(_is_json "$claim_result")" != "true" ]; then
    echo "[dev-team-preflight] WARN: presence claim malformed JSON (non-fatal, never a gate): $(_trunc "$claim_result")" >&2
    return 0
  fi

  claimed=$(printf '%s' "$claim_result" | jq -r '.claimed // false' 2>/dev/null)
  if [ "$claimed" != "true" ]; then
    holder_session=$(printf '%s' "$claim_result" | jq -r '.current_holder.owner_client_session // empty' 2>/dev/null)
    if [ "$holder_session" = "$session_id" ]; then
      mcp_call "task_heartbeat" "$(jq -n --arg tid "session-presence:$session_id" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
    fi
  fi
  return 0
}

# ── Step 3: SF-1 claim (dev-team-cron-singleton) ─────────────────────────────
# Prints the raw tool-result JSON (or error text) on stdout.
# Return: 0 = claimed OR re-entrant self-hold renewed, 1 = lost to a REAL peer
#         (current_holder.owner_client_session != self), 2 = transport/malformed error.
# FIX-DEVTEAM-PREFLIGHT-SF1-REENTRANT: mirrors _step_fire_election()'s
# self-hold branch below — a session's OWN held SF-1 must heartbeat-renew and
# proceed, never phantom-SKIP as "peer holds it" for the remaining TTL.
_step_sf1_claim() {
  local session_id="$1" ts="$2"
  local payload_str args result rc claimed holder_session

  payload_str=$(jq -cn --arg site "SF-1" --arg tick "$ts" '{site:$site, tick:$tick}')
  args=$(jq -n --arg tid "dev-team-cron-singleton" --arg sess "$session_id" --arg payload "$payload_str" \
    '{task_id:$tid, task_kind:"sprint-task", owner_agent:"dev-team", owner_client_session:$sess, ttl_seconds:5400, payload:$payload}')

  result=$(mcp_call "task_claim" "$args" 2>&1); rc=$?
  if [ $rc -ne 0 ]; then
    printf '%s' "$result"
    return 2
  fi
  if [ "$(_is_json "$result")" != "true" ]; then
    printf '%s' "$result"
    return 2
  fi

  claimed=$(printf '%s' "$result" | jq -r '.claimed // false' 2>/dev/null)
  if [ "$claimed" = "true" ]; then
    printf '%s' "$result"
    return 0
  fi

  holder_session=$(printf '%s' "$result" | jq -r '.current_holder.owner_client_session // empty' 2>/dev/null)
  if [ "$holder_session" = "$session_id" ]; then
    # Re-entrant: this session already holds SF-1 — renew + proceed. Do NOT
    # treat this as a peer collision (that was the bug: reading only
    # .claimed produced a false "peer holds it" SKIP on a self-held lock).
    mcp_call "task_heartbeat" "$(jq -n --arg tid "dev-team-cron-singleton" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
    printf '%s' "$result"
    return 0
  fi

  # Genuine peer collision (current_holder.owner_client_session != self) —
  # unchanged SKIP path (a) below.
  printf '%s' "$result"
  return 1
}

# ── SF-1 SKIP telegram (path a — peer holds it) ───────────────────────────────
_send_sf1_skip_telegram() {
  local sf1_result="$1"
  local holder_expires now_epoch expires_in_s msg
  holder_expires=$(printf '%s' "$sf1_result" | jq -r '.current_holder.expires_at // empty' 2>/dev/null)
  now_epoch=$(date +%s)
  if [[ "$holder_expires" =~ ^[0-9]+$ ]]; then
    expires_in_s=$(( holder_expires - now_epoch ))
  else
    expires_in_s="?"
  fi
  msg="[dev-team] cron SKIP — single-flight held by peer (TTL ~${expires_in_s}s)"
  mcp_call "send_telegram" "$(jq -n --arg ch "work" --arg msg "$msg" '{channel:$ch, message:$msg}')" >/dev/null 2>&1
}

# ── Step 4: fire-election claim (cron:dev-team:<tick>) ────────────────────────
# Prints the raw tool-result JSON (or error text) on stdout.
# Return: 0 = claimed or re-entrant-renewed, 1 = lost to peer, 2 = transport/malformed error.
_step_fire_election() {
  local session_id="$1" tick="$2"
  local payload_str args result rc claimed holder_session

  payload_str=$(jq -cn --arg site "fire-election" --arg tick "$tick" '{site:$site, tick:$tick}')
  args=$(jq -n --arg tid "cron:dev-team:$tick" --arg sess "$session_id" --arg payload "$payload_str" \
    '{task_id:$tid, task_kind:"sprint-task", owner_agent:"dev-team", owner_client_session:$sess, ttl_seconds:600, payload:$payload}')

  result=$(mcp_call "task_claim" "$args" 2>&1); rc=$?
  if [ $rc -ne 0 ]; then
    printf '%s' "$result"
    return 2
  fi
  if [ "$(_is_json "$result")" != "true" ]; then
    printf '%s' "$result"
    return 2
  fi

  claimed=$(printf '%s' "$result" | jq -r '.claimed // false' 2>/dev/null)
  if [ "$claimed" = "true" ]; then
    printf '%s' "$result"
    return 0
  fi

  holder_session=$(printf '%s' "$result" | jq -r '.current_holder.owner_client_session // empty' 2>/dev/null)
  if [ "$holder_session" = "$session_id" ]; then
    # Re-entrant: this session already holds this tick's key — renew + proceed.
    mcp_call "task_heartbeat" "$(jq -n --arg tid "cron:dev-team:$tick" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
    printf '%s' "$result"
    return 0
  fi

  printf '%s' "$result"
  return 1
}

# ── Step 5: idle check (RUN path only) — mirrors drain-signals.md's own
# MANDATORY PERSIST GUARD fields + signal_queue/active_sprints emptiness.
# Prints "true" (idle — safe to skip Step 0a drain-signals.md entirely) or
# "false" (at least one field non-empty/stale — normal RUN, drain runs).
# Pure filesystem/jq read — makes NO mcp_call (no tool-call cost either way).
_step5_idle_check() {
  local signal_file_count db_mtime_epoch now_epoch age_h db_stale signal_new_count active_sprints_count

  # (a) docs/signals/*.json count — nullglob-safe via 2>/dev/null + wc -l.
  signal_file_count=$(ls "$SIGNALS_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
  [[ "$signal_file_count" =~ ^[0-9]+$ ]] || signal_file_count=0

  # (b) signals.db freshness — mirrors drain-signals.md guard #2 (mtime > 24h
  # => DB write REQUIRED this tick, i.e. NOT idle). Missing file = safe
  # default (nothing has ever been written, R3-style — never blocks idle).
  db_stale="false"
  if [ -f "$SIGNALS_DB_PATH" ]; then
    db_mtime_epoch=$(stat -f "%m" "$SIGNALS_DB_PATH" 2>/dev/null || stat -c "%Y" "$SIGNALS_DB_PATH" 2>/dev/null)
    if [[ "$db_mtime_epoch" =~ ^[0-9]+$ ]]; then
      now_epoch=$(date -u +%s)
      age_h=$(( (now_epoch - db_mtime_epoch) / 3600 ))
      [ "$age_h" -gt "$IDLE_STALE_HOURS" ] && db_stale="true"
    fi
  fi

  # (c) signal_queue NEW rows (any recipient — idle means the whole inbox is empty).
  signal_new_count=$(jq '[.signal_queue.rows[]? | select(.status=="NEW")] | length' "$ORCH_STATE_PATH" 2>/dev/null)
  [[ "$signal_new_count" =~ ^[0-9]+$ ]] || signal_new_count=0

  # (d) task_board.active_sprints emptiness.
  active_sprints_count=$(jq '.task_board.active_sprints // [] | length' "$ORCH_STATE_PATH" 2>/dev/null)
  [[ "$active_sprints_count" =~ ^[0-9]+$ ]] || active_sprints_count=0

  if [ "$signal_file_count" -eq 0 ] && [ "$db_stale" = "false" ] && [ "$signal_new_count" -eq 0 ] && [ "$active_sprints_count" -eq 0 ]; then
    echo true
  else
    echo false
  fi
}

# ── Step 5.5: board-hygiene / cold-eviction backstop (dev-team-loop-P2) ─────
# CANON-SCRIPT for docs/agents/dev-team/flow/post-cycle.md § Step 4.2 (that
# doc section is now the SSOT spec, not the runtime path). Ported verbatim
# (threshold predicate + script invocations), with the doc's comment-annotated
# tool calls (`# task_claim(...)`, `# task_release(...)`) turned into real
# mcp_call invocations — same translation this whole script already performs
# for SF-1/fire-election above.
#
# Pure jq/filesystem read for the threshold check (no mcp_call cost when the
# threshold does not trip — mirrors _step5_idle_check's zero-cost design).
_step55_board_hygiene() {
  local session_id="$1"
  local terminal_sprint_n sprint_goal_terminal_n done_n dv_n

  # Terminal sprint statuses — SSOT: apps/mcp-server/src/infrastructure/orchStateSchema.ts
  # TERMINAL_SET {DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED} — must match
  # scripts/orch-cold-evict.sh $TERMINAL_SPRINT_STATUSES exactly (post-cycle.md:43-44).
  terminal_sprint_n=$(jq '[.task_board.active_sprints[]? | select(
    ((.status // "") | IN("DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED")) or
    ((.status // "") | startswith("BCTC-"))
  )] | length' "$ORCH_STATE_PATH" 2>/dev/null)
  [[ "$terminal_sprint_n" =~ ^[0-9]+$ ]] || terminal_sprint_n=0

  # sprint_goal.entries[] — SEPARATE array from active_sprints[], keyed by
  # sprint_id not id (post-cycle.md:50-56 / FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT).
  sprint_goal_terminal_n=$(jq '[(.sprint_goal.entries // [])[]? | select(
    .sprint_id != null and ((.status // "") | IN("DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"))
  )] | length' "$ORCH_STATE_PATH" 2>/dev/null)
  [[ "$sprint_goal_terminal_n" =~ ^[0-9]+$ ]] || sprint_goal_terminal_n=0

  done_n=$(jq '.task_board.done // [] | length' "$ORCH_STATE_PATH" 2>/dev/null)
  [[ "$done_n" =~ ^[0-9]+$ ]] || done_n=0

  dv_n=$(jq '.task_board.done_verified // [] | length' "$ORCH_STATE_PATH" 2>/dev/null)
  [[ "$dv_n" =~ ^[0-9]+$ ]] || dv_n=0

  if [ "$terminal_sprint_n" -gt 0 ] || [ "$sprint_goal_terminal_n" -gt 0 ] || [ "$done_n" -gt 10 ] || [ "$dv_n" -gt 0 ]; then
    echo "[dev-team-preflight] Terminal bloat: sprints=$terminal_sprint_n sprint_goal=$sprint_goal_terminal_n done=$done_n done_verified=$dv_n — cold eviction" >&2
    _step55_cold_evict_and_commit "$session_id"
  fi
  return 0
}

# ── Step 5.5 side-effecting sub-step: claim commit-mutex, evict, validate,
# commit, release. task_id is the SAME canonical "commit-mutex:main" the
# commit-mutex skill (.claude/skills/commit-mutex/SKILL.md) uses for every
# other orch-state.json writer — a per-caller slug (as post-cycle.md's old
# comment pseudocode suggested) would not actually mutex against other
# writers of the same hot file, defeating the point of the lock.
_step55_cold_evict_and_commit() {
  local session_id="$1"
  local mutex_id="commit-mutex:main"
  local claim_args claim_result claimed

  claim_args=$(jq -n --arg tid "$mutex_id" --arg sess "$session_id" \
    --arg intent "dev-team-preflight Step 5.5 board-hygiene cold-evict" \
    '{task_id:$tid, task_kind:"commit-mutex", owner_agent:"dev-team", owner_client_session:$sess, ttl_seconds:120, payload:({paths:["docs/data/orch/orch-state.json"], intent:$intent} | tojson)}')
  claim_result=$(mcp_call "task_claim" "$claim_args" 2>&1)
  claimed=$(printf '%s' "$claim_result" | jq -r '.claimed // false' 2>/dev/null)
  if [ "$claimed" != "true" ]; then
    echo "[dev-team-preflight] board-hygiene: commit-mutex not acquired (contended or unavailable) — skip this tick, retry next" >&2
    return 0
  fi

  if ! _step55_run_cold_evict; then
    echo "[dev-team-preflight] board-hygiene: orch-cold-evict.sh FAILED — skip commit, retry next tick" >&2
    mcp_call "send_telegram" "$(jq -n --arg ch "bug" --arg msg "[dev-team] board-hygiene: orch-cold-evict.sh failed — cold eviction skipped, retry next tick" '{channel:$ch, message:$msg}')" >/dev/null 2>&1
    mcp_call "task_release" "$(jq -n --arg tid "$mutex_id" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
    return 0
  fi

  if ! _step55_run_validate; then
    echo "[dev-team-preflight] board-hygiene: ABORT post-eviction validation failed — commit skipped" >&2
    mcp_call "send_telegram" "$(jq -n --arg ch "bug" --arg msg "[dev-team] board-hygiene: post-eviction orch-state-validate.sh FAILED — commit skipped, hot file left as orch-cold-evict.sh wrote it" '{channel:$ch, message:$msg}')" >/dev/null 2>&1
    mcp_call "task_release" "$(jq -n --arg tid "$mutex_id" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
    return 0
  fi

  _step55_git_commit_evict

  mcp_call "task_release" "$(jq -n --arg tid "$mutex_id" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
  return 0
}

# ── Overridable side-effect seams (test harness replaces these wholesale —
# see dev-team-tick-preflight.test.sh — NEVER exercised against the live repo).
_step55_run_cold_evict() {
  ORCH_STATE="$ORCH_STATE_PATH" bash "$ROOT/scripts/orch-cold-evict.sh"
}

_step55_run_validate() {
  bash "$ROOT/scripts/orch-state-validate.sh" "$ORCH_STATE_PATH"
}

_step55_git_commit_evict() {
  local yyyymm archive_path
  yyyymm=$(date -u +%Y-%m)
  archive_path="$ROOT/docs/data/orch/archive/${yyyymm}.json"
  git -C "$ROOT" add "$ORCH_STATE_PATH" "$archive_path"
  git -C "$ROOT" commit -m "chore(tasks): cold-evict terminal sprints/done lanes → archive/${yyyymm}.json"
}

run_preflight() {
  local session_id="${CLAUDE_CODE_SESSION_ID:-}"
  if [ -z "$session_id" ]; then
    _emit_verdict "ERROR" "unknown" "CLAUDE_CODE_SESSION_ID not set"
    return 1
  fi

  # ---- Step 1: compute TICK (largest of {07,37} <= current minute) ----
  local current_minute tick_bound tick ts
  current_minute=$(date -u +%M); current_minute=$((10#$current_minute))
  if [ "$current_minute" -ge 37 ]; then
    tick_bound="37"
  else
    tick_bound="07"
  fi
  tick=$(date -u +"%Y-%m-%dT%H:${tick_bound}Z")
  ts=$(date -u +%Y%m%dT%H%M%SZ)

  # ---- Step 2: presence (best-effort, never a gate) ----
  _step_presence "$session_id" "$ts"

  # ---- Step 3: SF-1 claim ----
  local sf1_out sf1_rc
  sf1_out=$(_step_sf1_claim "$session_id" "$ts"); sf1_rc=$?
  case "$sf1_rc" in
    2)
      _emit_verdict "ERROR" "$tick" \
        "SF-1 claim transport/malformed error: $(_trunc "$sf1_out") — lock state undefined, fallback repairs via re-claim"
      return 1
      ;;
    1)
      # SKIP path (a) — R7: never held SF-1, release NOTHING.
      _send_sf1_skip_telegram "$sf1_out"
      _emit_verdict "SKIP" "$tick" "SF-1 held by peer session — no lock acquired, nothing released"
      return 0
      ;;
  esac
  # sf1_rc == 0: SF-1 claimed — proceed to fire-time election.

  # ---- Step 4: fire-election claim ----
  local election_out election_rc
  election_out=$(_step_fire_election "$session_id" "$tick"); election_rc=$?
  case "$election_rc" in
    2)
      # SF-1 was just claimed above — release it before ERROR (see header note:
      # main.md's fallback SF-1 claim has no re-entrant self-hold check, so
      # leaving SF-1 held here would strand it for 90min once the fallback re-runs).
      mcp_call "task_release" "$(jq -n --arg tid "dev-team-cron-singleton" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
      _emit_verdict "ERROR" "$tick" \
        "fire-election claim transport/malformed error: $(_trunc "$election_out") — SF-1 released to avoid stranding lock, fallback repairs via re-claim"
      return 1
      ;;
    1)
      # SKIP path (b) — R7: SF-1 WAS held (claimed in Step 3), release it now.
      mcp_call "send_telegram" "$(jq -n --arg ch "work" --arg msg "[dev-team] fire-election SKIP tick=$tick (peer session leads)" '{channel:$ch, message:$msg}')" >/dev/null 2>&1
      mcp_call "task_release" "$(jq -n --arg tid "dev-team-cron-singleton" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
      _emit_verdict "SKIP" "$tick" "fire-election lost tick=$tick (peer session leads) — SF-1 released"
      return 0
      ;;
  esac
  # election_rc == 0: claimed (or re-entrant-renewed) — both locks HELD.

  # ---- Step 5: idle check (RUN path only, evaluated BEFORE Step 0a drain) ----
  local idle_result
  idle_result=$(_step5_idle_check)

  # ---- Step 5.5: board-hygiene / cold-eviction backstop (dev-team-loop-P2) ----
  # Runs on EVERY lock-winning tick — both the RUN-IDLE and RUN branches below
  # reach this line; SKIP/ERROR all `return` earlier in this function and never
  # execute it. See function header comment for the full rationale.
  _step55_board_hygiene "$session_id"

  if [ "$idle_result" = "true" ]; then
    _emit_verdict "RUN-IDLE" "$tick" \
      "no docs/signals/*.json files, signals.db not stale (<=${IDLE_STALE_HOURS}h or absent), zero NEW signal_queue rows, task_board.active_sprints empty — both locks held, continue main.md at gcc-preflight but SKIP Step 0a drain-signals.md entirely"
    return 1
  fi

  _emit_verdict "RUN" "$tick" \
    "SF-1 (dev-team-cron-singleton, TTL=5400) + fire-election (cron:dev-team:$tick, TTL=600) locks held — continue main.md at gcc-preflight (GCC-PREFLIGHT read + HEAD.lock/worktree-GC); both locks stay held for the rest of the dispatch body, release-at-end unchanged"
  return 1
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_preflight
  exit $?
fi
