# Router head reconcile: A-1 cleared qa (APPROVED, moved to done[] by QA commit 41dc2b24) but the
# QA board-write left the global head block stale (status=review/next_agent=qa/updated_by=dev-mcp-server).
# A-1 is APPROVED for code-merge quality; the ONLY remaining step is the ops live-verify gate
# (force-recreate mcp-server -> confirm cron_job_runs 'mcpServerStartup' sentinel row persists +
#  WORK-channel alert fires on 2nd restart within 4h). A-1.next_agent is already 'ops' in done[].
# This advances the dispatcher pointer so the NEXT dev-team tick unambiguously dispatches ops,
# NOT a re-run of qa on an already-APPROVED task. Pure forward-roll; no task bucket mutation.
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b — router reconciles stale head on pipeline forward).
# Usage: jq --arg now "$NOW" -f scripts/router-a1-approved-head-reconcile.jq docs/data/orch/orch-state.json
(.task_board.done | map(select(.id=="A-1"))[0]) as $a1
| if $a1 == null then error("A-1 not in done[] — refuse to reconcile head off a moved task")
  elif ($a1.status != "APPROVED") then error("A-1 status != APPROVED (got \($a1.status)) — refuse")
  else . end
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "router",
    active_task_id: "A-1",
    next_agent: "ops",
    note: "A-1 APPROVED (code-merge) by qa cycle-261. Remaining: ops live-verify gate — force-recreate mcp-server, confirm cron_job_runs mcpServerStartup sentinel persists on named-volume DB + WORK alert fires on 2nd restart/4h. Promote A-1 done->done_verified ONLY after that fires LIVE."
  }
