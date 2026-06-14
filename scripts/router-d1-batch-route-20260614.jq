# Router dev-team dispatcher — route PO triage BATCH (tick 2026-06-14T11:06Z, Sunday off-market).
# PO (af1c0dbe) returned BATCH([A,B]) after RESOLVING signal mcp500-rootcause itself (39cbc648).
# Router RAW-verified before this write:
#   - A=ARCH-CRON-SCHEDULER-RELIABILITY in ready[] (recurrence_count 3 -> architect-bound per
#     feedback_recurring_bug_escalation). zone apps/mcp-server/ FREE (FIX-MCP-500 done_verified e69b354f).
#     dependency FIX-MCP-CRASH-LOOP-WRITEWAL = done_verified (09e2586b) -> IMPL gate sound; architect
#     DESIGN stage = zero zone-WIP impact, safe to start on off-market Sunday.
#   - B=FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS STUCK in review[] (next_agent null). zone_owner cross-service/
#     (pure docs/agents/*.md tool-package edits) -> NO same-zone contention with A. verified_stale_zero:true,
#     completed_at set -> ready for qa final gate -> done_verified. No rebuild (docs only).
# This write (ONE atomic temp->rename): (A) ready->in_progress next_agent=architect; (B) review next_agent=qa;
#   head->in_progress active=A. WIP=2 (A in_progress mcp-server + B qa-gate cross-service) — different zones, OK.
# Does NOT touch any other bucket/row; does NOT capture other agents' dirty files (commit by explicit path).
# GUARD: refuse unless A in ready[] and B in review[] with next_agent null/absent.
# Pointer: docs/agents/dev-team/flow/main.md (Step 2 Planning matrix / Step 3 execute-tier route-on-BATCH).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-batch-route-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.ready // []) as $ready
| (.task_board.review // []) as $review
| ([$ready[] | select(type=="object" and .id=="ARCH-CRON-SCHEDULER-RELIABILITY")][0]) as $a
| ([$review[] | select(type=="object" and .id=="FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS")][0]) as $b
| if $a == null then error("A=ARCH-CRON-SCHEDULER-RELIABILITY not in ready[] — refuse")
  elif $b == null then error("B=FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS not in review[] — refuse")
  elif (($b.next_agent // null) != null) then error("B already has next_agent=\($b.next_agent) — refuse double-route")
  else . end
# (A) remove from ready[], append to in_progress[] with dispatch provenance
| .task_board.ready = [$ready[] | select((type=="object" and .id=="ARCH-CRON-SCHEDULER-RELIABILITY") | not)]
| .task_board.in_progress = ((.task_board.in_progress // []) + [
    ($a + {
      status: "IN_PROGRESS",
      next_agent: "architect",
      claimed_at: $now,
      claimed_by: "dev-team",
      dispatch_note: "Router routed PO BATCH (tick 11:06Z). DESIGN stage -> architect (recurring-bug escalation, recurrence_count 3). zone apps/mcp-server/ free post-FIX-MCP-500; dep FIX-MCP-CRASH-LOOP-WRITEWAL done_verified (09e2586b) -> IMPL gate sound. Architect designs the DEFINITIVE node-cron scheduler fix per A/B/C/D levers + G1-G5 verification gate; NO per-job symptom patch. IMPL (dev-mcp-server) SEQUENCED after brief, bun tests BEFORE ops rebuild (RED-PREPUSH), targeted build --no-cache + up -d --no-deps --force-recreate (NEVER compose down), LIVE-verify auto-fire (pipeline-health + cron_job_runs), never badges."
    })
  ])
# (B) set next_agent=qa in review[] (status stays review -> qa final gate)
| .task_board.review = [$review[]
    | if (type=="object" and .id=="FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS")
        then . + {next_agent:"qa", dispatched_at:$now, dispatched_by:"dev-team",
                  dispatch_note:"Router routed PO BATCH UNBLOCK (tick 11:06Z). STUCK in review with next_agent=null -> qa final gate. Pure docs/agents/*.md tool-package param-doc fixes (B3/B6/B7/B8/B9/B11/B12); zone_owner cross-service/, NO same-zone contention with ARCH-CRON. No rebuild (docs only). qa verifies the 7 documented-arg==server-required-arg fixes RAW vs live tool schemas, then -> done_verified."}
        else . end ]
# head -> in_progress, primary pipeline = A (B is a parallel cross-service qa-gate)
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "ARCH-CRON-SCHEDULER-RELIABILITY",
    next_agent: "architect",
    note: "Router routed PO triage BATCH (tick 11:06Z, Sunday off-market). A=ARCH-CRON-SCHEDULER-RELIABILITY in_progress -> architect (DESIGN stage; recurring-bug escalation; zone apps/mcp-server free; dep done_verified). B=FIX-MCP-TOOL-PARAM-SCHEMA-DRIFT-DOCS review -> qa (cross-service docs gate, parallel, no contention). WIP=2 different zones. ARCH-SHIP-WAVE-REAUDIT stays PARKED."
  }
