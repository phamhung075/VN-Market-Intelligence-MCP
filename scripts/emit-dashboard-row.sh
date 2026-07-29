#!/usr/bin/env bash
# scripts/emit-dashboard-row.sh
#
# FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED
#
# Gives docs/data/DASHBOARD.md the SAME anti-false-green treatment
# scripts/emit-audit-signal.sh already gives the E-3 signal_queue row: a
# script actuator that performs the write and then re-reads the file to
# assert the new row actually landed, failing loud to the BUG channel
# otherwise. Before this script, the DASHBOARD.md append was prose ("Append
# a DASHBOARD.md row") with NO script, NO read-back, and NO failure path —
# the one counter (dashboard_rows) in the OUTPUT-CONTRACT line with nothing
# behind it. Root cause + two confirmed occurrences (over-report: narrated
# N, wrote 0): docs/agent-memory/decisions/ (task row) — this script is the
# fix for that mechanism, not a re-patch of one artifact.
#
# CONTRACT (named args, mirrors scripts/emit-audit-signal.sh's discipline —
# never positional):
#   scripts/emit-dashboard-row.sh \
#     --check-id <A-xx|B-xx|C-xx|SLA-x|...> \
#     --title "<short title after the check-id in the heading>" \
#     --severity <CRITICAL|WARN|INFO> \
#     --location "<service/table/source>" \
#     --details "<what is wrong>" \
#     --impact "<why it matters>" \
#     --root-cause "<best-known cause>" \
#     --zone-owner <specialist agent id> \
#     --signal-id <id from the paired emit-audit-signal.sh marker — this is
#                  the POST-WRITE READ-BACK anchor; it is what makes this
#                  row's presence mechanically verifiable, and it is what
#                  ties this artifact back to the signal_queue row it
#                  documents> \
#     [--dedup-key <the dedup_key used on the paired emit call, echoed into
#                   the Last-reported line for human traceability only>] \
#     [--telegram-sent <yes|no>   default: yes>] \
#     [--mitigation "<free text>" default: "No immediate action beyond signal routing."] \
#     [--status <OPEN|...>        default: OPEN] \
#     [--dashboard-file <path>    default: $REPO_ROOT/docs/data/DASHBOARD.md]
#
# MARKERS (RAW-verifiable, grep for "[emit-dashboard]"):
#   success (write + read-back both verified) -> "[emit-dashboard] OK id=<signal_id> check_id=<check_id>"
#   bad usage / malformed args                -> "[emit-dashboard] ABORT <reason>" (exit 2)
#   mutex claim failed                        -> "[emit-dashboard] ABORT mutex-claim-failed <reason>" (exit 1)
#   write failure (tmp+mv or disk error)      -> "[emit-dashboard] ABORT write-failed <detail>" (exit 1)
#   POST-WRITE read-back failure              -> "[emit-dashboard] ABORT readback-failed id=<signal_id>" (exit 1)
#   git commit failed (row IS on disk — see below) -> "[emit-dashboard] WARN commit-failed rc=<n> id=<signal_id>" (exit 0)
#
# WHY mutex-claim-failure and write/readback-failure are FATAL (ABORT, exit
# 1) but commit-failure is NOT (WARN, exit 0, dashboard_rows still counts
# it): dashboard_rows must count a REAL, VERIFIED write to the artifact —
# that is the row's own acceptance (1). The git commit is bookkeeping on top
# of an already-correct working-tree state; under-counting a genuinely
# written+verified row because a downstream `git commit` hiccuped would
# reproduce the exact under-report defect (occurrence 3) this script exists
# to close. A commit-failure still fires a BUG telegram (uncommitted
# DASHBOARD.md is at risk of being swept by a peer's non-pathspec commit —
# see feedback_coldevict_bare_commit_sweeps_worker_staged_index) but does
# NOT flip this call's success/count status.
#
# Unlike scripts/auditor-notebook-commit.sh (invoked AFTER content is
# already on disk), this script owns the read-modify-write of the content
# itself and therefore must hold commit-mutex:main across BOTH the file
# mutation and the commit — two concurrent audit tiers (T1 every 30min, T2
# every 4h, T3 daily) can call this script inside the same wall-clock
# window and must not race a read-modify-write on the same file. The mutex
# claim/commit/release sequence below is a self-contained copy of
# scripts/auditor-notebook-commit.sh's protocol (not a nested call into it —
# nesting would require that script to be re-entrant against a mutex this
# script already holds, which is untested and unnecessary complexity).
#
# TESTABILITY HOOKS (env overrides, production defaults shown):
#   EMIT_DASHBOARD_GIT_ROOT   default: repo root (SCRIPT_DIR/..) — the `git -C`
#                             root used for add/diff/commit. Point at an
#                             isolated scratch git repo for tests; combine
#                             with --dashboard-file pointing inside that same
#                             scratch repo so the commit step never touches
#                             the live tree.
#   EMIT_DASHBOARD_OWNER_AGENT  default: "system-auditor" — owner_agent on
#                             the commit-mutex claim.
#   mcp_call()                defined by sourcing scripts/agents-flow/
#                             mcp-call.sh — tests redefine this after sourcing
#                             to stub task_claim/task_release/send_telegram
#                             transport outcomes per tool name ($1), same
#                             pattern as scripts/emit-audit-signal.test.sh.
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays. Only plain indexed arrays / case statements / jq for lookups.
#
# Precedents: scripts/emit-audit-signal.sh (marker convention, E-3
# write+read-back shape, DDD function-naming split), scripts/auditor-
# notebook-commit.sh (commit-mutex claim/trap-release protocol, explicit
# pathspec discipline), scripts/agents-flow/mcp-call.sh (transport, sourced
# not reinvented).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=./agents-flow/mcp-call.sh
source "$SCRIPT_DIR/agents-flow/mcp-call.sh"

DASHBOARD_FILE_DEFAULT="$REPO_ROOT/docs/data/DASHBOARD.md"
# Testability hook (production default: real repo root) — tests point this at
# an isolated scratch git repo so the commit step never touches the live tree.
GIT_ROOT="${EMIT_DASHBOARD_GIT_ROOT:-$REPO_ROOT}"
MUTEX_TASK_ID="commit-mutex:main"
MUTEX_HELD=false

# ── Release trap — fires on EVERY exit path once (and only if) the claim succeeded ──
# shellcheck disable=SC2329  # invoked indirectly via `trap ... EXIT`, not dead code
_release_mutex() {
  if [ "$MUTEX_HELD" = "true" ]; then
    local rel_args
    rel_args=$(jq -n --arg tid "$MUTEX_TASK_ID" --arg sess "${CLAUDE_CODE_SESSION_ID:-}" \
      '{task_id:$tid, owner_client_session:$sess}')
    mcp_call "task_release" "$rel_args" >/dev/null 2>&1
    MUTEX_HELD=false
  fi
}

_send_bug_telegram() {
  local msg="$1" args
  args=$(jq -n --arg channel "bug" --arg message "$msg" '{channel:$channel, message:$message}')
  mcp_call "send_telegram" "$args" >/dev/null 2>&1
}

run_emit_dashboard_row() {
  local check_id="" title="" severity="" location="" details="" impact=""
  local root_cause="" zone_owner="" signal_id="" dedup_key="" telegram_sent="yes"
  local mitigation="No immediate action beyond signal routing." status="OPEN"
  local dashboard_file="$DASHBOARD_FILE_DEFAULT"

  while [ $# -gt 0 ]; do
    case "$1" in
      --check-id) check_id="${2:-}"; shift 2 ;;
      --title) title="${2:-}"; shift 2 ;;
      --severity) severity="${2:-}"; shift 2 ;;
      --location) location="${2:-}"; shift 2 ;;
      --details) details="${2:-}"; shift 2 ;;
      --impact) impact="${2:-}"; shift 2 ;;
      --root-cause) root_cause="${2:-}"; shift 2 ;;
      --zone-owner) zone_owner="${2:-}"; shift 2 ;;
      --signal-id) signal_id="${2:-}"; shift 2 ;;
      --dedup-key) dedup_key="${2:-}"; shift 2 ;;
      --telegram-sent) telegram_sent="${2:-}"; shift 2 ;;
      --mitigation) mitigation="${2:-}"; shift 2 ;;
      --status) status="${2:-}"; shift 2 ;;
      --dashboard-file) dashboard_file="${2:-}"; shift 2 ;;
      *)
        echo "[emit-dashboard] ABORT unknown-arg $1"
        return 2
        ;;
    esac
  done

  if [ -z "$check_id" ] || [ -z "$title" ] || [ -z "$severity" ] || [ -z "$location" ] || \
     [ -z "$details" ] || [ -z "$impact" ] || [ -z "$zone_owner" ] || [ -z "$signal_id" ]; then
    echo "[emit-dashboard] ABORT missing-required-arg (need --check-id --title --severity --location --details --impact --zone-owner --signal-id)"
    return 2
  fi

  [ -n "$root_cause" ] || root_cause="(not yet determined)"

  # ── 1. Claim commit-mutex:main BEFORE any read of the file (concurrent
  # tiers may be mid-append) ────────────────────────────────────────────────
  if [ -z "${CLAUDE_CODE_SESSION_ID:-}" ]; then
    echo "[emit-dashboard] ABORT no-session-id — CLAUDE_CODE_SESSION_ID not set, refusing to run"
    return 2
  fi

  local claim_args claim_result claim_rc claimed holder
  claim_args=$(jq -n --arg tid "$MUTEX_TASK_ID" --arg agent "${EMIT_DASHBOARD_OWNER_AGENT:-system-auditor}" \
    --arg sess "$CLAUDE_CODE_SESSION_ID" --argjson ttl 90 \
    --arg intent "emit-dashboard-row $check_id" \
    '{task_id:$tid, task_kind:"commit-mutex", owner_agent:$agent, owner_client_session:$sess, ttl_seconds:$ttl, payload:({intent:$intent}|tostring)}')
  claim_result=$(mcp_call "task_claim" "$claim_args" 2>&1)
  claim_rc=$?

  if [ $claim_rc -ne 0 ]; then
    echo "[emit-dashboard] ABORT mutex-claim-failed transport-error: $(printf '%s' "$claim_result" | tr '\n' ' ' | cut -c1-200)"
    _send_bug_telegram "[emit-dashboard] BUG: mutex-claim transport failure — DASHBOARD row for ${check_id} (signal ${signal_id}) NOT written"
    return 1
  fi
  if ! printf '%s' "$claim_result" | jq -e . >/dev/null 2>&1; then
    echo "[emit-dashboard] ABORT mutex-claim-failed malformed-response"
    _send_bug_telegram "[emit-dashboard] BUG: mutex-claim malformed response — DASHBOARD row for ${check_id} (signal ${signal_id}) NOT written"
    return 1
  fi
  claimed=$(printf '%s' "$claim_result" | jq -r '.claimed // false')
  if [ "$claimed" != "true" ]; then
    holder=$(printf '%s' "$claim_result" | jq -c '.current_holder // empty' 2>/dev/null)
    echo "[emit-dashboard] ABORT mutex-claim-failed contended holder=$(printf '%s' "$holder" | tr '\n' ' ' | cut -c1-150)"
    _send_bug_telegram "[emit-dashboard] BUG: mutex contended — DASHBOARD row for ${check_id} (signal ${signal_id}) NOT written, retry next tick"
    return 1
  fi
  MUTEX_HELD=true
  trap _release_mutex EXIT

  # ── 2. Build the row block + atomic tmp+mv append ─────────────────────────
  local today ts_line block tmp dir
  today=$(date -u +%Y-%m-%d)
  ts_line=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local last_reported="**Last reported:** ${ts_line} (signal ${signal_id}, system-auditor -> po"
  [ -n "$dedup_key" ] && last_reported="${last_reported}, dedup_key=${dedup_key}"
  if [ "$telegram_sent" = "yes" ]; then
    last_reported="${last_reported}, ${severity} Telegram sent)"
  else
    last_reported="${last_reported})"
  fi

  block=$(cat <<EOF

## Anomaly: ${check_id} · ${title}
**Severity:** ${severity} | **Date:** ${today} | **Status:** ${status}
**Location:** ${location}
**Details:** ${details}
**Impact:** ${impact}
**Root cause:** ${root_cause}
**Zone owner:** ${zone_owner}
${last_reported}
**Mitigation:** ${mitigation}

---
EOF
)

  if [ ! -e "$dashboard_file" ]; then
    { echo "# System Audit Dashboard" > "$dashboard_file"; } 2>/dev/null
  fi

  dir="$(dirname "$dashboard_file")"
  tmp=$(mktemp "$dir/.DASHBOARD-XXXXXXXX.md.tmp" 2>/dev/null)
  if [ -z "$tmp" ]; then
    echo "[emit-dashboard] ABORT write-failed mktemp-failed"
    _send_bug_telegram "[emit-dashboard] BUG: mktemp failed — DASHBOARD row for ${check_id} (signal ${signal_id}) NOT written"
    return 1
  fi

  if ! cat "$dashboard_file" > "$tmp" 2>/dev/null || ! printf '%s\n' "$block" >> "$tmp" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null
    echo "[emit-dashboard] ABORT write-failed tmp-build-failed"
    _send_bug_telegram "[emit-dashboard] BUG: tmp-file build failed — DASHBOARD row for ${check_id} (signal ${signal_id}) NOT written"
    return 1
  fi

  if ! mv "$tmp" "$dashboard_file" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null
    echo "[emit-dashboard] ABORT write-failed mv-failed"
    _send_bug_telegram "[emit-dashboard] BUG: atomic rename failed — DASHBOARD row for ${check_id} (signal ${signal_id}) NOT written"
    return 1
  fi

  # ── 3. POST-WRITE READ-BACK (MANDATORY) — re-read the file, assert the
  # new row's unique anchor (the signal_id) is present. Mirrors the E-3
  # read-back idiom in scripts/emit-audit-signal.sh's _e3_write_row(): write,
  # then independently re-read from disk and assert presence — never trust
  # the write call's own return status alone. ────────────────────────────────
  if ! grep -qF "signal ${signal_id}" "$dashboard_file" 2>/dev/null; then
    echo "[emit-dashboard] ABORT readback-failed id=${signal_id}"
    _send_bug_telegram "[emit-dashboard] BUG: E-3-style read-back failure — DASHBOARD row for ${check_id} (signal ${signal_id}) claims written but anchor absent on re-read"
    return 1
  fi

  # ── 4. Commit (best-effort — failure does NOT invalidate the verified write) ──
  git -C "$GIT_ROOT" add -- "$dashboard_file" >/dev/null 2>&1
  local rel_path
  rel_path=$(cd "$GIT_ROOT" && git ls-files --full-name "$dashboard_file" 2>/dev/null)
  [ -z "$rel_path" ] && rel_path="docs/data/DASHBOARD.md"
  if git -C "$GIT_ROOT" diff --cached --quiet -- "$rel_path" 2>/dev/null; then
    : # nothing staged (shouldn't happen right after add+append, but never fail the OK on this)
  else
    if ! git -C "$GIT_ROOT" commit -m "chore(system-auditor): DASHBOARD row ${check_id} (signal ${signal_id})" -- "$rel_path" >/dev/null 2>&1; then
      echo "[emit-dashboard] WARN commit-failed rc=$? id=${signal_id}"
      _send_bug_telegram "[emit-dashboard] BUG: DASHBOARD row for ${check_id} (signal ${signal_id}) written+verified but git commit FAILED — working tree dirty, at risk of foreign sweep"
      echo "[emit-dashboard] OK id=${signal_id} check_id=${check_id}"
      return 0
    fi
  fi

  echo "[emit-dashboard] OK id=${signal_id} check_id=${check_id}"
  return 0
}

# ── Standalone CLI mode (only when executed directly, not sourced) ───────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_emit_dashboard_row "$@"
  exit $?
fi
