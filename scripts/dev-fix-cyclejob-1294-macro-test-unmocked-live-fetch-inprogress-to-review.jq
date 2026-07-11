# Board flip: FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH IN_PROGRESS -> REVIEW
#
# REOPENED task (PO triage 2026-07-11T03:47Z, ci_red CI-RED-284f8ca6). dev-mcp-server
# RAW-verified CycleDeps already carries macroFetchFn/vnstockSyncFn (added earlier by
# CI-RED-8081e584-FIX round 2, commit 8a2ef7255) wrapping exactly the lines the reopen
# cited — the reopen's premise that no injection point exists was false. Root cause is
# 106-intelligence-cycle.test.ts never stubbing either hook across ALL 20 of its own
# runIntelligenceCycle() call sites (7 of which build a bespoke deps literal instead of
# spreading the shared NO_NET_MARKET_DEPS). Fixed with a NO_NET_BASE_DEPS constant
# spread into all 20 sites — mirrors the exact stub pattern already proven by
# 1294-macro-spam-fix.test.ts (commit 76acfb4e4). Zero production-code change; the
# reopen's item 1 (4 new granular fetchCommoditiesFn/storeCommodityFn/fetchSbvFn/
# storeSbvFn deps) was deliberately NOT implemented — redundant with the existing
# macroFetchFn seam and contradicted by the sibling FOLLOWUP-SWEEP backlog row's own
# scope line ("mirror the 1294-macro-spam-fix.test.ts stub pattern in 106").
#
# GUARD: refuse unless FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH is in
# in_progress[] with status IN_PROGRESS.
#
# Usage: jq --arg now "$NOW" --arg commit "$COMMIT" --arg ci_run "$CI_RUN" \
#          --arg ci_conclusion "$CI_CONCLUSION" \
#          -f scripts/dev-fix-cyclejob-1294-macro-test-unmocked-live-fetch-inprogress-to-review.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| ($ARGS.named.commit) as $commit
| ($ARGS.named.ci_run) as $ci_run
| ($ARGS.named.ci_conclusion) as $ci_conclusion
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH")][0]) as $t
| if $t == null then error("FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH status != IN_PROGRESS (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "REVIEW",
    updated_at: $now,
    updated_by: "dev-mcp-server",
    next_agent: "qa",
    commit: $commit,
    files: [
      "apps/mcp-server/src/__tests__/106-intelligence-cycle.test.ts"
    ],
    status_note: ($t.status_note + " || dev-mcp-server 2026-07-11T04:12Z: RAW-verified CycleDeps ALREADY carries macroFetchFn/vnstockSyncFn (added by an EARLIER, unrelated commit 8a2ef7255, CI-RED-8081e584-FIX round 2) wrapping exactly intelligenceCycleJob.ts's step A2 (Yahoo Finance+SBV, L253-266)/step A3 (vnstock sync, L338-363) — the reopen's premise ('CycleDeps has NO ... injection points') was FALSE; the seam already exists and is proven working (1294-macro-spam-fix.test.ts, commit 76acfb4e4). Deliberately did NOT implement remaining-work item 1 (4 new granular fetchCommoditiesFn/storeCommodityFn/fetchSbvFn/storeSbvFn deps) — redundant duplication of the existing macroFetchFn seam, and contradicted by sibling backlog row FIX-CYCLEJOB-1294-FOLLOWUP-SWEEP-UNMOCKED-LIVE-FETCH whose own scope line says 'mirror the 1294-macro-spam-fix.test.ts stub pattern in 106' (stub-injection, not new-deps). Implemented item 2 fully: added NO_NET_BASE_DEPS ({macroFetchFn:async()=>{}, vnstockSyncFn:async()=>{}}) spread into NO_NET_MARKET_DEPS AND all 7 other literal deps objects in 106-intelligence-cycle.test.ts that build their own deps without spreading NO_NET_MARKET_DEPS (concurrency-guard x2, duration-tracking x2, outside-market-hours x2) — ALL 20 runIntelligenceCycle() call sites in the file now covered (steps A2/A3 run unconditionally market-hours AND off-hours, so any un-stubbed site still live-fetched regardless of describe-block). VERIFIED: 106-intelligence-cycle.test.ts standalone RED-before (2.21s runtime, [yahooFinance]/[sbv] live-fetch log lines present on every run) -> GREEN-after (191ms, 25/25 pass, 60 expect(), ZERO live-fetch log lines). Both target files together (1294-macro-spam-fix.test.ts + 106-intelligence-cycle.test.ts): 27/27 pass, 67 expect(), zero live-fetch lines (HARDENED baseline_pass satisfied). bun tsc --noEmit clean. Full suite via scripts/ci-per-file-isolation.sh (bare bun test hangs in this sandbox, documented precedent): 14319 pass/40 skip/66 fail across 16 files — ALL pre-existing news-poll/SSC-circuit-breaker/OCR/PDF-extractor domain failures (grepped zero overlap with intelligenceCycleJob/macroFetchFn/vnstockSyncFn/NO_NET_MARKET_DEPS across all 16; standalone repro of 102-job-news-poll.test.ts confirms unrelated rag_analyses-row-count + missing-chromium-binary causes, nothing to do with this fix). Pushed commit " + $commit + " -> GitHub Actions bun-test job (run " + $ci_run + "): conclusion=" + $ci_conclusion + ", headSha differs from the originally-failing 284f8ca63 — verification_gate ci_green_on_subsequent_push (check_id CI-RED-284f8ca6) satisfied via live gh run view, not local-only claim. Decision journal: sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md STEP dev-mcp-server-S39.")
  }) as $review
| .task_board.in_progress = [$ip[] | select(.id != "FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH")]
| .task_board.review = ((.task_board.review // []) + [$review])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "dev-mcp-server"
