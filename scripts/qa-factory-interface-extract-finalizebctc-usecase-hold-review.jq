# Board reconcile: FACTORY-INTERFACE-extract-finalizeBctc-usecase
# QA Step 5 RAW-verify PASS (docs/protocols/docker-deployment-runbook.md §
# Microservice Code-Change Close Gate). HOLD at REVIEW (not done_verified) —
# Step 6 (mark DONE) belongs to po per the runbook delegation rule, not qa.
# ops moved this row task_board.review[] -> task_board.qa[] when handing off
# Steps 1-4 (commit db2eddb75); qa now moves it back task_board.qa[] ->
# task_board.review[] when handing off Step 5 to po (symmetric reverse move).
#
# GUARD: refuse unless FACTORY-INTERFACE-extract-finalizeBctc-usecase is in
# qa[] with status QA, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note <path-to-append-text> \
#   -f scripts/qa-factory-interface-extract-finalizebctc-usecase-hold-review.jq \
#   docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.qa // []) as $qa
| ([$qa[] | select(type=="object" and .id=="FACTORY-INTERFACE-extract-finalizeBctc-usecase")][0]) as $t
| if $t == null then error("FACTORY-INTERFACE-extract-finalizeBctc-usecase not in qa[] — refuse")
  elif ($t.status != "QA") then error("FACTORY-INTERFACE-extract-finalizeBctc-usecase status != QA (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-INTERFACE-extract-finalizeBctc-usecase") then
    error("head.active_task_id drifted away from FACTORY-INTERFACE-extract-finalizeBctc-usecase (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "REVIEW",
    next_agent: "po",
    review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa",
    status_note: "qa Step 5 RAW-verify PASS — byte-identical deployed source (all 8 touched files) confirmed via docker cp diff; independently re-ran 293/293 targeted tests + clean tsc; live invocation against real report_id FPT 2025-Q4 completed end-to-end with no crash; rigorous isolated git-worktree A/B test (OLD pre-extraction code vs NEW code, identical DB snapshot) shows byte-for-byte identical bctc_table_rows/financial_reports/bctc_eval_results output — pure-relocation claim holds, zero regression attributable to this task; po Step 6 (mark DONE) next per runbook delegation rule"
  }) as $moved
| .task_board.qa = [$qa[] | select(type!="object" or .id!="FACTORY-INTERFACE-extract-finalizeBctc-usecase")]
| .task_board.review = ((.task_board.review // []) + [$moved])
| .head.status = "review"
| .head.next_agent = "po"
| .head.next_action = "FACTORY-INTERFACE-extract-finalizeBctc-usecase: qa Step 5 RAW-verify PASS (health/toolCount=183 match baseline; all 8 deployed usecase+interface files byte-identical to host HEAD via docker cp diff; own re-run of 22-file/293-test targeted suite + tsc --noEmit both clean; live finalize_bctc_refine invocation against real report_id e71f845d-ffa5-48f9-8f09-30ac2cd09c65 completed with no crash; isolated git-worktree A/B test at pre-extraction commit 56ee74725^ vs current HEAD against an identical DB snapshot shows byte-for-byte identical bctc_table_rows/financial_reports/bctc_eval_results output — pure relocation confirmed, 127->128 row delta and 0.8125->1.0 confidence bump both reproduced identically by OLD and NEW code, root-caused to unrelated pre-existing parser/BLOCK-5 conditions outside this task's 8-file scope) — po Step 6: mark DONE per docker-deployment-runbook.md Microservice Code-Change Close Gate."
| .head.updated_at = $now
| .head.updated_by = "qa"
