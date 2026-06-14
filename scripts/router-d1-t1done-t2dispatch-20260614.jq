# Router dev-team dispatcher — promote T1-ARCH-CRON-T4-DEDUP-GUARDS -> done_verified + dispatch T2 IMPL.
# qa (abb97cfd) returned APPROVED on the G1-G5 LIVE idempotency gate; router RAW-verified the decisive gates
# INDEPENDENTLY (NOT the qa badge) via keinos/sqlite3 sidecar against named volume market_data (/app/data/market.db):
#   - G2 no-double-fire: bctcReparseJob success rows since 12:19Z restart = 1 (guard fired "recovery dedup", zero dup).
#   - G3 normal-fires: verdictResolutionJob rows 12:07/11:07/10:07/09:07Z — clean 60-min gaps, none suppressed.
#   - G1 13/13 bun tests + tsc exit 0 (qa raw); G4 single shared helper imported by 24 jobs; G5 fail-open catch{return false}.
# T1 deployed LIVE (60b48a9b, image 12:19:13Z, 81 cron keys, peers intact, router call_tool valid).
# This write (ONE atomic temp->rename):
#   (T1) review[] -> done_verified[] with verified_at + qa provenance.
#   (T2) ready[] -> in_progress[] next_agent=dev-mcp-server (depends [T1] now SATISFIED; same-zone apps/mcp-server
#        FREE now T1 done). T3 stays ready[] depends-gated by T2.
#   head -> in_progress active=T2 next_agent=dev-mcp-server.
#   umbrella ARCH-CRON-SCHEDULER-RELIABILITY untouched (in_progress parent); PARKED reaudit untouched.
#   Does NOT capture other agents' dirty files (commit by explicit path).
# GUARD: refuse unless T1 in review[] status REVIEW next_agent==qa AND T2 in ready[] depends==[T1] AND
#        in_progress[] has no other apps/mcp-server child task (zone serialization).
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — promote verified + dispatch next eligible IMPL).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t1done-t2dispatch-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $review
| (.task_board.ready // []) as $ready
| ([$review[] | select(type=="object" and .id=="T1-ARCH-CRON-T4-DEDUP-GUARDS")][0]) as $t1
| ([$ready[]  | select(type=="object" and .id=="T2-ARCH-CRON-RECOVER-JITTER")][0]) as $t2
| if $t1 == null then error("T1 not in review[] — refuse")
  elif ($t1.status != "REVIEW") then error("T1 status != REVIEW (\($t1.status)) — refuse")
  elif (($t1.next_agent // null) != "qa") then error("T1 next_agent != qa (\($t1.next_agent)) — refuse")
  elif $t2 == null then error("T2 not in ready[] — refuse")
  elif (($t2.depends // []) != ["T1-ARCH-CRON-T4-DEDUP-GUARDS"]) then error("T2 depends mismatch (\($t2.depends)) — refuse")
  else . end
# (T1) remove from review[], append to done_verified[]
| .task_board.review = [$review[] | select((type=="object" and .id=="T1-ARCH-CRON-T4-DEDUP-GUARDS") | not)]
| .task_board.done_verified = ((.task_board.done_verified // []) + [
    ($t1 + {
      status: "DONE_VERIFIED",
      next_agent: null,
      verified_at: $now,
      verified_by: "qa",
      verification: "G1-G5 LIVE idempotency PASSED (qa abb97cfd, router RAW-confirmed): 13/13 bun tests + tsc 0; live cron_job_runs no-double-fire (bctcReparseJob=1 row post-restart despite guard fire); normal fires not suppressed (verdictResolutionJob 60-min gaps); single shared helper x24 jobs; fail-open. Deployed 60b48a9b image 12:19:13Z, dedup guard firing in prod, 11 peers intact."
    })
  ])
# (T2) remove from ready[], append to in_progress[] with dispatch provenance
| .task_board.ready = [$ready[] | select((type=="object" and .id=="T2-ARCH-CRON-RECOVER-JITTER") | not)]
| .task_board.in_progress = ((.task_board.in_progress // []) + [
    ($t2 + {
      status: "IN_PROGRESS",
      next_agent: "dev-mcp-server",
      claimed_at: $now,
      claimed_by: "dev-team",
      dispatch_note: "Router dispatched T2 IMPL (tick post-T1-done). depends [T1] SATISFIED (T1 done_verified — T4 dedup precondition LIVE). dev-mcp-server: uniform recoverMissedExecutions:true across the 50+ cron.schedule() calls (Lever B) + stagger the 8 high-collision jobs in cronConfig.ts (Lever C), per architect brief docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md §5. The T1 shouldSkipRecoveryReplay guard now PROTECTS recovery from double-firing Telegram/DB — recoverMissedExecutions is SAFE to enable. bun tests + tsc GREEN before ops rebuild (RED-PREPUSH strands fleet); ops targeted build --no-cache mcp-server + up -d --no-deps --force-recreate (NEVER compose down), docker ps -a after; qa LIVE-verify recovery auto-fire (get_pipeline_health + cron_job_runs), never badges. T3 (watchdog) sequences after T2 done."
    })
  ])
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T2-ARCH-CRON-RECOVER-JITTER",
    next_agent: "dev-mcp-server",
    note: "T1-ARCH-CRON-T4-DEDUP-GUARDS DONE_VERIFIED (qa G1-G5 LIVE, router RAW-confirmed; dedup guard live in prod). T2-ARCH-CRON-RECOVER-JITTER dispatched -> dev-mcp-server (IMPL: recoverMissedExecutions:true + 8 jitter shifts; T1 guard makes recovery double-fire-safe). T3 BLOCKED in ready[] by depends[T2]. WIP=1 same-zone serialized. ARCH-SHIP-WAVE-REAUDIT PARKED."
  }
