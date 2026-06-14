# Router dev-team dispatcher — advance FIX-REFINE-LOCK-TTL-RECLAIM ops-deploy-GREEN -> qa (FINAL LIVE gate).
# ops a1d2dd21 returned GREEN. Router RAW-RE-VERIFIED INDEPENDENTLY (not the ops badge):
#   PEERS: docker ps = 13 Up, all (healthy); mcp-server freshly Up 48s; image 674f872db96d MATCHES ops claim; no peer destroyed
#     (no docker compose down). REBUILD-RECREATE-DESTROYS-PEERS avoided.
#   IMAGE CHANGE: mcp-server container now runs 674f872db96d (rebuilt with the new test file) — confirmed via docker inspect.
#   ORPHAN STATE: task_force_release_orphan{bctc-refine:bdcfa5e0} returned {"released":false,"reason":"lock_not_found"} —
#     the orphan lock had already self-expired (TTL finally lapsed) before ops fired; NO orphan currently held. Combined with the
#     shipped flow fix (release now carries owner_agent), the orphan class cannot recur after the next rebuild.
#   REFINE UNBLOCKED (decisive, router probed gateway directly): get_bctc_pending_refine(limit:3) returns 3 claimable PENDING
#     reports with text_status COMPLETE and windows enumerating cleanly — 65a9c724 (VCB Q1.2025, 54p/21 windows),
#     918a7abd (HPG Q4.2025, 24p/15w), c765098b (GVR_2026_Q1, 5p/5w). No lock blocks the queue; next refine-bctc-slot fire claims.
# This write (ONE atomic temp->rename): FIX-REFINE-LOCK-TTL-RECLAIM review[] -> qa[]; status REVIEW->QA; next_agent ops->qa;
#   records ops_deploy_verdict + router_live_verdict + qa_instructions. head -> status=qa/active=FIX-REFINE-LOCK/next_agent=qa.
#   umbrella ARCH-CRON-SCHEDULER-RELIABILITY stays in_progress (passive Mon-gate). PARKED reaudit untouched. Dirty tree untouched.
# GUARD: refuse unless task in review[] with status REVIEW and next_agent=="ops".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — ops-green advance to qa LIVE gate).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-refine-lock-ops-to-qa-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM")][0]) as $t
| if $t == null then error("FIX-REFINE-LOCK-TTL-RECLAIM not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("status != REVIEW (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "ops") then error("next_agent != ops (\($t.next_agent)) — refuse")
  else . end
| .task_board.review = [$rv[] | select((type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM") | not)]
| .task_board.qa = ((.task_board.qa // []) + [
    ($t + {
      status: "QA",
      next_agent: "qa",
      ops_deployed_at: $now,
      ops_deploy_verdict: "GREEN (ops a1d2dd21): targeted build --no-cache mcp-server + up -d --no-deps --force-recreate; image 674f872db96d; 13 peers Up/healthy (no teardown); 82 cron keys; no Bun-JIT 'symbol to a string'; orphan-clear returned lock_not_found (already self-expired).",
      router_live_verified_at: $now,
      router_live_verified_by: "dev-team",
      router_live_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the ops badge). docker ps: 13 Up all (healthy), mcp-server Up 48s image 674f872db96d MATCHES ops claim, no peer destroyed. ORPHAN: task_force_release_orphan{bctc-refine:bdcfa5e0}={released:false,reason:lock_not_found} -> no orphan held (self-expired). REFINE UNBLOCKED (router probed get_bctc_pending_refine directly): 3 claimable PENDING reports return cleanly (VCB Q1.2025 21w / HPG Q4.2025 15w / GVR Q1 5w), windows enumerate, no lock blocks queue. Fix is GENERIC across ALL refine slots (shared flow doc) + FORWARD-protective (post-rebuild release now carries owner_agent).",
      qa_instructions: "FINAL LIVE GATE — gate-keeper, write Task Report, never accept a badge. Re-confirm INDEPENDENTLY: (1) git show c080313e — 4 flow-doc edits present (docs/agents/refine_bctc_md/flow/main.md: ttl_seconds 1800; owner_agent:'refine-orchestrator' on task_heartbeat ~L82, task_release ~L97, error-boundary task_release ~L101) AND the test file apps/mcp-server/src/__tests__/FIX-REFINE-LOCK-TTL-RECLAIM.test.ts is committed; (2) re-run IN THE LIVE CONTAINER (the rebuilt image 674f872db96d has the test file): docker exec <mcp-server> sh -c 'cd /app/apps/mcp-server && bun test src/__tests__/FIX-REFINE-LOCK-TTL-RECLAIM.test.ts' -> 5/5 pass; if the container lacks bun-test/devDeps, fall back to local cd apps/mcp-server && bunx tsc --noEmit (0) + bun test (5/5) and note the container couldn't self-run; (3) confirm T1 (expired->stolen:true) and T2 (live->claimed:false) are genuine branch exercises not tautologies by reading the test bodies (expiresAtOffset -10 vs +900); (4) LIVE unblock proof: call_tool get_bctc_pending_refine(limit:1) returns a claimable PENDING report (text_status COMPLETE, windows non-empty) — the refine queue is processable, no orphan lock. On qa-APPROVED -> router RAW-confirms -> promote FIX-REFINE-LOCK-TTL-RECLAIM done_verified. Commit Task Report by EXPLICIT PATH only (concurrent agent dirty tree: coverage-state.json, cowork-schedule.json, bctc-analyst.md, docs/signals/*.json — must NOT be captured).",
      ops_verified: $now
    })
  ])
| .head = {
    status: "qa",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-REFINE-LOCK-TTL-RECLAIM",
    next_agent: "qa",
    note: "FIX-REFINE-LOCK-TTL-RECLAIM ops deploy GREEN + router RAW-re-verified LIVE (independent, not the ops badge): 13 peers healthy, mcp-server image 674f872db96d, orphan lock_not_found (self-expired), get_bctc_pending_refine returns 3 claimable reports -> refine UNBLOCKED. -> qa FINAL LIVE gate + Task Report (re-run 5/5 in/against rebuilt container + live pending-refine probe). qa-APPROVED -> done_verified. FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP queued behind (same zone serialized). Umbrella ARCH-CRON-SCHEDULER-RELIABILITY held Mon 2026-06-15 G1/G2/G3. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 same-zone. Commit explicit path only."
  }
