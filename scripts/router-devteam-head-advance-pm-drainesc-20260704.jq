# Router: advance .head architect->pm for FIX-DRAINESC after architect blueprint (commit d29da2653, RAW-verified).
# Architect flipped the task_board row owner architect->pm in-place but left .head UNTOUCHED per the
# router-held SF-1 coordination lock -> router advances .head (top-level .head is pipeline-resume authoritative,
# feedback_orchstate_dual_head_keys_toplevel_authoritative). SF-1 held by router across the chain.
# Guard: error if FIX-DRAINESC is not in in_progress[] (refuse to advance head for a non-active task).
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/router-devteam-head-advance-pm-drainesc-20260704.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="FIX-DRAINESC-SEVERITY-RECURRENCE-GATE")) | length) as $n
| if $n == 0 then error("FIX-DRAINESC-SEVERITY-RECURRENCE-GATE not in in_progress[] -- refuse to advance head") else . end
| .head = {
    status: "in_progress",
    active_task_id: "FIX-DRAINESC-SEVERITY-RECURRENCE-GATE",
    next_agent: "pm",
    next_action: "architect blueprint DONE (commit d29da2653, router RAW-verified UUID-clean, dev impl files untouched). pm decomposes docs/architecture-briefs/2026-07-04-drainesc-severity-recurrence-gate.md (9 ACs; GATE-A severity floor >=HIGH via row.severity + static per-ESC-id fallback; GATE-B two-tier board-row-exists + signals_processed count>=2 bootstrap; zone cross-service) into ONE atomic dev task. Files for dev: docs/agents/dev-team/flow/drain-esc-dispatch.md + scripts/agents-flow/drain-signals.js. Chain: pm -> dev -> qa. SF-1 held by router.",
    updated_at: $now,
    updated_by: "router",
    note: ($now + ": architect->pm handoff. Row owner=pm (architect-set); head advanced to pm by router.")
  }
