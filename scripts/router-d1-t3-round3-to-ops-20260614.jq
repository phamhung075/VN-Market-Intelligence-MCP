# Router dev-team dispatcher — advance T3-ARCH-CRON-WATCHDOG in_progress(round-3 IMPL) -> review/ops.
# dev-mcp-server returned: round-2 fix 9a7e1aef (PART A — 3 manifest keys) + round-3 153f2e82 (PART B — WD-11 source-derived guard).
# Router RAW-verified INDEPENDENTLY (NOT the agent badge):
#   PART (A) 9a7e1aef: 3 manifest keys corrected to recorded literals (ohlcv-daily-aggregator/foreignFlowAlertJob/ta-ohlcv-backfill)
#     + liveManifest selfHealFn wrapRun literals matched. (verified round-2 review.)
#   PART (B) 153f2e82: WD-11 test READS the real registration source files (readFileSync) — startScheduler.ts, startupHelpers.ts,
#     summaryJobs.ts, foreignFlowAlertJob.ts, insiderCheckJob.ts, calibrationReportJob.ts, vnstockFundamentalsJob.ts — extracts
#     wrapRun(...) AND recordJobRun(...) literal args, resolves the 2 indirections (JOB_NAME_FUNDAMENTALS const value +
#     summaryJob:${periodType} template -> summaryJob:daily), and asserts every WATCHDOG_MANIFEST key is in that derived set.
#     This is the genuine generic guard (NOT the round-2 tautology) — drift at ANY call site turns it RED.
#   ROUTER OWN FAIL-LOUD PROOF (independent of the agent's accuracyDigestJob experiment): flipped the recordJobRun("insiderCheckJob")
#     CALL-SITE literal in insiderCheckJob.ts -> WD-11 RED with Missing:["insiderCheckJob"] (exercises the recordJobRun regex path
#     the agent did NOT test); restored via git checkout -> 18 pass / 0 fail. No probe residue (git status clean).
#   GATES (router re-ran locally): bunx tsc --noEmit exit 0; bun ARCH-CRON-watchdog.test.ts 18 pass / 0 fail.
#   COMMITS clean: 9a7e1aef = 3 files apps/mcp-server (manifest+startScheduler+test); 153f2e82 = 1 file (test +194). orch-state
#     NOT captured by either; other-agent dirty files untouched (commit by explicit path). Both at/under HEAD.
# This write (ONE atomic temp->rename): T3 in_progress[] -> review[] status REVIEW next_agent=ops;
#   head -> review/active=T3/next_agent=ops. umbrella ARCH-CRON-SCHEDULER-RELIABILITY stays in_progress (parent, closes when
#   T3 done_verified). PARKED reaudit untouched. Does NOT capture other agents' dirty files.
# GUARD: refuse unless T3 in in_progress[] with status IN_PROGRESS and next_agent=="dev-mcp-server" and review_round==3.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — advance IMPL'd task to ops deploy stage).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t3-round3-to-ops-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="T3-ARCH-CRON-WATCHDOG")][0]) as $t3
| if $t3 == null then error("T3 not in in_progress[] — refuse")
  elif ($t3.status != "IN_PROGRESS") then error("T3 status != IN_PROGRESS (\($t3.status)) — refuse")
  elif (($t3.next_agent // null) != "dev-mcp-server") then error("T3 next_agent != dev-mcp-server (\($t3.next_agent)) — refuse")
  elif (($t3.review_round // 0) != 3) then error("T3 review_round != 3 (\($t3.review_round)) — refuse")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="T3-ARCH-CRON-WATCHDOG") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t3 + {
      status: "REVIEW",
      next_agent: "ops",
      impl_commit: "153f2e8202e637dbcd27a55cf54d20adc87e391d",
      impl_commit_chain: ["55ea2ccf (orig watchdog)", "9a7e1aef (A: 3 manifest keys)", "153f2e82 (B: WD-11 source-derived guard)"],
      impl_verified_at: $now,
      impl_verified_by: "dev-team",
      impl_verdict: "RAW-verified GREEN round-3: (A) 3 manifest keys match recorded literals; (B) WD-11 reads real registration sources (readFileSync) + extracts wrapRun/recordJobRun literals + resolves JOB_NAME_FUNDAMENTALS const & summaryJob:daily template, asserts every manifest key in derived set. Router OWN fail-loud proof: flipped recordJobRun(\"insiderCheckJob\") call-site literal -> WD-11 RED Missing:[\"insiderCheckJob\"] (recordJobRun path, NOT the agent's accuracyDigestJob wrapRun path); restored -> 18/18. tsc exit 0 (router re-ran). Commits clean, orch-state untouched.",
      ops_instructions: "TARGETED REBUILD ONLY: docker compose build --no-cache mcp-server && docker compose up -d --no-deps --force-recreate mcp-server. NEVER docker compose down (rebuild-recreate-destroys-peers). docker ps -a after to confirm all peers Up/healthy. Then LIVE verification: (1) startup logs show scheduler started + cron keys registered (expect 82 — schedulerWatchdog present; round-3 was key-rename + test only, no cron count change vs the 82 from the orig watchdog deploy) + NO 'Cannot convert a symbol to a string'; (2) within ~10 min the watchdog fires — RAW-probe cron_job_runs via keinos/sqlite3 sidecar against the NAMED VOLUME /app/data/market.db: docker run --rm --volumes-from <cid> keinos/sqlite3 sqlite3 /app/data/market.db \"SELECT job_name,MAX(started_at) FROM cron_job_runs WHERE job_name IN ('ohlcv-daily-aggregator','foreignFlowAlertJob','ta-ohlcv-backfill') GROUP BY job_name\" — confirm all 3 return recent rows (these are the 3 that were falsely 'never ran' under the old wrong keys); (3) THE DECISIVE CHECK: the watchdog must NO LONGER emit the 3 false 'has never run — scheduler registration may be missing' WORK alerts for ohlcv-daily-aggregator/foreignFlowAlertJob/ta-ohlcv-backfill. At most it should alert on GENUINELY stale jobs (baseRateComputationJob ~20d is the known-real one — that alert is CORRECT and expected, spin out separately). Read the WORK channel + grep container logs for 'scheduler-watchdog' lines; report EXACTLY which job_names (if any) it alerted on; (4) router-style own gateway call_tool(get_market_snapshot or get_pipeline_health) returns valid payload, no 500. Report image build timestamp, peer count, cron-key count (expect 82), the 3-job freshness probe result, and the full list of any watchdog WORK alerts with job names. On ops-green -> qa LIVE gate -> done_verified CLOSES umbrella ARCH-CRON-SCHEDULER-RELIABILITY."
    })
  ])
| .head = {
    status: "review",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T3-ARCH-CRON-WATCHDOG",
    next_agent: "ops",
    note: "T3-ARCH-CRON-WATCHDOG round-3 IMPL'd (9a7e1aef keys + 153f2e82 WD-11) + router-RAW-verified GREEN (WD-11 reads real call sites; router OWN flip of recordJobRun('insiderCheckJob') -> RED then restored 18/18; tsc 0) -> ops for TARGETED rebuild + LIVE gate. DECISIVE live check: the 3 false 'never ran' alerts (ohlcv-daily-aggregator/foreignFlowAlertJob/ta-ohlcv-backfill) must be GONE; only genuinely-stale baseRateComputationJob may alert (correct). NEVER compose down, expect 82 cron keys. ops-green -> qa -> done_verified CLOSES umbrella ARCH-CRON-SCHEDULER-RELIABILITY. WIP=1 same-zone serialized. ARCH-SHIP-WAVE-REAUDIT PARKED."
  }
