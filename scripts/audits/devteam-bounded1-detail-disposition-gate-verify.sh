#!/usr/bin/env bash
# devteam-bounded1-detail-disposition-gate-verify.sh
# Regression verifier for FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE (2026-07-12)
# Brief: this fix (scripts/devteam-backlog-promote-bounded1.jq AC-1/AC-2) —
# see docs/agents/dev-team/flow/main.md § Idle-capacity backlog pickup (BOUNDED-1).
#
# Proves, against the CURRENT live docs/data/orch/orch-state.json +
# docs/data/orch/archive/backlog-detail.json:
#   AC-1: a detail-authoritative DEFERRED* row is NEVER auto-promoted, even
#         when forced to top priority.
#   AC-2: a row whose detail owner is a non-dev deliberate-launch agent
#         (po/ops/architect/...) AND whose board `next_agent` is null is
#         NEVER auto-promoted, even when forced to top priority.
#   CONTROL: a clean row (no detail-DEFERRED*, no non-dev-owner+null-
#            next_agent block, no supervised/epic/depends_on block) IS
#            still promoted — proves the new gates do not over-block.
#
# READ-ONLY: never writes back to the live orch-state.json/backlog-detail.json
# (no orch-apply.sh call anywhere) — all fixtures are synthetic copies in a
# mktemp scratch dir, discarded on exit. Fixture task IDs are discovered
# dynamically from live data at runtime — NO hardcoded task-id literals,
# mirroring the promote script's own no-hardcode discipline.
#
# Portability note: written for macOS default /bin/bash 3.2 (no mapfile, no
# nameref) — uses plain newline-delimited scratch files + `while read` loops
# instead.
#
# Usage: bash scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh
# Exit 0 = all discovered assertions pass (an assertion is skipped, not
# failed, if no live fixture candidate currently exists for it).
# Exit 1 = a regression was detected — prints which assertion failed.

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

STATE="docs/data/orch/orch-state.json"
DETAIL="docs/data/orch/archive/backlog-detail.json"
PROMOTE_JQ="scripts/devteam-backlog-promote-bounded1.jq"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

NOW="2026-01-01T00:00:00Z"   # fixed synthetic timestamp — value irrelevant to the assertions
FAIL=0

# --- board-side eligibility helpers (query the live $STATE) ----------------

board_backlog_status_ok() {
  # $1 = id -> "true" if present in task_board.backlog[] with status BACKLOG/TODO
  jq -r --arg id "$1" '
    ([.task_board.backlog[]? | select(.id == $id) | .status] | any(. == "BACKLOG" or . == "TODO"))
  ' "$STATE"
}

board_next_agent_empty() {
  jq -r --arg id "$1" '
    (([.task_board.backlog[]? | select(.id == $id) | (.next_agent // "")] | first) // "") == ""
  ' "$STATE"
}

board_inline_clean() {
  # $1 = id -> "true" if the board row itself carries no inline supervised/
  # children/depends_on/depends/blocked_by that would block promotion
  jq -r --arg id "$1" '
    ([.task_board.backlog[]? | select(.id == $id)] | first) as $row
    | ($row.supervised // false) != true
      and (($row.children // []) | length) == 0
      and (($row.depends_on // []) | length) == 0
      and (($row.depends // []) | length) == 0
      and (($row.blocked_by // []) | length) == 0
  ' "$STATE"
}

run_promote_picked_id() {
  # $1 = synthetic state json path -> prints picked ready[] id (or empty)
  jq --arg now "$NOW" --slurpfile detail "$DETAIL" -f "$PROMOTE_JQ" "$1" \
    | jq -r '.task_board.ready[0].id // empty'
}

make_isolated_fixture() {
  # $1 = id, $2 = output path — reduces backlog[] to exactly this one row
  # (forced to P0 priority) and clears in_progress[] to simulate WIP=0.
  jq --arg id "$1" '
    .task_board.in_progress = []
    | .task_board.backlog = ([ .task_board.backlog[] | select(.id == $id) ] | map(. + {priority: "P0"}))
  ' "$STATE" > "$2"
}

# --- candidate pools from backlog-detail.json (detail-only predicates) ----

jq -r '
  .items[]
  | select((.status // "" | ascii_downcase) | startswith("deferred"))
  | select((.owner // "") == "")
  | .id
' "$DETAIL" > "$WORK/ac1-pool.txt"

jq -r '
  .items[]
  | select(.owner != null and (.owner|type)=="string" and .owner != "")
  | select((.owner | test("^dev(-|$)|^developer$"; "i")) | not)
  | select(((.status // "" | ascii_downcase) | startswith("deferred")) | not)
  | select((.supervised // false) != true)
  | select(((.children // []) | length) == 0)
  | select((.depends_on // null) == null)
  | select((.depends // null) == null)
  | select((.blocked_by // null) == null)
  | .id
' "$DETAIL" > "$WORK/ac2-pool.txt"

jq -r '
  .items[]
  | select(((.status // "" | ascii_downcase) | startswith("deferred")) | not)
  | select((.supervised // false) != true)
  | select(((.children // []) | length) == 0)
  | select(((.depends_on // []) | length) == 0)
  | select(((.depends // []) | length) == 0)
  | select(((.blocked_by // []) | length) == 0)
  | select((.owner // "") == "" or (.owner | test("^dev(-|$)|^developer$"; "i")))
  | .id
' "$DETAIL" > "$WORK/control-pool.txt"

pick_first_ac1() {
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ]; then echo "$id"; return 0; fi
  done < "$WORK/ac1-pool.txt"
  return 1
}

pick_first_ac2() {
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ] \
       && [ "$(board_next_agent_empty "$id")" = "true" ] \
       && [ "$(board_inline_clean "$id")" = "true" ]; then
      echo "$id"; return 0
    fi
  done < "$WORK/ac2-pool.txt"
  return 1
}

pick_first_control() {
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ] \
       && [ "$(board_inline_clean "$id")" = "true" ]; then
      echo "$id"; return 0
    fi
  done < "$WORK/control-pool.txt"
  return 1
}

AC1_ID=""
AC2_ID=""
CONTROL_ID=""
AC1_ID=$(pick_first_ac1) || true
AC2_ID=$(pick_first_ac2) || true
CONTROL_ID=$(pick_first_control) || true

if [ -n "$AC1_ID" ]; then
  make_isolated_fixture "$AC1_ID" "$WORK/ac1.json"
  PICKED=$(run_promote_picked_id "$WORK/ac1.json")
  if [ "$PICKED" = "$AC1_ID" ]; then
    echo "[FAIL] AC-1 regression: detail-DEFERRED row $AC1_ID WAS promoted"
    FAIL=1
  else
    echo "[PASS] AC-1: detail-DEFERRED row $AC1_ID NOT promoted (picked='${PICKED:-<none>}')"
  fi
else
  echo "[SKIP] AC-1: no eligible detail-DEFERRED* fixture candidate in live data"
fi

if [ -n "$AC2_ID" ]; then
  make_isolated_fixture "$AC2_ID" "$WORK/ac2.json"
  PICKED=$(run_promote_picked_id "$WORK/ac2.json")
  if [ "$PICKED" = "$AC2_ID" ]; then
    echo "[FAIL] AC-2 regression: non-dev-owner/null-next_agent row $AC2_ID WAS promoted"
    FAIL=1
  else
    echo "[PASS] AC-2: non-dev-owner/null-next_agent row $AC2_ID NOT promoted (picked='${PICKED:-<none>}')"
  fi
else
  echo "[SKIP] AC-2: no eligible non-dev-owner/null-next_agent fixture candidate in live data"
fi

if [ -n "$CONTROL_ID" ]; then
  make_isolated_fixture "$CONTROL_ID" "$WORK/control.json"
  PICKED=$(run_promote_picked_id "$WORK/control.json")
  if [ "$PICKED" = "$CONTROL_ID" ]; then
    echo "[PASS] control: clean row $CONTROL_ID still promoted (gates do not over-block)"
  else
    echo "[FAIL] control regression: clean row $CONTROL_ID was NOT promoted (picked='${PICKED:-<none>}')"
    FAIL=1
  fi
else
  echo "[SKIP] control: no eligible clean fixture candidate in live data"
fi

exit $FAIL
