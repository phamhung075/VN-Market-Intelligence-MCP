# scripts/po-route-20260728T13-cowork-catchup-epic-lanes.jq
#
# PO lane-routing pass for the COWORK-GUARANTEED-SLOT-CATCHUP epic
# (TASK-COWORK-CATCHUP-1..10, minted by pm 2026-07-22T22:12:59Z).
#
# DEFECT CLOSED: 9 of the 10 decomposition children were minted with
# `next_agent` UNSET. Verified by executing the shared predicates
# (scripts/lib/devteam-eligibility.jq) against live data, per
# docs/agents/po/flow/zone-routing.md Step A2 ("VERIFY BY EXECUTION, NEVER
# BY READING THE ROW"):
#   - TASK-COWORK-CATCHUP-1 sat in ready[] with effective_next_agent="" and
#     effective_owner="" -> RLC's `next_agent OR owner non-empty` select
#     rejects it, so the Ready-Lane Consumer skips it forever.
#   - TASK-COWORK-CATCHUP-2..9 sat in backlog[] with next_agent unset. Those
#     are NOT gated out of BOUNDED-1 (is_non_dev_next_agent_unrouted is
#     false on an EMPTY next_agent), but BOUNDED-1's claim script then falls
#     back to the literal "developer" placeholder and re-derives the lane via
#     zone-detect's Tier-3 fallback -- an implicit resolution that this epic
#     must not depend on, because 3 of the rows carry a docs/ zone that
#     zone-detect cannot resolve at Tier 1/2.
#   - TASK-COWORK-CATCHUP-10 carried next_agent="agent-father" while sitting
#     in backlog[] -- the documented NO-LANE hole (Step A2: backlog +
#     non-dev next_agent + no plan_only = gated out of BOUNDED-1 by
#     is_non_dev_next_agent_unrouted, and out of SLS which needs BOTH
#     supervised AND plan_only).
#
# HANDLER RESOLUTION -- read off pm's own decomposition, not guessed:
# docs/handoffs/TASK-COWORK-CATCHUP-10.md states "Coordination: developer
# completes code TASK-1..9, then agent-father integrates this doc-only
# subtask into the cron-runbook handoff." Corroborated by
# docs/data/system-map.json (`scripts/` zone -> specialist `developer`;
# `cross-service/` -> generic developer per zone-routing.md Step A fallback)
# and by git history on docs/agents/cowork-team/flow/ (30/30 recent commits
# are developer-class fix(cowork-team)/fix(cross-service) work, NOT
# agent-father) -- so the two docs/agents/cowork-team/flow/ rows (3, 6) and
# the docs/ row (9) belong to developer as well. Only the cron-runbook row
# (10) is agent-father's, per the dispatch table's "schedule/cron" row.
#
# LANE ASSIGNMENT (Step A2 table):
#   TASK-1..9  -> next_agent "developer" (dev-role) + backlog lane = BOUNDED-1.
#                 TASK-1 is MOVED ready[] -> backlog[] for this reason: it is
#                 the only dep-free row in the chain, it is P0, and there is
#                 currently NO other rank-0 BOUNDED-1-eligible backlog row
#                 (measured: 82 eligible, ranks 1/2/3/9 only), so it becomes
#                 BOUNDED-1's top pick on the next idle tick. Leaving it in
#                 ready[] would put it behind RLC, which is 3rd in the
#                 head-idle chain and only reachable when BOUNDED-1 declines
#                 (tracked: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION).
#   TASK-10    -> stays next_agent "agent-father" but MOVED backlog[] ->
#                 ready[] (status READY), the ONLY lane that consumes a
#                 non-dev handler (RLC). Its depends_on [TASK-9] is still
#                 enforced there by RLC's deps_satisfied gate, so it cannot
#                 fire early.
#
# Conservation-neutral: one row leaves ready[] and one enters it; one leaves
# backlog[] and one enters it. task_total unchanged.
#
# Usage (ALWAYS from project root, ALWAYS through the gate):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-route-20260728T13-cowork-catchup-epic-lanes.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Idempotent: re-running is a no-op once next_agent/lane are already set
# (the id-based filters simply match nothing to move a second time).

def routing_note:
  "PO 2026-07-28T13Z lane routing. pm's decomposition minted this row with next_agent unset, which no dispatch lane resolves (verified by executing scripts/lib/devteam-eligibility.jq predicates, not by reading the row). Handler = developer per docs/handoffs/TASK-COWORK-CATCHUP-10.md ('developer completes code TASK-1..9, then agent-father integrates this doc-only subtask') + docs/data/system-map.json scripts/ zone. dev-role next_agent + backlog lane = BOUNDED-1, per docs/agents/po/flow/zone-routing.md Step A2.";

def route_dev:
  . + {
    next_agent: "developer",
    po_routing_20260728: routing_note,
    updated_by: "po/route-20260728T13"
  };

($now) as $n
| (.task_board.ready   | map(select((.id // "") == "TASK-COWORK-CATCHUP-1")))  as $c1
| (.task_board.backlog | map(select((.id // "") == "TASK-COWORK-CATCHUP-10"))) as $c10
| .task_board.ready   = (.task_board.ready   | map(select((.id // "") != "TASK-COWORK-CATCHUP-1")))
| .task_board.backlog = (.task_board.backlog | map(select((.id // "") != "TASK-COWORK-CATCHUP-10")))
| .task_board.backlog = (.task_board.backlog
    | map(if ((.id // "") | test("^TASK-COWORK-CATCHUP-[2-9]$")) then route_dev else . end))
| .task_board.backlog = (.task_board.backlog
    + ($c1 | map(route_dev + {
        status: "BACKLOG",
        po_lane_move_20260728: "MOVED ready[] -> backlog[] by PO. Dep-free P0 head of the epic chain; backlog[] is the BOUNDED-1 lane (1st in the head-idle chain) and this row is currently the only rank-0 BOUNDED-1-eligible row, so it is the next unattended pick. ready[] would have parked it behind RLC (3rd in the chain, reachable only when BOUNDED-1 declines)."
      })))
| .task_board.ready = (.task_board.ready
    + ($c10 | map(. + {
        status: "READY",
        po_lane_move_20260728: "MOVED backlog[] -> ready[] by PO. next_agent=agent-father is non-dev: backlog + non-dev next_agent + no plan_only is the documented NO-LANE hole (zone-routing.md Step A2) -- BOUNDED-1 gates it via is_non_dev_next_agent_unrouted and SLS needs supervised AND plan_only, neither of which apply. ready[] + status READY is the only lane with a consumer for a non-dev handler (Ready-Lane Consumer). depends_on [TASK-COWORK-CATCHUP-9] is still enforced there by RLC's deps_satisfied gate.",
        updated_by: "po/route-20260728T13"
      })))
| .task_board._updated_at = $n
| .task_board._updated_by = "po (lane-route TASK-COWORK-CATCHUP-1..10)"
| ._updated_at = $n
| ._updated_by = "po/route-20260728T13"
