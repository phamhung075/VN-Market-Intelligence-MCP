# Router dispatch flip: FIX-ALERT-COMMANDER-DEAD-NO-SLOT backlog[] -> in_progress[] (dev-team 16:37Z tick).
# type=FIX (direct-to-execute), PO decision=RESURRECT. Executing agent: cowork-refactory-expert (dispatch-table: cowork config/schedule owner).
# Scope for the worker: (a) restore alert-commander slot(s) in docs/data/cowork-schedule.json; (b) reconcile system-map.json:1312 sender_rules doc-drift (add legal_risk/verified_chain/crisis_velocity CRITICAL-always override text).
#   Part (c) auditor liveness-guard (scheduled-but-slotless detection) = OUT of cowork-refactory-expert domain -> separate follow-up for system-auditor, NOT this task.
# Guards: error if not in backlog[], error if already in in_progress[]. Type-guard the backlog string-element (~line 9853).
# Usage: jq --arg now "$NOW" -f scripts/router-dispatch-alertcmd-resurrect-inprogress-20260703T1637.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.backlog | map(select(type=="object" and .id=="FIX-ALERT-COMMANDER-DEAD-NO-SLOT"))[0]) as $t
| if $t == null then error("FIX-ALERT-COMMANDER-DEAD-NO-SLOT not in backlog[] — refuse to dispatch")
  elif ((.task_board.in_progress | map(select(type=="object" and .id=="FIX-ALERT-COMMANDER-DEAD-NO-SLOT")) | length) > 0) then error("already in in_progress[] — refuse dup")
  else . end
| .task_board.in_progress += [
    ($t + {
      status: "IN_PROGRESS",
      owner: "cowork-refactory-expert",
      dispatched_at: $now,
      dispatched_by: "router",
      tick: "2026-07-03T16:37Z",
      router_dispatch_note: "[router 2026-07-03T16:37Z] FIX dispatched to cowork-refactory-expert. Scope: (a) restore alert-commander slot(s) in docs/data/cowork-schedule.json; (b) reconcile system-map.json:1312 sender_rules doc-drift (CRITICAL-always override). Part (c) auditor liveness-guard = separate follow-up (system-auditor domain, not this task). On completion: router RAW-verify -> flip in_progress->review -> dispatch qa."
    })
  ]
| .task_board.backlog |= map(select(type != "object" or .id != "FIX-ALERT-COMMANDER-DEAD-NO-SLOT"))
| .head += {
    status: "in_progress",
    active_task_id: "FIX-ALERT-COMMANDER-DEAD-NO-SLOT",
    next_agent: "cowork-refactory-expert",
    next_action: "cowork-refactory-expert restores alert-commander cowork slot(s) in docs/data/cowork-schedule.json (confirm cadence: market-hours + off-hours since legal/crisis events break off-market — PNJ example) + reconciles system-map.json:1312 sender_rules doc-drift. Index-only commit, explicit paths, no push, no board touch. On completion: router RAW-verify -> in_progress->review -> qa.",
    updated_at: $now,
    updated_by: "router",
    note: "16:37Z dev-team tick: dispatched FIX-ALERT-COMMANDER-DEAD-NO-SLOT (HIGH, PNJ proximate cause) to cowork-refactory-expert. WIP=1. FEAT-SEVERITY-OVERRIDE-SURFACING remains backlog for next-tick planning."
  }
