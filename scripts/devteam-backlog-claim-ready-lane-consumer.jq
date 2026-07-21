# scripts/devteam-backlog-claim-ready-lane-consumer.jq
#
# UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22),
# PO ruling item (2): "Add an idle-head ready-lane consumer."
#
# ROOT CAUSE this closes: ready[] holds rows from THREE distinct sources —
# (a) BOUNDED-1's own promote script, (b) the Supervised-Lane Sweep's own
# promote script, (c) PM/architect decomposition (epic children minted
# directly into ready[], e.g. CCATO-MCP-T1..T8, SYSREMAKE-P2-T1..T9,
# DESIGN-COWORK-FANOUT-T1..T8 — 25 rows live 2026-07-21, all carrying a
# resolved inline `next_agent`). BOUNDED-1's and SLS's own CLAIM scripts
# each only claim rows THEY themselves stamped (`promoted_by ==
# "dev-team (bounded-1 auto-pickup)"` / `"dev-team (supervised-lane
# sweep)"`) — source (c) rows have neither marker and were therefore
# NEVER claimable by anything: not by BOUNDED-1/SLS (marker mismatch), not
# by PO triage (po/flow/main.md never sweeps ready[] by priority), not by
# any other step in dev-team/flow/main.md. This script is the missing
# generic consumer for that class — and, incidentally, for ANY future
# ready[] row that carries its own resolved next_agent regardless of who
# placed it there.
#
# Unlike BOUNDED-1's claim script (which falls back to a "developer"
# placeholder and relies on Step 3's zone-detect skill to resolve the real
# specialist from zone/files), this script ONLY claims rows that ALREADY
# carry a resolved next_agent — it does no zone-detect-style inference of
# its own. A ready[] row with no resolvable next_agent is left untouched for
# BOUNDED-1/SLS/PO/router to handle through their own paths.
#
# Selection (single row per invocation, mirrors BOUNDED-1/SLS one-at-a-time
# discipline; --slurpfile detail is threaded for parity with the shared
# contract even though live ready[] rows are rarely detail_ref'd):
#   - candidate lane: .task_board.ready[]
#   - status in {READY, TODO} (mirrors the lane-coherence set in
#     apps/mcp-server/src/infrastructure/orchStateSchema.ts)
#   - NOT already claimed by a peer this tick — trivially true: this script
#     reads ready[] AFTER BOUNDED-1's and SLS's own promote+claim pairs have
#     already run and (if either claimed) already removed their row from
#     ready[] in the SAME orch-apply.sh write, per strict sequential
#     invocation in docs/agents/dev-team/flow/main.md.
#   - effective_supervised != true — same caution as BOUNDED-1: never
#     auto-claim a row a human/router/PO deliberately marked for
#     deliberate dispatch, even if it happens to carry a next_agent
#     (e.g. FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK, supervised:true,
#     P0, sitting in ready[] live 2026-07-21 — NOT this consumer's target).
#   - effective_plan_only != true — same caution (plan_only:true is a
#     deliberate architect/PO dispatch class, not an autonomous-pick
#     target, independent of whether next_agent happens to be resolved).
#   - not an epic wrapper (is_epic_wrapper) — a row that is itself a
#     decomposition container is never directly dispatched.
#   - depends_on eligible (deps_satisfied, cross-lane DONE_VERIFIED-only —
#     LOAD-BEARING for this consumer's actual target set: CCATO-MCP-T3/T5/
#     T6/T7/T8, SYSREMAKE-P2-T2..T9, and DESIGN-COWORK-FANOUT-T2/T4/T7/T8
#     ALL carry real sequential depends_on chains onto their own sibling
#     rows — e.g. SYSREMAKE-P2-T9-QA-GATE depends on 8 other T-rows. Without
#     this gate a naive priority-only picker would dispatch T9 before T1
#     even exists, or T3 before T1 lands — this gate is what makes it safe
#     to pick "the top-priority ready row" rather than "the top-priority
#     ready row that also happens to be unblocked").
#   - not detail-authoritative DEFERRED* (is_detail_deferred)
#   - a RESOLVED next_agent: resolved_dispatch_lane($detail_items) resolves
#     to something other than the bare "developer" fallback string UNLESS
#     the row's own inline/effective next_agent is literally "developer"
#     (i.e. this consumer accepts "developer" only when the row itself
#     asked for it — it never fabricates a placeholder the way BOUNDED-1
#     does). Concretely: effective_next_agent($detail_items) is
#     present-and-non-empty (dev-* or non-dev-*, doesn't matter — this
#     consumer bypasses zone-detect entirely, see dispatch note below), ELSE
#     effective_owner($detail_items) is present-and-non-empty.
#   - ordered by priority_rank ascending, tiebreak by ready[] array index
#     (FIFO proxy — mirrors BOUNDED-1/SLS convention)
#
# DISPATCH (mirrors SLS, NOT zone-detect): the caller
# (docs/agents/dev-team/flow/main.md § Ready-Lane Consumer) does NOT
# "JUMP TO execute" — it spawns `head.next_agent` DIRECTLY, exactly as SLS
# does, because this script has already resolved the real specialist. Routing
# a non-dev-owned row (e.g. next_agent=agent-father/qa) back through
# zone-detect's dev-only Tier-3 fallback would silently reroute it to
# "developer" and discard the resolution this script just did.
#
# Concurrency: shares the SAME WIP<=2 budget as the Supervised-Lane Sweep —
# NOT a third budget (docs/agents/dev-team/flow/main.md § Invariants). The
# caller gates on a FRESH `wip_in_progress < 2` read taken AFTER BOUNDED-1's
# AND the Supervised-Lane Sweep's own promote+claim pairs have already run
# this tick and (if either fired) already JUMP-TO-execute'd/JUMP-TO-end'd
# away — so this script's invocation only ever happens when head is still
# idle. No `.head` collision possible by construction (same argument as
# SLS's own caller-comment).
#
# Mutation (single row only): ready[] -> in_progress[] ; status ->
# IN_PROGRESS ; stamp claimed_at/claimed_by ; set .head to the resolved
# dispatch lane directly. Never touches backlog[] (this consumer never
# promotes, only claims what is already staged in ready[]).
#
# If ready[] has no eligible row (nothing un-gated with a resolved
# next_agent) this script is a NO-OP (outputs the input document unchanged)
# — safe to re-run every tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     -f scripts/devteam-backlog-claim-ready-lane-consumer.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Ready-Lane Consumer (RLC),
# inserted immediately after the Supervised-Lane Sweep block, on the same
# head-idle fall-through, before Step 1 PO triage.

include "scripts/lib/devteam-eligibility";

(detail_items_from($detail)) as $detail_items
| dep_status_map as $status_map
| ( [ .task_board.ready
    | to_entries[]
    | select(.value.status == "READY" or .value.status == "TODO")
    | select((.value | effective_supervised($detail_items)) != true)
    | select((.value | effective_plan_only($detail_items)) != true)
    | select((.value | is_epic_wrapper($detail_items)) != true)
    | select(.value | deps_satisfied($detail_items; $status_map))
    | select((.value | is_detail_deferred($detail_items)) != true)
    | select(
        ((.value | effective_next_agent($detail_items)) | length) > 0
        or ((.value | effective_owner($detail_items)) | length) > 0
      )
    | { idx: .key, row: .value, rank: (.value | priority_rank),
        lane: (.value | resolved_dispatch_lane($detail_items)) }
  ] | sort_by([.rank, .idx])
) as $candidates
| if ($candidates | length) == 0 then
    .   # nothing eligible in ready[] — no-op
  else
    ($candidates[0]) as $picked
    | ($picked.row.id) as $picked_id
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        ($picked.row + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: "dev-team (ready-lane consumer)",
            dispatch_lane: $picked.lane
          })
      ])
    | .task_board.ready = [ .task_board.ready | to_entries[] | select(.key != $picked.idx) | .value ]
    | .head = {
        status: "in_progress",
        active_task_id: $picked_id,
        next_agent: $picked.lane,
        next_action: ("Ready-Lane Consumer claim of " + $picked_id
          + " — spawn " + $picked.lane + " DIRECTLY (no zone-detect indirection; row already carried a resolved next_agent/owner)."),
        updated_at: $now,
        updated_by: "dev-team (ready-lane consumer)"
      }
  end
