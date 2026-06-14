# Router board claim: FIX-MCP-CRASH-LOOP-D-1 ready[] -> in_progress[] (READY->IN_PROGRESS).
# Last child of the FIX-MCP-CRASH-LOOP-WRITEWAL umbrella. BC-1 + A-1 both done_verified; depends_on[BC-1]
# satisfied; same-zone (apps/mcp-server/) one-in-flight slot is FREE (umbrella parent carries no active worker).
# Design complete (brief_ref + handoff acceptance-ready) => dispatch dev-mcp-server DIRECTLY (no architect/pm).
# Sets head in_progress/next_agent=dev-mcp-server so the dispatch is unambiguous on resume.
# REFUSE if D-1 not in ready[] or BC-1 not done_verified (gate guard).
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router claim before dev spawn).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-claim.jq docs/data/orch/orch-state.json
(.task_board.ready | map(select(.id=="D-1"))[0]) as $d1
| (.task_board.done | map(select(.id=="BC-1"))[0]) as $bc1
| if $d1 == null then error("D-1 not in ready[] — refuse to claim")
  elif $bc1 == null or ($bc1.status != "done_verified")
    then error("BC-1 not done_verified (got \($bc1.status // "absent")) — D-1 gate unmet, refuse")
  else . end
| .task_board.in_progress += [
    ($d1 + {
        status: "IN_PROGRESS",
        claimed_at: $now,
        claimed_by: "router",
        next_agent: "dev-mcp-server",
        dispatch_note: "Dispatched dev-mcp-server \($now). Last child of FIX-MCP-CRASH-LOOP-WRITEWAL umbrella (BC-1+A-1 done_verified). Design complete via handoff docs/handoffs/TASK-FIX-MCP-CRASH-LOOP-D-1.md + brief 2026-06-14-fix-mcp-crash-loop-writewal.md — dev-mcp-server implements directly. Scope: checkpoint.ts (escalateFn param into checkWalFileSize), startScheduler.ts (escalation closure writing atomic orch-state signal when WAL>10MB), new test FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts. GENERIC db-layer (no per-table/per-ticker). Accepts: escalateFn silent WAL<=10MB; called once WAL>10MB w/ byte count; rejection non-fatal; orch-state write temp-rename; tsc 0. Run pnpm check BEFORE commit (RED-PREPUSH)."
       })
  ]
| .task_board.ready |= map(select(.id != "D-1"))
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "D-1",
    next_agent: "dev-mcp-server",
    note: "D-1 claimed — last child of FIX-MCP-CRASH-LOOP-WRITEWAL umbrella. dev-mcp-server implements WAL>10MB escalation gate per handoff. Promote -> review (qa) on green pnpm check + commit."
  }
