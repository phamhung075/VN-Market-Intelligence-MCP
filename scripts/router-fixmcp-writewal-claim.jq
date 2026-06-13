# Router board mutation: FIX-MCP-CRASH-LOOP-WRITEWAL backlog[] -> in_progress[] (BACKLOG->IN_PROGRESS).
# SPRINT-S dispatch: architect first (design 3 fix-classes split), then pm sequences. Sets head block in_progress/next_agent=architect.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router claim before architect spawn).
# Usage: jq --arg now "$NOW" -f scripts/router-fixmcp-writewal-claim.jq docs/data/orch/orch-state.json
(.task_board.backlog | map(select(.id=="FIX-MCP-CRASH-LOOP-WRITEWAL"))[0]) as $t
| if $t == null then error("FIX-MCP-CRASH-LOOP-WRITEWAL not in backlog[]") else . end
| .task_board.in_progress += [
    ($t + {
        status: "IN_PROGRESS",
        size: "SPRINT-S",
        zone: "apps/mcp-server/",
        claimed_at: $now,
        claimed_by: "router",
        dispatch_note: "SPRINT-S dispatched architect \($now). RECURRING write-wedge (4 crashes/26h ~2h cadence, re-crashed ~00:20Z 06-14). Design split of 3 fix-classes: (B/C) GENERIC db-connection-layer WAL checkpoint policy (PRAGMA wal_autocheckpoint + periodic PRAGMA optimize + manual wal_checkpoint(TRUNCATE)) = load-bearing root fix ships FIRST; (A) ops restart-cadence alert; (D) orch-state WAL>10MB escalation gate. Scope = apps/mcp-server/ db layer + ops-monitoring + orch-state gate. GENERIC at db/connection layer (NOT per-table/per-ticker). Root-cause-definitive (replaces force-recreate symptom-patch). Live-verify (non-market): uptime>4h no restart-loop + WAL<5MB under load. Output: architecture brief -> docs/architecture-briefs/, signal pm."
       })
  ]
| .task_board.backlog |= map(select(.id != "FIX-MCP-CRASH-LOOP-WRITEWAL"))
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-MCP-CRASH-LOOP-WRITEWAL",
    next_agent: "architect"
  }
