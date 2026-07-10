# Board flip: FIX-BCTC-D1-STABILIZE-REPORT-ID REVIEW -> DONE_VERIFIED
#
# QA full gate (beyond router's spot-check RAW-verify of the diff/new-test/
# tsc/lane): re-ran FIX-BCTC-D1-STABILIZE-REPORT-ID.test.ts fresh (3/3, 17
# assertions), tsc clean, DDD scan clean (application layer imports
# domain+infra only), mock-guard.sh PASS, no process.env/secrets. Ran all 13
# files that call parseBctcReport/storeReport (grep-derived, not just the new
# test file): 95/95 pass, zero regression. Grepped repo-wide for other
# `INSERT OR REPLACE INTO financial_reports` sites (router's explicit ask):
# found a second live production one in newsChainFallback.ts:348
# (tryNewsChainFallback, reachable via resolvePdfText.ts:232) with the same
# id-orphaning pattern this task fixes -- NOT touched by this diff, never in
# the architect's brownfield scan for this task. Confirmed via `git stash`
# A/B on parseBctcReport.ts alone that the one test exercising that 2nd site
# (1294b-bctc-fallback.test.ts) hangs identically pre-fix and post-fix --
# pre-existing sandbox/env hang, unrelated to this diff, not a new
# regression. Not blocking this narrowly-scoped D1 (design doc + board
# `files:` both scope D1 to parseBctcReport.ts only) -- flagged as a new
# non-blocking backlog finding for pm/architect instead (own board note,
# does not touch this row).
#
# GUARD: refuse unless FIX-BCTC-D1-STABILIZE-REPORT-ID is in review[] with
# status REVIEW. .head.active_task_id currently points at the PARENT
# decomposition task (FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION), not this leaf
# D1 sub-task -- per standing guard convention (see
# scripts/qa-factory-pdf-split-generic-md-table-done-verified.jq's own
# fallback comment), this is a BOARD-ONLY move: .head is left untouched
# rather than blindly overwritten to a mismatched pointer.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-fix-bctc-d1-stabilize-report-id-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-BCTC-D1-STABILIZE-REPORT-ID")][0]) as $t
| if $t == null then error("FIX-BCTC-D1-STABILIZE-REPORT-ID not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-BCTC-D1-STABILIZE-REPORT-ID status != REVIEW (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    next_agent: "pm",
    updated_at: $now,
    updated_by: "qa",
    qa_verified_at: $now,
    qa_verified_by: "qa",
    qa_note: "APPROVED. Full gate PASS beyond router spot-check: new test 3/3 (17 assertions) re-run fresh, tsc clean, DDD/security/mock-guard PASS, 95/95 pass across all 13 files calling parseBctcReport/storeReport (zero regression). Found a 2nd live INSERT OR REPLACE INTO financial_reports site in newsChainFallback.ts:348 (tryNewsChainFallback) with the same id-orphaning defect — out of D1's explicit scope (design doc + this row's files[] both scope parseBctcReport.ts only), pre-existing (confirmed via git-stash A/B, not a regression from this diff) — flagged as a new non-blocking backlog finding for pm/architect, does not block this row. next_agent set to pm to dispatch D2 FIX-BCTC-D2-ENSURE-SHELL-ROW next."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-BCTC-D1-STABILIZE-REPORT-ID")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "qa"
