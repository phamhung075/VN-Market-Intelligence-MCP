# Router board promote: FIX-BCTC-BANK-BS-COLUMN-ORDER review[] -> done_verified[] on qa PASS.
# qa aa2e4ef5c2fe942c9 RAW-verified PASS (router 2026-07-03T08:38Z):
#   - commit 66dfe89a5 scoped to EXACTLY 4 qa docs (report/journal/notebook/handoff) — no code, no orch-state; forbidden CLEAN; board untouched.
#   - Evidence backed by REAL tool output (bounded grep counts on transcript): tsc 0 errors; targeted BCTC 389 pass/0 fail (23-file superset)
#     + COLUMN-ORDER standalone 16/0/54 (ctg-96e36139-real-e2e, exact match to router re-run); full suite 14230 pass / 65 fail / 6 err.
#   - Ceiling: testBaselineFail=348 (docs/data/project-stats.json) — 65 << 348. Changed-domain regression = 0, verified TWO ways
#     (grep all 65 (fail) lines for bctc/bank/refinedMarkdown/parseVnNumber/column-order/detectSection -> 0 hits; per-file mapping ->
#      all 65 pre-existing network/timing-flaky, incl. filename-FP 1405b-bctc-vps-fixes.test.ts inspected = logVpsPush DB-race, 0 changed-file imports).
#   - DDD/security/mock-guard clean on the 3 changed production files; DJ-GATE-1 satisfied.
# Router owns the review->done_verified flip per the dispatch contract (qa was told NOT to touch the board).
# Guards: error if not in review[], error if already in done_verified[].
# Usage: jq --arg now "$NOW" -f scripts/router-promote-column-order-doneverified-20260703T0838.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.review | map(select(.id=="FIX-BCTC-BANK-BS-COLUMN-ORDER"))[0]) as $t
| if $t == null then error("COLUMN-ORDER not in review[] — refuse to promote")
  elif ((.task_board.done_verified | map(select(.id=="FIX-BCTC-BANK-BS-COLUMN-ORDER")) | length) > 0) then error("COLUMN-ORDER already in done_verified[] — refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      promoted_at: $now,
      promoted_by: "router",
      qa_verdict: "PASS",
      qa_agent: "aa2e4ef5c2fe942c9",
      qa_commit: "66dfe89a5",
      qa_report: "reports/TASK_REPORT_FIX-BCTC-BANK-BS-COLUMN-ORDER.md",
      qa_gate: "PASS",
      qa_dod_note: "[router 2026-07-03T08:38Z] qa aa2e4ef5c2fe942c9 PASS, transcript RAW-verified: commit 66dfe89a5 scoped to exactly 4 qa docs (report/journal/notebook/handoff; no code, no orch-state), forbidden-clean, board-untouched. Evidence backed by real tool output: tsc --noEmit 0 errors; targeted BCTC 389 pass/0 fail (23-file superset) + COLUMN-ORDER standalone 16/0/54 (ctg-96e36139-real-e2e, matches router re-run); full suite 14230 pass / 65 fail / 6 err vs testBaselineFail=348 (65<<348). Changed-domain regression=0 verified 2 ways (grep 65 fail lines for bctc/bank/refinedMarkdown/parseVnNumber/column-order/detectSection -> 0 hits; per-file mapping -> all pre-existing network/timing-flaky incl. 1405b-bctc-vps-fixes logVpsPush DB-race inspected clean). DDD/security/mock-guard clean on 3 changed files; DJ-GATE-1 satisfied. DEPLOY-GATED FOLLOW-UP (out of scope for this fix): post-deploy finalize_bctc_refine on live CTG report 96e36139-5dac-414d-8e4d-20a4725890d1 in named-volume market.db still required to unfreeze live total_assets."
    })
  ]
| .task_board.review |= map(select(.id != "FIX-BCTC-BANK-BS-COLUMN-ORDER"))
| .head += {
    status: "in_progress",
    active_task_id: null,
    next_agent: "po",
    next_action: "Drain signal_queue NEW to=po rows + triage: repair_task_request dt-flowdefect-orphan-guard-20260703T0817Z -> backlog as FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (HIGH). A-13 HIGH sau-20260703T074552Z is self-resolved (INFO corroboration sau-2026-07-03T08:41:40Z) -> mark non-actionable. W5 chain (TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST + W5-FU-CTG-REFINE-96e36139) now code-cleared by COLUMN-ORDER done_verified -> awaits own qa/deploy.",
    updated_at: $now,
    updated_by: "router",
    note: "06:37Z dev-team tick closed: FIX-BCTC-BANK-BS-COLUMN-ORDER done_verified (qa PASS, commit 66dfe89a5, RAW-verified). DEPLOY-GATED: post-deploy finalize_bctc_refine on live CTG report 96e36139 still required to unfreeze total_assets (NOT run). SF-1 held; router continuing tick to drain+triage 3 NEW signals via po."
  }
