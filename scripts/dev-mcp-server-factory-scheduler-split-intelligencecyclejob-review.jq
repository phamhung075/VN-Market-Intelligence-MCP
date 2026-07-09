# Board reconcile: FACTORY-SCHEDULER-split-intelligenceCycleJob
# in_progress[IN_PROGRESS] -> review[REVIEW] bucket move + .head.next_agent -> ops
# (this task IS the current .head.active_task_id — dispatcher-wrap owns .head
# here per the standard dev->ops Close Gate handoff contract, see
# docs/protocols/docker-deployment-runbook.md § Microservice Code-Change Close Gate).
#
# Precedent: scripts/dev-mcp-server-factory-scheduler-split-dataauditjob-review.jq
# (same task family, same lane-move + .head-sync shape).
#
# dev-mcp-server split intelligenceCycleJob.ts (1381L, 15-min hot path) into
# scheduler/news-analysis/intelligenceCycle/{types.ts,marketHours.ts,
# defaults/*.ts} (9 defaultXxx files + types + marketHours = 11 new files).
# defaultComputeHexagrams + resetHexagramCooldown + the module-level
# _lastHexagramComputedAt cooldown map kept together in one file per the
# CRITICAL invariant. intelligenceCycleJob.ts is now a 975L thin orchestrator
# re-exporting CycleResult/CycleDeps/isMarketHours/resetHexagramCooldown for
# zero call-site churn. RAW-verified byte-identical extracted function bodies
# + MD5-identical CycleResult (pre-split monolith vs post-split module,
# scratch probe script, deleted after use). tsc clean. Targeted suite (25
# files) 227/227 pass. Commit 0e1e48dad.
#
# GUARD: refuse unless FACTORY-SCHEDULER-split-intelligenceCycleJob is in
# in_progress[] with status IN_PROGRESS.
# Usage: jq --arg now "$NOW" -f scripts/dev-mcp-server-factory-scheduler-split-intelligencecyclejob-review.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FACTORY-SCHEDULER-split-intelligenceCycleJob")][0]) as $t
| if $t == null then error("FACTORY-SCHEDULER-split-intelligenceCycleJob not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("FACTORY-SCHEDULER-split-intelligenceCycleJob status != IN_PROGRESS (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-SCHEDULER-split-intelligenceCycleJob") then
    error("head.active_task_id drifted away from FACTORY-SCHEDULER-split-intelligenceCycleJob (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="FACTORY-SCHEDULER-split-intelligenceCycleJob") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t + {
      status: "REVIEW",
      next_agent: "ops",
      rebuild_required: true,
      moved_to_review_at: $now,
      moved_by: "dev-mcp-server",
      commit: "0e1e48dad",
      review_note: "intelligenceCycleJob.ts (1381L, 15-min hot path) mixed CycleResult/CycleDeps contracts, isMarketHours, 9 defaultXxx DI-seam production impls (Steps A/B/C/D/E/A4), and the 7-step orchestrator. Split into intelligenceCycle/types.ts (CycleResult/CycleDeps, 138L), intelligenceCycle/marketHours.ts (isMarketHours, 36L, VN_OFFSET_MS imported from timeConstants.ts not redefined), intelligenceCycle/defaults/*.ts (one file per defaultXxx: PollNews/ListSscDocs/FetchPrices/RunImpactChain/SendAlerts/GetWatchlistCodes/ReadUnnotifiedAlerts/MarkAlertNotified all <=79L; ComputeHexagrams 146L, over the 120L target but explicitly justified — kept together with resetHexagramCooldown + the module-level _lastHexagramComputedAt cooldown map, splitting them apart would silently break the 15-min per-stock cooldown closure). intelligenceCycleJob.ts is now a 975L thin orchestrator: concurrency guard, per-step timeout helper, ALERT_WINDOW_MS/CYCLE_WARN_THRESHOLD_MS named constants, the 7-step _runCycle body, runIntelligenceCycle, Step G chain-synthesis helpers; re-exports CycleResult/CycleDeps/isMarketHours/resetHexagramCooldown from intelligenceCycleJob.ts for zero call-site churn (existing tests import them from there directly, unchanged). Two source-text-introspection tests (1843-poll-news-te-chromium-stub.test.ts, FIX-NEWS-CB-FALSE-CLOSED.test.ts) had their srcPath updated to defaultPollNews.ts's new location (same regex assertions, function body unchanged). RAW-verify (two layers): every extracted function body byte-diffed identical against a git-HEAD copy of the pre-split monolith (import-path depth normalized); a scratch executable probe (temp, deleted after use) ran runIntelligenceCycle with an identical fully-injected CycleDeps object against both the git-HEAD snapshot and the post-split module across market-hours=true/false scenarios — CycleResult MD5-identical in both scenarios, isMarketHours matched across 5 fixed timestamps. tsc clean. Targeted suite (25 files covering intelligenceCycleJob/pollNews/macro-alerts/hexagram/chain-synthesis/cascade-broadcast) 227/227 pass, 746 expect() calls. toolCount=183 unchanged, scheduler cron.schedule grep=3 unchanged (no scheduler wiring touched — only news-analysis/ internal file layout). Full bun test: 14415 pass/40 skip/65 fail/10 errors/1184 files (583.73s) then the known Bun 1.3.13 crash-at-teardown (post-summary, non-authoritative) — grepped every fail/error: zero mention of intelligence-cycle/scheduler/news-analysis, all are the documented pre-existing flaky class (pollNews/VPS-push/insider-transactions/foreign-flow/market-cap/telegram-channel-routing/deprecated-technical-indicators, same 5000ms network-timeout signature cited in the two prior FACTORY splits this sprint). Doc update: infrastructure.md new \"Intelligence Cycle Job\" section. Commit 0e1e48dad. rebuild_required=true — scheduler/cron hot path, new code only takes effect after container rebuild. Routes through Docker Microservice Code-Change Close Gate: ops Steps 1-4 -> qa Step 5 -> po Step 6."
    })
  ])
| .head.status = "review"
| .head.next_agent = "ops"
| .head.next_action = "FACTORY-SCHEDULER-split-intelligenceCycleJob at REVIEW -- ops: Docker Microservice Code-Change Close Gate Steps 1-4 (rebuild+swap mcp-server container, health/tool-count/dashboard-route checks), then qa: Step 5 live RAW-verify (runIntelligenceCycle behavior via cron_job_runs / scheduler logs — 15-min hot path, behavior-preservation proof matters more than usual), then po: Step 6 close."
| .head.updated_at = $now
| .head.updated_by = "dev-mcp-server"
