# scripts/devteam-backlog-claim-supervised-lane-sweep.jq
#
# FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (architect, 2026-07-21). Companion
# to scripts/devteam-backlog-promote-supervised-lane-sweep.jq (run AFTER it,
# as a SEPARATE orch-apply.sh write — same two-small-atomic-writes pattern
# BOUNDED-1 uses for its own promote/claim split).
#
# Claims whichever row in ready[] was stamped by the supervised-lane-sweep
# promote script (promoted_by == "dev-team (supervised-lane sweep)"), never a
# pre-existing human/PO/router-placed ready[] row and never a BOUNDED-1-
# auto-pickup row (disjoint marker string). At most one such row exists per
# tick under the promote script's own one-row-per-invocation discipline.
#
# UNLIKE devteam-backlog-claim-bounded1.jq: sets head.next_agent to the
# picked row's own `dispatch_lane` field DIRECTLY — never a generic
# "developer" fallback-of-last-resort — because the promote script already
# resolved the real specialist (effective_next_agent / effective_owner /
# "developer"-if-truly-unowned) before this row was ever stamped into
# ready[]. This is deliberate: BOUNDED-1's claimed rows still need Step 3's
# zone-detect skill to resolve the specialist from zone/files (zone-detect
# has NO path to non-dev-* specialists — see the "NON-CODE / DESIGN row
# next_agent gap" note in docs/agents/dev-team/flow/main.md). A
# supervised-lane-sweep row is frequently non-dev-owned by construction (that
# is exactly why it was gated out of BOUNDED-1 in the first place), so
# routing it back through zone-detect's dev-only Tier-3 fallback would
# silently reroute it to "developer" and lose the resolved lane. The caller
# (dev-team/flow/main.md § Supervised-Lane Sweep) therefore does NOT "JUMP TO
# execute" (which goes through execute-tier.md's zone-detect) — it spawns
# `head.next_agent` directly, mirroring the S2 pipeline-resume dispatcher-wrap
# pattern (docs/agents/dev-team/flow/main.md § Step 0b) and the S4 UNBLOCK
# dispatch block, both of which already spawn-by-resolved-name with no
# zone-detect indirection.
#
# If ready[] has no supervised-lane-sweep-stamped row (nothing to claim —
# promote was a no-op, or this is re-run after a prior claim already
# consumed it) this script is a NO-OP (outputs the input document unchanged)
# — safe to re-run every tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Supervised-Lane Sweep (SLS).

( [ (.task_board.ready // [])[]
    | select(.promoted_by == "dev-team (supervised-lane sweep)")
  ]
) as $swept
| if ($swept | length) == 0 then
    .   # nothing supervised-lane-sweep-promoted is waiting in ready[] — no-op
  else
    ($swept[0]) as $picked
    | ($picked.id) as $picked_id
    | ($picked.dispatch_lane) as $lane
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        ($picked + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: "dev-team (supervised-lane sweep)"
          })
      ])
    | .task_board.ready = [ (.task_board.ready // [])[] | select(.id != $picked_id) ]
    | .head = {
        status: "in_progress",
        active_task_id: $picked_id,
        next_agent: $lane,
        next_action: ("Supervised-Lane Sweep claim of " + $picked_id
          + " — spawn " + $lane + " DIRECTLY (no zone-detect indirection; lane already resolved at promote time). supervised/plan_only preserved — do not clear."),
        updated_at: $now,
        updated_by: "dev-team (supervised-lane sweep)"
      }
  end
