# Router dev-team dispatch 2026-06-15T09:3xZ — move FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE
# ready -> in_progress (route dev-mcp-server, recon-first) per PO mint+queue return (agentId a0f9042b, board mint 26b450c5).
#
# WHY NOW: PO deferred dispatch to router + confirmed dev-mcp-server CODING lane free. Router RAW-verified board
#   (ready[0]=FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE route dev-mcp-server mode recon-first zone apps/mcp-server/;
#   no dup in in_progress/done). Coding-lane accounting: in_progress goes 2->3 but ACTIVE dev-zone coding lane = 1
#   after this — the 2 existing in_progress (ARCH-CRON-SCHEDULER-RELIABILITY=QA-LIVE-OUTCOME-OBSERVE gate,
#   BA-VN-MACRO-TOOLING=design stage) consume NO coding lane (PO re-verified). WIP<=2 active-coding invariant holds.
#
# ROOT CAUSE (PO read the file, RAW): apps/mcp-server/src/scheduler/system/restartCadenceAlertJob.ts counts
#   cron_job_runs rows job_name='mcpServerStartup' in a 4h window, fires at count>=ALERT_THRESHOLD(2), ZERO
#   deploy-vs-crash discriminator. Each ops force-recreate writes a fresh startup sentinel => 3 intentional deploys
#   today (FIX-RSI-REPORT-FAILCLOSED 05:35, FIX-ALERT-ENGINE-RSI 08:02, FIX-TA-GOSVC-MA5 08:42) page a HEALTHY
#   server. Router RAW docker inspect: RestartCount=0, OOMKilled=false, Health=healthy => no crash loop. /goal#1 class.
#
# RECON MANDATE (carried from PO): dev reads live query + data source FIRST; ops's 'SQL row-aging 4->3' sub-mechanism
#   is internally inconsistent — do NOT trust; confirm against live cron_job_runs + running container. Definitive fix
#   = docker-native RestartCount/ExitCode discriminator (0 across force-recreate deploys, increments on real in-place
#   crash-restart) OR container-session discriminator. GENERIC (/goal#2): no per-deploy-id hardcode/allowlist.
#
# GUARD: refuse unless task in ready[] AND not already in in_progress[]. CONSERVATION: total task count UNCHANGED.
# Usage: jq --arg now "$NOW" -f scripts/router-d61-mcp-restart-alert-dispatch-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.ready[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in ready[] — refuse")
  elif ([.task_board.in_progress[]? | select(.id==$tid)]|length>0) then error("already in in_progress[] — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]? | select(.id!=$tid) ]
| .task_board.in_progress = (.task_board.in_progress + [ $t + {
      status:"IN_PROGRESS",
      route_to:"dev-mcp-server",
      mode:"recon-first",
      dispatched_ts:$now,
      dispatched_by:"dev-team",
      dispatch_note:"router dispatch 2026-06-15 per PO mint+queue (a0f9042b, board mint 26b450c5). Defect: restartCadenceAlertJob.ts counts mcpServerStartup sentinels in 4h window, fires count>=2, no deploy-vs-crash discriminator => pages on every force-recreate deploy (3 healthy-server deploys today). Router RAW docker inspect RestartCount=0/OOMKilled=false/healthy = no crash loop. recon-first: read live query+data source before patching; prefer docker-native RestartCount/ExitCode discriminator; generic no per-deploy-id hardcode (/goal#2). WIP: in_progress=3 but active coding lane=1 (ARCH-CRON=QA-observe, BA-MACRO=design, neither codes)."
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"dev-mcp-server",
    note:"DEV-TEAM DISPATCH 2026-06-15 — FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE ready->in_progress (dev-mcp-server, recon-first, bg) per PO mint+queue (a0f9042b). Root cause: restartCadenceAlertJob.ts has no deploy-vs-crash discriminator (counts mcpServerStartup sentinels, fires count>=2) => false page on a HEALTHY server during the 3 intentional deploys today. Router RAW docker inspect confirms RestartCount=0/healthy (no crash). Gate after fix: rebuild mcp-server + RAW-verify alert does NOT fire on a force-recreate deploy yet DOES on a simulated/real in-place crash-restart; generic all deploys. PUSH held (15-commit bundle, PO's post-RSI-gate call). PARALLEL: FIX-ALERT-ENGINE-RSI-SINGLEDIGIT stays in review[] — behavioral gate fires 2026-06-16 briefing 01:00Z/scan 02:15Z (hourly :07 cron returns router to RAW-verify refilled MARKET queue then promote+push). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (design)."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
