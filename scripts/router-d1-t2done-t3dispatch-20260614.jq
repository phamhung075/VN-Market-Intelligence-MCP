# Router dev-team dispatcher — promote T2-ARCH-CRON-RECOVER-JITTER -> done_verified + dispatch T3 IMPL.
# qa (a96a29a2) returned APPROVED on the G1-G5 LIVE idempotency gate; router RAW-confirmed the decisive gates
# INDEPENDENTLY (NOT the qa badge) via keinos/sqlite3 sidecar (named volume /app/data/market.db) + docker logs + local build:
#   - G1 body-exec oracle: calibration_snapshots = 1 row for 2026-06-14 (plain INSERT body, no ON CONFLICT) => body
#     executed EXACTLY ONCE despite 4 cron_job_runs rows (the double-LOG cosmetic artifact). No duplicate side-effect.
#   - G2 T4 guard live + GENERIC: 'already ran within cadence window — skipping (recovery dedup)' fired for
#     calibrationReportJob @13:04:00.221+13:04:01.237 AND bctcReparseJob @13:03:49 AND verdictResolutionJob @13:07:01
#     — proves shouldSkipRecoveryReplay protects ALL recordJobRun-wrapped jobs, not calibration-special.
#   - G3 deepFetchMain/Vps idempotent keyed UPDATE (rag_analyses SET body_text=? WHERE id=?), no INSERT/Telegram (qa raw).
#   - G4 exactly 2 opt-outs intact (monthlySignalQualityAudit startScheduler:282, foreignFlowFetch :814); no new gap.
#   - G5 tsc --noEmit exit 0 + bun ARCH-CRON-recover-jitter.test.ts 18 pass / 0 fail (router re-ran locally).
#   ops RED on calibrationReportJob was a FALSE POSITIVE (read cron_job_runs double-LOG as double-FIRE) — overturned.
# T2 deployed LIVE (image 13:03:09Z, 81 cron keys, 12 peers healthy, router call_tool(get_market_snapshot) valid).
# This write (ONE atomic temp->rename):
#   (T2) review[] -> done_verified[] with verified_at + qa provenance.
#   (T3) ready[] -> in_progress[] next_agent=dev-mcp-server (depends [T2] now SATISFIED; same-zone apps/mcp-server
#        FREE now T2 done). umbrella ARCH-CRON-SCHEDULER-RELIABILITY untouched (in_progress parent, closes when T3 done).
#   head -> in_progress active=T3 next_agent=dev-mcp-server.
#   PARKED reaudit untouched. Does NOT capture other agents' dirty files (commit by explicit path).
# GUARD: refuse unless T2 in review[] status REVIEW next_agent==qa AND T3 in ready[] depends==[T2] AND
#        in_progress[] has no other apps/mcp-server CHILD task (only the umbrella parent allowed — zone serialization).
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — promote verified + dispatch next eligible IMPL).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t2done-t3dispatch-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $review
| (.task_board.ready // []) as $ready
| ([$review[] | select(type=="object" and .id=="T2-ARCH-CRON-RECOVER-JITTER")][0]) as $t2
| ([$ready[]  | select(type=="object" and .id=="T3-ARCH-CRON-WATCHDOG")][0]) as $t3
| if $t2 == null then error("T2 not in review[] — refuse")
  elif ($t2.status != "REVIEW") then error("T2 status != REVIEW (\($t2.status)) — refuse")
  elif (($t2.next_agent // null) != "qa") then error("T2 next_agent != qa (\($t2.next_agent)) — refuse")
  elif $t3 == null then error("T3 not in ready[] — refuse")
  elif (($t3.depends // []) != ["T2-ARCH-CRON-RECOVER-JITTER"]) then error("T3 depends mismatch (\($t3.depends)) — refuse")
  else . end
# (T2) remove from review[], append to done_verified[]
| .task_board.review = [$review[] | select((type=="object" and .id=="T2-ARCH-CRON-RECOVER-JITTER") | not)]
| .task_board.done_verified = ((.task_board.done_verified // []) + [
    ($t2 + {
      status: "DONE_VERIFIED",
      next_agent: null,
      verified_at: $now,
      verified_by: "qa",
      verification: "G1-G5 LIVE idempotency PASSED (qa a96a29a2, router RAW-confirmed INDEPENDENTLY via keinos sidecar + docker logs + local build): G1 calibration_snapshots=1 row 2026-06-14 (plain-INSERT body => 1 execution despite 4 double-LOGGED cron_job_runs); G2 'recovery dedup' guard fired GENERIC across calibrationReportJob+bctcReparseJob+verdictResolutionJob (T4 tier live); G3 deepFetch idempotent UPDATE-by-id no Telegram; G4 2 opt-outs intact (monthlySignalQualityAudit, foreignFlowFetch); G5 tsc 0 + 18/18 bun tests. ops RED (calibration double-fire) was FALSE POSITIVE — cron_job_runs double-LOG misread as double-FIRE; overturned. Deployed image 13:03:09Z, 81 cron keys, 12 peers healthy, recovery replays observed = Lever-B global default LIVE."
    })
  ])
# (T3) remove from ready[], append to in_progress[] with dispatch provenance
| .task_board.ready = [$ready[] | select((type=="object" and .id=="T3-ARCH-CRON-WATCHDOG") | not)]
| .task_board.in_progress = ((.task_board.in_progress // []) + [
    ($t3 + {
      status: "IN_PROGRESS",
      next_agent: "dev-mcp-server",
      claimed_at: $now,
      claimed_by: "dev-team",
      dispatch_note: "Router dispatched T3 IMPL (tick post-T2-done). depends [T2] SATISFIED (T2 done_verified — recoverMissedExecutions global default + jitter LIVE, idempotency invariant holds in prod). Same-zone apps/mcp-server FREE (T2 done). dev-mcp-server: implement schedulerWatchdogJob.ts (Lever D, every 10 min) per architect brief docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md §5/§7 — detect jobs whose last successful cron_job_run is older than (cron cadence + grace) and emit a WORK-channel staleness alert (dedup per job per window; do NOT auto-restart). Reuse cron_job_runs as the freshness source BUT account for the double-LOG artifact (FIX-CRON-JOB-RUNS-DOUBLE-LOG) — key on MAX(started_at) per job_name, never row counts. New job must itself be recoverMissedExecutions-safe (idempotent: keyed alert dedup, no unguarded Telegram). bun tests + tsc GREEN before ops rebuild (RED-PREPUSH strands fleet); ops targeted build --no-cache mcp-server + up -d --no-deps --force-recreate (NEVER compose down), docker ps -a after; qa LIVE-verify watchdog fires + dedups, never badges. T3 done CLOSES umbrella ARCH-CRON-SCHEDULER-RELIABILITY."
    })
  ])
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T3-ARCH-CRON-WATCHDOG",
    next_agent: "dev-mcp-server",
    note: "T2-ARCH-CRON-RECOVER-JITTER DONE_VERIFIED (qa G1-G5 LIVE, router RAW-confirmed: calibration_snapshots=1, generic recovery-dedup guard, tsc 0 + 18/18; ops RED overturned as cron_job_runs double-LOG false-positive). T3-ARCH-CRON-WATCHDOG dispatched -> dev-mcp-server (IMPL: schedulerWatchdogJob Lever D every 10min, MAX(started_at) freshness not row-count, idempotent alert dedup). T3 done closes umbrella ARCH-CRON-SCHEDULER-RELIABILITY. WIP=1 same-zone serialized. ARCH-SHIP-WAVE-REAUDIT PARKED."
  }
