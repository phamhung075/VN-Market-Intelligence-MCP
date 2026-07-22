# scripts/pm-closeout-head-idle.jq
#
# UC-DTL-P9 — atomic sprint-terminal-flip + guarded head-idle for pm's sprint
# closeout (docs/agents/pm/flow/main.md § 5 Monitor). Fixes the recurring bug
# where pm flipped a sprint's terminal status and idled `.head` in TWO
# separate writes, risking a desynced head mid-closeout (a concurrent write
# landing between the two writes could leave `.head` pointed at a task the
# sprint flip just terminated). Root-cause + rescope: architecture brief
# docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
# #dev-team-loop-P9.
#
# Direct structural port of scripts/ops-closegate-handoff.jq's guarded
# head-sync pattern (board write + .head sync in ONE jq expression, one
# orch-apply.sh call) — with NO hardcoded sprint-id or task-id literal
# anywhere in the filter body (grep-verifiable, matching
# devteam-backlog-claim-bounded1.jq's own self-declared invariant). Every
# sprint this script ever touches is supplied entirely via --arg at call
# time.
#
# Inputs (all via --arg, all required):
#   sprint_id — the `.task_board.active_sprints[].id` to close out.
#   now       — ISO-8601 UTC timestamp for any .head fields this run touches.
#
# Behavior, in ONE jq expression (single candidate through orch-apply.sh's
# single-candidate CAS-gated write — see scripts/orch-apply.sh header):
#   1. Locate `.task_board.active_sprints[] | select(.id == $sprint_id)`.
#      If absent -> error() (refuse — gate-guard convention matching
#      scripts/router-d1-claim.jq / scripts/ops-closegate-handoff.jq) — NEVER
#      a silent no-op.
#   2. Set that sprint's `.status = "DONE"` IN PLACE. Do NOT move the row to
#      `closed_sprints[]` or the cold archive here — the existing
#      task-archive sub-flow / orch-cold-evict.sh already evicts terminal
#      active_sprints (predicate: `.status` in TERMINAL_SPRINT_STATUSES —
#      scripts/orch-cold-evict.sh) and owns the only sanctioned
#      ORCH_APPLY_ALLOW_SHRINK call sites (docs/agents/pm/flow/task-archive.md
#      §4). This transform never removes a row or shrinks task_total, so it
#      needs no bypass.
#   3. CONDITIONALLY, in the same expression: idle `.head` (field-wise sets,
#      never a whole-object replace) ONLY IF `.head.active_task_id` is null
#      OR belongs to this sprint's own `.tasks[].id` list. `.head` can
#      legitimately be pointing at a task from a DIFFERENT sprint while this
#      sprint gets closed out — an unconditional `.head =` overwrite would
#      stomp a correct, unrelated pointer (same risk
#      ops-closegate-handoff.jq:61-65 guards against). This script never
#      does that: if head belongs to a different sprint's task, `.head` is
#      left completely untouched.
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg sprint_id "$SPRINT_ID" --arg now "$NOW" \
#     -f scripts/pm-closeout-head-idle.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/pm/flow/main.md § 5 Monitor — Sprint closeout step.

(.head.active_task_id) as $head_task_id
| (.task_board.active_sprints // []) as $sprints
| ($sprints | map(select(.id == $sprint_id)) | .[0]) as $sprint
| if $sprint == null then
    error("pm-closeout-head-idle: sprint_id \($sprint_id) not found in task_board.active_sprints[] — refuse to write (no silent no-op)")
  else . end
| ($sprint.tasks // [] | map(.id)) as $sprint_task_ids
| .task_board.active_sprints = [
    $sprints[] | if .id == $sprint_id then .status = "DONE" else . end
  ]
# $head_task_id is captured from the TOP-LEVEL "." above, BEFORE the pipe into
# $sprint_task_ids's array context — jq function/builtin ARGUMENTS (e.g. the
# arg to index($x)) evaluate against the ambient "." at the call site, so
# inlining ".head.active_task_id" directly inside index(...) here would
# resolve against $sprint_task_ids (an array) instead of the document,
# crashing with "Cannot index array with string \"head\"". Binding it to a
# $-variable up front sidesteps that ambient-dot pitfall entirely.
| if ($head_task_id == null) or ($sprint_task_ids | index($head_task_id) != null) then
    .head.status = "idle"
    | .head.active_task_id = null
    | .head.next_agent = null
    | del(.head.next_action)
    | .head.updated_at = $now
    | .head.updated_by = "pm"
  else . end
