# Board reconcile: FACTORY-SCHEDULER-split-dataAuditJob
# in_progress[IN_PROGRESS] -> review[REVIEW] bucket move + .head.next_agent -> ops
# (this task IS the current .head.active_task_id — dispatcher-wrap owns .head
# here per the standard dev->ops Close Gate handoff contract, see
# docs/protocols/docker-deployment-runbook.md § Microservice Code-Change Close Gate).
#
# dev-mcp-server split dataAuditJob.ts (1300L) D-1..D-11/W-1..W-7 inline checks
# into 19 files under scheduler/news-analysis/audit-checks/ (each <=120L) +
# dataAuditShared.ts (AuditFinding/TelegramFn/GetCountFn/helpers/constants).
# dataAuditJob.ts is now a 353L thin orchestrator re-exporting the shared
# symbols for backward-compatible import paths. RAW-verified byte-identical
# findings[] + agent_feedback insert ordering (pre-split monolith vs
# post-split module, scratch probe script, deleted after use). tsc clean.
# Targeted suite (11 files, 92 tests) 92/92 pass. Commit 7b62f73e7.
#
# GUARD: refuse unless FACTORY-SCHEDULER-split-dataAuditJob is in in_progress[]
# with status IN_PROGRESS.
# Usage: jq --arg now "$NOW" -f scripts/dev-mcp-server-factory-scheduler-split-dataauditjob-review.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FACTORY-SCHEDULER-split-dataAuditJob")][0]) as $t
| if $t == null then error("FACTORY-SCHEDULER-split-dataAuditJob not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("FACTORY-SCHEDULER-split-dataAuditJob status != IN_PROGRESS (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-SCHEDULER-split-dataAuditJob") then
    error("head.active_task_id drifted away from FACTORY-SCHEDULER-split-dataAuditJob (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="FACTORY-SCHEDULER-split-dataAuditJob") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t + {
      status: "REVIEW",
      next_agent: "ops",
      rebuild_required: true,
      moved_to_review_at: $now,
      moved_by: "dev-mcp-server",
      commit: "7b62f73e7",
      review_note: "dataAuditJob.ts (1300L) runDailyChecks(D-1..D-11)/runWeeklyChecks(W-1..W-7) held 30+ inline findings.push sites. Split into scheduler/news-analysis/audit-checks/ — 19 files, one per check group, each <=120L, pure (db)=>AuditFinding[] except async checkLancedbDrift (W-7, injected GetCountFn). AuditFinding/TelegramFn/GetCountFn/checkToCategory/severityToPriority/getPreviousRowCounts/insertFeedbackIfNew/buildFindingTitle/buildTelegramMessage/INDICATOR_RANGES/SNAPSHOT_TABLES moved to new dataAuditShared.ts. dataAuditJob.ts is now a 353L thin orchestrator: runDailyChecks/runWeeklyChecks are [...checkA(db),...checkB(db),...] spreads in the exact original D-n/W-n order (finding order + insertFeedbackIfNew side-effect ordering preserved), plus writeSystemLog/upsertAuditState/maybeSendTelegram + the public runDailyAudit/runWeeklyAudit/runDailyAuditIfStale entry points; re-exports AuditFinding/TelegramFn/GetCountFn/buildFindingTitle for zero call-site churn (existing tests + bctcReparseJob.ts unchanged). RAW-verify: scratch pre/post comparison script ran runDailyAudit/runWeeklyAudit against identical seeded fixture DBs using a git-HEAD copy of the pre-split monolith vs the post-split module — findings[] output (20 daily + 27 weekly findings) and agent_feedback insert ordering byte-identical (JSON deep-equal). New FACTORY-SCHEDULER-split-dataAuditJob.test.ts (7 tests) exercises 6 extracted check functions directly, demonstrating individual testability. tsc clean. Targeted suite (11 files: 157/314/1055/1420/1862j/1041/1086/1101/1221/p2-f-rag-http-rewire + new split test) 92/92 pass. toolCount=183 unchanged, scheduler cron.schedule grep=3 unchanged (no scheduler wiring touched — only news-analysis/ internal file layout). Commit 7b62f73e7. rebuild_required=true — scheduler/cron hot path, new code only takes effect after container rebuild. Routes through Docker Microservice Code-Change Close Gate: ops Steps 1-4 -> qa Step 5 -> po Step 6."
    })
  ])
| .head.status = "review"
| .head.next_agent = "ops"
| .head.next_action = "FACTORY-SCHEDULER-split-dataAuditJob at REVIEW -- ops: Docker Microservice Code-Change Close Gate Steps 1-4 (rebuild+swap mcp-server container, health/tool-count/dashboard-route checks), then qa: Step 5 live RAW-verify (runDailyAudit/runWeeklyAudit findings shape via cron_job_runs / dashboards), then po: Step 6 close."
| .head.updated_at = $now
| .head.updated_by = "dev-mcp-server"
