# Board flip: FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS REVIEW -> DONE_VERIFIED
#
# QA round-1 gate. Router already independently re-ran+confirmed: new test
# file 6/6 pass 20 expect(), `bun tsc --noEmit` clean, mock-guard PASS on
# both changed files, full git-diff read confirming interface field add +
# both gate insertion points. Did NOT re-verify those mechanical facts --
# focused fresh-eyes review on 6 dispatcher-specified substance points:
#
# (1) Regression proof: read FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS.test.ts's
#     "serves real data unaffected for a legacy row at the DB DEFAULT
#     validation_status='pending'" case directly -- confirmed non-trivial:
#     asserts the real report header ("=== GATETEST4") AND a real fixture
#     value ("39" from netRevenue~39.5B), not just "doesn't throw". Cross-
#     checked bctc-schema.ts:818 -- DB DEFAULT genuinely is 'pending',
#     exactly matching the fixture's claim.
# (2) compare_financials per-period reporting: confirmed via the one-pending
#     test case that the message names ONLY the pending period ("2024-Q2"
#     present, "2024-Q1" explicitly asserted ABSENT) -- not a generic
#     "something's pending" message that loses which period.
# (3) Gate placement: read reports.ts directly -- pending-extraction gate
#     sits after the !row / !row1||!row2 branch and strictly BEFORE
#     checkBctcIdentityGuard in both tools (get_financial_summary L308-328
#     before L330-352; compare_financials L458-487 before L489-519).
#     Traced checkBctcIdentityGuard/ensureFinancialReportShellRow further:
#     a shell row's total_assets is genuinely NULL (column omitted from the
#     shell INSERT, no schema DEFAULT) -- the identity guard fails OPEN on
#     null (by its own docstring), so without this gate the row would have
#     silently rendered a "Confidence: 100%, Net Revenue: 0.0 ty VND"-style
#     reading (the exact D2-round-1 regression this task closes), not even
#     reaching a guard-caught "identity mismatch" message -- placement
#     before the guard is correct and load-bearing either way.
# (4) English boundary: read both new messages in full -- pure English,
#     matches reports.ts's own 404/period-not-found message convention, no
#     cross-import from bctcFullTools.ts's Vietnamese PUB-1 messages.
# (5) Scope: `git status --porcelain -- apps/mcp-server/` confirms exactly
#     2 files (1 modified: reports.ts, 1 new: test file) -- matches board
#     files:[] exactly, no scope creep.
# (6) No-fake-data lens: all 3 pending-extraction fixtures (get_financial_
#     summary case + both compare_financials cases) call the REAL
#     ensureFinancialReportShellRow usecase, confirmed by reading the
#     import + call sites directly -- not hand-rolled SQL. The 5 "real
#     data" legacy-row fixtures use a raw-SQL insertRealRow() helper, which
#     is the correct/necessary choice here (simulating pre-existing
#     already-extracted DB state with an explicit legacy validation_status
#     -- there is no real usecase that produces that state to call
#     instead); values are plausible (39.5B revenue / 80B assets / 50B
#     equity, chosen to also pass checkBctcIdentityGuard).
#
# Independently re-ran the new test file myself (not trusting router's
# count): 6 pass / 0 fail / 20 expect() -- exact match.
#
# Informational, non-blocking (dispatch flagged, not in scope): confirmed
# docs/agents/tools/list/compare_financials.md documents a DIFFERENT tool
# (module points at compareTools.ts, which actually registers
# "compare_stocks" with a `stocks` array param and a totally different
# output shape) -- the doc is genuinely stale/mismatched, not describing
# this task's compare_financials tool at all. Left untouched (out of scope).
#
# DJ-GATE-1: sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md has a task-id-
# stamped STEP present (line 329) before this review -- satisfied.
#
# GUARD: refuse unless FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS is in
# review[] with status REVIEW. .head.active_task_id currently points at
# the PARENT umbrella task (FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION), not
# this leaf sub-task -- per standing guard convention (D1/D2/D3a
# precedent scripts), this is a BOARD-ONLY move: .head is left untouched
# rather than blindly overwritten to a mismatched pointer.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-fix-bctc-serve-gate-financial-reports-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS")][0]) as $t
| if $t == null then error("FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS status != REVIEW (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    next_agent: "pm",
    updated_at: $now,
    updated_by: "qa",
    commit: "pending",
    qa_verdict: "APPROVED",
    qa_verified_at: $now,
    qa_verified_by: "qa",
    qa_note: "APPROVED. Router already independently re-ran/confirmed tests(6/6,20 expect())/tsc/mock-guard/diff-read — did not re-verify those, focused on the 6 dispatcher-specified substance points. (1) Regression-proof test read directly: legacy validation_status='pending' (DB DEFAULT, bctc-schema.ts:818) row asserts BOTH the real report header (\"=== GATETEST4\") AND a real fixture value (\"39\" from netRevenue~39.5B) — non-trivial, not just \"doesn't throw\". (2) compare_financials one-pending case confirmed the message names ONLY the pending period (\"2024-Q2\" present, \"2024-Q1\" explicitly asserted absent) — genuinely distinguishes which period, not a generic message. (3) Read reports.ts directly: pending-extraction gate sits strictly BEFORE checkBctcIdentityGuard in both tools (get_financial_summary L308-328 before L330-352; compare_financials L458-487 before L489-519). Traced further: a shell row's total_assets is genuinely NULL (omitted from the shell INSERT, no schema DEFAULT) so the identity guard fails OPEN on null by its own docstring — without this gate the row would have silently rendered a fabricated-looking \"Confidence:100%,NetRevenue:0.0 ty VND\" reading (the exact pre-fix regression), never even reaching a guard-caught message — placement before the guard is correct and load-bearing. (4) Both new messages read in full: pure English, matches reports.ts's own message convention, no cross-import from bctcFullTools.ts Vietnamese. (5) git status --porcelain confirms exactly 2 files touched, matches board files:[]. (6) All 3 pending-extraction fixtures call the REAL ensureFinancialReportShellRow usecase (import+call sites read directly); 5 legacy real-data fixtures use raw-SQL insertRealRow() by necessity (simulating pre-existing DB state, no real usecase produces it) with plausible values that also pass checkBctcIdentityGuard. Independently re-ran the new test file myself: 6 pass/0 fail/20 expect() — exact match. Informational (non-blocking, out of scope): confirmed docs/agents/tools/list/compare_financials.md documents a different tool (compareTools.ts actually registers compare_stocks, different params/output) — genuinely stale, left untouched. DJ-GATE-1 satisfied (sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md task-id-stamped entry present, line 329)."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "qa"
