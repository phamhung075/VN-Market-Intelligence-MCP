# Board reconcile: FACTORY-DOMAIN-relocate-stock-catalog
# QA Step 5 RAW-verify PASS (docs/protocols/docker-deployment-runbook.md §
# Microservice Code-Change Close Gate). HOLD at REVIEW (not done_verified) —
# Step 6 (mark DONE) belongs to po per the runbook delegation rule, not qa.
# Row was already in task_board.review[] (ops moved it there after Steps 1-4,
# next_agent=qa) — no cross-section move needed here, just next_agent flip.
#
# GUARD: refuse unless FACTORY-DOMAIN-relocate-stock-catalog is in review[]
# with status REVIEW, and .head (authoritative per feedback_orchstate_dual_head_keys_
# toplevel_authoritative) confirms active_task_id + next_agent=qa + status=review.
# NOTE: the board-row's own next_agent field lagged at "ops" (set by dev-mcp-server
# when handing to ops for Steps 1-4; ops advanced .head.next_agent to qa but did not
# sync this copy) — gate on .head, not the stale row copy, per that memory lesson.
# Usage: jq --arg now "$NOW" --rawfile note <path-to-append-text> \
#   -f scripts/qa-factory-domain-relocate-stock-catalog-hold-review.jq \
#   docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $review
| ([$review[] | select(type=="object" and .id=="FACTORY-DOMAIN-relocate-stock-catalog")][0]) as $t
| if $t == null then error("FACTORY-DOMAIN-relocate-stock-catalog not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-DOMAIN-relocate-stock-catalog status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-DOMAIN-relocate-stock-catalog") then
    error("head.active_task_id drifted away from FACTORY-DOMAIN-relocate-stock-catalog (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  elif (.head.status != "review") then
    error("head.status != review (got \(.head.status)) — refuse")
  elif (.head.next_agent != "qa") then
    error("head.next_agent != qa (got \(.head.next_agent)) — refuse, already handed off")
  else . end
| ($t + {
    next_agent: "po",
    review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa"
  }) as $updated
| .task_board.review = [$review[] | if (type=="object" and .id=="FACTORY-DOMAIN-relocate-stock-catalog") then $updated else . end]
| .head.status = "review"
| .head.next_agent = "po"
| .head.next_action = "FACTORY-DOMAIN-relocate-stock-catalog: qa Step 5 RAW-verify PASS — SHA-gate drift confirmed benign (deployed 64a1a135b is the board-flip commit itself, HEAD's 1 extra commit is ops's own docs-only close-gate journal, zero apps/mcp-server changes since); both touched files byte-identical live-container-vs-host-HEAD via docker cp diff; independent A/B harness (git worktree at pre-move commit cec87c726^) confirms 0 mismatches across full 66-ticker STOCK_CATALOG + all 5 exported detection fns; independently re-ran targeted 211/211 + broader 51-file consumer suite 748/0 pass; tsc+eslint clean; live in-container script execution + live raw MCP tools/call (get_watchlist) both confirm the deployed code path executes correctly end-to-end. po Step 6: mark DONE_VERIFIED per docker-deployment-runbook.md Microservice Code-Change Close Gate."
| .head.updated_at = $now
| .head.updated_by = "qa"
