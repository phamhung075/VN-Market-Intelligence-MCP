# scripts/devteam-backlog-claim-bounded1.jq
#
# SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1 — generalized ready->in_progress
# claim for the dev-team autonomous idle-capacity pickup step. Companion to
# scripts/devteam-backlog-promote-bounded1.jq (run AFTER it, as a SEPARATE
# orch-apply.sh write — two small atomic writes, same pattern as the existing
# po-s108 promote / router-d1-claim split).
#
# Generalizes router-d1-claim.jq's ready[]->in_progress[] + .head set, but
# with NO hardcoded task ID: it claims whichever row in ready[] was stamped
# by the bounded-1 promote script (promoted_by == "dev-team (bounded-1
# auto-pickup)"), never a pre-existing human/PO/router-placed ready[] row.
# Under the BOUNDED-1 gate (promote only fires when WIP==0, i.e. ready[] was
# already empty) there is at most one such row.
#
# next_agent: uses the promoted row's own `.next_agent` field if the backlog
# row already carried one (~30/351 eligible rows do, per PO/architect
# pre-triage); otherwise falls back to "developer" — the same Tier-3 generic
# fallback `.claude/skills/zone-detect/SKILL.md` uses. This is a placeholder
# only: Step 3 (execute-tier.md) re-resolves the real zone specialist from
# the task's own `zone`/`files` fields via the zone-detect skill — head.next_agent
# here is informational/dispatch-log only, not the final routing authority.
#
# If ready[] has no bounded-1-stamped row (nothing to claim, e.g. promote was
# a no-op because WIP>=1, or this is re-run after a prior claim already
# consumed it) this script is a NO-OP (outputs the input document unchanged)
# — safe to re-run every tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Idle-capacity backlog pickup
# (BOUNDED-1), inserted at the head-idle fall-through before Step 1 PO triage.

( [ (.task_board.ready // [])[]
    | select(.promoted_by == "dev-team (bounded-1 auto-pickup)")
  ]
) as $auto_promoted
| if ($auto_promoted | length) == 0 then
    .   # nothing bounded-1-promoted is waiting in ready[] — no-op
  else
    ($auto_promoted[0]) as $picked
    | ($picked.id) as $picked_id
    | ($picked.next_agent // "developer") as $next_agent
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        ($picked + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: "dev-team (bounded-1 auto-pickup)"
          })
      ])
    | .task_board.ready = [ (.task_board.ready // [])[] | select(.id != $picked_id) ]
    | .head = {
        status: "in_progress",
        active_task_id: $picked_id,
        next_agent: $next_agent,
        next_action: ("BOUNDED-1 auto-pickup claim of " + $picked_id
          + " — dispatcher-wrap then JUMP TO execute; zone-detect skill resolves the final specialist from the task's zone/files."),
        updated_at: $now,
        updated_by: "dev-team (bounded-1 auto-pickup)"
      }
  end
