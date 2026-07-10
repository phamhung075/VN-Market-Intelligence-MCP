# Board flip: FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD READY -> REVIEW
#
# dev-mcp-server implementation complete. bctcPdfPullJob.ts's automatic
# post-pull /pek-extract trigger (FIX-BCTC-D3B, committed 850ced6ee) now
# client-side pre-checks isVnMarketHours(now) (reused from
# domain/services/freshnessSlaChecker.ts, NOT reinvented) immediately before
# the triggerPekExtraction call and skips the call entirely when the market
# is open (02:00-08:59 UTC) — pdf-extractor's own Layer-2 guard already 503s
# that call every time, so this avoids a guaranteed-failure round-trip +
# noisy 503 log spam every ~30 min. PM option A (design doc §Risk flags
# R-HIGH-2), implemented as recommended, no override needed.
#
# GUARD-THE-CALL-ONLY, NOT-THE-STATE-MACHINE: the unconditional
# `updatePekTriggered.run(row.id)` write (row -> 'pek_triggered') is
# untouched either way — bctcExtractReconcileJob.ts (D3C, committed
# 43f4c8a22) re-fires/re-checks later once market hours have passed.
#
# Full implementation detail (design decisions, test breakdown, verification
# results) in status_note below — mirrors this task's own decision-journal
# entry (docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md)
# and notebook (docs/agent-memory/notebooks/dev-mcp-server.md).
#
# Precedent: scripts/dev-fix-bctc-d3c-reconcile-job-ready-to-review.jq
# (same guard-refuse-unless-correct-lane-and-status convention).
#
# GUARD: refuse unless FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD is in ready[]
# with status READY.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/dev-fix-bctc-r-high-2-market-hours-guard-ready-to-review.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.ready // []) as $rd
| ([$rd[] | select(type=="object" and .id=="FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD")][0]) as $t
| if $t == null then error("FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD not in ready[] — refuse")
  elif ($t.status != "READY") then error("FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD status != READY (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "REVIEW",
    started_at: $now,
    updated_at: $now,
    updated_by: "dev-mcp-server",
    next_agent: "qa",
    commit: "pending",
    files: [
      "apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts",
      "apps/mcp-server/src/__tests__/bctc-pdf-pull-job.test.ts"
    ],
    status_note: "Added a client-side isVnMarketHours(now) pre-check immediately before the deps.triggerPekExtraction call in bctcPdfPullJob.ts's Step 6 block (line ~636, if(shellRow) branch) — reused the EXISTING shared helper from domain/services/freshnessSlaChecker.ts (isVnMarketHours(now: Date = new Date())), imported not reinvented; verified via RAW read+grep that no new market-hours math was written. NOTE for QA: the dispatch prompt's claim that vpsProxyWatchdogJob.ts/priceUpdateWatchdogJob.ts/vpsHealthPoller.ts 'already import and reuse' this exact helper is factually incorrect (RAW-verified: each defines its OWN separate isVnMarketHoursUtc/isVnMarketHoursAt function, none import from freshnessSlaChecker.ts) — this does not change which helper is correct to reuse here (freshnessSlaChecker.ts's isVnMarketHours IS the canonical helper already reused by freshnessSlaMonitorJob.ts, coverageMapFreshnessChecker.ts, vpsProxyHealthHandler.ts, vpsProxyTools.ts, slaStatusTools.ts — same scheduler/financial-reports precedent-adjacent family bctcPdfPullJob.ts belongs to), just flagging the prompt's own factual error since PRE-CLAIM verification is mandatory. BEHAVIOR: if(shellRow && isVnMarketHours(now)) -> log a clear skip reason (ticker + reportId) and do NOT call triggerPekExtraction; else if(shellRow) -> call exactly as before (unchanged); else -> pre-existing shellRow-null branch, completely untouched, unaffected by the guard either way (shellRow falsy short-circuits before isVnMarketHours is even evaluated). The unconditional `updatePekTriggered.run(row.id)` call immediately after the if/else-if/else block was NOT touched/gated — confirmed by diff: the guard only wraps the network-call decision, the row ALWAYS still advances to pek_triggered on this cycle regardless of which branch fired, exactly matching the router's 'guard the network call only, not the state machine' instruction. Added opts.now?:Date (default new Date()) to runBctcPdfPullJob's signature so the guard is deterministically testable (production caller in schedulerJobTable.ts passes no opts, so defaults to real wall-clock — zero behavior change in production). TESTS: extended the existing bctc-pdf-pull-job.test.ts (731L pre-task; judged large-but-still-extendable rather than large-and-hard-to-extend, so extended in place per the task's own either/or framing) with TC-18/TC-19/TC-20 (3 new, 9 new expect() calls) plus pinned an explicit off-hours `now: OFF_HOURS_NOW` (2026-07-06T09:30:00Z, Monday after 08:59 UTC close) into the 3 PRE-EXISTING D3B tests that assert triggerPekExtraction IS called (TC-14, TC-15, TC-16) — those 3 did not pass `now` before this task and would have become wall-clock-flaky (silently start failing whenever the suite happens to run during 02:00-08:59 UTC on a weekday) the moment the new guard shipped; this is a direct, in-scope consequence of adding the guard, not scope creep. TC-18: isVnMarketHours(MARKET_HOURS_NOW)=true (2026-07-06T04:00:00Z, same Monday, inside market hours) -> triggerPekExtraction NOT called (pekCalled=false) AND queue row still lands at pek_triggered AND result.downloaded=1 (asserts both halves of the 'guard the call, not the state machine' contract in one test). TC-19: isVnMarketHours(OFF_HOURS_NOW)=false -> triggerPekExtraction IS called (pekCalled=true), confirming the false-branch baseline explicitly (isolated from TC-14's call-contract assertions). TC-20: shellRow-null branch (financial_reports table dropped, same technique as pre-existing TC-17) run under MARKET_HOURS_NOW specifically -> pekCalled=false for the PRE-EXISTING reason (no report_id available), not the new guard's reason (shellRow falsy short-circuits the `&&` before isVnMarketHours(now) is ever evaluated) -> row still pek_triggered. All 3 new tests include an isVnMarketHours(...) sanity-check assertion on the fixed clock itself (matching this codebase's existing convention in FIX-BCTC-SLA-WEEKEND.test.ts/FIX-SLA-WEEKEND-AWARE.test.ts) so a future change to isVnTradingDay's holiday/weekend table cannot silently invalidate these fixed dates without a visible failure. VERIFICATION: bun tsc --noEmit clean (both files). scripts/audits/mock-guard.sh --files on both touched files: PASS. bctc-pdf-pull-job.test.ts standalone: 26/26 pass, 80 expect() calls (was 23 tests/71 calls pre-task). 4 closest sibling files run standalone (FIX-BCTC-D3A-PEK-TRIGGER-HELPER.test.ts, bctc-extract-reconcile-job.test.ts, FIX-BCTC-ENRICH-SILENT-0ROWS.test.ts, FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts): 26/26 pass, 114 expect() calls, zero regression (none of these 4 pin `now` and none touch the new guard's if(shellRow) branch in a way that depends on real wall-clock market-hours state at the time this suite ran, ~14:41 UTC = off-hours; residual finding, not in R-HIGH-2's DO-NOT-TOUCH-listed scope: FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts's own triggerPekExtraction-call assertions do not pin `now` either and could in principle become wall-clock-flaky during an actual 02:00-08:59 UTC CI run — flagging for a future task, not fixing here since that file is outside this task's exact scope). Full BCTC-scoped suite verification: bare `bun test` hangs in this sandbox (confirmed live this cycle — killed after 2min CPU with zero output, same documented S29-S33 issue) so used the canonical scripts/ci-per-file-isolation.sh host-safety runner instead — pass/fail counts and any pre-existing-hang attribution appended by router/QA from that run's actual output. toolCount unchanged (no MCP tool file touched — bctcPdfPullJob.ts is a scheduler/interface file, not a tool registration file). No scheduler cron registration touched (CRONS.bctcPdfPull's existing */30 * * * * cadence and schedulerJobTable.ts wiring are both completely untouched by this diff — confirmed via git diff --stat). Diff is genuinely minimal: 1 new import line, +1 opts field (+3 doc lines), +1 local `now` assignment, the if(shellRow)->if(shellRow && isVnMarketHours(now))/else-if(shellRow) restructure (net +11 lines incl. comments) at the exact call site, zero refactor of the surrounding function. Board READY->REVIEW via orch-apply.sh, next_agent=qa. NOT committed — router RAW-verifies and commits per this session's established D1/D2/D3A/D3B/D3C dispatch discipline."
  }) as $review
| .task_board.ready = [$rd[] | select(.id != "FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD")]
| .task_board.review = ((.task_board.review // []) + [$review])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "dev-mcp-server"
