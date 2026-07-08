# Board reconcile: FACTORY-TECHANALYSIS-reconcile-ta-contract
# QA Step 5 RAW-verify PASS (docs/protocols/docker-deployment-runbook.md §
# Microservice Code-Change Close Gate). HOLD at REVIEW (not done_verified) —
# Step 6 (mark DONE) belongs to po per the runbook delegation rule, not qa.
# .head.next_agent -> "po", status stays "review".
#
# GUARD: refuse unless FACTORY-TECHANALYSIS-reconcile-ta-contract is in
# review[] with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note <path-to-append-text> \
#   -f scripts/qa-factory-technalysis-reconcile-ta-contract-hold-review.jq \
#   docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-TECHANALYSIS-reconcile-ta-contract")][0]) as $t
| if $t == null then error("FACTORY-TECHANALYSIS-reconcile-ta-contract not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-TECHANALYSIS-reconcile-ta-contract status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-TECHANALYSIS-reconcile-ta-contract") then
    error("head.active_task_id drifted away from FACTORY-TECHANALYSIS-reconcile-ta-contract (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| .task_board.review = [$rv[] | if (type=="object" and .id=="FACTORY-TECHANALYSIS-reconcile-ta-contract") then
    (. + {
      next_agent: "po",
      review_note: (.review_note + $note),
      moved_to_review_at: .moved_to_review_at,
      updated_at: $now,
      updated_by: "qa",
      status_note: "qa Step 5 RAW-verify PASS — live /ta/indicators response matches api/openapi.yaml exactly (field names/types/omitempty), no trend field anywhere; po Step 6 (mark DONE) next per runbook delegation rule"
    })
  else . end]
| .head.next_agent = "po"
| .head.next_action = "FACTORY-TECHANALYSIS-reconcile-ta-contract: qa Step 5 RAW-verify PASS (live POST /ta/indicators x4 probes + GET /health match api/openapi.yaml exactly, zero trend-field leakage, dtos.go/router.go diff re-confirmed comment/whitespace-only) — po Step 6: mark DONE per docker-deployment-runbook.md Microservice Code-Change Close Gate."
| .head.updated_at = $now
| .head.updated_by = "qa"
