#!/usr/bin/env bash
# devteam-wrapper-autoclose-verify.sh
# Regression verifier for FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP (2026-07-29).
# Brief: scripts/devteam-wrapper-autoclose.jq + scripts/lib/devteam-eligibility.jq
# (all_children_terminal / is_terminal_task_status / has_hold_reason) — see
# docs/agents/dev-team/flow/post-cycle.md § Step 4.4.
#
# ALL SYNTHETIC — no live ready[]/in_progress[] row currently carries a
# non-empty children[] (verified 2026-07-29: is_epic_wrapper rows live today
# sit only in backlog[]/done[]), so every assertion here uses a hand-built
# fixture rather than a live-data discovery pool (mirrors this codebase's
# own precedent for gates with no clean live example — see AC-6/AC-9/AC-10
# in devteam-bounded1-detail-disposition-gate-verify.sh).
#
# Proves:
#   AC-1: a wrapper row with ALL children terminal (mix of hot done_verified[]
#         lane + cold-archived done_tasks[]) IS swept ready[]->review[],
#         status flips to REVIEW, next_agent resolves via resolved_dispatch_lane.
#   AC-2: a wrapper row with one child still non-terminal (IN_PROGRESS, hot
#         lane) is NEVER swept.
#   AC-3: case/separator normalization — a child cold-archived under a
#         pre-canonicalization-era status string ("done_verified" lowercase,
#         "DONE-VERIFIED" dash-separated) still resolves terminal.
#   AC-4: a child id found in NEITHER any hot lane NOR any cold-archive month
#         doc is conservative-skip — the wrapper is NEVER swept (MISSING !=
#         terminal, mirrors deps_satisfied's own default).
#   AC-5: a wrapper carrying `hold_reason` (inline) with all children terminal
#         is NEVER swept, even though AC-1's own predicate alone would pass.
#   AC-6: a plain row with no children[] at all passes through completely
#         untouched (not swept, not mutated) — proves the sweep does not
#         over-fire on ordinary atomic tasks.
#   AC-7: `.head` sync — when `.head.active_task_id` equals a swept row's id,
#         `.head` flips to `{status:idle, active_task_id:null,
#         next_agent:"router"}` in the SAME write (CANONICAL:
#         SSOT-STATUSFLIP-LANEMOVE rule (b)).
#   AC-8: `.head` sync negative control — when `.head.active_task_id` points
#         at an UNRELATED task, `.head` is left byte-identical (never
#         stomped) even though a wrapper was swept in the same write.
#   AC-9: in_progress[] source lane — a wrapper sitting in `in_progress[]`
#         (not just `ready[]`) with all children terminal is also swept,
#         proving both source lanes are covered, not just ready[].
#   IDEMPOTENCY: re-running the script against its own output is a no-op
#         (swept rows are gone from ready[]/in_progress[], so the second
#         pass finds nothing left to sweep).
#
# READ-ONLY: never writes to the live orch-state.json/backlog-detail.json/
# archive (no orch-apply.sh call anywhere) — every fixture is a synthetic
# copy in a mktemp scratch dir, discarded on exit.
#
# Portability note: written for macOS default /bin/bash 3.2 (no mapfile, no
# nameref).
#
# Usage: bash scripts/audits/devteam-wrapper-autoclose-verify.sh
# Exit 0 = all assertions pass. Exit 1 = a regression was detected.

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

JQ_SCRIPT="scripts/devteam-wrapper-autoclose.jq"
NOW="2026-07-29T00:00:00Z"
FAIL=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

: > "$WORK/empty-detail.json"
echo '{"items":[]}' > "$WORK/empty-detail.json"
: > "$WORK/empty-archive.json"   # zero-byte -> --slurpfile yields []

run_sweep() {
  # $1 = state json path, $2 = archive json path (or empty-archive.json)
  # prints the resulting document to stdout
  jq --arg now "$NOW" \
    --slurpfile detail "$WORK/empty-detail.json" \
    --slurpfile archive "$2" \
    -f "$JQ_SCRIPT" "$1"
}

base_state() {
  # $1 = extra ready[] rows (JSON array literal string)
  # $2 = extra in_progress[] rows (JSON array literal string)
  # $3 = active_task_id for .head (or "null")
  jq -n --argjson ready "$1" --argjson inprog "$2" --arg active "$3" '
    { head: (if $active == "null" then {status:"idle", active_task_id:null, next_agent:null}
             else {status:"in_progress", active_task_id:$active, next_agent:"developer"} end),
      task_board: {
        backlog: [], qa: [], review: [], done: [],
        done_verified: [ { id: "ZZ-CHILD-DV", status: "DONE_VERIFIED" } ],
        ready: $ready, in_progress: $inprog
      } }
  '
}

# --- AC-1: mixed hot done_verified[] + cold-archive child, no hold_reason --
AC1_READY='[{"id":"ZZ-AC1-WRAP","status":"READY","owner":"pm","next_agent":"pm","children":["ZZ-CHILD-DV","ZZ-AC1-CHILD-COLD"]}]'
base_state "$AC1_READY" '[]' 'null' > "$WORK/ac1-state.json"
echo '{"done_tasks":[{"id":"ZZ-AC1-CHILD-COLD","status":"DONE_VERIFIED"}]}' > "$WORK/ac1-archive.json"
AC1_OUT=$(run_sweep "$WORK/ac1-state.json" "$WORK/ac1-archive.json")
AC1_REVIEW_ID=$(echo "$AC1_OUT" | jq -r '.task_board.review[0].id // empty')
AC1_REVIEW_STATUS=$(echo "$AC1_OUT" | jq -r '.task_board.review[0].status // empty')
AC1_REVIEW_NA=$(echo "$AC1_OUT" | jq -r '.task_board.review[0].next_agent // empty')
AC1_READY_LEFT=$(echo "$AC1_OUT" | jq '.task_board.ready | length')
if [ "$AC1_REVIEW_ID" = "ZZ-AC1-WRAP" ] && [ "$AC1_REVIEW_STATUS" = "REVIEW" ] && [ "$AC1_REVIEW_NA" = "pm" ] && [ "$AC1_READY_LEFT" -eq 0 ]; then
  echo "[PASS] AC-1: all-terminal wrapper (hot+cold children) swept ready[]->review[], status=REVIEW, next_agent=pm"
else
  echo "[FAIL] AC-1 regression: expected swept/REVIEW/pm/ready-empty, got id='$AC1_REVIEW_ID' status='$AC1_REVIEW_STATUS' next_agent='$AC1_REVIEW_NA' ready_left=$AC1_READY_LEFT"
  FAIL=1
fi

# --- AC-2: one child still non-terminal (hot IN_PROGRESS) -> NOT swept -----
AC2_INPROG='[{"id":"ZZ-AC2-WRAP","status":"IN_PROGRESS","owner":"pm","next_agent":"pm","children":["ZZ-CHILD-DV","ZZ-AC2-CHILD-LIVE"]},{"id":"ZZ-AC2-CHILD-LIVE","status":"IN_PROGRESS","owner":"developer","next_agent":"developer"}]'
base_state '[]' "$AC2_INPROG" 'null' > "$WORK/ac2-state.json"
AC2_OUT=$(run_sweep "$WORK/ac2-state.json" "$WORK/empty-archive.json")
AC2_REVIEW_LEN=$(echo "$AC2_OUT" | jq '.task_board.review | length')
AC2_INPROG_LEN=$(echo "$AC2_OUT" | jq '.task_board.in_progress | length')
if [ "$AC2_REVIEW_LEN" -eq 0 ] && [ "$AC2_INPROG_LEN" -eq 2 ]; then
  echo "[PASS] AC-2: wrapper with a non-terminal child NOT swept (in_progress[] unchanged)"
else
  echo "[FAIL] AC-2 regression: wrapper with a non-terminal child WAS swept (review_len=$AC2_REVIEW_LEN in_progress_len=$AC2_INPROG_LEN)"
  FAIL=1
fi

# --- AC-3: case/separator-drifted cold-archive statuses still resolve -----
AC3_READY='[{"id":"ZZ-AC3-WRAP","status":"READY","owner":"pm","next_agent":"pm","children":["ZZ-AC3-CHILD-LOW","ZZ-AC3-CHILD-DASH"]}]'
base_state "$AC3_READY" '[]' 'null' > "$WORK/ac3-state.json"
echo '{"done_tasks":[{"id":"ZZ-AC3-CHILD-LOW","status":"done_verified"},{"id":"ZZ-AC3-CHILD-DASH","status":"DONE-VERIFIED"}]}' > "$WORK/ac3-archive.json"
AC3_OUT=$(run_sweep "$WORK/ac3-state.json" "$WORK/ac3-archive.json")
AC3_REVIEW_ID=$(echo "$AC3_OUT" | jq -r '.task_board.review[0].id // empty')
if [ "$AC3_REVIEW_ID" = "ZZ-AC3-WRAP" ]; then
  echo "[PASS] AC-3: case/separator-drifted cold-archive statuses (lowercase, dash-separated) still resolve terminal"
else
  echo "[FAIL] AC-3 regression: wrapper with drifted-case archive statuses NOT swept"
  FAIL=1
fi

# --- AC-4: a child id absent from BOTH hot and cold archive -> conservative-skip
AC4_READY='[{"id":"ZZ-AC4-WRAP","status":"READY","owner":"pm","next_agent":"pm","children":["ZZ-CHILD-DV","ZZ-AC4-CHILD-NOWHERE"]}]'
base_state "$AC4_READY" '[]' 'null' > "$WORK/ac4-state.json"
AC4_OUT=$(run_sweep "$WORK/ac4-state.json" "$WORK/empty-archive.json")
AC4_REVIEW_LEN=$(echo "$AC4_OUT" | jq '.task_board.review | length')
AC4_READY_LEFT=$(echo "$AC4_OUT" | jq '.task_board.ready | length')
if [ "$AC4_REVIEW_LEN" -eq 0 ] && [ "$AC4_READY_LEFT" -eq 1 ]; then
  echo "[PASS] AC-4: child id found in NEITHER hot NOR cold archive -> conservative-skip, wrapper stays in ready[]"
else
  echo "[FAIL] AC-4 regression: missing-child wrapper was swept anyway (review_len=$AC4_REVIEW_LEN ready_left=$AC4_READY_LEFT)"
  FAIL=1
fi

# --- AC-5: hold_reason guard -----------------------------------------------
AC5_READY='[{"id":"ZZ-AC5-WRAP","status":"READY","owner":"pm","next_agent":"pm","hold_reason":"wait for next sprint boundary","children":["ZZ-CHILD-DV"]}]'
base_state "$AC5_READY" '[]' 'null' > "$WORK/ac5-state.json"
AC5_OUT=$(run_sweep "$WORK/ac5-state.json" "$WORK/empty-archive.json")
AC5_REVIEW_LEN=$(echo "$AC5_OUT" | jq '.task_board.review | length')
if [ "$AC5_REVIEW_LEN" -eq 0 ]; then
  echo "[PASS] AC-5: hold_reason-carrying wrapper NEVER swept, even with all children terminal"
else
  echo "[FAIL] AC-5 regression: hold_reason-carrying wrapper WAS swept"
  FAIL=1
fi

# --- AC-6: plain non-wrapper row passes through untouched -----------------
AC6_READY='[{"id":"ZZ-AC6-PLAIN","status":"READY","owner":"developer","next_agent":"developer"}]'
base_state "$AC6_READY" '[]' 'null' > "$WORK/ac6-state.json"
AC6_OUT=$(run_sweep "$WORK/ac6-state.json" "$WORK/empty-archive.json")
AC6_DIFF=$(diff <(jq -S . "$WORK/ac6-state.json") <(echo "$AC6_OUT" | jq -S .) || true)
if [ -z "$AC6_DIFF" ]; then
  echo "[PASS] AC-6: plain non-wrapper row unchanged (byte-identical doc, no-op)"
else
  echo "[FAIL] AC-6 regression: plain non-wrapper row's document was mutated"
  FAIL=1
fi

# --- AC-7: .head sync when .head.active_task_id == swept row id -----------
AC7_READY='[{"id":"ZZ-AC7-WRAP","status":"READY","owner":"pm","next_agent":"pm","children":["ZZ-CHILD-DV"]}]'
base_state "$AC7_READY" '[]' 'ZZ-AC7-WRAP' > "$WORK/ac7-state.json"
AC7_OUT=$(run_sweep "$WORK/ac7-state.json" "$WORK/empty-archive.json")
AC7_HEAD_STATUS=$(echo "$AC7_OUT" | jq -r '.head.status')
AC7_HEAD_ACTIVE=$(echo "$AC7_OUT" | jq -r '.head.active_task_id // "null"')
AC7_HEAD_NA=$(echo "$AC7_OUT" | jq -r '.head.next_agent')
if [ "$AC7_HEAD_STATUS" = "idle" ] && [ "$AC7_HEAD_ACTIVE" = "null" ] && [ "$AC7_HEAD_NA" = "router" ]; then
  echo "[PASS] AC-7: .head synced to idle/null/router when it pointed at the swept row"
else
  echo "[FAIL] AC-7 regression: .head NOT synced correctly (status='$AC7_HEAD_STATUS' active='$AC7_HEAD_ACTIVE' next_agent='$AC7_HEAD_NA')"
  FAIL=1
fi

# --- AC-8: .head negative control — points at an UNRELATED task -----------
AC8_READY='[{"id":"ZZ-AC8-WRAP","status":"READY","owner":"pm","next_agent":"pm","children":["ZZ-CHILD-DV"]}]'
base_state "$AC8_READY" '[]' 'ZZ-AC8-UNRELATED' > "$WORK/ac8-state.json"
AC8_OUT=$(run_sweep "$WORK/ac8-state.json" "$WORK/empty-archive.json")
AC8_HEAD_DIFF=$(diff <(jq -S '.head' "$WORK/ac8-state.json") <(echo "$AC8_OUT" | jq -S '.head') || true)
if [ -z "$AC8_HEAD_DIFF" ]; then
  echo "[PASS] AC-8: .head left byte-identical when it pointed at an unrelated task"
else
  echo "[FAIL] AC-8 regression: .head was stomped even though it pointed at an unrelated task"
  FAIL=1
fi

# --- AC-9: in_progress[] source lane is also swept -------------------------
AC9_INPROG='[{"id":"ZZ-AC9-WRAP","status":"IN_PROGRESS","owner":"pm","next_agent":"pm","children":["ZZ-CHILD-DV"]}]'
base_state '[]' "$AC9_INPROG" 'null' > "$WORK/ac9-state.json"
AC9_OUT=$(run_sweep "$WORK/ac9-state.json" "$WORK/empty-archive.json")
AC9_REVIEW_ID=$(echo "$AC9_OUT" | jq -r '.task_board.review[0].id // empty')
AC9_INPROG_LEFT=$(echo "$AC9_OUT" | jq '.task_board.in_progress | length')
if [ "$AC9_REVIEW_ID" = "ZZ-AC9-WRAP" ] && [ "$AC9_INPROG_LEFT" -eq 0 ]; then
  echo "[PASS] AC-9: wrapper in in_progress[] (not just ready[]) is also swept"
else
  echo "[FAIL] AC-9 regression: in_progress[]-source wrapper NOT swept (review_id='$AC9_REVIEW_ID' inprog_left=$AC9_INPROG_LEFT)"
  FAIL=1
fi

# --- IDEMPOTENCY: re-running against AC-1's own output is a no-op ---------
echo "$AC1_OUT" > "$WORK/ac1-second-pass-in.json"
AC1_SECOND=$(run_sweep "$WORK/ac1-second-pass-in.json" "$WORK/ac1-archive.json")
AC1_IDEMPOTENT_DIFF=$(diff <(echo "$AC1_OUT" | jq -S .) <(echo "$AC1_SECOND" | jq -S .) || true)
if [ -z "$AC1_IDEMPOTENT_DIFF" ]; then
  echo "[PASS] IDEMPOTENCY: re-running the sweep against its own output is a no-op"
else
  echo "[FAIL] IDEMPOTENCY regression: second pass mutated an already-swept document"
  FAIL=1
fi

exit $FAIL
