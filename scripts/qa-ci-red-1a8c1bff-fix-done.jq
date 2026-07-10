# Board flip: CI-RED-1a8c1bff-FIX REVIEW -> DONE
#
# Router already independently RAW-verified: diff matches commit message/board
# status_note exactly, commit 43f4c8a22 (D3C) genuinely exists and touches
# schedulerJobTable.ts as claimed, FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS is a
# legitimately archived prior task, all 3 touched files pass locally (39/0)
# standalone, CI green on pushed HEAD 0d9226a91 (run 29122457852, differs from
# the original failing SHA 1a8c1bffb).
#
# QA's own independent gate (did not re-derive the above, ran the parts a
# router-level check can't cover):
# (1) Scrutinized item 3 (1352a done->pek_triggered, the one real regression-
#     test-semantics risk): read bctcPdfPullJob.ts full source — the terminal
#     write (updatePekTriggered.run()) still fires strictly AFTER
#     `await deps.triggerExtraction(...)` resolves; A-1's mid-flight
#     `statusDuringExtraction==="pending"` assertion is UNCHANGED by this diff
#     and would fail if the await were ever dropped — the original 1352a race
#     guard is genuinely still live, not a no-op weakening.
# (2) Read bctc-extract-reconcile-job.test.ts in full: counted exactly 14
#     it() cases (not trusted from the commit's paraphrase) covering
#     pek_triggered->done (3 independent per-table success paths + a
#     quarantine-exclusion negative case) and pek_triggered->enrich_failed
#     (exhausted-attempts, unresolved report_id, sendBugFn-throws-non-fatal) —
#     matches the "14 cases" claim exactly. This file was already
#     independently QA-approved in a prior cycle (own notebook cycle-431,
#     FIX-BCTC-D3C-RECONCILE-JOB, done_verified) — the reconcile-to-done
#     coverage this fix's commit message cites is real, not asserted.
# (3) Confirmed commit 43f4c8a22 adds exactly ONE bctcExtractReconcileJob
#     registration to schedulerJobTable.ts (grep count 2 = 1 import + 1
#     buildJobTable() entry, no duplicate) — justifies all 3 count bumps
#     (64->65, 57->58, 79->80) as a genuine single new registration, not a
#     miscounted/duplicated one.
# (4) Re-ran all 4 files fresh myself (the 3 touched + the reconcile-job test
#     the fix cites as covering the removed assertion): 53 pass/0 fail
#     (39 touched + 14 reconcile — matches claims exactly). `bun tsc --noEmit`
#     clean.
# (5) DDD/security scan run anyway despite Smart-Skip eligibility (test-only
#     diff): only pre-existing test-layer imports from ../infrastructure/*
#     and ../application/* (legal for __tests__, not domain code — unchanged
#     by this diff), zero process.env outside test cleanup, zero secrets.
#     mock-guard.sh --files on the 3 touched files: "No production source
#     files to scan. PASS." (confirms Smart-Skip premise — test-only diff).
#
# VERDICT: sound root-cause fix, not a rationalization weakening coverage.
# The 1352a race-condition contract this file exists to guard (extraction
# genuinely awaited before any status write) is unchanged and still
# exercised; only the terminal-state label was updated to match an already-
# shipped, already-QA-approved status model (D3B/D3C).
#
# DJ-GATE-1: no separate dev-mcp-server sprint DJ file for this fast-track
# one-liner-class fix (same as the CI-RED-06043b3c-FIX precedent, PO-ruled
# ACCEPTED there — po's own sprint-CI-RED-06043b3c-FIX-po.md point (C)): the
# decision is fully captured in the comprehensive fix commit message + board
# status_note + dev-mcp-server's own notebook entry. Satisfied instead via
# QA's OWN task-id-stamped entry per the decision-journal skill's own
# pre-verdict mandate: sprint-CI-RED-1a8c1bff-FIX-qa.md STEP qa-S1.
#
# GUARD: refuse unless CI-RED-1a8c1bff-FIX is in review[] with status REVIEW.
# .head.active_task_id is null (not pointing at this task) — per the standing
# D1-D3C guard convention, this is a BOARD-ONLY move; .head is left untouched.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-ci-red-1a8c1bff-fix-done.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="CI-RED-1a8c1bff-FIX")][0]) as $t
| if $t == null then error("CI-RED-1a8c1bff-FIX not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("CI-RED-1a8c1bff-FIX status != REVIEW (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE",
    updated_at: $now,
    updated_by: "qa",
    qa_verdict: "APPROVED",
    completed_by: "qa",
    qa_reviewed_at: $now,
    qa_note: "APPROVED, DONE. Router already independently RAW-verified diff/commit-provenance/CI-green-on-pushed-HEAD (run 29122457852, headSha 0d9226a91 differs from failing 1a8c1bffb) — did not re-derive. Scrutinized item 3 (1352a done->pek_triggered, the one real regression-test-semantics risk): read bctcPdfPullJob.ts full source — updatePekTriggered.run() still fires strictly AFTER await deps.triggerExtraction(...) resolves; A-1s mid-flight statusDuringExtraction===pending assertion is UNCHANGED by this diff and would fail if the await were ever dropped — the original 1352a race guard is genuinely still live, not weakened. Read bctc-extract-reconcile-job.test.ts in full: counted exactly 14 it() cases (not trusted from paraphrase) covering pek_triggered->done (3 independent per-table paths + quarantine-exclusion negative case) and pek_triggered->enrich_failed (exhausted-attempts/unresolved-report_id/sendBugFn-throws-non-fatal) — matches the 14 cases claim exactly; this file was already independently QA-approved in a prior cycle (own notebook cycle-431, FIX-BCTC-D3C-RECONCILE-JOB, done_verified). Confirmed commit 43f4c8a22 adds exactly ONE bctcExtractReconcileJob registration to schedulerJobTable.ts (grep count 2 = 1 import + 1 table entry, no duplicate) — justifies all 3 count bumps (64->65,57->58,79->80). Re-ran all 4 files fresh myself: 53 pass/0 fail (39 touched + 14 reconcile, matches claims exactly). tsc clean. DDD/security scan run despite Smart-Skip eligibility: only pre-existing test-layer infra/application imports (legal for __tests__), zero process.env outside test cleanup, zero secrets; mock-guard.sh confirms 0 production files in diff (Smart-Skip premise holds). VERDICT: sound root-cause fix, not a rationalization weakening coverage — the 1352a race-condition contract is unchanged and still exercised, only the terminal-state label was updated to match an already-shipped, already-QA-approved status model (D3B/D3C). DJ-GATE-1: no separate dev-mcp-server sprint DJ file (same accepted class as CI-RED-06043b3c-FIX precedent, po point (C)) — satisfied via QAs own task-id-stamped entry, sprint-CI-RED-1a8c1bff-FIX-qa.md STEP qa-S1, per the decision-journal skills own pre-verdict mandate. verification_gate=ci_green_on_subsequent_push satisfied (router-observed + independently re-run locally)."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "CI-RED-1a8c1bff-FIX")]
| .task_board.done = ((.task_board.done // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "qa"
