#!/usr/bin/env bash
# scripts/audits/execute-tier-branchnull-review-headidle-verify.sh
#
# Regression verifier for FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE.
#
# execute-tier.md § MUST — Status-Flip = Lane-Move (CANONICAL:SSOT-STATUSFLIP-LANEMOVE)
# clause (b) is LLM-interpreted prose, not a single code-enforced call site (every
# in_progress->review flip is hand-written jq by whichever agent — pm/developer/qa/
# fixer — performs it that tick; confirmed by grep: scripts/*-review.jq has 40+
# distinct one-off flip scripts, no shared helper). This script cannot regression-test
# real agent compliance; it proves the documented pattern ITSELF is sound by replaying
# the exact live incident (commit 38f081ec1, task UC-GCP-P1) against SYNTHETIC fixtures:
#   1. OLD (pre-fix, ambiguous "mirror task status") pattern -> reproduces the bug:
#      .head.status ends up "review" (an un-handled dispatch-lane value).
#   2. NEW (this clause's branch:null sub-rule) pattern -> .head.status = "idle".
# Touches NO live file — synthetic fixtures only, no docs/data/orch/orch-state.json I/O.
#
# Usage: bash scripts/audits/execute-tier-branchnull-review-headidle-verify.sh

set -euo pipefail

FIXTURE=$(mktemp)
trap 'rm -f "$FIXTURE"' EXIT

# Synthetic fixture — shape mirrors the live UC-GCP-P1 incident: a branch:null task
# is `.head.active_task_id`, mid-flip from in_progress[] -> review[].
cat > "$FIXTURE" <<'JSON'
{
  "head": {
    "status": "in_progress",
    "active_task_id": "SYNTH-BRANCHNULL-1",
    "next_agent": "developer",
    "updated_at": "2026-07-23T06:31:33Z",
    "updated_by": "developer"
  },
  "task_board": {
    "in_progress": [
      { "id": "SYNTH-BRANCHNULL-1", "status": "IN_PROGRESS", "branch": null, "next_agent": "qa" }
    ],
    "review": []
  }
}
JSON

now="2026-07-23T06:37:31Z"

# --- 1. OLD ambiguous pattern: "sync head to the next legitimate active_task_id/next_agent"
#     misread as "mirror the flipped task's own new status onto head.status" ---
old_result=$(jq --arg now "$now" '
  (.task_board.in_progress | map(select(.id == "SYNTH-BRANCHNULL-1")) | .[0]) as $t
  | .task_board.in_progress = [.task_board.in_progress[] | select(.id != "SYNTH-BRANCHNULL-1")]
  | .task_board.review += [ $t + {status: "REVIEW"} ]
  | .head.status         = "review"
  | .head.active_task_id = "SYNTH-BRANCHNULL-1"
  | .head.next_agent     = "qa"
  | .head.updated_at     = $now
' "$FIXTURE")
old_head_status=$(printf '%s' "$old_result" | jq -r '.head.status')

# --- 2. NEW pattern per execute-tier.md § MUST (b) branch:null sub-rule ---
new_result=$(jq --arg now "$now" '
  (.task_board.in_progress | map(select(.id == "SYNTH-BRANCHNULL-1")) | .[0]) as $t
  | .task_board.in_progress = [.task_board.in_progress[] | select(.id != "SYNTH-BRANCHNULL-1")]
  | .task_board.review += [ $t + {status: "REVIEW"} ]
  | .head.status         = "idle"
  | .head.active_task_id = null
  | .head.next_agent     = "router"
  | .head.updated_at     = $now
' "$FIXTURE")
new_head_status=$(printf '%s' "$new_result" | jq -r '.head.status')
new_active_task=$(printf '%s' "$new_result" | jq -r '.head.active_task_id')
new_next_agent=$(printf '%s' "$new_result" | jq -r '.head.next_agent')
review_len=$(printf '%s' "$new_result" | jq '.task_board.review | length')
inprog_len=$(printf '%s' "$new_result" | jq '.task_board.in_progress | length')

fail=0

if [ "$old_head_status" != "review" ]; then
  echo "UNEXPECTED: old-pattern reproduction did not yield head.status=review (got: $old_head_status) — incident no longer reproducible as documented" >&2
  fail=1
else
  echo "[OK] OLD ambiguous pattern reproduces the live bug: head.status=\"$old_head_status\" — matches neither dev-team/main.md's in_progress branch nor its idle/done fall-through (docs/standards/orch-state-access.md §5 lists \"review\" as a VALID but un-routed head.status value)."
fi

if [ "$new_head_status" != "idle" ] || [ "$new_active_task" != "null" ] || [ "$new_next_agent" != "router" ]; then
  echo "FAIL: new pattern did not yield the idle terminal head state (status=$new_head_status active_task_id=$new_active_task next_agent=$new_next_agent)" >&2
  fail=1
else
  echo "[OK] NEW pattern (execute-tier.md § MUST (b) branch:null sub-rule) yields head={status:idle, active_task_id:null, next_agent:router} — reachable by dev-team/main.md's idle-fallthrough (BOUNDED-1 -> SLS -> RLC -> QA-Drain)."
fi

if [ "$review_len" != "1" ] || [ "$inprog_len" != "0" ]; then
  echo "FAIL: lane-move (a) not satisfied in the new-pattern result (review[]=$review_len in_progress[]=$inprog_len, want 1/0)" >&2
  fail=1
else
  echo "[OK] Lane-move (a) satisfied alongside head-sync (b): in_progress[]=$inprog_len, review[]=$review_len."
fi

if [ "$fail" -eq 0 ]; then
  echo "PASS: branch:null REVIEW flip head-idle guarantee holds for the documented pattern."
  exit 0
else
  echo "FAIL: see above."
  exit 1
fi
