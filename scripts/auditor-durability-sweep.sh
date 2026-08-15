#!/usr/bin/env bash
# scripts/auditor-durability-sweep.sh
#
# FIX-AUDITOR-DURABILITY-STEP0B-DETECTION (redispatch 2) — the ONE blessed
# actuator for system-auditor flow §Step 0b.1 (stale `.auditor-cycle-
# markers-*.tmp` orphan sweep, D-CYCLE-1) + §Step 0b.2 (schedule-based
# missing-cycle detection via tier1/2/3 heartbeat staleness, D-CYCLE-2).
# Mirrors scripts/notebook-compose.sh / scripts/audit-output-contract.sh's
# already-proven precedent: the calling flow makes ONE tool call and pastes
# this script's stdout marker verbatim, instead of hand-transcribing ~65
# lines of inline bash prose into a Bash tool call every single cycle.
#
# ROOT CAUSE THIS CLOSES (QA CHANGES_REQUESTED, redispatch_count=1): despite
# continuously-satisfied trigger conditions since the 2026-08-06 deploy, this
# detector produced ZERO D-CYCLE-1/D-CYCLE-2 signals ever — confirmed live via
# 14 real orphaned marker files (dated 2026-08-11 through 2026-08-14, spanning
# ~160+ missed Tier-1 sweep opportunities at 30min cadence) still unswept as
# of this fix, even AFTER the 2026-08-14 FIX-AUDITOR-NOTEBOOK-COMPOSE-
# ACTUATOR-BUILT-TESTED-NEVER-WIRED commit upgraded main.md's §Step 0b.1 text
# from narrated-prose to syntactically-real inline bash. That fix closed a
# DIFFERENT gap (prose -> real code) but left the INVOCATION mechanism
# unchanged: an inline block positioned early in a 1442-line flow doc has no
# forcing function compelling an LLM subagent to actually run Bash on it every
# cycle, and (unlike OUTPUT-CONTRACT's own V1-V7 violations or the Notebook
# Append Gate's `$MARKERS_FILE` grep) nothing downstream would ever notice a
# cycle that silently skipped it — the exact "narrates vs executes" class as
# FIX-LEAF-AGENT-ANALYSIS-ONLY-EXIT-NARRATES-INSTEAD-OF-EXECUTING, just never
# closed for this specific step (that fix's own scope was OUTPUT-CONTRACT/
# RETURN only). This script + its new `[durability-sweep]` mandatory marker +
# `scripts/audit-output-contract.sh --require-durability-sweep` (V8) closes it
# the same way the sibling areas already did: one unambiguous, testable tool
# call replaces many lines of inline prose, and its own marker line is now a
# mechanically-checkable proof of invocation.
#
# CONTRACT (named args, mirrors emit-audit-signal.sh / auditor-notebook-
# commit.sh's explicit-arg discipline — never positional):
#   scripts/auditor-durability-sweep.sh \
#     --project-root <path>              # REQUIRED
#     [--markers-dir <path>]             # default: <project-root>/docs/agent-memory
#     [--tier1-hb-file <path>]           # default: <project-root>/docs/data/auditor-tier1-last-healthy.json
#     [--tier2-hb-file <path>]           # default: <project-root>/docs/data/auditor-tier2-last-healthy.json
#     [--tier3-hb-file <path>]           # default: <project-root>/docs/data/auditor-tier3-last-healthy.json
#     [--notebook-file <path>]           # default: <project-root>/docs/agent-memory/notebooks/system-auditor.md
#     [--now-epoch <int>]                # testability override for the
#                                         # schedule-gap epoch math below —
#                                         # default: date -u +%s. Does NOT
#                                         # affect the stale-marker mtime
#                                         # sweep (real filesystem mtime,
#                                         # -mmin +20 — tests fake mtimes via
#                                         # `touch -t` on fixture files
#                                         # instead, same as any other real
#                                         # find-based actuator in this repo).
#     [--cycle-tag <value>]              # forwarded verbatim to every
#                                         # emit-audit-signal.sh call's
#                                         # --cycle-tag (this cycle's own
#                                         # FIRE_TASK_ID, per main.md).
#     [--emit-script <path>]             # default: <project-root>/scripts/emit-audit-signal.sh
#
# emit-audit-signal.sh is SOURCED (not subprocess-invoked) — its own
# `run_emit_signal` function is called directly, the SAME composability seam
# its own header already documents ("mcp_call() ... tests may redefine this
# after sourcing"). This is deliberate, not an accident: mcp_call() (E-1
# post_agent_signal) has no file-redirect test sink of its own (unlike E-2/E-3
# below), so the ONLY way to keep this script's own test suite fully local/
# non-live — without silently forcing production callers onto `--e3-only`
# (WRONG for D-CYCLE-1/D-CYCLE-2, which are full E-1+E-2+E-3 checks by design,
# same class as every other B-xx/C-xx site in main.md, NOT the D-IMPROVE/
# D-BCTC-EVAL `--e3-only` sites) — is for scripts/auditor-durability-sweep.
# test.sh to `source` THIS script (not `bash auditor-durability-sweep.sh`),
# which transitively sources emit-audit-signal.sh + mcp-call.sh into the SAME
# shell, then redefine `mcp_call()` before calling `run_durability_sweep`
# directly as a function. emit-audit-signal.sh's OWN env-var hooks
# (EMIT_SIGNAL_LEDGER_FILE / EMIT_SIGNAL_ORCH_STATE_FILE /
# EMIT_SIGNAL_TELEGRAM_SINK) are read once, transparently, at source time —
# this script never re-implements them.
#
# STDOUT CONTRACT — paste verbatim into $MARKERS_FILE / notebook (main.md's
# existing "paste every marker" rule, unchanged):
#   every `[emit-signal] ...` line this run produced (0 or more — pass-
#   through, unmodified), THEN exactly ONE final, MANDATORY, never-omit
#   summary line (grep for "^\[durability-sweep\] "):
#     [durability-sweep] swept=<N> malformed=<M> found=<F> schedule_gap_t1=<0|1> schedule_gap_t2=<0|1> schedule_gap_t3=<0|1>
#   Printed unconditionally, even on the common zero-hits cycle — this is the
#   line whose ABSENCE from a cycle's own $MARKERS_FILE is what
#   `scripts/audit-output-contract.sh --require-durability-sweep` (V8) now
#   treats as a VIOLATION (this whole script never got invoked that cycle).
#
# Exit code: always 0 — this is a detector, it must never fail/block the
# calling cycle (matches Step 0b.1/0b.2's original "never blocks the cycle"
# design). An individual emit-audit-signal.sh ABORT is still fully visible in
# its own pasted-through `[emit-signal] ABORT ...` line (and, per the ORIGINAL
# design, an ABORT leaves that one marker file in place for the next sweep to
# retry rather than losing the only evidence of a loss on a failed emit) — it
# does not change this script's own exit code.
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays. All epoch/date math is jq-side (fromdateiso8601/todateiso8601/
# strftime) — same idiom this repo already standardizes on in emit-audit-
# signal.sh / scripts/devteam-signalqueue-prune-bounded.jq / scripts/orch-
# cold-evict.sh — never BSD-vs-GNU `date -d`/`date -r` arithmetic
# (feedback_bsd_date_3n_literal_corrupts_iso8601.md).
#
# Precedents: scripts/emit-audit-signal.sh (reused verbatim for every E-1/E-2/
# E-3 emit below — this script never re-implements dedup/CAS-retry/read-back),
# scripts/notebook-compose.sh + scripts/audit-output-contract.sh (the ONE-
# script-call actuator pattern this script adopts for Step 0b.1/0b.2).

set -uo pipefail

# =============================================================================
# INTERFACE — CLI arg parsing
# =============================================================================

_sweep_parse_args() {
  PROJECT_ROOT=""
  MARKERS_DIR=""
  TIER1_HB_FILE=""
  TIER2_HB_FILE=""
  TIER3_HB_FILE=""
  NOTEBOOK_FILE=""
  NOW_EPOCH_ARG=""
  CYCLE_TAG=""
  EMIT_SCRIPT=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --project-root) PROJECT_ROOT="${2:-}"; shift 2 ;;
      --markers-dir) MARKERS_DIR="${2:-}"; shift 2 ;;
      --tier1-hb-file) TIER1_HB_FILE="${2:-}"; shift 2 ;;
      --tier2-hb-file) TIER2_HB_FILE="${2:-}"; shift 2 ;;
      --tier3-hb-file) TIER3_HB_FILE="${2:-}"; shift 2 ;;
      --notebook-file) NOTEBOOK_FILE="${2:-}"; shift 2 ;;
      --now-epoch) NOW_EPOCH_ARG="${2:-}"; shift 2 ;;
      --cycle-tag) CYCLE_TAG="${2:-}"; shift 2 ;;
      --emit-script) EMIT_SCRIPT="${2:-}"; shift 2 ;;
      *)
        echo "[durability-sweep] ABORT unknown-arg $1"
        return 2
        ;;
    esac
  done

  if [ -z "$PROJECT_ROOT" ]; then
    echo "[durability-sweep] ABORT missing-required-arg --project-root"
    return 2
  fi

  MARKERS_DIR="${MARKERS_DIR:-$PROJECT_ROOT/docs/agent-memory}"
  TIER1_HB_FILE="${TIER1_HB_FILE:-$PROJECT_ROOT/docs/data/auditor-tier1-last-healthy.json}"
  TIER2_HB_FILE="${TIER2_HB_FILE:-$PROJECT_ROOT/docs/data/auditor-tier2-last-healthy.json}"
  TIER3_HB_FILE="${TIER3_HB_FILE:-$PROJECT_ROOT/docs/data/auditor-tier3-last-healthy.json}"
  NOTEBOOK_FILE="${NOTEBOOK_FILE:-$PROJECT_ROOT/docs/agent-memory/notebooks/system-auditor.md}"
  EMIT_SCRIPT="${EMIT_SCRIPT:-$PROJECT_ROOT/scripts/emit-audit-signal.sh}"
  NOW_EPOCH="${NOW_EPOCH_ARG:-$(date -u +%s)}"

  if [ ! -f "$EMIT_SCRIPT" ]; then
    echo "[durability-sweep] ABORT emit-script-not-found $EMIT_SCRIPT"
    return 2
  fi
  # Source-once guard (FIX-AUDITOR-DURABILITY-STEP0B-DETECTION redispatch 2,
  # test seam): sourcing emit-audit-signal.sh ALSO re-sources mcp-call.sh,
  # which would silently clobber a test's `mcp_call()` stub on every single
  # `run_durability_sweep` call if this ran unconditionally every time (this
  # function runs on every invocation, and scripts/auditor-durability-sweep.
  # test.sh calls `run_durability_sweep` once per test case, in the SAME
  # process). Guarded to source exactly once per process — production's own
  # single subprocess-per-cycle invocation is unaffected either way.
  if [ -z "${_DURABILITY_SWEEP_EMIT_SOURCED:-}" ]; then
    # shellcheck source=./emit-audit-signal.sh
    source "$EMIT_SCRIPT"
    _DURABILITY_SWEEP_EMIT_SOURCED=1
  fi

  return 0
}

# =============================================================================
# APPLICATION
# =============================================================================

# Epoch -> tick-boundary ISO string for tier N, jq-side (portable, no BSD/GNU
# date divergence). Reuses the EXACT SAME boundary arithmetic as main.md's own
# §Step 0d Fire-Time Election (tier-1 `*/30`, tier-2 `0 */4 * * *`, tier-3
# fixed daily 02:00Z) — not a new mechanism, just re-derived here so D-CYCLE-2's
# dedup_key rounds to the current expected tick boundary per main.md §Step
# 0b.2's documented contract ("re-alerts once per newly-missed tick, never
# every single invocation within the same tick").
_tick_boundary() {
  local tier="$1"
  case "$tier" in
    1)
      jq -nr --argjson e "$NOW_EPOCH" '
        ($e | strftime("%Y-%m-%dT%H:")) as $prefix
        | (($e / 60 | floor) % 60) as $min
        | (($min / 30 | floor) * 30) as $bmin
        | $prefix + ($bmin | tostring | if length == 1 then "0" + . else . end) + "Z"
      '
      ;;
    2)
      jq -nr --argjson e "$NOW_EPOCH" '
        ($e | strftime("%Y-%m-%dT")) as $day
        | (($e / 3600 | floor) % 24) as $hr
        | (($hr / 4 | floor) * 4) as $bhr
        | $day + ($bhr | tostring | if length == 1 then "0" + . else . end) + ":00Z"
      '
      ;;
    3)
      jq -nr --argjson e "$NOW_EPOCH" '($e | strftime("%Y-%m-%dT")) + "02:00Z"'
      ;;
  esac
}

# Most recent "## c<NNN> · <ts>" heading whose section carries a
# "### Audit Run Tier-1" sub-heading — same fromdateiso8601-ready ts main.md
# §Step 0b.2's original Tier-1 fallback used, ported to a portable bash 3.2
# state-machine loop (no gawk 3-arg match(), no mapfile).
_t1_latest_notebook_ts() {
  local notebook_file="$1" cur_ts="" cur_is_t1="0" last_ts="" line ts
  [ -f "$notebook_file" ] || { echo ""; return 0; }
  while IFS= read -r line; do
    case "$line" in
      "## c"*)
        if [ "$cur_is_t1" = "1" ] && [ -n "$cur_ts" ]; then last_ts="$cur_ts"; fi
        cur_is_t1="0"
        ts="${line##*· }"
        case "$ts" in
          [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]Z) cur_ts="$ts" ;;
          *) cur_ts="" ;;
        esac
        ;;
      "### Audit Run Tier-1"*)
        cur_is_t1="1"
        ;;
    esac
  done < "$notebook_file"
  if [ "$cur_is_t1" = "1" ] && [ -n "$cur_ts" ]; then last_ts="$cur_ts"; fi
  printf '%s' "$last_ts"
}

# §Step 0b.1 — stale-marker orphan sweep (D-CYCLE-1). Identical semantics to
# the original inline bash: mtime>20min, dedup-ledger reuse via emit-audit-
# signal.sh, malformed-key sentinel, rm -f only on non-ABORT.
_run_sweep_0b1() {
  local stale_markers f raw_tick fire_tick_swept emit_out emit_rc
  SWEEP_COUNT=0
  SWEEP_MALFORMED=0
  STALE_FOUND_COUNT=0

  stale_markers=$(find "$MARKERS_DIR" -maxdepth 1 -name '.auditor-cycle-markers-*.tmp' -mmin +20 2>/dev/null)
  [ -n "$stale_markers" ] && STALE_FOUND_COUNT=$(printf '%s\n' "$stale_markers" | grep -c .)

  [ -z "$stale_markers" ] && return 0

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    raw_tick="$(basename "$f" .tmp)"
    raw_tick="${raw_tick#.auditor-cycle-markers-}"
    case "$raw_tick" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]Z)
        fire_tick_swept="$raw_tick"
        ;;
      *)
        SWEEP_MALFORMED=$((SWEEP_MALFORMED + 1))
        fire_tick_swept="malformed-key"
        ;;
    esac

    emit_out=$(run_emit_signal \
      --check-id "D-CYCLE-1" \
      --category-type "auditor_cycle_loss" \
      --severity "WARN" \
      --summary "auditor cycle lost tick=${fire_tick_swept} — orphaned marker, mid-run death" \
      --detail-json "{\"title\":\"auditor_cycle_loss: ${fire_tick_swept}\",\"detail\":\"orphaned .auditor-cycle-markers-${fire_tick_swept}.tmp found stale (mtime > 20min) — a prior cycle won its fire-election and never reached its own final step\",\"fire_tick\":\"${fire_tick_swept}\",\"dedup_key\":\"auditor-cycle-loss:${fire_tick_swept}\"}" \
      ${CYCLE_TAG:+--cycle-tag "$CYCLE_TAG"} \
      2>&1)
    emit_rc=$?
    printf '%s\n' "$emit_out"

    SWEEP_COUNT=$((SWEEP_COUNT + 1))

    if [ "$emit_rc" -eq 0 ] && ! printf '%s' "$emit_out" | grep -q '^\[emit-signal\] ABORT'; then
      rm -f "$f"
    fi
    # ABORT (rc!=0 or an ABORT-prefixed line) -> leave the file in place for
    # the next cycle's sweep to retry — never delete the only evidence of a
    # loss on a failed emit (unchanged from the original design).
  done <<< "$stale_markers"

  return 0
}

# §Step 0b.2 — schedule-based missing-cycle detection (D-CYCLE-2). Tier-2/3:
# reliable heartbeat-staleness > 2x cadence. Tier-1: conservative, WARN-only,
# OR'd heartbeat/notebook-heading check > 3h (documented residual gap on an
# isolated single-tick loss unchanged from the original spec).
_run_sweep_0b2() {
  local n hb_file hb_epoch cadence gap gap_hours cadence_hours tick emit_out
  local t1_hb_epoch t1_nb_ts t1_nb_epoch t1_last_epoch t1_gap

  SCHEDULE_GAP_T2=0
  SCHEDULE_GAP_T3=0
  SCHEDULE_GAP_T1=0

  for n in 2 3; do
    if [ "$n" = "2" ]; then hb_file="$TIER2_HB_FILE"; cadence=14400; else hb_file="$TIER3_HB_FILE"; cadence=86400; fi
    hb_epoch=$(jq -r 'try (.last_healthy_at | fromdateiso8601) catch empty' "$hb_file" 2>/dev/null)
    [ -z "$hb_epoch" ] && continue   # no baseline file yet — never alarm on a missing file

    gap=$(( NOW_EPOCH - hb_epoch ))
    if [ "$gap" -gt $(( cadence * 2 )) ]; then
      if [ "$n" = "2" ]; then SCHEDULE_GAP_T2=1; else SCHEDULE_GAP_T3=1; fi
      gap_hours=$(( gap / 3600 ))
      cadence_hours=$(( cadence / 3600 ))
      tick=$(_tick_boundary "$n")
      emit_out=$(run_emit_signal \
        --check-id "D-CYCLE-2" \
        --category-type "auditor_cycle_missing" \
        --severity "WARN" \
        --summary "auditor tier-${n} cycle possibly missing — no completion evidence in ${gap_hours}h (cadence ${cadence_hours}h)" \
        --detail-json "{\"title\":\"auditor_cycle_missing: tier-${n}\",\"detail\":\"no auditor-tier${n}-last-healthy.json / notebook evidence of a completed tier-${n} cycle in ${gap_hours}h (expected cadence ${cadence_hours}h)\",\"tier\":\"${n}\",\"dedup_key\":\"auditor-cycle-missing:tier${n}:${tick}\"}" \
        ${CYCLE_TAG:+--cycle-tag "$CYCLE_TAG"} \
        2>&1)
      printf '%s\n' "$emit_out"
    fi
  done

  t1_hb_epoch=$(jq -r 'try (.last_healthy_at | fromdateiso8601) catch empty' "$TIER1_HB_FILE" 2>/dev/null)
  t1_nb_ts=$(_t1_latest_notebook_ts "$NOTEBOOK_FILE")
  t1_nb_epoch=""
  if [ -n "$t1_nb_ts" ]; then
    # SECOND LATENT BUG found writing this script (independent of the
    # invocation-mechanism root cause above): notebook `## c<NNN> · <ts>`
    # headings are always MINUTE precision (no seconds — `%H:%MZ`), but jq's
    # `fromdateiso8601` builtin REQUIRES full `HH:MM:SSZ` and silently fails
    # (try/catch -> empty) on a bare minute-precision string. The ORIGINAL
    # inline-prose spec's own comment ("same fromdateiso8601 idiom") called
    # for exactly this broken bare form — meaning even a cycle that DID
    # faithfully hand-execute the original Step 0b.2 bash would have had
    # T1_NB_EPOCH silently empty on every run, collapsing the documented
    # "OR the heartbeat with the notebook heading" fallback down to the
    # heartbeat-only check with zero visible symptom. Same "Bug A" class
    # already fixed elsewhere in this exact codebase (emit-audit-signal.sh's
    # `_ledger_prune_and_lookup` / audit-output-contract.sh's V1 cross-check)
    # — reusing the SAME `to_epoch` idiom here rather than inventing a new one.
    t1_nb_epoch=$(jq -rn --arg ts "$t1_nb_ts" '
      def to_epoch:
        if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
        then (sub("Z$"; ":00Z") | fromdateiso8601)
        else fromdateiso8601
        end;
      try ($ts | to_epoch) catch empty
    ')
  fi

  t1_last_epoch="$t1_nb_epoch"
  if [ -n "$t1_hb_epoch" ]; then
    if [ -z "$t1_last_epoch" ] || [ "$t1_hb_epoch" -gt "$t1_last_epoch" ]; then
      t1_last_epoch="$t1_hb_epoch"
    fi
  fi

  if [ -n "$t1_last_epoch" ]; then
    t1_gap=$(( NOW_EPOCH - t1_last_epoch ))
    if [ "$t1_gap" -gt 10800 ]; then
      SCHEDULE_GAP_T1=1
      gap_hours=$(( t1_gap / 3600 ))
      tick=$(_tick_boundary "1")
      emit_out=$(run_emit_signal \
        --check-id "D-CYCLE-2" \
        --category-type "auditor_cycle_missing" \
        --severity "WARN" \
        --summary "auditor tier-1 cycle possibly missing — no completion evidence in ${gap_hours}h (cadence 0.5h)" \
        --detail-json "{\"title\":\"auditor_cycle_missing: tier-1\",\"detail\":\"no auditor-tier1-last-healthy.json / notebook evidence of a completed tier-1 cycle in ${gap_hours}h (6x 30min cadence = 3h conservative bar; known residual gap on an isolated single lost tick — see main.md Step 0b.2)\",\"tier\":\"1\",\"dedup_key\":\"auditor-cycle-missing:tier1:${tick}\"}" \
        ${CYCLE_TAG:+--cycle-tag "$CYCLE_TAG"} \
        2>&1)
      printf '%s\n' "$emit_out"
    fi
  fi

  return 0
}

# =============================================================================
# Orchestration entrypoint
# =============================================================================

run_durability_sweep() {
  _sweep_parse_args "$@" || return 2

  _run_sweep_0b1
  _run_sweep_0b2

  echo "[durability-sweep] swept=${SWEEP_COUNT:-0} malformed=${SWEEP_MALFORMED:-0} found=${STALE_FOUND_COUNT:-0} schedule_gap_t1=${SCHEDULE_GAP_T1:-0} schedule_gap_t2=${SCHEDULE_GAP_T2:-0} schedule_gap_t3=${SCHEDULE_GAP_T3:-0}"

  return 0
}

# ── Standalone CLI mode (only when executed directly, not sourced) ───────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_durability_sweep "$@"
  exit $?
fi
