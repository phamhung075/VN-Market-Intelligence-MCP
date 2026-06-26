#!/usr/bin/env bash
# scripts/orch-state-validate.sh
# Write-gate validator for docs/data/orch/orch-state.json.
# Implements G-1..G-6 checks against a candidate file passed as $1.
# Exit 0 = valid. Non-zero = validation failed (hard gate: G-1..G-4, G-6 currently WARN).
#
# Wire-in pattern (before atomic rename):
#   bash "$PROJECT_ROOT/scripts/orch-state-validate.sh" "$TMP" \
#     || { rm -f "$TMP"; echo "[orch-write] ABORTED: validation failed" >&2; exit 1; }
#
# SHG-1 — ORCH-STATE-SCHEMA-HARDENING sprint
# Brief: docs/architecture-briefs/2026-06-27-orch-state-schema-hardening.md § 4
# Handoff: docs/handoffs/SHG-1.md

set -euo pipefail

FILE="${1:?usage: orch-state-validate.sh <path-to-json>}"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

_pass() { echo "[validate] G-${1} PASS: ${2}"; PASS_COUNT=$((PASS_COUNT + 1)); }
_fail() { echo "[validate] G-${1} FAIL: ${2}" >&2; FAIL_COUNT=$((FAIL_COUNT + 1)); }
_warn() { echo "[validate] G-${1} WARN: ${2}" >&2; WARN_COUNT=$((WARN_COUNT + 1)); }

# ---------------------------------------------------------------------------
# G-1: JSON validity
# ---------------------------------------------------------------------------
if jq empty "$FILE" 2>/dev/null; then
  _pass 1 "valid JSON"
else
  _fail 1 "invalid JSON — $(jq empty "$FILE" 2>&1 | head -1)"
  echo "[validate] FAIL — $FAIL_COUNT gate(s) failed, $WARN_COUNT warning(s)" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# G-2: Structural sentinel (.head, .task_board, .signal_queue present + non-null)
# ---------------------------------------------------------------------------
if jq -e '.head != null and .task_board != null and .signal_queue != null' "$FILE" > /dev/null 2>&1; then
  _pass 2 "structural sentinel present (.head, .task_board, .signal_queue)"
else
  _fail 2 "missing root key — one or more of .head / .task_board / .signal_queue is absent or null"
  echo "[validate] FAIL — $FAIL_COUNT gate(s) failed, $WARN_COUNT warning(s)" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# G-3: Lane types are arrays (catches jq-nest-whole-doc-into-lane clobber class)
# See memory: feedback_qa_jq_nests_whole_doc_into_lane
# Checks: .task_board.active_sprints, .task_board.backlog, .task_board.done,
#         .signal_queue.rows
# ---------------------------------------------------------------------------
LANE_CHECK=$(jq -r '
  def check_lane(path_label; val):
    if (val | type) != "array" then path_label else empty end;
  [
    check_lane("task_board.active_sprints"; .task_board.active_sprints),
    check_lane("task_board.backlog";        .task_board.backlog),
    check_lane("task_board.done";           .task_board.done),
    check_lane("signal_queue.rows";         .signal_queue.rows)
  ] | join(", ")
' "$FILE" 2>/dev/null)

if [ -z "$LANE_CHECK" ]; then
  _pass 3 "all required lanes are arrays (active_sprints, backlog, done, signal_queue.rows)"
else
  _fail 3 "lane type not array — offenders: $LANE_CHECK"
  echo "[validate] FAIL — $FAIL_COUNT gate(s) failed, $WARN_COUNT warning(s)" >&2
  exit 3
fi

# ---------------------------------------------------------------------------
# G-4: No null sprint IDs in task_board.active_sprints (HARD fail)
# ---------------------------------------------------------------------------
NULL_SPRINT_COUNT=$(jq '[.task_board.active_sprints[] | select(.id == null)] | length' "$FILE" 2>/dev/null)
if [ "$NULL_SPRINT_COUNT" -eq 0 ]; then
  _pass 4 "no null-id sprints in active_sprints"
else
  _fail 4 "$NULL_SPRINT_COUNT null-id sprint(s) in active_sprints — quarantine required (see brief § 2.3)"
  echo "[validate] FAIL — $FAIL_COUNT gate(s) failed, $WARN_COUNT warning(s)" >&2
  exit 4
fi

# ---------------------------------------------------------------------------
# G-5: Task status values in canonical 11-value enum (WARN-only until migration)
# Canonical enum: BACKLOG TODO IN_PROGRESS REVIEW QA DONE DONE_VERIFIED BLOCKED DEFERRED CANCELLED SKIPPED
# Checks tasks in: active_sprints[].tasks[], backlog[], done[]
# Phase-in: currently WARN (exit 0). After SHG-2 migration + SHG-3 wire-in verified,
# uncomment the exit 5 line below (SHG-5 AC).
# ---------------------------------------------------------------------------
ENUM='["BACKLOG","TODO","IN_PROGRESS","REVIEW","QA","DONE","DONE_VERIFIED","BLOCKED","DEFERRED","CANCELLED","SKIPPED"]'

BAD_STATUSES=$(jq -r --argjson E "$ENUM" '
  [
    (.task_board.active_sprints[].tasks[]?  | {id: .id, status: .status, lane: "active_sprints"}),
    (.task_board.backlog[]?                 | {id: .id, status: .status, lane: "backlog"}),
    (.task_board.done[]?                    | {id: .id, status: .status, lane: "done"})
  ]
  | map(select(.status != null))
  | map(select(.status as $s | ($E | index($s)) == null))
  | map("\(.lane)/\(.id)=\(.status)")
  | join(", ")
' "$FILE" 2>/dev/null)

BAD_COUNT=$(jq --argjson E "$ENUM" '
  [
    (.task_board.active_sprints[].tasks[]?  | .status),
    (.task_board.backlog[]?                 | .status),
    (.task_board.done[]?                    | .status)
  ]
  | map(select(. != null))
  | map(select(. as $s | ($E | index($s)) == null))
  | length
' "$FILE" 2>/dev/null)

if [ "$BAD_COUNT" -eq 0 ]; then
  _pass 5 "all task statuses are in canonical enum (0 offenders)"
else
  _warn 5 "$BAD_COUNT non-canonical status value(s) — offenders: $BAD_STATUSES — run SHG-2 migration"
  # SHG-5 AC: uncomment the next line after SHG-2 migration + SHG-3 wire-in are verified complete.
  # exit 5  # HARD-GATE: enable post-migration (SHG-5)
fi

# ---------------------------------------------------------------------------
# G-6: head.last_tick / last_tick skew sanity (WARN only — do not hard-fail)
# Warns if both fields are present and their epoch difference exceeds 2 hours (7200s).
# Non-standard timestamp formats are skipped gracefully (fromdateiso8601 returns error).
# ---------------------------------------------------------------------------
SKEW_OK=$(jq -r '
  if (.head.last_tick != null and .last_tick != null) then
    try (
      ((.head.last_tick | fromdateiso8601) - (.last_tick | fromdateiso8601) | fabs) as $skew |
      if $skew < 7200 then "ok"
      else "skew:\($skew | floor)"
      end
    ) catch "skip-unparseable"
  else "skip-absent"
  end
' "$FILE" 2>/dev/null)

case "$SKEW_OK" in
  ok)
    _pass 6 "head.last_tick / last_tick skew within 2h"
    ;;
  skip-absent|skip-unparseable)
    _pass 6 "head.last_tick / last_tick skew check skipped (field absent or non-ISO format)"
    ;;
  skew:*)
    SECONDS_SKEW="${SKEW_OK#skew:}"
    _warn 6 "head.last_tick / last_tick diverge by ~${SECONDS_SKEW}s (>7200) — stale tick suspected"
    ;;
  *)
    _warn 6 "head.last_tick / last_tick skew check returned unexpected result: $SKEW_OK"
    ;;
esac

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "[validate] FAIL — $FAIL_COUNT gate(s) failed, $WARN_COUNT warning(s): $FILE" >&2
  exit 1
else
  echo "[validate] OK — all hard gates passed, $WARN_COUNT warning(s): $FILE"
  exit 0
fi
