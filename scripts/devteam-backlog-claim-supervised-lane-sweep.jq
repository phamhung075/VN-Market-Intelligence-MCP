# scripts/devteam-backlog-claim-supervised-lane-sweep.jq
#
# FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (architect, 2026-07-21). Companion
# to scripts/devteam-backlog-promote-supervised-lane-sweep.jq (run AFTER it,
# as a SEPARATE orch-apply.sh write — same two-small-atomic-writes pattern
# BOUNDED-1 uses for its own promote/claim split).
#
# Claims from TWO candidate sets, in priority order (FIX-DEVTEAM-READY-
# REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER, 2026-07-30 — see below for why
# a second set was added):
#
#   (a) PRIMARY — whichever row in ready[] was stamped by the
#       supervised-lane-sweep promote script (promoted_by ==
#       "dev-team (supervised-lane sweep)"), never a pre-existing human/PO/
#       router-placed ready[] row and never a BOUNDED-1- or DRS-auto-pickup
#       row (disjoint marker strings). Ordinarily at most one such row exists
#       per tick under the promote script's own one-row-per-invocation
#       discipline; if more than one is ever co-resident (a claim-side
#       refuse/skip persisting a stamp across ticks), candidates are ranked
#       by `[priority_rank, idx]` and only a candidate whose claim-time
#       `effective_next_agent($detail_items)` resolves non-empty is eligible
#       — see FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-
#       AGENT (2026-08-26) below for why lane resolution is no longer a
#       promote-time cache read.
#
#   (b) FALLBACK (NEW, reached only when (a) finds nothing this tick) — a
#       ready[] row that is effective_supervised AND effective_plan_only
#       (the identical doubly-gated predicate the promote script uses, no
#       forked logic) but carries NO supervised-lane-sweep stamp because it
#       reached ready[] via some OTHER route (PO hand-placement, PM/architect
#       decomposition, an earlier manual promote that predates the
#       promoted_by convention). ROOT CAUSE this closes: such a row was
#       previously rejected by EVERY dispatch picker — BOUNDED-1 never reads
#       ready[] at all; THIS script's own (a) selector required the exact
#       stamp only the promote script writes, and the promote script only
#       ever reads backlog[] (structurally cannot reach ready[]); RLC
#       excludes any row with effective_supervised or effective_plan_only
#       true, unconditionally; DRS excludes the supervised&&plan_only-BOTH
#       class by design and, like the promote script, only ever reads
#       backlog[]. Unreachable by construction, not by misconfiguration —
#       confirmed live 2026-07-30 against 3 P0 ready[] rows (one, an epic
#       wrapper, deliberately excluded by (b)'s own is_epic_wrapper gate
#       below — see docs/agents/dev-team/flow/post-cycle.md § Step 4.4
#       Epic-Wrapper Autoclose Sweep for that row's own separate closeout
#       path; its non-wrapper siblings are exactly what (b) now reaches).
#
#       (b)'s selection mirrors the promote script's own gates, applied here
#       instead of at promote time because the row already sits in ready[]:
#       effective_supervised($detail_items) == true AND
#       effective_plan_only($detail_items) == true AND NOT an epic wrapper
#       (is_epic_wrapper — a decomposition-container row is never directly
#       dispatched by this or any other picker) AND deps_satisfied (a ready[]
#       row minted by PM/architect decomposition may carry a real sequential
#       depends_on chain onto its own sibling rows — same caution RLC's own
#       header documents for ITS ready[] candidates) AND NOT detail-
#       authoritative DEFERRED* AND status in {READY, TODO} (mirrors RLC's
#       own status filter — excludes a BLOCKED ready[] row, negative
#       control). Resolves dispatch_lane the SAME way the promote script
#       does (resolved_dispatch_lane($detail_items): effective_next_agent,
#       else effective_owner, else "developer") and claims the row directly.
#
#       AC-2 EXPLICIT CONSTRAINT (do not violate): (b) does NOT forge or
#       rewrite `promoted_by` — that would falsify provenance (the row was
#       genuinely NOT promoted by this sweep). The row's existing
#       `promoted_by` (null, or whatever placed it in ready[]) is carried
#       through UNCHANGED; only this script's own pre-existing stamp fields
#       (`claimed_at`/`claimed_by`, plus `dispatch_lane` if the row does not
#       already carry one) record HOW the claim resolved it. `claimed_by`
#       for path (b) is deliberately a DISTINCT string
#       ("dev-team (supervised-lane sweep — unstamped ready fallback)") so a
#       future audit can tell PRIMARY and FALLBACK claims apart without
#       having to diff `promoted_by`.
#
# THREADING (NEW, required by (b)'s gates): this script now needs
# --slurpfile detail docs/data/orch/archive/backlog-detail.json AND
# --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) on every
# invocation — the same contract BOUNDED-1/SLS-promote/RLC already use (see
# scripts/lib/devteam-eligibility.jq header). The caller
# (docs/agents/dev-team/flow/main.md § Supervised-Lane Sweep) has been
# updated accordingly. Path (a) does not itself need either slurpfile (it
# never evaluates an effective_* predicate) but both are threaded
# unconditionally so a single `include` + a single invocation serves both
# paths.
#
# UNLIKE devteam-backlog-claim-bounded1.jq: sets head.next_agent to a
# resolved specialist DIRECTLY — never a generic "developer"
# fallback-of-last-resort — because the real specialist is resolvable (for
# path (a), via `effective_next_agent($detail_items)` re-resolved fresh at
# THIS claim's own invocation, per FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-
# NOT-EFFECTIVE-NEXT-AGENT, 2026-08-26 — NOT a cached `.dispatch_lane` read;
# for path (b), via THIS script's own `resolved_dispatch_lane($detail_items)`
# call, likewise always fresh) before the row is claimed. This is deliberate: BOUNDED-1's
# claimed rows still need Step 3's zone-detect skill to resolve the specialist
# from zone/files (zone-detect has NO path to non-dev-* specialists — see the
# "NON-CODE / DESIGN row next_agent gap" note in
# docs/agents/dev-team/flow/main.md). A supervised-lane-sweep row is
# frequently non-dev-owned by construction (that is exactly why it was gated
# out of BOUNDED-1 in the first place), so routing it back through
# zone-detect's dev-only Tier-3 fallback would silently reroute it to
# "developer" and lose the resolved lane. The caller
# (dev-team/flow/main.md § Supervised-Lane Sweep) therefore does NOT "JUMP TO
# execute" (which goes through execute-tier.md's zone-detect) — it spawns
# `head.next_agent` directly, mirroring the S2 pipeline-resume dispatcher-wrap
# pattern (docs/agents/dev-team/flow/main.md § Step 0b) and the S4 UNBLOCK
# dispatch block, both of which already spawn-by-resolved-name with no
# zone-detect indirection.
#
# If ready[] has no supervised-lane-sweep-stamped row AND no FALLBACK
# candidate (nothing to claim in either set) this script is a NO-OP (outputs
# the input document unchanged) — safe to re-run every tick without side
# effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
#     -f scripts/devteam-backlog-claim-supervised-lane-sweep.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Acceptance / regression: scripts/audits/devteam-dispatch-gate-satisfiability.sh
# § Supervised-Lane Sweep FALLBACK claim (unstamped ready[] row) — positive
# path (row resolved + claimed, promoted_by not forged) plus negative
# controls (epic-wrapper exclusion, deps_satisfied exclusion).
#
# Pointer: docs/agents/dev-team/flow/main.md § Supervised-Lane Sweep (SLS).

include "scripts/lib/devteam-eligibility";

(detail_items_from($detail)) as $detail_items
| dep_status_map($archive) as $status_map
| ( [ (.task_board.ready // []) | to_entries[]
      | select(.value.promoted_by == "dev-team (supervised-lane sweep)")
      | { idx: .key, row: .value, rank: (.value | priority_rank),
          lane: (.value | resolved_dispatch_lane($detail_items)) }
    ] | sort_by([.rank, .idx])
    | [ .[] | select((.lane | length) > 0) ]
      # FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT
      # (2026-08-26, scope-widened to this sibling sweep — cross-ref
      # feedback_sls_primary_claim_null_dispatch_lane_yields_unspawnable_head):
      # PRIMARY used to bind `($picked.dispatch_lane) as $lane` — the CACHED
      # promote-time value — with no re-resolution and no null-guard, the
      # IDENTICAL defect shape scripts/devteam-backlog-claim-design-router-
      # sweep.jq carried. Now resolves `resolved_dispatch_lane($detail_items)`
      # fresh at CLAIM time for every PRIMARY candidate (never reads
      # `.dispatch_lane` for the routing decision) — the SAME resolver this
      # sweep's own promote script and its own FALLBACK path (b) below
      # already use (NOT bare `effective_next_agent` — unlike DRS, a
      # PRIMARY candidate is not guaranteed a present `next_agent`; promote
      # already falls back to `effective_owner`, else the literal
      # `"developer"` string, so a fresh call must offer the identical
      # fallback chain or it would wrongly reject a legitimately-resolved
      # owner-fallback row). Sorted by `[priority_rank, idx]` (same ordering
      # fix as the DRS sibling — a freshly-stamped P0 must not lose to an
      # older stamp at a lower array index) and filtered to only candidates
      # that actually resolve (AC-3: a null/empty resolution is SKIPPED,
      # never written into `.head.next_agent` as null — falls through to the
      # next PRIMARY candidate, then to FALLBACK, then no-op; in practice
      # `resolved_dispatch_lane`'s own `"developer"` terminal fallback means
      # this filter never actually trips for PRIMARY — kept as
      # defense-in-depth, mirroring DRS's identical guard).
  ) as $primary
| ( [ (.task_board.ready // []) | to_entries[]
      | select(.value.promoted_by != "dev-team (supervised-lane sweep)")
      | select(.value.status == "READY" or .value.status == "TODO")
      | select((.value | effective_supervised($detail_items)) == true)
      | select((.value | effective_plan_only($detail_items)) == true)
      | select((.value | is_epic_wrapper($detail_items)) != true)
      | select(.value | deps_satisfied($detail_items; $status_map))
      | select((.value | is_detail_deferred($detail_items)) != true)
      | { idx: .key, row: .value, rank: (.value | priority_rank),
          lane: (.value | resolved_dispatch_lane($detail_items)) }
    ] | sort_by([.rank, .idx])
  ) as $fallback
| ((.head.status // "idle") as $hs
   | (.head.active_task_id // null) as $ha
   | ($hs == "idle" or $hs == "done" or $ha == null)) as $head_free
| if ($primary | length) > 0 then
    ($primary[0]) as $picked
    | ($picked.row.id) as $picked_id
    | ($picked.lane) as $lane
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        ($picked.row + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: "dev-team (supervised-lane sweep)",
            dispatch_lane: $lane
              # claim-time effective_next_agent() resolution — never a
              # copy-forward of the (possibly stale/null) promote-time cache.
          })
      ])
    | .task_board.ready = [ (.task_board.ready // [])[] | select(.id != $picked_id) ]
    | .head = (
        if $head_free then
          {
            status: "in_progress",
            active_task_id: $picked_id,
            next_agent: $lane,
            next_action: ("Supervised-Lane Sweep claim of " + $picked_id
              + " — spawn " + $lane + " DIRECTLY (no zone-detect indirection; lane resolved at CLAIM time via effective_next_agent(), never a cached promote-time value). supervised/plan_only preserved — do not clear."),
            updated_at: $now,
            updated_by: "dev-team (supervised-lane sweep)"
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
  elif ($fallback | length) > 0 then
    ($fallback[0]) as $picked
    | ($picked.row.id) as $picked_id
    | ($picked.lane) as $lane
    | ($picked.row.dispatch_lane // $lane) as $stamped_lane
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        ($picked.row + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: "dev-team (supervised-lane sweep — unstamped ready fallback)",
            dispatch_lane: $stamped_lane
          })
      ])
    | .task_board.ready = [ (.task_board.ready // [])[] | select(.id != $picked_id) ]
    | .head = (
        if $head_free then
          {
            status: "in_progress",
            active_task_id: $picked_id,
            next_agent: $lane,
            next_action: ("Supervised-Lane Sweep FALLBACK claim of " + $picked_id
              + " — row reached ready[] via a route other than this sweep's own promote script (promoted_by="
              + (($picked.row.promoted_by // null) | tostring)
              + "); dispatch_lane resolved here directly, provenance NOT overwritten. Spawn " + $lane
              + " DIRECTLY (no zone-detect indirection). supervised/plan_only preserved — do not clear."),
            updated_at: $now,
            updated_by: "dev-team (supervised-lane sweep)"
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
  else
    .   # nothing supervised-lane-sweep-promoted AND no unstamped supervised+plan_only ready[] row eligible — no-op
  end
