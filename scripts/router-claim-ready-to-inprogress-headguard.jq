# Variant of scripts/router-claim-ready-to-inprogress.jq for dispatching a SECOND (or later)
# ready[] row in the SAME tick as one already claimed by the plain (head-clobbering) version.
# .head is single-slot (schema v4) — running the plain script twice in one tick overwrites the
# first claim's .head pointer with the second, the exact live bug documented in
# scripts/devteam-claim-backlog-task-by-id.jq's header (2026-07-07T17:43Z, CI-RED head pointer
# clobbered by DATA-BACKFILL-PRICES-20260706-MONDAY-GAP). This variant only writes .head when it
# is still idle/missing; task_board.in_progress[] (not .head) remains the real WIP source of
# truth per that same script's documented invariant, so a second parallel-safe claim losing the
# .head pointer costs nothing.
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   jq --arg taskid "<ID>" --arg agent "<dev-zone>" --arg now "$NOW" --arg note "<dispatch note>" \
#      -f scripts/router-claim-ready-to-inprogress-headguard.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

(.task_board.ready | map(select((.id // .task_id) == $taskid))[0]) as $t
| if $t == null then error("\($taskid) not in ready[] — refuse to claim")
  else . end
| .task_board.in_progress += [
    ($t + {
        status: "IN_PROGRESS",
        owner: $agent,
        next_agent: $agent,
        claimed_at: $now,
        claimed_by: "router",
        dispatch_note: $note
      })
  ]
| .task_board.ready |= map(select((.id // .task_id) != $taskid))
| if ((.head.status // "idle") == "idle") then
    .head = {
      status: "in_progress",
      updated_at: $now,
      updated_by: "dev-team",
      active_task_id: $taskid,
      next_agent: $agent,
      note: $note
    }
  else
    .   # head already points at a different live in_progress task (this tick's first claim) — do NOT clobber
  end
| ._updated_at = $now
| ._updated_by = "dev-team"
