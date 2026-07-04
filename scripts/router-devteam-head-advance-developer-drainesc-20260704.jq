# Router: advance .head pm->developer for FIX-DRAINESC after pm decomposition (commit f0010b46a, RAW-verified).
# pm minted atomic dev task IMPL-DRAIN-GATE-SEVERITY-RECURRENCE in ready[] and flipped the parent row
# next_agent pm->developer in-place, but left .head UNTOUCHED per the router-held SF-1 coordination lock
# -> router advances .head (top-level .head is pipeline-resume authoritative,
# feedback_orchstate_dual_head_keys_toplevel_authoritative). SF-1 held by router across the chain.
# Guards: error if FIX-DRAINESC not in in_progress[] OR IMPL-DRAIN-GATE not in ready[] (refuse stale advance).
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/router-devteam-head-advance-developer-drainesc-20260704.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="FIX-DRAINESC-SEVERITY-RECURRENCE-GATE")) | length) as $p
| (.task_board.ready | map(select(type=="object" and .id=="IMPL-DRAIN-GATE-SEVERITY-RECURRENCE")) | length) as $i
| if $p == 0 then error("FIX-DRAINESC-SEVERITY-RECURRENCE-GATE not in in_progress[] -- refuse to advance head")
  elif $i == 0 then error("IMPL-DRAIN-GATE-SEVERITY-RECURRENCE not in ready[] -- refuse to advance head")
  else . end
| .head = {
    status: "in_progress",
    active_task_id: "FIX-DRAINESC-SEVERITY-RECURRENCE-GATE",
    next_agent: "developer",
    next_action: "pm decomposition DONE (commit f0010b46a, router RAW-verified UUID-clean: only orch-state.json, acceptance=array of 9 distinct ACs AC1..AC9, mandates carry no-hardcode/never-suppress/count==1/injection-arg). Atomic dev task IMPL-DRAIN-GATE-SEVERITY-RECURRENCE in ready[] (next_agent=developer, owner=developer). developer implements GATE-A (severity floor >=HIGH) + GATE-B (two-tier board-row-exists + signals_processed count>=2 bootstrap) in docs/agents/dev-team/flow/drain-esc-dispatch.md (BETWEEN Step 2 mutex and Step 3 Opus spawn) + scripts/agents-flow/drain-signals.js (Tier-2 read-only count helper, NEVER the section-0a write path). Design ref: docs/architecture-briefs/2026-07-04-drainesc-severity-recurrence-gate.md. Chain: developer -> qa. SF-1 held by router.",
    updated_at: $now,
    updated_by: "router",
    note: ($now + ": pm->developer handoff. IMPL-DRAIN-GATE ready (next_agent=developer); head advanced to developer by router.")
  }
