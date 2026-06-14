# Router dev-team dispatcher — advance FIX-REFINE-LOCK-TTL-RECLAIM dev-impl-GREEN -> review/ops (targeted rebuild + orphan clear).
# dev-mcp-server a15e0ad1 returned GREEN (commit c080313e). Router RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge):
#   COMMIT HYGIENE: git show c080313e --stat = EXACTLY 3 explicit files (FIX-REFINE-LOCK-TTL-RECLAIM.test.ts +347/-4,
#     dev-mcp-server.md notebook, refine_bctc_md/flow/main.md 8 lines). Concurrent coverage-state.json + cowork-schedule.json (M)
#     + 5 docs/signals/*.json (??) NOT captured. Clean explicit-path commit.
#   FLOW-DOC EDITS (git show diff, all 4 load-bearing lines confirmed): L38 ttl_seconds 1000->1800 (Fix C);
#     L82 task_heartbeat +owner_agent:"refine-orchestrator" (Fix A); L97 task_release +owner_agent (Fix A);
#     L101 error-boundary task_release expanded prose->full call +owner_agent (Fix A). Matches brief a92ed301 §3 exactly.
#   GATES re-run locally by router (NOT relayed): cd apps/mcp-server && bunx tsc --noEmit -> EXIT 0, 0 error lines;
#     bun test src/__tests__/FIX-REFINE-LOCK-TTL-RECLAIM.test.ts -> 5 pass / 0 fail / 22 expect (326ms).
#   T1/T2 NON-TAUTOLOGICAL (verified in test source via dev return + my read): T1 inserts expiresAtOffset:-10 -> Step2 UPDATE
#     fires (changes=1) -> claimed:true stolen:true, new owner_agent written; T2 inserts +900 -> Step2 changes=0 -> Step3
#     SELECT current_holder -> claimed:false, original owner verified. T5 idempotency: two upserts same unit_id both row_count:1,
#     last-write confidence 0.85=v2 (INSERT OR REPLACE last-write-wins, no dup, no constraint error). coordinationStore UNCHANGED
#     (Fix B confirmed Step2 stale-steal + owner_agent heartbeat/release paths already correct).
# This write (ONE atomic temp->rename): FIX-REFINE-LOCK-TTL-RECLAIM in_progress[] -> review[]; status IN_PROGRESS->REVIEW;
#   next_agent dev-mcp-server->ops; records dev_impl_verdict + router_dev_reverify_verdict + ops_instructions (targeted rebuild
#   FOR THE TEST FILE — the flow fix itself needs NO rebuild, fleet-cron reads it live — PLUS the one-time orphan clear).
#   head -> status=review/active=FIX-REFINE-LOCK/next_agent=ops. umbrella ARCH-CRON-SCHEDULER-RELIABILITY stays in_progress
#   (passive Mon-gate). PARKED reaudit untouched. Other agents' dirty files untouched.
# GUARD: refuse unless task in in_progress[] with status IN_PROGRESS and next_agent=="dev-mcp-server".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — dev-green -> ops deploy/rebuild gate).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-refine-lock-dev-to-ops-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM")][0]) as $t
| if $t == null then error("FIX-REFINE-LOCK-TTL-RECLAIM not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("status != IN_PROGRESS (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "dev-mcp-server") then error("next_agent != dev-mcp-server (\($t.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t + {
      status: "REVIEW",
      next_agent: "ops",
      dev_impl_done_at: $now,
      dev_impl_commit: "c080313e",
      dev_impl_verdict: "GREEN (dev-mcp-server a15e0ad1, commit c080313e): Fix A owner_agent added to heartbeat L82 + release L97 + error-boundary release L101; Fix C ttl 1000->1800 L38; T1-T5 tests apps/mcp-server/src/__tests__/FIX-REFINE-LOCK-TTL-RECLAIM.test.ts; tsc 0; 5/5 pass; coordinationStore unchanged (Fix B already-correct confirmed).",
      router_dev_reverified_at: $now,
      router_dev_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge). git show c080313e --stat = exactly 3 explicit files; concurrent coverage-state/cowork-schedule/signals NOT captured. Flow-doc diff confirms all 4 edits (L38 ttl 1800, L82+L97+L101 owner_agent). Router re-ran locally: bunx tsc --noEmit EXIT 0 (0 error lines); bun test 5 pass/0 fail/22 expect. T1 stale-steal (expiresAtOffset:-10 -> claimed:true stolen:true) and T2 no-steal (+900 -> claimed:false current_holder) are real branch exercises, not tautologies. T5 double-push both row_count:1 last-write-wins. GENERIC across ALL refine slots (shared flow doc).",
      ops_instructions: "DEPLOY GATE — two actions, then hand to qa. (1) TARGETED REBUILD for the new test file only: cd repo root && docker compose build --no-cache mcp-server && docker compose up -d --no-deps --force-recreate mcp-server ; then docker ps -a to confirm 13 peers Up/healthy (NEVER docker compose down — rebuild-recreate-destroys-peers). The flow-doc fix itself needs NO rebuild (fleet-cron reads docs/agents/refine_bctc_md/flow/main.md live) — the rebuild is solely so qa's LIVE container has the test file. Verify image ID changed + no 'Cannot convert a symbol to a string' Bun-JIT line in startup logs. (2) ONE-TIME ORPHAN CLEAR to unblock the 6 stalled reports: call_tool(server='vn-market', tool='task_force_release_orphan', arguments={ task_id:'bctc-refine:bdcfa5e0', owner_agent:'refine-orchestrator', orphan_threshold_seconds:120 }) — RAW-verify the return shows released:true (or already-absent). Do this AFTER the rebuild so the cleared lock is not immediately re-orphaned by a mid-flight stale worker. Commit nothing except (if needed) your notebook by explicit path — concurrent agent dirty tree must NOT be captured. RETURN: image id, 13-peer health, orphan-clear raw result.",
      ops_dispatched_at: $now
    })
  ])
| .head = {
    status: "review",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-REFINE-LOCK-TTL-RECLAIM",
    next_agent: "ops",
    note: "FIX-REFINE-LOCK-TTL-RECLAIM dev-impl GREEN (commit c080313e) + router RAW-re-verified INDEPENDENTLY (git show 3 explicit files clean; tsc 0; 5/5 tests; T1 steal/T2 no-steal non-tautological; T5 idempotent). -> ops: (1) TARGETED rebuild mcp-server for the test file (flow fix needs no rebuild — fleet-cron live), 13 peers must stay Up, no down. (2) one-time orphan clear bctc-refine:bdcfa5e0 via task_force_release_orphan to unblock 6 reports. -> qa LIVE gate -> done_verified. FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP queued behind (same zone serialized). Umbrella ARCH-CRON-SCHEDULER-RELIABILITY held Mon 2026-06-15 G1/G2/G3. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 same-zone. Commit explicit path only."
  }
