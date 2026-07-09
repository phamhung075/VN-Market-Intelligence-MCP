# scripts/qa-closegate-handoff.jq
#
# Atomic board-row + .head write for the Docker Close Gate Step 5 -> po
# Step 6 handoff (docs/protocols/docker-deployment-runbook.md § Microservice
# Code-Change Close Gate). This is the qa-side counterpart of
# scripts/ops-closegate-handoff.jq — SAME contract, SAME single-jq-expression
# design (board write + .head sync in ONE expression, one orch-apply.sh
# call), generalized (NO hardcoded task-id/lane literal anywhere in the
# filter body — grep-verifiable) so it replaces the one-off hand-rolled
# per-task jq files that previously did this job (e.g.
# scripts/qa-factory-domain-split-cascade-engine-step5.jq,
# scripts/qa-factory-frontend-split-dashboard-analysis-step5.jq — each
# hardcoded its own task id and embedded a full narrative inline; narrative
# belongs in the decision journal, not the board row).
#
# Root cause + design precedent this generalizes:
# docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md §2.1
# (written for ops's Step 4 -> qa handoff; same missing-procedure gap existed
# on the qa Step 5 -> po handoff side, evidenced by the one-off files above).
#
# Inputs (all via --arg, all required):
#   task_id     — the board row's `.id` to forward (e.g. a REVIEW-lane task).
#   from_lane   — the task_board lane the row currently lives in (e.g. "review").
#                 Status is NOT changed — qa does not flip REVIEW/DONE_VERIFIED
#                 (only po may flip to done_verified per the runbook's Step 6);
#                 this script only moves the handoff pointer forward.
#   next_agent  — the agent the row is being forwarded to (e.g. "po").
#   now         — ISO-8601 UTC timestamp for any .head fields this run touches.
#
# Behavior, in ONE jq expression (single candidate through orch-apply.sh's
# single-candidate CAS-gated write — see scripts/orch-apply.sh header):
#   1. Locate `.task_board[$from_lane][] | select(.id == $task_id)`.
#      If absent -> error() (refuse — gate-guard convention matching
#      scripts/router-d1-claim.jq / scripts/ops-closegate-handoff.jq) —
#      NEVER a silent no-op.
#   2. Set that row's `.next_agent = $next_agent` only. Row status/lane
#      untouched.
#   3. CONDITIONALLY, in the same expression: sync `.head.next_agent` /
#      `.head.updated_at` / `.head.updated_by` ONLY IF
#      `.head.active_task_id == $task_id`. `.head` can legitimately be
#      parked on a DIFFERENT in-flight task while this task's board row gets
#      forwarded — a blind/unconditional `.head =` overwrite would stomp a
#      correct, unrelated pointer. This script never does that.
#
# Narrative (what was verified, evidence, findings) belongs in the qa
# decision-journal entry (`.claude/skills/decision-journal/SKILL.md`), NOT
# inline in this jq file or in the board row — keeps this script identical
# across every future qa Step-5 handoff, no per-task edits required.
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg task_id "$TASK_ID" --arg from_lane "review" --arg next_agent "po" --arg now "$NOW" \
#     -f scripts/qa-closegate-handoff.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/protocols/docker-deployment-runbook.md § Microservice
# Code-Change Close Gate, Step 5 (qa -> po forward).

(.task_board[$from_lane] // []) as $lane
| ($lane | map(select(.id == $task_id)) | .[0]) as $row
| if $row == null then
    error("qa-closegate-handoff: task_id \($task_id) not found in task_board.\($from_lane)[] — refuse to write (no silent no-op)")
  else . end
| .task_board[$from_lane] = [
    $lane[] | if .id == $task_id then . + { next_agent: $next_agent } else . end
  ]
| if .head.active_task_id == $task_id then
    .head.next_agent = $next_agent
    | .head.updated_at = $now
    | .head.updated_by = "qa"
  else . end
