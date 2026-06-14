# Router dev-team dispatcher — dispatch T1-ARCH-CRON-T4-DEDUP-GUARDS to dev-mcp-server (IMPL stage).
# pm (72bba8dd) decomposed ARCH-CRON into T1->T2->T3 (depends[]-ordered) in ready[]; umbrella next_agent=
# dev-mcp-server / next_task=T1; head active=T1. T2/T3 stay BLOCKED in ready[] by depends[] (T2 needs T1,
# T3 needs T2) -> same-zone apps/mcp-server serialization holds (only T1 in-flight). Router RAW-verified:
# pm commit touched only orch-state + pm notebook; T1 depends=[] (eligible NOW); deploy-gate
# FIX-MCP-CRASH-LOOP-WRITEWAL done_verified (09e2586b) met.
# This write (ONE atomic temp->rename): move T1 ready[]->in_progress[] with next_agent=dev-mcp-server +
# dispatch provenance; refresh head (updated_by=dev-team, now). Leaves T2/T3 in ready[] untouched, umbrella
# untouched, B (FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS review/next_agent=qa) untouched. Does NOT capture other
# agents' dirty files (commit by explicit path).
# GUARD: refuse unless T1 in ready[] with status READY and depends==[] (deps satisfied/none).
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — dispatch next eligible IMPL task).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t1-dispatch-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.ready // []) as $ready
| ([$ready[] | select(type=="object" and .id=="T1-ARCH-CRON-T4-DEDUP-GUARDS")][0]) as $t1
| if $t1 == null then error("T1-ARCH-CRON-T4-DEDUP-GUARDS not in ready[] — refuse")
  elif ($t1.status != "READY") then error("T1 status != READY (got \($t1.status)) — refuse")
  elif (($t1.depends // []) | length) != 0 then error("T1 depends[] not empty (\($t1.depends)) — refuse, deps unmet")
  else . end
| .task_board.ready = [$ready[] | select((type=="object" and .id=="T1-ARCH-CRON-T4-DEDUP-GUARDS") | not)]
| .task_board.in_progress = ((.task_board.in_progress // []) + [
    ($t1 + {
      status: "IN_PROGRESS",
      next_agent: "dev-mcp-server",
      claimed_at: $now,
      claimed_by: "dev-team",
      dispatch_note: "Router dispatched T1 IMPL (tick 11:06Z, off-market Sunday = architect-blessed safe mcp-server window). dev-mcp-server adds cron_job_runs recency guards (90% cadence window) to the 26 non-idempotent T4 jobs — MANDATORY PRECONDITION before T2 recoverMissedExecutions (else recovery double-fires Telegram). Per architect brief docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md §5.2. bun tests GREEN before ops rebuild (RED-PREPUSH strands fleet); ops targeted build --no-cache mcp-server + up -d --no-deps --force-recreate (NEVER compose down), docker ps -a after; then qa LIVE-verify (cron_job_runs rows, idempotency under replay), never badges. Deploy-gate FIX-MCP-CRASH-LOOP-WRITEWAL done_verified (09e2586b) met."
    })
  ])
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T1-ARCH-CRON-T4-DEDUP-GUARDS",
    next_agent: "dev-mcp-server",
    note: "T1-ARCH-CRON-T4-DEDUP-GUARDS dispatched -> dev-mcp-server (IMPL, apps/mcp-server, off-market Sunday safe window). T2/T3 BLOCKED in ready[] by depends[] (same-zone serialized). Parallel non-conflicting: B=FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS -> qa (cross-service docs gate). WIP=2 different zones."
  }
