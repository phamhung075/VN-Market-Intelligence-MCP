# scripts/devteam-backlog-promote-design-router-sweep.jq
#
# FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE (architect brief
# 2026-07-29, PO-ratified 2026-07-30 —
# docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md STEP
# po-4). Design-Router Sweep (DRS).
#
# ROOT CAUSE this closes: `docs/agents/dev-team/flow/main.md:547` names it
# verbatim — a backlog row whose `next_agent` does not match BOUNDED-1's
# dev-role pattern (`^dev(-|$)|^developer$`), and that is NOT ALSO caught by
# the Supervised-Lane Sweep's doubly-gated `supervised && plan_only` class,
# sits with NO automated pickup path at all. Live re-verified 2026-07-29
# against `orch-state.json`: 122 such rows (1 P0, 55 P1, 52 P2, 13 P3),
# scoped BACKLOG/TODO — see the architect brief §0 for the full
# stale-count-correction re-verification (a prior triage tick cited a stale
# 61).
#
# What this is NOT: NOT a relaxation of BOUNDED-1's own NON-DEV-NEXT_AGENT
# gate (that gate stays exactly as-is — a row with a non-dev `next_agent`
# still never auto-promotes through BOUNDED-1). NOT a second copy of SLS's
# `supervised && plan_only` predicate — DRS's exclusion clause is
# deliberately an AND (excludes ONLY the exact class SLS already drains), so
# a row carrying exactly ONE of `supervised`/`plan_only` true (86/122+36/122
# of the live set split across zero/one flag) is NOT excluded here and
# remains DRS-eligible, same predicate shape the ratified brief §2.1
# specifies.
#
# AGENT-IDENTITY ALLOWLIST (§2.2 of the brief, Q1 ratified NARROW by PO
# 2026-07-30): UNLIKE SLS (which has no agent-identity filter at all — safe
# because SLS's own target rows are already double human-vetted via the
# supervised+plan_only pair), DRS fires on rows carrying NO deliberate-
# dispatch signal in the majority of live cases, so it needs a DIFFERENT
# compensating control — restrict WHICH resolved `next_agent` values it is
# willing to blind-dispatch. Ratified default:
# `{architect, ba, pm, po, agents-architect}` — pure design/decision/
# coordination agents, zero broad production-write tool grants.
# `agent-father`/`ops*`/`qa`/`system-auditor` are explicitly NOT on the
# default allowlist (see `is_design_router_allowed` in
# scripts/lib/devteam-eligibility.jq for the full per-agent reasoning). A
# row whose resolved `next_agent` is not on the allowlist is simply not a
# DRS candidate this tick — it stays exactly where it is today (inert in
# `backlog[]`, reachable only by deliberate PO/router dispatch); DRS narrows
# the gap, it does not claim to close all of it.
#
# Selection (mirrors SLS's promote script shape exactly):
#   - candidate lane: .task_board.backlog[]
#   - status in {BACKLOG, TODO} (same status filter BOUNDED-1/SLS themselves
#     use — BLOCKED backlog rows are excluded from every existing auto-pickup
#     lane on the same "not yet unblocked" logic; DRS does not special-case
#     that)
#   - `is_design_router_eligible($detail_items; $status_map; $allowlist)` —
#     see scripts/lib/devteam-eligibility.jq for the full composed predicate
#     (non-dev-next_agent-unrouted AND NOT SLS's doubly-gated class AND
#     allowlisted AND not epic-wrapper AND deps-satisfied AND not
#     detail-deferred AND no unbacked prose sequencing). Zero forked logic —
#     every constituent predicate is reused verbatim from the shared
#     eligibility contract (the same "one shared eligibility contract"
#     design principle this project's memory already names 4+ near-miss
#     defects for hand-copied divergence on).
#   - ordered by priority_rank ascending, tiebreak by backlog[] array index
#     (same FIFO-proxy convention as every sibling picker)
#   - exactly ONE row promoted per invocation (mirrors BOUNDED-1/SLS/RLC's
#     own one-at-a-time discipline)
#
# dispatch_lane resolution: `effective_next_agent($detail_items)` DIRECTLY —
# NOT `resolved_dispatch_lane` (SLS/RLC's owner-fallback resolver). Every
# DRS candidate already satisfies `is_non_dev_next_agent_unrouted`, which
# REQUIRES a present, non-empty, non-dev-role `effective_next_agent` — there
# is never an owner-fallback or "developer" placeholder case to reach here.
#
# WIP / concurrency budget (§2.3 of the brief — explicit, not a new budget):
# DRS shares the SAME WIP<2 (`.task_board.in_progress|length` ONLY) budget
# BOUNDED-1/SLS/RLC already share — a 4th writer of the existing named slot.
# NOT QA-Drain's model (dedicated `qa[]<1`) — DRS's claimed rows move into
# `task_board.in_progress[]`, the SAME lane with the SAME concurrency
# meaning ("one dev-team-tracked session actively occupying `.head`/
# resume-tracking") BOUNDED-1/SLS/RLC already meter; there is no structural
# reason for DRS to be exempt from that meter. The caller
# (docs/agents/dev-team/flow/main.md § Design-Router Sweep) gates on a FRESH
# `WIP<2` read taken AFTER BOUNDED-1/SLS/RLC's own promote+claim pairs have
# already run this tick and (if any fired) already JUMP-TO-execute'd/
# JUMP-TO-end'd away — so this script's invocation only ever happens when
# head is still idle. No `.head` collision possible by construction (same
# argument as SLS/RLC's own placement comments).
#
# CHAIN PLACEMENT (§2.4 of the brief — explicit ordering, do not move):
# BOUNDED-1 -> SLS -> RLC -> DRS -> QA-Drain -> Step 1. DRS is, by
# construction, the LEAST-vetted of the four WIP<2 competitors (its only
# compensating control is the allowlist above, not a human/PO-marked flag
# pair) — placing it AFTER SLS/RLC means it only ever spends the shared slot
# when nothing with a stronger safety justification wanted it that tick.
# Forward-compat note (brief §2.4c): once
# `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` ships (still BACKLOG as of this
# implementation), DRS should be added as a 6th `rotation_selected()`
# participant (scripts/lib/devteam-eligibility.jq) at the SAME fairness
# level as the other 5 — this fixed-chain placement is day-1 guidance only.
#
# Mutation (single row only, ADDITIVE — never clears supervised/plan_only,
# same discipline as SLS):
#   backlog[] -> ready[] ; status BACKLOG/TODO -> READY ; stamp promoted_at /
#   promoted_by="dev-team (design-router sweep)" / promotion_note /
#   dispatch_lane. Also stamps .task_board.last_triaged_at/last_triaged_by.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified, mirrors
# every sibling picker's own discipline).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --argjson allowlist '["architect","ba","pm","po","agents-architect"]' \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
#     -f scripts/devteam-backlog-promote-design-router-sweep.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Design-Router Sweep (DRS),
# inserted immediately after the Ready-Lane Consumer block, before Review-Lane
# QA-Drain, on the same head-idle fall-through, before Step 1 PO triage.

include "scripts/lib/devteam-eligibility";

(detail_items_from($detail)) as $detail_items
| dep_status_map($archive) as $status_map
| ($allowlist // ["architect", "ba", "pm", "po", "agents-architect"]) as $al
| ( [ .task_board.backlog
    | to_entries[]
    | select(.value.status == "BACKLOG" or .value.status == "TODO")
    | select(.value | is_design_router_eligible($detail_items; $status_map; $al))
    | { idx: .key, row: .value, rank: (.value | priority_rank),
        lane: (.value | effective_next_agent($detail_items)) }
  ] | sort_by([.rank, .idx])
) as $candidates
| if ($candidates | length) == 0 then
    .   # nothing DRS-eligible — no-op
  else
    ($candidates[0]) as $picked
    | ($picked.row.id) as $picked_id
    | ($picked.row + {
          status: "READY",
          promoted_at: $now,
          promoted_by: "dev-team (design-router sweep)",
          promotion_note: ("Design-Router Sweep — assigned dispatch_lane='" + $picked.lane
            + "' (priority_rank=" + ($picked.rank | tostring)
            + "); ratified agent-identity allowlist, non-dev next_agent class distinct from SLS's supervised+plan_only quarantine — see FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE"),
          dispatch_lane: $picked.lane
        }) as $ready_entry
    | .task_board.ready = ((.task_board.ready // []) + [$ready_entry])
    | .task_board.backlog = [ .task_board.backlog | to_entries[]
        | select(.key != $picked.idx) | .value ]
    | .task_board.last_triaged_at = $now
    | .task_board.last_triaged_by = "dev-team (design-router sweep)"
  end
