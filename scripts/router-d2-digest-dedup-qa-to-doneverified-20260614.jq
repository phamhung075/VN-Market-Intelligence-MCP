# Router dev-team dispatcher — promote FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP qa-APPROVED -> done_verified (FINAL).
# qa a06b2c75 returned APPROVED (Task Report commit 00b0d614). A prior qa run (abce99ec) was blocked by host ENOSPC —
#   router cleared it (docker builder prune -f reclaimed 18.62GB build cache, 6.7Gi->23Gi free, all 13 containers untouched)
#   then re-dispatched; the misdiagnosis (claude-501 328K, not the cause) + recurring build-cache vector recorded to memory
#   [project-disk-full-lancedb-bloat] RECURRENCE 2026-06-14 with the durable fix (codify builder-prune into ops rebuild flow).
# Router RAW-RE-VERIFIED INDEPENDENTLY (not the qa badge, BIDIRECTIONAL — GREEN is verifiable too):
#   COMMIT HYGIENE: git show 00b0d614 --stat = EXACTLY 1 file (docs/agent-memory/sessions/2026-06-14-qa.md, +190) — no dirty
#     sweep. git show ccbe43ec --stat = EXACTLY 6 files (isoWeek.ts new 188, FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP.test.ts new 455,
#     coordinationTools.ts +56 get_week_period, digest-predict/flow/main.md 39, tran-ngoc-bau/flow/main.md 30,
#     cowork-team/spawn-fanout.md 6). Concurrent dirty tree (bctc-analyst.md, coverage-state.json, cowork-schedule.json M;
#     4 docs/signals ??) STILL uncommitted/untouched — NOT captured by either commit.
#   LIVE DUAL-TIME CONVERGENCE (decisive — router probed the GATEWAY directly at BOTH divergent dispatch times, not the qa relay):
#     get_week_period{date:2026-06-14T13:47:00Z} -> periodKey "2026-06-08/2026-06-14" weekLabel 2026-W24;
#     get_week_period{date:2026-06-14T13:52:00Z} -> periodKey "2026-06-08/2026-06-14" weekLabel 2026-W24. IDENTICAL periodKey from
#     both times -> both dispatch paths derive ONE key for the calendar week -> the week-label-string dedup failure is closed.
#     W25 off-by-one GONE; date-RANGE key makes last_fired staleness a non-vector. GENERIC across ALL guaranteed weekly slots
#     (shared isoWeek helper + get_week_period tool + both flow gates G-1/G-2 key on periodKey, forbid date +%G-W%V).
#   NO RE-POST: qa confirmed the dedup-block path (claimed!=true) logs+EXITs with no send_telegram; all sends live in weekly.md
#     reached only when claimed==true. Recurrence-prevention only — the 2026-06-14 digest already delivered (twice); no retraction.
# This write (ONE atomic temp->rename): FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP qa[] -> done_verified[]; status QA->done_verified;
#   next_agent qa->null; records qa_verdict + qa_report + router_final_verdict. head -> idle (task closed). Umbrella
#   ARCH-CRON-SCHEDULER-RELIABILITY stays in_progress (passive Mon-2026-06-15 G1/G2/G3 gate). ARCH-SHIP-WAVE-REAUDIT PARKED in
#   review untouched. ready/in_progress/review otherwise untouched. Concurrent dirty tree untouched.
# GUARD: refuse unless task in qa[] with status QA and next_agent=="qa".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — qa-APPROVED -> router promotes done_verified).
# Usage: jq --arg now "$NOW" -f scripts/router-d2-digest-dedup-qa-to-doneverified-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.qa // []) as $q
| ([$q[] | select(type=="object" and .id=="FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP")][0]) as $t
| if $t == null then error("FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP not in qa[] — refuse")
  elif ($t.status != "QA") then error("status != QA (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "qa") then error("next_agent != qa (\($t.next_agent)) — refuse")
  else . end
| .task_board.qa = [$q[] | select((type=="object" and .id=="FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP") | not)]
| .task_board.done_verified = ((.task_board.done_verified // []) + [
    ($t + {
      status: "done_verified",
      next_agent: null,
      qa_approved_at: $now,
      qa_commit: "00b0d614",
      qa_verdict: "APPROVED (qa a06b2c75, prior run abce99ec ENOSPC-blocked then router-unblocked): (1) git show ccbe43ec = exactly 6 files, grep CLEAN no forbidden concurrent-agent file; (2) tsc 0 + bun test 35 pass/0 fail/90 expect, non-tautological (RCA assertion tests the exact W25-producing instant -> asserts W24; year-boundary 2027-01-03 -> 2026-W53 via independent ISO Thursday-rule); (3) live dual-time probe against image 8a842a13a51d: 13:47Z and 13:52Z BOTH -> periodKey 2026-06-08/2026-06-14 weekLabel 2026-W24 (identical, convergence proven); (4) both flow docs (digest-predict + tran-ngoc-bau) PUBLISHED MARKER GATE G-1 get_week_period + G-2 PUBLISH_TASK_ID='published:<slot>:'+periodKey, both forbid date +%G-W%V, ttl 691200 (8d), pattern in spawn-fanout for future slots; (5) no re-post: dedup-block path logs+EXITs no send_telegram, sends only in weekly.md when claimed==true.",
      qa_report: "docs/agent-memory/sessions/2026-06-14-qa.md (commit 00b0d614, single file)",
      router_final_verified_at: $now,
      router_final_verified_by: "dev-team",
      router_final_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the qa badge). git show 00b0d614 = EXACTLY 1 file (qa Task Report +190); git show ccbe43ec = EXACTLY 6 files; concurrent dirty tree (bctc-analyst.md/coverage-state.json/cowork-schedule.json M + 4 docs/signals ??) STILL uncommitted, NOT swept by either commit. Router probed GATEWAY get_week_period at BOTH divergent dispatch times DIRECTLY: 13:47Z -> periodKey 2026-06-08/2026-06-14 W24; 13:52Z -> periodKey 2026-06-08/2026-06-14 W24 (IDENTICAL -> both paths converge on one key -> week-label-string dedup-failure CLOSED). W25 off-by-one gone; date-RANGE key defeats last_fired staleness. GENERIC across ALL guaranteed weekly slots (shared helper + get_week_period tool + both flow gates key on periodKey). Recurrence-prevention only; no re-post (2026-06-14 digest already delivered twice). Matches [Guaranteed-slot week-key double-post] memory lesson — class closed by keying mutex on calendar period date-range not derived label.",
      done_verified_at: $now
    })
  ])
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: null,
    next_agent: null,
    note: "FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP qa-APPROVED (a06b2c75, report 00b0d614) + router RAW-final-verified INDEPENDENTLY (git: qa report 1 file / impl 6 files / dirty tree untouched; gateway get_week_period dual-time 13:47Z & 13:52Z BOTH -> periodKey 2026-06-08/2026-06-14 W24, convergence proven) -> done_verified. Closes the guaranteed-slot week-key double-post class GENERICALLY (shared ISO-week helper + get_week_period tool + period-range mutex key across ALL weekly slots; both flow gates forbid date +%G-W%V). Recurrence-prevention only; no re-post. apps/mcp-server zone now FREE. Open: ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15 G1/G2/G3 LIVE gate (no active agent). ARCH-SHIP-WAVE-REAUDIT PARKED in review. PO backlog incl. NEW codify-builder-prune-into-ops-rebuild-flow (disk-full 3rd recurrence today), FIX-BASE-RATE-COMPUTATION-CRON-DEAD, ARCH-WATCHDOG-WEEKDAY-AWARE-THRESHOLD. head=idle, WIP free. Commit explicit path only."
  }
