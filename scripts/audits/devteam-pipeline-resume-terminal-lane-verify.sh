#!/usr/bin/env bash
# scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh
#
# Regression verifier for FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND
# (2026-08-06) — docs/agents/dev-team/flow/main.md Step 0b, WF-1 task_status
# lookup (widened to scan done[]/done_verified[]) + new WF-1b TERMINAL-LANE
# check, inserted between the pre-existing BLOCKED carve-out and WF-2.
#
# ROOT CAUSE: a gateway-less specialist that closes its own head task
# (INV-GATEWAY-1) can lane-move its OWN row into done[]/done_verified[] but
# cannot write `.head` — pre-fix, WF-1's task_status lookup only scanned
# in_progress[]/active_sprints[], so it resolved task_status=empty on an
# already-finished task, missed the BLOCKED carve-out (task_status != null
# != "BLOCKED"), and fell through to a duplicate S2 re-spawn. Live incident:
# GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC, commit 336228ebe.
#
# Mirrors scripts/audits/execute-tier-branchnull-review-headidle-verify.sh's
# pattern: SYNTHETIC fixtures only, zero live docs/data/orch/orch-state.json
# I/O, replays the documented decision tree (task_status -> BLOCKED? ->
# is_terminal_task_status? -> SPAWN) rather than invoking main.md directly
# (main.md is prose+bash, not an executable unit).
#
# Proves:
#   AC-4 (positive): head pinned in_progress at a row present ONLY in done[]
#     (status DONE) -> WF-1b classifies TERMINAL -> idle-reset yields
#     head={idle, active_task_id:null, next_agent:null}; repeated for
#     done_verified[]/DONE_VERIFIED (AC-1's named second lane).
#   AC-3 (negative #1): a head naming a row genuinely resident in
#     in_progress[] (status IN_PROGRESS) still resolves SPAWN — the S2
#     dispatcher-wrap path is unchanged.
#   AC-3 (negative #2): a head naming a BLOCKED row still takes the
#     pre-existing BLOCKED carve-out unchanged (idle reset + lane-move to
#     backlog[]); proves is_terminal_task_status("BLOCKED")==false by
#     construction so WF-1b cannot accidentally shadow/reorder the BLOCKED
#     branch (BLOCKED is checked first in both main.md and this harness).
#
# Usage: bash scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh
# Exit 0 = all assertions pass. Exit 1 = a regression was detected.

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

FAIL=0
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

NOW="2026-08-06T08:00:00Z"

# Replays docs/agents/dev-team/flow/main.md Step 0b WF-1 task_status lookup
# (widened to done[]/done_verified[]) -> BLOCKED carve-out check -> WF-1b
# TERMINAL-LANE check, against a synthetic fixture. Prints exactly one of:
#   BLOCKED  | TERMINAL | SPAWN
# (SPAWN = would fall through to WF-2/S2 dispatcher-wrap, unchanged today.)
resolve_tick() {
  local state_file="$1"
  local tid
  tid=$(jq -r '.head.active_task_id' "$state_file")

  local task_status
  task_status=$(jq -r --arg tid "$tid" \
    '( [ (.task_board.in_progress // [])[], (.task_board.active_sprints // [])[].tasks[]?,
         (.task_board.done // [])[], (.task_board.done_verified // [])[] ]
       | map(select(.id == $tid or .task_id == $tid)) | first.status ) // empty' \
    "$state_file")

  if [ "$task_status" = "BLOCKED" ]; then
    echo "BLOCKED"
    return
  fi

  local is_terminal
  is_terminal=$(jq -r --arg s "$task_status" \
    'include "scripts/lib/devteam-eligibility"; is_terminal_task_status($s)' \
    "$state_file")
  if [ "$is_terminal" = "true" ]; then
    echo "TERMINAL"
    return
  fi

  echo "SPAWN"
}

# Mirrors main.md's WF-1b idle-reset write EXACTLY (no lane-move — the row is
# already correctly resident in done[]/done_verified[]).
apply_terminal_reset() {
  local state_file="$1" now="$2"
  jq --arg s "idle" --arg t "$now" --arg u "dev-team" \
    '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
    "$state_file"
}

# Mirrors the PRE-EXISTING BLOCKED idle-reset + lane-move EXACTLY (negative
# control — must stay byte-for-byte unchanged by this fix).
apply_blocked_reset() {
  local state_file="$1" now="$2" tid="$3"
  jq --arg s "idle" --arg t "$now" --arg u "dev-team" --arg tid "$tid" \
    '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}
     | if ((.task_board.in_progress // []) | any(.id == $tid or .task_id == $tid)) then
         .task_board.backlog = ((.task_board.backlog // []) + [ (.task_board.in_progress // [])[] | select(.id == $tid or .task_id == $tid) ])
         | .task_board.in_progress = ((.task_board.in_progress // []) | map(select((.id != $tid) and ((.task_id // null) != $tid))))
       else . end' \
    "$state_file"
}

# --- AC-4 positive #1: head pinned in_progress at a row present ONLY in done[]
cat > "$WORK/pos-done.json" <<'JSON'
{
  "head": {"status":"in_progress","active_task_id":"SYNTH-TERMLANE-DONE","next_agent":"architect","updated_at":"2026-08-06T07:00:00Z","updated_by":"architect"},
  "task_board": {
    "in_progress": [],
    "active_sprints": [],
    "done": [{"id":"SYNTH-TERMLANE-DONE","status":"DONE","next_agent":"qa"}],
    "done_verified": [],
    "review": [], "qa": [], "backlog": []
  }
}
JSON
PATH_DONE=$(resolve_tick "$WORK/pos-done.json")
if [ "$PATH_DONE" = "TERMINAL" ]; then
  RESULT_DONE=$(apply_terminal_reset "$WORK/pos-done.json" "$NOW")
  H_STATUS=$(echo "$RESULT_DONE" | jq -r '.head.status')
  H_ACTIVE=$(echo "$RESULT_DONE" | jq -r '.head.active_task_id')
  H_NEXT=$(echo "$RESULT_DONE" | jq -r '.head.next_agent')
  if [ "$H_STATUS" = "idle" ] && [ "$H_ACTIVE" = "null" ] && [ "$H_NEXT" = "null" ]; then
    echo "[PASS] AC-4 (done[]): head pinned at a done[] row idle-resets, S2 spawn branch never reached"
  else
    echo "[FAIL] AC-4 (done[]): idle-reset shape wrong (status=$H_STATUS active_task_id=$H_ACTIVE next_agent=$H_NEXT)" >&2
    FAIL=1
  fi
else
  echo "[FAIL] AC-4 (done[]): resolve_tick did not classify as TERMINAL (got: $PATH_DONE) — WF-1b would not fire, S2 would re-spawn already-finished work" >&2
  FAIL=1
fi

# --- AC-4 positive #2: same shape, done_verified[] lane, DONE_VERIFIED status
cat > "$WORK/pos-donever.json" <<'JSON'
{
  "head": {"status":"in_progress","active_task_id":"SYNTH-TERMLANE-DV","next_agent":"developer","updated_at":"2026-08-06T07:00:00Z","updated_by":"developer"},
  "task_board": {
    "in_progress": [],
    "active_sprints": [],
    "done": [],
    "done_verified": [{"id":"SYNTH-TERMLANE-DV","status":"DONE_VERIFIED","next_agent":"qa"}],
    "review": [], "qa": [], "backlog": []
  }
}
JSON
PATH_DV=$(resolve_tick "$WORK/pos-donever.json")
if [ "$PATH_DV" = "TERMINAL" ]; then
  RESULT_DV=$(apply_terminal_reset "$WORK/pos-donever.json" "$NOW")
  H_STATUS=$(echo "$RESULT_DV" | jq -r '.head.status')
  H_ACTIVE=$(echo "$RESULT_DV" | jq -r '.head.active_task_id')
  H_NEXT=$(echo "$RESULT_DV" | jq -r '.head.next_agent')
  if [ "$H_STATUS" = "idle" ] && [ "$H_ACTIVE" = "null" ] && [ "$H_NEXT" = "null" ]; then
    echo "[PASS] AC-4 (done_verified[]): head pinned at a done_verified[] row idle-resets, S2 spawn branch never reached"
  else
    echo "[FAIL] AC-4 (done_verified[]): idle-reset shape wrong (status=$H_STATUS active_task_id=$H_ACTIVE next_agent=$H_NEXT)" >&2
    FAIL=1
  fi
else
  echo "[FAIL] AC-4 (done_verified[]): resolve_tick did not classify as TERMINAL (got: $PATH_DV)" >&2
  FAIL=1
fi

# --- AC-3 negative #1: genuinely in-flight in_progress[] task resumes unchanged
cat > "$WORK/neg-inprogress.json" <<'JSON'
{
  "head": {"status":"in_progress","active_task_id":"SYNTH-TERMLANE-LIVE","next_agent":"developer","updated_at":"2026-08-06T07:55:00Z","updated_by":"developer"},
  "task_board": {
    "in_progress": [{"id":"SYNTH-TERMLANE-LIVE","status":"IN_PROGRESS","next_agent":"developer"}],
    "active_sprints": [],
    "done": [], "done_verified": [],
    "review": [], "qa": [], "backlog": []
  }
}
JSON
PATH_LIVE=$(resolve_tick "$WORK/neg-inprogress.json")
if [ "$PATH_LIVE" = "SPAWN" ]; then
  echo "[PASS] AC-3 (in_progress): genuinely live in_progress[] row still resolves SPAWN — S2 dispatcher-wrap path unchanged"
else
  echo "[FAIL] AC-3 (in_progress): live row misclassified (got: $PATH_LIVE) — should still resume normally" >&2
  FAIL=1
fi

# --- AC-3 negative #2: BLOCKED row still takes the pre-existing carve-out,
#     unaffected by the new WF-1b branch (proves ordering: BLOCKED checked
#     first, is_terminal_task_status("BLOCKED")==false by construction)
IS_BLOCKED_TERMINAL=$(jq -rn 'include "scripts/lib/devteam-eligibility"; is_terminal_task_status("BLOCKED")')
if [ "$IS_BLOCKED_TERMINAL" != "false" ]; then
  echo "[FAIL] precondition violated: is_terminal_task_status(\"BLOCKED\") returned $IS_BLOCKED_TERMINAL, expected false — WF-1b could shadow the BLOCKED carve-out" >&2
  FAIL=1
fi
cat > "$WORK/neg-blocked.json" <<'JSON'
{
  "head": {"status":"in_progress","active_task_id":"SYNTH-TERMLANE-BLOCKED","next_agent":"architect","updated_at":"2026-08-06T07:55:00Z","updated_by":"architect"},
  "task_board": {
    "in_progress": [{"id":"SYNTH-TERMLANE-BLOCKED","status":"BLOCKED","next_agent":"architect"}],
    "active_sprints": [],
    "done": [], "done_verified": [],
    "review": [], "qa": [], "backlog": []
  }
}
JSON
PATH_BLOCKED=$(resolve_tick "$WORK/neg-blocked.json")
if [ "$PATH_BLOCKED" = "BLOCKED" ]; then
  RESULT_BLOCKED=$(apply_blocked_reset "$WORK/neg-blocked.json" "$NOW" "SYNTH-TERMLANE-BLOCKED")
  H_STATUS=$(echo "$RESULT_BLOCKED" | jq -r '.head.status')
  H_ACTIVE=$(echo "$RESULT_BLOCKED" | jq -r '.head.active_task_id')
  BACKLOG_LEN=$(echo "$RESULT_BLOCKED" | jq '.task_board.backlog | length')
  INPROG_LEN=$(echo "$RESULT_BLOCKED" | jq '.task_board.in_progress | length')
  if [ "$H_STATUS" = "idle" ] && [ "$H_ACTIVE" = "null" ] && [ "$BACKLOG_LEN" -eq 1 ] && [ "$INPROG_LEN" -eq 0 ]; then
    echo "[PASS] AC-3 (BLOCKED): pre-existing BLOCKED carve-out fires unchanged (idle reset + lane-move to backlog[])"
  else
    echo "[FAIL] AC-3 (BLOCKED): carve-out shape regressed (status=$H_STATUS active_task_id=$H_ACTIVE backlog_len=$BACKLOG_LEN in_progress_len=$INPROG_LEN)" >&2
    FAIL=1
  fi
else
  echo "[FAIL] AC-3 (BLOCKED): resolve_tick did not classify as BLOCKED (got: $PATH_BLOCKED) — new WF-1b branch shadowed the pre-existing carve-out" >&2
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "PASS: WF-1b terminal-lane check holds — done[]/done_verified[] head-pins idle-reset, in_progress/BLOCKED unaffected."
  exit 0
else
  echo "FAIL: see above."
  exit 1
fi
