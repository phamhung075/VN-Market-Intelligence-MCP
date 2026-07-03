# Router board promote: FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD review[] -> done_verified[] on qa PASS.
# qa a2b934f0e811f8d3f RAW-verified PASS (router 2026-07-03T16:30Z):
#   - commit 5a8bab990 scoped to EXACTLY 3 qa docs (report/qa-journal/qa-notebook) — no code, no orch-state, board untouched; 0 UUID leak; author report-analyzer.
#   - Evidence backed by REAL tool output (qa transcript): tsc --noEmit 0 errors; new test 3 pass/0 fail/25 expect (throw-path (c) genuinely executed);
#     6 suites importing bctcPdfPullJob.js together 66 pass/0 fail/239 expect; full suite 14236 pass/62 fail/5 err vs testBaselineFail=348 (62<<348).
#   - Changed-domain regression = 0: every (fail) line + unhandled-error block mapped to source, grep bctc|pdfpull|financial-report -> 0 hits
#     (filename-FP 1405b-bctc-vps-fixes inspected = pre-existing vps_push_log DB race, unrelated). DDD (scheduler outermost layer) OK; security/mock-guard PASS; DJ-GATE-1 satisfied (dev journal carried task-id).
#   - Diff = mechanical try/finally re-indent of existing body + _isRunning guard + additive skippedReason field; verbatim-shape match to breadthHistoryPersisterJob confirmed. Sole caller startScheduler.ts:361 reads only .downloaded (unaffected).
# Router owns the review->done_verified flip (qa told NOT to touch board).
# DEPLOY NOTE: guard is code-complete + qa-passed; takes effect on next mcp-server container rebuild (deploy-gated, NOT run this tick).
# Guards: error if not in review[], error if already in done_verified[].
# Usage: jq --arg now "$NOW" -f scripts/router-promote-pdfpull-guard-doneverified-20260703T1630.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.review | map(select(type=="object" and .id=="FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD"))[0]) as $t
| if $t == null then error("PDFPULL-GUARD not in review[] — refuse to promote")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD")) | length) > 0) then error("PDFPULL-GUARD already in done_verified[] — refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      promoted_at: $now,
      promoted_by: "router",
      qa_verdict: "PASS",
      qa_agent: "a2b934f0e811f8d3f",
      qa_commit: "5a8bab990",
      qa_report: "reports/TASK_REPORT_FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.md",
      qa_dod_note: "[router 2026-07-03T16:30Z] qa a2b934f0e PASS, transcript RAW-verified: commit 5a8bab990 scoped to exactly 3 qa docs (report/qa-journal/qa-notebook; no code, no orch-state, board untouched), 0 UUID leak. Real tool output: tsc 0 err; new test 3/0/25 (throw-path executed); 6 bctcPdfPullJob importers 66/0/239; full suite 14236 pass/62 fail/5 err vs testBaselineFail=348 (62<<348). Changed-domain regression=0 (all 62 fails + unhandled-errors mapped, grep bctc|pdfpull|financial-report -> 0; 1405b-bctc-vps-fixes FP = pre-existing vps_push_log race). DDD/security/mock-guard PASS; DJ-GATE-1 satisfied. Diff = mechanical try/finally reindent + _isRunning guard + additive skippedReason; caller startScheduler.ts unaffected. DEPLOY-GATED: guard takes effect on next mcp-server rebuild (NOT run)."
    })
  ]
| .task_board.review |= map(select(type != "object" or .id != "FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD"))
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD done_verified (qa PASS, dev commit 8bc0b5b5, qa commit 5a8bab990). DEPLOY-GATED: re-entrancy guard takes effect on next mcp-server container rebuild (not run). Dev loop idle -> next tick drains backlog (incl. PO-triaged PNJ repairs FIX-ALERT-COMMANDER-DEAD-NO-SLOT + FEAT-SEVERITY-OVERRIDE-SURFACING).",
    updated_at: $now,
    updated_by: "router",
    note: "16:30Z: dev-mcp-server FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD promoted review->done_verified (qa a2b934f0e PASS, RAW-verified). WIP now 0."
  }
