# Router dev-team dispatcher — advance T2-ARCH-CRON-RECOVER-JITTER in_progress(IMPL) -> review/ops.
# dev-mcp-server (af6c7b3e) returned commit 526e0c25; router RAW-verified (NOT the agent badge):
#   - commit clean: 10 files all apps/mcp-server/ (scheduler src + 5 test files), at HEAD, dirty board untouched.
#   - tsc --noEmit exit 0 (RED-PREPUSH green — re-run by router, not trusted from report).
#   - Lever B single-source: only `cron.schedule(` is line 236 INSIDE scheduleCron() wrapper def; all 80 call
#     sites (75 startScheduler + 5 summaryJobs) route through it; spread `{recoverMissedExecutions:true,...options}`
#     => caller opt-out wins. GENERIC, zero per-site drift.
#   - Lever C: 8 offsets present in cronConfig.ts, minutes {3,4,5,7,33,35,37,38} ALL DISTINCT (no fire collision).
#   - Idempotency invariant HOLDS: non-idempotent+unguarded jobs OPTED OUT (monthlySignalQualityAudit Telegram-WORK,
#     foreignFlowFetch */1m); summaryJobs recovery-ON is SAFE (generatePeriodicSummary = idempotent period-keyed
#     UPSERT ON CONFLICT(period_type,period_start), ZERO Telegram — router read usecase raw); evidenceAccumulator
#     T4-guarded. Satisfies architect safety-gate §6 (every recovered job >= one idempotency tier).
#   - 12973 tests pass / new ARCH-CRON-recover-jitter.test.ts 18/0 (agent-reported; ops+qa re-verify on rebuild).
# This write (ONE atomic temp->rename): T2 in_progress[] -> review[] next_agent=ops (status REVIEW);
#   head -> review/active=T2/next_agent=ops. T3 stays ready[] depends-gated; umbrella + PARKED reaudit untouched.
#   Does NOT capture other agents' dirty files (commit by explicit path).
# GUARD: refuse unless T2 in in_progress[] with status IN_PROGRESS and next_agent=="dev-mcp-server".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — advance IMPL'd task to ops deploy stage).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t2-impl-to-ops-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="T2-ARCH-CRON-RECOVER-JITTER")][0]) as $t2
| if $t2 == null then error("T2 not in in_progress[] — refuse")
  elif ($t2.status != "IN_PROGRESS") then error("T2 status != IN_PROGRESS (\($t2.status)) — refuse")
  elif (($t2.next_agent // null) != "dev-mcp-server") then error("T2 next_agent != dev-mcp-server (\($t2.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="T2-ARCH-CRON-RECOVER-JITTER") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t2 + {
      status: "REVIEW",
      next_agent: "ops",
      impl_commit: "526e0c255bf8e081e68c4e6ff0de621c03751bf7",
      impl_verified_at: $now,
      impl_verified_by: "dev-team",
      impl_verdict: "RAW-verified GREEN: commit clean 10 files apps/mcp-server@HEAD; tsc exit 0 (router re-ran); Lever B single-source scheduleCron wrapper (80 sites, opt-out spread); Lever C 8 distinct minutes {3,4,5,7,33,35,37,38}; idempotency invariant holds (monthlySignalQualityAudit+foreignFlowFetch opted out, summaryJobs idempotent period-keyed upsert zero-Telegram, evidenceAccumulator T4-guarded); 12973 tests pass.",
      ops_instructions: "TARGETED REBUILD ONLY: docker compose build --no-cache mcp-server && docker compose up -d --no-deps --force-recreate mcp-server. NEVER docker compose down (rebuild-recreate-destroys-peers). docker ps -a after to confirm all peers Up/healthy. Then LIVE auto-fire verification: (1) startup logs show scheduler started + cron keys registered + NO 'Cannot convert a symbol to a string'; (2) recoverMissedExecutions catch-up — if any job's last scheduled fire was missed during the restart window it replays EXACTLY ONCE (no thundering-herd; the 8 jittered jobs fire at distinct minutes); (3) RAW-probe cron_job_runs via keinos/sqlite3 sidecar against named volume (docker run --rm --volumes-from <cid> keinos/sqlite3 sqlite3 /app/data/market.db) — confirm NO duplicate success rows for any recovered job in the restart window (idempotency holds under recovery replay); (4) router-style: own gateway call_tool(get_pipeline_health or get_market_snapshot) returns valid payload, no 500. Report image build timestamp, peer count, the 3 log checks, any recovery replays observed + their cron_job_runs row counts. On ops-green -> qa LIVE idempotency gate -> done_verified UNBLOCKS T3-ARCH-CRON-WATCHDOG."
    })
  ])
| .head = {
    status: "review",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T2-ARCH-CRON-RECOVER-JITTER",
    next_agent: "ops",
    note: "T2-ARCH-CRON-RECOVER-JITTER IMPL'd (526e0c25) + router-RAW-verified GREEN (tsc 0, single-source wrapper 80 sites, 8 distinct jitter minutes, idempotency invariant holds, 12973 tests) -> ops for TARGETED rebuild + LIVE auto-fire/idempotency gate (NEVER compose down). ops-green -> qa -> done_verified UNBLOCKS T3. T3 stays depends-gated. WIP=1 same-zone serialized. ARCH-SHIP-WAVE-REAUDIT PARKED."
  }
