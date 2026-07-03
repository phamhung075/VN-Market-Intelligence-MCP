# Router board flip: FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD in_progress[] -> review[] on dev-mcp-server completion.
# dev-mcp-server aaed942e0ebc738ab RAW-verified (router 2026-07-03T16:00Z tick, post-completion):
#   - commit 8bc0b5b5 scoped to EXACTLY 3 files (bctcPdfPullJob.ts + FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts + decision journal)
#     — NO orch-state, NO board touch; 0 UUID leak; author report-analyzer.
#   - Guard code present & correct: module-level `let _isRunning=false` (L99), `if(_isRunning) return {skippedReason:"already_running"}` (L298-306),
#     `_isRunning=true` (L309), `_isRunning=false` in finally (L632) — verbatim reference pattern from runBreadthHistoryPersisterJob.
#     Additive `skippedReason?:"already_running"` field on BctcPdfPullResult (L163); sole caller startScheduler.ts reads only .downloaded (unaffected).
#   - Block-comment corruption self-caught+fixed (no stray `*/30` in JSDoc); test file 3 test() / 25 expect().
#   - Tests actually run (worker report): new test 3 pass/0 fail; +9 adjacent bctcPdfPull suites 104 pass/0 fail/336 expect; tsc --noEmit 0 errors.
#   - Not pushed (local ahead of origin; fleet-push owns push).
# Router owns the board flip (worker told NOT to touch .task_board). qa dispatched next to independently re-run tests + gate.
# Guards: error if not in in_progress[], error if already in review[].
# Usage: jq --arg now "$NOW" -f scripts/router-flip-pdfpull-guard-review-20260703T1600.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD"))[0]) as $t
| if $t == null then error("PDFPULL-GUARD not in in_progress[] — refuse to flip")
  elif ((.task_board.review | map(select(type=="object" and .id=="FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD")) | length) > 0) then error("PDFPULL-GUARD already in review[] — refuse dup")
  else . end
| .task_board.review += [
    ($t + {
      status: "REVIEW",
      moved_at: $now,
      moved_by: "router",
      dev_agent: "aaed942e0ebc738ab",
      dev_commit: "8bc0b5b5",
      raw_verify_note: "[router 2026-07-03T16:00Z] dev-mcp-server aaed942e0ebc738ab RAW-verified: commit 8bc0b5b5 scoped to exactly 3 files (bctcPdfPullJob.ts + FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts + decision journal), no orch-state/board, 0 UUID leak. Module-level _isRunning guard present & correct (L99/298/309/632, early-return skippedReason=already_running, cleared in finally) — verbatim breadthHistoryPersisterJob pattern. Additive skippedReason field, caller unaffected. Tests run: new 3/0, +9 adjacent 104/0, tsc 0 err. Not pushed. -> review[] for qa gate."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD"))
| .head += {
    status: "in_progress",
    active_task_id: "FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD",
    next_agent: "qa",
    next_action: "qa independently verifies FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD (dev commit 8bc0b5b5): re-run new test + adjacent bctcPdfPull suites, tsc --noEmit, DDD/security/mock-guard on the 1 changed production file (bctcPdfPullJob.ts), confirm changed-domain regression=0 vs testBaselineFail ceiling, write Task Report. On qa PASS: router promotes review->done_verified. qa MUST NOT touch .task_board.",
    updated_at: $now,
    updated_by: "router",
    note: "16:00Z: dev-mcp-server completed FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD (commit 8bc0b5b5, RAW-verified clean) -> flipped in_progress->review, dispatching qa gate."
  }
