# po Step 6 close — FACTORY-APP-split-fetchParseAndStoreBctc REVIEW -> DONE_VERIFIED
# Docker Microservice Code-Change Close Gate (docs/protocols/docker-deployment-runbook.md).
# Moves the row review[]->done_verified[], stamps po_closeout, and syncs top-level .head
# to the idle-handback shape in the SAME atomic orch-apply.sh write (closes the HEAD-SYNC gap
# that bit the sibling FACTORY-APP-dedup ops write). .task_board.head (deprecated stub) untouched.
# Invoke:
#   jq -f scripts/po-close-factory-app-split-fetchparseandstorebctc.jq --arg now "<ISO8601Z>" \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
"FACTORY-APP-split-fetchParseAndStoreBctc" as $tid
| ((.task_board.review // []) | map(select((.id // .task_id) == $tid)) | .[0]) as $row
| if $row == null then error("row not found in review[]: " + $tid) else . end
| .task_board.review = ((.task_board.review // []) | map(select((.id // .task_id) != $tid)))
| .task_board.done_verified = ((.task_board.done_verified // []) + [
    $row + {
      status: "DONE_VERIFIED",
      next_agent: "router",
      done_at: $now,
      done_by: "po",
      updated_at: $now,
      updated_by: "po",
      po_closeout: {
        by: "po",
        at: $now,
        verdict: "DONE_VERIFIED — po Step 6 close of the Docker Microservice Code-Change Close Gate (docs/protocols/docker-deployment-runbook.md). All 5 upstream steps passed with independent RAW verification at each hop (dev-mcp-server code+tests -> ops Steps 1-4 rebuild+SHA-gate -> qa Step 5 RAW-verify), dev-team-dispatcher-verified at every handoff; po independently spot-re-verified the load-bearing facts on live git+container state before flipping — not blind chain-trust.",
        evidence: "fetchParseAndStoreBctc.ts (895L) split into bctc/{resolvePdfText,newsChainFallback,insertBctcAnalysis,types}.ts + a 117L orchestrator; 4 news-fallback confidence constants (NEWS_FALLBACK_BASELINE=0.55/TEMPORAL_DISCOUNT=0.8/FALLBACK_CONF_MIN=0.45/FALLBACK_CONF_MAX=0.65) hoisted to named exports, resolved values unchanged. dev-mcp-server commits 5027fda09 (code+tests+docs) + acf4381ef (memory). ops Steps 1-4 (commit b549e88d0): rebuilt mcp-server, container healthy, deployed image = c1d6c2c7f (the commit carrying this task code). qa Step 5 RAW-verify PASS (commit e825f2275): confidence-drift check via source diff (git show 5027fda09^) AND live docker-cp byte-diff of the deployed bctc/newsChainFallback.ts + bctc/resolvePdfText.ts — both diff-exit-0, i.e. the exact code that executes on the next real news-inference fallback is proven unchanged; OCR-cache confidence ladder (0.2/0.3/0.5) also byte-identical; container independently confirmed running the new 4-file split (not trusting ops self-report). PO OWN SPOT-CHECK (not trusted from prose): (1) all 5 commits exist with matching subjects. (2) 4 new bctc/ files present at HEAD (resolvePdfText 11025B, newsChainFallback 20673B, insertBctcAnalysis 4765B, types 2349B); orchestrator fetchParseAndStoreBctc.ts=117L on host AND inside the live container. (3) zero app drift since deployed commit: git diff --stat c1d6c2c7f..HEAD -- apps/mcp-server/ is EMPTY (c1d6c2c7f..HEAD = the docs+scripts-only close-gate writes b549e88d0/fb246ae51/e825f2275 + 2 persisted .jq transforms, zero apps/ code). (4) bash scripts/verify-deploy-sha.sh mcp-server c1d6c2c7f45e15ce57ab033e0d5df03415f2c43c exits 0/PASS. (5) live container vn-market-intelligence-mcp-mcp-server-1 Up(healthy), /health toolCount=183 matching docs/data/project-stats.json baseline. VERDICT: pure-relocation split holds on every axis — commits, live files, orchestrator size, no-app-drift, SHA-gate ancestry, container liveness, and byte-identical confidence formula.",
        process_note: "qa CORRECTLY held the row at REVIEW with next_agent=po (commit e825f2275) and did NOT self-close to DONE_VERIFIED — latest in a run of consecutive rebuild_required close-gate tasks this session where qa followed the runbook Step 6 delegation rule; qa-self-close occurrence count stays at 1 (below the recurring-2+ escalation threshold, memory feedback_recurring_bug_escalation) — parked agent-father qa-guardrail-mint stays parked (minting now = intervention-churn, memory project_systemic_review_0704). HEAD-SYNC: this po write updates the done_verified row AND the top-level canonical .head in the SAME scripts/orch-apply.sh write (the exact gap that bit the sibling FACTORY-APP-dedup ops write, which needed a follow-up router head-sync commit). .task_board.head left untouched (deprecated stub; canonical is top-level .head). Idle-handback set to head.status=done / active_task_id=null / next_agent=router, matching the sibling FACTORY closeouts — router picks the next BOUNDED-1 backlog row."
      }
    }
  ])
| .head = {
    status: "done",
    active_task_id: null,
    next_agent: "router",
    next_action: "FACTORY-APP-split-fetchParseAndStoreBctc CLOSED DONE_VERIFIED by po Step 6 (Docker Code-Change Close Gate) — 895L fetchParseAndStoreBctc split into bctc/{resolvePdfText,newsChainFallback,insertBctcAnalysis,types}.ts + 117L orchestrator, news-fallback confidence constants named (resolved values unchanged); shipped & live-verified (deployed c1d6c2c7f, container healthy, toolCount=183, byte-identical confidence formula via docker-cp diff, zero app drift). Idle — router picks next BOUNDED-1 backlog row.",
    updated_at: $now,
    updated_by: "po"
  }
| ._updated_at = $now
| ._updated_by = "po"
