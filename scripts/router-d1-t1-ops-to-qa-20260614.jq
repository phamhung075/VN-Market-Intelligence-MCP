# Router dev-team dispatcher — advance T1-ARCH-CRON-T4-DEDUP-GUARDS review/ops -> qa (LIVE idempotency gate).
# ops (ae8cc4a0) deployed commit 60b48a9b; router RAW-verified (NOT the ops badge):
#   - mcp-server image rebuilt 2026-06-14T12:19:13Z (post-commit); /app/src/scheduler/startupHelpers.ts present
#     (15034 bytes, 3x shouldSkipRecoveryReplay). 60b48a9b = ancestor of HEAD.
#   - all 11 peer containers healthy/untouched (no compose-down damage).
#   - 0 "Cannot convert a symbol to a string" in logs; 81 cron keys registered; scheduler started.
#   - T4 dedup guard FIRING LIVE: "[bctcReparseJob] already ran within cadence window — skipping (recovery dedup)".
#   - router's OWN gateway call_tool(get_market_snapshot) -> valid fresh payload (VN-Index 1791.65, 12:23:47Z), no 500.
# This write (ONE atomic temp->rename): T1 in review[] next_agent ops->qa (status stays REVIEW = final gate);
#   head -> review/active=T1/next_agent=qa. T2/T3 stay depends-gated in ready[]; umbrella + PARKED reaudit untouched.
#   Does NOT capture other agents' dirty files (commit by explicit path).
# GUARD: refuse unless T1 in review[] with status REVIEW and next_agent=="ops".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — advance reviewed task to qa final gate).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-t1-ops-to-qa-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $review
| ([$review[] | select(type=="object" and .id=="T1-ARCH-CRON-T4-DEDUP-GUARDS")][0]) as $t1
| if $t1 == null then error("T1 not in review[] — refuse")
  elif ($t1.status != "REVIEW") then error("T1 status != REVIEW (got \($t1.status)) — refuse")
  elif (($t1.next_agent // null) != "ops") then error("T1 next_agent != ops (got \($t1.next_agent)) — refuse")
  else . end
| .task_board.review = [$review[]
    | if (type=="object" and .id=="T1-ARCH-CRON-T4-DEDUP-GUARDS")
        then . + {next_agent:"qa", dispatched_at:$now, dispatched_by:"dev-team",
                  ops_verdict:"DEPLOYED+LIVE-VERIFIED 60b48a9b: image 12:19:13Z, 81 cron keys, dedup guard firing (bctcReparseJob skip), peers intact, 0 symbol-err, router call_tool valid",
                  dispatch_note:"ops deploy RAW-verified by router. qa: LIVE idempotency gate G1-G5 per docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md — confirm cron_job_runs rows show NO double-fire on the recovery/replay path (shouldSkipRecoveryReplay 90%-cadence window), guard is NO-OP on normal scheduled fires, 13 unit tests green. On qa-green -> done_verified UNBLOCKS T2-ARCH-CRON-RECOVER-JITTER (depends [T1])."}
        else . end ]
| .head = {
    status: "review",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "T1-ARCH-CRON-T4-DEDUP-GUARDS",
    next_agent: "qa",
    note: "T1-ARCH-CRON-T4-DEDUP-GUARDS ops-deployed + router-RAW-verified LIVE (60b48a9b, dedup guard firing, peers intact, call_tool valid) -> qa for G1-G5 LIVE idempotency gate. qa-green promotes done_verified + UNBLOCKS T2. T3 stays depends-gated. WIP=1 (same-zone serialized)."
  }
