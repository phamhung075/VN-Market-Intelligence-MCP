#!/usr/bin/env bash
# scripts/agents-flow/lib/tick-telemetry.sh
#
# WU-0 (TICK-PREFLIGHT-USAGE-INSTRUMENTATION): shared, jq-only usage-telemetry
# emit-helper library, sourced by the 3 "*-tick-preflight.sh" / auditor-tier1-
# probe.sh cron scripts (WU-1/WU-2/WU-3 — never duplicated). Same extraction
# shape as scripts/agents-flow/lib/hook-guard.sh and
# scripts/agents-flow/lib/notebook-section-direction.sh: `tt_`-prefixed
# functions, `set -u`, bash 3.2+ syntax only (no mapfile, no associative
# arrays, no `local -r`), sourced — never executed standalone.
#
# Spec: docs/handoffs/TASK_TICK-WU-0-TELEMETRY-LIB.md +
#       docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md
#       § [Architect] Q1-Q6 Ratification + Design decisions.
#
# Purpose: record ONE compact JSON line per real (non-test, non-sourced)
# invocation of a wired script's trailer — the choke point ALL 3 target
# scripts already converge on before this task began:
#   if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then run_preflight; exit $?; fi
# WU-1/WU-2/WU-3 wire `tt_capture_and_log <script_name> <fn> [args...]` in
# place of the bare `<fn>; exit $?` call — this file does NOT itself touch
# any of the 3 target scripts (that is WU-1/2/3's own scope, gated on this
# task landing green).
#
# Recorded fields (FR-5, exact — "no more, no less"):
#   ts (date -u +%Y-%m-%dT%H:%M:%SZ, real wallclock, never hand-typed),
#   script, verdict, tick (null when the source script's own verdict JSON
#   has no "tick" key — e.g. auditor-tier1-probe.sh's run_probe()/
#   run_tiered_probe() output), verdict_bytes (true byte length via `wc -c`,
#   multi-byte-safe — NOT bash `${#var}`, which is locale-dependent),
#   elapsed_ms, exit_code.
# Explicitly NOT recorded: CLAUDE_CODE_SESSION_ID (never, not even hashed —
# cowork-tick-preflight.sh:56-57's stated contract), any computed
# token/cost estimate (scope_out (c) — verdict_bytes is a LOWER BOUND on
# true per-tick cost, see docs/policies/dev-standards.md CANONICAL block).
#
# All failure paths (unwritable destination, missing parent dir, permission
# error, disk full, malformed captured JSON) degrade SILENTLY — every branch
# of log_tick_usage ends in `return 0`, never propagated to the caller
# (AC-4/AC-5). Nothing in this file ever writes to real stdout — logging is
# a pure local O_APPEND file write, single `write()` syscall per line, never
# read-modify-write, never `flock` (matches this repo's existing
# no-`flock`-anywhere convention; AC-9/FR-9).
set -u

# Default rotation cap (FR-8) — overridable per-invocation (tests) or
# per-environment. ~52-104 days of history at these scripts' real cadences
# (cowork 15min, dev-team 7/37min, auditor 30/60min).
: "${TICK_TELEMETRY_MAX_LINES:=5000}"

# --- tt_epoch_ms ------------------------------------------------------------
# Milliseconds since epoch. Q5 ratification: bash `EPOCHREALTIME` (sub-second,
# zero subprocess) when available (bash 5+), graceful degrade to
# `date -u +%s`-based SECOND-PRECISION (rounds down, reported as a multiple
# of 1000) when not. Both branches parse under bash 3.2 (plain POSIX
# parameter expansion + arithmetic, no bash4+-only syntax). Verified live on
# this machine: `bash --version` / `/bin/bash --version` both report 3.2.57,
# EPOCHREALTIME unset — the degrade path is this session's live reality, not
# a hypothetical. This does NOT touch the `date %N/%3N` landmine (memory
# feedback_bsd_date_3n_literal_corrupts_iso8601) — the fallback never calls
# `date` with any sub-second format specifier, only the always-safe
# `date -u +%s`. No python3 introduced.
#
# Deviation from the architect blueprint's pseudocode, flagged (not silent):
# the blueprint's EPOCHREALTIME branch did `$(( sec * 1000 + ${micro:0:3} ))`
# with no base prefix. EPOCHREALTIME's fractional part is always 6
# zero-padded digits (e.g. "007123") — bash arithmetic treats ANY literal
# with a leading "0" as OCTAL, so on ~1-in-10 ticks (fractional part < 0.1s)
# this either silently mis-computes elapsed_ms (valid-but-wrong octal value,
# e.g. "052" read as 42 instead of 52) or crashes the tick outright
# ("value too great for base" whenever an 8/9 digit appears, e.g. "008").
# This is the exact class of silent-corruption landmine this task's own
# constraints warn against reintroducing. Fix: force base-10 parsing via the
# `10#` prefix on both operands — same EPOCHREALTIME + date+%s mechanism,
# same documented second-precision degrade, zero new fields/flags, only the
# leading-zero-octal defect corrected. See docs/policies/dev-standards.md
# CANONICAL block + this task's decision journal entry for the same note.
tt_epoch_ms() {
  if [ -n "${EPOCHREALTIME:-}" ]; then
    local sec micro
    sec="${EPOCHREALTIME%.*}"
    micro="${EPOCHREALTIME#*.}"
    printf '%s' "$(( 10#$sec * 1000 + 10#${micro:0:3} ))"
  else
    printf '%s' "$(( $(date -u +%s) * 1000 ))"
  fi
}

# --- _tt_log_path <script> [internal] ---------------------------------------
# Q6 ratification: root resolution checked, in order:
#   1. TICK_TELEMETRY_LOG_PATH (new, explicit override — required for
#      auditor-tier1-probe.test.sh per R2: its suite has NO seam to override
#      REPO_ROOT, only its derived *_PATH vars).
#   2. PREFLIGHT_ROOT (cowork/dev-team's existing overridable root var).
#   3. REPO_ROOT (auditor's existing, non-overridable-by-design root var).
#   4. Belt-and-suspenders fallback computed from THIS file's own on-disk
#      location (scripts/agents-flow/lib/tick-telemetry.sh — 3 levels above
#      repo root: lib -> agents-flow -> scripts -> repo root). Deviation
#      from the architect blueprint's literal pseudocode, flagged: that
#      pseudocode used only 2 "../" (dirname(BASH_SOURCE)/../..), which
#      resolves to <repo_root>/scripts, not <repo_root> — an off-by-one that
#      would silently write telemetry under scripts/docs/data/telemetry/
#      instead of docs/data/telemetry/. Corrected to 3 "../" here. No git
#      subprocess is used for this fallback (would cost a new subprocess
#      fork on every invocation lacking PREFLIGHT_ROOT/REPO_ROOT, violating
#      NFR-2) — and in practice this branch is unreachable on all 3 real
#      callers, which already export one of PREFLIGHT_ROOT/REPO_ROOT.
#   Zero edits to any existing root-resolution line in any of the 3 calling
#   scripts (Q6) — this file handles the PREFLIGHT_ROOT/REPO_ROOT naming
#   divergence internally.
# Returns the resolved path on stdout via `printf` (no trailing newline) and
# exit 0, or prints nothing and returns 1 when no root can be resolved at
# all (caller must treat that as "cannot log", not crash).
_tt_log_path() {
  local script="$1"
  if [ -n "${TICK_TELEMETRY_LOG_PATH:-}" ]; then
    printf '%s' "$TICK_TELEMETRY_LOG_PATH"
    return 0
  fi
  local root="${PREFLIGHT_ROOT:-${REPO_ROOT:-}}"
  if [ -z "$root" ]; then
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." 2>/dev/null && pwd 2>/dev/null)"
  fi
  if [ -z "$root" ]; then
    return 1
  fi
  printf '%s/docs/data/telemetry/%s.jsonl' "$root" "${script%.sh}"
  return 0
}

# --- _tt_rotate <logpath> [internal] -----------------------------------------
# FR-8: size-capped (TICK_TELEMETRY_MAX_LINES, default 5000), tail-truncate,
# ATOMIC tmp+mv swap (never in-place truncate) — mirrors the existing
# _write_heartbeat()/`_widen_write_counter()` atomic-write idiom already used
# in these same 3 scripts. Checked on every append (`wc -l` — cheap local
# read, no MCP/git/network cost; NFR-2 governs tool-call cost, not local
# wc/tail). Explicitly stated per AC-8's own requirement: an append that
# lands between this function's `tail` read and its `mv` swap targets the
# file about to be replaced and is LOST — accepted tradeoff, not fixed
# (one-file-per-script (Q2) already collapses the realistic concurrent-
# writer set to "2 sessions of the same cron script racing the same tick",
# already substantially serialized by each script's own election/SF-1 lock).
# Every failure path is silent (no output, best-effort) — this function is
# ALWAYS called from a context that itself must never fail the caller's tick.
_tt_rotate() {
  local logpath="$1" cap lines tmp
  cap="${TICK_TELEMETRY_MAX_LINES:-5000}"
  [ -f "$logpath" ] || return 0
  case "$cap" in (''|*[!0-9]*) return 0 ;; esac
  lines="$(wc -l < "$logpath" 2>/dev/null | tr -d ' ')"
  case "$lines" in (''|*[!0-9]*) return 0 ;; esac
  [ "$lines" -le "$cap" ] && return 0
  tmp="${logpath}.tmp.$$"
  if ! tail -n "$cap" "$logpath" > "$tmp" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null
    return 0
  fi
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp" 2>/dev/null
    return 0
  fi
  mv -f "$tmp" "$logpath" 2>/dev/null || rm -f "$tmp" 2>/dev/null
  return 0
}

# --- log_tick_usage <script> <captured_json> <elapsed_ms> <exit_code> -------
# Lower-level primitive (FR-1). Derives `verdict`/`tick` FROM the captured
# JSON itself — never re-derived, never requires the caller to pass them
# separately (single source of truth, same spirit AC-11 already mandates for
# verdict_bytes). `verdict` defaults to "UNKNOWN" when absent/null/malformed
# (defensive degrade for R6's pre-existing dev-team stdout-leak path — a
# leak-corrupted capture logs verdict:"UNKNOWN" rather than crashing the
# logger, a beneficial side effect, NOT a fix for that pre-existing issue).
# `tick` is null when the source script's own verdict JSON has no "tick" key
# (auditor's run_probe()/run_tiered_probe() output never has one).
# `verdict_bytes` = `wc -c` of the EXACT captured string (true byte count,
# multi-byte-safe — this repo already uses `wc -c` for byte-cap math
# elsewhere, e.g. context-bloat-backstop.sh's TE-T24 byte-cap predicate;
# bash `${#var}` is locale-dependent and would silently undercount).
# Writes exactly ONE `jq -nc` line via `>>` (O_APPEND, single write()
# syscall for a JSON line well under PIPE_BUF — no flock, matches FR-9 +
# this repo's existing no-flock-anywhere convention).
# EVERY failure path (missing/unresolvable root, mkdir -p failure, jq
# failure, append failure) ends in an explicit `return 0` — AC-4/AC-5: never
# propagated to the caller, zero effect on the caller's stdout/exit code.
# Self-creates the destination directory on first run (`mkdir -p`) per the
# BA spec's explicit Edge Cases ruling (fresh clone/VPS with no
# docs/data/telemetry/ yet).
log_tick_usage() {
  local script="$1" captured_json="$2" elapsed_ms="$3" exit_code="$4"
  local logpath verdict tick vbytes ts line

  logpath="$(_tt_log_path "$script")" 2>/dev/null || return 0
  [ -z "$logpath" ] && return 0

  mkdir -p "$(dirname "$logpath")" 2>/dev/null || return 0

  verdict="$(printf '%s' "$captured_json" | jq -r '.verdict // "UNKNOWN"' 2>/dev/null)"
  [ -z "$verdict" ] && verdict="UNKNOWN"
  tick="$(printf '%s' "$captured_json" | jq -r '.tick // empty' 2>/dev/null)"
  vbytes="$(printf '%s' "$captured_json" | wc -c 2>/dev/null | tr -d ' ')"
  case "$vbytes" in (''|*[!0-9]*) vbytes=0 ;; esac

  case "$elapsed_ms" in (''|*[!0-9-]*) elapsed_ms=0 ;; esac
  case "$exit_code" in (''|*[!0-9]*) exit_code=0 ;; esac

  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)"
  [ -z "$ts" ] && return 0

  line="$(jq -nc \
    --arg ts "$ts" \
    --arg script "$script" \
    --arg verdict "$verdict" \
    --arg tick "$tick" \
    --argjson verdict_bytes "$vbytes" \
    --argjson elapsed_ms "$elapsed_ms" \
    --argjson exit_code "$exit_code" \
    '{ts:$ts, script:$script, verdict:$verdict, tick:(if $tick == "" then null else $tick end), verdict_bytes:$verdict_bytes, elapsed_ms:$elapsed_ms, exit_code:$exit_code}' \
    2>/dev/null)"
  [ -z "$line" ] && return 0

  printf '%s\n' "$line" >> "$logpath" 2>/dev/null || return 0

  _tt_rotate "$logpath" 2>/dev/null
  return 0
}

# --- tt_capture_and_log <script_name> <fn> [args...] ------------------------
# Convenience layer (FR-1's "two-tier lib style", mirrors hg_run +
# hg_resolve_project_root in one file — related but distinct primitives).
# This is the ONE function WU-1/WU-2/WU-3 wire into each script's existing
# "Standalone execution" trailer, replacing the bare `<fn>; exit $?`:
#   tt_capture_and_log "cowork-tick-preflight.sh" run_preflight
#   tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "$TIER"
#
# Sequence (architect Design decisions, implemented verbatim):
#   1. t0 = tt_epoch_ms
#   2. out=$("$fn" "$@"); rc=$?   — the SAME command-substitution-capture
#      idiom already used throughout these scripts for every other sub-call.
#   3. t1 = tt_epoch_ms; elapsed_ms = t1 - t0
#   4. printf '%s\n' "$out"      — reprints the captured verdict BYTE-
#      IDENTICAL (command substitution strips only trailing newlines; none
#      of these 3 scripts pass -c/--compact-output to their verdict jq -n
#      calls, so this reprint is exact).
#   5. log_tick_usage "$script_name" "$out" "$elapsed_ms" "$rc" — called
#      with BOTH stdout and stderr explicitly redirected to /dev/null at
#      THIS call site (defense-in-depth for AC-6/NFR-3/R1: even a
#      fault-injected or buggy log_tick_usage that itself tries to write to
#      real stdout is guaranteed silenced here — the guard does not rely on
#      log_tick_usage's own internal discipline alone). Its own return value
#      is deliberately ignored — logging success/failure NEVER influences
#      the caller's exit code (AC-4/AC-5).
#   6. return "$rc" — the REAL exit code from the wrapped function, captured
#      in step 2 and untouched by anything logging-related since.
tt_capture_and_log() {
  local script_name="$1" fn="$2"
  shift 2
  local t0 out rc t1 elapsed_ms

  t0="$(tt_epoch_ms)"
  out="$("$fn" "$@")"
  rc=$?
  t1="$(tt_epoch_ms)"
  elapsed_ms=$(( t1 - t0 ))

  printf '%s\n' "$out"

  log_tick_usage "$script_name" "$out" "$elapsed_ms" "$rc" >/dev/null 2>&1

  return "$rc"
}
