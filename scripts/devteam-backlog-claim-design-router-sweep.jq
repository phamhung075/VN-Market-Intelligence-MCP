# scripts/devteam-backlog-claim-design-router-sweep.jq
#
# FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE (architect brief
# 2026-07-29, PO-ratified 2026-07-30 —
# docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md STEP
# po-4). Companion to scripts/devteam-backlog-promote-design-router-sweep.jq
# (run AFTER it, as a SEPARATE orch-apply.sh write — same two-small-atomic-
# writes pattern BOUNDED-1/SLS use for their own promote/claim split).
#
# Claims whichever row in ready[] was stamped by the design-router-sweep
# promote script (promoted_by == "dev-team (design-router sweep)"), never a
# pre-existing human/PO/router-placed ready[] row and never a BOUNDED-1- or
# SLS-stamped row (disjoint marker string). At most one such row exists per
# tick under the promote script's own one-row-per-invocation discipline.
#
# UNLIKE BOUNDED-1's claim script: sets `.head.next_agent` to the picked
# row's own `dispatch_lane` field DIRECTLY — never a generic "developer"
# fallback — because the promote script already resolved the real
# specialist (`effective_next_agent`, ratified-allowlist-checked) before this
# row was ever stamped into `ready[]`. Same rationale as SLS/RLC's own claim
# scripts: zone-detect's Tier-3 fallback only ever resolves `dev-<service>`/
# `developer` and would silently discard the already-resolved non-dev lane.
# The caller (dev-team/flow/main.md § Design-Router Sweep) therefore does
# NOT "JUMP TO execute" — it spawns `head.next_agent` DIRECTLY.
#
# `.head` WRITE SAFETY — MANDATORY CONDITIONAL GUARD (brief §2.5, PO
# ratification Q3, hard AC, never relaxed to an unconditional replace):
# DRS's placement (same head-idle fall-through as SLS/RLC, reached only when
# nothing upstream claimed this tick) makes an unconditional `.head` replace
# THEORETICALLY safe by the same control-flow argument SLS/RLC's own headers
# make ("`.head` is still idle whenever this block runs"). That exact
# argument was proven FRAGILE, live, on a sibling lane in this same codebase
# THIS CYCLE: `scripts/devteam-review-claim-qa-drain.jq`'s unconditional
# `.head` overwrite was safe under its ORIGINAL placement assumption until a
# filed remedy proposed widening QA-Drain's reachability (running it
# independent of the head-idle gate) — PO's live dry-run then showed it
# would have silently clobbered a genuinely-running task's resume pointer
# (docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md §2).
# "Theoretically safe by current placement" is NOT a durable invariant in
# this flow-doc. DRS therefore uses the SAME conditional-guard shape from
# day one (mirrors scripts/devteam-wrapper-autoclose.jq:122-128's
# clear-direction guard, applied in the claim/write-INTO-head direction,
# exactly as the qadrain sibling brief's own §3 Part-1 fix does) — cost at
# the current (day-1, fixed-chain) call site is zero (`$head_free` is always
# true there, identical to the qadrain brief's own finding for its call
# site); the payoff is that DRS is safe-by-construction if a future task
# ever widens its reachability, instead of requiring a second emergency
# SPIKE the way QA-Drain needed one. NOTE (brief §3, NOT this task's scope):
# the same unconditional-`.head`-overwrite pattern was ALSO found live in
# scripts/devteam-backlog-claim-bounded1.jq:57,
# scripts/devteam-backlog-claim-supervised-lane-sweep.jq:66, and
# scripts/devteam-backlog-claim-ready-lane-consumer.jq:151 — PO ratified
# minting a SEPARATE hardening row for those three
# (FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-OVERWRITE, already landed in
# `.task_board.backlog[]` this cycle) rather than folding that retrofit into
# this task. This file does not touch those three scripts.
#
# If ready[] has no design-router-sweep-stamped row (nothing to claim —
# promote was a no-op, or this is re-run after a prior claim already
# consumed it) this script is a NO-OP (outputs the input document unchanged)
# — safe to re-run every tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/devteam-backlog-claim-design-router-sweep.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Design-Router Sweep (DRS).

( [ (.task_board.ready // [])[]
    | select(.promoted_by == "dev-team (design-router sweep)")
  ]
) as $swept
| if ($swept | length) == 0 then
    .   # nothing design-router-sweep-promoted is waiting in ready[] — no-op
  else
    ($swept[0]) as $picked
    | ($picked.id) as $picked_id
    | ($picked.dispatch_lane) as $lane
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        ($picked + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: "dev-team (design-router sweep)"
          })
      ])
    | .task_board.ready = [ (.task_board.ready // [])[] | select(.id != $picked_id) ]
    | ((.head.status // "idle") as $hs
       | (.head.active_task_id // null) as $ha
       | ($hs == "idle" or $hs == "done" or $ha == null)) as $head_free
    | .head = (
        if $head_free then
          {
            status: "in_progress",
            active_task_id: $picked_id,
            next_agent: $lane,
            next_action: ("Design-Router Sweep claim of " + $picked_id
              + " — spawn " + $lane + " DIRECTLY (no zone-detect indirection; lane already resolved at promote time). supervised/plan_only (if either was set) preserved — do not clear."),
            updated_at: $now,
            updated_by: "dev-team (design-router sweep)"
          }
        else
          .head   # FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE
                  # (§2.5 mandatory guard): a DIFFERENT task is genuinely live
                  # in .head (status in_progress, active_task_id set) — never
                  # clobber it. Mirrors
                  # scripts/devteam-wrapper-autoclose.jq:122-128's own
                  # conditional guard, applied to the claim-INTO-head
                  # direction instead of clear-FROM-head. At the current
                  # (day-1, fixed-chain) call site this branch is provably
                  # unreachable (control flow guarantees .head is idle
                  # whenever this block runs) — kept anyway, per the
                  # ratification's hard AC and the qadrain sibling
                  # precedent's own finding that "provably unreachable today"
                  # is not durable across future reachability changes.
        end
      )
  end
