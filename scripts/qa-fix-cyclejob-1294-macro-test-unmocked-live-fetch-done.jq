# Board flip: FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH REVIEW -> DONE
#
# RAW-verified independently by qa (did not trust dev-mcp-server's self-report):
# (1) `bun test src/__tests__/106-intelligence-cycle.test.ts` standalone: 25/25
#     pass, 60 expect(), ~100-150ms. Full log captured and grepped for
#     "[yahooFinance]"/"[sbv]"/"yahoo" — ZERO matches (exit 1), confirming no
#     live network fetch occurred (matches dev's own before/after runtime claim:
#     2.21s live-fetch-present -> ~150ms live-fetch-absent).
# (2) `bun test src/__tests__/1294-macro-spam-fix.test.ts` standalone: 2/2 pass.
#     Both files together: 27/27 pass, 67 expect() — exact match to dev's claim.
# (3) `bun tsc --noEmit`: clean, zero errors (apps/mcp-server).
# (4) `gh run view 29139234779 --json status,conclusion,headSha`: conclusion=
#     success, headSha=b4fda300a982791b124ef8788e06ff62abeb7a08 (exact match to
#     board commit field) — re-confirmed independently of the router's prior
#     check. Also confirmed the "bun test" CI job itself (not just an
#     unrelated lint job) is the one that succeeded (8/8 jobs green including
#     "bun test").
# (5) DJ-GATE-1: sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md contains a
#     substantive task-id-stamped entry (line 375+) with root-cause,
#     what-considered (2 real alternatives weighed), why-decision, why-change
#     — not a stub.
# (6) Sanity-checked the fix's own premise: grepped
#     intelligenceCycle/types.ts confirms macroFetchFn/vnstockSyncFn already
#     exist on CycleDeps; `git log -S macroFetchFn` on intelligenceCycleJob.ts
#     history confirms they were added in commit 8a2ef7255 (2026-06-12, CI-RED-
#     8081e584-FIX round 2, for the sibling 1285-macro-alert-cooldown test) —
#     genuinely pre-dates this fix. The dev's claim that the reopen note's
#     premise ("CycleDeps has NO ... injection points") was false is CONFIRMED
#     true.
# (7) `git show --stat b4fda300a`: exactly 1 file changed
#     (106-intelligence-cycle.test.ts, 23 insertions, 0 deletions) — zero
#     production code touched, confirming this is test-only root-cause fix,
#     not a band-aid or a scope-creeping production change.
# (8) Read the full diff + full file: confirmed NO_NET_BASE_DEPS
#     ({macroFetchFn, vnstockSyncFn} async no-ops) is spread into
#     NO_NET_MARKET_DEPS plus 6 other bespoke per-test deps literals (7 total
#     spread sites), and manually walked all 19 actual runIntelligenceCycle()
#     call sites in the file (6 via NO_NET_MARKET_DEPS in the market-hours
#     describe block, 2 direct + 2 via a shared `deps` var in the
#     outside-market-hours block, 2 via a shared `deps` var in the
#     concurrency-guard block, 2 direct in duration-tracking, 5 via
#     NO_NET_MARKET_DEPS in graceful-degradation) — every one now resolves
#     through a stub. Matches the observed zero-live-fetch-log-lines result
#     from (1) exactly, so the call-site coverage claim is genuine, not
#     approximate.
#
# VERDICT: sound root-cause fix — reused an already-existing, already-proven
# CycleDeps injection seam rather than adding a redundant new one; fully
# test-file-scoped; zero fake data; CI independently confirmed green on the
# exact claimed headSha.
#
# DJ-GATE-1: qa's own task-id-stamped entry —
# sprint-SYSTEMIC-REMAKE-P1-qa.md STEP qa-S51.
#
# GUARD: refuse unless FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH is in
# review[] with status REVIEW. .head/.task_board.head are both idle/null (not
# pointing at this task) — BOARD-ONLY move, .head left untouched, matching the
# standing D1-D3C/CI-RED-1a8c1bff-FIX guard convention.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-fix-cyclejob-1294-macro-test-unmocked-live-fetch-done.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH")][0]) as $t
| if $t == null then error("FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH status != REVIEW (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE",
    updated_at: $now,
    updated_by: "qa",
    qa_verdict: "APPROVED",
    completed_by: "qa",
    qa_reviewed_at: $now,
    qa_note: "APPROVED, DONE. RAW-verified independently (did not trust dev self-report): (1) 106-intelligence-cycle.test.ts standalone 25/25 pass, 60 expect(), full run log grepped for [yahooFinance]/[sbv]/yahoo -> ZERO matches, runtime ~100-150ms matching dev-claimed 2.21s(live)->~150ms(stubbed) delta. (2) 1294-macro-spam-fix.test.ts standalone 2/2 pass; both files together 27/27 pass, 67 expect() (exact match). (3) bun tsc --noEmit clean. (4) gh run view 29139234779: conclusion=success, headSha=b4fda300a982791b124ef8788e06ff62abeb7a08 exact match to board commit field, confirmed the bun test job itself (not an unrelated lint job) succeeded (8/8 jobs green). (5) DJ-GATE-1: sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md has a substantive task-id-stamped entry (root-cause/what-considered/why-decision/why-change), not a stub. (6) Sanity-checked fix premise: types.ts confirms macroFetchFn/vnstockSyncFn already on CycleDeps; git log -S macroFetchFn traces their introduction to commit 8a2ef7255 (2026-06-12, pre-dates this fix by weeks) -- the reopen note premise (no injection point exists) is confirmed FALSE, dev correctly reused the existing seam instead of adding a redundant one. (7) git show --stat b4fda300a: exactly 1 file changed, 23 insertions/0 deletions -- zero production code touched. (8) Manually walked all 19 actual runIntelligenceCycle() call sites in 106-intelligence-cycle.test.ts and confirmed every one now resolves through NO_NET_BASE_DEPS (directly or via NO_NET_MARKET_DEPS/a shared deps var) -- call-site coverage claim is genuine, matches the observed zero-live-fetch-log-lines result exactly, not approximate. VERDICT: sound root-cause fix, test-file-scoped, zero fake data, CI independently confirmed green on the exact claimed headSha. DJ-GATE-1 satisfied via qa's own entry sprint-SYSTEMIC-REMAKE-P1-qa.md STEP qa-S51."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH")]
| .task_board.done = ((.task_board.done // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "qa"
