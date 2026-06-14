# Router dev-team dispatcher — promote FIX-REFINE-LOCK-TTL-RECLAIM qa-APPROVED -> done_verified (FINAL).
# qa a1289f56 returned APPROVED (Task Report commit 04e4d965). Router RAW-RE-VERIFIED INDEPENDENTLY (not the qa badge):
#   COMMIT HYGIENE: git show 04e4d965 --stat = EXACTLY 1 file (docs/agent-memory/sessions/2026-06-14-qa.md, +103).
#     git show c080313e --stat = EXACTLY 3 files (test 332L + dev notebook 11L + flow doc 8L). Concurrent dirty tree
#     (bctc-analyst.md, coverage-state.json, cowork-schedule.json M; 5 docs/signals + digest-predict session ??) NOT captured.
#   LIVE UNBLOCK (router probed gateway get_bctc_pending_refine(limit:3) DIRECTLY — qa used DB fallback, router confirms via
#     tool layer): 3 claimable PENDING reports return cleanly — 65a9c724 (VCB Q1.2025, 54p/21w), 918a7abd (HPG Q4.2025, 24p/15w),
#     c765098b (GVR_2026_Q1, 33p/30w), all text_status COMPLETE, windows enumerate. No orphan lock blocks the queue. Both the
#     qa DB probe (task_locks LIKE 'bctc-refine:%' -> 0 rows) and the router gateway probe agree: refine UNBLOCKED.
#   TESTS: qa re-ran locally 5 pass/0 fail/22 expect (332ms) + tsc 0; container couldn't self-run (image copies src flat to
#     /app, no /app/apps/mcp-server) — qa noted honestly, local run authoritative. T1 (expiresAtOffset:-10 -> claimed/stolen,
#     owner_agent rewritten, expires_at renewed) and T2 (+900 -> claimed:false, current_holder=original) are real steal/no-steal
#     branch exercises, not tautologies. Matches router's own prior re-run (5/5, tsc 0) exactly.
# This write (ONE atomic temp->rename): FIX-REFINE-LOCK-TTL-RECLAIM qa[] -> done_verified[]; status QA->done_verified;
#   next_agent qa->null; records qa_verdict + qa_report + router_final_verdict. head -> idle (task closed; PO owns next sprint
#   planning per its 14:45 spin-out note — baseRateComputationJob + weekday-aware threshold). in_progress/review/ready untouched.
#   Concurrent dirty tree untouched.
# GUARD: refuse unless task in qa[] with status QA and next_agent=="qa".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — qa-APPROVED -> router promotes done_verified).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-refine-lock-qa-to-doneverified-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.qa // []) as $q
| ([$q[] | select(type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM")][0]) as $t
| if $t == null then error("FIX-REFINE-LOCK-TTL-RECLAIM not in qa[] — refuse")
  elif ($t.status != "QA") then error("status != QA (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "qa") then error("next_agent != qa (\($t.next_agent)) — refuse")
  else . end
| .task_board.qa = [$q[] | select((type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM") | not)]
| .task_board.done_verified = ((.task_board.done_verified // []) + [
    ($t + {
      status: "done_verified",
      next_agent: null,
      qa_approved_at: $now,
      qa_commit: "04e4d965",
      qa_verdict: "APPROVED (qa a1289f56): (1) commit c080313e = 4 flow-doc edits (ttl 1800; owner_agent on heartbeat+happy-release+error-release) + test file, 3 files captured, no dirty sweep; (2) tests 5/5 local + tsc 0 (container can't self-run — image flat-copies src to /app); (3) T1/T2 genuine steal/no-steal branch exercises; (4) live unblock: task_locks bctc-refine:% = 0 rows, market.db 3 PENDING text_status COMPLETE claimable.",
      qa_report: "docs/agent-memory/sessions/2026-06-14-qa.md (cycle-243)",
      router_final_verified_at: $now,
      router_final_verified_by: "dev-team",
      router_final_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the qa badge). git show 04e4d965 = 1 file (qa Task Report); c080313e = 3 files; concurrent dirty tree NOT captured. Router probed get_bctc_pending_refine(limit:3) via GATEWAY (qa used DB fallback) -> 3 claimable PENDING reports (VCB Q1.2025 21w / HPG Q4.2025 15w / GVR Q1 30w) all text_status COMPLETE, windows enumerate, no orphan lock. Fix is GENERIC across ALL refine slots (shared flow doc docs/agents/refine_bctc_md/flow/main.md) + FORWARD-protective (post-rebuild heartbeat/release now carry owner_agent -> restart-stable WHERE task_id=? AND owner_agent=? path -> orphan-after-rebuild class CLOSED). Closes recurring [Lock orphaned by rebuild] memory class.",
      done_verified_at: $now
    })
  ])
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: null,
    next_agent: null,
    note: "FIX-REFINE-LOCK-TTL-RECLAIM qa-APPROVED (a1289f56, report 04e4d965) + router RAW-final-verified INDEPENDENTLY (git: qa report 1 file / impl 3 files / dirty tree untouched; gateway get_bctc_pending_refine -> 3 claimable PENDING, no orphan lock) -> done_verified. UNBLOCKS refine queue; fix GENERIC across all refine slots + forward-protective (orphan-after-rebuild class CLOSED). apps/mcp-server zone now FREE -> FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (ready, same zone) is next dispatch. ARCH-SHIP-WAVE-REAUDIT PARKED in review. Umbrella ARCH-CRON-SCHEDULER-RELIABILITY already CLOSED by po-S50 (T3-ARCH-CRON-WATCHDOG done_verified). head=idle. WIP free. Commit explicit path only."
  }
