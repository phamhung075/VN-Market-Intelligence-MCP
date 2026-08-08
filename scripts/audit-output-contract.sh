#!/usr/bin/env bash
# scripts/audit-output-contract.sh
#
# FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED
#
# Replaces the system-auditor's hand-COMPOSED
#   "[OUTPUT-CONTRACT] signals_posted=N | telegram_sent=N | signal_queue_rows_written=N | dashboard_rows=N"
# line (docs/agents/system-auditor/flow/main.md — OUTPUT-CONTRACT section)
# with a MECHANICAL parse of the marker lines the cycle already produced.
# The agent stops choosing N; it can only report what this script computes
# from the emit-audit-signal.sh / emit-dashboard-row.sh markers it actually
# paste-accumulated into a scratch file this cycle.
#
# Confirmed failure shape this closes (recurring on 2026-07-29, both
# directions on the SAME defect):
#   over-report — narrated dashboard_rows=N, wrote 0 (occurrences 1/2)
#   under-report — narrated signals_posted=0 | telegram_sent=0 |
#     signal_queue_rows_written=0 | dashboard_rows=0, while a signal_queue
#     row HAD in fact been written (occurrence 3 — root cause: a SKIP-dedup
#     marker line, which STILL carries `id=` per the emit-audit-signal.sh
#     contract, was misread as "nothing was emitted").
#
# CONTRACT (named args):
#   scripts/audit-output-contract.sh \
#     --markers-file <path>            # REQUIRED. Plain text, one marker
#                                       # line per line, verbatim stdout the
#                                       # agent already pasted into the
#                                       # notebook this cycle from every
#                                       # emit-audit-signal.sh /
#                                       # emit-dashboard-row.sh /
#                                       # bare-post_agent_signal call site.
#                                       # Missing/empty file = genuine
#                                       # ALL_GREEN cycle: all 4 counts = 0,
#                                       # exit 0 (NOT an error).
#     [--anomalies-count <N>]          # agent's own tally of NEW anomalies
#                                       # this cycle (the RETURN headline's
#                                       # N) — still narrated (no marker set
#                                       # spans PASS-only checks), but cross-
#                                       # checked below (V4), never trusted
#                                       # alone.
#     [--next-token <token>]           # agent's own RETURN NEXT: token —
#                                       # cross-checked below (V5).
#     [--cycle-start-ts <ISO-8601>]    # enables the INDEPENDENT signal_queue
#                                       # cross-check (V1) — re-reads
#                                       # .signal_queue.rows[] filtered by
#                                       # from==<from-agent> and ts>=this,
#                                       # asserts it equals the marker-parsed
#                                       # signal_queue_rows_written. Without
#                                       # this + --orch-state-file, V1 is
#                                       # skipped (logged, not silently
#                                       # green).
#     [--orch-state-file <path>        default: $REPO_ROOT/docs/data/orch/orch-state.json]
#     [--from-agent <agent-id>         default: "system-auditor"]
#     [--cycle-tag <value>]            # FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-
#                                       # ROWS-WRITTEN-SELFREPORT-MISMATCH — when
#                                       # supplied (the caller's own FIRE_TASK_ID),
#                                       # V1 scopes the independent re-read to an
#                                       # EXACT audit_cycle_tag match instead of
#                                       # the from+ts-window guess below, immune to
#                                       # cross-tier/cross-session identity
#                                       # collision (every tier shares the same
#                                       # default from="system-auditor"). Falls
#                                       # back to the legacy from+ts-window path
#                                       # (--from-agent / --cycle-start-ts) when
#                                       # absent, for backward compatibility.
#
# STDOUT — MANDATORY, paste verbatim into the RETURN block:
#   [OUTPUT-CONTRACT] signals_posted=<N> | telegram_sent=<N> | signal_queue_rows_written=<N> | dashboard_rows=<N> | dedup_skipped=<N>
#
# Any violation ALSO prints one distinct line per violation (grep for
# "[OUTPUT-CONTRACT] VIOLATION:") and fires a BUG-channel Telegram itself —
# the flow does not have to remember to do this separately.
#
# EXIT CODE: 0 = no violation. 1 = >=1 violation detected (already reported).
#
# MARKER GRAMMAR PARSED (per scripts/emit-audit-signal.sh header comment,
# verbatim — this script does NOT re-derive the grammar, it cites it):
#   [emit-signal] OK dedup_key=<k> id=<id>                         -> counts: signals_posted++, signal_queue_rows_written++, telegram_sent++
#   [emit-signal] OK-escalation-bypass dedup_key=.. .. id=<id>     -> counts: signals_posted++, signal_queue_rows_written++, telegram_sent++
#   [emit-signal] SKIP-dedup dedup_key=<k> last_sent=<ts> id=<id>  -> counts: signals_posted++, signal_queue_rows_written++, dedup_skipped++ (NO telegram)
#   [emit-signal] OK e3-only id=<id> check_id=<cid>                -> counts: signals_posted++, signal_queue_rows_written++ (NO telegram — E-1/E-2 skipped by caller choice)
#   [emit-signal] OK no-telegram id=<id> check_id=<cid>            -> counts: signals_posted++, signal_queue_rows_written++ (NO telegram — E-2 skipped by caller choice)
#   [emit-signal] ABORT ...                                        -> counts: NOTHING (per main.md "ABORT ... -> do NOT count this toward signals_posted")
#   [emit-signal] SKIP-duplicate-invocation ...                     -> counts: NOTHING (FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS —
#                                                                       emit-audit-signal.sh's own cycle-scoped idempotency PRE-check
#                                                                       no-op'd this call before E-1/E-3 ran; zero new rows exist)
#   [emit-dashboard] OK id=<id> check_id=<cid>                     -> counts: dashboard_rows++ (this marker is ONLY ever printed by
#                                                                       scripts/emit-dashboard-row.sh after its OWN mandatory
#                                                                       write+read-back assert already passed — so this counter
#                                                                       is grounded in a per-unit verified write, not narration,
#                                                                       even before the V3 cross-check below)
#   [emit-dashboard] ABORT / WARN ...                              -> counts: NOTHING toward dashboard_rows
#   [post-agent-signal] OK ...                                     -> counts: signals_posted++ (bare post_agent_signal call
#                                                                       sites outside the emit-audit-signal.sh family — Tier-3
#                                                                       Roll-Up, DOC-AUDIT-GIT-ERR — do NOT write a signal_queue
#                                                                       row via E-3, so they contribute to signals_posted only,
#                                                                       never to signal_queue_rows_written. This is the
#                                                                       structural reason signals_posted and
#                                                                       signal_queue_rows_written MUST be allowed to differ.)
#   [post-agent-signal] ABORT ...                                  -> counts: NOTHING
#
# VIOLATIONS (each fires exactly one BUG-channel Telegram, non-dedup'd —
# these are meta-bugs about the auditor's own contract, not about the
# system under audit):
#   V1  signal_queue_rows_written(marker) != independent .signal_queue count (when cycle-start-ts + orch-state-file both resolve)
#   V2  signal_queue_rows_written == 0 AND signals_posted > 0   (main.md OUTPUT-CONTRACT check, unchanged — now on trustworthy operands)
#   V3  dashboard_rows == 0 AND signals_posted > 0              (acceptance 3 — symmetric extension to dashboard_rows)
#   V4  anomalies-count == 0 AND signals_posted > 0             (RETURN-headline consistency)
#   V5  next-token == "clean" AND signals_posted > 0            (RETURN NEXT-token consistency)
#
# DURABLE VIOLATION RECORD (FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS,
# acceptance 4): every VIOLATION line above is ALSO appended, synchronously,
# to docs/data/auditor-output-contract-violations.json (tmp+mv atomic write,
# same idiom as docs/data/auditor-dedup-ledger.json — NOT routed through
# orch-apply.sh, auditor-internal bookkeeping, not an orch-state.json-schema
# artifact) BEFORE this script returns. This is the real enforcement: the
# calling flow's own "paste the VIOLATION line into the notebook/RETURN"
# instruction (docs/agents/system-auditor/flow/main.md §OUTPUT-CONTRACT) is
# prose and can be, and was, skipped (confirmed occurrence 2026-07-29) — and
# as of the 2026-08-06 Notebook-Write reorder (FIX-AUDITOR-DURABILITY-
# STEP0B-DETECTION §3b.1) the calling flow's notebook is ALREADY committed
# by the time this script runs, so "paste it into the notebook" now
# describes a step that already happened. A durable record written by the
# SCRIPT itself, unconditional on any downstream narration, is the only way
# to make "this cycle's V1-V5 violations are never silently lost" actually
# true rather than aspirational. Override path for tests:
# AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE (unset -> production default below).
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays. Only plain indexed arrays / case statements / awk / jq.
#
# Precedents: scripts/emit-audit-signal.sh (marker grammar, DDD split,
# _send_orphan_bug_telegram style, ledger tmp+mv idiom), scripts/agents-
# flow/mcp-call.sh (transport, sourced not reinvented).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VIOLATIONS_FILE="${AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE:-$REPO_ROOT/docs/data/auditor-output-contract-violations.json}"

# shellcheck source=./agents-flow/mcp-call.sh
source "$SCRIPT_DIR/agents-flow/mcp-call.sh"

_send_bug_telegram() {
  local msg="$1" args
  args=$(jq -n --arg channel "bug" --arg message "$msg" '{channel:$channel, message:$message}')
  mcp_call "send_telegram" "$args" >/dev/null 2>&1
}

# See "DURABLE VIOLATION RECORD" header comment above — unconditional,
# synchronous, script-owned persistence of every VIOLATION detected this
# run. Never fails loud on its own I/O (self-heal, mirrors _ledger_write()
# in scripts/emit-audit-signal.sh) — a violations-file write failure must
# never mask or abort the REAL violation it is trying to record.
_record_violation_durable() {
  local detail="$1" cycle_tag="$2" from_agent="$3" now_ts dir tmp existing updated
  now_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  dir="$(dirname "$VIOLATIONS_FILE")"
  if [ -f "$VIOLATIONS_FILE" ] && jq -e . "$VIOLATIONS_FILE" >/dev/null 2>&1; then
    existing=$(cat "$VIOLATIONS_FILE")
  else
    existing="[]"
  fi
  updated=$(printf '%s' "$existing" | jq --arg ts "$now_ts" --arg tag "$cycle_tag" --arg from "$from_agent" --arg detail "$detail" \
    '(. + [{ts:$ts, cycle_tag:(if $tag=="" then null else $tag end), from:$from, detail:$detail}]) | .[-200:]' 2>/dev/null)
  [ -z "$updated" ] && return 0
  tmp=$(mktemp "$dir/.auditor-output-contract-violations-XXXXXXXX.json" 2>/dev/null) || return 0
  printf '%s\n' "$updated" > "$tmp" 2>/dev/null && mv "$tmp" "$VIOLATIONS_FILE" 2>/dev/null
  return 0
}

run_audit_output_contract() {
  local markers_file="" anomalies_count="" next_token="" cycle_start_ts=""
  local orch_state_file="${REPO_ROOT}/docs/data/orch/orch-state.json"
  local from_agent="system-auditor"
  local cycle_tag=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --markers-file) markers_file="${2:-}"; shift 2 ;;
      --anomalies-count) anomalies_count="${2:-}"; shift 2 ;;
      --next-token) next_token="${2:-}"; shift 2 ;;
      --cycle-start-ts) cycle_start_ts="${2:-}"; shift 2 ;;
      --orch-state-file) orch_state_file="${2:-}"; shift 2 ;;
      --from-agent) from_agent="${2:-}"; shift 2 ;;
      --cycle-tag) cycle_tag="${2:-}"; shift 2 ;;
      *)
        echo "[audit-output-contract] ABORT unknown-arg $1"
        return 2
        ;;
    esac
  done

  if [ -z "$markers_file" ]; then
    echo "[audit-output-contract] ABORT missing-required-arg --markers-file"
    return 2
  fi

  local signals_posted=0 telegram_sent=0 signal_queue_rows_written=0 dashboard_rows=0 dedup_skipped=0
  local violations=0

  if [ -f "$markers_file" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      case "$line" in
        '[emit-signal] ABORT'*)
          : # counts toward nothing
          ;;
        '[emit-signal] SKIP-duplicate-invocation'*)
          : # FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS — emit-audit-signal.sh's
            # own same-cycle idempotency PRE-check no-op'd this call before E-1/E-3
            # ever ran; zero new agent_signals/signal_queue rows exist for it, so it
            # counts toward nothing here either (same treatment as ABORT, explicit
            # case for grammar completeness — the default `*)` bucket below would
            # already handle this correctly, but exhaustive > implicit for a parser
            # whose whole job is "never guess").
          ;;
        '[emit-signal] OK-escalation-bypass'*)
          signals_posted=$((signals_posted + 1))
          signal_queue_rows_written=$((signal_queue_rows_written + 1))
          telegram_sent=$((telegram_sent + 1))
          ;;
        '[emit-signal] OK e3-only'*|'[emit-signal] OK no-telegram'*)
          signals_posted=$((signals_posted + 1))
          signal_queue_rows_written=$((signal_queue_rows_written + 1))
          ;;
        '[emit-signal] OK '*)
          signals_posted=$((signals_posted + 1))
          signal_queue_rows_written=$((signal_queue_rows_written + 1))
          telegram_sent=$((telegram_sent + 1))
          ;;
        '[emit-signal] SKIP-dedup'*)
          signals_posted=$((signals_posted + 1))
          signal_queue_rows_written=$((signal_queue_rows_written + 1))
          dedup_skipped=$((dedup_skipped + 1))
          ;;
        '[emit-dashboard] OK '*)
          dashboard_rows=$((dashboard_rows + 1))
          ;;
        '[emit-dashboard] ABORT'*|'[emit-dashboard] WARN'*)
          : # written-but-uncommitted (WARN commit-failed) still increments
            # dashboard_rows above via its own "OK id=" line printed right
            # after — WARN commit-failed lines are always followed by a
            # distinct OK line per emit-dashboard-row.sh's own contract, so
            # nothing to add here; ABORT never reaches an OK line at all.
          ;;
        '[post-agent-signal] OK'*)
          signals_posted=$((signals_posted + 1))
          ;;
        '[post-agent-signal] ABORT'*)
          : # counts toward nothing
          ;;
        *)
          : # unrecognized line — ignore (not a marker this script owns)
          ;;
      esac
    done < "$markers_file"
  fi

  # ── V1: independent signal_queue cross-check ────────────────────────────
  if [ -n "$cycle_start_ts" ] && [ -f "$orch_state_file" ]; then
    local independent_sqr
    if [ -n "$cycle_tag" ]; then
      # Exact-tag scoping (Bug B fix) — no from/time-window guessing, immune
      # to cross-tier/cross-session identity collision (every tier/session
      # shares the same default from="system-auditor").
      independent_sqr=$(jq --arg tag "$cycle_tag" \
        '[.signal_queue.rows[] | select(.audit_cycle_tag == $tag)] | length' \
        "$orch_state_file" 2>/dev/null)
    else
      # Legacy from+ts-window fallback for callers not yet passing
      # --cycle-tag. to_epoch ported verbatim from emit-audit-signal.sh's
      # _ledger_prune_and_lookup() (Bug A fix — cycle_start_ts is always
      # minute-precision FIRE_TICK, .ts is always second-precision; a raw
      # string >= silently drops same-minute rows).
      independent_sqr=$(jq --arg from "$from_agent" --arg ts "$cycle_start_ts" '
        def to_epoch:
          if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
          then (sub("Z$"; ":00Z") | fromdateiso8601)
          else fromdateiso8601
          end;
        ($ts | to_epoch) as $cutoff
        | [.signal_queue.rows[] | select(.from == $from and ((.ts // "1970-01-01T00:00:00Z") | to_epoch) >= $cutoff)] | length
      ' "$orch_state_file" 2>/dev/null)
    fi
    if [ -n "$independent_sqr" ] && [ "$independent_sqr" != "null" ]; then
      if [ "$independent_sqr" -ne "$signal_queue_rows_written" ]; then
        echo "[OUTPUT-CONTRACT] VIOLATION: signal_queue_rows_written mismatch narrated=${signal_queue_rows_written} independent=${independent_sqr}"
        _record_violation_durable "V1 signal_queue_rows_written mismatch narrated=${signal_queue_rows_written} independent=${independent_sqr}" "$cycle_tag" "$from_agent"
        _send_bug_telegram "[audit-output-contract] BUG: signal_queue_rows_written mismatch — marker-parsed=${signal_queue_rows_written}, independent re-read of .signal_queue.rows[]=${independent_sqr}. Trusting the higher (real-artifact) value."
        violations=$((violations + 1))
        # Take-the-max is sound ONLY because both operands are now
        # trustworthy per-direction (docs/architecture-briefs/2026-08-05-
        # fix-audit-output-contract-signalqueue-mismatch.md §3):
        #   independent < marker -> a verified write was drained/pruned
        #     AFTER this cycle wrote it; cannot un-write a real append,
        #     marker (already higher) wins by construction (no-op below).
        #   independent > marker -> this cycle's own $MARKERS_FILE is
        #     missing a row that legitimately carries its cycle-tag
        #     (dropped marker line / bypassed-script write); the scoped
        #     ground-truth read wins.
        if [ "$independent_sqr" -gt "$signal_queue_rows_written" ]; then
          signal_queue_rows_written=$independent_sqr
        fi
      fi
    else
      echo "[audit-output-contract] WARN independent-crosscheck-unavailable (jq query failed or returned null) — V1 skipped, not silently passed"
    fi
  else
    echo "[audit-output-contract] WARN independent-crosscheck-skipped (--cycle-start-ts or orch-state-file not resolvable) — V1 not run"
  fi

  # ── V2: existing main.md:669 check, now on trustworthy operands ────────
  if [ "$signal_queue_rows_written" -eq 0 ] && [ "$signals_posted" -gt 0 ]; then
    echo "[OUTPUT-CONTRACT] VIOLATION: signals emitted but no signal_queue rows written"
    _record_violation_durable "V2 signals emitted but no signal_queue rows written (signals_posted=${signals_posted})" "$cycle_tag" "$from_agent"
    _send_bug_telegram "[audit-output-contract] BUG: signals_posted=${signals_posted} but signal_queue_rows_written=0 this cycle"
    violations=$((violations + 1))
  fi

  # ── V3: acceptance (3) — symmetric extension to dashboard_rows ─────────
  if [ "$dashboard_rows" -eq 0 ] && [ "$signals_posted" -gt 0 ]; then
    echo "[OUTPUT-CONTRACT] VIOLATION: signals emitted but no dashboard rows written"
    _record_violation_durable "V3 signals emitted but no dashboard rows written (signals_posted=${signals_posted})" "$cycle_tag" "$from_agent"
    _send_bug_telegram "[audit-output-contract] BUG: signals_posted=${signals_posted} but dashboard_rows=0 this cycle"
    violations=$((violations + 1))
  fi

  # ── V4/V5: RETURN-headline consistency (best-effort — narrated inputs,
  # cross-checked rather than trusted alone) ──────────────────────────────
  if [ -n "$anomalies_count" ] && [ "$anomalies_count" -eq 0 ] && [ "$signals_posted" -gt 0 ]; then
    echo "[OUTPUT-CONTRACT] VIOLATION: RETURN headline anomalies=0 but signals_posted>0"
    _record_violation_durable "V4 RETURN headline anomalies=0 but signals_posted=${signals_posted}" "$cycle_tag" "$from_agent"
    _send_bug_telegram "[audit-output-contract] BUG: RETURN headline claimed 0 anomalies but signals_posted=${signals_posted} this cycle"
    violations=$((violations + 1))
  fi
  if [ "$next_token" = "clean" ] && [ "$signals_posted" -gt 0 ]; then
    echo "[OUTPUT-CONTRACT] VIOLATION: RETURN NEXT=clean but signals_posted>0"
    _record_violation_durable "V5 RETURN NEXT=clean but signals_posted=${signals_posted}" "$cycle_tag" "$from_agent"
    _send_bug_telegram "[audit-output-contract] BUG: RETURN NEXT token said clean but signals_posted=${signals_posted} this cycle"
    violations=$((violations + 1))
  fi

  echo "[OUTPUT-CONTRACT] signals_posted=${signals_posted} | telegram_sent=${telegram_sent} | signal_queue_rows_written=${signal_queue_rows_written} | dashboard_rows=${dashboard_rows} | dedup_skipped=${dedup_skipped}"

  [ "$violations" -eq 0 ] && return 0 || return 1
}

# ── Standalone CLI mode (only when executed directly, not sourced) ───────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_audit_output_contract "$@"
  exit $?
fi
