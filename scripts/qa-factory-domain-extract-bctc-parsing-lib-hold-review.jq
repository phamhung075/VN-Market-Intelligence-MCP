# Board reconcile: FACTORY-DOMAIN-extract-bctc-parsing-lib
# QA Step 5 RAW-verify PASS (docs/protocols/docker-deployment-runbook.md §
# Microservice Code-Change Close Gate). HOLD at REVIEW (not done_verified) —
# Step 6 (mark DONE) belongs to po per the runbook delegation rule, not qa.
# Row was already in task_board.review[] (ops moved it there after Steps 1-4,
# next_agent=qa) — no cross-section move needed here, just next_agent flip.
#
# GUARD: refuse unless FACTORY-DOMAIN-extract-bctc-parsing-lib is in review[]
# with status REVIEW and next_agent qa, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note <path-to-append-text> \
#   -f scripts/qa-factory-domain-extract-bctc-parsing-lib-hold-review.jq \
#   docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $review
| ([$review[] | select(type=="object" and .id=="FACTORY-DOMAIN-extract-bctc-parsing-lib")][0]) as $t
| if $t == null then error("FACTORY-DOMAIN-extract-bctc-parsing-lib not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-DOMAIN-extract-bctc-parsing-lib status != REVIEW (got \($t.status)) — refuse")
  elif ($t.next_agent != "qa") then error("FACTORY-DOMAIN-extract-bctc-parsing-lib next_agent != qa (got \($t.next_agent)) — refuse, already handed off")
  else . end
| if (.head.active_task_id != "FACTORY-DOMAIN-extract-bctc-parsing-lib") then
    error("head.active_task_id drifted away from FACTORY-DOMAIN-extract-bctc-parsing-lib (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    next_agent: "po",
    review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa"
  }) as $updated
| .task_board.review = [$review[] | if (type=="object" and .id=="FACTORY-DOMAIN-extract-bctc-parsing-lib") then $updated else . end]
| .head.status = "review"
| .head.next_agent = "po"
| .head.next_action = "FACTORY-DOMAIN-extract-bctc-parsing-lib: qa Step 5 RAW-verify PASS — SHA-gate drift confirmed benign (deployed dd37ec6c3 is dev-mcp-server's own docs commit, HEAD's 2 extra commits are ops's own docs-only close-gate journal, 4f15363da last-code-commit is ancestor of deployed); all 7 touched/created files byte-identical live-container-vs-host-HEAD via docker cp diff; health toolCount=183 unchanged; independently re-ran 40-file/414-test BCTC-domain suite (0 fail) + tsc --noEmit clean; RAW A/B (git worktree at pre-migration commit cb3c1ebe0 vs current HEAD) against REAL live-DB source text/rows for FPT (non-bank) + VCB/CTG (bank) confirms byte-identical extractBalanceSheet/extractIncomeStatement/extractCashFlow output AND byte-identical aggregateScalars output — findValue 2-arg/4-arg reconciliation and detectDivisor relocation both verified behaviorally exact on real data, not just unit tests. bctcMagnitudeValidator diff confirmed comment-only (zero logic/import change) — no fraud-detection regression possible. po Step 6: mark DONE_VERIFIED per docker-deployment-runbook.md Microservice Code-Change Close Gate."
| .head.updated_at = $now
| .head.updated_by = "qa"
