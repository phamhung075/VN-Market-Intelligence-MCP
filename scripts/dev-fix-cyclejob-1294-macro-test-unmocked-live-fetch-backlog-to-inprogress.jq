# Board flip: FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH BACKLOG -> IN_PROGRESS
#
# REOPENED task (PO triage 2026-07-11T03:47Z) — prior REVIEW deliverable
# (commit 76acfb4e4) stubbed macroFetchFn/vnstockSyncFn only in
# 1294-macro-spam-fix.test.ts; 106-intelligence-cycle.test.ts's deps objects
# (including several literal deps objects that do NOT spread the shared
# NO_NET_MARKET_DEPS constant) still omit the stub, causing recurring live
# yahooFinance/SBV/vnstock network I/O in CI (CI-RED-284f8ca6). dev-mcp-server
# starting work.
#
# GUARD: refuse unless FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH is in
# backlog[] with status BACKLOG.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/dev-fix-cyclejob-1294-macro-test-unmocked-live-fetch-backlog-to-inprogress.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.backlog // []) as $bl
| ([$bl[] | select(type=="object" and .id=="FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH")][0]) as $t
| if $t == null then error("FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH not in backlog[] — refuse")
  elif ($t.status != "BACKLOG") then error("FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH status != BACKLOG (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "IN_PROGRESS",
    started_at: $now,
    updated_at: $now,
    updated_by: "dev-mcp-server",
    next_agent: "dev-mcp-server"
  }) as $inprog
| .task_board.backlog = [$bl[] | select(.id != "FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH")]
| .task_board.in_progress = ((.task_board.in_progress // []) + [$inprog])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "dev-mcp-server"
