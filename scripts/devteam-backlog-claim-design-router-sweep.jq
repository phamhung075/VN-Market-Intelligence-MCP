# scripts/devteam-backlog-claim-design-router-sweep.jq
#
# FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE (architect brief
# 2026-07-29, PO-ratified 2026-07-30 —
# docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md STEP
# po-4). Companion to scripts/devteam-backlog-promote-design-router-sweep.jq
# (run AFTER it, as a SEPARATE orch-apply.sh write — same two-small-atomic-
# writes pattern BOUNDED-1/SLS use for their own promote/claim split).
#
# Claims whichever row(s) in ready[] were stamped by the design-router-sweep
# promote script (promoted_by == "dev-team (design-router sweep)"), never a
# pre-existing human/PO/router-placed ready[] row and never a BOUNDED-1- or
# SLS-stamped row (disjoint marker string).
#
# FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT
# (2026-08-26; PO triage scope-widen 2026-08-23T17:37Z bug-escalation
# 24514c8c; escalated P1->P0 on a live incident 2026-08-25T20:56Z). This
# script used to bind `($picked.dispatch_lane) as $lane` — the CACHED value
# the promote script stamped at PROMOTE time — with NO re-resolution and NO
# null-guard, then wrote it verbatim into `.head.next_agent`. Two
# independent live failure modes, both root-caused by treating a
# promote-time cache as a claim-time truth:
#   (a) STALE-BUT-NON-NULL: a row's real destination (board `next_agent` or
#       its detail_ref counterpart) can change AFTER promote time (a
#       router/PO/architect correction); the cached `dispatch_lane` never
#       re-reads it, so the claim silently dispatches to the specialist
#       named AT PROMOTE TIME even when a different one is now
#       authoritative — a SILENT misroute (schema-valid head, so nothing
#       fails loudly; no downstream gate can detect it). LIVE EVIDENCE:
#       FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING (dispatch_lane='ba'
#       stamped before ba_completed_at, claimed to ba, router hand-corrected
#       to architect) and UC-CDC-P1 (same shape, commit 0f20cfd61).
#   (b) NULL: a row can reach ready[] DRS-stamped with `dispatch_lane` unset.
#       LIVE-CONFIRMED 2026-08-25T20:56Z:
#       FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE (an
#       11-day-old stamp, `dispatch_lane:null`) made the unguarded read write
#       `.head.next_agent = null` — an unspawnable head, a state this flow's
#       own prose asserts cannot occur ("never a `developer` fallback" — i.e.
#       never null either). Rolled back same tick; no agent was spawned from
#       the undefined state.
#
# FIX: never read `.dispatch_lane` for the routing decision. Resolve
# `next_agent` via `effective_next_agent($detail_items)` — the SAME shared
# resolution function scripts/devteam-backlog-claim-ready-lane-consumer.jq
# already calls fresh at ITS OWN claim time (scripts/lib/
# devteam-eligibility.jq) — at CLAIM time, not promote time, for EVERY
# stamped candidate. `dispatch_lane` is still WRITTEN onto the claimed row
# (informational/audit value only — no script in this chain reads it back
# for routing), always set to THIS claim's own fresh resolution, never
# copied forward from the stale cache.
#
# REFUSE-NOT-NULL (AC-3): if a candidate's claim-time
# `effective_next_agent($detail_items)` ALSO resolves empty (both board and
# detail_ref `next_agent` absent/empty — a row that should never have been
# DRS-stamped in the first place, since `is_design_router_eligible` REQUIRES
# `is_non_dev_next_agent_unrouted`, which itself requires a present
# `effective_next_agent`; this guard is defense-in-depth against a stamp
# that went stale/corrupted between promote and claim, not a happy-path
# case), that candidate is SKIPPED — never written into `.head.next_agent`
# as null. The next priority-ranked stamped candidate (see ordering fix
# below) is tried instead; this script no-ops entirely (claims nothing this
# tick) only if EVERY stamped candidate fails to resolve.
#
# ORDERING FIX (second, separable defect, surfaced by the SAME
# 2026-08-25T20:56Z incident's live audit; folded into this same commit as a
# small change to the SAME selection expression rather than filed as a new
# row): the pre-fix selector took `$swept[0]` — the FIRST DRS-stamped
# ready[] row in raw ARRAY order (insertion order), with NO priority sort.
# LIVE-CONFIRMED: an 11-day-old P1 stamp
# (FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE) sat ahead,
# in array order, of a P0 promoted the SAME tick
# (FIX-JOURNALGUARD-ALERT-TRANSPORT-RUNS-ON-THE-PLANE-IT-MONITORS) — the
# stale P1 won every turn and the fresh P0 starved indefinitely (still
# unclaimed in ready[] as of this fix). Candidates are now sorted by
# `[priority_rank, idx]` — the identical FIFO-proxy tiebreak convention
# scripts/devteam-backlog-claim-bounded1.jq already uses for its own
# analogous multi-stamp accumulation fix
# (FIX-DEVTEAM-BOUNDED1-CLAIM-NO-OWN-WIP-RECHECK). UNLIKE that script, this
# one does NOT also add a stale-stamp-drain pass (clearing `promoted_by` on
# non-selected candidates) — DRS's promote script only ever stamps ONE row
# per invocation and pairs with claim in the SAME tick under the "two small
# atomic writes" discipline, so multi-stamp accumulation here requires a
# claim-side failure/skip to persist across ticks (rarer than BOUNDED-1's
# every-tick-promote-without-guaranteed-claim shape). If live evidence of
# repeat accumulation appears, add the drain pass then — not speculatively
# here.
#
# UNLIKE BOUNDED-1's claim script: sets `.head.next_agent` to a resolved
# specialist DIRECTLY — never a generic "developer" fallback — because the
# real specialist is resolved (effective_next_agent, ratified-allowlist-
# checked at promote time, RE-resolved at claim time by this script) rather
# than left to Step 3's zone-detect skill, which has no path to non-dev-*
# specialists. Same rationale as SLS/RLC's own claim scripts.
#
# `.head` WRITE SAFETY — MANDATORY CONDITIONAL GUARD (brief §2.5, PO
# ratification Q3, hard AC, never relaxed to an unconditional replace):
# DRS's placement (same head-idle fall-through as SLS/RLC, reached only when
# nothing upstream claimed this tick) makes an unconditional `.head` replace
# THEORETICALLY safe by the same control-flow argument SLS/RLC's own headers
# make ("`.head` is still idle whenever this block runs"). That exact
# argument was proven FRAGILE, live, on a sibling lane in this same codebase
# (scripts/devteam-review-claim-qa-drain.jq's unconditional `.head` overwrite
# — see docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md
# §2). "Theoretically safe by current placement" is NOT a durable invariant
# in this flow-doc. DRS therefore uses the SAME conditional-guard shape from
# day one (mirrors scripts/devteam-wrapper-autoclose.jq:122-128's
# clear-direction guard, applied in the claim/write-INTO-head direction).
#
# If ready[] has no design-router-sweep-stamped row (nothing to claim —
# promote was a no-op, or this is re-run after a prior claim already
# consumed it), or every stamped candidate refuses (AC-3 above), this script
# is a NO-OP (outputs the input document unchanged) — safe to re-run every
# tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     -f scripts/devteam-backlog-claim-design-router-sweep.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Acceptance / regression: scripts/audits/devteam-dispatch-gate-satisfiability.sh
# § Design-Router Sweep (DRS) claim — AC-DRS-CLAIMTIME-RESOLVE (stale cache
# superseded by a later next_agent), AC-DRS-NULL-LANE-REFUSE (dispatch_lane
# null never yields head.next_agent=null), AC-DRS-PRIORITY-ORDER (a fresh P0
# stamp outranks an older stamp regardless of array position).
#
# Pointer: docs/agents/dev-team/flow/main.md § Design-Router Sweep (DRS).

include "scripts/lib/devteam-eligibility";

(detail_items_from($detail)) as $detail_items
| ( [ (.task_board.ready // []) | to_entries[]
      | select(.value.promoted_by == "dev-team (design-router sweep)")
      | { idx: .key, row: .value, rank: (.value | priority_rank),
          lane: (.value | effective_next_agent($detail_items)) }
    ] | sort_by([.rank, .idx])
  ) as $swept
| ( [ $swept[] | select((.lane | length) > 0) ] ) as $resolvable
| if ($resolvable | length) == 0 then
    .   # nothing design-router-sweep-promoted is waiting in ready[], OR
        # every stamped candidate's claim-time effective_next_agent resolves
        # empty (AC-3 refuse) — no-op either way, never a partial/null write
  else
    ($resolvable[0]) as $picked
    | ($picked.row.id) as $picked_id
    | ($picked.lane) as $lane
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        ($picked.row + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: "dev-team (design-router sweep)",
            dispatch_lane: $lane
              # FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT:
              # this is the CLAIM-TIME effective_next_agent() resolution,
              # never a copy-forward of the (possibly stale/null)
              # promote-time cache. Informational/audit field only — no
              # downstream script in this chain reads it back for routing.
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
              + " — spawn " + $lane + " DIRECTLY (no zone-detect indirection; lane resolved at CLAIM time via effective_next_agent(), never a cached promote-time value). supervised/plan_only (if either was set) preserved — do not clear."),
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
