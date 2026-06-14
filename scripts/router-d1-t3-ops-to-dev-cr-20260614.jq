# Router dev-team dispatcher — T3-ARCH-CRON-WATCHDOG review/ops -> in_progress/dev-mcp-server (CHANGES_REQUESTED).
# ops (a61fb3128) deployed image 13:28:53Z (82 cron keys, 13 peers healthy, no Bun-JIT 500, call_tool valid) and
# reported OPS-GREEN, asserting the watchdog's 8 first-fire alerts were "legitimate findings, not false positives".
# Router RAW-VERIFIED INDEPENDENTLY (keinos sidecar against named volume) and OVERTURNED the GREEN — ops gave a
# FALSE-GREEN (inverse of the T2 false-RED; verify-raw-not-badges cuts both ways):
#   ROOT-CAUSE DEFECT — WATCHDOG_MANIFEST has 3/16 job-name keys that DO NOT MATCH the recorded cron_job_runs.job_name,
#   so queryLastStartedAt() returns null and the watchdog fires a FALSE "has never run — scheduler registration may be
#   missing" alert for jobs that run fine:
#     manifest 'ohlcvDailyAggregatorJob'  != recorded 'ohlcv-daily-aggregator'  (kebab-case; 25 runs/30d, last 06-10 15:00)
#     manifest 'foreignFlowAlert'         != recorded 'foreignFlowAlertJob'     (missing Job suffix; 28 runs/30d, last 06-12 08:13)
#     manifest 'taOhlcvBackfill'          != recorded 'ta-ohlcv-backfill'       (kebab-case; 10 runs/30d, last 06-12 01:30)
#   IMPACT: (1) 3 false "never ran/unregistered" alerts per restart -> cry-wolf, trains operators to ignore the channel;
#           (2) the watchdog is BLIND to these 3 jobs' true freshness — a genuine break would show the SAME standing
#           false message, so a real outage is indistinguishable from the standing noise. The monitor does not monitor them.
#   TEST GAP: the 14 unit tests inject a test-scoped manifest subset (deps.manifest) — they NEVER validate the REAL
#           WATCHDOG_MANIFEST keys against the live job-name set, so the mismatch shipped green.
#   (Router independent recompute against live DB: TRUE stale set = baseRateComputationJob 20.78d [genuine — weekly job
#    broken, worth a SEPARATE follow-up task], morningBriefingJob/franceSummaryJob/eveningSummaryJob [matched names,
#    but see weekday-gating note]; the 3 name-mismatch jobs are under their daily threshold-or-not is irrelevant — the
#    BUG is they alert as 'never ran' not 'stale'. vnstockFundamentalsRefresh is NOT stale [6.53d < 9.1d] — ops also
#    mis-listed it.)
# FIX REQUIRED (root-cause definitif, not symptom):
#   (A) Correct the 3 manifest keys to the recorded job_name spellings: 'ohlcv-daily-aggregator', 'foreignFlowAlertJob',
#       'ta-ohlcv-backfill'. Re-verify startScheduler registration uses the SAME literal the job records under.
#   (B) Add a manifest-integrity test that asserts EVERY WATCHDOG_MANIFEST key exists in the canonical job-name set
#       (CRONS map / recordJobRun+wrapRun call sites) — fail-loud so a future key drift cannot ship green. This is the
#       generic guard (applies to all 16 + any future job), per the standing 'fix on same problem on all stock' rule.
#   (C) NOTE for dev/architect (secondary, not a hard blocker): the flat cadenceMs×multiplier model flags weekday-only /
#       market-day-only jobs (morningBriefing/france/evening summaries) on weekends. Decide: weekday-aware threshold,
#       per-job grace, or accept-and-document. Address (A)+(B) as the blocker; raise (C) with architect if non-trivial.
# This write (ONE atomic temp->rename): T3 review[] -> in_progress[] status IN_PROGRESS next_agent=dev-mcp-server;
#   head -> in_progress/active=T3/next_agent=dev-mcp-server. umbrella stays in_progress; PARKED reaudit untouched.
#   Does NOT capture other agents' dirty files (commit by explicit path).
# GUARD: refuse unless T3 in review[] with status REVIEW and next_agent=="ops".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — CHANGES_REQUESTED back to zone owner).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t3-ops-to-dev-cr-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $review
| ([$review[] | select(type=="object" and .id=="T3-ARCH-CRON-WATCHDOG")][0]) as $t3
| if $t3 == null then error("T3 not in review[] — refuse")
  elif ($t3.status != "REVIEW") then error("T3 status != REVIEW (\($t3.status)) — refuse")
  elif (($t3.next_agent // null) != "ops") then error("T3 next_agent != ops (\($t3.next_agent)) — refuse")
  else . end
| .task_board.review = [$review[] | select((type=="object" and .id=="T3-ARCH-CRON-WATCHDOG") | not)]
| .task_board.in_progress = ((.task_board.in_progress // []) + [
    ($t3 + {
      status: "IN_PROGRESS",
      next_agent: "dev-mcp-server",
      changes_requested_at: $now,
      changes_requested_by: "dev-team",
      review_round: (($t3.review_round // 1) + 1),
      cr_reason: "ops OPS-GREEN OVERTURNED by router RAW-verification (false-green). WATCHDOG_MANIFEST has 3/16 job-name keys that mismatch recorded cron_job_runs.job_name => false 'has never run' alerts + watchdog blind to those 3 jobs. FIX: (A) correct keys ohlcvDailyAggregatorJob->ohlcv-daily-aggregator, foreignFlowAlert->foreignFlowAlertJob, taOhlcvBackfill->ta-ohlcv-backfill (verify against the literal each job records under via recordJobRun/wrapRun); (B) add manifest-integrity test asserting every manifest key exists in canonical job-name set (fail-loud, generic guard vs future drift); (C) NOTE secondary: flat cadence model flags weekday-only summary jobs on weekends — raise with architect if non-trivial, not a hard blocker. After fix: tsc 0 + bun watchdog tests green (incl new integrity test) before re-handing to ops. Genuine finding to SPIN OUT separately: baseRateComputationJob is 20.78d stale (weekly job actually broken).",
      ops_deploy_note: "Image 13:28:53Z deployed LIVE (82 cron keys, 13 peers healthy, no 500) — the DEPLOY itself was clean; only the manifest correctness failed. dev fix is code-only; ops will targeted-rebuild again after."
    })
  ])
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T3-ARCH-CRON-WATCHDOG",
    next_agent: "dev-mcp-server",
    note: "T3-ARCH-CRON-WATCHDOG CHANGES_REQUESTED -> dev-mcp-server. ops OPS-GREEN OVERTURNED by router RAW-verify (false-green): WATCHDOG_MANIFEST 3/16 keys mismatch recorded job_name (ohlcvDailyAggregatorJob/foreignFlowAlert/taOhlcvBackfill) => false 'never ran' alerts + monitor blind to those 3. Fix manifest keys + add manifest-integrity test (generic guard). baseRateComputationJob 20d-stale = genuine finding to spin out. WIP=1 same-zone serialized. ARCH-SHIP-WAVE-REAUDIT PARKED."
  }
