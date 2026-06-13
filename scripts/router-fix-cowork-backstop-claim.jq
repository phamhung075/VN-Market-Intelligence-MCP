# Router board mutation: claim FIX-COWORK-GUARANTEED-BACKSTOP ready[] -> in_progress[] (READY->IN_PROGRESS).
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router claim before architect spawn).
# Usage: jq --arg now "$NOW" -f scripts/router-fix-cowork-backstop-claim.jq orch-state.json
(.task_board.ready | map(select(.id=="FIX-COWORK-GUARANTEED-BACKSTOP"))[0]) as $t
| if $t == null then error("FIX-COWORK-GUARANTEED-BACKSTOP not in ready[]") else . end
| .task_board.in_progress += [
    ($t + {
        status: "IN_PROGRESS",
        claimed_at: $now,
        claimed_by: "router",
        dispatch_note: "Dispatched architect \($now). SPRINT-S cowork-reliability design: pick A (restore Layer-A per-slot RemoteTriggers, session-independent) / B (silence-watchdog auto-re-arm on >20min market-hours heartbeat gap) / C (durable Layer-B survive session-end), with rationale. agent-father implements. Scope = cowork flow/skill/trigger ONLY — NOT mcp-server code, NOT cowork-schedule.json data edit. Honor §9 stability gate (proven >=2 restarts) before deleting any fallback. Output: architecture brief -> docs/architecture-briefs/, signal agent-father."
       })
  ]
| .task_board.ready |= map(select(.id != "FIX-COWORK-GUARANTEED-BACKSTOP"))
