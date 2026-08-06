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
#
# FIX-DEVTEAM-BOUNDED1-CLAIM-NO-OWN-WIP-RECHECK (2026-08-06): this file used
# to state, as if it were a load-bearing invariant, "under the BOUNDED-1 gate
# (promote only fires when WIP==0, i.e. ready[] was already empty) there is
# at most one such row." That is FALSE on the live board — a stamped row can
# outlive the tick that promoted it (any evictor that returns a promoted-
# but-unclaimed row to ready[] without clearing promoted_by; ALSO possible
# when promote legitimately fires in two separate WIP==0 windows before
# either stamped row gets claimed) — and this script never itself measured
# WIP, it only ever trusted the stamp as a proxy for it. LIVE-MEASURED
# 2026-08-06T18:21Z: TWO stamped rows co-resident in ready[] at once (P2
# FIX-JANITOR-HEALTHRECHECK-IDEMPOTENCY-GUARD-MISSES-PROCESSED-DIR at a
# LOWER array index, P1 FIX-NEWSVPS-OVERNIGHT-PUSH-OUTAGE-663M-SILENT at a
# HIGHER one) — `$auto_promoted[0]` picked the P2 over its own P1 sibling
# AND over 21 P0 rows waiting elsewhere in ready[], AND would have re-claimed
# regardless of whatever else already held the WIP slot. Fixed by:
#   (a) re-checking this script's OWN WIP budget via the SAME shared
#       `wip_in_progress` def every other picker in this chain already
#       trusts (scripts/lib/devteam-eligibility.jq) — no-op whenever
#       WIP >= 1, independent of how many stamps sit in ready[];
#   (b) sorting every stamped candidate by [priority_rank, idx] (same
#       shared `priority_rank` def + original-index FIFO tiebreak
#       convention promote-bounded1.jq already uses) instead of trusting
#       raw array order;
#   (c) STALE-STAMP DRAIN: when a claim fires with 2+ stamped candidates,
#       every non-selected candidate's `promoted_by` is cleared (set null,
#       with an audit stamp) in the SAME write. Chosen over the alternative
#       ("promote refuses to stamp a 2nd row while any stamp is
#       outstanding") because promote's own WIP==0 gate already prevents it
#       from ever INTENTIONALLY creating a 2nd live stamp in one tick — the
#       only way a 2nd stamp appears is external to promote, so the fix
#       belongs on this read side, not on promote's write side (which
#       already behaves correctly). Clearing the stamp does not move or
#       otherwise touch the row: it falls through to the Ready-Lane
#       Consumer (or PO triage) exactly like any other un-stamped ready[]
#       row with a resolved next_agent — scripts/devteam-backlog-claim-
#       ready-lane-consumer.jq never keys on promoted_by at all.
#
# next_agent: uses the promoted row's own `.next_agent` field if the backlog
# row already carried one (~30/351 eligible rows do, per PO/architect
# pre-triage); otherwise falls back to "developer" — the same Tier-3 generic
# fallback `.claude/skills/zone-detect/SKILL.md` uses. This is a placeholder
# only: Step 3 (execute-tier.md) re-resolves the real zone specialist from
# the task's own `zone`/`files` fields via the zone-detect skill — head.next_agent
# here is informational/dispatch-log only, not the final routing authority.
#
# If ready[] has no bounded-1-stamped row, OR this script's OWN WIP budget
# is already saturated (wip_in_progress >= 1 — regardless of how many
# stamped rows sit in ready[]), this script is a NO-OP (outputs the input
# document unchanged) — safe to re-run every tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root — see scripts/lib/devteam-eligibility.jq
# header for why the `include` path below depends on that):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/devteam-backlog-claim-bounded1.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Idle-capacity backlog pickup
# (BOUNDED-1), inserted at the head-idle fall-through before Step 1 PO triage.

include "scripts/lib/devteam-eligibility";

( [ .task_board.ready
    | to_entries[]
    | select(.value.promoted_by == "dev-team (bounded-1 auto-pickup)")
    | { idx: .key, row: .value, rank: (.value | priority_rank) }
  ] | sort_by([.rank, .idx])
) as $auto_promoted
| if (wip_in_progress >= 1) then
    .   # AC-1: this script's OWN WIP budget is already saturated — a stale
        # promoted_by stamp must never bypass this, regardless of how many
        # stamped rows sit in ready[].
  elif ($auto_promoted | length) == 0 then
    .   # nothing bounded-1-promoted is waiting in ready[] — no-op
  else
    ($auto_promoted[0]) as $picked
    | ($picked.row.id) as $picked_id
    | ($picked.row.next_agent // "developer") as $next_agent
    | ([ $auto_promoted[] | select(.idx != $picked.idx) | .idx ]) as $stale_idxs
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        ($picked.row + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: "dev-team (bounded-1 auto-pickup)"
          })
      ])
    | .task_board.ready = [
        .task_board.ready | to_entries[]
        | select(.key != $picked.idx)
        | .key as $k | .value as $v
        | if ($stale_idxs | index($k)) != null then
            $v + {
              promoted_by: null,   # AC-3: stale-stamp drain — see header
              bounded1_stale_stamp_cleared_at: $now,
              bounded1_stale_stamp_cleared_by: "dev-team (bounded-1 auto-pickup)"
            }
          else
            $v
          end
      ]
    | ((.head.status // "idle") as $hs
       | (.head.active_task_id // null) as $ha
       | ($hs == "idle" or $hs == "done" or $ha == null)) as $head_free
    | .head = (
        if $head_free then
          {
            status: "in_progress",
            active_task_id: $picked_id,
            next_agent: $next_agent,
            next_action: ("BOUNDED-1 auto-pickup claim of " + $picked_id
              + " — dispatcher-wrap then JUMP TO execute; zone-detect skill resolves the final specialist from the task's zone/files."),
            updated_at: $now,
            updated_by: "dev-team (bounded-1 auto-pickup)"
          }
        else
          .head   # FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-OVERWRITE
                  # (PO ratification, ruling-20260730T0906Z-po-triage-po.md
                  # STEP po-4): a DIFFERENT task is genuinely live in .head
                  # (status in_progress, active_task_id set) — never clobber
                  # it. Mirrors scripts/devteam-wrapper-autoclose.jq:122-128
                  # and scripts/devteam-backlog-claim-design-router-sweep.jq's
                  # own conditional guard, applied to the claim-INTO-head
                  # direction instead of clear-FROM-head.
        end
      )
  end
