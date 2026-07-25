# scripts/dev-fix-predclaim-creationprice-ungate-zod-contract-to-review.jq
#
# FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT — in_progress[] -> review[]
# after implementation + tests GREEN + commit. Flipped to REVIEW (not
# DONE_VERIFIED — developer never self-flips per DJ-GATE-1 / task
# instructions); next_agent=qa to independently re-verify.
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-predclaim-creationprice-ungate-zod-contract-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.in_progress | map(select(.id == "FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    next_agent: "qa",
    reviewed_at: $now,
    reviewed_by: "dev-mcp-server",
    review_note: "Ungated creation_price capture in evidenceTools.ts create_prediction_claim (was conditional on optional direction+expected_move_pct -> now unconditional; ticker with no daily_ohlcv data is REJECTED outright, target_price stays the only thing those two optional params gate). Added .strict() Zod write-door to predictionClaimStore.ts::insertPredictionClaim (creation_price + stock/agent_id/claim_text/direction/resolution_date/confidence required) throwing a blueprint-§2-aligned descriptive rejection (docs/architecture-briefs/2026-07-25-input-validation-coverage-blueprint.md) + fire-and-forget sendTelegramBug fail-loud alert (not awaited -- ~30 sync call sites incl. tests; sendTelegramBug already never-throws by its own contract). Fixed the dormant sibling defect intelligenceCycleJob.ts chain-synthesizer hardcoded creation_price:null. Deliverable (c) update-path: NOT a second Zod layer -- resolveClaim/excludeClaim UPDATE statements structurally never touch the required fields, so the acceptance criterion holds by construction. Deliverable (e) grandfather: verified -- gate lives only on the write path, read path (mapRow/getAllClaimsForTracker/serve handler) untouched, existing NULL rows still read correctly (tests updated to seed legacy rows via raw SQL, the only way to simulate them post-gate). Deliverable (g) docs synced: docs/agents/tools/list/create_prediction_claim.md + docs/agents/digest-predict/flow/daily-predict.md:110 (both L1/L2 of the board root_cause 4-layer chain). Deliverable (h) false comments corrected in predictionClaimsHandler.ts (stale 2026-06-11 9-claim/hitRate-0.50 worked example + false legacy-claims framing, replaced with the board-cited live 2026-07-25T07:11:04Z 17-claim/hitRate-0.6667 probe). NOT done by design: backfilling the 11 existing NULL rows -- separate BACKLOG row FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE (owner dev-mcp-server, depends on this row) already exists and is TIME-CRITICAL (5 pending claims ids 13-17 auto-convert to permanently-excluded starting the 2026-07-28T16:35Z resolution tick -- 3 days out -- flagging for prompt pickup, not silently done here per this row own BACKFILL SCOPE note). Evidence: bun tsc --noEmit clean. Targeted suite (every file touching insertPredictionClaim/create_prediction_claim, 8 files incl. new FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT.test.ts): 114/114 pass, 356 expect() calls, re-confirmed clean after the telegram-alert addition. Full bun test run twice (pre-deliverable-gap-fixes): 14822 pass/40 skip/55 fail/2 errors/47023 expect (509.37s) and 14827 pass/40 skip/50 fail/47029 expect (464.99s) -- zero (fail) lines matching predict/evidence/creation in either full log; visible failures are the same pre-existing documented 5000ms-timeout/network flaky class (SLA-monitor, OHLCV-aggregator-seed, _deprecated/1302-technical-indicators, insider-transactions, foreign-holding-ratio). Board own regression floor (>= 9408 pass / <= 348 fail) cleared with large margin both runs. gen-project-stats.ts --dry-run: toolCount 184/cronJobCount 88 unaffected. PENDING-REBUILD: live gateway acceptance (board AC-1, re-read through the LIVE served endpoint) NOT claimed -- running container predates this commit; rebuild is USER-GATED, not authorized this session. Decision journal: docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md STEP dev-mcp-server-S9."
  })
)
| .task_board.in_progress |= map(select(.id != "FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT"))
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-mcp-server (FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT -> REVIEW)"
| .head = {
    status: "review",
    active_task_id: "FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT",
    next_agent: "qa",
    next_action: "FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT at REVIEW -- qa: verify the store-boundary Zod gate + producer ungate + doc sync (114/114 targeted pass, 2 full-suite runs clean of predict-related failures). PENDING-REBUILD for live gateway acceptance -- flag REBUILD_REQUIRED to PO/ops. ALSO: separate BACKLOG row FIX-PREDCLAIM-BACKFILL-NULL-CREATIONPRICE is TIME-CRITICAL (2026-07-28T16:35Z deadline) -- surface for prompt dispatch, independent of this row's QA cycle.",
    updated_at: $now,
    updated_by: "dev-mcp-server"
  }
