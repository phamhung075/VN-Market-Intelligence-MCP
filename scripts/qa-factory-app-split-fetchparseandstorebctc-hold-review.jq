# Board reconcile: FACTORY-APP-split-fetchParseAndStoreBctc
# QA Step 5 RAW-verify PASS (docs/protocols/docker-deployment-runbook.md §
# Microservice Code-Change Close Gate). HOLD at REVIEW (not done_verified) —
# Step 6 (mark DONE) belongs to po per the runbook delegation rule, not qa.
# Standing local precedent: qa-S18/S19/S20/S21 in
# sprint-SYSTEMIC-REMAKE-P1-qa.md all held REVIEW + routed po rather than
# repeat the FACTORY-SCHEDULER-alert-confidence-literals qa self-close
# deviation (a 2nd occurrence = recurring bug per po's own escalation trigger).
# .head.next_agent -> "po", status stays "review".
#
# GUARD: refuse unless FACTORY-APP-split-fetchParseAndStoreBctc is in
# review[] with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note <path-to-append-text> \
#   -f scripts/qa-factory-app-split-fetchparseandstorebctc-hold-review.jq \
#   docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-APP-split-fetchParseAndStoreBctc")][0]) as $t
| if $t == null then error("FACTORY-APP-split-fetchParseAndStoreBctc not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-APP-split-fetchParseAndStoreBctc status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-APP-split-fetchParseAndStoreBctc") then
    error("head.active_task_id drifted away from FACTORY-APP-split-fetchParseAndStoreBctc (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| .task_board.review = [$rv[] | if (type=="object" and .id=="FACTORY-APP-split-fetchParseAndStoreBctc") then
    (. + {
      next_agent: "po",
      review_note: (.review_note + $note),
      reviewed_at: $now,
      reviewed_by: "qa",
      updated_at: $now,
      updated_by: "qa",
      status_note: "qa Step 5 RAW-verify PASS — news-fallback confidence formula + OCR-cache confidence ladder confirmed numerically unchanged (source diff + live docker-cp byte-diff of deployed newsChainFallback.ts/resolvePdfText.ts), container independently confirmed running the new split (4 files present, orchestrator 117L, SHA-gate benign-drift re-derived myself), /health toolCount=183 matches baseline, financial_reports=80 confirmed live; po Step 6 (mark DONE) next per runbook delegation rule"
    })
  else . end]
| .head.next_agent = "po"
| .head.next_action = "FACTORY-APP-split-fetchParseAndStoreBctc: qa Step 5 RAW-verify PASS (confidence-value drift check: news-fallback formula + OCR-cache ladder numerically unchanged, confirmed via source diff + live docker-cp byte-diff of deployed bctc/newsChainFallback.ts + bctc/resolvePdfText.ts; container independently confirmed running new code — 4 split files present in live container, orchestrator=117L, SHA-gate benign-drift re-derived (deployed SHA c1d6c2c7f == the commit containing this task's code, zero apps/mcp-server/ changes since); /health toolCount=183 matches baseline; financial_reports=80 confirmed live) — po Step 6: mark DONE per docker-deployment-runbook.md Microservice Code-Change Close Gate."
| .head.updated_at = $now
| .head.updated_by = "qa"
