# Router dev-team dispatcher — advance T2-ARCH-CRON-RECOVER-JITTER review/ops -> qa (LIVE idempotency gate).
# ops (a88beacd) deployed the T2 image and reported a RED ("calibrationReportJob non-idempotent double-fire").
# Router RAW-VERIFIED the ops claim INDEPENDENTLY and OVERTURNED it as a FALSE POSITIVE (verify-raw-not-badges
# cuts both ways — a RED badge can be wrong too):
#   DEPLOY GREEN:
#     - image rebuilt 2026-06-14T13:03:09Z (post-526e0c25 commit, post-12:58 board write); scheduler started,
#       "jobs registered — 81 cron keys"; 0 "Cannot convert a symbol to a string"; 13 containers, 12 peers healthy,
#       mcp-server health=starting (fresh recreate, expected); router OWN call_tool(get_market_snapshot) valid
#       (VN-Index 1791.65), no 500.
#     - recoverMissedExecutions replays observed in the NEW container (deepFetch 2x) = BEHAVIORAL proof T2 Lever-B
#       global default is LIVE in the deployed image.
#   IDEMPOTENCY INVARIANT HOLDS (ops RED disproven by direct side-effect evidence, NOT cron_job_runs row counts):
#     - calibrationReportJob: 4 cron_job_runs rows today (74291/74292 @13:00 old T1 img; 74297/74298 @13:04 new img).
#       BUT logs show the T1 dedup guard FIRED on the duplicates: "[calibrationReportJob] already ran within cadence
#       window — skipping (recovery dedup)" @13:04:00.221 + @13:04:01.237. recordJobRun applies shouldSkipRecoveryReplay
#       => calibrationReportJob satisfies T4 tier (architect safety-gate §6). DECISIVE: calibration_snapshots has
#       exactly 1 row for 2026-06-14 despite a PLAIN INSERT body (no ON CONFLICT) — proves the body executed ONCE;
#       2-4 executions would leave 2-4 rows. => 1 snapshot, 1 WORK Telegram. NO duplicate side-effect.
#     - deepFetchMainJob/deepFetchVpsJob: 2 rows each @13:05. Use jobRunRepo.wrapRun (NOT recordJobRun — no T4 guard)
#       but their ONLY side-effect is an idempotent keyed UPDATE (rag_analyses SET body_text=? WHERE id=?), no Telegram,
#       no INSERT => safe under replay (natural-idempotency tier). COMPLIANT.
#     - The extra cron_job_runs rows are the KNOWN cosmetic FIX-CRON-JOB-RUNS-DOUBLE-LOG artifact (deferred backlog) —
#       this is precisely what misled ops into reading double-LOG as double-FIRE. cron_job_runs is therefore NOT a
#       valid idempotency oracle; qa MUST verify via SIDE-EFFECT counts (snapshot rows, Telegram digests), not row counts.
#   ops PROPOSED FIX (opt calibrationReportJob out of recovery) is REJECTED — it is already T4-guarded; opting out would
#   REGRESS the design (drop legitimate missed weekly runs after a crash). NO code change required.
# This write (ONE atomic temp->rename): T2 in review[] next_agent ops->qa (status stays REVIEW = final gate);
#   head -> review/active=T2/next_agent=qa. T3 stays ready[] depends-gated; umbrella + PARKED reaudit untouched.
#   Does NOT capture other agents' dirty files (commit by explicit path).
# GUARD: refuse unless T2 in review[] with status REVIEW and next_agent=="ops".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — advance reviewed task to qa final gate).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t2-ops-to-qa-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $review
| ([$review[] | select(type=="object" and .id=="T2-ARCH-CRON-RECOVER-JITTER")][0]) as $t2
| if $t2 == null then error("T2 not in review[] — refuse")
  elif ($t2.status != "REVIEW") then error("T2 status != REVIEW (got \($t2.status)) — refuse")
  elif (($t2.next_agent // null) != "ops") then error("T2 next_agent != ops (got \($t2.next_agent)) — refuse")
  else . end
| .task_board.review = [$review[]
    | if (type=="object" and .id=="T2-ARCH-CRON-RECOVER-JITTER")
        then . + {next_agent:"qa", dispatched_at:$now, dispatched_by:"dev-team",
                  ops_verdict:"DEPLOYED 2026-06-14T13:03:09Z image (post-526e0c25): 81 cron keys, 12 peers healthy, 0 symbol-err, router call_tool valid. ops REPORTED RED (calibration double-fire) — router RAW-OVERTURNED as FALSE POSITIVE: T1 dedup guard fired on duplicate calibration ticks (recovery-dedup skip logs @13:04), calibration_snapshots=1 row proves body ran once (1 Telegram); deepFetch double-rows are idempotent keyed UPDATE (safe); extra cron_job_runs rows = known FIX-CRON-JOB-RUNS-DOUBLE-LOG cosmetic artifact. Idempotency invariant HOLDS; no code change.",
                  ops_red_adjudication:"ops a88beacd RED on calibrationReportJob REJECTED by router RAW-verification. Evidence: (1) recordJobRun applies shouldSkipRecoveryReplay -> calibrationReportJob is T4-guarded (safety-gate §6); guard logs 'already ran within cadence window — skipping (recovery dedup)' @13:04:00.221+13:04:01.237. (2) calibration_snapshots=1 row for 2026-06-14 despite plain-INSERT body => executed once. (3) ops proposed opt-out is WRONG: would drop legitimate missed weekly runs. deepFetchMain/Vps idempotent UPDATE-by-id, no Telegram. Cosmetic FIX-CRON-JOB-RUNS-DOUBLE-LOG misled ops.",
                  dispatch_note:"ops deploy RAW-verified GREEN by router; ops RED adjudicated as false-positive. qa: LIVE idempotency gate per docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md §6 — CRITICAL: cron_job_runs row-count is NOT a valid idempotency oracle (FIX-CRON-JOB-RUNS-DOUBLE-LOG double-logs single executions). Verify via SIDE-EFFECT counts ONLY: (G1) calibration_snapshots has exactly 1 row per snapshot_date in the restart window (plain INSERT body => row-count == body-exec-count); (G2) confirm 'recovery dedup' guard logs present for calibrationReportJob duplicate ticks (T4 tier live); (G3) deepFetchMain/Vps writes are idempotent UPDATE-by-id (re-read source, no INSERT/Telegram regression); (G4) the 2 opted-out non-idempotent jobs (monthlySignalQualityAudit, foreignFlowFetch) still have recoverMissedExecutions:false; (G5) bun ARCH-CRON-recover-jitter.test.ts green + tsc 0. On qa-green -> done_verified UNBLOCKS T3-ARCH-CRON-WATCHDOG (depends [T2]). If qa finds a GENUINE duplicate side-effect (2 snapshot rows OR 2 WORK digests for one period) -> CHANGES_REQUESTED back to dev-mcp-server."}
        else . end ]
| .head = {
    status: "review",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T2-ARCH-CRON-RECOVER-JITTER",
    next_agent: "qa",
    note: "T2-ARCH-CRON-RECOVER-JITTER ops-deployed (image 13:03:09Z, 81 cron keys, peers intact, call_tool valid). ops REPORTED RED (calibration double-fire) -> router RAW-OVERTURNED as FALSE POSITIVE (T1 dedup guard fired on replays, calibration_snapshots=1 row, deepFetch idempotent UPDATE, extra rows = cosmetic double-LOG). -> qa for G1-G5 LIVE idempotency gate (verify SIDE-EFFECT counts, NOT cron_job_runs). qa-green promotes done_verified + UNBLOCKS T3. WIP=1 same-zone serialized. ARCH-SHIP-WAVE-REAUDIT PARKED."
  }
