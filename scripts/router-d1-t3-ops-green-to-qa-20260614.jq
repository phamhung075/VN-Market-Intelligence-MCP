# Router dev-team dispatcher — advance T3-ARCH-CRON-WATCHDOG review/ops -> qa (ops deploy GREEN, router RAW-re-verified LIVE).
# ops a6c5e2e3 returned GREEN. Router did NOT relay the ops badge — re-verified the DECISIVE check INDEPENDENTLY:
#   PEERS: docker ps -> all 13 peers Up/healthy; mcp-server Up 6min (healthy); NO teardown (rebuild-recreate-destroys-peers avoided).
#   STARTUP (logs 2026-06-14T14:25:49Z): "[scheduler] jobs registered — 82 cron keys ... + scheduler-watchdog active";
#     "[bootstrap] Scheduler started — cron jobs active"; NO "Cannot convert a symbol to a string" (no Bun-JIT corruption).
#   FRESHNESS (keinos/sqlite3 sidecar vs NAMED VOLUME /app/data/market.db) — the 3 formerly-false-"never ran" jobs now resolve
#     to REAL rows under the CORRECTED keys: ohlcv-daily-aggregator=2026-06-14 14:30:01, ta-ohlcv-backfill=2026-06-14 14:30:10,
#     foreignFlowAlertJob=2026-06-12 08:13:00. (A job that ran 14:30:01 cannot be stale at the 14:30:16 watchdog fire.)
#   WATCHDOG FIRE (log 2026-06-14T14:30:16.310Z): "[scheduler-watchdog] checked=16 alerted=8 healed=2".
#   THE DECISIVE CHECK — RAW-GREEN three independent ways:
#     (1) grep of the FULL 40-min post-deploy log window for the exact never-ran emit string
#         "has never run — scheduler registration may be missing" (schedulerWatchdogJob.ts:308-309, which DOES log to stdout)
#         returned EMPTY -> ZERO never-ran alerts fired.
#     (2) grep of all log lines naming the 3 target jobs in any alert|stale|never|missing|warn context returned EMPTY.
#     (3) all 3 jobs resolve to real cron_job_runs rows under the corrected keys (above).
#     => the false-"never ran" class for ohlcv-daily-aggregator/foreignFlowAlertJob/ta-ohlcv-backfill is DEFINITIVELY eliminated.
#         That is exactly T3's scope. The alerted=8 are GENUINE-stale alerts (correct new behavior; baseRateComputationJob ~20d is
#         the known-real one) -> spin out to PO separately, NOT a T3 regression.
#   GATEWAY: router-style call_tool reachable (task_release ok:true this tick); ops reported get_market_snapshot (VN-Index
#     1791.65) + get_pipeline_health (30 tickers) 200, no 500.
# This write (ONE atomic temp->rename): T3 review[] -> qa[] ; status REVIEW->QA ; next_agent ops->qa ;
#   records ops_deploy_verdict + router_live_verdict (my independent RAW proof). head -> status=qa/active=T3/next_agent=qa.
#   umbrella ARCH-CRON-SCHEDULER-RELIABILITY stays in_progress (parent, closes when T3 done_verified). PARKED reaudit untouched.
#   Commit by EXPLICIT PATH only (orch-state.json + this script) — concurrent agent-.md refactor dirty tree must NOT be captured.
# GUARD: refuse unless T3 in review[] with status REVIEW and next_agent=="ops" and review_round==3.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — ops-green advance to qa LIVE gate).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t3-ops-green-to-qa-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="T3-ARCH-CRON-WATCHDOG")][0]) as $t3
| if $t3 == null then error("T3 not in review[] — refuse")
  elif ($t3.status != "REVIEW") then error("T3 status != REVIEW (\($t3.status)) — refuse")
  elif (($t3.next_agent // null) != "ops") then error("T3 next_agent != ops (\($t3.next_agent)) — refuse")
  elif (($t3.review_round // 0) != 3) then error("T3 review_round != 3 (\($t3.review_round)) — refuse")
  else . end
| .task_board.review = [$rv[] | select((type=="object" and .id=="T3-ARCH-CRON-WATCHDOG") | not)]
| .task_board.qa = ((.task_board.qa // []) + [
    ($t3 + {
      status: "QA",
      next_agent: "qa",
      ops_deployed_at: $now,
      ops_deploy_verdict: "GREEN (ops a6c5e2e3): image 2026-06-14T14:23:59Z, targeted build --no-cache mcp-server + up -d --no-deps --force-recreate; 13 peers Up/healthy (no teardown); 82 cron keys; no Bun-JIT corruption; 3-job freshness recent; watchdog fired checked=16 alerted=8 healed=2 with the 3 target jobs NOT alerted; get_market_snapshot + get_pipeline_health 200.",
      router_live_verified_at: $now,
      router_live_verified_by: "dev-team",
      router_live_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the ops badge). PEERS: 13 Up/healthy, mcp-server Up 6min, no teardown. STARTUP 14:25:49Z: 82 cron keys + scheduler-watchdog active + Scheduler started, no 'symbol to a string'. FRESHNESS (keinos sidecar vs named volume): ohlcv-daily-aggregator 2026-06-14 14:30:01, ta-ohlcv-backfill 2026-06-14 14:30:10, foreignFlowAlertJob 2026-06-12 08:13:00 — all resolve under corrected keys. WATCHDOG 14:30:16 checked=16 alerted=8 healed=2. DECISIVE (3 ways): (1) exact never-ran emit string 'has never run — scheduler registration may be missing' ABSENT from full 40min log window -> ZERO never-ran alerts; (2) the 3 target jobs absent from every alert/stale/never/missing line; (3) all 3 resolve to real rows. => false-never-ran class ELIMINATED. The 8 alerts = genuine-stale (baseRateComputationJob ~20d known-real) -> PO spin-out, NOT a T3 regression.",
      qa_instructions: "FINAL LIVE GATE — gate-keeper, write Task Report, never accept a badge. Re-confirm INDEPENDENTLY: (1) git show 9a7e1aef + 153f2e82 — 3 manifest keys match recorded literals (ohlcv-daily-aggregator/foreignFlowAlertJob/ta-ohlcv-backfill) + WD-11 derives recorded-name set from registration SOURCE files (readFileSync) and asserts every WATCHDOG_MANIFEST key in it; (2) re-run locally: cd apps/mcp-server && bunx tsc --noEmit (exit 0) && bun test src/scheduler/system/__tests__/ARCH-CRON-watchdog.test.ts (18/18 incl WD-11); (3) LIVE via keinos/sqlite3 sidecar vs NAMED VOLUME /app/data/market.db: confirm the 3 jobs have recent cron_job_runs rows under the corrected keys AND docker logs --since 1h <mcp-server> | grep 'has never run — scheduler registration may be missing' returns EMPTY (the decisive proof the false alerts are gone); (4) enumerate the genuine watchdog stale alerts (alerted=8) by job_name for the PO spin-out (baseRateComputationJob ~20d expected). On qa-APPROVED -> router RAW-confirms -> promote T3 done_verified which CLOSES umbrella ARCH-CRON-SCHEDULER-RELIABILITY. Commit Task Report by explicit path only (concurrent agent-.md refactor dirty tree must not be captured).",
      ops_verified_round3: $now
    })
  ])
| .head = {
    status: "qa",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T3-ARCH-CRON-WATCHDOG",
    next_agent: "qa",
    note: "T3-ARCH-CRON-WATCHDOG ops deploy GREEN + router RAW-re-verified LIVE (independent, not the ops badge): 13 peers healthy, 82 cron keys, 3 target jobs resolve to real rows under corrected keys, never-ran emit string ABSENT from full post-deploy log window -> false-never-ran class ELIMINATED (T3 scope met). alerted=8 are genuine-stale (baseRateComputationJob ~20d -> PO spin-out). -> qa FINAL LIVE gate + Task Report. qa-APPROVED -> done_verified CLOSES umbrella ARCH-CRON-SCHEDULER-RELIABILITY. WIP=1 same-zone serialized. ARCH-SHIP-WAVE-REAUDIT PARKED. Commit by explicit path only (concurrent agent-.md refactor in tree)."
  }
