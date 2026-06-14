# Router dev-team dispatcher — advance T3-ARCH-CRON-WATCHDOG in_progress(IMPL) -> review/ops.
# dev-mcp-server (a45eb741) returned commit 55ea2ccf; router RAW-verified (NOT the agent badge):
#   - commit clean: 4 files all apps/mcp-server/ (schedulerWatchdogJob.ts + test + cronConfig.ts + startScheduler.ts),
#     at HEAD, orch-state NOT captured, dirty board of ~13 other-agent files untouched.
#   - tsc --noEmit exit 0 (RED-PREPUSH green — router re-ran, not trusted from report).
#   - bun ARCH-CRON-watchdog.test.ts 14 pass / 0 fail (router re-ran locally).
#   - WIRED into flow (not prose): startScheduler.ts:1175 scheduleCron(CRONS.schedulerWatchdog) wrapped in
#     jobRunRepo.wrapRun('schedulerWatchdogJob') — consistent with 3 sibling watchdog jobs; cronConfig.ts:215
#     schedulerWatchdog='*/10 * * * *' (Lever D every 10 min, per spec).
#   - DOUBLE-LOG IMMUNE: body is read-only `SELECT MAX(started_at) ... WHERE job_name=? AND status IN('success','error')`
#     — both double-logged rows share the same started_at so MAX is correct regardless of row count (the FIX-CRON-JOB-
#     RUNS-DOUBLE-LOG trap that misled ops on T2 is structurally avoided here).
#   - RECOVERY-SAFE: @idempotency T4 — alert dedup via in-process _alertCooldownMap (2h cooldown per job_name);
#     sendTelegramWork fires ONLY past the cooldown gate; no INSERT/WAL write from the watchdog itself; action
#     'alert-only' (no auto-restart). Naturally idempotent under recoverMissedExecutions replay.
# This write (ONE atomic temp->rename): T3 in_progress[] -> review[] next_agent=ops (status REVIEW);
#   head -> review/active=T3/next_agent=ops. umbrella ARCH-CRON-SCHEDULER-RELIABILITY stays in_progress (parent,
#   closes when T3 done_verified). PARKED reaudit untouched. Does NOT capture other agents' dirty files.
# GUARD: refuse unless T3 in in_progress[] with status IN_PROGRESS and next_agent=="dev-mcp-server".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — advance IMPL'd task to ops deploy stage).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t3-impl-to-ops-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="T3-ARCH-CRON-WATCHDOG")][0]) as $t3
| if $t3 == null then error("T3 not in in_progress[] — refuse")
  elif ($t3.status != "IN_PROGRESS") then error("T3 status != IN_PROGRESS (\($t3.status)) — refuse")
  elif (($t3.next_agent // null) != "dev-mcp-server") then error("T3 next_agent != dev-mcp-server (\($t3.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="T3-ARCH-CRON-WATCHDOG") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t3 + {
      status: "REVIEW",
      next_agent: "ops",
      impl_commit: "55ea2ccfaf36bc089af54ab2527d4e16ca6151f1",
      impl_verified_at: $now,
      impl_verified_by: "dev-team",
      impl_verdict: "RAW-verified GREEN: commit 55ea2ccf clean 4 files apps/mcp-server@HEAD (orch-state untouched); tsc exit 0 (router re-ran); 14/14 bun watchdog tests; WIRED startScheduler.ts:1175 scheduleCron(CRONS.schedulerWatchdog)+jobRunRepo.wrapRun, cronConfig */10 * * * *; double-log immune (SELECT MAX(started_at)); recovery-safe (T4 alert-dedup 2h cooldown Map, alert-only, no WAL write).",
      ops_instructions: "TARGETED REBUILD ONLY: docker compose build --no-cache mcp-server && docker compose up -d --no-deps --force-recreate mcp-server. NEVER docker compose down (rebuild-recreate-destroys-peers). docker ps -a after to confirm all peers Up/healthy. Then LIVE verification: (1) startup logs show scheduler started + cron keys registered (expect 82 now — +1 schedulerWatchdog) + NO 'Cannot convert a symbol to a string'; (2) confirm schedulerWatchdogJob appears in the registered-cron-keys log line; (3) within ~10 min the watchdog fires its first tick — RAW-probe cron_job_runs via keinos/sqlite3 sidecar (docker run --rm --volumes-from <cid> keinos/sqlite3 sqlite3 /app/data/market.db \"SELECT job_name,MAX(started_at) FROM cron_job_runs WHERE job_name='schedulerWatchdogJob' GROUP BY job_name\") — confirm it ran; (4) verify it did NOT spam WORK channel (alert-only + 2h cooldown — at most one alert per genuinely-stale job, and on a healthy fleet likely ZERO alerts); (5) router-style own gateway call_tool(get_pipeline_health or get_market_snapshot) returns valid payload, no 500. Report image build timestamp, peer count, the cron-key count (expect 82), watchdog first-fire evidence, and any WORK alerts it emitted (with the stale job names if any). On ops-green -> qa LIVE gate -> done_verified CLOSES umbrella ARCH-CRON-SCHEDULER-RELIABILITY."
    })
  ])
| .head = {
    status: "review",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T3-ARCH-CRON-WATCHDOG",
    next_agent: "ops",
    note: "T3-ARCH-CRON-WATCHDOG IMPL'd (55ea2ccf) + router-RAW-verified GREEN (tsc 0, 14/14 tests, wired scheduleCron */10, double-log immune MAX(started_at), recovery-safe alert-dedup) -> ops for TARGETED rebuild + LIVE watchdog-fire gate (expect 82 cron keys, NEVER compose down). ops-green -> qa -> done_verified CLOSES umbrella ARCH-CRON-SCHEDULER-RELIABILITY. WIP=1 same-zone serialized. ARCH-SHIP-WAVE-REAUDIT PARKED."
  }
